import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_BYTES, PolicyError, parsePolicy } from "../src/index.ts";

const json = (o: unknown) => JSON.stringify(o);

describe("RF-02 política da redação (denuncia.policy)", () => {
  it("aceita_politica_valida", () => {
    const p = parsePolicy(json({ categories: ["corrupcao", "saude"], maxBytes: 100000, attachments: true, epoch: "monthly" }));
    expect(p).toEqual({ categories: ["corrupcao", "saude"], maxBytes: 100000, attachments: true, epoch: "monthly" });
  });

  it("aplica_padroes_quando_campo_ausente", () => {
    const p = parsePolicy(json({ categories: ["a"] }));
    expect(p).toEqual({ categories: ["a"], maxBytes: DEFAULT_MAX_BYTES, attachments: false, epoch: "monthly" });
  });

  it("recusa_json_malformado", () => {
    expect(() => parsePolicy("{nao e json")).toThrow(PolicyError);
    expect(() => parsePolicy("[]")).toThrow(PolicyError);
    expect(() => parsePolicy("null")).toThrow(PolicyError);
  });

  it("recusa_categorias_vazias_ou_ausentes", () => {
    expect(() => parsePolicy(json({}))).toThrow(PolicyError);
    expect(() => parsePolicy(json({ categories: [] }))).toThrow(PolicyError);
  });

  it("recusa_categoria_invalida_ou_repetida", () => {
    for (const bad of [[""], ["A"], ["com espaco"], ["x".repeat(33)], [1], ["a", "a"]]) {
      expect(() => parsePolicy(json({ categories: bad })), JSON.stringify(bad)).toThrow(PolicyError);
    }
  });

  it("recusa_mais_de_32_categorias", () => {
    const many = Array.from({ length: 33 }, (_, i) => `c${i}`);
    expect(() => parsePolicy(json({ categories: many }))).toThrow(PolicyError);
  });

  it("recusa_maxBytes_invalido", () => {
    for (const bad of [0, -1, 1.5, "10", 11 * 1024 * 1024]) {
      expect(() => parsePolicy(json({ categories: ["a"], maxBytes: bad })), String(bad)).toThrow(PolicyError);
    }
  });

  it("recusa_attachments_que_nao_seja_booleano", () => {
    expect(() => parsePolicy(json({ categories: ["a"], attachments: "sim" }))).toThrow(PolicyError);
  });

  it("recusa_epoca_diferente_de_mensal", () => {
    expect(() => parsePolicy(json({ categories: ["a"], epoch: "weekly" }))).toThrow(PolicyError);
  });

  it("o_erro_traz_um_codigo_e_a_causa", () => {
    try {
      parsePolicy(json({ categories: [] }));
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyError);
      expect((e as PolicyError).code).toBe("categories");
      expect((e as PolicyError).message).toMatch(/categoria/i);
    }
  });
});
