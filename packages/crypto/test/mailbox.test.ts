import { describe, expect, it } from "vitest";
import { CryptoError, mailboxId, newKeypair, openReply, seal, sealReply } from "../src/index.ts";
import { NEWSROOM, people, text, utf8 } from "./helpers.ts";

const make = () => {
  const p = people();
  return seal({ newsroom: NEWSROOM, pubkeyVersion: 1, category: "x", recipients: [{ id: "r", publicKey: p.redacao.publicKey }], plaintext: utf8("t") });
};

describe("RF-15 mailbox and replies", () => {
  it("the_receipt_stores_the_mailbox_keypair_and_the_public_key_matches_the_envelope", () => {
    const { envelope, receipt } = make();
    expect(receipt.mailboxPub).toEqual(envelope.mailboxPub);
    expect(receipt.mailboxPriv).toHaveLength(32);
  });

  it("mailbox_id_is_stable_and_hexadecimal", () => {
    const { envelope } = make();
    expect(mailboxId(envelope.mailboxPub)).toBe(mailboxId(envelope.mailboxPub));
    expect(mailboxId(envelope.mailboxPub)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("different_mailboxes_generate_different_ids", () => {
    expect(mailboxId(make().envelope.mailboxPub)).not.toBe(mailboxId(make().envelope.mailboxPub));
  });

  it("the_newsroom_replies_and_the_source_opens", () => {
    const { envelope, receipt } = make();
    const sealed = sealReply(envelope.mailboxPub, utf8("Recebemos. Podemos falar por aqui?"));
    expect(text(openReply(sealed, receipt))).toBe("Recebemos. Podemos falar por aqui?");
  });

  it("a_third_party_cannot_open_the_reply", () => {
    const { envelope } = make();
    const outro = newKeypair();
    const sealed = sealReply(envelope.mailboxPub, utf8("segredo"));
    expect(() => openReply(sealed, { mailboxPriv: outro.privateKey, mailboxPub: outro.publicKey })).toThrow(CryptoError);
  });

  it("tampered_reply_fails", () => {
    const { envelope, receipt } = make();
    const sealed = sealReply(envelope.mailboxPub, utf8("x"));
    sealed[sealed.length - 1] = sealed[sealed.length - 1]! ^ 0x01;
    expect(() => openReply(sealed, receipt)).toThrow(CryptoError);
  });

  it("rejects_empty_reply_and_invalid_key", () => {
    const { envelope } = make();
    expect(() => sealReply(envelope.mailboxPub, new Uint8Array())).toThrow(CryptoError);
    expect(() => sealReply(new Uint8Array(5), utf8("x"))).toThrow(CryptoError);
  });
});
