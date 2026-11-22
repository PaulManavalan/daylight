# Account persistence foundation

November 21, 2026. This increment adds the database migration, validated transport and synchronization engine. It does **not yet switch the existing screens from browser-local storage**, apply a migration to a real Supabase project, or prove live account synchronization. Those remain launch gates.

## Document model and ownership

`002_workspace_documents.sql` adds owner-scoped, revisioned JSON documents for `personal`, `sat`, `planning` and `day:YYYY-MM-DD`. Existing Zod domain schemas validate the payloads in `workspace-documents.ts`; provider credentials and arbitrary document names are not part of this interface. Personal documents preserve the connected meal/training/calendar/preferences model instead of inventing another incompatible copy of those records.

Authenticated clients can select only their own rows through row-level security and cannot directly insert, update or delete table rows. The narrowly scoped `save_workspace_documents` function checks the caller's verified database identity against the requested owner and writes only that owner. Its `SECURITY DEFINER` body uses an empty search path, qualified tables and no dynamic SQL. Anonymous execution is revoked. An update must match the expected revision; multi-document changes are atomic. Deletion stores a revisioned tombstone, so a stale create cannot resurrect an old row at revision zero. Server validation also bounds keys, batch size and payload size. Application schema validation remains necessary; the database does not duplicate every domain rule.

The browser transport uses the existing user session and publishable-key client, never a service-role key. Both list filters and the mutation RPC pin the expected account. The transport verifies identity before and after asynchronous requests and rejects foreign-owner, duplicate, malformed or partial responses. Known migration/auth failures are distinct from a successful save.

## Local outbox and conflicts

`AccountWorkspace` stores an account-bound cache and pending edits separately from local-demo records. Initial sign-in never copies private demo data automatically. Local changes require the form's expected sequence and a successful durable cache write. Browser Web Locks serialize cache mutations across tabs; the integration must await these writes rather than treating asynchronous saving as immediate success.

The engine pulls complete account documents, then submits dirty documents with their base revisions. A newer cloud version and a different local draft become a reviewable conflict. Neither version is discarded automatically. Choosing a version requires the reviewed cloud revision and local sequence; another change invalidates that review. A save acknowledged after a newer local edit advances the base revision while keeping the newer edit queued. A lost network acknowledgement is reconciled by reading the provider state, avoiding blind duplicate writes. Malformed caches, storage failures and initial-load failures do not seed or overwrite account data.

The adapter currently bounds a document to 2 MB and a batch to 4 MB/200 changes. Long-term archival, per-domain partitioning, provider-connection vault storage and background synchronization remain future work. This engine is not a claim of unlimited storage, offline server execution or completed account recovery UI.

## Verification

The migration executes against embedded PostgreSQL in the development-only PGlite dependency. Tests cover actual role grants, row isolation, anonymous denial, cross-owner mutation attempts, direct-write denial, revision conflicts, batch rollback and tombstones. A second integration check exercises the outbox against that SQL with two devices for one account and a separate second account. Additional engine tests cover offline reload, lost responses, edits during upload, local locking and corrupt/foreign data. This validates PostgreSQL behavior with synthetic identities; it does not validate Supabase's deployed JWT gateway, production project configuration or real authentication sessions.

## Required UI integration and launch checks

1. Add one focused-workspace identity provider; block rendering until the identity/cache is known, and unmount account data on identity changes.
2. Convert personal-domain saves to awaited repository writes. Keep local mode intact. Preserve the form's original revision/sequence through asynchronous operations.
3. Bind focused daily conversations/plans, SAT attempts and the connected Today overview to the same account context. Send the account bearer token to Notion/Google operations. Local private development snapshots must remain available only in local mode.
4. Show queued/offline/conflict states and concrete two-version review. Provide reviewed local-to-account import, export, interrupted-operation recovery and scoped deletion. Never export or restore local-demo records under an account label.
5. Connect the legacy full workspace's planning/SAT records to the same account model without discarding relational tasks or existing local records.
6. Apply the additive migration in the intended project and verify real sign-in, two-account isolation, two-browser/device synchronization, sign-out, offline edits, conflicting edits, recovery and deletion. No migration or account service has been enabled remotely by this increment.

References read November 21, 2026: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [database testing](https://supabase.com/docs/guides/database/testing), and [PGlite's embedded PostgreSQL API](https://pglite.dev/docs/api).
