/** Dados autenticados: trocar redação, versão da chave ou categoria invalida a abertura. */
export function aadOf(newsroom: string, pubkeyVersion: number, category: string): Uint8Array {
  return new TextEncoder().encode(`${newsroom}|${pubkeyVersion}|${category}`);
}
