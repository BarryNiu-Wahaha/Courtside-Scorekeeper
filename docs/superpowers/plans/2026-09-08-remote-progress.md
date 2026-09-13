# Remote uploads execution ledger

Plan: docs/superpowers/plans/2026-09-08-remote-uploads.md
Baseline: ea14711; branch: feature/remote-uploads.

The user authorized project work and waived repeated approval checkpoints. Work used the existing checkout on the feature branch; original game CSVs and the local production database were preserved.

- Task 1 complete: atomic MySQL upload and admin API, shared PIN sessions, validation, migration, publication revisions and TLS support. Backend commits 4175105 and 53c4d90.
- Task 2 complete: public statistics, admin forms, shared roster and finished-game uploads with persisted retry state. Frontend commits 512db95, 1d8ae3e and d6e3bb5; legacy support in be46f79.
- Task 3 complete locally: Cloudflare artifact publisher, Render Free deployment package and account setup instructions in be46f79. Live deployment requires owner accounts and secrets; Docker and provider connections remain unverified.
- Task 4 complete: API contract integration, independent reviews, unit and isolated MySQL tests, Edge browser checks and README handoff. Actual evidence and limitations are recorded in docs/remote-verification.md.

The implementation has been fast-forward merged into `main` on 2026-09-09 with the user's approval. Continue future work from `main`. The Aiven database is initialized. Render backend health was confirmed by the user and the initial Cloudflare website was uploaded on 2026-09-13; see the latest handoff below.

## Session handoff — 2026-09-09

### Completed since the implementation handoff

- The user created an Aiven MySQL service and downloaded its CA certificate. The local certificate is `ca.pem` in the project root; `.gitignore` has an uncommitted `*.pem` exclusion.
- The user ran the remote migration from their own PowerShell terminal with the Aiven settings and CA certificate. They reported: `Remote schema ready; adopted 0 legacy games. Existing records preserved.` This is user-reported live migration evidence, not an agent-run test.
- The user configured MySQL Workbench and confirmed that the tables are visible under `defaultdb`.
- No roster import was performed in this session. The user chose to defer it. Import the current roster before uploading games.

### Connection context

- Retrieve the host, port, and username from the existing Aiven service's connection information or the user's saved Workbench connection.
- Database: `defaultdb` (use this instead of the example `scorekeeper` database name).
- Local CA: project-root `ca.pem`. Remote connections must verify TLS certificates and hostname.
- The password was entered privately by the user; it was not supplied in chat or saved in these notes.
- The migration used a Python `getpass` prompt, with the password held only in that child process. Other connection environment variables were set in the user's PowerShell session; do not assume they persist in a new terminal or are available to the agent. The application does not automatically load `.env` files.

### Resume here next time

1. Continue with `docs/remote-deployment.md`: create/configure a Cloudflare Pages Direct Upload project and its restricted publishing token. This was the next proposed step; it was not performed in this session.
2. Deploy the Python backend on Render using the provided deployment package. Configure the Aiven connection with `MYSQL_DATABASE=defaultdb`, the CA secret file, separate private PINs, allowed origin, signing secret, and publishing credentials. Keep credentials private and out of Git/chat.
3. Export the user's current roster from the existing scorekeeper, then preview `python -m scorekeeper_pipeline import-roster "PATH_TO_ROSTER.csv"` against Aiven. Apply with `--apply` after checking the preview. The importer prompts privately for a password when `MYSQL_PASSWORD` is unset. Do not substitute the blank template or fabricate a roster.
4. Build/publish the initial website and perform the documented hosted upload/publication checks. The successful database migration does not establish that the API or website is deployed. Docker, Render, Cloudflare publication, and hosted end-to-end behavior remain unverified.

### Working tree to preserve

- Integration verification on 2026-09-09: 36 JavaScript tests, 29 Python tests, all 22 isolated MySQL integration tests, and both Edge browser suites passed. The fast-forward merge preserved the exact tested implementation. The user's Aiven database and local production database were not used by these tests.

- Branch: `feature/remote-uploads`; latest commit at session start: `9a8c4c4`.
- Pre-existing uncommitted items: `.gitignore`, two original game CSV exports, `docs/database-er-diagram.html`, and `scripts/generate-er-diagram.py`. Preserve these and the local production database.
- This session only updated these handoff notes; no application changes or roster import was performed. The user requested that these notes be committed and pushed. Prior test results remain historical; tests were not rerun for this documentation update.


## Session handoff ? 2026-09-13

### Completed today

- Continue from `main` in `D:/Downloads/GCMC/Experiences&Project/ScoreKeeper`.
- Deleted the older separate checkout `D:/Downloads/ScoreKeeper` at the user's explicit request. The comparison found no unique project files outside Git metadata and dependency/cache directories; game CSVs and diagram files matched the retained copy.
- The user created the Render backend at https://courtside-api-hrhm.onrender.com and reported `{"status":"ok"}` from `/api/health`. This confirms process health only, not database access or publication.
- Built the initial static website with that backend URL using `node scripts/build-site.cjs --output tests/artifacts/cloudflare-initial-20260913 --api-base https://courtside-api-hrhm.onrender.com`.
- Created `tests/artifacts/courtside-cloudflare-upload.zip`. Verified all 10 allowed public files, ZIP integrity, the backend URL in both config.js and Front.html, and empty initial statistics. No credentials or local game backups were included. These generated artifacts remain local.
- The user uploaded the initial assets to Cloudflare Pages and supplied https://courtside-team.pages.dev/ as the website URL. This is user-reported deployment evidence; no agent-run hosted end-to-end test was performed.
- Provided instructions for setting Render's Cloudflare variables, but the user did not explicitly confirm that all four were saved and redeployed. Verify this next time.
- No roster import, real game upload, admin correction, or API-driven publication was performed. The user explicitly deferred roster work and requested a documentation/GitHub wrap-up.

### Resume here next time (supersedes the earlier resume list)

1. Confirm the Render service has these values and has been redeployed:
   - `PUBLIC_API_BASE=https://courtside-api-hrhm.onrender.com`
   - `ALLOWED_ORIGINS=https://courtside-team.pages.dev` (no trailing slash)
   - `CLOUDFLARE_PROJECT=courtside-team`
   - `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` entered privately; the token needs Cloudflare Pages Edit permission for the owner's account.
   - `MYSQL_DATABASE=defaultdb`, the actual Aiven host/port/user/password, and `MYSQL_SSL_CA=/etc/secrets/aiven-ca.pem` with the certificate added as a Render secret file.
   - `SECRET_KEY` and separate private scorekeeper/admin PINs. Do not print or commit secret values.
2. Ask the user to open their existing local scorekeeper, choose Manage ? Export roster CSV, and save it in the current project folder. No roster CSV has been supplied yet. Preserve original player IDs; do not use a blank template or fabricate a roster.
3. Preview the roster import against Aiven `defaultdb` with verified TLS, then apply the reviewed import. Use the local `ca.pem` for this connection and a private password prompt. The earlier deployment guide's example database name `scorekeeper` must be overridden with `defaultdb`.
4. Open https://courtside-team.pages.dev/admin.html and publish latest statistics with the admin PIN. Confirm database access, publication credentials, and public results. Do not re-upload the empty initial ZIP after real statistics have been published.
5. Verify the hosted scorekeeper can download the shared roster and complete an upload; check saved and published status separately. Continue the documented admin correction/delete/restore checks with agreed test data and record results in `docs/remote-verification.md`.

### Verification and local files

- Today's site build and ZIP checks passed. Application tests were not rerun because no application behavior was changed; September 9 test results above remain historical.
- The standalone Front.html was regenerated by the build; Git reports no content diff (line-ending normalization only).
- Preserve the two original game CSVs, `docs/database-er-diagram.html`, `scripts/generate-er-diagram.py`, local certificate, and local production database. These are not part of the deployment handoff commit.
- The certificate exclusion `*.pem` is included in the wrap-up commit so the local CA file stays out of Git.
