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

- The running list contains yellow-highlighted text. Its meaning has not yet been confirmed; do not assume that color means urgent or due today.
- Weekly notes name activities without times or an unambiguous calendar week. Do not silently convert them into today's fixed appointments.
- The first actual work window and today's fixed commitments have not yet been confirmed.
- Automatic app-side Notion access still requires a real authorized connection. Access through the development chat can validate the workflow, but is not proof that the deployed app can refresh the list itself.

Private task contents, page snapshots and credentials must not be committed to this public repository. Use synthetic fixtures for tests. Validate a real daily-plan example with the user's confirmed context before expanding the interface or promoting this branch to production.

## First branch increment

The read-only `running-list` Notion action preserves individual yellow highlight spans, explicit checklist state, standalone items and separate untimed weekly notes. It reports its read time and bounded-read warnings. It does not assign highlight meaning or generate a plan yet. The next step is to validate the first daily plan using the user's confirmed available time, commitments and priorities.
