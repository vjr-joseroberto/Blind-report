import { cspFor } from "@safe-whistle/network-policy";
import { sourceNetworkPolicy } from "@safe-whistle/source-client";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error the build script is JavaScript
import { buildWeb } from "../build.mjs";

const config = { rpcUrl: "https://rpc.example.org", relayerUrl: "https://relayer.example.org", arkivRpcUrl: "https://arkiv.example.org" };
let html = "";
let js = "";
let csp = "";

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "sw-web-"));
  ({ csp } = await buildWeb({ outDir: dir, config }));
  html = readFileSync(join(dir, "index.html"), "utf8");
  js = readFileSync(join(dir, "app.js"), "utf8");
}, 60_000);

const ALLOWED = new Set(["rpc.example.org", "relayer.example.org", "arkiv.example.org", "bridge.worldcoin.org"]);

// Addresses that the libraries (viem, Arkiv SDK, IDKit) bring by default or in their documentation.
// None is called: `fetch` is protected by the policy and the CSP blocks the rest. A NEW host here
// (for example, after updating a dependency) makes the test fail so it can be reviewed.
const REVIEWED = new Set([
  "4byte.sourcify.dev", "world.org", "staging.world.org", "sandbox.world.org", "viem.sh", "sepolia.etherscan.io", "api-sepolia.etherscan.io",
  "rabdi.explorer.arkiv.network", "hub.arkiv.network", "oxlib.sh", "ipfs.io", "arweave.net", "docs.soliditylang.org", "abitype.dev",
  "11155111.rpc.thirdweb.com", "127.0.0.1",
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
    expect(csp).toBe(cspFor(sourceNetworkPolicy(config)));
    expect(html).toContain(`content="${csp}"`);
    expect(csp).toContain("connect-src 'self' https://bridge.worldcoin.org https://rpc.example.org https://relayer.example.org https://arkiv.example.org");
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
