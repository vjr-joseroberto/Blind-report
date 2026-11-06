import { describe, expect, it, vi } from "vitest";
import { createSimulatedVerifier, createWorldVerifier } from "../src/index.ts";
import { defineVerifierContract, payload } from "./verifier-contract.ts";

defineVerifierContract("simulado", () => ({
  verifier: createSimulatedVerifier(),
  good: () => payload("ana", "investiga.eth", 202611),
  bad: () => payload("ana", "investiga.eth", 202611, { valid: false }),
}));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

defineVerifierContract("real (com fetch falso)", () => {
  const fake = (async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { action: string; environment: string; valid?: boolean };
    return body.valid === false
      ? json(400, { code: "all_verifications_failed", detail: "All proof verifications failed." })
      : json(200, { success: true, environment: body.environment, action: body.action });
  }) as unknown as typeof fetch;
  return {
    verifier: createWorldVerifier({ rpId: "rp_test123", fetch: fake }),
    good: () => payload("ana", "investiga.eth", 202611),
    bad: () => payload("ana", "investiga.eth", 202611, { valid: false }),
  };
});

describe("verificador real da API do World", () => {
  it("envia_o_payload_inteiro_para_a_rota_v4_do_rp_id", async () => {
    const f = vi.fn(async () => json(200, { success: true, environment: "staging", action: "x" }));
    const p = payload("ana", "investiga.eth", 202611);
    await createWorldVerifier({ rpId: "rp_test123", fetch: f as unknown as typeof fetch })(p);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://developer.world.org/api/v4/verify/rp_test123");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(p);
  });

  it("aceita_outra_base_e_ignora_a_barra_final", async () => {
    const f = vi.fn(async () => json(200, { success: true }));
    await createWorldVerifier({ rpId: "rp_x1", baseUrl: "https://staging.example.org/", fetch: f as unknown as typeof fetch })(payload("a", "a.eth", 202611));
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://staging.example.org/api/v4/verify/rp_x1");
  });

  it("falha_de_rede_vira_resultado_de_falha_sem_lancar", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await createWorldVerifier({ rpId: "rp_x1", fetch: f })(payload("a", "a.eth", 202611));
    expect(r).toMatchObject({ success: false });
    expect(r.error).toMatch(/rede/i);
  });

  it("resposta_que_nao_e_json_vira_falha", async () => {
    const f = (async () => new Response("<html>erro</html>", { status: 502 })) as unknown as typeof fetch;
    const r = await createWorldVerifier({ rpId: "rp_x1", fetch: f })(payload("a", "a.eth", 202611));
    expect(r.success).toBe(false);
    expect(r.error).toContain("502");
  });

  it("200_com_success_falso_ou_ausente_e_falha", async () => {
    for (const body of [{ success: false }, {}, { success: "true" }]) {
      const f = (async () => json(200, body)) as unknown as typeof fetch;
      expect((await createWorldVerifier({ rpId: "rp_x1", fetch: f })(payload("a", "a.eth", 202611))).success, JSON.stringify(body)).toBe(false);
    }
  });

  it("tempo_esgotado_vira_falha_com_motivo", async () => {
    const f = ((_u: unknown, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "TimeoutError"))))) as unknown as typeof fetch;
    const r = await createWorldVerifier({ rpId: "rp_x1", fetch: f, timeoutMs: 20 })(payload("a", "a.eth", 202611));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/tempo/i);
  });

  it("o_motivo_da_recusa_inclui_o_codigo_da_api", async () => {
    const f = (async () => json(400, { code: "app_not_migrated", detail: "x" })) as unknown as typeof fetch;
    const r = await createWorldVerifier({ rpId: "rp_x1", fetch: f })(payload("a", "a.eth", 202611));
    expect(r.error).toContain("app_not_migrated");
  });
});
