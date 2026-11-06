import { describe, expect, it } from "vitest";
import { createRateLimiter, createRelayerApp } from "../src/index.ts";
import { makeDeps, req } from "./helpers.ts";

describe("limite global de requisições (protege o RPC; sem IP, sem estado por pessoa)", () => {
  it("permite_ate_o_limite_e_recusa_o_excedente", () => {
    let t = 0;
    const l = createRateLimiter({ perMinute: 3, now: () => t });
    expect([l.tryTake(), l.tryTake(), l.tryTake(), l.tryTake()]).toEqual([true, true, true, false]);
  });

  it("reabastece_com_o_tempo", () => {
    let t = 0;
    const l = createRateLimiter({ perMinute: 60, now: () => t });
    for (let i = 0; i < 60; i++) l.tryTake();
    expect(l.tryTake()).toBe(false);
    t += 1000; // 1 ficha por segundo
    expect(l.tryTake()).toBe(true);
    expect(l.tryTake()).toBe(false);
    t += 10 * 60_000; // nunca passa da capacidade
    for (let i = 0; i < 60; i++) expect(l.tryTake()).toBe(true);
    expect(l.tryTake()).toBe(false);
  });

  it("recusa_configuracao_invalida", () => {
    expect(() => createRateLimiter({ perMinute: 0, now: () => 0 })).toThrow();
    expect(() => createRateLimiter({ perMinute: 1.5, now: () => 0 })).toThrow();
  });
});

describe("limite aplicado no relayer", () => {
  it("responde_429_com_codigo_e_nao_consulta_o_ens", async () => {
    const f = makeDeps({ limiter: { tryTake: () => false } });
    const r = await createRelayerApp(f.deps).handle(req("GET", "/rp-context?newsroom=investiga.eth"));
    expect(r.status).toBe(429);
    expect(JSON.parse(r.body).error.code).toBe("rate_limited");
    expect(r.headers["retry-after"]).toBeDefined();
    expect(f.resolveNewsroom).not.toHaveBeenCalled();
  });

  it("health_e_preflight_nao_gastam_ficha", async () => {
    let taken = 0;
    const f = makeDeps({ limiter: { tryTake: () => (taken++, false) } });
    const app = createRelayerApp(f.deps);
    expect((await app.handle(req("GET", "/health"))).status).toBe(200);
    expect((await app.handle(req("OPTIONS", "/submissions", { headers: { origin: "https://app.example.org" } }))).status).toBe(204);
    expect(taken).toBe(0);
  });

  it("o_log_do_429_tem_so_rota_status_e_codigo", async () => {
    const f = makeDeps({ limiter: { tryTake: () => false } });
    await createRelayerApp(f.deps).handle(req("POST", "/submissions", { headers: { "x-forwarded-for": "203.0.113.9" } }));
    expect(JSON.stringify(f.logs)).not.toContain("203.0.113.9");
    expect(f.logs.at(-1)).toMatchObject({ status: 429, code: "rate_limited" });
  });
});
