import { isNewsroomName } from "@safe-whistle/core";
import { createPolicy, type NetworkPolicy } from "@safe-whistle/network-policy";
import { STORE_MAX_RETENTION_SECONDS } from "@safe-whistle/arkiv-store";

export type ConfigProblem = { name: string; problem: string };

/** Erro de configuração: lista NOMES de variáveis e o tipo de problema, nunca os valores. */
export class ConfigError extends Error {
  constructor(public readonly problems: ConfigProblem[]) {
    super(`Configuração inválida: ${problems.map((p) => `${p.name} (${p.problem})`).join("; ")}`);
    this.name = "ConfigError";
  }
}

export type Config = {
  port: number;
  host: string;
  environment: "staging" | "production";
  appId: string;
  rpId: string;
  relayerPrivateKey: string;
  rpSigningKey: string;
  arkivAccessKey?: string;
  sepoliaRpcUrl: string;
  arkivRpcUrl: string;
  newsrooms: string[];
  allowedOrigins: string[];
  retentionDays: number;
  renewWithinDays: number;
  maxBodyBytes: number;
  nullifierFile: string;
  /** Aprova qualquer prova do World. Só para testes locais: exige os dois RPCs em localhost. */
  simulateWorld: boolean;
  rateLimitPerMinute: number;
  networkPolicy: NetworkPolicy;
};

const DAY = 24 * 3600;
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(:\d+)?$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const problems: ConfigProblem[] = [];
  const bad = (name: string, problem: string) => problems.push({ name, problem });
  const get = (name: string) => (env[name] ?? "").trim();
  const required = (name: string, re: RegExp, what: string): string => {
    const v = get(name);
    if (!v) bad(name, "ausente");
    else if (!re.test(v)) bad(name, `formato inválido (${what})`);
    return v;
  };
  const int = (name: string, def: number, min: number, max: number): number => {
    const v = get(name);
    if (!v) return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      bad(name, `deve ser um inteiro entre ${min} e ${max}`);
      return def;
    }
    return n;
  };
  const list = (name: string, ok: (s: string) => boolean, what: string): string[] => {
    const items = get(name).split(",").map((s) => s.trim()).filter(Boolean);
    if (items.some((s) => !ok(s))) bad(name, what);
    return items;
  };
  const rpc = (name: string): string => {
    const v = get(name);
    if (!v) {
      bad(name, "ausente");
      return "";
    }
    try {
      const u = new URL(v);
      if (!(u.protocol === "https:" || (u.protocol === "http:" && LOCAL.has(u.hostname)))) bad(name, "deve ser https (ou http apenas em localhost)");
    } catch {
      bad(name, "URL inválida");
    }
    return v;
  };

  const relayerPrivateKey = required("RELAYER_PRIVATE_KEY", /^0x[0-9a-fA-F]{64}$/, "0x + 64 hexadecimais");
  const rpSigningKey = required("RP_SIGNING_KEY", /^(0x)?[0-9a-fA-F]{64}$/, "64 hexadecimais");
  const appId = required("WORLD_APP_ID", /^app_[A-Za-z0-9]+$/, "app_…");
  const rpId = required("WORLD_RP_ID", /^rp_[A-Za-z0-9]+$/, "rp_…");
  const envName = get("WORLD_ENVIRONMENT") || "staging";
  if (envName !== "staging" && envName !== "production") bad("WORLD_ENVIRONMENT", "deve ser staging ou production");
  const sepoliaRpcUrl = rpc("SEPOLIA_RPC_URL");
  const arkivRpcUrl = rpc("ARKIV_RPC_URL");
  const newsrooms = list("NEWSROOMS", isNewsroomName, "nomes .eth em minúsculas separados por vírgula");
  const allowedOrigins = list("ALLOWED_ORIGINS", (s) => ORIGIN_RE.test(s), "origens https exatas (sem curinga)");
  const maxDays = Math.floor(STORE_MAX_RETENTION_SECONDS / DAY);
  const retentionDays = int("RETENTION_DAYS", 150, 1, maxDays);
  const renewWithinDays = int("RENEW_WITHIN_DAYS", 60, 1, maxDays);
  const rateLimitPerMinute = int("RATE_LIMIT_PER_MINUTE", 120, 1, 100_000);
  const port = int("PORT", 8787, 1, 65535);
  const maxBodyBytes = int("MAX_BODY_BYTES", 1024 * 1024, 1000, 10 * 1024 * 1024);

  const simulate = get("SIMULATE_WORLD");
  if (simulate !== "" && simulate !== "0" && simulate !== "1") bad("SIMULATE_WORLD", "deve ser 0 ou 1");
  const isLocal = (url: string) => {
    try {
      return LOCAL.has(new URL(url).hostname);
    } catch {
      return false;
    }
  };
  if (simulate === "1" && !(isLocal(sepoliaRpcUrl) && isLocal(arkivRpcUrl))) bad("SIMULATE_WORLD", "só é permitido com os dois RPCs em localhost");

  if (problems.length > 0) throw new ConfigError(problems);

  const hosts = new Set<string>(["developer.world.org"]);
  let allowLocalhost = false;
  for (const url of [sepoliaRpcUrl, arkivRpcUrl]) {
    const u = new URL(url);
    if (u.protocol === "https:") hosts.add(u.hostname);
    else allowLocalhost = true;
  }

  return {
    port, host: get("HOST") || "127.0.0.1", environment: envName as "staging" | "production", appId, rpId, relayerPrivateKey, rpSigningKey,
    arkivAccessKey: get("ARKIV_ACCESS_KEY") || undefined, sepoliaRpcUrl, arkivRpcUrl, newsrooms, allowedOrigins, retentionDays, renewWithinDays,
    simulateWorld: simulate === "1", rateLimitPerMinute, maxBodyBytes, nullifierFile: get("NULLIFIER_FILE") || "data/claims.jsonl",
    networkPolicy: createPolicy({ hosts: [...hosts], allowLocalhost }),
  };
}

/** Cópia segura para registrar ou exibir: sem nenhum segredo. */
export function redact(config: Config): Record<string, unknown> {
  return { ...config, relayerPrivateKey: "***", rpSigningKey: "***", arkivAccessKey: config.arkivAccessKey ? "***" : undefined };
}
