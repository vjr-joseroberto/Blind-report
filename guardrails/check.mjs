#!/usr/bin/env node
// Verificador do repositório: falha (exit 1) se algum código/configuração mencionar Tor, Nym ou redes de anonimato.
// Uso: node guardrails/check.mjs [pasta ...]   (padrão: pasta pai deste arquivo)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanText, isExemptPath } from "./patterns.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const targets = process.argv.slice(2).length ? process.argv.slice(2).map((p) => resolve(p)) : [ROOT];
const SKIP_DIR = new Set(["node_modules", "dist", "data", ".git", "abis", "c2"]);
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|json|sh|yml|yaml|html|env|toml)$/i;
const SKIP_FILE = /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/;

const violations = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIR.has(name)) walk(p); continue; }
    if (!SCAN_EXT.test(name) || SKIP_FILE.test(name) || isExemptPath(relative(ROOT, p))) continue;
    const hits = scanText(readFileSync(p, "utf8"));
    if (hits.length) violations.push({ file: relative(ROOT, p), hits });
  }
}
for (const t of targets) walk(t);

if (violations.length) {
  console.error("GUARDRAIL VIOLADO: este projeto não usa Tor, Nym nem redes de anonimato semelhantes.\n");
  for (const v of violations) console.error(`  ${v.file}: ${v.hits.join("; ")}`);
  console.error("\nVeja GUARDRAILS.md. Remova o trecho: a fase com rede anônima está BLOQUEADA (planejamento/99-fase-tor-BLOQUEADA.md).");
  process.exit(1);
}
console.log("guardrails OK: nenhum uso de Tor/Nym/redes de anonimato em código ou configuração.");
