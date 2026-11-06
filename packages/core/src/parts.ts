import { PART_PAYLOAD_BYTES } from "./limits.ts";
import type { Part } from "./types.ts";

export type PartsErrorCode = "empty" | "missing" | "duplicate" | "inconsistent_total";

export class PartsError extends Error {
  constructor(public readonly code: PartsErrorCode, message: string) {
    super(message);
    this.name = "PartsError";
  }
}

/** Splits bytes into parts of up to `partSize` bytes. An empty input yields one empty part. */
export function splitIntoParts(data: Uint8Array, partSize: number = PART_PAYLOAD_BYTES): Part[] {
  if (!Number.isInteger(partSize) || partSize < 1) throw new RangeError("Part size must be a positive integer.");
  const total = Math.max(1, Math.ceil(data.length / partSize));
  return Array.from({ length: total }, (_, index) => ({
    index,
    total,
    data: data.slice(index * partSize, (index + 1) * partSize),
  }));
}

/** Reassembles parts in any order; requires all of them, without repetition and with the same total. */
export function joinParts(parts: Part[]): Uint8Array {
  if (parts.length === 0) throw new PartsError("empty", "No parts provided.");
  const total = parts[0]!.total;
  if (parts.some((p) => p.total !== total)) throw new PartsError("inconsistent_total", "Parts declare different totals.");
  const byIndex = new Map<number, Part>();
  for (const p of parts) {
    if (byIndex.has(p.index)) throw new PartsError("duplicate", `Duplicate part: ${p.index}`);
    byIndex.set(p.index, p);
  }
  if (byIndex.size !== total) throw new PartsError("missing", `Missing parts: received ${byIndex.size} of ${total}.`);
  const ordered: Part[] = [];
  for (let i = 0; i < total; i++) {
    const p = byIndex.get(i);
    if (!p) throw new PartsError("missing", `Missing part ${i}.`);
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
