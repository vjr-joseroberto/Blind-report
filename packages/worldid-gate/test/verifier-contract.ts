// Verifier contract: the double and the real verifier obey the same suite.
import { describe, expect, it } from "vitest";
import type { IdKitPayload, Verifier } from "../src/index.ts";
import { payload } from "./helpers.ts";

export function defineVerifierContract(label: string, make: () => { verifier: Verifier; good: () => IdKitPayload; bad: () => IdKitPayload }): void {
  describe(`verifier contract: ${label}`, () => {
    it("valid_proof_returns_success", async () => {
      const { verifier, good } = make();
      const r = await verifier(good());
      expect(r.success).toBe(true);
    });

    it("invalid_proof_returns_failure_with_reason_and_never_throws", async () => {
      const { verifier, bad } = make();
      const r = await verifier(bad());
      expect(r.success).toBe(false);
      expect(typeof r.error).toBe("string");
      expect(r.error!.length).toBeGreaterThan(0);
    });

    it("returns_environment_and_action_when_accepted", async () => {
      const { verifier, good } = make();
      const p = good();
      const r = await verifier(p);
      expect(r.environment).toBe(p.environment);
      expect(r.action).toBe(p.action);
    });
  });
}
export { payload };
