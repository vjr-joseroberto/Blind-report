import { describe, expect, it } from "vitest";
import { RPC_TRANSPORT } from "../src/index.ts";

describe("retry options for the public RPC (V-06)", () => {
  it("has_limited_retries_delay_and_maximum_time", () => {
    expect(RPC_TRANSPORT.retryCount).toBeGreaterThanOrEqual(2);
    expect(RPC_TRANSPORT.retryCount).toBeLessThanOrEqual(5);
    expect(RPC_TRANSPORT.retryDelay).toBeGreaterThan(0);
    expect(RPC_TRANSPORT.timeout).toBeGreaterThanOrEqual(5_000);
    expect(RPC_TRANSPORT.timeout).toBeLessThanOrEqual(30_000);
  });
});
