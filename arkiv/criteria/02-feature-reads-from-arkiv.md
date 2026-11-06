# A feature reads from Arkiv

**Yes, three, and none works without reading:**

1. **Newsroom inbox:** lists the tips by newsroom, category and status (`listSubmissions`), reassembles attachments in parts and decrypts in the browser.
2. **Replies to the source:** the source searches for the replies by `mailboxId` (`getReplies`) and only shows those written by someone the newsroom recognizes.
3. **Date and integrity verification:** anyone, with the encrypted file in hand, searches Arkiv for the entity with the same hash and sees the **block** in which it was written (`verifyDocument`).

- **Code:** `packages/arkiv-store/src/store.ts` (reading), `packages/newsroom-client` and `packages/source-client` (usage).
- **Test:** the E2E (`tests/e2e`) goes through tip, reading, reply and verification against a real Arkiv node in a local environment.
