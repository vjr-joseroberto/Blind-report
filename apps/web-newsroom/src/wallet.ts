// Wallet adapter over the EIP-1193 standard (MetaMask and similar). Injected browser wallet only:
// no third-party services. Receives the provider by injection, to test with a fake wallet in Node.
import { toHex, type Address, type Hex } from "viem";

export type Eip1193 = {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on?(event: string, handler: (...args: any[]) => void): void;
  removeListener?(event: string, handler: (...args: any[]) => void): void;
};

export type ChainSpec = {
  chainId: Hex;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
};

export type WalletErrorCode = "no_wallet" | "user_rejected" | "wallet_error";

export class WalletError extends Error {
  constructor(public readonly code: WalletErrorCode, message: string) {
    super(message);
    this.name = "WalletError";
  }
}

export const SEPOLIA_SPEC: ChainSpec = {
  chainId: "0xaa36a7",
  chainName: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
  blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

type ViemChain = {
  id: number;
  name: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: { default: { http: readonly string[] } };
  blockExplorers?: { default: { url: string } };
};

export function chainSpecFromViem(c: ViemChain): ChainSpec {
  return {
    chainId: `0x${c.id.toString(16)}`,
    chainName: c.name,
    nativeCurrency: c.nativeCurrency,
    rpcUrls: [...c.rpcUrls.default.http],
    blockExplorerUrls: c.blockExplorers ? [c.blockExplorers.default.url] : [],
  };
}

export function pickProvider(candidates: Eip1193[]): Eip1193 {
  const first = candidates[0];
  if (!first) throw new WalletError("no_wallet", "No wallet found. Install MetaMask (or another browser wallet) and reload the page.");
  return first;
}

const REJECTED = "You rejected the request in the wallet.";
function translate(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  const code = (e as { code?: number })?.code;
  if (code === 4001) return new WalletError("user_rejected", REJECTED);
  return new WalletError("wallet_error", "The wallet rejected or could not complete the request.");
}

export function createWallet(provider: Eip1193) {
  const ask = async (method: string, params?: unknown): Promise<unknown> => {
    try {
      return await provider.request({ method, params });
    } catch (e) {
      throw translate(e);
    }
  };

  async function switchTo(spec: ChainSpec): Promise<void> {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: spec.chainId }] });
    } catch (e) {
      if ((e as { code?: number })?.code !== 4902) throw translate(e);
      await ask("wallet_addEthereumChain", [spec]); // the wallet does not know the network: ask to add it
      await ask("wallet_switchEthereumChain", [{ chainId: spec.chainId }]);
    }
  }

  return {
    async connect(): Promise<Address> {
      const accounts = (await ask("eth_requestAccounts")) as Address[];
      if (!accounts[0]) throw new WalletError("wallet_error", "The wallet did not return any account.");
      return accounts[0];
    },

    async ensureChain(spec: ChainSpec): Promise<void> {
      const current = String(await ask("eth_chainId")).toLowerCase();
      if (current !== spec.chainId.toLowerCase()) await switchTo(spec);
    },

    async signMessage(address: Address, message: string): Promise<Hex> {
      return (await ask("personal_sign", [toHex(message), address])) as Hex;
    },

    watch(h: { onAccounts: (accounts: string[]) => void; onChain: (chainId: string) => void }): () => void {
      provider.on?.("accountsChanged", h.onAccounts);
      provider.on?.("chainChanged", h.onChain);
      return () => {
        provider.removeListener?.("accountsChanged", h.onAccounts);
        provider.removeListener?.("chainChanged", h.onChain);
      };
    },
  };
}

export type Wallet = ReturnType<typeof createWallet>;
export type SentTx = { hash: Hex; chainId: string };

/**
 * Provider that guarantees the right network before viem asks for the network or sends a transaction, and reports each transaction sent.
 * This way ENS (Sepolia) and Arkiv (Rabdi) use the same wallet, each on its own network.
 */
export function withChain(provider: Eip1193, wallet: Wallet, spec: ChainSpec, onTx?: (tx: SentTx) => void): Eip1193 {
  return {
    ...provider,
    async request(args) {
      if (args.method === "eth_chainId" || args.method === "eth_sendTransaction") await wallet.ensureChain(spec);
      try {
        const result = await provider.request(args);
        if (args.method === "eth_sendTransaction" && typeof result === "string") onTx?.({ hash: result as Hex, chainId: spec.chainId });
        return result;
      } catch (e) {
        throw translate(e);
      }
    },
  };
}
