# Safe Whistle project instructions

## Guardrail: no Tor or anonymity networks
This is a work computer where Tor and similar networks are **forbidden**.

- **Never** run, install, configure, write code for, or propose using Tor, Nym, Nox, I2P, Lokinet, anonymity SOCKS proxies, hidden services or Anon-RPC. It applies to the app, tests, dependencies and commands.
- The MVP uses a common **public RPC**. The end user chooses a VPN or Tor Browser on their own, outside the app.
- The demo phase with Tor is **BLOCKED** (`planning/99-tor-phase-BLOCKED.md`). Do not run it or unblock it on your own initiative.
- Before any unusual network traffic, ask.

The guardrail is enforced by `.claude/hooks/block-anon.mjs`, `guardrails/check.mjs` and, after Phase 1, by the runtime network policy. Details in `GUARDRAILS.md`. Do not bypass the hook or the checker.

## How to develop
- **Always TDD:** write the failing test first, then the minimal code, then refactor. See `planning/04-tdd-strategy.md`.
- Simple MVP code: small functions, no heavy frameworks, no abstractions before they are needed.
- Fictional test data; no real source.
- Documentation in `docs/`; requirements and plan in `planning/`.
