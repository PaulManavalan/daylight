import { z } from "zod";
export const googleCalendarRowSchema = z.object({
  id: z.string().min(1).max(1024),
  title: z.string().min(1).max(300),
  timeZone: z.string().min(1).max(100),
  accessRole: z.enum([
    "freeBusyReader",
    "reader",
    "writer",
    "writerWithoutPrivateAccess",
    "owner",
  ]),
  primary: z.boolean(),
});
export type GoogleCalendarRow = z.infer<typeof googleCalendarRowSchema>;
export const googleEventDraftSchema = z
  .object({
    calendarId: z.string().min(1).max(1024),
    requestId: z.uuid(),
    title: z.string().trim().min(1).max(300),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
  })
  .strict()
  .refine(
    (e) =>
      Date.parse(e.end) > Date.parse(e.start) &&
      Date.parse(e.end) - Date.parse(e.start) <= 86400000,
    "Choose an event lasting up to 24 hours with an end after its start.",
  )
  .transform((e) => ({
    ...e,
    start: new Date(e.start).toISOString(),
    end: new Date(e.end).toISOString(),
  }));
export type GoogleEventDraft = z.infer<typeof googleEventDraftSchema>;
export const googleReceiptSchema = z.object({
  id: z.string().min(1).max(1024),
  etag: z.string().min(1).max(1024),
  calendarId: z.string().min(1).max(1024),
  title: z.string().max(300),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  url: z.string().url().nullable(),
  outcome: z.enum(["created", "existing", "updated", "deleted"]),
});
export type GoogleEventReceipt = z.infer<typeof googleReceiptSchema>;
