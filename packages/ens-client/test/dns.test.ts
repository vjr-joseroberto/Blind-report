import { describe, expect, it } from "vitest";
import { InvalidNameError, dnsEncode } from "../src/index.ts";

describe("name in DNS format (ENSv2 setters do not use namehash)", () => {
  it("encodes_simple_name", () => {
    expect(dnsEncode("a.eth")).toBe("0x01610365746800");
  });

  it("encodes_subname_with_length_prefix_per_label", () => {
    // 9 'investiga', 6 'jornal', 3 'eth'
    expect(dnsEncode("investiga.jornal.eth")).toBe("0x09696e76657374696761066a6f726e616c0365746800");
  });

  it("always_ends_with_the_zero_byte", () => {
    expect(dnsEncode("x.y.eth").endsWith("00")).toBe(true);
  });

  it("rejects_empty_name_or_empty_label", () => {
    for (const bad of ["", ".", "a..eth", ".eth", "a.eth."]) expect(() => dnsEncode(bad), bad).toThrow(InvalidNameError);
  });

  it("rejects_label_with_more_than_63_bytes", () => {
    expect(() => dnsEncode(`${"a".repeat(64)}.eth`)).toThrow(InvalidNameError);
    expect(() => dnsEncode(`${"a".repeat(63)}.eth`)).not.toThrow();
  });

  it("rejects_uppercase_and_characters_outside_the_allowed_set", () => {
    for (const bad of ["A.eth", "a b.eth", "a_b.eth", "ação.eth", "a/b.eth", "-a.eth", "a-.eth"]) expect(() => dnsEncode(bad), bad).toThrow(InvalidNameError);
  });
});
