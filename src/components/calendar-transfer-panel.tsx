"use client";
import { useState } from "react";
import { addDays, dayAt } from "@/lib/scheduling";
import {
  readCalendarFile,
  replaceCalendar,
  type CalendarRead,
  type CalendarEvent,
} from "@/lib/calendar-transfer";
import type { PersonalWorkspace } from "@/lib/personal-workspace";
import styles from "./notion-daily-planner.module.css";
interface Props {
  state: PersonalWorkspace;
  save: (next: PersonalWorkspace) => Promise<PersonalWorkspace>;
  disabled: boolean;
}
export default function CalendarTransferPanel({
  state,
  save,
  disabled,
}: Props) {
  const [provider, setProvider] = useState<CalendarEvent["provider"]>("google"),
    [name, setName] = useState("School"),
    [preview, setPreview] = useState<CalendarRead | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false);
  async function read(file: File | undefined) {
    setPreview(null);
    setError("");
    setMessage("");
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Choose an .ics calendar under 2 MB.");
      return;
    }
    setLoading(true);
    try {
      const now = new Date(),
        next = readCalendarFile(
          await file.text(),
          name,
          provider,
          dayAt(now),
          addDays(dayAt(now), 30),
          now,
        );
      setPreview(next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The calendar could not be read.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function apply() {
    if (!preview) return;
    try {
      await save({
        ...state,
        calendars: replaceCalendar(state.calendars, preview),
      });
      setMessage(
        `${preview.id}: ${preview.events.length} busy events saved in this browser. Your previous timetable needs a fresh draft.`,
      );
      setPreview(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the calendar.");
    }
  }
  async function remove(id: string) {
    if (
      !confirm(
        "Stop using this imported calendar in Daylight? This does not change Google or Apple Calendar.",
      )
    )
      return;
    try {
      await save({
        ...state,
        calendars: {
          ...state.calendars,
          calendars: state.calendars.calendars.filter((c) => c.id !== id),
        },
      });
      setMessage("Calendar removed from this preview. Make a fresh day plan.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update calendars.");
    }
  }
  return (
    <section className={styles.panel} aria-labelledby="calendar-heading">
      <div className={styles.sectionTitle}>
        <h2 id="calendar-heading">Your calendars</h2>
        <span>Manual file transfer · live sync not connected</span>
      </div>
      <p>
        Bring school and home events together without retyping them. Imported
        events stay protected when Daylight plans your work.
      </p>
      {state.calendars.calendars.map((calendar) => (
        <div key={calendar.id} className={styles.calendarRow}>
          <div>
            <strong>{calendar.title ?? calendar.id}</strong>
            <p className={styles.muted}>
              {calendar.provider === "google"
                ? "Google"
                : calendar.provider === "apple"
                  ? "Apple"
                  : "Calendar"}{" "}
              · {calendar.events.length} busy events · read{" "}
              {new Date(calendar.readAt).toLocaleString()}
            </p>
            <p className={styles.muted}>
              Covers {new Date(calendar.rangeStart).toLocaleDateString()}{" "}
              through{" "}
              {new Date(Date.parse(calendar.rangeEnd) - 1).toLocaleDateString()}
              .{" "}
              {calendar.source === "google" || calendar.source === "icloud"
                ? "Refresh this saved read when source events change."
                : "Source edits need a new import."}
            </p>
          </div>
          <button
            className={styles.secondary}
            disabled={disabled}
            onClick={() => remove(calendar.id)}
          >
            Remove {calendar.title ?? calendar.id}
          </button>
        </div>
      ))}
      <details>
        <summary>Import an Apple or Google calendar file</summary>
        <p className={styles.muted}>
          Export a private .ics file from Google Calendar on a computer or Apple
          Calendar on a Mac. No public calendar link or account password is
          needed. Invitations, unknown timezones, or unsupported recurrences are
          rejected rather than silently treated as free time.
        </p>
        <div className={styles.formGrid}>
          <label>
            Calendar provider
            <select
              value={provider}
              onChange={(e) => {
                const next = e.target.value as CalendarEvent["provider"];
                setProvider(next);
                setName(
                  next === "apple"
                    ? "Home"
                    : next === "google"
                      ? "School"
                      : "Other",
                );
                setPreview(null);
              }}
            >
              <option value="google">Google Calendar</option>
              <option value="apple">Apple Calendar</option>
              <option value="other">Other .ics calendar</option>
            </select>
          </label>
          <label>
            Calendar name
            <input
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label>
            Calendar file
            <input
              aria-label="Calendar file"
              type="file"
              accept=".ics,text/calendar"
              disabled={disabled || loading || !name.trim()}
              onChange={(e) => {
                void read(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p>
          <a
            href="https://support.google.com/calendar/answer/37111"
            target="_blank"
            rel="noreferrer"
          >
            Google export instructions ↗
          </a>{" "}
          ·{" "}
          <a
            href="https://support.apple.com/guide/calendar/icl1023/mac"
            target="_blank"
            rel="noreferrer"
          >
            Apple export instructions ↗
          </a>
        </p>
      </details>
      {loading && <p role="status">Reading this calendar…</p>}
      {preview && (
        <div className={styles.calendarPreview}>
          <h3>
            Review {preview.id} · {preview.events.length} busy events
          </h3>
          {preview.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
          <ul>
            {preview.events.slice(0, 8).map((event) => (
              <li key={event.id}>
                {event.title} · {new Date(event.start).toLocaleString()} —{" "}
                {new Date(event.end).toLocaleString()}
                {event.allDay ? " · All day" : ""}
              </li>
            ))}
          </ul>
          {preview.events.length > 8 && (
            <p className={styles.muted}>
              {preview.events.length - 8} additional events in this 30-day
              window.
            </p>
          )}
          {!preview.events.length && (
            <p>
              No busy events were found in the next 30 days. This does not prove
              your account has no events; check that you exported the right
              calendar.
            </p>
          )}
          <button disabled={disabled} onClick={apply}>
            {state.calendars.calendars.some((c) => c.id === preview.id)
              ? "Replace saved " + preview.id
              : "Use these events"}
          </button>
          <button className={styles.secondary} onClick={() => setPreview(null)}>
            Cancel import
          </button>
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
