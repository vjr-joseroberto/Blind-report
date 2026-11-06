export type GateErrorCode = "config";

/** Configuração inválida do portão (chave de assinatura, rp_id...). A mensagem nunca inclui o valor recebido. */
export class GateError extends Error {
  constructor(public readonly code: GateErrorCode, message: string) {
    super(message);
    this.name = "GateError";
  }
}
