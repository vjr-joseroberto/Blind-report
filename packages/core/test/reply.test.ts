import { describe, expect, it } from "vitest";
import { PayloadError, decodeReply, encodeReply } from "../src/index.ts";

describe("conteúdo cifrado da resposta (liga a resposta à redação)", () => {
  it("ida_e_volta", () => {
    expect(decodeReply(encodeReply({ newsroom: "investiga.eth", text: "Recebemos. Olá ção" }))).toEqual({ newsroom: "investiga.eth", text: "Recebemos. Olá ção" });
  });

  it("recusa_texto_puro_formato_antigo_e_versao_desconhecida", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(() => decodeReply(enc("Recebemos."))).toThrow(PayloadError);
    expect(() => decodeReply(enc('{"v":2,"newsroom":"a.eth","text":"x"}'))).toThrow(PayloadError);
    expect(() => decodeReply(enc('{"v":1,"text":"x"}'))).toThrow(PayloadError);
    expect(() => decodeReply(enc('{"v":1,"newsroom":"A.eth","text":"x"}'))).toThrow(PayloadError);
    expect(() => decodeReply(enc('{"v":1,"newsroom":"a.eth","text":5}'))).toThrow(PayloadError);
  });

  it("recusa_resposta_vazia_ao_montar", () => {
    expect(() => encodeReply({ newsroom: "a.eth", text: "  " })).toThrow(PayloadError);
    expect(() => encodeReply({ newsroom: "Invalida", text: "x" })).toThrow(PayloadError);
  });
});
