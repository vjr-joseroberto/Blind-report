import { isNewsroomName } from "./action.ts";
import { PayloadError } from "./payload.ts";

export type ReplyPayload = { newsroom: string; text: string };

/** What the newsroom encrypts for the source. It carries the newsroom name so that a reply from one newsroom is not valid in another. */
export function encodeReply(r: ReplyPayload): Uint8Array {
  if (!isNewsroomName(r.newsroom)) throw new PayloadError("Invalid newsroom name in the reply.");
  if (r.text.trim() === "") throw new PayloadError("The reply cannot be empty.");
  return new TextEncoder().encode(JSON.stringify({ v: 1, newsroom: r.newsroom, text: r.text }));
}

export function decodeReply(bytes: Uint8Array): ReplyPayload {
  let raw: any;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PayloadError("The reply is not in the expected format.");
  }
  if (raw?.v !== 1 || typeof raw.text !== "string" || typeof raw.newsroom !== "string" || !isNewsroomName(raw.newsroom)) {
    throw new PayloadError("The reply is not in the expected format.");
  }
  return { newsroom: raw.newsroom, text: raw.text };
}
