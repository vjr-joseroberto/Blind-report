export type CryptoErrorCode = "recipients" | "key" | "input" | "not_recipient" | "decrypt" | "format";

export class CryptoError extends Error {
  constructor(public readonly code: CryptoErrorCode, message: string) {
    super(message);
    this.name = "CryptoError";
  }
}
