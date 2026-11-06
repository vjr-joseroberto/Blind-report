// B0: does the Arkiv SDK sign/send entity transactions through an EIP-1193 provider (MetaMask-style)?
// All local: node at 127.0.0.1:8556 (sw-arkiv-spike container). No anonymity network.
// Run: npx tsx validation/b0-arkiv-wallet-spike.ts
import { ExpirationTime, createPublicClient as arkivPublic, createWalletClient as arkivWallet } from "@arkiv-network/sdk";
import { localhost, rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { bytes, defineSchema, key as keyValue, str } from "@arkiv-network/sdk/schema";
import { createWalletClient, createPublicClient, custom, http, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const RPC = "http://127.0.0.1:8556";
// known development public key (pre-funded on the local node); only against the local node
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const signer = privateKeyToAccount(FUNDER);

const results: { step: string; ok: boolean; detail: string }[] = [];
const rec = (step: string, ok: boolean, detail: string) => { results.push({ step, ok, detail }); console.log(`${ok ? "OK  " : "FAIL"} ${step}: ${detail}`); };

// ---- Fake EIP-1193 provider: "wallet" that signs with a local key; the key never goes to the SDK ----
const calls: { method: string; params?: unknown }[] = [];
const nodeWallet = createWalletClient({ account: signer, chain: localhost, transport: http(RPC) });
const nodeRpc = createPublicClient({ chain: localhost, transport: http(RPC) });
const provider = {
  async request({ method, params }: { method: string; params?: any }): Promise<unknown> {
    calls.push({ method, params });
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts": return [signer.address];
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain": return null; // logged no-op
      case "eth_sendTransaction": {
        const t = params[0];
        // the real wallet would show the confirmation screen here; signs and sends
        return nodeWallet.sendTransaction({
          to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n,
          gas: t.gas ? BigInt(t.gas) : undefined,
        });
      }
      default: return (nodeRpc as any).request({ method, params }); // reads: delegates to the node
    }
  },
};

const S = defineSchema("b0.spike", { tag: str().indexed(), blob: bytes() });

async function main() {
  // (a)/(b) Rabdi parameters derived from the SDK (no network)
  const warn = console.warn; console.warn = () => {};
  const r = rabdi({ accessKey: "x" });
  console.warn = warn;
  const addParams = {
    chainId: toHex(r.id),
    chainName: r.name,
    nativeCurrency: r.nativeCurrency,
    rpcUrls: r.rpcUrls.default.http,
    blockExplorerUrls: [r.blockExplorers?.default.url],
  };
  console.log("Rabdi:", JSON.stringify({ id: r.id, name: r.name, nativeCurrency: r.nativeCurrency, explorer: r.blockExplorers?.default, testnet: r.testnet }));
  console.log("wallet_addEthereumChain:", JSON.stringify(addParams, null, 2));
  rec("rabdi() -> wallet_addEthereumChain", true, JSON.stringify(addParams));

  const nodeChainId = await nodeRpc.getChainId();
  rec("local node chainId vs. SDK localhost", nodeChainId === localhost.id, `node=${nodeChainId}, SDK localhost=${localhost.id}`);

  const pub = arkivPublic({ chain: localhost, transport: http(RPC) });
  const newOwner = privateKeyToAccount(generatePrivateKey()).address as Address;

  // Variant 1: account = address string (json-rpc); Variant 2: object {address,type:"json-rpc"}
  for (const [label, account] of [["endereço", signer.address], ["objeto json-rpc", { address: signer.address, type: "json-rpc" as const }]] as const) {
    const w: any = arkivWallet({ account: account as any, chain: localhost, transport: custom(provider) });
    rec(`[${label}] wallet.account`, !!w.account?.address, `type=${w.account?.type} address=${w.account?.address}`);
    const before = calls.length;
    try {
      const { entityKey } = await w.createEntity(S, { tag: label, blob: new Uint8Array([1, 2, 3]) }, {
        expiration: ExpirationTime.fromBlocks(200), flags: { readonly: false, permissionlessExtension: true },
      });
      rec(`[${label}] createEntity`, true, `key=${entityKey}; RPC methods in the provider: ${[...new Set(calls.slice(before).map((c) => c.method))].join(",")}`);
      const res = await pub.select().from(S).where(eq("$key" as never, keyValue(entityKey) as never)).fetch();
      const e: any = res.entities[0];
      rec(`[${label}] read back`, !!e, `owner=${e?.$owner?.value ?? e?.$owner} creator=${e?.$creator?.value ?? e?.$creator}`);
      try { await w.extendEntity({ entityKey, expiration: ExpirationTime.fromBlocks(400) }); rec(`[${label}] extendEntity`, true, "ok"); }
      catch (err: any) { rec(`[${label}] extendEntity`, false, `${err.name}: ${err.message}`.slice(0, 600)); }
      try { await w.changeOwnership({ entityKey, newOwner }); 
        const r2: any = (await pub.select().from(S).where(eq("$key" as never, keyValue(entityKey) as never)).fetch()).entities[0];
        const o = r2?.$owner?.value ?? r2?.$owner;
        rec(`[${label}] changeOwnership`, String(o).toLowerCase() === newOwner.toLowerCase(), `owner now=${o} expected=${newOwner}`);
      } catch (err: any) { rec(`[${label}] changeOwnership`, false, `${err.name}: ${err.message}`.slice(0, 600)); }
    } catch (err: any) { rec(`[${label}] createEntity`, false, `${err.name}: ${err.message}`.slice(0, 800)); }
  }

  // (c) did the SDK request anything besides eth_sendTransaction to sign?
  const methods = [...new Set(calls.map((c) => c.method))];
  const signing = methods.filter((m) => /sign|personal_/.test(m));
  rec("RPC methods seen in the provider", true, methods.join(", "));
  rec("SDK requested signing outside eth_sendTransaction", signing.length === 0, signing.length ? signing.join(",") : "none (only eth_sendTransaction to write)");
  const tx = calls.find((c) => c.method === "eth_sendTransaction");
  if (tx) console.log("eth_sendTransaction example (to, from, value, data size):", { to: (tx.params as any[])[0].to, from: (tx.params as any[])[0].from, value: (tx.params as any[])[0].value, gas: (tx.params as any[])[0].gas, dataBytes: ((tx.params as any[])[0].data.length - 2) / 2 });

  console.log(results.every((x) => x.ok) ? "\nCONCLUSION: works directly with a json-rpc account + custom(provider)." : "\nThere are failures; see above.");
}
main().catch((e) => { console.error(e); process.exit(1); });
