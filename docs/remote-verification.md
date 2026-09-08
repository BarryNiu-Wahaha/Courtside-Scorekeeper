# Remote upload verification

Verified on 2026-09-08 on feature/remote-uploads, implementation through be46f79.

- JavaScript engine, team and remote unit suites: 36 passed.
- Python unittest discovery: 51 discovered, 29 passed and 22 database tests skipped without the isolated server.
- Isolated real MySQL runner: all 22 database tests passed on temporary loopback port 53476, including the 13 existing pipeline tests and 9 remote integration tests. The existing database on port 3306 was not used.
- Existing Edge browser smoke passed, including CSV exports. Download verification now waits for file completion.
- Remote Edge browser suite passed against a local static server and mocked API responses. Covered invalid PIN and validation recovery, lost-response retry, reload during unresolved upload, uploaded-game locking, admin draft preservation on reauthentication, versioned corrections, and legacy participation import.
- Static site artifact build passed. Public-page screenshot was visually inspected. Publisher tests exercise the real artifact builder and mock the external deployment command.
- Independent frontend review findings were fixed and reviewed again. Final whole-branch review found no additional actionable findings; see remote-final-review.md.

## Limits

No Docker executable was available, so the Docker image was not built. No real Cloudflare deployment, Render service, Aiven TLS connection, or hosted end-to-end upload has been verified. Follow remote-deployment.md to configure the owner accounts and secrets, then perform the documented deployment checks. Public snapshots are designed to remain available independently of the upload API.

Existing local production data and the two original untracked game CSV exports were preserved. Credentials are not included in the public artifact.
