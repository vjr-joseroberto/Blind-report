// Verifica o .env SEM imprimir segredos: formato, coerência, acesso ao Arkiv e ao World, saldos.
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
  console.log(`${ok === null ? "INFO" : ok ? "OK  " : "FALHA"}  ${what}${detail ? "  — " + detail : ""}`);
};

// 1) arquivo
const mode = (statSync(ENV_PATH).mode & 0o777).toString(8);
row(mode === "600", ".env com permissão 600", `atual: ${mode}`);
let ignored = false;
try { execFileSync("git", ["check-ignore", "-q", ".env"], { cwd: new URL("..", import.meta.url).pathname }); ignored = true; } catch { /* não ignorado */ }
row(ignored, ".env está no .gitignore");

// 2) carteiras
for (const n of ["OWNER", "RELAYER", "JOURNALIST"]) {
  const key = env[`${n}_PRIVATE_KEY`] ?? "";
  const okFormat = /^0x[0-9a-fA-F]{64}$/.test(key);
  row(okFormat, `${n}_PRIVATE_KEY no formato 0x + 64 hex`);
  if (okFormat) row(privateKeyToAccount(key as `0x${string}`).address.toLowerCase() === (env[`${n}_ADDRESS`] ?? "").toLowerCase(), `${n}_ADDRESS corresponde à chave`);
}

// 3) World ID
const appId = env.WORLD_APP_ID ?? "", rpId = env.WORLD_RP_ID ?? "", sk = (env.RP_SIGNING_KEY ?? "").replace(/^0x/, "");
row(/^app_[A-Za-z0-9]+$/.test(appId), "WORLD_APP_ID no formato app_…", appId ? `valor: ${appId}` : "vazio");
row(/^rp_[A-Za-z0-9]+$/.test(rpId), "WORLD_RP_ID no formato rp_…", rpId ? `valor: ${rpId}` : "vazio");
const skOk = /^[0-9a-fA-F]{64}$/.test(sk);
row(skOk, "RP_SIGNING_KEY é um hexadecimal de 32 bytes (chave privada)", sk ? `${sk.length} caracteres` : "vazio");
if (skOk) {
  try {
    const sig = signRequest({ signingKeyHex: sk, action: "submit:teste.eth:202611" });
    row(!!sig.sig && sig.expiresAt > sig.createdAt, "assinatura RP gerada com a chave (signRequest)", `ttl ${sig.expiresAt - sig.createdAt}s`);
  } catch (e) { row(false, "assinatura RP gerada com a chave", (e as Error).message.slice(0, 80)); }
}
row(env.WORLD_ENVIRONMENT === "staging", "WORLD_ENVIRONMENT=staging (simulador)", `valor: ${env.WORLD_ENVIRONMENT ?? "vazio"}`);

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
    row(reconhecido, "API de verificação reconhece o rp_id", `HTTP ${res.status}, código: ${code}${body.detail ? " — " + body.detail.slice(0, 90) : ""}`);
  } catch (e) { row(false, "API de verificação alcançável", (e as Error).message.slice(0, 80)); }
}

// 4) Arkiv
const key = env.ARKIV_ACCESS_KEY ?? "";
row(key.length > 0, "ARKIV_ACCESS_KEY preenchida", key ? `${key.length} caracteres` : "vazia");
if (key) {
  const url = env.ARKIV_RPC_URL ?? "";
  const rpc = (headers: Record<string, string>, u = url) => f(u, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(15000) }).then((r) => r.json() as Promise<{ result?: string; error?: { message?: string } }>);
  try {
    const viaHeader = await rpc({ "X-API-KEY": key });
    row(viaHeader.result === "0x76edaf", "RPC da Rabdi responde com a chave (cabeçalho X-API-KEY)", viaHeader.result ?? viaHeader.error?.message ?? "sem resposta");
  } catch (e) { row(false, "RPC da Rabdi com a chave (cabeçalho)", (e as Error).message.slice(0, 80)); }
}

// 5) saldos
const sepolia = createPublicClient({ transport: http(env.SEPOLIA_RPC_URL) });
const rabdi = createPublicClient({ transport: http(env.ARKIV_RPC_URL) });
for (const n of ["OWNER", "RELAYER", "JOURNALIST"]) {
  const a = env[`${n}_ADDRESS`] as `0x${string}`;
  if (!isHex(a)) continue;
  const [e, g] = await Promise.all([sepolia.getBalance({ address: a }).catch(() => null), rabdi.getBalance({ address: a }).catch(() => null)]);
  row(null, `saldo ${n}`, `Sepolia ETH ${e === null ? "?" : formatEther(e)} | Rabdi tGLM ${g === null ? "?" : formatEther(g)}`);
}
console.log(fails === 0 ? "\nTUDO OK" : `\n${fails} PROBLEMA(S)`);
process.exit(fails ? 1 : 0);
