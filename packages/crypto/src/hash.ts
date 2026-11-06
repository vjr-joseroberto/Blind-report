import { sodium } from "./sodium.ts";

const toHex = (bytes: Uint8Array) => "0x" + sodium.to_hex(bytes);

/** BLAKE2b-256 de uma sequência de partes, em hexadecimal com prefixo 0x. */
export function hashHex(...parts: Uint8Array[]): string {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }
  return toHex(sodium.crypto_generichash(32, buf, null));
}
