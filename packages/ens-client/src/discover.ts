import { isAddress, type Address } from "viem";
import { ABIS, ENSV2_SEPOLIA } from "./deployments.ts";

/** O mínimo do cliente para ler eventos (um PublicClient do viem satisfaz). */
export type LogClient = {
  getBlockNumber(): Promise<bigint>;
  getLogs(args: { address: Address; event: { name: string; [k: string]: unknown }; args?: Record<string, unknown>; fromBlock: bigint; toBlock: bigint }): Promise<{ args: Record<string, unknown> }[]>;
};

const eventOf = (name: string) => (ABIS.ethRegistry as readonly { type: string; name?: string }[]).find((e) => e.type === "event" && e.name === name) as { name: string; [k: string]: unknown };

/**
 * Rótulos `.eth` que foram registrados (ou transferidos) PARA esta carteira, lendo os eventos do registry de trás para frente.
 * O ENS não responde "quais nomes são desta carteira"; por isso é uma busca em blocos recentes, que pode ficar incompleta
 * (RPCs públicos limitam o intervalo). Quem chama deve confirmar cada nome (registros do Safe Whistle e custodiante).
 */
export async function findLabelsMintedTo(opts: {
  client: LogClient;
  address: Address;
  ethRegistry?: Address;
  /** Quantos blocos olhar para trás (Sepolia: ~12 s por bloco). */
  maxBlocks?: bigint;
  chunk?: bigint;
  minChunk?: bigint;
}): Promise<{ labels: string[]; incomplete: boolean }> {
  if (!isAddress(opts.address, { strict: false })) throw new Error("Endereço inválido.");
  const registry = opts.ethRegistry ?? (ENSV2_SEPOLIA.ethRegistry as Address);
  const transfer = eventOf("TransferSingle");
  const registered = eventOf("LabelRegistered");
  const maxBlocks = opts.maxBlocks ?? 300_000n;
  const minChunk = opts.minChunk ?? 500n;
  let size = opts.chunk ?? 10_000n;

  const head = await opts.client.getBlockNumber();
  const floor = head > maxBlocks ? head - maxBlocks : 0n;
  const labels = new Set<string>();
  let incomplete = false;
  let to = head;

  while (to >= floor) {
    const from = to - size + 1n > floor ? to - size + 1n : floor;
    try {
      const minted = await opts.client.getLogs({ address: registry, event: transfer, args: { to: opts.address }, fromBlock: from, toBlock: to });
      const ids = new Set(minted.map((l) => String(l.args.id)));
      if (ids.size > 0) {
        for (const l of await opts.client.getLogs({ address: registry, event: registered, fromBlock: from, toBlock: to })) {
          if (ids.has(String(l.args.tokenId)) && typeof l.args.label === "string") labels.add(l.args.label);
        }
      }
      to = from - 1n;
    } catch {
      if (size > minChunk) size = size / 2n > minChunk ? size / 2n : minChunk; // o RPC recusou o intervalo: tenta menor
      else {
        incomplete = true; // nem o menor bloco funcionou: pula este trecho
        to = from - 1n;
      }
    }
    if (to < 0n) break;
  }
  return { labels: [...labels], incomplete };
}
