import { ARKIV_PRACTICAL_ENTITY_BYTES, PART_PAYLOAD_BYTES, isEpoch, isNewsroomName, joinParts, splitIntoParts, type Part } from "@safe-whistle/core";
import { isAddress, type Address, type Hex } from "viem";
import type { Backend, EntityRow } from "./backend.ts";
import { DEFAULT_ANNOTATION_RETENTION_SECONDS, STATUSES, STORE_MAX_RETENTION_SECONDS, type EntityKind, type Status } from "./constants.ts";
import { StoreError } from "./errors.ts";

const HASH_RE = /^0x[0-9a-f]{64}$/;
const CATEGORY_RE = /^[a-z0-9_-]{1,32}$/;
const PAGE = 100;

export type Submission = {
  /** Chave da primeira parte (identifica a denúncia). */
  key: Hex;
  keys: Hex[];
  contentHash: string;
  category: string;
  epoch: number;
  pubkeyVersion: number;
  parts: number;
  status: Status;
  envelope: Uint8Array;
  createdAtBlock: bigint;
  /** Menor expiração entre as partes. */
  expiresAtBlock: bigint;
};

export type Reply = { key: Hex; newsroom: string; sealed: Uint8Array; createdAtBlock: bigint; creator: Address; authorName?: string };

/** Anotação registrada no Arkiv. `creator` é definido pela cadeia; `authorName` é só uma declaração. */
export type Annotation = { key: Hex; denunciaKey: Hex; status: Status; creator: Address; authorName?: string; createdAtBlock: bigint };

/** Quem diz ter escrito uma anotação ou resposta. */
export type Author = { creator: Address; authorName?: string };
/** Decide se o autor é reconhecido pela redação (administrador ou jornalista ativo). */
export type Authorize = (author: Author) => boolean | Promise<boolean>;

const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
/** Coluna vazia (entidade sem autor declarado) conta como ausente. */
const authorNameOf = (row: EntityRow): string | undefined => (row.attrs.authorName === undefined || row.attrs.authorName === "" ? undefined : String(row.attrs.authorName));

/** Consulta a autorização uma vez por par (criador, nome) dentro de uma operação. */
function memoize(authorize: Authorize): Authorize {
  const cache = new Map<string, Promise<boolean>>();
  return (a) => {
    const k = `${a.creator.toLowerCase()}|${a.authorName ?? ""}`;
    if (!cache.has(k)) cache.set(k, Promise.resolve(authorize(a)));
    return cache.get(k)!;
  };
}

export type PublishInput = {
  newsroom: string;
  category: string;
  epoch: number;
  contentHash: string;
  pubkeyVersion: number;
  envelope: Uint8Array;
  custodian: Address;
  retentionSeconds: number;
};

const bad = (message: string) => new StoreError("input", message);
const checkRetention = (seconds: number) => {
  if (!Number.isInteger(seconds) || seconds < 1) throw bad("A retenção deve ser de ao menos 1 segundo.");
  if (seconds > STORE_MAX_RETENTION_SECONDS) throw bad(`A retenção máxima é de ${STORE_MAX_RETENTION_SECONDS} segundos (limite de vida da cadeia).`);
};
const checkAuthorName = (name: string) => {
  if (name.length > 253 || !NAME_RE.test(name)) throw bad("Nome do autor inválido (use o nome ENS completo, em minúsculas).");
};
const asNumber = (v: unknown): number => Number(v as bigint);
const asHash = (name: string, v: string) => {
  if (!HASH_RE.test(v)) throw bad(`${name} deve ser um hash 0x + 64 hexadecimais minúsculos.`);
};

export function createStore(backend: Backend) {
  async function selectAll(kind: EntityKind, filter: Record<string, string | bigint>): Promise<EntityRow[]> {
    const rows: EntityRow[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const page = await backend.select(kind, filter, { offset, limit: PAGE });
      rows.push(...page);
      if (page.length < PAGE) return rows;
    }
  }

  async function latestStatuses(newsroom: string, authorize?: Authorize): Promise<{ map: Map<string, Status>; ignored: number }> {
    const all = await selectAll("anotacao", { newsroom });
    const check = authorize ? memoize(authorize) : undefined;
    const rows: EntityRow[] = [];
    let ignored = 0;
    for (const r of all) {
      if (check && !(await check({ creator: r.creator, authorName: authorNameOf(r) }))) ignored++;
      else rows.push(r);
    }
    const latest = new Map<string, { status: Status; at: bigint; order: number }>();
    rows.forEach((r, order) => {
      const key = String(r.attrs.denunciaKey);
      const cur = latest.get(key);
      if (!cur || r.createdAtBlock > cur.at || (r.createdAtBlock === cur.at && order > cur.order)) {
        latest.set(key, { status: r.attrs.status as Status, at: r.createdAtBlock, order });
      }
    });
    return { map: new Map([...latest].map(([k, v]) => [k, v.status])), ignored };
  }

  /** Reúne as partes por hash do conteúdo; grupos incompletos são contados e omitidos. */
  async function allSubmissions(newsroom: string, category?: string, authorize?: Authorize): Promise<{ items: Submission[]; skippedIncomplete: number; ignoredAnnotations: number }> {
    const rows = await selectAll("denuncia", category ? { newsroom, category } : { newsroom });
    const groups = new Map<string, EntityRow[]>();
    for (const r of rows) {
      const g = groups.get(String(r.attrs.contentHash)) ?? [];
      g.push(r);
      groups.set(String(r.attrs.contentHash), g);
    }
    const { map: statuses, ignored: ignoredAnnotations } = await latestStatuses(newsroom, authorize);
    const items: Submission[] = [];
    let skippedIncomplete = 0;
    for (const [contentHash, group] of groups) {
      const total = asNumber(group[0]!.attrs.parts);
      let envelope: Uint8Array;
      try {
        const parts: Part[] = group.map((r) => ({ index: asNumber(r.attrs.part), total: asNumber(r.attrs.parts), data: r.data }));
        envelope = joinParts(parts);
      } catch {
        skippedIncomplete++;
        continue;
      }
      const ordered = [...group].sort((a, b) => asNumber(a.attrs.part) - asNumber(b.attrs.part));
      const first = ordered[0]!;
      items.push({
        key: first.key, keys: ordered.map((r) => r.key), contentHash, category: String(first.attrs.category), epoch: asNumber(first.attrs.epoch),
        pubkeyVersion: asNumber(first.attrs.pubkeyVersion), parts: total, status: statuses.get(first.key) ?? "new", envelope,
        createdAtBlock: first.createdAtBlock, expiresAtBlock: ordered.reduce((m, r) => (r.expiresAtBlock < m ? r.expiresAtBlock : m), ordered[0]!.expiresAtBlock),
      });
    }
    items.sort((a, b) => (a.createdAtBlock === b.createdAtBlock ? 0 : a.createdAtBlock > b.createdAtBlock ? -1 : 1));
    return { items, skippedIncomplete, ignoredAnnotations };
  }

  const nowBlock = async () => backend.timing();

  const store = {
    /** O relayer publica a denúncia (dividida em partes se for grande) e entrega a custódia à redação. */
    async publishSubmission(input: PublishInput): Promise<{ key: Hex; keys: Hex[] }> {
      if (!isNewsroomName(input.newsroom)) throw bad("Nome de redação inválido.");
      if (!CATEGORY_RE.test(input.category)) throw bad("Categoria inválida.");
      asHash("contentHash", input.contentHash);
      if (!isEpoch(input.epoch)) throw bad("Época inválida.");
      if (!Number.isInteger(input.pubkeyVersion) || input.pubkeyVersion < 1) throw bad("Versão da chave inválida.");
      if (input.envelope.length === 0) throw bad("O envelope não pode ser vazio.");
      checkRetention(input.retentionSeconds);
      if (!isAddress(input.custodian, { strict: false })) throw bad("Endereço do custodiante inválido.");

      const parts = input.envelope.length <= PART_PAYLOAD_BYTES ? splitIntoParts(input.envelope, input.envelope.length) : splitIntoParts(input.envelope);
      const keys: Hex[] = [];
      for (const p of parts) {
        const { key } = await backend.create(
          "denuncia",
          { newsroom: input.newsroom, category: input.category, status: "new", epoch: BigInt(input.epoch), contentHash: input.contentHash, pubkeyVersion: BigInt(input.pubkeyVersion), part: BigInt(p.index), parts: BigInt(p.total) },
          p.data,
          { expirationSeconds: input.retentionSeconds, readonly: true, permissionlessExtension: true },
        );
        await backend.changeOwnership(key, input.custodian);
        keys.push(key);
      }
      return { key: keys[0]!, keys };
    },

    /** Com `authorize`, só anotações de autores reconhecidos contam para o status; as demais são ignoradas e contadas. */
    async listSubmissions(q: { newsroom: string; status?: Status; category?: string; limit?: number; offset?: number; authorize?: Authorize }): Promise<{ items: Submission[]; hasMore: boolean; skippedIncomplete: number; ignoredAnnotations: number }> {
      if (!isNewsroomName(q.newsroom)) throw bad("Nome de redação inválido.");
      const limit = q.limit ?? 50;
      const offset = q.offset ?? 0;
      if (!Number.isInteger(limit) || limit < 1 || limit > PAGE) throw bad(`O limite deve estar entre 1 e ${PAGE}.`);
      if (!Number.isInteger(offset) || offset < 0) throw bad("O deslocamento deve ser inteiro e não negativo.");
      if (q.category !== undefined && !CATEGORY_RE.test(q.category)) throw bad("Categoria inválida.");
      const { items, skippedIncomplete, ignoredAnnotations } = await allSubmissions(q.newsroom, q.category, q.authorize);
      const filtered = q.status ? items.filter((i) => i.status === q.status) : items;
      return { items: filtered.slice(offset, offset + limit), hasMore: filtered.length > offset + limit, skippedIncomplete, ignoredAnnotations };
    },

    async annotate(a: { newsroom: string; denunciaKey: Hex; status: Status; journalist: Address; authorName?: string; retentionSeconds?: number }): Promise<Hex> {
      if (!isNewsroomName(a.newsroom)) throw bad("Nome de redação inválido.");
      if (!(STATUSES as readonly string[]).includes(a.status)) throw bad(`Status desconhecido: ${String(a.status)}`);
      asHash("denunciaKey", a.denunciaKey.toLowerCase());
      if (a.retentionSeconds !== undefined) checkRetention(a.retentionSeconds);
      if (!isAddress(a.journalist, { strict: false })) throw bad("Endereço do jornalista inválido.");
      if (a.authorName !== undefined) checkAuthorName(a.authorName);
      const { key } = await backend.create(
        "anotacao",
        { newsroom: a.newsroom, denunciaKey: a.denunciaKey.toLowerCase(), status: a.status, byJournalist: a.journalist.toLowerCase(), ...(a.authorName !== undefined ? { authorName: a.authorName } : {}) },
        new Uint8Array([1]),
        { expirationSeconds: a.retentionSeconds ?? DEFAULT_ANNOTATION_RETENTION_SECONDS, readonly: true, permissionlessExtension: true },
      );
      return key;
    },

    /** Anotações registradas, com o criador real de cada uma. Filtra por denúncia se informada. */
    async listAnnotations(q: { newsroom: string; denunciaKey?: Hex }): Promise<Annotation[]> {
      if (!isNewsroomName(q.newsroom)) throw bad("Nome de redação inválido.");
      if (q.denunciaKey !== undefined) asHash("denunciaKey", q.denunciaKey.toLowerCase());
      const rows = await selectAll("anotacao", q.denunciaKey ? { newsroom: q.newsroom, denunciaKey: q.denunciaKey.toLowerCase() } : { newsroom: q.newsroom });
      return rows.map((r) => ({ key: r.key, denunciaKey: String(r.attrs.denunciaKey) as Hex, status: r.attrs.status as Status, creator: r.creator, authorName: authorNameOf(r), createdAtBlock: r.createdAtBlock }));
    },

    async latestStatus(denunciaKey: Hex, authorize?: Authorize): Promise<Status> {
      const all = await selectAll("anotacao", { denunciaKey: denunciaKey.toLowerCase() });
      const check = authorize ? memoize(authorize) : undefined;
      const rows: EntityRow[] = [];
      for (const r of all) if (!check || (await check({ creator: r.creator, authorName: authorNameOf(r) }))) rows.push(r);
      if (rows.length === 0) return "new";
      const last = rows.reduce((m, r, i) => (r.createdAtBlock > m.row.createdAtBlock || (r.createdAtBlock === m.row.createdAtBlock && i > m.i) ? { row: r, i } : m), { row: rows[0]!, i: 0 });
      return last.row.attrs.status as Status;
    },

    async publishReply(r: { newsroom: string; mailboxId: string; sealed: Uint8Array; retentionSeconds: number; authorName?: string }): Promise<Hex> {
      if (!isNewsroomName(r.newsroom)) throw bad("Nome de redação inválido.");
      asHash("mailboxId", r.mailboxId);
      if (r.sealed.length === 0) throw bad("A resposta não pode ser vazia.");
      if (r.sealed.length > ARKIV_PRACTICAL_ENTITY_BYTES) throw new StoreError("too_large", "A resposta excede o tamanho de uma entidade.");
      checkRetention(r.retentionSeconds);
      if (r.authorName !== undefined) checkAuthorName(r.authorName);
      const { key } = await backend.create("resposta", { newsroom: r.newsroom, mailboxId: r.mailboxId, ...(r.authorName !== undefined ? { authorName: r.authorName } : {}) }, r.sealed, { expirationSeconds: r.retentionSeconds, readonly: true, permissionlessExtension: true });
      return key;
    },

    async getReplies(mailboxId: string): Promise<Reply[]> {
      asHash("mailboxId", mailboxId);
      const rows = await selectAll("resposta", { mailboxId });
      return rows
        .map((row, order) => ({ row, order }))
        .sort((a, b) => (a.row.createdAtBlock === b.row.createdAtBlock ? b.order - a.order : a.row.createdAtBlock > b.row.createdAtBlock ? -1 : 1))
        .map(({ row }) => ({ key: row.key, newsroom: String(row.attrs.newsroom), sealed: row.data, createdAtBlock: row.createdAtBlock, creator: row.creator, authorName: authorNameOf(row) }));
    },

    /** Estende a expiração para `retentionSeconds` a contar de agora, se isso for MAIS que a atual. */
    async renew(a: { key: Hex; retentionSeconds: number; kind?: EntityKind }): Promise<"extended" | "unchanged"> {
      checkRetention(a.retentionSeconds);
      const row = await backend.get(a.kind ?? "denuncia", a.key);
      if (!row) throw new StoreError("not_found", "Entidade inexistente ou já expirada.");
      const { currentBlock, blockSeconds } = await nowBlock();
      const candidate = currentBlock + BigInt(Math.ceil(a.retentionSeconds / blockSeconds));
      if (candidate <= row.expiresAtBlock) return "unchanged";
      await backend.extend(a.key, a.retentionSeconds);
      return "extended";
    },

    async listExpiring(q: { newsroom: string; withinSeconds: number }): Promise<Submission[]> {
      if (!isNewsroomName(q.newsroom)) throw bad("Nome de redação inválido.");
      const { currentBlock, blockSeconds } = await nowBlock();
      const { items } = await allSubmissions(q.newsroom);
      return items.filter((i) => Number(i.expiresAtBlock - currentBlock) * blockSeconds <= q.withinSeconds);
    },

    /** Renova todas as denúncias que vencem em até `withinSeconds`. Devolve quantas denúncias foram renovadas. */
    async renewExpiring(q: { newsroom: string; withinSeconds: number; retentionSeconds: number }): Promise<number> {
      const soon = await store.listExpiring(q);
      let renewed = 0;
      for (const s of soon) {
        let any = false;
        for (const key of s.keys) if ((await store.renew({ key, retentionSeconds: q.retentionSeconds })) === "extended") any = true;
        if (any) renewed++;
      }
      return renewed;
    },
  };
  return store;
}
