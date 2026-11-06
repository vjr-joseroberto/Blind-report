// Contrato do verificador: o dublê e o verificador real obedecem à mesma suíte.
import { describe, expect, it } from "vitest";
import type { IdKitPayload, Verifier } from "../src/index.ts";
import { payload } from "./helpers.ts";

export function defineVerifierContract(label: string, make: () => { verifier: Verifier; good: () => IdKitPayload; bad: () => IdKitPayload }): void {
  describe(`contrato do verificador: ${label}`, () => {
    it("prova_valida_devolve_sucesso", async () => {
      const { verifier, good } = make();
      const r = await verifier(good());
      expect(r.success).toBe(true);
    });

    it("prova_invalida_devolve_falha_com_motivo_e_nunca_lanca_erro", async () => {
      const { verifier, bad } = make();
      const r = await verifier(bad());
      expect(r.success).toBe(false);
      expect(typeof r.error).toBe("string");
      expect(r.error!.length).toBeGreaterThan(0);
    });

    it("devolve_ambiente_e_acao_quando_aceita", async () => {
      const { verifier, good } = make();
      const p = good();
      const r = await verifier(p);
      expect(r.environment).toBe(p.environment);
      expect(r.action).toBe(p.action);
    });
  });
}
export { payload };
