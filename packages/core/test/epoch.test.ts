import { describe, expect, it } from "vitest";
import { currentEpoch, epochOf, isEpoch } from "../src/index.ts";

describe("RN-01 monthly epoch", () => {
  it("same_date_same_epoch", () => {
    expect(epochOf(new Date("2026-11-01T00:00:00Z"))).toBe(202611);
    expect(epochOf(new Date("2026-11-30T23:59:59.999Z"))).toBe(202611);
  });

  it("month_rollover_changes_the_epoch", () => {
    expect(epochOf(new Date("2026-11-30T23:59:59.999Z"))).toBe(202611);
    expect(epochOf(new Date("2026-12-01T00:00:00Z"))).toBe(202612);
  });

  it("year_rollover", () => {
    expect(epochOf(new Date("2026-12-31T23:59:59Z"))).toBe(202612);
    expect(epochOf(new Date("2027-01-01T00:00:00Z"))).toBe(202701);
  });

  it("uses_utc_and_not_the_local_timezone", () => {
    // 23:30 in UTC-3 on 30/11 is already 02:30 UTC on 01/12
    expect(epochOf(new Date("2026-11-30T23:30:00-03:00"))).toBe(202612);
  });

  it("rejects_invalid_date", () => {
    expect(() => epochOf(new Date("invalida"))).toThrow(RangeError);
  });

  it("currentEpoch_uses_the_injected_clock", () => {
    expect(currentEpoch(() => new Date("2027-02-10T10:00:00Z"))).toBe(202702);
  });

  it("isEpoch_validates_the_YYYYMM_format", () => {
    expect(isEpoch(202611)).toBe(true);
    expect(isEpoch(202613)).toBe(false);
    expect(isEpoch(202600)).toBe(false);
    expect(isEpoch(20261)).toBe(false);
    expect(isEpoch(2026.5)).toBe(false);
    expect(isEpoch("202611" as unknown as number)).toBe(false);
  });
});
