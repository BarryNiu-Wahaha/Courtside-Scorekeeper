# Visitor analytics handoff

Implemented on `feature/visitor-activity` in `.local/visitor-activity`, based on remote main `d776f7f`. Original root checkout remains on the separate readability refactor branch. Do not merge that refactor as part of this feature. Existing untracked backups, design artifacts, and CSVs were preserved.

The user approved anonymous visitor tracking, MongoDB storage alongside existing MySQL, and admin summaries fetched on open/range change/refresh. Native implementation was authorized with “do it.” Implementation is complete locally, independently reviewed, and tested. No cloud provisioning, paid upgrade, merge, push, or deployment has been performed.

See [verification](../../visitor-activity-verification.md) for exact passes, skips, known baseline dashboard reduced-motion failure, and implementation decisions. See [setup guide](../../visitor-activity.md) for Atlas/backend configuration and activation. The next production step needs the owner's deployment decision and private Atlas connection configuration, never credentials pasted into chat.

Local test Python: `.local/venv/Scripts/python.exe` within the feature worktree, using installed PyMongo 4.19.0. A local MongoDB binary is available under `.local/mongo/`; `.local/run_mongo_tests.py` launches it bound to loopback, runs isolated tests, and stops it. The browser E2E test uses synthetic data and a temporary in-memory Flask server. Screenshots are under `tests/artifacts/visitor-admin-{desktop,mobile}.png`.

Keep the worktree for review and release preparation. Collection defaults to disabled. The live website cannot display real visitor history from before deployment.
