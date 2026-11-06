import { isAllowed } from "@safe-whistle/network-policy";
import { describe, expect, it } from "vitest";
import { NewsroomError, newsroomNetworkPolicy } from "../src/index.ts";

describe("9. newsroom network (RF-20)", () => {
  it("only_contacts_declared_hosts", () => {
    const p = newsroomNetworkPolicy({ rpcUrl: "https://a.example.org", arkivRpcUrl: "https://b.example.org" });
    expect([...p.hosts].sort()).toEqual(["a.example.org", "b.example.org"]);
    expect(isAllowed(p, "https://evil.example.net")).toBe(false);
    expect(p.allowLocalhost).toBe(false);
  });

  it("localhost_only_when_the_rpc_is_local", () => {
    expect(newsroomNetworkPolicy({ rpcUrl: "http://127.0.0.1:8545", arkivRpcUrl: "http://127.0.0.1:8546" }).allowLocalhost).toBe(true);
  });

  it("refuses_remote_http_strange_scheme_and_credentials", () => {
    for (const bad of ["http://rpc.example.org", "ftp://rpc.example.org", "https://u:p@rpc.example.org", "nao-e-url"]) {
      expect(() => newsroomNetworkPolicy({ rpcUrl: bad, arkivRpcUrl: "https://b.example.org" }), bad).toThrow(NewsroomError);
    }
  });
});
