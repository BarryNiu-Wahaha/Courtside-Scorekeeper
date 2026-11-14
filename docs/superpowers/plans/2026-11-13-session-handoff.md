# November 13, 2026 — visitor analytics GitHub preparation

## Scope and product intent

The owner requested Git management and uploading the visitor analytics work to
GitHub. Continue on `feature/visitor-activity`; do not merge the independent
readability refactor. Production deployment and paid services still require
explicit authorization. No production settings or databases were changed today.

The immediate purpose is to understand website reach, player-detail popularity,
and feature usage. Existing reports count player opens, visits, estimated unique
browsers, and selected actions. Per-player unique audiences, return-visitor
analysis, exposure funnels, and randomized A/B experiments are future work, not
implemented capabilities. Low click counts alone do not establish a UI problem.

## Fresh verification

- 85 JavaScript tests passed.
- Python discovery: 88 run, 57 passed, 31 database integration tests skipped.
  MongoDB and MySQL integration suites were not rerun today; see October's record
  for historical integration evidence.
- Standalone build and `git diff --check` passed. The build made no tracked change.
- Visitor end-to-end browser test passed outside the sandbox: player/game opens,
  filters, export initiation, private reports/timeline, mobile/desktop, opt-out,
  anonymous report denial, and exclusion of admin-page tracking.
- The first sandbox browser attempt timed out during CDP `Runtime.enable`, before
  application assertions. The same test passed outside the sandbox without code
  changes. The separate dashboard reduced-motion known failure was not retested
  or fixed.

The old feature virtual environment points to a missing Python installation.
An ignored replacement is `.local/release-venv/Scripts/python.exe` inside this
worktree (Python 3.14.9, dependencies installed from requirements.txt).
Set `PYTHON` to its absolute path for the visitor browser test.

## Production configuration: read-only findings

Existing private local credentials successfully accessed Render. The service is
`courtside-api`, configured for branch `main`. Its service environment has neither
`VISITOR_MONGODB_URI` nor `VISITOR_MONGODB_DATABASE`. No secrets were printed or
copied into tracked files. The user says a cloud MongoDB exists, but its account,
cluster, connection, network rules, and initialization have not been verified.

Remote main was verified as `d776f7fac3029381e4e92fe34fc80e7325bdc98f` before push;
the feature branch did not yet exist remotely. The existing implementation is
committed locally; today's additional commit records this handoff. Push only the
feature branch, preserving the worktree and all unrelated artifacts.

## Next step

Obtain access to the owner's existing MongoDB cluster through private local or
hosting configuration (never chat credentials). Configure a dedicated database
and suitable user/network rules, run the documented setup/index command, then
perform authorized integration and deployment. Start with collection disabled;
verify a controlled visit and private report after enabling hosted publication.
Uploading code to GitHub does not activate collection or recover past visits.

## Follow-up: Atlas configured and initialized

The owner created Atlas and saved Render environment settings. A fresh read-only
check confirmed nonempty MongoDB settings, no password placeholder, and collection
disabled. The configured dedicated database is `courtside_visitor` (singular), a
valid name; retain this configuration rather than requiring the example spelling.

Using the privately retrieved Render settings, the local client connected and
initialized `visitor_events`. Verification found five indexes including `_id`,
with receipt-time retention of 7,776,000 seconds (90 days). A seven-day summary
query succeeded with zero visits. No synthetic events were inserted. Credentials
were never output or committed, and no MySQL data was changed.

These checks ran from the local computer, not from Render. Render outbound
connectivity remains a deployment check. The service still targets `main`, and
tracking remains disabled. Production release is still pending explicit owner
authorization. The existing tested feature is on GitHub at
`feature/visitor-activity`; release should include only that branch, not the
readability refactor. Next: authorize integration/deployment, verify the deployed
API and MongoDB reports, then enable hosted tracking and check a controlled visit.

## Authorized deployment progress

The owner explicitly authorized merging main, deploying Render/site, enabling
tracking, and a controlled visit. They also requested ongoing AGENTS.md updates.
Root and feature AGENTS.md now track progress; the feature copy is committed.

GitHub main fast-forwarded to `47aa4ec` without the readability refactor. Render
deployed that exact commit and reports live. `VISITOR_TRACKING_ENABLED` is now
true in the backend environment, but no new public site publication has occurred.
The authenticated visitor summary returns 503 from Render, despite successful
local MongoDB setup/query. Asked the owner to add all Render service Connect →
Outbound IP ranges to Atlas Network Access. This is a suspected network-access
issue, not yet a confirmed cause; the Render region is Ohio.

Resume with the ignored root helper `.local/visitor_release.py check`, then
`publish` and `verify` only after the live MongoDB query succeeds. Its separate
state file stores release metadata and a pre-publication public snapshot. It does
not reuse stale September migration/backup state. Public snapshot reads use curl:
Python urllib received HTTP 403 while curl returned 200. No game writes or MySQL
migrations were performed. Backend deployment is complete; public analytics
activation and controlled browser verification remain outstanding.
