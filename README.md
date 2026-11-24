# Daylight

A calm student planner with a task database, day/week calendar, protected time, and adaptive scheduling. Core planning works in the independent browser-local demo.

## Run locally

On the development branch, **Start Daylight Preview.cmd** opens the Notion-first daily planner at http://127.0.0.1:3104/day. Its server uses an isolated build snapshot, so rebuilding the project cannot remove the JavaScript or CSS files used by the running preview. It checks the page and its assets before opening. The original workspace and launcher below remain available. The preview adds reviewed calendar-file import/export and optional day-details review when AI is unavailable; these are not live calendar sync. See [the current requirements and checkpoint status](docs/master-requirements.md) and [calendar integration details](docs/calendar-integrations.md).

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

The focused `/day/news` reader and Today overview now show linked publisher headlines using saved topic interests. The personal RSS checkpoint includes The Guardian sections and separately labelled NASA updates, original publication dates, duplicate removal and stale-source states. It does not generate AI news summaries or prepare a briefing while the app is closed. See [news reader scope and verification](docs/news-reader.md) before commercial use.

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

With a model active, the primary flow is an ongoing conversation. Proposals appear as compact summaries; you can correct them in chat, approve the latest proposal with a standalone ‘yes’, or explicitly say ‘save that plan’. A qualified answer such as ‘yes, but make it 25 minutes’ remains a correction. A bare yes after an unrelated question does not approve an older proposal. Direct-edit forms remain under Edit details directly. Actual writes still use the validated, recoverable task and planning paths.

The recent transcript (up to 100 messages within a bounded storage size) is retained per workspace in this browser's localStorage and survives new tabs, restarts and date changes. Only a bounded recent window reaches the selected model; this is not unlimited memory. Older turns are dated in the model context. Same-day draft state stays in sessionStorage; a new day or tab does not resurrect stale pending proposals. Failed or conflicting chat writes preserve the previous transcript and show a notice. Download conversation exports the loaded chat separately; task/calendar backups do not include it. Local workspace restore clears the current chat. There is no cloud chat sync. Basic planning is available only after an explicit choice. Disconnected chat keeps the message and retries local AI; it never silently advances a scripted intake. Requests to stop planning and simply talk pause guided setup, preserving the conversation. On the hosted app, a browser model must be explicitly enabled; the hosted app cannot use the desktop’s loopback Ollama service.

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

### iCloud Calendar read connection

`/day/preferences#icloud-calendar` now offers a reviewed iCloud CalDAV read flow using an Apple app-specific password. Server-only origin/encryption configuration is shown in `.env.example`; do not put an Apple account password or app-specific password in environment files. Choose a calendar and date window, review its events and explicitly use the saved read in the planner. Credentials stay outside planner records and exports. Event writes and continuous sync remain incomplete; real authenticated account acceptance is still required. See [calendar integration details](docs/calendar-integrations.md).

### SAT workspace

The focused `/day/sat` studio also supports reviewed practice-time choices for a day, skill and duration. These join Notion homework in `/day` within the same focus allowance, around protected events. Changing a choice requires a fresh timetable review. Planned or elapsed practice never creates an answer attempt or work record. The account-document layer carries these choices across signed-in focused screens; real configured-account acceptance remains a launch gate. The home dashboard's module cards show saved selections and distinguish samples or imported snapshots from live connections.

**SAT practice** stores your confirmed target (initially 1550), optional confirmed next-test date, separate Math and Reading & Writing results, and a topic-based error log. Practice and official SAT results remain labeled separately. The review queue groups logged mistakes without treating their frequency as a diagnostic score or reviewed entries as mastered skills. Choose a topic and duration to add a real SAT review task through the existing protected-time scheduler. The assistant receives a compact SAT summary when discussing your plans.

SAT records stay separate per local/account workspace in this browser and are included in exports. Older version-1 task/calendar backups preserve existing SAT records when no SAT section exists; an explicit null SAT section clears them after review. Bluebook and Khan Academy links open official College Board resources; automatic result import, cross-device sync, and a validated question-generation curriculum are not implemented. Run `node tests/sat-browser.cjs` after a build for the complete synthetic-data workflow.

### Local AI integration checks

After the server production build, run `node tests/local-api.cjs` for the HTTP origin regression without inference. `node tests/local-api.cjs --real-model` additionally uses your already-running Ollama service and an installed supported model. On this Windows development setup, `node tests/live-local-browser.cjs` checks a real browser conversation using the bundled Playwright and Edge. These checks use synthetic records in isolated workspaces; they do not import your personal data, download models or call a paid API.

### Readable daily timetable

The home plan shows actual start/end times, durations, day sections, separate focus/protected/recovery cards, current-block time remaining and an overnight end-day label. All times come from the existing deterministic planner; elapsed block time does not imply completed work. Run `node tests/day-plan-browser.cjs` for the schedule/display integration and `node tests/chat-connection-browser.cjs` for the exact reported intake-escape and model-reconnection regression.


### Morning and evening check-ins

Use **Morning check-in** or **Evening check-in** beside the chat composer, then write in your own words. Review/edit the note and choose **Save check-in**, or approve the latest review in chat. This works without an AI connection. Saved notes appear under **Recent check-ins**, can be removed after confirmation, and are included in the workspace backup. The last 60 notes are retained in this browser per workspace; recent bounded excerpts are shared with your selected chat model. Saved notes never mark tasks done or silently change the timetable.

An unsaved note survives a same-day reload in the same tab; a proposal left open across midnight needs a fresh check-in. Existing chat messages and downloaded backups retain their separate copies when a saved entry is removed. There is no cloud note sync or scheduled morning generation. Run `node tests/daily-checkin-browser.cjs` after a production build. `node tests/daily-checkin-model-eval.cjs` optionally checks recall with an already-installed local model and synthetic notes.


The optional real WebGPU check is `tests/browser-model-live.cjs`. It uses an isolated persistent test profile and the running app at http://127.0.0.1:3102, blocks local-model API requests, and can download roughly 1 GB. Obtain approval first; set `DAYLIGHT_ALLOW_MODEL_DOWNLOAD=1` explicitly to run it. A failed CDN download is not a successful browser-inference result. Browser AI needs reachable model files as well as WebGPU; partial cached files can be reused after a failed download.
### Notion connection

Open **Notion** in Daylight's top bar to import work or save a reviewed snapshot. This uses Daylight's own OAuth connection; it requires the running Next.js server (including Vercel), not the static `out/` copy.

One-time owner setup:

1. Open the [Notion developer portal](https://app.notion.com/developers/connections) and create an **OAuth connection** for Daylight (a public integration uses the same flow). Enable read-content and insert-content capabilities. A Marketplace listing is not required for authorization.
2. Register this production redirect URI exactly: `https://daylightv50.vercel.app/api/notion/callback`. To connect the local app too, also register `http://127.0.0.1:3102/api/notion/callback`.
3. Set these **server-only** environment variables on the deployment: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, and `NOTION_COOKIE_SECRET`. Use the production URI on Vercel; use the matching local URI in `.env.local` for localhost. Never use `NEXT_PUBLIC_` for these values, commit real secrets, or paste them into chat.
4. Generate the cookie secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` in your own terminal and put the result directly into the environment setting. Keep the key stable across instances of the same deployment. Changing it invalidates that deployment's existing Notion connections.
5. Redeploy/restart, choose **Connect Notion**, and select the existing pages Daylight may access. Include both the task source and the page where you want to save plans/check-ins.

Only the configured primary origin may start or change a connection. A Vercel preview alias or a different localhost port needs a separately configured, registered redirect URI; it cannot silently reuse another origin's authorization.

**Import:** search shared pages/tables or paste a Notion link. Regular pages support checklist/list items and subject lists such as `Math: Worksheet, Review for quiz`; a weekly-plan section is excluded. Databases support task titles, explicit subject/course/class fields, minute-based estimates and due/deadline date properties. Completed items are excluded. Confirm missing estimates, review date-only deadlines at 11:59 PM local time, then import the selected items. Source markers prevent repeat imports, including retries after partial local saves. Similar active title/subject matches start unselected for review; you may explicitly import one if it represents different work. Database page IDs remain stable across source renames. Imports do not modify Notion or automatically update existing Daylight tasks.

**Save:** choose an existing destination page and review either today's timetable (focus, protected time and recovery) or up to ten recent saved check-ins. **Save this to Notion** appends the exact reviewed section, rereads the destination and verifies its marker. A retry of that same export checks for the prior marker before writing again. Nothing is sent by merely opening a preview. This is manual transfer, not automatic two-way sync or an exactly-once distributed transaction. Concurrent independent clients or a manually removed export marker can defeat duplicate protection.

Access/refresh tokens are encrypted in HttpOnly, SameSite cookies scoped to `/api/notion`, with a 30-day Daylight connection lifetime. They are not placed in localStorage, transcripts, model context or workspace exports. Signed-in Daylight owners are verified through Supabase before matching the connection; local mode is a separate owner. Token refresh updates the encrypted cookie. **Disconnect this browser** clears its connection cookies; revoke the connection in Notion itself to remove its workspace access everywhere.

Reads are bounded: a regular source page reads up to 300 top-level blocks and shows up to 200 candidates; nested blocks are explicitly reported as omitted. Database queries load 100 rows per requested batch (up to 500 rows in the review screen). Exports use up to 40 timetable entries and 20 due-task reminders; destinations over 300 top-level blocks require a shorter page so the save can be verified within the request budget. These limits are not full-workspace synchronization.

Validation: `tests/notion.test.ts` and `tests/notion-api.test.ts` cover parsing, provenance, encryption/tampering, ownership, CSRF/state expiry, refresh, body limits and verified retry behavior. After a build, `node tests/notion-browser.cjs` exercises the workflow with synthetic records and mocked Notion transport. A real OAuth sign-in and real read/write verification against the selected pages are still required after configuring the app credentials.

References: [Notion OAuth authorization](https://developers.notion.com/guides/authorization/overview), [query data sources](https://developers.notion.com/reference/query-a-data-source), [append blocks](https://developers.notion.com/reference/patch-block-children).
### Vercel build settings

The root `vercel.json` explicitly selects Next.js, runs `pnpm run build`, and uses `.next` as its framework output. These repository settings override a stale dashboard preset that expects `public/`. Deploy the server build on Vercel so `/api/assistant` and `/api/notion` remain available; `build:hosted` and `out/` are separate static-export targets. A successful build does not replace the Notion OAuth environment setup above.
