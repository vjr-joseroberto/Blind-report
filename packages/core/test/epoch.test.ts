import { describe, expect, it } from "vitest";
import { currentEpoch, epochOf, isEpoch } from "../src/index.ts";

describe("RN-01 época mensal", () => {
  it("mesma_data_mesma_epoca", () => {
    expect(epochOf(new Date("2026-11-01T00:00:00Z"))).toBe(202611);
    expect(epochOf(new Date("2026-11-30T23:59:59.999Z"))).toBe(202611);
  });

  it("virada_do_mes_muda_a_epoca", () => {
    expect(epochOf(new Date("2026-11-30T23:59:59.999Z"))).toBe(202611);
    expect(epochOf(new Date("2026-12-01T00:00:00Z"))).toBe(202612);
  });

  it("virada_do_ano", () => {
    expect(epochOf(new Date("2026-12-31T23:59:59Z"))).toBe(202612);
    expect(epochOf(new Date("2027-01-01T00:00:00Z"))).toBe(202701);
  });

  it("usa_utc_e_nao_o_fuso_local", () => {
    // 23:30 em UTC-3 do dia 30/11 já é 02:30 UTC do dia 01/12
    expect(epochOf(new Date("2026-11-30T23:30:00-03:00"))).toBe(202612);
  });

  it("recusa_data_invalida", () => {
    expect(() => epochOf(new Date("invalida"))).toThrow(RangeError);
  });

  it("currentEpoch_usa_o_relogio_injetado", () => {
    expect(currentEpoch(() => new Date("2027-02-10T10:00:00Z"))).toBe(202702);
  });

  it("isEpoch_valida_o_formato_AAAAMM", () => {
    expect(isEpoch(202611)).toBe(true);
    expect(isEpoch(202613)).toBe(false);
    expect(isEpoch(202600)).toBe(false);
    expect(isEpoch(20261)).toBe(false);
    expect(isEpoch(2026.5)).toBe(false);
    expect(isEpoch("202611" as unknown as number)).toBe(false);
  });
});
