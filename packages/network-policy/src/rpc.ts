/** Repetição com recuo exponencial (400 ms, 800 ms, 1,6 s) e tempo máximo para RPCs públicos, que oscilam (V-06). Use em `http(url, { fetchFn, ...RPC_TRANSPORT })`. */
export const RPC_TRANSPORT = { retryCount: 3, retryDelay: 400, timeout: 15_000 } as const;
