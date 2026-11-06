// V-03 — Fluxo ENS na Sepolia REAL (gasta ETH de teste das carteiras OWNER e JOURNALIST).
// Mede tempo e gás de cada passo e confirma a leitura pelo nome na Universal Resolver.
import { createPublicClient, createWalletClient, encodeFunctionData, formatEther, http, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { packetToBytes } from "viem/ens";
import { sepolia } from "viem/chains";
import { readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "./lib/env.ts";

const env = loadEnv();
const abi = (n: string) => JSON.parse(readFileSync(new URL(`./abis/${n}.json`, import.meta.url), "utf8"));
const ADDR = {
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe", ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4", resolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a", factory: "0xda70306c98e97ece36f997a21368e53298572991",
  usdc: "0x240b0316df57887dbbe58b586508b19e633a14aa",
} as const;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const transport = http(env.SEPOLIA_RPC_URL);
const pub = createPublicClient({ chain: sepolia, transport });
const owner = createWalletClient({ account: privateKeyToAccount(env.OWNER_PRIVATE_KEY as Hex), chain: sepolia, transport });
const journalist = privateKeyToAccount(env.JOURNALIST_PRIVATE_KEY as Hex);
const dns = (n: string) => toHex(packetToBytes(n));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Step = { passo: string; gas: string; custoETH: string; ms: number; tx: string };
const steps: Step[] = [];
let totalWei = 0n;
async function send(passo: string, req: object): Promise<void> {
  const t0 = performance.now();
  const hash = await owner.writeContract({ account: owner.account, chain: sepolia, ...(req as object) } as never);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`falhou: ${passo} ${hash}`);
  const wei = r.gasUsed * r.effectiveGasPrice;
  totalWei += wei;
  steps.push({ passo, gas: r.gasUsed.toString(), custoETH: formatEther(wei), ms: Math.round(performance.now() - t0), tx: hash });
  console.log(`ok  ${passo}  gas=${r.gasUsed}  custo=${formatEther(wei)} ETH  ${Math.round(performance.now() - t0)} ms`);
}

const R = { REGISTRAR: 1n << 0n, UNREGISTER: 1n << 12n, RENEW: 1n << 16n, SET_RESOLVER: 1n << 24n };
const adm = (r: bigint) => r << 128n;
const REG_ROOT = R.REGISTRAR | adm(R.REGISTRAR) | R.UNREGISTER | adm(R.UNREGISTER) | R.RENEW | adm(R.RENEW) | R.SET_RESOLVER | adm(R.SET_RESOLVER);
const RES_ROOT = (1n << 4n) | (1n << 132n) | (1n << 0n) | (1n << 128n);

const label = `swv03${Date.now().toString(36).slice(-5)}`;
const parent = `${label}.eth`;
console.log(`nome de teste: ${parent}`);
const started = performance.now();

const init = encodeFunctionData({ abi: abi("PermissionedResolver"), functionName: "initialize", args: [[{ account: owner.account.address, roleBitmap: RES_ROOT }], []] });
const sim = await pub.simulateContract({ address: ADDR.factory, abi: abi("VerifiableFactory"), functionName: "deployProxy", args: [ADDR.resolverImpl, BigInt(keccak256(toHex(label))), init], account: owner.account });
await send("1. criar resolver (proxy)", sim.request);
const resolver = sim.result as Address;

const secret = keccak256(toHex("s" + label)), ref = ("0x" + "00".repeat(32)) as Hex, dur = 31_536_000n;
const commitment = (await pub.readContract({ address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "makeCommitment", args: [label, owner.account.address, secret, ZERO, resolver, dur, ref] })) as Hex;
await send("2. commit do registro", { address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "commit", args: [commitment] });
const minAge = Number((await pub.readContract({ address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "MIN_COMMITMENT_AGE" })) as bigint);
console.log(`aguardando ${minAge + 5}s (espera mínima do commit)...`);
await sleep((minAge + 5) * 1000);
const [base, prem] = (await pub.readContract({ address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "getRegisterPrice", args: [label, dur, ADDR.usdc] })) as [bigint, bigint];
await send("3. mint de MockUSDC (token de teste)", { address: ADDR.usdc, abi: abi("MockUSDC"), functionName: "mint", args: [owner.account.address, base + prem] });
await send("4. approve do MockUSDC", { address: ADDR.usdc, abi: [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] }], functionName: "approve", args: [ADDR.ethRegistrar, base + prem] });
await send("5. registrar o nome .eth", { address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "register", args: [label, owner.account.address, secret, ZERO, resolver, dur, ADDR.usdc, ref] });

const setText = (n: string, k: string, v: string) => send(`texto ${k}`, { address: resolver, abi: abi("PermissionedResolver"), functionName: "setText", args: [dns(n), k, v] });
const policy = JSON.stringify({ categories: ["corrupcao", "saude"], maxBytes: 262144, attachments: true, epoch: "monthly" });
await setText(parent, "denuncia.pubkey", "chave-publica-de-teste-43-caracteres-aaaaaaaa");
await setText(parent, "denuncia.pubkey.version", "1");
await setText(parent, "denuncia.policy", policy);
await send("endereço da redação (custodiante)", { address: resolver, abi: abi("PermissionedResolver"), functionName: "setAddress", args: [dns(parent), 60n, owner.account.address] });

const uInit = encodeFunctionData({ abi: abi("UserRegistry"), functionName: "initialize", args: [[{ account: owner.account.address, roleBitmap: REG_ROOT }]] });
const uSim = await pub.simulateContract({ address: ADDR.factory, abi: abi("VerifiableFactory"), functionName: "deployProxy", args: [ADDR.userRegistryImpl, BigInt(keccak256(toHex("u" + label))), uInit], account: owner.account });
await send("6. criar registry dos jornalistas", uSim.request);
const sub = uSim.result as Address;
const parentToken = (await pub.readContract({ address: ADDR.ethRegistry, abi: abi("ETHRegistry"), functionName: "getTokenId", args: [BigInt(keccak256(toHex(label)))] })) as bigint;
await send("7. ligar o registry ao nome", { address: ADDR.ethRegistry, abi: abi("ETHRegistry"), functionName: "setSubregistry", args: [parentToken, sub] });
const exp = BigInt(Math.floor(Date.now() / 1000) + 30 * 24 * 3600);
await send("8. cadastrar o subname do jornalista", { address: sub, abi: abi("UserRegistry"), functionName: "register", args: ["maria", journalist.address, ZERO, resolver, R.SET_RESOLVER, exp] });
await setText(`maria.${parent}`, "denuncia.readerkey", "chave-de-leitura-da-maria");

// leitura pelo nome (o que a fonte e o relayer fariam)
const ur = { universalResolverAddress: ADDR.universalResolver as Address };
const read = { pubkey: await pub.getEnsText({ name: parent, key: "denuncia.pubkey", ...ur }), version: await pub.getEnsText({ name: parent, key: "denuncia.pubkey.version", ...ur }), policy: await pub.getEnsText({ name: parent, key: "denuncia.policy", ...ur }), custodiante: await pub.getEnsAddress({ name: parent, ...ur }), readerKey: await pub.getEnsText({ name: `maria.${parent}`, key: "denuncia.readerkey", ...ur }) };
const subOwner = await pub.readContract({ address: sub, abi: abi("UserRegistry"), functionName: "findOwner", args: ["maria"] });
const checks = {
  chavePublica: read.pubkey === "chave-publica-de-teste-43-caracteres-aaaaaaaa", versao: read.version === "1", politica: read.policy === policy,
  custodiante: String(read.custodiante).toLowerCase() === owner.account.address.toLowerCase(), chaveDeLeitura: read.readerKey === "chave-de-leitura-da-maria",
  donoDoSubname: String(subOwner).toLowerCase() === journalist.address.toLowerCase(),
};
console.log("leitura pelo nome:", checks);
const out = { nome: parent, resolver, subRegistry: sub, passos: steps, custoTotalETH: formatEther(totalWei), duracaoTotalSegundos: Math.round((performance.now() - started) / 1000), leitura: checks };
writeFileSync(new URL("./out/v03.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(`\nTOTAL: ${steps.length} transações, ${formatEther(totalWei)} ETH, ${out.duracaoTotalSegundos}s. Tudo ok: ${Object.values(checks).every(Boolean)}`);
