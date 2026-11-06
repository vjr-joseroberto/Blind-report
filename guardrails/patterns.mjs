// Safe Whistle's "no Tor or similar anonymity networks" guardrail patterns.
// Single source: used by the Claude Code hook (.claude/hooks/block-anon.mjs), by the repository checker
// (check.mjs) and by the tests (patterns.test.mjs).
//
// RULE: no test, code, dependency or configuration in this project uses Tor, Nym, Nox, I2P, Lokinet, Anon-RPC
// or any other anonymity network. The app works over any network; anyone who wants a VPN or Tor decides that outside
// the app, on their own device. The Tor demonstration phase is BLOCKED (planning/99-tor-phase-BLOCKED.md).

/** Terms forbidden in CODE and CONFIGURATION (not in .md documentation, where the prohibition is explained). */
export const CODE_PATTERNS = [
  { name: "Tor", re: /\btor\b/i },
  { name: "TOR_* variable", re: /\bTOR_[A-Z]/ },
  { name: "tor-js / torsocks / tor-browser", re: /tor-?js|torsocks|tor-browser|torproject/i },
  { name: "Tor client package", re: /\b(tor-request|tor-control|granax|tor-router|node-tor|tor-ctrl)\b/i },
  { name: ".onion address", re: /\.onion\b/i },
  { name: "Nym", re: /\bnym\b|nymproject|nymtech|nym-(client|socks5)/i },
  { name: "Nox (mixnet)", re: /\bnox\b/i },
  { name: "mixnet", re: /\bmixnet\b/i },
  { name: "I2P / Lokinet", re: /\bi2p\b|\blokinet\b/i },
  { name: "SOCKS5 proxy", re: /socks5h?:\/\/|--socks5/i },
  { name: "Anon-RPC (out of project scope)", re: /@anon-rpc|AnonRpcWorker|anon-rpc\/browser-harness/i },
  { name: "Anon-RPC worker for Tor", re: /0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e/i },
  { name: "Anon-RPC worker for Nym", re: /0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0/i },
  { name: "Anon-RPC worker for Nox", re: /0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A/i },
  { name: "Anon-RPC Passthrough worker", re: /0x4fd77be300f31c5fe6ab266d35d27750a3478d27/i },
  { name: "demo anonymity-network gateway", re: /152\.236\.3\.22/ },
];

/** Bash execution: only what STARTS or INSTALLS an anonymity network (mentions in text do not block). */
export const BASH_PATTERNS = [
  { name: "run tor/torsocks/nym", re: /(^|[;&|(]\s*|\bsudo\s+|\bxargs\s+)(tor|torsocks|tor-browser|nym-client|nym-socks5-client|lokinet|i2pd)(\s|$)/i },
  { name: "install or download Tor/Nym", re: /\b(apt(-get)?|brew|snap|pip3?|npm|pnpm|yarn|cargo|go|docker)\b[^\n;&|]*\b(install|add|i|pull|run|get)\b[^\n;&|]*\b(tor|torproject[^\s]*|nym[^\s]*|lokinet|i2pd?)\b/i },
  { name: "install Anon-RPC", re: /\b(npm|pnpm|yarn)\b[^\n;&|]*\b(install|add|i)\b[^\n;&|]*@anon-rpc/i },
  { name: "TOR_* variable", re: /\bTOR_[A-Z]/ },
  { name: "known anonymity worker/gateway", re: /0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e|0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0|0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A|152\.236\.3\.22/i },
  { name: "SOCKS proxy or Tor port", re: /socks5h?:\/\/|--socks5(-hostname)?\b|--proxy[= ]\S*(9050|9150)/i },
  { name: ".onion address", re: /\.onion\b/i },
];

const DOC_EXT = /\.(md|mdx|txt|docx|odt|pdf)$/i;
const SELF = /(^|\/)(guardrails\/|\.claude\/(hooks\/|settings(\.local)?\.json)|CLAUDE\.md$|GUARDRAILS\.md$)/;
export const isExemptPath = (p = "") => DOC_EXT.test(p) || SELF.test(p.replace(/\\/g, "/"));

export function scanText(text) {
  return CODE_PATTERNS.filter(({ re }) => re.test(text)).map(({ name }) => name);
}
export function scanBash(command) {
  return BASH_PATTERNS.filter(({ re }) => re.test(command)).map(({ name }) => name);
}
