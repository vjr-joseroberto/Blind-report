import { describe, expect, it } from "vitest";
import { commitmentOf, seal, verifyCommitment, verifyContentHash } from "../src/index.ts";
import { NEWSROOM, people, utf8 } from "./helpers.ts";

const make = () => {
  const p = people();
  const plaintext = utf8("texto fictício");
  const out = seal({ newsroom: NEWSROOM, pubkeyVersion: 1, category: "x", recipients: [{ id: "r", publicKey: p.redacao.publicKey }], plaintext });
  return { ...out, plaintext };
};

describe("RF-16 public hash and RF-17 authorship commitment", () => {
  it("the_public_hash_matches", () => {
    expect(verifyContentHash(make().envelope)).toBe(true);
  });

  it("ciphertext_tampering_is_detected_by_the_hash", () => {
    const { envelope } = make();
    const ciphertext = new Uint8Array(envelope.ciphertext);
    ciphertext[3] = ciphertext[3]! ^ 0x01;
    expect(verifyContentHash({ ...envelope, ciphertext })).toBe(false);
  });

  it("the_receipt_repeats_the_envelope_hash", () => {
    const { envelope, receipt } = make();
    expect(receipt.contentHash).toBe(envelope.contentHash);
  });

  it("the_commitment_matches_with_text_and_salt", () => {
    const { envelope, receipt, plaintext } = make();
    expect(verifyCommitment(envelope, plaintext, receipt.salt)).toBe(true);
  });

  it("the_commitment_fails_with_another_text", () => {
    const { envelope, receipt } = make();
    expect(verifyCommitment(envelope, utf8("outro texto"), receipt.salt)).toBe(false);
  });

  it("the_commitment_fails_with_another_salt", () => {
    const { envelope, plaintext } = make();
    expect(verifyCommitment(envelope, plaintext, new Uint8Array(32))).toBe(false);
  });

  it("commitmentOf_is_deterministic_and_salt_sensitive", () => {
    const t = utf8("x");
    const s1 = new Uint8Array(32).fill(1);
    const s2 = new Uint8Array(32).fill(2);
    expect(commitmentOf(t, s1)).toBe(commitmentOf(t, s1));
    expect(commitmentOf(t, s1)).not.toBe(commitmentOf(t, s2));
    expect(commitmentOf(t, s1)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("the_salt_is_32_bytes_and_the_commitment_does_not_reveal_the_text", () => {
    const { receipt, envelope } = make();
    expect(receipt.salt).toHaveLength(32);
    expect(envelope.commitment).not.toContain("74657874"); // "text" in hexadecimal
  });
});
