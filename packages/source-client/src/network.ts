import { createPolicy, type NetworkPolicy } from "@safe-whistle/network-policy";
import { SourceError } from "./errors.ts";

/** Hosts que o IDKit (sem interface) contata no navegador da fonte (validação V-05). */
export const IDKIT_HOSTS = ["bridge.worldcoin.org"];

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Política de rede da fonte: RPC do ENS (configurável pelo usuário), RPC do Arkiv, relayer e a ponte do World. */
export function sourceNetworkPolicy(urls: { rpcUrl: string; relayerUrl: string; arkivRpcUrl: string }): NetworkPolicy {
  const hosts: string[] = [...IDKIT_HOSTS];
  let allowLocalhost = false;
  for (const raw of [urls.rpcUrl, urls.relayerUrl, urls.arkivRpcUrl]) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new SourceError("invalid_network", `Endereço inválido: "${raw}".`);
    }
    if (u.username || u.password) throw new SourceError("invalid_network", "O endereço não pode conter usuário ou senha.");
    if (u.protocol === "https:") hosts.push(u.hostname);
    else if (u.protocol === "http:" && LOCAL.has(u.hostname)) allowLocalhost = true;
    else throw new SourceError("invalid_network", "Use https (ou http apenas em localhost).");
  }
  return createPolicy({ hosts, allowLocalhost });
}
