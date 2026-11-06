import { fromBase64Url, toBase64Url } from "@safe-whistle/core";
import type { Keypair } from "@safe-whistle/crypto";

export type KeyEntry = { version: number; publicKey: Uint8Array; privateKey: Uint8Array };

export const keysToJson = (keys: KeyEntry[]) =>
  keys.map((k) => ({ version: k.version, publicKey: toBase64Url(k.publicKey), privateKey: toBase64Url(k.privateKey) }));

export function keysFromJson(raw: unknown): KeyEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("no keys");
  return raw.map((k: any) => {
    if (!Number.isInteger(k?.version) || k.version < 1 || typeof k.publicKey !== "string" || typeof k.privateKey !== "string") throw new Error("malformed key");
    return { version: k.version, publicKey: fromBase64Url(k.publicKey), privateKey: fromBase64Url(k.privateKey) };
  });
}

export const asKeypair = (k: KeyEntry): Keypair => ({ publicKey: k.publicKey, privateKey: k.privateKey });
