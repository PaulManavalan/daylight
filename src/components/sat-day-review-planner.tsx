"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  satDayReviewSchema,
  satReviewTitle,
  type SatDayReview,
} from "@/lib/sat-day-review";
import type { SatState } from "@/lib/sat";
import { practiceQuestions } from "@/lib/sat-practice";
import { dateKey } from "@/lib/scheduling";
import styles from "./notion-daily-planner.module.css";

export default function SatDayReviewPlanner({
  state,
  onSave,
}: {
  state: SatState;
  onSave: (state: SatState) => Promise<boolean>;
}) {
  const [date, setDate] = useState(""),
    [skill, setSkill] = useState("Mixed practice"),
    [minutes, setMinutes] = useState("20"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [review, setReview] = useState<{
    kind: "add" | "remove";
    value: SatDayReview;
    expected: SatState;
  } | null>(null);
  useEffect(() => {
    setDate(dateKey(new Date()));
  }, []);
  async function confirm() {
    if (!review || busy) return;
    setBusy(true);
    setError("");
    try {
      if (state !== review.expected)
        throw Error(
          "SAT records changed after review. Review this choice again.",
        );
      const reviewPlans =
        review.kind === "add"
          ? [...state.reviewPlans, review.value]
          : state.reviewPlans.filter((item) => item.id !== review.value.id);
      if (await onSave({ ...state, reviewPlans })) {
        setReview(null);
        setNotice(
          review.kind === "add"
            ? "Practice time selected. Review a fresh daily plan to place it around your commitments."
            : "Practice time removed. Review a fresh daily plan; saved answers are unchanged.",
        );
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel} aria-label="SAT time in your day">
      <div className={styles.sectionTitle}>
        <h2>Make room for practice</h2>
        <span>{state.reviewPlans.length} selected blocks</span>
      </div>
      <p>
        Choose a day and a little practice time. Your daily planner fits it
        around Notion homework and events, within the same focus allowance.
      </p>
      <details>
        <summary>Choose practice time</summary>
        <div className={styles.formGrid}>
          <label>
            Practice date
            <input
              aria-label="SAT practice date"
              type="date"
              value={date}
              disabled={busy}
              onChange={(event) => {
                setDate(event.target.value);
                setReview(null);
              }}
            />
          </label>
          <label>
            Skill
            <select
              aria-label="Planned SAT skill"
              value={skill}
              disabled={busy}
              onChange={(event) => {
                setSkill(event.target.value);
                setReview(null);
              }}
            >
              <option>Mixed practice</option>
              {[
                ...new Set(practiceQuestions.map((question) => question.skill)),
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Focus minutes
            <input
              aria-label="Planned SAT minutes"
              type="number"
              min={5}
              max={120}
              value={minutes}
              disabled={busy}
              onChange={(event) => {
                setMinutes(event.target.value);
                setReview(null);
              }}
            />
          </label>
        </div>
        <button
          disabled={busy || !date}
          onClick={() => {
            setError("");
            setNotice("");
            try {
              const value = satDayReviewSchema.parse({
                id: crypto.randomUUID(),
                date,
                skill,
                minutes: Number(minutes),
              });
              if (
                state.reviewPlans.some(
                  (item) =>
                    item.date === value.date && item.skill === value.skill,
                )
              )
                throw Error(
                  "This skill already has practice time on that day. Remove its existing choice before replacing it.",
                );
              setReview({ kind: "add", value, expected: state });
            } catch (error) {
              setError(
                error instanceof Error && !error.message.startsWith("[")
                  ? error.message
                  : "Choose a date and 5–120 whole minutes.",
              );
            }
          }}
        >
          Review adding SAT practice
        </button>
      </details>
      {!!state.reviewPlans.length && (
        <details>
          <summary>Selected SAT time</summary>
          {[...state.reviewPlans]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((item) => (
              <article key={item.id}>
                <h3>{satReviewTitle(item)}</h3>
                <p>
                  {item.date} · {item.minutes} minutes · planned, not completed
                </p>
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() => {
                    setReview({ kind: "remove", value: item, expected: state });
                    setError("");
                  }}
                >
                  Review removing {item.skill}
                </button>
              </article>
            ))}
        </details>
      )}
      {review && (
        <section className={styles.connection} aria-label="Review SAT time">
          <h3>
            {review.kind === "add"
              ? "Add this practice time?"
              : "Remove this practice time?"}
          </h3>
          <p>
            {satReviewTitle(review.value)} · {review.value.date} ·{" "}
            {review.value.minutes} minutes
          </p>
          <p>
            This changes your planning choice, not your answer history. Your
            daily timetable needs a fresh review. Nothing is sent to a calendar.
          </p>
          <button disabled={busy} onClick={() => void confirm()}>
            {busy
              ? "Saving…"
              : review.kind === "add"
                ? "Save reviewed SAT time"
                : "Remove reviewed SAT time"}
          </button>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => setReview(null)}
          >
            Keep current SAT time
          </button>
        </section>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status">
          {notice} <Link href="/day">Open daily planner →</Link>
        </p>
      )}
    </section>
  );
}
