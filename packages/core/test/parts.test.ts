import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PartsError, joinParts, splitIntoParts } from "../src/index.ts";

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);

describe("RF-19 split attachments into parts", () => {
  it("splits_into_parts_at_the_limit", () => {
    const parts = splitIntoParts(bytes(25), 10);
    expect(parts.map((p) => p.data.length)).toEqual([10, 10, 5]);
    expect(parts.map((p) => p.index)).toEqual([0, 1, 2]);
    expect(parts.every((p) => p.total === 3)).toBe(true);
  });

  it("exact_limit_size_yields_one_part", () => {
    expect(splitIntoParts(bytes(10), 10)).toHaveLength(1);
  });

  it("empty_input_yields_one_empty_part", () => {
    const parts = splitIntoParts(new Uint8Array(), 10);
    expect(parts).toHaveLength(1);
    expect(joinParts(parts)).toEqual(new Uint8Array());
  });

  it("join_returns_the_original", () => {
    const original = bytes(95);
    expect(joinParts(splitIntoParts(original, 10))).toEqual(original);
  });

  it("property_join_and_split_is_identity_for_any_bytes_and_size", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 2000 }), fc.integer({ min: 1, max: 300 }), (data, size) => {
        expect(joinParts(splitIntoParts(data, size))).toEqual(data);
      }),
    );
  });

  it("property_shuffled_order_still_reassembles", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 500 }), fc.integer({ min: 1, max: 50 }), fc.integer(), (data, size, seed) => {
        const parts = splitIntoParts(data, size);
        const shuffled = [...parts].sort((a, b) => ((a.index * 7919 + seed) % 13) - ((b.index * 7919 + seed) % 13));
        expect(joinParts(shuffled)).toEqual(data);
      }),
    );
  });

  it("missing_part_raises_error", () => {
    const parts = splitIntoParts(bytes(30), 10);
    expect(() => joinParts(parts.slice(1))).toThrow(PartsError);
    try {
      joinParts(parts.slice(1));
    } catch (e) {
      expect((e as PartsError).code).toBe("missing");
    }
  });

  it("duplicate_part_raises_error", () => {
    const parts = splitIntoParts(bytes(30), 10);
    expect(() => joinParts([parts[0]!, parts[0]!, parts[1]!])).toThrow(PartsError);
  });

  it("inconsistent_totals_raise_error", () => {
    const a = splitIntoParts(bytes(30), 10);
    const b = splitIntoParts(bytes(30), 15);
    expect(() => joinParts([a[0]!, b[1]!])).toThrow(PartsError);
  });

  it("empty_list_raises_error", () => {
    expect(() => joinParts([])).toThrow(PartsError);
  });

  it("rejects_invalid_part_size", () => {
    for (const size of [0, -1, 1.5, Number.NaN]) expect(() => splitIntoParts(bytes(5), size)).toThrow(RangeError);
  });

  it("does_not_change_the_input_data", () => {
    const original = bytes(20);
    const copy = new Uint8Array(original);
    splitIntoParts(original, 7);
    expect(original).toEqual(copy);
  });
});
