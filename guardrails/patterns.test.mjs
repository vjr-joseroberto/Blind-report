// Testes do próprio guardrail (TDD): rode com `npm run test:guardrails` (node --test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { scanText, scanBash, isExemptPath } from "./patterns.mjs";

const blocksText = (s) => assert.ok(scanText(s).length > 0, `deveria bloquear: ${s}`);
const allowsText = (s) => assert.deepEqual(scanText(s), [], `deveria permitir: ${s}`);
const blocksBash = (s) => assert.ok(scanBash(s).length > 0, `deveria bloquear: ${s}`);
const allowsBash = (s) => assert.deepEqual(scanBash(s), [], `deveria permitir: ${s}`);

test("código: bloqueia Tor, Nym, Nox, I2P, Lokinet, mixnet, .onion, SOCKS", () => {
  for (const s of [
    'import tor from "tor-js"', "const via = 'Tor'", "TOR_GATEWAY=1", "http://abc.onion/", "nym-client init",
    "const net = 'nox'", "mixnet", "i2p", "lokinet", "socks5h://127.0.0.1:9050", "torsocks curl",
  ]) blocksText(s);
});

test("código: bloqueia o Anon-RPC e os endereços de workers conhecidos", () => {
  for (const s of [
    'import { AnonRpcWorker } from "@anon-rpc/browser-harness"',
    "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e", "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0",
    "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A", "0x4fd77be300f31c5fe6ab266d35d27750a3478d27", "152.236.3.22",
  ]) blocksText(s);
});

test("código: não gera falso positivo com palavras comuns", () => {
  for (const s of [
    "const operator = 1; // creator, editor, factory", "Operator-backend", "const story = 'history'",
    "import { sealEnvelope } from './crypto'", "const authorize = true", "https://ethereum-sepolia-rpc.publicnode.com",
  ]) allowsText(s);
});

test("bash: bloqueia executar ou instalar redes de anonimato", () => {
  for (const s of [
    "tor", "sudo apt install tor", "brew install nym", "docker pull torproject/tor", "TOR_X=1 node a.js",
    "curl --socks5-hostname 127.0.0.1:9050 https://x", "npm i @anon-rpc/browser-harness", "node a.js 152.236.3.22",
  ]) blocksBash(s);
});

test("bash: permite comandos comuns e menções em texto", () => {
  for (const s of [
    "npm run test", "docker run -d anvil", "git status", "ls Operator-backend", "npm install viem",
    "echo 'este projeto não usa nenhuma rede de anonimato'",
  ]) allowsBash(s);
});

test("caminhos isentos: documentação e arquivos do próprio guardrail", () => {
  for (const p of ["docs/a.md", "planejamento/99.md", "guardrails/patterns.mjs", ".claude/hooks/block-anon.mjs", "CLAUDE.md", "GUARDRAILS.md"])
    assert.equal(isExemptPath(p), true, p);
  for (const p of ["packages/crypto/src/a.ts", "apps/relayer/package.json", "tests/e2e/a.ts"])
    assert.equal(isExemptPath(p), false, p);
});
