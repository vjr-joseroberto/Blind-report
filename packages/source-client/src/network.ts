import { createPolicy, type NetworkPolicy } from "@safe-whistle/network-policy";
import { SourceError } from "./errors.ts";

/** Hosts that IDKit (without a UI) contacts in the source's browser (validation V-05). */
export const IDKIT_HOSTS = ["bridge.worldcoin.org"];

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Source network policy: ENS RPC (user-configurable), Arkiv RPC, relayer and the World bridge. */
export function sourceNetworkPolicy(urls: { rpcUrl: string; relayerUrl: string; arkivRpcUrl: string }): NetworkPolicy {
  const hosts: string[] = [...IDKIT_HOSTS];
  let allowLocalhost = false;
  for (const raw of [urls.rpcUrl, urls.relayerUrl, urls.arkivRpcUrl]) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new SourceError("invalid_network", `Invalid address: "${raw}".`);
    }
    if (u.username || u.password) throw new SourceError("invalid_network", "The address cannot contain a username or password.");
    if (u.protocol === "https:") hosts.push(u.hostname);
    else if (u.protocol === "http:" && LOCAL.has(u.hostname)) allowLocalhost = true;
    else throw new SourceError("invalid_network", "Use https (or http only on localhost).");
  }
  return createPolicy({ hosts, allowLocalhost });
}
