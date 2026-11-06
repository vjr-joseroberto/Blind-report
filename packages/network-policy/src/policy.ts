import { InvalidNetworkConfigError } from "./errors.ts";

export type NetworkPolicy = {
  /** Allowed hosts (lowercase, no duplicates). https only. */
  readonly hosts: readonly string[];
  /** Allows http for localhost, 127.0.0.1 and [::1] (tests and development). */
  readonly allowLocalhost: boolean;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;

export function createPolicy(input: { hosts: string[]; allowLocalhost?: boolean }): NetworkPolicy {
  const hosts: string[] = [];
  for (const raw of input.hosts) {
    const host = raw.trim().toLowerCase();
    if (!HOST_RE.test(host)) throw new InvalidNetworkConfigError(`Invalid host in the list: "${raw}"`);
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

/** Builds the policy from a configuration. Refuses proxies and RPC over http outside localhost. */
export function parseNetworkConfig(raw: Record<string, unknown>): NetworkPolicy {
  const known = new Set(["rpcUrl", "hosts"]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) {
      throw new InvalidNetworkConfigError(`Unsupported network option: "${key}". Proxies and network agents are not accepted.`);
    }
  }
  const hosts = [...((raw.hosts as string[] | undefined) ?? [])];
  let allowLocalhost = false;
  if (raw.rpcUrl !== undefined) {
    if (typeof raw.rpcUrl !== "string") throw new InvalidNetworkConfigError("rpcUrl must be a string.");
    const url = toUrl(raw.rpcUrl);
    if (!url) throw new InvalidNetworkConfigError(`invalid rpcUrl: "${raw.rpcUrl}"`);
    if (url.protocol === "https:") hosts.push(url.hostname);
    else if (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname.toLowerCase())) allowLocalhost = true;
    else throw new InvalidNetworkConfigError("The RPC must use https (or http only on localhost).");
  }
  return createPolicy({ hosts, allowLocalhost });
}
