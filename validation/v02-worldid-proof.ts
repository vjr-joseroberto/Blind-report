// V-02 — REAL World ID proof (staging environment, simulator). Requires an action from you: paste the link into the simulator.
//
// Usage:  npx tsx validation/v02-worldid-proof.ts          (3 proofs: A, B and A again)
//         npx tsx validation/v02-worldid-proof.ts --dry    (only creates the request and shows the link; does not wait)
//
// For each proof the script prints a link (connectorURI). Open https://simulator.worldcoin.org/ and paste the link.
// The script waits for confirmation, verifies it against the World API and applies the gate. At the end it compares the nullifiers.
import { IDKit, proofOfHuman } from "@worldcoin/idkit-core";
import { createPolicy, guardedFetch } from "@safe-whistle/network-policy";
import { createFileNullifierStore, createRpContextSigner, createSubmissionGate, createWorldVerifier, usedKey, type IdKitPayload } from "@safe-whistle/worldid-gate";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { loadEnv } from "./lib/env.ts";

const env = loadEnv();
const dry = process.argv.includes("--dry");
const EPOCH = 202611;
const A = "v02-a.eth";
const B = "v02-b.eth";

const signer = createRpContextSigner({ signingKeyHex: env.RP_SIGNING_KEY!, rpId: env.WORLD_RP_ID! });
const verifier = createWorldVerifier({ rpId: env.WORLD_RP_ID!, fetch: guardedFetch(createPolicy({ hosts: ["developer.world.org"] })) });
const claimsFile = new URL("./out/v02-claims.jsonl", import.meta.url).pathname;
mkdirSync(new URL("./out", import.meta.url).pathname, { recursive: true });
rmSync(claimsFile, { force: true });
const gate = createSubmissionGate({ expectedEnvironment: "staging", verifier, store: createFileNullifierStore(claimsFile) });

const short = (n: string) => createHash("sha256").update(n).digest("hex").slice(0, 12);

async function getProof(label: string, newsroom: string): Promise<IdKitPayload | null> {
  const action = `submit:${newsroom}:${EPOCH}`;
  const request = await IDKit.request({
    app_id: env.WORLD_APP_ID as `app_${string}`,
    action,
    rp_context: signer.rpContextFor({ newsroom, epoch: EPOCH }) as never,
    allow_legacy_proofs: false,
    environment: "staging",
  }).preset(proofOfHuman());
  console.log(`\n[${label}] action: ${action}\nLink for the simulator:\n${request.connectorURI}\n`);
  if (dry) return null;
  console.log("Waiting for confirmation in the simulator (up to 10 min)...");
  const done = await request.pollUntilCompletion({ timeout: 10 * 60 * 1000 });
  if (!done.success) {
    console.log(`[${label}] failed: ${String(done.error)}`);
    return null;
  }
  return done.result as unknown as IdKitPayload;
}

const out: Record<string, unknown> = { epoca: EPOCH, ambiente: "staging" };
const nullifiers: Record<string, string> = {};

for (const [label, newsroom] of [["A1", A], ["B1", B], ["A2", A]] as const) {
  const proof = await getProof(label, newsroom);
  if (!proof) {
    if (dry) break;
    out[label] = "no proof";
    continue;
  }
  const nullifier = String(proof.responses?.[0]?.nullifier);
  nullifiers[label] = nullifier;
  const r = await gate.admit({ newsroom, epoch: EPOCH, payload: proof });
  out[label] = r.ok ? "ACCEPTED" : `REJECTED (${r.code}): ${r.message}`;
  console.log(`[${label}] gate: ${out[label]}  | identifier (short hash): ${short(nullifier)}`);
}

if (!dry) {
  out.nullifierAIgualA2 = nullifiers.A1 !== undefined && nullifiers.A1 === nullifiers.A2;
  out.nullifierADiferenteDeB = nullifiers.A1 !== undefined && nullifiers.B1 !== undefined && nullifiers.A1 !== nullifiers.B1;
  out.chaveArmazenadaA1 = nullifiers.A1 ? usedKey(nullifiers.A1, `submit:${A}:${EPOCH}`).slice(0, 12) + "…" : null;
  console.log("\nSummary:", JSON.stringify(out, null, 2));
  console.log("\nExpected: A1 ACCEPTED; B1 ACCEPTED; A2 REJECTED (limit_reached); A1's nullifier equal to A2's; different from B1's.");
  writeFileSync(new URL("./out/v02.json", import.meta.url), JSON.stringify(out, null, 2));
}
process.exit(0);
