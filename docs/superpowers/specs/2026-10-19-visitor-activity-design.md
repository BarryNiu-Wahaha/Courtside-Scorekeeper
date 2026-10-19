# Anonymous visitor activity

Status: approved in conversation, including MongoDB and fresh server queries for admin summaries; implementation plan awaiting review.

## Outcome and agreed scope

The owner wants to see when people visit CourtSide and what they do, without identifying them by name. Add a private admin view of visits, estimated unique visitors, popular views, device/browser categories, approximate active time, and session action timelines. Capture player and game views, filter changes, and existing download actions. Keep detailed records for 90 days. Collection starts with deployment; historical activity cannot be reconstructed.

No names, emails, raw IP addresses, typed search text, PINs, game contents, full URLs, or browser fingerprints enter the application analytics records. Random browser identifiers are pseudonymous, not proof of a person's identity. Infrastructure access logs are separate from these records.

## Approach

Use a small first-party browser collector, the existing Flask API, a dedicated MongoDB database, and the existing admin authentication. Keep official basketball records in the existing Aiven MySQL database. The user selected MongoDB after discussing NoSQL analytics and cost. Target Atlas Free M0 initially; monitor storage and operations rather than assuming the free tier will fit all future traffic. No paid upgrade is authorized. This requires a separate database account and connection configuration. MySQL-only storage remains the lower-maintenance alternative; an external analytics product would provide more ready-made reports but introduce another product and data destination.

The browser sends events to Flask, never directly to MongoDB. Use the official PyMongo driver with a shared client per worker, bounded connection pools and timeouts, and TLS. Keep `VISITOR_MONGODB_URI` and `VISITOR_MONGODB_DATABASE` in backend environment configuration only. Use a dedicated database user scoped to the analytics database. Atlas network access must permit the backend's documented outbound addresses. Missing or unavailable MongoDB disables analytics with explicit unavailable responses; it must not prevent Flask startup or basketball operations. Health checks must distinguish optional analytics readiness from core application health.

The public site currently reads static published data. Tracking introduces an optional API dependency only: API cold starts, failures, and blocked tracking must never prevent reading statistics or recording a game. Existing basketball calculations in `site/analytics.js` remain separate from visitor analytics.

## Browser collection

Add `site/visitor-tracking.js` to the public dashboard and hosted scorekeeper. Do not track the admin workspace or standalone offline scorekeeper. The hosted build supplies the API URL and enables collection; development and standalone builds default to disabled.

Generate cryptographically random visitor, session, and event IDs. Store the visitor ID with a fixed 90-day expiry; rotate it on expiry. Store a session ID in session storage, ending a session after 30 minutes of inactivity. Tabs are separate sessions. If storage is unavailable, use in-memory IDs without interrupting the page. Counts describe browsers and sessions, not verified people or cross-device identities.

Send only explicitly instrumented events:

| Event | Allowed detail |
| --- | --- |
| `page_view` | `dashboard` or `scorekeeper` |
| `view_change` | overview, players, or games |
| `player_open` | public player ID |
| `game_open` | public game ID |
| `filter_change` | allowlisted control name and enumerated selection; bounded year where applicable |
| `download` | existing export kind only; never filename or downloaded content |
| `engagement` | incremental active milliseconds |

Record actions in their handlers, not render functions, to avoid counting rerenders. Do not capture generic clicks, keystrokes, search terms, session replay, or URL query strings. The dashboard currently has no export feature; instrument existing hosted scorekeeper export handlers rather than introducing downloads.

Estimate active time only while the document is visible and there has been pointer, keyboard, or touch activity within 60 seconds. Opening the page starts this window. Flush engagement every 15 seconds and on hide/page exit. Cap each increment at 15 seconds; do not count idle or background time. Label it approximate, not total visit duration.

Batch at most 20 events, flush every 10 seconds, and attempt a final keepalive request on page exit. Keep at most 100 queued events in memory, dropping oldest events when full. Retry transient failures with bounded backoff while the page remains open; reuse event IDs for deduplication. No persistent offline tracking queue.

Show a short anonymous-analytics notice with a disable control on tracked pages. Opting out clears analytics IDs and queued events and stops future collection; it does not claim to delete already received records. Respect Global Privacy Control and Do Not Track by disabling collection. This is a product behavior decision, not a statement of jurisdiction-specific legal compliance.

## API and storage

Add `POST /api/visitor-events`, unauthenticated for ingestion, restricted to configured site origins. Accept JSON only, at most 20 events and 16 KB per request. Validate IDs, event names, enums, lengths, timestamps, and properties; reject unknown fields. Classify browser family into a small enum without storing the full user-agent string; device category is mobile, tablet, desktop, or unknown. Neither category is guaranteed accurate.

Store server receipt time and bounded client event time separately. Reject client times outside the preceding 24 hours or more than five minutes in the future. Use server time for retention and reporting date boundaries. Event IDs are unique, making retries idempotent. Apply an in-process per-source limit using only an ephemeral keyed IP digest (120 requests/minute), plus a process-wide limit (1,200 requests/minute); never persist or log source IPs in application analytics. Limits reset on restart and are not a distributed abuse defense. Public ingestion remains spoofable; counts are indicative, not billing-grade.

Create a regular `visitor_events` MongoDB collection with one document per event. Use event ID as `_id` for deduplication. Fields are visitor ID, session ID, event name, page key, validated properties, device/browser enums, client time, and received time. Store dates as BSON UTC dates. Add a TTL index on received time with `expireAfterSeconds: 7776000` (90 days), plus compound indexes on session/received time/event ID and visitor/received time. Configure collection validation and indexes through an idempotent setup command. Store no growing arrays of events inside visitor documents and make no changes to the basketball SQL schema.

An independent visitor repository covers idempotent batch inserts, aggregation pipelines, paginated sessions, and session detail. Implement equivalent in-memory behavior for API unit tests and real MongoDB integration tests for storage semantics. Use unordered batch inserts; ignore duplicate-key errors only and surface other failures so clients can retry with the same event IDs. Filter by received time before grouping, bound query execution time, and avoid scans of unrelated historical records. Expired documents are deleted asynchronously by MongoDB TTL; every report also filters out records older than 90 days. No daily cleanup scheduler is needed. Retention covers primary analytics storage; any backup retention is controlled separately. Player/game labels come from existing public data, not cross-database joins or duplicated private roster data.

Add admin-only read routes for summary, session list, and session detail under `/api/admin/visitor-activity`. Reuse the existing signed-session role check; scorekeepers cannot read reports. Responses use `Cache-Control: no-store`. Maximum reporting range is 90 days, default seven days. Pagination is bounded to 50 sessions or 200 timeline events per page, with stable cursors. Return explicit empty states and errors, never fabricated demo data.

## Admin experience

Add a Visitor activity panel below existing administration tools, with date range, refresh, visits, unique visitor estimate, page views, and total approximate active time. Include popular player/game views and device/browser breakdowns. List recent sessions with anonymous short labels, start time, last event, and action count; selecting one loads its chronological timeline. Resolve public entity IDs to display names locally when available; otherwise display the ID.

Session counts use sessions with a page view in the selected range. Unique visitors are distinct visitor IDs in that range. Page views count page openings; view changes are separate. Active time sums validated engagement increments received in the range. Date boundaries use UTC and are labeled; display individual timestamps in the browser's local timezone. Timeline ties use event ID for stable ordering. Reports state that blocked tracking, storage clearing, lost exit events, and API downtime can cause undercounting or split identities.

No automatic polling is required for version one. Refresh gives near-current received data. An API failure shows a retryable message without disabling game administration. Analytics data never enters the public statistics snapshot or static deployment artifacts.

## Files and integration

- Collector and hooks: `site/visitor-tracking.js`, `site/public.js`, `site/index.html`, hosted scorekeeper source/build hooks.
- Admin reporting: dedicated `site/visitor-admin.js`, `site/admin.html`, minimal styles and login/logout integration in `site/admin.js`.
- Backend: dedicated visitor validation/reporting module and MongoDB repository, thin routes in `scorekeeper_remote/app.py`, PyMongo dependency, idempotent collection/index setup CLI, and backend-only environment settings.
- Publishing: explicitly allowlist the new scripts in `scorekeeper_remote/publishing.py`; verify collector configuration in hosted output and exclusion of analytics records.
- Documentation: Atlas free-tier setup, backend network access, private credentials, storage monitoring, event definitions, TTL retention, opt-out behavior, and reporting limitations.

The checkout is on `refactor/junior-readable-code`. The previous handoff prohibits merging or deploying that refactor. Implementation must use a separate analytics branch based on the intended production baseline, preserving existing untracked data and design files. This design does not authorize merging the refactor or deploying production changes.

## Verification and rollout

Test event validation, timestamp/size limits, deduplication, rate limiting, admin-only reads, bounded pagination, aggregates, and retention. Exercise collection validation, indexes, duplicate retries, and aggregation queries against an isolated MongoDB database. Verify TTL index configuration and expired-record exclusion without relying on exact background deletion timing. Test missing credentials and MongoDB outages without breaking existing MySQL-backed operations. Browser checks cover one event per real action, session rollover, visibility/idle timing, opt-out, unavailable storage/API, and unchanged dashboard/scorekeeper behavior. Verify public artifacts contain no analytics records or credentials and standalone recording remains offline-capable.

Before rollout, review the built feature and test results. Provision or connect the user's Atlas free cluster, configure restricted backend access and credentials, run collection/index setup, deploy API configuration/code, then publish tracked static assets. Never request credentials in chat or commit them. Check Atlas storage and operational limits against measured event volume, including engagement events and indexes. Verify with a controlled anonymous visit and confirm it appears only in the authenticated admin report. Disable collector configuration to roll back collection without touching basketball records. Production deployment remains a separate decision under the saved project handoff.
