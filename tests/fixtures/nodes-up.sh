#!/usr/bin/env bash
# Starts the local nodes with `docker run` (equivalent to docker-compose.yml, for machines without the compose plugin).
set -euo pipefail
SEPOLIA_RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
docker rm -f sw-sepolia-fork sw-arkiv-local >/dev/null 2>&1 || true
for i in 1 2 3; do
  docker rm -f sw-sepolia-fork >/dev/null 2>&1 || true
  docker run -d --name sw-sepolia-fork --network host ghcr.io/foundry-rs/foundry:latest \
    "anvil --fork-url $SEPOLIA_RPC --host 127.0.0.1 --port 8545 --chain-id 11155111" >/dev/null
  sleep 8
  curl -s -m 5 -X POST localhost:8545 -H "content-type: application/json" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\",\"params\":[]}" | grep -q result && break
done
docker run -d --name sw-arkiv-local --network host ghcr.io/arkiv-network/arkiv-reth-dev:latest \
  node --dev --dev.block-time 2s --http --http.addr 127.0.0.1 --http.port 8546 --http.api eth,net,web3,debug,txpool,rpc >/dev/null
echo "Sepolia fork on :8545 and local Arkiv node on :8546"
