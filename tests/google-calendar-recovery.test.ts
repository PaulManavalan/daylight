import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stageGoogleCreate,
  resolveGoogleCreate,
} from "../src/lib/google-calendar-recovery";
import {
  emptyCalendars,
  calendarSnapshotSchema,
} from "../src/lib/calendar-transfer";
import { defaultPersonalWorkspace } from "../src/lib/personal-workspace";
import { erasePayload } from "../src/lib/workspace-privacy";
import type {
  PendingGoogleCreate,
  GoogleEventReceipt,
} from "../src/lib/google-calendar-data";
const proposal = (): PendingGoogleCreate => ({
  owner: "local-demo",
  calendarTitle: "Synthetic school",
  attemptedAt: "2026-11-24T10:00:00.000Z",
  draft: {
    calendarId: "school@example.test",
    requestId: crypto.randomUUID(),
    title: "Synthetic focus",
    start: "2026-11-24T15:00:00.000Z",
    end: "2026-11-24T15:30:00.000Z",
  },
});
const receipt = (row: PendingGoogleCreate): GoogleEventReceipt => ({
  id: "provider-event",
  etag: "v1",
  calendarId: row.draft.calendarId,
  title: row.draft.title,
  start: row.draft.start,
  end: row.draft.end,
  url: null,
  outcome: "existing",
});
test("uncertain creation survives serialization and retries preserve the original request", () => {
  const row = proposal(),
    staged = stageGoogleCreate(emptyCalendars(), row);
  const restored = calendarSnapshotSchema.parse(
    JSON.parse(JSON.stringify(staged)),
  );
  assert.deepEqual(restored.pendingGoogleCreates, [row]);
  assert.throws(
    () =>
      stageGoogleCreate(restored, {
        ...row,
        draft: { ...row.draft, requestId: crypto.randomUUID() },
      }),
    /Reopen that saved review/,
  );
  assert.deepEqual(
    stageGoogleCreate(restored, {
      ...row,
      attemptedAt: "2026-11-25T10:00:00.000Z",
    }),
    staged,
  );
  assert.throws(
    () =>
      stageGoogleCreate(restored, {
        ...row,
        draft: { ...row.draft, title: "Different event" },
      }),
    /different event details/,
  );
  assert.throws(
    () => stageGoogleCreate(restored, { ...row, owner: crypto.randomUUID() }),
    /another workspace/,
  );
  assert.throws(
    () =>
      calendarSnapshotSchema.parse({
        ...staged,
        pendingGoogleCreates: [row, row],
      }),
    /unique/,
  );
});
test("only the current workspace and matching confirmed creation can resolve a pending request", () => {
  const first = proposal(),
    second = {
      ...proposal(),
      draft: { ...proposal().draft, title: "Another focus" },
    },
    staged = stageGoogleCreate(
      stageGoogleCreate(emptyCalendars(), first),
      second,
    );
  for (const wrong of [
    { ...receipt(first), title: "Other event" },
    { ...receipt(first), calendarId: "other" },
    { ...receipt(first), outcome: "deleted" as const },
  ])
    assert.throws(
      () =>
        resolveGoogleCreate(staged, first.owner, first.draft.requestId, wrong),
      /different event details/,
    );
  assert.throws(
    () =>
      resolveGoogleCreate(
        staged,
        crypto.randomUUID(),
        first.draft.requestId,
        receipt(first),
      ),
    /current workspace/,
  );
  const resolved = resolveGoogleCreate(
    staged,
    first.owner,
    first.draft.requestId,
    receipt(first),
  );
  assert.deepEqual(resolved.pendingGoogleCreates, [second]);
  assert.equal(
    staged.pendingGoogleCreates?.length,
    2,
    "Failed or successful resolution never mutates its input",
  );
});
test("calendar erasure also clears unfinished event details without changing unrelated domains", () => {
  const personal = defaultPersonalWorkspace();
  personal.displayName = "Synthetic preference";
  personal.calendars = stageGoogleCreate(personal.calendars, proposal());
  const cleared = erasePayload("personal", personal, [
    "calendars",
  ]) as typeof personal;
  assert.deepEqual(cleared.calendars, emptyCalendars());
  assert.equal(cleared.displayName, personal.displayName);
  assert.deepEqual(cleared.nutrition, personal.nutrition);
});
