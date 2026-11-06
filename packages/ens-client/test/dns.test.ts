import { describe, expect, it } from "vitest";
import { InvalidNameError, dnsEncode } from "../src/index.ts";

describe("nome em formato DNS (os setters do ENSv2 não usam namehash)", () => {
  it("codifica_nome_simples", () => {
    expect(dnsEncode("a.eth")).toBe("0x01610365746800");
  });

  it("codifica_subnome_com_prefixo_de_tamanho_por_rotulo", () => {
    // 9 'investiga', 6 'jornal', 3 'eth'
    expect(dnsEncode("investiga.jornal.eth")).toBe("0x09696e76657374696761066a6f726e616c0365746800");
  });

  it("termina_sempre_com_o_byte_zero", () => {
    expect(dnsEncode("x.y.eth").endsWith("00")).toBe(true);
  });

  it("recusa_nome_vazio_ou_rotulo_vazio", () => {
    for (const bad of ["", ".", "a..eth", ".eth", "a.eth."]) expect(() => dnsEncode(bad), bad).toThrow(InvalidNameError);
  });

  it("recusa_rotulo_com_mais_de_63_bytes", () => {
    expect(() => dnsEncode(`${"a".repeat(64)}.eth`)).toThrow(InvalidNameError);
    expect(() => dnsEncode(`${"a".repeat(63)}.eth`)).not.toThrow();
  });

  it("recusa_maiusculas_e_caracteres_fora_do_conjunto_permitido", () => {
    for (const bad of ["A.eth", "a b.eth", "a_b.eth", "ação.eth", "a/b.eth", "-a.eth", "a-.eth"]) expect(() => dnsEncode(bad), bad).toThrow(InvalidNameError);
  });
});
