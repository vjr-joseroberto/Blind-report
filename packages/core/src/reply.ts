import { isNewsroomName } from "./action.ts";
import { PayloadError } from "./payload.ts";

export type ReplyPayload = { newsroom: string; text: string };

/** O que a redação cifra para a fonte. Leva o nome da redação para que a resposta de uma redação não valha em outra. */
export function encodeReply(r: ReplyPayload): Uint8Array {
  if (!isNewsroomName(r.newsroom)) throw new PayloadError("Nome de redação inválido na resposta.");
  if (r.text.trim() === "") throw new PayloadError("A resposta não pode ser vazia.");
  return new TextEncoder().encode(JSON.stringify({ v: 1, newsroom: r.newsroom, text: r.text }));
}

export function decodeReply(bytes: Uint8Array): ReplyPayload {
  let raw: any;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PayloadError("A resposta não está no formato esperado.");
  }
  if (raw?.v !== 1 || typeof raw.text !== "string" || typeof raw.newsroom !== "string" || !isNewsroomName(raw.newsroom)) {
    throw new PayloadError("A resposta não está no formato esperado.");
  }
  return { newsroom: raw.newsroom, text: raw.text };
}
