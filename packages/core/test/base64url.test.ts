import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "../src/index.ts";

describe("base64url (sem preenchimento)", () => {
  it("codifica_vetores_conhecidos", () => {
    expect(toBase64Url(new Uint8Array())).toBe("");
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
    expect(toBase64Url(new TextEncoder().encode("Man"))).toBe("TWFu");
    expect(toBase64Url(new TextEncoder().encode("Ma"))).toBe("TWE");
  });

  it("decodifica_vetores_conhecidos", () => {
    expect(fromBase64Url("-_8")).toEqual(new Uint8Array([0xfb, 0xff]));
    expect(fromBase64Url("TWFu")).toEqual(new TextEncoder().encode("Man"));
  });

  it("32_bytes_geram_43_caracteres", () => {
    expect(toBase64Url(new Uint8Array(32).fill(255))).toHaveLength(43);
  });

  it("propriedade_ida_e_volta", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (b) => {
        expect(fromBase64Url(toBase64Url(b))).toEqual(b);
      }),
    );
  });

  it("recusa_caracteres_invalidos_preenchimento_e_tamanho_impossivel", () => {
    for (const bad of ["a+b", "a/b", "ab==", "a b", "a", "abcde"]) expect(() => fromBase64Url(bad), bad).toThrow(RangeError);
  });
});
