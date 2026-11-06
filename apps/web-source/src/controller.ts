// Lógica da tela da fonte, sem DOM: um estado e as ações que a tela liga aos botões.
import type { Attachment } from "@safe-whistle/core";
import { ProofError, SourceError, parseReceipt, serializeReceipt, type ProofProvider, type createSourceClient } from "@safe-whistle/source-client";

type Client = ReturnType<typeof createSourceClient>;
type Verification = Awaited<ReturnType<Client["verifyDocument"]>>;

export type ViewError = { code: string; message: string };
export type SourceState = {
  step: "newsroom" | "compose" | "proof" | "receipt";
  busy: boolean;
  error?: ViewError;
  newsroom?: { name: string; version: number; categories: string[]; maxBytes: number; attachments: boolean };
  proofLink?: string;
  receiptText?: string;
  receiptSaved: boolean;
  replies?: { text: string; createdAtBlock: bigint; author: string }[];
  /** Respostas descartadas por não terem sido escritas pela redação (autor não reconhecido). */
  ignoredReplies?: number;
  verification?: Verification;
};

const toViewError = (e: unknown): ViewError =>
  e instanceof SourceError ? { code: e.code, message: e.message } : { code: "unexpected", message: "Algo deu errado. Tente de novo." };

/** Envolve um fornecedor de prova para que a tela possa cancelá-lo. */
export function cancellable(inner: ProofProvider): { provider: ProofProvider; cancel: () => void } {
  let abort: (() => void) | undefined;
  return {
    provider: (req) =>
      Promise.race([
        inner(req),
        new Promise<never>((_, reject) => {
          abort = () => reject(new ProofError("cancelled"));
        }),
      ]),
    cancel: () => abort?.(),
  };
}

export function createSourceController(client: Client) {
  let state: SourceState = { step: "newsroom", busy: false, receiptSaved: false };
  const listeners = new Set<(s: SourceState) => void>();
  const set = (patch: Partial<SourceState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  };

  return {
    deps: client,
    get state() {
      return state;
    },
    subscribe(fn: (s: SourceState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async lookup(name: string) {
      set({ busy: true, error: undefined });
      try {
        const info = await client.lookupNewsroom(name.trim());
        set({ step: "compose", busy: false, newsroom: { name: info.name, version: info.pubkeyVersion, categories: info.policy.categories, maxBytes: info.policy.maxBytes, attachments: info.policy.attachments } });
      } catch (e) {
        set({ step: "newsroom", busy: false, error: toViewError(e) });
      }
    },

    setProofLink(link: string) {
      set({ proofLink: link });
    },

    async submit(input: { category: string; text: string; attachment?: Attachment }) {
      const nr = state.newsroom;
      if (!nr) return;
      set({ step: "proof", busy: true, error: undefined, proofLink: undefined });
      try {
        const { receipt } = await client.submit({ newsroom: nr.name, ...input });
        set({ step: "receipt", busy: false, proofLink: undefined, receiptText: serializeReceipt(receipt), receiptSaved: false });
      } catch (e) {
        set({ step: "compose", busy: false, proofLink: undefined, error: toViewError(e) });
      }
    },

    confirmReceiptSaved() {
      set({ receiptSaved: true });
    },

    /** Só conclui depois de a pessoa confirmar que guardou o recibo. */
    finish() {
      if (state.step !== "receipt" || !state.receiptSaved) return;
      set({ step: "newsroom", newsroom: undefined, receiptText: undefined, receiptSaved: false, error: undefined });
    },

    async loadReplies(receiptText: string) {
      set({ busy: true, error: undefined, replies: undefined, ignoredReplies: undefined });
      try {
        const r = await client.readReplies(parseReceipt(receiptText));
        set({ busy: false, replies: r.replies, ignoredReplies: r.ignored });
      } catch (e) {
        set({ busy: false, error: toViewError(e) });
      }
    },

    async verify(input: { newsroom: string; envelope: Uint8Array }) {
      set({ busy: true, error: undefined, verification: undefined });
      try {
        set({ busy: false, verification: await client.verifyDocument(input) });
      } catch (e) {
        set({ busy: false, error: toViewError(e) });
      }
    },

    proveAuthorship: client.proveAuthorship,
  };
}
