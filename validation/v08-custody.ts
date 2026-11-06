// V-08 — Newsroom as custodian: what happens after changeOwnership? (local Arkiv node)
import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk";
import { localhost } from "@arkiv-network/sdk/chains";
import { addr, bytes, defineSchema, str, u64 } from "@arkiv-network/sdk/schema";
import { http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const RPC = process.env.ARKIV_LOCAL_RPC ?? "http://127.0.0.1:8546";
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex; // pre-funded dev node account
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
    return "ALLOWED";
  } catch (e) {
    return "REJECTED (" + String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message).split("\n")[0]!.slice(0, 80) + ")";
  }
};

const rows: [string, string][] = [];

// Case A: readonly, no free extension
const a = await relayer.createEntity(Denuncia, values("a"), { expiration: ExpirationTime.fromDays(1), flags: { readonly: true } });
rows.push(["A1: the relayer (creator) extends BEFORE transferring", await attempt(() => relayer.extendEntity({ entityKey: a.entityKey, expiration: ExpirationTime.fromDays(2) }))]);
await relayer.changeOwnership({ entityKey: a.entityKey, newOwner: newsroom.account!.address });
rows.push(["A2: the relayer deletes AFTER transferring", await attempt(() => relayer.deleteEntity({ entityKey: a.entityKey }))]);
rows.push(["A3: the relayer extends AFTER transferring", await attempt(() => relayer.extendEntity({ entityKey: a.entityKey, expiration: ExpirationTime.fromDays(3) }))]);
rows.push(["A4: a third party extends", await attempt(() => stranger.extendEntity({ entityKey: a.entityKey, expiration: ExpirationTime.fromDays(3) }))]);
rows.push(["A5: the newsroom (new owner) extends", await attempt(() => newsroom.extendEntity({ entityKey: a.entityKey, expiration: ExpirationTime.fromDays(4) }))]);
rows.push(["A6: the newsroom changes the content (readonly)", await attempt(() => newsroom.patchEntity(Denuncia, a.entityKey, { set: { status: "review" } }))]);
rows.push(["A7: the newsroom hands ownership to another account", await attempt(() => newsroom.changeOwnership({ entityKey: a.entityKey, newOwner: stranger.account!.address }))]);

// Case B: readonly + permissionlessExtension (any account can extend; great for the retention job)
const b = await relayer.createEntity(Denuncia, values("b"), { expiration: ExpirationTime.fromDays(1), flags: { readonly: true, permissionlessExtension: true } });
await relayer.changeOwnership({ entityKey: b.entityKey, newOwner: newsroom.account!.address });
rows.push(["B1: the relayer (non-owner) extends with permissionlessExtension", await attempt(() => relayer.extendEntity({ entityKey: b.entityKey, expiration: ExpirationTime.fromDays(5) }))]);
rows.push(["B2: the relayer deletes (non-owner)", await attempt(() => relayer.deleteEntity({ entityKey: b.entityKey }))]);
rows.push(["B3: a third party extends", await attempt(() => stranger.extendEntity({ entityKey: b.entityKey, expiration: ExpirationTime.fromDays(6) }))]);
rows.push(["B4: the newsroom deletes", await attempt(() => newsroom.deleteEntity({ entityKey: b.entityKey }))]);

// Case C: query — who appears as owner and creator after the transfer?
const c = await relayer.createEntity(Denuncia, values("c"), { expiration: ExpirationTime.fromDays(1), flags: { readonly: true } });
await relayer.changeOwnership({ entityKey: c.entityKey, newOwner: newsroom.account!.address });
const after = await pub.select({ $key: true, $owner: true, $creator: true }).from(Denuncia).ownedBy(newsroom.account!.address).fetch();
const first = after.entities.find((e) => (e as { $key?: string }).$key === c.entityKey) as { $owner?: string; $creator?: string } | undefined;
rows.push(["C1: $owner after the transfer is the newsroom", String(first?.$owner).toLowerCase() === newsroom.account!.address.toLowerCase() ? "YES" : `NO (${first?.$owner})`]);
rows.push(["C2: $creator is still the relayer", String(first?.$creator).toLowerCase() === relayer.account!.address.toLowerCase() ? "YES" : `NO (${first?.$creator})`]);

console.log("| Check | Result |\n|---|---|");
for (const [k, v] of rows) console.log(`| ${k} | ${v} |`);
