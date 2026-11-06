import { currentEpoch, toBase64Url, type NewsroomPolicy } from "@safe-whistle/core";
import { encodeEnvelope, newKeypair, seal, type Keypair } from "@safe-whistle/crypto";
import { vi } from "vitest";
import type { AdmitResult } from "@safe-whistle/worldid-gate";
import type { RelayerDeps } from "../src/index.ts";

export const NOW = new Date("2026-11-10T12:00:00Z");
export const EPOCH = currentEpoch(() => NOW);
export const NEWSROOM = "investiga.eth";
export const CUSTODIAN = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e" as const;
export const POLICY: NewsroomPolicy = { categories: ["saude", "corrupcao"], maxBytes: 100_000, attachments: false, epoch: "monthly" };

export const newsroomKeys: Keypair = newKeypair();

export function makeEnvelopeBytes(opts: { newsroom?: string; version?: number; category?: string; size?: number } = {}) {
  const { envelope } = seal({
    newsroom: opts.newsroom ?? NEWSROOM,
    pubkeyVersion: opts.version ?? 2,
    category: opts.category ?? "saude",
    recipients: [{ id: "redacao", publicKey: newsroomKeys.publicKey }],
    plaintext: new Uint8Array(opts.size ?? 300).fill(5),
  });
  return { envelope, bytes: encodeEnvelope(envelope) };
}

export type Fakes = ReturnType<typeof makeDeps>;

export function makeDeps(over: Partial<RelayerDeps> = {}) {
  const logs: unknown[] = [];
  const release = vi.fn(async () => {});
  const admit = vi.fn(async (): Promise<AdmitResult> => ({ ok: true, release }));
  const publishSubmission = vi.fn(async () => ({ key: ("0x" + "01".repeat(32)) as `0x${string}`, keys: [("0x" + "01".repeat(32)) as `0x${string}`] }));
  const resolveNewsroom = vi.fn(async (name: string) => ({ name, publicKey: newsroomKeys.publicKey, pubkeyVersion: 2, policy: POLICY, relayers: [], custodian: CUSTODIAN }));
  const rpContextFor = vi.fn(({ newsroom, epoch }: { newsroom: string; epoch: number }) => ({ rp_id: "rp_test", nonce: "0x01", created_at: 1, expires_at: 301, signature: `0xsig-${newsroom}-${epoch}` }));
  const renewExpiring = vi.fn(async () => 0);
  const deps: RelayerDeps = {
    reader: { resolveNewsroom },
    store: { publishSubmission, renewExpiring },
    gate: { admit },
    signer: { rpContextFor },
    now: () => NOW,
    logger: { info: (e) => logs.push(e), error: (e) => logs.push(e) },
    appId: "app_test",
    environment: "staging",
    maxBodyBytes: 1024 * 1024,
    retentionSeconds: 150 * 24 * 3600,
    allowedOrigins: ["https://app.example.org"],
    ...over,
  };
  return { deps, logs, release, admit, publishSubmission, resolveNewsroom, rpContextFor, renewExpiring };
}

export const proof = { protocol_version: "4.0", action: `submit:${NEWSROOM}:${EPOCH}`, environment: "staging", responses: [{ identifier: "proof_of_human", nullifier: "0x" + "ab".repeat(30) }] };

export function submissionBody(over: Record<string, unknown> = {}, envelopeBytes?: Uint8Array): Uint8Array {
  const bytes = envelopeBytes ?? makeEnvelopeBytes().bytes;
  return new TextEncoder().encode(JSON.stringify({ newsroom: NEWSROOM, epoch: EPOCH, category: "saude", hasAttachment: false, proof, envelope: toBase64Url(bytes), ...over }));
}

export const req = (method: string, path: string, over: { body?: Uint8Array; headers?: Record<string, string> } = {}) => {
  const url = new URL(path, "http://relayer.local");
  return { method, path: url.pathname, query: url.searchParams, headers: over.headers ?? {}, body: over.body ?? new Uint8Array() };
};
