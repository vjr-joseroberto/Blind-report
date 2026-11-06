import { createPolicy, type NetworkPolicy } from "@safe-whistle/network-policy";
import { NewsroomError } from "./errors.ts";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Política de rede do painel da redação: RPC do ENS (configurável) e RPC do Arkiv. */
export function newsroomNetworkPolicy(urls: { rpcUrl: string; arkivRpcUrl: string }): NetworkPolicy {
  const hosts: string[] = [];
  let allowLocalhost = false;
  for (const raw of [urls.rpcUrl, urls.arkivRpcUrl]) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new NewsroomError("invalid_network", `Endereço inválido: "${raw}".`);
    }
    if (u.username || u.password) throw new NewsroomError("invalid_network", "O endereço não pode conter usuário ou senha.");
    if (u.protocol === "https:") hosts.push(u.hostname);
    else if (u.protocol === "http:" && LOCAL.has(u.hostname)) allowLocalhost = true;
    else throw new NewsroomError("invalid_network", "Use https (ou http apenas em localhost).");
  }
  return createPolicy({ hosts, allowLocalhost });
}
