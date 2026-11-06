// V-06 — Limites e estabilidade de RPCs públicos comuns (tráfego comum, sem anonimato).
// Usa a política de rede do projeto: só os hosts listados abaixo podem ser contatados.
import { createPolicy, guardedFetch } from "@safe-whistle/network-policy";

const CANDIDATES: { name: string; url: string }[] = [
  { name: "publicnode (Sepolia)", url: "https://ethereum-sepolia-rpc.publicnode.com" },
  { name: "drpc (Sepolia)", url: "https://sepolia.drpc.org" },
  { name: "1rpc (Sepolia)", url: "https://1rpc.io/sepolia" },
  { name: "tenderly gateway (Sepolia)", url: "https://sepolia.gateway.tenderly.co" },
  { name: "rpc.sepolia.org", url: "https://rpc.sepolia.org" },
  { name: "Arkiv Rabdi (público, sem chave)", url: "https://rpc.rabdi.db-chain.testnet.arkiv.network" },
];

const policy = createPolicy({ hosts: CANDIDATES.map((c) => new URL(c.url).hostname) });
const f = guardedFetch(policy);

async function call(url: string, method = "eth_blockNumber"): Promise<{ ok: boolean; ms: number; status: number; note?: string }> {
  const start = performance.now();
  try {
    const res = await f(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: { message?: string } };
    return { ok: res.ok && body.result !== undefined, ms: performance.now() - start, status: res.status, note: body.error?.message };
  } catch (e) {
    return { ok: false, ms: performance.now() - start, status: 0, note: String((e as Error).message).slice(0, 60) };
  }
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? NaN;

console.log("| RPC | seq. 20: ok | p50 ms | p95 ms | rajada 40 paralelas: ok | erros (amostra) |");
console.log("|---|---|---|---|---|---|");
for (const c of CANDIDATES) {
  const seq: Awaited<ReturnType<typeof call>>[] = [];
  for (let i = 0; i < 20; i++) seq.push(await call(c.url));
  const burst = await Promise.all(Array.from({ length: 40 }, () => call(c.url)));
  const ok = seq.filter((r) => r.ok);
  const errors = [...new Set([...seq, ...burst].filter((r) => !r.ok).map((r) => `${r.status} ${r.note ?? ""}`.trim()))].slice(0, 2).join("; ") || "—";
  console.log(`| ${c.name} | ${ok.length}/20 | ${pct(ok.map((r) => r.ms), 0.5).toFixed(0)} | ${pct(ok.map((r) => r.ms), 0.95).toFixed(0)} | ${burst.filter((r) => r.ok).length}/40 | ${errors} |`);
}
