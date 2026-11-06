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
  /** Cria a administração do ENS; `onProgress` recebe as etapas do cadastro. */
  makeAdmin: (hooks: { onProgress: (e: AdminStep) => void }) => Admin;
  reader: Reader;
  store: Store;
  /** Conta desta pessoa: custodiante das denúncias e autora das anotações. */
  account: Address;
  /** Nome ENS completo de quem opera (ex.: `maria.jornalista1.eth`). Vazio para o administrador. */
  authorName?: string;
  now: () => Date;
  /** Iterações da derivação de chave do backup (testes usam poucas). */
  kdfIterations?: number;
};

export type Decrypted = Payload & { category: string; epoch: number; key: string };

const DEFAULT_REPLY_RETENTION = 150 * 24 * 3600;
const RECIPIENT = "redacao";
const need = <T>(v: T | undefined, what = "Cadastre ou importe a redação primeiro."): T => {
  if (v === undefined) throw new NewsroomError("no_newsroom", what);
  return v;
};

export function createNewsroomClient(deps: NewsroomDeps) {
  const keys = new Map<number, KeyEntry>();
  let ens: Newsroom | undefined;
  let progress: ((e: AdminStep) => void) | undefined;
  const admin = deps.makeAdmin({ onProgress: (e) => progress?.(e) });

  const sortedKeys = () => [...keys.values()].sort((a, b) => a.version - b.version);
  const current = () => need(sortedKeys().at(-1), "Não há chaves: cadastre ou importe a redação.");
  const newKey = (version: number): KeyEntry => ({ version, ...newKeypair() });
  const name = () => need(ens).name;
  /** Só vale o que o administrador ou um jornalista ativo escreveu; o ENS é consultado no momento da leitura. */
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
      throw new NewsroomError("invalid_backup", "O arquivo de backup é inválido ou está incompleto.");
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
    keyFor: (version: number): Keypair => asKeypair(need(keys.get(version), `Falta a chave da versão ${version}.`)),
    keyVersions: () => sortedKeys().map((k) => k.version),
    /** Só para testes: devolve as chaves privadas em claro. */
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

    /** Publica uma política nova no ENS (categorias, tamanho, anexos). */
    async updatePolicy(policy: NewsroomPolicy): Promise<void> {
      const n = need(ens);
      const valid = wrapPolicy(policy);
      await admin.setText({ name: n.name, resolver: n.resolver, key: ENS_KEYS.policy, value: JSON.stringify(valid) });
    },

    /** Confere se a chave publicada no ENS é a que este aparelho usa. */
    async verifyPublished(): Promise<{ ok: boolean; onChainVersion: number }> {
      const info = await deps.reader.resolveNewsroom(name());
      const k = current();
      const same = info.publicKey.length === k.publicKey.length && info.publicKey.every((b, i) => b === k.publicKey[i]);
      return { ok: info.pubkeyVersion === k.version && same, onChainVersion: info.pubkeyVersion };
    },

    async addJournalist(a: { label: string; address: Address; readerPublicKey: Uint8Array; validForSeconds?: number }): Promise<void> {
      await admin.addJournalist({ newsroom: need(ens), label: a.label, address: a.address, readerKey: a.readerPublicKey, ...(a.validForSeconds !== undefined ? { validForSeconds: a.validForSeconds } : {}) });
    },
    /** Revogar impede novos acessos no ENS, mas não "desfaz" chaves já entregues: gire a chave. */
    async revokeJournalist(label: string): Promise<{ rotateRecommended: true }> {
      await admin.revokeJournalist({ newsroom: need(ens), label });
      return { rotateRecommended: true };
    },
    async renewJournalist(label: string, validForSeconds: number): Promise<void> {
      await admin.renewJournalist({ newsroom: need(ens), label, validForSeconds });
    },

    /** Cada jornalista gera no próprio aparelho o par de chaves de leitura e entrega só a pública. */
    newReaderKey: (): Keypair => newKeypair(),

    /** Cifra o chaveiro para a chave de leitura do jornalista. */
    shareKeyring(readerPublicKey: Uint8Array): string {
      current();
      return toBase64Url(sealTo(readerPublicKey, encodeKeys("shared", true)));
    },
    importSharedKeyring(blob: string, reader: Keypair): void {
      let bytes: Uint8Array;
      try {
        bytes = openSealed(fromBase64Url(blob), reader);
      } catch {
        throw new NewsroomError("cannot_decrypt", "Este chaveiro não foi cifrado para a sua chave de leitura.");
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
        if (e instanceof CryptoError && e.code === "decrypt") throw new NewsroomError("wrong_password", "Senha incorreta ou backup adulterado.");
        throw new NewsroomError("invalid_backup", "O arquivo de backup é inválido ou está incompleto.");
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
      if (!k) throw new NewsroomError("missing_key", `Falta a chave da versão ${item.pubkeyVersion}. Importe o backup ou peça o chaveiro.`);
      try {
        const env = decodeEnvelope(item.envelope);
        if (!verifyContentHash(env)) throw new CryptoError("format", "hash");
        const payload = decodePayload(open(env, RECIPIENT, asKeypair(k)));
        return { ...payload, category: env.category, epoch: item.epoch, key: item.key };
      } catch {
        throw new NewsroomError("cannot_decrypt", "Não foi possível abrir esta denúncia com as chaves deste aparelho.");
      }
    },

    async setStatus(denunciaKey: `0x${string}`, status: Status): Promise<void> {
      await deps.store.annotate({ newsroom: name(), denunciaKey, status, journalist: deps.account, ...(deps.authorName ? { authorName: deps.authorName } : {}) });
    },
    statusOf: (denunciaKey: `0x${string}`) => deps.store.latestStatus(denunciaKey, authorize()),

    async reply(item: Pick<Submission, "envelope">, text: string, retentionSeconds = DEFAULT_REPLY_RETENTION): Promise<void> {
      if (text.trim() === "") throw new NewsroomError("invalid_input", "A resposta não pode ser vazia.");
      const env = decodeEnvelope(item.envelope);
      let payload: Uint8Array;
      try {
        payload = encodeReply({ newsroom: name(), text });
      } catch {
        throw new NewsroomError("invalid_input", "A resposta não pode ser vazia.");
      }
      await deps.store.publishReply({ newsroom: name(), mailboxId: mailboxId(env.mailboxPub), sealed: sealReply(env.mailboxPub, payload), retentionSeconds, ...(deps.authorName ? { authorName: deps.authorName } : {}) });
    },

    listExpiring: (withinSeconds: number) => deps.store.listExpiring({ newsroom: name(), withinSeconds }),
    renew: (key: `0x${string}`, retentionSeconds: number) => deps.store.renew({ key, retentionSeconds }),
  };
}

export type { Attachment };
