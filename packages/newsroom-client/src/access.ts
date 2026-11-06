import { isNewsroomName } from "@safe-whistle/core";
import { NewsroomNotFoundError, RecordsError, type NewsroomInfo } from "@safe-whistle/ens-client";
import type { Address } from "viem";

export type Role = "admin" | "journalist" | "visitor";
export type VisitorReason = "newsroom_not_found" | "name_taken" | "newsroom_misconfigured" | "name_required" | "journalist_inactive" | "wrong_wallet" | "invalid_name";

export type Access =
  | { role: "admin"; newsroom: string }
  | { role: "journalist"; newsroom: string; journalistName: string }
  | { role: "visitor"; newsroom: string; reason: VisitorReason; message: string };

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const visitor = (newsroom: string, reason: VisitorReason, message: string): Access => ({ role: "visitor", newsroom, reason, message });

/** Descobre o papel da carteira conectada, só com o que o ENS diz. Falha de rede não vira papel: a exceção sobe. */
export async function detectRole(a: {
  address: Address;
  newsroom: string;
  /** Nome de jornalista (`maria` ou `maria.redacao.eth`); só necessário para quem não é o administrador. */
  journalist?: string;
  reader: { resolveNewsroom(name: string): Promise<Pick<NewsroomInfo, "custodian">>; journalistOwner(name: string): Promise<Address | null>; isNameAvailable?(name: string): Promise<boolean> };
}): Promise<Access> {
  const newsroom = a.newsroom;
  if (!isNewsroomName(newsroom)) return visitor(newsroom, "invalid_name", "Use o nome da redação no formato nome.eth, em minúsculas.");

  let custodian: string;
  try {
    custodian = (await a.reader.resolveNewsroom(newsroom)).custodian.toLowerCase();
  } catch (e) {
    if (e instanceof NewsroomNotFoundError) {
      // Só oferece o cadastro se o nome está livre. Se já está registrado, a leitura pode ter falhado ou o nome é de outra pessoa.
      if (a.reader.isNameAvailable && /^[^.]+\.eth$/.test(newsroom) && !(await a.reader.isNameAvailable(newsroom))) {
        return visitor(newsroom, "name_taken", `O nome ${newsroom} já está registrado no ENS, mas não tem os dados de uma redação do Safe Whistle (ou a leitura falhou agora). Tente de novo em instantes; se o nome é de outra pessoa, escolha outro.`);
      }
      return visitor(newsroom, "newsroom_not_found", "Esta redação ainda não existe no ENS. Se ela é sua, cadastre-a agora.");
    }
    if (e instanceof RecordsError) return visitor(newsroom, "newsroom_misconfigured", "A redação publicou registros inválidos no ENS. O administrador precisa corrigi-los.");
    throw e;
  }
  if (a.address.toLowerCase() === custodian) return { role: "admin", newsroom };

  const raw = a.journalist?.trim().toLowerCase();
  if (!raw) return visitor(newsroom, "name_required", "Esta carteira não é a do administrador. Se você é jornalista da redação, informe o seu nome (ex.: maria).");
  const suffix = `.${newsroom}`;
  const label = raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw;
  if (!LABEL_RE.test(label)) return visitor(newsroom, "invalid_name", `O nome de jornalista deve ser como "maria" ou "maria${suffix}".`);

  const journalistName = `${label}${suffix}`;
  const owner = await a.reader.journalistOwner(journalistName);
  if (owner === null) return visitor(newsroom, "journalist_inactive", `${journalistName} não está ativo nesta redação (nunca foi cadastrado ou foi revogado). Fale com o administrador.`);
  if (owner.toLowerCase() !== a.address.toLowerCase()) return visitor(newsroom, "wrong_wallet", `${journalistName} pertence a outra carteira. Troque de conta na carteira e tente de novo.`);
  return { role: "journalist", newsroom, journalistName };
}

/** Tudo que o painel faz, para o código recusar fora do papel (a regra vale no código, não só na tela). */
export const ACTIONS = [
  "register_newsroom", "read_inbox", "decrypt", "set_status", "reply", "renew", "reader_key", "import_shared_keyring",
  "manage_team", "rotate_key", "edit_policy", "backup",
] as const;
export type Action = (typeof ACTIONS)[number];

const JOURNALIST_ACTIONS: readonly Action[] = ["read_inbox", "decrypt", "set_status", "reply", "renew", "reader_key", "import_shared_keyring"];

export function canDo(role: Role, action: Action): boolean {
  if (role === "admin") return true;
  if (role === "journalist") return JOURNALIST_ACTIONS.includes(action);
  return action === "register_newsroom";
}
