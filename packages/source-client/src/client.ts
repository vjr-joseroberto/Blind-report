import { actionFor, decodeReply, encodePayload, fromBase64Url, isNewsroomName, toBase64Url, validateSubmission, type Attachment } from "@safe-whistle/core";
import { decodeEnvelope, encodeEnvelope, mailboxId, openReply, seal, verifyCommitment, verifyContentHash } from "@safe-whistle/crypto";
import { NewsroomNotFoundError, RecordsError, createAuthority, type NewsroomInfo } from "@safe-whistle/ens-client";
import { SourceError, ProofError, type SourceErrorCode } from "./errors.ts";
import type { SourceDeps, SourceReceipt } from "./types.ts";

const MESSAGES: Partial<Record<SourceErrorCode, string>> = {
  limit_reached: "Você já enviou para esta redação neste mês. Tente de novo no próximo mês.",
  epoch_mismatch: "Virou o mês durante o envio. Tente de novo.",
  proof_rejected: "A prova de que você é uma pessoa real não foi aceita. Tente de novo.",
  publish_failed: "Não foi possível enviar agora. Seu texto continua aqui; tente de novo.",
  too_large: "A denúncia é grande demais para esta redação.",
  stale_key_version: "A redação trocou a chave de segurança várias vezes seguidas. Tente de novo.",
  newsroom_not_found: "Redação não encontrada. Confira o nome.",
  category_not_allowed: "Esta redação não aceita essa categoria.",
  attachments_not_allowed: "Esta redação não aceita anexos.",
  invalid_size: "A denúncia está vazia ou com tamanho inválido.",
};
const RELAYER_CODE: Record<string, SourceErrorCode> = {
  limit_reached: "limit_reached", epoch_mismatch: "epoch_mismatch", publish_failed: "publish_failed", body_too_large: "too_large",
  proof_rejected: "proof_rejected", wrong_action: "proof_rejected", wrong_environment: "proof_rejected", nullifier_mismatch: "proof_rejected", invalid_nullifier: "proof_rejected",
  stale_key_version: "stale_key_version", newsroom_not_found: "newsroom_not_found", category_not_allowed: "category_not_allowed",
  too_large: "too_large", attachments_not_allowed: "attachments_not_allowed", invalid_size: "invalid_size",
};
const PROOF_CODE = { denied: "proof_denied", expired: "proof_expired", cancelled: "proof_cancelled" } as const;
const PROOF_TEXT = { denied: "A prova foi negada.", expired: "O pedido de prova expirou. Tente de novo.", cancelled: "Você cancelou a prova." } as const;
const MAX_PAGES = 200;

type SubmitInput = { newsroom: string; category: string; text: string; attachment?: Attachment };
type RelayerFailure = { code: string; message?: string };

export function createSourceClient(deps: SourceDeps) {
  const base = deps.relayerUrl.replace(/\/+$/, "");

  async function lookupNewsroom(name: string): Promise<NewsroomInfo> {
    if (!isNewsroomName(name)) throw new SourceError("invalid_newsroom", "Use o nome da redação no formato nome.eth, em minúsculas.");
    try {
      return await deps.reader.resolveNewsroom(name);
    } catch (e) {
      if (e instanceof NewsroomNotFoundError) throw new SourceError("newsroom_not_found", MESSAGES.newsroom_not_found!);
      if (e instanceof RecordsError) throw new SourceError("newsroom_misconfigured", "A redação publicou uma configuração incorreta no ENS.");
      throw new SourceError("network", "Não foi possível consultar o ENS. Verifique o RPC e a conexão.");
    }
  }

  async function call(path: string, init?: RequestInit): Promise<{ status: number; json: any }> {
    let res: Response;
    try {
      res = await deps.fetch(`${base}${path}`, init);
    } catch {
      throw new SourceError("network", "Sem conexão com o servidor de envio. Seu texto continua aqui; tente de novo.");
    }
    try {
      return { status: res.status, json: await res.json() };
    } catch {
      throw new SourceError("unexpected_response", "O servidor de envio respondeu algo inesperado.");
    }
  }

  const failure = (json: any): RelayerFailure => (typeof json?.error?.code === "string" ? json.error : { code: "unknown" });

  async function submit(input: SubmitInput): Promise<{ receipt: SourceReceipt; parts: number }> {
    const info = await lookupNewsroom(input.newsroom);
    const payload = encodePayload({ text: input.text, attachment: input.attachment });
    const check = validateSubmission(info.policy, {
      category: input.category,
      sizeBytes: input.text === "" && !input.attachment ? 0 : payload.length,
      hasAttachment: input.attachment !== undefined,
    });
    if (!check.ok) throw new SourceError(check.code, check.message);

    const ctx = await call(`/rp-context?newsroom=${encodeURIComponent(input.newsroom)}`);
    if (ctx.status !== 200) throw relayerError(ctx.json);
    const c = ctx.json;
    if (c?.action !== actionFor(input.newsroom, c?.epoch) || typeof c?.app_id !== "string" || typeof c?.epoch !== "number") {
      throw new SourceError("unexpected_response", "O servidor de envio devolveu uma ação de prova inesperada.");
    }

    let proof;
    try {
      proof = await deps.proofProvider({ appId: c.app_id, environment: c.environment, action: c.action, rpContext: c.rp_context });
    } catch (e) {
      if (e instanceof ProofError) throw new SourceError(PROOF_CODE[e.reason], PROOF_TEXT[e.reason]);
      throw new SourceError("proof_denied", PROOF_TEXT.denied);
    }

    let current = info;
    for (let attempt = 0; ; attempt++) {
      const { envelope, receipt } = seal(
        { newsroom: input.newsroom, pubkeyVersion: current.pubkeyVersion, category: input.category, recipients: [{ id: "redacao", publicKey: current.publicKey }], plaintext: payload },
        { now: deps.now },
      );
      const res = await call("/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newsroom: input.newsroom, epoch: c.epoch, category: input.category, hasAttachment: input.attachment !== undefined, proof, envelope: toBase64Url(encodeEnvelope(envelope)) }),
      });
      if (res.status === 201 && typeof res.json?.key === "string") {
        return { receipt: { ...receipt, newsroom: input.newsroom, key: res.json.key }, parts: Number(res.json.parts ?? 1) };
      }
      if (failure(res.json).code === "stale_key_version" && attempt === 0) {
        current = await lookupNewsroom(input.newsroom);
        continue;
      }
      throw relayerError(res.json);
    }
  }

  function relayerError(json: any): SourceError {
    const f = failure(json);
    const code = RELAYER_CODE[f.code];
    if (!code) return new SourceError("relayer_error", f.message ?? "O servidor de envio recusou o pedido.");
    return new SourceError(code, MESSAGES[code] ?? f.message ?? "O servidor de envio recusou o pedido.");
  }

  /** Só vale resposta escrita pelo administrador ou por um jornalista ativo; o resto é ignorado e contado. */
  async function readReplies(receipt: SourceReceipt): Promise<{ replies: { text: string; createdAtBlock: bigint; author: string }[]; ignored: number }> {
    if (!receipt || !(receipt.mailboxPub instanceof Uint8Array) || !(receipt.mailboxPriv instanceof Uint8Array)) {
      throw new SourceError("invalid_receipt", "Abra o recibo para ver as respostas.");
    }
    const authority = createAuthority({ reader: deps.reader, newsroom: receipt.newsroom });
    const rows = await deps.replies.getReplies(mailboxId(receipt.mailboxPub));
    const replies: { text: string; createdAtBlock: bigint; author: string }[] = [];
    let ignored = 0;
    for (const row of rows) {
      let authorized: boolean;
      try {
        authorized = row.newsroom === receipt.newsroom && (await authority.isAuthorized({ creator: row.creator, authorName: row.authorName }));
      } catch {
        throw new SourceError("network", "Não foi possível conferir quem escreveu as respostas (ENS). Tente de novo.");
      }
      if (!authorized) {
        ignored++;
        continue;
      }
      try {
        const payload = decodeReply(openReply(row.sealed, receipt));
        if (payload.newsroom !== receipt.newsroom) throw new Error("outra redação");
        replies.push({ text: payload.text, createdAtBlock: row.createdAtBlock, author: row.authorName ?? receipt.newsroom });
      } catch {
        ignored++; // de outra caixa, adulterada, formato antigo ou de outra redação
      }
    }
    return { replies, ignored };
  }

  async function verifyDocument(a: { newsroom: string; envelope: Uint8Array }) {
    let env;
    try {
      env = decodeEnvelope(a.envelope);
    } catch {
      throw new SourceError("invalid_envelope", "O arquivo não é um envelope do Safe Whistle.");
    }
    const hashMatches = verifyContentHash(env);
    if (!hashMatches) return { hashMatches, found: false, contentHash: env.contentHash };
    for (let page = 0; page < MAX_PAGES; page++) {
      const { items, hasMore } = await deps.submissions.listSubmissions({ newsroom: a.newsroom, limit: 50, offset: page * 50 });
      const hit = items.find((i) => i.contentHash === env.contentHash);
      if (hit) return { hashMatches, found: true, createdAtBlock: hit.createdAtBlock, contentHash: env.contentHash };
      if (!hasMore) break;
    }
    return { hashMatches, found: false, contentHash: env.contentHash };
  }

  function proveAuthorship(a: { envelope: Uint8Array; text: string; attachment?: Attachment; salt: Uint8Array }): boolean {
    let env;
    try {
      env = decodeEnvelope(a.envelope);
    } catch {
      throw new SourceError("invalid_envelope", "O arquivo não é um envelope do Safe Whistle.");
    }
    return verifyCommitment(env, encodePayload({ text: a.text, attachment: a.attachment }), a.salt);
  }

  return { lookupNewsroom, submit, readReplies, verifyDocument, proveAuthorship };
}

void fromBase64Url;
