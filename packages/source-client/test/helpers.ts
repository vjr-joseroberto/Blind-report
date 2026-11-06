import { actionFor, currentEpoch, fromBase64Url, type NewsroomPolicy } from "@safe-whistle/core";
import { decodeEnvelope, newKeypair, open, type Keypair } from "@safe-whistle/crypto";
import { NewsroomNotFoundError, type NewsroomInfo } from "@safe-whistle/ens-client";
import { createRecorder } from "@safe-whistle/network-policy";
import type { IdKitPayload } from "@safe-whistle/worldid-gate";
import { vi } from "vitest";
import type { SourceDeps } from "../src/index.ts";

export const NOW = new Date("2026-11-10T12:00:00Z");
export const EPOCH = currentEpoch(() => NOW);
export const NEWSROOM = "investiga.eth";
export const RELAYER = "https://relayer.example.org";
export const POLICY: NewsroomPolicy = { categories: ["saude", "corrupcao"], maxBytes: 10_000, attachments: false, epoch: "monthly" };
export const keys: Keypair = newKeypair();
export const CUSTODIAN = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e" as const;
export const STRANGER = "0x9999999999999999999999999999999999999999" as const;
export const MARIA_ADDR = "0xa63A63047e362EE0B8af09489DCA1dc172E507ca" as const;
export const SECRET = "TEXTO-SECRETO-DA-DENUNCIA-123";

export const info = (over: Partial<NewsroomInfo> = {}): NewsroomInfo => ({
  name: NEWSROOM, publicKey: keys.publicKey, pubkeyVersion: 2, policy: POLICY, relayers: [], custodian: CUSTODIAN, ...over,
});

export const proofFor = (action: string): IdKitPayload => ({ action, environment: "staging", responses: [{ identifier: "proof_of_human", nullifier: "0xabc" }] });

type Handler = (body: Record<string, any>) => { status: number; json: unknown };

/** Fake relayer: responds to /rp-context and /submissions and stores what it received. */
export function makeRelayer(over: { submit?: Handler } = {}) {
  const received: Record<string, any>[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
    if (url.pathname === "/rp-context") {
      const newsroom = url.searchParams.get("newsroom")!;
      return reply(200, { app_id: "app_test", environment: "staging", epoch: EPOCH, action: actionFor(newsroom, EPOCH), rp_context: { rp_id: "rp_test", signature: "0xsig" } });
    }
    if (url.pathname === "/submissions") {
      const body = JSON.parse(String(init!.body));
      received.push(body);
      const r = (over.submit ?? (() => ({ status: 201, json: { key: "0x" + "01".repeat(32), parts: 1 } })))(body);
      return reply(r.status, r.json);
    }
    return reply(404, { error: { code: "not_found", message: "?" } });
  };
  return { fetch: fetchImpl, received };
}

export function makeDeps(over: Partial<SourceDeps> = {}) {
  const relayer = makeRelayer();
  const recorder = createRecorder(relayer.fetch);
  const resolveNewsroom = vi.fn(async (name: string) => {
    if (name === "nada.eth") throw new NewsroomNotFoundError(name);
    return info();
  });
  const proofProvider = vi.fn(async (req: { action: string }) => proofFor(req.action));
  const owners: Record<string, `0x${string}` | null> = {};
  const journalistOwner = vi.fn(async (name: string) => owners[name] ?? null);
  const getReplies = vi.fn(async (_mailboxId: string): Promise<{ key: `0x${string}`; newsroom: string; sealed: Uint8Array; createdAtBlock: bigint; creator: `0x${string}`; authorName?: string }[]> => []);
  const listSubmissions = vi.fn(async (_q: { newsroom: string; limit?: number; offset?: number }) => ({ items: [] as any[], hasMore: false, skippedIncomplete: 0 }));
  const deps: SourceDeps = {
    fetch: recorder.fetch, relayerUrl: RELAYER, reader: { resolveNewsroom, journalistOwner }, replies: { getReplies }, submissions: { listSubmissions }, proofProvider,
    now: () => NOW, ...over,
  };
  return { deps, relayer, recorder, owners, journalistOwner, resolveNewsroom, proofProvider, getReplies, listSubmissions };
}

export const openSent = (body: Record<string, any>) => {
  const env = decodeEnvelope(fromBase64Url(body.envelope));
  return { env, plaintext: open(env, "redacao", keys) };
};
