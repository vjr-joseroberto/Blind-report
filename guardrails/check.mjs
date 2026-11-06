#!/usr/bin/env node
// Repository checker: fails (exit 1) if any code/configuration mentions Tor, Nym or anonymity networks.
// Usage: node guardrails/check.mjs [folder ...]   (default: parent folder of this file)
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
  console.error("GUARDRAIL VIOLATION: this project does not use Tor, Nym or similar anonymity networks.\n");
  for (const v of violations) console.error(`  ${v.file}: ${v.hits.join("; ")}`);
  console.error("\nSee GUARDRAILS.md. Remove the snippet: the anonymous-network phase is BLOCKED (planning/99-tor-phase-BLOCKED.md).");
  process.exit(1);
}
console.log("guardrails OK: no use of Tor/Nym/anonymity networks in code or configuration.");
