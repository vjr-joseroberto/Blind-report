import { actionFor, decodePayload, encodeReply, fromBase64Url, toBase64Url } from "@safe-whistle/core";
import { mailboxId, sealReply } from "@safe-whistle/crypto";
import { describe, expect, it } from "vitest";
import { ProofError, SourceError, createSourceClient, parseReceipt, serializeReceipt } from "../src/index.ts";
import { CUSTODIAN, EPOCH, MARIA_ADDR, NEWSROOM, SECRET, STRANGER, info, makeDeps, makeRelayer, openSent } from "./helpers.ts";

const clientOf = (f = makeDeps()) => ({ f, client: createSourceClient(f.deps) });
const send = (client: ReturnType<typeof createSourceClient>, over: Record<string, unknown> = {}) =>
  client.submit({ newsroom: NEWSROOM, category: "saude", text: SECRET, ...over } as never);
const textSent = (body: Record<string, any>) => decodePayload(openSent(body).plaintext).text;

describe("1. consulta", () => {
  it("resolve_nome_e_devolve_chave_versao_e_politica", async () => {
    const { client } = clientOf();
    const r = await client.lookupNewsroom(NEWSROOM);
    expect(r).toMatchObject({ name: NEWSROOM, pubkeyVersion: 2, policy: { categories: ["saude", "corrupcao"] } });
  });

  it("nome_inexistente_gera_erro_claro", async () => {
    const { client } = clientOf();
    await expect(client.lookupNewsroom("nada.eth")).rejects.toMatchObject({ code: "newsroom_not_found" });
  });

  it("nome_mal_formado_e_recusado_antes_de_consultar", async () => {
    const f = makeDeps();
    await expect(createSourceClient(f.deps).lookupNewsroom("Invalida")).rejects.toMatchObject({ code: "invalid_newsroom" });
    expect(f.resolveNewsroom).not.toHaveBeenCalled();
  });

  it("registros_invalidos_no_ens_viram_erro_de_configuracao_da_redacao", async () => {
    const f = makeDeps();
    const { RecordsError } = await import("@safe-whistle/ens-client");
    f.resolveNewsroom.mockRejectedValueOnce(new RecordsError("pubkey", "Falta a chave."));
    await expect(createSourceClient(f.deps).lookupNewsroom(NEWSROOM)).rejects.toMatchObject({ code: "newsroom_misconfigured" });
  });
});

describe("2. montagem", () => {
  it("so_aceita_categoria_da_politica", async () => {
    const { client, f } = clientOf();
    await expect(send(client, { category: "obras" })).rejects.toMatchObject({ code: "category_not_allowed" });
    expect(f.proofProvider).not.toHaveBeenCalled();
  });

  it("recusa_texto_acima_do_tamanho_e_vazio", async () => {
    const { client } = clientOf();
    await expect(send(client, { text: "x".repeat(20_000) })).rejects.toMatchObject({ code: "too_large" });
    await expect(send(client, { text: "" })).rejects.toMatchObject({ code: "invalid_size" });
  });

  it("recusa_anexo_quando_a_politica_nao_aceita", async () => {
    const { client } = clientOf();
    await expect(send(client, { attachment: { name: "a.pdf", data: new Uint8Array([1]) } })).rejects.toMatchObject({ code: "attachments_not_allowed" });
  });

  it("anexo_vai_dentro_do_conteudo_cifrado_quando_aceito", async () => {
    const f = makeDeps();
    f.resolveNewsroom.mockResolvedValue(info({ policy: { categories: ["saude"], maxBytes: 100_000, attachments: true, epoch: "monthly" } }));
    const data = new Uint8Array(500).fill(9);
    await createSourceClient(f.deps).submit({ newsroom: NEWSROOM, category: "saude", text: "oi", attachment: { name: "p.bin", data } });
    const body = f.relayer.received[0]!;
    expect(body.hasAttachment).toBe(true);
    expect(decodePayload(openSent(body).plaintext).attachment?.name).toBe("p.bin");
  });
});

describe("3. envio", () => {
  it("cifra_antes_de_enviar_e_o_corpo_nao_contem_o_texto_original", async () => {
    const { client, f } = clientOf();
    await send(client);
    expect(f.recorder.anyBodyContains(SECRET)).toBe(false);
    expect(f.relayer.received).toHaveLength(1);
    expect(textSent(f.relayer.received[0]!)).toBe(SECRET);
  });

  it("nao_envia_a_chave_privada_nem_o_sal", async () => {
    const { client, f } = clientOf();
    const { receipt } = await send(client);
    for (const secret of [receipt.salt, receipt.mailboxPriv]) {
      expect(f.recorder.anyBodyContainsBytes(secret)).toBe(false);
      expect(f.recorder.anyBodyContains(toBase64Url(secret))).toBe(false);
    }
  });

  it("pede_a_prova_com_a_acao_da_redacao_e_da_epoca", async () => {
    const { client, f } = clientOf();
    await send(client);
    expect(f.proofProvider).toHaveBeenCalledWith(expect.objectContaining({ action: actionFor(NEWSROOM, EPOCH), appId: "app_test", environment: "staging" }));
    expect(f.relayer.received[0]).toMatchObject({ newsroom: NEWSROOM, epoch: EPOCH, category: "saude", hasAttachment: false });
  });

  it("recusa_acao_diferente_da_esperada_vinda_do_relayer", async () => {
    const f = makeDeps({ fetch: async () => new Response(JSON.stringify({ app_id: "app_test", environment: "staging", epoch: EPOCH, action: "submit:outra.eth:1", rp_context: {} }), { status: 200 }) });
    await expect(createSourceClient(f.deps).submit({ newsroom: NEWSROOM, category: "saude", text: "x" })).rejects.toMatchObject({ code: "unexpected_response" });
  });

  it.each([["denied", "proof_denied"], ["expired", "proof_expired"], ["cancelled", "proof_cancelled"]] as const)("nao_envia_se_a_prova_for_%s", async (reason, code) => {
    const f = makeDeps();
    f.proofProvider.mockRejectedValueOnce(new ProofError(reason));
    await expect(send(createSourceClient(f.deps))).rejects.toMatchObject({ code });
    expect(f.relayer.received).toHaveLength(0);
  });

  it("refaz_a_cifragem_quando_o_relayer_diz_versao_desatualizada_reaproveitando_a_prova", async () => {
    let calls = 0;
    const relayer = makeRelayer({ submit: () => (calls++ === 0 ? { status: 409, json: { error: { code: "stale_key_version", message: "x", currentVersion: 3 } } } : { status: 201, json: { key: "0x" + "02".repeat(32), parts: 1 } }) });
    const f = makeDeps({ fetch: relayer.fetch });
    f.resolveNewsroom.mockResolvedValueOnce(info({ pubkeyVersion: 2 })).mockResolvedValue(info({ pubkeyVersion: 3 }));
    const { receipt } = await send(createSourceClient(f.deps));
    expect(relayer.received).toHaveLength(2);
    expect(openSent(relayer.received[0]!).env.pubkeyVersion).toBe(2);
    expect(openSent(relayer.received[1]!).env.pubkeyVersion).toBe(3);
    expect(f.proofProvider).toHaveBeenCalledTimes(1);
    expect(receipt.contentHash).toBe(openSent(relayer.received[1]!).env.contentHash);
  });

  it("desiste_depois_de_uma_nova_tentativa_de_versao", async () => {
    const f = makeDeps({ fetch: makeRelayer({ submit: () => ({ status: 409, json: { error: { code: "stale_key_version", message: "x", currentVersion: 9 } } }) }).fetch });
    await expect(send(createSourceClient(f.deps))).rejects.toMatchObject({ code: "stale_key_version" });
  });

  it("traduz_os_erros_do_relayer_para_causas_legiveis", async () => {
    const table: [number, string, string, RegExp][] = [
      [409, "limit_reached", "limit_reached", /já enviou/i],
      [409, "epoch_mismatch", "epoch_mismatch", /mês/i],
      [403, "proof_rejected", "proof_rejected", /prova/i],
      [502, "publish_failed", "publish_failed", /tente de novo/i],
      [413, "body_too_large", "too_large", /grande/i],
    ];
    for (const [status, relayerCode, code, text] of table) {
      const f = makeDeps({ fetch: makeRelayer({ submit: () => ({ status, json: { error: { code: relayerCode, message: "m" } } }) }).fetch });
      const err = await send(createSourceClient(f.deps)).catch((e) => e);
      expect(err).toBeInstanceOf(SourceError);
      expect(err.code, relayerCode).toBe(code);
      expect(err.message, relayerCode).toMatch(text);
    }
  });

  it("falha_de_rede_vira_erro_de_rede", async () => {
    const f = makeDeps({ fetch: async () => { throw new TypeError("fetch failed"); } });
    await expect(send(createSourceClient(f.deps))).rejects.toMatchObject({ code: "network" });
  });

  it("resposta_nao_json_do_relayer_vira_erro_inesperado", async () => {
    const f = makeDeps({ fetch: async (input) => (String(input).includes("rp-context") ? new Response(JSON.stringify({ app_id: "app_test", environment: "staging", epoch: EPOCH, action: actionFor(NEWSROOM, EPOCH), rp_context: {} })) : new Response("<html>", { status: 502 })) });
    await expect(send(createSourceClient(f.deps))).rejects.toMatchObject({ code: "unexpected_response" });
  });
});

describe("4. recibo", () => {
  it("serializa_e_restaura_o_recibo", async () => {
    const { client } = clientOf();
    const { receipt } = await send(client);
    const back = parseReceipt(serializeReceipt(receipt));
    expect(back).toEqual(receipt);
    expect(back.newsroom).toBe(NEWSROOM);
    expect(back.key).toBe("0x" + "01".repeat(32));
  });

  it("recibo_invalido_e_recusado", () => {
    expect(() => parseReceipt("nao json")).toThrow(SourceError);
    expect(() => parseReceipt(JSON.stringify({ v: 1 }))).toThrow(SourceError);
  });

  it("sem_recibo_nao_abre_respostas", async () => {
    const { client } = clientOf();
    await expect(client.readReplies(undefined as never)).rejects.toMatchObject({ code: "invalid_receipt" });
  });
});

describe("5. respostas (só as autenticadas)", () => {
  const reply = (receipt: { mailboxPub: Uint8Array }, text: string, newsroom = NEWSROOM) => sealReply(receipt.mailboxPub, encodeReply({ newsroom, text }));
  const row = (sealed: Uint8Array, over: Record<string, unknown> = {}) => ({ key: "0x05" as `0x${string}`, newsroom: NEWSROOM, sealed, createdAtBlock: 10n, creator: CUSTODIAN, ...over });
  const setup = async () => {
    const f = makeDeps();
    const { receipt } = await send(createSourceClient(f.deps));
    return { f, receipt, client: createSourceClient(f.deps) };
  };

  it("consulta_por_mailbox_e_decifra_a_resposta_do_administrador", async () => {
    const { f, receipt, client } = await setup();
    f.getReplies.mockResolvedValue([row(reply(receipt, "Recebemos."))]);
    const out = await client.readReplies(receipt);
    expect(f.getReplies).toHaveBeenCalledWith(mailboxId(receipt.mailboxPub));
    expect(out).toEqual({ replies: [{ text: "Recebemos.", createdAtBlock: 10n, author: NEWSROOM }], ignored: 0 });
  });

  it("resposta_de_jornalista_ativo_vale_e_mostra_o_nome", async () => {
    const { f, receipt, client } = await setup();
    f.owners[`maria.${NEWSROOM}`] = MARIA_ADDR;
    f.getReplies.mockResolvedValue([row(reply(receipt, "Aqui é a Maria."), { creator: MARIA_ADDR, authorName: `maria.${NEWSROOM}` })]);
    expect((await client.readReplies(receipt)).replies).toEqual([{ text: "Aqui é a Maria.", createdAtBlock: 10n, author: `maria.${NEWSROOM}` }]);
  });

  it("resposta_forjada_por_terceiro_e_ignorada_mesmo_cifrada_corretamente", async () => {
    const { f, receipt, client } = await setup();
    f.getReplies.mockResolvedValue([row(reply(receipt, "Mande seus dados para mim."), { creator: STRANGER })]);
    expect(await client.readReplies(receipt)).toEqual({ replies: [], ignored: 1 });
  });

  it("terceiro_que_se_diz_jornalista_e_ignorado", async () => {
    const { f, receipt, client } = await setup();
    f.owners[`maria.${NEWSROOM}`] = MARIA_ADDR;
    f.getReplies.mockResolvedValue([row(reply(receipt, "golpe"), { creator: STRANGER, authorName: `maria.${NEWSROOM}` })]);
    expect((await client.readReplies(receipt)).ignored).toBe(1);
  });

  it("jornalista_revogado_e_ignorado", async () => {
    const { f, receipt, client } = await setup();
    f.getReplies.mockResolvedValue([row(reply(receipt, "oi"), { creator: MARIA_ADDR, authorName: `maria.${NEWSROOM}` })]);
    expect((await client.readReplies(receipt)).ignored).toBe(1);
  });

  it("resposta_copiada_para_outra_caixa_por_terceiro_e_ignorada", async () => {
    const { f, receipt, client } = await setup();
    const legit = reply(receipt, "Recebemos.");
    f.getReplies.mockResolvedValue([row(legit, { creator: STRANGER })]); // mesmos bytes, publicados por quem não é da redação
    expect((await client.readReplies(receipt)).replies).toEqual([]);
  });

  it("resposta_com_outra_redacao_dentro_do_conteudo_ou_na_entidade_e_ignorada", async () => {
    const { f, receipt, client } = await setup();
    f.getReplies.mockResolvedValue([row(reply(receipt, "x", "outra.eth")), row(reply(receipt, "y"), { newsroom: "outra.eth" })]);
    expect(await client.readReplies(receipt)).toEqual({ replies: [], ignored: 2 });
  });

  it("formato_antigo_texto_puro_e_adulteradas_sao_ignoradas", async () => {
    const { f, receipt, client } = await setup();
    const other = await send(createSourceClient(makeDeps().deps));
    f.getReplies.mockResolvedValue([
      row(sealReply(receipt.mailboxPub, new TextEncoder().encode("texto puro"))),
      row(reply(other.receipt, "de outra caixa")),
      row(reply(receipt, "valida")),
    ]);
    const out = await client.readReplies(receipt);
    expect(out.replies.map((r) => r.text)).toEqual(["valida"]);
    expect(out.ignored).toBe(2);
  });

  it("falha_ao_consultar_o_ens_nao_vira_autorizacao", async () => {
    const { f, receipt, client } = await setup();
    f.resolveNewsroom.mockRejectedValue(new Error("rpc fora"));
    f.getReplies.mockResolvedValue([row(reply(receipt, "oi"), { creator: STRANGER })]);
    await expect(client.readReplies(receipt)).rejects.toMatchObject({ code: "network" });
  });

  it("sem_respostas_devolve_lista_vazia", async () => {
    const { receipt, client } = await setup();
    expect(await client.readReplies(receipt)).toEqual({ replies: [], ignored: 0 });
  });
});

describe("6. verificação", () => {
  const publish = async () => {
    const f = makeDeps();
    const { receipt } = await send(createSourceClient(f.deps));
    return { f, receipt, bytes: fromBase64Url(f.relayer.received[0]!.envelope) };
  };

  it("confere_hash_e_data", async () => {
    const { f, receipt, bytes } = await publish();
    f.listSubmissions.mockResolvedValue({ items: [{ key: "0x01", contentHash: receipt.contentHash, createdAtBlock: 77n }], hasMore: false, skippedIncomplete: 0 });
    const r = await createSourceClient(f.deps).verifyDocument({ newsroom: NEWSROOM, envelope: bytes });
    expect(r).toEqual({ hashMatches: true, found: true, createdAtBlock: 77n, contentHash: receipt.contentHash });
  });

  it("arquivo_adulterado_nao_confere_e_arquivo_invalido_e_recusado", async () => {
    const { f, bytes } = await publish();
    const tampered = new Uint8Array(bytes);
    tampered[tampered.length - 5] = tampered[tampered.length - 5]! ^ 0xff;
    const r = await createSourceClient(f.deps).verifyDocument({ newsroom: NEWSROOM, envelope: tampered });
    expect(r.hashMatches).toBe(false);
    expect(r.found).toBe(false);
    await expect(createSourceClient(f.deps).verifyDocument({ newsroom: NEWSROOM, envelope: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ code: "invalid_envelope" });
  });

  it("procura_em_todas_as_paginas", async () => {
    const { f, receipt, bytes } = await publish();
    f.listSubmissions
      .mockResolvedValueOnce({ items: [{ key: "0x01", contentHash: "0xoutro", createdAtBlock: 1n }], hasMore: true, skippedIncomplete: 0 })
      .mockResolvedValueOnce({ items: [{ key: "0x02", contentHash: receipt.contentHash, createdAtBlock: 5n }], hasMore: false, skippedIncomplete: 0 });
    expect((await createSourceClient(f.deps).verifyDocument({ newsroom: NEWSROOM, envelope: bytes })).createdAtBlock).toBe(5n);
  });

  it("prova_autoria_com_o_conteudo_original_e_o_sal", async () => {
    const { f, receipt, bytes } = await publish();
    const client = createSourceClient(f.deps);
    expect(client.proveAuthorship({ envelope: bytes, text: SECRET, salt: receipt.salt })).toBe(true);
    expect(client.proveAuthorship({ envelope: bytes, text: "outro texto", salt: receipt.salt })).toBe(false);
    expect(client.proveAuthorship({ envelope: bytes, text: SECRET, salt: new Uint8Array(32) })).toBe(false);
  });
});

describe("7. rede", () => {
  it("so_contata_hosts_declarados", async () => {
    const { client, f } = clientOf();
    await send(client);
    expect(f.recorder.hosts()).toEqual(["relayer.example.org"]);
  });

  it("usa_a_url_do_relayer_configurada", async () => {
    const f = makeDeps({ relayerUrl: "https://outro.example.net/" });
    await send(createSourceClient(f.deps));
    expect(f.recorder.hosts()).toEqual(["outro.example.net"]);
  });
});
