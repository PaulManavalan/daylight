import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exportLocalWorkspace,
  parseWorkspaceBackup,
  captureRestoreSnapshot,
  restoreWorkspaceBackup,
  recoverLocalRestore,
  previousWorkspaceExport,
  rawWorkspaceRecovery,
  RESTORE_PENDING,
} from "../src/lib/workspace-backup";
import {
  PersonalWorkspaceStore,
  personalWorkspaceKey,
  defaultPersonalWorkspace,
} from "../src/lib/personal-workspace";
import { emptyNotionDay } from "../src/lib/notion-day-model";
class Memory {
  values = new Map<string, string>();
  fail = "";
  get length() {
    return this.values.size;
  }
  key(i: number) {
    return [...this.values.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.values.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (k === this.fail) {
      this.fail = "";
      throw Error("quota");
    }
    this.values.set(k, v);
  }
  removeItem(k: string) {
    this.values.delete(k);
  }
}
const day = {
  source: {
    pageId: "test",
    title: "Synthetic",
    readAt: "2026-11-21T14:00:00.000Z",
    items: [],
    weeklyNotes: [],
    warnings: [],
  },
  sample: false,
  known: emptyNotionDay(),
  messages: [{ role: "user", content: "Private day note" }],
  plan: null,
  approved: false,
};
function fixture() {
  const m = new Memory(),
    personal = defaultPersonalWorkspace();
  personal.displayName = "Synthetic";
  m.setItem(personalWorkspaceKey, JSON.stringify(personal));
  m.setItem("daylight.notion-day.v1.2026-11-21", JSON.stringify(day));
  m.setItem("sb-auth-token", "SECRET");
  m.setItem("unrelated", "PRIVATE");
  return m;
}
test("full local export includes focused records without credentials and validates before writing", () => {
  const m = fixture(),
    data = exportLocalWorkspace(m);
  assert.equal(data.focused?.personal?.displayName, "Synthetic");
  assert.equal(
    data.focused?.days["2026-11-21"].messages[0].content,
    "Private day note",
  );
  assert.doesNotMatch(JSON.stringify(data), /SECRET|PRIVATE/);
  assert.equal(
    rawWorkspaceRecovery(m).focused_raw.days["2026-11-21"],
    JSON.stringify(day),
  );
  assert.throws(
    () =>
      parseWorkspaceBackup(
        JSON.stringify({
          ...data,
          focused: { ...data.focused, days: { "not-a-date": day } },
        }),
      ),
    /not a supported/,
  );
});
test("restore reviews all focused changes, keeps other dates and old backups preserve focused data", () => {
  const m = fixture(),
    data = exportLocalWorkspace(m),
    snapshot = captureRestoreSnapshot(m);
  m.setItem("daylight.notion-day.v1.2026-11-22", JSON.stringify(day));
  assert.throws(
    () => restoreWorkspaceBackup(m, data, snapshot),
    /changed after/,
  );
  const expected = captureRestoreSnapshot(m);
  data.focused!.personal!.displayName = "Restored";
  restoreWorkspaceBackup(m, data, expected);
  assert.equal(
    new PersonalWorkspaceStore(m).load().state.displayName,
    "Restored",
  );
  assert.ok(m.getItem("daylight.notion-day.v1.2026-11-22"));
  assert.equal(
    parseWorkspaceBackup(previousWorkspaceExport(m)!).focused?.personal
      ?.displayName,
    "Synthetic",
  );
  const { focused, ...old } = data;
  restoreWorkspaceBackup(m, old, captureRestoreSnapshot(m));
  assert.equal(
    new PersonalWorkspaceStore(m).load().state.displayName,
    "Restored",
  );
});
test("interrupted focused restore blocks edits and resumes without dropping saved days", () => {
  const m = fixture(),
    data = exportLocalWorkspace(m);
  data.focused!.personal!.displayName = "Recovered";
  m.fail = personalWorkspaceKey;
  assert.throws(
    () => restoreWorkspaceBackup(m, data, captureRestoreSnapshot(m)),
    /unfinished/,
  );
  assert.ok(m.getItem(RESTORE_PENDING));
  assert.throws(
    () =>
      new PersonalWorkspaceStore(m).save(
        defaultPersonalWorkspace(),
        m.getItem(personalWorkspaceKey),
      ),
    /interrupted/,
  );
  assert.equal(recoverLocalRestore(m), true);
  assert.equal(
    new PersonalWorkspaceStore(m).load().state.displayName,
    "Recovered",
  );
  assert.ok(m.getItem("daylight.notion-day.v1.2026-11-21"));
  assert.equal(m.getItem(RESTORE_PENDING), null);
});
