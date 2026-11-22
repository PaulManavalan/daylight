import { z } from "zod";
import {
  defaultPersonalWorkspace,
  personalWorkspaceSchema,
} from "./personal-workspace";
import { emptyNutrition } from "./nutrition";
import { emptyFitness } from "./fitness";
import { emptyCalendars } from "./calendar-transfer";
export const erasureScopes = [
  "all",
  "meals",
  "training",
  "calendars",
  "preferences",
  "sat",
  "days",
] as const;
export const erasureScopeSchema = z.enum(erasureScopes);
export type ErasureScope = z.infer<typeof erasureScopeSchema>;
export const workspacePrivacySchema = z
  .object({
    generation: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    erasures: z.partialRecord(
      erasureScopeSchema,
      z
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER - 1),
    ),
  })
  .refine(
    (p) => Object.values(p.erasures).every((g) => g <= p.generation),
    "Invalid deletion checkpoint.",
  );
export type WorkspacePrivacy = z.infer<typeof workspacePrivacySchema>;
export const emptyPrivacy = (): WorkspacePrivacy => ({
  generation: 0,
  erasures: {},
});
export const erasureReceiptSchema = workspacePrivacySchema.safeExtend({
  scope: erasureScopeSchema,
  changedDocuments: z.number().int().nonnegative().max(2000),
});
export type ErasureReceipt = z.infer<typeof erasureReceiptSchema>;
export interface ErasureReview {
  scope: ErasureScope;
  generation: number;
  documents: { key: string; revision: number; sequence: number }[];
}
export class WorkspacePrivacyChangedError extends Error {
  constructor() {
    super(
      "Account deletion settings changed. Reconcile before uploading an older draft.",
    );
  }
}
export function scopeIncludesKey(scope: ErasureScope, key: string) {
  return (
    scope === "all" ||
    (scope === "days" && key.startsWith("day:")) ||
    (scope === "sat" && key === "sat") ||
    (["meals", "training", "calendars", "preferences"].includes(scope) &&
      key === "personal")
  );
}
/** Apply authoritative deletions to old drafts; adding new data requires a later user action. */
export function erasePayload(
  key: string,
  payload: unknown,
  scopes: ErasureScope[],
): unknown {
  if (payload === null) return null;
  if (
    scopes.includes("all") ||
    (key === "sat" && scopes.includes("sat")) ||
    (key.startsWith("day:") && scopes.includes("days"))
  )
    return null;
  if (key !== "personal") return payload;
  const personal = personalWorkspaceSchema.parse(payload);
  if (scopes.includes("meals")) personal.nutrition = emptyNutrition();
  if (scopes.includes("training")) personal.fitness = emptyFitness();
  if (scopes.includes("calendars")) personal.calendars = emptyCalendars();
  if (scopes.includes("preferences")) {
    const defaults = defaultPersonalWorkspace();
    personal.displayName = defaults.displayName;
    personal.food = defaults.food;
    personal.news = defaults.news;
  }
  return personal;
}
