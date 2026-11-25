"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  useAccountWorkspace,
  accountAuthHeaders,
} from "./account-workspace-context";
import {
  calendarSnapshotSchema,
  replaceCalendar,
  type CalendarRead,
} from "@/lib/calendar-transfer";
import {
  googleCalendarRowSchema,
  googleEventDraftSchema,
  googleReceiptSchema,
  type GoogleCalendarRow,
  type GoogleEventDraft,
  type GoogleEventReceipt,
} from "@/lib/google-calendar-data";
import { calendarInstant } from "@/lib/calendar-timezone";
import { addDays, dayAt } from "@/lib/scheduling";
import type { PersonalWorkspace } from "@/lib/personal-workspace";
import styles from "./notion-daily-planner.module.css";
import css from "./google-calendar-panel.module.css";
import {
  stageGoogleCreate,
  resolveGoogleCreate,
} from "@/lib/google-calendar-recovery";
type Props = {
  state: PersonalWorkspace;
  save: (state: PersonalWorkspace) => Promise<PersonalWorkspace>;
  disabled: boolean;
};
type Review = {
  draft: GoogleEventDraft;
  target: GoogleEventReceipt | null;
  remove: boolean;
};
const localValue = (value: string) => {
  const d = new Date(value),
    pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export default function GoogleCalendarPanel({ state, save, disabled }: Props) {
  const { owner } = useAccountWorkspace();
  const [status, setStatus] = useState<{
      configured: boolean;
      connected: boolean;
      canWrite?: boolean;
      requiresSignIn?: boolean;
    } | null>(null),
    [calendars, setCalendars] = useState<GoogleCalendarRow[]>([]),
    [selected, setSelected] = useState(""),
    [preview, setPreview] = useState<CalendarRead | null>(null),
    [managed, setManaged] = useState<GoogleEventReceipt[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [form, setForm] = useState({ title: "", start: "", end: "" }),
    [target, setTarget] = useState<GoogleEventReceipt | null>(null),
    [review, setReview] = useState<Review | null>(null),
    [attemptedRequest, setAttemptedRequest] = useState<string | null>(null),
    [lastReceipt, setLastReceipt] = useState<GoogleEventReceipt | null>(null);
  const active = useRef(false),
    live = useRef(true),
    requestController = useRef<AbortController | null>(null),
    latestState = useRef(state);
  latestState.current = state;
  async function call(body?: unknown) {
    const controller = requestController.current;
    const headers = await accountAuthHeaders(owner);
    if (!live.current || controller?.signal.aborted)
      throw Error(
        "Your workspace changed. Reopen the current calendar connection.",
      );
    const response = await fetch("/api/google-calendar", {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: controller
        ? AbortSignal.any([controller.signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
    const data = await response.json();
    if (!live.current || controller?.signal.aborted)
      throw Error(
        "Your workspace changed. Reopen the current calendar connection.",
      );
    if (!response.ok)
      throw new Error(
        data.error ?? "Google Calendar could not finish this request.",
      );
    return data;
  }
  useEffect(() => {
    live.current = true;
    requestController.current = new AbortController();
    void call()
      .then((data) => {
        if (live.current) setStatus(data);
      })
      .catch((e) => {
        if (live.current) setError((e as Error).message);
      });
    return () => {
      live.current = false;
      requestController.current?.abort();
    };
  }, [owner]);
  async function run(action: () => Promise<void>) {
    if (active.current || disabled) return;
    active.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      if (live.current) setError((e as Error).message);
    } finally {
      active.current = false;
      if (live.current) setBusy(false);
    }
  }
  async function invalidateSavedReads(proposal: Review) {
    if (!live.current || requestController.current?.signal.aborted)
      throw Error(
        "Your workspace changed. Refresh the calendar in the current account.",
      );
    const current = latestState.current,
      calendars =
        proposal.target || proposal.remove
          ? {
              ...current.calendars,
              calendars: current.calendars.calendars.map((c) =>
                c.id.startsWith("google-live:")
                  ? { ...c, needsRefresh: true }
                  : c,
              ),
            }
          : stageGoogleCreate(current.calendars, {
              owner,
              draft: proposal.draft,
              calendarTitle: calendarsForReview(proposal.draft.calendarId),
              attemptedAt: new Date().toISOString(),
            });
    latestState.current = await save({
      ...current,
      calendars,
    });
    setPreview(null);
  }
  function calendarsForReview(id: string) {
    return (
      calendars.find((row) => row.id === id)?.title ??
      latestState.current.calendars.pendingGoogleCreates?.find(
        (row) => row.draft.calendarId === id,
      )?.calendarTitle ??
      "Selected Google calendar"
    );
  }
  function prepare(
    remove = false,
    receipt: GoogleEventReceipt | null = target,
  ) {
    try {
      if (!selected) throw Error("Choose a calendar first.");
      const resolve = (value: string) => {
        const [date, time] = value.split("T");
        if (!date || !time) throw Error("Choose the event start and end.");
        return calendarInstant(
          date,
          time.length === 5 ? time + ":00" : time,
          Intl.DateTimeFormat().resolvedOptions().timeZone,
        );
      };
      const draft = googleEventDraftSchema.parse({
        calendarId: receipt?.calendarId ?? selected,
        requestId: crypto.randomUUID(),
        title: remove && receipt ? receipt.title : form.title,
        start: remove && receipt ? receipt.start : resolve(form.start),
        end: remove && receipt ? receipt.end : resolve(form.end),
      });
      setReview({ draft, target: receipt, remove });
      setAttemptedRequest(null);
      setError("");
      setLastReceipt(null);
    } catch (e) {
      setError(
        e instanceof z.ZodError ? e.issues[0].message : (e as Error).message,
      );
    }
  }
  const locked = busy || disabled,
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <section
      className={`${styles.panel} ${css.panel}`}
      style={{ marginTop: 24 }}
      aria-label="Live Google Calendar"
    >
      <div className={styles.sectionTitle}>
        <h2>Google Calendar</h2>
        <span>
          {status?.connected ? "Connected to this browser" : "Live connection"}
        </span>
      </div>
      {!status && !error && <p>Checking connection…</p>}
      {status && !status.configured && (
        <p>
          Google Calendar needs one-time setup on this deployment. You can use
          calendar file import while that is being configured.
        </p>
      )}
      {status?.requiresSignIn && (
        <p>
          <a href="/">Sign in to Daylight</a> to connect your calendar on this
          hosted app.
        </p>
      )}
      {status?.configured && !status.requiresSignIn && !status.connected && (
        <>
          <p>
            Start with read-only access. You choose which calendars to bring
            into your plan.
          </p>
          <button
            disabled={locked}
            onClick={() =>
              void run(async () => {
                const data = await call({ op: "connect", write: false });
                const url = new URL(data.url);
                if (url.origin !== "https://accounts.google.com")
                  throw Error("Unexpected sign-in destination.");
                location.assign(url.href);
              })
            }
          >
            Connect Google Calendar
          </button>
        </>
      )}
      {status?.connected && (
        <>
          <p className={styles.muted}>
            {status.canWrite
              ? "Event editing is enabled. Every create, update or deletion requires review."
              : "Read-only connection. Enable event editing separately when you want Daylight to create events."}
          </p>
          <button
            disabled={locked || !!review}
            onClick={() =>
              void run(async () => {
                const data = await call({ op: "calendars" }),
                  rows = z.array(googleCalendarRowSchema).parse(data.calendars);
                setCalendars(rows);
                if (!rows.some((r) => r.id === selected)) {
                  setSelected("");
                  setManaged([]);
                  setPreview(null);
                }
              })
            }
          >
            Choose or refresh calendars
          </button>
          {!status.canWrite && (
            <button
              disabled={locked || !!review}
              onClick={() =>
                void run(async () => {
                  const data = await call({ op: "connect", write: true });
                  const url = new URL(data.url);
                  if (url.origin !== "https://accounts.google.com")
                    throw Error("Unexpected sign-in destination.");
                  location.assign(url.href);
                })
              }
            >
              Enable event editing
            </button>
          )}
          <button
            disabled={locked || !!review}
            onClick={() =>
              void run(async () => {
                await call({ op: "disconnect" });
                setStatus({ configured: true, connected: false });
                setManaged([]);
                setPreview(null);
                setMessage(
                  "Disconnected this browser. Saved snapshots remain; remove them separately if you no longer want them. You can also revoke Daylight in your Google account.",
                );
              })
            }
          >
            Disconnect this browser
          </button>
          {!!calendars.length && (
            <>
              <label className={css.field}>
                Google calendar to use
                <select
                  value={selected}
                  disabled={locked || !!review}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setPreview(null);
                    setManaged([]);
                    setTarget(null);
                  }}
                >
                  <option value="">Choose a calendar</option>
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} · {c.accessRole}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={locked || !selected || !!review}
                onClick={() =>
                  void run(async () => {
                    const from = dayAt(new Date()),
                      data = await call({
                        op: "read",
                        calendarId: selected,
                        from: from.toISOString(),
                        to: addDays(from, 30).toISOString(),
                      }),
                      snapshot = calendarSnapshotSchema.parse({
                        version: 1,
                        calendars: [data.calendar],
                      }).calendars[0];
                    setPreview(snapshot);
                    setManaged(
                      z.array(googleReceiptSchema).parse(data.calendar.managed),
                    );
                    setMessage(
                      "Read from Google. Review the dates below before using this snapshot in your planner.",
                    );
                  })
                }
              >
                Read next 30 days
              </button>
            </>
          )}
          {preview && (
            <div>
              <h3>Review Google events</h3>
              <p>
                {preview.events.length} busy events · read{" "}
                {new Date(preview.readAt).toLocaleString()}
              </p>
              <p className={styles.muted}>
                Recurring events are expanded by Google. Free/declined events
                are omitted. Refresh to pick up changes made elsewhere.
              </p>
              <ul>
                {preview.events.slice(0, 10).map((e) => (
                  <li key={e.id}>
                    {e.title} · {new Date(e.start).toLocaleString()}–
                    {new Date(e.end).toLocaleString()}
                  </li>
                ))}
              </ul>
              {preview.events.length > 10 && (
                <p>
                  Showing the first 10. All {preview.events.length} busy events
                  will be used.
                </p>
              )}
              <button
                disabled={locked}
                onClick={async () => {
                  try {
                    await save({
                      ...state,
                      calendars: replaceCalendar(state.calendars, preview),
                    });
                    setPreview(null);
                    setMessage(
                      "Google events are saved in this browser for planning. Your timetable needs a fresh review.",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Use these Google events in my plan
              </button>
            </div>
          )}
          {status.canWrite &&
            selected &&
            ["writer", "owner"].includes(
              calendars.find((c) => c.id === selected)?.accessRole ?? "",
            ) && (
              <section>
                <h3>{target ? "Update a Daylight event" : "Add an event"}</h3>
                <p className={styles.muted}>
                  Times are entered in {zone}. This creates a single event
                  without invitations or attendees.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    prepare();
                  }}
                >
                  <div className={styles.formGrid}>
                    <label>
                      Event title
                      <input
                        required
                        maxLength={300}
                        disabled={locked || !!review}
                        value={form.title}
                        onChange={(e) =>
                          setForm({ ...form, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Event starts
                      <input
                        required
                        type="datetime-local"
                        disabled={locked || !!review}
                        value={form.start}
                        onChange={(e) =>
                          setForm({ ...form, start: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Event ends
                      <input
                        required
                        type="datetime-local"
                        disabled={locked || !!review}
                        value={form.end}
                        onChange={(e) =>
                          setForm({ ...form, end: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <button disabled={locked || !!review}>Review event</button>
                  {target && (
                    <button
                      type="button"
                      disabled={locked || !!review}
                      onClick={() => {
                        setTarget(null);
                        setForm({ title: "", start: "", end: "" });
                      }}
                    >
                      Cancel editing
                    </button>
                  )}
                </form>
              </section>
            )}
          {!!managed.length && (
            <section>
              <h3>Daylight events in this range</h3>
              {managed.map((event) => (
                <article key={event.id}>
                  <p>
                    <strong>{event.title}</strong> ·{" "}
                    {new Date(event.start).toLocaleString()}
                  </p>
                  {status.canWrite && (
                    <>
                      <button
                        disabled={locked || !!review}
                        onClick={() => {
                          setTarget(event);
                          setForm({
                            title: event.title,
                            start: localValue(event.start),
                            end: localValue(event.end),
                          });
                          setLastReceipt(null);
                        }}
                      >
                        Edit {event.title}
                      </button>
                      <button
                        disabled={locked || !!review}
                        onClick={() => prepare(true, event)}
                      >
                        Review deletion of {event.title}
                      </button>
                    </>
                  )}
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {(state.calendars.pendingGoogleCreates ?? []).filter(
        (row) => row.owner === owner,
      ).length > 0 && (
        <section aria-label="Unfinished Google event requests">
          <h3>Check an unfinished event request</h3>
          <p>
            The result of these attempts is unconfirmed. They may already exist
            in Google. Reopen the same review to check or retry without a new
            request ID. Nothing is sent automatically.
          </p>
          {(state.calendars.pendingGoogleCreates ?? [])
            .filter((row) => row.owner === owner)
            .map((row) => (
              <article key={row.draft.requestId}>
                <p>
                  <strong>{row.draft.title}</strong> · {row.calendarTitle}
                  <br />
                  {new Date(row.draft.start).toLocaleString()}
                </p>
                <button
                  disabled={
                    locked || !!review || !status?.connected || !status.canWrite
                  }
                  onClick={() =>
                    void run(async () => {
                      const data = await call({ op: "calendars" });
                      const rows = z
                        .array(googleCalendarRowSchema)
                        .parse(data.calendars);
                      const calendar = rows.find(
                        (calendar) => calendar.id === row.draft.calendarId,
                      );
                      if (
                        !calendar ||
                        !["owner", "writer"].includes(calendar.accessRole)
                      )
                        throw Error(
                          "The saved request's calendar is not currently writable. Check the connected Google account before retrying.",
                        );
                      setCalendars(rows);
                      setSelected(row.draft.calendarId);
                      setReview({
                        draft: row.draft,
                        target: null,
                        remove: false,
                      });
                      setAttemptedRequest(row.draft.requestId);
                      setLastReceipt(null);
                      setError("");
                    })
                  }
                >
                  Review unfinished event: {row.draft.title}
                </button>
              </article>
            ))}
          {!status?.canWrite && (
            <p>
              Connect Google with event editing enabled before reviewing a
              retry.
            </p>
          )}
        </section>
      )}
      {review && (
        <section aria-label="Review Google Calendar action">
          <h3>
            {review.remove
              ? "Delete this Google event?"
              : review.target
                ? "Review event update"
                : "Review new Google event"}
          </h3>
          <p>
            <strong>{review.draft.title}</strong>
          </p>
          <p>
            {new Date(review.draft.start).toLocaleString()}–
            {new Date(review.draft.end).toLocaleString()} ({zone})
          </p>
          <p>{calendarsForReview(review.draft.calendarId)}</p>
          <p className={styles.muted}>
            {review.remove
              ? "Deletion removes this event from Google Calendar after confirmation."
              : "Google must confirm the action before Daylight marks it saved. If a request fails, retry this same proposal to avoid duplicates."}
          </p>
          <p className={styles.muted}>
            Your saved Google calendar reads will need a refresh after this
            attempt, including if its final confirmation is lost.
          </p>
          <button
            disabled={locked}
            onClick={() =>
              void run(async () => {
                await invalidateSavedReads(review);
                setAttemptedRequest(review.draft.requestId);
                const data = await call({
                    op: review.remove
                      ? "delete"
                      : review.target
                        ? "update"
                        : "create",
                    draft: review.draft,
                    approved: true,
                    ...(review.target
                      ? { id: review.target.id, etag: review.target.etag }
                      : {}),
                    ...(review.remove ? { confirmDelete: true } : {}),
                  }),
                  receipt = googleReceiptSchema.parse(data.receipt);
                if (!review.target && !review.remove) {
                  const current = latestState.current;
                  latestState.current = await save({
                    ...current,
                    calendars: resolveGoogleCreate(
                      current.calendars,
                      owner,
                      review.draft.requestId,
                      receipt,
                    ),
                  });
                }
                setLastReceipt(receipt);
                setManaged((previous) =>
                  receipt.outcome === "deleted"
                    ? previous.filter((e) => e.id !== receipt.id)
                    : [...previous.filter((e) => e.id !== receipt.id), receipt],
                );
                setReview(null);
                setAttemptedRequest(null);
                setTarget(null);
                setForm({ title: "", start: "", end: "" });
                setMessage(
                  "Google confirmed the event " +
                    (receipt.outcome === "deleted"
                      ? "deletion"
                      : receipt.outcome === "updated"
                        ? "update"
                        : receipt.outcome === "existing"
                          ? "already exists"
                          : "creation") +
                    ". Read and review the calendar again before replanning.",
                );
              })
            }
          >
            {review.remove
              ? "Confirm deletion in Google Calendar"
              : "Save reviewed event to Google Calendar"}
          </button>
          <button disabled={locked} onClick={() => setReview(null)}>
            {attemptedRequest === review.draft.requestId
              ? "Close review; outcome still unconfirmed"
              : "Keep Google Calendar unchanged"}
          </button>
        </section>
      )}
      {lastReceipt && (
        <p role="status">
          Google confirmation: {lastReceipt.outcome} · {lastReceipt.title}
          {lastReceipt.url && lastReceipt.outcome !== "deleted" && (
            <>
              {" "}
              ·{" "}
              <a href={lastReceipt.url} target="_blank" rel="noreferrer">
                Open event ↗
              </a>
            </>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
