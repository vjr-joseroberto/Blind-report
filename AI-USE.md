# AI use statement

This project was developed **with the assistance of artificial intelligence**.

## Tool
**Claude Code** (Anthropic), a coding assistant that runs in the terminal, with models from the Claude family. Commits made with the assistant include the line `Co-Authored-By: Claude …` in the history.

## What the AI was used for
- Writing **code** and **tests** (test-driven development), in TypeScript.
- Writing and updating the **documentation** (`docs/`, `planning/`, `arkiv/`) and the presentation documents.
- **Investigating** the behavior of the technologies (Arkiv, ENSv2, World ID limits) through validation scripts, with the results recorded in `validation/RESULTS.md`.
- **Reviewing** its own code for security and privacy flaws (`docs/08-security-review.md`).

## What belongs to the person responsible for the project
- The **idea**, the product and security **decisions** (for example, the rule of not using an anonymity network) and the choice of tracks.
- The **test credentials and wallets**: they live only in the local `.env`, were never placed in conversations with the AI or in versioned files.
- The **manual tests** that depend on real people and devices (World ID proof in the simulator, dashboard with the wallet in the browser).
- The decision of what is published and submitted.

## What the AI did not do
- It did not use or install an anonymity network (rule enforced by `GUARDRAILS.md`, by the `guardrails/check.mjs` checker and by an assistant hook).
- It did not have access to the private keys.

## Limits of this statement
- A **line-by-line review** of all the code by a person **is not recorded** in this repository. Part of the verification comes from the automated tests (unit, integration and end-to-end) and the manual tests mentioned above.
- This statement was written with the assistant itself based on the project history; the responsible person must review it before submitting.
