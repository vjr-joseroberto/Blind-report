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

describe("RF-20 política de hosts permitidos", () => {
  const policy = createPolicy({ hosts: ["rpc.example.org", "developer.world.org"] });

  it("permite_host_da_lista", () => {
    expect(isAllowed(policy, "https://rpc.example.org/v1")).toBe(true);
    expect(isAllowed(policy, new URL("https://developer.world.org/api"))).toBe(true);
  });

  it("recusa_host_fora_da_lista", () => {
    expect(isAllowed(policy, "https://outro.example.org/")).toBe(false);
  });

  it("compara_o_host_por_igualdade_exata", () => {
    expect(isAllowed(policy, "https://evil-rpc.example.org/")).toBe(false);
    expect(isAllowed(policy, "https://rpc.example.org.evil.com/")).toBe(false);
    expect(isAllowed(policy, "https://sub.rpc.example.org/")).toBe(false);
  });

  it("nao_se_deixa_enganar_por_credenciais_na_url", () => {
    expect(isAllowed(policy, "https://rpc.example.org@evil.com/")).toBe(false);
  });

  it("recusa_http_mesmo_com_host_na_lista", () => {
    expect(isAllowed(policy, "http://rpc.example.org/")).toBe(false);
  });

  it("recusa_url_invalida_e_esquemas_estranhos", () => {
    expect(isAllowed(policy, "isto nao e url")).toBe(false);
    expect(isAllowed(policy, "ftp://rpc.example.org/")).toBe(false);
    expect(isAllowed(policy, "ws://rpc.example.org/")).toBe(false);
  });

  it("permite_localhost_em_http_somente_quando_habilitado", () => {
    const off = createPolicy({ hosts: [] });
    const on = createPolicy({ hosts: [], allowLocalhost: true });
    for (const u of ["http://localhost:8545", "http://127.0.0.1:8546/x", "http://[::1]:3000/"]) {
      expect(isAllowed(off, u)).toBe(false);
      expect(isAllowed(on, u)).toBe(true);
    }
  });

  it("localhost_habilitado_nao_abre_outros_hosts_em_http", () => {
    const on = createPolicy({ hosts: [], allowLocalhost: true });
    expect(isAllowed(on, "http://example.org/")).toBe(false);
  });

  it("normaliza_a_lista_para_minusculas_e_sem_duplicados", () => {
    const p = createPolicy({ hosts: ["RPC.Example.org", "rpc.example.org"] });
    expect(p.hosts).toEqual(["rpc.example.org"]);
    expect(isAllowed(p, "https://rpc.example.org/")).toBe(true);
  });

  it("recusa_host_invalido_na_lista", () => {
    expect(() => createPolicy({ hosts: ["https://rpc.example.org"] })).toThrow(InvalidNetworkConfigError);
    expect(() => createPolicy({ hosts: ["*"] })).toThrow(InvalidNetworkConfigError);
    expect(() => createPolicy({ hosts: ["*.example.org"] })).toThrow(InvalidNetworkConfigError);
    expect(() => createPolicy({ hosts: [""] })).toThrow(InvalidNetworkConfigError);
  });
});

describe("guardedFetch", () => {
  const policy = createPolicy({ hosts: ["rpc.example.org"] });

  it("repassa_a_chamada_quando_o_host_e_permitido", async () => {
    const base = vi.fn(async () => okResponse());
    const f = guardedFetch(policy, base as unknown as typeof fetch);
    const res = await f("https://rpc.example.org/x", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("recusa_com_erro_tipado_ANTES_de_qualquer_chamada", async () => {
    const base = vi.fn(async () => okResponse());
    const f = guardedFetch(policy, base as unknown as typeof fetch);
    await expect(f("https://nao-declarado.example.net/x")).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(base).not.toHaveBeenCalled();
  });

  it("o_erro_informa_o_host_recusado", async () => {
    const f = guardedFetch(policy, (async () => okResponse()) as unknown as typeof fetch);
    await expect(f("https://nao-declarado.example.net/x")).rejects.toMatchObject({ host: "nao-declarado.example.net" });
  });

  it("aceita_URL_e_Request_como_entrada", async () => {
    const base = vi.fn(async () => okResponse());
    const f = guardedFetch(policy, base as unknown as typeof fetch);
    await f(new URL("https://rpc.example.org/a"));
    await f(new Request("https://rpc.example.org/b"));
    expect(base).toHaveBeenCalledTimes(2);
    await expect(f(new Request("https://evil.example.net/b"))).rejects.toBeInstanceOf(HostNotAllowedError);
  });
});

describe("recorder (gravador de requisições)", () => {
  it("grava_url_metodo_e_corpo", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://rpc.example.org/x", { method: "POST", body: JSON.stringify({ a: 1 }) });
    expect(rec.requests).toHaveLength(1);
    expect(rec.requests[0]).toMatchObject({ url: "https://rpc.example.org/x", host: "rpc.example.org", method: "POST", bodyText: '{"a":1}' });
  });

  it("grava_corpo_binario_e_permite_buscar_bytes", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://rpc.example.org/x", { method: "POST", body: new Uint8Array([1, 2, 3]) });
    expect(rec.requests[0]?.bodyBytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(rec.requests[0]?.bodyText).toBe("\u0001\u0002\u0003");
  });

  it("get_sem_corpo_grava_corpo_vazio", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://rpc.example.org/x");
    expect(rec.requests[0]).toMatchObject({ method: "GET", bodyText: "" });
  });

  it("hosts_lista_os_destinos_contatados_sem_repeticao", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://a.example.org/1");
    await rec.fetch("https://a.example.org/2");
    await rec.fetch("https://b.example.org/1");
    expect(rec.hosts()).toEqual(["a.example.org", "b.example.org"]);
  });

  it("contains_encontra_texto_em_qualquer_corpo_gravado", async () => {
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    await rec.fetch("https://a.example.org/1", { method: "POST", body: "segredo-fictício" });
    expect(rec.anyBodyContains("segredo-fictício")).toBe(true);
    expect(rec.anyBodyContains("outra coisa")).toBe(false);
  });

  it("compoe_com_guardedFetch_e_so_grava_o_que_passou", async () => {
    const policy = createPolicy({ hosts: ["rpc.example.org"] });
    const rec = createRecorder((async () => okResponse()) as unknown as typeof fetch);
    const f = guardedFetch(policy, rec.fetch);
    await f("https://rpc.example.org/x");
    await expect(f("https://evil.example.net/x")).rejects.toBeInstanceOf(HostNotAllowedError);
    expect(rec.hosts()).toEqual(["rpc.example.org"]);
  });
});

describe("RF-20 configuração de rede", () => {
  it("rpc_https_entra_na_lista", () => {
    const p = parseNetworkConfig({ rpcUrl: "https://rpc.example.org/key", hosts: ["developer.world.org"] });
    expect(p.hosts).toEqual(["developer.world.org", "rpc.example.org"]);
  });

  it("rpc_em_http_so_e_aceito_se_for_localhost", () => {
    expect(() => parseNetworkConfig({ rpcUrl: "http://rpc.example.org" })).toThrow(InvalidNetworkConfigError);
    const p = parseNetworkConfig({ rpcUrl: "http://127.0.0.1:8545" });
    expect(isAllowed(p, "http://127.0.0.1:8545")).toBe(true);
    expect(p.allowLocalhost).toBe(true);
  });

  it("recusa_qualquer_proxy_na_configuracao", () => {
    expect(() => parseNetworkConfig({ rpcUrl: "https://rpc.example.org", proxy: "http://p:8080" })).toThrow(InvalidNetworkConfigError);
    expect(() => parseNetworkConfig({ httpProxy: "http://p:8080" })).toThrow(InvalidNetworkConfigError);
    expect(() => parseNetworkConfig({ rpcUrl: "https://rpc.example.org", agent: {} })).toThrow(InvalidNetworkConfigError);
  });

  it("recusa_rpc_invalido", () => {
    expect(() => parseNetworkConfig({ rpcUrl: "nao e url" })).toThrow(InvalidNetworkConfigError);
    expect(() => parseNetworkConfig({ rpcUrl: 42 as unknown as string })).toThrow(InvalidNetworkConfigError);
  });

  it("sem_rpc_so_valem_os_hosts_declarados", () => {
    const p = parseNetworkConfig({ hosts: ["developer.world.org"] });
    expect(p.hosts).toEqual(["developer.world.org"]);
  });
});

describe("RNF-04 política de segurança de conteúdo (CSP)", () => {
  const policy = createPolicy({ hosts: ["rpc.example.org", "developer.world.org"] });
  const csp = cspFor(policy);
  const directive = (name: string) => csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " ")) ?? "";

  it("gera_connect_src_apenas_com_os_hosts_declarados", () => {
    expect(directive("connect-src")).toBe("connect-src 'self' https://rpc.example.org https://developer.world.org");
  });

  it("nao_permite_scripts_inline_nem_curingas", () => {
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/\s\*(\s|;|$)/);
    expect(directive("script-src")).toBe("script-src 'self' 'wasm-unsafe-eval'");
  });

  it("bloqueia_objetos_base_e_enquadramento", () => {
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("base-uri")).toBe("base-uri 'none'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive("default-src")).toBe("default-src 'self'");
  });

  it("recursos_estaticos_so_da_propria_origem", () => {
    for (const d of ["style-src", "img-src", "font-src"]) expect(directive(d)).toMatch(new RegExp(`^${d} 'self'`));
    expect(csp).not.toMatch(/(style|img|font)-src[^;]*https:/);
  });

  it("com_localhost_habilitado_inclui_as_origens_locais", () => {
    const local = cspFor(createPolicy({ hosts: [], allowLocalhost: true }));
    expect(local).toContain("http://localhost:*");
    expect(local).toContain("http://127.0.0.1:*");
  });

  it("sem_localhost_nao_menciona_origens_locais", () => {
    expect(csp).not.toContain("localhost");
    expect(csp).not.toContain("127.0.0.1");
  });
});
