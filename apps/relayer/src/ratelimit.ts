/** GLOBAL token bucket (no IP or per-person state): protects the RPC and World without tracking anyone. */
export function createRateLimiter(opts: { perMinute: number; now: () => number }) {
  if (!Number.isInteger(opts.perMinute) || opts.perMinute < 1) throw new RangeError("perMinute must be a positive integer.");
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
