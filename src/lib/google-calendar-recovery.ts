import {
  calendarSnapshotSchema,
  type CalendarSnapshot,
} from "./calendar-transfer";
import {
  pendingGoogleCreateSchema,
  googleReceiptSchema,
  type PendingGoogleCreate,
  type GoogleEventReceipt,
} from "./google-calendar-data";

/** Persist before sending; a pending record means outcome unknown, never confirmed creation. */
export function stageGoogleCreate(
  snapshot: CalendarSnapshot,
  proposal: PendingGoogleCreate,
): CalendarSnapshot {
  const current = calendarSnapshotSchema.parse(snapshot),
    next = pendingGoogleCreateSchema.parse(proposal);
  const pending = current.pendingGoogleCreates ?? [],
    existing = pending.find(
      (row) => row.draft.requestId === next.draft.requestId,
    );
  if (
    pending.some(
      (row) =>
        row.owner === next.owner &&
        row.draft.requestId !== next.draft.requestId &&
        row.draft.calendarId === next.draft.calendarId &&
        row.draft.title === next.draft.title &&
        row.draft.start === next.draft.start &&
        row.draft.end === next.draft.end,
    )
  )
    throw Error(
      "An unfinished request already has these event details. Reopen that saved review instead of creating another event.",
    );
  if (
    existing &&
    (existing.owner !== next.owner ||
      JSON.stringify(existing.draft) !== JSON.stringify(next.draft))
  )
    throw Error(
      "This saved request belongs to different event details or another workspace. Review its original proposal.",
    );
  return calendarSnapshotSchema.parse({
    ...current,
    calendars: current.calendars.map((row) =>
      row.id.startsWith("google-live:") ? { ...row, needsRefresh: true } : row,
    ),
    pendingGoogleCreates: existing ? pending : [...pending, next],
  });
}

/** Only a matching provider receipt resolves the durable uncertain create. */
export function resolveGoogleCreate(
  snapshot: CalendarSnapshot,
  owner: string,
  requestId: string,
  rawReceipt: GoogleEventReceipt,
): CalendarSnapshot {
  const current = calendarSnapshotSchema.parse(snapshot),
    receipt = googleReceiptSchema.parse(rawReceipt),
    pending = current.pendingGoogleCreates ?? [];
  const proposal = pending.find((row) => row.draft.requestId === requestId);
  if (!proposal || proposal.owner !== owner)
    throw Error(
      "The saved event request changed. Reopen the current workspace before resolving it.",
    );
  const draft = proposal.draft;
  if (
    !["created", "existing"].includes(receipt.outcome) ||
    receipt.calendarId !== draft.calendarId ||
    receipt.title !== draft.title ||
    receipt.start !== draft.start ||
    receipt.end !== draft.end
  )
    throw Error(
      "Google returned different event details. Keep the saved request and check the calendar before trying again.",
    );
  return {
    ...current,
    pendingGoogleCreates: pending.filter(
      (row) => row.draft.requestId !== requestId,
    ),
  };
}
