# ETHGlobal Mumbai 2026 — Blind Report

Official record of the Blind Report submission and its award.

| Field | Value |
| :--- | :--- |
| **Event** | [ETHGlobal Mumbai](https://ethglobal.com/events/mumbai) |
| **Project** | Blind Report — anonymous, end-to-end encrypted whistleblowing channel for newsrooms |
| **Award** | **World — Best Use of IDKit** |
| **Official showcase** | https://ethglobal.com/showcase/blind-report-8ubn9 |
| **Live demo** | https://blind-report.vercel.app |
| **Upstream repository** | https://github.com/rayangustavo/blind-report |

## Why it won

The **Best Use of IDKit** award from **World** recognizes how Blind Report uses World ID 4.0 personhood proofs to make anonymous reporting Sybil-resistant: each proof is bound to `submit:<newsroom>:<epoch>`, and the relayer stores only a SHA-256 hash of the nullifier plus action. That enforces one submission per human per newsroom per month without ever collecting contact details, accounts, or a linkable identity.

## Stack

ENSv2 (Ethereum Sepolia) · Arkiv Network (Rabdi testnet) · World ID 4.0 / IDKit · Libsodium (X25519 + XChaCha20-Poly1305) · TypeScript monorepo (Next.js web apps + Node relayer)

## About this fork

This repository is a fork of the upstream team repository, kept on the author's account to preserve the submission and award record:

- **Fork:** https://github.com/vjr-joseroberto/Blind-report
- **Contribution snapshot:** the tag [`contribution-81b9c76`](https://github.com/vjr-joseroberto/Blind-report/tree/contribution-81b9c76) points to commit [`81b9c76`](https://github.com/vjr-joseroberto/Blind-report/commit/81b9c764a1ff4101dff229c1c96a89b4ad088c6f), the project state referenced in the contribution.
- **Earlier standalone prototype:** https://github.com/vjr-joseroberto/Blind-report-legacy

## Team

- [@rayangustavo](https://github.com/rayangustavo)
- [@vdsilveira](https://github.com/vdsilveira)
- [@vjr-joseroberto](https://github.com/vjr-joseroberto)
