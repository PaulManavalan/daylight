# Daylight architecture

Daylight is a Next.js / React / TypeScript student planner. The primary experience is free and local: task capture, protected commitments, scheduling, manual control, and adaptive check-ins require no model provider or account.

## State and persistence

Tasks use the existing repository interface: browser-local demo records or Supabase tasks behind authenticated, owner-only RLS. Signing in does not silently migrate demo data. Planning state is kept separately per browser/account identity under `daylight.planning.v1.<owner>`.

A planning snapshot contains preferences, recurring protected-time definitions, study sessions, set-aside task IDs, the last 50 check-ins, a rolling 14-day work-credit record, and the latest plan report. UTC ISO strings store concrete times; work windows and recurrence use the browser's local calendar/timezone, including DST. Account timezone editing and cross-device planning sync are not implemented.

`PlanningStore` validates snapshots with Zod, retains a last-known-valid backup, and compares the current raw snapshot before saving to reject stale writes. Invalid primary data can recover from a valid backup with a notice. If both are unreadable, data stays intact and the UI offers a raw recovery download. Exports include tasks and planning. Local mode now supports reviewed version-1 export restores with ownership normalization, stale-preview checks, a previous-workspace recovery copy and an interrupted-restore journal. Repository/calendar startup reads recover that journal first. Signed-in account imports remain unsupported.

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

The existing Supabase planning tables remain future cloud-sync infrastructure; this client does not write schedules to those tables. Google Calendar sync, background notifications, signed-in account import, and full offline page installation/caching are outside the current implementation. Local planning works without network access once the app is loaded. No paid-provider API route remains.


The home assistant supports either a mixed day brief or guided subject/event/outside-work intake. It reviews drafts before writing and remains on the home workspace after planning. Explicit progress phrases produce task choices before mutation; the parent applies the same check-in proposal and staged journal as the calendar. Home intake reloads task rows and reuses matching incomplete title/subject pairs on retries. A saved snapshot is then propagated to the hidden calendar through a one-shot refresh command. Per-workspace pending draft state lives in tab-scoped sessionStorage for the current local date. A separately validated, bounded transcript persists in localStorage across tabs and days with stale-write rejection. Only recent context reaches the model, and historical turns carry their dates. Pending proposals are not resurrected into a new day/tab. Model-backed proposals use compact summaries with optional direct editing; explicit chat approval applies the visible validated proposal without another model call. Qualified or question-following acknowledgments cannot silently approve prior work. Chat export is separate from task/plan backups, and a successful local workspace restore clears the current chat. Dark theme tokens and responsive home styles preserve keyboard focus and reduced-motion behavior.


Assistant identity is a separate, Zod-validated per-workspace localStorage record (name, tone, avatar), with a default on missing/corrupt data. New assistant messages pass through a pure voice formatter; persisted historical text is restored verbatim, and planner outputs remain untouched. Personality settings save before updating the visible identity. Code-native SVG avatars respect reduced-motion preferences and are decorative to assistive technology.

## Long-term product vision — evolving source context

Source: the user's “Daylight — Long-Term Product Vision and Development Context,” supplied November 18, 2026. Implementation authorization was subsequently expanded on November 19; current launch scope and confirmed constraints are recorded in `launch-readiness.md`. The following preserves the original context and requirements. This is an evolving direction, not a finalized specification. The user explicitly authorized continued roadmap implementation on November 19 and November 21. Preserve the existing application and requirements; external connections, paid usage, scheduling and unresolved personal choices keep their existing boundaries. The order below is not an implementation priority.

Daylight should eventually become one central, conversational, proactive and adaptive personal life dashboard. It should understand goals, commitments, preferences and routines through ongoing conversations and authorized integrations, then help create realistic daily and weekly plans. External services may supply data or specialized capabilities, while Daylight unifies the experience. The long-term targets are a responsive web application and an eventual iPhone experience, without assuming the existing web architecture needs replacement.

### Future areas

- **Academics:** Preserve task management and adaptive scheduling. Subject to actual API availability and permissions, import Google Classroom assignments, courses and deadlines. Track homework, projects and tests; improve duration estimates using confirmed completion data; prioritize deadlines, difficulty, importance and available time; schedule work and reschedule unfinished work.
- **SAT preparation:** The user's target is **1550**. Build personalized daily/weekly study plans, separate Math and Reading & Writing performance tracking, weak-area and recurring-error analysis, an error log, targeted review, and original SAT-style questions with explanations. Incorporate official College Board practice resources, including Bluebook and Khan Academy where appropriate. Schedule practice tests and analyze manually entered or legitimately imported results. Adapt to performance, available time and confirmed test dates without overwhelming other commitments. Specific study methods and test dates remain open.
- **Activities and calendars:** Support school, robotics, soccer, cross-country, other extracurriculars, appointments, personal commitments, free time and recurring or one-time events. Combine conversational scheduling with authorized calendar integrations. Resolve incomplete information through conversation rather than silently inventing details.
- **Fitness:** Support cross-country/endurance, soccer skills/performance, calisthenics, general strength, flexibility and mobility. Personalize plans, track history and progress, account for practices and competitions, balance weekly goals, and protect recovery/rest. Adjust for fatigue, soreness, sleep, available time and commitments. Recommendations should be age-appropriate and sustainable; avoid excessive stacked training loads or sacrificing recovery to fill a schedule.
- **Nutrition:** Support adequate fueling for school, growth, training and recovery. Potential features include balanced meals/snacks, optional protein tracking with individualized goals based on appropriate guidance, meal planning, favorite meals, preferences/restrictions, grocery lists and optional logging. Avoid restrictive eating or obsessive tracking. Specific nutrition preferences and guidance remain unconfirmed.
- **Daily news:** Prepare a concise morning briefing using reliable sources and links. Potential categories are US news, international affairs, technology, AI, business, science and sports. Distinguish reporting from analysis and present important contested issues fairly. Personalization remains open.
- **Bible reading:** Default to **Catholic daily Mass readings**; a structured Bible reading plan may be introduced later. Potential features include Scripture references, authorized source links, brief explanations/reflections, optional prayers, and reading history/progress. Prepare this content for the morning briefing.
- **Sleep and recovery:** Track preferred bed/wake times, school and other commitments, and optional sleep-quality check-ins. Protect adequate sleep as a scheduling priority, incorporate recovery into workout recommendations, and consider authorized health integrations when technically feasible. Sleep is not leftover time.

### Scheduling and conversation principles

Preserve and extend the deterministic scheduling engine and adaptive check-ins. The intended division is AI for understanding intent, recommendations and check-ins, with deterministic validation of constraints and feasible placement. Future scheduling should identify conflicts, prioritize deadlines/importance, account for energy/workload/recovery, reorganize flexible work when circumstances change, preserve important commitments, explain major decisions, learn from confirmed outcomes and avoid overload. Ask permission before modifying significant or protected commitments. Scheduled time alone never proves completion: progress requires check-ins or other reliable evidence.

### Morning briefing and daily check-ins

The eventual morning briefing should be prepared automatically **before the user wakes up**, rather than requiring a manual generation action. It should include a greeting, upcoming schedule/next activity, important academic deadlines, SAT practice, workouts, nutrition reminders or meals, Catholic readings, concise news and an AI priority summary. Account for timezone, schedule changes, source availability, necessary refreshes and actual background-processing infrastructure. This is a future requirement, not an existing automation or authorization to schedule one.

Short, useful and adaptable conversational morning check-ins may cover sleep, energy, soreness/recovery, schedule changes, priorities and upcoming commitments. Evening check-ins may cover completed/unfinished assignments, SAT progress, workouts, energy/recovery and tomorrow's changes. Use confirmed information to improve later schedules and recommendations; exact check-in behavior remains open.

### Platform boundaries and unresolved decisions

Future requirements include cross-device synchronization, notifications/reminders, clear daily/weekly views, simple conversation, privacy-conscious personal storage and user control over integrations and automatic actions. Evaluate native or appropriately packaged iPhone options when mobile work is authorized. Do not replace the existing architecture solely because of this vision.

Exact scheduling preferences, SAT methods, workout programming, nutrition preferences, news personalization, check-in behavior, automation boundaries, iPhone implementation and integration priorities remain unconfirmed. Inspect existing code before future implementation, reuse working architecture, develop incrementally, maintain scheduling tests and prioritize reliability, maintainability, appropriate permissions and secure storage. Do not invent missing requirements or claim integrations/background automation work before implementation and verification.

Chat is the default interaction even when a model connection is unavailable. A send retries local model discovery and preserves the message on failure. Guided capture requires an explicit choice, and an open-chat request exits the intake before parsing any task/event content. Reconnection exposes the selected provider synchronously to the next generation, avoiding stale React state immediately after discovery. The home timetable presents the existing agenda as timed cards without changing scheduling constraints or completion facts.


## Daily reflection notes

Morning/evening check-ins are free-text notes proposed through the chat composer. An explicit check-in prefix or the visible action starts a review; the user may edit, approve in chat, save without a model, or discard. Notes are not interpreted as task completion. `daily_checkins` is optional in the existing planning schema, capped at 60 uniquely identified entries and preserved by the same CAS-protected planning writes and backup/restore. A stale-day proposal must be recreated; identical retry IDs are idempotent. Saved-entry removal validates the reviewed snapshot and requires confirmation. The pending review is tab-scoped and only restores on the same day with the matching transcript.

The assistant receives up to six recent dated notes, each truncated to 500 characters, with a smaller browser-model window. Questions that recap saved reports remain read-only. This does not implement medical advice, automatic energy/capacity changes, a health integration or scheduled morning briefing.
