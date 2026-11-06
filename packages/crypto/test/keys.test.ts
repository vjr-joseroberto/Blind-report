import { describe, expect, it } from "vitest";
import { newKeypair } from "../src/index.ts";
import { seededRandom } from "./helpers.ts";

describe("newKeypair", () => {
  it("generates_32_byte_keys", () => {
    const k = newKeypair();
    expect(k.publicKey).toHaveLength(32);
    expect(k.privateKey).toHaveLength(32);
  });

  it("two_calls_generate_different_keys", () => {
    expect(newKeypair().publicKey).not.toEqual(newKeypair().publicKey);
  });

  it("the_public_key_is_not_equal_to_the_private_key", () => {
    const k = newKeypair();
    expect(k.publicKey).not.toEqual(k.privateKey);
  });

  it("with_injected_randomness_the_result_is_reproducible", () => {
    const a = newKeypair({ random: seededRandom(5) });
    const b = newKeypair({ random: seededRandom(5) });
    expect(a).toEqual(b);
  });
});
