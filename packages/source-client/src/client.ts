import { actionFor, decodeReply, encodePayload, fromBase64Url, isNewsroomName, toBase64Url, validateSubmission, type Attachment } from "@safe-whistle/core";
import { decodeEnvelope, encodeEnvelope, mailboxId, openReply, seal, verifyCommitment, verifyContentHash } from "@safe-whistle/crypto";
import { NewsroomNotFoundError, RecordsError, createAuthority, type NewsroomInfo } from "@safe-whistle/ens-client";
import { SourceError, ProofError, type SourceErrorCode } from "./errors.ts";
import type { SourceDeps, SourceReceipt } from "./types.ts";

const MESSAGES: Partial<Record<SourceErrorCode, string>> = {
  limit_reached: "You already submitted to this newsroom this month. Try again next month.",
  epoch_mismatch: "The month changed during submission. Try again.",
  proof_rejected: "The proof that you are a real person was not accepted. Try again.",
  publish_failed: "Could not submit now. Your text is still here; try again.",
  too_large: "The tip is too large for this newsroom.",
  stale_key_version: "The newsroom changed its security key several times in a row. Try again.",
  newsroom_not_found: "Newsroom not found. Check the name.",
  category_not_allowed: "This newsroom does not accept this category.",
  attachments_not_allowed: "This newsroom does not accept attachments.",
  invalid_size: "The tip is empty or has an invalid size.",
};
const RELAYER_CODE: Record<string, SourceErrorCode> = {
  limit_reached: "limit_reached", epoch_mismatch: "epoch_mismatch", publish_failed: "publish_failed", body_too_large: "too_large",
  proof_rejected: "proof_rejected", wrong_action: "proof_rejected", wrong_environment: "proof_rejected", nullifier_mismatch: "proof_rejected", invalid_nullifier: "proof_rejected",
  stale_key_version: "stale_key_version", newsroom_not_found: "newsroom_not_found", category_not_allowed: "category_not_allowed",
  too_large: "too_large", attachments_not_allowed: "attachments_not_allowed", invalid_size: "invalid_size",
};
const PROOF_CODE = { denied: "proof_denied", expired: "proof_expired", cancelled: "proof_cancelled" } as const;
const PROOF_TEXT = { denied: "The proof was denied.", expired: "The proof request expired. Try again.", cancelled: "You cancelled the proof." } as const;
const MAX_PAGES = 200;

type SubmitInput = { newsroom: string; category: string; text: string; attachment?: Attachment };
type RelayerFailure = { code: string; message?: string };

export function createSourceClient(deps: SourceDeps) {
  const base = deps.relayerUrl.replace(/\/+$/, "");

  async function lookupNewsroom(name: string): Promise<NewsroomInfo> {
    if (!isNewsroomName(name)) throw new SourceError("invalid_newsroom", "Use the newsroom name in the format name.eth, in lowercase.");
    try {
      return await deps.reader.resolveNewsroom(name);
    } catch (e) {
      if (e instanceof NewsroomNotFoundError) throw new SourceError("newsroom_not_found", MESSAGES.newsroom_not_found!);
      if (e instanceof RecordsError) throw new SourceError("newsroom_misconfigured", "The newsroom published an incorrect configuration in ENS.");
      throw new SourceError("network", "Could not query ENS. Check the RPC and the connection.");
    }
  }

  async function call(path: string, init?: RequestInit): Promise<{ status: number; json: any }> {
    let res: Response;
    try {
      res = await deps.fetch(`${base}${path}`, init);
    } catch {
      throw new SourceError("network", "No connection to the submission server. Your text is still here; try again.");
    }
    try {
      return { status: res.status, json: await res.json() };
    } catch {
      throw new SourceError("unexpected_response", "The submission server returned something unexpected.");
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
      throw new SourceError("unexpected_response", "The submission server returned an unexpected proof action.");
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
    if (!code) return new SourceError("relayer_error", f.message ?? "The submission server refused the request.");
    return new SourceError(code, MESSAGES[code] ?? f.message ?? "The submission server refused the request.");
  }

  /** Only replies written by the administrator or an active journalist count; the rest is ignored and counted. */
  async function readReplies(receipt: SourceReceipt): Promise<{ replies: { text: string; createdAtBlock: bigint; author: string }[]; ignored: number }> {
    if (!receipt || !(receipt.mailboxPub instanceof Uint8Array) || !(receipt.mailboxPriv instanceof Uint8Array)) {
      throw new SourceError("invalid_receipt", "Open the receipt to see the replies.");
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
        throw new SourceError("network", "Could not check who wrote the replies (ENS). Try again.");
      }
      if (!authorized) {
        ignored++;
        continue;
      }
      try {
        const payload = decodeReply(openReply(row.sealed, receipt));
        if (payload.newsroom !== receipt.newsroom) throw new Error("another newsroom");
        replies.push({ text: payload.text, createdAtBlock: row.createdAtBlock, author: row.authorName ?? receipt.newsroom });
      } catch {
        ignored++; // from another mailbox, tampered, old format or from another newsroom
      }
    }
    return { replies, ignored };
  }

  async function verifyDocument(a: { newsroom: string; envelope: Uint8Array }) {
    let env;
    try {
      env = decodeEnvelope(a.envelope);
    } catch {
      throw new SourceError("invalid_envelope", "The file is not a Safe Whistle envelope.");
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
      throw new SourceError("invalid_envelope", "The file is not a Safe Whistle envelope.");
    }
    return verifyCommitment(env, encodePayload({ text: a.text, attachment: a.attachment }), a.salt);
  }

  return { lookupNewsroom, submit, readReplies, verifyDocument, proveAuthorship };
}

void fromBase64Url;
