import { z } from "zod";
import { validateDocument, documentKeySchema } from "./workspace-documents";
const header = z.object({
  format: z.literal("daylight-account-backup"),
  version: z.literal(1),
  sourceOwner: z.uuid(),
  exportedAt: z.iso.datetime({ offset: true }),
  privacyGeneration: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  documents: z.record(documentKeySchema, z.unknown()),
});
export type AccountBackup = z.infer<typeof header>;
/** Portable working records only: never transfers account identity or server revisions. */
export function parseAccountBackup(text: string): AccountBackup {
  if (new TextEncoder().encode(text).length > 4194304)
    throw Error("Choose an account backup smaller than 4 MB.");
  const raw = JSON.parse(text);
  let backup: AccountBackup;
  if (raw?.format === "daylight-account-backup") backup = header.parse(raw);
  else {
    const old = z
      .object({
        version: z.literal(1),
        owner: z.uuid(),
        documents: z.record(
          documentKeySchema,
          z.object({ payload: z.unknown() }),
        ),
        conflicts: z.record(z.string(), z.unknown()),
        privacy: z
          .object({ generation: z.number().int().nonnegative() })
          .optional(),
      })
      .parse(raw);
    if (Object.keys(old.conflicts).length)
      throw Error(
        "This recovery file contains unresolved versions. Resolve them in its original workspace before exporting a portable backup.",
      );
    backup = header.parse({
      format: "daylight-account-backup",
      version: 1,
      sourceOwner: old.owner,
      exportedAt: new Date().toISOString(),
      privacyGeneration: old.privacy?.generation ?? 0,
      documents: Object.fromEntries(
        Object.entries(old.documents).map(([k, e]) => [k, e.payload]),
      ),
    });
  }
  const entries = Object.entries(backup.documents);
  if (!entries.length || entries.length > 200)
    throw Error("Restore 1–200 record groups at a time.");
  return {
    ...backup,
    documents: Object.fromEntries(
      entries.map(([key, payload]) => {
        const valid = validateDocument(key, payload);
        return [
          key,
          key.startsWith("day:") && valid !== null
            ? {
                ...(valid as object),
                approved: false,
                pendingHomeworkCheckin: null,
              }
            : valid,
        ];
      }),
    ),
  };
}
