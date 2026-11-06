import { createPublicClient as createArkivPublicClient, createWalletClient as createArkivWalletClient } from "@arkiv-network/sdk";
import { localhost, rabdi } from "@arkiv-network/sdk/chains";
import { createSdkBackend, createStore } from "@safe-whistle/arkiv-store";
import { createReader, type EnsReadClient } from "@safe-whistle/ens-client";
import { guardedFetch, RPC_TRANSPORT } from "@safe-whistle/network-policy";
import { createFileNullifierStore, createRpContextSigner, createSimulatedVerifier, createSubmissionGate, createWorldVerifier, type Verifier } from "@safe-whistle/worldid-gate";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { createRelayerApp } from "./app.ts";
import { createRateLimiter } from "./ratelimit.ts";
import type { Config } from "./config.ts";
import { createRenewalJob } from "./renewal.ts";
import type { Logger } from "./types.ts";

export type ComposeOverrides = { verifier?: Verifier; fetch?: typeof fetch; now?: () => Date; logger?: Logger; sleep?: (ms: number) => Promise<void> };

/** JSON-lines logger to stdout: only route, status and code. Never IP, headers, body or proof. */
export const stdoutLogger: Logger = {
  info: (e) => process.stdout.write(JSON.stringify({ level: "info", ...e }) + "\n"),
  error: (e) => process.stdout.write(JSON.stringify({ level: "error", ...e }) + "\n"),
};

/** Wires the real packages. All network access goes through the host policy (`guardedFetch`). */
export function composeRelayer(config: Config, overrides: ComposeOverrides = {}) {
  const logger = overrides.logger ?? stdoutLogger;
  const guarded = guardedFetch(config.networkPolicy, overrides.fetch ?? globalThis.fetch);

  const ens = createPublicClient({ chain: sepolia, transport: http(config.sepoliaRpcUrl, { fetchFn: guarded, ...RPC_TRANSPORT }) });
  const reader = createReader({ client: ens as unknown as EnsReadClient });

  const isLocal = new URL(config.arkivRpcUrl).protocol === "http:";
  const chain = isLocal ? { ...localhost, rpcUrls: { default: { http: [config.arkivRpcUrl] } } } : rabdi({ accessKey: config.arkivAccessKey ?? "" });
  const transport = http(isLocal ? config.arkivRpcUrl : undefined, { fetchFn: guarded, ...RPC_TRANSPORT });
  const account = privateKeyToAccount(config.relayerPrivateKey as Hex);
  const backend = createSdkBackend({
    publicClient: createArkivPublicClient({ chain: chain as never, transport }),
    walletClient: createArkivWalletClient({ chain: chain as never, transport, account }),
  });
  const store = createStore(backend);

  const verifier = overrides.verifier ?? (config.simulateWorld ? createSimulatedVerifier() : createWorldVerifier({ rpId: config.rpId, fetch: guarded }));
  const gate = createSubmissionGate({ expectedEnvironment: config.environment, verifier, store: createFileNullifierStore(config.nullifierFile) });
  const signer = createRpContextSigner({ signingKeyHex: config.rpSigningKey, rpId: config.rpId });
  const day = 24 * 3600;

  const app = createRelayerApp({
    reader, store, gate, signer, logger, now: overrides.now ?? (() => new Date()), appId: config.appId, environment: config.environment,
    limiter: createRateLimiter({ perMinute: config.rateLimitPerMinute, now: () => Date.now() }), maxBodyBytes: config.maxBodyBytes, retentionSeconds: config.retentionDays * day, allowedOrigins: config.allowedOrigins,
  });
  const renewal = createRenewalJob({
    store, newsrooms: config.newsrooms, withinSeconds: config.renewWithinDays * day, retentionSeconds: config.retentionDays * day,
    sleep: overrides.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))), logger,
  });
  return { app, renewal, store, backend };
}
