# Security and privacy review (Phase 11, automated part)

Done with the checklist from `planning/04-tdd-strategy.md` §11, over the code of Phases 1 to 10. Each item points to the test that protects it.

## 1. Checklist
| Question | Result | Evidence |
|---|---|---|
| Does any **original text** or **private key** go to the network or the log? | No | `source-client`: `cifra_antes_de_enviar…`, `nao_envia_a_chave_privada_nem_o_sal`; E2E "RNF-01" looks for text, salt, receipt key and newsroom private key (text, base64url and hex) in all requests; the relayer log has only route, status and code |
| Does any stored attribute **identify the source**? | No | The writer is the relayer. Attributes: newsroom, category, epoch, hash of the encrypted content, key version. The World proof is never stored (RN-05); the store keeps only a hash of the nullifier with the action |
| Does the code contact a **host outside** the policy? | No | `guardedFetch` in all clients and in the relayer; CSP generated from the policy; E2E "RNF-04/05"; `static.test.ts` of both screens |
| **New dependency** on an anonymity network? | No | `npm run guardrails` (runs in `ci`) and the assistant hook; in this phase the checker blocked twice the text I wrote and I rewrote it, without bypassing |
| Does the **displayed error** reveal internal details? | No | Relayer: 500/502 without details; configuration: only variable names; clients: unexpected errors become "Something went wrong" (`erro_inesperado_vira_mensagem_generica…`) |

## 2. Considered threats and what was done
| Threat | Status |
|---|---|
| Abuse/DoS on the relayer (each request may cost an RPC query) | **Fixed in this phase:** global per-minute limit (`RATE_LIMIT_PER_MINUTE`, default 120) in a token bucket, **no IP** and no per-person state. Excess receives 429 with `retry-after`. The cheap checks already came before the World call |
| Unstable public RPC | **Handled:** `RPC_TRANSPORT` (3 retries with 400 ms backoff, maximum time of 15 s) in the relayer and screens |
| Simulated verifier in production | The relayer **refuses to start** with `SIMULATE_WORLD=1` if any RPC is not localhost, and warns in the log when active |
| Open CORS | Exact origins only; wildcard never accepted |
| Headers | `no-store`, `nosniff` in the relayer; `scripts/serve.mjs` sends the CSP as a header (includes `frame-ancestors`) |
| Secrets in browser storage | The panel does not store keys, passwords, receipts or backups. **Only exception (decided in Phase 13):** `names.ts` writes to `localStorage` only the **names** of newsrooms opened per wallet; a test checks that only that file touches storage and that it does not mention keys or passwords. Login is through the wallet: no private key is typed |
| Weak key backup | PBKDF2-SHA256 with 600 thousand iterations, new salt and nonce, authenticated block; minimum password of 8 characters; absurd iterations in the file are refused |
| Vulnerable dependencies | `npm audit --omit=dev`: **0 vulnerabilities** in the runtime dependencies. The full `npm audit` points to moderate warnings only in development tools (tests and build), which do not go to the browser or the relayer |
| Browser bundle with library URLs | List reviewed in each `static.test.ts`; none is in the CSP; a new host breaks the test |

## 3. Remaining risks (accepted in the MVP or out of scope)
1. **The relayer operator sees IP and time** on submission (the relayer does not record them, but the network delivers them). The mitigation is that the user chooses network protection on their own, outside the app.
2. **Wallet private key pasted into the panel.** Testnet only. Integrating a browser wallet is future work.
3. **Keys already delivered to a revoked journalist** continue to open old tips; the client recommends rotating the key.
4. **The M-01 checklist (real browser) has not been done yet:** there is no proof that the browser applies the CSP or that IDKit only contacts `bridge.worldcoin.org`. It is the next step, manual (`docs/09-manual-walkthrough.md`).
5. **Maximum life of 182 days in Arkiv:** without the renewal job running, the tips disappear. Not verified on Rabdi (only on the local node).
6. **World verification in `production`** was not tested (only `staging` through the simulator).
7. ~~Status notes were not authenticated.~~ **Fixed in Phase 13 (A1 to A3, A6).** The note only counts if the entity's `creator` (defined by the chain) is the administrator (custodian on ENS) or the owner of an active journalist subname, which the declared `authorName` must match. The others are ignored and counted (`ignoredAnnotations`). Accepted effect: when a journalist is revoked, what they noted no longer counts, because the check uses the current ENS state.
8. ~~Replies were not authenticated.~~ **Fixed in Phase 13 (A4, A5, A6).** The source screen only shows a reply whose `creator` is the administrator or an active journalist, whose encrypted content carries the same newsroom name; the others are ignored and counted. Replies in the old format (plain text) are also ignored. Failure to query ENS does not become authorization: the read fails.
9. **There is no individual recipient.** The source encrypts only for the newsroom key; it is not possible to send to a specific journalist (see `docs/09-manual-walkthrough.md` and the role explanation).
