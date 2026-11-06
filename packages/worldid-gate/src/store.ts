import { Nullifier } from "@worldcoin/idkit-core/nullifier";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { NullifierStore } from "./types.ts";

/** Chave do par (nullifier, ação): só o hash é guardado, nunca o nullifier nem a ação. Lança se o nullifier for inválido. */
export function usedKey(nullifier: string, action: string): string {
  const canonical = Nullifier.fromHex(nullifier).toCanonicalString();
  return createHash("sha256").update(`${canonical}|${action}`).digest("hex");
}

export function createMemoryNullifierStore(): NullifierStore {
  const used = new Set<string>();
  return {
    async has(key) {
      return used.has(key);
    },
    async claim(key) {
      if (used.has(key)) return false;
      used.add(key);
      return true;
    },
    async release(key) {
      used.delete(key);
    },
  };
}

/** Armazém persistente: um hash por linha. Um único processo por arquivo. */
export function createFileNullifierStore(path: string): NullifierStore {
  mkdirSync(dirname(path), { recursive: true });
  const used = new Set<string>(existsSync(path) ? readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : []);
  const check = (key: string) => {
    if (key.length === 0 || /[\r\n]/.test(key)) throw new Error("Chave inválida.");
  };
  return {
    async has(key) {
      return used.has(key);
    },
    async claim(key) {
      check(key);
      if (used.has(key)) return false;
      used.add(key);
      appendFileSync(path, key + "\n");
      return true;
    },
    async release(key) {
      if (!used.delete(key)) return;
      writeFileSync(path, [...used].map((k) => k + "\n").join(""));
    },
  };
}
