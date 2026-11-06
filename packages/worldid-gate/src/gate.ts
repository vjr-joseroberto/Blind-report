import { actionFor } from "@safe-whistle/core";
import { usedKey } from "./store.ts";
import type { IdKitPayload, NullifierStore, Verifier } from "./types.ts";

export type RefusalCode = "invalid_request" | "wrong_environment" | "wrong_action" | "invalid_nullifier" | "proof_rejected" | "nullifier_mismatch" | "limit_reached";
export type AdmitResult = { ok: true; release: () => Promise<void> } | { ok: false; code: RefusalCode; message: string };

const no = (code: RefusalCode, message: string): AdmitResult => ({ ok: false, code, message });

/** Relayer gate: one tip per person, per newsroom, per epoch. The proof is never stored (RN-05). */
export function createSubmissionGate(opts: { expectedEnvironment: "production" | "staging"; verifier: Verifier; store: NullifierStore }) {
  const { expectedEnvironment, verifier, store } = opts;
  return {
    async admit(a: { newsroom: string; epoch: number; payload: IdKitPayload }): Promise<AdmitResult> {
      let action: string;
      try {
        action = actionFor(a.newsroom, a.epoch);
      } catch {
        return no("invalid_request", "Invalid newsroom or epoch.");
      }
      const p = a.payload;
      if (typeof p !== "object" || p === null) return no("invalid_request", "Missing or malformed proof.");
      if (p.environment !== expectedEnvironment) return no("wrong_environment", "The proof was generated for another environment.");
      if (p.action !== action) return no("wrong_action", "The proof was generated for another newsroom or epoch.");

      const nullifier = p.responses?.[0]?.nullifier;
      let key: string;
      try {
        key = usedKey(String(nullifier), action);
      } catch {
        return no("invalid_nullifier", "The proof contains an invalid identifier.");
      }
      if (await store.has(key)) return no("limit_reached", "This person has already submitted to this newsroom in this period.");

      const v = await verifier(p);
      if (!v.success) return no("proof_rejected", `The proof was rejected: ${v.error ?? "unknown reason"}`);
      if (v.environment !== undefined && v.environment !== expectedEnvironment) return no("wrong_environment", "World responded for another environment.");
      if (v.action !== undefined && v.action !== action) return no("wrong_action", "World responded for another action.");
      if (v.nullifier !== undefined) {
        let other: string | null = null;
        try {
          other = usedKey(v.nullifier, action);
        } catch {
          /* invalid: treated as mismatched */
        }
        if (other !== key) return no("nullifier_mismatch", "The proof identifier does not match the World response.");
      }

      if (!(await store.claim(key))) return no("limit_reached", "This person has already submitted to this newsroom in this period.");
      return { ok: true, release: () => store.release(key) };
    },
  };
}
