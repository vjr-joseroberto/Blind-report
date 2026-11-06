import { describe, expect, it } from "vitest";
import { PayloadError, decodePayload, encodePayload } from "../src/index.ts";

describe("encrypted tip content (text + optional attachment)", () => {
  it("round_trip_with_text_only", () => {
    expect(decodePayload(encodePayload({ text: "olá ção" }))).toEqual({ text: "olá ção" });
  });

  it("round_trip_with_binary_attachment", () => {
    const data = new Uint8Array([0, 1, 2, 255, 254]);
    const out = decodePayload(encodePayload({ text: "x", attachment: { name: "doc.pdf", data } }));
    expect(out.attachment?.name).toBe("doc.pdf");
    expect([...out.attachment!.data]).toEqual([...data]);
  });

  it("rejects_content_that_is_not_a_payload", () => {
    expect(() => decodePayload(new TextEncoder().encode("nao json"))).toThrow(PayloadError);
    expect(() => decodePayload(new TextEncoder().encode('{"v":2,"text":"a"}'))).toThrow(PayloadError);
    expect(() => decodePayload(new TextEncoder().encode('{"v":1}'))).toThrow(PayloadError);
  });
});
