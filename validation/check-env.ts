// Checks .env WITHOUT printing secrets: format, consistency, Arkiv and World access, balances.
import { createPublicClient, formatEther, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { createPolicy, guardedFetch } from "@safe-whistle/network-policy";
import { readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ENV_PATH = new URL("../.env", import.meta.url).pathname;
const env: Record<string, string> = {};
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

let fails = 0;
const row = (ok: boolean | null, what: string, detail = "") => {
  if (ok === false) fails++;
  console.log(`${ok === null ? "INFO" : ok ? "OK  " : "FAIL"}  ${what}${detail ? "  — " + detail : ""}`);
};

// 1) file
const mode = (statSync(ENV_PATH).mode & 0o777).toString(8);
row(mode === "600", ".env with 600 permission", `current: ${mode}`);
let ignored = false;
try { execFileSync("git", ["check-ignore", "-q", ".env"], { cwd: new URL("..", import.meta.url).pathname }); ignored = true; } catch { /* not ignored */ }
row(ignored, ".env is in .gitignore");

// 2) wallets
for (const n of ["OWNER", "RELAYER", "JOURNALIST"]) {
  const key = env[`${n}_PRIVATE_KEY`] ?? "";
  const okFormat = /^0x[0-9a-fA-F]{64}$/.test(key);
  row(okFormat, `${n}_PRIVATE_KEY in the 0x + 64 hex format`);
  if (okFormat) row(privateKeyToAccount(key as `0x${string}`).address.toLowerCase() === (env[`${n}_ADDRESS`] ?? "").toLowerCase(), `${n}_ADDRESS matches the key`);
}

// 3) World ID
const appId = env.WORLD_APP_ID ?? "", rpId = env.WORLD_RP_ID ?? "", sk = (env.RP_SIGNING_KEY ?? "").replace(/^0x/, "");
row(/^app_[A-Za-z0-9]+$/.test(appId), "WORLD_APP_ID in the app_… format", appId ? `value: ${appId}` : "empty");
row(/^rp_[A-Za-z0-9]+$/.test(rpId), "WORLD_RP_ID in the rp_… format", rpId ? `value: ${rpId}` : "empty");
const skOk = /^[0-9a-fA-F]{64}$/.test(sk);
row(skOk, "RP_SIGNING_KEY is a 32-byte hex string (private key)", sk ? `${sk.length} characters` : "empty");
if (skOk) {
  try {
    const sig = signRequest({ signingKeyHex: sk, action: "submit:teste.eth:202611" });
    row(!!sig.sig && sig.expiresAt > sig.createdAt, "RP signature generated with the key (signRequest)", `ttl ${sig.expiresAt - sig.createdAt}s`);
  } catch (e) { row(false, "RP signature generated with the key", (e as Error).message.slice(0, 80)); }
}
row(env.WORLD_ENVIRONMENT === "staging", "WORLD_ENVIRONMENT=staging (simulator)", `value: ${env.WORLD_ENVIRONMENT ?? "empty"}`);

const hosts = ["developer.world.org", "rpc.rabdi.db-chain.testnet.arkiv.network", new URL(env.SEPOLIA_RPC_URL ?? "https://x.invalid").hostname];
const f = guardedFetch(createPolicy({ hosts: hosts.filter((h) => h !== "x.invalid") }));
if (rpId) {
  try {
    const res = await f(`https://developer.world.org/api/v4/verify/${rpId}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocol_version: "4.0", nonce: "0x1", action: "submit:teste.eth:202611", environment: env.WORLD_ENVIRONMENT ?? "staging",
        responses: [{ identifier: "proof_of_human", signal_hash: "0x0", proof: ["0x1", "0x2", "0x3", "0x4", "0x5"], nullifier: "0x1", issuer_schema_id: 1, expires_at_min: 0 }] }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { code?: string; detail?: string };
    const code = body.code ?? String(res.status);
    const reconhecido = !["app_not_migrated", "invalid_request", "not_found", "app_not_found"].includes(code);
    row(reconhecido, "verification API recognizes the rp_id", `HTTP ${res.status}, code: ${code}${body.detail ? " — " + body.detail.slice(0, 90) : ""}`);
  } catch (e) { row(false, "verification API reachable", (e as Error).message.slice(0, 80)); }
}

// 4) Arkiv
const key = env.ARKIV_ACCESS_KEY ?? "";
row(key.length > 0, "ARKIV_ACCESS_KEY filled in", key ? `${key.length} characters` : "empty");
if (key) {
  const url = env.ARKIV_RPC_URL ?? "";
  const rpc = (headers: Record<string, string>, u = url) => f(u, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(15000) }).then((r) => r.json() as Promise<{ result?: string; error?: { message?: string } }>);
  try {
    const viaHeader = await rpc({ "X-API-KEY": key });
    row(viaHeader.result === "0x76edaf", "Rabdi RPC responds with the key (X-API-KEY header)", viaHeader.result ?? viaHeader.error?.message ?? "no response");
  } catch (e) { row(false, "Rabdi RPC with the key (header)", (e as Error).message.slice(0, 80)); }
}

// 5) balances
const sepolia = createPublicClient({ transport: http(env.SEPOLIA_RPC_URL) });
const rabdi = createPublicClient({ transport: http(env.ARKIV_RPC_URL) });
for (const n of ["OWNER", "RELAYER", "JOURNALIST"]) {
  const a = env[`${n}_ADDRESS`] as `0x${string}`;
  if (!isHex(a)) continue;
  const [e, g] = await Promise.all([sepolia.getBalance({ address: a }).catch(() => null), rabdi.getBalance({ address: a }).catch(() => null)]);
  row(null, `balance ${n}`, `Sepolia ETH ${e === null ? "?" : formatEther(e)} | Rabdi tGLM ${g === null ? "?" : formatEther(g)}`);
}
console.log(fails === 0 ? "\nALL OK" : `\n${fails} PROBLEM(S)`);
process.exit(fails ? 1 : 0);
