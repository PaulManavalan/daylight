"use client";
import { useEffect, useRef, useState } from "react";
import { Cloud } from "lucide-react";
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
  icloudCalendarRowSchema,
  type ICloudCalendarRow,
} from "@/lib/icloud-calendar-data";
import { addDays, dateKey } from "@/lib/scheduling";
import { calendarInstant } from "@/lib/calendar-timezone";
import type { PersonalWorkspace } from "@/lib/personal-workspace";
import styles from "./notion-daily-planner.module.css";
type Props = {
  state: PersonalWorkspace;
  save: (state: PersonalWorkspace) => Promise<PersonalWorkspace>;
  disabled: boolean;
};
const statusSchema = z.object({
  configured: z.boolean(),
  connected: z.boolean(),
  canWrite: z.boolean().optional(),
});
export default function ICloudCalendarPanel({ state, save, disabled }: Props) {
  const { owner } = useAccountWorkspace();
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(
      null,
    ),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [calendars, setCalendars] = useState<ICloudCalendarRow[]>([]),
    [selected, setSelected] = useState(""),
    [from, setFrom] = useState(""),
    [through, setThrough] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{
    calendar: CalendarRead;
    expected: string;
    zone: string;
  } | null>(null);
  const active = useRef(false),
    epoch = useRef(0),
    controller = useRef<AbortController | null>(null),
    latest = useRef(state);
  latest.current = state;
  async function call(body?: unknown) {
    const version = epoch.current,
      signal = controller.current?.signal;
    const response = await fetch("/api/icloud-calendar", {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(await accountAuthHeaders(owner)),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
    const data = await response.json();
    if (version !== epoch.current)
      throw Error(
        "The workspace changed while iCloud was answering. Try again in the current account.",
      );
    if (!response.ok) {
      if (response.status === 401) {
        setStatus((previous) =>
          previous ? { ...previous, connected: false } : previous,
        );
        setPreview(null);
        setCalendars([]);
      }
      throw Error(
        data.error ?? "iCloud Calendar could not finish this request.",
      );
    }
    return data;
  }
  useEffect(() => {
    epoch.current++;
    active.current = false;
    setBusy(false);
    controller.current = new AbortController();
    setStatus(null);
    setCalendars([]);
    setSelected("");
    setPreview(null);
    setPassword("");
    setEmail("");
    setError("");
    setMessage("");
    const now = new Date();
    setFrom(dateKey(now));
    setThrough(dateKey(addDays(now, 6)));
    const version = epoch.current;
    void call()
      .then((data) => {
        if (version === epoch.current) setStatus(statusSchema.parse(data));
      })
      .catch((error) => {
        if (version === epoch.current && !controller.current?.signal.aborted)
          setError(error.message);
      });
    return () => {
      epoch.current++;
      controller.current?.abort();
    };
  }, [owner]);
  async function run(action: () => Promise<void>) {
    if (active.current || disabled) return;
    active.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const version = epoch.current;
    try {
      await action();
    } catch (error) {
      if (version === epoch.current) setError((error as Error).message);
    } finally {
      if (version === epoch.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  const locked = disabled || busy;
  return (
    <section
      className={styles.panel}
      style={{ marginTop: 24 }}
      aria-label="iCloud Calendar connection"
      id="icloud-calendar"
    >
      <div className={styles.sectionTitle}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Cloud size={22} aria-hidden="true" />
          iCloud Calendar
        </h2>
        <span>
          {status?.connected
            ? "Connected · read access"
            : status?.configured
              ? "Ready to connect"
              : "Setup needed"}
        </span>
      </div>
      <p>
        Bring your Apple home calendars into the same day plan as school and
        homework. Read a window, review the events, then choose whether to use
        that saved read.
      </p>
      {!status?.configured && (
        <p className={styles.muted}>
          This deployment needs its secure iCloud connection setup before
          sign-in is available. You can continue using calendar-file imports.
        </p>
      )}
      {status?.configured && !status.connected && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              try {
                const data = await call({
                  op: "connect",
                  email: email.trim(),
                  appPassword: password.trim(),
                });
                setCalendars(
                  z
                    .array(icloudCalendarRowSchema)
                    .max(100)
                    .parse(data.calendars),
                );
                setStatus({
                  configured: true,
                  connected: true,
                  canWrite: false,
                });
                setMessage(
                  "Connected to iCloud. Choose which calendar to read.",
                );
              } finally {
                setPassword("");
              }
            });
          }}
        >
          <p>
            Use an{" "}
            <a
              href="https://support.apple.com/en-us/102654"
              target="_blank"
              rel="noreferrer"
            >
              Apple app-specific password ↗
            </a>
            , not your main Apple Account password. The connection credential is
            stored encrypted for this browser and is excluded from planner
            backups.
          </p>
          <div className={styles.formGrid}>
            <label>
              Apple Account email
              <input
                aria-label="iCloud account email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
                disabled={locked}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              App-specific password
              <input
                aria-label="iCloud app-specific password"
                type="password"
                autoComplete="off"
                required
                maxLength={19}
                placeholder="abcd-efgh-ijkl-mnop"
                disabled={locked}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
          <button disabled={locked}>
            {busy ? "Connecting…" : "Connect iCloud Calendar"}
          </button>
        </form>
      )}
      {status?.connected && (
        <>
          <p className={styles.muted}>
            Calendar reads are enabled. Creating or changing iCloud events is
            not enabled here yet. Disconnecting here keeps previously saved
            reads; revoke the app-specific password at Apple to revoke its
            access.
          </p>
          <button
            className={styles.secondary}
            disabled={locked}
            onClick={() =>
              void run(async () => {
                const data = await call({ op: "calendars" });
                setCalendars(
                  z
                    .array(icloudCalendarRowSchema)
                    .max(100)
                    .parse(data.calendars),
                );
                setPreview(null);
              })
            }
          >
            Refresh iCloud calendar list
          </button>
          <button
            className={styles.secondary}
            disabled={locked}
            onClick={() =>
              void run(async () => {
                await call({ op: "disconnect" });
                setStatus({ configured: true, connected: false });
                setCalendars([]);
                setSelected("");
                setPreview(null);
                setMessage(
                  "Disconnected in this browser. Previously saved calendar reads remain in your planner.",
                );
              })
            }
          >
            Disconnect iCloud in this browser
          </button>
          <div className={styles.formGrid}>
            <label>
              Calendar
              <select
                aria-label="iCloud calendar"
                disabled={locked}
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value);
                  setPreview(null);
                }}
              >
                <option value="">Choose an iCloud calendar</option>
                {calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Read from
              <input
                aria-label="iCloud read from"
                type="date"
                disabled={locked}
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
            <label>
              Read through
              <input
                aria-label="iCloud read through"
                type="date"
                disabled={locked}
                value={through}
                onChange={(event) => {
                  setThrough(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
          </div>
          <button
            disabled={locked || !selected || !from || !through}
            onClick={() =>
              void run(async () => {
                const zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
                  end = dateKey(addDays(new Date(through + "T12:00:00"), 1));
                const data = await call({
                  op: "read",
                  calendarId: selected,
                  from: calendarInstant(from, "00:00:00", zone),
                  to: calendarInstant(end, "00:00:00", zone),
                  displayTimeZone: zone,
                });
                const calendar = calendarSnapshotSchema.parse({
                  version: 1,
                  calendars: [data.calendar],
                }).calendars[0];
                if (
                  calendar.source !== "icloud" ||
                  !calendar.id.startsWith("icloud-live:")
                )
                  throw Error(
                    "iCloud returned an unexpected snapshot. Your saved calendars are kept.",
                  );
                setPreview({
                  calendar,
                  expected: JSON.stringify(latest.current.calendars),
                  zone,
                });
              })
            }
          >
            Read selected iCloud calendar
          </button>
        </>
      )}
      {preview && (
        <section
          className={styles.calendarPreview}
          aria-label="Review iCloud calendar read"
        >
          <h3>
            {preview.calendar.title ?? "iCloud calendar"} ·{" "}
            {preview.calendar.events.length} events
          </h3>
          <p>
            Read from iCloud at{" "}
            {new Date(preview.calendar.readAt).toLocaleString()}. Display
            timezone: {preview.zone}. This is a saved read, not continuous
            background sync.
          </p>
          <ol>
            {preview.calendar.events.slice(0, 10).map((event) => (
              <li key={event.id}>
                {event.title} · {event.allDay ? "All day · " : ""}
                {new Date(event.start).toLocaleString()}–
                {new Date(event.end).toLocaleString()}
              </li>
            ))}
          </ol>
          {preview.calendar.events.length > 10 && (
            <p>
              {preview.calendar.events.length - 10} more events are included in
              this read.
            </p>
          )}
          {preview.calendar.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
          <button
            disabled={locked}
            onClick={() =>
              void run(async () => {
                if (
                  JSON.stringify(latest.current.calendars) !== preview.expected
                )
                  throw Error(
                    "Your saved calendars changed after this read. Review a fresh iCloud read before replacing one.",
                  );
                const version = epoch.current;
                await save({
                  ...latest.current,
                  calendars: replaceCalendar(
                    latest.current.calendars,
                    preview.calendar,
                  ),
                });
                if (version !== epoch.current) return;
                setPreview(null);
                setMessage(
                  "Your reviewed iCloud events now protect time in Daylight. Make a fresh daily draft to use them.",
                );
              })
            }
          >
            Use reviewed iCloud events
          </button>
          <button
            className={styles.secondary}
            disabled={locked}
            onClick={() => setPreview(null)}
          >
            Keep existing calendars
          </button>
        </section>
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
