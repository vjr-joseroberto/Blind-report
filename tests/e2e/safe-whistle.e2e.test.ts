// Casos de uso de ponta a ponta, sem navegador: ENS (fork da Sepolia) + Arkiv (nó local) + relayer real com World simulado.
import { toBase64Url } from "@safe-whistle/core";
import { encodeReply } from "@safe-whistle/core";
import { mailboxId, newKeypair, sealReply } from "@safe-whistle/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARKIV, FORK, RELAYER_URL, arkivStore, newsroomSide, sleep, sourceSide, startWorld, type World } from "./world.ts";

let w: World;
let journalist: ReturnType<typeof newsroomSide>;
let reader: ReturnType<ReturnType<typeof newsroomSide>["client"]["newReaderKey"]>;
const SEGREDO = "DENUNCIA-FICTICIA-E2E-contrato-superfaturado-7731";
const secrets: Uint8Array[] = []; // bytes que nunca podem aparecer em requisições
let receiptAna: Awaited<ReturnType<ReturnType<typeof sourceSide>["client"]["submit"]>>["receipt"];
const ana = sourceSide("ana");
const sources = [ana];

beforeAll(async () => {
  w = await startWorld();
  journalist = newsroomSide(w.journalist, false, `maria.${w.ens.name}`);
}, 400_000);

afterAll(async () => {
  await w?.stop();
});

describe("UC-01 a UC-03: o administrador cadastra a redação e o jornalista", () => {
  it("cadastra_a_redacao_informando_a_espera_do_commit", () => {
    expect(w.ens.name).toMatch(/\.eth$/);
    expect(w.steps).toEqual(["resolver", "commit", "commit_wait", "register", "records", "registry", "done"]);
  });

  it("a_chave_publica_e_a_politica_estao_no_ens", async () => {
    const info = await ana.client.lookupNewsroom(w.ens.name);
    expect(info.pubkeyVersion).toBe(1);
    expect(info.publicKey).toEqual(w.admin.client.currentKey().publicKey);
    expect(info.policy.categories).toEqual(["saude", "corrupcao"]);
    expect(info.custodian.toLowerCase()).toBe(w.owner.address.toLowerCase());
  });

  it("cadastra_o_jornalista_e_entrega_o_chaveiro_cifrado_para_a_chave_dele", async () => {
    reader = journalist.client.newReaderKey();
    await w.admin.client.addJournalist({ label: "maria", address: w.journalist.address, readerPublicKey: reader.publicKey });
    const real = ana.real as unknown as { isActiveJournalist(n: string): Promise<boolean> };
    expect(await real.isActiveJournalist(`maria.${w.ens.name}`)).toBe(true);
    journalist.client.importSharedKeyring(w.admin.client.shareKeyring(reader.publicKey), reader);
    expect(journalist.client.newsroom()?.name).toBe(w.ens.name);
    expect(journalist.client.keyVersions()).toEqual([1]);
  });

  it("outra_pessoa_nao_abre_o_chaveiro", () => {
    const outsider = newsroomSide(w.journalist, false);
    expect(() => outsider.client.importSharedKeyring(w.admin.client.shareKeyring(newKeypair().publicKey), newKeypair())).toThrow();
  });
});

describe("UC-05 e UC-06: a fonte consulta, envia e recebe o recibo", () => {
  it("envia_a_denuncia_e_recebe_o_recibo", async () => {
    const r = await ana.client.submit({ newsroom: w.ens.name, category: "saude", text: SEGREDO });
    receiptAna = r.receipt;
    secrets.push(r.receipt.salt, r.receipt.mailboxPriv);
    expect(r.receipt.newsroom).toBe(w.ens.name);
    expect(r.receipt.key).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("a_denuncia_aparece_na_caixa_de_entrada_da_redacao", async () => {
    const { items } = await w.admin.client.listInbox({});
    expect(items.map((i) => i.key)).toContain(receiptAna.key);
  });
});

describe("UC-07 e UC-08: o jornalista lista, decifra e classifica", () => {
  it("lista_e_decifra_com_o_chaveiro_recebido", async () => {
    const { items } = await journalist.client.listInbox({});
    const item = items.find((i) => i.key === receiptAna.key)!;
    expect(item.status).toBe("new");
    expect((await journalist.client.decrypt(item)).text).toBe(SEGREDO);
  });

  it("classifica_sem_alterar_o_envelope", async () => {
    const before = (await journalist.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    await journalist.client.setStatus(receiptAna.key as `0x${string}`, "review");
    const after = (await journalist.client.listInbox({ status: "review" })).items.find((i) => i.key === receiptAna.key)!;
    expect(after.status).toBe("review");
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.envelope).toEqual(before.envelope);
  });
});

describe("UC-09 e UC-10: o jornalista responde e a fonte lê com o recibo", () => {
  it("a_fonte_le_a_resposta_e_so_ela", async () => {
    const item = (await journalist.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    await journalist.client.reply(item, "Recebemos. Podemos falar por este canal?");
    const mine = await ana.client.readReplies(receiptAna);
    expect(mine.replies.map((r) => [r.author, r.text])).toEqual([[`maria.${w.ens.name}`, "Recebemos. Podemos falar por este canal?"]]);
    expect(mine.ignored).toBe(0);
    const other = sourceSide("bia");
    const bia = await other.client.submit({ newsroom: w.ens.name, category: "corrupcao", text: "outra denúncia" });
    sources.push(other);
    secrets.push(bia.receipt.salt, bia.receipt.mailboxPriv);
    expect(await other.client.readReplies(bia.receipt)).toEqual({ replies: [], ignored: 0 });
  });
});

describe("UC-11 e UC-12: verificação de hash e data e prova de autoria", () => {
  it("confere_hash_e_data_do_arquivo_divulgado", async () => {
    const item = (await journalist.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    const r = await ana.client.verifyDocument({ newsroom: w.ens.name, envelope: item.envelope });
    expect(r).toMatchObject({ hashMatches: true, found: true, contentHash: receiptAna.contentHash });
    expect(r.createdAtBlock).toBeGreaterThan(0n);
  });

  it("prova_a_autoria_com_texto_e_sal_e_recusa_o_texto_errado", async () => {
    const item = (await journalist.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    expect(ana.client.proveAuthorship({ envelope: item.envelope, text: SEGREDO, salt: receiptAna.salt })).toBe(true);
    expect(ana.client.proveAuthorship({ envelope: item.envelope, text: "texto diferente", salt: receiptAna.salt })).toBe(false);
  });
});

describe("Fase 13: anotações e respostas só valem se vierem da redação", () => {
  const maria = () => `maria.${w.ens.name}`;
  const statusOfAna = async () => (await w.admin.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!.status;

  it("carteira_estranha_nao_consegue_mudar_o_status_nem_enganar_o_painel", async () => {
    expect(await statusOfAna()).toBe("review");
    await arkivStore(w.stranger.key).annotate({ newsroom: w.ens.name, denunciaKey: receiptAna.key as `0x${string}`, status: "discarded", journalist: w.journalist.address, authorName: maria() });
    expect(await statusOfAna()).toBe("review");
    expect((await w.admin.client.listInbox({})).ignoredAnnotations).toBeGreaterThanOrEqual(1);
  });

  it("resposta_forjada_cifrada_corretamente_para_a_fonte_e_ignorada", async () => {
    const forged = sealReply(receiptAna.mailboxPub, encodeReply({ newsroom: w.ens.name, text: "Mande seus documentos para este e-mail." }));
    await arkivStore(w.stranger.key).publishReply({ newsroom: w.ens.name, mailboxId: mailboxId(receiptAna.mailboxPub), sealed: forged, retentionSeconds: 3600, authorName: maria() });
    const r = await ana.client.readReplies(receiptAna);
    expect(r.replies.map((x) => x.text)).toEqual(["Recebemos. Podemos falar por este canal?"]);
    expect(r.ignored).toBe(1);
  });

  it("depois_de_revogar_o_jornalista_o_que_ele_fez_deixa_de_valer", async () => {
    expect((await w.admin.client.revokeJournalist("maria")).rotateRecommended).toBe(true);
    expect(await statusOfAna()).toBe("new");
    const r = await ana.client.readReplies(receiptAna);
    expect(r.replies).toEqual([]);
    expect(r.ignored).toBe(2);
  });

  it("o_administrador_continua_valendo_depois_da_revogacao", async () => {
    await w.admin.client.setStatus(receiptAna.key as `0x${string}`, "verified");
    expect(await statusOfAna()).toBe("verified");
    const item = (await w.admin.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    await w.admin.client.reply(item, "Resposta oficial da redação.");
    expect((await ana.client.readReplies(receiptAna)).replies.map((x) => [x.author, x.text])).toEqual([[w.ens.name, "Resposta oficial da redação."]]);
  });
});

describe("limite por pessoa, redação e época", () => {
  it("o_segundo_envio_da_mesma_pessoa_e_recusado", async () => {
    await expect(ana.client.submit({ newsroom: w.ens.name, category: "saude", text: "de novo" })).rejects.toMatchObject({ code: "limit_reached" });
  });
});

describe("rotação de chave durante o envio", () => {
  it("refaz_a_cifragem_e_o_jornalista_decifra_as_duas_versoes", async () => {
    const dani = sourceSide("dani");
    sources.push(dani);
    const old = await dani.real.resolveNewsroom(w.ens.name);
    expect(await w.admin.client.rotateKey()).toBe(2);
    dani.useStaleOnce(old); // a fonte ainda "lembra" a chave v1
    const r = await dani.client.submit({ newsroom: w.ens.name, category: "saude", text: "enviada durante a rotação" });
    secrets.push(r.receipt.salt, r.receipt.mailboxPriv);

    const item = (await w.admin.client.listInbox({})).items.find((i) => i.key === r.receipt.key)!;
    expect(item.pubkeyVersion).toBe(2);

    journalist.client.importSharedKeyring(w.admin.client.shareKeyring(reader.publicKey), reader);
    expect(journalist.client.keyVersions()).toEqual([1, 2]);
    const all = (await journalist.client.listInbox({})).items;
    const texts = await Promise.all(all.map(async (i) => (await journalist.client.decrypt(i)).text));
    expect(texts).toContain(SEGREDO);
    expect(texts).toContain("enviada durante a rotação");
  });
});

describe("retenção", () => {
  it("a_denuncia_renovada_permanece_e_a_nao_renovada_some", async () => {
    const mk = async (hash: string) =>
      (await w.relayerStore.publishSubmission({ newsroom: w.ens.name, category: "expira", epoch: 202611, contentHash: hash, pubkeyVersion: 1, envelope: new Uint8Array(200).fill(7), custodian: w.owner.address, retentionSeconds: 30 })).key;
    const keep = await mk("0x" + "aa".repeat(32));
    await mk("0x" + "bb".repeat(32));
    expect((await w.admin.client.listInbox({ category: "expira" })).items).toHaveLength(2);
    expect(await w.admin.client.renew(keep, 3600)).toBe("extended");
    await sleep(45_000);
    const left = (await w.admin.client.listInbox({ category: "expira" })).items;
    expect(left.map((i) => i.key)).toEqual([keep]);
  });
});

describe("RNF-01 privacidade", () => {
  it("nenhuma_requisicao_leva_texto_original_sal_chave_do_recibo_ou_chave_privada_da_redacao", () => {
    const privateKeys = w.admin.client.exportKeyringForTest().keys.flatMap((k) => [k.privateKey]);
    const all = [...sources.map((s) => s.recorder), journalist.recorder, w.admin.recorder];
    for (const rec of all) {
      expect(rec.anyBodyContains(SEGREDO)).toBe(false);
      expect(rec.anyBodyContains("outra denúncia")).toBe(false);
      for (const s of [...secrets, ...privateKeys]) {
        expect(rec.anyBodyContainsBytes(s)).toBe(false);
        expect(rec.anyBodyContains(toBase64Url(s))).toBe(false);
        expect(rec.anyBodyContains(Buffer.from(s).toString("hex"))).toBe(false);
      }
    }
  });

  it("o_log_do_relayer_nao_tem_texto_ip_nem_identificadores", () => {
    const text = w.logs.join("");
    expect(text.length).toBeGreaterThan(0);
    for (const leak of [SEGREDO, "outra denúncia", "nullifier"]) expect(text).not.toContain(leak);
    expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(text).not.toMatch(/\bproof\b/i);
  });
});

describe("RNF-04 e RNF-05 rede", () => {
  it("so_hosts_declarados_foram_contatados_e_so_localhost", () => {
    const all = [...sources.map((s) => s.recorder), journalist.recorder, w.admin.recorder];
    const hosts = new Set(all.flatMap((r) => r.hosts()));
    expect([...hosts]).toEqual(["127.0.0.1"]);
    expect([FORK, ARKIV, RELAYER_URL].every((u) => u.startsWith("http://127.0.0.1"))).toBe(true);
  });
});

