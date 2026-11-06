# Relayer API

HTTP service in `apps/relayer`. It is the only component that writes to Arkiv on behalf of the source. **It does not record IP, headers, body, proof or identifiers**: the log has only the route, the status and a code.

## How to run
```bash
# from the repository root, with .env filled in (variables below)
node --env-file=.env --import tsx apps/relayer/src/main.ts
```
On startup, the relayer validates the configuration (errors list only variable **names**), opens the server and runs the renewal job, repeating it every 6 hours.

## Configuration (environment variables)
| Variable | Required | Default | Note |
|---|---|---|---|
| `RELAYER_PRIVATE_KEY` | yes | — | Wallet that pays gas on Arkiv (**secret**) |
| `RP_SIGNING_KEY` | yes | — | World signing key (**secret**) |
| `WORLD_APP_ID`, `WORLD_RP_ID` | yes | — | `app_…` and `rp_…` |
| `WORLD_ENVIRONMENT` | no | `staging` | `staging` or `production` |
| `SEPOLIA_RPC_URL`, `ARKIV_RPC_URL` | yes | — | https, or http only on localhost |
| `ARKIV_ACCESS_KEY` | no | — | Arkiv Hub key (**secret**) |
| `NEWSROOMS` | no | empty | Newsrooms whose retention the job renews (`a.eth,b.eth`) |
| `ALLOWED_ORIGINS` | no | empty | Exact front-end origins (CORS). **Never a wildcard** |
| `RETENTION_DAYS` | no | 150 | Maximum ~182 (maximum life on chain) |
| `RENEW_WITHIN_DAYS` | no | 60 | The job renews what expires within this period |
| `PORT`, `HOST` | no | 8787, 127.0.0.1 | |
| `MAX_BODY_BYTES` | no | 1 MiB | Larger body receives 413 |
| `RATE_LIMIT_PER_MINUTE` | no | 120 | **Global** limit (no IP). Excess receives 429 with `retry-after` |
| `SIMULATE_WORLD` | no | 0 | `1` approves any proof. **Local tests only**: the configuration is refused if any RPC is not localhost |
| `NULLIFIER_FILE` | no | `data/claims.jsonl` | Store of the hashes of used proofs |

The network policy is built from this configuration: only the hosts of the two RPCs and `developer.world.org` are contacted.

## Endpoints

### `GET /health`
`200 {"ok":true}`

### `GET /rp-context?newsroom=<name>.eth`
Returns what is needed to open IDKit on the current epoch's action. The signature is made on the server.
```json
{ "app_id": "app_…", "environment": "staging", "epoch": 202611, "action": "submit:investiga.eth:202611",
  "rp_context": { "rp_id": "rp_…", "nonce": "0x…", "created_at": 1, "expires_at": 301, "signature": "0x…" } }
```
Errors: `400 invalid_newsroom`, `404 newsroom_not_found`, `422 newsroom_misconfigured`.

### `POST /submissions`
JSON body:
```json
{ "newsroom": "investiga.eth", "epoch": 202611, "category": "saude", "hasAttachment": false,
  "proof": { "…": "IDKit result" }, "envelope": "<base64url binary envelope>" }
```
Response `201 {"key":"0x…","parts":1}`.

**Order of checks** (the cheap ones first; the World API is only called after all of them): body size → fields → current epoch → policy on ENS → envelope (format, content hash, newsroom and category, key version) → newsroom policy (category, size, attachments) → **World proof** → publication to Arkiv.

If publication fails, the proof reservation is returned and the person can try again.

### Errors
Format: `{"error":{"code":"…","message":"…"}}`.
| Status | `code` | When |
|---|---|---|
| 400 | `invalid_json`, `invalid_request`, `invalid_newsroom`, `invalid_nullifier` | Malformed input |
| 403 | `proof_rejected`, `wrong_action`, `wrong_environment`, `nullifier_mismatch` | Invalid proof or from another action/environment |
| 404 | `newsroom_not_found`, `not_found` | Newsroom or route does not exist |
| 405 | `method_not_allowed` | Wrong method |
| 409 | `limit_reached` | The person has already submitted to this newsroom this epoch |
| 409 | `epoch_mismatch` | The informed epoch is not the current one |
| 409 | `stale_key_version` | The newsroom key changed. Includes `currentVersion`: encrypt again with the current key |
| 429 | `rate_limited` | Global request limit per minute |
| 413 | `body_too_large` | Body above the maximum |
| 422 | `invalid_envelope`, `envelope_mismatch` | Invalid envelope or from another newsroom/category |
| 422 | `category_not_allowed`, `too_large`, `attachments_not_allowed`, `invalid_size` | Outside the newsroom policy |
| 422 | `newsroom_misconfigured` | The newsroom published invalid records on ENS |
| 502 | `publish_failed` | Failed to publish; no internal details |
| 500 | `internal` | Unexpected error; no details |

## Security and privacy
- **CORS:** only origins listed in `ALLOWED_ORIGINS`, compared for exact equality. Wildcards are never accepted.
- **Headers:** all responses carry `cache-control: no-store` and `x-content-type-options: nosniff`.
- **No IP or body logging:** tested (the test looks for the IP, the body and the nullifier in all records).
- **Success responses** carry neither proof nor identifiers.
- **Secrets:** never appear in configuration error messages; `redact` hides them.

## Renewal job
Every 6 hours, for each newsroom in `NEWSROOMS`, renews the tips that expire within `RENEW_WITHIN_DAYS`, requesting `RETENTION_DAYS`. On network failure, retries up to 4 times with exponential backoff (1 s, 2 s, 4 s); if exhausted, logs the error (without details) and moves on to the next newsroom. It works because the relayer creates the entities with free extension and **cannot delete them** after transferring them.
