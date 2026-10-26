> Implementation update: Calendar, recurring protected time, editable study preferences, local scheduling, and check-ins now run in the browser. See README.md for current behavior and limitations. The transactional cloud scheduling and account-timezone sections below describe the future architecture, not currently active persistence. Optional AI advises ordering through an authenticated server route; the pure engine validates all placements.

# Daylight product and technical plan

## Product principles

The central screen is a calm task database, organized by subject. Capture should take seconds. Scheduling must leave room for school, robotics, sport, family, sleep, and breaks. The app must tell the student when work cannot fit, rather than fabricate a feasible-looking plan.

## Architecture

One Next.js App Router app, TypeScript, Tailwind, owned shadcn/ui components, React state, and Supabase Auth/Postgres. The current client loads only the signed-in user's tasks through RLS. A repository interface keeps local demo data separate from real accounts. Shared Zod validation protects normal input; SQL constraints and RLS enforce security for direct API requests too.

Upcoming scheduling and AI endpoints run server-side and validate the authenticated user with Supabase SSR. AI credentials and Google refresh tokens never enter browser bundles or task records. No service-role key is needed for ordinary user requests. AI is an optional adapter; basic scheduling remains free and deterministic. No realtime subscriptions are needed yet; another browser tab refreshes local data on storage events, and a cloud page reload fetches current records.

## Finalized MVP model

| Entity | Important fields | Purpose |
| --- | --- | --- |
| User | Supabase auth.users.id, email | Managed identity; no duplicated password or auth table |
| Task | user_id, title, description, subject, deadline, estimated_minutes, remaining_minutes, actual_minutes, priority, energy_level, status | The work itself, independent of placement |
| TaskBlock | user_id, task_id, starts_at, ends_at, state, locked, explanation, schedule_version | One study session; a task can have many |
| ProtectedTime | user_id, title, starts_at, ends_at, source, external_id | A concrete unavailable interval, including imported events |
| CheckIn | user_id, task_id, question, response, outcome, added_minutes, resulting_action, created_at, answered_at | A recorded prompt, response, and applied change |
| Preference | user_id, timezone, daily_capacity_minutes, work_windows, block_minutes, break_minutes, check_ins_enabled | Local working windows, energy patterns, limits |

All interval endpoints and deadlines are timestamptz/UTC ISO strings. Work windows are local wall times in an IANA timezone. A deadline is an exact time, not an implicit midnight date. Editing displays it in the browser's local time. Before scheduling, use the account's explicit IANA timezone and handle DST with a timezone-aware library.

Task status is not_started, in_progress, stuck, or done. “Need more time” is a check-in outcome that adjusts remaining_minutes, not a lasting status. Completing a task sets remaining_minutes to zero; reopening initially restores the original estimate and can be refined in the editor. Toggling completion does not invent actual work minutes.

Protected-time recurrence is intentionally represented as concrete intervals for a planning horizon in the first calendar phase. Later add a recurrence source and expand occurrences in the user's timezone. Keep Google token storage separate in a private schema when integration is added.

The foundation schema provides core records, foreign keys, RLS, ownership indexes, and positive-interval checks. Scheduler concurrency, cross-table interval conflict enforcement, and preferences JSON shape/timezone validation must be added with their respective endpoints before enabling those features. Scheduling writes must go through a transactional database function, not independent client inserts.

## User flows

**Capture:** Click Add task, supply title and subject, estimate time, choose priority/focus needs, optionally set a deadline. Save to the inbox. Existing tasks open the same editor. Database filters and search narrow the list without changing stored work.

**Daily planning (next phase):** Read incomplete tasks, fixed events, existing blocks, and preferences. Show available capacity and suggested sessions. Warn about tasks that cannot meet their deadline. Save a validated plan with explanations.

**Check-in (later):** In-app prompts appear at an appropriate break or when returning to the app, with cooldowns and quiet hours. Offer structured choices first, with optional free text: not started, in progress, stuck, done, or need more time. Structured choices require no model call. When stuck, suggest a smaller next step; never assume the task is completed.

**Replanning (later):** Update status/remaining time and record the check-in atomically. Preserve completed, active, and locked blocks. Replan future movable blocks, prioritize hard deadlines, and show what moved and why. If capacity is insufficient, ask for a concrete adjustment such as reducing scope or changing a deadline.

## Scheduling loop

1. Load the user's incomplete tasks and planning horizon, typically 7–14 days.
2. Expand work windows in their timezone, subtract protected intervals, active/locked sessions, breaks, and elapsed time. Limit total daily work to capacity.
3. Rank work by deadline feasibility/slack, priority, then due date. Prefer matching high-focus tasks to high-energy windows while keeping deadlines feasible.
4. Split remaining minutes into bounded sessions. Place sessions before each deadline, include breaks, and leave buffer. Tasks without deadlines use spare capacity.
5. Validate every interval against protected time, overlap, capacity, work windows, task minutes, and hard deadlines. Return unscheduled minutes and reasons when infeasible.
6. Commit a new version transactionally using a per-user lock or optimistic version check; reject stale proposals and duplicate check-in submissions. Retain decision metadata for explanations and undo.

AI can translate a reply like “I need another half hour” into a typed proposal, or explain the engine's stored reasons in natural language. The server validates the proposal before any mutation. Treat user task text as data, use structured output, constrain allowed task IDs, cap tokens and calls, and fall back to structured choices on errors. Never let a model bypass protected time or silently move a hard deadline.

## Calendar and notifications

The app database is the source of truth for tasks and scheduled study blocks. Google events import as protected intervals. Export task blocks into a dedicated calendar with stable external IDs and idempotent upserts. Reconcile deletions and changes, handle all-day events/timezones, and show sync failures without losing local task records. Google sync requires separate OAuth setup and permissions.

Open-app check-ins can use a client timer plus persisted pending prompts. Check-ins while the app is closed require a later scheduled worker and notification channel, explicit opt-in, deduplication, and quiet hours. Do not promise background reminders from an ordinary browser tab.

## Delivery phases

1. **Foundation (implemented):** project setup, task schema/types, local demo, email auth wiring, task CRUD and filterable database.
2. **Calendar:** fixed events, protected-time editing, preferences, split session rendering.
3. **Scheduling:** pure engine with constraint tests, transactional persistence, explanation metadata, infeasibility UI.
4. **Check-ins:** structured responses and remaining-time changes; replan with change summary.
5. **Optional integrations:** AI interpretation/explanations, Google Calendar, then background reminders.
