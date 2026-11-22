"use client";
import Link from "next/link";
import { usePersonalWorkspace } from "./use-personal-workspace";
import { useNews } from "./use-news";
import styles from "./notion-daily-planner.module.css";
export default function NewsBriefingPanel() {
  const personal = usePersonalWorkspace(),
    { data, loading, error } = useNews(personal.state?.news ?? []);
  return (
    <section className={styles.panel} aria-label="News in your briefing">
      <h2>Around the world</h2>
      {loading && !data && <p role="status">Checking your publisher feeds…</p>}
      {error && <p className={styles.muted}>{error}</p>}
      {data && (
        <>
          {data.headlines.slice(0, 4).map((item) => (
            <p key={item.id}>
              <small>
                {item.publisher} ·{" "}
                {item.kind === "institutional"
                  ? "Institutional update"
                  : item.format === "opinion"
                    ? "Opinion"
                    : "Publisher headline"}
              </small>
              <br />
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title} ↗
              </a>
              <br />
              <small>
                {item.publishedAt
                  ? "Published " +
                    new Date(item.publishedAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "Publication time not supplied"}
                {item.sourceIds.every(
                  (id) =>
                    data.sources.find((source) => source.id === id)?.state !==
                    "current",
                )
                  ? " · Older snapshot"
                  : ""}
              </small>
            </p>
          ))}
          {!data.headlines.length && !loading && (
            <p>No publisher headlines available for these topics.</p>
          )}
          {data.sources.some((source) => source.state !== "current") && (
            <p className={styles.muted}>
              Some publisher feeds could not refresh. Check their status in
              News.
            </p>
          )}
        </>
      )}
      <Link href="/day/news">Open your news reader →</Link>
    </section>
  );
}
