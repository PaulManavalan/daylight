# Daylight master requirements and implementation checkpoints

Updated November 21, 2026. Authority: the user's own request in this development chat, followed by the attached Master Development Directive. The original request wins conflicts. This roadmap expands the previously narrowed Notion-first milestone; it does not replace that essential planning loop or authorize discarding the existing app. Work remains on `codex/notion-daily-planner`, with production `main` preserved.

This is an implementation record, not a claim of launch readiness. Private preferences, calendar contents and Notion task snapshots do not belong in this public repository.

## Requirements traceability

| Requirement | Current source / verified foundation | Gap and next acceptance criterion |
| --- | --- | --- |
| Conversation as the central interface | `/day`, `notion-day-model.ts`, local/browser provider adapters | Free models have produced inconsistent extraction and repetition failures. No equivalence to ChatGPT is claimed. Broaden real-model evaluations and retain messages on failures. |
| Notion as academic source, no repeated subject/assignment entry | `notion-daily-source.ts`, `notion-operations.ts`; read-only running-list operation | App OAuth still needs credentials and account authorization. Development MCP access is not app authorization. Verify actual refresh after linking. |
| Yellow highlights select today's work | Source parser and day engine | Keep source identities, checked state, links and read time; never invent deadlines from highlights. |
| Pages/databases, deadlines, statuses, deduplication, corrections, optional writeback | Existing Notion preview/import/export code and tests | Full recurring academic sync, conflict resolution and optional writeback need live-account validation. No reorganization of source Notion is authorized. |
| Realistic daily planning | `scheduling.ts`, `notion-day-plan.ts`; protected commitments, capacity, breaks, visible unplaced work | Validate across actual connected calendars. Focus blocks are time to work, not promises of assignment completion. |
| Weekly planning, month view, drag/drop, manual locks | Legacy planning calendar and scheduler | Consolidate useful existing controls into the Notion-first flow; do not throw away tested scheduling logic. |
| Next activity, rescheduling, explainable changes | Legacy agenda/check-ins and schedule changes | Add a clear Next action and change review to `/day`, tied to confirmed outcomes and source freshness. |
| Google Calendar read/create/update/recurrence/timezones | Reviewed `.ics` bridge plus Google OAuth/refresh, paginated reads, reviewed single-event writes, ETags and retry identity | **Implemented adapter, not yet authorized live.** Deployment credentials, account testing, durable server connections, automatic/incremental reconciliation and cross-device sync remain. |
| Apple Calendar read/create/update | Same `.ics` bridge for exported Apple calendars | **Partial, not live sync.** Investigate actual backing account, then native EventKit with iPhone permissions or supported account-specific CalDAV. Do not ask users to publish private calendars. |
| Calendar safety, permissions and duplicate handling | Imports require review; calendar replacement by name; imports do not write to providers; export excludes external events and invitations | Duplicate imports into external apps can still duplicate events. Live adapters need provider IDs, ETags, idempotency, deletion confirmation and external changes. |
| Personalization and preference review | `/day/preferences`, `personal-workspace.ts`; explicit unknown allergies; editable foods, family meal context, news interests | Browser-local only. Cloud persistence, preference action history and portable backups/restores remain. Do not hardcode one user's private profile into public code. |
| Accounts and multi-device persistence | Existing Supabase auth/task repository; new revisioned account-document migration, RLS/RPC and offline/conflict engine | Screen integration still remains local. The new foundation passes embedded PostgreSQL two-account and two-device tests; real Supabase migration, account-bound UI, live auth/sync/recovery and device tests remain launch gates. |
| AI tool execution | Existing reviewed task/event proposals and validation | Introduce a shared typed read/propose/approve/execute boundary across modules, with receipts and action history. Source content cannot grant permissions. |
| Calorie / food journal with optional nutrition | `/day/meals`, `nutrition.ts`: editable meal/snack journal, optional source-attributed calories/protein, partial-value summaries | Browser-local only; food database lookup and favorite-food shortcuts remain. No restrictive budgets, weight-loss goals, food scores or exercise compensation. |
| Weekly family meal planner | `/day/meals`: seven-day editable slots, saved-recipe rotation, listed ingredient restrictions/likes, prep-time filtering and ingredient checklist | The module now suggests from confirmed family favorites and a curated linked recipe catalog, including with an empty library; individual swaps and separate nutrition sections are implemented. This is deterministic selection, not live AI recipe discovery. Calendar-aware prep scheduling, quantity aggregation and broader intelligent suggestions remain. Unknown allergies stay unknown. |
| Recipe discovery and trustworthy nutrition | User-owned recipe collection plus curated MedlinePlus/Nutrition.gov ideas, source timing/yield metadata, search/filter/save/hide, and source links | Live recipe search and verified nutrition lookup remain unimplemented. No fabricated external results or nutritional precision. |
| Soccer, XC, strength, calisthenics and flexibility | `/day/fitness`: user-authored routines, planned sessions and actual logs | Log actual sessions first, then exercise library and reviewed plans. Balance existing team practice and recovery rather than scheduling every category intensely. |
| Running/strength progress and recovery | Actual distance/time/pace and exercise records; self-reported recovery | Distance/time/pace, sets/reps/resistance, soreness and confirmed outcomes. No inferred completion, dangerous progression or pressure to train through pain. Imported directive athletic metrics are unconfirmed starting context. |
| SAT preparation and score/error tracking | `sat.ts`, `sat-workspace.ts`, unit/browser tests; adjustable goal, official/practice score distinction, error log, practice scheduling | A ten-question original practice studio now provides short skill sets, optional elapsed timing, explanations, answer history and explicit error logging. Broad skill coverage and calibrated adaptive practice remain. No fabricated College Board data or unauthorized copyrighted bank. |
| SAT goal and test timeline | Directive suggests 1550; existing goal is adjustable | Keep test date explicitly user-chosen. Prior user-specific timeline needs current confirmation; no guaranteed score gain. |
| Multi-source news covering broad topics | Topic preferences implemented; live feed not implemented | Source-permitted feeds/APIs, current timestamps, link attribution, deduplication, developing-vs-verified claims and grounded AI summaries. The user wants broad coverage, not a single-interest feed. |
| Catholic daily readings | Source/reuse research exists in Notion; no live product reader | Use permitted source links and references; confirm reuse terms before embedding text. Integrate reading history with the daily briefing. |
| Sleep and recovery as scheduling constraints | Legacy protected sleep and daily check-ins | Replace demonstration defaults with actual user preferences; integrate confirmed sleep/energy context without medical diagnosis. |
| Morning and evening conversational check-ins | `daily-checkin.ts`, legacy workspace and history | Reuse confirmed notes across the focused flow; skip questions already answered; no compulsory intake questionnaire. |
| Morning briefing ready before waking | `/day/briefing`: read-only on-open overview of the approved day, homework, meals, training and SAT | Combine trusted snapshots after connection/persistence work. Closed-app preparation requires genuinely deployed scheduling infrastructure; no background execution claim now. |
| Proactive notifications and automations | Requested, not implemented | Quiet hours, opt-in categories, permission levels and real delivery. No development-thread automation is created to track this task. |
| Transparent actions and meaningful approvals | Existing proposal reviews; calendar file review and explicit plan approval | Shared action history with before/after, provider receipt and failures. Destructive/provider changes never silently execute. |
| Cohesive accessible mobile experience | Existing responsive dark workspace and focused preview, keyboard labels and reduced-motion styles | Continue browser keyboard/mobile/error-path checks for each new module. Don't add nonfunctional module buttons. |
| Export, recovery, data deletion and offline capability | Workspace backup/restore now includes focused days, personal domains and SAT attempts, with review, stale guards and interrupted-restore recovery | Continue scoped deletion and full offline validation for new modules. Never silently reset malformed local data. |
| iPhone application | Future, not implemented | Evaluate shared TS domain logic + native shell/Expo; EventKit, notifications and optional Health access require native permissions and potentially developer infrastructure. Web responsiveness alone is not an iPhone app. |
| Free-first, no silent paid dependencies | Local deterministic planning, existing installed models, optional browser AI; MIT/MPL-compatible open-source runtime dependencies | Live provider quotas/terms and hosting limits need explicit connection-level documentation. No paid model or service is enabled. |
| Privacy, ownership and security | Existing validation, RLS, Notion OAuth encryption, fixed-loopback guards; private snapshots ignored and denied on Vercel | Cloud ownership for all new domains and real provider token storage need review. No secrets in client bundles or Git. |
| Source control, existing data and checkpoint reviews | Separate branch and preserved main; focused tests and production builds | Publish reviewable increments, distinguish implemented/tested/blocked/planned, and solicit feedback on working behavior. |

## Architecture and order of work

1. **Core planning checkpoint:** keep Notion as the work source; normal conversation plus deterministic constraints; integrate calendars as separately protected data. Stabilize model responses and preserve drafts on failures. Supply editable, inspectable personal preferences.
2. **Calendar/account checkpoint:** official Google OAuth adapter and provider-confirmed writes; determine Apple backing account/native route. Move local-only data to account-owned persistence with migrations, two-user tests and explicit migration review. File transfer remains a fallback, not a replacement for required live integrations.
3. **Meals, training and SAT checkpoint:** implement data-backed journals and progress first; weekly meal plans based on confirmed preferences; permitted recipe search; validated original SAT practice. Feed flexible activities into the same planner instead of separate competing schedules.
4. **Daily intelligence checkpoint:** permission-aware multi-source news, Catholic reading references, coherent morning briefing and short check-ins. Add scheduled server work only when deployed and genuinely available.
5. **iPhone and refinement checkpoint:** share domain services, add native calendar/notification permissions and offline reconciliation, test actual devices and finalize launch gates.

## This increment: what to review

- Import a synthetic or personally exported `.ics` file; review its dates/times; explicitly use it. Imported events must reserve time in the next day proposal.
- Re-import the same named calendar: it replaces its snapshot rather than duplicating it locally. Another calendar remains separate. Provider calendar records are never modified by import/removal.
- Approve a day plan and export only Daylight focus blocks. Downloading is **not** a claim that Apple or Google accepted an event.
- Edit preferences, reload and check persistence. Allergies remain unknown until explicitly answered. Preferences are included in the planning context.
- Meal planning and fitness logging have local checkpoints; fitness includes user-authored routines and explicitly selected training in daily plans. Personalized workout generation, live OAuth, news, full account sync and iPhone remain incomplete.

## Official integration references

- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Google incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync)
- [Google provider-confirmed event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Google calendar export](https://support.google.com/calendar/answer/37111) and [import](https://support.google.com/calendar/answer/37118)
- [Apple calendar file transfer](https://support.apple.com/guide/calendar/icl1023/mac)
- [Apple EventKit access](https://developer.apple.com/documentation/eventkit/accessing-the-event-store)
- [ical.js maintained parser and timezone requirements](https://github.com/kewisch/ical.js)

Read November 21, 2026. Provider terms, quotas, verification and account permissions can change and must be checked at connection time.

## Additional verified checkpoint

- The loading failure was reproduced on the exact preview URL: HTTP 200 HTML referenced JavaScript and CSS files that had disappeared during a subsequent build. The isolated preview runtime keeps complete build snapshots; the browser was checked again after a separate root build, with no failed assets. The user confirmed the page now loads and said the planning direction is on the right track.
- On that feedback the user delegated the next module choice. Family meals and food journaling were chosen because they work without another paid service or provider account. Recipe filtering/rotation is identified honestly; live search, AI recommendations and cross-device data remain open.
- The private local profile snapshot can fill confirmed chat preferences for review in settings. It is denied on Vercel, stored under ignored artifacts and excluded from output tracing; nothing private is hardcoded into public source.
