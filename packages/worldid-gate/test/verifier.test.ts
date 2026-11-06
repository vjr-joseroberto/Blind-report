import { describe, expect, it, vi } from "vitest";
import { createSimulatedVerifier, createWorldVerifier } from "../src/index.ts";
import { defineVerifierContract, payload } from "./verifier-contract.ts";

defineVerifierContract("simulated", () => ({
  verifier: createSimulatedVerifier(),
  good: () => payload("ana", "investiga.eth", 202611),
  bad: () => payload("ana", "investiga.eth", 202611, { valid: false }),
}));

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

defineVerifierContract("real (with fake fetch)", () => {
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

describe("real verifier of the World API", () => {
  it("sends_the_entire_payload_to_the_rp_id_v4_route", async () => {
    const f = vi.fn(async () => json(200, { success: true, environment: "staging", action: "x" }));
    const p = payload("ana", "investiga.eth", 202611);
    await createWorldVerifier({ rpId: "rp_test123", fetch: f as unknown as typeof fetch })(p);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://developer.world.org/api/v4/verify/rp_test123");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(p);
  });

  it("accepts_another_base_and_ignores_the_trailing_slash", async () => {
    const f = vi.fn(async () => json(200, { success: true }));
    await createWorldVerifier({ rpId: "rp_x1", baseUrl: "https://staging.example.org/", fetch: f as unknown as typeof fetch })(payload("a", "a.eth", 202611));
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://staging.example.org/api/v4/verify/rp_x1");
  });

  it("network_failure_becomes_failure_result_without_throwing", async () => {
    const f = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const r = await createWorldVerifier({ rpId: "rp_x1", fetch: f })(payload("a", "a.eth", 202611));
    expect(r).toMatchObject({ success: false });
    expect(r.error).toMatch(/network/i);
  });

  it("non_json_response_becomes_failure", async () => {
    const f = (async () => new Response("<html>erro</html>", { status: 502 })) as unknown as typeof fetch;
    const r = await createWorldVerifier({ rpId: "rp_x1", fetch: f })(payload("a", "a.eth", 202611));
    expect(r.success).toBe(false);
    expect(r.error).toContain("502");
  });

  it("200_with_success_false_or_missing_is_failure", async () => {
    for (const body of [{ success: false }, {}, { success: "true" }]) {
      const f = (async () => json(200, body)) as unknown as typeof fetch;
      expect((await createWorldVerifier({ rpId: "rp_x1", fetch: f })(payload("a", "a.eth", 202611))).success, JSON.stringify(body)).toBe(false);
    }
  });

  it("timeout_becomes_failure_with_reason", async () => {
    const f = ((_u: unknown, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "TimeoutError"))))) as unknown as typeof fetch;
    const r = await createWorldVerifier({ rpId: "rp_x1", fetch: f, timeoutMs: 20 })(payload("a", "a.eth", 202611));
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/timed out/i);
  });

  it("the_refusal_reason_includes_the_api_code", async () => {
    const f = (async () => json(400, { code: "app_not_migrated", detail: "x" })) as unknown as typeof fetch;
    const r = await createWorldVerifier({ rpId: "rp_x1", fetch: f })(payload("a", "a.eth", 202611));
    expect(r.error).toContain("app_not_migrated");
  });
});
