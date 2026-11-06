# The SDK is used for real

**Yes.** Arkiv is the product's database, and all access goes through `@arkiv-network/sdk` 1.0.0.

- **Own schemas** with indexed and optional columns (`defineSchema`, `str`, `u64`, `bytes`): [`../schema.md`](../schema.md).
- **Operations used:** `createEntity` (with `readonly` and `permissionlessExtension`), `changeOwnership`, `extendEntity`, `select` with filters, pagination and block time.
- **Data model made for Arkiv:** transferable custody, lifetime deadline, indexed attributes and date proof by the block; the `$creator` set by the chain authenticates notes and replies.
- **Browser wallet:** the SDK signs through an EIP-1193 provider (`validation/B0-RESULT.md`).
- **Friction encountered** when using the SDK and the network: [`../friction.md`](../friction.md).
