# Remote uploads execution ledger

Plan: docs/superpowers/plans/2026-09-08-remote-uploads.md
Baseline: ea14711; branch: feature/remote-uploads.

The user authorized project work and waived repeated approval checkpoints. Work used the existing checkout on the feature branch; original game CSVs and the local production database were preserved.

- Task 1 complete: atomic MySQL upload and admin API, shared PIN sessions, validation, migration, publication revisions and TLS support. Backend commits 4175105 and 53c4d90.
- Task 2 complete: public statistics, admin forms, shared roster and finished-game uploads with persisted retry state. Frontend commits 512db95, 1d8ae3e and d6e3bb5; legacy support in be46f79.
- Task 3 complete locally: Cloudflare artifact publisher, Render Free deployment package and account setup instructions in be46f79. Live deployment requires owner accounts and secrets; Docker and provider connections remain unverified.
- Task 4 complete: API contract integration, independent reviews, unit and isolated MySQL tests, Edge browser checks and README handoff. Actual evidence and limitations are recorded in docs/remote-verification.md.

The implementation remains on the local feature branch. The Aiven database is initialized as recorded below; the backend and website are not yet deployed.

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

- Branch: `feature/remote-uploads`; latest commit at session start: `9a8c4c4`.
- Pre-existing uncommitted items: `.gitignore`, two original game CSV exports, `docs/database-er-diagram.html`, and `scripts/generate-er-diagram.py`. Preserve these and the local production database.
- This session only updated these handoff notes; no application changes or roster import was performed. The user requested that these notes be committed and pushed. Prior test results remain historical; tests were not rerun for this documentation update.
