"use client";
import { useState } from "react";
import { useAccountWorkspace } from "./account-workspace-context";
import { parseAccountBackup, type AccountBackup } from "@/lib/account-backup";
import { type ErasureScope, type ErasureReview } from "@/lib/workspace-privacy";
const scopes: Record<ErasureScope, string> = {
  meals: "Meal recipes, weekly plans and food journal",
  training: "Training routines, plans, logs and equipment preferences",
  calendars: "Imported calendar snapshots",
  preferences: "Name, food preferences and news topics",
  sat: "SAT attempts and progress",
  days: "Daily conversations and plans",
  all: "All focused planner account records",
};
function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AccountDataControls() {
  const { account, status, owner } = useAccountWorkspace();
  const [backup, setBackup] = useState<AccountBackup | null>(null),
    [targets, setTargets] = useState<
      { key: string; payload: unknown; expectedSequence: number }[]
    >([]),
    [consent, setConsent] = useState(false),
    [erasure, setErasure] = useState<ErasureReview | null>(null),
    [scope, setScope] = useState<ErasureScope>("meals"),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (!account) return null;
  function available() {
    if (
      status?.dirty ||
      status?.conflicts.length ||
      status?.status !== "synced"
    )
      throw Error(
        "Sync and resolve current changes before reviewing this action.",
      );
  }
  async function readFile(file: File) {
    setBackup(null);
    setTargets([]);
    setConsent(false);
    setError("");
    try {
      available();
      if (file.size > 4194304)
        throw Error("Choose a backup smaller than 4 MB.");
      const parsed = parseAccountBackup(await file.text());
      available();
      setTargets(
        Object.entries(parsed.documents).map(([key, payload]) => ({
          key,
          payload,
          expectedSequence: account!.document(key).sequence,
        })),
      );
      setBackup(parsed);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function restore() {
    if (!backup || busy) return;
    setBusy(true);
    setError("");
    try {
      available();
      if (
        (backup.sourceOwner !== owner || (status?.generation ?? 0) > 0) &&
        !consent
      )
        throw Error(
          "Confirm the source and possible restoration of deleted records.",
        );
      const old = account!.recovery();
      if (old) localStorage.setItem(account!.key + ".before-restore", old);
      await account!.updateMany(targets);
      setBackup(null);
      setTargets([]);
      setNotice(
        "Reviewed records restored on this device. Daily plans need fresh approval.",
      );
      await account!.sync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Account backups and deletion">
      <h3>Back up and restore</h3>
      <p>
        These files contain private planner records. They exclude sign-in
        credentials, the separate local workspace, the original Notion and
        calendar services, and the older full-workspace task list.
      </p>
      <button
        disabled={busy}
        onClick={() => {
          try {
            if (status?.conflicts.length)
              throw Error(
                "Resolve account conflicts before exporting working records. Use the conflict download to preserve both versions.",
              );
            const text = JSON.stringify(
              {
                format: "daylight-account-backup",
                version: 1,
                sourceOwner: owner,
                exportedAt: new Date().toISOString(),
                privacyGeneration: status?.generation ?? 0,
                documents: Object.fromEntries(
                  account
                    .keys()
                    .map((key) => [key, account.document(key).payload]),
                ),
              },
              null,
              2,
            );
            parseAccountBackup(text);
            download(text, "daylight-account-backup.json");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Export portable account backup
      </button>
      <label>
        Review an account backup
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void readFile(file);
          }}
        />
      </label>
      {backup && (
        <section aria-label="Review account backup">
          <h4>Restore {targets.length} record groups?</h4>
          <p>
            Matching record groups will be replaced. Other dates stay. Restored
            daily plans require your approval again.
          </p>
          <p>
            Source account: {backup.sourceOwner}. Exported {backup.exportedAt}.
          </p>
          <details>
            <summary>View records to restore</summary>
            <pre>{JSON.stringify(backup.documents, null, 2)}</pre>
          </details>
          {(backup.sourceOwner !== owner || (status?.generation ?? 0) > 0) && (
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              I reviewed the source account and want these records restored,
              including any data I previously deleted.
            </label>
          )}
          <button
            disabled={
              busy ||
              ((backup.sourceOwner !== owner ||
                (status?.generation ?? 0) > 0) &&
                !consent)
            }
            onClick={() => void restore()}
          >
            Restore reviewed account records
          </button>
          <button
            disabled={busy}
            onClick={() => {
              setBackup(null);
              setTargets([]);
            }}
          >
            Cancel backup restore
          </button>
        </section>
      )}
      {([".before-import", ".before-restore"] as const).map((suffix) => (
        <button
          key={suffix}
          disabled={busy}
          onClick={() => {
            try {
              const raw = localStorage.getItem(account.key + suffix);
              if (!raw)
                throw Error("No retained copy is available on this device.");
              download(raw, "daylight" + suffix + "-recovery.json");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Download retained{" "}
          {suffix === ".before-import" ? "pre-import" : "pre-restore"} copy
        </button>
      ))}
      <h3>Delete selected account records</h3>
      <p>
        Deletion overrides older affected drafts when a device next syncs. It
        clears Daylight’s retained pre-import and pre-restore copies on that
        device. Offline devices clear their copies when they reconnect.
        Downloaded files and original provider records stay outside this
        deletion; this does not delete your sign-in account.
      </p>
      <label>
        Records to delete
        <select
          aria-label="Records to delete"
          value={scope}
          disabled={busy}
          onChange={(e) => {
            setScope(e.target.value as ErasureScope);
            setErasure(null);
            setConfirmed(false);
          }}
        >
          {Object.entries(scopes).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy}
        onClick={() => {
          try {
            available();
            setErasure(account.prepareErasure(scope));
            setConfirmed(false);
            setError("");
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Review account deletion
      </button>
      {erasure && (
        <section aria-label="Review account deletion">
          <h4>Delete {scopes[erasure.scope].toLowerCase()}?</h4>
          <p>
            {erasure.documents.length} account record groups are affected. Other
            categories stay unless you chose all focused planner records.
          </p>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I understand this removes these account records and retained
            recovery copies. I have saved anything I want to keep.
          </label>
          <button
            disabled={busy || !confirmed}
            onClick={() => {
              setBusy(true);
              setError("");
              void account
                .erase(erasure)
                .then(() => {
                  setErasure(null);
                  setNotice(
                    "Selected account records were deleted. Other devices apply this deletion when they sync.",
                  );
                })
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            Delete reviewed account records
          </button>
          <button disabled={busy} onClick={() => setErasure(null)}>
            Cancel deletion
          </button>
        </section>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
