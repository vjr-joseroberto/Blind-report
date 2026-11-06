export class InvalidNameError extends Error {
  constructor(name: string, why = "") {
    super(`Nome ENS inválido: "${name}"${why ? ` (${why})` : ""}`);
    this.name = "InvalidNameError";
  }
}

export type RecordsErrorCode = "pubkey" | "version" | "policy" | "relayer" | "custodian" | "readerkey";

/** Um registro de texto ou de endereço da redação está ausente ou inválido. */
export class RecordsError extends Error {
  constructor(public readonly code: RecordsErrorCode, message: string) {
    super(message);
    this.name = "RecordsError";
  }
}

/** O nome não tem nenhum dos registros esperados. */
export class NewsroomNotFoundError extends Error {
  constructor(name: string) {
    super(`Nenhuma redação encontrada para o nome "${name}".`);
    this.name = "NewsroomNotFoundError";
  }
}
