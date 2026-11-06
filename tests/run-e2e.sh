#!/usr/bin/env bash
# Sobe os nós locais, roda os testes de ponta a ponta e derruba os nós ao final (mesmo se falhar).
set -uo pipefail
cd "$(dirname "$0")/.."
bash tests/fixtures/nodes-up.sh
trap 'bash tests/fixtures/nodes-down.sh' EXIT
npx vitest run -c vitest.e2e.config.ts "$@"
