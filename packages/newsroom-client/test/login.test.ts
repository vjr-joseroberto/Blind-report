import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createLogin } from "../src/index.ts";

const NOW = new Date("2026-11-10T12:00:00Z");
const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const base = { domain: "127.0.0.1:5174", address: account.address };

function make(now = NOW, ttl?: number) {
  let t = now;
  const login = createLogin({ now: () => t, ttlSeconds: ttl });
  return { login, advance: (s: number) => (t = new Date(t.getTime() + s * 1000)) };
}

describe("mensagem de entrada (sem gás, sem transação)", () => {
  it("tem_site_endereco_numero_e_validade_sem_depender_da_redacao", () => {
    const c = make().login.challenge(base);
    for (const part of ["127.0.0.1:5174", account.address, c.nonce, "2026-11-10T12:00:00.000Z", "2026-11-10T12:05:00.000Z"]) expect(c.message).toContain(part);
    expect(c.message).toMatch(/não custa gás/i);
  });

  it("cada_pedido_tem_numero_novo", () => {
    const { login } = make();
    expect(login.challenge(base).nonce).not.toBe(login.challenge(base).nonce);
  });
});

describe("verificação da assinatura", () => {
  it("assinatura_valida_confere_o_endereco", async () => {
    const { login } = make();
    const c = login.challenge(base);
    expect(await login.verify(c.nonce, await account.signMessage({ message: c.message }))).toEqual({ ok: true });
  });

  it("assinatura_de_outro_endereco_e_recusada", async () => {
    const { login } = make();
    const c = login.challenge(base);
    expect(await login.verify(c.nonce, await other.signMessage({ message: c.message }))).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("assinatura_de_outra_mensagem_ou_lixo_e_recusada", async () => {
    const { login } = make();
    const c = login.challenge(base);
    expect((await login.verify(c.nonce, await account.signMessage({ message: "outra coisa" }))).ok).toBe(false);
    expect(await login.verify(c.nonce, "0x1234")).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("mensagem_expirada_e_recusada", async () => {
    const { login, advance } = make();
    const c = login.challenge(base);
    const sig = await account.signMessage({ message: c.message });
    advance(301);
    expect(await login.verify(c.nonce, sig)).toEqual({ ok: false, reason: "expired" });
  });

  it("numero_reutilizado_e_recusado_depois_do_primeiro_uso_valido", async () => {
    const { login } = make();
    const c = login.challenge(base);
    const sig = await account.signMessage({ message: c.message });
    expect((await login.verify(c.nonce, sig)).ok).toBe(true);
    expect(await login.verify(c.nonce, sig)).toEqual({ ok: false, reason: "reused" });
  });

  it("numero_desconhecido_e_recusado", async () => {
    expect(await make().login.verify("0xabc", "0x00")).toEqual({ ok: false, reason: "unknown" });
  });

  it("tentativa_com_assinatura_errada_nao_gasta_o_numero", async () => {
    const { login } = make();
    const c = login.challenge(base);
    await login.verify(c.nonce, await other.signMessage({ message: c.message }));
    expect((await login.verify(c.nonce, await account.signMessage({ message: c.message }))).ok).toBe(true);
  });
});
