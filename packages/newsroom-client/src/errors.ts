export type NewsroomErrorCode =
  | "no_newsroom" | "invalid_input" | "invalid_backup" | "wrong_password"
  | "missing_key" | "cannot_decrypt" | "invalid_network";

/** Erro com causa legível. A mensagem nunca traz chaves nem o conteúdo das denúncias. */
export class NewsroomError extends Error {
  constructor(public readonly code: NewsroomErrorCode, message: string) {
    super(message);
    this.name = "NewsroomError";
  }
}
