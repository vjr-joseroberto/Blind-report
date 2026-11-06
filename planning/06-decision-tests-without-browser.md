# Decision D-01 — Tests only by script, without a browser

**Status:** approved. **Date:** 2026-11-01.

## 1. Decision
All Safe Whistle tests are **scripts run in Node** (Vitest and `node --test`). **There is no automated browser** (Playwright, Selenium, Puppeteer or similar) at any test level.

## 2. Why this is viable
What would require a browser is the front-end logic. To take it out of the screen, the plan now has **interface-less clients**:
- `packages/source-client`: all the source logic (look up, compose, encrypt, prove, submit, receipt, replies, verification).
- `packages/newsroom-client`: all the newsroom logic (registration, keys, journalists, list, decryption, status, reply, retention).

The screens (`apps/web-source`, `apps/web-newsroom`) are **thin**: they connect fields to the clients and show the result. Since encryption happens in JavaScript with libsodium, it runs the same in Node and in the browser, so the Node tests exercise the same code.

## 3. What changed in the documents
| Document | Change |
|---|---|
| `01-requirements.md` | New constraint RC-08; verification of RNF-01, RNF-04, RNF-08 and RNF-09 now uses scripts, static analysis and the manual list M-01 |
| `02-phase-0-validation.md` | V-05 becomes static analysis of the IDKit package; V-07 becomes measurement in Node |
| `03-monorepo-structure.md` | New packages `source-client` and `newsroom-client`; thin screens; E2E by script |
| `04-tdd-strategy.md` | Test-level table without Playwright; request recorder; proof provider as stand-in |
| `05-development-plan.md` | Phases 8, 9 and 10 rewritten; Phase 11 uses list M-01 |
| `../docs/02-technologies.md` and `../docs/03-components.md` | No Playwright; new components |

## 4. New analysis: what each risk requirement now uses
| Requirement | How it is verified now (by script) | Coverage |
|---|---|---|
| RNF-01 Secrecy (no original text or private key on the network) | Request recorder injected in the clients and in the relayer; assertion on every sent body | **Total** for the client code |
| RNF-03 Envelope integrity | Unit and property tests of `crypto` | **Total** |
| RNF-04 No third parties | Request recorder (hosts); static analysis of the generated HTML and bundle; generated CSP test | **Partial**: does not prove that the browser applies the CSP nor what IDKit does at runtime |
| RNF-05 No anonymity network | `guardrails`, dependency test, `guardedFetch` | **Total** |
| RNF-08 Performance | Node script (V-07); end-to-end submission goal measured in the E2Es | **Good**; optional manual browser check |
| RNF-09 Usability | Tests of error causes and the receipt; manual review | **Partial**: screen appearance and flow are not automated |
| UC-06 to UC-10 (flows) | E2E by script using the clients | **Total** for the logic; does **not** exercise clicks and fields |
| World ID on screen | Simulated verifier and proof provider; real proof only in Phase 0 | The IDKit **widget** is **not** tested by automation |

## 5. What is lost and how to mitigate it
| What is lost | Mitigation |
|---|---|
| Confirming that the **browser applies the CSP** and that the page loads nothing from third parties at runtime | Static analysis of the generated HTML and bundle + generated CSP test + **manual list M-01** |
| Testing real **clicks, fields and messages** of the screen | Thin screens without logic; client tests cover the decisions; optionally, simulated DOM in Node (jsdom) for basic rendering; manual review in list M-01 |
| Browser-specific behavior (local storage, ArrayBuffer, WebAssembly) | Libsodium uses the same JavaScript engine and WebAssembly; manual check in list M-01 |
| The **IDKit widget** | It is no longer automatable (depends on the phone); it is isolated behind the `ProofProvider` and verified manually |
| Visual regressions | Accepted in the MVP |

**Accepted residual risks:** an error that only appears in the browser (for example, an incompatible library) can escape the automated tests. The risk is small because the logic is the same in Node and the screens are thin, and it is reduced by list M-01.

## 6. Manual checklist M-01 (before considering the MVP ready)
Done **once**, by a person, in a common browser (**no anonymity network**), with the built app pointing to the local nodes or the test networks.

1. Open the source screen with the browser network panel open: confirm that only the network policy hosts appear (RPC, World, relayer) and **no** third-party ones (fonts, scripts, analytics).
2. Check that the page has the expected CSP header (see in the network tab or the source code) and that a request to a non-allowed host is blocked by the browser.
3. Walk through the submission flow: text, small attachment, proof (simulated), receipt; confirm that the receipt can be downloaded and restored.
4. Open the newsroom panel: list, decrypt, change status and reply.
5. Go back to the source screen and read the reply with the receipt.
6. Encrypt a ~100 KiB file and note the perceived time.
7. Read the main error messages (proof denied, limit reached, nonexistent name) and check whether they state the cause and what to do.
8. Record the result in `validation/RESULTS.md`.

## 7. Effort impact
- **Less:** no browser automation, no interface fixtures, simpler E2E environment.
- **More:** two new packages (`source-client`, `newsroom-client`) and the discipline of keeping the screens thin. It is the same logic that would already exist, just organized outside the screen.

Net effect: **total effort less than or equal**, with faster and more stable tests.

## 8. Out of scope
This decision is about **tests**. It does not change the product: the front-ends continue to exist and run in the user's browser. It also does not change the guardrail: any anonymity network remains forbidden.
