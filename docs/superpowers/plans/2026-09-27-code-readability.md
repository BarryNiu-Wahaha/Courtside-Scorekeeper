# Code Readability Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Make CourtSide understandable to a junior software engineer without changing any existing appearance or feature.

**Architecture:** Keep the existing modules, browser globals, API contracts, and build process. Use automated formatting with syntax-tree equivalence checks for the broad cleanup, then make focused naming and control-flow improvements in the most densely written logic.

**Tech Stack:** Plain JavaScript, Python, Flask, MySQL, standalone HTML builds.

**Spec:** The user's request in this conversation: simplify this project's code for a junior SWE while preserving all appearance and features.

## Global Constraints

- Preserve markup, CSS, strings, formulas, CSV formats, persistence, errors, and operation ordering.
- Keep existing test files unchanged; use them as regression checks.
- Do not touch user data, credentials, untracked design work, SQL schema, or deployment state.
- Format only tracked application JavaScript/Python and the two build scripts. Temporary tooling stays under ignored `.local/`.
- Regenerate `Front.html` with `node build.cjs`; do not edit the generated application manually.
- No runtime dependencies or frameworks added.

## Review Focus

- Unknown lineup coverage must not produce fabricated plus/minus values.
- CSV output must preserve Unicode, quoting, BOM, column order, and CRLF.
- Failed persistence must roll back finalization before a download can occur.
- Upload retries must preserve the exact payload and uncertainty lock.
- Dashboard eligibility and denominator calculations must remain identical.

### Task 1: Expand compressed application code

**Files:** `src/*.js`, `site/*.js`, `scorekeeper_pipeline/*.py`, `scorekeeper_remote/*.py`, `build.cjs`, `scripts/build-site.cjs`.
**Interfaces:** All existing exports, globals, function signatures, and side effects remain unchanged.

- [x] Run the original JavaScript and Python suites as a baseline.
- [x] Save baseline source copies under `.local/readability-baseline/`.
- [x] Format JavaScript with Prettier and Python with Black; compare parsed syntax trees before writing each file.
- [x] Run the existing unit suites and build.

### Task 2: Clarify domain logic

**Files:** `src/corrections.js`, `src/player-analytics.js`, `src/result-export.js`, `site/analytics.js`, `scorekeeper_remote/statistics.py`, `scorekeeper_remote/lineups.py`.
**Interfaces:** Keep all public names and serialized field names. Rename local variables, expand nested conditions, and explain non-obvious preservation rules.

- [x] Use descriptive local names for corrections, shots, players, stats, and lineup coverage.
- [x] Expand nested status decisions and game filters into explicit branches without changing evaluation order.
- [x] Run the relevant regression suite after each module change.

### Task 3: Verify and document

**Files:** `Front.html`, `docs/code-guide.md`, `docs/code-readability-verification.md`, `README.md`.

- [x] Rebuild the standalone recorder and local public/admin test sites.
- [x] Run JavaScript, Python, isolated MySQL, and all four browser regression suites.
- [x] Verify static markup/styles are unchanged and compare representative browser screenshots with baseline captures.
- [x] Review the diff for changes to behavior, outputs, and unrelated files.
- [x] Add a short junior-oriented guide to the modules and safe edit/build/test workflow.

## Execution Notes

- Baseline: 71 JavaScript tests passed; Python discovery ran 64 tests, 40 passed and 24 MySQL-dependent tests skipped.
- Ruling: execute the authorized refactor directly in this checkout on a dedicated local branch. Do not add a second worktree or stop for routine implementation choices.
- Ruling: this is a behavior-preserving refactor, not a feature or bug fix. Existing regression tests plus syntax-tree equivalence guard the formatting pass; no intentionally failing tests are needed for whitespace changes.

- Final review: no actionable findings; independently checked syntax trees and unchanged markup.
- Verification: 71 JavaScript, 40 Python, 24 isolated MySQL cases passed; three original browser suites passed. The original dashboard suite retains its pre-existing reduced-motion failure. See docs/code-readability-verification.md.
