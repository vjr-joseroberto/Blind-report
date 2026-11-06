import { NewsroomNotFoundError } from "@safe-whistle/ens-client";
import { ProofError, SourceError, parseReceipt } from "@safe-whistle/source-client";
import { describe, expect, it, vi } from "vitest";
import { cancellable, createSourceController } from "../src/controller.ts";

const INFO = { name: "investiga.eth", pubkeyVersion: 2, policy: { categories: ["saude", "corrupcao"], maxBytes: 10_000, attachments: false, epoch: "monthly" as const } };
const RECEIPT = { newsroom: "investiga.eth", key: "0x01", contentHash: "0xaa", salt: new Uint8Array([1, 2]), mailboxPriv: new Uint8Array([3]), mailboxPub: new Uint8Array([4]) };

function make(over: Record<string, any> = {}) {
  const client = {
    lookupNewsroom: vi.fn(async (_n: string) => INFO),
    submit: vi.fn(async (_i: any) => ({ receipt: RECEIPT, parts: 1 })),
    readReplies: vi.fn(async (_r: any) => ({ replies: [{ text: "Recebemos.", createdAtBlock: 5n, author: "investiga.eth" }], ignored: 0 })),
    verifyDocument: vi.fn(async (_a: any) => ({ hashMatches: true, found: true, createdAtBlock: 9n, contentHash: "0xaa" })),
    proveAuthorship: vi.fn((_a: any) => true),
    ...over,
  };
  const c = createSourceController(client as never);
  const states: string[] = [];
  c.subscribe((s) => states.push(s.step));
  return { c, client, states };
}

describe("passo 1: escolher a redação", () => {
  it("renderiza_as_categorias_da_politica_depois_de_buscar", async () => {
    const { c } = make();
    await c.lookup("investiga.eth");
    expect(c.state).toMatchObject({ step: "compose", newsroom: { name: "investiga.eth", version: 2, categories: ["saude", "corrupcao"], maxBytes: 10_000, attachments: false } });
  });

  it("mostra_a_causa_do_erro_e_continua_no_passo_1", async () => {
    const { c } = make({ lookupNewsroom: vi.fn(async () => { throw new SourceError("newsroom_not_found", "Redação não encontrada. Confira o nome."); }) });
    await c.lookup("nada.eth");
    expect(c.state.step).toBe("newsroom");
    expect(c.state.error).toEqual({ code: "newsroom_not_found", message: "Redação não encontrada. Confira o nome." });
  });

  it("erro_inesperado_vira_mensagem_generica_sem_detalhes", async () => {
    const { c } = make({ lookupNewsroom: vi.fn(async () => { throw new Error("segredo interno 10.0.0.1"); }) });
    await c.lookup("investiga.eth");
    expect(c.state.error?.message).not.toContain("10.0.0.1");
    expect(c.state.error?.code).toBe("unexpected");
  });
});

describe("passos 2 a 4: enviar", () => {
  it("vai_para_o_passo_da_prova_enquanto_envia_e_termina_no_recibo", async () => {
    const { c, states } = make();
    await c.lookup("investiga.eth");
    await c.submit({ category: "saude", text: "oi" });
    expect(states).toContain("proof");
    expect(c.state.step).toBe("receipt");
    expect(parseReceipt(c.state.receiptText!)).toEqual(RECEIPT);
  });

  it("recibo_so_conclui_depois_de_confirmar_que_foi_guardado", async () => {
    const { c } = make();
    await c.lookup("investiga.eth");
    await c.submit({ category: "saude", text: "oi" });
    c.finish();
    expect(c.state.step).toBe("receipt");
    c.confirmReceiptSaved();
    c.finish();
    expect(c.state.step).toBe("newsroom");
    expect(c.state.receiptText).toBeUndefined();
  });

  it("prova_cancelada_volta_ao_passo_2_com_a_causa", async () => {
    const { c, client } = make();
    await c.lookup("investiga.eth");
    client.submit.mockRejectedValueOnce(new SourceError("proof_cancelled", "Você cancelou a prova."));
    await c.submit({ category: "saude", text: "oi" });
    expect(c.state.step).toBe("compose");
    expect(c.state.error?.code).toBe("proof_cancelled");
    expect(c.state.receiptText).toBeUndefined();
  });

  it("limite_atingido_mostra_o_texto_do_cliente", async () => {
    const { c, client } = make();
    await c.lookup("investiga.eth");
    client.submit.mockRejectedValueOnce(new SourceError("limit_reached", "Você já enviou para esta redação neste mês. Tente de novo no próximo mês."));
    await c.submit({ category: "saude", text: "oi" });
    expect(c.state.error?.message).toMatch(/já enviou/);
  });

  it("o_link_da_prova_aparece_no_estado", async () => {
    const { c, client } = make();
    await c.lookup("investiga.eth");
    client.submit.mockImplementationOnce(async () => {
      c.setProofLink("https://exemplo.test/verify?x=1");
      expect(c.state.proofLink).toBe("https://exemplo.test/verify?x=1");
      return { receipt: RECEIPT, parts: 1 };
    });
    await c.submit({ category: "saude", text: "oi" });
    expect(c.state.proofLink).toBeUndefined();
  });

  it("enviar_sem_buscar_a_redacao_e_ignorado", async () => {
    const { c, client } = make();
    await c.submit({ category: "saude", text: "oi" });
    expect(client.submit).not.toHaveBeenCalled();
  });
});

describe("respostas e verificação", () => {
  it("abre_o_recibo_colado_e_lista_as_respostas", async () => {
    const { c } = make();
    await c.lookup("investiga.eth");
    await c.submit({ category: "saude", text: "oi" });
    const text = c.state.receiptText!;
    const { c: c2 } = make();
    await c2.loadReplies(text);
    expect(c2.state.replies).toEqual([{ text: "Recebemos.", createdAtBlock: 5n, author: "investiga.eth" }]);
    expect(c2.state.ignoredReplies).toBe(0);
  });

  it("mostra_quantas_respostas_foram_ignoradas", async () => {
    const { c, client } = make();
    await c.lookup("investiga.eth");
    await c.submit({ category: "saude", text: "oi" });
    client.readReplies.mockResolvedValueOnce({ replies: [], ignored: 2 });
    await c.loadReplies(c.state.receiptText!);
    expect(c.state.ignoredReplies).toBe(2);
    expect(c.state.replies).toEqual([]);
  });

  it("recibo_invalido_mostra_erro", async () => {
    const { c } = make();
    await c.loadReplies("lixo");
    expect(c.state.error?.code).toBe("invalid_receipt");
    expect(c.state.replies).toBeUndefined();
  });

  it("verifica_arquivo_e_autoria", async () => {
    const { c, client } = make();
    await c.verify({ newsroom: "investiga.eth", envelope: new Uint8Array([1]) });
    expect(c.state.verification).toEqual({ hashMatches: true, found: true, createdAtBlock: 9n, contentHash: "0xaa" });
    expect(c.proveAuthorship({ envelope: new Uint8Array([1]), text: "x", salt: new Uint8Array(32) })).toBe(true);
    expect(client.proveAuthorship).toHaveBeenCalled();
  });

  it("erro_ao_verificar_aparece_no_estado", async () => {
    const { c } = make({ verifyDocument: vi.fn(async () => { throw new SourceError("invalid_envelope", "O arquivo não é um envelope do Safe Whistle."); }) });
    await c.verify({ newsroom: "investiga.eth", envelope: new Uint8Array([1]) });
    expect(c.state.error?.code).toBe("invalid_envelope");
  });
});

describe("cancellable", () => {
  it("cancelar_rejeita_com_prova_cancelada", async () => {
    const never = () => new Promise<never>(() => {});
    const { provider, cancel } = cancellable(never as never);
    const p = provider({} as never);
    cancel();
    await expect(p).rejects.toMatchObject({ reason: "cancelled" });
  });

  it("repassa_o_resultado_quando_nao_cancela", async () => {
    const { provider } = cancellable((async () => ({ ok: 1 })) as never);
    await expect(provider({} as never)).resolves.toEqual({ ok: 1 });
  });

  it("cancelar_sem_prova_em_andamento_nao_faz_nada", () => {
    expect(() => cancellable((async () => ({})) as never).cancel()).not.toThrow();
  });
});

void NewsroomNotFoundError; void ProofError;
