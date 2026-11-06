import { InvalidNewsroomNameError } from "@safe-whistle/core";
import { NewsroomNotFoundError, RecordsError } from "@safe-whistle/ens-client";
import { describe, expect, it } from "vitest";
import { createRelayerApp } from "../src/index.ts";
import { CUSTODIAN, EPOCH, NEWSROOM, makeDeps, makeEnvelopeBytes, req, submissionBody } from "./helpers.ts";

const json = (r: { body: string }) => JSON.parse(r.body) as Record<string, unknown>;
const code = (r: { body: string }) => (json(r).error as { code: string }).code;

describe("GET /health e rotas desconhecidas", () => {
  it("health_responde_ok", async () => {
    const r = await createRelayerApp(makeDeps().deps).handle(req("GET", "/health"));
    expect(r.status).toBe(200);
    expect(json(r)).toEqual({ ok: true });
  });

  it("rota_desconhecida_404_e_metodo_errado_405", async () => {
    const app = createRelayerApp(makeDeps().deps);
    expect((await app.handle(req("GET", "/nada"))).status).toBe(404);
    expect((await app.handle(req("POST", "/health"))).status).toBe(405);
    expect((await app.handle(req("GET", "/submissions"))).status).toBe(405);
  });

  it("respostas_nao_sao_armazenadas_em_cache_e_tem_cabecalhos_de_seguranca", async () => {
    const r = await createRelayerApp(makeDeps().deps).handle(req("GET", "/health"));
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["content-type"]).toContain("application/json");
  });
});

describe("GET /rp-context", () => {
  it("devolve_a_assinatura_para_a_acao_da_epoca_corrente_do_relogio", async () => {
    const f = makeDeps();
    const r = await createRelayerApp(f.deps).handle(req("GET", `/rp-context?newsroom=${NEWSROOM}`));
    expect(r.status).toBe(200);
    expect(json(r)).toMatchObject({ app_id: "app_test", environment: "staging", epoch: EPOCH, action: `submit:${NEWSROOM}:${EPOCH}`, rp_context: { signature: `0xsig-${NEWSROOM}-${EPOCH}` } });
    expect(f.rpContextFor).toHaveBeenCalledWith({ newsroom: NEWSROOM, epoch: EPOCH });
  });

  it("exige_o_parametro_newsroom_e_recusa_nome_invalido", async () => {
    const app = createRelayerApp(makeDeps().deps);
    expect((await app.handle(req("GET", "/rp-context"))).status).toBe(400);
    expect((await app.handle(req("GET", "/rp-context?newsroom=Invalida"))).status).toBe(400);
  });

  it("recusa_redacao_inexistente_com_404", async () => {
    const f = makeDeps();
    f.resolveNewsroom.mockRejectedValueOnce(new NewsroomNotFoundError("nada.eth"));
    const r = await createRelayerApp(f.deps).handle(req("GET", "/rp-context?newsroom=nada.eth"));
    expect(r.status).toBe(404);
    expect(code(r)).toBe("newsroom_not_found");
    expect(f.rpContextFor).not.toHaveBeenCalled();
  });

  it("redacao_com_registros_invalidos_gera_422", async () => {
    const f = makeDeps();
    f.resolveNewsroom.mockRejectedValueOnce(new RecordsError("pubkey", "Falta o registro denuncia.pubkey."));
    const r = await createRelayerApp(f.deps).handle(req("GET", "/rp-context?newsroom=quebrada.eth"));
    expect(r.status).toBe(422);
    expect(code(r)).toBe("newsroom_misconfigured");
  });
});

describe("POST /submissions", () => {
  const post = (f: ReturnType<typeof makeDeps>, body: Uint8Array) => createRelayerApp(f.deps).handle(req("POST", "/submissions", { body }));

  it("aceita_envio_valido_publica_e_responde_201_com_o_identificador", async () => {
    const f = makeDeps();
    const { bytes, envelope } = makeEnvelopeBytes();
    const r = await post(f, submissionBody({}, bytes));
    expect(r.status).toBe(201);
    expect(json(r)).toEqual({ key: "0x" + "01".repeat(32), parts: 1 });
    expect(f.publishSubmission).toHaveBeenCalledWith({
      newsroom: NEWSROOM, category: "saude", epoch: EPOCH, contentHash: envelope.contentHash, pubkeyVersion: 2,
      envelope: bytes, custodian: CUSTODIAN, retentionSeconds: 150 * 24 * 3600,
    });
  });

  it("a_ordem_e_politica_ens_depois_prova_do_world_depois_publicacao", async () => {
    const f = makeDeps();
    const order: string[] = [];
    f.resolveNewsroom.mockImplementation(async (name: string) => {
      order.push("ens");
      return { name, publicKey: new Uint8Array(32), pubkeyVersion: 2, policy: { categories: ["saude"], maxBytes: 100000, attachments: false, epoch: "monthly" as const }, relayers: [], custodian: CUSTODIAN };
    });
    f.admit.mockImplementation(async () => {
      order.push("world");
      return { ok: true as const, release: f.release };
    });
    f.publishSubmission.mockImplementation(async () => {
      order.push("arkiv");
      return { key: ("0x" + "02".repeat(32)) as `0x${string}`, keys: [] };
    });
    await post(f, submissionBody());
    expect(order).toEqual(["ens", "world", "arkiv"]);
  });

  it("json_invalido_ou_campos_ausentes_geram_400", async () => {
    const f = makeDeps();
    expect((await post(f, new TextEncoder().encode("{nao json"))).status).toBe(400);
    expect((await post(f, new TextEncoder().encode("[]"))).status).toBe(400);
    for (const missing of ["newsroom", "epoch", "category", "proof", "envelope"]) {
      const body = JSON.parse(new TextDecoder().decode(submissionBody())) as Record<string, unknown>;
      delete body[missing];
      expect((await post(f, new TextEncoder().encode(JSON.stringify(body)))).status, missing).toBe(400);
    }
    expect(f.admit).not.toHaveBeenCalled();
  });

  it("envelope_que_nao_e_base64url_ou_nao_decodifica_gera_4xx_sem_chamar_o_world", async () => {
    const f = makeDeps();
    expect((await post(f, submissionBody({ envelope: "isto não é base64url!" }))).status).toBe(400);
    const r = await post(f, submissionBody({}, new TextEncoder().encode("nao e um envelope de verdade")));
    expect(r.status).toBe(422);
    expect(code(r)).toBe("invalid_envelope");
    expect(f.admit).not.toHaveBeenCalled();
  });

  it("recusa_versao_de_chave_desatualizada_com_409_e_diz_a_versao_atual", async () => {
    const f = makeDeps();
    const r = await post(f, submissionBody({}, makeEnvelopeBytes({ version: 1 }).bytes));
    expect(r.status).toBe(409);
    expect(code(r)).toBe("stale_key_version");
    expect((json(r).error as { currentVersion: number }).currentVersion).toBe(2);
    expect(f.admit).not.toHaveBeenCalled();
  });

  it("recusa_envelope_de_outra_redacao_ou_categoria_com_422", async () => {
    const f = makeDeps();
    expect(code(await post(f, submissionBody({}, makeEnvelopeBytes({ newsroom: "outra.eth" }).bytes)))).toBe("envelope_mismatch");
    expect(code(await post(f, submissionBody({ category: "corrupcao" }, makeEnvelopeBytes({ category: "saude" }).bytes)))).toBe("envelope_mismatch");
    expect(f.admit).not.toHaveBeenCalled();
  });

  it("recusa_hash_de_conteudo_adulterado_com_422", async () => {
    const f = makeDeps();
    const { envelope } = makeEnvelopeBytes();
    const tampered = new Uint8Array(envelope.ciphertext);
    tampered[0] = tampered[0]! ^ 0xff;
    const { encodeEnvelope } = await import("@safe-whistle/crypto");
    const r = await post(f, submissionBody({}, encodeEnvelope({ ...envelope, ciphertext: tampered })));
    expect(r.status).toBe(422);
    expect(code(r)).toBe("invalid_envelope");
  });

  it("recusa_epoca_diferente_da_corrente_com_409", async () => {
    const f = makeDeps();
    const r = await post(f, submissionBody({ epoch: EPOCH - 1 }));
    expect(r.status).toBe(409);
    expect(code(r)).toBe("epoch_mismatch");
    expect(f.admit).not.toHaveBeenCalled();
  });

  it("recusa_categoria_fora_da_politica_e_tamanho_acima_do_maximo_com_422", async () => {
    const f = makeDeps();
    const outside = await post(f, submissionBody({ category: "obras" }, makeEnvelopeBytes({ category: "obras" }).bytes));
    expect(outside.status).toBe(422);
    expect(code(outside)).toBe("category_not_allowed");
    const big = await post(f, submissionBody({}, makeEnvelopeBytes({ size: 150_000 }).bytes));
    expect(big.status).toBe(422);
    expect(code(big)).toBe("too_large");
    const attach = await post(f, submissionBody({ hasAttachment: true }));
    expect(code(attach)).toBe("attachments_not_allowed");
    expect(f.admit).not.toHaveBeenCalled();
  });

  it("recusa_corpo_acima_do_maximo_com_413", async () => {
    const f = makeDeps({ maxBodyBytes: 100 });
    const r = await post(f, submissionBody());
    expect(r.status).toBe(413);
    expect(f.resolveNewsroom).not.toHaveBeenCalled();
  });

  it("recusas_do_portao_viram_status_e_codigo_e_nao_publicam", async () => {
    const table: [string, number][] = [["proof_rejected", 403], ["wrong_action", 403], ["wrong_environment", 403], ["nullifier_mismatch", 403], ["invalid_nullifier", 400], ["invalid_request", 400], ["limit_reached", 409]];
    for (const [refusal, status] of table) {
      const f = makeDeps();
      f.admit.mockResolvedValueOnce({ ok: false, code: refusal as never, message: "motivo" });
      const r = await post(f, submissionBody());
      expect(r.status, refusal).toBe(status);
      expect(code(r)).toBe(refusal);
      expect(f.publishSubmission).not.toHaveBeenCalled();
    }
  });

  it("se_a_publicacao_falha_devolve_a_reserva_e_responde_502_sem_detalhes_internos", async () => {
    const f = makeDeps();
    f.publishSubmission.mockRejectedValueOnce(new Error("RPC 10.0.0.5 caiu: segredo interno"));
    const r = await post(f, submissionBody());
    expect(r.status).toBe(502);
    expect(code(r)).toBe("publish_failed");
    expect(r.body).not.toContain("10.0.0.5");
    expect(f.release).toHaveBeenCalledTimes(1);
  });

  it("a_resposta_de_sucesso_nao_expoe_prova_nem_identificadores", async () => {
    const r = await post(makeDeps(), submissionBody());
    for (const forbidden of ["nullifier", "proof", "ab".repeat(30)]) expect(r.body).not.toContain(forbidden);
  });
});

describe("RNF-11 o relayer não registra IP nem corpo", () => {
  it("os_logs_so_tem_rota_status_e_codigo", async () => {
    const f = makeDeps();
    const app = createRelayerApp(f.deps);
    await app.handle(req("POST", "/submissions", { body: submissionBody({ category: "SEGREDO-NO-CORPO" }), headers: { "x-forwarded-for": "203.0.113.9", "user-agent": "NavegadorDaFonte/1.0" } }));
    await app.handle(req("GET", `/rp-context?newsroom=${NEWSROOM}`, { headers: { "x-forwarded-for": "203.0.113.9" } }));
    const text = JSON.stringify(f.logs);
    for (const leak of ["203.0.113.9", "NavegadorDaFonte", "SEGREDO-NO-CORPO", "ab".repeat(30), "nullifier"]) expect(text).not.toContain(leak);
    expect(f.logs.length).toBeGreaterThan(0);
    for (const l of f.logs) expect(Object.keys(l as object).sort()).toEqual(expect.arrayContaining(["route", "status"]));
  });
});

describe("CORS", () => {
  it("preflight_de_origem_permitida_devolve_204_com_os_cabecalhos", async () => {
    const r = await createRelayerApp(makeDeps().deps).handle(req("OPTIONS", "/submissions", { headers: { origin: "https://app.example.org" } }));
    expect(r.status).toBe(204);
    expect(r.headers["access-control-allow-origin"]).toBe("https://app.example.org");
    expect(r.headers["access-control-allow-methods"]).toContain("POST");
    expect(r.headers["vary"]).toBe("Origin");
  });

  it("origem_nao_permitida_nao_recebe_cabecalho_de_permissao", async () => {
    const r = await createRelayerApp(makeDeps().deps).handle(req("GET", "/health", { headers: { origin: "https://evil.example.net" } }));
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("respostas_normais_de_origem_permitida_incluem_o_cabecalho", async () => {
    const r = await createRelayerApp(makeDeps().deps).handle(req("GET", "/health", { headers: { origin: "https://app.example.org" } }));
    expect(r.headers["access-control-allow-origin"]).toBe("https://app.example.org");
  });

  it("nunca_usa_curinga", async () => {
    const r = await createRelayerApp(makeDeps({ allowedOrigins: ["*"] }).deps).handle(req("GET", "/health", { headers: { origin: "https://qualquer.example.org" } }));
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("erros inesperados", () => {
  it("excecao_vira_500_sem_detalhes_e_o_log_so_tem_rota_e_status", async () => {
    const f = makeDeps();
    f.resolveNewsroom.mockRejectedValueOnce(new Error("boom: senha=abc123 em 10.1.1.1"));
    const r = await createRelayerApp(f.deps).handle(req("GET", `/rp-context?newsroom=${NEWSROOM}`));
    expect(r.status).toBe(500);
    expect(code(r)).toBe("internal");
    expect(r.body).not.toContain("boom");
    const text = JSON.stringify(f.logs);
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("10.1.1.1");
    expect(f.logs.at(-1)).toMatchObject({ route: "GET /rp-context", status: 500 });
  });
});

void InvalidNewsroomNameError;
