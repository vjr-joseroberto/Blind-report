/** Average time of an Arkiv block (Rabdi and local node). */
export const ARKIV_BLOCK_SECONDS = 2;

/** Maximum lifetime of an entity on the chain (measured: "maximum lifetime of 7884000 blocks"), ~182.5 days. */
export const ARKIV_MAX_LIFETIME_BLOCKS = 7_884_000;
export const ARKIV_MAX_RETENTION_SECONDS = ARKIV_MAX_LIFETIME_BLOCKS * ARKIV_BLOCK_SECONDS;
/** Margin against the block difference between creation and transaction inclusion. */
export const RETENTION_SAFETY_SECONDS = 3600;
/** Maximum retention the store accepts requesting. */
export const STORE_MAX_RETENTION_SECONDS = ARKIV_MAX_RETENTION_SECONDS - RETENTION_SAFETY_SECONDS;
/** Default annotation retention (150 days). */
export const DEFAULT_ANNOTATION_RETENTION_SECONDS = 150 * 24 * 3600;

/** States of a tip. The envelope is immutable: state changes through annotation entities. */
export const STATUSES = ["new", "review", "verified", "discarded"] as const;
export type Status = (typeof STATUSES)[number];

export type EntityKind = "denuncia" | "resposta" | "anotacao";
export type AttrType = "str" | "u64";

/** Only attributes allowed per type. None identifies the source. `authorName` is only a claim: what counts is the entity's `creator`, defined by the chain. */
export const KIND_ATTRS: Record<EntityKind, Record<string, AttrType>> = {
  denuncia: { newsroom: "str", category: "str", status: "str", epoch: "u64", contentHash: "str", pubkeyVersion: "u64", part: "u64", parts: "u64" },
  resposta: { newsroom: "str", mailboxId: "str", authorName: "str" },
  anotacao: { newsroom: "str", denunciaKey: "str", status: "str", byJournalist: "str", authorName: "str" },
};
