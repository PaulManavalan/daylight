import { z } from "zod";
import type { RunningListSource } from "./notion-daily-source";
export const homeworkCheckinSchema = z
  .object({
    sourceKey: z.string().min(1).max(300),
    outcome: z.enum(["worked", "complete", "set_aside", "more_time"]),
    minutes: z.number().int().min(0).max(720).nullable(),
    remainingMinutes: z.number().int().min(0).max(240).nullable(),
    note: z.string().trim().max(500),
  })
  .strict()
  .refine(
    (value) =>
      ["worked", "more_time"].includes(value.outcome) ||
      value.remainingMinutes === null,
    "Only an unfinished item can have more time planned.",
  )
  .refine(
    (value) =>
      value.outcome !== "more_time" ||
      (value.minutes === null &&
        value.remainingMinutes !== null &&
        value.remainingMinutes > 0),
    "A focus-time change needs additional minutes and cannot invent actual work.",
  );
export type HomeworkCheckin = z.infer<typeof homeworkCheckinSchema>;
export const homeworkWorkRecordSchema = homeworkCheckinSchema.safeExtend({
  id: z.uuid(),
  sourcePageId: z.string().min(1).max(100),
  title: z.string().min(1).max(1000),
  subject: z.string().max(100).nullable(),
  sample: z.boolean(),
  recordedAt: z.iso.datetime(),
});
export type HomeworkWorkRecord = z.infer<typeof homeworkWorkRecordSchema>;
export const pendingHomeworkCheckinSchema = z.object({
  id: z.uuid(),
  value: homeworkCheckinSchema,
  sourcePageId: z.string().min(1).max(100),
  sourceReadAt: z.iso.datetime(),
  workIds: z.array(z.uuid()).max(200),
  reviewReply: z.string().max(1600),
  createdAt: z.iso.datetime(),
});
export type PendingHomeworkCheckin = z.infer<
  typeof pendingHomeworkCheckinSchema
>;
export function stageHomeworkCheckin(
  value: HomeworkCheckin,
  source: RunningListSource,
  records: HomeworkWorkRecord[],
  reply: string,
  now = new Date(),
): PendingHomeworkCheckin {
  if (!source.items.some((item) => item.key === value.sourceKey))
    throw Error(
      "The proposed homework is not in this list. Ask which assignment was intended.",
    );
  return pendingHomeworkCheckinSchema.parse({
    id: crypto.randomUUID(),
    value,
    sourcePageId: source.pageId,
    sourceReadAt: source.readAt,
    workIds: records.map((record) => record.id),
    reviewReply: reply,
    createdAt: now.toISOString(),
  });
}
export function verifyHomeworkCheckinReview(
  pending: PendingHomeworkCheckin,
  source: RunningListSource,
  records: HomeworkWorkRecord[],
) {
  if (
    pending.sourcePageId !== source.pageId ||
    pending.sourceReadAt !== source.readAt ||
    JSON.stringify(pending.workIds) !==
      JSON.stringify(records.map((record) => record.id))
  )
    throw Error(
      "The list or work records changed after this proposal. Review a fresh check-in before saving.",
    );
}
export const homeworkProgressSchema = z
  .array(homeworkWorkRecordSchema)
  .max(200)
  .refine(
    (records) =>
      new Set(records.map((record) => record.id)).size === records.length,
    "Work-record IDs must be unique.",
  )
  .refine(
    (records) =>
      records.reduce((total, record) => total + (record.minutes ?? 0), 0) <=
      1440,
    "Recorded work cannot exceed 24 hours in one day.",
  );
export function homeworkProgressFor(
  records: HomeworkWorkRecord[],
  pageId: string,
  key: string,
  focus = 25,
) {
  let remaining = focus,
    status: "unreported" | HomeworkCheckin["outcome"] = "unreported",
    minutes = 0,
    unknownTime = 0;
  for (const record of records.filter(
    (record) => record.sourcePageId === pageId && record.sourceKey === key,
  )) {
    status = record.outcome;
    minutes += record.minutes ?? 0;
    if (record.minutes === null && record.outcome !== "more_time")
      unknownTime++;
    remaining = ["complete", "set_aside"].includes(record.outcome)
      ? 0
      : record.remainingMinutes !== null
        ? record.remainingMinutes
        : Math.max(0, remaining - (record.minutes ?? 0));
  }
  return { status, minutes, unknownTime, remaining };
}
export function appendHomeworkWork(
  records: HomeworkWorkRecord[],
  raw: HomeworkCheckin,
  source: RunningListSource,
  sample: boolean,
  now = new Date(),
) {
  const proposal = homeworkCheckinSchema.parse(raw),
    item = source.items.find((item) => item.key === proposal.sourceKey);
  if (!item)
    throw Error(
      "This homework item is no longer in the loaded list. Refresh and review the check-in again.",
    );
  if (item.completion === "checked" && proposal.outcome === "complete")
    throw Error(
      "Notion already shows this assignment as complete. Your previous records are kept.",
    );
  const latest = records.at(-1)?.recordedAt;
  const entry = homeworkWorkRecordSchema.parse({
    ...proposal,
    id: crypto.randomUUID(),
    sourcePageId: source.pageId,
    title: item.title,
    subject: item.subject,
    sample,
    recordedAt: new Date(
      Math.max(+now, latest ? Date.parse(latest) + 1 : 0),
    ).toISOString(),
  });
  return homeworkProgressSchema.parse([...records, entry]);
}
export function removeHomeworkWork(
  records: HomeworkWorkRecord[],
  id: string,
  expected: string,
) {
  const record = records.find((record) => record.id === id);
  if (!record || JSON.stringify(record) !== expected)
    throw Error(
      "This work record changed after review. Review it again before removing it.",
    );
  return homeworkProgressSchema.parse(
    records.filter((record) => record.id !== id),
  );
}
