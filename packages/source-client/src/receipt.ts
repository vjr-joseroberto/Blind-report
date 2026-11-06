import { fromBase64Url, toBase64Url } from "@safe-whistle/core";
import { SourceError } from "./errors.ts";
import type { SourceReceipt } from "./types.ts";

const bad = () => new SourceError("invalid_receipt", "O recibo é inválido ou está incompleto.");

export function serializeReceipt(r: SourceReceipt): string {
  return JSON.stringify({
    v: 1, newsroom: r.newsroom, key: r.key, contentHash: r.contentHash,
    salt: toBase64Url(r.salt), mailboxPriv: toBase64Url(r.mailboxPriv), mailboxPub: toBase64Url(r.mailboxPub),
  });
}

export function parseReceipt(text: string): SourceReceipt {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw bad();
  }
  if (raw?.v !== 1) throw bad();
  for (const f of ["newsroom", "key", "contentHash", "salt", "mailboxPriv", "mailboxPub"]) if (typeof raw[f] !== "string") throw bad();
  try {
    return { newsroom: raw.newsroom, key: raw.key, contentHash: raw.contentHash, salt: fromBase64Url(raw.salt), mailboxPriv: fromBase64Url(raw.mailboxPriv), mailboxPub: fromBase64Url(raw.mailboxPub) };
  } catch {
    throw bad();
  }
}
