# Daylight launch readiness

## Scope and authority

On November 19, 2026, the user requested substantial continued development toward a launch-ready product covering the broader vision in `architecture.md`. This supersedes the earlier implementation hold on that vision, while leaving the explicitly unresolved preferences open. The requested three-day horizon describes the desired depth of work; it is not evidence that unattended execution, scheduled jobs, or a release date have been arranged.

The user confirmed on November 19: the first launch is **just for them, with their real data**, and is **web first, with iPhone afterward**. Public multi-user launch and a native iPhone release are not first-release gates. Existing scheduling, task CRUD, protected commitments, confirmed progress and local/cloud identity separation must remain intact. Personal production data must not be exposed through a public unauthenticated write/read endpoint.

Also confirmed November 19: **no paid model/API costs for now**; use existing local models and the optional browser model. Paul may reconsider paid AI after the product can charge customers; that is a future possibility, not billing authorization. Do not download another model without checking with Paul. A hosted or phone client cannot assume access to the computer's loopback Ollama service; remote AI access needs an explicitly authorized, protected design.

## Release gates

| Area | Current evidence | Required before calling it ready |
| --- | --- | --- |
| Reliable opening | Windows launcher finds the existing runtime, avoids occupied ports and detects source/build changes; unit coverage exists | Verify launch and restart on the user's machine, plus a stable hosted URL |
| Conversation | Ollama and optional WebGPU model paths, installed-local-model selection, bounded task context and reviewed changes exist | Full live-model and browser evaluation: clarifications, corrections, explanations, cancellation and ambiguous requests |
| Scheduling | Deterministic engine covers deadlines, energy, sleep/protected time, recovery, capacity and adaptive check-ins | Preserve regression suite and verify representative real schedules; elapsed time never proves completion |
| Local data recovery | Reviewed version-1 local restore and previous-workspace export are implemented with a recovery journal; unit/type checks pass | Validate export/restore, interrupted writes, stale previews, ownership and browser reload behavior |
| Accounts and sync | Supabase task adapter and RLS migration exist; calendar remains browser-local | Verify authenticated isolation against a configured project; implement and verify planning sync before claiming cross-device support |
| Academics/integrations | Manual task/calendar workflows exist | Google Classroom and external calendar authorization, imports, deduplication, revocation and actual account testing |
| SAT, target 1550 | Manual section-score history, error log, reviewed status, targeted planner tasks, assistant summary and backup support implemented | Separate section scores, error log, targeted study, practice results and scheduled preparation; confirm test date/preferences |
| Fitness | Product requirements recorded | Age-appropriate cross-country, soccer, calisthenics, strength and mobility tracking; confirmed training preferences and recovery limits |
| Nutrition | Product requirements recorded | Adequate fueling, preferences/restrictions, meals/snacks, optional logging and grocery support; individualized goals remain unconfirmed |
| Sleep | Protected sleep windows exist | Preferences/check-ins and verified use in scheduling and training recommendations |
| News | Product requirements recorded | Reliable linked sources, refresh timestamps, source-failure states and clear reporting versus analysis |
| Catholic readings | Default explicitly confirmed as daily Mass readings | Authorized source links/references, dates/timezones, optional reflections and reading progress |
| Morning briefing | Today shows a plan/timeline | Unified relevant content and genuinely verified pre-wake background generation; opening the page alone is not background automation |
| Morning/evening check-ins | Task-progress check-ins exist | Adaptable sleep/energy/recovery/priorities/outcomes conversations with durable confirmed records |
| iPhone | Responsive web styles exist | Confirm web-installable versus native requirement; test the chosen experience on an actual iPhone |
| Dependencies | Next.js updated to 16.4.6; production audit reports zero known advisories; both production builds pass | Recheck dependencies and deployed build before release |
| Release quality | 127 unit tests, both builds, browser workflows and bounded live-model checks pass | Complete browser/mobile/accessibility checks, failed-service recovery and deployment verification; publish known limitations accurately |

## Implementation order

1. Close data-loss and startup gaps; restore existing backups and keep changes recoverable.
2. Verify and improve the actual conversational model and adaptive planning loop.
3. Add the confirmed personal-life records and check-ins incrementally, integrating each into the same dashboard and planner.
4. Add authorized integrations and real background processing with source timestamps and failure handling.
5. Complete account/sync, chosen mobile experience, deployment and launch verification for the confirmed audience.

No gate is satisfied by a placeholder, mock transport, test count alone, successful Git push, or a feature listed in documentation. Keep source-code work in the repository; external account connections, secrets, permissions and unresolved personal choices require real user input.

## Verification checkpoint

The current development pass has **127 passing unit tests**, passing TypeScript, and passing server and static hosted production builds. Next.js was updated to 16.4.6 after a 16.4.3 vulnerability warning; the production dependency audit returned zero known advisories after that update. See the [official security release](https://github.com/vercel/next.js/releases/tag/v16.4.5).

Browser checks passed with isolated synthetic records: task CRUD, filters, calendar planning, protected time, adaptive check-ins, assistant identity and persistence, draft corrections, stale-write protection, cancellation, backup preview/restore/recovery, SAT results/error log/targeted scheduling/export/reload, desktop/mobile width, transitions and reduced motion. AI browser transport is mocked to verify the interface independently of inference. Tests launch their own local servers and never stop another Daylight process.

Separate real inference checks passed against the already-installed Gemma model: paragraph capture, editing a saved task, explaining the actual schedule, vague overload, multi-turn short answers, hypothetical discussion, and ambiguous extra-time requests. One failure exposed a guessed deadline in a short answer; application grounding now preserves the explicit weekday before review. Another exposed an invented extra-time duration; ambiguous check-ins now require clarification. These bounded cases do not prove all model responses correct. No paid service or model download was used. An unmocked Edge browser conversation also passed with the installed model and existing synthetic assignments; exploratory support stays conversational instead of recapturing saved work. The production HTTP route also passed a real installed-model request. This exposed and fixed a Next.js internal-localhost versus launcher-127.0.0.1 origin mismatch; the regression now checks legitimate, foreign and opaque origins without requiring inference in CI.

A GitHub validation workflow defines locked installation, domain/recovery tests, both builds, TypeScript and production dependency auditing for pushes and pull requests. Remote validation passed for the main feature upload and mobile navigation fix; subsequent changes must pass their own run. Local Git transport and the Sites source repository remain blocked by DNS; deployment and cross-device sync are still unresolved release gates. No complete-product or launch-ready claim is supported yet.

The conversational interaction pass adds compact model proposals, explicit chat approval/correction, bounded durable browser transcripts and separate chat export. Unit/type/server-build checks pass. Browser checks cover qualified corrections, confirmation after unrelated questions, scheduled work, progress confirmation, cross-day history and mobile layout. A real Gemma browser flow created an approved 25-minute study session without opening a form. Tests also exposed a misrouted explicit new task and a combined ISO date/time string; explicit new-task intent now stays capture, routing context is reduced, and only unambiguous combined ISO values are split before strict validation. This is bounded evidence, not parity with a frontier model or a complete launch claim.

The reported scripted-intake regression is covered by a browser test: unavailable chat produces no canned intake answer, retains its draft, enters guided capture only on an explicit choice, then reconnects and sends the exact request to simply talk through model transport. Real installed-model evaluation of that request also passed. The redesigned timetable passed actual engine-time, protected/recovery card, active-block, overnight, desktop/tablet/mobile and no-inferred-completion checks.
