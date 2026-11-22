import sax from "sax";
import { canonicalNewsURL, type NewsSource, type Headline } from "./news";
const MAX_BYTES = 1024 * 1024;
export function parseNewsFeed(
  xml: string,
  source: NewsSource,
  now = new Date(),
): Headline[] {
  if (
    new TextEncoder().encode(xml).length > MAX_BYTES ||
    /<!DOCTYPE|<!ENTITY/i.test(xml)
  )
    throw Error("Feed declarations or size are unsupported.");
  const options: sax.SAXOptions & { strictEntities: boolean } = {
    xmlns: true,
    strictEntities: true,
  };
  const parser = sax.parser(true, options),
    path: string[] = [],
    items: Headline[] = [];
  let item: { title: string; link: string; date: string } | null = null,
    entryDepth = 0,
    field = "",
    fieldDepth = 0,
    entries = 0;
  parser.onerror = () => {
    throw Error("Publisher feed is not valid XML.");
  };
  parser.ondoctype = () => {
    throw Error("Feed declarations are unsupported.");
  };
  parser.onopentag = (raw) => {
    const tag = raw as sax.QualifiedTag;
    path.push(tag.local);
    if (path.length > 40) throw Error("Feed nesting exceeds the limit.");
    if (
      path.join("/") === "rss/channel/item" ||
      path.join("/") === "feed/entry"
    ) {
      if (++entries > 300) throw Error("Feed contains too many entries.");
      item = { title: "", link: "", date: "" };
      entryDepth = path.length;
    }
    if (!item || path.length !== entryDepth + 1) return;
    if (tag.local === "title") {
      field = "title";
      fieldDepth = path.length;
    } else if (
      ["pubDate", "published"].includes(tag.local) &&
      !item.date
    ) {
      field = "date";
      fieldDepth = path.length;
    } else if (tag.local === "link") {
      const attrs = tag.attributes,
        attribute = (name: string) => {
          const a = attrs[name];
          return typeof a === "string" ? a : (a?.value ?? "");
        };
      if (path[0] === "feed") {
        if (!attribute("rel") || attribute("rel") === "alternate")
          item.link = attribute("href");
      } else {
        field = "link";
        fieldDepth = path.length;
      }
    }
  };
  const text = (value: string) => {
    if (item && field && path.length === fieldDepth) {
      const key = field as keyof typeof item;
      item[key] = (item[key] + value).slice(
        0,
        key === "link" ? 2500 : key === "title" ? 1000 : 120,
      );
    }
  };
  parser.ontext = text;
  parser.oncdata = text;
  parser.onclosetag = () => {
    if (item && path.length === entryDepth) {
      const title = item.title
          .replace(/<[^>]*>/g, "")
          .replace(/[\u0000-\u001f]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500),
        url = canonicalNewsURL(item.link, source),
        hasZone = /(?:Z|GMT|UTC|[+-]\d{2}:?\d{2})\s*$/i.test(item.date),
        date = hasZone ? Date.parse(item.date) : NaN;
      if (title && url && (!Number.isFinite(date) || date <= +now + 15 * 60000))
        items.push({
          id: url,
          title,
          url,
          publisher: source.publisher,
          kind: source.kind,
          format: new URL(url).pathname.includes("/commentisfree/")
            ? "opinion"
            : "headline",
          publishedAt: Number.isFinite(date)
            ? new Date(date).toISOString()
            : null,
          topics: source.topics,
          sourceIds: [source.id],
        });
      item = null;
      field = "";
    } else if (path.length === fieldDepth) field = "";
    path.pop();
  };
  parser.write(xml).close();
  if (!entries) throw Error("Publisher feed has no supported entries.");
  return items.slice(0, 40);
}
export async function fetchNewsFeed(
  source: NewsSource,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const response = await fetcher(source.url, {
    redirect: "error",
    cache: "no-store",
    headers: {
      Accept:
        "application/rss+xml, application/atom+xml, text/xml, application/xml",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (
    !response.ok ||
    !/(?:xml|rss|atom)/i.test(response.headers.get("content-type") ?? "")
  )
    throw Error("Publisher feed is unavailable.");
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    await response.body?.cancel();
    throw Error("Publisher feed exceeds the size limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error("Publisher feed is empty.");
  let size = 0,
    xml = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES)
        throw Error("Publisher feed exceeds the size limit.");
      xml += decoder.decode(part.value, { stream: true });
    }
    xml += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return parseNewsFeed(xml, source, now);
}
