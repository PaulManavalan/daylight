"use client";
import { savedDaySessionSchema } from "@/lib/day-session";
import { recoverLocalRestore, RESTORE_PENDING } from "@/lib/workspace-backup";
import { shouldUpdateDayPlan } from "@/lib/day-plan-update";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import Link from "next/link";
import { fitnessActivitiesForDate } from "@/lib/fitness";
import DayDetailsReview from "./day-details-review";
import CalendarTransferPanel from "./calendar-transfer-panel";
import { usePersonalWorkspace } from "./use-personal-workspace";
import {
  calendarBusyToday,
  emptyCalendars,
  exportDayCalendar,
} from "@/lib/calendar-transfer";
import { useAssistantBrain } from "./use-assistant-brain";
import {
  emptyNotionDay,
  notionDayContextSchema,
  type NotionDayContext,
} from "@/lib/notion-day-model";
import {
  buildNotionDayPlan,
  dayIsReady,
  notionDayPlanSchema,
  type NotionDayPlan,
} from "@/lib/notion-day-plan";
import { runningSourceSchema } from "@/lib/notion-running-schema";
import type { RunningListSource } from "@/lib/notion-daily-source";
import styles from "./notion-daily-planner.module.css";
import {
  useAccountWorkspace,
  accountAuthHeaders,
} from "./account-workspace-context";
import { stableJSON } from "@/lib/workspace-documents";

const sourceSchema = runningSourceSchema;
const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(5000),
});
const savedSchema = savedDaySessionSchema;
type Message = z.infer<typeof messageSchema>;
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function clock(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
function sampleSource(): RunningListSource {
  return {
    pageId: "sample",
    title: "Sample running list",
    readAt: new Date().toISOString(),
    items: [
      ["Read chapter 4", "Literature", true],
      ["Review practice problems", "Physics", true],
      ["Draft project outline", "History", true],
      ["Review vocabulary", "Spanish", false],
    ].map(([title, subject, yellow], i) => ({
      key: "sample-" + i,
      title: String(title),
      subject: String(subject),
      yellowHighlighted: Boolean(yellow),
      completion: "not_specified",
      sourceUrl: "https://www.notion.so/",
    })),
    weeklyNotes: [],
    warnings: [],
  };
}
export default function NotionDailyPlanner() {
  const { account, owner } = useAccountWorkspace();
  const brain = useAssistantBrain(
      owner === "local-demo" ? "notion-day-v1" : "notion-day-v1." + owner,
    ),
    personal = usePersonalWorkspace();
  const [source, setSource] = useState<RunningListSource | null>(null),
    [sample, setSample] = useState(false),
    [known, setKnown] = useState<NotionDayContext>(emptyNotionDay),
    [messages, setMessages] = useState<Message[]>([]),
    [draft, setDraft] = useState(""),
    [plan, setPlan] = useState<NotionDayPlan | null>(null),
    [approved, setApproved] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [savingDay,setSavingDay]=useState(false),
    [connected, setConnected] = useState(false),
    [configured, setConfigured] = useState(false),
    [url, setUrl] = useState(""),
    [day, setDay] = useState(""),
    [snapshot, setSnapshot] = useState<RunningListSource | null>(null);
  const end = useRef<HTMLDivElement>(null),
    requestActive = useRef(false),
    savedVersion = useRef<string | null>(null),
    planCalendar = useRef(JSON.stringify(emptyCalendars())),
    planActivities = useRef("[]");
  const savedSequence = useRef(0),
    writingDay = useRef<string | null>(null);
  useEffect(() => {
    setDay(today());
    try {
      if (!account) recoverLocalRestore(localStorage);
      const entry = account?.document("day:" + today());
      savedSequence.current = entry?.sequence ?? 0;
      const raw = account
        ? entry?.payload
          ? JSON.stringify(entry.payload)
          : null
        : localStorage.getItem("daylight.notion-day.v1." + today());
      savedVersion.current = raw;
      if (raw) {
        const saved = savedSchema.parse(JSON.parse(raw));
        setSource(saved.source);
        if (!saved.sample) setUrl(saved.source.pageId);
        setSample(saved.sample);
        setKnown(saved.known);
        setMessages(saved.messages);
        setPlan(saved.plan);
        setApproved(saved.approved);
        planCalendar.current =
          saved.calendarRevision ?? JSON.stringify(emptyCalendars());
        planActivities.current = saved.activityRevision ?? "[]";
      }
    } catch {
      setError(
        "The previous day draft could not be restored. It has not been overwritten.",
      );
    }
    void accountAuthHeaders(owner)
      .then((headers) => fetch("/api/notion", { cache: "no-store", headers }))
      .then((r) => r.json())
      .then((data) => {
        setConnected(Boolean(data.connected));
        setConfigured(Boolean(data.configured));
      })
      .catch(() => {});
  }, [account, owner]);
  useEffect(() => {
    const date = today(),
      key = "daylight.notion-day.v1." + date;
    const changed = () => {
      if (account) {
        const entry = account.document("day:" + date);
        if (
          entry.sequence === savedSequence.current ||
          writingDay.current === stableJSON(entry.payload)
        )
          return;
      } else if (localStorage.getItem(key) === savedVersion.current) return;
      setPlan(null);
      setApproved(false);
      setError(
        "This saved day changed in another tab or device. Your conversation draft is kept; reload before saving or exporting.",
      );
    };
    if (account) return account.subscribe(changed);
    const listener = (event: StorageEvent) => {
      if (event.key === key || event.key === null) changed();
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [account]);
  useEffect(() => {
    if (account) return;
    void fetch("/api/running-list-snapshot", { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) setSnapshot(sourceSchema.parse(await response.json()));
      })
      .catch(() => {});
  }, [account]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, brain.thinking]);
  async function persist(
    nextSource: RunningListSource,
    nextSample: boolean,
    nextKnown: NotionDayContext,
    nextMessages: Message[],
    nextPlan: NotionDayPlan | null,
    nextApproved: boolean,
  ) {
    if (!account && localStorage.getItem(RESTORE_PENDING) !== null)
      throw new Error(
        "Finish the interrupted workspace restore before saving this day.",
      );
    if (today() !== day)
      throw new Error("A new day has started. Reload to start a fresh plan.");
    const value = savedSchema.parse({
      source: nextSource,
      sample: nextSample,
      known: nextKnown,
      messages: nextMessages.slice(-12),
      plan: nextPlan,
      approved: nextApproved,
      activityRevision,
      calendarRevision: JSON.stringify(
        personal.state?.calendars ?? emptyCalendars(),
      ),
    });
    const key = "daylight.notion-day.v1." + day;
    if (account) {
      if(writingDay.current!==null)throw Error('Wait for the current day draft to finish saving.');
      setSavingDay(true);
      writingDay.current = stableJSON(value);
      try {
        const entry = await account.update(
          "day:" + day,
          value,
          savedSequence.current,
        );
        savedSequence.current = entry.sequence;
        savedVersion.current = JSON.stringify(entry.payload);
      } finally {
        writingDay.current = null;
        setSavingDay(false);
      }
      return;
    }
    if (localStorage.getItem(key) !== savedVersion.current)
      throw new Error(
        "This day changed in another tab. Reload before saving to avoid overwriting it.",
      );
    const encoded = JSON.stringify(value);
    localStorage.setItem(key, encoded);
    savedVersion.current = encoded;
  }
  async function useSource(next: RunningListSource, isSample: boolean) {
    setSource(next);
    if (!isSample) setUrl(next.pageId);
    setSample(isSample);
    setKnown(emptyNotionDay());
    setMessages([]);
    setPlan(null);
    setApproved(false);
    setError("");
    try {
      await persist(next, isSample, emptyNotionDay(), [], null, false);
    } catch {
      setError(
        "This list is available for this session, but could not be saved on this browser.",
      );
    }
  }
  async function notion(body: unknown) {
    const response = await fetch("/api/notion", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(await accountAuthHeaders(owner)),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error ?? "Notion could not be reached.");
    return data;
  }
  async function connect() {
    setBusy(true);
    setError("");
    try {
      const data = await notion({ op: "connect" });
      const destination = new URL(data.url);
      if (destination.origin !== "https://api.notion.com")
        throw new Error("Unexpected connection destination.");
      location.assign(destination.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }
  async function readList() {
    if (
      messages.length &&
      !confirm(
        "Reading a new list starts a new conversation and draft in this preview. Continue?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const next = sourceSchema.parse(
        await notion({ op: "running-list", source: url }),
      );
      await useSource(next, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the list.");
    } finally {
      setBusy(false);
    }
  }
  const calendarRevision = JSON.stringify(
    personal.state?.calendars ?? emptyCalendars(),
  );
  const selectedActivities = useMemo(
    () =>
      personal.state
        ? fitnessActivitiesForDate(personal.state.fitness, day || today())
        : [],
    [personal.state?.fitness, day],
  );
  const activityRevision = JSON.stringify(selectedActivities);
  useEffect(() => {
    if (
      personal.state &&
      plan &&
      (planCalendar.current !== calendarRevision ||
        planActivities.current !== activityRevision)
    ) {
      setPlan(null);
      setApproved(false);
      setError(
        planCalendar.current !== calendarRevision
          ? "Your calendars changed. Your conversation is kept; ask for a fresh day plan before saving or exporting."
          : "Your selected training activities changed. Your conversation is kept; create a fresh day plan before saving or exporting.",
      );
    }
  }, [calendarRevision, activityRevision, personal.state, plan]);
  function downloadCalendar(includeTraining = false) {
    if (
      !plan ||
      !approved ||
      planCalendar.current !== calendarRevision ||
      planActivities.current !== activityRevision
    )
      return;
    const content = exportDayCalendar(plan, includeTraining),
      url = URL.createObjectURL(
        new Blob([content], { type: "text/calendar;charset=utf-8" }),
      );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "daylight-" + plan.day + ".ics";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function send(text = draft) {
    if (!source || !text.trim() || requestActive.current || busy) return;
    requestActive.current = true;
    setError("");
    const nextMessages: Message[] = [
      ...messages,
      { role: "user" as const, content: text.trim() },
    ].slice(-11);
    try {
      if (today() !== day)
        throw new Error("A new day has started. Reload to start a fresh plan.");
      if (!personal.state || personal.error)
        throw new Error(
          personal.error ||
            "Personal settings are still loading. Please try again.",
        );
      const now = new Date();
      const externalEvents = calendarBusyToday(personal.state.calendars, now);
      const compact = source.items
        .filter((item) => item.completion !== "checked")
        .slice(0, 40)
        .map((item) => ({
          key: item.key,
          title: item.title,
          subject: item.subject,
          today: item.yellowHighlighted,
        }));
      const result = await brain.ask(
        {
          mode: "notion_day",
          persona: { name: "Daylight", tone: "calm" },
          messages: nextMessages,
          context: JSON.stringify({
            today: day,
            localTime: now.toTimeString().slice(0, 5),
            source: {
              title: source.title,
              readAt: source.readAt,
              items: compact,
              omitted: Math.max(0, source.items.length - compact.length),
              weeklyNotes: source.weeklyNotes.slice(0, 8),
            },
            knownDay: known,
            selectedTrainingActivities: selectedActivities,
            plannedMealsToday:
              personal.state.nutrition.plans
                .flatMap((plan) => plan.days)
                .find((entry) => entry.date === day)?.slots ?? null,
            externalCalendarEvents: externalEvents,
            preferences: {
              displayName: personal.state.displayName,
              food: personal.state.food,
              news: personal.state.news,
            },
          }),
        },
        [],
      );
      if (!result.dailyContext)
        throw new Error(
          "The model did not return a usable day context. Your message is kept.",
        );
      const parsedKnown = notionDayContextSchema.parse(result.dailyContext);
      const updatePlan = shouldUpdateDayPlan(known, parsedKnown, text);
      const nextKnown = updatePlan ? parsedKnown : known;
      let nextPlan: NotionDayPlan | null = updatePlan ? null : plan;
      const nextApproved = updatePlan ? false : approved;
      let planningError = "";
      if (updatePlan && dayIsReady(nextKnown)) {
        try {
          nextPlan = buildNotionDayPlan(
            source,
            nextKnown,
            new Date(),
            personal.state.calendars,
            personal.state.fitness,
          );
        } catch (e) {
          planningError =
            e instanceof Error
              ? e.message
              : "The timetable needs clarification.";
        }
      }
      const complete: Message[] = [
        ...nextMessages,
        { role: "assistant", content: result.reply },
      ];
      setMessages(complete);
      setKnown(nextKnown);
      if (updatePlan) {
        planCalendar.current = calendarRevision;
        planActivities.current = activityRevision;
      }
      setPlan(nextPlan);
      setApproved(nextApproved);
      setDraft("");
      try {
        await persist(
          source,
          sample,
          nextKnown,
          complete,
          nextPlan,
          nextApproved,
        );
      } catch {
        planningError +=
          " Your conversation is available in this tab, but could not be saved on this browser.";
      }
      setError(planningError);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The conversation could not continue. Your message is kept.",
      );
    } finally {
      requestActive.current = false;
    }
  }
  async function approve() {
    if (!source || !plan) return;
    try {
      if (
        planCalendar.current !== calendarRevision ||
        planActivities.current !== activityRevision
      )
        throw new Error(
          "Your calendars or selected training changed. Make a fresh draft first.",
        );
      await persist(source, sample, known, messages, plan, true);
      setApproved(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this plan.");
    }
  }
  async function draftWithoutAI(nextKnown: NotionDayContext) {
    if (!source || !personal.state) return;
    try {
      if (today() !== day)
        throw new Error("A new day has started. Reload to plan today.");
      if (personal.error) throw new Error(personal.error);
      const nextPlan = buildNotionDayPlan(
        source,
        nextKnown,
        new Date(),
        personal.state.calendars,
        personal.state.fitness,
      );
      setKnown(nextKnown);
      planCalendar.current = calendarRevision;
      planActivities.current = activityRevision;
      setPlan(nextPlan);
      setApproved(false);
      setError("");
      try {
        await persist(source, sample, nextKnown, messages, nextPlan, false);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "The draft could not be saved in this browser.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Please review the day details.",
      );
    }
  }
  const selected =
    source?.items.filter(
      (item) => item.yellowHighlighted && item.completion !== "checked",
    ) ?? [];
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/day" className={styles.logo}>
          daylight<span> / daily planner preview</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/day/briefing">Today overview</Link>
          <Link href="/day/sat">SAT practice</Link>
          <Link href="/day/fitness">Training & progress</Link>
          <Link href="/day/meals">Meals & food journal</Link>
          <Link href="/day/preferences">Your preferences</Link>
          <Link href="/">Full workspace ↗</Link>
        </nav>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>YOUR LIST. YOUR DAY.</p>
        <h1>
          A little structure.
          <br />
          <em>Room for real life.</em>
        </h1>
        <p>
          Your Notion list is the starting point. Talk through today, then make
          a plan you can actually use.
        </p>
      </section>
      {personal.state && (
        <details className={styles.connections}>
          <summary>
            Calendars · {personal.state.calendars.calendars.length} imported ·
            file transfer options
          </summary>
          <CalendarTransferPanel
            state={personal.state}
            save={personal.save}
            disabled={brain.thinking || brain.loading}
          />
        </details>
      )}
      {personal.error && (
        <p role="alert" className={styles.error}>
          {personal.error}
        </p>
      )}
      <div className={styles.layout}>
        <aside className={styles.panel}>
          <div className={styles.sectionTitle}>
            <h2>Your running list</h2>
            {source && <span>{sample ? "Sample" : "Notion read"}</span>}
          </div>
          {!source ? (
            <>
              <p>
                Connect a Notion page to bring in your existing homework. Yellow
                highlights mean you want to work on it today.
              </p>
              <button disabled={busy || !configured} onClick={connect}>
                {connected ? "Reconnect Notion" : "Connect Notion"}
              </button>
              {!configured && (
                <p className={styles.muted}>
                  Notion connection setup is still needed on this deployment.
                  The sample below lets you review the flow.
                </p>
              )}
            </>
          ) : (
            <>
              <h3>{source.title}</h3>
              <p className={styles.muted}>
                {sample ? "Sample data · " : "Last read · "}
                {new Date(source.readAt).toLocaleString()} · Not a live feed
              </p>
              <p className={styles.yellow}>
                {selected.length} highlighted for today
              </p>
              <ul className={styles.tasks}>
                {selected.map((item) => (
                  <li key={item.key}>
                    <span>{item.subject}</span>
                    {item.title}
                  </li>
                ))}
              </ul>
              {source.warnings.map((w) => (
                <p key={w} className={styles.muted}>
                  {w}
                </p>
              ))}
              <details>
                <summary>Rest of the list</summary>
                <ul>
                  {source.items
                    .filter(
                      (i) => !i.yellowHighlighted && i.completion !== "checked",
                    )
                    .map((i) => (
                      <li key={i.key}>
                        {i.subject ? i.subject + ": " : ""}
                        {i.title}
                      </li>
                    ))}
                </ul>
              </details>
            </>
          )}
          {connected && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void readList();
              }}
            >
              <label htmlFor="notion-page">Running list page link</label>
              <input
                id="notion-page"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://www.notion.so/…"
              />
              <button disabled={busy || savingDay || brain.thinking}>Read list</button>
            </form>
          )}
          {source && !connected && configured && (
            <button disabled={busy || savingDay || brain.thinking} onClick={connect}>
              Connect Notion
            </button>
          )}
          {snapshot && (
            <button
              disabled={busy || savingDay || brain.thinking}
              onClick={() => useSource(snapshot, false)}
            >
              Use my local Notion snapshot
            </button>
          )}
          <button
            className={styles.secondary}
            disabled={busy || savingDay || brain.thinking}
            onClick={() => {
              if (
                !source ||
                confirm("Start a fresh conversation with sample data?")
              )
                useSource(sampleSource(), true);
            }}
          >
            Try a sample list
          </button>
          <details className={styles.connection}>
            <summary>
              Chat connection · {brain.available ? "ready" : "offline"}
            </summary>
            <p className={styles.muted}>
              {brain.model ||
                "A real model is needed for this conversation. Local AI works on your computer; browser AI runs on supported devices."}
            </p>
            {brain.provider === "ollama" && brain.localModels.length > 1 && (
              <label>
                Local model
                <select
                  aria-label="Local model"
                  value={brain.model}
                  disabled={brain.thinking}
                  onChange={(e) => brain.selectModel(e.target.value)}
                >
                  {brain.localModels.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              disabled={brain.thinking || brain.loading}
              onClick={() => void brain.reconnect()}
            >
              Reconnect local AI
            </button>
            <button
              disabled={brain.thinking || brain.loading}
              onClick={() => void brain.enableBrowser()}
            >
              Enable free browser AI (~1 GB)
            </button>
            {brain.loading && (
              <p>{Math.round(brain.progress * 100)}% · downloading model</p>
            )}
            {brain.detail && <p className={styles.muted}>{brain.detail}</p>}
            {(brain.loading || brain.thinking) && (
              <button onClick={brain.stop}>Stop</button>
            )}
          </details>
        </aside>
        <section className={styles.panel}>
          <div className={styles.sectionTitle}>
            <h2>Let’s work out today</h2>
            <span>
              {day &&
                new Date(day + "T12:00:00").toLocaleDateString([], {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
            </span>
          </div>
          <div className={styles.chat} aria-live="polite">
            {!messages.length && (
              <div className={styles.empty}>
                <h3>What does today look like?</h3>
                <p>
                  Once your list is ready, tell Daylight what’s happening today
                  and anything else you want to make room for. It will ask for
                  what’s missing.
                </p>
                {source && (
                  <button
                    disabled={!brain.available || brain.thinking}
                    onClick={() =>
                      void send(
                        "Help me plan today from my highlighted Notion list. Ask me about today’s events and anything else I want to do.",
                      )
                    }
                  >
                    Plan today →
                  </button>
                )}
              </div>
            )}
            {messages.map((message, i) => (
              <div
                key={i}
                className={
                  message.role === "user" ? styles.user : styles.assistant
                }
              >
                <small>{message.role === "user" ? "You" : "Daylight"}</small>
                <p>{message.content}</p>
              </div>
            ))}
            {brain.thinking && (
              <p className={styles.muted}>Working through your day…</p>
            )}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className={styles.muted} htmlFor="day-message">
              Talk through your day
            </label>
            <textarea
              id="day-message"
              maxLength={5000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!source || brain.thinking}
              placeholder={
                source
                  ? "I have practice later, and I want time to…"
                  : "Read your Notion list or try the sample to start."
              }
            />
            <button
              disabled={
                !source ||
                !draft.trim() ||
                !brain.available ||
                brain.thinking ||
                busy
              }
            >
              Send →
            </button>
          </form>
          {source && (
            <DayDetailsReview
              known={known}
              disabled={savingDay || brain.thinking || brain.loading || !personal.state}
              onDraft={draftWithoutAI}
            />
          )}{" "}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </section>
      </div>
      <section className={`${styles.panel} ${styles.plan}`}>
        <div className={styles.sectionTitle}>
          <h2>{approved ? "Your plan for today" : "Your day, taking shape"}</h2>
          <span>
            {plan
              ? approved
                ? "Saved in this browser"
                : "Draft · review before saving"
              : "Not planned yet"}
          </span>
        </div>
        {!plan ? (
          <p className={styles.muted}>
            Your timetable will appear here after you’ve discussed events, other
            plans and your available window.
          </p>
        ) : (
          <>
            <p>
              Available window: {plan.window}.{" "}
              {sample ? "This plan uses sample homework. " : ""}Nothing is
              marked complete or written to Notion.
            </p>
            <details>
              <summary>Confirmed events & suggested focus allowance</summary>
              <p>
                {known.events.length
                  ? known.events
                      .map((e) => `${e.title} ${e.start}–${e.end}`)
                      .join(" · ")
                  : "No fixed events reported."}
              </p>
              {plan.assumptions.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </details>
            <ol className={styles.timeline}>
              {plan.entries.map((entry) => (
                <li key={entry.id} data-kind={entry.kind}>
                  <time>
                    {clock(entry.start)}
                    <span>{clock(entry.end)}</span>
                  </time>
                  <div>
                    <small>
                      {entry.kind === "study"
                        ? "Focus"
                        : entry.kind === "activity"
                          ? "Training · your chosen activity"
                          : entry.kind === "fixed"
                            ? "Your event"
                            : entry.kind === "break"
                              ? "Break"
                              : "Breathing room"}
                    </small>
                    <h3>{entry.title}</h3>
                  </div>
                </li>
              ))}
            </ol>
            {!plan.entries.length && (
              <p>
                No work fits yet. Adjust the window or today’s priorities in
                chat.
              </p>
            )}
            {plan.deferred.length > 0 && (
              <details open>
                <summary>Set aside for now · {plan.deferred.length}</summary>
                {plan.deferred.map((item, i) => (
                  <p key={i}>
                    {item.title} — {item.reason}
                  </p>
                ))}
              </details>
            )}
            <button disabled={savingDay || approved || brain.thinking} onClick={approve}>
              {approved ? "Saved for today" : "Use this plan"}
            </button>
            {approved && (
              <button
                className={styles.secondary}
                onClick={() => downloadCalendar(false)}
              >
                Export focus blocks to Calendar
              </button>
            )}
            {approved &&
              plan.entries.some((entry) => entry.kind === "activity") && (
                <button
                  className={styles.secondary}
                  onClick={() => downloadCalendar(true)}
                >
                  Export focus + chosen training
                </button>
              )}
            {approved && (
              <p className={styles.muted}>
                Download .ics for manual import into Apple or Google Calendar.
                This does not create or update events in your account. Repeated
                imports can create duplicates.
              </p>
            )}
            <p className={styles.muted}>
              Change anything in the conversation above. Each revision is a new
              draft.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
