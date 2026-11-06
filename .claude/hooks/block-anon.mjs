#!/usr/bin/env node
// Hook PreToolUse do Claude Code: nega comandos Bash e escritas (Write/Edit) que usem Tor/Nym ou redes de anonimato.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { scanText, scanBash, isExemptPath } = await import(resolve(here, "../../guardrails/patterns.mjs"));

let input = {};
try { input = JSON.parse(readFileSync(0, "utf8")); } catch { process.exit(0); }
const tool = input.tool_name;
const ti = input.tool_input ?? {};

let hits = [];
if (tool === "Bash") hits = scanBash(String(ti.command ?? ""));
else if (tool === "Write" || tool === "Edit") {
  const path = String(ti.file_path ?? "");
  if (!isExemptPath(path)) hits = scanText(String(ti.content ?? ti.new_string ?? ""));
}

if (hits.length) {
  const reason = `GUARDRAIL: este projeto não usa Tor, Nym nem redes de anonimato semelhantes (detectado: ${[...new Set(hits)].join(", ")}). ` +
    "Não execute nem escreva isso. O usuário final escolhe VPN/Tor por conta própria, fora do app. Veja GUARDRAILS.md.";
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}
process.exit(0);
