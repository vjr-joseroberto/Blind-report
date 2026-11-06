import { describe, expect, it } from "vitest";
import { SEPOLIA_SPEC, WalletError, chainSpecFromViem, createWallet, pickProvider, withChain } from "../src/wallet.ts";
import { fakeWallet } from "./fake-provider.ts";

const RABDI = { chainId: "0x76edaf" as const, chainName: "Rabdi", nativeCurrency: { name: "Golem", symbol: "tGLM", decimals: 18 }, rpcUrls: ["https://rpc.example.org/x"], blockExplorerUrls: ["https://rabdi.explorer.arkiv.network"] };

describe("wallet connection", () => {
  it("connects_and_reads_the_address", async () => {
    const w = fakeWallet();
    expect(await createWallet(w.provider).connect()).toBe(w.state.account.address);
  });

  it("user_rejection_becomes_a_clear_message", async () => {
    const w = fakeWallet({ reject: ["eth_requestAccounts"] });
    await expect(createWallet(w.provider).connect()).rejects.toMatchObject({ code: "user_rejected", message: expect.stringMatching(/rejected/i) });
  });

  it("without_a_wallet_installed_shows_guidance", () => {
    expect(() => pickProvider([])).toThrow(WalletError);
    try {
      pickProvider([]);
    } catch (e) {
      expect(e).toMatchObject({ code: "no_wallet", message: expect.stringMatching(/install|MetaMask/i) });
    }
  });

  it("chooses_the_first_discovered_provider", () => {
    const a = fakeWallet().provider;
    const b = fakeWallet().provider;
    expect(pickProvider([a, b])).toBe(a);
  });
});

describe("network switching", () => {
  it("does_not_switch_if_already_on_the_right_network", async () => {
    const w = fakeWallet({ chainId: "0xaa36a7" });
    await createWallet(w.provider).ensureChain(SEPOLIA_SPEC);
    expect(w.calls.map((c) => c.method)).toEqual(["eth_chainId"]);
  });

  it("asks_to_switch_to_sepolia", async () => {
    const w = fakeWallet({ chainId: "0x1" });
    await createWallet(w.provider).ensureChain(SEPOLIA_SPEC);
    expect(w.state.chainId).toBe("0xaa36a7");
  });

  it("adds_the_network_when_the_wallet_does_not_know_it_and_then_switches", async () => {
    const w = fakeWallet({ chainId: "0xaa36a7" });
    await createWallet(w.provider).ensureChain(RABDI);
    expect(w.calls.map((c) => c.method)).toEqual(["eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain"]);
    expect(w.state.chainId).toBe("0x76edaf");
    expect((w.calls[2]!.params as any[])[0]).toMatchObject({ chainId: "0x76edaf", chainName: "Rabdi", nativeCurrency: { symbol: "tGLM" } });
  });

  it("rejection_when_switching_network_becomes_a_clear_message", async () => {
    const w = fakeWallet({ reject: ["wallet_switchEthereumChain"] });
    await expect(createWallet(w.provider).ensureChain(SEPOLIA_SPEC)).rejects.toMatchObject({ code: "user_rejected" });
  });

  it("builds_the_network_spec_from_a_viem_chain", () => {
    const spec = chainSpecFromViem({ id: 7794095, name: "Rabdi", nativeCurrency: { name: "Golem", symbol: "tGLM", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.example.org/x"] } }, blockExplorers: { default: { url: "https://rabdi.explorer.arkiv.network" } } });
    expect(spec).toEqual(RABDI);
  });
});

describe("signing and events", () => {
  it("signs_the_message_and_returns_a_verifiable_signature", async () => {
    const w = fakeWallet();
    const wallet = createWallet(w.provider);
    const sig = await wallet.signMessage(w.state.account.address, "olá mundo");
    expect(sig).toBe(await w.state.account.signMessage({ message: "olá mundo" }));
  });

  it("rejection_when_signing_becomes_a_clear_message", async () => {
    const w = fakeWallet({ reject: ["personal_sign"] });
    await expect(createWallet(w.provider).signMessage(w.state.account.address, "x")).rejects.toMatchObject({ code: "user_rejected" });
  });

  it("reports_account_and_network_changes_and_stops_watching", () => {
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

describe("provider that guarantees the network before sending", () => {
  it("switches_network_when_asking_for_the_network_and_when_sending_and_reports_the_transaction", async () => {
    const w = fakeWallet({ chainId: "0x1" });
    const txs: unknown[] = [];
    const p = withChain(w.provider, createWallet(w.provider), SEPOLIA_SPEC, (t) => txs.push(t));
    expect(await p.request({ method: "eth_chainId" })).toBe("0xaa36a7");
    const hash = await p.request({ method: "eth_sendTransaction", params: [{ from: "0x1", to: "0x2" }] });
    expect(hash).toMatch(/^0x0+1$/);
    expect(txs).toEqual([{ hash, chainId: "0xaa36a7" }]);
  });

  it("other_methods_pass_through", async () => {
    const w = fakeWallet({ chainId: "0x1" });
    const p = withChain(w.provider, createWallet(w.provider), SEPOLIA_SPEC);
    await p.request({ method: "eth_accounts" });
    expect(w.state.chainId).toBe("0x1");
  });

  it("user_rejection_when_sending_rises_as_a_clear_error", async () => {
    const w = fakeWallet({ reject: ["eth_sendTransaction"], chainId: "0xaa36a7" });
    const p = withChain(w.provider, createWallet(w.provider), SEPOLIA_SPEC);
    await expect(p.request({ method: "eth_sendTransaction", params: [{}] })).rejects.toMatchObject({ code: "user_rejected" });
  });
});
