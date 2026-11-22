import { z } from "zod";
import { runningSourceSchema } from "./notion-running-schema";
import { notionDayContextSchema } from "./notion-day-model";
import { notionDayPlanSchema } from "./notion-day-plan";
import {
  homeworkProgressSchema,
  pendingHomeworkCheckinSchema,
} from "./day-homework-progress";
export const savedDaySessionSchema = z.object({
  source: runningSourceSchema,
  sample: z.boolean(),
  known: notionDayContextSchema,
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(5000),
      }),
    )
    .max(200),
  plan: notionDayPlanSchema.nullable(),
  approved: z.boolean(),
  homeworkProgress: homeworkProgressSchema.default([]),
  pendingHomeworkCheckin: pendingHomeworkCheckinSchema.nullable().default(null),
  calendarRevision: z.string().optional(),
  activityRevision: z.string().optional(),
});
