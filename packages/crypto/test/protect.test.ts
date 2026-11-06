import { describe, expect, it } from "vitest";
import { CryptoError, lockWithPassword, newKeypair, openSealed, sealTo, unlockWithPassword } from "../src/index.ts";

const FAST = { iterations: 1000 };
const data = new TextEncoder().encode("chave-privada-de-teste");

describe("proteção por senha", () => {
  it("ida_e_volta_com_a_senha_certa", async () => {
    const blob = await lockWithPassword(data, "correct horse", FAST);
    expect([...(await unlockWithPassword(blob, "correct horse"))]).toEqual([...data]);
  });

  it("senha_errada_falha_com_erro_claro", async () => {
    const blob = await lockWithPassword(data, "correct horse", FAST);
    await expect(unlockWithPassword(blob, "outra senha")).rejects.toMatchObject({ code: "decrypt" });
  });

  it("o_bloco_nao_contem_o_conteudo_nem_a_senha", async () => {
    const blob = await lockWithPassword(data, "senha-secreta-123", FAST);
    expect(blob).not.toContain("chave-privada");
    expect(blob).not.toContain("senha-secreta-123");
    expect(Buffer.from(blob, "base64url").toString("latin1")).not.toContain("chave-privada-de-teste");
  });

  it("dois_blocos_do_mesmo_conteudo_sao_diferentes_sal_e_nonce_novos", async () => {
    expect(await lockWithPassword(data, "x1234567", FAST)).not.toBe(await lockWithPassword(data, "x1234567", FAST));
  });

  it("bloco_adulterado_ou_malformado_e_recusado", async () => {
    const blob = await lockWithPassword(data, "pw-12345", FAST);
    const raw = JSON.parse(Buffer.from(blob, "base64url").toString());
    raw.ct = raw.ct.slice(0, -4) + "AAAA";
    const bad = Buffer.from(JSON.stringify(raw)).toString("base64url");
    await expect(unlockWithPassword(bad, "pw-12345")).rejects.toBeInstanceOf(CryptoError);
    await expect(unlockWithPassword("lixo", "pw-12345")).rejects.toMatchObject({ code: "format" });
    await expect(unlockWithPassword(Buffer.from('{"v":9}').toString("base64url"), "pw-12345")).rejects.toMatchObject({ code: "format" });
  });

  it("recusa_senha_curta_e_iteracoes_baixas_demais_em_producao", async () => {
    await expect(lockWithPassword(data, "curta", FAST)).rejects.toMatchObject({ code: "input" });
    await expect(lockWithPassword(data, "senha-longa-ok")).resolves.toBeTypeOf("string"); // padrão forte (600 mil iterações)
  }, 20_000);

  it("o_numero_de_iteracoes_vai_no_bloco_e_ao_abrir_valores_absurdos_sao_recusados", async () => {
    const blob = await lockWithPassword(data, "pw-12345", FAST);
    const raw = JSON.parse(Buffer.from(blob, "base64url").toString());
    expect(raw.iter).toBe(1000);
    raw.iter = 1e12;
    await expect(unlockWithPassword(Buffer.from(JSON.stringify(raw)).toString("base64url"), "pw-12345")).rejects.toMatchObject({ code: "format" });
  });
});

describe("caixa selada genérica", () => {
  it("so_o_dono_da_chave_privada_abre", () => {
    const a = newKeypair();
    const b = newKeypair();
    const sealed = sealTo(a.publicKey, data);
    expect([...openSealed(sealed, a)]).toEqual([...data]);
    expect(() => openSealed(sealed, b)).toThrow(CryptoError);
  });

  it("recusa_chave_invalida_e_dado_vazio", () => {
    expect(() => sealTo(new Uint8Array(3), data)).toThrow(CryptoError);
    expect(() => sealTo(newKeypair().publicKey, new Uint8Array())).toThrow(CryptoError);
  });
});
