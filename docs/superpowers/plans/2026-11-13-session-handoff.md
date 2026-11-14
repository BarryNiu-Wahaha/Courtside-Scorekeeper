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
