import { describe, expect, it } from "vitest";
import { RPC_TRANSPORT } from "../src/index.ts";

describe("opções de repetição para o RPC público (V-06)", () => {
  it("tem_repeticao_limitada_atraso_e_tempo_maximo", () => {
    expect(RPC_TRANSPORT.retryCount).toBeGreaterThanOrEqual(2);
    expect(RPC_TRANSPORT.retryCount).toBeLessThanOrEqual(5);
    expect(RPC_TRANSPORT.retryDelay).toBeGreaterThan(0);
    expect(RPC_TRANSPORT.timeout).toBeGreaterThanOrEqual(5_000);
    expect(RPC_TRANSPORT.timeout).toBeLessThanOrEqual(30_000);
  });
});
