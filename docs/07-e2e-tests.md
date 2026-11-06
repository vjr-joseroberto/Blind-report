# End-to-end tests (no browser)

`npm run test:e2e` brings up the local Sepolia fork (port 8545) and the local Arkiv node (8546), runs the scenarios and shuts down the nodes at the end, even if it fails. It is not part of `npm run ci` (it is slow); the fast TDD cycle continues in the unit tests.

## What comes up
| Piece | How |
|---|---|
| ENS | Sepolia fork (anvil) with the real ENSv2 |
| Arkiv | Local development node, 2 s blocks |
| Relayer | **Real child process** (`apps/relayer/src/main.ts`), with `SIMULATE_WORLD=1` |
| Source, newsroom, journalist | `source-client` and `newsroom-client`, each with a **request recorder** |

Everything on localhost. No anonymity network. The relayer only accepts `SIMULATE_WORLD=1` when both RPCs are local; in any other case it refuses to start.

## What the simulated World covers (and what it does not)
The simulated verifier approves any proof. The rule "one person per newsroom per epoch" is still really tested, because it comes from the nullifier, which the test generates per person and per action (as the protocol does). The real World proof was validated separately in V-02 (World simulator, `staging`).

## Scenarios (`tests/e2e/safe-whistle.e2e.test.ts`)
| Scenario | What it proves |
|---|---|
| UC-01 to UC-03 | Registration with the commit steps; public key, version, policy and custodian readable through ENS; journalist active in the registry; keyring encrypted for their key; third parties cannot open |
| UC-05 and UC-06 | The source looks up, encrypts, goes through the real relayer and receives the receipt; the tip appears for the newsroom |
| UC-07 and UC-08 | The journalist lists, decrypts and classifies without changing the envelope |
| UC-09 and UC-10 | The journalist replies; only the source who owns the receipt reads |
| UC-11 and UC-12 | Hash and block of the published file; proof of authorship (and rejection of the wrong text) |
| Limit | The second submission from the same person is refused (`limit_reached`); another person is accepted |
| Rotation | A source with the old key cached submits; the relayer refuses; it encrypts again; the journalist decrypts both versions |
| Retention | The renewed tip remains and the non-renewed one disappears (30 s life on the local node) |
| RNF-01 | No request from the sources, the journalist or the administrator contains the text, the salt, the receipt key or the newsroom private key (in plaintext, base64url or hex); the relayer log has no text, IP or proof |
| RNF-04/05 | Only `127.0.0.1` was contacted |

## Limits
- The expiration time is real (the retention scenario waits ~45 s).
- It does not exercise clicks or screen fields: that is in the manual checklist M-01 (Phase 11).
- The World proof is simulated; the real one was validated in V-02.
