# Launch hardening checkpoint

November 21, 2026. The app is not launch-ready. This increment addresses data loss and conversation continuity before introducing more integrations.

## Conversation preserves the approved day

Previously, every successful daily chat response rebuilt the timetable and cleared approval, including a response to “I just want to talk.” The day now updates only for concrete changed planning context or an explicit scheduling request. Open conversation and hypothetical/explanatory discussion preserve the existing context, timetable and approval while saving the conversation. The model still generates the conversational reply; the application enforces whether it can affect planning.

Synthetic real inference against an already installed local model passed five legacy conversation cases and four focused daily cases: capturing fixed events/flexible wants/window, correcting a practice end without changing the work window, pausing planning to chat, and leaving unknown event times unknown. This is limited evidence for those cases, not proof of arbitrary conversational reliability. No new model or paid API was enabled.

## Complete local backups

The version-1 backup accepts an optional `focused` section with the personal workspace and up to 120 saved day sessions. Existing backups remain readable and preserve current focused data when this section is absent. Full local exports now include meals, recipes, food journal, training routines/plans/logs, preferences, imported calendars, SAT attempts and saved focused conversations/plans. Authenticated full-workspace exports do not include the separate local personal workspace.

Preferences exposes the existing export/review/restore control. Restore replaces included dates and personal data, retaining saved days absent from the file; this is stated during review. A previous-state recovery export is staged before changes. An interrupted restore has a validated journal and blocks personal edits until recovery. A changed personal setting or added day after preview rejects a stale restore. Corrupt source records are preserved and raw recovery includes only known workspace keys, never account credentials or unrelated storage. Exports are plain JSON containing private user records and are subject to the existing 5 MB import limit.

Unit and browser checks exercise legacy backup compatibility, cancel, stale review, approved restore, interrupted personal restore, previous-state export, credential exclusion, mobile layout, conversation preservation and reload. Live provider OAuth, cross-device synchronization, current news synthesis and complete AI evaluations remain launch gates.
