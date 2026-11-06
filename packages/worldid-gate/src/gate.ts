import { actionFor } from "@safe-whistle/core";
import { usedKey } from "./store.ts";
import type { IdKitPayload, NullifierStore, Verifier } from "./types.ts";

export type RefusalCode = "invalid_request" | "wrong_environment" | "wrong_action" | "invalid_nullifier" | "proof_rejected" | "nullifier_mismatch" | "limit_reached";
export type AdmitResult = { ok: true; release: () => Promise<void> } | { ok: false; code: RefusalCode; message: string };

const no = (code: RefusalCode, message: string): AdmitResult => ({ ok: false, code, message });

/** Portão do relayer: uma denúncia por pessoa, por redação, por época. A prova nunca é guardada (RN-05). */
export function createSubmissionGate(opts: { expectedEnvironment: "production" | "staging"; verifier: Verifier; store: NullifierStore }) {
  const { expectedEnvironment, verifier, store } = opts;
  return {
    async admit(a: { newsroom: string; epoch: number; payload: IdKitPayload }): Promise<AdmitResult> {
      let action: string;
      try {
        action = actionFor(a.newsroom, a.epoch);
      } catch {
        return no("invalid_request", "Redação ou época inválida.");
      }
      const p = a.payload;
      if (typeof p !== "object" || p === null) return no("invalid_request", "Prova ausente ou malformada.");
      if (p.environment !== expectedEnvironment) return no("wrong_environment", "A prova foi gerada para outro ambiente.");
      if (p.action !== action) return no("wrong_action", "A prova foi gerada para outra redação ou época.");

      const nullifier = p.responses?.[0]?.nullifier;
      let key: string;
      try {
        key = usedKey(String(nullifier), action);
      } catch {
        return no("invalid_nullifier", "A prova traz um identificador inválido.");
      }
      if (await store.has(key)) return no("limit_reached", "Já houve um envio desta pessoa para esta redação neste período.");

      const v = await verifier(p);
      if (!v.success) return no("proof_rejected", `A prova foi recusada: ${v.error ?? "motivo desconhecido"}`);
      if (v.environment !== undefined && v.environment !== expectedEnvironment) return no("wrong_environment", "O World respondeu para outro ambiente.");
      if (v.action !== undefined && v.action !== action) return no("wrong_action", "O World respondeu para outra ação.");
      if (v.nullifier !== undefined) {
        let other: string | null = null;
        try {
          other = usedKey(v.nullifier, action);
        } catch {
          /* inválido: tratado como divergente */
        }
        if (other !== key) return no("nullifier_mismatch", "O identificador da prova não confere com a resposta do World.");
      }

      if (!(await store.claim(key))) return no("limit_reached", "Já houve um envio desta pessoa para esta redação neste período.");
      return { ok: true, release: () => store.release(key) };
    },
  };
}
