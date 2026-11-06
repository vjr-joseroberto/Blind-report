import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PartsError, joinParts, splitIntoParts } from "../src/index.ts";

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);

describe("RF-19 dividir anexos em partes", () => {
  it("divide_em_partes_no_limite", () => {
    const parts = splitIntoParts(bytes(25), 10);
    expect(parts.map((p) => p.data.length)).toEqual([10, 10, 5]);
    expect(parts.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(parts.every((p) => p.total === 3)).toBe(true);
  });

  it("tamanho_exato_do_limite_gera_uma_parte", () => {
    expect(splitIntoParts(bytes(10), 10)).toHaveLength(1);
  });

  it("entrada_vazia_gera_uma_parte_vazia", () => {
    const parts = splitIntoParts(new Uint8Array(), 10);
    expect(parts).toHaveLength(1);
    expect(joinParts(parts)).toEqual(new Uint8Array());
  });

  it("junta_devolve_o_original", () => {
    const original = bytes(95);
    expect(joinParts(splitIntoParts(original, 10))).toEqual(original);
  });

  it("propriedade_juntar_e_dividir_e_identidade_para_qualquer_bytes_e_tamanho", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 2000 }), fc.integer({ min: 1, max: 300 }), (data, size) => {
        expect(joinParts(splitIntoParts(data, size))).toEqual(data);
      }),
    );
  });

  it("propriedade_ordem_embaralhada_ainda_remonta", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 500 }), fc.integer({ min: 1, max: 50 }), fc.integer(), (data, size, seed) => {
        const parts = splitIntoParts(data, size);
        const shuffled = [...parts].sort((a, b) => ((a.index * 7919 + seed) % 13) - ((b.index * 7919 + seed) % 13));
        expect(joinParts(shuffled)).toEqual(data);
      }),
    );
  });

  it("parte_faltando_gera_erro", () => {
    const parts = splitIntoParts(bytes(30), 10);
    expect(() => joinParts(parts.slice(1))).toThrow(PartsError);
    try {
      joinParts(parts.slice(1));
    } catch (e) {
      expect((e as PartsError).code).toBe("missing");
    }
  });

  it("parte_duplicada_gera_erro", () => {
    const parts = splitIntoParts(bytes(30), 10);
    expect(() => joinParts([parts[0]!, parts[0]!, parts[1]!])).toThrow(PartsError);
  });

  it("totais_inconsistentes_geram_erro", () => {
    const a = splitIntoParts(bytes(30), 10);
    const b = splitIntoParts(bytes(30), 15);
    expect(() => joinParts([a[0]!, b[1]!])).toThrow(PartsError);
  });

  it("lista_vazia_gera_erro", () => {
    expect(() => joinParts([])).toThrow(PartsError);
  });

  it("recusa_tamanho_de_parte_invalido", () => {
    for (const size of [0, -1, 1.5, Number.NaN]) expect(() => splitIntoParts(bytes(5), size)).toThrow(RangeError);
  });

  it("nao_altera_os_dados_de_entrada", () => {
    const original = bytes(20);
    const copy = new Uint8Array(original);
    splitIntoParts(original, 7);
    expect(original).toEqual(copy);
  });
});
