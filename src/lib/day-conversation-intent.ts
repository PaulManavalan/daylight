import { wantsOpenChat } from "./chat-actions";
/** Read-back and hypothetical discussion do not authorize replacing an approved day. */
export function preservesDayFacts(message: string) {
  if (
    wantsOpenChat(message) ||
    /^\s*(?:what if\b|why\b|how (?:does|did)\b|explain\b)/i.test(message)
  )
    return true;
  const read =
    /^\s*(?:(?:can|could|would) you\s+)?(?:show(?: me)?|tell me|remind me|summari[sz]e|recap|list|what(?:['’]s)?|when (?:is|does)|which (?:homework|assignments|tasks|events))\b/i.test(
      message,
    );
  const action =
    /\b(?:make|create|build|change|update|move|reschedule|replan|rearrange|rebalance)\b|\bplan (?:my|today|the day)\b/i.test(
      message,
    );
  return read && !action;
}
