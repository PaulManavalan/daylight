# Calendar integration checkpoint

The web preview supports **reviewed file transfer** and a configurable [Google OAuth adapter](google-calendar.md) with reviewed event reads and writes. The Google adapter has synthetic validation but still needs real deployment credentials and account testing. Apple synchronization and automatic Google reconciliation remain unfinished. No provider password, public calendar URL, subscription fee or server-side token is required for the file bridge.

1. Export the relevant private calendar as `.ics` using [Google Calendar on a computer](https://support.google.com/calendar/answer/37111) or [Apple Calendar on a Mac](https://support.apple.com/guide/calendar/icl1023/mac). Google ZIP exports must be extracted first. An iPhone-only calendar may need a different native/account-specific path later.
2. In `/day`, expand **Calendars**, choose the provider and a distinct name, then read the file. Review the times before clicking **Use these events**. Reading alone does not save or approve anything.
3. Imports cover a bounded 30-day window and retain source UID/occurrence identity. Reimporting the same name replaces that calendar's local snapshot; other calendars remain separate. The snapshot is browser-local and its read time is displayed. Removing it never deletes provider events.
4. The day engine blocks imported busy events, all-day events and overnight intervals. Exact duplicate UIDs/start times across calendars do not create duplicate local commitments. Overlaps remain protected and are reported. Changes to imported calendars invalidate the current draft or approval.
5. Approve a Daylight plan before exporting `.ics`. The default export includes only Daylight focus sessions. A separate opt-in export also includes explicitly chosen training blocks: no external appointments, attendees, invitations or alarms. UTC timestamps and deterministic UIDs are used. A download is not proof of provider acceptance. Repeated manual imports may create duplicates in external calendar apps.

Recurrence expansion uses maintained `ical.js`, including exclusions, canceled and moved exceptions and embedded timezone rules. Unknown TZIDs without definitions, invalid durations, orphan overrides, high-frequency/unbounded expensive expansions, invitation files and oversized files fail rather than silently free up time. Floating times use the device timezone with an explicit review warning. Date range expiry blocks planning until the source is refreshed. Imported calendar content is data, not AI instructions; attachments, links and remote content are not fetched or executed.

## Live integration work remaining

- Google: OAuth/refresh, reviewed range reads and receipt-based writes are now implemented; real account testing, durable server token storage, automatic source reconciliation, incremental synchronization and cross-device selections remain. No credentials or account authorization are configured by this change. See [the implemented adapter and launch gates](google-calendar.md), [scopes](https://developers.google.com/workspace/calendar/api/auth), and [sync tokens](https://developers.google.com/workspace/calendar/api/guides/sync).
- Apple: establish whether home events live in iCloud or only on a device. A future native client can use [EventKit with the required access descriptions and permissions](https://developer.apple.com/documentation/eventkit/accessing-the-event-store). Account-specific CalDAV remains a web option to evaluate; do not pretend it is a generic Apple Calendar OAuth API. Never ask a user to publish a private home calendar as the shortcut.

No paid service is introduced. Account setup, provider quotas/verification, hosting behavior and actual end-to-end authorization must be checked before claiming live sync.

## Dependency notice

This feature uses unmodified [ical.js 2.2.1](https://github.com/kewisch/ical.js), maintained by Philipp Kewisch and contributors, under the [Mozilla Public License 2.0](https://github.com/kewisch/ical.js/blob/main/LICENSE). The dependency source and license are available through that project and the installed package. Daylight's adapters and application code are separate from that library.
