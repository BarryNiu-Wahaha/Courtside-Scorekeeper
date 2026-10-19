# Anonymous Visitor Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect anonymous CourtSide activity in MongoDB and expose fresh summaries and session timelines through the existing admin login.

**Architecture:** Browser events go through the existing Flask server to a separate MongoDB repository. Basketball records remain in MySQL and the public basketball dashboard keeps using published snapshots. Admin reports query the API on opening, date changes, and explicit refresh, without polling.

**Tech Stack:** Vanilla JavaScript, Flask, PyMongo, MongoDB Atlas Free M0 initially, existing Python unittest and Node test/browser tooling.

**Spec:** `docs/superpowers/specs/2026-10-19-visitor-activity-design.md` (read alongside this plan).

## Global Constraints

- Retain analytics for 90 days: TTL `7776000` seconds; also exclude expired documents in queries.
- Never collect names, emails, raw IPs, PINs, typed search text, full URLs, downloaded contents, or fingerprints.
- Track hosted dashboard and hosted scorekeeper only; no admin or standalone offline tracking.
- Session idle cutoff: 30 minutes. Visitor ID expiry: fixed 90 days. Tabs have separate sessions.
- Engagement: visible document and activity within 60 seconds; increments at most 15000 ms.
- Ingestion: at most 20 events and 16 KB; flush every 10 seconds; in-memory queue at most 100.
- Admin range defaults to seven days, maximum 90; page sizes at most 50 sessions and 200 events.
- Analytics failures must not break basketball functionality; database secrets remain backend-only.
- No merge/deployment of the readability refactor; preserve all untracked user artifacts. No paid service upgrade.

## Review Focus

1. Cloned tabs can inherit sessionStorage: rotate the session ID for a new document/tab (Task 4).
2. Partial batch success followed by timeout: retries must not double-count (Tasks 2 and 4).
3. An old report request resolves after logout or a new date query: never display stale/private data (Task 6).
4. Hidden-tab throttling and system clock changes: never inflate active time (Task 4).
5. Missing MongoDB configuration or network failure: existing MySQL routes and public pages still work (Tasks 3 and 7).

## Execution preparation

- [ ] Read using-git-worktrees and the selected execution skill. Create an isolated worktree under `.local/visitor-activity` on `feature/visitor-activity` from the verified production baseline. Local `main` currently points to `d776f7f`; confirm remote main before choosing the base. Do not base implementation on `8797bfc`, the unapproved readability refactor.
- [ ] Copy only the approved spec and this plan into the worktree. Re-read target files there: line numbers and formatting differ from the current refactor checkout. Preserve the original checkout and untracked files.
- [ ] Establish the baseline with `node --test` and `python -m unittest discover -s tests`. Record pre-existing failures and skipped database tests separately; the saved handoff identifies a pre-existing dashboard reduced-motion assertion failure.

## File boundaries

| Files | Responsibility |
| --- | --- |
| `scorekeeper_remote/visitor_validation.py` | Event and report parameter contracts |
| `scorekeeper_remote/visitor_repository.py` | MongoDB and memory repository implementations |
| `scorekeeper_remote/visitor_routes.py` | Ingestion, authentication integration, rate limiting, report responses |
| `scorekeeper_remote/visitor_setup.py` | Idempotent collection validation/index setup CLI |
| `scorekeeper_remote/app.py` | Inject repository and register routes using existing role checker |
| `site/visitor-tracking.js` | Identifiers, event queue, active time, opt-out and transport |
| `site/visitor-admin.js` | Admin report fetches, summaries, sessions, timeline |
| Existing HTML, `site/public.js`, `src/app.js` | Narrow instrumentation and mount points |
| `scorekeeper_remote/publishing.py` | Hosted-only enable flag and script allowlist |
| `docs/visitor-activity.md`, `.env.example`, `requirements.txt` | Operations guide, configuration, driver dependency |

### Task 1: Define and validate event/report contracts

**Files:** Create `scorekeeper_remote/visitor_validation.py`, `tests/test_visitor_validation.py`.

**Interfaces:** `validate_batch(payload: dict, now: datetime) -> list[dict]`; `validate_report_range(args, now) -> tuple[datetime, datetime]`. Raise existing `ValidationError`. Wire envelope is `{events: [...]}`; event fields are `event_id`, `visitor_id`, `session_id` (UUIDs), `event`, `page`, `properties`, `occurred_at`, `device`, `browser`. Server supplies `received_at`; browser category is an enum, never a raw user-agent. Dates are UTC; report range is start-inclusive/end-exclusive.

- [ ] Write `test_unknown_fields_rejected`, `test_batch_limits`, `test_clock_bounds`, `test_event_properties`, `test_report_range`: assert 21 events fail, 20 pass, engagement 15001 fails, 15000 passes, timestamps older than 24 hours or over five minutes ahead fail, unknown keys/search text fail, ranges longer than 90 days fail. Require `type(value) is int` for duration, excluding booleans.
- [ ] Run `python -m unittest discover -s tests -p test_visitor_validation.py`; confirm failure from missing implementation.
- [ ] Implement allowlists from spec. Export kinds: `events`, `participation`, `player_statistics`, `backup`, `roster`. Filters must use actual finite options found in dashboard handlers; document the exact allowlist in the new module and guide. Bound entity IDs to 128 characters and known public ID syntax. Allow browser families chrome/edge/firefox/safari/other and device mobile/tablet/desktop/unknown. Encode unsupported classifications as other/unknown.
- [ ] Run the same tests and require all pass; commit only task files as `feat: validate visitor analytics contracts`.

### Task 2: MongoDB persistence and reporting

**Files:** Create `scorekeeper_remote/visitor_repository.py`, `scorekeeper_remote/visitor_setup.py`, `tests/test_visitor_repository.py`, `tests/test_visitor_mongo.py`; modify `requirements.txt`, `.env.example`.

**Interfaces:** Both `MemoryVisitorRepository` and `MongoVisitorRepository` expose `insert_events(events: list[dict]) -> int`, `summary(start, end) -> dict`, `sessions(start, end, cursor=None, limit=50) -> dict`, `timeline(session_id, start, end, cursor=None, limit=200) -> dict`. Mongo implementation supplies `from_env()` and `setup()`. UTC `datetime` parameters; JSON responses serialize timestamps to ISO UTC strings. `insert_events` returns newly inserted count. Repository unavailable errors are mapped at the API boundary.

Summary shape: `{visits, unique_visitors, page_views, active_ms, daily, popular_players, popular_games, devices, browsers}`. Grouped lists use `{key,count}`; daily uses `{date,visits}`. Device/browser counts count sessions with page views, using first page view's category. Sessions response: `{items:[{session_id,label,started_at,last_seen_at,event_count,active_ms}],next_cursor}`. Timeline response: `{items:[{event_id,event,page,properties,occurred_at,received_at}],next_cursor}`. All results are restricted to the requested receipt-time window; session count requires a page view. Unique visitors count distinct IDs among events in the range. Session list sorts last receipt descending, then session ID; timeline sorts receipt ascending, then event ID. Cursors encode and validate those keys, never executable query fragments.

- [ ] Write memory tests: duplicate event inserted twice yields one stored document; three page views in two sessions yield `visits == 2`; two IDs yield `unique_visitors == 2`; expired events contribute zero; tied timestamps paginate without omissions. Include device counts independent of repeated clicks.
- [ ] Run `python -m unittest discover -s tests -p test_visitor_repository.py` and confirm failure.
- [ ] Implement memory repository, then Mongo equivalent using `$match` before grouping, bounded `maxTimeMS`, and stable sorting. Use `_id=event_id`, unordered batch inserts; ignore only duplicate-key failures. Reuse one lazy Mongo client per app worker, pool maximum 10, server-selection/connect timeout 3000 ms, socket/query timeout 5000 ms. Close clients in tests. Add `pymongo>=4.10,<5`; resolve a compatible installed version during implementation and verify supported API behavior from official documentation.
- [ ] Implement `python -m scorekeeper_remote.visitor_setup`: create/adjust collection validator and indexes idempotently. Require private URI/database settings. Use regular collection, not time-series. Add receipt TTL and session/receipt/_id plus visitor/receipt indexes. Keep credentials and connection exceptions out of printed output.
- [ ] Add isolated Mongo integration tests gated by `VISITOR_TEST_MONGODB_URI`, using only randomly named `courtside_visitor_test_*` databases. Assert real aggregation parity, concurrent duplicate retries, validation rejection, TTL settings, repeatable setup, and expired filtering. Tear down only the generated test database. Verify partial insert failure retry does not double-count. Run memory and real Mongo tests; a skip is not integration evidence.
- [ ] Commit task files as `feat: store anonymous visitor events in MongoDB`.

### Task 3: Ingestion and admin API

**Files:** Create `scorekeeper_remote/visitor_routes.py`, `tests/test_visitor_api.py`; modify `scorekeeper_remote/app.py`.

**Interfaces:** Extend `create_app(repository=None, publisher=None, config=None, visitor_repository=None)` compatibly. `register_visitor_routes(app, visitor_repository, require_role)` receives the existing role checker. Routes: `POST /api/visitor-events`, `GET /api/admin/visitor-activity/summary`, `GET /api/admin/visitor-activity/sessions`, `GET /api/admin/visitor-activity/sessions/<session_id>`. GET parameters `start`, `end`, `cursor`, `limit`; use Task 2 response shapes. Ingestion returns 202 `{accepted: newly_inserted_count}` after durable insertion.

- [ ] Write tests asserting unauthorized GET is 401, scorekeeper is 403, admin is 200 with `Cache-Control: no-store`; disallowed/missing Origin ingestion is 403; non-JSON is 415; oversized body is 413; bad payload is 400; limit exhaustion is 429; Mongo failure is 503. Test actual read-size enforcement when Content-Length is missing, plus existing game routes with analytics unavailable.
- [ ] Run `python -m unittest discover -s tests -p test_visitor_api.py` and confirm failure.
- [ ] Implement routes with explicit allowed origins and bounded body reads, without lowering the existing game-upload body limit. Use keyed in-memory source digests, bounded limiter entries, and expiry; 120 requests/minute/source plus 1200/process. Trust only configured proxy handling, not arbitrary forwarded-IP headers. Do not log raw IP or payloads. Apply a bounded global admin-query rate limit as well to protect free-tier capacity; return retryable 429.
- [ ] Lazy optional Mongo configuration must not gate application startup or existing `/api/health`. Add admin-only analytics readiness via the report response/error state; absence of credentials reports unavailable, not fake empty data. Browser unavailability stays nonfatal.
- [ ] Run visitor API tests plus `python -m unittest discover -s tests -p test_remote_api.py`; require pass; commit as `feat: expose protected visitor activity reports`.

### Task 4: Browser event collector

**Files:** Create `site/visitor-tracking.js`, `tests/visitor-tracking.test.cjs`.

**Interfaces:** Browser global `CourtSideVisitor.create({apiBase,enabled,page}, dependencies?) -> {track(event,properties),disable(),destroy()}`. Export factory for Node tests without starting browser collection. Injectable clock/storage/transport/document enables deterministic tests. Instance handles page view, lifecycle and active time. `track` becomes a no-op when disabled; callers never await collection.

- [ ] Write tests for disabled configuration, DNT/GPC, opt-out persistence, throwing storage, UUID expiry, new-document session rotation, 30-minute idle rollover, hidden/idle time, clock jumps, 20-event batching, 100-event cap, network timeout, retry IDs, and disable clearing queued events. Assert typed/search data cannot enter allowed payloads. Use a monotonic timer for active duration and wall clock only for timestamps/expiry.
- [ ] Run `node --test tests/visitor-tracking.test.cjs`; confirm missing-factory failure.
- [ ] Implement collector with 10-second batching, engagement flush every 15 seconds, fetch keepalive on exit, request timeout, and at most three transient retries (1/2/4 seconds; respect bounded Retry-After). Retry network/429/5xx only. Preserve IDs for retries. Cancel requests/timers on disable/destroy; an already-sent request cannot be recalled. A new session emits a page view before subsequent activity. Rotate session for each new document to avoid cloned tabs sharing an ID; document reloads also start a session. Visitor ID expiry stays fixed, not sliding.
- [ ] Run tests, require pass; commit as `feat: collect anonymous browser activity safely`.

### Task 5: Hook real actions and hosted publication

**Files:** Modify `site/index.html`, `site/public.js`, `src/app.js`, `scorekeeper_remote/publishing.py`, `tests/test_remote_publishing.py`; create `tests/visitor-instrumentation.test.cjs`; rebuild `Front.html` with `node build.cjs`.

**Interfaces:** Optional calls to Task 4 instance occur only after successful user actions. Publishing adds `visitorTrackingEnabled` boolean to public config; default false unless explicitly enabled. Dashboard loads config, collector, then public script in order. Hosted Front injects collector before inline app initialization; standalone output has no collector/network dependency.

- [ ] Write assertions for exactly one player/game event per open, no events from rerenders, finite filter choices only, download events only after export succeeds, and canceled export producing zero events. Publication tests assert allowlisted new files, no Mongo URI/records, collector before app initialization, and disabled default.
- [ ] Run `node --test tests/visitor-instrumentation.test.cjs` and `python -m unittest discover -s tests -p test_remote_publishing.py`; confirm new behavior fails first.
- [ ] Add narrow hooks in actual navigation, player/game opening, filter changes, and export handlers. Download means initiated browser download, not confirmed file saved. Do not introduce a new export feature or generic click capture. Add notice and disable control to hosted tracked pages; exclude admin. Extend publisher allowlist for the collector, keep existing snapshot keys unchanged, and propagate the explicit feature flag through CLI/environment publishing paths without breaking existing signatures.
- [ ] Run `node build.cjs`, both targeted suites, and existing recorder Node tests; require pass; commit as `feat: instrument hosted CourtSide activity`.

### Task 6: Admin reports and timelines

**Files:** Create `site/visitor-admin.js`, `tests/visitor-admin.test.cjs`; modify `site/admin.html`, `site/admin.js`, `site/site.css`, `scorekeeper_remote/publishing.py`, `tests/test_remote_publishing.py`. Add the admin script to the publication allowlist with its HTML reference.

**Interfaces:** `CourtSideVisitorAdmin.mount(container, {request, resolvePlayer, resolveGame}) -> {refresh(),destroy()}`. Inject the existing authenticated request adapter so credentials are never copied to storage. Destroy on logout. Query summary and sessions on mount, range change, or refresh; timeline on session selection. No polling.

- [ ] Test seven-day default and 90-day maximum, summary rendering, real empty state, unavailable/retry state, pagination, logout clearing, and request races. Resolve older requests after a newer query/logout; assert old results never render. Assert labels use textContent for untrusted IDs and server values.
- [ ] Run `node --test tests/visitor-admin.test.cjs`; confirm failure.
- [ ] Implement metric cards, UTC date-range inputs, device/browser and popular-view lists, paginated sessions and timeline. Display timestamps locally with timezone label. Convert end-date selection into an exclusive UTC boundary. Preserve existing game/roster management when analytics fails. Use sequence tokens and cancellation for stale requests. Show approximate-time/estimated-visitor explanations and database unavailability distinctly from zero visits.
- [ ] Run targeted suite and existing admin browser checks; require no new regressions; commit as `feat: show private visitor summaries and timelines`.

### Task 7: End-to-end verification and release guide

**Files:** Create `tests/browser-visitor-activity.cjs`, `docs/visitor-activity.md`, `docs/visitor-activity-verification.md`; update `docs/remote-deployment.md`, `docs/remote-api.md`, `README.md` with only relevant additions.

- [ ] Add a browser scenario using isolated backend/test data: anonymous dashboard visit, player/game/filter actions, hosted export, then admin report and ordered timeline. Assert another visitor cannot read reports, opt-out stops requests, admin is not tracked, standalone remains offline, and Mongo outage does not affect basketball pages. Test mobile layout and a cold/slow API. Use existing browser launch conventions and hidden helper processes on Windows.
- [ ] Run `node tests/browser-visitor-activity.cjs`, `node --test`, `python -m unittest discover -s tests`, isolated Mongo integration tests, `node build.cjs`, and `git diff --check`. Run existing MySQL/browser suites where environments are available. Record actual passes, skips, and baseline failures without treating skips as passes.
- [ ] Write setup instructions for Atlas Free M0, backend-only URI/database variables, restricted user/network access, setup CLI, hosted enable flag, storage monitoring including engagement volume/indexes, TTL timing, manual refresh semantics, opt-out, rollback, and analytics limitations. Do not promise free capacity or automatic paid upgrades.
- [ ] Review completed changes against spec and record findings. Commit code/tests/docs only. Present the feature and verification results before any deployment decision; prior handoff requires separate deployment approval. No production credentials or cloud accounts are needed to finish local implementation/testing if an isolated MongoDB instance is available.

## Deployment checklist (after separate authorization)

- [ ] Connect Atlas free cluster with credentials entered privately; confirm TLS and backend access.
- [ ] Run idempotent setup; verify validation and TTL/query indexes.
- [ ] Deploy API with tracking still disabled; confirm basketball health and authenticated reports.
- [ ] Publish hosted scripts with tracking enabled; perform one controlled visit and verify admin-only visibility.
- [ ] Record initial storage/event volume and confirm rollback toggle. Do not upgrade billing automatically.

## Plan self-review

Spec requirements map to Tasks 1–7: privacy/identifiers/retention, bounded ingestion, session metrics, MongoDB isolation, protected UI, hosted build controls, failure handling, and release evidence. Review Focus cases have explicit owning tests. Report fields and repository signatures are consistent across tasks. Deferred production provisioning is intentional and does not block local product implementation. Execution method awaits user selection.
