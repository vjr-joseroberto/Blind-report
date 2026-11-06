import type { Receipt } from "@safe-whistle/core";
import type { NewsroomInfo } from "@safe-whistle/ens-client";

/** Resultado do IDKit, repassado sem alterações ao relayer (que o confere com a API do World). */
export type IdKitPayload = { action: string; environment: string; responses: { nullifier: string; [k: string]: unknown }[]; [k: string]: unknown };

export type ProofRequest = {
  appId: string;
  environment: "staging" | "production";
  action: string;
  rpContext: unknown;
};
/** Na tela é o IDKit sem interface; nos testes é um dublê. Lança `ProofError` se a prova não sair. */
export type ProofProvider = (req: ProofRequest) => Promise<IdKitPayload>;

export type SourceDeps = {
  /** Deve ser um `fetch` já protegido pela política de rede (`guardedFetch`). */
  fetch: typeof fetch;
  relayerUrl: string;
  reader: { resolveNewsroom(name: string): Promise<NewsroomInfo>; journalistOwner(name: string): Promise<`0x${string}` | null> };
  replies: { getReplies(mailboxId: string): Promise<{ key: `0x${string}`; newsroom: string; sealed: Uint8Array; createdAtBlock: bigint; creator: `0x${string}`; authorName?: string }[]> };
  submissions: { listSubmissions(q: { newsroom: string; limit?: number; offset?: number }): Promise<{ items: { contentHash: string; createdAtBlock: bigint }[]; hasMore: boolean }> };
  proofProvider: ProofProvider;
  now: () => Date;
};

/** Recibo guardado só no dispositivo da fonte. */
export type SourceReceipt = Receipt & { newsroom: string; key: string };
