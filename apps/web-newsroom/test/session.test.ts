import { createLogin } from "@safe-whistle/newsroom-client";
import { NewsroomNotFoundError } from "@safe-whistle/ens-client";
import { describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSession } from "../src/session.ts";
import { SEPOLIA_SPEC, createWallet } from "../src/wallet.ts";
import { fakeWallet } from "./fake-provider.ts";

const NOW = new Date("2026-11-10T12:00:00Z");
const NR = "investiga.eth";
const admin = privateKeyToAccount(generatePrivateKey());
const maria = privateKeyToAccount(generatePrivateKey());

function make(account = admin, over: { resolve?: () => Promise<unknown>; owners?: Record<string, string | null> } = {}) {
  const w = fakeWallet({ account, chainId: "0x1" });
  const reader = {
    resolveNewsroom: vi.fn(over.resolve ?? (async () => ({ custodian: admin.address }) as never)) as never,
    journalistOwner: vi.fn(async (n: string) => (over.owners ?? { [`maria.${NR}`]: maria.address })[n] ?? null) as never,
  };
  const session = createSession({ wallet: createWallet(w.provider), login: createLogin({ now: () => NOW }), reader, domain: "127.0.0.1:5174", chain: SEPOLIA_SPEC });
  return { w, session, reader };
}

describe("sessão do painel", () => {
  it("administrador_conecta_assina_e_entra_como_admin", async () => {
    const { w, session } = make();
    const states: string[] = [];
    session.subscribe((s) => states.push(s.status));
    await session.connect();
    expect(session.state).toMatchObject({ status: "connected", address: admin.address });
    expect(session.state.access).toBeUndefined();
    await session.choose({ newsroom: NR });
    expect(session.state).toMatchObject({ status: "ready", address: admin.address, access: { role: "admin", newsroom: NR } });
    expect(states).toEqual(["connecting", "signing", "connected", "ready"]);
    expect(w.state.chainId).toBe("0xaa36a7");
  });

  it("jornalista_informa_o_nome_e_entra_como_jornalista", async () => {
    const { session } = make(maria);
    await session.connect();
    await session.choose({ newsroom: NR, journalist: "maria" });
    expect(session.state.access).toEqual({ role: "journalist", newsroom: NR, journalistName: `maria.${NR}` });
  });

  it("terceira_carteira_entra_como_visitante_com_a_causa", async () => {
    const { session } = make(privateKeyToAccount(generatePrivateKey()));
    await session.connect();
    await session.choose({ newsroom: NR });
    expect(session.state.status).toBe("ready");
    expect(session.state.access).toMatchObject({ role: "visitor", reason: "name_required" });
  });

  it("redacao_inexistente_deixa_cadastrar", async () => {
    const { session } = make(admin, { resolve: async () => { throw new NewsroomNotFoundError(NR); } });
    await session.connect();
    await session.choose({ newsroom: NR });
    expect(session.state.access).toMatchObject({ role: "visitor", reason: "newsroom_not_found" });
  });

  it("recusa_na_carteira_vira_erro_claro_e_nao_entra", async () => {
    const w = fakeWallet({ account: admin, reject: ["personal_sign"] });
    const session = createSession({ wallet: createWallet(w.provider), login: createLogin({ now: () => NOW }), reader: { resolveNewsroom: vi.fn(), journalistOwner: vi.fn() } as never, domain: "x", chain: SEPOLIA_SPEC });
    await session.connect();
    expect(session.state).toMatchObject({ status: "error", error: { code: "user_rejected" } });
    expect(session.state.access).toBeUndefined();
  });

  it("falha_de_rede_ao_consultar_o_ens_vira_erro_e_nao_papel", async () => {
    const { session } = make(admin, { resolve: async () => { throw new Error("rpc fora"); } });
    await session.connect();
    await session.choose({ newsroom: NR });
    expect(session.state).toMatchObject({ status: "connected", error: { code: "network" } });
    expect(session.state.access).toBeUndefined();
  });

  it("troca_de_conta_na_carteira_encerra_a_sessao", async () => {
    const { w, session } = make();
    await session.connect();
    await session.choose({ newsroom: NR });
    w.emit("accountsChanged", [maria.address]);
    expect(session.state).toMatchObject({ status: "idle", error: { code: "account_changed" } });
    expect(session.state.access).toBeUndefined();
  });

  it("mesma_conta_no_evento_nao_encerra", async () => {
    const { w, session } = make();
    await session.connect();
    await session.choose({ newsroom: NR });
    w.emit("accountsChanged", [admin.address.toLowerCase()]);
    expect(session.state.status).toBe("ready");
  });

  it("desconectar_limpa_tudo_e_para_de_observar", async () => {
    const { w, session } = make();
    await session.connect();
    await session.choose({ newsroom: NR });
    session.disconnect();
    expect(session.state).toEqual({ status: "idle" });
    expect(w.listenerCount("accountsChanged")).toBe(0);
  });

  it("refresh_reavalia_o_papel_depois_de_cadastrar_a_redacao", async () => {
    let exists = false;
    const { session } = make(admin, { resolve: async () => { if (!exists) throw new NewsroomNotFoundError(NR); return { custodian: admin.address } as never; } });
    await session.connect();
    await session.choose({ newsroom: NR });
    exists = true;
    await session.refresh();
    expect(session.state.access).toEqual({ role: "admin", newsroom: NR });
  });

  it("refresh_sem_sessao_e_ignorado", async () => {
    const { session } = make();
    await session.refresh();
    expect(session.state).toEqual({ status: "idle" });
  });

  it("conectar_nao_exige_redacao_e_da_para_escolher_depois_ou_trocar_sem_assinar_de_novo", async () => {
    const { w, session, reader } = make();
    await session.connect();
    const signs = () => w.calls.filter((c) => c.method === "personal_sign").length;
    expect(signs()).toBe(1);
    await session.choose({ newsroom: "uma.eth" });
    await session.choose({ newsroom: NR });
    expect(session.state.access).toEqual({ role: "admin", newsroom: NR });
    expect(signs()).toBe(1);
    expect(reader.resolveNewsroom).toHaveBeenCalledTimes(2);
  });

  it("sair_da_redacao_volta_a_escolha_mantendo_a_carteira", async () => {
    const { session } = make();
    await session.connect();
    await session.choose({ newsroom: NR });
    session.leaveNewsroom();
    expect(session.state).toEqual({ status: "connected", address: admin.address });
  });

  it("escolher_antes_de_conectar_e_ignorado", async () => {
    const { session, reader } = make();
    await session.choose({ newsroom: NR });
    expect(session.state).toEqual({ status: "idle" });
    expect(reader.resolveNewsroom).not.toHaveBeenCalled();
  });

  it("refresh_com_falha_de_rede_mantem_a_sessao_e_o_papel_e_mostra_o_erro", async () => {
    let fail = false;
    const { session } = make(admin, { resolve: async () => { if (fail) throw new Error("rpc fora"); return { custodian: admin.address } as never; } });
    await session.connect();
    await session.choose({ newsroom: NR });
    fail = true;
    await session.refresh();
    expect(session.state).toMatchObject({ status: "ready", access: { role: "admin", newsroom: NR }, error: { code: "network" } });
  });

  it("refresh_que_funciona_limpa_o_erro_anterior", async () => {
    let fail = true;
    const { session } = make(admin, { resolve: async () => { if (fail) throw new Error("rpc fora"); return { custodian: admin.address } as never; } });
    await session.connect();
    await session.choose({ newsroom: NR }); // falha: continua conectado, sem redação
    fail = false;
    await session.choose({ newsroom: NR });
    expect(session.state.error).toBeUndefined();
    await session.refresh();
    expect(session.state.error).toBeUndefined();
  });
});
