/** Monthly epoch in UTC in YYYYMM format (e.g. 202611). */
export function epochOf(date: Date): number {
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date.");
  return date.getUTCFullYear() * 100 + (date.getUTCMonth() + 1);
}

/** Current epoch, with the clock injected. */
export function currentEpoch(now: () => Date): number {
  return epochOf(now());
}

export function isEpoch(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  const month = value % 100;
  const year = Math.floor(value / 100);
  return year >= 1000 && year <= 9999 && month >= 1 && month <= 12;
}
