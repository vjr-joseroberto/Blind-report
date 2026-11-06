// B0: o SDK do Arkiv assina/envia transações de entidade por um provedor EIP-1193 (estilo MetaMask)?
// Tudo local: nó em 127.0.0.1:8556 (contêiner sw-arkiv-spike). Sem rede de anonimato.
// Rodar: npx tsx validation/b0-arkiv-wallet-spike.ts
import { ExpirationTime, createPublicClient as arkivPublic, createWalletClient as arkivWallet } from "@arkiv-network/sdk";
import { localhost, rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { bytes, defineSchema, key as keyValue, str } from "@arkiv-network/sdk/schema";
import { createWalletClient, createPublicClient, custom, http, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const RPC = "http://127.0.0.1:8556";
// chave pública conhecida de desenvolvimento (pré-financiada no nó local); só contra o nó local
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const signer = privateKeyToAccount(FUNDER);

const results: { step: string; ok: boolean; detail: string }[] = [];
const rec = (step: string, ok: boolean, detail: string) => { results.push({ step, ok, detail }); console.log(`${ok ? "OK  " : "FALHA"} ${step}: ${detail}`); };

// ---- Provedor EIP-1193 falso: "carteira" que assina com chave local; a chave nunca vai ao SDK ----
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
      case "wallet_addEthereumChain": return null; // no-op registrado
      case "eth_sendTransaction": {
        const t = params[0];
        // a carteira real mostraria a tela de confirmação aqui; assina e envia
        return nodeWallet.sendTransaction({
          to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n,
          gas: t.gas ? BigInt(t.gas) : undefined,
        });
      }
      default: return (nodeRpc as any).request({ method, params }); // leituras: delega ao nó
    }
  },
};

const S = defineSchema("b0.spike", { tag: str().indexed(), blob: bytes() });

async function main() {
  // (a)/(b) parâmetros da Rabdi derivados do SDK (sem rede)
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
  rec("chainId do nó local vs. localhost do SDK", nodeChainId === localhost.id, `nó=${nodeChainId}, SDK localhost=${localhost.id}`);

  const pub = arkivPublic({ chain: localhost, transport: http(RPC) });
  const newOwner = privateKeyToAccount(generatePrivateKey()).address as Address;

  // Variante 1: account = string de endereço (json-rpc); Variante 2: objeto {address,type:"json-rpc"}
  for (const [label, account] of [["endereço", signer.address], ["objeto json-rpc", { address: signer.address, type: "json-rpc" as const }]] as const) {
    const w: any = arkivWallet({ account: account as any, chain: localhost, transport: custom(provider) });
    rec(`[${label}] wallet.account`, !!w.account?.address, `type=${w.account?.type} address=${w.account?.address}`);
    const before = calls.length;
    try {
      const { entityKey } = await w.createEntity(S, { tag: label, blob: new Uint8Array([1, 2, 3]) }, {
        expiration: ExpirationTime.fromBlocks(200), flags: { readonly: false, permissionlessExtension: true },
      });
      rec(`[${label}] createEntity`, true, `key=${entityKey}; métodos RPC no provedor: ${[...new Set(calls.slice(before).map((c) => c.method))].join(",")}`);
      const res = await pub.select().from(S).where(eq("$key" as never, keyValue(entityKey) as never)).fetch();
      const e: any = res.entities[0];
      rec(`[${label}] leitura de volta`, !!e, `owner=${e?.$owner?.value ?? e?.$owner} creator=${e?.$creator?.value ?? e?.$creator}`);
      try { await w.extendEntity({ entityKey, expiration: ExpirationTime.fromBlocks(400) }); rec(`[${label}] extendEntity`, true, "ok"); }
      catch (err: any) { rec(`[${label}] extendEntity`, false, `${err.name}: ${err.message}`.slice(0, 600)); }
      try { await w.changeOwnership({ entityKey, newOwner }); 
        const r2: any = (await pub.select().from(S).where(eq("$key" as never, keyValue(entityKey) as never)).fetch()).entities[0];
        const o = r2?.$owner?.value ?? r2?.$owner;
        rec(`[${label}] changeOwnership`, String(o).toLowerCase() === newOwner.toLowerCase(), `owner agora=${o} esperado=${newOwner}`);
      } catch (err: any) { rec(`[${label}] changeOwnership`, false, `${err.name}: ${err.message}`.slice(0, 600)); }
    } catch (err: any) { rec(`[${label}] createEntity`, false, `${err.name}: ${err.message}`.slice(0, 800)); }
  }

  // (c) o SDK pediu algo além de eth_sendTransaction para assinar?
  const methods = [...new Set(calls.map((c) => c.method))];
  const signing = methods.filter((m) => /sign|personal_/.test(m));
  rec("métodos RPC vistos no provedor", true, methods.join(", "));
  rec("SDK pediu assinatura fora de eth_sendTransaction", signing.length === 0, signing.length ? signing.join(",") : "nenhuma (só eth_sendTransaction para escrever)");
  const tx = calls.find((c) => c.method === "eth_sendTransaction");
  if (tx) console.log("Exemplo de eth_sendTransaction (to, from, value, tamanho de data):", { to: (tx.params as any[])[0].to, from: (tx.params as any[])[0].from, value: (tx.params as any[])[0].value, gas: (tx.params as any[])[0].gas, dataBytes: ((tx.params as any[])[0].data.length - 2) / 2 });

  console.log(results.every((x) => x.ok) ? "\nCONCLUSÃO: funciona direto com conta json-rpc + custom(provider)." : "\nHá falhas; veja acima.");
}
main().catch((e) => { console.error(e); process.exit(1); });
