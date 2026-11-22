import { wantsOpenChat } from "./chat-actions";
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
  if (
    wantsOpenChat(message) ||
    /^\s*(?:what if|why\b|how (?:does|did)\b|explain\b)/i.test(message)
  )
    return false;
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
