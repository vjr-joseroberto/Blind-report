import { describe, expect, it } from "vitest";
import { CryptoError, mailboxId, newKeypair, openReply, seal, sealReply } from "../src/index.ts";
import { NEWSROOM, people, text, utf8 } from "./helpers.ts";

const make = () => {
  const p = people();
  return seal({ newsroom: NEWSROOM, pubkeyVersion: 1, category: "x", recipients: [{ id: "r", publicKey: p.redacao.publicKey }], plaintext: utf8("t") });
};

describe("RF-15 mailbox e respostas", () => {
  it("o_recibo_guarda_o_par_do_mailbox_e_a_publica_confere_com_o_envelope", () => {
    const { envelope, receipt } = make();
    expect(receipt.mailboxPub).toEqual(envelope.mailboxPub);
    expect(receipt.mailboxPriv).toHaveLength(32);
  });

  it("mailbox_id_e_estavel_e_em_hexadecimal", () => {
    const { envelope } = make();
    expect(mailboxId(envelope.mailboxPub)).toBe(mailboxId(envelope.mailboxPub));
    expect(mailboxId(envelope.mailboxPub)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("mailboxes_diferentes_geram_ids_diferentes", () => {
    expect(mailboxId(make().envelope.mailboxPub)).not.toBe(mailboxId(make().envelope.mailboxPub));
  });

  it("a_redacao_responde_e_a_fonte_abre", () => {
    const { envelope, receipt } = make();
    const sealed = sealReply(envelope.mailboxPub, utf8("Recebemos. Podemos falar por aqui?"));
    expect(text(openReply(sealed, receipt))).toBe("Recebemos. Podemos falar por aqui?");
  });

  it("um_terceiro_nao_abre_a_resposta", () => {
    const { envelope } = make();
    const outro = newKeypair();
    const sealed = sealReply(envelope.mailboxPub, utf8("segredo"));
    expect(() => openReply(sealed, { mailboxPriv: outro.privateKey, mailboxPub: outro.publicKey })).toThrow(CryptoError);
  });

  it("resposta_adulterada_falha", () => {
    const { envelope, receipt } = make();
    const sealed = sealReply(envelope.mailboxPub, utf8("x"));
    sealed[sealed.length - 1] = sealed[sealed.length - 1]! ^ 0x01;
    expect(() => openReply(sealed, receipt)).toThrow(CryptoError);
  });

  it("recusa_resposta_vazia_e_chave_invalida", () => {
    const { envelope } = make();
    expect(() => sealReply(envelope.mailboxPub, new Uint8Array())).toThrow(CryptoError);
    expect(() => sealReply(new Uint8Array(5), utf8("x"))).toThrow(CryptoError);
  });
});
