import { describe, expect, it } from "vitest";
import { ProofError, proofErrorFromIdKit } from "../src/index.ts";

describe("tradução dos erros do IDKit", () => {
  it.each([
    ["timeout", "expired"], ["Request expired", "expired"], ["user cancelled the request", "cancelled"], ["aborted", "cancelled"],
    ["verification rejected", "denied"], ["connection_failed", "denied"], [undefined, "denied"],
  ] as const)("%s -> %s", (raw, reason) => {
    const e = proofErrorFromIdKit(raw);
    expect(e).toBeInstanceOf(ProofError);
    expect(e.reason).toBe(reason);
  });
});
