export type NewsroomErrorCode =
  | "no_newsroom" | "invalid_input" | "invalid_backup" | "wrong_password"
  | "missing_key" | "cannot_decrypt" | "invalid_network";

/** Error with a readable cause. The message never carries keys or the content of the tips. */
export class NewsroomError extends Error {
  constructor(public readonly code: NewsroomErrorCode, message: string) {
    super(message);
    this.name = "NewsroomError";
  }
}
