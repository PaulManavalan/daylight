# Daylight

A calm student planner with a task database, day/week calendar, protected time, and adaptive scheduling. Core planning works in the independent browser-local demo.

## Run locally

On Windows, double-click **Start Daylight.cmd** in the project folder. It finds Node.js (including the existing Codex runtime), rebuilds when application source or build configuration changes, and serves it at http://127.0.0.1:3102 without requiring `pnpm` on your PowerShell PATH. If Daylight is already responding, the launcher opens that instance; if a port is occupied or unresponsive, it tries ports through 3112 and opens the selected address. Browser-local records are separate for each port; changing ports does not delete records at the old address. Keep the launcher window open while using Daylight. Run `& ".\Start Daylight.cmd" --check` in PowerShell to check the runtime without starting a server.

Requires Node.js 20.9+ and pnpm (or npm). Dependencies are locked in `pnpm-lock.yaml`.

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. Without environment variables, the app starts in local demo mode with sample tasks. Tasks persist in this browser's localStorage; clearing site storage removes them. This mode is suitable for trying the app, not for sensitive information or a durable backup. Export saves a JSON backup. Backups → Restore a backup file in the top bar validates and previews a version-1 export before replacing the local workspace; account exports are copied into local ownership, never written into a signed-in account.

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

Planning state uses a separate localStorage key per account or demo identity. It is saved as one snapshot and included in JSON export. It does **not** sync to Supabase yet. Task CRUD keeps its existing cloud/local storage. Check-ins stage a small journal before the task update, then save the calendar and clear the journal. If interrupted, reloading verifies the saved task and recovers planning/history without repeating the task mutation. A last-known-valid planning backup is retained, stale-tab writes and unrelated saves during a pending check-in are rejected, and corrupt primary data can recover from that backup with a visible notice. These stores still do not provide a database transaction. If a pending task update has not arrived, the journal is retained and calendar writes stay blocked; another tab may still be saving. Reload to recover a saved update, or explicitly keep current task values and dismiss the unfinished check-in (a raw copy is retained). Browser storage needs external backups. Use Backups to export a workspace or review and restore a version-1 export locally; the previous local workspace is retained for recovery.

### Manual control

Keep this time pins a future study session through automatic replanning. Hard deadlines, protected time, study hours, recovery breaks, and capacity remain constraints. A conflicting lock is released with a visible explanation; a lock longer than the task’s remaining work is shortened. Completed ongoing sessions remain visible in a distinct calendar style.

Gentle pace adds 15% of otherwise usable capacity to the daily reserve, caps sessions at 35 minutes, and uses at least 15-minute breaks. Balanced follows the configured limits. Compact favors earlier, fuller placement while preserving explicit limits. Default energy is used only for tasks with no energy setting.

### Assistant-first day planning

Daylight opens on **Your day**: the assistant is the main workspace, alongside a live timeline with protected commitments, flexible study, recovery, progress updates, and unplaced work. Task lists and the full calendar remain supporting views. The whole application uses a dark charcoal and sage theme, including forms, dialogs, and calendar blocks; reduced-motion settings are respected.

Tell Daylight about the whole day in one message, for example **Math: worksheet 30 min due tomorrow; soccer 4–6pm; laundry 20 min**. Or choose **Help me get started** for subject-by-subject questions about homework, after-school events, and outside-school work. Review uncertain details before **Build my day**. The schedule updates alongside the conversation and keeps you on the home screen. Day-only deadlines mean 11:59pm; missing estimates default to 30 minutes; unfamiliar deadline language stays unset and ambiguous event times require confirmation. New conversation events are one-time; recurring events stay editable in Calendar.

After planning, say **I need 30 minutes more time on my essay**, **I'm stuck**, **I worked on my worksheet for 20 min**, or **I finished my essay**. Choose the target task before any progress mutation. Updates reuse the recoverable check-in journal and adaptive local engine, keeping fixed commitments and hard deadlines intact. Ask **What's next?** to summarize saved plans, or **Rebalance my day** to arrange existing work. Study preferences stay available within the conversation.

Today's conversation is retained in this tab's sessionStorage per workspace and restored on a same-day reload. It stays mounted while you browse other views. Planner mode uses deterministic guided capture. Optional installed Ollama or WebGPU browser models support free-form conversation and reviewed proposals; no paid key is required. Matching incomplete tasks are reused on retry, and failed calendar writes leave the review available. Session draft storage is best-effort; persisted tasks and planning snapshots remain separate.

Run **node tests/assistant-browser.cjs** after a build to verify the assistant home, direct day capture, guided capture, failed-save recovery, stuck/more-time/completion updates, conversation restore, and dark mobile layout.

### Assistant personality and avatar

Choose **Personalize** in the assistant header to rename the companion (default: Sol), choose a sun/moon/sprout avatar, and pick Calm, Straightforward, or Encouraging. The selected voice changes new greetings, questions, acknowledgements, planning feedback and progress responses. Historical messages retain their wording. Personality never changes task estimates, deadlines, capacity, or scheduling decisions. The avatar has subtle idle/working animation, disabled by reduced-motion preferences.

Identity preferences are validated and stored per workspace in localStorage; they survive reloads on this device and are separate from the tab-scoped conversation draft. A failed settings save keeps the prior identity. They are not cloud-synced or included in task/planning exports.

### Free by default

The primary planning and check-in flows run entirely on the device, with no AI endpoint, provider key, account, or paid service. The old paid-provider endpoint and adapter have been removed. Optional local/browser models are available without a paid provider. Natural-language progress proposals still require explicit task review before a saved change.

### Verification

Run pnpm typecheck, pnpm test, and pnpm build. The domain tests cover recurrence, deadlines, capacity, energy, pace, locks, deterministic output, partial days, persistent skip, and storage recovery. Run node tests/browser-smoke.cjs --serve to start an isolated production test server, or run without --serve against port 3000. Set PLAYWRIGHT_MODULE to an installed Playwright package path when outside the Codex bundled runtime. This exercises native drag/drop (including an invalid drop), manual moves, expanded preferences, stuck restart sessions, completed sessions, persistent skip/resume, an interrupted-save recovery, export, and offline planning with zero AI requests, alongside task CRUD and mobile layout.

### Remaining integrations

Cloud planning synchronization with transactional versioning, editable account timezones, Google Calendar sync, and closed-app reminders remain future work. Existing Supabase planning tables are not written by this browser-local implementation.

### Conversational model development (November 17, 2026)

The assistant can use an installed Ollama model on localhost, or an optional WebGPU browser model on a hosted app. Enable browser AI under AI settings; it requires a substantial first download. Without a language model, the app labels its guided planner mode explicitly. Conversation history and current tasks feed the model, while validated proposals await review before changing saved work. Unclear requests should produce a clarification rather than automatic task defaults. Schedule explanation requests are read-only. Follow-up questions keep pending progress proposals available.

The local API runs only on localhost and does not expose the local Ollama service to hosted visitors. The current Next.js server build requires a compatible server host; the existing Sites static manifest is not a deployment configuration for this API. Browser-model support remains optional and needs device-specific verification. Use `pnpm exec next build --webpack` if Turbopack fails to launch its CSS process in the Windows sandbox.

### Hosted export

Run `pnpm build:hosted` to prepare `out/` for the existing Sites static manifest. The export builds an isolated copy under ignored `artifacts/`, excludes the localhost-only API, and leaves the normal Next.js server build intact. Hosted users can enable conversational AI with the visible on-device model button. Hosted export does not itself publish the app. Local/server builds use `pnpm exec next build --webpack` and `pnpm start`.

Successful draft saves clear unsaved model context, preventing old tasks and events from returning as new proposals. Enter sends a chat message; Shift+Enter inserts a line break.

The launcher looks for an existing Daylight instance across ports 3102–3112 before starting another one. It records a source/configuration fingerprint after successful launcher builds. If a running build is unverified or older, it opens the existing app with instructions to stop its server and relaunch for updates; it never kills a running process automatically.

### Reviewed backup restore

In local mode, choose **Backups → Restore a backup file** in the top bar and select a Daylight version-1 JSON export (up to 5 MB). Preview task/calendar counts, then explicitly choose **Replace local workspace**. Close other Daylight tabs first. Restore blocks pending check-ins and stale previews, keeps a previous-workspace recovery copy, and stages a journal before replacing tasks/calendar. Startup reads finish interrupted restores before exposing data. This is recoverable coordination across browser keys, not a database transaction or cloud sync. The current conversation restarts after success. A task-only backup clears the previous calendar rather than leaving unrelated sessions behind.

**AI settings** lists supported chat models already installed in Ollama when running locally. Selecting a model does not download weights or enable a paid API; the server verifies that it is installed before every generation. The hosted static build still uses optional browser AI.

After a restore, **Backups → Download previous workspace** exports the saved recovery copy as a regular version-1 backup when the previous data is valid. Damaged previous storage remains downloadable as a raw recovery copy. Local model choices are remembered per workspace and revalidated against the installed model list after reconnecting.

### SAT workspace

**SAT practice** stores your confirmed target (initially 1550), optional confirmed next-test date, separate Math and Reading & Writing results, and a topic-based error log. Practice and official SAT results remain labeled separately. The review queue groups logged mistakes without treating their frequency as a diagnostic score or reviewed entries as mastered skills. Choose a topic and duration to add a real SAT review task through the existing protected-time scheduler. The assistant receives a compact SAT summary when discussing your plans.

SAT records stay separate per local/account workspace in this browser and are included in exports. Older version-1 task/calendar backups preserve existing SAT records when no SAT section exists; an explicit null SAT section clears them after review. Bluebook and Khan Academy links open official College Board resources; automatic result import, cross-device sync, and a validated question-generation curriculum are not implemented. Run `node tests/sat-browser.cjs` after a build for the complete synthetic-data workflow.
