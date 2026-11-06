import type { IdKitPayload, Verifier, VerifyResult } from "./types.ts";

const DEFAULT_BASE = "https://developer.world.org";

/** Verificador real: POST /api/v4/verify/{rp_id}. Recebe o `fetch` (use `guardedFetch` no relayer). */
export function createWorldVerifier(opts: { rpId: string; fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number }): Verifier {
  const base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, "");
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  return async (payload: IdKitPayload): Promise<VerifyResult> => {
    let res: Response;
    try {
      res = await doFetch(`${base}/api/v4/verify/${opts.rpId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      const name = (e as { name?: string }).name;
      return { success: false, error: name === "TimeoutError" || name === "AbortError" ? "tempo esgotado ao falar com o World" : "falha de rede ao falar com o World" };
    }
    type Body = { success?: unknown; environment?: string; action?: string; code?: string; detail?: string };
    const body = (await res.json().catch(() => undefined)) as Body | undefined;
    if (body === undefined) return { success: false, error: `${res.status} resposta inválida do World` };
    if (res.ok && body.success === true) return { success: true, environment: body.environment, action: body.action };
    return { success: false, error: `${res.status} ${body.code ?? ""} ${body.detail ?? ""}`.replace(/\s+/g, " ").trim() };
  };
}

/** Dublê para testes: aprova qualquer prova, exceto as marcadas com `valid: false`. */
export function createSimulatedVerifier(): Verifier {
  return async (payload) => {
    if ((payload as { valid?: boolean }).valid === false) return { success: false, error: "prova simulada inválida" };
    return { success: true, environment: payload.environment, action: payload.action, nullifier: payload.responses?.[0]?.nullifier };
  };
}
