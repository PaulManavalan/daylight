import { z } from "zod";
import { taskInputSchema, type Task } from "./types";
import { planningSchema } from "./scheduling";
import { satStateSchema, satKey } from "./sat";
import {
  personalWorkspaceSchema,
  personalWorkspaceKey,
} from "./personal-workspace";
import { savedDaySessionSchema } from "./day-session";

const dayPrefix = "daylight.notion-day.v1.";
const dayKeySchema = z.iso.date();
const focusedSchema = z
  .object({
    personal: personalWorkspaceSchema.nullable(),
    days: z
      .record(dayKeySchema, savedDaySessionSchema)
      .refine(
        (days) => Object.keys(days).length <= 120,
        "Export up to 120 saved days at a time.",
      )
      .refine(
        (days) =>
          Object.entries(days).every(
            ([date, day]) => !day.plan || day.plan.day === date,
          ),
        "Saved plan date must match its day.",
      ),
  })
  .strict();
const focusedRawSchema = z
  .object({
    personal: z.string().nullable(),
    days: z.record(dayKeySchema, z.string()),
  })
  .strict();
function focusedRaw(
  storage: Pick<BackupStorage, "getItem" | "key" | "length">,
) {
  const days: Record<string, string> = {};
  if (storage.key && typeof storage.length === "number")
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (
        key?.startsWith(dayPrefix) &&
        dayKeySchema.safeParse(key.slice(dayPrefix.length)).success
      ) {
        const value = storage.getItem(key);
        if (value !== null) days[key.slice(dayPrefix.length)] = value;
      }
    }
  return {
    personal: storage.getItem(personalWorkspaceKey),
    days: Object.fromEntries(
      Object.entries(days).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}
function parseFocused(raw: z.infer<typeof focusedRawSchema>) {
  return focusedSchema.parse({
    personal: raw.personal === null ? null : JSON.parse(raw.personal),
    days: Object.fromEntries(
      Object.entries(raw.days).map(([day, text]) => [day, JSON.parse(text)]),
    ),
  });
}
export function focusedWorkspaceExport(
  storage: Pick<BackupStorage, "getItem" | "key" | "length">,
) {
  if (storage.getItem(RESTORE_PENDING) !== null)
    throw new Error("Finish the interrupted restore before exporting.");
  return parseFocused(focusedRaw(storage));
}

export const LOCAL_TASKS = "daylight.tasks.v1";
export const LOCAL_PLAN = "daylight.planning.v1.local-demo";
export const RESTORE_PENDING = "daylight.restore.pending.v1";
export const RESTORE_PREVIOUS = "daylight.restore.previous.v1";
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export function exportLocalWorkspace(storage: BackupStorage, now = new Date()) {
  const focused = focusedWorkspaceExport(storage);
  return parseWorkspaceBackup(
    JSON.stringify({
      version: 1,
      exported_at: now.toISOString(),
      tasks: JSON.parse(storage.getItem(LOCAL_TASKS) ?? "[]"),
      planning: JSON.parse(storage.getItem(LOCAL_PLAN) ?? "null"),
      sat: JSON.parse(storage.getItem(satKey("local-demo")) ?? "null"),
      focused,
    }),
  );
}
/** Raw, known workspace keys only; never include account tokens or other storage. */
export function rawWorkspaceRecovery(
  storage: Pick<BackupStorage, "getItem" | "key" | "length">,
) {
  return {
    format: "daylight-raw-recovery",
    exported_at: new Date().toISOString(),
    tasks_raw: storage.getItem(LOCAL_TASKS),
    planning_raw: storage.getItem(LOCAL_PLAN),
    planning_backup_raw: storage.getItem(LOCAL_PLAN + ".backup"),
    sat_raw: storage.getItem(satKey("local-demo")),
    chat_raw: storage.getItem("daylight.chat.v1.local-demo"),
    restore_pending_raw: storage.getItem(RESTORE_PENDING),
    restore_previous_raw: storage.getItem(RESTORE_PREVIOUS),
    focused_raw: focusedRaw(storage),
  };
}
const backupTask = taskInputSchema.safeExtend({
  id: z.uuid(),
  user_id: z.string().min(1),
  actual_minutes: z.number().int().min(0),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
});
const envelope = z.object({
  version: z.literal(1),
  exported_at: z.iso.datetime(),
  tasks: z.array(backupTask).max(10000),
  planning: planningSchema.nullable(),
  sat: satStateSchema.nullable().optional(),
  focused: focusedSchema.optional(),
});
export interface BackupStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key?(index: number): string | null;
  readonly length?: number;
}
export type WorkspaceBackup = z.infer<typeof envelope>;
export type RestoreSnapshot = {
  tasks: string | null;
  planning: string | null;
  backup: string | null;
  sat?: string | null;
  focused?: z.infer<typeof focusedRawSchema>;
};
const rawSnapshot = z.object({
  tasks: z.string().nullable(),
  planning: z.string().nullable(),
  backup: z.string().nullable(),
  sat: z.string().nullable().optional(),
  focused: focusedRawSchema.optional(),
});
const journalSchema = z
  .object({
    version: z.literal(1),
    tasks: z.string(),
    planning: z.string().nullable(),
    sat: z.string().nullable().optional(),
    focused: focusedSchema.optional(),
  })
  .strict();
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    throw new Error("The backup contains duplicate " + label + ".");
}
export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new Error("Choose a Daylight JSON backup smaller than 5 MB.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON. Choose a Daylight export.");
  }
  const parsed = envelope.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      "This is not a supported Daylight backup, or some task/calendar details are invalid. Nothing was changed.",
    );
  const data = parsed.data;
  unique(
    data.tasks.map((t) => t.id),
    "task IDs",
  );
  if (data.planning) {
    unique(
      data.planning.sessions.map((s) => s.id),
      "session IDs",
    );
    unique(
      data.planning.fixed.map((b) => b.id),
      "protected-time IDs",
    );
    const ids = new Set(data.tasks.map((t) => t.id));
    if (data.planning.sessions.some((s) => !ids.has(s.taskId)))
      throw new Error(
        "A calendar session refers to a task missing from this backup. Nothing was changed.",
      );
  }
  return {
    ...data,
    tasks: data.tasks.map((t) => ({
      ...t,
      user_id: "local-demo",
      remaining_minutes: t.status === "done" ? 0 : t.remaining_minutes,
    })),
  };
}
export function captureRestoreSnapshot(
  storage: BackupStorage,
): RestoreSnapshot {
  return {
    tasks: storage.getItem(LOCAL_TASKS),
    planning: storage.getItem(LOCAL_PLAN),
    backup: storage.getItem(LOCAL_PLAN + ".backup"),
    sat: storage.getItem(satKey("local-demo")),
    focused: focusedRaw(storage),
  };
}
export function previousWorkspaceExport(
  storage: BackupStorage,
  now = new Date(),
): string | null {
  const raw = storage.getItem(RESTORE_PREVIOUS);
  if (raw === null) return null;
  const previous = rawSnapshot.parse(JSON.parse(raw));
  return JSON.stringify(
    parseWorkspaceBackup(
      JSON.stringify({
        version: 1,
        exported_at: now.toISOString(),
        tasks: JSON.parse(previous.tasks ?? "[]"),
        planning: JSON.parse(previous.planning ?? "null"),
        ...(previous.sat === undefined
          ? {}
          : { sat: previous.sat === null ? null : JSON.parse(previous.sat) }),
        ...(previous.focused === undefined
          ? {}
          : { focused: parseFocused(previous.focused) }),
      }),
    ),
    null,
    2,
  );
}
export function recoverLocalRestore(storage: BackupStorage): boolean {
  const raw = storage.getItem(RESTORE_PENDING);
  if (raw === null) return false;
  let journal: z.infer<typeof journalSchema>;
  try {
    journal = journalSchema.parse(JSON.parse(raw));
    z.array(backupTask).parse(JSON.parse(journal.tasks));
    if (journal.planning !== null)
      planningSchema.parse(JSON.parse(journal.planning));
    if (typeof journal.sat === "string")
      satStateSchema.parse(JSON.parse(journal.sat));
  } catch {
    throw new Error(
      "An interrupted backup restore needs recovery. Your recovery copy is preserved; no new changes were made.",
    );
  }
  try {
    storage.setItem(LOCAL_TASKS, journal.tasks);
    for (const key of [LOCAL_PLAN, LOCAL_PLAN + ".backup"]) {
      if (journal.planning === null) storage.removeItem(key);
      else storage.setItem(key, journal.planning);
    }
    if (journal.sat !== undefined) {
      if (journal.sat === null) storage.removeItem(satKey("local-demo"));
      else storage.setItem(satKey("local-demo"), journal.sat);
    }
    if (journal.focused) {
      if (journal.focused.personal === null)
        storage.removeItem(personalWorkspaceKey);
      else
        storage.setItem(
          personalWorkspaceKey,
          JSON.stringify(journal.focused.personal),
        );
      for (const [day, value] of Object.entries(journal.focused.days))
        storage.setItem(dayPrefix + day, JSON.stringify(value));
    }
    storage.removeItem("daylight.planning.v1.local-demo.pending.unapplied");
    storage.removeItem(RESTORE_PENDING);
  } catch {
    throw new Error(
      "The backup restore is unfinished because browser storage could not save it. Free storage and reload to finish; the previous workspace recovery copy is preserved.",
    );
  }
  return true;
}
export function restoreWorkspaceBackup(
  storage: BackupStorage,
  backup: WorkspaceBackup,
  expected: RestoreSnapshot,
): Task[] {
  const validated = parseWorkspaceBackup(JSON.stringify(backup));
  if (storage.getItem(RESTORE_PENDING) !== null)
    throw new Error(
      "Reload to finish the previous restore before importing again.",
    );
  if (storage.getItem(LOCAL_PLAN + ".pending") !== null)
    throw new Error(
      "Finish recovering the pending check-in before restoring a backup.",
    );
  if (
    JSON.stringify(captureRestoreSnapshot(storage)) !== JSON.stringify(expected)
  )
    throw new Error(
      "Your workspace changed after the preview. Close and reopen the backup review before restoring.",
    );
  const planning =
    validated.planning === null ? null : JSON.stringify(validated.planning);
  const journal = JSON.stringify({
    version: 1,
    tasks: JSON.stringify(validated.tasks),
    planning,
    ...(validated.sat === undefined
      ? {}
      : { sat: validated.sat === null ? null : JSON.stringify(validated.sat) }),
    ...(validated.focused === undefined ? {} : { focused: validated.focused }),
  });
  // Stage the recovery copy and desired state before touching active task/calendar data.
  try {
    storage.setItem(
      RESTORE_PREVIOUS,
      JSON.stringify(rawSnapshot.parse(expected)),
    );
    storage.setItem(RESTORE_PENDING, journal);
  } catch {
    throw new Error(
      "There is not enough browser storage to prepare this restore. The active workspace was not replaced.",
    );
  }
  recoverLocalRestore(storage);
  return validated.tasks;
}
