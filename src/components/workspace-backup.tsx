"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Download } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import {
  parseWorkspaceBackup,
  captureRestoreSnapshot,
  restoreWorkspaceBackup,
  previousWorkspaceExport,
  MAX_BACKUP_BYTES,
  RESTORE_PREVIOUS,
  type WorkspaceBackup,
  type RestoreSnapshot,
} from "@/lib/workspace-backup";
export function WorkspaceBackupControl({
  disabled,
  onExport,
  readable = true,
}: {
  disabled: boolean;
  onExport: () => void;
  readable?: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLDetailsElement>(null),
    [hasRecovery, setHasRecovery] = useState(false);
  useEffect(() => {
    try {
      setHasRecovery(localStorage.getItem(RESTORE_PREVIOUS) !== null);
    } catch {}
  }, []);
  const [review, setReview] = useState<{
      data: WorkspaceBackup;
      snapshot: RestoreSnapshot;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function selectFile(chosen?: File) {
    if (!chosen) return;
    setError("");
    if (menu.current) menu.current.open = false;
    try {
      if (chosen.size > MAX_BACKUP_BYTES)
        throw new Error("Choose a backup smaller than 5 MB.");
      const data = parseWorkspaceBackup(await chosen.text());
      setReview({ data, snapshot: captureRestoreSnapshot(localStorage) });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The backup could not be read.",
      );
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  function restore() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      restoreWorkspaceBackup(localStorage, review.data, review.snapshot);
      try {
        sessionStorage.removeItem("daylight.conversation.v1.local-demo");
        localStorage.removeItem("daylight.chat.v1.local-demo");
      } catch {}
      window.location.reload();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The restore could not finish.",
      );
      setBusy(false);
      try {
        setHasRecovery(localStorage.getItem(RESTORE_PREVIOUS) !== null);
      } catch {}
    }
  }
  function recoveryCopy() {
    try {
      let raw: string | null;
      let name = "daylight-before-restore.json";
      try {
        raw = previousWorkspaceExport(localStorage);
      } catch {
        raw = localStorage.getItem(RESTORE_PREVIOUS);
        name = "daylight-raw-workspace-recovery.json";
        setError(
          "The previous storage was damaged. Its raw recovery copy can still be downloaded.",
        );
      }
      if (!raw) {
        setError(
          "There is no previous workspace recovery copy at this address yet.",
        );
        return;
      }
      const url = URL.createObjectURL(
        new Blob([raw], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(
        "The recovery copy could not be downloaded from browser storage.",
      );
    }
  }
  return (
    <>
      <input
        ref={file}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Choose Daylight backup"
        onChange={(e) => void selectFile(e.target.files?.[0])}
      />
      <details ref={menu} className="backup-options">
        <summary>
          <Upload size={16} />
          <span className="hidden sm:inline">Backups</span>
          <span className="sr-only sm:hidden">Backups</span>
        </summary>
        <div>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || !readable}
            onClick={onExport}
          >
            <Download size={14} />
            Export workspace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => file.current?.click()}
          >
            Restore a backup file
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || !hasRecovery}
            onClick={recoveryCopy}
          >
            <Download size={14} />
            Download previous workspace
          </Button>
        </div>
      </details>
      {!review && error && (
        <p role="alert" className="backup-inline-error">
          {error}
        </p>
      )}
      <Dialog
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setReview(null);
            setError("");
          }
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl">
            Restore your local workspace
          </DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
            Review this backup before replacing local tasks, calendar and
            included SAT and personal records at this address. Signed-in
            accounts are unaffected. Close other Daylight tabs before restoring.
          </DialogDescription>
          {review && (
            <div className="backup-summary">
              <span>
                <strong>{review.data.tasks.length}</strong> tasks
              </span>
              <span>
                <strong>{review.data.planning?.fixed.length ?? 0}</strong>{" "}
                protected-time definitions
              </span>
              <p>
                Exported {new Date(review.data.exported_at).toLocaleString()}
              </p>
              <p>
                {review.data.planning
                  ? "Study preferences, sessions and check-in history are included."
                  : "No saved calendar is included. Starter planning preferences will apply."}
              </p>
            </div>
          )}
          {review && (
            <p className="sat-note">
              {review.data.sat === undefined
                ? "This older backup has no SAT section. Your current SAT records will be kept."
                : review.data.sat === null
                  ? "This backup clears SAT records in this local workspace."
                  : `${review.data.sat.scores.length} SAT results and ${review.data.sat.errors.length} error-log entries are included.`}
            </p>
          )}
          {review && (
            <p className="sat-note">
              {review.data.focused
                ? `Includes preferences, food journal, recipes, workouts and imported calendars${review.data.focused.personal === null ? " (empty personal workspace)" : ""}, plus ${Object.keys(review.data.focused.days).length} saved daily conversations/plans. Included days are replaced; other dates stay.`
                : "This older backup has no personal workspace or focused day plans. Those current records will be kept."}
            </p>
          )}
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            This replaces the reviewed local data. A recovery copy is saved
            before changes begin. Your current conversation will restart so it
            matches the restored tasks.
          </p>
          {error && (
            <div role="alert" className="error-banner mt-4">
              {error}
              <Button variant="ghost" size="sm" onClick={recoveryCopy}>
                <Download size={14} />
                Download recovery copy
              </Button>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setReview(null)}
            >
              Keep current workspace
            </Button>
            <Button disabled={busy} onClick={restore}>
              {busy ? "Restoring…" : "Replace local workspace"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
