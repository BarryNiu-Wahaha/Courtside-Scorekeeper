# Final resolution at `d6e3bb5`

All four findings in this scoped frontend review are resolved. The final P1 follow-up in `1d8ae3e..d6e3bb5` persists `uncertain=true` before dispatch, retains prior uncertainty separately for the current attempt, and preserves the lock after a reload followed by a definitive rejected retry. A genuinely first attempt with definitive rejection still unlocks. Authentication failure before preparation remains safe. No regression found in this scoped final check.

Verification: independently reran all 12 focused Node remote tests successfully. Inspected the new Edge reload-during-pending-POST then 400 regression; parent reports that browser test passed. Edge was not rerun by this reviewer. Historical findings and intermediate status below are retained for traceability and are superseded by this final resolution.


## Fix review at `1d8ae3e`

Reviewed `512db95..1d8ae3e` against the four findings below. All 10 focused Node remote tests pass. Parent reports the expanded Edge regression passed after first reproducing roster loss; this follow-up inspected that test without rerunning Edge.

- **Roster reauthentication loss: resolved.** `rosterLoaded` initializes the roster independently of `detail`, preserving existing inputs and model across reauthentication. Explicit logout confirms discard.
- **Roster edits during save: resolved for the reported path.** Existing buttons, inputs and selects are disabled during requests, then their original disabled states restored. The delayed-save browser assertion covers this roster lock.
- **Unknown total minutes: resolved.** All-null totals remain null; mixed known/unknown minutes produce a marked known subtotal. Both cases pass focused tests.
- **Rejected-upload lock: original case fixed, but P1 recovery gap remains.** Authentication precedes preparation, and first definitive rejection unlocks. However, the pending record persisted before POST lacks an `uncertain` flag. Close/reload during POST, allowing a server commit before any browser success/catch handler. The recovered pending record still lacks uncertainty. If its retry POST returns 401 (for example token expiration between login and submission), `failed` deletes `remote`, unlocking a potentially official game. A direct JSON-round-tripped pending-record reproduction followed by `failed(g,{status:401})` produced `g.remote === undefined`. Persist uncertainty before dispatch, retaining whether uncertainty preceded this attempt so only a truly first definitive rejection unlocks; alternatively conservatively classify recovered pending payloads as uncertain. Add a reload-before-response followed by rejected-retry regression. Affected: `src/app.js` before `remoteClient.upload`, `src/remote.js` `failed`.

Original findings follow for history.
# Remote frontend and publisher review

Scope: `df2837a..512db95`, approved remote-upload design, recorder integration, public/admin pages, publisher and new tests. Backend files under construction were excluded. Findings below follow directly from the inspected control flow; the existing browser smoke uses mocked HTTP and does not exercise these failure cases. No live Cloudflare deployment was verified.

## P1 — Definitively rejected uploads permanently lock the local game

**Files:** `src/app.js:217`, `src/app.js:228`, `src/app.js:208`; `src/remote.js:21`.

**Repro:** Finish a game, submit its upload, and receive a validation rejection (for example, a correctable invalid event). `prepare` sets and persists `remote.state = 'pending'` before authentication or submission. Every exception retains that state and payload. Reopen is thereafter disabled and the handler rejects every game with `remote`; Retry resends the same rejected payload indefinitely. The admin cannot correct a game that was never accepted. Even a failed login creates this lock before the game submission has occurred.

**Minimal fix:** Distinguish “submission might have committed” from failures before submission and definitive validation rejection. Preserve the exact payload and lock for ambiguous network outcomes and conflicts with an existing official record; allow an explicit cancel/correct path when no submission occurred or the server definitively rejected it without creating a game. Test failed login and a 400 validation rejection in addition to the existing lost-connection retry.

## P2 — Reauthentication discards unsaved roster edits

**File:** `site/admin.js:19` (login handler), together with `loadRoster` and `run`.

**Repro:** Unlock admin, edit a roster name without opening a game, then save with an expired session. The 401 shows login and initially preserves the inputs. After entering the PIN, `detail` is null, so login calls `loadRoster`, replacing the edited model and controls with the server copy. This directly contradicts the requirement to retain unsaved form contents after session expiry. An expired session during Refresh/Publish has the same effect on pending roster edits.

**Minimal fix:** Track roster initialization/dirty state independently of the game editor. On reauthentication retain the existing roster model and allow retry of Save; only load the roster on initial login or an explicit confirmed discard. Add a 401 → login → retry browser case with a changed roster value.

## P2 — Roster edits made during save disappear when the response arrives

**File:** `site/admin.js:9`, `site/admin.js:27`.

**Repro:** Change a roster field and click Save roster with a slow server/publication response. `run` disables buttons but leaves all inputs/selects editable. Make another name/status edit while waiting. The request already contains the first snapshot; its success handler calls `loadRoster`, replacing the second unsaved edit without warning. A sleeping backend makes this window substantial.

**Minimal fix:** Disable the relevant form inputs/selects while their save is outstanding (restore their prior disabled states), or track edits after submission and avoid overwriting them when reloading. Test an edit attempted during a delayed save.

## P2 — Unknown aggregate minutes are displayed as zero

**Files:** `src/remote.js:44-47`, `site/public.js:7`.

**Repro:** Publish a player appearing only in games whose `played_ms` is null. Aggregation initializes minutes to zero and adds `Number(p.played_ms || 0)`, producing `0.0*` on the season table, while the same game box score correctly displays an em dash. Unknown time has become a numeric zero despite the snapshot contract requiring unknown minutes to remain null. The test titled “excludes missing minutes” contains no null minute input.

**Minimal fix:** Track whether any minute value is known; emit null when none is known, and keep the partial marker for known subtotals when other appearances have unknown time. Add all-null and mixed-known/null aggregation cases.

## Review observations

Game corrections retain the loaded `detail.version` rather than replacing it on list refresh, so a stale editor still sends its original expected version. A 409 leaves its input model available; server enforcement must be verified in the backend integration suite. The publisher builds into a fresh temporary directory, explicitly selects public fields/files, normalizes guest identity, passes credentials through the child environment, and suppresses deployment output in raised errors. No concrete secret leak was found in these inspected paths. Actual provider deployment, publication ordering, backend authorization, and database snapshot consistency remain outside this frontend/mock-transport review.
