import { createPublicClient as createArkivPublic, createWalletClient as createArkivWallet } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { createSdkBackend, createStore } from "@safe-whistle/arkiv-store";
import { fromBase64Url } from "@safe-whistle/core";
import { createAdmin, createReader, findLabelsMintedTo, type EnsReadClient, type LogClient } from "@safe-whistle/ens-client";
import { RPC_TRANSPORT, guardedFetch } from "@safe-whistle/network-policy";
import { createLogin, createNewsroomClient, listAdministered, newsroomNetworkPolicy, type Role } from "@safe-whistle/newsroom-client";
import { createPublicClient, createWalletClient, custom, http, type Address, type Hex } from "viem";
import { sepolia } from "viem/chains";
import { createPanelController, type PanelState } from "./controller.ts";
import { captureFields, download, h } from "./dom.ts";
import { addressLink, firstSteps, txLink } from "./links.ts";
import { browserNamesStore } from "./names.ts";
import { createSession, type SessionState } from "./session.ts";
import { SEPOLIA_SPEC, WalletError, chainSpecFromViem, createWallet, pickProvider, withChain, type ChainSpec, type Eip1193 } from "./wallet.ts";

type Config = { rpcUrl: string; arkivRpcUrl: string };
type Tab = "inicio" | "caixa" | "equipe" | "chaves" | "minhachave" | "retencao";
const STATUS_LABEL: Record<string, string> = { new: "novo", review: "em análise", verified: "verificado", discarded: "descartado" };
const DAY = 24 * 3600;
const TABS: Record<Exclude<Role, "visitor">, [Tab, string][]> = {
  admin: [["inicio", "Início"], ["caixa", "Caixa de entrada"], ["equipe", "Equipe"], ["chaves", "Chaves e política"], ["retencao", "Retenção"]],
  journalist: [["caixa", "Caixa de entrada"], ["minhachave", "Minha chave"], ["retencao", "Retenção"]],
};

/** Carteiras injetadas no navegador (EIP-6963), com `window.ethereum` como alternativa. Nenhum serviço de terceiros. */
function discoverProviders(): Promise<Eip1193[]> {
  return new Promise((resolve) => {
    const found: Eip1193[] = [];
    const onAnnounce = (e: Event) => {
      const p = (e as CustomEvent<{ provider: Eip1193 }>).detail?.provider;
      if (p) found.push(p);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      const legacy = (window as unknown as { ethereum?: Eip1193 }).ethereum;
      resolve(found.length > 0 ? found : legacy ? [legacy] : []);
    }, 150);
  });
}

/** Botão de duas etapas para ações pesadas: o primeiro clique mostra o efeito, o segundo confirma. */
function confirmButton(label: string, warning: string, onConfirm: () => void, disabled = false): HTMLElement {
  const note = h("p", { className: "alert", hidden: true }, warning);
  const btn = h("button", { disabled }, label);
  let armed = false;
  btn.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      note.hidden = false;
      btn.textContent = `Confirmar: ${label}`;
      return;
    }
    armed = false;
    note.hidden = true;
    btn.textContent = label;
    onConfirm();
  });
  return h("div", {}, btn, note);
}

async function start() {
  const root = document.getElementById("app")!;
  const config: Config = await (await fetch("config.json")).json();
  const guarded = guardedFetch(newsroomNetworkPolicy(config));

  let tab: Tab = "inicio";
  let panel: ReturnType<typeof build> | undefined;
  /** Um painel (com as chaves, só em memória) por redação aberta nesta sessão: trocar de redação não perde as chaves. */
  const panels = new Map<string, ReturnType<typeof build>>();
  const names = browserNamesStore(); // só nomes de redações, nunca chaves
  let mine: { loading: boolean; newsrooms: string[]; incomplete: boolean } | undefined;
  let mineFor = "";
  let provider: Eip1193 | undefined;
  let form = { newsroom: "", journalist: "", arkivKey: "" };
  let walletError: string | undefined;
  let readerKey: { publicKey: string; privateKey: string } | undefined;
  let readerKeyMade = false;
  let teamAdded = false;

  const ens = createPublicClient({ chain: sepolia, transport: http(config.rpcUrl, { fetchFn: guarded, ...RPC_TRANSPORT }) });
  const reader = createReader({ client: ens as unknown as EnsReadClient });
  const login = createLogin({ now: () => new Date() });
  let specs: Record<string, ChainSpec> = { [SEPOLIA_SPEC.chainId]: SEPOLIA_SPEC };

  // A sessão precisa da carteira escolhida: esta é só a inicial (sem sessão); `connect` cria a definitiva.
  let activeSession = createSession({ wallet: undefined as never, login, reader, domain: location.host, chain: SEPOLIA_SPEC });

  function build(address: Address, wallet: ReturnType<typeof createWallet>, p: Eip1193, authorName?: string) {
    const rabdiChain = rabdi({ accessKey: form.arkivKey });
    const rabdiSpec = chainSpecFromViem(rabdiChain as never);
    specs = { [SEPOLIA_SPEC.chainId]: SEPOLIA_SPEC, [rabdiSpec.chainId]: rabdiSpec };
    let controller!: ReturnType<typeof createPanelController>;
    const onTx = (tx: { hash: Hex; chainId: string }) => controller.addTx(tx);
    const ensWallet = createWalletClient({ account: address, chain: sepolia, transport: custom(withChain(p, wallet, SEPOLIA_SPEC, onTx) as never) });
    const arkivTransport = http(undefined, { fetchFn: guarded, ...RPC_TRANSPORT });
    const store = createStore(createSdkBackend({
      publicClient: createArkivPublic({ chain: rabdiChain as never, transport: arkivTransport }),
      walletClient: createArkivWallet({ chain: rabdiChain as never, transport: custom(withChain(p, wallet, rabdiSpec, onTx) as never), account: address }),
    }));
    const client = createNewsroomClient({
      makeAdmin: (hooks) => createAdmin({ publicClient: ens as never, walletClient: ensWallet as never, wait: (s) => new Promise((r) => setTimeout(r, s * 1000)), onProgress: hooks.onProgress }),
      reader, store, account: address, now: () => new Date(), authorName,
    });
    controller = createPanelController(client);
    controller.subscribe(render);
    return { controller, client };
  }

  async function connect() {
    walletError = undefined;
    try {
      provider = pickProvider(await discoverProviders());
    } catch (e) {
      walletError = e instanceof WalletError ? e.message : "Não foi possível encontrar a carteira.";
      render();
      return;
    }
    const wallet = createWallet(provider);
    activeSession = createSession({ wallet, login, reader, domain: location.host, chain: SEPOLIA_SPEC });
    activeSession.subscribe((s) => {
      if (s.status === "ready" && s.address && s.access && provider) {
        const key = `${s.address}|${s.target?.newsroom}|${s.target?.journalist ?? ""}`;
        const authorName = s.access.role === "journalist" ? s.access.journalistName : undefined;
        let found = panels.get(key);
        if (!found) {
          found = build(s.address, wallet, provider, authorName);
          panels.set(key, found);
        }
        panel = found;
        panel.controller.setRole(s.access.role);
        tab = s.access.role === "journalist" ? "caixa" : "inicio";
        if (s.access.role !== "visitor") names.remember(s.address, { newsroom: s.access.newsroom, journalist: s.access.role === "journalist" ? s.access.journalistName.split(".")[0] : undefined });
      }
      if (s.status === "idle" || s.status === "connected") panel = undefined;
      if (s.status === "connected" && s.address && mineFor !== s.address) void loadMine(s.address);
      if (s.status === "idle") { mine = undefined; mineFor = ""; panels.clear(); }
      render();
    });
    await activeSession.connect();
  }

  const input = (id: string, props: Record<string, unknown> = {}) => h("input", { type: "text", id, autocomplete: "off", ...props });

  function connectView(s: SessionState): Node {
    const ak = input("ak", { type: "password", placeholder: "opcional", value: form.arkivKey });
    const busy = s.status === "connecting" || s.status === "signing";
    const msg = walletError ?? s.error?.message;
    return h("section", {},
      h("h2", {}, "Entrar com a carteira"),
      h("p", {}, "Sua carteira prova quem você é. Nenhuma chave privada é digitada aqui. Você escolhe ou cria a redação no próximo passo."),
      msg ? h("p", { className: "error", role: "alert" }, msg) : null,
      busy ? h("p", { className: "muted", role: "status" }, s.status === "signing" ? "Assine a mensagem na carteira (não custa gás)…" : "Conectando à carteira…") : null,
      h("label", { htmlFor: "ak" }, "Chave de acesso do Arkiv (opcional)"), ak,
      h("p", { className: "muted" }, "A chave do Arkiv entra no endereço da rede cadastrado na sua carteira. Sem ela, o endpoint público tem limite de taxa."),
      h("button", { disabled: busy, onclick: () => { form = { ...form, arkivKey: ak.value }; void connect(); } }, "Conectar carteira"),
      h("p", { className: "muted" }, "Somente testnet. A carteira pode pedir para trocar de rede."));
  }

  /** Redações que esta carteira administra: eventos do registry + confirmação no ENS. Pode ficar incompleta. */
  async function loadMine(address: Address) {
    mineFor = address;
    mine = { loading: true, newsrooms: [], incomplete: false };
    render();
    const r = await listAdministered({ address, find: () => findLabelsMintedTo({ client: ens as unknown as LogClient, address }), reader });
    if (mineFor !== address) return; // a conta mudou durante a busca
    mine = { loading: false, ...r };
    render();
  }

  function chooseView(s: SessionState): Node {
    const address = s.address!;
    const remembered = names.list(address);
    const adminRows = (mine?.newsrooms ?? []).filter((n) => !remembered.some((r) => r.newsroom === n && !r.journalist));
    const rows: { newsroom: string; journalist?: string; note: string }[] = [
      ...adminRows.map((n) => ({ newsroom: n, note: "administrador (achada na blockchain)" })),
      ...remembered.map((r) => ({ ...r, note: r.journalist ? `jornalista (${r.journalist})` : "aberta antes neste navegador" })),
    ];
    const nr = input("nr", { placeholder: "jornalista1.eth", value: form.newsroom });
    const jn = input("jn", { placeholder: "maria", value: form.journalist });
    const fresh = input("nw", { placeholder: "minharedacao.eth" });
    const open = (newsroom: string, journalist?: string) => { form = { ...form, newsroom, journalist: journalist ?? "" }; void activeSession.choose({ newsroom, journalist }); };
    return h("section", {},
      h("h2", {}, "Qual redação?"),
      h("p", { className: "muted" }, "Carteira conectada: ", linkAddr(SEPOLIA_SPEC, address)),
      s.error ? h("p", { className: "error", role: "alert" }, s.error.message) : null,
      h("div", { className: "card" }, h("h3", {}, "Minhas redações"),
        mine?.loading ? h("p", { className: "muted", role: "status" }, "Procurando as redações desta carteira na blockchain…") : null,
        rows.length === 0 && !mine?.loading ? h("p", { className: "muted" }, "Nenhuma redação encontrada para esta carteira. Crie uma abaixo ou digite o nome de uma que você já usa.") : null,
        rows.length > 0 ? h("ul", {}, ...rows.map((r) => h("li", {}, `${r.newsroom} · ${r.note} `, h("button", { onclick: () => open(r.newsroom, r.journalist) }, "Abrir")))) : null,
        mine?.incomplete ? h("p", { className: "alert" }, "A busca na blockchain pode estar incompleta (o RPC limita o intervalo). Se faltar alguma redação, digite o nome abaixo.") : null,
        h("button", { disabled: mine?.loading, onclick: () => void loadMine(address) }, "Atualizar a lista")),
      h("div", { className: "card" }, h("h3", {}, "Criar uma redação nova"),
        h("p", { className: "muted" }, "Escolha o nome .eth. Se estiver livre, o painel oferece o cadastro e você passa a ser o administrador."),
        h("label", { htmlFor: "nw" }, "Nome da nova redação"), fresh,
        h("button", { onclick: () => open(fresh.value.trim()) }, "Continuar")),
      h("div", { className: "card" }, h("h3", {}, "Entrar em outra redação"),
        h("label", { htmlFor: "nr" }, "Nome da redação (ENS)"), nr,
        h("label", { htmlFor: "jn" }, "Seu nome de jornalista (deixe vazio se você é o administrador)"), jn,
        h("button", { onclick: () => open(nr.value.trim(), jn.value.trim() || undefined) }, "Entrar")));
  }

  const errors = (p: PanelState) => [
    p.error ? h("p", { className: "error", role: "alert" }, p.error.message) : null,
    p.notice ? h("p", { className: "ok", role: "status" }, p.notice) : null,
    p.busy ? h("p", { className: "muted", role: "status" }, "Trabalhando…") : null,
    p.loading ? h("p", { className: "muted", role: "status" }, "Lendo da blockchain…") : null,
  ];

  function txList(p: PanelState): Node | null {
    if (p.txs.length === 0) return null;
    return h("details", {}, h("summary", {}, `Transações enviadas nesta sessão (${p.txs.length})`),
      h("ul", {}, ...p.txs.map((t) => {
        const url = specs[t.chainId] ? txLink(specs[t.chainId]!, t.hash) : undefined;
        return h("li", {}, `${specs[t.chainId]?.chainName ?? t.chainId}: `, url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, `${t.hash.slice(0, 12)}…`) : t.hash);
      })));
  }

  function visitorView(s: SessionState, p: PanelState): Node {
    const a = s.access!;
    if (a.role !== "visitor") return h("div", {});
    const label = input("lb", { placeholder: "investiga", value: s.target?.newsroom.replace(/\.eth$/, "") ?? "" });
    const cats = input("ct", { value: "saude, corrupcao" });
    const max = input("mx", { value: "100000" });
    const att = h("input", { type: "checkbox", id: "at" });
    return h("section", {}, h("h2", {}, a.reason === "newsroom_not_found" ? "Esta redação ainda não existe" : "Sem acesso a esta redação"), h("p", { className: "alert" }, a.message), ...errors(p),
      a.reason === "newsroom_not_found" ? h("div", { className: "card" },
        h("h3", {}, "Cadastrar uma redação nova"),
        p.progress ? h("p", { className: "muted", role: "status" }, p.progress.step === "commit_wait" ? `Aguardando o registro do nome no ENS (~${p.progress.seconds}s)…` : `Etapa: ${p.progress.step}. Confirme na carteira (${p.txCount} de 8 transações).`) : null,
        h("label", { htmlFor: "lb" }, "Nome (será nome.eth)"), label, h("label", { htmlFor: "ct" }, "Categorias (separadas por vírgula)"), cats,
        h("label", { htmlFor: "mx" }, "Tamanho máximo (bytes)"), max, h("label", { htmlFor: "at" }, "Aceitar anexos "), att,
        h("p", { className: "muted" }, "8 transações em alguns minutos; a carteira pedirá uma confirmação para cada."),
        h("button", { disabled: p.busy, onclick: async () => { await panel!.controller.register({ label: label.value.trim(), categories: cats.value.split(",").map((x) => x.trim()).filter(Boolean), maxBytes: Number(max.value), attachments: att.checked }); await activeSession.refresh(); } }, "Registrar redação")) : null,
      txList(p));
  }

  function stepsView(role: Role, p: PanelState): Node | null {
    const steps = firstSteps(role, { keysLoaded: p.keysLoaded, backupDone: p.backupDone, inboxLoaded: !!p.inbox, teamAdded, readerKeyMade });
    if (steps.length === 0 || steps.every((x) => x.done)) return null;
    const next = steps.find((x) => !x.done)!;
    return h("div", { className: "card" }, h("h3", {}, "Primeiros passos"),
      h("ul", { className: "steps" }, ...steps.map((x) => h("li", { className: `${x.done ? "done" : ""} ${x === next ? "next" : ""}` }, x.label))));
  }

  function importBackupBox(p: PanelState): Node {
    const blob = h("textarea", { id: "bk", placeholder: "Cole o backup" });
    const pw = input("bp", { type: "password" });
    return h("div", {}, h("label", { htmlFor: "bk" }, "Backup"), blob, h("label", { htmlFor: "bp" }, "Senha"), pw,
      h("button", { disabled: p.busy, onclick: () => panel!.controller.importBackup(blob.value.trim(), pw.value) }, "Importar backup"));
  }

  function inicioView(p: PanelState, s: SessionState): Node {
    const items = p.inbox?.items ?? [];
    const count = (st: string) => items.filter((i) => i.status === st).length;
    const alerts: string[] = [];
    if (!p.keysLoaded) alerts.push("As chaves que decifram as denúncias não estão carregadas nesta sessão. Se você acabou de cadastrar a redação, elas já estão. Se a redação já existia, importe o backup (aba Chaves e política); sem ele não há como abrir as denúncias antigas.");
    else if (!p.backupDone) alerts.push("Você ainda não gerou o backup das chaves nesta sessão.");
    if (p.ignoredAnnotations) alerts.push(`${p.ignoredAnnotations} anotação(ões) de status foram ignoradas por não terem sido escritas pela redação.`);
    return h("section", {}, h("h2", {}, `Redação ${s.access && "newsroom" in s.access ? s.access.newsroom : ""}`), ...errors(p),
      stepsView("admin", p),
      ...alerts.map((a) => h("p", { className: "alert" }, a)),
      h("div", { className: "card" }, h("h3", {}, "Resumo"),
        h("p", {}, `Chave: versão ${p.keyVersion ?? "—"} · Denúncias carregadas: ${items.length}`),
        p.inbox ? h("p", {}, `Novas: ${count("new")} · Em análise: ${count("review")} · Verificadas: ${count("verified")} · Descartadas: ${count("discarded")}`) : h("p", { className: "muted" }, "Abra a Caixa de entrada para carregar as denúncias.")),
      s.address ? h("p", { className: "muted" }, "Sua carteira: ", linkAddr(SEPOLIA_SPEC, s.address)) : null, txList(p));
  }
  const linkAddr = (spec: ChainSpec, a: string) => { const u = addressLink(spec, a); return u ? h("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, a) : a; };

  function caixaView(p: PanelState, role: Role): Node {
    const status = h("select", { id: "fs" }, h("option", { value: "" }, "todos"), ...Object.entries(STATUS_LABEL).map(([v, l]) => h("option", { value: v }, l)));
    const cat = input("fc", { placeholder: "categoria" });
    const reply = h("textarea", { id: "rp2" });
    const o = p.opened;
    return h("section", {}, h("h2", {}, "Caixa de entrada"), ...errors(p), stepsView(role, p),
      p.ignoredAnnotations ? h("p", { className: "alert" }, `${p.ignoredAnnotations} anotação(ões) de status ignorada(s): o autor não é da redação.`) : null,
      h("div", { className: "row" }, h("label", { htmlFor: "fs" }, "Status"), status, h("label", { htmlFor: "fc" }, "Categoria"), cat,
        h("button", { disabled: p.loading, onclick: () => panel!.controller.loadInbox({ status: (status.value || undefined) as never, category: cat.value.trim() || undefined }) }, "Atualizar")),
      p.inbox ? (p.inbox.items.length === 0 ? h("p", { className: "muted" }, "Nenhuma denúncia por aqui ainda. Quando alguém enviar, ela aparece depois de Atualizar.") :
        h("ul", {}, ...p.inbox.items.map((i) => h("li", {}, `${i.category} · ${STATUS_LABEL[i.status] ?? i.status} · bloco ${i.createdAtBlock} `, h("button", { onclick: () => panel!.controller.open(i.key) }, "Abrir"))))) :
        h("p", { className: "muted" }, "Clique em Atualizar para carregar as denúncias."),
      o ? h("article", { className: "card" }, h("h3", {}, `Denúncia (${o.category}) — ${STATUS_LABEL[o.status] ?? o.status}`), h("pre", {}, o.text),
        h("div", { className: "row" },
          o.attachment ? h("button", { onclick: () => downloadBytes(o.attachment!.name, o.attachment!.data) }, `Baixar anexo ${o.attachment.name}`) : null,
          h("button", { onclick: () => downloadBytes(`denuncia-${o.key.slice(2, 10)}.sw`, o.envelope) }, "Baixar envelope cifrado (.sw)")),
        h("div", { className: "row" }, ...Object.entries(STATUS_LABEL).map(([v, l]) => h("button", { onclick: () => panel!.controller.setStatus(o.key, v as never) }, `Marcar: ${l}`))),
        h("label", { htmlFor: "rp2" }, "Responder à fonte (só ela consegue ler)"), reply, h("button", { onclick: () => panel!.controller.reply(o.key, reply.value) }, "Enviar resposta")) : null,
      txList(p));
  }

  function equipeView(p: PanelState): Node {
    const label = input("jl", { placeholder: "maria" });
    const addr = input("ja", { placeholder: "0x…" });
    const rpub = input("jk", { placeholder: "chave de leitura pública (base64url)" });
    const rev = input("jr", { placeholder: "maria" });
    return h("section", {}, h("h2", {}, "Equipe"), ...errors(p), stepsView("admin", p),
      h("div", { className: "card" }, h("h3", {}, "1. Cadastrar jornalista"),
        h("p", { className: "muted" }, "A pessoa gera a própria chave de leitura (aba Minha chave do painel dela) e lhe envia só a pública."),
        h("label", { htmlFor: "jl" }, "Nome (maria → maria.sua-redacao.eth)"), label, h("label", { htmlFor: "ja" }, "Endereço da carteira dela"), addr, h("label", { htmlFor: "jk" }, "Chave de leitura pública"), rpub,
        h("button", { disabled: p.busy, onclick: async () => { await panel!.controller.addJournalist({ label: label.value.trim(), address: addr.value.trim() as Hex, readerPublicKey: fromBase64Url(rpub.value.trim()) }); teamAdded = true; } }, "Cadastrar (2 transações)")),
      h("div", { className: "card" }, h("h3", {}, "2. Entregar o chaveiro"),
        h("p", { className: "muted" }, "Cifra todas as chaves da redação para a chave pública acima. Envie o texto à pessoa por um canal seguro."),
        h("button", { disabled: p.busy, onclick: () => panel!.controller.shareKeyring(rpub.value.trim()) }, "Gerar chaveiro"),
        p.sharedText ? h("textarea", { readOnly: true, value: p.sharedText }) : null),
      h("div", { className: "card" }, h("h3", {}, "Revogar jornalista"), h("label", { htmlFor: "jr" }, "Nome"), rev,
        confirmButton("Revogar", "Isso remove o acesso no ENS, mas não desfaz chaves já entregues. Depois, gire a chave e entregue o novo chaveiro aos demais.", () => void panel!.controller.revokeJournalist(rev.value.trim()), p.busy)),
      txList(p));
  }

  /** Explica por que um botão que depende das chaves está desativado. */
  const needKeys = () => h("p", { className: "alert", role: "status" }, "Carregue as chaves primeiro: cadastre a redação nesta sessão ou importe um backup (mais abaixo nesta aba). Sem as chaves não há o que salvar.");

  function chavesView(p: PanelState): Node {
    const pw = input("ep", { type: "password" });
    const cats = input("pc", { placeholder: "saude, corrupcao" });
    const max = input("pm", { value: "100000" });
    const att = h("input", { type: "checkbox", id: "pa" });
    return h("section", {}, h("h2", {}, "Chaves e política"), ...errors(p), stepsView("admin", p),
      h("div", { className: "card" }, h("h3", {}, `Chave da redação (versão ${p.keyVersion ?? "—"})`),
        p.keysLoaded ? null : needKeys(),
        confirmButton("Girar a chave", "Publica uma chave nova no ENS. As denúncias antigas continuam abrindo, mas você precisa de um novo backup e de entregar o novo chaveiro aos jornalistas.", () => void panel!.controller.rotate(), p.busy || !p.keysLoaded)),
      h("div", { className: "card" }, h("h3", {}, "Política de recebimento"),
        p.keysLoaded ? null : needKeys(),
        h("label", { htmlFor: "pc" }, "Categorias (separadas por vírgula)"), cats, h("label", { htmlFor: "pm" }, "Tamanho máximo (bytes)"), max, h("label", { htmlFor: "pa" }, "Aceitar anexos "), att,
        h("button", { disabled: p.busy || !p.keysLoaded, onclick: () => panel!.controller.updatePolicy({ categories: cats.value.split(",").map((x) => x.trim()).filter(Boolean), maxBytes: Number(max.value), attachments: att.checked, epoch: "monthly" }) }, "Publicar política (1 transação)")),
      h("div", { className: "card" }, h("h3", {}, "Backup das chaves"), h("p", { className: "muted" }, "O backup é a cópia das chaves que decifram as denúncias, protegida pela senha que você escolher. A senha não é a chave; ela só protege o arquivo."), h("p", { className: "warn" }, "Sem o backup, fechar esta aba é perder o acesso às denúncias."),
        p.keysLoaded ? null : needKeys(),
        h("label", { htmlFor: "ep" }, "Senha do backup (mín. 8 caracteres)"), pw, h("button", { disabled: !p.keysLoaded, onclick: () => panel!.controller.exportBackup(pw.value) }, "Gerar backup"),
        p.backupText ? h("div", {}, h("button", { onclick: () => download("backup-safe-whistle.txt", p.backupText!) }, "Baixar backup"),
          h("p", { className: "muted" }, "Se o navegador bloquear o download, copie o texto abaixo e guarde-o em um arquivo seu."), h("textarea", { readOnly: true, value: p.backupText })) : null),
      h("div", { className: "card" }, h("h3", {}, "Importar backup"), importBackupBox(p)),
      txList(p));
  }

  function minhaChaveView(p: PanelState): Node {
    const blob = h("textarea", { id: "sh", placeholder: "Cole o chaveiro recebido" });
    return h("section", {}, h("h2", {}, "Minha chave"), ...errors(p), stepsView("journalist", p),
      h("div", { className: "card" }, h("h3", {}, "1. Gerar a minha chave de leitura"),
        h("p", { className: "muted" }, "Guarde a privada só com você. Envie a pública ao administrador."),
        h("button", { onclick: () => { readerKey = panel!.controller.newReaderKey(); readerKeyMade = !!readerKey; render(); } }, "Gerar"),
        readerKey ? h("div", {}, h("p", {}, "Pública (envie ao administrador):"), h("pre", {}, readerKey.publicKey), h("p", { className: "warn" }, "Privada (guarde só você):"), h("pre", {}, readerKey.privateKey)) : null),
      h("div", { className: "card" }, h("h3", {}, "2. Importar o chaveiro"),
        h("p", { className: "muted" }, p.keysLoaded ? "✔ Chaveiro carregado: você já pode abrir as denúncias." : "Cole o chaveiro que o administrador lhe enviou."),
        h("label", { htmlFor: "sh" }, "Chaveiro"), blob,
        h("button", { disabled: p.busy || !readerKey, onclick: () => panel!.controller.importShared(blob.value.trim(), readerKey!) }, "Importar chaveiro"),
        readerKey ? null : h("p", { className: "muted" }, "Gere a sua chave primeiro (passo 1).")),
      txList(p));
  }

  function retencaoView(p: PanelState): Node {
    return h("section", {}, h("h2", {}, "Retenção"), ...errors(p),
      h("p", { className: "muted" }, "Sem renovar, a denúncia some da cadeia (máximo de ~182 dias)."),
      h("button", { disabled: p.loading, onclick: () => panel!.controller.loadExpiring(30 * DAY) }, "Ver o que vence em 30 dias"),
      p.expiring ? h("p", {}, p.expiring.length === 0 ? "Nada vence nos próximos 30 dias." : `${p.expiring.length} denúncia(s) vencendo.`) : null,
      p.expiring?.length ? h("button", { disabled: p.busy, onclick: () => panel!.controller.renewAll(150 * DAY) }, "Renovar tudo (150 dias)") : null, txList(p));
  }

  /** Administrador com chaves carregadas e sem backup nesta sessão. */
  const unsaved = (p: PanelState, role: Role) => role === "admin" && p.keysLoaded && !p.backupDone;

  function render() {
    const restore = captureFields(root);
    draw();
    restore();
  }

  function draw() {
    const s = activeSession.state;
    const foot = h("footer", { className: "muted" }, `RPC: ${new URL(config.rpcUrl).hostname}. Para proteger sua rede, escolha por conta própria uma VPN ou outra proteção, fora deste aplicativo.`);
    const title = h("h1", {}, "Safe Whistle — Redação");
    if (s.status === "connected") {
      root.replaceChildren(h("main", {}, title, chooseView(s), foot));
      return;
    }
    if (s.status !== "ready" || !s.access || !panel) {
      root.replaceChildren(h("main", {}, title, connectView(s), foot));
      return;
    }
    const p = panel.controller.state;
    const access = s.access;
    const roleLabel = access.role === "admin" ? "Administrador" : access.role === "journalist" ? "Jornalista" : "Sem acesso";
    const who = h("div", { className: "who" },
      h("span", {}, `${access.role === "journalist" ? access.journalistName : access.newsroom}`, h("span", { className: `badge ${access.role}` }, roleLabel)),
      h("div", { className: "row" }, h("button", { onclick: () => activeSession.leaveNewsroom() }, "Trocar de redação"),
        unsaved(panel.controller.state, access.role)
          ? confirmButton("Sair", "Você ainda não gerou o backup. Ao sair, as chaves desta sessão são apagadas e as denúncias ficam ilegíveis. Clique de novo só se tiver certeza.", () => activeSession.disconnect())
          : h("button", { onclick: () => activeSession.disconnect() }, "Sair")));
    if (access.role === "visitor") {
      root.replaceChildren(h("main", {}, title, who, visitorView(s, p), foot));
      return;
    }
    const banner = unsaved(p, access.role)
      ? h("div", { className: "alert", role: "alert" }, h("strong", {}, "Gere o backup agora. "), "As chaves que decifram as denúncias existem só nesta aba. Sem o backup, fechar ou sair perde o acesso. ",
          h("button", { onclick: () => { tab = "chaves"; render(); } }, "Ir para o backup"))
      : null;
    const sessionError = s.error ? h("p", { className: "error", role: "alert" }, s.error.message) : null;
    const tabs = TABS[access.role];
    if (!tabs.some(([id]) => id === tab)) tab = tabs[0]![0];
    const nav = h("nav", { role: "tablist" }, ...tabs.map(([id, label]) => h("button", { role: "tab", "aria-selected": tab === id ? "true" : "false", onclick: () => { tab = id; render(); if ((id === "caixa" || id === "inicio") && !p.inbox && p.keysLoaded) void panel!.controller.loadInbox({}); } }, label)));
    const body = tab === "inicio" ? inicioView(p, s) : tab === "caixa" ? caixaView(p, access.role) : tab === "equipe" ? equipeView(p) : tab === "chaves" ? chavesView(p) : tab === "minhachave" ? minhaChaveView(p) : retencaoView(p);
    root.replaceChildren(h("main", {}, title, who, sessionError, banner, nav, body, foot));
  }

  window.addEventListener("beforeunload", (e) => {
    const unsaved = [...panels.values()].some((x) => x.controller.state.keysLoaded && !x.controller.state.backupDone);
    if (unsaved) e.preventDefault(); // o navegador mostra o aviso padrão: as chaves só existem nesta aba
  });

  render();
}

function downloadBytes(name: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data as BlobPart]));
  const a = h("a", { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

start().catch(() => { document.getElementById("app")!.textContent = "Não foi possível iniciar o painel. Verifique a configuração."; });
