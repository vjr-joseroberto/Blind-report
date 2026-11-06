#!/usr/bin/env bash
# Starts the local nodes, runs the integration tests and tears down the nodes at the end (even on failure).
set -uo pipefail
cd "$(dirname "$0")/.."
bash tests/fixtures/nodes-up.sh
trap 'bash tests/fixtures/nodes-down.sh' EXIT
npx vitest run -c vitest.integration.config.ts "$@"
