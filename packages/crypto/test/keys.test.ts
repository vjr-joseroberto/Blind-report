import { describe, expect, it } from "vitest";
import { newKeypair } from "../src/index.ts";
import { seededRandom } from "./helpers.ts";

describe("newKeypair", () => {
  it("gera_chaves_de_32_bytes", () => {
    const k = newKeypair();
    expect(k.publicKey).toHaveLength(32);
    expect(k.privateKey).toHaveLength(32);
  });

  it("duas_chamadas_geram_chaves_diferentes", () => {
    expect(newKeypair().publicKey).not.toEqual(newKeypair().publicKey);
  });

  it("a_chave_publica_nao_e_igual_a_privada", () => {
    const k = newKeypair();
    expect(k.publicKey).not.toEqual(k.privateKey);
  });

  it("com_aleatoriedade_injetada_o_resultado_e_reproduzivel", () => {
    const a = newKeypair({ random: seededRandom(5) });
    const b = newKeypair({ random: seededRandom(5) });
    expect(a).toEqual(b);
  });
});
