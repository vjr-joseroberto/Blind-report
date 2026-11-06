import { currentEpoch, encodePayload, type NewsroomPolicy } from "@safe-whistle/core";
import { encodeEnvelope, seal } from "@safe-whistle/crypto";
import { createMemoryChain, createStore } from "@safe-whistle/arkiv-store";
import type { AdminStep } from "@safe-whistle/ens-client";
import { vi } from "vitest";
import type { NewsroomDeps } from "../src/index.ts";

export const NOW = new Date("2026-11-10T12:00:00Z");
export const NEWSROOM_ACCOUNT = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e" as const;
export const RELAYER_ACCOUNT = "0xd6eB8055311f1337ed033faAF944b03C4c8Ab974" as const;
export const STRANGER = "0x9999999999999999999999999999999999999999" as const;
export const JOURNALIST = "0xa63A63047e362EE0B8af09489DCA1dc172E507ca" as const;
export const POLICY: NewsroomPolicy = { categories: ["saude", "corrupcao"], maxBytes: 100_000, attachments: true, epoch: "monthly" };
export const ITER = 1000;
export const ENS = { name: "investiga.eth", label: "investiga", resolver: "0x1111111111111111111111111111111111111111", subRegistry: "0x2222222222222222222222222222222222222222" } as const;

export function makeDeps(over: Partial<NewsroomDeps> = {}) {
  const chain = createMemoryChain();
  const calls: unknown[][] = [];
  const track = <T extends (...a: any[]) => any>(fn: T): T => ((...a: any[]) => { calls.push(a); return fn(...a); }) as T;
  let hooks: { onProgress?: (e: AdminStep) => void } = {};
  const admin = {
    createNewsroom: vi.fn(track(async (_input: any) => {
      for (const e of [{ step: "resolver" }, { step: "commit" }, { step: "commit_wait", seconds: 65 }, { step: "register" }, { step: "records" }, { step: "registry" }, { step: "done" }] as AdminStep[]) hooks.onProgress?.(e);
      return { ...ENS };
    })),
    rotateKey: vi.fn(track(async (_a: any) => {})),
    addJournalist: vi.fn(track(async (_a: any) => {})),
    revokeJournalist: vi.fn(track(async (_a: any) => {})),
    renewJournalist: vi.fn(track(async (_a: any) => {})),
    setText: vi.fn(track(async (_a: any) => {})),
  };
  const owners: Record<string, `0x${string}` | null> = {};
  const reader = {
    resolveNewsroom: vi.fn(async (_n: string) => ({ custodian: NEWSROOM_ACCOUNT }) as never),
    journalistOwner: vi.fn(async (name: string) => owners[name] ?? null),
  };
  const deps: NewsroomDeps = {
    makeAdmin: (h) => { hooks = h; return admin; },
    reader, store: createStore(chain.backendFor(NEWSROOM_ACCOUNT)), account: NEWSROOM_ACCOUNT,
    now: () => NOW, kdfIterations: ITER, ...over,
  };
  const relayerStore = createStore(chain.backendFor(RELAYER_ACCOUNT));
  return { deps, admin, reader, owners, chain, calls, relayerStore };
}

/** Faz o papel da fonte + relayer: cifra para a chave dada e publica no Arkiv em memória. */
export async function publishAs(f: ReturnType<typeof makeDeps>, key: { version: number; publicKey: Uint8Array }, o: { text?: string; category?: string; attachment?: { name: string; data: Uint8Array } } = {}) {
  const { envelope, receipt } = seal({
    newsroom: ENS.name, pubkeyVersion: key.version, category: o.category ?? "saude",
    recipients: [{ id: "redacao", publicKey: key.publicKey }], plaintext: encodePayload({ text: o.text ?? "Denúncia de teste", attachment: o.attachment }),
  });
  const bytes = encodeEnvelope(envelope);
  const { key: entity } = await f.relayerStore.publishSubmission({
    newsroom: ENS.name, category: o.category ?? "saude", epoch: currentEpoch(() => NOW), contentHash: envelope.contentHash,
    pubkeyVersion: key.version, envelope: bytes, custodian: NEWSROOM_ACCOUNT, retentionSeconds: 150 * 24 * 3600,
  });
  return { entity, receipt, envelope };
}
