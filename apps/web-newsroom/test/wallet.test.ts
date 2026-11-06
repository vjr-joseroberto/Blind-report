import { describe, expect, it } from "vitest";
import { SEPOLIA_SPEC, WalletError, chainSpecFromViem, createWallet, pickProvider, withChain } from "../src/wallet.ts";
import { fakeWallet } from "./fake-provider.ts";

const RABDI = { chainId: "0x76edaf" as const, chainName: "Rabdi", nativeCurrency: { name: "Golem", symbol: "tGLM", decimals: 18 }, rpcUrls: ["https://rpc.example.org/x"], blockExplorerUrls: ["https://rabdi.explorer.arkiv.network"] };

describe("conexão da carteira", () => {
  it("conecta_e_le_o_endereco", async () => {
    const w = fakeWallet();
    expect(await createWallet(w.provider).connect()).toBe(w.state.account.address);
  });

  it("recusa_do_usuario_vira_mensagem_clara", async () => {
    const w = fakeWallet({ reject: ["eth_requestAccounts"] });
    await expect(createWallet(w.provider).connect()).rejects.toMatchObject({ code: "user_rejected", message: expect.stringMatching(/recusou/i) });
  });

  it("sem_carteira_instalada_mostra_orientacao", () => {
    expect(() => pickProvider([])).toThrow(WalletError);
    try {
      pickProvider([]);
    } catch (e) {
      expect(e).toMatchObject({ code: "no_wallet", message: expect.stringMatching(/instale|MetaMask/i) });
    }
  });

  it("escolhe_o_primeiro_provedor_descoberto", () => {
    const a = fakeWallet().provider;
    const b = fakeWallet().provider;
    expect(pickProvider([a, b])).toBe(a);
  });
});

describe("troca de rede", () => {
  it("nao_troca_se_ja_esta_na_rede_certa", async () => {
    const w = fakeWallet({ chainId: "0xaa36a7" });
    await createWallet(w.provider).ensureChain(SEPOLIA_SPEC);
    expect(w.calls.map((c) => c.method)).toEqual(["eth_chainId"]);
  });

  it("pede_a_troca_para_sepolia", async () => {
    const w = fakeWallet({ chainId: "0x1" });
    await createWallet(w.provider).ensureChain(SEPOLIA_SPEC);
    expect(w.state.chainId).toBe("0xaa36a7");
  });

  it("adiciona_a_rede_quando_a_carteira_nao_a_conhece_e_depois_troca", async () => {
    const w = fakeWallet({ chainId: "0xaa36a7" });
    await createWallet(w.provider).ensureChain(RABDI);
    expect(w.calls.map((c) => c.method)).toEqual(["eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain"]);
    expect(w.state.chainId).toBe("0x76edaf");
    expect((w.calls[2]!.params as any[])[0]).toMatchObject({ chainId: "0x76edaf", chainName: "Rabdi", nativeCurrency: { symbol: "tGLM" } });
  });

  it("recusa_ao_trocar_de_rede_vira_mensagem_clara", async () => {
    const w = fakeWallet({ reject: ["wallet_switchEthereumChain"] });
    await expect(createWallet(w.provider).ensureChain(SEPOLIA_SPEC)).rejects.toMatchObject({ code: "user_rejected" });
  });

  it("monta_a_especificacao_da_rede_a_partir_de_uma_cadeia_do_viem", () => {
    const spec = chainSpecFromViem({ id: 7794095, name: "Rabdi", nativeCurrency: { name: "Golem", symbol: "tGLM", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.example.org/x"] } }, blockExplorers: { default: { url: "https://rabdi.explorer.arkiv.network" } } });
    expect(spec).toEqual(RABDI);
  });
});

describe("assinatura e eventos", () => {
  it("assina_a_mensagem_e_devolve_uma_assinatura_verificavel", async () => {
    const w = fakeWallet();
    const wallet = createWallet(w.provider);
    const sig = await wallet.signMessage(w.state.account.address, "olá mundo");
    expect(sig).toBe(await w.state.account.signMessage({ message: "olá mundo" }));
  });

  it("recusa_na_assinatura_vira_mensagem_clara", async () => {
    const w = fakeWallet({ reject: ["personal_sign"] });
    await expect(createWallet(w.provider).signMessage(w.state.account.address, "x")).rejects.toMatchObject({ code: "user_rejected" });
  });

  it("avisa_troca_de_conta_e_de_rede_e_para_de_observar", () => {
    const w = fakeWallet();
    const seen: unknown[] = [];
    const stop = createWallet(w.provider).watch({ onAccounts: (a) => seen.push(["a", a]), onChain: (c) => seen.push(["c", c]) });
    w.emit("accountsChanged", ["0xabc"]);
    w.emit("chainChanged", "0x1");
    stop();
    w.emit("accountsChanged", ["0xdef"]);
    expect(seen).toEqual([["a", ["0xabc"]], ["c", "0x1"]]);
    expect(w.listenerCount("accountsChanged")).toBe(0);
  });
});

describe("provedor que garante a rede antes de enviar", () => {
  it("troca_de_rede_ao_perguntar_a_rede_e_ao_enviar_e_informa_a_transacao", async () => {
    const w = fakeWallet({ chainId: "0x1" });
    const txs: unknown[] = [];
    const p = withChain(w.provider, createWallet(w.provider), SEPOLIA_SPEC, (t) => txs.push(t));
    expect(await p.request({ method: "eth_chainId" })).toBe("0xaa36a7");
    const hash = await p.request({ method: "eth_sendTransaction", params: [{ from: "0x1", to: "0x2" }] });
    expect(hash).toMatch(/^0x0+1$/);
    expect(txs).toEqual([{ hash, chainId: "0xaa36a7" }]);
  });

  it("outros_metodos_passam_direto", async () => {
    const w = fakeWallet({ chainId: "0x1" });
    const p = withChain(w.provider, createWallet(w.provider), SEPOLIA_SPEC);
    await p.request({ method: "eth_accounts" });
    expect(w.state.chainId).toBe("0x1");
  });

  it("recusa_do_usuario_no_envio_sobe_como_erro_claro", async () => {
    const w = fakeWallet({ reject: ["eth_sendTransaction"], chainId: "0xaa36a7" });
    const p = withChain(w.provider, createWallet(w.provider), SEPOLIA_SPEC);
    await expect(p.request({ method: "eth_sendTransaction", params: [{}] })).rejects.toMatchObject({ code: "user_rejected" });
  });
});
