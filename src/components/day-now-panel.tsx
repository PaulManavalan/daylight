"use client";
import { useEffect, useState } from "react";
import { dayTimeline } from "@/lib/day-timeline";
import type { NotionDayPlan } from "@/lib/notion-day-plan";
import styles from "./day-now-panel.module.css";

const clock = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
const kind = {
  study: "Focus",
  activity: "Training",
  fixed: "Your event",
  recovery: "Breathing room",
  break: "Break",
};
export default function DayNowPanel({
  plan,
  approved,
  sampleHomework = false,
}: {
  plan: NotionDayPlan;
  approved: boolean;
  sampleHomework?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  if (!approved || !now) return null;
  const state = dayTimeline(plan, now);
  if (state.phase === "different_day" || state.phase === "invalid")
    return (
      <aside className={styles.panel} aria-label="Current schedule">
        <p>This plan needs a fresh review. Reload to plan today.</p>
      </aside>
    );
  return (
    <aside className={styles.panel} aria-label="Current schedule">
      <div className={styles.current}>
        {sampleHomework && (
          <p className={styles.label}>Includes sample homework</p>
        )}
        <span className={styles.label}>
          {state.active.length
            ? "Scheduled now"
            : state.next
              ? "Room to breathe"
              : "No later blocks"}
        </span>
        {state.active.map((entry) => (
          <div key={entry.id} className={styles.block}>
            <h3>{entry.title}</h3>
            <p>
              {entry.satReviewId ? "SAT practice" : kind[entry.kind]} ·{" "}
              {clock(entry.start)}–{clock(entry.end)}
            </p>
          </div>
        ))}
        {state.active.length > 1 && (
          <p>
            These blocks overlap. Review your commitments before changing the
            day.
          </p>
        )}
        {!state.active.length && (
          <p>
            {state.next
              ? `Your next block starts at ${clock(state.next.start)}.`
              : "You've reached the end of this timetable."}
          </p>
        )}
      </div>
      {state.next && (
        <div className={styles.next}>
          <span className={styles.label}>
            Up next · {clock(state.next.start)}
          </span>
          <h3>{state.next.title}</h3>
          <p>
            {state.next.satReviewId ? "SAT practice" : kind[state.next.kind]} ·
            until {clock(state.next.end)}
          </p>
        </div>
      )}
      <p className={styles.note}>
        This follows your approved schedule. Work is recorded only when you
        check in.
      </p>
    </aside>
  );
}
