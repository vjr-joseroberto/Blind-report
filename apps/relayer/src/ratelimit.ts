/** Balde de fichas GLOBAL (sem IP nem estado por pessoa): protege o RPC e o World sem rastrear ninguém. */
export function createRateLimiter(opts: { perMinute: number; now: () => number }) {
  if (!Number.isInteger(opts.perMinute) || opts.perMinute < 1) throw new RangeError("perMinute deve ser um inteiro positivo.");
  const capacity = opts.perMinute;
  let tokens = capacity;
  let last = opts.now();
  return {
    tryTake(): boolean {
      const t = opts.now();
      tokens = Math.min(capacity, tokens + ((t - last) / 60_000) * capacity);
      last = t;
      if (tokens < 1) return false;
      tokens -= 1;
      return true;
    },
  };
}
