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
    return "sem erro";
  } catch (e) {
    return e instanceof StoreError ? e.code : `outro: ${(e as Error).message}`;
  }
};

describe("RF-10 e RF-11 publicar a denúncia e transferir a custódia", () => {
  it("cria_entidade_com_atributos_indexados_e_o_envelope_em_bytes", async () => {
    await publish();
    const [row] = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 5 });
    expect(row!.attrs).toEqual({ newsroom: NAME, category: "corrupcao", status: "new", epoch: 202611n, contentHash: HASH("ab"), pubkeyVersion: 2n, part: 0n, parts: 1n });
    expect(row!.data).toEqual(envelope(500));
  });

  it("os_atributos_nunca_identificam_a_fonte", async () => {
    await publish();
    const [row] = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 5 });
    const allowed = new Set(["newsroom", "category", "status", "epoch", "contentHash", "pubkeyVersion", "part", "parts"]);
    expect(Object.keys(row!.attrs).every((k) => allowed.has(k))).toBe(true);
  });

  it("marca_readonly_e_permissionlessExtension", async () => {
    await publish();
    expect(chain.flagsOf(0)).toEqual({ readonly: true, permissionlessExtension: true });
  });

  it("transfere_a_custodia_para_a_redacao_e_o_criador_continua_sendo_o_relayer", async () => {
    await publish();
    const [row] = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 5 });
    expect(row!.owner).toBe(NEWSROOM);
    expect(row!.creator).toBe(RELAYER);
  });

  it("depois_da_transferencia_o_relayer_nao_transfere_de_novo_mas_ainda_estende", async () => {
    const { key } = await publish();
    await expect(chain.backendFor(RELAYER).changeOwnership(key, RELAYER)).rejects.toThrow();
    await relayerStore().renew({ key, retentionSeconds: 7200 }); // extensão livre
  });

  it("recusa_entradas_invalidas_com_codigo", async () => {
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

describe("RF-19 anexos grandes em várias partes", () => {
  it("divide_em_partes_e_lista_como_uma_so_denuncia_remontada", async () => {
    const big = Uint8Array.from({ length: 300 * 1024 }, (_, i) => i % 251);
    await publish({ envelope: big });
    const rows = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 20 });
    expect(rows).toHaveLength(Math.ceil(big.length / PART_PAYLOAD_BYTES));
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME });
    expect(items).toHaveLength(1);
    expect(items[0]!.envelope).toEqual(big);
    expect(items[0]!.parts).toBe(3);
  });

  it("todas_as_partes_ficam_com_a_redacao", async () => {
    await publish({ envelope: envelope(300 * 1024) });
    const rows = await chain.backendFor(RELAYER).select("denuncia", { newsroom: NAME }, { offset: 0, limit: 20 });
    expect(rows.every((r) => r.owner === NEWSROOM)).toBe(true);
  });

  it("um_grupo_incompleto_nao_aparece_e_e_contado", async () => {
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

describe("RF-12 listar denúncias", () => {
  it("lista_por_redacao_e_isola_outras_redacoes", async () => {
    await publish();
    await publish({ newsroom: "outra.eth", contentHash: HASH("cc") });
    expect((await newsroomStore().listSubmissions({ newsroom: NAME })).items).toHaveLength(1);
    expect((await newsroomStore().listSubmissions({ newsroom: "vazia.eth" })).items).toEqual([]);
  });

  it("filtra_por_categoria", async () => {
    await publish({ category: "saude", contentHash: HASH("a1") });
    await publish({ category: "obras", contentHash: HASH("a2") });
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME, category: "saude" });
    expect(items.map((i) => i.category)).toEqual(["saude"]);
  });

  it("ordena_da_mais_recente_para_a_mais_antiga", async () => {
    await publish({ contentHash: HASH("01") });
    await publish({ contentHash: HASH("02") });
    await publish({ contentHash: HASH("03") });
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME });
    expect(items.map((i) => i.contentHash)).toEqual([HASH("03"), HASH("02"), HASH("01")]);
  });

  it("pagina_em_blocos_sem_perder_nem_repetir_com_mais_de_100_itens", async () => {
    for (let i = 0; i < 250; i++) await publish({ contentHash: ("0x" + i.toString(16).padStart(64, "0")) as `0x${string}` });
    const store = newsroomStore();
    const p1 = await store.listSubmissions({ newsroom: NAME, limit: 100, offset: 0 });
    const p2 = await store.listSubmissions({ newsroom: NAME, limit: 100, offset: 100 });
    const p3 = await store.listSubmissions({ newsroom: NAME, limit: 100, offset: 200 });
    expect([p1.items.length, p2.items.length, p3.items.length]).toEqual([100, 100, 50]);
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false]);
    expect(new Set([...p1.items, ...p2.items, ...p3.items].map((i) => i.contentHash)).size).toBe(250);
  });

  it("a_pagina_maxima_e_100", async () => {
    expect(await codeOf(newsroomStore().listSubmissions({ newsroom: NAME, limit: 101 }))).toBe("input");
    expect(await codeOf(newsroomStore().listSubmissions({ newsroom: "Invalida" }))).toBe("input");
  });
});

describe("RF-14 anotações de status (o envelope não muda)", () => {
  it("registra_status_sem_alterar_o_envelope_e_lista_pelo_ultimo_status", async () => {
    const { key } = await publish();
    const j = journalistStore();
    await j.annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST });
    await j.annotate({ newsroom: NAME, denunciaKey: key, status: "verified", journalist: JOURNALIST });
    expect(await newsroomStore().latestStatus(key)).toBe("verified");
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME });
    expect(items[0]!.status).toBe("verified");
    expect(items[0]!.envelope).toEqual(envelope(500)); // inalterado
  });

  it("sem_anotacao_o_status_e_new", async () => {
    const { key } = await publish();
    expect(await newsroomStore().latestStatus(key)).toBe("new");
  });

  it("filtra_por_status_usando_a_ultima_anotacao", async () => {
    const a = await publish({ contentHash: HASH("b1") });
    await publish({ contentHash: HASH("b2") });
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: a.key, status: "discarded", journalist: JOURNALIST });
    expect((await newsroomStore().listSubmissions({ newsroom: NAME, status: "discarded" })).items).toHaveLength(1);
    expect((await newsroomStore().listSubmissions({ newsroom: NAME, status: "new" })).items).toHaveLength(1);
  });

  it("recusa_status_desconhecido", async () => {
    const { key } = await publish();
    expect(await codeOf(journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "qualquer" as never, journalist: JOURNALIST }))).toBe("input");
  });
});

describe("RF-15 respostas pelo mailbox", () => {
  it("busca_por_mailbox_e_devolve_so_as_respostas_dele", async () => {
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(40, 1), retentionSeconds: 3600 });
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: HASH("ef"), sealed: envelope(40, 2), retentionSeconds: 3600 });
    const mine = await relayerStore().getReplies(MAILBOX);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.sealed).toEqual(envelope(40, 1));
    expect(await relayerStore().getReplies(HASH("99"))).toEqual([]);
  });

  it("devolve_da_mais_recente_para_a_mais_antiga", async () => {
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(10, 1), retentionSeconds: 3600 });
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(10, 2), retentionSeconds: 3600 });
    expect((await relayerStore().getReplies(MAILBOX)).map((r) => r.sealed[0])).toEqual([2, 1]);
  });

  it("recusa_resposta_vazia_grande_demais_ou_mailbox_invalido", async () => {
    const j = journalistStore();
    expect(await codeOf(j.publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: new Uint8Array(), retentionSeconds: 60 }))).toBe("input");
    expect(await codeOf(j.publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(129_000), retentionSeconds: 60 }))).toBe("too_large");
    expect(await codeOf(j.publishReply({ newsroom: NAME, mailboxId: "0x12", sealed: envelope(5), retentionSeconds: 60 }))).toBe("input");
  });
});

describe("RF-18 retenção", () => {
  it("entidade_expirada_some_da_consulta", async () => {
    await publish({ retentionSeconds: 60 });
    chain.advanceSeconds(120);
    expect((await newsroomStore().listSubmissions({ newsroom: NAME })).items).toEqual([]);
  });

  it("lista_denuncias_proximas_do_vencimento", async () => {
    await publish({ contentHash: HASH("c1"), retentionSeconds: 600 });
    await publish({ contentHash: HASH("c2"), retentionSeconds: 100_000 });
    const soon = await newsroomStore().listExpiring({ newsroom: NAME, withinSeconds: 1000 });
    expect(soon.map((s) => s.contentHash)).toEqual([HASH("c1")]);
  });

  it("estende_a_expiracao_antes_do_vencimento", async () => {
    const { key } = await publish({ retentionSeconds: 600 });
    await relayerStore().renew({ key, retentionSeconds: 100_000 });
    expect(await newsroomStore().listExpiring({ newsroom: NAME, withinSeconds: 1000 })).toEqual([]);
    chain.advanceSeconds(5000);
    expect((await newsroomStore().listSubmissions({ newsroom: NAME })).items).toHaveLength(1);
  });

  it("nao_estende_para_data_anterior_a_atual", async () => {
    const { key } = await publish({ retentionSeconds: 100_000 });
    expect(await relayerStore().renew({ key, retentionSeconds: 600 })).toBe("unchanged");
  });

  it("renewExpiring_renova_so_o_que_esta_proximo_e_devolve_a_contagem", async () => {
    await publish({ contentHash: HASH("d1"), retentionSeconds: 600 });
    await publish({ contentHash: HASH("d2"), retentionSeconds: 600 });
    await publish({ contentHash: HASH("d3"), retentionSeconds: 1_000_000 });
    const n = await relayerStore().renewExpiring({ newsroom: NAME, withinSeconds: 1000, retentionSeconds: 100_000 });
    expect(n).toBe(2);
    expect(await newsroomStore().listExpiring({ newsroom: NAME, withinSeconds: 1000 })).toEqual([]);
  });
});

describe("limite de vida máximo da cadeia (achado do teste real: ~182 dias)", () => {
  it("o_maximo_e_de_7884000_blocos_de_2_segundos", () => {
    expect(ARKIV_MAX_RETENTION_SECONDS).toBe(7_884_000 * 2);
  });

  it("o_maximo_da_loja_deixa_folga_para_a_diferenca_de_bloco", () => {
    expect(STORE_MAX_RETENTION_SECONDS).toBeLessThan(ARKIV_MAX_RETENTION_SECONDS);
  });

  it("recusa_retencao_alem_do_maximo_da_loja_e_aceita_exatamente_o_maximo_da_loja", async () => {
    expect(await codeOf(publish({ retentionSeconds: STORE_MAX_RETENTION_SECONDS + 2 }))).toBe("input");
    expect(await codeOf(publish({ retentionSeconds: STORE_MAX_RETENTION_SECONDS }))).toBe("sem erro");
    expect(await codeOf(journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(5), retentionSeconds: STORE_MAX_RETENTION_SECONDS + 2 }))).toBe("input");
    expect(await codeOf(journalistStore().annotate({ newsroom: NAME, denunciaKey: HASH("aa"), status: "review", journalist: JOURNALIST, retentionSeconds: STORE_MAX_RETENTION_SECONDS + 2 }))).toBe("input");
  });

  it("renovar_alem_do_maximo_e_recusado", async () => {
    const { key } = await publish();
    expect(await codeOf(relayerStore().renew({ key, retentionSeconds: STORE_MAX_RETENTION_SECONDS + 2 }))).toBe("input");
  });

  it("a_retencao_padrao_das_anotacoes_cabe_no_maximo", async () => {
    expect(DEFAULT_ANNOTATION_RETENTION_SECONDS).toBeLessThan(ARKIV_MAX_RETENTION_SECONDS);
    const { key } = await publish();
    const annKey = await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST });
    const row = await chain.backendFor(RELAYER).get("anotacao", annKey);
    const { currentBlock } = await chain.backendFor(RELAYER).timing();
    expect(Number(row!.expiresAtBlock - currentBlock)).toBeLessThanOrEqual(7_884_000);
  });
});

describe("A1 autoria de anotações e respostas (o criador vem da cadeia)", () => {
  const STRANGER = "0x9999999999999999999999999999999999999999" as const;
  const strangerStore = () => createStore(chain.backendFor(STRANGER));
  const allowed = (set: string[]) => ({ creator }: { creator: string }) => set.includes(creator.toLowerCase());

  it("anotacao_guarda_o_nome_de_quem_anotou_e_o_criador_real", async () => {
    const { key } = await publish();
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST, authorName: "maria.investiga.eth" });
    const [a] = await newsroomStore().listAnnotations({ newsroom: NAME });
    expect(a).toMatchObject({ denunciaKey: key, status: "review", authorName: "maria.investiga.eth" });
    expect(a!.creator.toLowerCase()).toBe(JOURNALIST);
  });

  it("anotacao_de_carteira_nao_autorizada_e_ignorada", async () => {
    const { key } = await publish();
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST });
    await strangerStore().annotate({ newsroom: NAME, denunciaKey: key, status: "discarded", journalist: JOURNALIST }); // finge ser o jornalista
    const authorize = allowed([JOURNALIST]);
    const { items } = await newsroomStore().listSubmissions({ newsroom: NAME, authorize });
    expect(items[0]!.status).toBe("review");
    expect(await newsroomStore().latestStatus(key, authorize)).toBe("review");
  });

  it("contagem_de_ignoradas", async () => {
    const { key } = await publish();
    await strangerStore().annotate({ newsroom: NAME, denunciaKey: key, status: "discarded", journalist: JOURNALIST });
    await strangerStore().annotate({ newsroom: NAME, denunciaKey: key, status: "verified", journalist: JOURNALIST });
    const r = await newsroomStore().listSubmissions({ newsroom: NAME, authorize: allowed([JOURNALIST]) });
    expect(r.ignoredAnnotations).toBe(2);
    expect(r.items[0]!.status).toBe("new");
  });

  it("status_volta_ao_anterior_se_a_ultima_anotacao_e_invalida", async () => {
    const { key } = await publish();
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "verified", journalist: JOURNALIST });
    await strangerStore().annotate({ newsroom: NAME, denunciaKey: key, status: "discarded", journalist: JOURNALIST });
    expect((await newsroomStore().listSubmissions({ newsroom: NAME, authorize: allowed([JOURNALIST]) })).items[0]!.status).toBe("verified");
    expect((await newsroomStore().listSubmissions({ newsroom: NAME })).items[0]!.status).toBe("discarded"); // sem filtro, comportamento antigo
  });

  it("a_autorizacao_recebe_criador_e_nome_e_e_consultada_uma_vez_por_par", async () => {
    const { key } = await publish();
    for (let i = 0; i < 3; i++) await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST, authorName: "maria.investiga.eth" });
    const seen: unknown[] = [];
    await newsroomStore().listSubmissions({ newsroom: NAME, authorize: (a) => (seen.push(a), true) });
    expect(seen).toEqual([{ creator: JOURNALIST, authorName: "maria.investiga.eth" }]);
  });

  it("autorizacao_assincrona_e_aceita", async () => {
    const { key } = await publish();
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST });
    const r = await newsroomStore().listSubmissions({ newsroom: NAME, authorize: async () => false });
    expect(r.items[0]!.status).toBe("new");
    expect(r.ignoredAnnotations).toBe(1);
  });

  it("recusa_nome_de_autor_invalido", async () => {
    const { key } = await publish();
    expect(await codeOf(journalistStore().annotate({ newsroom: NAME, denunciaKey: key, status: "review", journalist: JOURNALIST, authorName: "Nome Inválido!" }))).toBe("input");
    expect(await codeOf(journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(10), retentionSeconds: 60, authorName: "x" }))).toBe("input");
  });

  it("resposta_traz_o_criador_e_o_nome", async () => {
    await journalistStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(30, 4), retentionSeconds: 3600, authorName: "maria.investiga.eth" });
    await newsroomStore().publishReply({ newsroom: NAME, mailboxId: MAILBOX, sealed: envelope(30, 5), retentionSeconds: 3600 });
    const rs = await relayerStore().getReplies(MAILBOX);
    expect(rs.map((r) => [r.creator.toLowerCase(), r.authorName])).toEqual([[NEWSROOM, undefined], [JOURNALIST, "maria.investiga.eth"]]);
  });

  it("autor_vazio_na_cadeia_conta_como_ausente", async () => {
    const { key } = await publish();
    // o nó pode devolver texto vazio ou nulo para colunas não preenchidas (não confirmamos qual)
    await chain.backendFor(JOURNALIST).create("anotacao", { newsroom: NAME, denunciaKey: key, status: "review", byJournalist: JOURNALIST, authorName: "" }, new Uint8Array([1]), { expirationSeconds: 3600, readonly: true, permissionlessExtension: true });
    await chain.backendFor(JOURNALIST).create("resposta", { newsroom: NAME, mailboxId: MAILBOX, authorName: "" }, envelope(10), { expirationSeconds: 3600, readonly: true, permissionlessExtension: true });
    expect((await newsroomStore().listAnnotations({ newsroom: NAME }))[0]!.authorName).toBeUndefined();
    expect((await relayerStore().getReplies(MAILBOX))[0]!.authorName).toBeUndefined();
  });

  it("listAnnotations_filtra_por_denuncia", async () => {
    const a = await publish({ contentHash: HASH("c1") });
    const b = await publish({ contentHash: HASH("c2") });
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: a.key, status: "review", journalist: JOURNALIST });
    await journalistStore().annotate({ newsroom: NAME, denunciaKey: b.key, status: "verified", journalist: JOURNALIST });
    expect(await newsroomStore().listAnnotations({ newsroom: NAME, denunciaKey: b.key })).toHaveLength(1);
    expect(await newsroomStore().listAnnotations({ newsroom: NAME })).toHaveLength(2);
  });
});
