import { createPolicy, type NetworkPolicy } from "@safe-whistle/network-policy";
import { NewsroomError } from "./errors.ts";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Network policy for the newsroom dashboard: ENS RPC (configurable) and Arkiv RPC. */
export function newsroomNetworkPolicy(urls: { rpcUrl: string; arkivRpcUrl: string }): NetworkPolicy {
  const hosts: string[] = [];
  let allowLocalhost = false;
  for (const raw of [urls.rpcUrl, urls.arkivRpcUrl]) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new NewsroomError("invalid_network", `Invalid address: "${raw}".`);
    }
    if (u.username || u.password) throw new NewsroomError("invalid_network", "The address cannot contain a username or password.");
    if (u.protocol === "https:") hosts.push(u.hostname);
    else if (u.protocol === "http:" && LOCAL.has(u.hostname)) allowLocalhost = true;
    else throw new NewsroomError("invalid_network", "Use https (or http only on localhost).");
  }
  return createPolicy({ hosts, allowLocalhost });
}
