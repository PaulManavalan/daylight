"use client";
import { useEffect, useState } from "react";
import {
  notionDayContextSchema,
  type NotionDayContext,
} from "@/lib/notion-day-model";
import styles from "./notion-daily-planner.module.css";
interface Props {
  known: NotionDayContext;
  disabled: boolean;
  onDraft: (context: NotionDayContext) => void;
}
export default function DayDetailsReview({ known, disabled, onDraft }: Props) {
  const [value, setValue] = useState(known),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setValue(known);
    setConfirmed(false);
    setError("");
  }, [known]);
  function draft() {
    const parsed = notionDayContextSchema.safeParse({
      ...value,
      eventsDiscussed: confirmed,
      extrasDiscussed: confirmed,
    });
    if (!parsed.success || !confirmed || !value.start || !value.finish) {
      setError(
        "Confirm your day and enter a start and finish time. Every additional event needs a title and both times.",
      );
      return;
    }
    setError("");
    onDraft(parsed.data);
  }
  return (
    <details className={styles.connection}>
      <summary>Review day details or plan without AI</summary>
      <p className={styles.muted}>
        Optional: correct the facts directly or create a draft if chat is
        unavailable. Imported calendar events are already protected; add only
        other commitments here.
      </p>
      <fieldset disabled={disabled}>
        <legend>Your available window</legend>
        <div className={styles.formGrid}>
          <label>
            Available from
            <input
              aria-label="Available from"
              type="time"
              required
              value={value.start ?? ""}
              onChange={(e) => {
                setConfirmed(false);
                setValue({ ...value, start: e.target.value || null });
              }}
            />
          </label>
          <label>
            Finish by
            <input
              aria-label="Finish by"
              type="time"
              required
              value={value.finish ?? ""}
              onChange={(e) => {
                setConfirmed(false);
                setValue({ ...value, finish: e.target.value || null });
              }}
            />
          </label>
        </div>
        <h3>Other fixed events</h3>
        {value.events.map((event, index) => (
          <div className={styles.formGrid} key={index}>
            <label>
              Event name
              <input
                aria-label={"Event " + (index + 1) + " name"}
                maxLength={100}
                value={event.title}
                onChange={(e) => {
                  setConfirmed(false);
                  setValue({
                    ...value,
                    events: value.events.map((v, i) =>
                      i === index ? { ...v, title: e.target.value } : v,
                    ),
                  });
                }}
              />
            </label>
            <label>
              Starts
              <input
                type="time"
                aria-label={"Event " + (index + 1) + " start"}
                value={event.start}
                onChange={(e) => {
                  setConfirmed(false);
                  setValue({
                    ...value,
                    events: value.events.map((v, i) =>
                      i === index ? { ...v, start: e.target.value } : v,
                    ),
                  });
                }}
              />
            </label>
            <label>
              Ends
              <input
                type="time"
                aria-label={"Event " + (index + 1) + " end"}
                value={event.end}
                onChange={(e) => {
                  setConfirmed(false);
                  setValue({
                    ...value,
                    events: value.events.map((v, i) =>
                      i === index ? { ...v, end: e.target.value } : v,
                    ),
                  });
                }}
              />
            </label>
            <button
              className={styles.secondary}
              onClick={() => {
                setConfirmed(false);
                setValue({
                  ...value,
                  events: value.events.filter((_, i) => i !== index),
                });
              }}
            >
              Remove event {index + 1}
            </button>
          </div>
        ))}
        <button
          className={styles.secondary}
          disabled={value.events.length >= 15}
          onClick={() => {
            setConfirmed(false);
            setValue({
              ...value,
              events: [...value.events, { title: "", start: "", end: "" }],
            });
          }}
        >
          Add another event
        </button>
        <h3>Other things you want to do</h3>
        {value.extras.map((extra, index) => (
          <div className={styles.formGrid} key={index}>
            <label>
              Activity
              <input
                aria-label={"Activity " + (index + 1)}
                maxLength={200}
                value={extra.title}
                onChange={(e) => {
                  setConfirmed(false);
                  setValue({
                    ...value,
                    extras: value.extras.map((v, i) =>
                      i === index ? { ...v, title: e.target.value } : v,
                    ),
                  });
                }}
              />
            </label>
            <label>
              Minutes (optional)
              <input
                aria-label={"Activity " + (index + 1) + " minutes"}
                type="number"
                min={5}
                max={240}
                value={extra.minutes ?? ""}
                onChange={(e) => {
                  setConfirmed(false);
                  setValue({
                    ...value,
                    extras: value.extras.map((v, i) =>
                      i === index
                        ? {
                            ...v,
                            minutes: e.target.value
                              ? Number(e.target.value)
                              : null,
                          }
                        : v,
                    ),
                  });
                }}
              />
            </label>
            <button
              className={styles.secondary}
              onClick={() => {
                setConfirmed(false);
                setValue({
                  ...value,
                  extras: value.extras.filter((_, i) => i !== index),
                });
              }}
            >
              Remove activity {index + 1}
            </button>
          </div>
        ))}
        <button
          className={styles.secondary}
          disabled={value.extras.length >= 10}
          onClick={() => {
            setConfirmed(false);
            setValue({
              ...value,
              extras: [...value.extras, { title: "", minutes: null }],
            });
          }}
        >
          Add another activity
        </button>
        <p className={styles.muted}>
          Work in your Notion list stays selected. Unknown activity durations
          use a visibly suggested focus block; you can revise it.
        </p>
        <div className={styles.topicChoices}>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            These include today’s events and other activities I want to plan
            around.
          </label>
        </div>
        <button disabled={!confirmed} onClick={draft}>
          Create draft from these details
        </button>
      </fieldset>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </details>
  );
}
