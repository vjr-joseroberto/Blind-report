import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig, redact } from "../src/index.ts";

const KEY = "0x" + "11".repeat(32);
const SIGN = "22".repeat(32);
const valid = (over: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  RELAYER_PRIVATE_KEY: KEY, WORLD_APP_ID: "app_abc123", WORLD_RP_ID: "rp_abc123", RP_SIGNING_KEY: SIGN, WORLD_ENVIRONMENT: "staging",
  SEPOLIA_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com", ARKIV_RPC_URL: "https://rpc.rabdi.db-chain.testnet.arkiv.network", ARKIV_ACCESS_KEY: "chave-secreta-do-arkiv", ...over,
});

describe("relayer configuration (read once)", () => {
  it("reads_the_variables_and_applies_defaults", () => {
    const c = loadConfig(valid());
    expect(c).toMatchObject({ rateLimitPerMinute: 120, port: 8787, host: "127.0.0.1", environment: "staging", appId: "app_abc123", rpId: "rp_abc123", retentionDays: 150, renewWithinDays: 60, maxBodyBytes: 1024 * 1024, newsrooms: [], allowedOrigins: [] });
    expect(c.nullifierFile).toBe("data/claims.jsonl");
  });

  it("reads_lists_and_numbers", () => {
    const c = loadConfig(valid({ NEWSROOMS: "a.eth, b.eth", ALLOWED_ORIGINS: "https://app.example.org", PORT: "9000", RETENTION_DAYS: "120", RENEW_WITHIN_DAYS: "30", MAX_BODY_BYTES: "500000" }));
    expect(c).toMatchObject({ newsrooms: ["a.eth", "b.eth"], allowedOrigins: ["https://app.example.org"], port: 9000, retentionDays: 120, renewWithinDays: 30, maxBodyBytes: 500000 });
  });

  it("missing_variables_raise_an_error_listing_only_the_names", () => {
    try {
      loadConfig(valid({ RELAYER_PRIVATE_KEY: undefined, RP_SIGNING_KEY: "", WORLD_RP_ID: undefined }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      expect((e as ConfigError).problems.map((p) => p.name).sort()).toEqual(["RELAYER_PRIVATE_KEY", "RP_SIGNING_KEY", "WORLD_RP_ID"]);
    }
  });

  it("invalid_values_raise_an_error_without_leaking_secrets", () => {
    const secretish = "0x" + "zz".repeat(32);
    for (const over of [{ RELAYER_PRIVATE_KEY: secretish }, { RP_SIGNING_KEY: "curta-demais-segredo" }, { WORLD_ENVIRONMENT: "qualquer" }, { WORLD_APP_ID: "rp_errado" }, { RETENTION_DAYS: "999" }, { RETENTION_DAYS: "0" }, { PORT: "abc" }, { NEWSROOMS: "Invalida" }, { ALLOWED_ORIGINS: "*" }, { SEPOLIA_RPC_URL: "http://rpc.example.org" }]) {
      try {
        loadConfig(valid(over));
        expect.unreachable(JSON.stringify(over));
      } catch (e) {
        expect(e).toBeInstanceOf(ConfigError);
        const msg = (e as Error).message + JSON.stringify((e as ConfigError).problems);
        for (const secret of [secretish, "curta-demais-segredo", KEY, SIGN, "chave-secreta-do-arkiv"]) expect(msg).not.toContain(secret);
      }
    }
  });

  it("redact_hides_all_secrets", () => {
    const text = JSON.stringify(redact(loadConfig(valid())));
    for (const secret of [KEY, SIGN, "chave-secreta-do-arkiv"]) expect(text).not.toContain(secret);
    expect(text).toContain("app_abc123");
  });

  it("simulated_verifier_only_with_both_local_rpcs", () => {
    const local = { ARKIV_RPC_URL: "http://127.0.0.1:8546", SEPOLIA_RPC_URL: "http://127.0.0.1:8545" };
    expect(loadConfig(valid()).simulateWorld).toBe(false);
    expect(loadConfig(valid({ ...local, SIMULATE_WORLD: "1" })).simulateWorld).toBe(true);
    for (const over of [{ SIMULATE_WORLD: "1" }, { ...local, ARKIV_RPC_URL: "https://rpc.example.org", SIMULATE_WORLD: "1" }, { ...local, SIMULATE_WORLD: "sim" }]) {
      expect(() => loadConfig(valid(over)), JSON.stringify(over)).toThrow(ConfigError);
    }
  });

  it("builds_the_network_policy_only_with_declared_hosts", () => {
    const c = loadConfig(valid());
    expect([...c.networkPolicy.hosts].sort()).toEqual(["developer.world.org", "ethereum-sepolia-rpc.publicnode.com", "rpc.rabdi.db-chain.testnet.arkiv.network"]);
    expect(c.networkPolicy.allowLocalhost).toBe(false);
  });

  it("local_rpc_enables_localhost_in_the_policy", () => {
    const c = loadConfig(valid({ ARKIV_RPC_URL: "http://127.0.0.1:8546", SEPOLIA_RPC_URL: "http://127.0.0.1:8545" }));
    expect(c.networkPolicy.allowLocalhost).toBe(true);
  });
});
