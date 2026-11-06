import type { Receipt } from "@safe-whistle/core";
import type { NewsroomInfo } from "@safe-whistle/ens-client";

/** IDKit result, forwarded unchanged to the relayer (which checks it with the World API). */
export type IdKitPayload = { action: string; environment: string; responses: { nullifier: string; [k: string]: unknown }[]; [k: string]: unknown };

export type ProofRequest = {
  appId: string;
  environment: "staging" | "production";
  action: string;
  rpContext: unknown;
};
/** On screen it is IDKit without a UI; in tests it is a double. Throws `ProofError` if the proof does not come out. */
export type ProofProvider = (req: ProofRequest) => Promise<IdKitPayload>;

export type SourceDeps = {
  /** Must be a `fetch` already protected by the network policy (`guardedFetch`). */
  fetch: typeof fetch;
  relayerUrl: string;
  reader: { resolveNewsroom(name: string): Promise<NewsroomInfo>; journalistOwner(name: string): Promise<`0x${string}` | null> };
  replies: { getReplies(mailboxId: string): Promise<{ key: `0x${string}`; newsroom: string; sealed: Uint8Array; createdAtBlock: bigint; creator: `0x${string}`; authorName?: string }[]> };
  submissions: { listSubmissions(q: { newsroom: string; limit?: number; offset?: number }): Promise<{ items: { contentHash: string; createdAtBlock: bigint }[]; hasMore: boolean }> };
  proofProvider: ProofProvider;
  now: () => Date;
};

/** Receipt stored only on the source's device. */
export type SourceReceipt = Receipt & { newsroom: string; key: string };
