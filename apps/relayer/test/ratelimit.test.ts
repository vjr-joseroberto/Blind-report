import { describe, expect, it } from "vitest";
import { createRateLimiter, createRelayerApp } from "../src/index.ts";
import { makeDeps, req } from "./helpers.ts";

describe("global request limit (protects the RPC; no IP, no per-person state)", () => {
  it("allows_up_to_the_limit_and_rejects_the_excess", () => {
    let t = 0;
    const l = createRateLimiter({ perMinute: 3, now: () => t });
    expect([l.tryTake(), l.tryTake(), l.tryTake(), l.tryTake()]).toEqual([true, true, true, false]);
  });

  it("refills_over_time", () => {
    let t = 0;
    const l = createRateLimiter({ perMinute: 60, now: () => t });
    for (let i = 0; i < 60; i++) l.tryTake();
    expect(l.tryTake()).toBe(false);
    t += 1000; // 1 token per second
    expect(l.tryTake()).toBe(true);
    expect(l.tryTake()).toBe(false);
    t += 10 * 60_000; // never exceeds capacity
    for (let i = 0; i < 60; i++) expect(l.tryTake()).toBe(true);
    expect(l.tryTake()).toBe(false);
  });

  it("rejects_invalid_configuration", () => {
    expect(() => createRateLimiter({ perMinute: 0, now: () => 0 })).toThrow();
    expect(() => createRateLimiter({ perMinute: 1.5, now: () => 0 })).toThrow();
  });
});

describe("limit applied in the relayer", () => {
  it("responds_429_with_code_and_does_not_query_ens", async () => {
    const f = makeDeps({ limiter: { tryTake: () => false } });
    const r = await createRelayerApp(f.deps).handle(req("GET", "/rp-context?newsroom=investiga.eth"));
    expect(r.status).toBe(429);
    expect(JSON.parse(r.body).error.code).toBe("rate_limited");
    expect(r.headers["retry-after"]).toBeDefined();
    expect(f.resolveNewsroom).not.toHaveBeenCalled();
  });

  it("health_and_preflight_do_not_spend_a_token", async () => {
    let taken = 0;
    const f = makeDeps({ limiter: { tryTake: () => (taken++, false) } });
    const app = createRelayerApp(f.deps);
    expect((await app.handle(req("GET", "/health"))).status).toBe(200);
    expect((await app.handle(req("OPTIONS", "/submissions", { headers: { origin: "https://app.example.org" } }))).status).toBe(204);
    expect(taken).toBe(0);
  });

  it("the_429_log_has_only_route_status_and_code", async () => {
    const f = makeDeps({ limiter: { tryTake: () => false } });
    await createRelayerApp(f.deps).handle(req("POST", "/submissions", { headers: { "x-forwarded-for": "203.0.113.9" } }));
    expect(JSON.stringify(f.logs)).not.toContain("203.0.113.9");
    expect(f.logs.at(-1)).toMatchObject({ status: 429, code: "rate_limited" });
  });
});
