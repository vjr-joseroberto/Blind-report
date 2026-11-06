import { NewsroomError } from "@safe-whistle/newsroom-client";
import { describe, expect, it, vi } from "vitest";
import { createPanelController } from "../src/controller.ts";

const ITEM = { key: "0x01", category: "saude", status: "new", epoch: 202611, pubkeyVersion: 1, envelope: new Uint8Array([1]), contentHash: "0xaa" };
const ENS = { name: "investiga.eth", label: "investiga", resolver: "0x1", subRegistry: "0x2" };

function make(over: Record<string, any> = {}, role: "admin" | "journalist" | "visitor" = "admin") {
  const client = {
    newsroom: vi.fn(() => undefined as any),
    keyVersions: vi.fn(() => [1]),
    updatePolicy: vi.fn(async (_p: any) => {}),
    newReaderKey: vi.fn(() => ({ publicKey: new Uint8Array([1]), privateKey: new Uint8Array([2]) })),
    shareKeyring: vi.fn((_k: Uint8Array) => "SHARED"),
    importSharedKeyring: vi.fn((_b: string, _r: any) => {}),
    currentKey: vi.fn(() => ({ version: 1, publicKey: new Uint8Array(32) })),
    registerNewsroom: vi.fn(async (a: any) => { a.onProgress?.({ step: "commit_wait", seconds: 65 }); a.onProgress?.({ step: "done" }); return ENS; }),
    rotateKey: vi.fn(async () => 2),
    exportBackup: vi.fn(async (_p: string) => "BLOB"),
    importBackup: vi.fn(async (_b: string, _p: string) => {}),
    listInbox: vi.fn(async (_q: any) => ({ items: [ITEM], hasMore: false, skippedIncomplete: 0, ignoredAnnotations: 0 })),
    decrypt: vi.fn(async (_i: any) => ({ text: "olá", category: "saude", epoch: 202611, key: "0x01" })),
    statusOf: vi.fn(async (_k: string) => "new"),
    setStatus: vi.fn(async (_k: string, _s: string) => {}),
    reply: vi.fn(async (_i: any, _t: string) => {}),
    addJournalist: vi.fn(async (_a: any) => {}),
    revokeJournalist: vi.fn(async (_l: string) => ({ rotateRecommended: true as const })),
    listExpiring: vi.fn(async (_w: number) => [ITEM]),
    renew: vi.fn(async (_k: string, _r: number) => "extended" as const),
    ...over,
  };
  return { c: createPanelController(client as never, { role }), client };
}

describe("cadastro e chaves", () => {
  it("mostra_o_andamento_do_cadastro_e_termina_com_a_redacao_e_a_versao", async () => {
    const { c } = make();
    const seen: string[] = [];
    c.subscribe((s) => s.progress && seen.push(s.progress.step));
    await c.register({ label: "investiga", categories: ["saude"], maxBytes: 50_000, attachments: false });
    expect(seen).toContain("commit_wait");
    expect(c.state).toMatchObject({ busy: false, newsroom: { name: "investiga.eth" }, keyVersion: 1, progress: undefined });
  });

  it("repassa_a_politica_ao_cliente", async () => {
    const { c, client } = make();
    await c.register({ label: "investiga", categories: ["saude", "corrupcao"], maxBytes: 50_000, attachments: true });
    expect(client.registerNewsroom).toHaveBeenCalledWith(expect.objectContaining({ label: "investiga", policy: { categories: ["saude", "corrupcao"], maxBytes: 50_000, attachments: true, epoch: "monthly" } }));
  });

  it("erro_do_cliente_aparece_com_a_causa", async () => {
    const { c } = make({ registerNewsroom: vi.fn(async () => { throw new NewsroomError("invalid_input", "A política precisa de ao menos uma categoria."); }) });
    await c.register({ label: "x", categories: [], maxBytes: 1, attachments: false });
    expect(c.state.error).toEqual({ code: "invalid_input", message: "A política precisa de ao menos uma categoria." });
    expect(c.state.busy).toBe(false);
  });

  it("erro_inesperado_vira_mensagem_generica_sem_detalhes", async () => {
    const { c } = make({ rotateKey: vi.fn(async () => { throw new Error("rpc 10.0.0.1 caiu"); }) });
    await c.rotate();
    expect(c.state.error?.message).not.toContain("10.0.0.1");
    expect(c.state.error?.code).toBe("unexpected");
  });

  it("rotaciona_e_atualiza_a_versao", async () => {
    const { c } = make();
    await c.rotate();
    expect(c.state.keyVersion).toBe(2);
    expect(c.state.notice).toMatch(/versão 2/);
  });

  it("exporta_o_backup_e_importa_atualizando_a_redacao", async () => {
    const { c, client } = make();
    await c.exportBackup("senha-forte-123");
    expect(c.state.backupText).toBe("BLOB");
    client.newsroom.mockReturnValue(ENS);
    await c.importBackup("BLOB", "senha-forte-123");
    expect(c.state).toMatchObject({ newsroom: { name: "investiga.eth" }, keyVersion: 1 });
  });

  it("senha_errada_no_import_mostra_o_erro", async () => {
    const { c } = make({ importBackup: vi.fn(async () => { throw new NewsroomError("wrong_password", "Senha incorreta ou backup adulterado."); }) });
    await c.importBackup("BLOB", "errada-errada");
    expect(c.state.error?.code).toBe("wrong_password");
  });
});

describe("caixa de entrada", () => {
  it("carrega_a_lista_com_os_filtros", async () => {
    const { c, client } = make();
    await c.loadInbox({ status: "new", category: "saude" });
    expect(client.listInbox).toHaveBeenCalledWith(expect.objectContaining({ status: "new", category: "saude" }));
    expect(c.state.inbox?.items).toHaveLength(1);
  });

  it("abrir_decifra_localmente_e_mostra_o_status", async () => {
    const { c } = make();
    await c.loadInbox({});
    await c.open("0x01");
    expect(c.state.opened).toMatchObject({ text: "olá", status: "new", key: "0x01" });
    expect(c.state.opened?.envelope).toEqual(new Uint8Array([1]));
  });

  it("falta_de_chave_mostra_a_causa_e_nao_abre", async () => {
    const { c } = make({ decrypt: vi.fn(async () => { throw new NewsroomError("missing_key", "Falta a chave da versão 1."); }) });
    await c.loadInbox({});
    await c.open("0x01");
    expect(c.state.opened).toBeUndefined();
    expect(c.state.error?.code).toBe("missing_key");
  });

  it("abrir_um_item_que_nao_esta_na_lista_e_ignorado", async () => {
    const { c, client } = make();
    await c.open("0xff");
    expect(client.decrypt).not.toHaveBeenCalled();
  });

  it("mudar_o_status_registra_anotacao_e_atualiza_a_tela", async () => {
    const { c, client } = make();
    await c.loadInbox({});
    await c.open("0x01");
    client.statusOf.mockResolvedValue("review");
    await c.setStatus("0x01", "review");
    expect(client.setStatus).toHaveBeenCalledWith("0x01", "review");
    expect(c.state.opened?.status).toBe("review");
  });

  it("responder_envia_ao_mailbox_e_avisa", async () => {
    const { c, client } = make();
    await c.loadInbox({});
    await c.reply("0x01", "Recebemos.");
    expect(client.reply).toHaveBeenCalledWith(ITEM, "Recebemos.");
    expect(c.state.notice).toMatch(/resposta enviada/i);
  });
});

describe("chaves de leitura dos jornalistas", () => {
  it("gera_o_par_em_base64url_para_o_jornalista_guardar", () => {
    const { c } = make();
    expect(c.newReaderKey()).toEqual({ publicKey: "AQ", privateKey: "Ag" });
  });

  it("compartilha_o_chaveiro_para_a_chave_publica_informada", async () => {
    const { c, client } = make();
    await c.shareKeyring("AQ");
    expect(client.shareKeyring).toHaveBeenCalledWith(new Uint8Array([1]));
    expect(c.state.sharedText).toBe("SHARED");
  });

  it("importa_o_chaveiro_e_atualiza_a_redacao", async () => {
    const { c, client } = make();
    client.newsroom.mockReturnValue(ENS);
    await c.importShared("SHARED", { publicKey: "AQ", privateKey: "Ag" });
    expect(c.state).toMatchObject({ newsroom: { name: "investiga.eth" }, keyVersion: 1 });
  });

  it("chaveiro_para_outra_chave_mostra_o_erro", async () => {
    const { c } = make({ importSharedKeyring: vi.fn(() => { throw new NewsroomError("cannot_decrypt", "Este chaveiro não foi cifrado para a sua chave de leitura."); }) });
    await c.importShared("SHARED", { publicKey: "AQ", privateKey: "Ag" });
    expect(c.state.error?.code).toBe("cannot_decrypt");
  });
});

describe("equipe e retenção", () => {
  it("cadastra_jornalista", async () => {
    const { c, client } = make();
    const pub = new Uint8Array(32).fill(3);
    await c.addJournalist({ label: "maria", address: "0xa63A63047e362EE0B8af09489DCA1dc172E507ca", readerPublicKey: pub });
    expect(client.addJournalist).toHaveBeenCalledWith({ label: "maria", address: "0xa63A63047e362EE0B8af09489DCA1dc172E507ca", readerPublicKey: pub });
    expect(c.state.notice).toMatch(/maria/);
  });

  it("revogar_avisa_para_girar_a_chave", async () => {
    const { c } = make();
    await c.revokeJournalist("maria");
    expect(c.state.notice).toMatch(/gire a chave/i);
  });

  it("lista_o_que_vence_e_renova_tudo", async () => {
    const { c, client } = make();
    await c.loadExpiring(30 * 24 * 3600);
    expect(c.state.expiring).toHaveLength(1);
    await c.renewAll(150 * 24 * 3600);
    expect(client.renew).toHaveBeenCalledWith("0x01", 150 * 24 * 3600);
    expect(c.state.notice).toMatch(/1 denúncia/);
  });
});

describe("papéis: a regra vale no código", () => {
  const forbidden = (c: ReturnType<typeof make>["c"]) => expect(c.state.error?.code).toBe("forbidden");

  it("jornalista_nao_administra_a_redacao", async () => {
    const { c, client } = make({}, "journalist");
    await c.rotate(); forbidden(c);
    await c.exportBackup("senha-forte-123"); forbidden(c);
    await c.importBackup("B", "senha-forte-123"); forbidden(c);
    await c.addJournalist({ label: "x", address: "0xa63A63047e362EE0B8af09489DCA1dc172E507ca", readerPublicKey: new Uint8Array(32) }); forbidden(c);
    await c.revokeJournalist("x"); forbidden(c);
    await c.shareKeyring("AQ"); forbidden(c);
    await c.updatePolicy({ categories: ["a"], maxBytes: 1, attachments: false, epoch: "monthly" }); forbidden(c);
    await c.register({ label: "x", categories: ["a"], maxBytes: 1, attachments: false }); forbidden(c);
    for (const fn of [client.rotateKey, client.exportBackup, client.importBackup, client.addJournalist, client.revokeJournalist, client.shareKeyring, client.updatePolicy, client.registerNewsroom]) expect(fn).not.toHaveBeenCalled();
  });

  it("jornalista_trabalha_a_caixa_de_entrada", async () => {
    const { c, client } = make({}, "journalist");
    await c.loadInbox({});
    await c.open("0x01");
    await c.setStatus("0x01", "review");
    await c.reply("0x01", "oi");
    await c.loadExpiring(1);
    expect(c.state.error).toBeUndefined();
    expect(client.reply).toHaveBeenCalled();
    expect(c.newReaderKey()).toEqual({ publicKey: "AQ", privateKey: "Ag" });
    await c.importShared("S", { publicKey: "AQ", privateKey: "Ag" });
    expect(c.state.error).toBeUndefined();
  });

  it("visitante_so_pode_cadastrar_a_redacao", async () => {
    const { c, client } = make({}, "visitor");
    await c.loadInbox({}); forbidden(c);
    await c.open("0x01");
    expect(client.listInbox).not.toHaveBeenCalled();
    expect(c.newReaderKey()).toBeUndefined();
    await c.register({ label: "nova", categories: ["a"], maxBytes: 10, attachments: false });
    expect(client.registerNewsroom).toHaveBeenCalled();
  });

  it("sem_papel_definido_nada_e_permitido", async () => {
    const c = createPanelController(make().client as never);
    await c.loadInbox({});
    forbidden(c);
  });

  it("mudar_o_papel_vale_para_as_proximas_acoes", async () => {
    const { c } = make({}, "visitor");
    await c.loadInbox({});
    forbidden(c);
    c.setRole("journalist");
    await c.loadInbox({});
    expect(c.state.error).toBeUndefined();
  });
});

describe("andamento, transações e alertas", () => {
  it("conta_as_transacoes_do_cadastro_e_guarda_os_links", async () => {
    const { c } = make();
    c.addTx({ hash: "0x" + "01".repeat(32) as `0x${string}`, chainId: "0xaa36a7" });
    c.addTx({ hash: "0x" + "02".repeat(32) as `0x${string}`, chainId: "0xaa36a7" });
    expect(c.state.txCount).toBe(2);
    expect(c.state.txs.map((t) => t.hash.slice(2, 4))).toEqual(["01", "02"]);
  });

  it("o_cadastro_zera_o_contador_no_inicio", async () => {
    const { c } = make();
    c.addTx({ hash: ("0x" + "01".repeat(32)) as `0x${string}`, chainId: "0xaa36a7" });
    await c.register({ label: "investiga", categories: ["saude"], maxBytes: 1000, attachments: false });
    expect(c.state.txCount).toBe(0);
  });

  it("informa_anotacoes_ignoradas_na_caixa_de_entrada", async () => {
    const { c } = make({ listInbox: vi.fn(async () => ({ items: [ITEM], hasMore: false, skippedIncomplete: 0, ignoredAnnotations: 3 })) });
    await c.loadInbox({});
    expect(c.state.ignoredAnnotations).toBe(3);
  });

  it("marca_o_backup_como_feito_e_gira_a_chave_desfaz_isso", async () => {
    const { c } = make();
    await c.exportBackup("senha-forte-123");
    expect(c.state.backupDone).toBe(true);
    await c.rotate();
    expect(c.state.backupDone).toBe(false);
  });

  it("publica_a_politica", async () => {
    const { c, client } = make();
    const p = { categories: ["saude"], maxBytes: 5000, attachments: true, epoch: "monthly" as const };
    await c.updatePolicy(p);
    expect(client.updatePolicy).toHaveBeenCalledWith(p);
    expect(c.state.notice).toMatch(/política/i);
  });

  it("registra_se_as_chaves_estao_carregadas_depois_de_importar", async () => {
    const { c, client } = make();
    client.newsroom.mockReturnValue(ENS);
    await c.importBackup("B", "senha-forte-123");
    expect(c.state.keysLoaded).toBe(true);
  });
});

describe("o backup não fica refém de outras operações lentas", () => {
  it("carregar_a_caixa_de_entrada_nao_marca_o_painel_como_ocupado", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const { c } = make({ listInbox: vi.fn(async () => { await slow; return { items: [], hasMore: false, skippedIncomplete: 0, ignoredAnnotations: 0 }; }) });
    const pending = c.loadInbox({});
    expect(c.state.loading).toBe(true);
    expect(c.state.busy).toBe(false);
    await c.exportBackup("senha-forte-123"); // enquanto a leitura lenta ainda corre
    expect(c.state.backupText).toBe("BLOB");
    expect(c.state.error).toBeUndefined();
    release();
    await pending;
    expect(c.state.loading).toBe(false);
  });

  it("verificar_o_que_vence_tambem_nao_bloqueia_e_erros_aparecem", async () => {
    const { c } = make({ listExpiring: vi.fn(async () => { throw new Error("rpc"); }) });
    await c.loadExpiring(1);
    expect(c.state.loading).toBe(false);
    expect(c.state.error?.code).toBe("unexpected");
  });

  it("gerar_o_backup_avisa_o_que_fazer_a_seguir", async () => {
    const { c } = make();
    await c.exportBackup("senha-forte-123");
    expect(c.state.notice).toMatch(/baixar/i);
  });
});
