import { describe, expect, it, vi } from "vitest";
import type { Logger } from "../src/index.ts";
import { createRenewalJob } from "../src/index.ts";

const ok = (n: number) => vi.fn(async () => n);
const base = (store: { renewExpiring: ReturnType<typeof vi.fn> }, over: Record<string, unknown> = {}) => {
  const logs: unknown[] = [];
  const sleep = vi.fn(async (_ms: number) => {});
  const logger: Logger = { info: (e) => void logs.push(e), error: (e) => void logs.push(e) };
  const job = createRenewalJob({
    store: store as never, newsrooms: ["a.eth", "b.eth"], withinSeconds: 60 * 24 * 3600, retentionSeconds: 150 * 24 * 3600,
    sleep, logger, ...over,
  } as never);
  return { job, sleep, logs };
};

describe("RF-18 retention renewal job", () => {
  it("renews_each_newsroom_with_the_configured_parameters", async () => {
    const store = { renewExpiring: ok(3) };
    const { job } = base(store);
    const res = await job.run();
    expect(store.renewExpiring).toHaveBeenCalledWith({ newsroom: "a.eth", withinSeconds: 60 * 24 * 3600, retentionSeconds: 150 * 24 * 3600 });
    expect(store.renewExpiring).toHaveBeenCalledWith({ newsroom: "b.eth", withinSeconds: 60 * 24 * 3600, retentionSeconds: 150 * 24 * 3600 });
    expect(res).toEqual([{ newsroom: "a.eth", renewed: 3 }, { newsroom: "b.eth", renewed: 3 }]);
  });

  it("retries_with_exponential_backoff_when_the_rpc_fails_and_then_succeeds", async () => {
    const renewExpiring = vi.fn().mockRejectedValueOnce(new Error("rpc 1")).mockRejectedValueOnce(new Error("rpc 2")).mockResolvedValue(1);
    const { job, sleep } = base({ renewExpiring }, { newsrooms: ["a.eth"], baseDelayMs: 1000 });
    expect(await job.run()).toEqual([{ newsroom: "a.eth", renewed: 1 }]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it("after_exhausting_attempts_logs_the_error_and_moves_to_the_next_newsroom", async () => {
    const renewExpiring = vi.fn(async ({ newsroom }: { newsroom: string }) => {
      if (newsroom === "a.eth") throw new Error("rpc down");
      return 2;
    });
    const { job, sleep } = base({ renewExpiring }, { maxAttempts: 3, baseDelayMs: 10 });
    const res = await job.run();
    expect(res[0]).toMatchObject({ newsroom: "a.eth", renewed: 0, error: "failed to renew" });
    expect(res[1]).toEqual({ newsroom: "b.eth", renewed: 2 });
    expect(renewExpiring.mock.calls.filter((c) => (c[0] as { newsroom: string }).newsroom === "a.eth")).toHaveLength(3);
    expect(sleep).toHaveBeenCalledTimes(2); // between the 3 attempts
  });

  it("the_log_carries_only_counts_and_never_the_internal_error_message", async () => {
    const renewExpiring = vi.fn(async () => {
      throw new Error("senha=abc123 em 10.1.1.1");
    });
    const { job, logs } = base({ renewExpiring }, { newsrooms: ["a.eth"], maxAttempts: 1 });
    await job.run();
    const text = JSON.stringify(logs);
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("10.1.1.1");
    expect(logs.length).toBeGreaterThan(0);
  });

  it("with_no_newsrooms_configured_does_nothing", async () => {
    const store = { renewExpiring: ok(1) };
    const { job } = base(store, { newsrooms: [] });
    expect(await job.run()).toEqual([]);
    expect(store.renewExpiring).not.toHaveBeenCalled();
  });
});
