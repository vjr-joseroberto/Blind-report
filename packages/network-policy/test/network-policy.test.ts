import { describe, expect, it, vi } from "vitest";
import {
  HostNotAllowedError,
  InvalidNetworkConfigError,
  createPolicy,
  createRecorder,
  cspFor,
  guardedFetch,
  isAllowed,
  parseNetworkConfig,
} from "../src/index.ts";

const okResponse = () => new Response("ok", { status: 200 });

describe("RF-20 allowed hosts policy", () => {
  const policy = createPolicy({ hosts: ["rpc.example.org", "developer.world.org"] });

  it("allows_host_from_the_list", () => {
    expect(isAllowed(policy, "https://rpc.example.org/v1")).toBe(true);
    expect(isAllowed(policy, new URL("https://developer.world.org/api"))).toBe(true);
  });

  it("refuses_host_outside_the_list", () => {
    expect(isAllowed(policy, "https://outro.example.org/")).toBe(false);
  });

  it("compares_the_host_by_exact_equality", () => {
    expect(isAllowed(policy, "https://evil-rpc.example.org/")).toBe(false);
    expect(isAllowed(policy, "https://rpc.example.org.evil.com/")).toBe(false);
    expect(isAllowed(policy, "https://sub.rpc.example.org/")).toBe(false);
  });

  it("is_not_fooled_by_credentials_in_the_url", () => {
    expect(isAllowed(policy, "https://rpc.example.org@evil.com/")).toBe(false);
  });

  it("refuses_http_even_with_host_in_the_list", () => {
    expect(isAllowed(policy, "http://rpc.example.org/")).toBe(false);
  });

  it("refuses_invalid_url_and_strange_schemes", () => {
    expect(isAllowed(policy, "isto nao e url")).toBe(false);
    expect(isAllowed(policy, "ftp://rpc.example.org/")).toBe(false);
    expect(isAllowed(policy, "ws://rpc.example.org/")).toBe(false);
  });

  it("allows_localhost_on_http_only_when_enabled", () => {
    const off = createPolicy({ hosts: [] });
    const on = createPolicy({ hosts: [], allowLocalhost: true });
    for (const u of ["http://localhost:8545", "http://127.0.0.1:8546/x", "http://[::1]:3000/"]) {
      expect(isAllowed(off, u)).toBe(false);
      expect(isAllowed(on, u)).toBe(true);
    }
  });

  it("enabled_localhost_does_not_open_other_hosts_on_http", () => {
    const on = createPolicy({ hosts: [], allowLocalhost: true });
    expect(isAllowed(on, "http://example.org/")).toBe(false);
  });

  it("normalizes_the_list_to_lowercase_and_without_duplicates", () => {
    const p = createPolicy({ hosts: ["RPC.Example.org", "rpc.example.org"] });
    expect(p.hosts).toEqual(["rpc.example.org"]);
    expect(isAllowed(p, "https://rpc.example.org/")).toBe(true);
  });

  it("refuses_invalid_host_in_the_list", () => {
    expect(() => createPolicy({ hosts: ["https://rpc.example.org"] })).toThrow(InvalidNetworkConfigError);
    expect(() => createPolicy({ hosts: ["*"] })).toThrow(InvalidNetworkConfigError);
    expect(() => createPolicy({ hosts: ["*.example.org"] })).toThrow(InvalidNetworkConfigError);
    expect(() => createPolicy({ hosts: [""] })).toThrow(InvalidNetworkConfigError);
  });
});

describe("guardedFetch", () => {
  const policy = createPolicy({ hosts: ["rpc.example.org"] });

  it("forwards_the_call_when_the_host_is_allowed", async () => {
    const base = vi.fn(async () => okResponse());
    const f = guardedFetch(policy, base as unknown as typeof fetch);
    const res = await f("https://rpc.example.org/x", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("refuses_with_a_typed_error_BEFORE_any_call", async () => {
    const base = vi.fn(async () => okResponse());
    const f = guardedFetch(policy, base as unknown as typeof fetch);
    await expect(f("https://nao-declarado.example.net/x")).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(base).not.toHaveBeenCalled();
  });

  it("the_error_reports_the_refused_host", async () => {
    const f = guardedFetch(policy, (async () => okResponse()) as unknown as typeof fetch);
    await expect(f("https://nao-declarado.example.net/x")).rejects.toMatchObject({ host: "nao-declarado.example.net" });
  });

  it("accepts_URL_and_Request_as_input", async () => {
    const base = vi.fn(async () => okResponse());
    const f = guardedFetch(policy, base as unknown as typeof fetch);
    await f(new URL("https://rpc.example.org/a"));
    await f(new Request("https://rpc.example.org/b"));
    expect(base).toHaveBeenCalledTimes(2);
    await expect(f(new Request("https://evil.example.net/b"))).rejects.toBeInstanceOf(HostNotAllowedError);
  });
});

describe("recorder (request recorder)", () => {
  it("records_url_method_and_body", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://rpc.example.org/x", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(rec.requests).toHaveLength(1);
    expect(rec.requests[0]).toMatchObject({ url: "https://rpc.example.org/x", host: "rpc.example.org", method: "POST", bodyText: '{"a":1}' });
  });

  it("records_binary_body_and_allows_searching_bytes", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://rpc.example.org/x", { method: "POST", body: new Uint8Array([1, 2, 3]) });
    expect(rec.requests[0]?.bodyBytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(rec.requests[0]?.bodyText).toBe("\u0001\u0002\u0003");
  });

  it("get_without_body_records_an_empty_body", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://rpc.example.org/x");
    expect(rec.requests[0]).toMatchObject({ method: "GET", bodyText: "" });
  });

  it("hosts_lists_contacted_destinations_without_repetition", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://a.example.org/1");
    await rec.fetch("https://a.example.org/2");
    await rec.fetch("https://b.example.org/1");
    expect(rec.hosts()).toEqual(["a.example.org", "b.example.org"]);
  });

  it("contains_finds_text_in_any_recorded_body", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://a.example.org/1", { method: "POST", body: "segredo-fictício" });
    expect(rec.anyBodyContains("segredo-fictício")).toBe(true);
    expect(rec.anyBodyContains("outra coisa")).toBe(false);
  });

  it("composes_with_guardedFetch_and_only_records_what_passed", async () => {
    const policy = createPolicy({ hosts: ["rpc.example.org"] });
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    const f = guardedFetch(policy, rec.fetch);
    await f("https://rpc.example.org/x");
    await expect(f("https://evil.example.net/x")).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(rec.hosts()).toEqual(["rpc.example.org"]);
  });
});

describe("RF-20 network configuration", () => {
  it("https_rpc_enters_the_list", () => {
    const p = parseNetworkConfig({ rpcUrl: "https://rpc.example.org/key", hosts: ["developer.world.org"] });
    expect(p.hosts).toEqual(["developer.world.org", "rpc.example.org"]);
  });

  it("rpc_over_http_is_only_accepted_if_localhost", () => {
    expect(() => parseNetworkConfig({ rpcUrl: "http://rpc.example.org" })).toThrow(InvalidNetworkConfigError);
    const p = parseNetworkConfig({ rpcUrl: "http://127.0.0.1:8545" });
    expect(isAllowed(p, "http://127.0.0.1:8545")).toBe(true);
    expect(p.allowLocalhost).toBe(true);
  });

  it("refuses_any_proxy_in_the_configuration", () => {
    expect(() => parseNetworkConfig({ rpcUrl: "https://rpc.example.org", proxy: "http://p:8080" })).toThrow(InvalidNetworkConfigError);
    expect(() => parseNetworkConfig({ httpProxy: "http://p:8080" })).toThrow(InvalidNetworkConfigError);
    expect(() => parseNetworkConfig({ rpcUrl: "https://rpc.example.org", agent: {} })).toThrow(InvalidNetworkConfigError);
  });

  it("refuses_invalid_rpc", () => {
    expect(() => parseNetworkConfig({ rpcUrl: "nao e url" })).toThrow(InvalidNetworkConfigError);
    expect(() => parseNetworkConfig({ rpcUrl: 42 as unknown as string })).toThrow(InvalidNetworkConfigError);
  });

  it("without_rpc_only_the_declared_hosts_count", () => {
    const p = parseNetworkConfig({ hosts: ["developer.world.org"] });
    expect(p.hosts).toEqual(["developer.world.org"]);
  });
});

describe("RNF-04 content security policy (CSP)", () => {
  const policy = createPolicy({ hosts: ["rpc.example.org", "developer.world.org"] });
  const csp = cspFor(policy);
  const directive = (name: string) => csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " ")) ?? "";

  it("generates_connect_src_only_with_the_declared_hosts", () => {
    expect(directive("connect-src")).toBe("connect-src 'self' https://rpc.example.org https://developer.world.org");
  });

  it("does_not_allow_inline_scripts_nor_wildcards", () => {
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/\s\*(\s|;|$)/);
    expect(directive("script-src")).toBe("script-src 'self' 'wasm-unsafe-eval'");
  });

  it("blocks_objects_base_and_framing", () => {
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'none'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("default-src")).toBe("default-src 'self'");
  });

  it("static_resources_only_from_the_same_origin", () => {
    for (const d of ["style-src", "img-src", "font-src"]) expect(directive(d)).toMatch(new RegExp(`^${d} 'self'`));
    expect(csp).not.toMatch(/(style|img|font)-src[^;]*https:/);
  });

  it("with_localhost_enabled_includes_local_origins", () => {
    const local = cspFor(createPolicy({ hosts: [], allowLocalhost: true }));
    expect(local).toContain("http://localhost:*");
    expect(local).toContain("http://127.0.0.1:*");
  });

  it("without_localhost_does_not_mention_local_origins", () => {
    expect(csp).not.toContain("localhost");
    expect(csp).not.toContain("127.0.0.1");
  });
});
