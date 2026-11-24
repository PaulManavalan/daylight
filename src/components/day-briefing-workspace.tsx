"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  PersonalWorkspaceStore,
  personalWorkspaceSchema,
  defaultPersonalWorkspace,
} from "@/lib/personal-workspace";
import { SatStore, satSummary, satStateSchema, defaultSat } from "@/lib/sat";
import { useAccountWorkspace } from "./account-workspace-context";
import { practiceSummary } from "@/lib/sat-practice";
import { dateKey } from "@/lib/scheduling";
import { dayBriefing } from "@/lib/day-briefing";
import styles from "./notion-daily-planner.module.css";
import css from "./sat-practice-workspace.module.css";
import NewsBriefingPanel from "./news-briefing-panel";
export default function DayBriefingWorkspace() {
  const { account } = useAccountWorkspace();
  const [brief, setBrief] = useState<ReturnType<typeof dayBriefing> | null>(
      null,
    ),
    [sat, setSat] = useState<ReturnType<typeof satSummary> | null>(null),
    [practice, setPractice] = useState<ReturnType<typeof practiceSummary>>([]),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState("");
  function refresh() {
    try {
      const payload = account?.document("personal").payload;
      const personal = account
          ? payload === null
            ? defaultPersonalWorkspace()
            : personalWorkspaceSchema.parse(payload)
          : new PersonalWorkspaceStore(localStorage).load().state,
        now = new Date(),
        raw = account
          ? JSON.stringify(account.document("day:" + dateKey(now)).payload)
          : localStorage.getItem("daylight.notion-day.v1." + dateKey(now));
      let data: unknown = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = {};
      }
      setUpdated(
        now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      );
      setError("");
      try {
        const satPayload = account?.document("sat").payload;
        const state = account
          ? satPayload === null
            ? defaultSat()
            : satStateSchema.parse(satPayload)
          : new SatStore(localStorage, "local-demo").load().state;
        setSat(satSummary(state));
        setPractice(practiceSummary(state.attempts));
        setBrief(dayBriefing(data, personal, now, state));
      } catch {
        setSat(null);
        setPractice([]);
        setBrief(dayBriefing(data, personal, now, null));
        setError(
          "SAT records need recovery. Other available records are shown.",
        );
      }
    } catch (e) {
      setBrief(null);
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
    const unsubscribe = account?.subscribe(refresh);
    const timer = setInterval(refresh, 60000);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      unsubscribe?.();
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [account]);
  const clock = (value: string) =>
    new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.logo} href="/day">
          Daylight
        </Link>
        <nav className={styles.nav}>
          <Link href="/day">Plan & chat</Link>
          <Link href="/day/news">News</Link>
          <Link href="/day/preferences">Preferences & calendars</Link>
        </nav>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>YOUR DAY, TOGETHER</p>
        <h1>
          A little clarity.
          <br />
          <em>A day you can use.</em>
        </h1>
        <p>
          {account ? "Account workspace" : "Local preview"} · refreshed{" "}
          {updated || "when opened"}. This view reads your saved records when
          opened; it does not prepare a briefing while the app is closed.
        </p>
      </section>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!brief ? (
        <p>Loading your day…</p>
      ) : (
        <div className={css.layout}>
          <section className={styles.panel}>
            <div className={styles.sectionTitle}>
              <h2>What’s next?</h2>
              <span>
                {brief.day}
                {brief.sample ? " · SAMPLE DATA" : ""}
              </span>
            </div>
            {brief.next ? (
              <>
                <h3>{brief.next.title}</h3>
                <p>
                  {clock(brief.next.start)}–{clock(brief.next.end)} ·{" "}
                  {Date.parse(brief.next.start) <= Date.now()
                    ? "Scheduled now"
                    : "Upcoming"}
                </p>
                <p className={styles.muted}>
                  Scheduled time is not a completion record.
                </p>
              </>
            ) : (
              <p>
                {brief.approved
                  ? "No more scheduled activities today. Unfinished work still needs your check-in."
                  : "Create or review today’s plan to see the next scheduled activity."}
              </p>
            )}
            <Link href="/day">Open the planner and conversation →</Link>
            {brief.warnings.map((w) => (
              <p role="alert" key={w} className={styles.error}>
                {w}
              </p>
            ))}
            {brief.plan && (
              <>
                <h3>Your approved timeline</h3>
                <ol className={styles.timeline}>
                  {brief.plan.entries.map((e) => (
                    <li key={e.id} data-kind={e.kind}>
                      <time>
                        {clock(e.start)}
                        <br />
                        {clock(e.end)}
                      </time>
                      <div>
                        <h3>{e.title}</h3>
                      </div>
                    </li>
                  ))}
                </ol>
                {brief.plan.deferred.length > 0 && (
                  <>
                    <h3>Still needs room</h3>
                    {brief.plan.deferred.map((d, i) => (
                      <p key={i}>
                        {d.title} — {d.reason}
                      </p>
                    ))}
                  </>
                )}
              </>
            )}
          </section>
          <aside className={css.sidebar}>
            <NewsBriefingPanel />
            <section className={styles.panel}>
              <h2>Homework you chose</h2>
              {brief.homeworkProgress.length > 0 && (
                <p>
                  {brief.homeworkProgress
                    .filter((record) => record.sample === brief.sample)
                    .reduce(
                      (total, record) => total + (record.minutes ?? 0),
                      0,
                    )}{" "}
                  actual homework minutes recorded today.{" "}
                  <Link href="/day">Review work check-ins →</Link>
                </p>
              )}
              <p className={styles.muted}>
                {brief.sourceReadAt
                  ? "Notion snapshot read " +
                    new Date(brief.sourceReadAt).toLocaleString() +
                    ". Refresh in the planner to check for changes."
                  : "Load your running list in the planner first."}
              </p>
              {brief.assignments.map((a) => (
                <p key={a.key}>
                  {a.subject && <small>{a.subject} · </small>}
                  {a.title}
                </p>
              ))}
              {brief.sourceReadAt && !brief.assignments.length && (
                <p>No unfinished highlighted items in this snapshot.</p>
              )}
            </section>
            <section className={styles.panel}>
              <h2>Meals for today</h2>
              {brief.meals ? (
                Object.entries(brief.meals).map(([slot, title]) => (
                  <p key={slot}>
                    <strong>{slot}</strong> · {title || "Open choice"}
                  </p>
                ))
              ) : (
                <p>No menu saved for today.</p>
              )}
              <Link href="/day/meals">
                Plan meals or open your food journal →
              </Link>
            </section>
            <section className={styles.panel}>
              <h2>Chosen training</h2>
              {brief.activities.length ? (
                brief.activities.map((a) => (
                  <p key={a.id}>
                    {a.title} · {a.minutes} planned minutes
                  </p>
                ))
              ) : (
                <p>No training selected for this day plan.</p>
              )}
              <Link href="/day/fitness">Training & progress →</Link>
            </section>
            <section className={styles.panel}>
              <h2>SAT focus</h2>
              <p>
                Goal: {sat?.goal ?? "Not available"}
                {sat?.latest
                  ? " · Latest full result: " + sat.latest.total
                  : ""}
              </p>
              {sat?.focus[0] && (
                <p>
                  Review queue: {sat.focus[0].topic} · {sat.focus[0].unreviewed}{" "}
                  unreviewed
                </p>
              )}
              {practice[0] && (
                <p>
                  Practice to revisit: {practice[0].skill} (
                  {practice[0].correct}/{practice[0].attempts} correct in the
                  starter collection).
                </p>
              )}
              <Link href="/day/sat">Open question practice →</Link>
            </section>
            <section className={styles.panel}>
              <h2>Daily readings</h2>
              <p>
                Open the authorized source for Catholic readings for this date.
              </p>
              <a href={brief.readingUrl} target="_blank" rel="noreferrer">
                USCCB daily Mass readings ↗
              </a>
            </section>
          </aside>
          <section className={`${styles.panel} ${css.history}`}>
            <h2>Your imported calendars</h2>
            <p className={styles.muted}>
              Saved file snapshots, not live account sync. Refresh imports in
              Preferences when events change.
            </p>
            {brief.events.length ? (
              brief.events.map((e) => (
                <p key={e.id}>
                  {e.start}–{e.end} · {e.title}
                </p>
              ))
            ) : (
              <p>
                No imported busy events available for today. This does not
                confirm you have no events.
              </p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
