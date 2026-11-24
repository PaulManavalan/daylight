"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  SatStore,
  satKey,
  satStateSchema,
  defaultSat,
  type SatState,
} from "@/lib/sat";
import { useAccountWorkspace } from "./account-workspace-context";
import {
  choosePractice,
  gradeAttempt,
  practiceQuestions,
  practiceSummary,
  type PracticeQuestion,
  type PracticeAttempt,
} from "@/lib/sat-practice";
import { dateKey } from "@/lib/scheduling";
import styles from "./notion-daily-planner.module.css";
import css from "./sat-practice-workspace.module.css";
import SatDayReviewPlanner from "./sat-day-review-planner";

export default function SatPracticeWorkspace() {
  const { account } = useAccountWorkspace();
  const [loaded, setLoaded] = useState<{
      state: SatState;
      raw: string | null;
      sequence?: number;
    } | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [skill, setSkill] = useState("all"),
    [questions, setQuestions] = useState<PracticeQuestion[]>([]),
    [index, setIndex] = useState(0),
    [choice, setChoice] = useState<number | null>(null),
    [answer, setAnswer] = useState<PracticeAttempt | null>(null),
    [seconds, setSeconds] = useState(0),
    [timed, setTimed] = useState(false);
  const started = useRef(0);
  const seenSequence = useRef(-1),
    saving = useRef(false);
  useEffect(() => {
    function load() {
      try {
        if (account) {
          const entry = account.document("sat");
          if (entry.sequence === seenSequence.current) return;
          seenSequence.current = entry.sequence;
          setLoaded({
            state:
              entry.payload === null
                ? defaultSat()
                : satStateSchema.parse(entry.payload),
            raw: null,
            sequence: entry.sequence,
          });
        } else setLoaded(new SatStore(localStorage, "local-demo").load());
        setError("");
      } catch (e) {
        setError((e as Error).message);
      }
    }
    load();
    if (account) return account.subscribe(load);
    const listener = (e: StorageEvent) => {
      if (e.key === satKey("local-demo") || e.key === null) {
        load();
        setNotice("SAT records updated from another tab.");
      }
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [account]);
  useEffect(() => {
    if (!questions.length || answer) return;
    const timer = setInterval(
      () =>
        setSeconds(
          Math.min(
            86400,
            Math.max(0, Math.floor((Date.now() - started.current) / 1000)),
          ),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [questions, index, answer]);
  async function save(state: SatState) {
    if (!loaded) return false;
    if (saving.current) return false;
    saving.current = true;
    try {
      if (account) {
        const entry = await account.update(
          "sat",
          satStateSchema.parse(state),
          loaded.sequence ?? 0,
        );
        seenSequence.current = entry.sequence;
        setLoaded({
          state: satStateSchema.parse(entry.payload),
          raw: null,
          sequence: entry.sequence,
        });
        setError("");
        return true;
      }
      const raw = new SatStore(localStorage, "local-demo").save(
        state,
        loaded.raw,
      );
      setLoaded({ state, raw });
      setError("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      saving.current = false;
    }
  }
  function start() {
    if (!loaded) return;
    setQuestions(choosePractice(loaded.state.attempts, skill));
    setIndex(0);
    setAnswer(null);
    setChoice(null);
    setSeconds(0);
    started.current = Date.now();
    setNotice("");
  }
  const question = questions[index],
    finished = questions.length > 0 && index >= questions.length;
  async function submit() {
    if (!loaded || !question || choice === null || answer) return;
    const attempt: PracticeAttempt = {
      id: crypto.randomUUID(),
      questionId: question.id,
      date: new Date().toISOString(),
      choice,
      seconds: Math.min(
        86400,
        Math.max(0, Math.floor((Date.now() - started.current) / 1000)),
      ),
    };
    if (
      await save({
        ...loaded.state,
        attempts: [...loaded.state.attempts, attempt],
      })
    )
      setAnswer(attempt);
  }
  async function addError() {
    if (!loaded || !question || !answer) return;
    const note = `Daylight original ${question.id}. I chose ${question.choices[answer.choice]}. Correct answer: ${question.choices[question.answer]}. ${question.explanation}`;
    if (loaded.state.errors.some((e) => e.note === note)) {
      setNotice("This mistake is already in your review log.");
      return;
    }
    if (
      await save({
        ...loaded.state,
        errors: [
          {
            id: crypto.randomUUID(),
            date: dateKey(new Date()),
            section: question.section,
            topic: question.skill,
            note,
            reviewed: false,
          },
          ...loaded.state.errors,
        ],
      })
    )
      setNotice("Added to your SAT error log.");
  }
  function exportRecords() {
    if (!loaded) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(loaded.state, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "daylight-sat-records.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.logo} href="/day">
          Daylight <span>/ SAT</span>
        </Link>
        <nav className={styles.nav}>
          <Link href="/day">Daily planner</Link>
          <Link href="/">Full workspace & score log ↗</Link>
        </nav>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>A LITTLE PRACTICE, WITH A PURPOSE</p>
        <h1>
          Make the next question <em>count.</em>
        </h1>
        <p>
          Work through a short set, understand the reasoning, then revisit what
          needs attention. Your target: {loaded?.state.goal ?? 1550}.
        </p>
      </section>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loaded && <SatDayReviewPlanner state={loaded.state} onSave={save} />}
      {!loaded ? (
        <p>
          Your saved records are kept intact.{" "}
          {error
            ? "Reload after recovering your SAT workspace."
            : "Loading SAT practice…"}
        </p>
      ) : (
        <div className={css.layout}>
          <section className={styles.panel} aria-label="Question practice">
            <div className={styles.sectionTitle}>
              <h2>Practice studio</h2>
              <span>Original Daylight questions</span>
            </div>
            <p className={styles.muted}>
              A starter collection of {practiceQuestions.length} questions, not
              an official test or a score prediction. New questions come first,
              followed by previously missed questions. Repeats are included when
              the small collection runs out.
            </p>
            {!questions.length || finished ? (
              <>
                <label className={css.field}>
                  Practice skill
                  <select
                    value={skill}
                    onChange={(e) => setSkill(e.target.value)}
                  >
                    <option value="all">Mixed practice</option>
                    {[...new Set(practiceQuestions.map((q) => q.skill))].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </label>
                <label className={css.check}>
                  <input
                    type="checkbox"
                    checked={timed}
                    onChange={(e) => setTimed(e.target.checked)}
                  />
                  Show elapsed time
                </label>
                <p className={styles.muted}>
                  Timing includes time away from this tab. There is no forced
                  cutoff. Submitted answers save immediately; an unfinished
                  question is not recorded.
                </p>
                {finished && (
                  <p role="status">
                    Set complete. Your submitted answers are saved below.
                  </p>
                )}
                <button onClick={start}>Start practice set</button>
              </>
            ) : (
              <>
                <p className={styles.eyebrow}>
                  Question {index + 1} of {questions.length} · {question.skill}
                </p>
                {timed && (
                  <p aria-label="Elapsed time">
                    {Math.floor(seconds / 60)}:
                    {String(seconds % 60).padStart(2, "0")} elapsed
                  </p>
                )}
                <fieldset className={css.question} disabled={!!answer}>
                  <legend>{question.prompt}</legend>
                  {question.choices.map((text, i) => (
                    <label className={css.option} key={i}>
                      <input
                        type="radio"
                        name="answer"
                        value={i}
                        checked={choice === i}
                        onChange={() => setChoice(i)}
                      />
                      <span>
                        {String.fromCharCode(65 + i)}. {text}
                      </span>
                    </label>
                  ))}
                </fieldset>
                {!answer ? (
                  <button disabled={choice === null} onClick={submit}>
                    Check answer & save
                  </button>
                ) : (
                  <div className={css.feedback}>
                    <p role="status">
                      <strong>
                        {gradeAttempt(answer).correct
                          ? "Correct."
                          : "Let’s work through it."}
                      </strong>{" "}
                      Answer: {question.choices[question.answer]}
                    </p>
                    <p>{question.explanation}</p>
                    {!gradeAttempt(answer).correct && (
                      <button onClick={addError}>
                        Add mistake to review log
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIndex(index + 1);
                        setAnswer(null);
                        setChoice(null);
                        setSeconds(0);
                        started.current = Date.now();
                        setNotice("");
                      }}
                    >
                      {index + 1 === questions.length
                        ? "Finish set"
                        : "Next question"}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
          <aside className={css.sidebar}>
            <section className={styles.panel}>
              <h2>Your practice patterns</h2>
              <p className={styles.muted}>
                Includes repeat attempts. Accuracy here describes this small
                collection, not SAT readiness.
              </p>
              {practiceSummary(loaded.state.attempts).map((row) => (
                <article className={css.record} key={row.skill}>
                  <strong>{row.skill}</strong>
                  <p>
                    {row.correct} / {row.attempts} correct ·{" "}
                    {Math.round(row.seconds / row.attempts)} seconds per attempt
                  </p>
                  <button
                    onClick={() => {
                      setSkill(row.skill);
                      setNotice(
                        "Skill selected. Finish your current set before starting another.",
                      );
                    }}
                  >
                    Choose this skill
                  </button>
                </article>
              ))}
              {!loaded.state.attempts.length && (
                <p>Your first submitted answer starts your history.</p>
              )}
              <button onClick={exportRecords}>Export SAT records</button>
            </section>
            <section className={styles.panel}>
              <h2>Full-length practice</h2>
              <p>
                Use official resources for complete tests and their scoring.
              </p>
              <a
                href="https://satsuite.collegeboard.org/practice/practice-tests/bluebook"
                target="_blank"
                rel="noreferrer"
              >
                College Board’s Bluebook practice ↗
              </a>
            </section>
          </aside>
          <section className={`${styles.panel} ${css.history}`}>
            <h2>Recent answers</h2>
            {[...loaded.state.attempts]
              .reverse()
              .slice(0, 20)
              .map((a) => {
                const { question: q, correct } = gradeAttempt(a);
                return (
                  <details className={css.record} key={a.id}>
                    <summary>
                      {q.skill} · {correct ? "Correct" : "Review"} ·{" "}
                      {new Date(a.date).toLocaleDateString()}
                    </summary>
                    <p>{q.prompt}</p>
                    <p>
                      Your answer: {q.choices[a.choice]} · {a.seconds} seconds
                    </p>
                    <p>{q.explanation}</p>
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            "Remove this practice answer? Your other SAT records and error log will stay.",
                          )
                        )
                          save({
                            ...loaded.state,
                            attempts: loaded.state.attempts.filter(
                              (item) => item.id !== a.id,
                            ),
                          });
                      }}
                    >
                      Remove this answer
                    </button>
                  </details>
                );
              })}
            {!loaded.state.attempts.length && <p>No answers recorded yet.</p>}
          </section>
        </div>
      )}
    </main>
  );
}
