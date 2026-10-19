# Anonymous visitor activity

Visitor activity is optional and separate from basketball records. MySQL remains the official game database; MongoDB holds one document per visitor event. The public basketball site still reads its published snapshot. Admin activity reports request fresh server summaries when opened, when dates change, and on Refresh activity. There is no polling.

## What is collected

Hosted dashboard and scorekeeper page openings; dashboard view changes; player/game opens; category and period filter selections; existing export initiations; approximate active milliseconds. Filters allow category `all`, `official`, `friendly`, and periods `career`, `year:YYYY`, `spring:YYYY`, `fall:YYYY` for years 2000–2099. Downloads allow events, participation, player_statistics, backup, and roster. Download initiation is not proof a file was saved.

The collector sends random visitor/session/event IDs, UTC event time, a coarse browser family and device category, and event-specific IDs/enums. No names, emails, PINs, search text, full URLs, raw IPs, downloaded files, or replay recording enter application analytics. Player/game IDs can be resolved to existing public labels. Hosting access logs are separately controlled.

IDs identify a browser, not a person. A visitor ID expires after a fixed 90 days. Each document load gets a fresh session to avoid cloned tabs sharing a session; reloads therefore count as another visit. Thirty minutes without interaction also starts a new session. Storage failure uses transient IDs. Clearing storage, blocked tracking, lost exit batches, or API downtime can reduce/split counts.

Active time is an estimate: only visible time within 60 seconds of interaction is eligible, in increments capped at 15 seconds. It excludes background time and can undercount interrupted visits. Batches send every 10 seconds, at most 20 events, with at most 100 events queued in memory. Transient retries reuse IDs. No persistent offline upload queue is created.

The notice offers Disable analytics; this clears IDs/unsent events and stops tracking in that browser, including other open tabs. DNT and GPC disable collection. Disabling does not delete already delivered records. Standalone `Front.html` and admin pages are not tracked.

## Setup (production deployment requires a separate decision)

1. Create or select an Atlas **Free M0** cluster; do not choose a paid upgrade automatically. Create a dedicated database such as `courtside_visitors`. Configure its database user for that database only and permit the backend's outbound addresses through Atlas network access. Use TLS and never publish the URI in client configuration.
2. Install `requirements.txt` in the backend environment. Set `VISITOR_MONGODB_URI` and `VISITOR_MONGODB_DATABASE` privately through the hosting secret settings. Do not paste credentials into chat or commit them. The production client uses TLS, a pool of at most 10 connections per worker, 3-second connection/server selection timeouts and 5-second socket/query timeouts.
3. Run `python -m scorekeeper_remote.visitor_setup` with these settings. It creates/updates collection validation and creates retention/query indexes. Run setup before accepting events. It does not alter MySQL. Repeating setup is safe when configured retention matches the feature's 90-day policy.
4. Deploy the API with the existing exact `ALLOWED_ORIGINS`. Missing or unreachable analytics configuration must not stop core API health or basketball functions. Admin reports show analytics unavailable, rather than presenting missing storage as zero traffic.
5. Enable `VISITOR_TRACKING_ENABLED=true` for API-driven publication, then publish static assets. For a local artifact, use `python -m scorekeeper_remote.publishing --output tests/artifacts/visitor-site --api-base https://YOUR-BACKEND --visitor-tracking`. Default builds have collection disabled. Only the public API URL and enable flag reach the browser.
6. Make a controlled visit, wait for the next batch, then log in as admin and open Visitor activity. Confirm the visit and timeline appear and anonymous API reads return 401. Verify actual Atlas storage growth before increasing event volume.

To stop collection, set `VISITOR_TRACKING_ENABLED=false` and republish. Already-open tabs continue using their loaded configuration until reloaded; disabling ingestion at the backend is a separate operational option. Basketball records are unchanged by this rollback.

## Retention, capacity, and reports

The collection has a receipt-time TTL index of 7,776,000 seconds. MongoDB deletes expired records asynchronously; reports independently exclude records older than 90 days. Any backups have their own operator-controlled retention. No daily cleanup job is necessary.

Start on the free tier and monitor both data and index size, connection count, request rate, and failed/timed-out queries. Engagement events also consume space. Bounded queries can still exceed free-tier resources with large volumes; the admin sees a retryable failure. No automatic paid upgrade is configured. Atlas current limits and pricing should be checked before provisioning: [pricing](https://www.mongodb.com/pricing), [free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

Reports default to seven UTC calendar days including today, at most 90 days. Event timestamps display in the viewer's local timezone. Counts use server receipt time. Visits count sessions with a page view; unique visitors count distinct visitor IDs among in-range events. Device/browser counts count sessions using their first page-view category. Active time sums engagement increments. Reports use two bounded aggregation queries, so concurrent ingestion can cause momentary differences between totals. Session lists show at most 50 rows per page, timelines at most 200. Records older than the selected window are omitted from timelines.

The collector endpoint accepts only configured origins, strict event shapes, and 16 KB/20-event batches. In-memory limits allow at most 120 requests/source/minute and 1,200 requests/process/minute; admin queries have a 120/process/minute limit. Source addresses are represented only by ephemeral keyed digests in the limiter, not saved in analytics. These are per-process controls, not distributed abuse protection. Public events can be spoofed; counts are not billing-grade.

## API

- `POST /api/visitor-events`: public, Origin required, JSON `{events:[...]}`; 202 with newly inserted count. Duplicate event IDs do not overwrite or count again. Invalid data 400; wrong type 415; oversized 413; rate limited 429; unavailable 503.
- `GET /api/admin/visitor-activity/summary?start=ISO&end=ISO`: admin bearer token; aggregate counts and popular entities.
- `GET /api/admin/visitor-activity/sessions`: same dates plus optional cursor/limit (maximum 50).
- `GET /api/admin/visitor-activity/sessions/UUID`: same dates plus optional cursor/limit (maximum 200).

Date bounds are inclusive start/exclusive end. Analytics responses use `Cache-Control: no-store`, including errors. Scorekeeper sessions cannot read reports.

## Local verification

Run Python unit tests and Node suites using the project environment. `tests/test_visitor_mongo.py` needs `VISITOR_TEST_MONGODB_URI` pointing to an isolated MongoDB server; it creates and removes randomly named `courtside_visitor_test_*` databases only. No production URI is appropriate for this suite. `tests/browser-visitor-activity.cjs` starts its own synthetic-data Flask server and runs headless Edge. Its Python executable defaults to `.local/venv/Scripts/python.exe` or `PYTHON`. The browser can be overridden with `EDGE_PATH`. Screenshots go to ignored `tests/artifacts/`.
