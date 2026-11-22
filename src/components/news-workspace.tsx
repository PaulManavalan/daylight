"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePersonalWorkspace } from "./use-personal-workspace";
import { newsTopics } from "@/lib/personal-workspace";
import { type NewsTopic } from "@/lib/news";
import { useNews } from "./use-news";
import styles from "./notion-daily-planner.module.css";
import css from "./news-workspace.module.css";
function date(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
export default function NewsWorkspace() {
  const personal = usePersonalWorkspace(),
    [topics, setTopics] = useState<NewsTopic[]>([]);
  const defaults = personal.state?.news.join(",") ?? "";
  const { data, loading, error, refresh } = useNews(topics);
  useEffect(() => {
    if (defaults) setTopics(defaults.split(",") as NewsTopic[]);
  }, [defaults]);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/day" className={styles.logo}>
          Daylight
        </Link>
        <nav className={styles.nav}>
          <Link href="/day">Plan & chat</Link>
          <Link href="/day/briefing">Today overview</Link>
          <Link href="/day/preferences">Your preferences</Link>
        </nav>
      </header>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>A WINDOW ON THE WORLD</p>
        <h1>
          Stay curious.
          <br />
          <em>Keep perspective.</em>
        </h1>
        <p>
          Headlines from your selected publisher feeds. Open the original
          reporting for the full story.
        </p>
      </section>
      <section
        className={`${styles.panel} ${css.controls}`}
        aria-label="News topics"
      >
        <div className={styles.sectionTitle}>
          <h2>Your news</h2>
          <button disabled={loading || !topics.length} onClick={refresh}>
            {loading ? "Checking publishers…" : "Refresh headlines"}
          </button>
        </div>
        <div className={css.topics}>
          {newsTopics.map((topic) => (
            <button
              key={topic}
              aria-pressed={topics.includes(topic)}
              disabled={topics.length === 1 && topics.includes(topic)}
              onClick={() =>
                setTopics((previous) =>
                  previous.includes(topic)
                    ? previous.filter((value) => value !== topic)
                    : [...previous, topic],
                )
              }
            >
              {topic}
            </button>
          ))}
        </div>
        <p className={styles.muted}>
          Your saved interests set the starting view.{" "}
          <Link href="/day/preferences">Change your default topics →</Link>
        </p>
      </section>
      {personal.error && (
        <p role="alert" className={styles.error}>
          {personal.error}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className={styles.muted}>
          Checking the publisher feeds. Publication dates stay attached to each
          headline.
        </p>
      )}
      {data && (
        <>
          <div className={css.sourceLine}>
            <p>
              {[
                ...new Set(data.sources.map((source) => source.publisher)),
              ].join(" · ") || "No publisher selected"}
              <span>Publisher feeds · original headlines</span>
            </p>
            <details>
              <summary>Sources & freshness</summary>
              <ul>
                {data.sources.map((source) => (
                  <li key={source.id}>
                    <a
                      href={source.home}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.publisher} · {source.name} ↗
                    </a>
                    <strong>
                      {source.state === "current"
                        ? "Feed available"
                        : source.state === "stale"
                          ? "Older snapshot"
                          : "Unavailable"}
                    </strong>
                    <p>
                      Checked {date(source.checkedAt)}
                      {source.fetchedAt
                        ? " · Last successful read " + date(source.fetchedAt)
                        : ""}
                    </p>
                    {source.latestPublishedAt && (
                      <p>
                        Newest published item: {date(source.latestPublishedAt)}
                      </p>
                    )}
                    {source.state !== "current" && <p>{source.message}</p>}
                  </li>
                ))}
              </ul>
            </details>
          </div>
          {data.unsupportedTopics.includes("Local") && (
            <p className={styles.muted}>
              A local publisher has not been selected yet. This view does not
              infer your location.
            </p>
          )}
          {data.sources.some((source) => source.state !== "current") && (
            <p role="status" className={styles.muted}>
              Some publishers could not refresh. Older snapshots are marked
              below; other sources are still shown.
            </p>
          )}
          {data.headlines.length ? (
            <section className={css.grid} aria-label="Publisher headlines">
              {data.headlines.map((item, index) => {
                const stale = item.sourceIds.every(
                  (id) =>
                    data.sources.find((source) => source.id === id)?.state !==
                    "current",
                );
                return (
                  <article
                    className={index === 0 ? css.lead : css.card}
                    key={item.id}
                  >
                    <div className={css.meta}>
                      <span>{item.publisher}</span>
                      <span>
                        {item.kind === "institutional"
                          ? "Institutional update"
                          : item.format === "opinion"
                            ? "Opinion"
                            : "Publisher headline"}
                      </span>
                      {stale && <span>Older snapshot</span>}
                    </div>
                    <h2>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {item.title}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    </h2>
                    <footer>
                      <time dateTime={item.publishedAt ?? undefined}>
                        {item.publishedAt
                          ? "Published " + date(item.publishedAt)
                          : "Publication time not supplied"}
                      </time>
                      <span>{item.topics.join(" · ")}</span>
                    </footer>
                  </article>
                );
              })}
            </section>
          ) : (
            !loading && (
              <section className={styles.panel}>
                <h2>No headlines available for these topics</h2>
                <p>
                  Check the source status or try another topic. An unavailable
                  feed does not mean nothing happened.
                </p>
              </section>
            )
          )}
          <p className={styles.muted}>
            Publisher coverage currently includes The Guardian and NASA. NASA is
            an institutional source.
          </p>
        </>
      )}
    </main>
  );
}
