import { describe, expect, it } from "vitest";
import { ARKIV_MAX_BYTES, ARKIV_PRACTICAL_ENTITY_BYTES, DEFAULT_MAX_BYTES, ENS_KEYS, PART_PAYLOAD_BYTES } from "../src/index.ts";

describe("limits and constants", () => {
  it("part_limit_fits_comfortably_within_the_practical_entity_limit", () => {
    expect(ARKIV_PRACTICAL_ENTITY_BYTES).toBeLessThan(ARKIV_MAX_BYTES);
    expect(ARKIV_PRACTICAL_ENTITY_BYTES - PART_PAYLOAD_BYTES).toBeGreaterThanOrEqual(4096); // envelope header and wrapped keys
  });

  it("the_default_policy_size_is_reasonable", () => {
    expect(DEFAULT_MAX_BYTES).toBeGreaterThan(0);
    expect(DEFAULT_MAX_BYTES).toBeLessThanOrEqual(10 * 1024 * 1024);
  });

  it("ens_text_keys_are_unique_and_prefixed", () => {
    const values = Object.values(ENS_KEYS);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v.startsWith("denuncia.")).toBe(true);
  });
});
