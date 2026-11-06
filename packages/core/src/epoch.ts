/** Época mensal em UTC no formato AAAAMM (ex.: 202611). */
export function epochOf(date: Date): number {
  if (Number.isNaN(date.getTime())) throw new RangeError("Data inválida.");
  return date.getUTCFullYear() * 100 + (date.getUTCMonth() + 1);
}

/** Época corrente, com o relógio injetado. */
export function currentEpoch(now: () => Date): number {
  return epochOf(now());
}

export function isEpoch(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isInteger(value)) return false;
  const month = value % 100;
  const year = Math.floor(value / 100);
  return year >= 1000 && year <= 9999 && month >= 1 && month <= 12;
}
