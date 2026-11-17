# Daylight architecture

Daylight is a Next.js / React / TypeScript student planner. The primary experience is free and local: task capture, protected commitments, scheduling, manual control, and adaptive check-ins require no model provider or account.

## State and persistence

Tasks use the existing repository interface: browser-local demo records or Supabase tasks behind authenticated, owner-only RLS. Signing in does not silently migrate demo data. Planning state is kept separately per browser/account identity under `daylight.planning.v1.<owner>`.

A planning snapshot contains preferences, recurring protected-time definitions, study sessions, set-aside task IDs, the last 50 check-ins, a rolling 14-day work-credit record, and the latest plan report. UTC ISO strings store concrete times; work windows and recurrence use the browser's local calendar/timezone, including DST. Account timezone editing and cross-device planning sync are not implemented.

`PlanningStore` validates snapshots with Zod, retains a last-known-valid backup, and compares the current raw snapshot before saving to reject stale writes. Invalid primary data can recover from a valid backup with a notice. If both are unreadable, data stays intact and the UI offers a raw recovery download. Exports include tasks and planning; importing exported files is not implemented.

## Explainable local planner

`src/lib/scheduling.ts` is a pure planning service. Given tasks, state, horizon, and an explicit current time, it produces sessions, unplaced minutes, changes, and warnings. Stable task/time-based IDs make identical inputs deterministic and keep calendar updates steady.

1. Expand recurring fixed commitments, including overnight occurrences, in local wall time.
2. Preserve valid locked sessions and ongoing work. Explicit completion/skip can release selected work. Conflicting locks yield to hard constraints with warnings, and oversized locks shrink to remaining task minutes.
3. Subtract commitments, transition recovery, sessions, and breaks from selected weekday/weekend study windows. Count confirmed progress and completed study segments against daily capacity and leave the daily reserve unfilled. Work credits link to completed segments so overlap is credited once; out-of-session work remains additive. The visible-history cap cannot restore previously consumed capacity.
4. Reassess shared deadline demand and slack after each allocated session. Urgent deadlines lead, using the last usable window before each deadline (including the deep-work cutoff), so flexible work does not take a scarce early window. Otherwise priority, energy, and the task affected by a check-in influence order.
5. Score free slots for earlier days, useful session lengths, focus-window match, and deadline risk. High-focus work stops at the configured evening cutoff. Stuck work begins with a short restart session.
6. Validate rest between sessions, reserve longer recovery after sustained work, and stop at capacity. Report anything that cannot fit without silently extending deadlines or protected commitments.

Gentle pace adds breathing room and shorter sessions; compact pace favors earlier placement while retaining explicit limits. A default energy level applies only to tasks without their own setting. This is a bounded heuristic, not a guarantee of globally optimal packing. Infeasibility stays visible.

## Check-ins and recovery

Done clears remaining work and reclaims future slots; an ongoing completed session is retained in a distinct calendar style. Making progress subtracts confirmed minutes and archives the reported portion of an active session. The recovery path uses the same archival function. Need more time and Stuck add minutes and replan the rolling week. Stuck creates a 15-minute restart. Skip keeps work set aside across later adaptive replans; Resume or a new explicit day/week plan includes it again.

Before a task mutation, the client persists a small check-in journal. It then saves the task, commits the planning snapshot, and clears the journal. A reload never repeats the task mutation: it checks the current task, merges a missing history entry once, and rebuilds the plan. If current task values do not match, those values and the journal are retained: another tab may still be saving. Calendar writes remain blocked until recovery or an explicit choice to keep current task values and archive the unapplied journal. A saved matching task update must be recovered rather than dismissed. This is recovery across two stores, not a cross-store database transaction.

Other task edits refresh an existing plan. Task deletion removes related visible sessions/history. Planning storage events refresh the matching calendar; task storage events reload demo tasks without remounting the calendar on unrelated preference or backup writes.

## Daily workflow

Inline quick capture uses the same task schema and repository as the full editor. Expanding Details preserves title, subject, and estimates; canceling returns to the draft. Today is the default assistant-first workspace, pairing an ongoing conversation with a chronological day timeline, including undated tasks, fixed commitments, and recovery. There is no separate assistant navigation tab. It exposes direct check-ins and planning actions through one-shot calendar commands. Command IDs are monotonic and acknowledged on consumption; workspace switches clear pending commands.

## Calendar interaction

Day/week views share the same state. Fixed commitments are striped; flexible study blocks are colored; pins indicate manual placement; completed sessions have check marks and muted styling. Blocks open check-in, task editing, move, lock/unlock, and unschedule controls. Dragging previews its proposed time and constraint errors; valid manual drops are pinned by default. The move dialog is the keyboard/touch alternative. Day headings open the selected day. Empty periods, overloaded work, recovery errors, and set-aside work have explicit guidance.

## Verification and boundaries

The test suite exercises scheduling, adaptive changes, lock conflicts, deterministic output, old snapshot migration, storage failures, and task CRUD. The headless browser regression covers native dragging, invalid drops, preferences, completion, export, skip/resume, an interrupted save, offline local planning, and mobile layouts.

The existing Supabase planning tables remain future cloud-sync infrastructure; this client does not write schedules to those tables. Google Calendar sync, background notifications, import, and full offline page installation/caching are outside this release. Local planning works without network access once the app is loaded. No paid-provider API route remains.


The home assistant supports either a mixed day brief or guided subject/event/outside-work intake. It reviews drafts before writing and remains on the home workspace after planning. Explicit progress phrases produce task choices before mutation; the parent applies the same check-in proposal and staged journal as the calendar. Home intake reloads task rows and reuses matching incomplete title/subject pairs on retries. A saved snapshot is then propagated to the hidden calendar through a one-shot refresh command. Per-workspace conversation state lives in tab-scoped sessionStorage for the current local date; it is best-effort draft persistence, separate from task and plan storage. Dark theme tokens and responsive home styles preserve keyboard focus and reduced-motion behavior.


Assistant identity is a separate, Zod-validated per-workspace localStorage record (name, tone, avatar), with a default on missing/corrupt data. New assistant messages pass through a pure voice formatter; persisted historical text is restored verbatim, and planner outputs remain untouched. Personality settings save before updating the visible identity. Code-native SVG avatars respect reduced-motion preferences and are decorative to assistive technology.
