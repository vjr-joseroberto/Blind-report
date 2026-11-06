import { describe, expect, it } from "vitest";
import { validateSubmission, type NewsroomPolicy } from "../src/index.ts";

const policy: NewsroomPolicy = { categories: ["corrupcao", "saude"], maxBytes: 1000, attachments: false, epoch: "monthly" };

describe("RF-21 validate submission against the policy", () => {
  it("accepts_submission_within_the_policy", () => {
    expect(validateSubmission(policy, { category: "corrupcao", sizeBytes: 500, hasAttachment: false })).toEqual({ ok: true });
  });

  it("rejects_category_outside_the_policy", () => {
    expect(validateSubmission(policy, { category: "outra", sizeBytes: 10, hasAttachment: false })).toMatchObject({ ok: false, code: "category_not_allowed" });
  });

  it("size_limit_is_inclusive", () => {
    expect(validateSubmission(policy, { category: "saude", sizeBytes: 1000, hasAttachment: false })).toEqual({ ok: true });
    expect(validateSubmission(policy, { category: "saude", sizeBytes: 1001, hasAttachment: false })).toMatchObject({ ok: false, code: "too_large" });
  });

  it("rejects_attachment_when_the_policy_does_not_allow_it", () => {
    expect(validateSubmission(policy, { category: "saude", sizeBytes: 10, hasAttachment: true })).toMatchObject({ ok: false, code: "attachments_not_allowed" });
    expect(validateSubmission({ ...policy, attachments: true }, { category: "saude", sizeBytes: 10, hasAttachment: true })).toEqual({ ok: true });
  });

  it("rejects_invalid_or_empty_size", () => {
    for (const sizeBytes of [0, -5, Number.NaN, 1.5]) {
      expect(validateSubmission(policy, { category: "saude", sizeBytes, hasAttachment: false }), String(sizeBytes)).toMatchObject({ ok: false, code: "invalid_size" });
    }
  });

  it("the_refusal_carries_a_readable_message", () => {
    const r = validateSubmission(policy, { category: "outra", sizeBytes: 10, hasAttachment: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/category/i);
  });
});
