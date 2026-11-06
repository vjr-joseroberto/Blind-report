import { describe, expect, it } from "vitest";
import { PayloadError, decodeReply, encodeReply } from "../src/index.ts";

describe("encrypted reply content (binds the reply to the newsroom)", () => {
  it("round_trip", () => {
    expect(decodeReply(encodeReply({ newsroom: "investiga.eth", text: "Recebemos. Olá ção" }))).toEqual({ newsroom: "investiga.eth", text: "Recebemos. Olá ção" });
  });

  it("rejects_plain_text_old_format_and_unknown_version", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(() => decodeReply(enc("Recebemos."))).toThrow(PayloadError);
    expect(() => decodeReply(enc('{"v":2,"newsroom":"a.eth","text":"x"}'))).toThrow(PayloadError);
    expect(() => decodeReply(enc('{"v":1,"text":"x"}'))).toThrow(PayloadError);
    expect(() => decodeReply(enc('{"v":1,"newsroom":"A.eth","text":"x"}'))).toThrow(PayloadError);
    expect(() => decodeReply(enc('{"v":1,"newsroom":"a.eth","text":5}'))).toThrow(PayloadError);
  });

  it("rejects_empty_reply_when_building", () => {
    expect(() => encodeReply({ newsroom: "a.eth", text: "  " })).toThrow(PayloadError);
    expect(() => encodeReply({ newsroom: "Invalida", text: "x" })).toThrow(PayloadError);
  });
});
