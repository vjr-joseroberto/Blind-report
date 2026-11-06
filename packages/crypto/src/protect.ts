import { fromBase64Url, toBase64Url } from "@safe-whistle/core";
import { withDefaults, type Deps } from "./deps.ts";
import { CryptoError } from "./errors.ts";
import type { Keypair } from "./keys.ts";
import { sodium } from "./sodium.ts";

/** OWASP (2023) para PBKDF2-HMAC-SHA256. O WebCrypto existe no navegador e no Node, sem dependência extra. */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
const MIN_PASSWORD = 8;
const MAX_ITERATIONS = 10_000_000;

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const base = await globalThis.crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations }, base, 256);
  return new Uint8Array(bits);
}

/** Protege dados com uma senha: PBKDF2 para derivar a chave e XSalsa20-Poly1305 (secretbox) para cifrar. */
export async function lockWithPassword(data: Uint8Array, password: string, opts: { iterations?: number } & Partial<Deps> = {}): Promise<string> {
  if (password.length < MIN_PASSWORD) throw new CryptoError("input", `A senha deve ter ao menos ${MIN_PASSWORD} caracteres.`);
  const iterations = opts.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const d = withDefaults(opts);
  const salt = d.random(16);
  const nonce = d.random(sodium.crypto_secretbox_NONCEBYTES);
  const key = await deriveKey(password, salt, iterations);
  const ct = sodium.crypto_secretbox_easy(data, nonce, key);
  return toBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, kdf: "pbkdf2-sha256", iter: iterations, salt: toBase64Url(salt), nonce: toBase64Url(nonce), ct: toBase64Url(ct) })));
}

export async function unlockWithPassword(blob: string, password: string): Promise<Uint8Array> {
  let raw: any;
  let salt: Uint8Array, nonce: Uint8Array, ct: Uint8Array;
  try {
    raw = JSON.parse(new TextDecoder().decode(fromBase64Url(blob)));
    if (raw?.v !== 1 || raw.kdf !== "pbkdf2-sha256" || !Number.isInteger(raw.iter) || raw.iter < 1 || raw.iter > MAX_ITERATIONS) throw new Error();
    salt = fromBase64Url(raw.salt);
    nonce = fromBase64Url(raw.nonce);
    ct = fromBase64Url(raw.ct);
    if (nonce.length !== sodium.crypto_secretbox_NONCEBYTES) throw new Error();
  } catch {
    throw new CryptoError("format", "O arquivo protegido está malformado.");
  }
  const key = await deriveKey(password, salt, raw.iter);
  try {
    return sodium.crypto_secretbox_open_easy(ct, nonce, key);
  } catch {
    throw new CryptoError("decrypt", "Senha incorreta ou arquivo adulterado.");
  }
}

/** Cifra dados para o dono de uma chave pública (caixa selada anônima). */
export function sealTo(publicKey: Uint8Array, data: Uint8Array): Uint8Array {
  if (publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) throw new CryptoError("key", "Chave pública inválida.");
  if (data.length === 0) throw new CryptoError("input", "Não há o que cifrar.");
  return sodium.crypto_box_seal(data, publicKey);
}

export function openSealed(sealed: Uint8Array, keypair: Keypair): Uint8Array {
  try {
    return sodium.crypto_box_seal_open(sealed, keypair.publicKey, keypair.privateKey);
  } catch {
    throw new CryptoError("decrypt", "Não foi possível abrir: chave errada ou conteúdo adulterado.");
  }
}
