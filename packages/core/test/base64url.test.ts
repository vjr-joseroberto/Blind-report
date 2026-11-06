import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "../src/index.ts";

describe("base64url (without padding)", () => {
  it("encodes_known_vectors", () => {
    expect(toBase64Url(new Uint8Array())).toBe("");
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    expect(toBase64Url(new TextEncoder().encode("Man"))).toBe("TWFu");
    expect(toBase64Url(new TextEncoder().encode("Ma"))).toBe("TWE");
  });

  it("decodes_known_vectors", () => {
    expect(fromBase64Url("-_8")).toEqual(new Uint8Array([0xfb, 0xff]));
    expect(fromBase64Url("TWFu")).toEqual(new TextEncoder().encode("Man"));
  });

  it("32_bytes_yield_43_characters", () => {
    expect(toBase64Url(new Uint8Array(32).fill(255))).toHaveLength(43);
  });

  it("property_round_trip", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (b) => {
        expect(fromBase64Url(toBase64Url(b))).toEqual(b);
      }),
    );
  });

  it("rejects_invalid_characters_padding_and_impossible_length", () => {
    for (const bad of ["a+b", "a/b", "ab==", "a b", "a", "abcde"]) expect(() => fromBase64Url(bad), bad).toThrow(RangeError);
  });
});
