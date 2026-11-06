import { Nullifier } from "@worldcoin/idkit-core/nullifier";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { NullifierStore } from "./types.ts";

/** Key for the (nullifier, action) pair: only the hash is stored, never the nullifier nor the action. Throws if the nullifier is invalid. */
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

/** Persistent store: one hash per line. A single process per file. */
export function createFileNullifierStore(path: string): NullifierStore {
  mkdirSync(dirname(path), { recursive: true });
  const used = new Set<string>(existsSync(path) ? readFileSync(path, "utf8").split("\n").map((l) => l.trim()).filter(Boolean) : []);
  const check = (key: string) => {
    if (key.length === 0 || /[\r\n]/.test(key)) throw new Error("Invalid key.");
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
