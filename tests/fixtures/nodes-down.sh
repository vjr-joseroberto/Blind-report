#!/usr/bin/env bash
docker rm -f sw-sepolia-fork sw-arkiv-local >/dev/null 2>&1 || true
echo "local nodes stopped"
