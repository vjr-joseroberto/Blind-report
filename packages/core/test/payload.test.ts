import { describe, expect, it } from "vitest";
import { PayloadError, decodePayload, encodePayload } from "../src/index.ts";

describe("conteúdo cifrado da denúncia (texto + anexo opcional)", () => {
  it("ida_e_volta_so_com_texto", () => {
    expect(decodePayload(encodePayload({ text: "olá ção" }))).toEqual({ text: "olá ção" });
  });

  it("ida_e_volta_com_anexo_binario", () => {
    const data = new Uint8Array([0, 1, 2, 255, 254]);
    const out = decodePayload(encodePayload({ text: "x", attachment: { name: "doc.pdf", data } }));
    expect(out.attachment?.name).toBe("doc.pdf");
    expect([...out.attachment!.data]).toEqual([...data]);
  });

  it("recusa_conteudo_que_nao_e_um_payload", () => {
    expect(() => decodePayload(new TextEncoder().encode("nao json"))).toThrow(PayloadError);
    expect(() => decodePayload(new TextEncoder().encode('{"v":2,"text":"a"}'))).toThrow(PayloadError);
    expect(() => decodePayload(new TextEncoder().encode('{"v":1}'))).toThrow(PayloadError);
  });
});
