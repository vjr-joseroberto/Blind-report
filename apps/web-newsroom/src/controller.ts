// Logic for the newsroom panel, without DOM: a state and the actions the screen wires to the buttons.
// Every action checks the session role (`canDo`): the rule holds in the code, not only on the screen.
import type { Status, Submission } from "@safe-whistle/arkiv-store";
import { fromBase64Url, toBase64Url, type NewsroomPolicy } from "@safe-whistle/core";
import type { AdminStep } from "@safe-whistle/ens-client";
import { NewsroomError, canDo, type Action, type Decrypted, type Role, type createNewsroomClient } from "@safe-whistle/newsroom-client";
import type { SentTx } from "./wallet.ts";

type Client = ReturnType<typeof createNewsroomClient>;

export type ViewError = { code: string; message: string };
export type PanelState = {
  /** An action that writes (wallet) or touches the keys is in progress. */
  busy: boolean;
  /** A network read is in progress (inbox, expirations): it does not lock the rest of the panel. */
  loading: boolean;
  error?: ViewError;
  notice?: string;
  progress?: AdminStep;
  /** How many transactions have already been sent in the registration (for "confirm in the wallet (n of 8)"). */
  txCount: number;
  newsroom?: { name: string };
  keyVersion?: number;
  keysLoaded: boolean;
  backupDone: boolean;
  backupText?: string;
  sharedText?: string;
  inbox?: { items: Submission[]; hasMore: boolean };
  /** Notes discarded because they were not written by the newsroom. */
  ignoredAnnotations?: number;
  /** `envelope` is the encrypted file that can be published and verified on the source screen. */
  opened?: Decrypted & { status: Status; envelope: Uint8Array };
  expiring?: Submission[];
  txs: SentTx[];
};

const FORBIDDEN: ViewError = { code: "forbidden", message: "This action is not available for your role." };

const toViewError = (e: unknown): ViewError =>
  e instanceof NewsroomError ? { code: e.code, message: e.message } : { code: "unexpected", message: "Something went wrong. Try again." };

export function createPanelController(client: Client, opts: { role?: Role } = {}) {
  let role: Role = opts.role ?? "visitor";
  let state: PanelState = { busy: false, loading: false, txCount: 0, keysLoaded: false, backupDone: false, txs: [] };
  const listeners = new Set<(s: PanelState) => void>();
  const set = (patch: Partial<PanelState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  };
  const keysLoaded = () => client.keyVersions().length > 0;

  /** Runs an action: checks the role, marks busy, clears notices and shows the cause on failure. */
  async function run(action: Action, fn: () => Promise<Partial<PanelState> | void>, opts: { read?: boolean } = {}): Promise<void> {
    if (!canDo(role, action)) {
      set({ error: FORBIDDEN, notice: undefined });
      return;
    }
    const flag = opts.read ? "loading" : "busy";
    set({ [flag]: true, error: undefined, notice: undefined });
    try {
      set({ [flag]: false, ...(await fn()) });
    } catch (e) {
      set({ [flag]: false, progress: undefined, error: toViewError(e) });
    }
  }
  const found = (key: string) => state.inbox?.items.find((i) => i.key === key);
  const sync = (): Partial<PanelState> => {
    const n = client.newsroom();
    return { newsroom: n ? { name: n.name } : undefined, keyVersion: keysLoaded() ? client.currentKey().version : undefined, keysLoaded: keysLoaded() };
  };

  return {
    get state() {
      return state;
    },
    get role() {
      return role;
    },
    setRole(r: Role) {
      role = r;
    },
    subscribe(fn: (s: PanelState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Records a transaction sent by the wallet (to show the link in the explorer). */
    addTx(tx: SentTx) {
      set({ txs: [...state.txs, tx], txCount: state.txCount + 1 });
    },

    register: (a: { label: string; categories: string[]; maxBytes: number; attachments: boolean }) =>
      run("register_newsroom", async () => {
        set({ txCount: 0 });
        const n = await client.registerNewsroom({
          label: a.label,
          policy: { categories: a.categories, maxBytes: a.maxBytes, attachments: a.attachments, epoch: "monthly" },
          onProgress: (progress) => set({ progress }),
        });
        return { ...sync(), newsroom: { name: n.name }, progress: undefined, notice: `Newsroom ${n.name} registered.` };
      }),

    rotate: () =>
      run("rotate_key", async () => {
        const v = await client.rotateKey();
        return { keyVersion: v, backupDone: false, notice: `New key published (version ${v}). Make a new backup.` };
      }),

    updatePolicy: (policy: NewsroomPolicy) =>
      run("edit_policy", async () => {
        await client.updatePolicy(policy);
        return { notice: "Policy published to ENS." };
      }),

    exportBackup: (password: string) =>
      run("backup", async () => ({ backupText: await client.exportBackup(password), backupDone: true, notice: "Backup generated. Click Download backup and keep the file and the password in a safe place." })),
    importBackup: (blob: string, password: string) =>
      run("backup", async () => {
        await client.importBackup(blob, password);
        return { ...sync(), backupDone: true, notice: "Backup imported." };
      }),

    loadInbox: (q: { status?: Status; category?: string; limit?: number; offset?: number }) =>
      run("read_inbox", async () => {
        const { items, hasMore, ignoredAnnotations } = await client.listInbox(q);
        return { inbox: { items, hasMore }, ignoredAnnotations };
      }, { read: true }),

    open: async (key: string) => {
      const item = found(key);
      if (!item) return;
      await run("decrypt", async () => {
        const d = await client.decrypt(item);
        return { opened: { ...d, status: await client.statusOf(item.key), envelope: item.envelope } };
      });
    },

    setStatus: (key: string, status: Status) =>
      run("set_status", async () => {
        await client.setStatus(key as `0x${string}`, status);
        return { opened: state.opened && state.opened.key === key ? { ...state.opened, status: await client.statusOf(key as `0x${string}`) } : state.opened };
      }),

    reply: async (key: string, text: string) => {
      const item = found(key);
      if (!item) return;
      await run("reply", async () => {
        await client.reply(item, text);
        return { notice: "Reply sent. Only the source can read it." };
      });
    },

    addJournalist: (a: { label: string; address: `0x${string}`; readerPublicKey: Uint8Array }) =>
      run("manage_team", async () => {
        await client.addJournalist(a);
        return { notice: `Journalist ${a.label} registered.` };
      }),

    revokeJournalist: (label: string) =>
      run("manage_team", async () => {
        await client.revokeJournalist(label);
        return { notice: `Journalist ${label} revoked. To prevent the use of already delivered keys, rotate the key.` };
      }),

    /** Each person generates their own reader key. Returns nothing if the role does not allow it. */
    newReaderKey: (): { publicKey: string; privateKey: string } | undefined => {
      if (!canDo(role, "reader_key")) {
        set({ error: FORBIDDEN });
        return undefined;
      }
      const k = client.newReaderKey();
      return { publicKey: toBase64Url(k.publicKey), privateKey: toBase64Url(k.privateKey) };
    },
    shareKeyring: (readerPublicKey: string) => run("manage_team", async () => ({ sharedText: client.shareKeyring(fromBase64Url(readerPublicKey)) })),
    importShared: (blob: string, reader: { publicKey: string; privateKey: string }) =>
      run("import_shared_keyring", async () => {
        client.importSharedKeyring(blob, { publicKey: fromBase64Url(reader.publicKey), privateKey: fromBase64Url(reader.privateKey) });
        return { ...sync(), notice: "Keyring imported." };
      }),

    loadExpiring: (withinSeconds: number) => run("renew", async () => ({ expiring: await client.listExpiring(withinSeconds) }), { read: true }),
    renewAll: (retentionSeconds: number) =>
      run("renew", async () => {
        const list = state.expiring ?? [];
        for (const s of list) await client.renew(s.key, retentionSeconds);
        return { expiring: [], notice: `${list.length} tip(s) renewed.` };
      }),
  };
}
