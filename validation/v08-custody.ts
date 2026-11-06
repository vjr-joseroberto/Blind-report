// V-08 — Redação como custodiante: o que acontece depois do changeOwnership? (nó Arkiv local)
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { localhost } from "@arkiv-network/sdk/chains";
import { addr, bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const RPC = process.env.ARKIV_LOCAL_RPC ?? "http://127.0.0.1:8546";
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex; // conta pré-financiada do nó dev
void addr;

const Denuncia = defineSchema("sw-validation.denuncia", {
  newsroom: str().indexed(),
  status: str().indexed(),
  epoch: u64().indexed(),
  envelope: bytes(),
});

const transport = http(RPC);
const pub = createPublicClient({ chain: localhost, transport });
const wallet = (k: Hex) => createWalletClient({ chain: localhost, transport, account: privateKeyToAccount(k) });
const funder = wallet(FUNDER);
const relayer = wallet(generatePrivateKey());
const newsroom = wallet(generatePrivateKey());
const stranger = wallet(generatePrivateKey());

for (const w of [relayer, newsroom, stranger]) {
  await pub.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: w.account!.address, value: 10n ** 18n }) });
}

const RUN = Date.now().toString(36);
const values = (tag: string) => ({ newsroom: `v08-${RUN}-${tag}.jornal.eth`, status: "new", epoch: u64(202611n), envelope: new Uint8Array([1, 2, 3]) });
const attempt = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return "PERMITIDO";
  } catch (e) {
    return "RECUSADO (" + String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).split("\n")[0]!.slice(0, 80) + ")";
  }
};

const rows: [string, string][] = [];

// Caso A: readonly, sem extensão livre
const a = await relayer.createEntity(Denuncia, values("a"), { expiration: ExpirationTime.fromDays(1), flags: { readonly: true } });
rows.push(["A1: o relayer (criador) estende ANTES de transferir", await attempt(() => relayer.extendEntity({ entityKey: a.entityKey, expiration: ExpirationTime.fromDays(2) }))]);
await relayer.changeOwnership({ entityKey: a.entityKey, newOwner: newsroom.account!.address });
rows.push(["A2: o relayer apaga DEPOIS de transferir", await attempt(() => relayer.deleteEntity({ entityKey: a.entityKey }))]);
rows.push(["A3: o relayer estende DEPOIS de transferir", await attempt(() => relayer.extendEntity({ entityKey: a.entityKey, expiration: ExpirationTime.fromDays(3) }))]);
rows.push(["A4: um terceiro estende", await attempt(() => stranger.extendEntity({ entityKey: a.entityKey, expiration: ExpirationTime.fromDays(3) }))]);
rows.push(["A5: a redação (nova dona) estende", await attempt(() => newsroom.extendEntity({ entityKey: a.entityKey, expiration: ExpirationTime.fromDays(4) }))]);
rows.push(["A6: a redação altera o conteúdo (readonly)", await attempt(() => newsroom.patchEntity(Denuncia, a.entityKey, { set: { status: "review" } }))]);
rows.push(["A7: a redação devolve a propriedade a outra conta", await attempt(() => newsroom.changeOwnership({ entityKey: a.entityKey, newOwner: stranger.account!.address }))]);

// Caso B: readonly + permissionlessExtension (qualquer conta pode estender; ótimo para o job de retenção)
const b = await relayer.createEntity(Denuncia, values("b"), { expiration: ExpirationTime.fromDays(1), flags: { readonly: true, permissionlessExtension: true } });
await relayer.changeOwnership({ entityKey: b.entityKey, newOwner: newsroom.account!.address });
rows.push(["B1: o relayer (não dono) estende com permissionlessExtension", await attempt(() => relayer.extendEntity({ entityKey: b.entityKey, expiration: ExpirationTime.fromDays(5) }))]);
rows.push(["B2: o relayer apaga (não dono)", await attempt(() => relayer.deleteEntity({ entityKey: b.entityKey }))]);
rows.push(["B3: um terceiro estende", await attempt(() => stranger.extendEntity({ entityKey: b.entityKey, expiration: ExpirationTime.fromDays(6) }))]);
rows.push(["B4: a redação apaga", await attempt(() => newsroom.deleteEntity({ entityKey: b.entityKey }))]);

// Caso C: consulta — quem aparece como dono e criador depois da transferência?
const c = await relayer.createEntity(Denuncia, values("c"), { expiration: ExpirationTime.fromDays(1), flags: { readonly: true } });
await relayer.changeOwnership({ entityKey: c.entityKey, newOwner: newsroom.account!.address });
const after = await pub.select({ $key: true, $owner: true, $creator: true }).from(Denuncia).ownedBy(newsroom.account!.address).fetch();
const first = after.entities.find((e) => (e as { $key?: string }).$key === c.entityKey) as { $owner?: string; $creator?: string } | undefined;
rows.push(["C1: $owner depois da transferência é a redação", String(first?.$owner).toLowerCase() === newsroom.account!.address.toLowerCase() ? "SIM" : `NÃO (${first?.$owner})`]);
rows.push(["C2: $creator continua sendo o relayer", String(first?.$creator).toLowerCase() === relayer.account!.address.toLowerCase() ? "SIM" : `NÃO (${first?.$creator})`]);

console.log("| Verificação | Resultado |\n|---|---|");
for (const [k, v] of rows) console.log(`| ${k} | ${v} |`);
