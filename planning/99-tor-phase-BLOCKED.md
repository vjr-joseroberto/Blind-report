# Phase 12 — Demonstration with anonymity network

## ⛔ STATUS: BLOCKED

| Field | Value |
|---|---|
| Status | **BLOCKED** |
| Since | 2026-10-31 |
| Decision owner | Project owner |
| Reason | Anonymity networks (Tor and similar) are **forbidden** on the work computer where the system is developed; additionally, network protection is the end user's choice, outside the app |
| Review deadline | None. It is only reviewed by an explicit, written decision of the owner |

## What the phase would be
A demonstration in which the source flow (look up the newsroom, submit the tip, receive the reply) is accessed through an anonymity network, to show that the app works over it **without embedding** any. The execution would be done **by another person, on another machine where this is allowed**, without changing the project code. The walkthrough of a previous version is in `../../MODO-TOR.md` (source project folder) and serves only as historical reference.

## While it is blocked
- **No task** of this phase is created, estimated or executed.
- **No test**, dependency, script, configuration or command uses Tor, Nym, Nox, I2P, Lokinet, anonymity SOCKS or Anon-RPC.
- **No code** in the monorepo contains anonymity network support. The app works over any ordinary network and the end user decides, outside the app, whether to use a VPN or another tool.
- The development assistant **does not** unblock it, does not execute it and does not propose to execute it.
- The MVP uses a common **public RPC**.

## How the block is enforced
| Layer | What it does |
|---|---|
| `guardrails/check.mjs` | Fails if any code or configuration mentions those networks |
| `guardrails/patterns.test.mjs` | Tests the guardrail itself |
| `.claude/hooks/block-anon.mjs` | Denies assistant commands and writes that use them |
| `CLAUDE.md` | Explicit instruction to the assistant |
| `packages/network-policy` (Phase 1) | Refuses at runtime any host outside the list; no SOCKS |
| Dependency test (Phase 1) | Fails if an anonymity network package appears in any `package.json` |
| `npm run ci` | Runs the guardrail before everything |

## Conditions to unblock
**All** the conditions below are mandatory, and the decision belongs to the project owner:

- [ ] **Explicit and written** decision of the owner, recorded in the table below.
- [ ] Confirmation that the execution environment **allows** the network (another machine, outside the work computer).
- [ ] Execution **outside this repository and this machine**, by an identified person.
- [ ] **No** modification of the main code to support the anonymity network; the app remains network-agnostic.
- [ ] Transparency text in the project material: who executed it, where and when.
- [ ] The guardrail remains active and passing in the main repository.

Even when unblocked, the phase does **not** authorize Tor code in the repository: it only authorizes an external demonstration.

## Decision log
| Date | Decision | Who |
|---|---|---|
| 2026-10-31 | Phase created already **BLOCKED**. The project does not use Tor or similar networks | Project owner |
