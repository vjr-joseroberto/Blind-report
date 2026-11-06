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
  // Leitura apenas: a conta abaixo é descartável, nunca assina nem paga nada.
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
        h("h2", {}, "Para qual redação?"), err(s),
        h("label", { htmlFor: "nr" }, "Nome da redação (ENS)"), name,
        h("button", { onclick: () => controller.lookup(name.value), disabled: s.busy }, s.busy ? "Buscando…" : "Buscar"),
        h("p", { className: "warn" }, "Confira o nome com a redação por outro canal. Qualquer pessoa pode criar um nome."));
    }
    if (s.step === "compose" && s.newsroom) {
      const n = s.newsroom;
      const cat = h("select", { id: "cat" }, ...n.categories.map((c) => h("option", { value: c }, c)));
      const text = h("textarea", { id: "txt" });
      const file = h("input", { type: "file", id: "file" });
      return h("section", {},
        h("h2", {}, `✔ ${n.name} (chave v${n.version})`),
        h("p", { className: "muted" }, `Aceita: ${n.categories.join(", ")} · até ${n.maxBytes} bytes · anexos: ${n.attachments ? "sim" : "não"} · 1 envio por mês`),
        err(s),
        h("label", { htmlFor: "cat" }, "Categoria"), cat,
        h("label", { htmlFor: "txt" }, "Texto"), text,
        n.attachments ? h("label", { htmlFor: "file" }, "Anexo (opcional)") : null, n.attachments ? file : null,
        h("p", { className: "muted" }, "Seu texto é cifrado neste aparelho antes de sair. Só a redação consegue abri-lo."),
        h("button", {
          onclick: async () => {
            const f = file.files?.[0];
            const attachment = f ? { name: f.name, data: await readFileBytes(f) } : undefined;
            await controller.submit({ category: cat.value, text: text.value, attachment });
          },
        }, "Continuar"));
    }
    if (s.step === "proof") {
      return h("section", {},
        h("h2", {}, "Prove que você é uma pessoa real e única"), h("p", {}, "Isso não revela quem você é."),
        s.proofLink ? h("p", { className: "link" }, "Abra no World App (ou no simulador, em testes): ", h("a", { href: s.proofLink, rel: "noreferrer noopener" }, s.proofLink)) : h("p", {}, "Preparando…"),
        h("p", { className: "muted" }, "Aguardando a confirmação…"),
        h("button", { onclick: () => proof.cancel() }, "Cancelar"));
    }
    return h("section", {},
      h("h2", { className: "ok" }, "✔ Denúncia enviada"),
      h("p", { className: "warn" }, "GUARDE O RECIBO AGORA. Ele é a única forma de ler respostas e de provar autoria. Não guardamos cópia: se perder, perde o acesso."),
      h("button", { onclick: () => download("recibo-safe-whistle.json", s.receiptText!) }, "Baixar recibo"),
      h("button", { onclick: () => navigator.clipboard?.writeText(s.receiptText!) }, "Copiar"),
      h("label", {}, h("input", { type: "checkbox", onchange: () => controller.confirmReceiptSaved() }), " Já guardei o recibo"),
      h("button", { onclick: () => controller.finish(), disabled: !s.receiptSaved }, "Concluir"));
  }

  function viewReplies(s: SourceState): Node {
    const box = h("textarea", { id: "rc", placeholder: "Cole o conteúdo do recibo" });
    const pick = h("input", { type: "file", id: "rcf", accept: ".json" });
    pick.addEventListener("change", async () => { const f = pick.files?.[0]; if (f) await controller.loadReplies(await readFileText(f)); });
    return h("section", {},
      h("h2", {}, "Respostas"), err(s),
      h("label", { htmlFor: "rcf" }, "Recibo (arquivo)"), pick,
      h("label", { htmlFor: "rc" }, "ou cole o recibo"), box,
      h("button", { onclick: () => controller.loadReplies(box.value) }, "Ver respostas"),
      s.ignoredReplies ? h("p", { className: "warn", role: "status" }, `${s.ignoredReplies} resposta(s) ignorada(s): não foi possível confirmar que vieram da redação.`) : null,
      s.replies ? (s.replies.length === 0 ? h("p", {}, "Nenhuma resposta ainda.") : h("ul", {}, ...s.replies.map((r) => h("li", {}, `${r.author}: ${r.text} (bloco ${r.createdAtBlock})`)))) : null);
  }

  function viewVerify(s: SourceState): Node {
    const nr = h("input", { type: "text", id: "vnr", placeholder: "investiga.eth" });
    const file = h("input", { type: "file", id: "vf" });
    const receipt = h("textarea", { id: "vrc", placeholder: "Recibo (para provar autoria)" });
    const text = h("textarea", { id: "vtx", placeholder: "Texto original" });
    const out = h("p", {});
    const v = s.verification;
    return h("section", {},
      h("h2", {}, "Verificar um arquivo divulgado"), err(s),
      h("label", { htmlFor: "vnr" }, "Redação"), nr, h("label", { htmlFor: "vf" }, "Arquivo (envelope)"), file,
      h("button", { onclick: async () => { const f = file.files?.[0]; if (f) await controller.verify({ newsroom: nr.value.trim(), envelope: await readFileBytes(f) }); } }, "Verificar"),
      v ? h("p", { className: v.hashMatches && v.found ? "ok" : "error" }, `${v.hashMatches ? "✔ O hash confere" : "✖ O hash não confere"} · ${v.found ? `✔ Existe no Arkiv desde o bloco ${v.createdAtBlock}` : "✖ Não encontrado no Arkiv"}`) : null,
      h("h3", {}, "Provar autoria (opcional)"), h("label", { htmlFor: "vrc" }, "Recibo"), receipt, h("label", { htmlFor: "vtx" }, "Texto original"), text,
      h("button", { onclick: async () => {
        const f = file.files?.[0];
        if (!f) return;
        try {
          const ok = controller.proveAuthorship({ envelope: await readFileBytes(f), text: text.value, salt: parseReceipt(receipt.value).salt });
          out.className = ok ? "ok" : "error";
          out.textContent = ok ? "✔ Você é quem enviou." : "✖ Não confere.";
        } catch (e) { out.className = "error"; out.textContent = e instanceof Error ? e.message : "Erro."; }
      } }, "Provar autoria"), out);
  }

  function render(s: SourceState) {
    const tabs: [Tab, string][] = [["enviar", "Enviar"], ["respostas", "Respostas"], ["verificar", "Verificar"]];
    const nav = h("nav", {}, ...tabs.map(([id, label]) => h("button", { "aria-current": tab === id ? "page" : undefined, onclick: () => { tab = id; render(controller.state); } }, label)));
    const body = tab === "enviar" ? viewSend(s) : tab === "respostas" ? viewReplies(s) : viewVerify(s);
    const foot = h("footer", { className: "muted" }, `RPC: ${new URL(config.rpcUrl).hostname} · Relayer: ${new URL(config.relayerUrl).hostname}. Para proteger sua rede, escolha por conta própria uma VPN ou outra proteção, fora deste aplicativo.`);
    root.replaceChildren(h("main", {}, h("h1", {}, "Safe Whistle"), nav, body, foot));
  }
  controller.subscribe(render);
  render(controller.state);
}

start().catch(() => { document.getElementById("app")!.textContent = "Não foi possível iniciar o aplicativo. Verifique a configuração."; });
