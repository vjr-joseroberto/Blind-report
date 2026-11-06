import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_BYTES, PolicyError, parsePolicy } from "../src/index.ts";

const json = (o: unknown) => JSON.stringify(o);

describe("RF-02 newsroom policy (denuncia.policy)", () => {
  it("accepts_valid_policy", () => {
    const p = parsePolicy(json({ categories: ["corrupcao", "saude"], maxBytes: 100000, attachments: true, epoch: "monthly" }));
    expect(p).toEqual({ categories: ["corrupcao", "saude"], maxBytes: 100000, attachments: true, epoch: "monthly" });
  });

  it("applies_defaults_when_field_is_absent", () => {
    const p = parsePolicy(json({ categories: ["a"] }));
    expect(p).toEqual({ categories: ["a"], maxBytes: DEFAULT_MAX_BYTES, attachments: false, epoch: "monthly" });
  });

  it("rejects_malformed_json", () => {
    expect(() => parsePolicy("{nao e json")).toThrow(PolicyError);
    expect(() => parsePolicy("[]")).toThrow(PolicyError);
    expect(() => parsePolicy("null")).toThrow(PolicyError);
  });

  it("rejects_empty_or_missing_categories", () => {
    expect(() => parsePolicy(json({}))).toThrow(PolicyError);
    expect(() => parsePolicy(json({ categories: [] }))).toThrow(PolicyError);
  });

  it("rejects_invalid_or_repeated_category", () => {
    for (const bad of [[""], ["A"], ["com espaco"], ["x".repeat(33)], [1], ["a", "a"]]) {
      expect(() => parsePolicy(json({ categories: bad })), JSON.stringify(bad)).toThrow(PolicyError);
    }
  });

  it("rejects_more_than_32_categories", () => {
    const many = Array.from({ length: 33 }, (_, i) => `c${i}`);
    expect(() => parsePolicy(json({ categories: many }))).toThrow(PolicyError);
  });

  it("rejects_invalid_maxBytes", () => {
    for (const bad of [0, -1, 1.5, "10", 11 * 1024 * 1024]) {
      expect(() => parsePolicy(json({ categories: ["a"], maxBytes: bad })), String(bad)).toThrow(PolicyError);
    }
  });

  it("rejects_attachments_that_is_not_boolean", () => {
    expect(() => parsePolicy(json({ categories: ["a"], attachments: "sim" }))).toThrow(PolicyError);
  });

  it("rejects_epoch_other_than_monthly", () => {
    expect(() => parsePolicy(json({ categories: ["a"], epoch: "weekly" }))).toThrow(PolicyError);
  });

  it("the_error_carries_a_code_and_the_cause", () => {
    try {
      parsePolicy(json({ categories: [] }));
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyError);
      expect((e as PolicyError).code).toBe("categories");
      expect((e as PolicyError).message).toMatch(/category/i);
    }
  });
});
