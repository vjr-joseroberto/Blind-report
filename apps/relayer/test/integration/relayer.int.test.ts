// Full submission flow: ENS (Sepolia fork) + Arkiv (local node) + relayer, with the SIMULATED World verifier.
import { createPublicClient as createArkivPublicClient, createWalletClient as createArkivWalletClient } from "@arkiv-network/sdk";
import { localhost } from "@arkiv-network/sdk/chains";
import { createSdkBackend, createStore } from "@safe-whistle/arkiv-store";
import { currentEpoch, toBase64Url, actionFor } from "@safe-whistle/core";
import { encodeEnvelope, newKeypair, open, seal } from "@safe-whistle/crypto";
import { createAdmin } from "@safe-whistle/ens-client";
import { createRecorder } from "@safe-whistle/network-policy";
import { createSimulatedVerifier } from "@safe-whistle/worldid-gate";
import { createPublicClient, createTestClient, createWalletClient, http, parseEther, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { composeRelayer, loadConfig, type HttpResponse } from "../../src/index.ts";
import { nullifierOf } from "./nullifier.ts";

const FORK = "http://127.0.0.1:8545";
const ARKIV = "http://127.0.0.1:8546";
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex; // pre-funded account of the development Arkiv node

const forkPublic = createPublicClient({ chain: sepolia, transport: http(FORK) });
const forkTest = createTestClient({ mode: "anvil", chain: sepolia, transport: http(FORK) });
const arkivPublic = createArkivPublicClient({ chain: localhost, transport: http(ARKIV) });
const arkivWallet = (key: Hex) => createArkivWalletClient({ chain: localhost, transport: http(ARKIV), account: privateKeyToAccount(key) });

const json = (r: HttpResponse) => JSON.parse(r.body) as Record<string, any>;
let name = "";
let relayerKey: Hex;
let newsroomAddress: Hex;
const keys = newKeypair();

beforeAll(async () => {
  // 1) the newsroom signs up in ENS (fork), with the public key and the policy
  const owner = privateKeyToAccount(generatePrivateKey());
  await forkTest.setBalance({ address: owner.address, value: parseEther("100") });
  const admin = createAdmin({
    publicClient: forkPublic, walletClient: createWalletClient({ account: owner, chain: sepolia, transport: http(FORK) }),
    wait: async (s) => { await forkTest.increaseTime({ seconds: s }); await forkTest.mine({ blocks: 1 }); },
  });
  newsroomAddress = privateKeyToAccount(generatePrivateKey()).address;
  const label = `swrelay${Date.now().toString(36).slice(-6)}`;
  const nr = await admin.createNewsroom({ label, publicKey: keys.publicKey, version: 1, policy: { categories: ["saude", "corrupcao"], maxBytes: 100_000, attachments: false, epoch: "monthly" }, custodian: newsroomAddress });
  name = nr.name;

  // 2) relayer account, funded on the Arkiv node
  relayerKey = generatePrivateKey();
  const funder = arkivWallet(FUNDER);
  await arkivPublic.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: privateKeyToAccount(relayerKey).address, value: 10n ** 18n }) });
});

function build() {
  const recorder = createRecorder();
  const config = loadConfig({
    RELAYER_PRIVATE_KEY: relayerKey, WORLD_APP_ID: "app_teste123", WORLD_RP_ID: "rp_teste123", RP_SIGNING_KEY: "33".repeat(32), WORLD_ENVIRONMENT: "staging",
    SEPOLIA_RPC_URL: FORK, ARKIV_RPC_URL: ARKIV, NEWSROOMS: name, NULLIFIER_FILE: join(mkdtempSync(join(tmpdir(), "sw-relayer-")), "claims.jsonl"),
  });
  const { app, renewal } = composeRelayer(config, { verifier: createSimulatedVerifier(), fetch: recorder.fetch, logger: { info: () => {}, error: () => {} } });
  return { app, renewal, recorder };
}

const get = (app: ReturnType<typeof build>["app"], path: string) => {
  const u = new URL(path, "http://relayer.local");
  return app.handle({ method: "GET", path: u.pathname, query: u.searchParams, headers: {}, body: new Uint8Array() });
};

function submission(person: string, plaintext: string) {
  const epoch = currentEpoch(() => new Date());
  const action = actionFor(name, epoch);
  const { envelope } = seal({ newsroom: name, pubkeyVersion: 1, category: "saude", recipients: [{ id: "redacao", publicKey: keys.publicKey }], plaintext: new TextEncoder().encode(plaintext) });
  const proof = { protocol_version: "4.0", action, environment: "staging", responses: [{ identifier: "proof_of_human", nullifier: nullifierOf(person, action) }] };
  return { body: new TextEncoder().encode(JSON.stringify({ newsroom: name, epoch, category: "saude", hasAttachment: false, proof, envelope: toBase64Url(encodeEnvelope(envelope)) })), plaintext };
}

describe("relayer end to end (real ENS on the fork + real local Arkiv)", () => {
  it("complete_submission_flow_the_newsroom_decrypts_and_custody_is_hers", async () => {
    const { app, recorder } = build();

    const ctx = await get(app, `/rp-context?newsroom=${name}`);
    expect(ctx.status).toBe(200);
    expect(json(ctx).action).toBe(actionFor(name, currentEpoch(() => new Date())));

    const sub = submission("ana", "Denúncia fictícia ponta a ponta.");
    const res = await app.handle({ method: "POST", path: "/submissions", query: new URLSearchParams(), headers: {}, body: sub.body });
    expect(res.status, res.body).toBe(201);

    // the newsroom lists and decrypts
    const reader = createStore(createSdkBackend({ publicClient: arkivPublic, walletClient: arkivWallet(generatePrivateKey()) }));
    const { items } = await reader.listSubmissions({ newsroom: name });
    expect(items).toHaveLength(1);
    const { decodeEnvelope } = await import("@safe-whistle/crypto");
    expect(new TextDecoder().decode(open(decodeEnvelope(items[0]!.envelope), "redacao", keys))).toBe(sub.plaintext);

    // custody belongs to the newsroom and the creator is the relayer
    const row = await createSdkBackend({ publicClient: arkivPublic, walletClient: arkivWallet(generatePrivateKey()) }).get("denuncia", items[0]!.key);
    expect(row?.owner.toLowerCase()).toBe(newsroomAddress.toLowerCase());
    expect(row?.creator.toLowerCase()).toBe(privateKeyToAccount(relayerKey).address.toLowerCase());

    // only declared local hosts were contacted
    expect(recorder.hosts().every((h) => h === "127.0.0.1")).toBe(true);
  });

  it("the_second_submission_from_the_same_person_is_rejected_and_another_person_is_accepted", async () => {
    const { app } = build();
    const post = (b: Uint8Array) => app.handle({ method: "POST", path: "/submissions", query: new URLSearchParams(), headers: {}, body: b });
    expect((await post(submission("bia", "primeira").body)).status).toBe(201);
    const again = await post(submission("bia", "segunda").body);
    expect(again.status).toBe(409);
    expect(json(again).error.code).toBe("limit_reached");
    expect((await post(submission("carlos", "outra pessoa").body)).status).toBe(201);
  });

  it("submission_with_stale_key_is_rejected_without_spending_the_proof", async () => {
    const { app } = build();
    const epoch = currentEpoch(() => new Date());
    const { envelope } = seal({ newsroom: name, pubkeyVersion: 7, category: "saude", recipients: [{ id: "redacao", publicKey: keys.publicKey }], plaintext: new Uint8Array([1]) });
    const body = new TextEncoder().encode(JSON.stringify({ newsroom: name, epoch, category: "saude", hasAttachment: false, proof: { action: actionFor(name, epoch), environment: "staging", responses: [{ nullifier: nullifierOf("dani", actionFor(name, epoch)) }] }, envelope: toBase64Url(encodeEnvelope(envelope)) }));
    const r = await app.handle({ method: "POST", path: "/submissions", query: new URLSearchParams(), headers: {}, body });
    expect(r.status).toBe(409);
    expect(json(r).error).toMatchObject({ code: "stale_key_version", currentVersion: 1 });
  });

  it("the_renewal_job_runs_against_real_arkiv", async () => {
    const { renewal } = build();
    expect(await renewal.run()).toEqual([{ newsroom: name, renewed: 0 }]); // nothing expires within 60 days (retention of 150)
  });
});
