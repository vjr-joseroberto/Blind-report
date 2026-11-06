import { currentEpoch, fromBase64Url, isEpoch, isNewsroomName, validateSubmission } from "@safe-whistle/core";
import { CryptoError, decodeEnvelope, verifyContentHash } from "@safe-whistle/crypto";
import { NewsroomNotFoundError, RecordsError } from "@safe-whistle/ens-client";
import type { IdKitPayload, RefusalCode } from "@safe-whistle/worldid-gate";
import type { HttpRequest, HttpResponse, RelayerDeps } from "./types.ts";

const GATE_STATUS: Record<RefusalCode, number> = {
  proof_rejected: 403, wrong_action: 403, wrong_environment: 403, nullifier_mismatch: 403,
  invalid_nullifier: 400, invalid_request: 400, limit_reached: 409,
};

class HttpFail extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}
const fail = (status: number, code: string, message: string, extra?: Record<string, unknown>) => new HttpFail(status, code, message, extra);

export function createRelayerApp(deps: RelayerDeps) {
  const respond = (status: number, body: unknown, extra: Record<string, string> = {}): HttpResponse => ({
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra },
    body: status === 204 ? "" : JSON.stringify(body),
  });

  async function resolveNewsroom(name: string) {
    try {
      return await deps.reader.resolveNewsroom(name);
    } catch (e) {
      if (e instanceof NewsroomNotFoundError) throw fail(404, "newsroom_not_found", "Redação não encontrada.");
      if (e instanceof RecordsError) throw fail(422, "newsroom_misconfigured", "A redação publicou registros inválidos no ENS.");
      throw e;
    }
  }

  async function rpContext(req: HttpRequest): Promise<HttpResponse> {
    const newsroom = req.query.get("newsroom") ?? "";
    if (!isNewsroomName(newsroom)) throw fail(400, "invalid_newsroom", "Informe o parâmetro newsroom com um nome .eth em minúsculas.");
    await resolveNewsroom(newsroom);
    const epoch = currentEpoch(deps.now);
    return respond(200, {
      app_id: deps.appId, environment: deps.environment, epoch, action: `submit:${newsroom}:${epoch}`,
      rp_context: deps.signer.rpContextFor({ newsroom, epoch }),
    });
  }

  async function submissions(req: HttpRequest): Promise<HttpResponse> {
    if (req.body.length > deps.maxBodyBytes) throw fail(413, "body_too_large", "O corpo da requisição é grande demais.");
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(req.body));
    } catch {
      throw fail(400, "invalid_json", "O corpo não é um JSON válido.");
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw fail(400, "invalid_json", "O corpo deve ser um objeto JSON.");
    const b = raw as Record<string, unknown>;
    if (typeof b.newsroom !== "string" || !isNewsroomName(b.newsroom)) throw fail(400, "invalid_request", "Campo newsroom ausente ou inválido.");
    if (!isEpoch(b.epoch)) throw fail(400, "invalid_request", "Campo epoch ausente ou inválido.");
    if (typeof b.category !== "string") throw fail(400, "invalid_request", "Campo category ausente.");
    if (typeof b.proof !== "object" || b.proof === null) throw fail(400, "invalid_request", "Campo proof ausente.");
    if (typeof b.envelope !== "string") throw fail(400, "invalid_request", "Campo envelope ausente.");
    const hasAttachment = b.hasAttachment === true;
    const { newsroom, epoch, category } = b as { newsroom: string; epoch: number; category: string };

    let envelopeBytes: Uint8Array;
    try {
      envelopeBytes = fromBase64Url(b.envelope);
    } catch {
      throw fail(400, "invalid_request", "O envelope não é base64url válido.");
    }

    if (epoch !== currentEpoch(deps.now)) throw fail(409, "epoch_mismatch", "A época informada não é a corrente.");

    const info = await resolveNewsroom(newsroom);

    let envelope;
    try {
      envelope = decodeEnvelope(envelopeBytes);
    } catch (e) {
      if (e instanceof CryptoError) throw fail(422, "invalid_envelope", "O envelope é inválido.");
      throw e;
    }
    if (!verifyContentHash(envelope)) throw fail(422, "invalid_envelope", "O hash do conteúdo não confere.");
    if (envelope.newsroom !== newsroom || envelope.category !== category) throw fail(422, "envelope_mismatch", "O envelope não corresponde à redação ou à categoria informadas.");
    if (envelope.pubkeyVersion !== info.pubkeyVersion) {
      throw fail(409, "stale_key_version", "A chave da redação mudou; cifre novamente com a chave atual.", { currentVersion: info.pubkeyVersion });
    }

    const check = validateSubmission(info.policy, { category, sizeBytes: Math.max(1, envelope.ciphertext.length - 16), hasAttachment });
    if (!check.ok) throw fail(422, check.code, check.message);

    const admitted = await deps.gate.admit({ newsroom, epoch, payload: b.proof as IdKitPayload });
    if (!admitted.ok) throw fail(GATE_STATUS[admitted.code] ?? 403, admitted.code, admitted.message);

    try {
      const { key, keys } = await deps.store.publishSubmission({
        newsroom, category, epoch, contentHash: envelope.contentHash, pubkeyVersion: info.pubkeyVersion,
        envelope: envelopeBytes, custodian: info.custodian, retentionSeconds: deps.retentionSeconds,
      });
      return respond(201, { key, parts: keys.length });
    } catch {
      await admitted.release().catch(() => {});
      throw fail(502, "publish_failed", "Não foi possível publicar agora. Tente novamente.");
    }
  }

  const ROUTES: Record<string, Record<string, (r: HttpRequest) => Promise<HttpResponse>>> = {
    "/health": { GET: async () => respond(200, { ok: true }) },
    "/rp-context": { GET: rpContext },
    "/submissions": { POST: submissions },
  };

  function withCors(res: HttpResponse, origin: string | undefined): HttpResponse {
    if (origin === undefined) return res;
    const headers: Record<string, string> = { ...res.headers, vary: "Origin" };
    if (origin !== "*" && deps.allowedOrigins.includes(origin)) headers["access-control-allow-origin"] = origin;
    return { ...res, headers };
  }

  return {
    async handle(req: HttpRequest): Promise<HttpResponse> {
      const origin = req.headers["origin"];
      const known = ROUTES[req.path];
      const route = known ? `${req.method} ${req.path}` : "unknown";
      let res: HttpResponse;
      let code: string | undefined;
      try {
        if (req.method === "OPTIONS") {
          res = respond(204, null, { "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "600" });
        } else if (known && req.path !== "/health" && deps.limiter && !deps.limiter.tryTake()) {
          throw fail(429, "rate_limited", "Muitas requisições. Tente de novo em instantes.");
        } else if (!known) {
          throw fail(404, "not_found", "Rota inexistente.");
        } else if (!known[req.method]) {
          throw fail(405, "method_not_allowed", "Método não permitido.");
        } else {
          res = await known[req.method]!(req);
        }
      } catch (e) {
        if (e instanceof HttpFail) {
          code = e.code;
          res = respond(e.status, { error: { code: e.code, message: e.message, ...e.extra } }, e.status === 429 ? { "retry-after": "10" } : {});
        } else {
          code = "internal";
          res = respond(500, { error: { code: "internal", message: "Erro interno." } });
          deps.logger.error({ route, status: 500, code });
          return withCors(res, origin);
        }
      }
      deps.logger.info(code ? { route, status: res.status, code } : { route, status: res.status });
      return withCors(res, origin);
    },
  };
}
