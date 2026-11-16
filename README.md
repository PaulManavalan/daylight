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

Signed-in accounts start empty; local demo tasks do not get silently copied into an account. Signing out returns to the independent local demo. Authentication is browser-side through supabase-js; every database operation is enforced by Postgres RLS. The planner makes no provider calls and does not require an account.

Test cloud isolation before production: create users A and B; create a task as A; verify B cannot select/update/delete it or insert a task_block/check_in referencing A's task. The SQL uses composite ownership foreign keys in addition to RLS. Cloud integration has to be verified against your configured project.

## Included

- Next.js 16 App Router + TypeScript + Tailwind 4
- shadcn/ui-style owned Button and Radix Dialog primitives, configured in `components.json`
- Responsive task database; add, read, edit, delete, complete, and reopen
- Subject/status/deadline filters, search, sorting, today/inbox/completed views
- Original estimates, remaining minutes, focus needs, priority, notes, optional deadlines
- Email-link auth, Supabase persistence, separate local demo, JSON export
- Loading, empty, error, saving, and delete-confirmation states
- Free deterministic scheduling, persistent manual locks, adaptive check-ins, and a recoverable planning snapshot

## Structure

```text
src/app/                    App Router page, layout, global styles
src/components/             Workspace, task editor, auth dialog
src/components/ui/          Owned UI primitives
src/lib/types.ts            Domain types and Zod task validation
src/lib/repository.ts       Supabase/local CRUD adapters
src/lib/tasks.ts            Pure filtering, sorting, formatting
src/lib/scheduling.ts       Planner, constraints, check-in proposals
src/lib/planning-store.ts   Snapshot backup, conflict checks, recovery journal
supabase/migrations/        Database foundation and RLS
docs/architecture.md        Product flows, data model, scheduling design
tests/                      Domain and repository regression tests
```

## Quick capture

Use the inline capture bar on task views to enter a title, subject, and estimate, then press Enter. It uses the same validated repository as the full editor. Details carries the draft into the full editor; cancellation preserves it and successful saving clears it. Tasks without an explicit energy setting continue to use planning preferences.

## Daily agenda

Today includes planned study sessions regardless of their deadlines, fixed commitments, and recovery periods. It shows remaining focused minutes and offers direct check-ins, task editing, and Plan my day. Earlier unconfirmed sessions can be reviewed; passing a scheduled time never marks work complete. Planning and calendar commands are consumed once, so reopening the view cannot accidentally replan or repeat an old check-in prompt. The task table and its filters remain available below the agenda.

## Adaptive planning

Open Calendar to see a day or week. Add protected time once or on selected weekdays; an end earlier than the start continues overnight. New demo defaults include weekday school, Tuesday/Thursday soccer with 30 minutes of recovery afterward, and nightly sleep. Each commitment can specify its own recovery time, in addition to the general transition buffer. Existing saved commitments retain their configured values. Click a protected-time row to edit or delete the entire recurring series.

Preferences edits weekday and weekend study hours, selected study days, high-focus windows, the deep-work cutoff, daily capacity, an unfilled daily reserve, session length, short/long breaks, recovery around commitments, planning pace, default task energy, and gentle check-in suggestions. Times follow the browser timezone. Saving preferences rearranges the next seven days.

Plan my day / Plan my week reassesses shared deadline pressure after every session. The last usable window before each deadline accounts for the deep-work cutoff and protected time, so flexible work cannot consume a scarce early slot just because it has higher priority. Deadlines within two hours and work with little remaining slack take precedence; otherwise priority and energy influence earlier placement. A task merely being due tonight does not automatically take the only deep-work window. Slot scores favor focus windows, earlier days, and useful session lengths. High-energy work stops at the editable evening cutoff. Both actions rebalance the coming seven days; Plan my day opens today, with overflow carried into the week. The planner leaves a five-minute startup gap, recovery around fixed commitments, short breaks, longer recovery after sustained focus, and the daily reserve. Unschedulable minutes are reported without changing deadlines, with distinct explanations for expired deadlines, closed focus windows, protected commitments, exhausted capacity, and other placement constraints. Past deadlines require a scope or deadline decision. Drag a flexible study session or click it for check-in, task editing, moving, and locking. Dragged work is kept at its new time by default; unlock it to allow replanning. Moves are validated against study hours, capacity, deadlines, protected time, and other sessions.

Check in on a task: Done completes it; Making progress subtracts completed minutes; Need more time or Stuck adds the selected minutes. Skip for now keeps the task set aside across automatic/adaptive replans. Resume it under Work & progress, or make a new day/week plan to include it again. Non-completion responses rearrange the next seven days around unchanged hard deadlines. An ongoing session on another task is preserved unless a fixed commitment or its recovery buffer conflicts. A shortened hard deadline also trims the ongoing reservation; unconfirmed elapsed time stays unconfirmed and unfinished work is reported. Stuck creates a real 15-minute restart session before the rest of that task. Need more time temporarily boosts the affected task behind urgent deadlines, pushing less urgent work later. Done also replans and reclaims its time. Confirmed Making progress minutes count against today’s capacity; elapsed plans alone do not imply completed work. The last 50 responses and latest plan report are stored. A separate 14-day work-credit record keeps daily capacity accurate even after older responses leave the visible history. Progress recorded during an active session retains a completed segment; session-linked credits avoid counting overlapping work twice. A summary lists moved, added, and displaced sessions; changed blocks highlight briefly. Check-in suggestions have a 90-minute cooldown per task, including recent progress that has left the visible history. They respect study days/hours, protected time and recovery, excluded tasks, and a quiet start to each study session. Suggestions are available on Today as well as Calendar.

Planning state uses a separate localStorage key per account or demo identity. It is saved as one snapshot and included in JSON export. It does **not** sync to Supabase yet. Task CRUD keeps its existing cloud/local storage. Check-ins stage a small journal before the task update, then save the calendar and clear the journal. If interrupted, reloading verifies the saved task and recovers planning/history without repeating the task mutation. A last-known-valid planning backup is retained, stale-tab writes and unrelated saves during a pending check-in are rejected, and corrupt primary data can recover from that backup with a visible notice. These stores still do not provide a database transaction. If a pending task update has not arrived, the journal is retained and calendar writes stay blocked; another tab may still be saving. Reload to recover a saved update, or explicitly keep current task values and dismiss the unfinished check-in (a raw copy is retained). Browser storage is not a durable backup; importing exports is not implemented.

### Manual control

Keep this time pins a future study session through automatic replanning. Hard deadlines, protected time, study hours, recovery breaks, and capacity remain constraints. A conflicting lock is released with a visible explanation; a lock longer than the task’s remaining work is shortened. Completed ongoing sessions remain visible in a distinct calendar style.

Gentle pace adds 15% of otherwise usable capacity to the daily reserve, caps sessions at 35 minutes, and uses at least 15-minute breaks. Balanced follows the configured limits. Compact favors earlier, fuller placement while preserving explicit limits. Default energy is used only for tasks with no energy setting.

### Free by default

The primary planning and check-in flows run entirely on the device, with no AI endpoint, provider key, account, or paid service. The old paid-provider endpoint and adapter have been removed. No free-tier model dependency is introduced; those services are optional future enhancements. Natural-language check-ins are not implemented in this phase.

### Verification

Run pnpm typecheck, pnpm test, and pnpm build. The 64 domain tests cover recurrence, deadlines, capacity, energy, pace, locks, deterministic output, partial days, persistent skip, and storage recovery. Run node tests/browser-smoke.cjs --serve to start an isolated production test server, or run without --serve against port 3000. Set PLAYWRIGHT_MODULE to an installed Playwright package path when outside the Codex bundled runtime. This exercises native drag/drop (including an invalid drop), manual moves, expanded preferences, stuck restart sessions, completed sessions, persistent skip/resume, an interrupted-save recovery, export, and offline planning with zero AI requests, alongside task CRUD and mobile layout.

### Remaining integrations

Cloud planning synchronization with transactional versioning, editable account timezones, Google Calendar sync, and closed-app reminders remain future work. Existing Supabase planning tables are not written by this browser-local implementation.
