import { createPublicClient, createTestClient, createWalletClient, http, parseEther, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export const FORK_RPC = process.env.SEPOLIA_FORK_RPC ?? "http://127.0.0.1:8545";

export const publicClient = createPublicClient({ chain: sepolia, transport: http(FORK_RPC) });
export const testClient = createTestClient({ mode: "anvil", chain: sepolia, transport: http(FORK_RPC) });

/** Carteira nova, com saldo, só para este teste. */
export async function newWallet() {
  const account = privateKeyToAccount(generatePrivateKey());
  await testClient.setBalance({ address: account.address, value: parseEther("100") });
  return { account, walletClient: createWalletClient({ account, chain: sepolia, transport: http(FORK_RPC) }), address: account.address as Address };
}

/** No fork, "esperar" é avançar o relógio da rede. */
export async function advance(seconds: number): Promise<void> {
  await testClient.increaseTime({ seconds });
  await testClient.mine({ blocks: 1 });
}

export const uniqueLabel = (prefix = "sw") => `${prefix}${Date.now().toString(36).slice(-6)}${Math.floor(Math.random() * 1000).toString(36)}`;
export type { Hex };
