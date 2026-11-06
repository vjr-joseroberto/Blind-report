import { describe, expect, it } from "vitest";
import { validateSubmission, type NewsroomPolicy } from "../src/index.ts";

const policy: NewsroomPolicy = { categories: ["corrupcao", "saude"], maxBytes: 1000, attachments: false, epoch: "monthly" };

describe("RF-21 validar envio contra a política", () => {
  it("aceita_envio_dentro_da_politica", () => {
    expect(validateSubmission(policy, { category: "corrupcao", sizeBytes: 500, hasAttachment: false })).toEqual({ ok: true });
  });

  it("recusa_categoria_fora_da_politica", () => {
    expect(validateSubmission(policy, { category: "outra", sizeBytes: 10, hasAttachment: false })).toMatchObject({ ok: false, code: "category_not_allowed" });
  });

  it("limite_de_tamanho_e_inclusivo", () => {
    expect(validateSubmission(policy, { category: "saude", sizeBytes: 1000, hasAttachment: false })).toEqual({ ok: true });
    expect(validateSubmission(policy, { category: "saude", sizeBytes: 1001, hasAttachment: false })).toMatchObject({ ok: false, code: "too_large" });
  });

  it("recusa_anexo_quando_a_politica_nao_aceita", () => {
    expect(validateSubmission(policy, { category: "saude", sizeBytes: 10, hasAttachment: true })).toMatchObject({ ok: false, code: "attachments_not_allowed" });
    expect(validateSubmission({ ...policy, attachments: true }, { category: "saude", sizeBytes: 10, hasAttachment: true })).toEqual({ ok: true });
  });

  it("recusa_tamanho_invalido_ou_vazio", () => {
    for (const sizeBytes of [0, -5, Number.NaN, 1.5]) {
      expect(validateSubmission(policy, { category: "saude", sizeBytes, hasAttachment: false }), String(sizeBytes)).toMatchObject({ ok: false, code: "invalid_size" });
    }
  });

  it("a_recusa_traz_mensagem_legivel", () => {
    const r = validateSubmission(policy, { category: "outra", sizeBytes: 10, hasAttachment: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/categoria/i);
  });
});
