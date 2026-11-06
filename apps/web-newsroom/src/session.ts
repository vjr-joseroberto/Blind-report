// Panel session: connect the wallet, sign the login message and then choose the newsroom and discover the role.
// In memory only. Connecting and choosing the newsroom are separate steps: whoever does not have a newsroom yet connects and registers one.
import { detectRole, type Access, type createLogin } from "@safe-whistle/newsroom-client";
import type { Address } from "viem";
import { WalletError, type ChainSpec, type Wallet } from "./wallet.ts";

type Login = ReturnType<typeof createLogin>;
type Reader = Parameters<typeof detectRole>[0]["reader"];

export type Target = { newsroom: string; journalist?: string };
export type SessionState = {
  /** `connected`: wallet proven, no newsroom chosen yet. */
  status: "idle" | "connecting" | "signing" | "connected" | "ready" | "error";
  address?: Address;
  access?: Access;
  error?: { code: string; message: string };
  target?: Target;
};

const LOGIN_MESSAGES: Record<string, string> = {
  expired: "The signing request expired. Sign in again.",
  reused: "This signing request has already been used. Sign in again.",
  unknown: "Unknown signing request. Sign in again.",
  bad_signature: "The signature does not match the connected wallet. Sign in again.",
};

export function createSession(deps: { wallet: Wallet; login: Login; reader: Reader; domain: string; chain: ChainSpec }) {
  let state: SessionState = { status: "idle" };
  let stopWatching: (() => void) | undefined;
  const listeners = new Set<(s: SessionState) => void>();
  const set = (s: SessionState) => {
    state = s;
    listeners.forEach((l) => l(state));
  };
  const stop = () => {
    stopWatching?.();
    stopWatching = undefined;
  };

  const NETWORK_ERROR = { code: "network", message: "Could not query ENS right now. Check your connection and try again." };

  /** `keepSession`: on a re-evaluation (e.g. after registering), a network failure does NOT bring down the session or the panel. */
  async function evaluate(address: Address, target: Target, keepSession = false) {
    try {
      set({ status: "ready", address, target, access: await detectRole({ address, newsroom: target.newsroom, journalist: target.journalist, reader: deps.reader }) });
    } catch {
      if (keepSession) set({ ...state, error: NETWORK_ERROR });
      else set({ status: "connected", address, target, error: NETWORK_ERROR });
    }
  }

  return {
    get state() {
      return state;
    },
    subscribe(fn: (s: SessionState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Connects the wallet, switches networks and proves control of the address with a signature. Does not require a newsroom. */
    async connect(): Promise<void> {
      stop();
      set({ status: "connecting" });
      try {
        const address = await deps.wallet.connect();
        await deps.wallet.ensureChain(deps.chain);
        set({ status: "signing", address });
        const challenge = deps.login.challenge({ domain: deps.domain, address });
        const signature = await deps.wallet.signMessage(address, challenge.message);
        const verified = await deps.login.verify(challenge.nonce, signature);
        if (!verified.ok) {
          set({ status: "error", error: { code: "bad_login", message: LOGIN_MESSAGES[verified.reason] ?? "Could not confirm the signature." } });
          return;
        }
        stopWatching = deps.wallet.watch({
          onAccounts: (accounts) => {
            if (accounts[0]?.toLowerCase() === address.toLowerCase()) return;
            stop();
            set({ status: "idle", error: { code: "account_changed", message: "The account changed in the wallet. Sign in again to re-evaluate your role." } });
          },
          onChain: () => {},
        });
        set({ status: "connected", address });
      } catch (e) {
        if (e instanceof WalletError) set({ status: "error", error: { code: e.code, message: e.message } });
        else set({ status: "error", error: { code: "unexpected", message: "Something went wrong connecting the wallet. Try again." } });
      }
    },

    /** Chooses (or switches) the newsroom, without signing again. If it does not exist, the result offers to register it. */
    async choose(target: Target): Promise<void> {
      if (!state.address || (state.status !== "connected" && state.status !== "ready")) return;
      await evaluate(state.address, target);
    },

    /** Goes back to choosing the newsroom (keeps the wallet connected). */
    leaveNewsroom(): void {
      if (!state.address || (state.status !== "connected" && state.status !== "ready")) return;
      set({ status: "connected", address: state.address });
    },

    /** Re-evaluates the role (for example, after registering the newsroom). */
    async refresh(): Promise<void> {
      if (state.status !== "ready" || !state.address || !state.target) return;
      await evaluate(state.address, state.target, true);
    },

    disconnect(): void {
      stop();
      set({ status: "idle" });
    },
  };
}
