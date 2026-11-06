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

describe("RF-07 cifrar a denúncia no cliente", () => {
  it("o_destinatario_abre_o_envelope", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(text(open(envelope, "redacao", p.redacao))).toBe("Documento fictício de teste.");
  });

  it("o_segundo_destinatario_tambem_abre", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(text(open(envelope, "maria", p.maria))).toBe("Documento fictício de teste.");
  });

  it("outra_chave_nao_abre", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(() => open(envelope, "redacao", p.intruso)).toThrow(CryptoError);
  });

  it("quem_nao_e_destinatario_nao_abre", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    try {
      open(envelope, "joao", p.intruso);
      expect.unreachable();
    } catch (e) {
      expect((e as CryptoError).code).toBe("not_recipient");
    }
  });

  it("o_envelope_declara_o_contexto_e_o_formato", () => {
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

  it("o_ciphertext_e_binario_e_tem_o_tamanho_do_texto_mais_a_etiqueta", () => {
    const { opts } = base();
    const { envelope } = seal(opts);
    expect(envelope.ciphertext).toBeInstanceOf(Uint8Array);
    expect(envelope.ciphertext.length).toBe(opts.plaintext.length + 16);
  });

  it("o_ciphertext_nao_contem_o_texto_original", () => {
    const { opts } = base({ plaintext: utf8("texto-muito-reconhecivel-1234567890") });
    const { envelope } = seal(opts);
    expect(text(envelope.ciphertext)).not.toContain("texto-muito-reconhecivel");
  });

  it("recusa_sem_destinatarios", () => {
    const { opts } = base({ recipients: [] });
    expect(() => seal(opts)).toThrow(CryptoError);
  });

  it("recusa_destinatarios_com_o_mesmo_id", () => {
    const { p, opts } = base();
    expect(() => seal({ ...opts, recipients: [{ id: "x", publicKey: p.redacao.publicKey }, { id: "x", publicKey: p.maria.publicKey }] })).toThrow(CryptoError);
  });

  it("recusa_chave_publica_de_tamanho_errado", () => {
    const { opts } = base({ recipients: [{ id: "x", publicKey: new Uint8Array(10) }] });
    expect(() => seal(opts)).toThrow(CryptoError);
  });

  it("recusa_texto_vazio", () => {
    const { opts } = base({ plaintext: new Uint8Array() });
    expect(() => seal(opts)).toThrow(CryptoError);
  });

  it("recusa_versao_de_chave_invalida", () => {
    for (const v of [0, -1, 1.5]) expect(() => seal(base({ pubkeyVersion: v }).opts)).toThrow(CryptoError);
  });
});

describe("RNF-03 integridade: o contexto fica amarrado ao conteúdo", () => {
  it("alterar_o_ciphertext_falha", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    const ciphertext = new Uint8Array(envelope.ciphertext);
    ciphertext[0] = ciphertext[0]! ^ 0xff;
    expect(() => open({ ...envelope, ciphertext }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("alterar_a_categoria_falha", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(() => open({ ...envelope, category: "outra" }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("alterar_a_redacao_falha", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(() => open({ ...envelope, newsroom: "outro.jornal.eth" }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("alterar_a_versao_da_chave_falha", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    expect(() => open({ ...envelope, pubkeyVersion: 2 }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("alterar_o_nonce_falha", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    const nonce = new Uint8Array(envelope.nonce);
    nonce[0] = nonce[0]! ^ 0x01;
    expect(() => open({ ...envelope, nonce }, "redacao", p.redacao)).toThrow(CryptoError);
  });

  it("alterar_a_chave_embrulhada_falha", () => {
    const { p, opts } = base();
    const { envelope } = seal(opts);
    const wrapped = envelope.wrappedKeys.map((w) => ({ ...w, sealed: new Uint8Array(w.sealed) }));
    wrapped[0]!.sealed[0] = wrapped[0]!.sealed[0]! ^ 0xff;
    expect(() => open({ ...envelope, wrappedKeys: wrapped }, "redacao", p.redacao)).toThrow(CryptoError);
  });
});

describe("propriedades", () => {
  it("abrir_apos_cifrar_devolve_o_original_para_qualquer_bytes", () => {
    const p = people();
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 4096 }), (plaintext) => {
        const { envelope } = seal({ newsroom: NEWSROOM, pubkeyVersion: 1, category: "x", recipients: [{ id: "r", publicKey: p.redacao.publicKey }], plaintext });
        expect(open(envelope, "r", p.redacao)).toEqual(plaintext);
      }),
      { numRuns: 200 },
    );
  });

  it("o_mesmo_texto_gera_envelopes_diferentes_sem_correlacao", () => {
    const { opts } = base();
    const a = seal(opts).envelope;
    const b = seal(opts).envelope;
    expect(a.ciphertext).not.toEqual(b.ciphertext);
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.commitment).not.toBe(b.commitment);
    expect(a.contentHash).not.toBe(b.contentHash);
    expect(a.mailboxPub).not.toEqual(b.mailboxPub);
  });

  it("com_aleatoriedade_injetada_as_partes_controladas_sao_reproduziveis", () => {
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

  it("chaves_diferentes_nunca_abrem_o_envelope_alheio", () => {
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
