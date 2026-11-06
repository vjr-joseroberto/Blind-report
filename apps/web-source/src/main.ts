import { createReader, type EnsReadClient } from "@safe-whistle/ens-client";
import { createSdkBackend, createStore } from "@safe-whistle/arkiv-store";
import { guardedFetch, RPC_TRANSPORT } from "@safe-whistle/network-policy";
import { createIdKitProofProvider, createSourceClient, parseReceipt, sourceNetworkPolicy } from "@safe-whistle/source-client";
import { createPublicClient as createArkivPublic, createWalletClient as createArkivWallet } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { createPublicClient, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { cancellable, createSourceController, type SourceState } from "./controller.ts";
import { download, h, readFileBytes, readFileText } from "./dom.ts";

type Config = { rpcUrl: string; relayerUrl: string; arkivRpcUrl: string; arkivAccessKey?: string };
type Tab = "enviar" | "respostas" | "verificar";

async function start() {
  const root = document.getElementById("app")!;
  const config: Config = await (await fetch("config.json")).json();
  let tab: Tab = "enviar";

  const policy = sourceNetworkPolicy(config);
  const guarded = guardedFetch(policy);
  const ens = createPublicClient({ chain: sepolia, transport: http(config.rpcUrl, { fetchFn: guarded, ...RPC_TRANSPORT }) });
  // Read only: the account below is disposable, it never signs or pays for anything.
  const chain = rabdi({ accessKey: config.arkivAccessKey ?? "" });
  const transport = http(undefined, { fetchFn: guarded, ...RPC_TRANSPORT });
  const store = createStore(createSdkBackend({
    publicClient: createArkivPublic({ chain: chain as never, transport }),
    walletClient: createArkivWallet({ chain: chain as never, transport, account: privateKeyToAccount(generatePrivateKey()) }),
  }));

  let controller!: ReturnType<typeof createSourceController>;
  const proof = cancellable(createIdKitProofProvider({ onLink: (uri) => controller.setProofLink(uri) }));
  const client = createSourceClient({
    fetch: guarded, relayerUrl: config.relayerUrl, reader: createReader({ client: ens as unknown as EnsReadClient }),
    replies: store, submissions: store, proofProvider: proof.provider, now: () => new Date(),
  });
  controller = createSourceController(client);

  const err = (s: SourceState) => (s.error ? h("p", { className: "error", role: "alert" }, s.error.message) : null);

  function viewSend(s: SourceState): Node {
    if (s.step === "newsroom") {
      const name = h("input", { type: "text", id: "nr", placeholder: "investiga.eth", autocomplete: "off" });
      return h("section", {},
        h("h2", {}, "Which newsroom?"), err(s),
        h("label", { htmlFor: "nr" }, "Newsroom name (ENS)"), name,
        h("button", { onclick: () => controller.lookup(name.value), disabled: s.busy }, s.busy ? "Searching…" : "Search"),
        h("p", { className: "warn" }, "Check the name with the newsroom through another channel. Anyone can create a name."));
    }
    if (s.step === "compose" && s.newsroom) {
      const n = s.newsroom;
      const cat = h("select", { id: "cat" }, ...n.categories.map((c) => h("option", { value: c }, c)));
      const text = h("textarea", { id: "txt" });
      const file = h("input", { type: "file", id: "file" });
      return h("section", {},
        h("h2", {}, `✔ ${n.name} (key v${n.version})`),
        h("p", { className: "muted" }, `Accepts: ${n.categories.join(", ")} · up to ${n.maxBytes} bytes · attachments: ${n.attachments ? "yes" : "no"} · 1 submission per month`),
        err(s),
        h("label", { htmlFor: "cat" }, "Category"), cat,
        h("label", { htmlFor: "txt" }, "Text"), text,
        n.attachments ? h("label", { htmlFor: "file" }, "Attachment (optional)") : null, n.attachments ? file : null,
        h("p", { className: "muted" }, "Your text is encrypted on this device before it leaves. Only the newsroom can open it."),
        h("button", {
          onclick: async () => {
            const f = file.files?.[0];
            const attachment = f ? { name: f.name, data: await readFileBytes(f) } : undefined;
            await controller.submit({ category: cat.value, text: text.value, attachment });
          },
        }, "Continue"));
    }
    if (s.step === "proof") {
      return h("section", {},
        h("h2", {}, "Prove that you are a real and unique person"), h("p", {}, "This does not reveal who you are."),
        s.proofLink ? h("p", { className: "link" }, "Open in World App (or the simulator, in tests): ", h("a", { href: s.proofLink, rel: "noreferrer noopener" }, s.proofLink)) : h("p", {}, "Preparing…"),
        h("p", { className: "muted" }, "Waiting for confirmation…"),
        h("button", { onclick: () => proof.cancel() }, "Cancel"));
    }
    return h("section", {},
      h("h2", { className: "ok" }, "✔ Tip sent"),
      h("p", { className: "warn" }, "SAVE THE RECEIPT NOW. It is the only way to read replies and to prove authorship. We do not keep a copy: if you lose it, you lose access."),
      h("button", { onclick: () => download("safe-whistle-receipt.json", s.receiptText!) }, "Download receipt"),
      h("button", { onclick: () => navigator.clipboard?.writeText(s.receiptText!) }, "Copy"),
      h("label", {}, h("input", { type: "checkbox", onchange: () => controller.confirmReceiptSaved() }), " I have saved the receipt"),
      h("button", { onclick: () => controller.finish(), disabled: !s.receiptSaved }, "Finish"));
  }

  function viewReplies(s: SourceState): Node {
    const box = h("textarea", { id: "rc", placeholder: "Paste the receipt contents" });
    const pick = h("input", { type: "file", id: "rcf", accept: ".json" });
    pick.addEventListener("change", async () => { const f = pick.files?.[0]; if (f) await controller.loadReplies(await readFileText(f)); });
    return h("section", {},
      h("h2", {}, "Replies"), err(s),
      h("label", { htmlFor: "rcf" }, "Receipt (file)"), pick,
      h("label", { htmlFor: "rc" }, "or paste the receipt"), box,
      h("button", { onclick: () => controller.loadReplies(box.value) }, "View replies"),
      s.ignoredReplies ? h("p", { className: "warn", role: "status" }, `${s.ignoredReplies} ignored reply/replies: could not confirm they came from the newsroom.`) : null,
      s.replies ? (s.replies.length === 0 ? h("p", {}, "No replies yet.") : h("ul", {}, ...s.replies.map((r) => h("li", {}, `${r.author}: ${r.text} (block ${r.createdAtBlock})`)))) : null);
  }

  function viewVerify(s: SourceState): Node {
    const nr = h("input", { type: "text", id: "vnr", placeholder: "investiga.eth" });
    const file = h("input", { type: "file", id: "vf" });
    const receipt = h("textarea", { id: "vrc", placeholder: "Receipt (to prove authorship)" });
    const text = h("textarea", { id: "vtx", placeholder: "Original text" });
    const out = h("p", {});
    const v = s.verification;
    return h("section", {},
      h("h2", {}, "Verify a published file"), err(s),
      h("label", { htmlFor: "vnr" }, "Newsroom"), nr, h("label", { htmlFor: "vf" }, "File (envelope)"), file,
      h("button", { onclick: async () => { const f = file.files?.[0]; if (f) await controller.verify({ newsroom: nr.value.trim(), envelope: await readFileBytes(f) }); } }, "Verify"),
      v ? h("p", { className: v.hashMatches && v.found ? "ok" : "error" }, `${v.hashMatches ? "✔ The hash matches" : "✖ The hash does not match"} · ${v.found ? `✔ Exists in Arkiv since block ${v.createdAtBlock}` : "✖ Not found in Arkiv"}`) : null,
      h("h3", {}, "Prove authorship (optional)"), h("label", { htmlFor: "vrc" }, "Receipt"), receipt, h("label", { htmlFor: "vtx" }, "Original text"), text,
      h("button", { onclick: async () => {
        const f = file.files?.[0];
        if (!f) return;
        try {
          const ok = controller.proveAuthorship({ envelope: await readFileBytes(f), text: text.value, salt: parseReceipt(receipt.value).salt });
          out.className = ok ? "ok" : "error";
          out.textContent = ok ? "✔ You are the one who sent it." : "✖ Does not match.";
        } catch (e) { out.className = "error"; out.textContent = e instanceof Error ? e.message : "Error."; }
      } }, "Prove authorship"), out);
  }

  function render(s: SourceState) {
    const tabs: [Tab, string][] = [["enviar", "Send"], ["respostas", "Replies"], ["verificar", "Verify"]];
    const nav = h("nav", {}, ...tabs.map(([id, label]) => h("button", { "aria-current": tab === id ? "page" : undefined, onclick: () => { tab = id; render(controller.state); } }, label)));
    const body = tab === "enviar" ? viewSend(s) : tab === "respostas" ? viewReplies(s) : viewVerify(s);
    const foot = h("footer", { className: "muted" }, `RPC: ${new URL(config.rpcUrl).hostname} · Relayer: ${new URL(config.relayerUrl).hostname}. To protect your network, choose a VPN or other protection on your own, outside this app.`);
    root.replaceChildren(h("main", {}, h("h1", {}, "Safe Whistle"), nav, body, foot));
  }
  controller.subscribe(render);
  render(controller.state);
}

start().catch(() => { document.getElementById("app")!.textContent = "Could not start the app. Check the configuration."; });
