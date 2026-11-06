# Components

Monorepo with npm workspaces. The detailed structure is in `planning/03-monorepo-structure.md`.

## 1. Component status
| Component | Status | Where |
|---|---|---|
| **guardrails** | **Created and tested** (6 tests) | `guardrails/`, `.claude/` |
| `packages/core` | Planned | — |
| `packages/crypto` | **Prototyped** in the POCs (20 tests); will be rewritten with TDD | `../POC-Cofre/poc-cripto` |
| `packages/ens-client` | **Created and tested** (30 unit + 11 integration on the fork). Journalists live under the newsroom's second-level `.eth` | `packages/ens-client` |
| `packages/arkiv-store` | **Created and tested** (44 unit + 14 integration on the local node): store, in-memory double and SDK backend, with the same contract suite | `packages/arkiv-store` |
| `packages/worldid-gate` | **Created and tested** (58 tests): signed RP context, gate, real and simulated verifier, in-memory and file store. Real proof validated in the simulator (V-02) | `packages/worldid-gate` |
| `packages/network-policy` | Planned | — |
| `packages/source-client` | **Created and tested** (41 tests): lookup, composition, submission, receipt, replies, verification, network policy, headless IDKit | `packages/source-client` |
| `packages/newsroom-client` | **Created and tested** (30 tests): registration with progress, keyring with versions, password backup, keyring for journalists, inbox, decryption, status, replies, retention | `packages/newsroom-client` |
| `apps/relayer` | **Created and tested** (43 unit + 4 integration). See `05-relayer-api.md` | `apps/relayer` |
| `apps/web-source` | **Created** (21 tests: controller and static analysis). `npm run build -w apps/web-source` generates `dist/`. Screens in `06-screens.md` | `apps/web-source` |
| `apps/web-newsroom` | **Created** (20 tests: controller and static analysis). `npm run build -w apps/web-newsroom` generates `dist/` | `apps/web-newsroom` |
| `tests/e2e` | Planned (scripts, no browser) | — |

The POCs are **reference**: the final code is written with TDD in the monorepo, and POC code is not copied without tests.

## 2. Responsibilities

### `packages/core` — types and pure rules
- Types: `Envelope`, `Receipt`, `NewsroomPolicy`, `Annotation`, `Reply`.
- Constants: size limits, ENS text key names, action prefix.
- Pure functions: `epochOf(date)`, `actionFor(newsroom, epoch)`, `parsePolicy(json)`, `validateSubmission(policy, submission)`, `splitIntoParts(bytes)`.
- **No network dependencies.**

### `packages/crypto` — client-side cryptography
- `newKeypair()`, `seal(opts)`, `open(envelope, recipient, keypair)`.
- `commitmentOf(plaintext, salt)`, `verifyContentHash(envelope)`, `verifyCommitment(...)`.
- `mailboxId(pub)`, `sealReply(...)`, `openReply(...)`.
- Runs in the browser and in Node. Depends only on `core` and libsodium.

### `packages/ens-client` — ENS
- **Reader:** `resolveNewsroom(name)` returns public key, version, policy and custodian; `resolveReaderKey(name)`; `ownerOf(subname)`; **`isActiveJournalist(name)`**, which checks in the registry whether the subname has an owner (the reader key remains readable after revoking or expiring, so **never** trust only the text).
- **Administration:** `createNewsroom(...)`, `publishKey(...)`, `rotateKey(...)`, `addJournalist(...)` (no transfer role), `revokeJournalist(...)` (`unregister` and then clear `denuncia.readerkey`), `renewJournalist(...)`.
- Receives a `viem` client by injection, so it can be tested against a local fork.

### `packages/arkiv-store` — Arkiv
- Schemas `denuncia`, `resposta`, `anotacao`.
- `publishSubmission(...)`: creates the entity (binary, `readonly`), **transfers custody** to the newsroom.
- `listSubmissions({ newsroom, status })`, `getByMailbox(mailboxId)`, `annotate(...)`.
- `renewRetention(...)`, `splitAndStore(...)` for large attachments.

### `packages/worldid-gate` — anti-spam
- `rpContextFor({ newsroom, epoch })`: signature generated on the server.
- `SubmissionGate.admit(...)`: validates environment, action, proof (injectable verifier) and uniqueness of `(nullifier, action)`.
- Real verifier (World API) and simulated verifier for tests.

### `packages/network-policy` — network policy
- List of allowed hosts: configurable RPC, World, relayer.
- `guardedFetch(url, init)`: refuses any host outside the list.
- `recorder`: an injectable `fetch` that **records the destination and body** of requests; the tests use it to prove that nothing confidential left and that only declared hosts were contacted.
- `cspFor(policy)`: generates the content security policy.
- Part of the guardrail in execution (`../GUARDRAILS.md`).

### `packages/source-client` — source logic (no UI)
- `lookupNewsroom(name)`, `compose(...)` (validates against the policy and splits attachments), `submit(...)` (encrypts, requests the proof, sends to the relayer, returns the receipt), `readReplies(receipt)`, `verifyDocument(file)`, `proveAuthorship(...)`.
- Receives by injection: `fetch` (wrapped by `guardedFetch`), ENS client, clock, randomness and a **proof provider** (`ProofProvider`): in the screen it is IDKit, in the tests it is a double.
- It is tested entirely via script, **no browser**.

### `packages/newsroom-client` — newsroom logic (no UI)
- `registerNewsroom(...)`, `generateAndPublishKey(...)`, `exportKey(password)` / `importKey(...)`, `addJournalist(...)`, `revokeJournalist(...)`.
- `listInbox(filters)`, `decrypt(entry)`, `annotate(...)`, `reply(...)`, `listExpiring()`, `renew(...)`.
- Same injection as `source-client`. The private key never leaves the client.

### `apps/relayer` — HTTP service
- `POST /submissions`: verifies World ID, validates against the ENS policy, publishes to Arkiv, transfers custody.
- `GET /rp-context`: returns the RP signature for IDKit.
- `GET /health`.
- Retention renewal routine.
- **No logs of IP or request body.**

### `apps/web-source` — source screen (thin layer)
- Connects the fields to `source-client` and shows the result: look up newsroom, fill in tip, prove humanity (IDKit), submit, save receipt, reply box, verify authorship and integrity.
- **No business logic, encryption or network of its own.** Static; no trackers; configure the RPC.

### `apps/web-newsroom` — newsroom panel (thin layer)
- Connects the fields to `newsroom-client`: registration, key and policy, journalists, list, local decryption, status and replies.

### `tests/e2e` — scripts, no browser
Scripts that bring up the local Sepolia fork, the local Arkiv node and the relayer, and walk through the use cases using `source-client` and `newsroom-client`. A request recorder confirms that nothing confidential leaves and that only declared hosts are contacted.

## 3. Allowed dependencies
```
core ◄── crypto
core ◄── ens-client
core ◄── arkiv-store
core ◄── worldid-gate
core ◄── network-policy
crypto, ens-client, arkiv-store, worldid-gate, network-policy ◄── relayer
core, crypto, ens-client, network-policy ◄── source-client ◄── web-source (+ ens-client, arkiv-store, network-policy only to wire the real services)
core, crypto, ens-client, arkiv-store, network-policy ◄── newsroom-client ◄── web-newsroom
```
Rules: no arrow goes back; `core` and `crypto` do not do networking; only `network-policy` decides which hosts can be contacted; the screens only call the clients.

## 4. POC code to use as reference
| POC | What it contains | Becomes |
|---|---|---|
| `POC-Cofre/poc-cripto/envelope.ts` | Envelope, mailbox, commitment | `packages/crypto` |
| `POC-Cofre/poc-arkiv/schemas.ts`, `run.ts` | Schemas and measured behavior | `packages/arkiv-store` |
| `POC-Cofre/poc-worldid/gate.ts` | Gate, RP signature | `packages/worldid-gate` |
| `POC-Cofre/poc-ens/run.ts`, `POC-ENS/src/*` | ENS flow (resolver, registration, text, permissions) | `packages/ens-client` |
| `POC-ENS/api/*` | Test API with Swagger | Reference; not part of the product |
