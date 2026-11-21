# Notion-first daily planner

## Product correction — November 21, 2026

The user clarified that the current feature-rich app is not the core experience they wanted. The first product should read their existing running Notion list and turn it into a practical daily planner. They want to preserve the existing app and start this narrower direction on a separate GitHub branch.

Development branch: `codex/notion-daily-planner`. Keep `main` and its production app intact. This branch starts from the working app; its creation is not evidence that a redesigned planner is implemented or linked to a live Notion account.

## First workflow to validate

1. Read the chosen running Notion list directly and show when it was read. Keep Notion as the source rather than requiring the user to recreate and maintain a second task list.
2. Ask only the missing facts needed for today: available time, fixed commitments, and priorities or deadlines that the list does not establish.
3. Suggest a realistic, timed daily plan. For ongoing work, distinguish suggested focus blocks from estimates that the entire assignment will be finished.
4. Let the user adjust the plan when their day changes. A scheduled block never proves that the underlying Notion item is complete.

Preserve and reuse working scheduling constraints and Notion access code where useful. Do not broaden the first milestone into unrelated life dashboards, companion customization or additional trackers. Existing features remain available on `main`.

## Facts still requiring clarification

- Yellow highlights are confirmed as work for today; they do not establish urgency or deadlines.
- Weekly notes name activities without times or an unambiguous calendar week. Do not silently convert them into today's fixed appointments.
- The app must learn the actual work window and today's fixed commitments conversationally.
- Automatic app-side Notion access still requires a real authorized connection. Access through the development chat can validate the workflow, but is not proof that the deployed app can refresh the list itself.

Private task contents, page snapshots and credentials must not be committed to this public repository. Use synthetic fixtures for tests. Validate a real daily-plan example with the user's confirmed context before expanding the interface or promoting this branch to production.

## First branch increment

The read-only `running-list` Notion action preserves individual yellow highlight spans, explicit checklist state, standalone items and separate untimed weekly notes. It reports its read time and bounded-read warnings. It does not assign highlight meaning or generate a plan yet. The next increment below implements the in-app conversation rather than asking the user to specify a day in the development chat.

## Confirmed interaction and branch preview

Yellow highlights mean work the user wants to do today. The AI in the app asks about today's events, anything else the user wants to do, and the usable work window. The development chat should not substitute one hand-authored day for that product flow. Meals and workout planning are deferred.

The focused preview is `/day` on `codex/notion-daily-planner`. The original workspace remains at `/` and on `main`. The preview reads a page through the existing Notion OAuth connection, or uses an explicitly selected synthetic sample. It does not import the list into the legacy task repository. App-side OAuth credentials must be configured separately; the development chat's Notion connection is not an app credential.

For the owner's local preview only, `DAYLIGHT_LOCAL_NOTION_SNAPSHOT=1` enables a fixed snapshot at ignored `artifacts/private-running-list.json`. Requests must use a loopback authority and same origin; Vercel always disables this endpoint. The interface shows the read time and makes clear it is not a live feed. Never commit the snapshot or credentials.

Local Ollama and the optional free browser model use a separate structured `notion_day` conversation mode. They retain day facts, exclude appointments with unknown times, and leave timetable generation to the deterministic scheduler. Incomplete events prevent generation. Current work uses suggested 25-minute focus blocks and a three-hour allowance, visibly distinguished from assignment completion estimates. Conversational changes produce a fresh reviewable draft. Approval saves only in this browser, separately from the full workspace. Passing time never completes a Notion task.

Validation: unit tests cover selected/checked/deferred items, unknown keys, capacity, protected events and missing context. Browser checks cover the sample conversation, timetable, approval, reload, mobile width and unavailable-AI recovery. Real installed-model checks exercised multi-turn events, other wants, work-window extraction and event corrections. They also exposed inconsistent extraction and token-repetition aborts in the installed small model. Guards reject malformed answers and ungrounded times while retaining the previous plan and user draft; model reliability remains an open validation item. These are bounded checks, not proof of every possible model response or launch readiness. Browser-model inference and live hosted Notion OAuth still require separate end-to-end validation.
