import { verifyMessage, type Address, type Hex } from "viem";

export type Challenge = { message: string; nonce: string; address: Address; domain: string; issuedAt: number; expiresAt: number };
export type LoginResult = { ok: true } | { ok: false; reason: "expired" | "reused" | "unknown" | "bad_signature" };

const DEFAULT_TTL_SECONDS = 300;

/** Entrada com a carteira: a pessoa assina um texto (sem gás, sem transação) que prova o controle do endereço. A redação é escolhida depois. */
export function createLogin(opts: { now: () => Date; ttlSeconds?: number; random?: (n: number) => Uint8Array }) {
  const ttl = (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
  const random = opts.random ?? ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
  const pending = new Map<string, Challenge>();
  const used = new Set<string>();

  return {
    challenge(a: { domain: string; address: Address }): Challenge {
      const nonce = "0x" + [...random(16)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const issuedAt = opts.now().getTime();
      const expiresAt = issuedAt + ttl;
      const message = [
        "Safe Whistle — entrar no painel da redação",
        "",
        `Site: ${a.domain}`,
        `Endereço: ${a.address}`,
        `Número: ${nonce}`,
        `Emitida em: ${new Date(issuedAt).toISOString()}`,
        `Válida até: ${new Date(expiresAt).toISOString()}`,
        "",
        "Esta assinatura não custa gás e não autoriza nenhuma transação.",
      ].join("\n");
      const c: Challenge = { message, nonce, address: a.address, domain: a.domain, issuedAt, expiresAt };
      pending.set(nonce, c);
      return c;
    },

    async verify(nonce: string, signature: Hex): Promise<LoginResult> {
      if (used.has(nonce)) return { ok: false, reason: "reused" };
      const c = pending.get(nonce);
      if (!c) return { ok: false, reason: "unknown" };
      if (opts.now().getTime() > c.expiresAt) return { ok: false, reason: "expired" };
      let valid = false;
      try {
        valid = await verifyMessage({ address: c.address, message: c.message, signature });
      } catch {
        valid = false;
      }
      if (!valid) return { ok: false, reason: "bad_signature" };
      used.add(nonce);
      pending.delete(nonce);
      return { ok: true };
    },
  };
}
