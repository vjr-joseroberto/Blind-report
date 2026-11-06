import { describe, expect, it } from "vitest";
import { ARKIV_MAX_BYTES, ARKIV_PRACTICAL_ENTITY_BYTES, DEFAULT_MAX_BYTES, ENS_KEYS, PART_PAYLOAD_BYTES } from "../src/index.ts";

describe("limites e constantes", () => {
  it("limite_de_parte_cabe_com_folga_no_limite_pratico_da_entidade", () => {
    expect(ARKIV_PRACTICAL_ENTITY_BYTES).toBeLessThan(ARKIV_MAX_BYTES);
    expect(ARKIV_PRACTICAL_ENTITY_BYTES - PART_PAYLOAD_BYTES).toBeGreaterThanOrEqual(4096); // cabeçalho do envelope e chaves embrulhadas
  });

  it("o_tamanho_padrao_da_politica_e_razoavel", () => {
    expect(DEFAULT_MAX_BYTES).toBeGreaterThan(0);
    expect(DEFAULT_MAX_BYTES).toBeLessThanOrEqual(10 * 1024 * 1024);
  });

  it("as_chaves_de_texto_do_ens_sao_unicas_e_prefixadas", () => {
    const values = Object.values(ENS_KEYS);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v.startsWith("denuncia.")).toBe(true);
  });
});
