// Sessão do painel: conectar a carteira, assinar a mensagem de entrada e, depois, escolher a redação e descobrir o papel.
// Só em memória. Conectar e escolher a redação são passos separados: quem ainda não tem redação conecta e cadastra uma.
import { detectRole, type Access, type createLogin } from "@safe-whistle/newsroom-client";
import type { Address } from "viem";
import { WalletError, type ChainSpec, type Wallet } from "./wallet.ts";

type Login = ReturnType<typeof createLogin>;
type Reader = Parameters<typeof detectRole>[0]["reader"];

export type Target = { newsroom: string; journalist?: string };
export type SessionState = {
  /** `connected`: carteira provada, ainda sem redação escolhida. */
  status: "idle" | "connecting" | "signing" | "connected" | "ready" | "error";
  address?: Address;
  access?: Access;
  error?: { code: string; message: string };
  target?: Target;
};

const LOGIN_MESSAGES: Record<string, string> = {
  expired: "O pedido de assinatura expirou. Entre de novo.",
  reused: "Este pedido de assinatura já foi usado. Entre de novo.",
  unknown: "Pedido de assinatura desconhecido. Entre de novo.",
  bad_signature: "A assinatura não confere com a carteira conectada. Entre de novo.",
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

  const NETWORK_ERROR = { code: "network", message: "Não foi possível consultar o ENS agora. Verifique a conexão e tente de novo." };

  /** `keepSession`: numa reavaliação (ex.: depois de cadastrar), falha de rede NÃO derruba a sessão nem o painel. */
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

    /** Conecta a carteira, troca de rede e prova o controle do endereço com uma assinatura. Não exige redação. */
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
          set({ status: "error", error: { code: "bad_login", message: LOGIN_MESSAGES[verified.reason] ?? "Não foi possível confirmar a assinatura." } });
          return;
        }
        stopWatching = deps.wallet.watch({
          onAccounts: (accounts) => {
            if (accounts[0]?.toLowerCase() === address.toLowerCase()) return;
            stop();
            set({ status: "idle", error: { code: "account_changed", message: "A conta mudou na carteira. Entre de novo para reavaliar o seu papel." } });
          },
          onChain: () => {},
        });
        set({ status: "connected", address });
      } catch (e) {
        if (e instanceof WalletError) set({ status: "error", error: { code: e.code, message: e.message } });
        else set({ status: "error", error: { code: "unexpected", message: "Algo deu errado ao conectar a carteira. Tente de novo." } });
      }
    },

    /** Escolhe (ou troca) a redação, sem assinar de novo. Se ela não existe, o resultado oferece cadastrá-la. */
    async choose(target: Target): Promise<void> {
      if (!state.address || (state.status !== "connected" && state.status !== "ready")) return;
      await evaluate(state.address, target);
    },

    /** Volta à escolha da redação (mantém a carteira conectada). */
    leaveNewsroom(): void {
      if (!state.address || (state.status !== "connected" && state.status !== "ready")) return;
      set({ status: "connected", address: state.address });
    },

    /** Reavalia o papel (por exemplo, depois de cadastrar a redação). */
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
