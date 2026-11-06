// V-01 — Arkiv na Rabdi (REAL): custo por tamanho, limite de bytes, expiração e custódia. Gasta tGLM de teste.
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { eq } from "@arkiv-network/sdk/query";
import { formatEther, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "node:fs";
import { loadEnv } from "./lib/env.ts";

const env = loadEnv();
const chain = rabdi({ accessKey: env.ARKIV_ACCESS_KEY ?? "" });
const transport = http();
const pub = createPublicClient({ chain, transport });
const mk = (k: string) => createWalletClient({ chain, transport, account: privateKeyToAccount(k as Hex) });
const relayer = mk(env.RELAYER_PRIVATE_KEY!);
const owner = mk(env.OWNER_PRIVATE_KEY!);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const Denuncia = defineSchema("sw-validation.denuncia", {
  newsroom: str().indexed(), status: str().indexed(), epoch: u64().indexed(), envelope: bytes(),
});
const RUN = Date.now().toString(36);
const values = (tag: string, n: number) => ({ newsroom: `v01-${RUN}-${tag}.jornal.eth`, status: "new", epoch: u64(202611n), envelope: new Uint8Array(n).fill(7) });
const bal = (w: typeof relayer) => pub.getBalance({ address: w.account!.address });
const attempt = async <T>(fn: () => Promise<T>) => { try { return { ok: true as const, value: await fn() }; } catch (e) { return { ok: false as const, error: String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).split("\n")[0]!.slice(0, 90) }; } };

const report: Record<string, unknown> = {};
const chainId = await pub.getChainId();
const block0 = await pub.getBlockNumber();
const gasPrice = BigInt((await (pub as unknown as { request(a: { method: string }): Promise<string> }).request({ method: "eth_gasPrice" })));
console.log(`chain ${chainId}, bloco ${block0}, gasPrice ${gasPrice} wei`);
report.rede = { chainId, gasPriceWei: gasPrice.toString() };

// 1) custo por tamanho (orçamento: para se o saldo cair abaixo de 2 tGLM)
const sizes: [string, number][] = [["1 KiB", 1024], ["16 KiB", 16 * 1024], ["64 KiB", 64 * 1024], ["120 KiB", 120 * 1024], ["~126 KiB", 128_960], ["128 KiB exatos", 131_072]];
const costRows: { tamanho: string; resultado: string; custoTGLM?: string }[] = [];
for (const [label, n] of sizes) {
  const before = await bal(relayer);
  if (before < 2n * 10n ** 18n) { costRows.push({ tamanho: label, resultado: "PULADO (orçamento)" }); continue; }
  const r = await attempt(() => relayer.createEntity(Denuncia, values(label.replace(/\W/g, ""), n), { expiration: ExpirationTime.fromHours(1) }));
  const after = await bal(relayer);
  costRows.push({ tamanho: label, resultado: r.ok ? "aceito" : `RECUSADO (${r.error})`, custoTGLM: formatEther(before - after) });
  console.log(`${label}: ${r.ok ? "aceito" : "recusado"}  custo=${formatEther(before - after)} tGLM`);
}
report.custoPorTamanho = costRows;
const over = await attempt(() => relayer.createEntity(Denuncia, values("over", 131_073), { expiration: ExpirationTime.fromHours(1) }));
report.acimaDoLimiteDoSdk = over.ok ? "ACEITO (inesperado)" : over.error;

// 2) consulta por filtro
const q = await pub.select({ $key: true, $creator: true }).from(Denuncia).where(eq("newsroom", values("1KiB", 1).newsroom)).fetch();
report.consultaPorFiltro = { encontradas: q.entities.length };

// 3) expiração curta
const short = await relayer.createEntity(Denuncia, values("exp", 10), { expiration: ExpirationTime.fromSeconds(30) });
const exists = async () => (await pub.select({ $key: true }).from(Denuncia).where(eq("newsroom", values("exp", 1).newsroom)).fetch()).entities.length;
const before = await exists();
console.log("aguardando 45s para a entidade de 30s expirar...");
await sleep(45_000);
report.expiracao = { antes: before, depois: await exists(), expiresAtBloco: String(short.expiresAt) };

// 4) custódia: readonly + permissionlessExtension, transferência à redação (OWNER)
const costOf = async (w: typeof relayer, fn: () => Promise<unknown>) => { const b = await bal(w); const r = await attempt(fn); const a = await bal(w); return { ...r, custo: formatEther(b - a) }; };
const c = await relayer.createEntity(Denuncia, values("custodia", 2048), { expiration: ExpirationTime.fromHours(1), flags: { readonly: true, permissionlessExtension: true } });
const t1 = await costOf(relayer, () => relayer.changeOwnership({ entityKey: c.entityKey, newOwner: owner.account!.address }));
const t2 = await costOf(relayer, () => relayer.extendEntity({ entityKey: c.entityKey, expiration: ExpirationTime.fromHours(2) }));
const t3 = await costOf(relayer, () => relayer.deleteEntity({ entityKey: c.entityKey }));
const t4 = await costOf(owner, () => owner.extendEntity({ entityKey: c.entityKey, expiration: ExpirationTime.fromHours(3) }));
const t5 = await costOf(owner, () => owner.patchEntity(Denuncia, c.entityKey, { set: { status: "review" } }));
const rows = (x: { ok: boolean; custo: string } & { error?: string }) => (x.ok ? `permitido (custo ${x.custo} tGLM)` : `RECUSADO (${x.error})`);
report.custodia = { transferirParaRedacao: rows(t1), relayerEstendeSemSerDono: rows(t2), relayerApaga: rows(t3), redacaoEstende: rows(t4), redacaoAlteraConteudo: rows(t5) };
const final = await pub.select({ $owner: true, $creator: true }).from(Denuncia).ownedBy(owner.account!.address).fetch();
const first = final.entities[0] as { $owner?: string; $creator?: string } | undefined;
report.donoECriador = { owner: first?.$owner === owner.account!.address ? "redação" : String(first?.$owner), creator: String(first?.$creator).toLowerCase() === relayer.account!.address.toLowerCase() ? "relayer" : String(first?.$creator) };

report.saldosFinais = { relayerTGLM: formatEther(await bal(relayer)), ownerTGLM: formatEther(await bal(owner)) };
writeFileSync(new URL("./out/v01.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
