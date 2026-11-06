import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFileNullifierStore, createMemoryNullifierStore, usedKey, type NullifierStore } from "../src/index.ts";

const NULLIFIER = "0x" + "ab".repeat(30);
const ACTION = "submit:investiga.eth:202611";

function contract(label: string, make: () => NullifierStore) {
  describe(`armazém de nullifiers: ${label}`, () => {
    it("a_primeira_reivindicacao_vence_e_a_segunda_perde", async () => {
      const s = make();
      expect(await s.claim("k1")).toBe(true);
      expect(await s.claim("k1")).toBe(false);
      expect(await s.claim("k2")).toBe(true);
    });

    it("liberar_permite_reivindicar_de_novo", async () => {
      const s = make();
      await s.claim("k1");
      await s.release("k1");
      expect(await s.claim("k1")).toBe(true);
    });

    it("duas_reivindicacoes_simultaneas_so_uma_vence", async () => {
      const s = make();
      const r = await Promise.all([s.claim("k"), s.claim("k"), s.claim("k")]);
      expect(r.filter(Boolean)).toHaveLength(1);
    });

    it("has_reflete_o_estado", async () => {
      const s = make();
      expect(await s.has("k")).toBe(false);
      await s.claim("k");
      expect(await s.has("k")).toBe(true);
    });
  });
}

contract("em memória", () => createMemoryNullifierStore());
contract("em arquivo", () => createFileNullifierStore(join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl")));

describe("usedKey (chave do par nullifier+ação)", () => {
  it("e_um_hash_e_nao_contem_o_nullifier_nem_a_acao", () => {
    const k = usedKey(NULLIFIER, ACTION);
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain("abab");
    expect(k).not.toContain("submit");
  });

  it("muda_com_a_acao_e_com_o_nullifier_e_e_estavel", () => {
    expect(usedKey(NULLIFIER, ACTION)).toBe(usedKey(NULLIFIER, ACTION));
    expect(usedKey(NULLIFIER, ACTION)).not.toBe(usedKey(NULLIFIER, "submit:outra.eth:202611"));
    expect(usedKey(NULLIFIER, ACTION)).not.toBe(usedKey("0x" + "cd".repeat(30), ACTION));
  });

  it("normaliza_o_formato_do_nullifier", () => {
    expect(usedKey("0x10", ACTION)).toBe(usedKey("0x0010", ACTION));
  });

  it("recusa_nullifier_malformado", () => {
    expect(() => usedKey("zzz", ACTION)).toThrow();
  });
});

describe("armazém em arquivo (RN-05 e persistência)", () => {
  it("persiste_entre_instancias", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl");
    await createFileNullifierStore(path).claim("persistente");
    expect(await createFileNullifierStore(path).claim("persistente")).toBe(false);
  });

  it("o_arquivo_guarda_apenas_hashes", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl");
    const s = createFileNullifierStore(path);
    await s.claim(usedKey(NULLIFIER, ACTION));
    const content = readFileSync(path, "utf8");
    expect(content).not.toContain("abab");
    expect(content).not.toContain("submit:");
    expect(content.trim().split("\n").every((l) => /^[0-9a-f]{64}$/.test(l.trim()))).toBe(true);
  });

  it("a_liberacao_e_persistida", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl");
    const a = createFileNullifierStore(path);
    await a.claim("x");
    await a.release("x");
    expect(await createFileNullifierStore(path).claim("x")).toBe(true);
  });

  it("ignora_linhas_vazias_e_recusa_chaves_com_quebra_de_linha", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "sw-gate-")), "claims.jsonl");
    writeFileSync(path, "\n\nabc\n\n");
    const s = createFileNullifierStore(path);
    expect(await s.claim("abc")).toBe(false);
    await expect(s.claim("a\nb")).rejects.toThrow();
  });
});
