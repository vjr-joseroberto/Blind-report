#!/usr/bin/env node
// V-05 — Static analysis: which hosts does the IDKit code reference?
// Usage: node validation/v05-idkit-hosts.mjs <folder with node_modules/@worldcoin>
// Scans the published files (.js/.mjs/.cjs/.json) and extracts https/wss URLs and mentioned domains.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("Usage: node validation/v05-idkit-hosts.mjs <folder with node_modules/@worldcoin>");
  process.exit(2);
}

const URL_RE = /\b(?:https?|wss?):\/\/[a-zA-Z0-9._~:/?#@!$&'()*+,;=%-]+/g;
const found = new Map(); // host -> { files:Set, samples:Set }

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name !== ".bin") walk(p); continue; }
    if (!/\.(m?js|cjs|json|d\.ts)$/.test(name)) continue;
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(URL_RE)) {
      let u;
      try { u = new URL(m[0].replace(/[),.;'"`]+$/, "")); } catch { continue; }
      const host = u.hostname;
      if (!host.includes(".")) continue;
      const e = found.get(host) ?? { files: new Set(), samples: new Set() };
      e.files.add(p.replace(root, ""));
      if (e.samples.size < 2) e.samples.add(u.origin + u.pathname.slice(0, 40));
      found.set(host, e);
    }
  }
}
walk(root);

const hosts = [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
console.log(`| Host | Files | Example |\n|---|---|---|`);
for (const [host, e] of hosts) console.log(`| ${host} | ${e.files.size} | ${[...e.samples][0]} |`);
console.log(`\nTotal: ${hosts.length} distinct hosts.`);
