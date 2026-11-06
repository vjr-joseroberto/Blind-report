/** Retry with exponential backoff (400 ms, 800 ms, 1.6 s) and a maximum time for public RPCs, which fluctuate (V-06). Use in `http(url, { fetchFn, ...RPC_TRANSPORT })`. */
export const RPC_TRANSPORT = { retryCount: 3, retryDelay: 400, timeout: 15_000 } as const;
