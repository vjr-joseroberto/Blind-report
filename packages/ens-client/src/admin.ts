import { ENS_KEYS, toBase64Url, type NewsroomPolicy } from "@safe-whistle/core";
import { encodeFunctionData, keccak256, toHex, type Address, type Chain, type Hex, type PublicClient, type Transport, type WalletClient, type Account } from "viem";
import { ABIS, ENSV2_SEPOLIA, ROLES, adminOf } from "./deployments.ts";
import { dnsEncode } from "./dns.ts";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const ZERO32 = ("0x" + "00".repeat(32)) as Hex;
const YEAR = 31_536_000n;
const DEFAULT_JOURNALIST_SECONDS = 180 * 24 * 3600;

/** Etapas do cadastro, para a tela mostrar o andamento (leva alguns minutos na rede real). */
export type AdminStep = { step: "resolver" | "commit" | "commit_wait" | "register" | "records" | "registry" | "done"; seconds?: number };

export type AdminDeps = {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  /** Espera do commit-reveal: em produção dorme; no fork, avança o relógio da rede. */
  wait: (seconds: number) => Promise<void>;
  /** Origem da aleatoriedade do segredo do commit (injetável). */
  random?: (n: number) => Uint8Array;
  /** Token de teste da Sepolia (mint livre). Em redes sem ele, desligue. */
  mintTestToken?: boolean;
  onProgress?: (e: AdminStep) => void;
};

export type Newsroom = { name: string; label: string; resolver: Address; subRegistry: Address };

export type CreateNewsroomInput = {
  label: string;
  publicKey: Uint8Array;
  version: number;
  policy: NewsroomPolicy;
  relayers?: string[];
  custodian: Address;
  durationSeconds?: number;
};

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function createAdmin(deps: AdminDeps) {
  const { publicClient, walletClient } = deps;
  const account = walletClient.account;
  const random = deps.random ?? ((n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
  const ethRegistrar = ENSV2_SEPOLIA.ethRegistrar as Address;
  const ethRegistry = ENSV2_SEPOLIA.ethRegistry as Address;
  const factory = ENSV2_SEPOLIA.verifiableFactory as Address;
  const labelId = (label: string) => BigInt(keccak256(toHex(label)));

  async function send(request: object): Promise<void> {
    const hash = await walletClient.writeContract(request as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Transação falhou: ${hash}`);
  }

  const chainNow = async () => Number((await publicClient.getBlock()).timestamp);

  async function deployProxy(implementation: Address, salt: Hex, initData: Hex): Promise<Address> {
    const sim = await publicClient.simulateContract({ address: factory, abi: ABIS.verifiableFactory, functionName: "deployProxy", args: [implementation, BigInt(salt), initData], account });
    await send(sim.request);
    return sim.result as Address;
  }

  const resolverCall = (resolver: Address, functionName: string, args: unknown[]) => send({ address: resolver, abi: ABIS.permissionedResolver, functionName, args });

  async function deployResolver(label: string): Promise<Address> {
    const roles = ROLES.resolver.setText | adminOf(ROLES.resolver.setText) | ROLES.resolver.setAddress | adminOf(ROLES.resolver.setAddress);
    const init = encodeFunctionData({ abi: ABIS.permissionedResolver, functionName: "initialize", args: [[{ account: account.address, roleBitmap: roles }], []] });
    return deployProxy(ENSV2_SEPOLIA.permissionedResolverImpl as Address, keccak256(toHex(`resolver:${label}:${account.address}`)), init);
  }

  async function registerName(label: string, resolver: Address, durationSeconds: bigint): Promise<void> {
    const available = await publicClient.readContract({ address: ethRegistrar, abi: ABIS.ethRegistrar, functionName: "isAvailable", args: [label] });
    if (!available) throw new Error(`O nome ${label}.eth não está disponível.`);
    const secret = toHex(random(32));
    const commitment = (await publicClient.readContract({
      address: ethRegistrar, abi: ABIS.ethRegistrar, functionName: "makeCommitment",
      args: [label, account.address, secret, ZERO, resolver, durationSeconds, ZERO32],
    })) as Hex;
    deps.onProgress?.({ step: "commit" });
    await send({ address: ethRegistrar, abi: ABIS.ethRegistrar, functionName: "commit", args: [commitment] });
    const minAge = (await publicClient.readContract({ address: ethRegistrar, abi: ABIS.ethRegistrar, functionName: "MIN_COMMITMENT_AGE" })) as bigint;
    deps.onProgress?.({ step: "commit_wait", seconds: Number(minAge) + 5 });
    await deps.wait(Number(minAge) + 5);
    deps.onProgress?.({ step: "register" });
    const token = ENSV2_SEPOLIA.mockUSDC as Address;
    const [base, premium] = (await publicClient.readContract({ address: ethRegistrar, abi: ABIS.ethRegistrar, functionName: "getRegisterPrice", args: [label, durationSeconds, token] })) as [bigint, bigint];
    const price = base + premium;
    if (deps.mintTestToken ?? true) await send({ address: token, abi: ABIS.mockUSDC, functionName: "mint", args: [account.address, price] });
    await send({
      address: token,
      abi: [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }],
      functionName: "approve", args: [ethRegistrar, price],
    });
    await send({ address: ethRegistrar, abi: ABIS.ethRegistrar, functionName: "register", args: [label, account.address, secret, ZERO, resolver, durationSeconds, token, ZERO32] });
  }

  const textCall = (name: string, key: string, value: string) =>
    encodeFunctionData({ abi: ABIS.permissionedResolver, functionName: "setText", args: [dnsEncode(name), key, value] });

  async function publishRecords(name: string, resolver: Address, r: { publicKey: Uint8Array; version: number; policy: NewsroomPolicy; relayers?: string[]; custodian: Address }): Promise<void> {
    const calls: Hex[] = [
      textCall(name, ENS_KEYS.pubkey, toBase64Url(r.publicKey)),
      textCall(name, ENS_KEYS.pubkeyVersion, String(r.version)),
      textCall(name, ENS_KEYS.policy, JSON.stringify(r.policy)),
      encodeFunctionData({ abi: ABIS.permissionedResolver, functionName: "setAddress", args: [dnsEncode(name), 60n, r.custodian] }),
    ];
    if (r.relayers?.length) calls.push(textCall(name, ENS_KEYS.relayer, r.relayers.join(",")));
    await resolverCall(resolver, "multicall", [calls]); // uma única transação
  }

  async function createJournalistRegistry(label: string): Promise<Address> {
    const roles = [ROLES.registry.registrar, ROLES.registry.unregister, ROLES.registry.renew, ROLES.registry.setResolver].reduce((acc, r) => acc | r | adminOf(r), 0n);
    const init = encodeFunctionData({ abi: ABIS.userRegistry, functionName: "initialize", args: [[{ account: account.address, roleBitmap: roles }]] });
    const subRegistry = await deployProxy(ENSV2_SEPOLIA.userRegistryImpl as Address, keccak256(toHex(`journalists:${label}:${account.address}`)), init);
    const parentToken = (await publicClient.readContract({ address: ethRegistry, abi: ABIS.ethRegistry, functionName: "getTokenId", args: [labelId(label)] })) as bigint;
    await send({ address: ethRegistry, abi: ABIS.ethRegistry, functionName: "setSubregistry", args: [parentToken, subRegistry] });
    return subRegistry;
  }

  const journalistToken = async (subRegistry: Address, label: string) =>
    (await publicClient.readContract({ address: subRegistry, abi: ABIS.userRegistry, functionName: "getTokenId", args: [labelId(label)] })) as bigint;

  return {
    /** Cadastra a redação: resolver próprio, nome .eth (commit-reveal), registros e registry dos jornalistas. */
    async createNewsroom(input: CreateNewsroomInput): Promise<Newsroom> {
      if (!LABEL_RE.test(input.label)) throw new Error(`Rótulo inválido: "${input.label}"`);
      const name = `${input.label}.eth`;
      deps.onProgress?.({ step: "resolver" });
      const resolver = await deployResolver(input.label);
      await registerName(input.label, resolver, BigInt(input.durationSeconds ?? Number(YEAR)));
      deps.onProgress?.({ step: "records" });
      await publishRecords(name, resolver, input);
      deps.onProgress?.({ step: "registry" });
      const subRegistry = await createJournalistRegistry(input.label);
      deps.onProgress?.({ step: "done" });
      return { name, label: input.label, resolver, subRegistry };
    },

    async setText(a: { name: string; resolver: Address; key: string; value: string }): Promise<void> {
      await resolverCall(a.resolver, "setText", [dnsEncode(a.name), a.key, a.value]);
    },

    /** Publica uma chave nova com versão MAIOR que a atual. */
    async rotateKey(a: { name: string; resolver: Address; publicKey: Uint8Array; version: number }): Promise<void> {
      const current = Number((await publicClient.getEnsText({ name: a.name, key: ENS_KEYS.pubkeyVersion, universalResolverAddress: ENSV2_SEPOLIA.universalResolver as Address })) ?? 0);
      if (!Number.isInteger(a.version) || a.version <= current) throw new Error(`A nova versão (${a.version}) deve ser maior que a versão atual (${current}).`);
      await resolverCall(a.resolver, "multicall", [[textCall(a.name, ENS_KEYS.pubkey, toBase64Url(a.publicKey)), textCall(a.name, ENS_KEYS.pubkeyVersion, String(a.version))]]);
    },

    /** Cadastra o jornalista como subname (sem papel de transferência) e publica a chave de leitura. */
    async addJournalist(a: { newsroom: Newsroom; label: string; address: Address; readerKey: Uint8Array; validForSeconds?: number }): Promise<void> {
      if (!LABEL_RE.test(a.label)) throw new Error(`Rótulo de jornalista inválido: "${a.label}"`);
      const expiry = BigInt((await chainNow()) + (a.validForSeconds ?? DEFAULT_JOURNALIST_SECONDS));
      await send({ address: a.newsroom.subRegistry, abi: ABIS.userRegistry, functionName: "register", args: [a.label, a.address, ZERO, a.newsroom.resolver, ROLES.registry.setResolver, expiry] });
      await resolverCall(a.newsroom.resolver, "setText", [dnsEncode(`${a.label}.${a.newsroom.name}`), ENS_KEYS.readerKey, toBase64Url(a.readerKey)]);
    },

    /** Revoga: `unregister` e, em seguida, limpa a chave de leitura (ela continuaria legível). */
    async revokeJournalist(a: { newsroom: Newsroom; label: string }): Promise<void> {
      const token = await journalistToken(a.newsroom.subRegistry, a.label);
      await send({ address: a.newsroom.subRegistry, abi: ABIS.userRegistry, functionName: "unregister", args: [token] });
      await resolverCall(a.newsroom.resolver, "setText", [dnsEncode(`${a.label}.${a.newsroom.name}`), ENS_KEYS.readerKey, ""]);
    },

    async renewJournalist(a: { newsroom: Newsroom; label: string; validForSeconds: number }): Promise<void> {
      const token = await journalistToken(a.newsroom.subRegistry, a.label);
      await send({ address: a.newsroom.subRegistry, abi: ABIS.userRegistry, functionName: "renew", args: [token, BigInt((await chainNow()) + a.validForSeconds)] });
    },
  };
}
