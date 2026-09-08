# Remote uploads and published statistics — approved design

## Scope and approval
User approved Cloudflare Pages + Render Free + Aiven Free MySQL on 2026-09-08 and explicitly requested autonomous implementation without repeated permission questions. Work on feature/remote-uploads in the current workspace because the sandbox is broken; preserve untracked game CSVs and local production database. No paid services or paid domain. Hosting accounts/credentials are not available yet; prepare runnable deployment artifacts and verify locally, then report the specific deployment prerequisites.

## Product
One team, one recorder per game. Public statistics require no authentication. One shared scorekeeper PIN grants initial completed-game upload only; a different admin PIN grants roster management, corrections, soft deletion, restoration, and publication retry. PINs are server-side secrets, never committed or embedded in generated pages. Shared PIN does not identify an individual recorder. Only finished games upload. Offline recording remains local; an upload is explicit, with retry after connection failure. Pending payloads persist without PINs. After successful upload, disable recorder reopening and mutating that game's local authoritative copy. Server authorization is authoritative even if local state is tampered with.

## API contract
Backend uses Flask and PyMySQL with TLS certificate and hostname verification for remote MySQL. Existing CSV commands remain compatible.
- POST /api/session body {pin,role:"scorekeeper"|"admin"} -> {token,role}; expiring signed bearer token, rate-limited PIN attempts.
- GET /api/health -> {status:"ok"} without database credentials or internal errors.
- POST /api/games bearer scorekeeper/admin, body {schema_version:1,finished:true,events_csv:string,participation_csv:string} -> {game_id,version,unchanged,publication:"published"|"pending"}. Both exports describe same game and are validated before a single database transaction writes both. No implicit roster changes for university players: require roster-managed IDs and consistent existing identity snapshots between exports, permit P_GUEST anonymous aggregate only. Canonical server roster is authoritative for future games, historical snapshots preserved. Empty event log permitted for valid completed 0–0 game with nonempty participation.
- GET /api/admin/games bearer admin -> {games:[{game_id,game_date,opponent,version,deleted}],publication:{...}}.
- GET /api/admin/games/<id> bearer admin -> {game_id,version,deleted,upload:{schema_version,finished,events_csv,participation_csv}}.
- PUT /api/admin/games/<id> bearer admin body {version,upload} replaces validated event and participation snapshot atomically; preserves game ID and logs prior document. Allows metadata and stat/minute corrections; normal validation remains required. Original submission digest remains fixed so network retries cannot overwrite admin changes.
- POST /api/admin/games/<id>/delete and /restore bearer admin body {version}; soft delete keeps records, excludes game from public stats, restoration reverses deletion. Version conflicts return 409.
- GET /api/admin/roster -> {players:[{player_id,player_name,jersey_number,enrollment_year,status_override}]}.
- PUT /api/admin/roster body {roster_csv} validates and applies roster changes, retains absent players. Serialize roster updates with uploads.
- POST /api/admin/publish -> publication status, retry newest snapshot.
- GET /api/roster -> same public university roster fields needed to create games (exclude secrets).
Errors JSON {error:string}, meaningful 400/401/403/409/413/429/503. Bounded 2MB request, no stack traces. CORS only configured frontend origins and explicit Authorization header; no wildcard origin with credentials.

## Persistence and correctness
Add remote game metadata/version/original submission hash/deleted flag, audit history, and durable publication revision/state alongside existing five tables. A single transaction covers game/events/participation plus audit and publication revision. Same game id initial duplicate yields unchanged without mutation; differing payload yields 409, including after admin deletion. Concurrent first uploads serialize. Admin expected version prevents lost updates. Failed validation or database operation rolls back everything. Existing populated local games get adopted by explicit remote migration rather than silently overwritten by scorekeepers. Existing CLI behavior must remain verified.
Publication lock serializes snapshot extraction/deployment so older state cannot overwrite newer published results. Snapshot reads are consistent and read-only. A mutation sets pending; publication failure never undoes a committed upload. Retry rebuilds current data rather than trusting stale transient process files.

## Public snapshot contract
JSON at /data/stats.json:
{schema_version:1,revision:integer,generated_at:ISO_UTC,roster:[{player_id,player_name,jersey_number,enrollment_year,status_override}],games:[{game_id,game_date,opponent,home_points,away_points,coverage,players:[{player_id,player_name,jersey_number,played_ms,played_count,starter_count,designated_count,stats:{points,fgm,fga,threeMade,threeAttempts,ftm,fta,offensive,defensive,rebounds,assists,steals,blocks,turnovers,fouls}}]}]}.
Only nondeleted games and nonvoid stats contribute; participation preserves unused bench. Guest name is Guest Player only. Partial coverage remains visible; unknown minutes are null. No PIN/session/private audit/raw backup or individual guest names in public artifacts. Backend adapter supplies snapshot; publisher callable publish(snapshot:dict)->None raises on failed deployment.

## Website and recording UI
Public landing page displays team record, games, player totals/shooting percentages/minutes, game box scores, last published timestamp. Division by zero uses em dash; games played derives participation, not event count.
Admin page asks for admin PIN, lists games with edit/delete/restore, editable event rows and participation minute/count fields, metadata, roster fields, and publication status/retry. Standard form controls, never a raw JSON editor as sole edit UI. Destructive UI actions confirm the named game. Expired session asks for PIN again and retains unsaved form contents.
Scorekeeper upload button opens PIN dialog only when finished. API base comes from public config, never secret. Persist canonical pending CSV payload so retry does not increment participation revision; prevent duplicate in-flight requests. Network failures retain payload and local game. Display uploaded / saved-publication pending accurately. Download current server roster explicitly and merge through existing roster parser for future games.

## Hosting and publication
Cloudflare Pages Direct Upload project hosts static public site + admin + scorekeeper + public JSON. Render Docker web service runs Python API, Gunicorn and installed Wrangler CLI. Backend prepares temporary static artifact directory from repo assets and latest snapshot, invokes Wrangler using server-side token/account/project environment, checks result, and cleans own temp directory. No secrets copied into artifact. Do not rely on Render filesystem persistence or background work surviving sleep.
Render sleeps after 15 idle minutes and wakes on a request (~1 minute); Aiven may require owner restart after inactivity. Existing published statistics remain served from Cloudflare without DB/API requests. No guaranteed uptime. Free quotas must be respected; no periodic keepalive. Use provider subdomains and no paid upgrade/overage. Published deletion only takes effect when deployment succeeds; admin UI reports pending explicitly.

## Verification
Pure unit tests for bundle validation, PIN role/expiry/throttling and snapshot calculations. Real isolated MySQL tests for initial upload, duplicate retry, stale edits, rollback, unknown roster IDs, soft deletion/restore, migration, audit, publish failures and order. Browser/DOM tests for finished-only uploads, payload reuse, offline retention, admin role enforcement and public rendering. Existing 24 engine/team tests, CSV validation suite and isolated MySQL regressions remain green. Fake deployment transport tests ensure artifacts contain public data only and failed publication remains pending. Cloud deployment cannot be claimed verified without actual accounts.
