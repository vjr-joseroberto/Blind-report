export class InvalidNameError extends Error {
  constructor(name: string, why = "") {
    super(`Invalid ENS name: "${name}"${why ? ` (${why})` : ""}`);
    this.name = "InvalidNameError";
  }
}

export type RecordsErrorCode = "pubkey" | "version" | "policy" | "relayer" | "custodian" | "readerkey";

/** A newsroom text or address record is missing or invalid. */
export class RecordsError extends Error {
  constructor(public readonly code: RecordsErrorCode, message: string) {
    super(message);
    this.name = "RecordsError";
  }
}

/** The name has none of the expected records. */
export class NewsroomNotFoundError extends Error {
  constructor(name: string) {
    super(`No newsroom found for the name "${name}".`);
    this.name = "NewsroomNotFoundError";
  }
}
