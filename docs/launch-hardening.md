# Launch hardening checkpoint

November 21, 2026. The app is not launch-ready. This increment addresses data loss and conversation continuity before introducing more integrations.

## Conversation preserves the approved day

Previously, every successful daily chat response rebuilt the timetable and cleared approval, including a response to “I just want to talk.” The day now updates only for concrete changed planning context or an explicit scheduling request. Open conversation and hypothetical/explanatory discussion preserve the existing context, timetable and approval while saving the conversation. The model still generates the conversational reply; the application enforces whether it can affect planning.

Synthetic real inference against an already installed local model passed five legacy conversation cases and four focused daily cases: capturing fixed events/flexible wants/window, correcting a practice end without changing the work window, pausing planning to chat, and leaving unknown event times unknown. This is limited evidence for those cases, not proof of arbitrary conversational reliability. No new model or paid API was enabled.

## Complete local backups

The version-1 backup accepts an optional `focused` section with the personal workspace and up to 120 saved day sessions. Existing backups remain readable and preserve current focused data when this section is absent. Full local exports now include meals, recipes, food journal, training routines/plans/logs, preferences, imported calendars, SAT attempts and saved focused conversations/plans. Authenticated full-workspace exports do not include the separate local personal workspace.

Preferences exposes the existing export/review/restore control. Restore replaces included dates and personal data, retaining saved days absent from the file; this is stated during review. A previous-state recovery export is staged before changes. An interrupted restore has a validated journal and blocks personal edits until recovery. A changed personal setting or added day after preview rejects a stale restore. Corrupt source records are preserved and raw recovery includes only known workspace keys, never account credentials or unrelated storage. Exports are plain JSON containing private user records and are subject to the existing 5 MB import limit.

Unit and browser checks exercise legacy backup compatibility, cancel, stale review, approved restore, interrupted personal restore, previous-state export, credential exclusion, mobile layout, conversation preservation and reload. Live provider OAuth, cross-device synchronization, current news synthesis and complete AI evaluations remain launch gates.

## Conversational running-list continuity — November 22, 2026

Reading the Notion running list again now preserves the current day's conversation, available window, events, flexible activities and surviving task choices. An unchanged relevant list keeps the timetable and approval; a changed highlight, completion, selected task or source identity creates a new draft from the confirmed facts when they are sufficient. Fresh approval is required. Failed reads or failed persistence preserve the previous saved day. Local snapshot reuse follows the same flow, and an older copy of the same page cannot roll back the loaded source. The restored page identifier is accepted by the source field rather than being rejected by browser URL validation. Reading remains an explicit refresh, not a live Notion subscription.

Saved focused conversations now keep up to 200 messages; only recent exchanges and confirmed structured facts are passed to the model. The model's list excerpt prioritizes highlighted and explicitly mentioned work instead of taking only the first 40 items on the page. Excerpt and omission metadata distinguish unseen work from completed work. The full list still feeds the scheduling engine. This is bounded daily conversation history, not unlimited memory.

Both model stages now receive relevant source/calendar/training/meal/preferences facts, and the reply stage receives a bounded existing-timetable excerpt when the day facts are unchanged. Read-back questions and hypothetical discussion cannot replace the day. A narrow grounded correction handles an explicitly named event's start/end change without accepting unrelated model edits. It requires a unique existing event reference and valid same-day ordering; it does not claim to resolve arbitrary ambiguous instructions.

Real inference with the already installed Gemma model initially exposed a repeated-token HTTP 500 and then an incorrect event-end extraction. An explicit JSON instruction for the reply stage and the grounded correction guard resolved the reproduced cases. Six synthetic real-inference scenarios pass: initial event/activity/window extraction, short event correction, open conversation, unknown event times, highlighted-homework recall and imported-calendar read-back. These are bounded evaluations, not evidence of universal model reliability or hosted browser-model inference. No model was downloaded and no paid service was enabled.

Browser scenarios verify refresh without a discard dialog, saved-ID reuse after reload, unchanged approval, changed highlights with a new draft, failed-source preservation, more than six exchanges, read-back without replanning, mobile layout and backup round trips. Real Notion OAuth and hosted AI acceptance still need configured-service verification.

## Reviewed homework progress — November 22

Conversational reports now stage an editable review before recording actual work, completion, setting work aside or requesting more focus. Saving produces a fresh timetable draft and never writes to Notion. Unknown actual time stays unknown. Stale reviews, backup restores, midnight and storage failure are covered; see [homework-progress.md](homework-progress.md). Installed-model testing exposed both completion abstention and false hypothetical completion claims. Exact unique-title recovery and a bounded reply repair address the reproduced cases; broad model reliability remains unverified.

## Hosted-model verification remains open

The November 22 real WebGPU retry found a usable GPU and successfully reached the approved Qwen model's configuration and runtime hosts. The weight redirect host `us.aws.cdn.hf.co` failed DNS resolution in Edge and timed out in a separate Node HEAD check. Actual browser inference was not reached. `tests/browser-day-model-live.cjs` reproduces the focused flow with local AI blocked, synthetic records and the existing isolated profile; its explicit download opt-in is still required. This evidence is a failed asset-delivery test, not proof that hosted chat works or that every user's network will fail. No different model or paid fallback was enabled.
