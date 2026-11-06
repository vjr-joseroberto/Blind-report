// V-04 — Subnames as journalists: expiration, revocation, transfer and renewal (local Sepolia fork).
// Prerequisite: `npm run nodes:up` (fork on :8545).
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
  try { await fn(); return "ALLOWED"; } catch (e) { return "REJECTED (" + String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).split("\n")[0]!.slice(0, 70) + ")"; }
};

// Roles (RegistryRolesLib / PermissionedResolverLib from contracts-v2); each role's "admin" sits 128 bits above.
const R = { REGISTRAR: 1n << 0n, UNREGISTER: 1n << 12n, RENEW: 1n << 16n, SET_RESOLVER: 1n << 24n, CAN_TRANSFER_ADMIN: (1n << 28n) << 128n };
const adm = (r: bigint) => (r << 128n);
const REG_ROOT = R.REGISTRAR | adm(R.REGISTRAR) | R.UNREGISTER | adm(R.UNREGISTER) | R.RENEW | adm(R.RENEW) | R.SET_RESOLVER | adm(R.SET_RESOLVER) | R.CAN_TRANSFER_ADMIN;
const RES_ROOT = (1n << 4n) | (1n << 132n) | (1n << 0n) | (1n << 128n);

const admin = wallet(generatePrivateKey());
const maria = wallet(generatePrivateKey());
const joao = wallet(generatePrivateKey());
const other = wallet(generatePrivateKey());
for (const w of [admin, maria, joao, other]) await test.setBalance({ address: w.account.address, value: parseEther("100") });

// 1) own resolver + registered name
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

// 2) journalists' sub-registry
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

// 3) register two journalists (maria without transfer power; joao with it)
const rolesMaria = R.SET_RESOLVER;
const rolesJoao = R.SET_RESOLVER | R.CAN_TRANSFER_ADMIN;
await send(admin, U("register", ["maria", maria.account.address, ZERO, resolver, rolesMaria, BigInt(chainNow + 3600)]));
await send(admin, U("register", ["joao", joao.account.address, ZERO, resolver, rolesJoao, BigInt(chainNow + 3600)]));
const tMaria = await tokenOf("maria"), tJoao = await tokenOf("joao");

const rows: [string, string][] = [];
const text = async (name: string, key: string) => pub.getEnsText({ name, key, ...ur }).catch(() => null);
const setText = (name: string, key: string, value: string) => send(admin, { address: resolver, abi: abi("PermissionedResolver"), functionName: "setText", args: [dns(name), key, value] });

await setText(`maria.${parent}`, "denuncia.readerkey", "chave-da-maria");
rows.push(["D1: the subname resolves the reader key by name", (await text(`maria.${parent}`, "denuncia.readerkey")) === "chave-da-maria" ? "YES" : "NO"]);
rows.push(["D2: findOwner('maria') is the journalist", String(await pub.readContract(U("findOwner", ["maria"]) as never)).toLowerCase() === maria.account.address.toLowerCase() ? "YES" : "NO"]);
rows.push(["D3: the journalist changes the key in the resolver without a role", await attempt(() => pub.simulateContract({ address: resolver, abi: abi("PermissionedResolver"), functionName: "setText", args: [dns(`maria.${parent}`), "denuncia.readerkey", "x"], account: maria.account }))]);

// Transfer (safeTransferFrom requires the registry "emancipated"; unsafeTransfer is the available path)
rows.push(["T1: maria (without CAN_TRANSFER) transfers with unsafeTransfer", await attempt(() => pub.simulateContract({ ...U("unsafeTransfer", [other.account.address, tMaria, "0x"]), account: maria.account } as never))]);
rows.push(["T2: joao (with CAN_TRANSFER) transfers with safeTransferFrom", await attempt(() => pub.simulateContract({ ...U("safeTransferFrom", [joao.account.address, other.account.address, tJoao, 1n, "0x"]), account: joao.account } as never))]);
rows.push(["T3: joao (with CAN_TRANSFER) transfers with unsafeTransfer", await attempt(() => send(joao, U("unsafeTransfer", [other.account.address, tJoao, "0x"])))]);
rows.push(["T4: after the transfer, the owner of 'joao' is the other account", String(await pub.readContract(U("findOwner", ["joao"]) as never)).toLowerCase() === other.account.address.toLowerCase() ? "YES" : "NO"]);

// Revocation (before any expiration)
await send(admin, U("register", ["ana", maria.account.address, ZERO, resolver, rolesMaria, BigInt(chainNow + 3600)]));
const tAna = await tokenOf("ana");
rows.push(["R1: a third party tries to revoke 'ana'", await attempt(() => pub.simulateContract({ ...U("unregister", [tAna]), account: other.account } as never))]);
rows.push(["R2: the administrator revokes (unregister) 'ana'", await attempt(() => send(admin, U("unregister", [tAna])))]);
rows.push(["R3: findOwner('ana') after revoking", String(await pub.readContract(U("findOwner", ["ana"]) as never))]);
rows.push(["R4: the administrator revokes 'joao' even after the transfer", await attempt(() => send(admin, U("unregister", [tJoao])))]);
rows.push(["R5: the administrator clears the revoked reader key in the resolver", await attempt(() => setText(`ana.${parent}`, "denuncia.readerkey", ""))]);
rows.push(["R6: the administrator registers the same label again after revoking", await attempt(() => send(admin, U("register", ["ana", other.account.address, ZERO, resolver, rolesMaria, BigInt(chainNow + 3600)])))]);

// Renewal and expiration
rows.push(["E1: the administrator renews 'maria' (+2h)", await attempt(() => send(admin, U("renew", [tMaria, BigInt(chainNow + 3 * 3600)])))]);
rows.push(["E2: a third party renews 'maria'", await attempt(() => pub.simulateContract({ ...U("renew", [tMaria, BigInt(chainNow + 5 * 3600)]), account: other.account } as never))]);
await test.increaseTime({ seconds: 3 * 3600 + 60 }); await test.mine({ blocks: 1 });
rows.push(["E3: status of 'maria' after expiring (0=free)", String(await pub.readContract(U("getStatus", [tMaria]) as never))]);
rows.push(["E4: findOwner('maria') after expiring", String(await pub.readContract(U("findOwner", ["maria"]) as never).catch((e: Error) => "error: " + e.message.slice(0, 40)))]);
rows.push(["E5: the reader key still resolves by name after expiring (the resolver record remains)", (await text(`maria.${parent}`, "denuncia.readerkey")) ?? "does not resolve"]);
const afterExpiry = await now();
rows.push(["E6: the administrator registers the same label after expiring", await attempt(() => send(admin, U("register", ["maria", other.account.address, ZERO, resolver, rolesMaria, BigInt(afterExpiry + 3600)])))]);

console.log("| Check | Result |\n|---|---|");
for (const [k, v] of rows) console.log(`| ${k} | ${v} |`);
