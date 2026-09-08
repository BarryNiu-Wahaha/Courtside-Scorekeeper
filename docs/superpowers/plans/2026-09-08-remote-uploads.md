# Remote Uploads Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task. User authorized autonomous work; no routine approval checkpoints.

**Goal:** Deliver deployable completed-game uploads, PIN-protected administration, and independently hosted public statistics.
**Architecture:** Existing offline engines export a stable bundle to Flask. MySQL atomically stores that bundle and revisions; a synchronous, serialized publisher deploys a public snapshot to Cloudflare Pages.
**Tech Stack:** Python/Flask/PyMySQL/Gunicorn, vanilla JavaScript, MySQL, Wrangler CLI, Render Docker, Cloudflare Pages.
**Spec:** docs/superpowers/specs/2026-09-08-remote-uploads-design.md

## Global Constraints
Free only; one team; shared upload PIN and separate admin PIN. User expressly waived repeated process approvals. Preserve local production database and untracked CSVs. No credentials or private game backups in Git or public deployments. Remote uploads write events and participation in one transaction. Only admin may change stored games. Retain current CLI contracts.

## Task 1: Atomic upload service and administration API
Files: create scorekeeper_remote/{__init__,app,auth,bundles,repository,statistics}.py, sql/remote.sql, requirements.txt, tests/test_remote_api.py, tests/test_remote_mysql.py. Modify scorekeeper_pipeline/database.py only for additive TLS support or reusable transaction helpers; tests/run_mysql_tests.py to include both integration suites.
Interface: full API and public snapshot in spec; create_app(repository=None,publisher=None,config=None) injectable Flask app; publisher(snapshot) returns None or raises. Document final environment and invocation in docs/remote-api.md for other tasks.
- [x] Write behavior tests with valid 5-player fixtures asserting upload returns a game and duplicate has no second row; malformed participation returns 400 and leaves no game.
- [x] Run conda run -n msba python -m unittest discover -s tests -p test_remote_api.py -v; observe missing service failures.
- [x] Implement validators and PIN sessions, using existing CSV readers through bounded temporary files; route validated objects through repository atomic operations. Implement single-transaction writes, expected-version admin operations, server roster authority, audit and publication state.
- [x] Add MySQL integration tests covering rollback, concurrent duplicates, stale versions, deleted retry, admin corrections and zero-event games; run isolated runner.
- [x] Verify legacy validation and MySQL tests; commit only task-owned files.

## Task 2: Public/admin frontend and scorekeeper upload
Files: create site/{index.html,admin.html,site.css,public.js,admin.js,config.js}, src/remote.js, tests/remote.test.cjs. Modify src/{app.js,template.html}, build.cjs and generated Front.html.
Interface: API and snapshot as spec. remote.js exports browser/Node RemoteClient with stable payload preparation, authenticated requests, upload response state and role errors. site/config.js sets global COURTSIDE_CONFIG={apiBase:""}; no secret values.
- [x] Write node tests for finished-only payload, unchanged retry CSV, error retention and responses before implementation; run node --test tests/remote.test.cjs.
- [x] Implement public snapshot renderer with textContent and explicit numeric ratios; admin forms edit CSV rows using safe DOM, parsed/serialized CSV, expected versions and visible publish status.
- [x] Add recording upload dialog/current-roster download; prevent mutation after confirmed upload, keep original offline behavior when no API configured. Disable same-game double submission.
- [x] Run frontend tests and current engine/team suite, build, and actual Edge smoke with downloadable exports.
- [x] Commit only task-owned files after review.

## Task 3: Cloudflare publisher and deployment package
Files: create scorekeeper_remote/publishing.py, tests/test_remote_publishing.py, Dockerfile, render.yaml, .dockerignore, .env.example, scripts/build-site.cjs, docs/remote-deployment.md.
Interface: publish(snapshot:dict)->None; factory wires configured publisher into app, absent settings keep publication pending. Static artifact includes site files, rebuilt Front.html, nonsecret API config and data/stats.json only.
- [x] Test artifact contents and secret exclusion; mock only external command transport, test real artifact builder.
- [x] Implement isolated temp directory + installed Wrangler subprocess with timeout, captured sanitized failure, token in environment only.
- [x] Add Node/Python multi-stage Docker image, one Gunicorn worker with threads and bounded deployment timeout; TLS environment config. Render blueprint explicitly selects free.
- [x] Write exact account/setup/migration/secret/deployment/backup instructions and paid-overage avoidance. Verify provider docs.
- [x] Run publisher tests and compile/build checks; commit owned files.

## Task 4: Integration, review and handoff
- [x] Review API/frontend/publisher property names, HTTP routes, response and CSV contracts; fix mismatches.
- [x] Run all unit and isolated MySQL tests plus browser checks; record actual evidence in docs/remote-verification.md.
- [x] Review authorization bypass, deleted duplicate resurrection, publisher ordering, guest privacy, 0-game/0-event snapshots, stale admin edits and offline retry.
- [x] Update README to distinguish locally implemented features from deployment prerequisites; preserve user's finished-project overview.
- [x] Commit verified changes on feature branch. Report live deployment prerequisites accurately without claiming deployment.
