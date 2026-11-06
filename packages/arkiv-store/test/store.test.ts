import { PART_PAYLOAD_BYTES, splitIntoParts } from "@safe-whistle/core";
import { beforeEach, describe, expect, it } from "vitest";
import { ARKIV_MAX_RETENTION_SECONDS, DEFAULT_ANNOTATION_RETENTION_SECONDS, STORE_MAX_RETENTION_SECONDS, StoreError, createMemoryChain, createStore, type MemoryChain } from "../src/index.ts";

const RELAYER = "0x1111111111111111111111111111111111111111" as const;
const NEWSROOM = "0x2222222222222222222222222222222222222222" as const;
const JOURNALIST = "0x3333333333333333333333333333333333333333" as const;
const NAME = "investiga.eth";
const HASH = (c: string) => ("0x" + c.repeat(32)) as `0x${string}`;
const MAILBOX = HASH("cd");
const envelope = (n: number, v = 5) => new Uint8Array(n).fill(v);

let chain: MemoryChain;
const relayerStore = () => createStore(chain.backendFor(RELAYER));
const newsroomStore = () => createStore(chain.backendFor(NEWSROOM));
const journalistStore = () => createStore(chain.backendFor(JOURNALIST));
beforeEach(() => {
  chain = createMemoryChain();
});

const publish = (over: Partial<Parameters<ReturnType<typeof relayerStore>["publishSubmission"]>[0]> = {}) =>
  relayerStore().publishSubmission({ newsroom: NAME, category: "corrupcao", epoch: 202611, contentHash: HASH("ab"), pubkeyVersion: 2, envelope: envelope(500), custodian: NEWSROOM, retentionSeconds: 3600, ...over });

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "no error";
  } catch (e) {
    return e instanceof StoreError ? e.code : `other: ${(e as Error).message}`;
  }
};

describe("RF-10 and RF-11 publish the tip and transfer custody", () => {
  it("creates_entity_with_indexed_attributes_and_the_envelope_in_bytes", async () => {
    await publish();
    const [row] = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 5 });
    expect(row!.attrs).toEqual({ newsroom: NAME, category: "corrupcao", status: "new", epoch: 202611n, contentHash: HASH("ab"), pubkeyVersion: 2n, part: 0n, parts: 1n });
    expect(row!.data).toEqual(envelope(500));
  });

  it("the_attributes_never_identify_the_source", async () => {
    await publish();
    const [row] = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 5 });
    const allowed = new Set(["newsroom", "category", "status", "epoch", "contentHash", "pubkeyVersion", "part", "parts"]);
    expect(Object.keys(row!.attrs).every((k) => allowed.has(k))).toBe(true);
  });

  it("marks_readonly_and_permissionlessExtension", async () => {
    await publish();
    expect(chain.flagsOf(0)).toEqual({ readonly: true, permissionlessExtension: true });
  });

  it("transfers_custody_to_the_newsroom_and_the_creator_remains_the_relayer", async () => {
    await publish();
    const [row] = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 5 });
    expect(row!.owner).toBe(NEWSROOM);
    expect(row!.creator).toBe(RELAYER);
  });

  it("after_the_transfer_the_relayer_cannot_transfer_again_but_still_extends", async () => {
    const { key } = await publish();
    await expect(chain.backendFor(RELAYER).changeOwnership(key, RELAYER)).rejects.toThrow();
    await relayerStore().renew({ key, retentionSeconds: 7200 }); // free extension
  });

  it("rejects_invalid_inputs_with_code", async () => {
    expect(await codeOf(publish({ newsroom: "Invalida" }))).toBe("input");
    expect(await codeOf(publish({ category: "Com Espaço" }))).toBe("input");
    expect(await codeOf(publish({ contentHash: "0x123" }))).toBe("input");
    expect(await codeOf(publish({ epoch: 202613 }))).toBe("input");
    expect(await codeOf(publish({ pubkeyVersion: 0 }))).toBe("input");
    expect(await codeOf(publish({ envelope: new Uint8Array() }))).toBe("input");
    expect(await codeOf(publish({ retentionSeconds: 0 }))).toBe("input");
    expect(await codeOf(publish({ custodian: "0x123" as never }))).toBe("input");
  });
});

describe("RF-19 large attachments in several parts", () => {
  it("splits_into_parts_and_lists_as_a_single_reassembled_tip", async () => {
    const big = Uint8Array.from({ length: 300 * 1024 }, (_, i) => i % 251);
    await publish({ envelope: big });
    const rows = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 20 });
    expect(rows).toHaveLength(Math.ceil(big.length / PART_PAYLOAD_BYTES));
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME });
    expect(items).toHaveLength(1);
    expect(items[0]!.envelope).toEqual(big);
    expect(items[0]!.parts).toBe(3);
  });

  it("all_parts_belong_to_the_newsroom", async () => {
    await publish({ envelope: envelope(300 * 1024) });
    const rows = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 20 });
    expect(rows.every((r) => r.owner === NEWSROOM)).toBe(true);
  });

  it("an_incomplete_group_does_not_appear_and_is_counted", async () => {
    const big = envelope(300 * 1024);
    const parts = splitIntoParts(big);
    const backend = chain.backendFor(RELAYER);
    for (const p of parts.slice(0, 2)) {
      await backend.create("denuncia", { newsroom: NAME, category: "corrupcao", status: "new", epoch: 202611n, contentHash: HASH("ee"), pubkeyVersion: 1n, part: BigInt(p.index), parts: BigInt(p.total) }, p.data, { expirationSeconds: 3600, readonly: true, permissionlessExtension: true });
    }
    const res = await newsroomStore().listSubmissions({ newsroom: NAME });
    expect(res.items).toEqual([]);
    expect(res.skippedIncomplete).toBe(1);
  });
});

describe("RF-12 list tips", () => {
  it("lists_by_newsroom_and_isolates_other_newsrooms", async () => {
    await publish();
    await publish({ newsroom: "outra.eth", contentHash: HASH("cc") });
    expect((await newsroomStore().listSubmissions({ newsroom: NAME })).items).toHaveLength(1);
    expect((await newsroomStore().listSubmissions({ newsroom: "vazia.eth" })).items).toEqual([]);
  });

  it("filters_by_category", async () => {
    await publish({ category: "saude", contentHash: HASH("a1") });
    await publish({ category: "obras", contentHash: HASH("a2") });
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME, category: "saude" });
    expect(items.map((i) => i.category)).toEqual(["saude"]);
  });

  it("sorts_from_newest_to_oldest", async () => {
    await publish({ contentHash: HASH("01") });
    await publish({ contentHash: HASH("02") });
    await publish({ contentHash: HASH("03") });
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME });
    expect(items.map((i) => i.contentHash)).toEqual([HASH("03"), HASH("02"), HASH("01")]);
  });

  it("paginates_in_blocks_without_losing_or_repeating_with_more_than_100_items", async () => {
    for (let i = 0; i < 250; i++) await publish({ contentHash: ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}` });
    const store = newsroomStore();
    const p1 = await store.listSubmissions({ newsroom: NAME, limit: 100, offset: 0 });
    const p2 = await store.listSubmissions({ newsroom: NAME, limit: 100, offset: 100 });
    const p3 = await store.listSubmissions({ newsroom: NAME, limit: 100, offset: 200 });
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([100, 100, 50]);
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false]);
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((i) => i.contentHash)).size).toBe(250);
  });

  it("the_maximum_page_is_100", async () => {
    expect(await codeOf(newsroomStore().listSubmissions({ newsroom: NAME, limit: 101 }))).toBe("input");
    expect(await codeOf(newsroomStore().listSubmissions({ newsroom: "Invalida" }))).toBe("input");
  });
});

describe("RF-14 status annotations (the envelope does not change)", () => {
  it("records_status_without_changing_the_envelope_and_lists_by_the_latest_status", async () => {
    const { key } = await publish();
    const j = journalistStore();
    await j.annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST });
    await j.annotate({ newsroom: NAME, denunciaKey: key, status: "verified", journalist: JOURNALIST });
    expect(await newsroomStore().latestStatus(key)).toBe("verified");
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME });
    expect(items[0]!.status).toBe("verified");
    expect(items[0]!.envelope).toEqual(envelope(500)); // unchanged
  });

  it("without_annotation_the_status_is_new", async () => {
    const { key } = await publish();
    expect(await newsroomStore().latestStatus(key)).toBe("new");
  });

  it("filters_by_status_using_the_latest_annotation", async () => {
    const a = await publish({ contentHash: HASH("b1") });
    await publish({ contentHash: HASH("b2") });
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: a.key, status: "discarded", journalist: JOURNALIST });
    expect((await newsroomStore().listSubmissions({ newsroom: NAME, status: "discarded" })).items).toHaveLength(1);
    expect((await newsroomStore().listSubmissions({ newsroom: NAME, status: "new" })).items).toHaveLength(1);
  });

  it("rejects_unknown_status", async () => {
    const { key } = await publish();
    expect(await codeOf(journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "qualquer" as never, journalist: JOURNALIST }))).toBe("input");
  });
});

describe("RF-15 replies by mailbox", () => {
  it("searches_by_mailbox_and_returns_only_its_replies", async () => {
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(40, 1), retentionSeconds: 3600 });
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: HASH("ef"), sealed: envelope(40, 2), retentionSeconds: 3600 });
    const mine = await relayerStore().getReplies(MAILBOX);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.sealed).toEqual(envelope(40, 1));
    expect(await relayerStore().getReplies(HASH("99"))).toEqual([]);
  });

  it("returns_from_newest_to_oldest", async () => {
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(10, 1), retentionSeconds: 3600 });
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(10, 2), retentionSeconds: 3600 });
    expect((await relayerStore().getReplies(MAILBOX)).map((r) => r.sealed[0])).toEqual([2, 1]);
  });

  it("rejects_empty_reply_too_large_or_invalid_mailbox", async () => {
    const j = journalistStore();
    expect(await codeOf(j.publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: new Uint8Array(), retentionSeconds: 60 }))).toBe("input");
    expect(await codeOf(j.publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(129_000), retentionSeconds: 60 }))).toBe("too_large");
    expect(await codeOf(j.publishReply({ newsroom: NAME, mailboxId: "0x12", sealed: envelope(5), retentionSeconds: 60 }))).toBe("input");
  });
});

describe("RF-18 retention", () => {
  it("expired_entity_disappears_from_the_query", async () => {
    await publish({ retentionSeconds: 60 });
    chain.advanceSeconds(120);
    expect((await newsroomStore().listSubmissions({ newsroom: NAME })).items).toEqual([]);
  });

  it("lists_tips_close_to_expiry", async () => {
    await publish({ contentHash: HASH("c1"), retentionSeconds: 600 });
    await publish({ contentHash: HASH("c2"), retentionSeconds: 100_000 });
    const soon = await newsroomStore().listExpiring({ newsroom: NAME, withinSeconds: 1000 });
    expect(soon.map((s) => s.contentHash)).toEqual([HASH("c1")]);
  });

  it("extends_expiration_before_expiry", async () => {
    const { key } = await publish({ retentionSeconds: 600 });
    await relayerStore().renew({ key, retentionSeconds: 100_000 });
    expect(await newsroomStore().listExpiring({ newsroom: NAME, withinSeconds: 1000 })).toEqual([]);
    chain.advanceSeconds(5000);
    expect((await newsroomStore().listSubmissions({ newsroom: NAME })).items).toHaveLength(1);
  });

  it("does_not_extend_to_a_date_earlier_than_the_current_one", async () => {
    const { key } = await publish({ retentionSeconds: 100_000 });
    expect(await relayerStore().renew({ key, retentionSeconds: 600 })).toBe("unchanged");
  });

  it("renewExpiring_renews_only_what_is_close_and_returns_the_count", async () => {
    await publish({ contentHash: HASH("d1"), retentionSeconds: 600 });
    await publish({ contentHash: HASH("d2"), retentionSeconds: 600 });
    await publish({ contentHash: HASH("d3"), retentionSeconds: 1_000_000 });
    const n = await relayerStore().renewExpiring({ newsroom: NAME, withinSeconds: 1000, retentionSeconds: 100_000 });
    expect(n).toBe(2);
    expect(await newsroomStore().listExpiring({ newsroom: NAME, withinSeconds: 1000 })).toEqual([]);
  });
});

describe("chain maximum lifetime (finding from the real test: ~182 days)", () => {
  it("the_maximum_is_7884000_blocks_of_2_seconds", () => {
    expect(ARKIV_MAX_RETENTION_SECONDS).toBe(7_884_000 * 2);
  });

  it("the_store_maximum_leaves_margin_for_the_block_difference", () => {
    expect(STORE_MAX_RETENTION_SECONDS).toBeLessThan(ARKIV_MAX_RETENTION_SECONDS);
  });

  it("rejects_retention_beyond_the_store_maximum_and_accepts_exactly_the_store_maximum", async () => {
    expect(await codeOf(publish({ retentionSeconds: STORE_MAX_RETENTION_SECONDS + 2 }))).toBe("input");
    expect(await codeOf(publish({ retentionSeconds: STORE_MAX_RETENTION_SECONDS }))).toBe("no error");
    expect(await codeOf(journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(5), retentionSeconds: STORE_MAX_RETENTION_SECONDS + 2 }))).toBe("input");
    expect(await codeOf(journalistStore().annotate({ newsroom: NAME, denunciaKey: HASH("aa"), status: "review", journalist: JOURNALIST, retentionSeconds: STORE_MAX_RETENTION_SECONDS + 2 }))).toBe("input");
  });

  it("renewing_beyond_the_maximum_is_rejected", async () => {
    const { key } = await publish();
    expect(await codeOf(relayerStore().renew({ key, retentionSeconds: STORE_MAX_RETENTION_SECONDS + 2 }))).toBe("input");
  });

  it("the_default_annotation_retention_fits_within_the_maximum", async () => {
    expect(DEFAULT_ANNOTATION_RETENTION_SECONDS).toBeLessThan(ARKIV_MAX_RETENTION_SECONDS);
    const { key } = await publish();
    const annKey = await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST });
    const row = await chain.backendFor(RELAYER).get("anotacao", annKey);
    const { currentBlock } = await chain.backendFor(RELAYER).timing();
    expect(Number(row!.expiresAtBlock - currentBlock)).toBeLessThanOrEqual(7_884_000);
  });
});

describe("A1 authorship of annotations and replies (the creator comes from the chain)", () => {
  const STRANGER = "0x9999999999999999999999999999999999999999" as const;
  const strangerStore = () => createStore(chain.backendFor(STRANGER));
  const allowed = (set: string[]) => ({ creator }: { creator: string }) => set.includes(creator.toLowerCase());

  it("annotation_stores_the_name_of_whoever_annotated_and_the_real_creator", async () => {
    const { key } = await publish();
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST, authorName: "maria.investiga.eth" });
    const [a] = await newsroomStore().listAnnotations({ newsroom: NAME });
    expect(a).toMatchObject({ denunciaKey: key, status: "review", authorName: "maria.investiga.eth" });
    expect(a!.creator.toLowerCase()).toBe(JOURNALIST);
  });

  it("annotation_from_unauthorized_wallet_is_ignored", async () => {
    const { key } = await publish();
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST });
    await strangerStore().annotate({ newsroom: NAME, denunciaKey: key, status: "discarded", journalist: JOURNALIST }); // pretends to be the journalist
    const authorize = allowed([JOURNALIST]);
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME, authorize });
    expect(items[0]!.status).toBe("review");
    expect(await newsroomStore().latestStatus(key, authorize)).toBe("review");
  });

  it("count_of_ignored", async () => {
    const { key } = await publish();
    await strangerStore().annotate({ newsroom: NAME, denunciaKey: key, status: "discarded", journalist: JOURNALIST });
    await strangerStore().annotate({ newsroom: NAME, denunciaKey: key, status: "verified", journalist: JOURNALIST });
    const r = await newsroomStore().listSubmissions({ newsroom: NAME, authorize: allowed([JOURNALIST]) });
    expect(r.ignoredAnnotations).toBe(2);
    expect(r.items[0]!.status).toBe("new");
  });

  it("status_returns_to_the_previous_one_if_the_last_annotation_is_invalid", async () => {
    const { key } = await publish();
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "verified", journalist: JOURNALIST });
    await strangerStore().annotate({ newsroom: NAME, denunciaKey: key, status: "discarded", journalist: JOURNALIST });
    expect((await newsroomStore().listSubmissions({ newsroom: NAME, authorize: allowed([JOURNALIST]) })).items[0]!.status).toBe("verified");
    expect((await newsroomStore().listSubmissions({ newsroom: NAME })).items[0]!.status).toBe("discarded"); // without a filter, old behavior
  });

  it("authorization_receives_creator_and_name_and_is_queried_once_per_pair", async () => {
    const { key } = await publish();
    for (let i = 0; i < 3; i++) await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST, authorName: "maria.investiga.eth" });
    const seen: unknown[] = [];
    await newsroomStore().listSubmissions({ newsroom: NAME, authorize: (a) => (seen.push(a), true) });
    expect(seen).toEqual([{ creator: JOURNALIST, authorName: "maria.investiga.eth" }]);
  });

  it("asynchronous_authorization_is_accepted", async () => {
    const { key } = await publish();
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST });
    const r = await newsroomStore().listSubmissions({ newsroom: NAME, authorize: async () => false });
    expect(r.items[0]!.status).toBe("new");
    expect(r.ignoredAnnotations).toBe(1);
  });

  it("rejects_invalid_author_name", async () => {
    const { key } = await publish();
    expect(await codeOf(journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST, authorName: "Nome Inválido!" }))).toBe("input");
    expect(await codeOf(journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(10), retentionSeconds: 60, authorName: "x" }))).toBe("input");
  });

  it("reply_brings_the_creator_and_the_name", async () => {
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(30, 4), retentionSeconds: 3600, authorName: "maria.investiga.eth" });
    await newsroomStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(30, 5), retentionSeconds: 3600 });
    const rs = await relayerStore().getReplies(MAILBOX);
    expect(rs.map((r) => [r.creator.toLowerCase(), r.authorName])).toEqual([[NEWSROOM, undefined], [JOURNALIST, "maria.investiga.eth"]]);
  });

  it("empty_author_on_the_chain_counts_as_absent", async () => {
    const { key } = await publish();
    // the node may return empty or null text for unfilled columns (we have not confirmed which)
    await chain.backendFor(JOURNALIST).create("anotacao", { newsroom: NAME, denunciaKey: key, status: "review", byJournalist: JOURNALIST, authorName: "" }, new Uint8Array([1]), { expirationSeconds: 3600, readonly: true, permissionlessExtension: true });
    await chain.backendFor(JOURNALIST).create("resposta", { newsroom: NAME, mailboxId: MAILBOX, authorName: "" }, envelope(10), { expirationSeconds: 3600, readonly: true, permissionlessExtension: true });
    expect((await newsroomStore().listAnnotations({ newsroom: NAME }))[0]!.authorName).toBeUndefined();
    expect((await relayerStore().getReplies(MAILBOX))[0]!.authorName).toBeUndefined();
  });

  it("listAnnotations_filters_by_tip", async () => {
    const a = await publish({ contentHash: HASH("c1") });
    const b = await publish({ contentHash: HASH("c2") });
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: a.key, status: "review", journalist: JOURNALIST });
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: b.key, status: "verified", journalist: JOURNALIST });
    expect(await newsroomStore().listAnnotations({ newsroom: NAME, denunciaKey: b.key })).toHaveLength(1);
    expect(await newsroomStore().listAnnotations({ newsroom: NAME })).toHaveLength(2);
  });
});
