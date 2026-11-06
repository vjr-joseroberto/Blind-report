# Monorepo structure

Goal: a simple repository, with clear boundaries between components, in which each package is testable in isolation. **No anonymity network** anywhere (`../GUARDRAILS.md`).

## 1. Tree
```
safe-whistle/
├── package.json                  workspaces + root scripts
├── tsconfig.base.json            common TypeScript options
├── vitest.workspace.ts           per-package test configuration
├── guardrails/                   (exists) verifier, patterns and guardrail tests
├── .claude/                      (exists) assistant hook
├── docs/  planning/          (exist)
├── packages/
│   ├── core/                     types, constants and pure rules
│   │   ├── src/                  index.ts, types.ts, epoch.ts, action.ts, policy.ts, parts.ts
│   │   └── test/
│   ├── crypto/                   envelope, mailbox, commitment
│   │   ├── src/                  keys.ts, seal.ts, open.ts, commitment.ts, mailbox.ts
│   │   └── test/
│   ├── ens-client/
│   │   ├── src/                  reader.ts, admin.ts, dns.ts, abis/
│   │   └── test/                 unit/ and integration/ (local fork)
│   ├── arkiv-store/
│   │   ├── src/                  schemas.ts, submissions.ts, replies.ts, annotations.ts, retention.ts
│   │   └── test/                 unit/ and integration/ (local Arkiv node)
│   ├── worldid-gate/
│   │   ├── src/                  rpContext.ts, gate.ts, verifier.ts, nullifierStore.ts
│   │   └── test/
│   ├── network-policy/
│   │   ├── src/                  allowlist.ts, guardedFetch.ts, recorder.ts, csp.ts
│   │   └── test/
│   ├── source-client/            all the source logic, without interface
│   │   ├── src/                  lookup.ts, compose.ts, submit.ts, receipt.ts, replies.ts, verify.ts
│   │   └── test/
│   └── newsroom-client/          all the newsroom logic, without interface
│       ├── src/                  register.ts, keys.ts, journalists.ts, inbox.ts, annotate.ts, reply.ts, retention.ts
│       └── test/
├── apps/
│   ├── relayer/
│   │   ├── src/                  server.ts, routes/, services/, jobs/renewal.ts, config.ts
│   │   └── test/
│   ├── web-source/               thin screen layer over source-client
│   │   ├── src/                  main.ts, views/
│   │   └── test/                 HTML with no third parties, CSP (static)
│   └── web-newsroom/             thin screen layer over newsroom-client
│       ├── src/
│       └── test/
├── tests/
│   ├── e2e/                      complete flows by script (no browser): relayer + local nodes + clients
│   ├── fixtures/                 fictitious data, test keys, docker-compose for the local nodes
│   └── contract/                 contract tests between packages
└── validation/                   Phase 0 characterization tests (@validation)
```

## 2. Dependency rules
```
core ◄── crypto | ens-client | arkiv-store | worldid-gate | network-policy
packages ◄── relayer
core, crypto, ens-client, network-policy ◄── source-client
core, crypto, ens-client, arkiv-store, network-policy ◄── newsroom-client
source-client ◄── web-source
newsroom-client ◄── web-newsroom
```
- No arrow points back (no cycles).
- **Screens only call the clients**: no business rule, encryption or network access inside `apps/web-*`.
- `core` and `crypto` **do no networking**.
- Only `network-policy` decides which hosts can be contacted; all network code uses `guardedFetch`.
- A contract test checks the `package.json` files: a package only declares the dependencies allowed here, and **none** from an anonymity network.

## 3. Code conventions (MVP-simple)
- **Strict TypeScript**; ES modules.
- **Small, pure functions** whenever possible; side effects at the edges.
- **Injection by parameter**, no injection container: the clock, randomness and network clients come in as arguments.
  ```ts
  type Deps = { now: () => Date; random: (n: number) => Uint8Array };
  ```
- **Typed errors** (`class RateLimitedError extends Error`), never an empty `catch`.
- English names in the code; user messages in English.
- One file, one responsibility; no "utils" files.
- No heavy frameworks: front-end in TypeScript with Vite and simple components; relayer with a lightweight HTTP server.
- **Logic outside the screen:** everything that decides, encrypts or talks to the network lives in `packages/*-client`; the screen only wires fields and shows results. That is what makes it possible to test everything by script, without a browser.
- **No abstraction before the second necessity.**
- Configuration by environment variables read **once** in `config.ts`.

## 4. Root scripts (to create in Phase 1)
| Script | What it does |
|---|---|
| `npm run guardrails` | Checks for the absence of anonymity networks (already exists) |
| `npm run test:guardrails` | Guardrail tests (already exists) |
| `npm run typecheck` | TypeScript in all packages |
| `npm test` | Unit tests of all packages |
| `npm run test:integration` | Starts local fork and local Arkiv node and runs the integration tests |
| `npm run test:e2e` | Complete flows by script, without browser (starts the local nodes and the relayer) |
| `npm run test:validation` | Phase 0 validations (requires external access) |
| `npm run ci` | `guardrails` → `typecheck` → `test` → `test:integration` → `test:e2e` |

## 5. Local nodes for tests
Defined in `tests/fixtures/docker-compose.yml`:
- local Sepolia fork (anvil) on port 8545;
- local Arkiv development node on port 8546.

These nodes use only the local network and the public RPC for the fork.

## 6. Git and license
- Own repository (today the folder is inside a larger repository).
- `.gitignore`: `node_modules`, `dist`, `.env`, `data`.
- Open source license to be defined before opening the repository.
