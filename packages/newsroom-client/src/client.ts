import type { Authorize, createStore, Status, Submission } from "@safe-whistle/arkiv-store";
import { ENS_KEYS, decodePayload, encodeReply, fromBase64Url, parsePolicy, PolicyError, toBase64Url, type Attachment, type NewsroomPolicy, type Payload } from "@safe-whistle/core";
import { CryptoError, decodeEnvelope, lockWithPassword, mailboxId, newKeypair, open, openSealed, sealReply, sealTo, unlockWithPassword, verifyContentHash, type Keypair } from "@safe-whistle/crypto";
import { createAuthority, type AdminStep, type createAdmin, type Newsroom, type NewsroomInfo } from "@safe-whistle/ens-client";
import type { Address } from "viem";
import { NewsroomError } from "./errors.ts";
import { asKeypair, keysFromJson, keysToJson, type KeyEntry } from "./keyring.ts";

type Admin = Pick<ReturnType<typeof createAdmin>, "createNewsroom" | "rotateKey" | "addJournalist" | "revokeJournalist" | "renewJournalist" | "setText">;
type Store = Pick<ReturnType<typeof createStore>, "listSubmissions" | "annotate" | "latestStatus" | "publishReply" | "listExpiring" | "renew">;
type Reader = { resolveNewsroom(name: string): Promise<NewsroomInfo>; journalistOwner(name: string): Promise<Address | null> };

export type NewsroomDeps = {
  /** Creates the ENS administration; `onProgress` receives the registration steps. */
  makeAdmin: (hooks: { onProgress: (e: AdminStep) => void }) => Admin;
  reader: Reader;
  store: Store;
  /** This person's account: custodian of the tips and author of the notes. */
  account: Address;
  /** Full ENS name of the operator (e.g.: `maria.jornalista1.eth`). Empty for the administrator. */
  authorName?: string;
  now: () => Date;
  /** Key derivation iterations for the backup (tests use few). */
  kdfIterations?: number;
};

export type Decrypted = Payload & { category: string; epoch: number; key: string };

const DEFAULT_REPLY_RETENTION = 150 * 24 * 3600;
const RECIPIENT = "redacao";
const need = <T>(v: T | undefined, what = "Register or import the newsroom first."): T => {
  if (v === undefined) throw new NewsroomError("no_newsroom", what);
  return v;
};

export function createNewsroomClient(deps: NewsroomDeps) {
  const keys = new Map<number, KeyEntry>();
  let ens: Newsroom | undefined;
  let progress: ((e: AdminStep) => void) | undefined;
  const admin = deps.makeAdmin({ onProgress: (e) => progress?.(e) });

  const sortedKeys = () => [...keys.values()].sort((a, b) => a.version - b.version);
  const current = () => need(sortedKeys().at(-1), "There are no keys: register or import the newsroom.");
  const newKey = (version: number): KeyEntry => ({ version, ...newKeypair() });
  const name = () => need(ens).name;
  /** Only what the administrator or an active journalist wrote is valid; ENS is queried at read time. */
  const authorize = (): Authorize => createAuthority({ reader: deps.reader, newsroom: name() }).isAuthorized;

  const wrapPolicy = (policy: NewsroomPolicy): NewsroomPolicy => {
    try {
      return parsePolicy(JSON.stringify(policy));
    } catch (e) {
      if (e instanceof PolicyError) throw new NewsroomError("invalid_input", e.message);
      throw e;
    }
  };

  const decodeKeys = (bytes: Uint8Array): { newsroom?: Newsroom; keys: KeyEntry[] } => {
    try {
      const raw = JSON.parse(new TextDecoder().decode(bytes));
      if (raw?.v !== 1) throw new Error();
      return { newsroom: raw.newsroom ?? undefined, keys: keysFromJson(raw.keys) };
    } catch {
      throw new NewsroomError("invalid_backup", "The backup file is invalid or incomplete.");
    }
  };
  const encodeKeys = (kind: string, withNewsroom: boolean) =>
    new TextEncoder().encode(JSON.stringify({ v: 1, kind, newsroom: withNewsroom ? ens ?? null : null, keys: keysToJson(sortedKeys()) }));

  return {
    newsroom: () => ens,
    useNewsroom(n: Newsroom) {
      ens = n;
    },
    currentKey: () => {
      const k = current();
      return { version: k.version, publicKey: k.publicKey };
    },
    keyFor: (version: number): Keypair => asKeypair(need(keys.get(version), `Missing the key for version ${version}.`)),
    keyVersions: () => sortedKeys().map((k) => k.version),
    /** For tests only: returns the private keys in the clear. */
    exportKeyringForTest: () => ({ keys: sortedKeys() }),

    async registerNewsroom(a: { label: string; policy: NewsroomPolicy; relayers?: string[]; onProgress?: (e: AdminStep) => void }): Promise<Newsroom> {
      const policy = wrapPolicy(a.policy);
      const key = newKey(1);
      progress = a.onProgress;
      try {
        const created = await admin.createNewsroom({ label: a.label, publicKey: key.publicKey, version: 1, policy, relayers: a.relayers, custodian: deps.account });
        keys.clear();
        keys.set(1, key);
        ens = created;
        return created;
      } finally {
        progress = undefined;
      }
    },

    async rotateKey(): Promise<number> {
      const n = need(ens);
      const next = newKey(Math.max(0, ...keys.keys()) + 1);
      await admin.rotateKey({ name: n.name, resolver: n.resolver, publicKey: next.publicKey, version: next.version });
      keys.set(next.version, next);
      return next.version;
    },

    /** Publishes a new policy to ENS (categories, size, attachments). */
    async updatePolicy(policy: NewsroomPolicy): Promise<void> {
      const n = need(ens);
      const valid = wrapPolicy(policy);
      await admin.setText({ name: n.name, resolver: n.resolver, key: ENS_KEYS.policy, value: JSON.stringify(valid) });
    },

    /** Checks whether the key published in ENS is the one this device uses. */
    async verifyPublished(): Promise<{ ok: boolean; onChainVersion: number }> {
      const info = await deps.reader.resolveNewsroom(name());
      const k = current();
      const same = info.publicKey.length === k.publicKey.length && info.publicKey.every((b, i) => b === k.publicKey[i]);
      return { ok: info.pubkeyVersion === k.version && same, onChainVersion: info.pubkeyVersion };
    },

    async addJournalist(a: { label: string; address: Address; readerPublicKey: Uint8Array; validForSeconds?: number }): Promise<void> {
      await admin.addJournalist({ newsroom: need(ens), label: a.label, address: a.address, readerKey: a.readerPublicKey, ...(a.validForSeconds !== undefined ? { validForSeconds: a.validForSeconds } : {}) });
    },
    /** Revoking prevents new accesses in ENS, but does not "undo" keys already delivered: rotate the key. */
    async revokeJournalist(label: string): Promise<{ rotateRecommended: true }> {
      await admin.revokeJournalist({ newsroom: need(ens), label });
      return { rotateRecommended: true };
    },
    async renewJournalist(label: string, validForSeconds: number): Promise<void> {
      await admin.renewJournalist({ newsroom: need(ens), label, validForSeconds });
    },

    /** Each journalist generates the reader keypair on their own device and delivers only the public one. */
    newReaderKey: (): Keypair => newKeypair(),

    /** Encrypts the keyring for the journalist's reader key. */
    shareKeyring(readerPublicKey: Uint8Array): string {
      current();
      return toBase64Url(sealTo(readerPublicKey, encodeKeys("shared", true)));
    },
    importSharedKeyring(blob: string, reader: Keypair): void {
      let bytes: Uint8Array;
      try {
        bytes = openSealed(fromBase64Url(blob), reader);
      } catch {
        throw new NewsroomError("cannot_decrypt", "This keyring was not encrypted for your reader key.");
      }
      const parsed = decodeKeys(bytes);
      keys.clear();
      for (const k of parsed.keys) keys.set(k.version, k);
      if (parsed.newsroom) ens = parsed.newsroom;
    },

    async exportBackup(password: string): Promise<string> {
      current();
      try {
        return await lockWithPassword(encodeKeys("backup", true), password, { iterations: deps.kdfIterations });
      } catch (e) {
        if (e instanceof CryptoError) throw new NewsroomError("invalid_input", e.message);
        throw e;
      }
    },
    async importBackup(blob: string, password: string): Promise<void> {
      let bytes: Uint8Array;
      try {
        bytes = await unlockWithPassword(blob, password);
      } catch (e) {
        if (e instanceof CryptoError && e.code === "decrypt") throw new NewsroomError("wrong_password", "Incorrect password or tampered backup.");
        throw new NewsroomError("invalid_backup", "The backup file is invalid or incomplete.");
      }
      const parsed = decodeKeys(bytes);
      keys.clear();
      for (const k of parsed.keys) keys.set(k.version, k);
      if (parsed.newsroom) ens = parsed.newsroom;
    },

    async listInbox(q: { status?: Status; category?: string; limit?: number; offset?: number }) {
      return deps.store.listSubmissions({ newsroom: name(), ...q, authorize: authorize() });
    },

    async decrypt(item: Pick<Submission, "key" | "envelope" | "pubkeyVersion" | "category" | "epoch">): Promise<Decrypted> {
      const k = keys.get(item.pubkeyVersion);
      if (!k) throw new NewsroomError("missing_key", `Missing the key for version ${item.pubkeyVersion}. Import the backup or ask for the keyring.`);
      try {
        const env = decodeEnvelope(item.envelope);
        if (!verifyContentHash(env)) throw new CryptoError("format", "hash");
        const payload = decodePayload(open(env, RECIPIENT, asKeypair(k)));
        return { ...payload, category: env.category, epoch: item.epoch, key: item.key };
      } catch {
        throw new NewsroomError("cannot_decrypt", "Could not open this tip with this device's keys.");
      }
    },

    async setStatus(denunciaKey: `0x${string}`, status: Status): Promise<void> {
      await deps.store.annotate({ newsroom: name(), denunciaKey, status, journalist: deps.account, ...(deps.authorName ? { authorName: deps.authorName } : {}) });
    },
    statusOf: (denunciaKey: `0x${string}`) => deps.store.latestStatus(denunciaKey, authorize()),

    async reply(item: Pick<Submission, "envelope">, text: string, retentionSeconds = DEFAULT_REPLY_RETENTION): Promise<void> {
      if (text.trim() === "") throw new NewsroomError("invalid_input", "The reply cannot be empty.");
      const env = decodeEnvelope(item.envelope);
      let payload: Uint8Array;
      try {
        payload = encodeReply({ newsroom: name(), text });
      } catch {
        throw new NewsroomError("invalid_input", "The reply cannot be empty.");
      }
      await deps.store.publishReply({ newsroom: name(), mailboxId: mailboxId(env.mailboxPub), sealed: sealReply(env.mailboxPub, payload), retentionSeconds, ...(deps.authorName ? { authorName: deps.authorName } : {}) });
    },

    listExpiring: (withinSeconds: number) => deps.store.listExpiring({ newsroom: name(), withinSeconds }),
    renew: (key: `0x${string}`, retentionSeconds: number) => deps.store.renew({ key, retentionSeconds }),
  };
}

export type { Attachment };
