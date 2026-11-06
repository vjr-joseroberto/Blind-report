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
const STATUS_LABEL: Record<string, string> = { new: "new", review: "under review", verified: "verified", discarded: "discarded" };
const DAY = 24 * 3600;
const TABS: Record<Exclude<Role, "visitor">, [Tab, string][]> = {
  admin: [["inicio", "Home"], ["caixa", "Inbox"], ["equipe", "Team"], ["chaves", "Keys and policy"], ["retencao", "Retention"]],
  journalist: [["caixa", "Inbox"], ["minhachave", "My key"], ["retencao", "Retention"]],
};

/** Injected browser wallets (EIP-6963), with `window.ethereum` as a fallback. No third-party services. */
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

/** Two-step button for heavy actions: the first click shows the effect, the second confirms. */
function confirmButton(label: string, warning: string, onConfirm: () => void, disabled = false): HTMLElement {
  const note = h("p", { className: "alert", hidden: true }, warning);
  const btn = h("button", { disabled }, label);
  let armed = false;
  btn.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      note.hidden = false;
      btn.textContent = `Confirm: ${label}`;
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
  /** One panel (with the keys, in memory only) per newsroom opened in this session: switching newsrooms does not lose the keys. */
  const panels = new Map<string, ReturnType<typeof build>>();
  const names = browserNamesStore(); // newsroom names only, never keys
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

  // The session needs the chosen wallet: this is only the initial one (without a session); `connect` creates the definitive one.
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
      walletError = e instanceof WalletError ? e.message : "Could not find the wallet.";
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
    const ak = input("ak", { type: "password", placeholder: "optional", value: form.arkivKey });
    const busy = s.status === "connecting" || s.status === "signing";
    const msg = walletError ?? s.error?.message;
    return h("section", {},
      h("h2", {}, "Sign in with the wallet"),
      h("p", {}, "Your wallet proves who you are. No private key is typed here. You choose or create the newsroom in the next step."),
      msg ? h("p", { className: "error", role: "alert" }, msg) : null,
      busy ? h("p", { className: "muted", role: "status" }, s.status === "signing" ? "Sign the message in the wallet (it costs no gas)…" : "Connecting to the wallet…") : null,
      h("label", { htmlFor: "ak" }, "Arkiv access key (optional)"), ak,
      h("p", { className: "muted" }, "The Arkiv key goes into the network address registered in your wallet. Without it, the public endpoint has a rate limit."),
      h("button", { disabled: busy, onclick: () => { form = { ...form, arkivKey: ak.value }; void connect(); } }, "Connect wallet"),
      h("p", { className: "muted" }, "Testnet only. The wallet may ask you to switch networks."));
  }

  /** Newsrooms this wallet administers: registry events + confirmation in ENS. May be incomplete. */
  async function loadMine(address: Address) {
    mineFor = address;
    mine = { loading: true, newsrooms: [], incomplete: false };
    render();
    const r = await listAdministered({ address, find: () => findLabelsMintedTo({ client: ens as unknown as LogClient, address }), reader });
    if (mineFor !== address) return; // the account changed during the search
    mine = { loading: false, ...r };
    render();
  }

  function chooseView(s: SessionState): Node {
    const address = s.address!;
    const remembered = names.list(address);
    const adminRows = (mine?.newsrooms ?? []).filter((n) => !remembered.some((r) => r.newsroom === n && !r.journalist));
    const rows: { newsroom: string; journalist?: string; note: string }[] = [
      ...adminRows.map((n) => ({ newsroom: n, note: "administrator (found on the blockchain)" })),
      ...remembered.map((r) => ({ ...r, note: r.journalist ? `journalist (${r.journalist})` : "opened before in this browser" })),
    ];
    const nr = input("nr", { placeholder: "jornalista1.eth", value: form.newsroom });
    const jn = input("jn", { placeholder: "maria", value: form.journalist });
    const fresh = input("nw", { placeholder: "my-newsroom.eth" });
    const open = (newsroom: string, journalist?: string) => { form = { ...form, newsroom, journalist: journalist ?? "" }; void activeSession.choose({ newsroom, journalist }); };
    return h("section", {},
      h("h2", {}, "Which newsroom?"),
      h("p", { className: "muted" }, "Connected wallet: ", linkAddr(SEPOLIA_SPEC, address)),
      s.error ? h("p", { className: "error", role: "alert" }, s.error.message) : null,
      h("div", { className: "card" }, h("h3", {}, "My newsrooms"),
        mine?.loading ? h("p", { className: "muted", role: "status" }, "Looking for this wallet's newsrooms on the blockchain…") : null,
        rows.length === 0 && !mine?.loading ? h("p", { className: "muted" }, "No newsrooms found for this wallet. Create one below or type the name of one you already use.") : null,
        rows.length > 0 ? h("ul", {}, ...rows.map((r) => h("li", {}, `${r.newsroom} · ${r.note} `, h("button", { onclick: () => open(r.newsroom, r.journalist) }, "Open")))) : null,
        mine?.incomplete ? h("p", { className: "alert" }, "The blockchain search may be incomplete (the RPC limits the range). If any newsroom is missing, type the name below.") : null,
        h("button", { disabled: mine?.loading, onclick: () => void loadMine(address) }, "Refresh list")),
      h("div", { className: "card" }, h("h3", {}, "Create a new newsroom"),
        h("p", { className: "muted" }, "Choose the .eth name. If it is available, the panel offers the registration and you become the administrator."),
        h("label", { htmlFor: "nw" }, "New newsroom name"), fresh,
        h("button", { onclick: () => open(fresh.value.trim()) }, "Continue")),
      h("div", { className: "card" }, h("h3", {}, "Join another newsroom"),
        h("label", { htmlFor: "nr" }, "Newsroom name (ENS)"), nr,
        h("label", { htmlFor: "jn" }, "Your journalist name (leave empty if you are the administrator)"), jn,
        h("button", { onclick: () => open(nr.value.trim(), jn.value.trim() || undefined) }, "Join")));
  }

  const errors = (p: PanelState) => [
    p.error ? h("p", { className: "error", role: "alert" }, p.error.message) : null,
    p.notice ? h("p", { className: "ok", role: "status" }, p.notice) : null,
    p.busy ? h("p", { className: "muted", role: "status" }, "Working…") : null,
    p.loading ? h("p", { className: "muted", role: "status" }, "Reading from the blockchain…") : null,
  ];

  function txList(p: PanelState): Node | null {
    if (p.txs.length === 0) return null;
    return h("details", {}, h("summary", {}, `Transactions sent in this session (${p.txs.length})`),
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
    return h("section", {}, h("h2", {}, a.reason === "newsroom_not_found" ? "This newsroom does not exist yet" : "No access to this newsroom"), h("p", { className: "alert" }, a.message), ...errors(p),
      a.reason === "newsroom_not_found" ? h("div", { className: "card" },
        h("h3", {}, "Register a new newsroom"),
        p.progress ? h("p", { className: "muted", role: "status" }, p.progress.step === "commit_wait" ? `Waiting for name registration in ENS (~${p.progress.seconds}s)…` : `Step: ${p.progress.step}. Confirm in the wallet (${p.txCount} of 8 transactions).`) : null,
        h("label", { htmlFor: "lb" }, "Name (will be name.eth)"), label, h("label", { htmlFor: "ct" }, "Categories (comma-separated)"), cats,
        h("label", { htmlFor: "mx" }, "Maximum size (bytes)"), max, h("label", { htmlFor: "at" }, "Accept attachments "), att,
        h("p", { className: "muted" }, "8 transactions in a few minutes; the wallet will ask for a confirmation for each."),
        h("button", { disabled: p.busy, onclick: async () => { await panel!.controller.register({ label: label.value.trim(), categories: cats.value.split(",").map((x) => x.trim()).filter(Boolean), maxBytes: Number(max.value), attachments: att.checked }); await activeSession.refresh(); } }, "Register newsroom")) : null,
      txList(p));
  }

  function stepsView(role: Role, p: PanelState): Node | null {
    const steps = firstSteps(role, { keysLoaded: p.keysLoaded, backupDone: p.backupDone, inboxLoaded: !!p.inbox, teamAdded, readerKeyMade });
    if (steps.length === 0 || steps.every((x) => x.done)) return null;
    const next = steps.find((x) => !x.done)!;
    return h("div", { className: "card" }, h("h3", {}, "First steps"),
      h("ul", { className: "steps" }, ...steps.map((x) => h("li", { className: `${x.done ? "done" : ""} ${x === next ? "next" : ""}` }, x.label))));
  }

  function importBackupBox(p: PanelState): Node {
    const blob = h("textarea", { id: "bk", placeholder: "Paste the backup" });
    const pw = input("bp", { type: "password" });
    return h("div", {}, h("label", { htmlFor: "bk" }, "Backup"), blob, h("label", { htmlFor: "bp" }, "Password"), pw,
      h("button", { disabled: p.busy, onclick: () => panel!.controller.importBackup(blob.value.trim(), pw.value) }, "Import backup"));
  }

  function inicioView(p: PanelState, s: SessionState): Node {
    const items = p.inbox?.items ?? [];
    const count = (st: string) => items.filter((i) => i.status === st).length;
    const alerts: string[] = [];
    if (!p.keysLoaded) alerts.push("The keys that decrypt the tips are not loaded in this session. If you just registered the newsroom, they are already loaded. If the newsroom already existed, import the backup (Keys and policy tab); without it there is no way to open the old tips.");
    else if (!p.backupDone) alerts.push("You have not generated the keys backup in this session yet.");
    if (p.ignoredAnnotations) alerts.push(`${p.ignoredAnnotations} status note(s) were ignored because they were not written by the newsroom.`);
    return h("section", {}, h("h2", {}, `Newsroom ${s.access && "newsroom" in s.access ? s.access.newsroom : ""}`), ...errors(p),
      stepsView("admin", p),
      ...alerts.map((a) => h("p", { className: "alert" }, a)),
      h("div", { className: "card" }, h("h3", {}, "Summary"),
        h("p", {}, `Key: version ${p.keyVersion ?? "—"} · Tips loaded: ${items.length}`),
        p.inbox ? h("p", {}, `New: ${count("new")} · Under review: ${count("review")} · Verified: ${count("verified")} · Discarded: ${count("discarded")}`) : h("p", { className: "muted" }, "Open the Inbox to load the tips.")),
      s.address ? h("p", { className: "muted" }, "Your wallet: ", linkAddr(SEPOLIA_SPEC, s.address)) : null, txList(p));
  }
  const linkAddr = (spec: ChainSpec, a: string) => { const u = addressLink(spec, a); return u ? h("a", { href: u, target: "_blank", rel: "noopener noreferrer" }, a) : a; };

  function caixaView(p: PanelState, role: Role): Node {
    const status = h("select", { id: "fs" }, h("option", { value: "" }, "all"), ...Object.entries(STATUS_LABEL).map(([v, l]) => h("option", { value: v }, l)));
    const cat = input("fc", { placeholder: "category" });
    const reply = h("textarea", { id: "rp2" });
    const o = p.opened;
    return h("section", {}, h("h2", {}, "Inbox"), ...errors(p), stepsView(role, p),
      p.ignoredAnnotations ? h("p", { className: "alert" }, `${p.ignoredAnnotations} status note(s) ignored: the author is not from the newsroom.`) : null,
      h("div", { className: "row" }, h("label", { htmlFor: "fs" }, "Status"), status, h("label", { htmlFor: "fc" }, "Category"), cat,
        h("button", { disabled: p.loading, onclick: () => panel!.controller.loadInbox({ status: (status.value || undefined) as never, category: cat.value.trim() || undefined }) }, "Refresh")),
      p.inbox ? (p.inbox.items.length === 0 ? h("p", { className: "muted" }, "No tips here yet. When someone sends one, it appears after Refresh.") :
        h("ul", {}, ...p.inbox.items.map((i) => h("li", {}, `${i.category} · ${STATUS_LABEL[i.status] ?? i.status} · block ${i.createdAtBlock} `, h("button", { onclick: () => panel!.controller.open(i.key) }, "Open"))))) :
        h("p", { className: "muted" }, "Click Refresh to load the tips."),
      o ? h("article", { className: "card" }, h("h3", {}, `Tip (${o.category}) — ${STATUS_LABEL[o.status] ?? o.status}`), h("pre", {}, o.text),
        h("div", { className: "row" },
          o.attachment ? h("button", { onclick: () => downloadBytes(o.attachment!.name, o.attachment!.data) }, `Download attachment ${o.attachment.name}`) : null,
          h("button", { onclick: () => downloadBytes(`tip-${o.key.slice(2, 10)}.sw`, o.envelope) }, "Download encrypted envelope (.sw)")),
        h("div", { className: "row" }, ...Object.entries(STATUS_LABEL).map(([v, l]) => h("button", { onclick: () => panel!.controller.setStatus(o.key, v as never) }, `Mark: ${l}`))),
        h("label", { htmlFor: "rp2" }, "Reply to the source (only they can read it)"), reply, h("button", { onclick: () => panel!.controller.reply(o.key, reply.value) }, "Send reply")) : null,
      txList(p));
  }

  function equipeView(p: PanelState): Node {
    const label = input("jl", { placeholder: "maria" });
    const addr = input("ja", { placeholder: "0x…" });
    const rpub = input("jk", { placeholder: "public reader key (base64url)" });
    const rev = input("jr", { placeholder: "maria" });
    return h("section", {}, h("h2", {}, "Team"), ...errors(p), stepsView("admin", p),
      h("div", { className: "card" }, h("h3", {}, "1. Register journalist"),
        h("p", { className: "muted" }, "The person generates their own reader key (My key tab in their panel) and sends you only the public one."),
        h("label", { htmlFor: "jl" }, "Name (maria → maria.your-newsroom.eth)"), label, h("label", { htmlFor: "ja" }, "Their wallet address"), addr, h("label", { htmlFor: "jk" }, "Public reader key"), rpub,
        h("button", { disabled: p.busy, onclick: async () => { await panel!.controller.addJournalist({ label: label.value.trim(), address: addr.value.trim() as Hex, readerPublicKey: fromBase64Url(rpub.value.trim()) }); teamAdded = true; } }, "Register (2 transactions)")),
      h("div", { className: "card" }, h("h3", {}, "2. Deliver the keyring"),
        h("p", { className: "muted" }, "Encrypts all the newsroom keys for the public key above. Send the text to the person through a secure channel."),
        h("button", { disabled: p.busy, onclick: () => panel!.controller.shareKeyring(rpub.value.trim()) }, "Generate keyring"),
        p.sharedText ? h("textarea", { readOnly: true, value: p.sharedText }) : null),
      h("div", { className: "card" }, h("h3", {}, "Revoke journalist"), h("label", { htmlFor: "jr" }, "Name"), rev,
        confirmButton("Revoke", "This removes access in ENS, but does not undo keys already delivered. Then rotate the key and deliver the new keyring to the others.", () => void panel!.controller.revokeJournalist(rev.value.trim()), p.busy)),
      txList(p));
  }

  /** Explains why a button that depends on the keys is disabled. */
  const needKeys = () => h("p", { className: "alert", role: "status" }, "Load the keys first: register the newsroom in this session or import a backup (further down in this tab). Without the keys there is nothing to save.");

  function chavesView(p: PanelState): Node {
    const pw = input("ep", { type: "password" });
    const cats = input("pc", { placeholder: "saude, corrupcao" });
    const max = input("pm", { value: "100000" });
    const att = h("input", { type: "checkbox", id: "pa" });
    return h("section", {}, h("h2", {}, "Keys and policy"), ...errors(p), stepsView("admin", p),
      h("div", { className: "card" }, h("h3", {}, `Newsroom key (version ${p.keyVersion ?? "—"})`),
        p.keysLoaded ? null : needKeys(),
        confirmButton("Rotate key", "Publishes a new key to ENS. Old tips still open, but you need a new backup and to deliver the new keyring to the journalists.", () => void panel!.controller.rotate(), p.busy || !p.keysLoaded)),
      h("div", { className: "card" }, h("h3", {}, "Submission policy"),
        p.keysLoaded ? null : needKeys(),
        h("label", { htmlFor: "pc" }, "Categories (comma-separated)"), cats, h("label", { htmlFor: "pm" }, "Maximum size (bytes)"), max, h("label", { htmlFor: "pa" }, "Accept attachments "), att,
        h("button", { disabled: p.busy || !p.keysLoaded, onclick: () => panel!.controller.updatePolicy({ categories: cats.value.split(",").map((x) => x.trim()).filter(Boolean), maxBytes: Number(max.value), attachments: att.checked, epoch: "monthly" }) }, "Publish policy (1 transaction)")),
      h("div", { className: "card" }, h("h3", {}, "Keys backup"), h("p", { className: "muted" }, "The backup is a copy of the keys that decrypt the tips, protected by the password you choose. The password is not the key; it only protects the file."), h("p", { className: "warn" }, "Without the backup, closing this tab means losing access to the tips."),
        p.keysLoaded ? null : needKeys(),
        h("label", { htmlFor: "ep" }, "Backup password (min. 8 characters)"), pw, h("button", { disabled: !p.keysLoaded, onclick: () => panel!.controller.exportBackup(pw.value) }, "Generate backup"),
        p.backupText ? h("div", {}, h("button", { onclick: () => download("backup-safe-whistle.txt", p.backupText!) }, "Download backup"),
          h("p", { className: "muted" }, "If the browser blocks the download, copy the text below and save it in a file of your own."), h("textarea", { readOnly: true, value: p.backupText })) : null),
      h("div", { className: "card" }, h("h3", {}, "Import backup"), importBackupBox(p)),
      txList(p));
  }

  function minhaChaveView(p: PanelState): Node {
    const blob = h("textarea", { id: "sh", placeholder: "Paste the received keyring" });
    return h("section", {}, h("h2", {}, "My key"), ...errors(p), stepsView("journalist", p),
      h("div", { className: "card" }, h("h3", {}, "1. Generate my reader key"),
        h("p", { className: "muted" }, "Keep the private one only with you. Send the public one to the administrator."),
        h("button", { onclick: () => { readerKey = panel!.controller.newReaderKey(); readerKeyMade = !!readerKey; render(); } }, "Generate"),
        readerKey ? h("div", {}, h("p", {}, "Public (send to the administrator):"), h("pre", {}, readerKey.publicKey), h("p", { className: "warn" }, "Private (keep only with you):"), h("pre", {}, readerKey.privateKey)) : null),
      h("div", { className: "card" }, h("h3", {}, "2. Import the keyring"),
        h("p", { className: "muted" }, p.keysLoaded ? "✔ Keyring loaded: you can now open the tips." : "Paste the keyring the administrator sent you."),
        h("label", { htmlFor: "sh" }, "Keyring"), blob,
        h("button", { disabled: p.busy || !readerKey, onclick: () => panel!.controller.importShared(blob.value.trim(), readerKey!) }, "Import keyring"),
        readerKey ? null : h("p", { className: "muted" }, "Generate your key first (step 1).")),
      txList(p));
  }

  function retencaoView(p: PanelState): Node {
    return h("section", {}, h("h2", {}, "Retention"), ...errors(p),
      h("p", { className: "muted" }, "Without renewal, the tip disappears from the chain (maximum of ~182 days)."),
      h("button", { disabled: p.loading, onclick: () => panel!.controller.loadExpiring(30 * DAY) }, "See what expires in 30 days"),
      p.expiring ? h("p", {}, p.expiring.length === 0 ? "Nothing expires in the next 30 days." : `${p.expiring.length} tip(s) expiring.`) : null,
      p.expiring?.length ? h("button", { disabled: p.busy, onclick: () => panel!.controller.renewAll(150 * DAY) }, "Renew all (150 days)") : null, txList(p));
  }

  /** Administrator with keys loaded and no backup in this session. */
  const unsaved = (p: PanelState, role: Role) => role === "admin" && p.keysLoaded && !p.backupDone;

  function render() {
    const restore = captureFields(root);
    draw();
    restore();
  }

  function draw() {
    const s = activeSession.state;
    const foot = h("footer", { className: "muted" }, `RPC: ${new URL(config.rpcUrl).hostname}. To protect your network, choose a VPN or other protection on your own, outside this app.`);
    const title = h("h1", {}, "Safe Whistle — Newsroom");
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
    const roleLabel = access.role === "admin" ? "Administrator" : access.role === "journalist" ? "Journalist" : "No access";
    const who = h("div", { className: "who" },
      h("span", {}, `${access.role === "journalist" ? access.journalistName : access.newsroom}`, h("span", { className: `badge ${access.role}` }, roleLabel)),
      h("div", { className: "row" }, h("button", { onclick: () => activeSession.leaveNewsroom() }, "Switch newsroom"),
        unsaved(panel.controller.state, access.role)
          ? confirmButton("Sign out", "You have not generated the backup yet. When you sign out, this session's keys are erased and the tips become unreadable. Click again only if you are sure.", () => activeSession.disconnect())
          : h("button", { onclick: () => activeSession.disconnect() }, "Sign out")));
    if (access.role === "visitor") {
      root.replaceChildren(h("main", {}, title, who, visitorView(s, p), foot));
      return;
    }
    const banner = unsaved(p, access.role)
      ? h("div", { className: "alert", role: "alert" }, h("strong", {}, "Generate the backup now. "), "The keys that decrypt the tips exist only in this tab. Without the backup, closing or signing out loses access. ",
          h("button", { onclick: () => { tab = "chaves"; render(); } }, "Go to backup"))
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
    if (unsaved) e.preventDefault(); // the browser shows the default warning: the keys exist only in this tab
  });

  render();
}

function downloadBytes(name: string, data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data as BlobPart]));
  const a = h("a", { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

start().catch(() => { document.getElementById("app")!.textContent = "Could not start the panel. Check the configuration."; });
