import { z } from "zod";
export const satDayReviewSchema = z
  .object({
    id: z.uuid(),
    date: z.iso.date(),
    skill: z.string().trim().min(1).max(100),
    minutes: z.number().int().min(5).max(120),
  })
  .strict();
export type SatDayReview = z.infer<typeof satDayReviewSchema>;
/** Chosen practice time is a plan, never evidence of answers or actual work. */
export function satReviewsForDate(
  state: { reviewPlans: SatDayReview[] },
  date: string,
) {
  z.iso.date().parse(date);
  return state.reviewPlans.filter((review) => review.date === date);
}
export function satReviewTitle(review: SatDayReview) {
  return "SAT · " + review.skill;
}
