import type { Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Eip1193 } from "../src/wallet.ts";

/** Fake wallet (EIP-1193), without a browser: really signs with a local viem account. */
export function fakeWallet(opts: { account?: PrivateKeyAccount; chainId?: string; known?: string[]; reject?: string[]; noAddPopup?: boolean } = {}) {
  const account = opts.account ?? privateKeyToAccount(("0x" + "11".repeat(32)) as Hex);
  const state = { chainId: opts.chainId ?? "0x1", known: new Set(opts.known ?? ["0x1", "0xaa36a7"]), account };
  const calls: { method: string; params?: unknown }[] = [];
  const listeners = new Map<string, ((...a: any[]) => void)[]>();
  let tx = 0;
  const err = (code: number, message: string) => Object.assign(new Error(message), { code });

  const provider: Eip1193 = {
    async request({ method, params }) {
      calls.push({ method, params });
      if (opts.reject?.includes(method)) throw err(4001, "User rejected the request.");
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [state.account.address];
        case "eth_chainId":
          return state.chainId;
        case "wallet_switchEthereumChain": {
          const id = (params as any[])[0].chainId as string;
          if (!state.known.has(id)) throw err(4902, "Unrecognized chain ID");
          state.chainId = id;
          return null;
        }
        case "wallet_addEthereumChain":
          state.known.add((params as any[])[0].chainId);
          return null;
        case "personal_sign": {
          const [hex] = params as [Hex, string];
          return state.account.signMessage({ message: { raw: hex } });
        }
        case "eth_sendTransaction":
          return ("0x" + (++tx).toString(16).padStart(64, "0")) as Hex;
        default:
          throw err(-32601, `unsupported method: ${method}`);
      }
    },
    on(event, handler) {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    },
    removeListener(event, handler) {
      listeners.set(event, (listeners.get(event) ?? []).filter((h) => h !== handler));
    },
  };
  return { provider, state, calls, emit: (event: string, ...a: unknown[]) => (listeners.get(event) ?? []).forEach((h) => h(...a)), listenerCount: (e: string) => (listeners.get(e) ?? []).length };
}
