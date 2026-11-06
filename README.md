# Blind Report

Anonymous whistleblowing channel for journalism. A source sends an encrypted document to a newsroom identified by an ENS name; only the newsroom can open it, the source proves they are a real and unique person without identifying themselves, and anyone can verify the date and integrity of what was received.

> **Prototype.** Fictional data only. No real source should rely on it.

## Technologies
ENSv2 (newsroom identity and public key) · Arkiv (queryable storage) · World ID (unique human, anti-spam) · libsodium (in-browser encryption) · TypeScript · public RPC. Script-based tests in Node (Vitest), **no automated browser**.

## Structure of this folder
```
blind-report/
├── docs/                  project information
│   ├── 01-caso-de-uso.md
│   ├── 02-tecnologias.md
│   ├── 03-componentes.md
│   ├── 04-arquitetura-e-dados.md
│   ├── 05-api-do-relayer.md
│   ├── 06-telas.md
│   ├── 07-testes-e2e.md
│   ├── 08-revisao-de-seguranca.md
│   ├── 09-roteiro-manual.md
│   ├── 10-crops.md
│   └── 11-world-idkit-debrief.md
├── arkiv/                 Arkiv track: schema.md, friction.md, criteria/ and query.ts
├── AI-USE.md              AI usage statement
├── planejamento/          requirements and development plan
│   ├── 01-requisitos.md
│   ├── 02-fase-0-validacao.md
│   ├── 03-estrutura-monorepo.md
│   ├── 04-estrategia-tdd.md
│   ├── 05-plano-de-desenvolvimento.md
│   ├── 06-decisao-testes-sem-navegador.md
│   ├── 07-roteiro-manual-fase-0.md
│   ├── 08-fase-13-carteira-papeis-e-correcoes.md
│   └── 99-fase-tor-BLOQUEADA.md       ⛔ status: blocked
├── packages/              core, crypto, network-policy, ens-client, arkiv-store, worldid-gate, source-client
├── apps/                  relayer, web-source
├── tests/                 contract/ and fixtures/ (local nodes)
├── validation/            Phase 0 scripts and RESULTADOS.md
├── guardrails/            the system uses no Tor or similar networks
├── .claude/               hook that enforces the guardrail on the assistant
├── GUARDRAILS.md
├── CLAUDE.md
├── LICENSE                MIT
├── .env.example           variables (the real .env stays out of git)
└── package.json
```

## Current status
- **Phases 1 to 13 completed in automated tests**, with TDD (over 600 unit tests, integration and end-to-end tests against ENS and Arkiv in a local environment, and 6 for the guardrail):
  - `packages/network-policy`: host policy, `guardedFetch`, request recorder, and CSP.
  - `packages/core`: monthly epoch, proof action, policy, validation, splitting into parts, base64url.
  - `packages/crypto`: envelope, mailbox, commitment, binary format.
  - `packages/ens-client`: reader (resolves the newsroom by name, active journalist) and administration (registration, key rotation, journalists).
  - `packages/arkiv-store`: publish with newsroom custody, list, annotate status, mailbox replies, retention, and attachment parts.
  - `packages/worldid-gate`: server-signed RP context, one-submission-per-person×newsroom×epoch gate, real and simulated verifier.
  - `apps/relayer`: HTTP server (`/rp-context`, `/submissions`, `/health`), strict CORS, no IP or body logging, retention renewal job.
- **Phase 0 (validation):** all completed (V-01 to V-08). V-02 was done in the World simulator on `staging`. Results in `validation/RESULTADOS.md`.
  - `packages/source-client` and `apps/web-source`: source logic without a UI and the thin screen (wireframes in `docs/06-telas.md`).
  - `packages/newsroom-client` and `apps/web-newsroom`: registration, keyring and backup, journalists, inbox, replies, and retention.
  - `tests/e2e`: end-to-end use cases with the real relayer, no browser (`docs/07-testes-e2e.md`).
- **In manual testing:** list M-01 in the browser, on real testnets (`docs/09-roteiro-manual.md`). Security review in `docs/08-revisao-de-seguranca.md`.
- **Phase 13 (done):** wallet login, roles (administrator and journalist), and authentication of annotations and replies (`planejamento/08-fase-13-carteira-papeis-e-correcoes.md`). Manual testing with MetaMask (M-02) remains.
- POC code (`../POC-Cofre`, `../POC-ENS`) is for reference only.

## Commands
```bash
npm install
npm run ci               # guardrails, guardrail tests, typecheck, and tests with coverage
npm test                 # unit and contract tests (vitest)
npm run guardrails       # checks the project's network rule
npm run test:integration # starts the local fork, runs integration tests, and shuts down nodes (~7 min)
npm run test:e2e         # end-to-end use cases with the real relayer (starts and shuts down nodes; ~5 min)
npm run relayer          # relayer with .env (testnets); web:source and web:newsroom open the screens; links shows the explorers
npm run nodes:up         # local Sepolia fork (:8545) and local Arkiv node (:8546), via Docker
npm run nodes:down
```

## Hackathon tracks

The project competes in four tracks. Overview and arguments: `docs/Safe-Whistle-Panorama-do-Sistema.docx` (section 9).

### Arkiv (Build on Arkiv)
Arkiv (testnet **Rabdi**, chain id 7794095) is the product's database. Schema in [`arkiv/schema.md`](arkiv/schema.md), friction points in [`arkiv/friction.md`](arkiv/friction.md), answers per criterion in [`arkiv/criteria/`](arkiv/criteria/README.md), and AI statement in [`AI-USE.md`](AI-USE.md).

**Wallets that write to Rabdi** (public test addresses):

| Role | Address | What it writes |
|---|---|---|
| Relayer | `0xd6eB8055311f1337ed033faAF944b03C4c8Ab974` | Creates each report and transfers ownership to the newsroom; extends deadlines |
| Newsroom administrator | `0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e` | Owns the reports; creates annotations and replies; extends deadlines |
| Journalist | `0xa63A63047e362EE0B8af09489DCA1dc172E507ca` | Creates annotations and replies under their name (no records observed yet) |

Explorer: https://rabdi.explorer.arkiv.network

**Executable query** (read-only; requires Node 22 or newer; `ARKIV_ACCESS_KEY` is optional, without it the public endpoint is rate-limited):
```bash
npm install
npm run arkiv:query -- jornalista1.eth                # reports, replies, and annotations for the newsroom
npm run arkiv:query -- jornalista1.eth denuncia       # a single collection
```
Real output (2026-11-01, excerpts): `denuncia: 1 entidade` with `owner` = administrator and `creator` = relayer (custody transferred), `attrs` with `newsroom`, `category`, `epoch`, `contentHash`; `dataBytes` shows only encrypted bytes.

### ENS (Best Use of ENSv2)
ENSv2 on Sepolia: each newsroom is a `.eth` with its own resolver (public key, version, policy, administrator) and a subname registry for the team. Roles and revocation are read from ENS. Walkthrough with the transactions to check on Etherscan: `docs/09-roteiro-manual.md`.

### CROPS (EF)
Properties, **list of contacted network addresses**, and trackers: [`docs/10-crops.md`](docs/10-crops.md). Open source (MIT), no third-party trackers, the app **does not embed an anonymity network** (network protection is the source's choice). The proof-of-humanity flow contacts World servers (declared there).

### World (Best Use of IDKit)
Minimal credential, success and alternative paths, and what was validated: [`docs/11-world-idkit-debrief.md`](docs/11-world-idkit-debrief.md).

## Golden rule
**No Tor or anonymity networks**, anywhere. Network protection is the end user's choice, outside the app. See `GUARDRAILS.md`.
