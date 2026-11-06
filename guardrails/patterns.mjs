// Padrões do guardrail "sem Tor nem redes de anonimato semelhantes" do Safe Whistle.
// Fonte única: usada pelo hook do Claude Code (.claude/hooks/block-anon.mjs), pelo verificador do repositório
// (check.mjs) e pelos testes (patterns.test.mjs).
//
// REGRA: nenhum teste, código, dependência ou configuração deste projeto usa Tor, Nym, Nox, I2P, Lokinet, o Anon-RPC
// ou qualquer outra rede de anonimato. O app funciona sobre qualquer rede; quem quiser VPN ou Tor decide isso fora do
// app, no próprio aparelho. A fase de demonstração com Tor está BLOQUEADA (planejamento/99-fase-tor-BLOQUEADA.md).

/** Termos proibidos em CÓDIGO e CONFIGURAÇÃO (não em documentação .md, onde a proibição é explicada). */
export const CODE_PATTERNS = [
  { name: "Tor", re: /\btor\b/i },
  { name: "variável TOR_*", re: /\bTOR_[A-Z]/ },
  { name: "tor-js / torsocks / tor-browser", re: /tor-?js|torsocks|tor-browser|torproject/i },
  { name: "pacote de cliente Tor", re: /\b(tor-request|tor-control|granax|tor-router|node-tor|tor-ctrl)\b/i },
  { name: "endereço .onion", re: /\.onion\b/i },
  { name: "Nym", re: /\bnym\b|nymproject|nymtech|nym-(client|socks5)/i },
  { name: "Nox (mixnet)", re: /\bnox\b/i },
  { name: "mixnet", re: /\bmixnet\b/i },
  { name: "I2P / Lokinet", re: /\bi2p\b|\blokinet\b/i },
  { name: "proxy SOCKS5", re: /socks5h?:\/\/|--socks5/i },
  { name: "Anon-RPC (fora do escopo do projeto)", re: /@anon-rpc|AnonRpcWorker|anon-rpc\/browser-harness/i },
  { name: "worker Anon-RPC de Tor", re: /0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e/i },
  { name: "worker Anon-RPC de Nym", re: /0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0/i },
  { name: "worker Anon-RPC de Nox", re: /0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A/i },
  { name: "worker Anon-RPC Passthrough", re: /0x4fd77be300f31c5fe6ab266d35d27750a3478d27/i },
  { name: "gateway de rede anônima de demonstração", re: /152\.236\.3\.22/ },
];

/** Execução em Bash: só o que INICIA ou INSTALA uma rede de anonimato (menções em texto não bloqueiam). */
export const BASH_PATTERNS = [
  { name: "executar tor/torsocks/nym", re: /(^|[;&|(]\s*|\bsudo\s+|\bxargs\s+)(tor|torsocks|tor-browser|nym-client|nym-socks5-client|lokinet|i2pd)(\s|$)/i },
  { name: "instalar ou baixar Tor/Nym", re: /\b(apt(-get)?|brew|snap|pip3?|npm|pnpm|yarn|cargo|go|docker)\b[^\n;&|]*\b(install|add|i|pull|run|get)\b[^\n;&|]*\b(tor|torproject[^\s]*|nym[^\s]*|lokinet|i2pd?)\b/i },
  { name: "instalar o Anon-RPC", re: /\b(npm|pnpm|yarn)\b[^\n;&|]*\b(install|add|i)\b[^\n;&|]*@anon-rpc/i },
  { name: "variável TOR_*", re: /\bTOR_[A-Z]/ },
  { name: "worker/gateway de anonimato conhecido", re: /0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e|0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0|0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A|152\.236\.3\.22/i },
  { name: "proxy SOCKS ou porta Tor", re: /socks5h?:\/\/|--socks5(-hostname)?\b|--proxy[= ]\S*(9050|9150)/i },
  { name: "endereço .onion", re: /\.onion\b/i },
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
