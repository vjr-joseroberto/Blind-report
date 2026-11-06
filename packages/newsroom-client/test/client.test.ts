import { toBase64Url } from "@safe-whistle/core";
import { newKeypair, openReply } from "@safe-whistle/crypto";
import type { AdminStep } from "@safe-whistle/ens-client";
import { describe, expect, it } from "vitest";
import { NewsroomError, createNewsroomClient } from "../src/index.ts";
import { createStore } from "@safe-whistle/arkiv-store";
import { ENS, JOURNALIST, NEWSROOM_ACCOUNT, POLICY, STRANGER, makeDeps, publishAs } from "./helpers.ts";

const registered = async (f = makeDeps()) => {
  const client = createNewsroomClient(f.deps);
  await client.registerNewsroom({ label: "investiga", policy: POLICY });
  return { f, client };
};
const bytesIn = (v: unknown, needle: Uint8Array): boolean => {
  const hay = JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? `B64:${toBase64Url(x)}` : typeof x === "bigint" ? x.toString() : x));
  return hay.includes(toBase64Url(needle)) || hay.includes(Buffer.from(needle).toString("hex"));
};

describe("1. cadastro", () => {
  it("registra_a_redacao_e_informa_a_espera_do_commit", async () => {
    const client = createNewsroomClient(makeDeps().deps);
    const steps: AdminStep[] = [];
    const n = await client.registerNewsroom({ label: "investiga", policy: POLICY, onProgress: (e) => steps.push(e) });
    expect(n.name).toBe("investiga.eth");
    expect(steps.map((s) => s.step)).toEqual(["resolver", "commit", "commit_wait", "register", "records", "registry", "done"]);
    expect(steps.find((s) => s.step === "commit_wait")?.seconds).toBe(65);
  });

  it("publica_chave_e_politica_com_versao_1_e_a_conta_como_custodiante", async () => {
    const { f, client } = await registered();
    expect(f.admin.createNewsroom).toHaveBeenCalledWith(expect.objectContaining({ label: "investiga", version: 1, policy: POLICY, custodian: NEWSROOM_ACCOUNT }));
    expect(f.admin.createNewsroom.mock.calls[0]![0].publicKey).toEqual(client.currentKey().publicKey);
    expect(client.currentKey().version).toBe(1);
  });

  it("recusa_politica_invalida_antes_de_gastar_gas", async () => {
    const f = makeDeps();
    await expect(createNewsroomClient(f.deps).registerNewsroom({ label: "investiga", policy: { ...POLICY, categories: [] } })).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.admin.createNewsroom).not.toHaveBeenCalled();
  });

  it("sem_redacao_as_operacoes_dependentes_falham_com_erro_claro", async () => {
    const client = createNewsroomClient(makeDeps().deps);
    await expect(client.listInbox({})).rejects.toMatchObject({ code: "no_newsroom" });
    await expect(client.rotateKey()).rejects.toMatchObject({ code: "no_newsroom" });
    expect(() => client.currentKey()).toThrow(NewsroomError);
  });
});

describe("2. chaves", () => {
  it("gera_a_chave_privada_localmente_e_nunca_a_envia", async () => {
    const { f, client } = await registered();
    const priv = client.exportKeyringForTest().keys[0]!.privateKey;
    await client.rotateKey();
    await client.addJournalist({ label: "maria", address: JOURNALIST, readerPublicKey: newKeypair().publicKey });
    expect(f.calls.length).toBeGreaterThan(2);
    for (const call of f.calls) expect(bytesIn(call, priv)).toBe(false);
  });

  it("rotaciona_com_versao_maior_e_guarda_as_chaves_antigas", async () => {
    const { f, client } = await registered();
    const old = client.currentKey();
    await client.rotateKey();
    expect(client.currentKey().version).toBe(2);
    expect(f.admin.rotateKey).toHaveBeenCalledWith(expect.objectContaining({ version: 2, resolver: ENS.resolver, name: "investiga.eth" }));
    expect(client.currentKey().publicKey).not.toEqual(old.publicKey);
    expect(client.keyVersions()).toEqual([1, 2]);
  });

  it("se_a_publicacao_da_chave_nova_falha_a_chave_nao_entra_no_chaveiro", async () => {
    const { f, client } = await registered();
    f.admin.rotateKey.mockRejectedValueOnce(new Error("rpc fora"));
    await expect(client.rotateKey()).rejects.toThrow();
    expect(client.keyVersions()).toEqual([1]);
  });

  it("exporta_a_chave_protegida_por_senha_e_importa_e_restaura", async () => {
    const { f, client } = await registered();
    await client.rotateKey();
    const blob = await client.exportBackup("senha-forte-123");
    expect(blob).not.toContain(toBase64Url(client.exportKeyringForTest().keys[0]!.privateKey));
    const other = createNewsroomClient(makeDeps().deps);
    await other.importBackup(blob, "senha-forte-123");
    expect(other.keyVersions()).toEqual([1, 2]);
    expect(other.currentKey().publicKey).toEqual(client.currentKey().publicKey);
    expect(other.newsroom()).toEqual(ENS);
    void f;
  });

  it("senha_errada_falha", async () => {
    const { client } = await registered();
    const blob = await client.exportBackup("senha-forte-123");
    await expect(createNewsroomClient(makeDeps().deps).importBackup(blob, "errada-errada")).rejects.toMatchObject({ code: "wrong_password" });
  });

  it("backup_malformado_ou_de_outro_tipo_e_recusado", async () => {
    const c = createNewsroomClient(makeDeps().deps);
    await expect(c.importBackup("lixo", "senha-forte-123")).rejects.toMatchObject({ code: "invalid_backup" });
    const { lockWithPassword } = await import("@safe-whistle/crypto");
    const wrong = await lockWithPassword(new TextEncoder().encode('{"v":1}'), "senha-forte-123", { iterations: 1000 });
    await expect(c.importBackup(wrong, "senha-forte-123")).rejects.toMatchObject({ code: "invalid_backup" });
  });

  it("exportar_sem_chaves_falha", async () => {
    await expect(createNewsroomClient(makeDeps().deps).exportBackup("senha-forte-123")).rejects.toMatchObject({ code: "no_newsroom" });
  });
});

describe("política da redação", () => {
  it("atualiza_a_politica_no_ens_do_resolver_da_redacao", async () => {
    const { f, client } = await registered();
    const policy = { categories: ["saude"], maxBytes: 50_000, attachments: false, epoch: "monthly" as const };
    await client.updatePolicy(policy);
    expect(f.admin.setText).toHaveBeenCalledWith({ name: ENS.name, resolver: ENS.resolver, key: "denuncia.policy", value: JSON.stringify(policy) });
  });

  it("recusa_politica_invalida_antes_de_gastar_gas", async () => {
    const { f, client } = await registered();
    await expect(client.updatePolicy({ categories: [], maxBytes: 1, attachments: false, epoch: "monthly" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.admin.setText).not.toHaveBeenCalled();
  });

  it("exige_a_redacao_carregada", async () => {
    await expect(createNewsroomClient(makeDeps().deps).updatePolicy(POLICY)).rejects.toMatchObject({ code: "no_newsroom" });
  });
});

describe("3. jornalistas", () => {
  it("cadastra_e_revoga", async () => {
    const { f, client } = await registered();
    const reader = newKeypair();
    await client.addJournalist({ label: "maria", address: JOURNALIST, readerPublicKey: reader.publicKey, validForSeconds: 1000 });
    expect(f.admin.addJournalist).toHaveBeenCalledWith({ newsroom: ENS, label: "maria", address: JOURNALIST, readerKey: reader.publicKey, validForSeconds: 1000 });
    const r = await client.revokeJournalist("maria");
    expect(f.admin.revokeJournalist).toHaveBeenCalledWith({ newsroom: ENS, label: "maria" });
    expect(r.rotateRecommended).toBe(true);
  });

  it("renova_o_jornalista", async () => {
    const { f, client } = await registered();
    await client.renewJournalist("maria", 3600);
    expect(f.admin.renewJournalist).toHaveBeenCalledWith({ newsroom: ENS, label: "maria", validForSeconds: 3600 });
  });

  it("o_jornalista_recebe_o_chaveiro_cifrado_para_a_sua_chave_e_decifra", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    await client.rotateKey();
    const sub1 = await publishAs(f, { version: 1, publicKey: client.keyFor(1).publicKey }, { text: "antiga" });
    const sub2 = await publishAs(f, client.currentKey(), { text: "nova" });
    const reader = newKeypair();
    const shared = client.shareKeyring(reader.publicKey);
    expect(shared).not.toContain(toBase64Url(client.keyFor(1).privateKey));

    const journalist = createNewsroomClient({ ...f.deps, account: JOURNALIST });
    journalist.importSharedKeyring(shared, reader);
    expect(journalist.newsroom()).toEqual(ENS);
    expect(journalist.keyVersions()).toEqual([1, 2]);
    expect((await journalist.decrypt((await journalist.listInbox({})).items.find((i) => i.key === sub1.entity)!)).text).toBe("antiga");
    expect((await journalist.decrypt((await journalist.listInbox({})).items.find((i) => i.key === sub2.entity)!)).text).toBe("nova");
  });

  it("chaveiro_compartilhado_com_outra_chave_nao_abre", async () => {
    const { client } = await registered();
    const shared = client.shareKeyring(newKeypair().publicKey);
    const j = createNewsroomClient(makeDeps().deps);
    expect(() => j.importSharedKeyring(shared, newKeypair())).toThrow(NewsroomError);
  });
});

describe("3b. chave de leitura", () => {
  it("cada_jornalista_gera_o_proprio_par_de_chaves", () => {
    const c = createNewsroomClient(makeDeps().deps);
    const a = c.newReaderKey();
    expect(a.publicKey).toHaveLength(32);
    expect(c.newReaderKey().privateKey).not.toEqual(a.privateKey);
  });
});

describe("4. lista", () => {
  it("lista_por_status_e_categoria", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const a = await publishAs(f, client.currentKey(), { category: "saude" });
    await publishAs(f, client.currentKey(), { category: "corrupcao" });
    await client.setStatus(a.entity, "review");
    expect((await client.listInbox({})).items).toHaveLength(2);
    expect((await client.listInbox({ category: "corrupcao" })).items).toHaveLength(1);
    const reviewed = await client.listInbox({ status: "review" });
    expect(reviewed.items.map((i) => i.key)).toEqual([a.entity]);
    expect((await client.listInbox({ status: "new" })).items).toHaveLength(1);
  });

  it("pagina_em_blocos", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    for (let i = 0; i < 5; i++) await publishAs(f, client.currentKey());
    const p1 = await client.listInbox({ limit: 2, offset: 0 });
    const p3 = await client.listInbox({ limit: 2, offset: 4 });
    expect(p1.items).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    expect(p3.items).toHaveLength(1);
    expect(p3.hasMore).toBe(false);
  });
});

describe("5. decifragem", () => {
  it("decifra_texto_e_anexo", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const data = new Uint8Array([1, 2, 3, 250]);
    await publishAs(f, client.currentKey(), { text: "olá ção", attachment: { name: "a.bin", data } });
    const item = (await client.listInbox({})).items[0]!;
    const out = await client.decrypt(item);
    expect(out.text).toBe("olá ção");
    expect(out.attachment?.name).toBe("a.bin");
    expect([...out.attachment!.data]).toEqual([...data]);
    expect(out.category).toBe("saude");
  });

  it("envelope_de_versao_antiga_usa_a_chave_antiga", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const v1 = client.currentKey();
    await publishAs(f, v1, { text: "da versão 1" });
    await client.rotateKey();
    const item = (await client.listInbox({})).items[0]!;
    expect(item.pubkeyVersion).toBe(1);
    expect((await client.decrypt(item)).text).toBe("da versão 1");
  });

  it("nao_decifra_sem_a_chave_da_versao", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    await publishAs(f, { version: 7, publicKey: newKeypair().publicKey });
    const item = (await client.listInbox({})).items[0]!;
    await expect(client.decrypt(item)).rejects.toMatchObject({ code: "missing_key" });
  });

  it("envelope_cifrado_para_outra_chave_com_a_mesma_versao_falha_com_erro_claro", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    await publishAs(f, { version: 1, publicKey: newKeypair().publicKey });
    await expect(client.decrypt((await client.listInbox({})).items[0]!)).rejects.toMatchObject({ code: "cannot_decrypt" });
  });
});

describe("6. status", () => {
  it("registra_anotacao_sem_alterar_o_envelope", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    const before = (await client.listInbox({})).items[0]!;
    await client.setStatus(sub.entity, "verified");
    const after = (await client.listInbox({})).items[0]!;
    expect(after.status).toBe("verified");
    expect(after.envelope).toEqual(before.envelope);
    expect(after.contentHash).toBe(before.contentHash);
    expect(await client.statusOf(sub.entity)).toBe("verified");
  });
});

describe("A3 autoria das anotações", () => {
  const MARIA = `maria.${ENS.name}`;
  const asJournalist = (f: ReturnType<typeof makeDeps>, authorName: string | undefined = MARIA) =>
    createNewsroomClient({ ...f.deps, account: JOURNALIST, store: createStore(f.chain.backendFor(JOURNALIST)), authorName });

  it("status_forjado_por_carteira_qualquer_nao_aparece", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    await createStore(f.chain.backendFor(STRANGER)).annotate({ newsroom: ENS.name, denunciaKey: sub.entity, status: "discarded", journalist: JOURNALIST, authorName: MARIA });
    const r = await client.listInbox({});
    expect(r.items[0]!.status).toBe("new");
    expect(await client.statusOf(sub.entity)).toBe("new");
  });

  it("status_do_jornalista_ativo_aparece_e_leva_o_nome_dele", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    f.owners[MARIA] = JOURNALIST;
    const sub = await publishAs(f, client.currentKey());
    const journalist = asJournalist(f);
    journalist.useNewsroom(ENS);
    await journalist.setStatus(sub.entity, "review");
    expect((await client.listInbox({})).items[0]!.status).toBe("review");
    expect((await createStore(f.chain.backendFor(JOURNALIST)).listAnnotations({ newsroom: ENS.name }))[0]).toMatchObject({ authorName: MARIA });
  });

  it("status_do_administrador_vale_sem_nome", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    await client.setStatus(sub.entity, "verified");
    expect((await client.listInbox({})).items[0]!.status).toBe("verified");
  });

  it("status_do_jornalista_revogado_e_ignorado", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    f.owners[MARIA] = JOURNALIST;
    const sub = await publishAs(f, client.currentKey());
    const journalist = asJournalist(f);
    journalist.useNewsroom(ENS);
    await journalist.setStatus(sub.entity, "review");
    f.owners[MARIA] = null; // revogado
    const r = await client.listInbox({});
    expect(r.items[0]!.status).toBe("new");
    expect(r.ignoredAnnotations).toBe(1);
  });

  it("inbox_informa_quantas_anotacoes_foram_ignoradas", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    const stranger = createStore(f.chain.backendFor(STRANGER));
    for (const status of ["discarded", "verified"] as const) await stranger.annotate({ newsroom: ENS.name, denunciaKey: sub.entity, status, journalist: JOURNALIST });
    expect((await client.listInbox({})).ignoredAnnotations).toBe(2);
  });

  it("jornalista_sem_nome_declarado_e_ignorado_se_nao_for_o_custodiante", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    const journalist = asJournalist(f, undefined);
    journalist.useNewsroom(ENS);
    await journalist.setStatus(sub.entity, "review");
    expect((await client.listInbox({})).items[0]!.status).toBe("new");
  });
});

describe("7. resposta", () => {
  it("cifra_para_o_mailbox_da_denuncia_e_so_a_fonte_abre", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    await client.reply((await client.listInbox({})).items[0]!, "Recebemos. Podemos conversar?");
    const { mailboxId } = await import("@safe-whistle/crypto");
    const rows = await f.relayerStore.getReplies(mailboxId(sub.receipt.mailboxPub));
    expect(rows).toHaveLength(1);
    const { decodeReply } = await import("@safe-whistle/core");
    expect(decodeReply(openReply(rows[0]!.sealed, sub.receipt))).toEqual({ newsroom: ENS.name, text: "Recebemos. Podemos conversar?" });
    expect(rows[0]!.creator.toLowerCase()).toBe(NEWSROOM_ACCOUNT.toLowerCase());
    expect(() => openReply(rows[0]!.sealed, newKeypair() as never)).toThrow();
  });

  it("resposta_de_jornalista_leva_o_nome_e_o_criador_real", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    const journalist = createNewsroomClient({ ...f.deps, account: JOURNALIST, store: createStore(f.chain.backendFor(JOURNALIST)), authorName: `maria.${ENS.name}` });
    journalist.useNewsroom(ENS);
    await journalist.reply((await client.listInbox({})).items[0]!, "Olá, aqui é a Maria.");
    const { mailboxId } = await import("@safe-whistle/crypto");
    const [row] = await f.relayerStore.getReplies(mailboxId(sub.receipt.mailboxPub));
    expect(row!.creator.toLowerCase()).toBe(JOURNALIST.toLowerCase());
    expect(row!.authorName).toBe(`maria.${ENS.name}`);
  });

  it("resposta_vazia_e_recusada", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    await publishAs(f, client.currentKey());
    await expect(client.reply((await client.listInbox({})).items[0]!, "")).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("8. retenção", () => {
  it("lista_denuncias_proximas_do_vencimento_e_renova", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    expect(await client.listExpiring(10 * 24 * 3600)).toHaveLength(0);
    f.chain.advanceSeconds(145 * 24 * 3600);
    const soon = await client.listExpiring(10 * 24 * 3600);
    expect(soon.map((s) => s.key)).toEqual([sub.entity]);
    expect(await client.renew(sub.entity, 150 * 24 * 3600)).toBe("extended");
    expect(await client.listExpiring(10 * 24 * 3600)).toHaveLength(0);
  });
});

describe("conferência com o ENS", () => {
  it("confere_se_a_chave_publicada_e_a_do_aparelho", async () => {
    const { f, client } = await registered();
    const k = client.currentKey();
    f.reader.resolveNewsroom.mockResolvedValueOnce({ pubkeyVersion: 1, publicKey: k.publicKey } as never);
    expect(await client.verifyPublished()).toEqual({ ok: true, onChainVersion: 1 });
    f.reader.resolveNewsroom.mockResolvedValueOnce({ pubkeyVersion: 2, publicKey: k.publicKey } as never);
    expect((await client.verifyPublished()).ok).toBe(false);
    f.reader.resolveNewsroom.mockResolvedValueOnce({ pubkeyVersion: 1, publicKey: newKeypair().publicKey } as never);
    expect((await client.verifyPublished()).ok).toBe(false);
  });
});
