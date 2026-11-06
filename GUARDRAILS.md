# Guardrails — the system does not use Tor or anonymity networks

## Rule
Safe Whistle **does not use**, under any circumstances:

- Tor, Nym, Nox, I2P, Lokinet or any anonymity network or mixnet;
- anonymity SOCKS proxies and hidden service addresses;
- Anon-RPC and any of its workers (including Passthrough, which is not even needed here);
- any of these things in **code, tests, dependencies, configuration, scripts or commands**.

It applies to the app, the tests, the development tools and the assistant (Claude).

**Why**
- Development takes place on a work computer where these networks are forbidden.
- Network protection is the **end user's** decision: whoever wants to can use a VPN or Tor Browser on their own, outside the app. The app works on any network and **does not depend** on any of them.
- The MVP uses a common **public RPC**.

The demo phase with Tor is **BLOCKED**: see `planning/99-tor-phase-BLOCKED.md`.

## Layers

### Created (already working)
| Layer | File | What it does |
|---|---|---|
| Patterns | `guardrails/patterns.mjs` | Single list of what is forbidden in code and commands |
| Repository checker | `guardrails/check.mjs` | Scans code and configuration; exits with `exit 1` if it finds anything. Ignores `.md` and the guardrail's own files |
| Guardrail tests | `guardrails/patterns.test.mjs` | 6 tests (`npm run test:guardrails`): blocks, does not block common words, exempt paths |
| Claude Code hook | `.claude/hooks/block-anon.mjs` + `.claude/settings.json` | Before each `Bash`, `Write` or `Edit`, **denies** commands that run or install these networks and code writes that use them |
| Instruction to the assistant | `CLAUDE.md` | Explicit rule for the assistant |

### Planned (Phase 1 of the plan, written with TDD)
| Layer | What it will do |
|---|---|
| **Runtime network policy** (`packages/network-policy`) | List of allowed hosts (configurable RPC, World endpoints, relayer). Every `fetch` in the system goes through a wrapper that **refuses** any host outside the list |
| **Content Security Policy (CSP)** | Generated from the same list: `connect-src` with only the declared hosts |
| **Dependency test** | Fails if any `package.json` or lockfile contains an anonymity network package |
| **Request test** | Script-based tests (integration and E2E) use a **request recorder** and **fail** if the system tries to contact an undeclared host |
| **CI step** | `npm run guardrails` runs before everything |

## How to use
```bash
npm run guardrails         # scans the repository
npm run test:guardrails    # tests for the guardrail itself
```

If the hook is not active in an already open Claude Code session, open `/hooks` once or restart the session.

## Limits
- It is pattern-based detection: a new anonymity network name may slip through. That is why the runtime network policy (allowed hosts list) is the main defense; the patterns are the safety net.
- The hook only applies to Claude Code. Commands typed in the terminal go through `npm run guardrails` and CI.
- `.md` documentation is exempt on purpose, so the rule can be explained. When writing it, use the file tool and not a shell *heredoc* that mentions hidden services: the hook would block it.
- There is no exception in code. Any change to this rule requires an explicit decision by the person responsible for the project and a conscious edit of `guardrails/patterns.mjs`.
