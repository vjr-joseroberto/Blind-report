/** Tempo médio de um bloco do Arkiv (Rabdi e nó local). */
export const ARKIV_BLOCK_SECONDS = 2;

/** Vida máxima de uma entidade na cadeia (medida: "maximum lifetime of 7884000 blocks"), ~182,5 dias. */
export const ARKIV_MAX_LIFETIME_BLOCKS = 7_884_000;
export const ARKIV_MAX_RETENTION_SECONDS = ARKIV_MAX_LIFETIME_BLOCKS * ARKIV_BLOCK_SECONDS;
/** Folga contra a diferença de bloco entre a criação e a inclusão da transação. */
export const RETENTION_SAFETY_SECONDS = 3600;
/** Maior retenção que a loja aceita pedir. */
export const STORE_MAX_RETENTION_SECONDS = ARKIV_MAX_RETENTION_SECONDS - RETENTION_SAFETY_SECONDS;
/** Retenção padrão das anotações (150 dias). */
export const DEFAULT_ANNOTATION_RETENTION_SECONDS = 150 * 24 * 3600;

/** Estados de uma denúncia. O envelope é imutável: o estado muda por entidades de anotação. */
export const STATUSES = ["new", "review", "verified", "discarded"] as const;
export type Status = (typeof STATUSES)[number];

export type EntityKind = "denuncia" | "resposta" | "anotacao";
export type AttrType = "str" | "u64";

/** Únicos atributos permitidos por tipo. Nenhum identifica a fonte. `authorName` é só uma declaração: quem vale é o `creator` da entidade, definido pela cadeia. */
export const KIND_ATTRS: Record<EntityKind, Record<string, AttrType>> = {
  denuncia: { newsroom: "str", category: "str", status: "str", epoch: "u64", contentHash: "str", pubkeyVersion: "u64", part: "u64", parts: "u64" },
  resposta: { newsroom: "str", mailboxId: "str", authorName: "str" },
  anotacao: { newsroom: "str", denunciaKey: "str", status: "str", byJournalist: "str", authorName: "str" },
};
