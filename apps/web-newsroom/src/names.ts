// Local memory of the NAMES of the newsrooms opened by each wallet (public ENS names only).
// This is the only exception to the rule "nothing in browser storage": keys, passwords, receipts and backups never go through here.
import { isNewsroomName } from "@safe-whistle/core";

export type Remembered = { newsroom: string; journalist?: string };
type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

const MAX = 20;
const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const keyOf = (address: string) => `sw.names.v1.${address.toLowerCase()}`;

/** Accepts only the expected format and discards any other field. */
function clean(x: unknown): Remembered | undefined {
  if (typeof x !== "object" || x === null) return undefined;
  const { newsroom, journalist } = x as { newsroom?: unknown; journalist?: unknown };
  if (typeof newsroom !== "string" || !isNewsroomName(newsroom)) return undefined;
  if (journalist === undefined) return { newsroom };
  if (typeof journalist !== "string" || !LABEL_RE.test(journalist)) return undefined;
  return { newsroom, journalist };
}

export function createNamesStore(storage: Storage | undefined) {
  const read = (address: string): Remembered[] => {
    try {
      const raw = storage?.getItem(keyOf(address));
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(clean).filter((e): e is Remembered => e !== undefined).slice(0, MAX) : [];
    } catch {
      return [];
    }
  };
  const write = (address: string, list: Remembered[]) => {
    try {
      storage?.setItem(keyOf(address), JSON.stringify(list.slice(0, MAX)));
    } catch {
      /* storage blocked or full: remembering is only a convenience */
    }
  };

  return {
    list: read,
    remember(address: string, entry: Remembered): void {
      const e = clean(entry);
      if (!e) return;
      write(address, [e, ...read(address).filter((x) => !(x.newsroom === e.newsroom && x.journalist === e.journalist))]);
    },
    forget(address: string, newsroom: string): void {
      try {
        write(address, read(address).filter((x) => x.newsroom !== newsroom));
      } catch {
        /* no storage */
      }
    },
  };
}

/** Uses browser storage, if it exists and is allowed. */
export function browserNamesStore() {
  let storage: Storage | undefined;
  try {
    storage = (globalThis as { localStorage?: Storage }).localStorage;
  } catch {
    storage = undefined;
  }
  return createNamesStore(storage);
}
