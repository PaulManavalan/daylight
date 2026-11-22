import { preservesDayFacts } from "./day-conversation-intent";
import {
  notionDayContextSchema,
  type NotionDayContext,
} from "./notion-day-model";
/** Conversation alone must not discard an approved timetable. */
export function shouldUpdateDayPlan(
  before: NotionDayContext,
  after: NotionDayContext,
  message: string,
) {
  if (preservesDayFacts(message)) return false;
  const changed =
    JSON.stringify(notionDayContextSchema.parse(before)) !==
    JSON.stringify(notionDayContextSchema.parse(after));
  return (
    changed ||
    /\b(?:plan|replan|reschedule|schedule|timetable|organi[sz]e|rearrange|rebalance)\b/i.test(
      message,
    )
  );
}
