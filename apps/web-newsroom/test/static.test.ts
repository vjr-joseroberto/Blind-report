import { cspFor } from "@safe-whistle/network-policy";
import { newsroomNetworkPolicy } from "@safe-whistle/newsroom-client";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error the build script is JavaScript
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

// Addresses that the libraries (viem, Arkiv SDK, IDKit) bring by default or in their documentation.
// None is called: `fetch` is protected by the policy and the CSP blocks the rest. A NEW host here
// (for example, after updating a dependency) makes the test fail so it can be reviewed.
const REVIEWED = new Set([
  "4byte.sourcify.dev", "viem.sh", "sepolia.etherscan.io", "api-sepolia.etherscan.io",
  "rabdi.explorer.arkiv.network", "hub.arkiv.network", "oxlib.sh", "ipfs.io", "arweave.net", "docs.soliditylang.org", "abitype.dev",
  "11155111.rpc.thirdweb.com", "127.0.0.1",
  // Default public RPC inside the Sepolia spec handed to the wallet (only the wallet would use it, if it needed to add the network; the app does not contact it).
  "ethereum-sepolia-rpc.publicnode.com",
]);

describe("static analysis of what the screen delivers", () => {
  it("generated_html_does_not_reference_third_party_hosts", () => {
    const urls = [...html.matchAll(/(?:src|href|action)\s*=\s*"([^"]+)"/g)].map((m) => m[1]!);
    for (const u of urls) expect(u.startsWith("http"), u).toBe(false);
    expect(urls).toEqual(expect.arrayContaining(["style.css", "app.js"]));
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/); // no inline script
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/); // no inline handlers
  });

  it("hosts_in_the_bundle_outside_the_policy_are_only_already_reviewed_library_defaults", () => {
    const hosts = [...new Set([...js.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]!.toLowerCase()))];
    expect(hosts.filter((h) => !ALLOWED.has(h) && !REVIEWED.has(h))).toEqual([]);
    for (const h of REVIEWED) expect(csp.includes(`https://${h}`), h).toBe(false); // the CSP allows none of them
  });

  it("html_csp_comes_from_the_network_policy", () => {
    expect(csp).toBe(cspFor(newsroomNetworkPolicy(config)));
    expect(html).toContain(`content="${csp}"`);
    expect(csp).toContain("connect-src 'self' https://rpc.example.org https://arkiv.example.org");
  });

  it("csp_has_no_wildcard_nor_unsafe_inline_nor_unsafe_eval", () => {
    expect(csp).not.toMatch(/\*(?!:)/);
    expect(csp).not.toContain("unsafe-inline");
    expect(csp.replace("'wasm-unsafe-eval'", "")).not.toContain("unsafe-eval");
  });

  it("the_screen_warns_that_network_protection_is_the_users_choice", () => {
    expect(js).toContain("outside this app");
  });
});

describe("panel secrets", () => {
  it("the_screen_code_stores_nothing_in_the_browser_except_newsroom_names_in_names_ts", () => {
    // Third-party libraries may mention these names; what matters here is what we wrote.
    for (const f of ["main.ts", "controller.ts", "dom.ts", "session.ts", "wallet.ts", "links.ts"]) {
      expect(readFileSync(join(__dirname, "../src", f), "utf8"), f).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
    const names = readFileSync(join(__dirname, "../src/names.ts"), "utf8");
    expect(names).toMatch(/localStorage/);
    expect(names).not.toMatch(/sessionStorage|indexedDB|document\.cookie/);
    expect(names.replace(/\/\/.*$/gm, "")).not.toMatch(/privateKey|password|senha|backup|receipt|recibo/i); // code, without the comments
  });

  it("the_panel_signs_in_with_the_wallet_and_does_not_ask_for_a_private_key", () => {
    const main = readFileSync(join(__dirname, "../src/main.ts"), "utf8");
    expect(main).not.toMatch(/privateKeyToAccount|generatePrivateKey/);
    expect(main).not.toMatch(/Private wallet key|pk"/);
    expect(main).toContain("Connect wallet");
  });

  it("the_panel_uses_only_an_injected_wallet_without_third_party_services", () => {
    const main = readFileSync(join(__dirname, "../src/main.ts"), "utf8");
    expect(main).not.toMatch(/walletconnect|wagmi|web3modal|rainbowkit/i);
    expect(js).not.toMatch(/relay\.walletconnect|walletconnect\.(com|org)/i);
  });
});
