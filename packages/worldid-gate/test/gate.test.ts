import { describe, expect, it, vi } from "vitest";
import { createMemoryNullifierStore, createSimulatedVerifier, createSubmissionGate, type Verifier } from "../src/index.ts";
import { payload } from "./helpers.ts";

const A = "investiga.eth";
const B = "outra.eth";

const gate = (over: { verifier?: Verifier; environment?: "staging" | "production" } = {}) =>
  createSubmissionGate({ expectedEnvironment: over.environment ?? "staging", verifier: over.verifier ?? createSimulatedVerifier(), store: createMemoryNullifierStore() });

const refusal = async (p: ReturnType<ReturnType<typeof gate>["admit"]>) => {
  const r = await p;
  return r.ok ? "aceito" : r.code;
};

describe("RF-09 e RN-01 limite de uma denúncia por pessoa por redação por época", () => {
  it("aceita_a_primeira_denuncia", async () => {
    expect((await gate().admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) })).ok).toBe(true);
  });

  it("bloqueia_a_segunda_na_mesma_redacao_e_epoca", async () => {
    const g = gate();
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    const r = await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    expect(r).toMatchObject({ ok: false, code: "limit_reached" });
    if (!r.ok) expect(r.message).toMatch(/já houve um envio/i);
  });

  it("permite_outra_redacao_e_a_proxima_epoca", async () => {
    const g = gate();
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    expect((await g.admit({ newsroom: B, epoch: 202611, payload: payload("ana", B, 202611) })).ok).toBe(true);
    expect((await g.admit({ newsroom: A, epoch: 202612, payload: payload("ana", A, 202612) })).ok).toBe(true);
  });

  it("outra_pessoa_na_mesma_redacao_e_epoca_e_aceita", async () => {
    const g = gate();
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    expect((await g.admit({ newsroom: A, epoch: 202611, payload: payload("bia", A, 202611) })).ok).toBe(true);
  });

  it("duas_tentativas_simultaneas_da_mesma_pessoa_so_uma_passa", async () => {
    const g = gate();
    const rs = await Promise.all([1, 2, 3].map(() => g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) })));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });

  it("liberar_a_reserva_permite_tentar_de_novo_se_a_publicacao_falhar", async () => {
    const g = gate();
    const first = await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    if (!first.ok) throw new Error("esperado aceito");
    await first.release();
    expect((await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) })).ok).toBe(true);
  });
});

describe("RN-09 a prova vale só para a sua ação", () => {
  it("replay_entre_redacoes_e_recusado", async () => {
    expect(await refusal(gate().admit({ newsroom: B, epoch: 202611, payload: payload("carla", A, 202611) }))).toBe("wrong_action");
  });

  it("replay_entre_epocas_e_recusado", async () => {
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202612, payload: payload("carla", A, 202611) }))).toBe("wrong_action");
  });

  it("ambiente_errado_e_recusado", async () => {
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202611, payload: payload("dani", A, 202611, { environment: "production" }) }))).toBe("wrong_environment");
    expect(await refusal(gate({ environment: "production" }).admit({ newsroom: A, epoch: 202611, payload: payload("dani", A, 202611) }))).toBe("wrong_environment");
  });
});

describe("validações antes de gastar uma chamada à API do World", () => {
  it("o_verificador_nao_e_chamado_quando_a_acao_ou_o_ambiente_ou_o_nullifier_estao_errados", async () => {
    const verifier = vi.fn(createSimulatedVerifier());
    const g = gate({ verifier });
    await g.admit({ newsroom: B, epoch: 202611, payload: payload("x", A, 202611) });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("x", A, 202611, { environment: "production" }) });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("x", A, 202611, { responses: [{ identifier: "proof_of_human", nullifier: "zzz" }] }) });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("x", A, 202611, { responses: [] }) });
    expect(verifier).not.toHaveBeenCalled();
  });

  it("nullifier_ja_usado_nao_chama_o_verificador_de_novo", async () => {
    const verifier = vi.fn(createSimulatedVerifier());
    const g = gate({ verifier });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    expect(verifier).toHaveBeenCalledTimes(1);
  });

  it("entradas_invalidas_geram_recusa_com_codigo", async () => {
    expect(await refusal(gate().admit({ newsroom: "Invalida", epoch: 202611, payload: payload("a", A, 202611) }))).toBe("invalid_request");
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202613, payload: payload("a", A, 202611) }))).toBe("invalid_request");
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202611, payload: null as never }))).toBe("invalid_request");
  });
});

describe("recusas do verificador", () => {
  it("prova_invalida_e_recusada_e_nao_consome_a_reserva", async () => {
    const g = gate();
    expect(await refusal(g.admit({ newsroom: A, epoch: 202611, payload: payload("edu", A, 202611, { valid: false }) }))).toBe("proof_rejected");
    expect((await g.admit({ newsroom: A, epoch: 202611, payload: payload("edu", A, 202611) })).ok).toBe(true);
  });

  it("o_motivo_do_verificador_aparece_na_recusa", async () => {
    const verifier: Verifier = async () => ({ success: false, error: "400 all_verifications_failed" });
    const r = await gate({ verifier }).admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("all_verifications_failed");
  });

  it("resposta_com_ambiente_ou_acao_diferentes_e_recusada", async () => {
    const other: Verifier = async (p) => ({ success: true, environment: "production", action: p.action });
    expect(await refusal(gate({ verifier: other }).admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611) }))).toBe("wrong_environment");
    const otherAction: Verifier = async (p) => ({ success: true, environment: p.environment, action: "submit:x.eth:1" });
    expect(await refusal(gate({ verifier: otherAction }).admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611) }))).toBe("wrong_action");
  });

  it("nullifier_da_resposta_diferente_do_do_payload_e_recusado", async () => {
    const liar: Verifier = async (p) => ({ success: true, environment: p.environment, action: p.action, nullifier: "0x" + "99".repeat(30) });
    expect(await refusal(gate({ verifier: liar }).admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611) }))).toBe("nullifier_mismatch");
  });

  it("nullifier_malformado_no_payload_e_recusado", async () => {
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611, { responses: [{ identifier: "proof_of_human", nullifier: "zzz" }] }) }))).toBe("invalid_nullifier");
  });
});

describe("RN-05 a prova não é guardada", () => {
  it("o_resultado_da_admissao_nao_expoe_a_prova_nem_o_nullifier", async () => {
    const r = await gate().admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    const text = JSON.stringify(r);
    expect(text).not.toContain("proof");
    expect(text).not.toContain("nullifier");
  });
});
