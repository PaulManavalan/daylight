import { z } from "zod";
import { newsTopics } from "./personal-workspace";
export const newsTopicSchema = z.enum(newsTopics);
export type NewsTopic = z.infer<typeof newsTopicSchema>;
export interface NewsSource {
  id: string;
  name: string;
  publisher: string;
  kind: "newsroom" | "institutional";
  url: string;
  home: string;
  topics: NewsTopic[];
  hosts: string[];
}
// Personal, noncommercial RSS aggregation. Commercial redistribution/AI rewriting is a separate launch gate.
export const newsSources: NewsSource[] = [
  {
    id: "guardian-us",
    name: "US news",
    publisher: "The Guardian",
    kind: "newsroom",
    url: "https://www.theguardian.com/us-news/rss",
    home: "https://www.theguardian.com/us-news",
    topics: ["US"],
    hosts: ["www.theguardian.com", "theguardian.com"],
  },
  {
    id: "guardian-world",
    name: "World news",
    publisher: "The Guardian",
    kind: "newsroom",
    url: "https://www.theguardian.com/world/rss",
    home: "https://www.theguardian.com/world",
    topics: ["World"],
    hosts: ["www.theguardian.com", "theguardian.com"],
  },
  {
    id: "guardian-politics",
    name: "US politics",
    publisher: "The Guardian",
    kind: "newsroom",
    url: "https://www.theguardian.com/us-news/us-politics/rss",
    home: "https://www.theguardian.com/us-news/us-politics",
    topics: ["Politics", "US"],
    hosts: ["www.theguardian.com", "theguardian.com"],
  },
  {
    id: "guardian-technology",
    name: "Technology",
    publisher: "The Guardian",
    kind: "newsroom",
    url: "https://www.theguardian.com/us/technology/rss",
    home: "https://www.theguardian.com/us/technology",
    topics: ["Technology"],
    hosts: ["www.theguardian.com", "theguardian.com"],
  },
  {
    id: "guardian-ai",
    name: "Artificial intelligence",
    publisher: "The Guardian",
    kind: "newsroom",
    url: "https://www.theguardian.com/technology/artificialintelligenceai/rss",
    home: "https://www.theguardian.com/technology/artificialintelligenceai",
    topics: ["AI", "Technology"],
    hosts: ["www.theguardian.com", "theguardian.com"],
  },
  {
    id: "guardian-business",
    name: "Business",
    publisher: "The Guardian",
    kind: "newsroom",
    url: "https://www.theguardian.com/us/business/rss",
    home: "https://www.theguardian.com/us/business",
    topics: ["Business"],
    hosts: ["www.theguardian.com", "theguardian.com"],
  },
  {
    id: "guardian-science",
    name: "Science",
    publisher: "The Guardian",
    kind: "newsroom",
    url: "https://www.theguardian.com/science/rss",
    home: "https://www.theguardian.com/science",
    topics: ["Science"],
    hosts: ["www.theguardian.com", "theguardian.com"],
  },
  {
    id: "guardian-sport",
    name: "Sport",
    publisher: "The Guardian",
    kind: "newsroom",
    url: "https://www.theguardian.com/us/sport/rss",
    home: "https://www.theguardian.com/us/sport",
    topics: ["Sports"],
    hosts: ["www.theguardian.com", "theguardian.com"],
  },
  {
    id: "nasa",
    name: "NASA news releases",
    publisher: "NASA",
    kind: "institutional",
    url: "https://www.nasa.gov/news-release/feed/",
    home: "https://www.nasa.gov/news-releases/",
    topics: ["Science", "Technology"],
    hosts: ["www.nasa.gov", "nasa.gov", "science.nasa.gov"],
  },
];
const publisherURL = z
  .url()
  .max(2500)
  .refine((raw) => {
    try {
      const url = new URL(raw);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        newsSources.some((source) => source.hosts.includes(url.hostname))
      );
    } catch {
      return false;
    }
  }, "Unrecognized publisher link.");
export const headlineSchema = z
  .object({
    id: z.string().max(2500),
    title: z.string().min(1).max(500),
    url: publisherURL,
    publisher: z.string().max(100),
    kind: z.enum(["newsroom", "institutional"]),
    format: z.enum(["headline", "opinion"]),
    publishedAt: z.iso.datetime().nullable(),
    topics: z.array(newsTopicSchema).max(9),
    sourceIds: z.array(z.string().max(80)).min(1).max(12),
  })
  .refine(
    (item) =>
      item.id === item.url &&
      item.sourceIds.every((id) =>
        newsSources.some(
          (source) =>
            source.id === id &&
            source.publisher === item.publisher &&
            source.kind === item.kind &&
            canonicalNewsURL(item.url, source) === item.url,
        ),
      ),
    "Publisher identity could not be verified.",
  );
export type Headline = z.infer<typeof headlineSchema>;
export const newsSnapshotSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    topics: z.array(newsTopicSchema).max(9),
    unsupportedTopics: z.array(newsTopicSchema).max(9),
    headlines: z.array(headlineSchema).max(120),
    sources: z
      .array(
        z
          .object({
            id: z.string().max(80),
            name: z.string().max(100),
            publisher: z.string().max(100),
            home: publisherURL,
            state: z.enum(["current", "stale", "unavailable"]),
            fetchedAt: z.iso.datetime().nullable(),
            checkedAt: z.iso.datetime(),
            latestPublishedAt: z.iso.datetime().nullable(),
            message: z.string().max(300),
          })
          .refine(
            (item) =>
              newsSources.some(
                (source) =>
                  source.id === item.id &&
                  source.home === item.home &&
                  source.publisher === item.publisher &&
                  source.name === item.name,
              ),
            "Unknown publisher source.",
          ),
      )
      .max(12),
  })
  .refine(
    (data) =>
      data.headlines.every((item) =>
        item.sourceIds.every((id) =>
          data.sources.some((source) => source.id === id),
        ),
      ),
    "Headline source is missing.",
  );
export type NewsSnapshot = z.infer<typeof newsSnapshotSchema>;
export function canonicalNewsURL(raw: string, source: NewsSource) {
  try {
    const url = new URL(raw.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !source.hosts.includes(url.hostname)
    )
      return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (/^utm_/i.test(key) || ["fbclid", "gclid", "CMP"].includes(key))
        url.searchParams.delete(key);
    return url.href;
  } catch {
    return null;
  }
}
export function mergeHeadlines(items: Headline[]) {
  const rows = new Map<string, Headline>();
  for (const item of items) {
    const old = rows.get(item.url);
    rows.set(
      item.url,
      old
        ? {
            ...old,
            topics: [...new Set([...old.topics, ...item.topics])],
            sourceIds: [...new Set([...old.sourceIds, ...item.sourceIds])],
          }
        : item,
    );
  }
  return [...rows.values()]
    .sort(
      (a, b) =>
        (b.publishedAt ? Date.parse(b.publishedAt) : 0) -
          (a.publishedAt ? Date.parse(a.publishedAt) : 0) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, 120);
}
