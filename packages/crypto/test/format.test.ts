import { describe, expect, it } from "vitest";
import { ARKIV_PRACTICAL_ENTITY_BYTES, PART_PAYLOAD_BYTES } from "@safe-whistle/core";
import { CryptoError, decodeEnvelope, encodeEnvelope, newKeypair, open, seal } from "../src/index.ts";
import { NEWSROOM, people, text, utf8 } from "./helpers.ts";

const make = (plaintext = utf8("texto fictício"), recipients = 2) => {
  const p = people();
  const rs = [{ id: "redacao", publicKey: p.redacao.publicKey }, { id: "maria", publicKey: p.maria.publicKey }];
  while (rs.length < recipients) rs.push({ id: `j${rs.length}`, publicKey: newKeypair().publicKey });
  return { p, ...seal({ newsroom: NEWSROOM, pubkeyVersion: 3, category: "saude", recipients: rs.slice(0, recipients), plaintext }) };
};

describe("binary envelope format (no base64 in the ciphertext)", () => {
  it("serializes_and_deserializes_the_envelope_without_loss", () => {
    const { envelope } = make();
    expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope);
  });

  it("the_deserialized_envelope_still_opens", () => {
    const { p, envelope } = make();
    const back = decodeEnvelope(encodeEnvelope(envelope));
    expect(text(open(back, "maria", p.maria))).toBe("texto fictício");
  });

  it("the_ciphertext_goes_raw_at_the_end_of_the_file", () => {
    const { envelope } = make(new Uint8Array(1000).fill(7));
    const bytes = encodeEnvelope(envelope);
    expect(bytes.slice(bytes.length - envelope.ciphertext.length)).toEqual(envelope.ciphertext);
  });

  it("the_format_overhead_is_small_for_100_KiB", () => {
    const { envelope } = make(new Uint8Array(100 * 1024).fill(1));
    const bytes = encodeEnvelope(envelope);
    expect(bytes.length).toBeLessThan(100 * 1024 + 16 + 2048); // base64 would inflate ~33%
  });

  it("a_full_part_with_several_recipients_fits_in_the_arkiv_entity", () => {
    const { envelope } = make(new Uint8Array(PART_PAYLOAD_BYTES).fill(1), 5);
    expect(encodeEnvelope(envelope).length).toBeLessThanOrEqual(ARKIV_PRACTICAL_ENTITY_BYTES);
  });

  it("rejects_data_that_is_not_an_envelope", () => {
    for (const bad of [new Uint8Array(), new Uint8Array([1, 2, 3]), utf8("nao e envelope nenhum, so texto"), new Uint8Array(100).fill(9)]) {
      expect(() => decodeEnvelope(bad)).toThrow(CryptoError);
    }
  });

  it("rejects_truncated_file", () => {
    const bytes = encodeEnvelope(make().envelope);
    expect(() => decodeEnvelope(bytes.slice(0, 20))).toThrow(CryptoError);
  });

  it("rejects_unknown_format_version", () => {
    const bytes = encodeEnvelope(make().envelope);
    const changed = new Uint8Array(bytes);
    changed[2] = 99;
    try {
      decodeEnvelope(changed);
      expect.unreachable();
    } catch (e) {
      expect((e as CryptoError).code).toBe("format");
    }
  });

  it("rejects_header_with_absurd_size", () => {
    const bytes = encodeEnvelope(make().envelope);
    const changed = new Uint8Array(bytes);
    changed.set([0xff, 0xff, 0xff, 0xff], 3);
    expect(() => decodeEnvelope(changed)).toThrow(CryptoError);
  });

  it("rejects_header_with_invalid_fields", () => {
    const { envelope } = make();
    const bytes = encodeEnvelope({ ...envelope, nonce: new Uint8Array(5) });
    expect(() => decodeEnvelope(bytes)).toThrow(CryptoError);
  });
});
