import { InvalidNetworkConfigError } from "./errors.ts";

export type NetworkPolicy = {
  /** Hosts permitidos (minúsculos, sem duplicados). Só https. */
  readonly hosts: readonly string[];
  /** Permite http para localhost, 127.0.0.1 e [::1] (testes e desenvolvimento). */
  readonly allowLocalhost: boolean;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function createPolicy(input: { hosts: string[]; allowLocalhost?: boolean }): NetworkPolicy {
  const hosts: string[] = [];
  for (const raw of input.hosts) {
    const host = raw.trim().toLowerCase();
    if (!HOST_RE.test(host)) throw new InvalidNetworkConfigError(`Host inválido na lista: "${raw}"`);
    if (!hosts.includes(host)) hosts.push(host);
  }
  return { hosts, allowLocalhost: input.allowLocalhost ?? false };
}

function toUrl(input: string | URL): URL | null {
  if (input instanceof URL) return input;
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

export function isAllowed(policy: NetworkPolicy, input: string | URL): boolean {
  const url = toUrl(input);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  if (url.protocol === "https:") return policy.hosts.includes(host);
  if (url.protocol === "http:") return policy.allowLocalhost && LOCAL_HOSTS.has(host);
  return false;
}

/** Monta a política a partir de uma configuração. Recusa proxies e RPC em http fora de localhost. */
export function parseNetworkConfig(raw: Record<string, unknown>): NetworkPolicy {
  const known = new Set(["rpcUrl", "hosts"]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      throw new InvalidNetworkConfigError(`Opção de rede não suportada: "${key}". Proxies e agentes de rede não são aceitos.`);
    }
  }
  const hosts = [...((raw.hosts as string[] | undefined) ?? [])];
  let allowLocalhost = false;
  if (raw.rpcUrl !== undefined) {
    if (typeof raw.rpcUrl !== "string") throw new InvalidNetworkConfigError("rpcUrl deve ser um texto.");
    const url = toUrl(raw.rpcUrl);
    if (!url) throw new InvalidNetworkConfigError(`rpcUrl inválida: "${raw.rpcUrl}"`);
    if (url.protocol === "https:") hosts.push(url.hostname);
    else if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname.toLowerCase())) allowLocalhost = true;
    else throw new InvalidNetworkConfigError("O RPC deve usar https (ou http apenas em localhost).");
  }
  return createPolicy({ hosts, allowLocalhost });
}
