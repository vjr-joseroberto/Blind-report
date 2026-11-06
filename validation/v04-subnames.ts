// V-04 — Subnames como jornalistas: expiração, revogação, transferência e renovação (fork local da Sepolia).
// Pré-requisito: `npm run nodes:up` (fork em :8545).
import { createPublicClient, createTestClient, createWalletClient, encodeFunctionData, http, keccak256, parseEther, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { packetToBytes } from "viem/ens";
import { sepolia } from "viem/chains";
import { readFileSync } from "node:fs";

const RPC = process.env.SEPOLIA_FORK_RPC ?? "http://127.0.0.1:8545";
const abi = (n: string) => JSON.parse(readFileSync(new URL(`./abis/${n}.json`, import.meta.url), "utf8"));
const ADDR = {
  universalResolver: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  ethRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  ethRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  resolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  userRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  factory: "0xda70306c98e97ece36f997a21368e53298572991",
  usdc: "0x240b0316df57887dbbe58b586508b19e633a14aa",
} as const;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const pub = createPublicClient({ chain: sepolia, transport: http(RPC) });
const test = createTestClient({ mode: "anvil", chain: sepolia, transport: http(RPC) });
const wallet = (k: Hex) => createWalletClient({ account: privateKeyToAccount(k), chain: sepolia, transport: http(RPC) });
const send = async (w: ReturnType<typeof wallet>, req: object) => pub.waitForTransactionReceipt({ hash: await w.writeContract(req as never) });
const dns = (n: string) => toHex(packetToBytes(n));
const ur = { universalResolverAddress: ADDR.universalResolver as Address };
const attempt = async (fn: () => Promise<unknown>) => {
  try { await fn(); return "PERMITIDO"; } catch (e) { return "RECUSADO (" + String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).split("\n")[0]!.slice(0, 70) + ")"; }
};

// Roles (RegistryRolesLib / PermissionedResolverLib do contracts-v2); o "admin" de cada role fica 128 bits acima.
const R = { REGISTRAR: 1n << 0n, UNREGISTER: 1n << 12n, RENEW: 1n << 16n, SET_RESOLVER: 1n << 24n, CAN_TRANSFER_ADMIN: (1n << 28n) << 128n };
const adm = (r: bigint) => (r << 128n);
const REG_ROOT = R.REGISTRAR | adm(R.REGISTRAR) | R.UNREGISTER | adm(R.UNREGISTER) | R.RENEW | adm(R.RENEW) | R.SET_RESOLVER | adm(R.SET_RESOLVER) | R.CAN_TRANSFER_ADMIN;
const RES_ROOT = (1n << 4n) | (1n << 132n) | (1n << 0n) | (1n << 128n);

const admin = wallet(generatePrivateKey());
const maria = wallet(generatePrivateKey());
const joao = wallet(generatePrivateKey());
const other = wallet(generatePrivateKey());
for (const w of [admin, maria, joao, other]) await test.setBalance({ address: w.account.address, value: parseEther("100") });

// 1) resolver próprio + nome registrado
const label = `sw${Date.now().toString(36).slice(-6)}`;
const parent = `${label}.eth`;
const init = encodeFunctionData({ abi: abi("PermissionedResolver"), functionName: "initialize", args: [[{ account: admin.account.address, roleBitmap: RES_ROOT }], []] });
const sim = await pub.simulateContract({ address: ADDR.factory, abi: abi("VerifiableFactory"), functionName: "deployProxy", args: [ADDR.resolverImpl, BigInt(keccak256(toHex(label))), init], account: admin.account });
await send(admin, sim.request);
const resolver = sim.result as Address;
const secret = keccak256(toHex("s" + label)), ref = ("0x" + "00".repeat(32)) as Hex, dur = 31_536_000n;
const commitment = (await pub.readContract({ address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "makeCommitment", args: [label, admin.account.address, secret, ZERO, resolver, dur, ref] })) as Hex;
await send(admin, { address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "commit", args: [commitment] });
await test.increaseTime({ seconds: 70 }); await test.mine({ blocks: 1 });
const [b, p] = (await pub.readContract({ address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "getRegisterPrice", args: [label, dur, ADDR.usdc] })) as [bigint, bigint];
await send(admin, { address: ADDR.usdc, abi: abi("MockUSDC"), functionName: "mint", args: [admin.account.address, b + p] });
await send(admin, { address: ADDR.usdc, abi: [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] }], functionName: "approve", args: [ADDR.ethRegistrar, b + p] });
await send(admin, { address: ADDR.ethRegistrar, abi: abi("ETHRegistrar"), functionName: "register", args: [label, admin.account.address, secret, ZERO, resolver, dur, ADDR.usdc, ref] });

// 2) sub-registry dos jornalistas
const uInit = encodeFunctionData({ abi: abi("UserRegistry"), functionName: "initialize", args: [[{ account: admin.account.address, roleBitmap: REG_ROOT }]] });
const uSim = await pub.simulateContract({ address: ADDR.factory, abi: abi("VerifiableFactory"), functionName: "deployProxy", args: [ADDR.userRegistryImpl, BigInt(keccak256(toHex("u" + label))), uInit], account: admin.account });
await send(admin, uSim.request);
const sub = uSim.result as Address;
const parentToken = (await pub.readContract({ address: ADDR.ethRegistry, abi: abi("ETHRegistry"), functionName: "getTokenId", args: [BigInt(keccak256(toHex(label)))] })) as bigint;
await send(admin, { address: ADDR.ethRegistry, abi: abi("ETHRegistry"), functionName: "setSubregistry", args: [parentToken, sub] });

const U = (functionName: string, args: unknown[]) => ({ address: sub, abi: abi("UserRegistry"), functionName, args });
const tokenOf = async (l: string) => (await pub.readContract({ ...U("getTokenId", [BigInt(keccak256(toHex(l)))]) } as never)) as bigint;
const now = async () => Number((await pub.getBlock()).timestamp);
const chainNow = await now();

// 3) cadastrar dois jornalistas (maria sem poder de transferir; joao com)
const rolesMaria = R.SET_RESOLVER;
const rolesJoao = R.SET_RESOLVER | R.CAN_TRANSFER_ADMIN;
await send(admin, U("register", ["maria", maria.account.address, ZERO, resolver, rolesMaria, BigInt(chainNow + 3600)]));
await send(admin, U("register", ["joao", joao.account.address, ZERO, resolver, rolesJoao, BigInt(chainNow + 3600)]));
const tMaria = await tokenOf("maria"), tJoao = await tokenOf("joao");

const rows: [string, string][] = [];
const text = async (name: string, key: string) => pub.getEnsText({ name, key, ...ur }).catch(() => null);
const setText = (name: string, key: string, value: string) => send(admin, { address: resolver, abi: abi("PermissionedResolver"), functionName: "setText", args: [dns(name), key, value] });

await setText(`maria.${parent}`, "denuncia.readerkey", "chave-da-maria");
rows.push(["D1: o subname resolve a chave de leitura pelo nome", (await text(`maria.${parent}`, "denuncia.readerkey")) === "chave-da-maria" ? "SIM" : "NÃO"]);
rows.push(["D2: findOwner('maria') é o jornalista", String(await pub.readContract(U("findOwner", ["maria"]) as never)).toLowerCase() === maria.account.address.toLowerCase() ? "SIM" : "NÃO"]);
rows.push(["D3: o jornalista altera a chave no resolver sem role", await attempt(() => pub.simulateContract({ address: resolver, abi: abi("PermissionedResolver"), functionName: "setText", args: [dns(`maria.${parent}`), "denuncia.readerkey", "x"], account: maria.account }))]);

// Transferência (safeTransferFrom exige o registry "emancipado"; unsafeTransfer é o caminho disponível)
rows.push(["T1: maria (sem CAN_TRANSFER) transfere com unsafeTransfer", await attempt(() => pub.simulateContract({ ...U("unsafeTransfer", [other.account.address, tMaria, "0x"]), account: maria.account } as never))]);
rows.push(["T2: joao (com CAN_TRANSFER) transfere com safeTransferFrom", await attempt(() => pub.simulateContract({ ...U("safeTransferFrom", [joao.account.address, other.account.address, tJoao, 1n, "0x"]), account: joao.account } as never))]);
rows.push(["T3: joao (com CAN_TRANSFER) transfere com unsafeTransfer", await attempt(() => send(joao, U("unsafeTransfer", [other.account.address, tJoao, "0x"])))]);
rows.push(["T4: depois da transferência, o dono de 'joao' é a outra conta", String(await pub.readContract(U("findOwner", ["joao"]) as never)).toLowerCase() === other.account.address.toLowerCase() ? "SIM" : "NÃO"]);

// Revogação (antes de qualquer expiração)
await send(admin, U("register", ["ana", maria.account.address, ZERO, resolver, rolesMaria, BigInt(chainNow + 3600)]));
const tAna = await tokenOf("ana");
rows.push(["R1: um terceiro tenta revogar 'ana'", await attempt(() => pub.simulateContract({ ...U("unregister", [tAna]), account: other.account } as never))]);
rows.push(["R2: o administrador revoga (unregister) 'ana'", await attempt(() => send(admin, U("unregister", [tAna])))]);
rows.push(["R3: findOwner('ana') depois de revogar", String(await pub.readContract(U("findOwner", ["ana"]) as never))]);
rows.push(["R4: o administrador revoga 'joao' mesmo depois da transferência", await attempt(() => send(admin, U("unregister", [tJoao])))]);
rows.push(["R5: o administrador limpa a chave de leitura do revogado no resolver", await attempt(() => setText(`ana.${parent}`, "denuncia.readerkey", ""))]);
rows.push(["R6: o administrador cadastra o mesmo rótulo de novo depois de revogar", await attempt(() => send(admin, U("register", ["ana", other.account.address, ZERO, resolver, rolesMaria, BigInt(chainNow + 3600)])))]);

// Renovação e expiração
rows.push(["E1: o administrador renova 'maria' (+2h)", await attempt(() => send(admin, U("renew", [tMaria, BigInt(chainNow + 3 * 3600)])))]);
rows.push(["E2: um terceiro renova 'maria'", await attempt(() => pub.simulateContract({ ...U("renew", [tMaria, BigInt(chainNow + 5 * 3600)]), account: other.account } as never))]);
await test.increaseTime({ seconds: 3 * 3600 + 60 }); await test.mine({ blocks: 1 });
rows.push(["E3: status de 'maria' após expirar (0=livre)", String(await pub.readContract(U("getStatus", [tMaria]) as never))]);
rows.push(["E4: findOwner('maria') depois de expirar", String(await pub.readContract(U("findOwner", ["maria"]) as never).catch((e: Error) => "erro: " + e.message.slice(0, 40)))]);
rows.push(["E5: a chave de leitura ainda resolve pelo nome depois de expirar (o registro do resolver permanece)", (await text(`maria.${parent}`, "denuncia.readerkey")) ?? "não resolve"]);
const afterExpiry = await now();
rows.push(["E6: o administrador cadastra o mesmo rótulo depois de expirar", await attempt(() => send(admin, U("register", ["maria", other.account.address, ZERO, resolver, rolesMaria, BigInt(afterExpiry + 3600)])))]);

console.log("| Verificação | Resultado |\n|---|---|");
for (const [k, v] of rows) console.log(`| ${k} | ${v} |`);
