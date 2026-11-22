# Personal news reader

November 22, 2026. `/day/news` now retrieves live publisher RSS snapshots, and Today includes a four-headline panel. This is an on-open personal reader, not pre-wake automation, a complete news service or an AI summary product.

## Coverage and reuse boundaries

Eight Guardian feeds cover US, world, US politics, technology, AI, business, science and sport. NASA news releases add a separately labelled institutional source. The publisher count is two, not nine independent newsrooms. Local news is explicitly unsupported until a suitable source is selected; no location is inferred. More independent editorial sources and broader corroboration remain requirements.

The Guardian's [feed guidance](https://www.theguardian.com/help/feeds) supports personal, noncommercial aggregation. This checkpoint does not clear paid redistribution, commercial launch, model training or AI rewriting. [NASA's feed directory](https://www.nasa.gov/rss-feeds/) and [usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) remain source references; institutional reporting is labelled and no endorsement is implied. BBC is not enabled because current reuse terms have not been verified. No paid API, licence or model service was enabled.

Only headline text, direct publisher links, publisher identity, topic provenance and actual publication dates are returned. RSS body/description fields are discarded; article pages and external images are not fetched. Headlines are not sent to either AI adapter. Opinion labels are used for the publisher's opinion URL section; other items are identified as publisher headlines rather than independently verified claims.

## Retrieval and failure behavior

The endpoint accepts only a distinct list of supported topic names. Source URLs are fixed constants; caller-supplied URLs, redirects, credentials, arbitrary destinations and article-page retrieval are outside the interface. Three Guardian sections redirected to their US-edition feeds in live checks; the verified final URLs are now configured directly.

Each feed has a ten-second timeout and one-megabyte response limit, including streamed bodies. Strict SAX parsing rejects document/entity declarations, malformed XML and nesting beyond 40 levels. Entries and returned items are bounded. Unsafe or foreign article links are omitted; client schema checks also verify source identity and publisher URLs. Dates without an explicit timezone remain unknown. Future items beyond a short clock-tolerance window are omitted. Atom modification times are not mislabelled as publication times.

Canonical article URLs deduplicate overlap while retaining topic/feed provenance. A warm server shares in-flight requests and caches successful snapshots for 15 minutes. Failed sources get a one-minute retry cooldown. A failed refresh can retain an explicitly stale prior snapshot; initial failures have no manufactured headlines. Fetch/check times stay separate from publication dates. The cache is process-local, so cold or separate hosted instances do not promise durable news history or a shared background refresh.

The reader begins with the user's saved topic preferences. View filters do not rewrite those preferences. Changing topics aborts the previous request and hides mismatched results immediately. A failed request for the same topics keeps the prior snapshot with a notice. The overview uses the same validated retrieval hook and shows source/freshness limits without preventing the plan from opening when news is unavailable. No personal academic, calendar or meal records are sent to publishers.

## Verification

Unit tests cover XML/entity/nesting/size limits, unsafe links, publication dates, future items, Atom timestamps, deduplication, provenance, caching, concurrent reads, stale/initial failures, retry cooldown and restricted query input. Browser checks cover preferences, literal text rendering, unsafe response rejection, failed-refresh retention, partial-source labels, rapid topic changes, local coverage, overview integration, unchanged planner records and mobile width. Production dependency audit reports zero known advisories at this checkpoint.

`node tests/news-live.cjs` fetched and parsed all nine configured feeds successfully on November 22. Its ignored artifact stores status/count evidence, not article content. That verifies this runtime check, not permanent upstream availability or a deployed background service. The broader launch still needs commercial source review, more independent publishers, authorized grounded AI synthesis and genuinely deployed morning preparation.
