# Engineering walkthrough

## Read path

Browse normalizes search, genre, sort, and page size. It filters and orders the fixed catalog, checks any cursor against those filters, then reads workspace watch entries once and attaches them by title ID. The GraphQL connection returns edges, opaque cursors, total count, and page info. Watchlist queries join persisted entries with the catalog in memory.

This is not full-text search or database keyset pagination. The interface demonstrates a cursor contract over a stable, small catalog. For a large external catalog, the filtering and ordering should move to a database/search service with indexed sort keys.

## Write path

Save validates title, state, rating, and note. The transaction locks the workspace, reads the current entry, compares its version, and upserts an incremented version. The composite primary key guarantees one entry per workspace/title. The workspace lock is intentionally coarse.

## Interview questions

**Why use GraphQL?** Discovery and library views select different parts of a shared graph. The schema makes states and related records explicit. REST is still a valid alternative; GraphQL does not supply storage, caching, or permissions by itself.

**What is inside the cursor?** The final title ID and a normalized filter signature, encoded as base64url JSON. Encoding is not encryption. Cursors are validated, not trusted. Reusing one with different filters is rejected to avoid surprising pages.

**Does this have an N+1 database problem?** Browse loads watch entries once, and title metadata is already in memory. There is no per-title SQL lookup. A real external metadata resolver would need request batching or joined fetching to avoid N+1 calls.

**Why keep removed records?** Their versions prevent a stale client from accidentally matching a newly recreated row with a reset version. The tombstone is a concurrency decision; it is not a privacy deletion implementation. Here removal also clears rating and note from the live record.

**How are ratings validated?** Only Finished accepts a rating, and it must be an integer from one to five. TypeScript helps during development; GraphQL and Zod validate the runtime boundary.

**What data is real?** The software behavior and persisted user changes are real. All film metadata and covers are original fictional samples. No critic scores, streaming availability, or production usage are claimed.

**How would a real movie API be integrated?** Add a server-side metadata adapter, respect the provider's license and attribution requirements, cache responses with an explicit freshness policy, normalize IDs, handle rate limits and unavailable titles, and keep API credentials out of the client. Do not let external downtime erase a user's watchlist.

## Practice

Load two pages and explain why IDs do not repeat. Change filters and explain why the old cursor must be discarded. Save, finish, rate, remove, and re-add a title; trace the version changes in the service test. Explain one honest limit before proposing a production extension.
