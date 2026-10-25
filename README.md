# Daylight

A small student task planner. This first phase delivers a working task database, with an independent browser-local demo and Supabase-backed accounts.

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

Signed-in accounts start empty; local demo tasks do not get silently copied into an account. Signing out returns to the independent local demo. Authentication is browser-side through supabase-js; every database operation is enforced by Postgres RLS. There are no server-rendered private queries in this phase. Introduce Supabase SSR session handling when adding authenticated server routes.

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

## Scope and next steps

Calendar, protected-time editing, preferences editing, check-ins, scheduling, Google Calendar sync, and AI calls are **not active**. Their navigation explains the next phase. No AI key is required or used in this version.

1. Add calendar and protected-time CRUD; validate timezone and work-window preferences.
2. Add a deterministic scheduler, with capacity limits and infeasible-deadline reporting.
3. Persist schedule versions transactionally; add check-in outcomes and automatic replanning.
4. Add optional AI interpretation/explanations behind server routes and usage limits.
5. Add Google OAuth and idempotent calendar sync, then closed-app reminders.

No paid service is necessary for the local demo. The cloud foundation uses only Supabase Auth/Postgres. Hosting and provider quotas can change; check current plans before deploying. Add an explicit AI spending cap when that integration is introduced.
