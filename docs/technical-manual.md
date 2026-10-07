# Frame technical manual

Frame is an independent-film journal built around a deliberately small fictional catalog. Discovery, a persistent watchlist, progress states, personal ratings, and notes are implemented. Streaming, external movie metadata, recommendations, and real accounts are not. Its warm-paper and forest-green editorial identity, oversized type, and CSS covers are part of the product, not assets from a movie service. For the rationale and an honest demo script, read the [product story](product-story.md).

## 1. A working tour and the vocabulary

Start in Discover. Search “Static Bloom,” clear the search, choose a genre, change sort order, and load another page. Open a film, save it as Up next, switch to Your watchlist, mark it Watching, then Finished. Add a 1–5 rating and a short note. Reload, reopen it, remove it, and add it again.

A **catalog** is the set of discoverable titles. A **watchlist entry** is your workspace's state for one title. A **connection** is the GraphQL pagination shape containing edges and page information; an **edge** combines a result and its cursor. A **cursor** is an opaque continuation token. A **tombstone** is a retained row representing removal, rather than a physical deletion. A **version** is a counter that makes stale edits detectable.

The distinction between title and entry is central. The title metadata lives in code; the user's note, rating, state, and version live in SQL. [catalog.ts](../src/lib/catalog.ts), [model.ts](../src/lib/model.ts), and [service.ts](../src/lib/service.ts) define those boundaries.

## 2. Local setup and environment

Use Node 22.13 or newer (Node 22 in CI) and npm:

```sh
npm ci
npm run dev -- --hostname 127.0.0.1 --port 43103
```

Open `http://127.0.0.1:43103`. No movie API token or account is required. To run the production build locally:

```sh
npm run build
npm run start -- --hostname 127.0.0.1 --port 43103
```

Optional `.env.local` settings are:

```dotenv
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DATABASE
APP_ORIGIN=https://frame.example
PGLITE_DATA_DIR=./.data/frame
```

These are placeholders, not working credentials. Leave `DATABASE_URL` unset for embedded PGlite, which persists in `.data/frame`. External PostgreSQL uses a maximum-eight-connection `pg` pool. `APP_ORIGIN` must match the public browser origin exactly; omit it for a normal local run. Use a new embedded data directory when you want an isolated demonstration. [database.ts](../src/lib/database.ts) chooses the adapter and caches its initialization promise in the Node process.

The `frame-workspace` cookie is an unsigned UUID, HTTP-only, SameSite Strict, Secure on HTTPS, with a seven-day lifetime. Removing it starts a separate watchlist, not a deletion of existing database rows. A new browser profile likewise receives another workspace. This is demo isolation, not authenticated ownership.

A Node host is required; GitHub Pages cannot execute the backend. Persistent embedded storage needs a durable filesystem. Use external PostgreSQL for multiple server instances instead of giving each instance an independent embedded directory.

## 3. File map and data flow

| Source                                                                                                          | Maintainer responsibility                                                     |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [app/page.tsx](../src/app/page.tsx), [layout.tsx](../src/app/layout.tsx), [globals.css](../src/app/globals.css) | Entry, metadata, responsive editorial layout, and CSS cover motifs            |
| [components/discovery.tsx](../src/components/discovery.tsx)                                                     | Discovery filters, pagination, featured title, journal form, request ordering |
| [components/use-dialog.ts](../src/components/use-dialog.ts)                                                     | Keyboard containment, Escape, focus return                                    |
| [lib/catalog.ts](../src/lib/catalog.ts)                                                                         | Twenty original fictional title records and genres                            |
| [lib/model.ts](../src/lib/model.ts)                                                                             | Title and Entry TypeScript contracts                                          |
| [lib/service.ts](../src/lib/service.ts)                                                                         | Filter-bound cursors, watchlist rules, tombstones, transactional versions     |
| [lib/graphql.ts](../src/lib/graphql.ts)                                                                         | Schema and resolver delegation                                                |
| [lib/client.ts](../src/lib/client.ts), [app/api/graphql/route.ts](../src/app/api/graphql/route.ts)              | Client POST, HTTP gates, demo workspace/role context                          |
| [lib/schema.ts](../src/lib/schema.ts), [lib/database.ts](../src/lib/database.ts)                                | SQL bootstrap and embedded/external adapters                                  |
| [tests/core.test.ts](../tests/core.test.ts), [tests/e2e/workflow.spec.ts](../tests/e2e/workflow.spec.ts)        | Domain assertions and real-browser workflows/race regression                  |

```mermaid
flowchart LR
    UI[Discovery and journal] --> HTTP[POST /api/graphql]
    HTTP --> G[Apollo resolvers]
    G --> S[Service]
    S --> C[Static fictional catalog]
    S --> DB[(Watch entries in PostgreSQL / PGlite)]
    C --> R[Title metadata plus workspace entry]
    DB --> R
    R --> UI
```

The browse service reads entries once into a map and attaches them to filtered title records. `library` filters out removed entries and attaches catalog metadata in memory. Neither path issues one SQL query per film. The UI asks for browse results, genres, and library in one operation, although the two service methods each read entries; GraphQL does not automatically deduplicate their database work.

## 4. Discovery and cursor mechanics

[Service.browse](../src/lib/service.ts) trims and lowercases search. It searches title, director, and description with substring matching. Genre is an exact catalog genre, not free text. Allowed sorts are `CURATED`, `TITLE`, and `YEAR`. Curated uses title ID order; title uses name then ID; year uses descending year then ID. Tie-breaking matters: without a stable order, page boundaries can duplicate or omit records.

Page size defaults to eight and must be from one to twelve through the GraphQL Int argument. Search is limited to 100 characters. A cursor contains the last title ID and a signature of normalized search, genre, and sort, serialized as JSON and encoded with base64url. **Opaque** means clients should return it unchanged; encoding is not encryption or authorization.

On continuation, the service checks the signature, finds the last ID in the current filtered catalog, and starts after it. A cursor from a different filter or an unknown ID is rejected. Page size is not part of the signature, so it can change between pages. This works because the catalog is static. A changing external catalog would need a stronger snapshot/order contract.

In [discovery.tsx](../src/components/discovery.tsx), filter requests are debounced by 180 milliseconds. Cleanup ignores superseded filter responses. A filter revision also guards “load more” responses: an old page cannot append itself after a newer search. The old cursor is hidden when filters change. Saves reload the first page with the currently active filters, intentionally collapsing previously loaded pages while refreshing watchlist state.

## 5. Persistent state and API contracts

[SQL bootstrap](../src/lib/schema.ts) creates `workspaces(id, created_at)` and `watch_entries(workspace_id, title_id, data)`. The composite primary key permits only one entry per workspace/title. The workspace foreign key cascades deletion. `data` is JSONB, PostgreSQL's structured JSON type. There is no SQL title table or foreign key to catalog IDs; the service validates IDs against the in-code catalog. Initial `CREATE TABLE IF NOT EXISTS` statements are not versioned migrations.

Entry fields are `titleId`, `state`, nullable `rating`, `note`, `version`, `updatedAt`, and nullable `finishedAt`. The GraphQL contract is in [graphql.ts](../src/lib/graphql.ts):

```graphql
query Discover($search: String, $genre: String, $sort: String, $after: String) {
  browse(search: $search, genre: $genre, sort: $sort, first: 8, after: $after) {
    edges {
      cursor
      node {
        id
        name
        watch {
          state
          version
        }
      }
    }
    totalCount
    pageInfo {
      endCursor
      hasNextPage
    }
  }
  genres
}
mutation Journal($titleId: ID!, $version: Int!, $input: SaveInput!) {
  save(titleId: $titleId, version: $version, input: $input) {
    titleId
    state
    rating
    note
    version
    finishedAt
  }
}
```

The separate `library` query returns active entries with nested `title` metadata. Send `rating: null` when unrated; even though the GraphQL field is nullable/optional, the service input expects either an integer or explicit null. Notes are trimmed and capped at 500 characters.

For a new title the expected version is zero. For an existing or removed title use its current returned version. A save locks the workspace, reads the old row, checks the expected version, constructs the next entry, and upserts it. **Upsert** means insert if absent or update on the composite key if present. The transaction makes concurrent saves serialize; the version rejects stale intent.

Rules to preserve:

- State is `PLANNED`, `WATCHING`, `FINISHED`, or `REMOVED`. There is no required sequential state machine; direct transitions are allowed.
- Ratings must be integers 1–5 and are accepted only with Finished. The UI supplies null when leaving Finished; the API rejects a non-null rating with another state rather than silently discarding it.
- Entering Finished records a timestamp; remaining Finished preserves it. Leaving clears it, so finishing again receives a new timestamp.
- Removing hides the entry from `library` but preserves a row and its incremented version. Browse still returns that tombstone, so re-adding uses the current version.
- A version-zero replay after removal is rejected. Physically deleting and recreating at version one would let an old version-one client overwrite a new entry: the classic stale-identity problem the tombstone avoids.
- `VIEWER` writes are forbidden. The catalog bounds each workspace to at most twenty distinct title rows, including removed rows.

The generic service permits a removed entry to contain a note; the UI's remove action explicitly sends an empty note and null rating. Do not describe removal as secure erasure or account deletion.

## 6. HTTP, auth, and operational boundaries

A read-only smoke request:

```sh
curl -sS -c /tmp/frame-cookies -b /tmp/frame-cookies \
  -H 'Content-Type: application/json' \
  --data '{"query":"{browse(first:2){totalCount edges{node{id name}} pageInfo{hasNextPage endCursor}}}"}' \
  http://127.0.0.1:43103/api/graphql
curl -sS http://127.0.0.1:43103/api/health
```

The [HTTP route](../src/app/api/graphql/route.ts) rejects non-JSON (415), unexpected Origin (403), malformed JSON (400), and request text exceeding 16,000 characters (413). It reads the text before checking length; this is not a streaming memory bound. The GraphQL layer limits documents to 150 fields, disallows named fragment definitions, and allows one top-level mutation selection. Domain errors use `BAD_USER_INPUT`, `NOT_FOUND`, `FORBIDDEN`, or `CONFLICT`; internal failures return a generic message and are logged on the server.

The client role header and unsigned cookie are not authentication. There are no real users, secure shared tenants, external film API calls, subscriptions, rate limits, watchlist sharing, account export, or retention jobs. Personal ratings are not community ratings. Film art is CSS-generated, and all catalog metadata is fictional.

`/api/health` checks `SELECT 1`, returning storage mode or HTTP 503. It does not validate every catalog record or prove a user's note was saved. A failed initialization promise stays cached for the Node process, so restart after correcting startup database configuration.

## 7. Verification and failure labs

```sh
npm run format:check
npm run typecheck
npm test
npm run build
npx playwright install chromium
PORT=43103 PGLITE_DATA_DIR=./.data/browser-check npm run test:e2e
```

Stop any existing server on the selected port. The test config starts its own production server and refuses to reuse an unrelated one. Two scenarios run in desktop and mobile projects: discovery/save/rate/persist/remove, and a held pagination response racing a new search. Screenshots and failure traces go to `test-results`. There is no ESLint script; formatting and types are the static checks.

To repeat service assertions on a **disposable PostgreSQL database**:

```sh
TEST_DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DISPOSABLE_TEST_DB npm test
```

Tests create random workspaces and leave their rows in an external test database. [CI](../.github/workflows/ci.yml) runs embedded and PostgreSQL 17 checks before production build and browser tests. The current workflow runs on PRs and main pushes; do not use `[skip ci]` when establishing evidence for a new commit.

| Lab                               | Expected behavior                                                          | Where to investigate                           |
| --------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------- |
| Reuse a cursor with another genre | `BAD_USER_INPUT`, no silently mixed page                                   | Cursor signature in `Service.browse`           |
| Hold load-more, then search       | Only the new search remains after the old response arrives                 | Filter revision guard; browser regression test |
| Rate an unfinished film           | API rejects the state/rating combination                                   | Save validation, explicit nullable rating      |
| Save from two stale tabs          | One matching-version update succeeds, the other gets `CONFLICT`            | Workspace lock and expected version            |
| Remove then re-add                | Hidden entry returns with a higher version; stale version zero is rejected | Tombstone and browse watch metadata            |
| No results                        | Empty-state message, no server error                                       | Search normalization and genre combination     |
| Server returns 403                | Match browser origin and `APP_ORIGIN`; do not disable the check            | Proxy scheme/host and route                    |

Open traces with `npx playwright show-trace PATH_TO_TRACE.zip`. When debugging a watchlist conflict, inspect `titleId` and `version` before editing SQL. Retrying with an invented current version would defeat the protection.

## 8. Tradeoffs and extension exercises

The twenty-title static catalog keeps searching, pagination, and original artwork reproducible. It also means search is linear over a small array and cursors assume a stable catalog. JSONB keeps the persistence layer compact, but does not provide typed SQL columns for every entry field. Keeping tombstones simplifies version continuity at the cost of retaining rows after removal.

**Exercise: add another fictional title.** **Solution:** add a unique stable ID and all `Title` metadata in `catalog.ts`; choose an existing palette/motif or add its CSS; update expected catalog counts; test all sorts and pagination boundaries. Do not present invented metadata as a real release.

**Exercise: ingest a real catalog.** **Solution:** persist titles under stable IDs, record source/provenance and licensing, define update semantics, use deterministic indexed ordering, and version or expire cursors when ordering changes. Replace static assumptions in tests before adding a network fetch to every render.

**Exercise: add private authenticated journals.** **Solution:** authenticate requests, derive workspace membership and roles server-side, replace the role header, and test unauthorized access independently of the UI. Add retention/export/erasure rules that explicitly account for tombstones.

**Exercise: distinguish conflict from retry.** **Solution:** preserve the draft note, refetch the current entry, show both versions for reconciliation, and submit the reconciled note with the retrieved version. Do not blindly replay the old payload under a new version.

## 9. Interview questions

**Why a cursor instead of page number?** It carries a continuation position tied to this filter set. It is useful contract practice, though a fixed twenty-row catalog could also use simpler pagination.

**Is a base64 cursor secure?** No. It is encoded JSON. Validation prevents accidental misuse; it does not authenticate the client.

**Why keep removed rows?** To preserve version continuity and reject stale edits after removal/re-addition.

**Does GraphQL eliminate N+1 queries?** No. Here, related catalog data is joined in memory, so there is no SQL query for each title. Resolver design determines query behavior.

**Why guard both filter and pagination requests?** They are separate asynchronous paths. Ignoring stale search responses alone still lets an old next-page response append into a new result set.

**What is the largest product limitation?** Frame is a fictional catalog and an anonymous local journal, not a real streaming discovery or identity platform. Explain that boundary while demonstrating the real persistence and concurrency behavior.
