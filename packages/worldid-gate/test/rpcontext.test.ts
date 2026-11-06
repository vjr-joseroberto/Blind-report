import { actionFor, InvalidNewsroomNameError } from "@safe-whistle/core";
import { computeRpSignatureMessage } from "@worldcoin/idkit-core/signing";
import { hexToBytes, recoverMessageAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GateError, createRpContextSigner } from "../src/index.ts";

const KEY = ("0x" + "1f".repeat(32)) as Hex;
const SIGNING_KEY_HEX = KEY.slice(2);
const RP_ID = "rp_test123";
const signer = () => createRpContextSigner({ signingKeyHex: SIGNING_KEY_HEX, rpId: RP_ID });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("RF-09 contexto RP assinado no servidor", () => {
  it("gera_o_contexto_com_o_rp_id_o_prazo_e_a_assinatura", () => {
    const ctx = signer().rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    expect(ctx.rp_id).toBe(RP_ID);
    expect(ctx.signature).toMatch(/^0x[0-9a-f]+$/i);
    expect(ctx.nonce).toBeTruthy();
    expect(ctx.created_at).toBe(Math.floor(Date.now() / 1000));
  });

  it("expira_no_prazo_definido_com_relogio_controlado", () => {
    const ctx = createRpContextSigner({ signingKeyHex: SIGNING_KEY_HEX, rpId: RP_ID, ttlSeconds: 120 }).rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    expect(ctx.expires_at - ctx.created_at).toBe(120);
  });

  it("o_prazo_padrao_e_de_5_minutos", () => {
    const ctx = signer().rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    expect(ctx.expires_at - ctx.created_at).toBe(300);
  });

  it("acoes_diferentes_geram_assinaturas_diferentes", () => {
    const a = signer().rpContextFor({ newsroom: "a.eth", epoch: 202611 });
    const b = signer().rpContextFor({ newsroom: "b.eth", epoch: 202611 });
    const c = signer().rpContextFor({ newsroom: "a.eth", epoch: 202612 });
    expect(new Set([a.signature, b.signature, c.signature]).size).toBe(3);
  });

  it("cada_chamada_usa_um_nonce_novo", () => {
    const s = signer();
    expect(s.rpContextFor({ newsroom: "a.eth", epoch: 202611 }).nonce).not.toBe(s.rpContextFor({ newsroom: "a.eth", epoch: 202611 }).nonce);
  });

  it("a_assinatura_e_valida_e_recupera_o_endereco_da_chave_de_assinatura", async () => {
    const ctx = signer().rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    const message = computeRpSignatureMessage(hexToBytes(ctx.nonce as Hex), ctx.created_at, ctx.expires_at, actionFor("investiga.eth", 202611));
    const recovered = await recoverMessageAddress({ message: { raw: message }, signature: ctx.signature as Hex });
    expect(recovered).toBe(privateKeyToAccount(KEY).address);
  });

  it("a_assinatura_nao_vale_para_outra_acao", async () => {
    const ctx = signer().rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    const other = computeRpSignatureMessage(hexToBytes(ctx.nonce as Hex), ctx.created_at, ctx.expires_at, actionFor("outra.eth", 202611));
    const recovered = await recoverMessageAddress({ message: { raw: other }, signature: ctx.signature as Hex });
    expect(recovered).not.toBe(privateKeyToAccount(KEY).address);
  });

  it("recusa_chave_de_assinatura_invalida_sem_vazar_o_valor", () => {
    for (const bad of ["", "zz", "ab".repeat(31), "0x" + "ab".repeat(32) + "00"]) {
      try {
        createRpContextSigner({ signingKeyHex: bad, rpId: RP_ID });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(GateError);
        expect((e as GateError).code).toBe("config");
        expect((e as Error).message).not.toContain(bad || "__vazio__");
      }
    }
  });

  it("aceita_a_chave_com_ou_sem_prefixo_0x", () => {
    expect(() => createRpContextSigner({ signingKeyHex: "0x" + SIGNING_KEY_HEX, rpId: RP_ID })).not.toThrow();
  });

  it("recusa_rp_id_fora_do_formato", () => {
    expect(() => createRpContextSigner({ signingKeyHex: SIGNING_KEY_HEX, rpId: "app_123" })).toThrow(GateError);
    expect(() => createRpContextSigner({ signingKeyHex: SIGNING_KEY_HEX, rpId: "" })).toThrow(GateError);
  });

  it("recusa_redacao_ou_epoca_invalida", () => {
    expect(() => signer().rpContextFor({ newsroom: "Invalida", epoch: 202611 })).toThrow(InvalidNewsroomNameError);
    expect(() => signer().rpContextFor({ newsroom: "a.eth", epoch: 202613 })).toThrow(RangeError);
  });
});
