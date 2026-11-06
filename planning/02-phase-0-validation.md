# Phase 0 — Validation

**Goal:** turn each technical question into a **characterization test** that discovers the real behavior and decides the design before building. Each validation generates a test marked `@validation`, which **does not run in the default CI** (requires external access), but stays in the repository as executable documentation.

**Effort:** M. **Access prerequisites:** access key and tGLM from Arkiv, app in the World Developer Portal (World ID 4.0), wallet with Sepolia ETH. Without these accesses, validations V-01 to V-03 remain pending and development proceeds with **simulated verifiers**.

**Network:** only common public RPCs, the Rabdi RPC, the World API and ENS on Sepolia. **No anonymity network.**

## Method
1. Write the **characterization test** (what we expect to observe).
2. Run against the real environment and record the result.
3. If the result contradicts the design, **update** `../docs/` and the requirements **before** Phase 1.
4. Save the result in `validation/RESULTS.md`.

## Validations
| ID | Question | Characterization test | Decides |
|---|---|---|---|
| **V-01** | Real cost, byte limit and behavior on **Rabdi** | Create entities of 1 KiB, 64 KiB and ~126 KiB; measure gas; create and read by filter; expire and extend | Attachment limit per entity; cost per tip; default expiration value |
| **V-02** | **Real World ID proof** and nullifier per action | Generate proof in the simulator (`environment: staging`); verify via the v4 API; repeat on the same action and on another | Whether the gate with `(nullifier, action)` works as assumed; minimum credential |
| **V-03** | **ENS flow on real Sepolia** | Execute: own resolver → register name → text → delegate → resolve by name; note gas and time per step | Registration time (60 s commit-reveal), cost, UX adjustments |
| **V-04** | **Subnames:** expiration, revocation and transfer | Register subname with short expiration; revoke; transfer; verify reading and writing afterward | How to register and revoke journalists (RF-04 and RF-05) |
| **V-05** | **Client network:** which hosts IDKit contacts | **Static analysis by script** of the installed IDKit package: extract the domains and schemes (`https://`, `wss://`) that the code references, and classify which are necessary | Initial allowed-hosts list of the network policy (RF-20, RNF-04). Runtime confirmation is in manual list M-01 |
| **V-06** | **Public RPC:** rate limits and stability | Burst of reads; measure errors and latency; switch RPC | How many queries per screen; retry strategy; default and alternative RPCs |
| **V-07** | **Encryption performance** | Node script that encrypts and decrypts 1 KiB, 100 KiB and 1 MiB and measures the time (libsodium runs on the same V8 engine and WebAssembly as Chromium-based browsers) | RNF-08 goal. A manual browser check goes into list M-01 |
| **V-08** | **Newsroom as custodian:** the newsroom wallet can extend and delete after `changeOwnership` | Transfer and execute the operations with the new owner | Design of the renewal job (RF-18) |

Outside the scope of this phase: Swarm, reading ENS inside a contract, any anonymity network.

**Walkthrough of what to do by hand** (wallets, faucets, Arkiv key, World app, decisions): `07-manual-walkthrough-phase-0.md`. Validations V-04, V-05, V-06, V-07 and V-08 do not depend on you; V-01, V-02 and V-03 do.

## Outputs
- `validation/RESULTS.md` with the results table.
- Decisions recorded in `../docs/` (if anything changed).
- Final list of **stand-ins** that development will still need: for example, the simulated World verifier if V-02 cannot be done.

## Definition of done
- All validations have a recorded result, or are marked **blocked by access** with the corresponding stand-in defined.
- No design decision was left depending on an untested assumption.

## Risks
| Risk | Response |
|---|---|
| Missing accesses (Arkiv, World, test ETH) | Proceed with stand-ins; rerun the validations when the accesses arrive |
| The ENSv2 was redeployed | Recheck addresses and ABIs at the start; integration tests use a local fork |
| The public RPC limits or goes down | Support for configurable RPC and retry with backoff (decided in V-06) |
