# MySQL pipeline verification — 2026-09-07

- Confirmed installed MySQL 9.7 service running and localhost:3306 reachable. No user credentials were available to the agent; the user's scorekeeper schema has not been initialized by the agent.
- Conda msba: Python 3.12.13, installed PyMySQL and SQLAlchemy. The pipeline uses PyMySQL and standard-library CSV/unittest; no packages were installed.
- `conda run --no-capture-output -n msba python -m unittest discover -s tests -p "test_pipeline*.py"`: 11 tests passed, no failures. Includes validation, Unicode, CSV escaping, invalid values/headers/metadata, invalid timezone offsets, command-line validation and rejection before credentials/connection.
- `conda run --no-capture-output -n msba python tests/run_mysql_tests.py`: 10 real MySQL tests passed, no failures. A fresh loopback-only temporary MySQL instance was used; the production localhost:3306 was not used for integration tests. Test databases and server files were cleaned up.
- Verified actual frontend CSV export through the new validator: 17 events accepted; nonvoid HOME score 9 matched the frontend fixture.
- Executed all four supplied Workbench SELECT queries against test data and checked scores, shooting percentages, history and event counts.
- Independent review found malformed offset normalization by Python. Added regression coverage and restricted timezone offsets before parsing. No remaining high/medium review findings.

## Remaining local step

The user needs to run the documented init-db command with their own MySQL username and enter the password privately. This is the only unverified production setup step. No synthetic games have been inserted into the user's database. API/website work is outside this stage.
