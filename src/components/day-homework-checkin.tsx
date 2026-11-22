"use client";
import { useState } from "react";
import type { RunningListSource } from "@/lib/notion-daily-source";
import {
  homeworkCheckinSchema,
  homeworkProgressFor,
  type HomeworkCheckin,
  type HomeworkWorkRecord,
} from "@/lib/day-homework-progress";
import styles from "./notion-daily-planner.module.css";
interface Props {
  source: RunningListSource;
  records: HomeworkWorkRecord[];
  disabled: boolean;
  revision: string;
  onRecord: (value: HomeworkCheckin, revision: string) => Promise<void>;
  onRemove: (id: string, expected: string, revision: string) => Promise<void>;
}
export default function DayHomeworkCheckin({
  source,
  records,
  disabled,
  revision,
  onRecord,
  onRemove,
}: Props) {
  const [key, setKey] = useState(""),
    [outcome, setOutcome] = useState<HomeworkCheckin["outcome"]>("worked"),
    [minutes, setMinutes] = useState(""),
    [remaining, setRemaining] = useState(""),
    [note, setNote] = useState(""),
    [review, setReview] = useState<{
      value: HomeworkCheckin;
      revision: string;
      title: string;
    } | null>(null),
    [remove, setRemove] = useState<{
      record: HomeworkWorkRecord;
      revision: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const selected = source.items.find((item) => item.key === key),
    total = records
      .filter((record) => record.sample === (source.pageId === "sample"))
      .reduce((sum, record) => sum + (record.minutes ?? 0), 0);
  async function save() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      if (review.revision !== revision)
        throw Error(
          "The list or work records changed after review. Review your check-in again.",
        );
      await onRecord(review.value, review.revision);
      setReview(null);
      setMinutes("");
      setRemaining("");
      setNote("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="Homework check-ins">
      <div className={styles.sectionTitle}>
        <h2>Your work & next steps</h2>
        <span>{total} recorded minutes today</span>
      </div>
      <p className={styles.muted}>
        A time block does not mean an assignment is finished. Record what
        happened; Notion stays unchanged.
      </p>
      <details className={styles.connection}>
        <summary>Check in on homework</summary>
        <fieldset disabled={disabled || busy}>
          <label>
            Homework item
            <select
              aria-label="Homework item"
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setReview(null);
              }}
            >
              <option value="">Choose from your Notion list</option>
              {source.items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.subject ? item.subject + " · " : ""}
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <p className={styles.muted}>
              Current Daylight report:{" "}
              {homeworkProgressFor(records, source.pageId, key).status ===
              "complete"
                ? "assignment reported complete"
                : homeworkProgressFor(records, source.pageId, key).status ===
                    "set_aside"
                  ? "set aside for today"
                  : "not reported complete"}
              .
            </p>
          )}
          <div className={styles.formGrid}>
            <label>
              How did it go?
              <select
                aria-label="Homework outcome"
                value={outcome}
                onChange={(event) => {
                  setOutcome(event.target.value as HomeworkCheckin["outcome"]);
                  setReview(null);
                }}
              >
                <option value="worked">Worked on it · still unfinished</option>
                <option value="more_time">Change remaining focus time</option>
                <option value="complete">Assignment is complete</option>
                <option value="set_aside">Set it aside for today</option>
              </select>
            </label>
            <label>
              Minutes actually worked (optional)
              <input
                aria-label="Minutes actually worked"
                disabled={outcome === "more_time"}
                type="number"
                min={0}
                max={720}
                value={minutes}
                onChange={(event) => {
                  setMinutes(event.target.value);
                  setReview(null);
                }}
              />
            </label>
            {["worked", "more_time"].includes(outcome) && (
              <label>
                More focus minutes wanted today (optional)
                <input
                  aria-label="More focus minutes wanted today"
                  type="number"
                  min={0}
                  max={240}
                  value={remaining}
                  onChange={(event) => {
                    setRemaining(event.target.value);
                    setReview(null);
                  }}
                />
              </label>
            )}
          </div>
          <label>
            Work note (optional)
            <input
              aria-label="Homework work note"
              maxLength={500}
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setReview(null);
              }}
            />
          </label>
          <button
            disabled={!selected}
            onClick={() => {
              try {
                if (!selected) throw Error("Choose a homework item.");
                const value = homeworkCheckinSchema.parse({
                  sourceKey: key,
                  outcome,
                  minutes:
                    outcome === "more_time" || minutes === ""
                      ? null
                      : Number(minutes),
                  remainingMinutes:
                    ["worked", "more_time"].includes(outcome) &&
                    remaining !== ""
                      ? Number(remaining)
                      : null,
                  note,
                });
                setReview({ value, revision, title: selected.title });
                setError("");
              } catch {
                setError(
                  "Choose an item and check the minutes. Actual work can be left unknown; additional focus time is 0–240 minutes.",
                );
              }
            }}
          >
            Review homework check-in
          </button>
        </fieldset>
      </details>
      {review && (
        <section
          className={styles.connection}
          aria-label="Review homework check-in"
        >
          <h3>{review.title}</h3>
          <p>
            {review.value.outcome === "complete"
              ? "Report this assignment complete in Daylight."
              : review.value.outcome === "set_aside"
                ? "Set this assignment aside for the rest of today."
                : review.value.outcome === "more_time"
                  ? "Change the remaining focus time without recording any work."
                  : "Record work on this unfinished assignment."}
          </p>
          <p>
            {review.value.minutes === null
              ? "Actual time stays unknown."
              : review.value.minutes + " actual minutes will be recorded."}
            {review.value.remainingMinutes !== null
              ? " " +
                review.value.remainingMinutes +
                " more focus minutes requested today."
              : ""}
          </p>
          {review.value.note && <p>{review.value.note}</p>}
          <p className={styles.muted}>
            The rest of today will become a fresh draft for review. This does
            not write to Notion or confirm any unreported work.
          </p>
          <button disabled={disabled || busy} onClick={() => void save()}>
            {busy ? "Saving check-in…" : "Save reviewed homework check-in"}
          </button>
          <button
            disabled={busy}
            className={styles.secondary}
            onClick={() => setReview(null)}
          >
            Cancel check-in
          </button>
        </section>
      )}
      {!!records.length && (
        <details className={styles.connection}>
          <summary>Recorded work · {records.length}</summary>
          {[...records].reverse().map((record) => (
            <article key={record.id}>
              <h3>{record.title}</h3>
              <p>
                {record.outcome === "complete"
                  ? "Assignment reported complete"
                  : record.outcome === "set_aside"
                    ? "Set aside for today"
                    : record.outcome === "more_time"
                      ? "Focus time changed · no work inferred"
                      : "Worked on it · not reported complete"}{" "}
                ·{" "}
                {record.minutes === null
                  ? "Time not recorded"
                  : record.minutes + " actual minutes"}
                {record.sample ? " · Sample data" : ""}
              </p>
              {record.note && <p>{record.note}</p>}
              <small>{new Date(record.recordedAt).toLocaleString()}</small>
              <button
                disabled={disabled || busy}
                className={styles.secondary}
                onClick={() => setRemove({ record, revision })}
              >
                Review removing work record
              </button>
            </article>
          ))}
        </details>
      )}
      {remove && (
        <section
          className={styles.connection}
          aria-label="Review removing work record"
        >
          <h3>Remove this record for {remove.record.title}?</h3>
          <p>
            It will stop counting toward today's recorded time and local
            homework status. Your timetable will need fresh approval.
            Conversation messages, exported files and Notion are separate.
          </p>
          <button
            disabled={disabled || busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void onRemove(
                remove.record.id,
                JSON.stringify(remove.record),
                remove.revision,
              )
                .then(() => setRemove(null))
                .catch((error) => setError(error.message))
                .finally(() => setBusy(false));
            }}
          >
            Remove reviewed work record
          </button>
          <button
            disabled={busy}
            className={styles.secondary}
            onClick={() => setRemove(null)}
          >
            Keep work record
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
