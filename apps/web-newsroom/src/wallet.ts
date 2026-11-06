// Adaptador de carteira sobre o padrão EIP-1193 (MetaMask e semelhantes). Só carteira injetada no navegador:
// nada de serviços de terceiros. Recebe o provedor por injeção, para testar com uma carteira falsa em Node.
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
  if (!first) throw new WalletError("no_wallet", "Nenhuma carteira encontrada. Instale a MetaMask (ou outra carteira de navegador) e recarregue a página.");
  return first;
}

const REJECTED = "Você recusou o pedido na carteira.";
function translate(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  const code = (e as { code?: number })?.code;
  if (code === 4001) return new WalletError("user_rejected", REJECTED);
  return new WalletError("wallet_error", "A carteira recusou ou não conseguiu concluir o pedido.");
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
      await ask("wallet_addEthereumChain", [spec]); // a carteira não conhece a rede: pede para adicionar
      await ask("wallet_switchEthereumChain", [{ chainId: spec.chainId }]);
    }
  }

  return {
    async connect(): Promise<Address> {
      const accounts = (await ask("eth_requestAccounts")) as Address[];
      if (!accounts[0]) throw new WalletError("wallet_error", "A carteira não devolveu nenhuma conta.");
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
 * Provedor que garante a rede certa antes de o viem perguntar a rede ou enviar uma transação, e avisa cada transação enviada.
 * Assim o ENS (Sepolia) e o Arkiv (Rabdi) usam a mesma carteira, cada um na sua rede.
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
