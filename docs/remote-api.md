# Remote API and database

The Flask API stores completed games atomically in MySQL. Recorder credentials allow initial uploads only. Admin credentials allow corrections, soft deletion, restoration, roster updates and publication retries. Public snapshots contain no credentials, audit history or raw CSV documents.

## Configuration and invocation

Set `SECRET_KEY` to a random secret of at least 32 characters, and set distinct `SCOREKEEPER_PIN` and `ADMIN_PIN` values of at least eight ASCII digits. Set `ALLOWED_ORIGINS` to a comma-separated list of exact frontend origins. Requests are bounded to 2 MiB. Signed bearer sessions expire after one hour; five failed PIN attempts per client and role in five minutes trigger 429. Deploy one Gunicorn process with four threads so the in-memory throttle is shared.

Set `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, and `MYSQL_SSL_CA` (path to the provider CA certificate). Non-loopback API database connections require the CA file and verify the certificate and hostname. Existing `python -m scorekeeper_pipeline` commands also honor `MYSQL_SSL_CA`.

Explicitly initialize/upgrade the selected database and adopt existing games:

```sh
python -m scorekeeper_remote migrate
```

This additive command creates remote tables, retains all existing game/event/participation data, and adopts games without remote metadata into admin management. Adopted games have a reserved original hash that can never match recorder uploads. Games without participation retain unknown minutes (`null`) in public snapshots; admins may replace them with a complete valid export. Repeating migration does not change adopted versions or publication revisions.

Start the API with `gunicorn --workers 1 --threads 4 --timeout 240 'scorekeeper_remote.app:create_app()'`. Configure publication with `PUBLIC_API_BASE`, `CLOUDFLARE_PROJECT`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`; see [deployment](remote-deployment.md). Failed deployment leaves committed data pending for retry.

## Endpoints

All errors use `{error:string}`. Authentication failures return 401, insufficient roles 403, invalid documents 400, immutable-upload or expected-version conflicts 409, large bodies 413, throttling 429, and unavailable services 503. Unexpected errors are sanitized.

- `POST /api/session`: `{role:"scorekeeper"|"admin",pin:string}` returns `{token,role}`. Send `Authorization: Bearer <token>` on protected requests.
- `GET /api/health`: `{status:"ok"}` without connecting to MySQL.
- `GET /api/roster`: `{players:[{player_id,player_name,jersey_number,enrollment_year,status_override}]}`.
- `POST /api/games`: authenticated `{schema_version:1,finished:true,events_csv:string,participation_csv:string}` returns `{game_id,version,unchanged,publication,publication_state}`; 201 for first save, 200 for exact original retry. A valid BOM-prefixed header-only event CSV is accepted for 0-0 games. Participation must describe the same game and contain all event players; active events require an appearance. Guest identity is anonymous. University IDs must already be roster-managed, while historical name/jersey snapshots may differ from the current roster.
- `GET /api/admin/games`: `{games:[{game_id,game_date,opponent,version,deleted}],publication}`.
- `GET /api/admin/games/<id>`: `{game_id,version,deleted,upload}`.
- `PUT /api/admin/games/<id>`: `{version,upload}` replaces both exports atomically, retains the original digest, and audits the previous document.
- `POST /api/admin/games/<id>/delete` or `/restore`: `{version}` changes soft-deletion state and increments the version.
- `GET /api/admin/roster`: same roster shape; `PUT` accepts `{roster_csv}` and retains absent roster players.
- `POST /api/admin/publish`: returns `{publication,state,revision,published_revision,error}` after the attempt. All admin endpoints require the admin role.

Mutation responses include `publication:"published"|"pending"` and fresh `publication_state`. An exact recorder retry never overwrites an admin correction or restores a deleted game. Correcting an unknown roster ID in a new upload returns 400; submitting different content under an existing game ID returns 409.

## Persistence and publication

`sql/remote.sql` adds `remote_uploads` (version, original digest, deletion flag and current CSV documents), `remote_audit` (prior version/document and action), and singleton `remote_publication` (current and published revisions, state and sanitized failure). Existing `games`, `players`, `events`, `game_participation`, and `participation_snapshots` remain compatible with CSV tooling. API mutations serialize on the publication singleton and commit exports, audit and revision in one transaction; errors roll everything back.

A dedicated MySQL connection holds a database-specific `GET_LOCK` across consistent snapshot extraction, deployment and marking the captured revision published, releasing in `finally`. Snapshot reads use one repeatable-read transaction. Deployment holds no row locks, so concurrent mutations can commit; a newer revision remains pending. Another publication request returns pending while a deployment owns the lock. Retry always rebuilds from current database data.

Run `python -m unittest discover -s tests -p "test_*.py"` for Python unit/CSV coverage, and `python tests/run_mysql_tests.py` for real integration coverage. The latter starts a temporary loopback-only MySQL instance and deletes only its own generated directory; it never uses the production server on port 3306.
