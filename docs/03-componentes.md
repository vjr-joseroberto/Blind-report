# Componentes

Monorepo com npm workspaces. A estrutura detalhada está em `planejamento/03-estrutura-monorepo.md`.

## 1. Estado dos componentes
| Componente | Estado | Onde |
|---|---|---|
| **guardrails** | **Criado e testado** (6 testes) | `guardrails/`, `.claude/` |
| `packages/core` | Planejado | — |
| `packages/crypto` | **Prototipado** nas POCs (20 testes); será reescrito com TDD | `../POC-Cofre/poc-cripto` |
| `packages/ens-client` | **Criado e testado** (30 unitários + 11 de integração no fork). Jornalistas vivem sob o `.eth` de segundo nível da redação | `packages/ens-client` |
| `packages/arkiv-store` | **Criado e testado** (44 unitários + 14 de integração no nó local): loja, dublê em memória e backend do SDK, com a mesma suíte de contrato | `packages/arkiv-store` |
| `packages/worldid-gate` | **Criado e testado** (58 testes): contexto RP assinado, portão, verificador real e simulado, armazém em memória e em arquivo. Prova real validada no simulador (V-02) | `packages/worldid-gate` |
| `packages/network-policy` | Planejado | — |
| `packages/source-client` | **Criado e testado** (41 testes): consulta, montagem, envio, recibo, respostas, verificação, política de rede, IDKit sem interface | `packages/source-client` |
| `packages/newsroom-client` | **Criado e testado** (30 testes): cadastro com andamento, chaveiro com versões, backup por senha, chaveiro para jornalistas, caixa de entrada, decifragem, status, respostas, retenção | `packages/newsroom-client` |
| `apps/relayer` | **Criado e testado** (43 unitários + 4 de integração). Ver `05-api-do-relayer.md` | `apps/relayer` |
| `apps/web-source` | **Criado** (21 testes: controlador e análise estática). `npm run build -w apps/web-source` gera `dist/`. Telas em `06-telas.md` | `apps/web-source` |
| `apps/web-newsroom` | **Criado** (20 testes: controlador e análise estática). `npm run build -w apps/web-newsroom` gera `dist/` | `apps/web-newsroom` |
| `tests/e2e` | Planejado (scripts, sem navegador) | — |

As POCs são **referência**: o código final é escrito com TDD no monorepo, e o código das POCs não é copiado sem testes.

## 2. Responsabilidades

### `packages/core` — tipos e regras puras
- Tipos: `Envelope`, `Receipt`, `NewsroomPolicy`, `Annotation`, `Reply`.
- Constantes: limites de tamanho, nomes de chaves de texto do ENS, prefixo de ação.
- Funções puras: `epochOf(date)`, `actionFor(newsroom, epoch)`, `parsePolicy(json)`, `validateSubmission(policy, submission)`, `splitIntoParts(bytes)`.
- **Sem dependências de rede.**

### `packages/crypto` — criptografia no cliente
- `newKeypair()`, `seal(opts)`, `open(envelope, recipient, keypair)`.
- `commitmentOf(plaintext, salt)`, `verifyContentHash(envelope)`, `verifyCommitment(...)`.
- `mailboxId(pub)`, `sealReply(...)`, `openReply(...)`.
- Roda no navegador e no Node. Depende apenas de `core` e de libsodium.

### `packages/ens-client` — ENS
- **Leitor:** `resolveNewsroom(name)` devolve chave pública, versão, política e custodiante; `resolveReaderKey(name)`; `ownerOf(subname)`; **`isActiveJournalist(name)`**, que confere no registry se o subname tem dono (a chave de leitura continua legível depois de revogar ou expirar, então **nunca** se confia só no texto).
- **Administração:** `createNewsroom(...)`, `publishKey(...)`, `rotateKey(...)`, `addJournalist(...)` (sem papel de transferência), `revokeJournalist(...)` (`unregister` e depois limpar `denuncia.readerkey`), `renewJournalist(...)`.
- Recebe um cliente `viem` por injeção, para ser testado contra um fork local.

### `packages/arkiv-store` — Arkiv
- Esquemas `denuncia`, `resposta`, `anotacao`.
- `publishSubmission(...)`: cria a entidade (binário, `readonly`), **transfere a custódia** à redação.
- `listSubmissions({ newsroom, status })`, `getByMailbox(mailboxId)`, `annotate(...)`.
- `renewRetention(...)`, `splitAndStore(...)` para anexos grandes.

### `packages/worldid-gate` — anti-spam
- `rpContextFor({ newsroom, epoch })`: assinatura gerada no servidor.
- `SubmissionGate.admit(...)`: valida ambiente, ação, prova (verificador injetável) e unicidade de `(nullifier, ação)`.
- Verificador real (API do World) e verificador simulado para testes.

### `packages/network-policy` — política de rede
- Lista de hosts permitidos: RPC configurável, World, relayer.
- `guardedFetch(url, init)`: recusa qualquer host fora da lista.
- `recorder`: um `fetch` injetável que **grava destino e corpo** das requisições; os testes o usam para provar que nada de sigiloso saiu e que só hosts declarados foram contatados.
- `cspFor(policy)`: gera a política de segurança de conteúdo.
- Parte do guardrail em execução (`../GUARDRAILS.md`).

### `packages/source-client` — lógica da fonte (sem interface)
- `lookupNewsroom(name)`, `compose(...)` (valida pela política e divide anexos), `submit(...)` (cifra, pede a prova, envia ao relayer, devolve o recibo), `readReplies(receipt)`, `verifyDocument(file)`, `proveAuthorship(...)`.
- Recebe por injeção: `fetch` (envolvido por `guardedFetch`), cliente do ENS, relógio, aleatoriedade e um **fornecedor de prova** (`ProofProvider`): na tela é o IDKit, nos testes é um dublê.
- É testado inteiro por script, **sem navegador**.

### `packages/newsroom-client` — lógica da redação (sem interface)
- `registerNewsroom(...)`, `generateAndPublishKey(...)`, `exportKey(password)` / `importKey(...)`, `addJournalist(...)`, `revokeJournalist(...)`.
- `listInbox(filters)`, `decrypt(entry)`, `annotate(...)`, `reply(...)`, `listExpiring()`, `renew(...)`.
- Mesma injeção do `source-client`. A chave privada nunca sai do cliente.

### `apps/relayer` — serviço HTTP
- `POST /submissions`: verifica World ID, valida contra a política ENS, publica no Arkiv, transfere a custódia.
- `GET /rp-context`: devolve a assinatura RP para o IDKit.
- `GET /health`.
- Rotina de renovação de retenção.
- **Sem logs de IP nem de corpo de requisição.**

### `apps/web-source` — tela da fonte (camada fina)
- Liga os campos ao `source-client` e mostra o resultado: consultar redação, preencher denúncia, provar humanidade (IDKit), enviar, guardar o recibo, caixa de respostas, verificar autoria e integridade.
- **Sem regra de negócio, cifragem nem rede própria.** Estática; sem rastreadores; configurar o RPC.

### `apps/web-newsroom` — painel da redação (camada fina)
- Liga os campos ao `newsroom-client`: cadastro, chave e política, jornalistas, lista, decifragem local, status e respostas.

### `tests/e2e` — scripts, sem navegador
Scripts que sobem o fork local da Sepolia, o nó Arkiv local e o relayer, e percorrem os casos de uso usando `source-client` e `newsroom-client`. Um gravador de requisições confirma que nada sigiloso sai e que só hosts declarados são contatados.

## 3. Dependências permitidas
```
core ◄── crypto
core ◄── ens-client
core ◄── arkiv-store
core ◄── worldid-gate
core ◄── network-policy
crypto, ens-client, arkiv-store, worldid-gate, network-policy ◄── relayer
core, crypto, ens-client, network-policy ◄── source-client ◄── web-source (+ ens-client, arkiv-store, network-policy só para ligar os serviços reais)
core, crypto, ens-client, arkiv-store, network-policy ◄── newsroom-client ◄── web-newsroom
```
Regras: nenhuma seta volta; `core` e `crypto` não fazem rede; só `network-policy` decide quais hosts podem ser contatados; as telas só chamam os clientes.

## 4. Código das POCs a usar como referência
| POC | O que contém | Vira |
|---|---|---|
| `POC-Cofre/poc-cripto/envelope.ts` | Envelope, mailbox, compromisso | `packages/crypto` |
| `POC-Cofre/poc-arkiv/schemas.ts`, `run.ts` | Esquemas e comportamento medido | `packages/arkiv-store` |
| `POC-Cofre/poc-worldid/gate.ts` | Portão, assinatura RP | `packages/worldid-gate` |
| `POC-Cofre/poc-ens/run.ts`, `POC-ENS/src/*` | Fluxo ENS (resolver, registro, texto, permissões) | `packages/ens-client` |
| `POC-ENS/api/*` | API de teste com Swagger | Referência; não entra no produto |
