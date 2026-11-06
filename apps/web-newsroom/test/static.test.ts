import { cspFor } from "@safe-whistle/network-policy";
import { newsroomNetworkPolicy } from "@safe-whistle/newsroom-client";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error o script de build é JavaScript
import { buildWeb } from "../build.mjs";

const config = { rpcUrl: "https://rpc.example.org", arkivRpcUrl: "https://arkiv.example.org" };
let html = "";
let js = "";
let csp = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "sw-web-"));
  ({ csp } = await buildWeb({ outDir: dir, config }));
  html = readFileSync(join(dir, "index.html"), "utf8");
  js = readFileSync(join(dir, "app.js"), "utf8");
}, 60_000);

const ALLOWED = new Set(["rpc.example.org", "arkiv.example.org"]);

// Endereços que as bibliotecas (viem, SDK do Arkiv, IDKit) trazem como padrão ou em documentação.
// Nenhum é chamado: o `fetch` é protegido pela política e a CSP bloqueia o resto. Um host NOVO aqui
// (por exemplo, depois de atualizar uma dependência) faz o teste falhar para ser revisado.
const REVIEWED = new Set([
  "4byte.sourcify.dev", "viem.sh", "sepolia.etherscan.io", "api-sepolia.etherscan.io",
  "rabdi.explorer.arkiv.network", "hub.arkiv.network", "oxlib.sh", "ipfs.io", "arweave.net", "docs.soliditylang.org", "abitype.dev",
  "11155111.rpc.thirdweb.com", "127.0.0.1",
  // RPC público padrão dentro da especificação da Sepolia entregue à carteira (só a carteira o usaria, se precisasse adicionar a rede; o app não o contata).
  "ethereum-sepolia-rpc.publicnode.com",
]);

describe("análise estática do que a tela entrega", () => {
  it("html_gerado_nao_referencia_hosts_de_terceiros", () => {
    const urls = [...html.matchAll(/(?:src|href|action)\s*=\s*"([^"]+)"/g)].map((m) => m[1]!);
    for (const u of urls) expect(u.startsWith("http"), u).toBe(false);
    expect(urls).toEqual(expect.arrayContaining(["style.css", "app.js"]));
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/); // sem script inline
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/); // sem manipuladores inline
  });

  it("hosts_no_pacote_fora_da_politica_sao_so_padroes_de_bibliotecas_ja_revisados", () => {
    const hosts = [...new Set([...js.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase()))];
    expect(hosts.filter((h) => !ALLOWED.has(h) && !REVIEWED.has(h))).toEqual([]);
    for (const h of REVIEWED) expect(csp.includes(`https://${h}`), h).toBe(false); // a CSP não libera nenhum deles
  });

  it("csp_do_html_vem_da_politica_de_rede", () => {
    expect(csp).toBe(cspFor(newsroomNetworkPolicy(config)));
    expect(html).toContain(`content="${csp}"`);
    expect(csp).toContain("connect-src 'self' https://rpc.example.org https://arkiv.example.org");
  });

  it("csp_nao_tem_curinga_nem_unsafe_inline_nem_unsafe_eval", () => {
    expect(csp).not.toMatch(/\*(?!:)/);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp.replace("'wasm-unsafe-eval'", "")).not.toContain("unsafe-eval");
  });

  it("a_tela_avisa_que_a_protecao_de_rede_e_escolha_do_usuario", () => {
    expect(js).toContain("fora deste aplicativo");
  });
});

describe("segredos do painel", () => {
  it("o_codigo_da_tela_nao_grava_nada_no_navegador_exceto_nomes_de_redacoes_em_names_ts", () => {
    // Bibliotecas de terceiros podem citar esses nomes; aqui vale o que nós escrevemos.
    for (const f of ["main.ts", "controller.ts", "dom.ts", "session.ts", "wallet.ts", "links.ts"]) {
      expect(readFileSync(join(__dirname, "../src", f), "utf8"), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
    const names = readFileSync(join(__dirname, "../src/names.ts"), "utf8");
    expect(names).toMatch(/localStorage/);
    expect(names).not.toMatch(/sessionStorage|indexedDB|document\.cookie/);
    expect(names.replace(/\/\/.*$/gm, "")).not.toMatch(/privateKey|password|senha|backup|receipt|recibo/i); // código, sem os comentários
  });

  it("o_painel_entra_pela_carteira_e_nao_pede_chave_privada", () => {
    const main = readFileSync(join(__dirname, "../src/main.ts"), "utf8");
    expect(main).not.toMatch(/privateKeyToAccount|generatePrivateKey/);
    expect(main).not.toMatch(/Chave privada da carteira|pk"/);
    expect(main).toContain("Conectar carteira");
  });

  it("o_painel_usa_so_carteira_injetada_sem_servicos_de_terceiros", () => {
    const main = readFileSync(join(__dirname, "../src/main.ts"), "utf8");
    expect(main).not.toMatch(/walletconnect|wagmi|web3modal|rainbowkit/i);
    expect(js).not.toMatch(/relay\.walletconnect|walletconnect\.(com|org)/i);
  });
});
