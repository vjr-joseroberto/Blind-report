# The app writes to the Arkiv testnet

**Yes.** On the **Rabdi** testnet (chain id 7794095), through the SDK.

- **Who writes and what** (wallets in the README):
  - The **relayer** creates each `denuncia` entity and transfers ownership to the newsroom (`createEntity` and `changeOwnership`).
  - The **administrator** (and journalists) creates `anotacao` and `resposta`, and extends deadlines (`extendEntity`).
- **Code:** `packages/arkiv-store/src/sdk-backend.ts` (`create`, `changeOwnership`, `extend`) and `apps/relayer/src/compose.ts` (relayer over Rabdi).
- **Evidence on Rabdi (2026-11-01):** `npm run arkiv:query -- jornalista1.eth` lists 1 tip (created by the relayer, owned by the newsroom wallet), 1 note and 1 reply. The transactions can be seen at https://rabdi.explorer.arkiv.network by the wallet addresses.
- **Measurements made on Rabdi:** `validation/RESULTS.md`, V-01 (size limits, expiration, custody and cost).
