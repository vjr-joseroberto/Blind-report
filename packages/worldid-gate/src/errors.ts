export type GateErrorCode = "config";

/** Invalid gate configuration (signing key, rp_id...). The message never includes the value received. */
export class GateError extends Error {
  constructor(public readonly code: GateErrorCode, message: string) {
    super(message);
    this.name = "GateError";
  }
}
