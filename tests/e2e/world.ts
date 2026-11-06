// Ambiente dos testes de ponta a ponta: fork da Sepolia + nó Arkiv local + relayer (processo filho, World SIMULADO).
// Tudo em localhost. Nenhum navegador. Nenhuma rede de anonimato.
import { createPublicClient as createArkivPublic, createWalletClient as createArkivWallet } from "@arkiv-network/sdk";
import { localhost } from "@arkiv-network/sdk/chains";
import { createSdkBackend, createStore } from "@safe-whistle/arkiv-store";
import { createAdmin, createReader, type EnsReadClient } from "@safe-whistle/ens-client";
import { createNewsroomClient } from "@safe-whistle/newsroom-client";
import { createRecorder, guardedFetch, type Recorder } from "@safe-whistle/network-policy";
import { createSourceClient, sourceNetworkPolicy, type ProofProvider } from "@safe-whistle/source-client";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createPublicClient, createTestClient, createWalletClient, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export const FORK = "http://127.0.0.1:8545";
export const ARKIV = "http://127.0.0.1:8546";
export const RELAYER_URL = "http://127.0.0.1:18787";
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex; // conta pré-financiada do nó Arkiv de desenvolvimento
const ROOT = resolve(import.meta.dirname, "../..");

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Imita a propriedade do protocolo: o nullifier depende da pessoa e da ação. */
export const nullifierOf = (person: string, action: string) => "0x" + createHash("sha256").update(`${person}|${action}`).digest("hex").slice(0, 60);

export const proofProviderFor = (person: string): ProofProvider => async (req) => ({
  protocol_version: "4.0", action: req.action, environment: req.environment,
  responses: [{ identifier: "proof_of_human", nullifier: nullifierOf(person, req.action) }],
});

const forkPublic = createPublicClient({ chain: sepolia, transport: http(FORK) });
const forkTest = createTestClient({ mode: "anvil", chain: sepolia, transport: http(FORK) });
const arkivPublicPlain = createArkivPublic({ chain: localhost, transport: http(ARKIV) });

export function arkivStore(key: Hex, fetchFn?: typeof fetch) {
  const transport = http(ARKIV, fetchFn ? { fetchFn } : undefined);
  return createStore(createSdkBackend({
    publicClient: createArkivPublic({ chain: localhost, transport }),
    walletClient: createArkivWallet({ chain: localhost, transport, account: privateKeyToAccount(key) }),
  }));
}

async function fundOnArkiv(to: Hex) {
  const funder = createArkivWallet({ chain: localhost, transport: http(ARKIV), account: privateKeyToAccount(FUNDER) });
  await arkivPublicPlain.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: privateKeyToAccount(to).address, value: 10n ** 18n }) });
}

export type Person = { key: Hex; address: Hex };
const newPerson = (): Person => {
  const key = generatePrivateKey();
  return { key, address: privateKeyToAccount(key).address };
};

/** Cliente da redação (administradora ou jornalista) com gravador de requisições próprio. */
export function newsroomSide(person: Person, canAdmin: boolean, authorName?: string) {
  const recorder = createRecorder();
  const policy = sourceNetworkPolicy({ rpcUrl: FORK, relayerUrl: RELAYER_URL, arkivRpcUrl: ARKIV });
  const fetchFn = guardedFetch(policy, recorder.fetch);
  const account = privateKeyToAccount(person.key);
  const transport = http(FORK, { fetchFn });
  const publicClient = createPublicClient({ chain: sepolia, transport });
  const walletClient = createWalletClient({ account, chain: sepolia, transport });
  const client = createNewsroomClient({
    makeAdmin: (hooks) => canAdmin
      ? createAdmin({ publicClient: publicClient as never, walletClient: walletClient as never, onProgress: hooks.onProgress, wait: async (s) => { await forkTest.increaseTime({ seconds: s }); await forkTest.mine({ blocks: 1 }); } })
      : ({} as never),
    reader: createReader({ client: publicClient as unknown as EnsReadClient }), store: arkivStore(person.key, fetchFn), account: account.address, now: () => new Date(), authorName,
  });
  return { client, recorder };
}

/** Cliente da fonte: cada pessoa tem o seu, com gravador próprio. `staleOnce` simula um cache de chave antiga. */
export function sourceSide(person: string) {
  const recorder = createRecorder();
  const policy = sourceNetworkPolicy({ rpcUrl: FORK, relayerUrl: RELAYER_URL, arkivRpcUrl: ARKIV });
  const fetchFn = guardedFetch(policy, recorder.fetch);
  const real = createReader({ client: createPublicClient({ chain: sepolia, transport: http(FORK, { fetchFn }) }) as unknown as EnsReadClient });
  let stale: Awaited<ReturnType<typeof real.resolveNewsroom>> | undefined;
  const store = arkivStore(generatePrivateKey(), fetchFn); // conta descartável: só leitura
  const client = createSourceClient({
    fetch: fetchFn, relayerUrl: RELAYER_URL, replies: store, submissions: store, proofProvider: proofProviderFor(person), now: () => new Date(),
    reader: { resolveNewsroom: async (n) => { if (stale) { const s = stale; stale = undefined; return s; } return real.resolveNewsroom(n); }, journalistOwner: (n) => real.journalistOwner(n) },
  });
  return { client, recorder, real, useStaleOnce: (info: typeof stale) => { stale = info; } };
}

export type World = Awaited<ReturnType<typeof startWorld>>;

export async function startWorld() {
  const owner = newPerson();
  const journalist = newPerson();
  const relayerWallet = newPerson();
  await forkTest.setBalance({ address: owner.address, value: parseEther("100") });
  await forkTest.setBalance({ address: journalist.address, value: parseEther("10") });
  const stranger = newPerson(); // carteira sem nenhum papel: serve para tentar forjar anotações e respostas
  for (const p of [owner, journalist, relayerWallet, stranger]) await fundOnArkiv(p.key);

  const admin = newsroomSide(owner, true);
  const label = `swe2e${Date.now().toString(36).slice(-6)}`;
  const steps: string[] = [];
  const ens = await admin.client.registerNewsroom({
    label, policy: { categories: ["saude", "corrupcao"], maxBytes: 100_000, attachments: true, epoch: "monthly" }, onProgress: (e) => steps.push(e.step),
  });

  const logs: string[] = [];
  const child: ChildProcess = spawn(process.execPath, ["--import", "tsx", "apps/relayer/src/main.ts"], {
    cwd: ROOT,
    env: {
      PATH: process.env.PATH ?? "", RELAYER_PRIVATE_KEY: relayerWallet.key, WORLD_APP_ID: "app_teste123", WORLD_RP_ID: "rp_teste123", RP_SIGNING_KEY: "33".repeat(32),
      WORLD_ENVIRONMENT: "staging", SEPOLIA_RPC_URL: FORK, ARKIV_RPC_URL: ARKIV, NEWSROOMS: ens.name, PORT: "18787", HOST: "127.0.0.1",
      NULLIFIER_FILE: join(mkdtempSync(join(tmpdir(), "sw-e2e-")), "claims.jsonl"), SIMULATE_WORLD: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout!.on("data", (d: Buffer) => logs.push(d.toString()));
  child.stderr!.on("data", (d: Buffer) => logs.push(d.toString()));
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    up = await fetch(`${RELAYER_URL}/health`).then((r) => r.ok, () => false);
    if (!up) await sleep(500);
  }
  if (!up) {
    child.kill("SIGTERM");
    throw new Error(`O relayer não subiu. Saída: ${logs.join("").slice(0, 500)}`);
  }

  return {
    owner, journalist, relayerWallet, stranger, ens, admin, steps, logs,
    relayerStore: arkivStore(relayerWallet.key),
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise<void>((r) => (child.exitCode !== null ? r() : child.once("exit", () => r())));
    },
  };
}

export type { Recorder };
