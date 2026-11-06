export type StoreErrorCode = "input" | "too_large" | "not_found";

export class StoreError extends Error {
  constructor(public readonly code: StoreErrorCode, message: string) {
    super(message);
    this.name = "StoreError";
  }
}
