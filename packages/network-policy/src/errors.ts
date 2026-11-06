/** O host da requisição não está na lista declarada. */
export class HostNotAllowedError extends Error {
  constructor(public readonly host: string, public readonly url: string) {
    super(`Host não permitido pela política de rede: ${host}`);
    this.name = "HostNotAllowedError";
  }
}

/** A configuração de rede é inválida ou tenta algo que o projeto não permite. */
export class InvalidNetworkConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNetworkConfigError";
  }
}
