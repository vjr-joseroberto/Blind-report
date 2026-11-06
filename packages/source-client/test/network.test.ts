import { isAllowed } from "@safe-whistle/network-policy";
import { describe, expect, it } from "vitest";
import { IDKIT_HOSTS, SourceError, sourceNetworkPolicy } from "../src/index.ts";

const base = { rpcUrl: "https://a.example.org", relayerUrl: "https://b.example.org", arkivRpcUrl: "https://c.example.org" };

describe("source network policy (RF-20)", () => {
  it("includes_rpc_relayer_arkiv_and_the_world_bridge", () => {
    const p = sourceNetworkPolicy(base);
    expect([...p.hosts].sort()).toEqual([...new Set(["a.example.org", "b.example.org", "c.example.org", ...IDKIT_HOSTS])].sort());
    expect(IDKIT_HOSTS).toContain("bridge.worldcoin.org");
    expect(isAllowed(p, "https://evil.example.net/")).toBe(false);
  });

  it("localhost_only_with_local_rpc", () => {
    expect(sourceNetworkPolicy(base).allowLocalhost).toBe(false);
    expect(sourceNetworkPolicy({ rpcUrl: "http://127.0.0.1:8545", relayerUrl: "http://127.0.0.1:8787", arkivRpcUrl: "http://127.0.0.1:8546" }).allowLocalhost).toBe(true);
  });

  it("refuses_remote_http_address_strange_scheme_and_credentials_in_the_url", () => {
    for (const bad of ["http://rpc.example.org", "ftp://rpc.example.org", "https://user:pw@rpc.example.org", "nao-e-url"]) {
      expect(() => sourceNetworkPolicy({ ...base, rpcUrl: bad }), bad).toThrow(SourceError);
    }
  });
});
