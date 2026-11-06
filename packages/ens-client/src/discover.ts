import { isAddress, type Address } from "viem";
import { ABIS, ENSV2_SEPOLIA } from "./deployments.ts";

/** The minimum client for reading events (a viem PublicClient suffices). */
export type LogClient = {
  getBlockNumber(): Promise<bigint>;
  getLogs(args: { address: Address; event: { name: string; [k: string]: unknown }; args?: Record<string, unknown>; fromBlock: bigint; toBlock: bigint }): Promise<{ args: Record<string, unknown> }[]>;
};

const eventOf = (name: string) => (ABIS.ethRegistry as readonly { type: string; name?: string }[]).find((e) => e.type === "event" && e.name === name) as { name: string; [k: string]: unknown };

/**
 * `.eth` labels that were registered (or transferred) TO this wallet, reading registry events backwards.
 * ENS does not answer "which names belong to this wallet"; hence it is a search over recent blocks, which can be incomplete
 * (public RPCs limit the range). The caller must confirm each name (Safe Whistle records and custodian).
 */
export async function findLabelsMintedTo(opts: {
  client: LogClient;
  address: Address;
  ethRegistry?: Address;
  /** How many blocks to look back (Sepolia: ~12 s per block). */
  maxBlocks?: bigint;
  chunk?: bigint;
  minChunk?: bigint;
}): Promise<{ labels: string[]; incomplete: boolean }> {
  if (!isAddress(opts.address, { strict: false })) throw new Error("Invalid address.");
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
      if (size > minChunk) size = size / 2n > minChunk ? size / 2n : minChunk; // the RPC rejected the range: try a smaller one
      else {
        incomplete = true; // not even the smallest block worked: skip this section
        to = from - 1n;
      }
    }
    if (to < 0n) break;
  }
  return { labels: [...labels], incomplete };
}
