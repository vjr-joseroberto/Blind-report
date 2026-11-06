import type { NewsroomInfo } from "@safe-whistle/ens-client";
import type { AdmitResult, IdKitPayload, RpContext } from "@safe-whistle/worldid-gate";
import type { PublishInput } from "@safe-whistle/arkiv-store";
import type { Hex } from "viem";

export type HttpRequest = { method: string; path: string; query: URLSearchParams; headers: Record<string, string>; body: Uint8Array };
export type HttpResponse = { status: number; headers: Record<string, string>; body: string };

/** The log never receives IP, headers, body, proof or identifiers: only route, status and a code. */
export type Logger = { info(event: Record<string, unknown>): void; error(event: Record<string, unknown>): void };

export type RelayerDeps = {
  reader: { resolveNewsroom(name: string): Promise<NewsroomInfo> };
  store: {
    publishSubmission(input: PublishInput): Promise<{ key: Hex; keys: Hex[] }>;
    renewExpiring(q: { newsroom: string; withinSeconds: number; retentionSeconds: number }): Promise<number>;
  };
  gate: { admit(a: { newsroom: string; epoch: number; payload: IdKitPayload }): Promise<AdmitResult> };
  signer: { rpContextFor(a: { newsroom: string; epoch: number }): RpContext };
  now: () => Date;
  logger: Logger;
  appId: string;
  environment: "staging" | "production";
  maxBodyBytes: number;
  retentionSeconds: number;
  allowedOrigins: string[];
  /** Global request limit (optional). */
  limiter?: { tryTake(): boolean };
};
