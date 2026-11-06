import { PART_PAYLOAD_BYTES } from "./limits.ts";
import type { Part } from "./types.ts";

export type PartsErrorCode = "empty" | "missing" | "duplicate" | "inconsistent_total";

export class PartsError extends Error {
  constructor(public readonly code: PartsErrorCode, message: string) {
    super(message);
    this.name = "PartsError";
  }
}

/** Divide bytes em partes de até `partSize` bytes. Entrada vazia gera uma parte vazia. */
export function splitIntoParts(data: Uint8Array, partSize: number = PART_PAYLOAD_BYTES): Part[] {
  if (!Number.isInteger(partSize) || partSize < 1) throw new RangeError("O tamanho da parte deve ser um inteiro positivo.");
  const total = Math.max(1, Math.ceil(data.length / partSize));
  return Array.from({ length: total }, (_, index) => ({
    index,
    total,
    data: data.slice(index * partSize, (index + 1) * partSize),
  }));
}

/** Remonta as partes em qualquer ordem; exige todas, sem repetição e com o mesmo total. */
export function joinParts(parts: Part[]): Uint8Array {
  if (parts.length === 0) throw new PartsError("empty", "Nenhuma parte informada.");
  const total = parts[0]!.total;
  if (parts.some((p) => p.total !== total)) throw new PartsError("inconsistent_total", "As partes declaram totais diferentes.");
  const byIndex = new Map<number, Part>();
  for (const p of parts) {
    if (byIndex.has(p.index)) throw new PartsError("duplicate", `Parte repetida: ${p.index}`);
    byIndex.set(p.index, p);
  }
  if (byIndex.size !== total) throw new PartsError("missing", `Faltam partes: recebidas ${byIndex.size} de ${total}.`);
  const ordered: Part[] = [];
  for (let i = 0; i < total; i++) {
    const p = byIndex.get(i);
    if (!p) throw new PartsError("missing", `Falta a parte ${i}.`);
    ordered.push(p);
  }
  const out = new Uint8Array(ordered.reduce((n, p) => n + p.data.length, 0));
  let offset = 0;
  for (const p of ordered) {
    out.set(p.data, offset);
    offset += p.data.length;
  }
  return out;
}
