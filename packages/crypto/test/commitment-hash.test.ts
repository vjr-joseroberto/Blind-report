import { describe, expect, it } from "vitest";
import { commitmentOf, seal, verifyCommitment, verifyContentHash } from "../src/index.ts";
import { NEWSROOM, people, utf8 } from "./helpers.ts";

const make = () => {
  const p = people();
  const plaintext = utf8("texto fictício");
  const out = seal({ newsroom: NEWSROOM, pubkeyVersion: 1, category: "x", recipients: [{ id: "r", publicKey: p.redacao.publicKey }], plaintext });
  return { ...out, plaintext };
};

describe("RF-16 hash público e RF-17 compromisso de autoria", () => {
  it("o_hash_publico_confere", () => {
    expect(verifyContentHash(make().envelope)).toBe(true);
  });

  it("a_adulteracao_do_ciphertext_e_detectada_pelo_hash", () => {
    const { envelope } = make();
    const ciphertext = new Uint8Array(envelope.ciphertext);
    ciphertext[3] = ciphertext[3]! ^ 0x01;
    expect(verifyContentHash({ ...envelope, ciphertext })).toBe(false);
  });

  it("o_recibo_repete_o_hash_do_envelope", () => {
    const { envelope, receipt } = make();
    expect(receipt.contentHash).toBe(envelope.contentHash);
  });

  it("o_compromisso_confere_com_texto_e_sal", () => {
    const { envelope, receipt, plaintext } = make();
    expect(verifyCommitment(envelope, plaintext, receipt.salt)).toBe(true);
  });

  it("o_compromisso_falha_com_outro_texto", () => {
    const { envelope, receipt } = make();
    expect(verifyCommitment(envelope, utf8("outro texto"), receipt.salt)).toBe(false);
  });

  it("o_compromisso_falha_com_outro_sal", () => {
    const { envelope, plaintext } = make();
    expect(verifyCommitment(envelope, plaintext, new Uint8Array(32))).toBe(false);
  });

  it("commitmentOf_e_deterministico_e_sensivel_ao_sal", () => {
    const t = utf8("x");
    const s1 = new Uint8Array(32).fill(1);
    const s2 = new Uint8Array(32).fill(2);
    expect(commitmentOf(t, s1)).toBe(commitmentOf(t, s1));
    expect(commitmentOf(t, s1)).not.toBe(commitmentOf(t, s2));
    expect(commitmentOf(t, s1)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("o_sal_tem_32_bytes_e_o_compromisso_nao_revela_o_texto", () => {
    const { receipt, envelope } = make();
    expect(receipt.salt).toHaveLength(32);
    expect(envelope.commitment).not.toContain("74657874"); // "text" em hexadecimal
  });
});
