import { z } from "zod";
export const icloudCalendarRowSchema = z
  .object({
    id: z.url().max(2048),
    title: z.string().min(1).max(80),
    canWrite: z.boolean(),
  })
  .strict();
export type ICloudCalendarRow = z.infer<typeof icloudCalendarRowSchema>;
