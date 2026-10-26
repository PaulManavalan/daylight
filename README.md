# Daylight

A calm student planner with a task database, day/week calendar, protected time, and adaptive scheduling. Core planning works in the independent browser-local demo.

## Run locally

Requires Node.js 20.9+ and pnpm (or npm). Dependencies are locked in `pnpm-lock.yaml`.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. Without environment variables, the app starts in local demo mode with sample tasks. Tasks persist in this browser's localStorage; clearing site storage removes them. This mode is suitable for trying the app, not for sensitive information or a durable backup. Export saves a JSON backup; importing is not implemented yet.

```sh
pnpm typecheck
pnpm test
pnpm build
```

## Connect Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/001_foundation.sql` in its SQL editor once, or apply it through the Supabase CLI. It creates all five tables, constraints, indexes, and owner-only row-level security policies.
3. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project settings. The legacy anon key also works in this variable. **Never use a secret or service-role key here.**
4. Enable Email authentication. In Auth → URL Configuration, set the Site URL and allowed redirect URL to `http://127.0.0.1:3000`. Add the actual deployment origin before hosting.
5. Restart the dev server. Click the workspace profile in the sidebar to request a sign-in link. Open that link in the same browser.

Signed-in accounts start empty; local demo tasks do not get silently copied into an account. Signing out returns to the independent local demo. Authentication is browser-side through supabase-js; every database operation is enforced by Postgres RLS. The optional AI route verifies the bearer token server-side with Supabase Auth. It never uses a service-role key.

Test cloud isolation before production: create users A and B; create a task as A; verify B cannot select/update/delete it or insert a task_block/check_in referencing A's task. The SQL uses composite ownership foreign keys in addition to RLS. Cloud integration has to be verified against your configured project.

## Included

- Next.js 16 App Router + TypeScript + Tailwind 4
- shadcn/ui-style owned Button and Radix Dialog primitives, configured in `components.json`
- Responsive task database; add, read, edit, delete, complete, and reopen
- Subject/status/deadline filters, search, sorting, today/inbox/completed views
- Original estimates, remaining minutes, focus needs, priority, notes, optional deadlines
- Email-link auth, Supabase persistence, separate local demo, JSON export
- Loading, empty, error, saving, and delete-confirmation states
- Schema and core domain types for the following phases

## Structure

```text
src/app/                    App Router page, layout, global styles
src/components/             Workspace, task editor, auth dialog
src/components/ui/          Owned UI primitives
src/lib/types.ts            Domain types and Zod task validation
src/lib/repository.ts       Supabase/local CRUD adapters
src/lib/tasks.ts            Pure filtering, sorting, formatting
supabase/migrations/        Database foundation and RLS
docs/architecture.md        Product flows, data model, scheduling design
tests/                      Domain and repository regression tests
```

## Adaptive planning

Open Calendar to see a day or week. Add protected time once or on selected weekdays; an end earlier than the start continues overnight. Defaults include weekday school, Tuesday/Thursday soccer, and nightly sleep. Click a protected-time row to edit or delete the entire recurring series.

Preferences edits daily study hours, high-focus hours, daily capacity, session length, breaks, and gentle check-in suggestions. Times follow the browser timezone. Saving preferences rearranges the next seven days.

Plan my day / Plan my week schedules from now, splits remaining work into sessions, honors exact deadlines, reserves breaks, and reports unscheduled minutes. Past deadlines require a scope or deadline decision. Drag a study session or click it to move with a keyboard-accessible dialog. Moves are validated against study hours, capacity, deadlines, protected time, and other sessions.

Check in on a task: Done completes it; Making progress subtracts completed minutes; Need more time or Stuck adds the selected minutes. Skip for now excludes it from this replan. Non-completion responses rearrange the next seven days around unchanged hard deadlines. An ongoing session on another task is preserved. The last 50 responses are stored.

Planning state uses a separate localStorage key per account or demo identity. It is saved as one snapshot and included in JSON export. It does **not** sync to Supabase yet. Task CRUD keeps its existing cloud/local storage. Check-ins update the task repository before saving planning history; these two stores cannot provide a cross-store transaction. A storage or network failure is surfaced, and successfully saved task changes remain visible. Browser storage is not a durable backup; importing exports is not implemented.

### Optional OpenAI assistance

Set server-only OPENAI_API_KEY and optionally OPENAI_SCHEDULING_MODEL (default gpt-4.1-mini), configure Supabase, and sign in. Enable AI assistance on Calendar. The model receives incomplete task details, protected time, preferences, and timezone as untrusted structured data. A strict JSON schema restricts the response to known task IDs, and the service validates a complete permutation. The model advises ordering only; deterministic placement still enforces every calendar constraint. When AI is unavailable, the local planner continues.

The endpoint verifies Supabase tokens, bounds request sizes, times out after 20 seconds, and allows five requests per user per minute per server instance. Configure provider spending limits and shared rate limiting before enabling AI broadly; the in-memory limiter is not global across serverless instances. No live provider call is part of automated tests.

### Verification

Run pnpm typecheck, pnpm test, and pnpm build. The scheduling tests cover overnight recurrence, protected time, exact deadlines, capacity, breaks, short slots, ongoing sessions, and infeasibility. With the production server running, set PLAYWRIGHT_MODULE to an installed Playwright package path and run node tests/browser-smoke.cjs for task CRUD plus planning, preferences, check-ins, persistence, and mobile layout.

### Remaining integrations

Cloud planning synchronization with transactional versioning, editable account timezones, Google Calendar sync, and closed-app reminders remain future work. Existing Supabase planning tables are not written by this browser-local implementation.
