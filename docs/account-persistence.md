# Account persistence foundation

November 21, 2026. The database migration, validated transport and synchronization engine are now connected to the focused `/day` screens when a Supabase account is configured and signed in. No migration has been applied to a real Supabase project and live account synchronization is not yet verified. Those remain launch gates.

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

## Focused screen integration checkpoint

The focused layout checks identity before mounting its data consumers, then completes the initial cloud check before showing the account workspace. A verified existing account cache can open after a failed network check; a first-time failure does not create an empty account over unknown server data. Identity changes unmount the previous workspace. The banner distinguishes queued/offline/conflict states from confirmed account saves.

Personal-domain writes now await the durable local outbox, including meal/recipe journals, workout logs and routines, calendar imports and preferences. The personal metadata stamp advances monotonically and stale asynchronous closures cannot save over a newer local state. Daily source/conversation/approval and focused SAT attempts use their own account documents. The Today overview reads that same account context. A changed saved day clears the local approved view and requires reload instead of exporting an older timetable. Notion calls use the current account bearer token, and local private development snapshots are not fetched in account mode.

Preferences includes explicit two-version conflict review, account recovery export, and a reviewed copy of existing local personal/SAT/day records. Copying preserves the local workspace, pins each target's reviewed sequence, and stages a previous-account recovery copy. Local backup/restore controls are shown only in local mode, so an account label cannot accidentally export or replace unrelated local-demo data. Account recovery import and scoped account deletion remain to be implemented. The legacy full workspace is also still separate for planning/SAT storage and needs consolidation.

`scripts/test-account-browser.cjs` builds a synthetic public Supabase-client configuration, exercises the real browser SDK against a mocked HTTP provider, and always restores the normal build. The scenario covers two browser contexts for one account, a separate account, offline save/reload, conflict choice, food and workout preservation, SAT/day transfer, explicit local copy/cancel, credential exclusion, local-snapshot exclusion, sign-out and mobile layout. This complements the PostgreSQL ownership tests; it does not substitute for real Supabase authentication and device testing. The immutable running preview is unaffected by the temporary test builds.

## Remaining integration and launch checks

1. Broaden real-device and concurrent-edit checks for the focused identity provider and awaited personal-domain writes.
2. Verify Notion/Google account authorization in the deployed environment, with local private development snapshots remaining local-only.
3. Complete reviewed account recovery import, interrupted-operation recovery UI and scoped account deletion. Never export or restore local-demo records under an account label.
4. Continue improving conflict summaries and source freshness while preserving pending drafts and approval checks.
5. Connect the legacy full workspace's planning/SAT records to the same account model without discarding relational tasks or existing local records.
6. Apply the additive migration in the intended project and verify real sign-in, two-account isolation, two-browser/device synchronization, sign-out, offline edits, conflicting edits, recovery and deletion. No migration or account service has been enabled remotely by this increment.

References read November 21, 2026: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [database testing](https://supabase.com/docs/guides/database/testing), and [PGlite's embedded PostgreSQL API](https://pglite.dev/docs/api).
