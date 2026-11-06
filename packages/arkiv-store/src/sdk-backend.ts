import { ExpirationTime } from "@arkiv-network/sdk";
import { and, eq } from "@arkiv-network/sdk/query";
import { bytes, defineSchema, key as keyValue, str, u64 } from "@arkiv-network/sdk/schema";
import { bytesToHex, hexToBytes, type Address, type Hex } from "viem";
import type { AttrValue, Attrs, Backend, EntityRow } from "./backend.ts";
import { ARKIV_BLOCK_SECONDS, KIND_ATTRS, type EntityKind } from "./constants.ts";

// Schemas in Arkiv. Indexed attributes are the only ones the query can filter on.
const SCHEMAS = {
  denuncia: defineSchema("safe-whistle.denuncia", {
    newsroom: str().indexed(), category: str().indexed(), status: str().indexed(), epoch: u64().indexed(), contentHash: str().indexed(),
    pubkeyVersion: u64(), part: u64(), parts: u64(), envelope: bytes(),
  }),
  resposta: defineSchema("safe-whistle.resposta", { newsroom: str().indexed(), mailboxId: str().indexed(), authorName: str().optional(), sealed: bytes() }),
  anotacao: defineSchema("safe-whistle.anotacao", { newsroom: str().indexed(), denunciaKey: str().indexed(), status: str().indexed(), byJournalist: str().indexed(), authorName: str().optional(), note: bytes() }),
} as const;

const DATA_COLUMN: Record<EntityKind, string> = { denuncia: "envelope", resposta: "sealed", anotacao: "note" };

// The SDK is strongly typed per schema; here access is dynamic per kind, so we use a narrow contract.
type SdkPublic = { select: (...a: unknown[]) => any; getBlockTiming: () => Promise<{ currentBlock: bigint; blockDuration: number }> };
type SdkWallet = {
  account?: { address: Address };
  createEntity: (schema: unknown, values: unknown, options: unknown) => Promise<{ entityKey: Hex }>;
  changeOwnership: (a: { entityKey: Hex; newOwner: Address }) => Promise<unknown>;
  extendEntity: (a: { entityKey: Hex; expiration: unknown }) => Promise<unknown>;
};

const unwrap = (v: unknown): unknown => (v !== null && typeof v === "object" && "value" in (v as object) ? (v as { value: unknown }).value : v);

function toColumnValue(type: "str" | "u64", v: AttrValue): unknown {
  if (type === "u64") return u64(BigInt(v as bigint | string));
  return String(v);
}

function toRow(kind: EntityKind, raw: Record<string, unknown>): EntityRow {
  const attrs: Attrs = {};
  for (const [name, type] of Object.entries(KIND_ATTRS[kind])) {
    const v = unwrap(raw[name]);
    if (v !== undefined && v !== null) attrs[name] = type === "u64" ? BigInt(v as bigint | string) : String(v);
  }
  return {
    key: raw.$key as Hex, kind, owner: unwrap(raw.$owner) as Address, creator: unwrap(raw.$creator) as Address,
    createdAtBlock: BigInt(unwrap(raw.$createdAt) as bigint), expiresAtBlock: BigInt(unwrap(raw.$expiresAt) as bigint),
    attrs, data: hexToBytes(unwrap(raw[DATA_COLUMN[kind]]) as Hex),
  };
}

/** Real backend on the Arkiv SDK (Rabdi testnet or local node). */
export function createSdkBackend(clients: { publicClient: unknown; walletClient: unknown }): Backend {
  const pub = clients.publicClient as SdkPublic;
  const wallet = clients.walletClient as SdkWallet;
  if (!wallet.account) throw new Error("The write client needs an account.");
  const account = wallet.account.address;
  const blocks = (seconds: number) => Math.max(1, Math.ceil(seconds / ARKIV_BLOCK_SECONDS));

  const expression = (kind: EntityKind, filter: Attrs) => {
    const exprs = Object.entries(filter).map(([name, value]) => {
      const type = KIND_ATTRS[kind][name];
      if (!type) throw new Error(`Unknown attribute for ${kind}: ${name}`);
      return eq(name as never, toColumnValue(type, value) as never);
    });
    return exprs.length === 1 ? exprs[0]! : (and as (...e: unknown[]) => unknown)(...exprs);
  };

  return {
    account,
    async create(kind, attrs, data, options) {
      for (const k of Object.keys(attrs)) if (!(k in KIND_ATTRS[kind])) throw new Error(`Unknown attribute for ${kind}: ${k}`);
      const values: Record<string, unknown> = {};
      for (const [name, type] of Object.entries(KIND_ATTRS[kind])) if (attrs[name] !== undefined) values[name] = toColumnValue(type, attrs[name]!);
      values[DATA_COLUMN[kind]] = data;
      const { entityKey } = await wallet.createEntity(SCHEMAS[kind], values, {
        expiration: ExpirationTime.fromBlocks(blocks(options.expirationSeconds)),
        flags: { readonly: options.readonly, permissionlessExtension: options.permissionlessExtension },
      });
      return { key: entityKey };
    },
    async changeOwnership(key, newOwner) {
      await wallet.changeOwnership({ entityKey: key, newOwner });
    },
    async extend(key, seconds) {
      await wallet.extendEntity({ entityKey: key, expiration: ExpirationTime.fromBlocks(blocks(seconds)) });
    },
    async get(kind, key) {
      const res = await pub.select().from(SCHEMAS[kind]).where(eq("$key" as never, keyValue(key) as never)).fetch().catch(() => null);
      const raw = res?.entities?.[0] as Record<string, unknown> | undefined;
      return raw ? toRow(kind, raw) : null;
    },
    async select(kind, filter, page) {
      if (Object.keys(filter).length === 0) throw new Error("The query requires at least one filter.");
      const res = await pub.select().from(SCHEMAS[kind]).where(expression(kind, filter)).limit(page.limit).offset(page.offset).fetch();
      return (res.entities as Record<string, unknown>[]).map((r) => toRow(kind, r));
    },
    async timing() {
      const t = await pub.getBlockTiming();
      return { currentBlock: BigInt(t.currentBlock), blockSeconds: t.blockDuration };
    },
  };
}
export { bytesToHex };
