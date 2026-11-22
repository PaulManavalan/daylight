"use client";
import { useState } from "react";
import type { RunningListSource } from "@/lib/notion-daily-source";
import {
  homeworkCheckinSchema,
  type HomeworkCheckin,
  type PendingHomeworkCheckin,
} from "@/lib/day-homework-progress";
import styles from "./notion-daily-planner.module.css";
export default function HomeworkProposalCard({
  proposal,
  source,
  disabled,
  onApprove,
  onCancel,
  onEdit,
}: {
  proposal: PendingHomeworkCheckin;
  source: RunningListSource;
  disabled: boolean;
  onApprove: (value: HomeworkCheckin) => Promise<void>;
  onCancel: () => Promise<void>;
  onEdit: (id: string, value: HomeworkCheckin | null) => void;
}) {
  const [minutes, setMinutes] = useState(
      proposal.value.minutes === null ? "" : String(proposal.value.minutes),
    ),
    [remaining, setRemaining] = useState(
      proposal.value.remainingMinutes === null
        ? ""
        : String(proposal.value.remainingMinutes),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const item = source.items.find(
    (item) => item.key === proposal.value.sourceKey,
  );
  function changed(actual: string, left: string) {
    const result = homeworkCheckinSchema.safeParse({
      ...proposal.value,
      minutes:
        proposal.value.outcome === "more_time" || actual === ""
          ? null
          : Number(actual),
      remainingMinutes:
        ["worked", "more_time"].includes(proposal.value.outcome) && left !== ""
          ? Number(left)
          : null,
    });
    onEdit(proposal.id, result.success ? result.data : null);
  }
  async function approve() {
    setBusy(true);
    setError("");
    try {
      const value = homeworkCheckinSchema.parse({
        ...proposal.value,
        minutes:
          proposal.value.outcome === "more_time" || minutes === ""
            ? null
            : Number(minutes),
        remainingMinutes:
          ["worked", "more_time"].includes(proposal.value.outcome) &&
          remaining !== ""
            ? Number(remaining)
            : null,
      });
      await onApprove(value);
    } catch (error) {
      setError(
        error instanceof Error && error.name !== "ZodError"
          ? error.message
          : "Check the minutes before saving. Actual time can stay unknown; a focus-time change needs positive minutes.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className={styles.connection}
      aria-label="Review conversational homework check-in"
    >
      <small>UNSAVED · REVIEW BEFORE RECORDING</small>
      <h3>{item?.title ?? "Homework item no longer available"}</h3>
      {item?.subject && <p className={styles.muted}>{item.subject}</p>}
      <p>
        {proposal.value.outcome === "complete"
          ? "Report this assignment complete in Daylight."
          : proposal.value.outcome === "set_aside"
            ? "Set this assignment aside for today."
            : proposal.value.outcome === "more_time"
              ? "Change the focus time still wanted today. No actual work is inferred."
              : "Record actual work on this unfinished assignment."}
      </p>
      <div className={styles.formGrid}>
        {proposal.value.outcome !== "more_time" && (
          <label>
            Actual minutes (optional)
            <input
              aria-label="Proposed actual homework minutes"
              type="number"
              min={0}
              max={720}
              value={minutes}
              disabled={disabled || busy}
              onChange={(event) => {
                setMinutes(event.target.value);
                changed(event.target.value, remaining);
              }}
            />
          </label>
        )}
        {["worked", "more_time"].includes(proposal.value.outcome) && (
          <label>
            Focus minutes still wanted today
            <input
              aria-label="Proposed remaining homework minutes"
              type="number"
              min={0}
              max={240}
              value={remaining}
              disabled={disabled || busy}
              onChange={(event) => {
                setRemaining(event.target.value);
                changed(minutes, event.target.value);
              }}
            />
          </label>
        )}
      </div>
      <p className={styles.muted}>
        Saving updates Daylight's work record and creates a fresh day draft for
        review. Notion stays unchanged. Leave actual time blank if you did not
        measure it.
      </p>
      <button
        disabled={disabled || busy || !item}
        onClick={() => void approve()}
      >
        {busy ? "Recording check-in…" : "Record this check-in"}
      </button>
      <button
        className={styles.secondary}
        disabled={disabled || busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void onCancel()
            .catch((error) => setError(error.message))
            .finally(() => setBusy(false));
        }}
      >
        Discard this check-in
      </button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
