# Google Calendar live adapter

This checkpoint implements the provider connection and reviewed read/write flow. It has synthetic-provider unit and browser validation. **No actual Google OAuth credentials or end-user calendar authorization have been configured or verified**, so it is not evidence that Paul's live account is connected.

## Implemented behavior

- `/api/google-calendar` and its callback use Google's web-server OAuth endpoints, state bound to the initiating workspace, PKCE, encrypted HttpOnly cookies with a separate encryption context, expiry checks, bounded responses and request timeouts. No tokens are returned to browser JavaScript, localStorage, backups or model prompts.
- Read-only calendar-list and event scopes are requested initially. Event editing needs a separate consent flow requesting `calendar.events`. The server checks the granted scopes. Hosted usage requires a verified Daylight account; local-demo connections are permitted only on loopback outside Vercel.
- Preferences provides calendar selection and a complete, paginated 30-day event read. Google expands recurrence instances. Canceled, transparent and self-declined events are excluded. All-day boundaries use the calendar's IANA zone, not the browser's zone. Invalid or ambiguous local times, incomplete pages and oversized ranges fail without replacing saved events.
- Reads require explicit review before replacing the browser-local planner snapshot. Snapshot IDs stay stable for the same Google calendar. The existing scheduler protects the resulting busy events and invalidates changed plans.
- Single timed events can be created after a review. Stable provider event IDs bind retries to the same proposal; conflicting reuse is rejected. Updates and explicit confirmed deletions apply only to Daylight-created, nonrecurring events visible in the selected range. ETags and `If-Match` protect against concurrent changes. Event receipts come from the provider response. No attendees, invitations or recurrence rules are accepted from the form.
- Confirmed writes mark existing live Google snapshots as needing refresh. The planner refuses stale snapshots until a complete read is reviewed. Saving preferences preserves domains changed by other controls on the same page.
- Disconnect clears this browser's connection cookies, keeping previously imported data. Global permission revocation remains available through the Google account's connected-app controls; clearing a cookie is not represented as revoking the Google grant.

## One-time deployment setup

1. In an operator-owned Google Cloud project, enable Calendar API and configure a web OAuth client and consent screen. Register the exact primary-origin callback URI. Use the personal/testing consent audience for the personal checkpoint and explicitly add the intended test user where Google requires it. Public distribution needs the applicable verification, privacy and user-data policy work.
2. Set the four server-only variables documented in `.env.example`: client ID, client secret, callback URI and a separately generated cookie encryption secret of at least 32 characters. Keep secrets in deployment environment configuration, never in Git, messages or `NEXT_PUBLIC_` variables. Local callback defaults to port 3104; the Vercel callback must use the intended stable HTTPS origin.
3. Hosted connections also need working Daylight authentication using the existing Supabase configuration. Verify identity isolation with two test accounts before public release. Start read-only, choose a test calendar and inspect events around DST, recurrence exceptions and all-day boundaries. Only then enable editing and confirm create/retry/update/delete behavior in a disposable test calendar.
4. Do not enable billing or paid quotas without the user's approved budget. Current Google documentation describes standard use at no additional cost, project/user rate limits, and planned quota-related billing changes. Inspect the actual project's limits and billing status during setup rather than assuming unlimited free API usage. No cloud project, billing account or quota increase was created by this code change.

## Still required before launch

Live account authorization and provider verification; durable encrypted server-side connections beyond this browser cookie; account-synchronized calendar selections and event snapshots; incremental sync tokens or push reconciliation; automatic on-open refresh with user controls; full end-to-end two-account isolation; action history across devices; multi-event approved timetable export; recurring-series editing; and Apple's supported account/native integration. Existing file transfer remains available when OAuth is unavailable. No pre-wake or closed-app synchronization is claimed.

## Official references

Read November 21, 2026: [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies), [calendar list](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list), [event listing](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [event insertion](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [conditional modifications](https://developers.google.com/workspace/calendar/api/guides/version-resources), and [current usage limits and pricing](https://developers.google.com/workspace/calendar/api/guides/quota).
