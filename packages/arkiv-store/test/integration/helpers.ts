import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { localhost } from "@arkiv-network/sdk/chains";
import { http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSdkBackend, type Backend } from "../../src/index.ts";

export const ARKIV_RPC = process.env.ARKIV_LOCAL_RPC ?? "http://127.0.0.1:8546";
// Conta pré-financiada do nó de desenvolvimento do Arkiv (chave de teste pública).
const FUNDER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;

const transport = http(ARKIV_RPC);
export const publicClient = createPublicClient({ chain: localhost, transport });
const wallet = (key: Hex) => createWalletClient({ chain: localhost, transport, account: privateKeyToAccount(key) });

/** Conta nova e financiada, ligada a um Backend real. */
export async function newBackend(): Promise<Backend> {
  const w = wallet(generatePrivateKey());
  const funder = wallet(FUNDER);
  await publicClient.waitForTransactionReceipt({ hash: await funder.sendTransaction({ to: w.account!.address, value: 10n ** 18n }) });
  return createSdkBackend({ publicClient, walletClient: w });
}

export const sleep = (seconds: number) => new Promise<void>((r) => setTimeout(r, seconds * 1000));
