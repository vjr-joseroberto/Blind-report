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

describe("formato binário do envelope (sem base64 no ciphertext)", () => {
  it("serializa_e_desserializa_o_envelope_sem_perdas", () => {
    const { envelope } = make();
    expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope);
  });

  it("o_envelope_desserializado_ainda_abre", () => {
    const { p, envelope } = make();
    const back = decodeEnvelope(encodeEnvelope(envelope));
    expect(text(open(back, "maria", p.maria))).toBe("texto fictício");
  });

  it("o_ciphertext_vai_cru_no_final_do_arquivo", () => {
    const { envelope } = make(new Uint8Array(1000).fill(7));
    const bytes = encodeEnvelope(envelope);
    expect(bytes.slice(bytes.length - envelope.ciphertext.length)).toEqual(envelope.ciphertext);
  });

  it("o_custo_extra_do_formato_e_pequeno_para_100_KiB", () => {
    const { envelope } = make(new Uint8Array(100 * 1024).fill(1));
    const bytes = encodeEnvelope(envelope);
    expect(bytes.length).toBeLessThan(100 * 1024 + 16 + 2048); // base64 inflaria ~33%
  });

  it("uma_parte_cheia_com_varios_destinatarios_cabe_na_entidade_do_arkiv", () => {
    const { envelope } = make(new Uint8Array(PART_PAYLOAD_BYTES).fill(1), 5);
    expect(encodeEnvelope(envelope).length).toBeLessThanOrEqual(ARKIV_PRACTICAL_ENTITY_BYTES);
  });

  it("recusa_dados_que_nao_sao_um_envelope", () => {
    for (const bad of [new Uint8Array(), new Uint8Array([1, 2, 3]), utf8("nao e envelope nenhum, so texto"), new Uint8Array(100).fill(9)]) {
      expect(() => decodeEnvelope(bad)).toThrow(CryptoError);
    }
  });

  it("recusa_arquivo_truncado", () => {
    const bytes = encodeEnvelope(make().envelope);
    expect(() => decodeEnvelope(bytes.slice(0, 20))).toThrow(CryptoError);
  });

  it("recusa_versao_de_formato_desconhecida", () => {
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

  it("recusa_cabecalho_com_tamanho_absurdo", () => {
    const bytes = encodeEnvelope(make().envelope);
    const changed = new Uint8Array(bytes);
    changed.set([0xff, 0xff, 0xff, 0xff], 3);
    expect(() => decodeEnvelope(changed)).toThrow(CryptoError);
  });

  it("recusa_cabecalho_com_campos_invalidos", () => {
    const { envelope } = make();
    const bytes = encodeEnvelope({ ...envelope, nonce: new Uint8Array(5) });
    expect(() => decodeEnvelope(bytes)).toThrow(CryptoError);
  });
});
