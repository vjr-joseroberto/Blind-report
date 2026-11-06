import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CryptoError, newKeypair, open, seal } from "../src/index.ts";
import { NEWSROOM, people, seededRandom, text, utf8 } from "./helpers.ts";

const base = (over: Partial<Parameters<typeof seal>[0]> = {}) => {
  const p = people();
  return {
    p,
    opts: {
      newsroom: NEWSROOM,
      pubkeyVersion: 1,
      category: "corrupcao",
      recipients: [
        { id: "redacao", publicKey: p.redacao.publicKey },
        { id: "maria", publicKey: p.maria.publicKey },
      ],
      plaintext: utf8("Documento fictício de teste."),
      ...over,
    },
  };
};

describe("RF-07 encrypt the tip on the client", () => {
  it("the_recipient_opens_the_envelope", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(text(open(envelope, "redacao", p.redacao))).toBe("Documento fictício de teste.");
  });

  it("the_second_recipient_also_opens", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(text(open(envelope, "maria", p.maria))).toBe("Documento fictício de teste.");
  });

  it("another_key_does_not_open", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(() => open(envelope, "redacao", p.intruso)).toThrow(CryptoError);
  });

  it("whoever_is_not_a_recipient_does_not_open", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    try {
      open(envelope, "joao", p.intruso);
      expect.unreachable();
    } catch (e) {
      expect((e as CryptoError).code).toBe("not_recipient");
    }
  });

  it("the_envelope_declares_the_context_and_format", () => {
    const { opts } = base();
    const now = new Date("2026-11-01T12:00:00Z");
    const { envelope } = seal(opts, { now: () => now });
    expect(envelope).toMatchObject({ v: 1, newsroom: NEWSROOM, pubkeyVersion: 1, category: "corrupcao", clientTs: Math.floor(now.getTime() / 1000) });
    expect(envelope.nonce).toHaveLength(24);
    expect(envelope.mailboxPub).toHaveLength(32);
    expect(envelope.wrappedKeys.map((w) => w.recipient)).toEqual(["redacao", "maria"]);
    expect(envelope.contentHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(envelope.commitment).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("the_ciphertext_is_binary_and_has_the_text_size_plus_the_tag", () => {
    const { opts } = base();
    const { envelope } = seal(opts);
    expect(envelope.ciphertext).toBeInstanceOf(Uint8Array);
    expect(envelope.ciphertext.length).toBe(opts.plaintext.length + 16);
  });

  it("the_ciphertext_does_not_contain_the_original_text", () => {
    const { opts } = base({ plaintext: utf8("texto-muito-reconhecivel-1234567890") });
    const { envelope } = seal(opts);
    expect(text(envelope.ciphertext)).not.toContain("texto-muito-reconhecivel");
  });

  it("rejects_without_recipients", () => {
    const { opts } = base({ recipients: [] });
    expect(() => seal(opts)).toThrow(CryptoError);
  });

  it("rejects_recipients_with_the_same_id", () => {
    const { p, opts } = base();
    expect(() => seal({ ...opts, recipients: [{ id: "x", publicKey: p.redacao.publicKey }, { id: "x", publicKey: p.maria.publicKey }] })).toThrow(CryptoError);
  });

  it("rejects_public_key_of_wrong_size", () => {
    const { opts } = base({ recipients: [{ id: "x", publicKey: new Uint8Array(10) }] });
    expect(() => seal(opts)).toThrow(CryptoError);
  });

  it("rejects_empty_text", () => {
    const { opts } = base({ plaintext: new Uint8Array() });
    expect(() => seal(opts)).toThrow(CryptoError);
  });

  it("rejects_invalid_key_version", () => {
    for (const v of [0, -1, 1.5]) expect(() => seal(base({ pubkeyVersion: v }).opts)).toThrow(CryptoError);
  });
});

describe("RNF-03 integrity: the context is bound to the content", () => {
  it("changing_the_ciphertext_fails", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    const ciphertext = new Uint8Array(envelope.ciphertext);
    ciphertext[0] = ciphertext[0]! ^ 0xff;
    expect(() => open({ ...envelope, ciphertext }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("changing_the_category_fails", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(() => open({ ...envelope, category: "outra" }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("changing_the_newsroom_fails", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(() => open({ ...envelope, newsroom: "outro.jornal.eth" }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("changing_the_key_version_fails", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(() => open({ ...envelope, pubkeyVersion: 2 }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("changing_the_nonce_fails", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    const nonce = new Uint8Array(envelope.nonce);
    nonce[0] = nonce[0]! ^ 0x01;
    expect(() => open({ ...envelope, nonce }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("changing_the_wrapped_key_fails", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    const wrapped = envelope.wrappedKeys.map((w) => ({ ...w, sealed: new Uint8Array(w.sealed) }));
    wrapped[0]!.sealed[0] = wrapped[0]!.sealed[0]! ^ 0xff;
    expect(() => open({ ...envelope, wrappedKeys: wrapped }, "redacao", p.redacao)).toThrow(CryptoError);
  });
});

describe("properties", () => {
  it("opening_after_encrypting_returns_the_original_for_any_bytes", () => {
    const p = people();
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 4096 }), (plaintext) => {
        const { envelope } = seal({ newsroom: NEWSROOM, pubkeyVersion: 1, category: "x", recipients: [{ id: "r", publicKey: p.redacao.publicKey }], plaintext });
        expect(open(envelope, "r", p.redacao)).toEqual(plaintext);
      }),
      { numRuns: 200 },
    );
  });

  it("the_same_text_generates_different_uncorrelated_envelopes", () => {
    const { opts } = base();
    const a = seal(opts).envelope;
    const b = seal(opts).envelope;
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.commitment).not.toBe(b.commitment);
    expect(a.contentHash).not.toBe(b.contentHash);
    expect(a.mailboxPub).not.toEqual(b.mailboxPub);
  });

  it("with_injected_randomness_the_controlled_parts_are_reproducible", () => {
    const { opts } = base();
    const now = () => new Date("2026-11-01T00:00:00Z");
    const a = seal(opts, { random: seededRandom(9), now });
    const b = seal(opts, { random: seededRandom(9), now });
    expect(a.envelope.ciphertext).toEqual(b.envelope.ciphertext);
    expect(a.envelope.nonce).toEqual(b.envelope.nonce);
    expect(a.envelope.commitment).toBe(b.envelope.commitment);
    expect(a.envelope.mailboxPub).toEqual(b.envelope.mailboxPub);
    expect(a.receipt.salt).toEqual(b.receipt.salt);
  });

  it("different_keys_never_open_someone_elses_envelope", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 256 }), (plaintext) => {
        const dono = newKeypair();
        const outro = newKeypair();
        const { envelope } = seal({ newsroom: NEWSROOM, pubkeyVersion: 1, category: "x", recipients: [{ id: "r", publicKey: dono.publicKey }], plaintext });
        expect(() => open(envelope, "r", outro)).toThrow(CryptoError);
      }),
      { numRuns: 50 },
    );
  });
});
