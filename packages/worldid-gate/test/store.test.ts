import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileNullifierStore, createMemoryNullifierStore, usedKey, type NullifierStore } from "../src/index.ts";

const NULLIFIER = "0x" + "ab".repeat(30);
const ACTION = "submit:investiga.eth:202611";

function contract(label: string, make: () => NullifierStore) {
  describe(`nullifier store: ${label}`, () => {
    it("the_first_claim_wins_and_the_second_loses", async () => {
      const s = make();
      expect(await s.claim("k1")).toBe(true);
      expect(await s.claim("k1")).toBe(false);
      expect(await s.claim("k2")).toBe(true);
    });

    it("releasing_allows_claiming_again", async () => {
      const s = make();
      await s.claim("k1");
      await s.release("k1");
      expect(await s.claim("k1")).toBe(true);
    });

    it("two_simultaneous_claims_only_one_wins", async () => {
      const s = make();
      const r = await Promise.all([s.claim("k"), s.claim("k"), s.claim("k")]);
      expect(r.filter(Boolean)).toHaveLength(1);
    });

    it("has_reflects_the_state", async () => {
      const s = make();
      expect(await s.has("k")).toBe(false);
      await s.claim("k");
      expect(await s.has("k")).toBe(true);
    });
  });
}

contract("in memory", () => createMemoryNullifierStore());
contract("on file", () => createFileNullifierStore(join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl")));

describe("usedKey (key for the nullifier+action pair)", () => {
  it("is_a_hash_and_contains_neither_the_nullifier_nor_the_action", () => {
    const k = usedKey(NULLIFIER, ACTION);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain("abab");
    expect(k).not.toContain("submit");
  });

  it("changes_with_the_action_and_the_nullifier_and_is_stable", () => {
    expect(usedKey(NULLIFIER, ACTION)).toBe(usedKey(NULLIFIER, ACTION));
    expect(usedKey(NULLIFIER, ACTION)).not.toBe(usedKey(NULLIFIER, "submit:outra.eth:202611"));
    expect(usedKey(NULLIFIER, ACTION)).not.toBe(usedKey("0x" + "cd".repeat(30), ACTION));
  });

  it("normalizes_the_nullifier_format", () => {
    expect(usedKey("0x10", ACTION)).toBe(usedKey("0x0010", ACTION));
  });

  it("refuses_malformed_nullifier", () => {
    expect(() => usedKey("zzz", ACTION)).toThrow();
  });
});

describe("file store (RN-05 and persistence)", () => {
  it("persists_across_instances", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl");
    await createFileNullifierStore(path).claim("persistente");
    expect(await createFileNullifierStore(path).claim("persistente")).toBe(false);
  });

  it("the_file_stores_only_hashes", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl");
    const s = createFileNullifierStore(path);
    await s.claim(usedKey(NULLIFIER, ACTION));
    const content = readFileSync(path, "utf8");
    expect(content).not.toContain("abab");
    expect(content).not.toContain("submit:");
    expect(content.trim().split("\n").every((l) => /^[0-9a-f]{64}$/.test(l.trim()))).toBe(true);
  });

  it("release_is_persisted", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl");
    const a = createFileNullifierStore(path);
    await a.claim("x");
    await a.release("x");
    expect(await createFileNullifierStore(path).claim("x")).toBe(true);
  });

  it("ignores_empty_lines_and_refuses_keys_with_line_breaks", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl");
    writeFileSync(path, "\n\nabc\n\n");
    const s = createFileNullifierStore(path);
    expect(await s.claim("abc")).toBe(false);
    await expect(s.claim("a\nb")).rejects.toThrow();
  });
});
