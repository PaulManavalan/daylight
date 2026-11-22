import { z } from "zod";
import { personalWorkspaceSchema } from "./personal-workspace";
import { satStateSchema } from "./sat";
import { planningSchema } from "./scheduling";
import { savedDaySessionSchema } from "./day-session";
import type {
  WorkspacePrivacy,
  ErasureScope,
  ErasureReceipt,
} from "./workspace-privacy";

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const documentKeySchema = z
  .string()
  .refine(
    (key) =>
      ["personal", "sat", "planning"].includes(key) ||
      (key.startsWith("day:") && z.iso.date().safeParse(key.slice(4)).success),
    "Unknown account document.",
  );
export type WorkspaceDocumentKey =
  | "personal"
  | "sat"
  | "planning"
  | `day:${string}`;
export function validateDocument(key: string, payload: unknown): unknown {
  documentKeySchema.parse(key);
  if (payload === null) return null;
  const value =
    key === "personal"
      ? personalWorkspaceSchema.parse(payload)
      : key === "sat"
        ? satStateSchema.parse(payload)
        : key === "planning"
          ? planningSchema.parse(payload)
          : savedDaySessionSchema.parse(payload);
  if (key.startsWith("day:")) {
    const session = savedDaySessionSchema.parse(value);
    if (session.plan && session.plan.day !== key.slice(4))
      throw Error("The saved timetable belongs to a different day.");
  }
  if (
    new TextEncoder().encode(JSON.stringify(value)).length > MAX_DOCUMENT_BYTES
  )
    throw Error(
      "This account document is too large to sync. Export a recovery copy before reducing its history.",
    );
  return value;
}
export const cloudDocumentSchema = z.object({
  user_id: z.uuid(),
  document_key: documentKeySchema,
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  payload: z.unknown(),
  updated_at: z.iso.datetime({ offset: true }),
});
export type CloudDocument = z.infer<typeof cloudDocumentSchema>;
export interface DocumentChange {
  key: string;
  expectedRevision: number;
  payload: unknown;
}
export interface DocumentTransport {
  readonly owner: string;
  readPrivacy(): Promise<WorkspacePrivacy>;
  readAll(): Promise<CloudDocument[]>;
  save(changes: DocumentChange[], generation: number): Promise<CloudDocument[]>;
  erase?(
    scope: ErasureScope,
    generation: number,
    expected: { key: string; revision: number }[],
  ): Promise<ErasureReceipt>;
}
export class WorkspaceConflictError extends Error {
  constructor() {
    super(
      "Your account data changed on another device. Review both versions before continuing.",
    );
  }
}
export function validateCloudDocuments(raw: unknown, owner: string) {
  z.uuid().parse(owner);
  const rows = z.array(cloudDocumentSchema).max(2000).parse(raw),
    seen = new Set<string>();
  return rows.map((row) => {
    if (row.user_id !== owner || seen.has(row.document_key))
      throw Error(
        "Account ownership or document identity could not be verified. No local data was replaced.",
      );
    seen.add(row.document_key);
    return { ...row, payload: validateDocument(row.document_key, row.payload) };
  });
}
export function stableJSON(value: unknown): string {
  const order = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(order)
      : value !== null && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, v]) => [key, order(v)]),
          )
        : value;
  return JSON.stringify(order(value));
}
