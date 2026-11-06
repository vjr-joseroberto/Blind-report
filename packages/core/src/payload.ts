import { fromBase64Url, toBase64Url } from "./base64url.ts";

export type Attachment = { name: string; data: Uint8Array };
export type Payload = { text: string; attachment?: Attachment };

export class PayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayloadError";
  }
}

/** Content that the source encrypts: text and, if the policy allows it, an attachment. */
export function encodePayload(p: Payload): Uint8Array {
  const body: Record<string, unknown> = { v: 1, text: p.text };
  if (p.attachment) body.attachment = { name: p.attachment.name, data: toBase64Url(p.attachment.data) };
  return new TextEncoder().encode(JSON.stringify(body));
}

export function decodePayload(bytes: Uint8Array): Payload {
  let raw: any;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PayloadError("The content is not a tip in the expected format.");
  }
  if (raw?.v !== 1 || typeof raw.text !== "string") throw new PayloadError("The content is not a tip in the expected format.");
  if (raw.attachment === undefined) return { text: raw.text };
  if (typeof raw.attachment?.name !== "string" || typeof raw.attachment?.data !== "string") throw new PayloadError("Malformed attachment.");
  return { text: raw.text, attachment: { name: raw.attachment.name, data: fromBase64Url(raw.attachment.data) } };
}
