"use client";
import { useState } from "react";
import { useAccountWorkspace } from "./account-workspace-context";
import { exportLocalWorkspace } from "@/lib/workspace-backup";
import css from "./account-workspace.module.css";

type Change = { key: string; payload: unknown; expectedSequence: number };
const title = (key: string) =>
  key === "personal"
    ? "Preferences, meals, training and calendars"
    : key === "sat"
      ? "SAT records"
      : key === "planning"
        ? "Full-workspace planning"
        : "Daily conversation and plan · " + key.slice(4);
function download(text: string, name: string) {
  const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AccountSyncPanel() {
  const { account, status, owner } = useAccountWorkspace(),
    [review, setReview] = useState<Change[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (!account) return null;
  function prepareImport() {
    try {
      if (status?.dirty || status?.conflicts.length)
        throw Error(
          "Sync or resolve the current account changes before reviewing an import.",
        );
      const local = exportLocalWorkspace(localStorage),
        changes: Change[] = [];
      if (local.focused?.personal)
        changes.push({
          key: "personal",
          payload: local.focused.personal,
          expectedSequence: account!.document("personal").sequence,
        });
      if (local.sat)
        changes.push({
          key: "sat",
          payload: local.sat,
          expectedSequence: account!.document("sat").sequence,
        });
      for (const [day, payload] of Object.entries(local.focused?.days ?? {}))
        changes.push({
          key: "day:" + day,
          payload,
          expectedSequence: account!.document("day:" + day).sequence,
        });
      if (!changes.length)
        throw Error("There are no saved local records to copy.");
      setReview(changes);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function importReviewed() {
    if (!review || busy) return;
    setBusy(true);
    try {
      if (status?.dirty || status?.conflicts.length)
        throw Error(
          "The account changed during review. Sync and review again.",
        );
      const previous = account!.recovery();
      if (previous)
        localStorage.setItem(account!.key + ".before-import", previous);
      await account!.updateMany(review);
      setReview(null);
      setNotice(
        "The reviewed local records were copied. The original local workspace stays intact.",
      );
      void account!.sync();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="account-sync" className={css.panel} aria-label="Account sync">
      <h2>Your account data</h2>
      <p role="status">{status?.message}</p>
      <p>
        {status?.dirty ?? 0} record groups waiting to sync. Your local workspace
        is separate from this account.
      </p>
      <button onClick={() => void account.sync()} disabled={busy}>
        Sync account now
      </button>
      <button
        onClick={() => {
          const raw = account.recovery();
          if (raw) download(raw, "daylight-account-recovery.json");
        }}
      >
        Export account recovery copy
      </button>
      <button onClick={prepareImport} disabled={busy}>
        Review copying my local workspace
      </button>
      {review && (
        <section aria-label="Review local-to-account import">
          <h3>Copy these local records into this account?</h3>
          <ul>
            {review.map((c) => (
              <li key={c.key}>
                {title(c.key)}
                <div className={css.versions}>
                  <details>
                    <summary>View local records to copy</summary>
                    <pre>{JSON.stringify(c.payload, null, 2)}</pre>
                  </details>
                  <details>
                    <summary>View current account records</summary>
                    <pre>
                      {JSON.stringify(account.document(c.key).payload, null, 2)}
                    </pre>
                  </details>
                </div>
              </li>
            ))}
          </ul>
          <p>
            Included groups replace the matching account records. Other dates
            stay. This copies meals, training, preferences, calendars, SAT and
            daily conversations where present. It leaves the local task list and
            sign-in credentials outside this copy.
          </p>
          <button disabled={busy} onClick={() => void importReviewed()}>
            Copy reviewed records to this account
          </button>
          <button disabled={busy} onClick={() => setReview(null)}>
            Keep workspaces separate
          </button>
        </section>
      )}
      {status?.conflicts.map((key) => {
        const local = account.document(key),
          cloud = account.conflict(key);
        if (!cloud) return null;
        return (
          <article key={key}>
            <h3>Review two versions: {title(key)}</h3>
            <div className={css.versions}>
              <div>
                <strong>This device’s draft</strong>
                <details>
                  <summary>View draft records</summary>
                  <pre>{JSON.stringify(local.payload, null, 2)}</pre>
                </details>
              </div>
              <div>
                <strong>Account version</strong>
                <details>
                  <summary>View account records</summary>
                  <pre>{JSON.stringify(cloud.payload, null, 2)}</pre>
                </details>
              </div>
            </div>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void account
                  .resolve(key, "cloud", cloud.revision, local.sequence)
                  .then(() => account.sync())
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Use account version
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void account
                  .resolve(key, "draft", cloud.revision, local.sequence)
                  .then(() => account.sync())
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              Keep this device’s draft
            </button>
            <button
              onClick={() =>
                download(
                  JSON.stringify({ owner, key, local, cloud }, null, 2),
                  "daylight-conflict-review.json",
                )
              }
            >
              Download both versions
            </button>
          </article>
        );
      })}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
