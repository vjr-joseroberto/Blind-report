# Test-driven development strategy (TDD)

## 1. Cycle
All code is born from a failing test.

1. **Red:** write **one** small test that describes the desired behavior and see it fail for the right reason.
2. **Green:** write the **minimum** code to pass.
3. **Refactor:** improve the code and the tests, with everything green.
4. Repeat. One commit per short cycle, or one per green set.

Rules:
- Do not write production code without a red test.
- Do not write two red tests at the same time.
- A test checks **one** thing and has a name that describes the behavior: `recusa_envio_quando_limite_da_epoca_foi_atingido`.
- The test is the specification: if the requirement changes, the test changes first.

## 2. Test levels
| Level | What it tests | Tool | Network | Where |
|---|---|---|---|---|
| **Unit** | Pure functions and isolated modules | Vitest | None | `packages/*/test`, `apps/*/test` |
| **Properties** | Cryptography and part-splitting invariants | Vitest + fast-check | None | `packages/crypto/test`, `packages/core/test` |
| **Contract** | Packages respect their dependencies and interfaces | Vitest | None | `tests/contract` |
| **Integration** | Package against the real local system | Vitest | local fork and local Arkiv node | `packages/ens-client/test/integration`, `packages/arkiv-store/test/integration` |
| **Interface-less clients** | The logic of each side (`source-client`, `newsroom-client`) | Vitest | None (network injected and recorded) | `packages/*-client/test` |
| **Thin screen layer** | Only what the screen generates: HTML with no third parties, CSP, and (optional) simulated DOM in Node | Vitest | None | `apps/web-*/test` |
| **E2E by script** | Complete flows with relayer, local ENS and Arkiv, **no browser** | Vitest | local | `tests/e2e` |
| **Validation** | Characterizes external behavior (Phase 0) | Vitest (`@validation`) | public RPCs, World, Rabdi | `validation/` |
| **Guardrail** | Absence of anonymity networks | `node --test` | None | `guardrails/` |

**We do not use an automated browser** (Playwright, Selenium or similar): all tests are scripts run in Node. For that, the front-end logic lives in interface-less clients, and the E2Es use those clients. Details, what is gained and what is left out are in `06-decision-tests-without-browser.md`.

Target ratio: many unit tests, some integration tests, few E2Es.

## 3. Rules on stand-ins
- **Network boundaries are injected.** ENS client, Arkiv client, World verifier, clock and randomness come in as parameters.
- Prefer **simple fake implementations** (fake verifier, in-memory repository) to *mocks* with call expectations.
- The World verifier has three versions with **the same contract**: simulated (unit and E2E tests), real in a test environment (validation only, if there is access) and real production.
- The **proof provider** (`ProofProvider`) of `source-client` is another stand-in: on screen it is IDKit; in tests it returns simulated proofs or errors (denied, expired, canceled).
- Every stand-in is covered by a **contract test** that exercises it together with the real implementation, so they do not diverge.
- Never mock cryptography: libsodium runs for real in the tests.

## 4. Determinism
- The **clock** and **randomness** are dependencies (`now`, `random`), so tests control the epoch and generate predictable keys when necessary.
- Tests depend neither on time, execution order nor external network (except `@validation`).
- Local nodes are recreated on each integration run; unique names and labels per run.

## 5. Network rules in tests (guardrail)
- Unit tests: **no** network.
- Integration and E2E: only `localhost` and the public RPC used for the fork.
- Validation: common RPCs, World API, Rabdi.
- **Forbidden**: any anonymity network (`../GUARDRAILS.md`). The **request recorder** (an injected `fetch` that records destination and body) makes the tests **fail** if the system contacts a host outside the network policy list or sends original text or a private key.

## 6. Test organization
- Each package has `test/` next to `src/`; files end in `.test.ts`.
- Integration in `test/integration/` with suffix `.int.test.ts`; E2E by script in `tests/e2e/*.e2e.test.ts`.
- Fictitious test data in `tests/fixtures/`.
- Each requirement (RF-xx) appears in the name or description of at least one test: `describe('RF-07 encrypt tip', ...)`.

## 7. Quality
| Item | Goal |
|---|---|
| Line coverage | ≥ 90% in `core` and `crypto`; ≥ 80% in the rest |
| Flaky tests | Zero tolerance: an unstable test is fixed or removed |
| Speed | Full unit suite in under 30 s |
| Mutation (optional, after the MVP) | Apply to `crypto` and `worldid-gate` |

## 8. Example of cycles (`crypto` package)
```ts
// 1) RED — the test describes the behavior
it("the newsroom opens the envelope that the source encrypted", () => {
  const redacao = newKeypair();
  const { envelope } = seal({ newsroom: "investiga.jornal.eth", pubkeyVersion: 1, category: "corrupcao",
    recipients: [{ id: "redacao", publicKey: redacao.publicKey }], plaintext: utf8("texto fictício") });
  expect(text(open(envelope, "redacao", redacao))).toBe("texto fictício");
});
// 2) GREEN — implement seal/open with the minimum
// 3) REFACTOR — extract the authenticated data assembly
// Next red: "changing the category invalidates opening"
// Then: property — for any text, open(seal(x)) == x
```

## 9. Per-task workflow
1. Choose a requirement (RF-xx) and an acceptance criterion.
2. List the necessary tests (short list, ordered from simplest to most complex).
3. Run the red, green and refactor cycles for each item in the list.
4. Run `npm run ci` locally.
5. Update `docs/` if the behavior or design changed.

## 10. Definition of done (per task)
- All new and old tests pass.
- `npm run guardrails` passes.
- Coverage at least at the package goal.
- No code without a test, no `TODO` without an associated requirement.
- Documentation updated, when relevant.
- Peer review or self-review with the checklist (security, privacy, network).

## 11. Security and privacy checklist (per task)
- Does any **original text** or **private key** go to the network or the log?
- Does any stored attribute **identify the source**?
- Does the code contact a **host outside** the network policy?
- Is there a **new dependency**? Is it from an anonymity network? (forbidden)
- Does the error shown to the user reveal internal details?
