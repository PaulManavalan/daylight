import { fetchNewsFeed } from "./news-feed";
import {
  newsSources,
  mergeHeadlines,
  newsSnapshotSchema,
  type Headline,
  type NewsSource,
  type NewsTopic,
} from "./news";
const TTL = 15 * 60000;
export class NewsService {
  private cache = new Map<string, { items: Headline[]; fetchedAt: string }>();
  private pending = new Map<string, Promise<Headline[]>>();
  private failures = new Map<string, string>();
  constructor(
    private fetcher: typeof fetch = fetch,
    private time: () => Date = () => new Date(),
  ) {}
  private async source(source: NewsSource) {
    const now = this.time(),
      previous = this.cache.get(source.id),
      base = {
        id: source.id,
        name: source.name,
        publisher: source.publisher,
        home: source.home,
      };
    const failed = this.failures.get(source.id);
    const unavailable = (checkedAt: string) => ({
      ...base,
      state: previous ? ("stale" as const) : ("unavailable" as const),
      items: previous?.items ?? [],
      fetchedAt: previous?.fetchedAt ?? null,
      checkedAt,
      message: previous
        ? "Refresh failed. Showing the last successful publisher snapshot."
        : "This publisher could not be reached. No headlines were invented.",
    });
    if (failed && +now - Date.parse(failed) < 60000) return unavailable(failed);
    if (previous && +now - Date.parse(previous.fetchedAt) < TTL)
      return {
        ...base,
        state: "current" as const,
        items: previous.items,
        fetchedAt: previous.fetchedAt,
        checkedAt: previous.fetchedAt,
        message: "Publisher feed snapshot",
      };
    try {
      let work = this.pending.get(source.id);
      if (!work) {
        work = fetchNewsFeed(source, this.fetcher, now).finally(() =>
          this.pending.delete(source.id),
        );
        this.pending.set(source.id, work);
      }
      const items = await work,
        fetchedAt = this.time().toISOString();
      this.cache.set(source.id, { items, fetchedAt });
      this.failures.delete(source.id);
      return {
        ...base,
        state: "current" as const,
        items,
        fetchedAt,
        checkedAt: fetchedAt,
        message: "Publisher feed snapshot",
      };
    } catch {
      const checkedAt = this.time().toISOString();
      this.failures.set(source.id, checkedAt);
      return unavailable(checkedAt);
    }
  }
  async read(topics: NewsTopic[]) {
    const chosen = [...new Set(topics)],
      sources = newsSources.filter((source) =>
        source.topics.some((topic) => chosen.includes(topic)),
      ),
      results = await Promise.all(sources.map((source) => this.source(source)));
    return newsSnapshotSchema.parse({
      generatedAt: this.time().toISOString(),
      topics: chosen,
      unsupportedTopics: chosen.filter(
        (topic) => !sources.some((source) => source.topics.includes(topic)),
      ),
      headlines: mergeHeadlines(results.flatMap((source) => source.items)),
      sources: results.map(({ items, ...source }) => ({
        ...source,
        latestPublishedAt:
          items
            .filter((item) => item.publishedAt)
            .map((item) => item.publishedAt!)
            .sort()
            .at(-1) ?? null,
      })),
    });
  }
}
