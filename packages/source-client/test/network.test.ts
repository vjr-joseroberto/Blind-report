import { isAllowed } from "@safe-whistle/network-policy";
import { describe, expect, it } from "vitest";
import { IDKIT_HOSTS, SourceError, sourceNetworkPolicy } from "../src/index.ts";

const base = { rpcUrl: "https://a.example.org", relayerUrl: "https://b.example.org", arkivRpcUrl: "https://c.example.org" };

describe("política de rede da fonte (RF-20)", () => {
  it("inclui_rpc_relayer_arkiv_e_a_ponte_do_world", () => {
    const p = sourceNetworkPolicy(base);
    expect([...p.hosts].sort()).toEqual([...new Set(["a.example.org", "b.example.org", "c.example.org", ...IDKIT_HOSTS])].sort());
    expect(IDKIT_HOSTS).toContain("bridge.worldcoin.org");
    expect(isAllowed(p, "https://evil.example.net/")).toBe(false);
  });

  it("localhost_so_com_rpc_local", () => {
    expect(sourceNetworkPolicy(base).allowLocalhost).toBe(false);
    expect(sourceNetworkPolicy({ rpcUrl: "http://127.0.0.1:8545", relayerUrl: "http://127.0.0.1:8787", arkivRpcUrl: "http://127.0.0.1:8546" }).allowLocalhost).toBe(true);
  });

  it("recusa_endereco_http_remoto_esquema_estranho_e_credenciais_na_url", () => {
    for (const bad of ["http://rpc.example.org", "ftp://rpc.example.org", "https://user:pw@rpc.example.org", "nao-e-url"]) {
      expect(() => sourceNetworkPolicy({ ...base, rpcUrl: bad }), bad).toThrow(SourceError);
    }
  });
});
