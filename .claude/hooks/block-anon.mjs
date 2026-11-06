#!/usr/bin/env node
// Claude Code PreToolUse hook: denies Bash commands and writes (Write/Edit) that use Tor/Nym or anonymity networks.
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
  const reason = `GUARDRAIL: this project does not use Tor, Nym or similar anonymity networks (detected: ${[...new Set(hits)].join(", ")}). ` +
    "Do not run or write this. The end user chooses VPN/Tor on their own, outside the app. See GUARDRAILS.md.";
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}
process.exit(0);
