// V-02 — Prova REAL do World ID (ambiente staging, simulador). Exige uma ação sua: colar o link no simulador.
//
// Uso:  npx tsx validation/v02-worldid-proof.ts          (3 provas: A, B e A de novo)
//       npx tsx validation/v02-worldid-proof.ts --dry    (só cria o pedido e mostra o link; não espera)
//
// Para cada prova o script imprime um link (connectorURI). Abra https://simulator.worldcoin.org/ e cole o link.
// O script espera a confirmação, verifica na API do World e aplica o portão. Ao final compara os nullifiers.
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
  console.log(`\n[${label}] ação: ${action}\nLink para o simulador:\n${request.connectorURI}\n`);
  if (dry) return null;
  console.log("Aguardando a confirmação no simulador (até 10 min)...");
  const done = await request.pollUntilCompletion({ timeout: 10 * 60 * 1000 });
  if (!done.success) {
    console.log(`[${label}] falhou: ${String(done.error)}`);
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
    out[label] = "sem prova";
    continue;
  }
  const nullifier = String(proof.responses?.[0]?.nullifier);
  nullifiers[label] = nullifier;
  const r = await gate.admit({ newsroom, epoch: EPOCH, payload: proof });
  out[label] = r.ok ? "ACEITO" : `RECUSADO (${r.code}): ${r.message}`;
  console.log(`[${label}] portão: ${out[label]}  | identificador (hash curto): ${short(nullifier)}`);
}

if (!dry) {
  out.nullifierAIgualA2 = nullifiers.A1 !== undefined && nullifiers.A1 === nullifiers.A2;
  out.nullifierADiferenteDeB = nullifiers.A1 !== undefined && nullifiers.B1 !== undefined && nullifiers.A1 !== nullifiers.B1;
  out.chaveArmazenadaA1 = nullifiers.A1 ? usedKey(nullifiers.A1, `submit:${A}:${EPOCH}`).slice(0, 12) + "…" : null;
  console.log("\nResumo:", JSON.stringify(out, null, 2));
  console.log("\nEsperado: A1 ACEITO; B1 ACEITO; A2 RECUSADO (limit_reached); nullifier de A1 igual ao de A2; diferente do de B1.");
  writeFileSync(new URL("./out/v02.json", import.meta.url), JSON.stringify(out, null, 2));
}
process.exit(0);
