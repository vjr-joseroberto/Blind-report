import type { Logger, RelayerDeps } from "./types.ts";

export type RenewalResult = { newsroom: string; renewed: number; error?: string };

/** Periodic job: renews tips that expire soon (the maximum on-chain life is ~182 days). */
export function createRenewalJob(opts: {
  store: Pick<RelayerDeps["store"], "renewExpiring">;
  newsrooms: string[];
  withinSeconds: number;
  retentionSeconds: number;
  sleep: (ms: number) => Promise<void>;
  logger: Logger;
  maxAttempts?: number;
  baseDelayMs?: number;
}) {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  return {
    async run(): Promise<RenewalResult[]> {
      const results: RenewalResult[] = [];
      for (const newsroom of opts.newsrooms) {
        let done = false;
        for (let attempt = 1; attempt <= maxAttempts && !done; attempt++) {
          try {
            const renewed = await opts.store.renewExpiring({ newsroom, withinSeconds: opts.withinSeconds, retentionSeconds: opts.retentionSeconds });
            results.push({ newsroom, renewed });
            opts.logger.info({ job: "renewal", newsroom, renewed });
            done = true;
          } catch {
            if (attempt < maxAttempts) await opts.sleep(baseDelayMs * 2 ** (attempt - 1));
            else {
              results.push({ newsroom, renewed: 0, error: "failed to renew" });
              opts.logger.error({ job: "renewal", newsroom, attempts: maxAttempts });
            }
          }
        }
      }
      return results;
    },
  };
}
