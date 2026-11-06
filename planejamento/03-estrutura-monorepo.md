# Estrutura do monorepo

Objetivo: um repositório simples, com fronteiras claras entre componentes, em que cada pacote é testável isoladamente. **Sem rede de anonimato** em nenhuma parte (`../GUARDRAILS.md`).

## 1. Árvore
```
safe-whistle/
├── package.json                  workspaces + scripts da raiz
├── tsconfig.base.json            opções comuns do TypeScript
├── vitest.workspace.ts           configuração dos testes por pacote
├── guardrails/                   (existe) verificador, padrões e testes do guardrail
├── .claude/                      (existe) hook do assistente
├── docs/  planejamento/          (existem)
├── packages/
│   ├── core/                     tipos, constantes e regras puras
│   │   ├── src/                  index.ts, types.ts, epoch.ts, action.ts, policy.ts, parts.ts
│   │   └── test/
│   ├── crypto/                   envelope, mailbox, compromisso
│   │   ├── src/                  keys.ts, seal.ts, open.ts, commitment.ts, mailbox.ts
│   │   └── test/
│   ├── ens-client/
│   │   ├── src/                  reader.ts, admin.ts, dns.ts, abis/
│   │   └── test/                 unit/ e integration/ (fork local)
│   ├── arkiv-store/
│   │   ├── src/                  schemas.ts, submissions.ts, replies.ts, annotations.ts, retention.ts
│   │   └── test/                 unit/ e integration/ (nó Arkiv local)
│   ├── worldid-gate/
│   │   ├── src/                  rpContext.ts, gate.ts, verifier.ts, nullifierStore.ts
│   │   └── test/
│   ├── network-policy/
│   │   ├── src/                  allowlist.ts, guardedFetch.ts, recorder.ts, csp.ts
│   │   └── test/
│   ├── source-client/            toda a lógica da fonte, sem interface
│   │   ├── src/                  lookup.ts, compose.ts, submit.ts, receipt.ts, replies.ts, verify.ts
│   │   └── test/
│   └── newsroom-client/          toda a lógica da redação, sem interface
│       ├── src/                  register.ts, keys.ts, journalists.ts, inbox.ts, annotate.ts, reply.ts, retention.ts
│       └── test/
├── apps/
│   ├── relayer/
│   │   ├── src/                  server.ts, routes/, services/, jobs/renewal.ts, config.ts
│   │   └── test/
│   ├── web-source/               camada fina de tela sobre o source-client
│   │   ├── src/                  main.ts, views/
│   │   └── test/                 HTML sem terceiros, CSP (estático)
│   └── web-newsroom/             camada fina de tela sobre o newsroom-client
│       ├── src/
│       └── test/
├── tests/
│   ├── e2e/                      fluxos completos por script (sem navegador): relayer + nós locais + clientes
│   ├── fixtures/                 dados fictícios, chaves de teste, docker-compose dos nós locais
│   └── contract/                 testes de contrato entre pacotes
└── validation/                   testes de caracterização da Fase 0 (@validation)
```

## 2. Regras de dependência
```
core ◄── crypto | ens-client | arkiv-store | worldid-gate | network-policy
pacotes ◄── relayer
core, crypto, ens-client, network-policy ◄── source-client
core, crypto, ens-client, arkiv-store, network-policy ◄── newsroom-client
source-client ◄── web-source
newsroom-client ◄── web-newsroom
```
- Nenhuma seta volta (sem ciclos).
- As **telas só chamam os clientes**: nenhuma regra de negócio, cifragem ou acesso à rede dentro de `apps/web-*`.
- `core` e `crypto` **não fazem rede**.
- Só `network-policy` decide quais hosts podem ser contatados; todo código de rede usa `guardedFetch`.
- Um teste de contrato verifica os `package.json`: um pacote só declara as dependências permitidas aqui, e **nenhuma** de rede de anonimato.

## 3. Convenções de código (simples de MVP)
- **TypeScript estrito**; módulos ES.
- **Funções pequenas e puras** sempre que possível; efeitos colaterais nas bordas.
- **Injeção por parâmetro**, sem contêiner de injeção: o relógio, a aleatoriedade e os clientes de rede entram como argumentos.
  ```ts
  type Deps = { now: () => Date; random: (n: number) => Uint8Array };
  ```
- **Erros tipados** (`class RateLimitedError extends Error`), nunca `catch` vazio.
- Nomes em inglês no código; mensagens de usuário em português.
- Um arquivo, uma responsabilidade; sem arquivos "utils".
- Sem frameworks pesados: front-end em TypeScript com Vite e componentes simples; relayer com um servidor HTTP leve.
- **Lógica fora da tela:** tudo que decide, cifra ou fala com a rede mora em `packages/*-client`; a tela só liga campos e mostra resultados. É o que permite testar tudo por script, sem navegador.
- **Sem abstração antes da segunda necessidade.**
- Configuração por variáveis de ambiente lidas **uma vez** em `config.ts`.

## 4. Scripts da raiz (a criar na Fase 1)
| Script | O que faz |
|---|---|
| `npm run guardrails` | Verifica ausência de rede de anonimato (já existe) |
| `npm run test:guardrails` | Testes do guardrail (já existe) |
| `npm run typecheck` | TypeScript em todos os pacotes |
| `npm test` | Testes unitários de todos os pacotes |
| `npm run test:integration` | Sobe fork local e nó Arkiv local e roda os testes de integração |
| `npm run test:e2e` | Fluxos completos por script, sem navegador (sobe os nós locais e o relayer) |
| `npm run test:validation` | Validações da Fase 0 (exige acessos externos) |
| `npm run ci` | `guardrails` → `typecheck` → `test` → `test:integration` → `test:e2e` |

## 5. Nós locais para testes
Definidos em `tests/fixtures/docker-compose.yml`:
- fork local da Sepolia (anvil) na porta 8545;
- nó Arkiv local de desenvolvimento na porta 8546.

Esses nós usam apenas rede local e RPC público para o fork.

## 6. Git e licença
- Repositório próprio (hoje a pasta está dentro de um repositório maior).
- `.gitignore`: `node_modules`, `dist`, `.env`, `data`.
- Licença open source a definir antes de abrir o repositório.
