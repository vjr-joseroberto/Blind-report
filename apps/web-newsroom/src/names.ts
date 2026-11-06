// Memória local dos NOMES das redações abertas por cada carteira (só nomes públicos do ENS).
// Esta é a única exceção à regra "nada no armazenamento do navegador": chaves, senhas, recibos e backups nunca passam por aqui.
import { isNewsroomName } from "@safe-whistle/core";

export type Remembered = { newsroom: string; journalist?: string };
type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

const MAX = 20;
const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const keyOf = (address: string) => `sw.names.v1.${address.toLowerCase()}`;

/** Aceita só o formato esperado e descarta qualquer outro campo. */
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
      /* armazenamento bloqueado ou cheio: a lembrança é só uma conveniência */
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
        /* sem armazenamento */
      }
    },
  };
}

/** Usa o armazenamento do navegador, se existir e estiver liberado. */
export function browserNamesStore() {
  let storage: Storage | undefined;
  try {
    storage = (globalThis as { localStorage?: Storage }).localStorage;
  } catch {
    storage = undefined;
  }
  return createNamesStore(storage);
}
