# Offline roster and game lineups

Open `Front.html` in your browser. Everything below works locally; a remote database is not required. The app saves the roster and games on this device. Download a JSON backup before moving to another browser or device.

## Prepare the university roster

Open **Manage** beside the on-court panel. You can add a university player or edit an existing player's name, jersey number, enrollment year, and status override. Names and jersey numbers can change without changing the permanent player ID. Games that have not started update immediately, including the on-court panel and player-selection list. Started, finished, and upload-locked games retain their original game roster.

Enrollment year is optional. With automatic status, a player enrolled in 2022 becomes `graduated` on September 1, 2026. Before that date the status is `Astudent`. An unknown year gives `Unknown`. Choose a manual `Astudent` or `graduated` override for exceptions; choose **Automatic** to restore the enrollment-year rule. Students, graduates, and players with unknown status can all be selected for games.

For bulk updates, first use **Export roster CSV**. Edit that file in a spreadsheet and keep each existing `player_id` unchanged. Then use **Import roster CSV**, review the additions and updates, and confirm. Players absent from the file remain in the roster. Import validates the entire file before any change is applied.

### Hosted Admin roster

In the hosted app, **Admin → University roster → Save roster** updates the shared database. The scorekeeper checks that roster when its page opens and before creating a game. **Manage → Download shared roster** checks immediately if the page is already open. Saving in Admin does not push a live update into another open tab; use that button or refresh the scorekeeper.

The shared roster determines the selectable university players: old built-in defaults and local-only players are not mixed into it. Their identities remain in the JSON backup's `localRosterArchive`, and started games keep their original players, stats, and minutes. An unstarted game's valid squad, starters, and guests are preserved. If its selected five include players absent from the official roster, choose the squad and starters again.

The roster status above the scorekeeper shows when the latest check succeeded. If the server is offline or takes longer than 15 seconds, the app keeps its saved roster and explicitly says it could not check for updates. A server waking from sleep may require another **Download shared roster** attempt. Empty or malformed responses do not erase the saved roster.

A local CSV import still changes only this browser. For lasting changes shared by hosted scorekeepers, save them in Admin. A later successful shared-roster check restores the database's version of the selectable roster.

For entirely new players, start with [the blank CSV template](../examples/roster-template.csv). The required columns, in order, are:

```csv
player_id,player_name,jersey_number,enrollment_year,status_override
```

Add one player per row. The name and jersey number are required; jersey numbers are whole numbers from 0 to 99. Leave enrollment year and status override blank when unknown or automatic. An override must be exactly `Astudent` or `graduated`. A blank ID receives a permanent ID when imported into the app. After importing, export the roster again and use that version for future updates and MySQL import. Reimporting an original file with blank IDs would create new identities. Do not use the reserved `P_GUEST` ID for a university player.

## Designate players before tip-off

1. Create a game with the date, opponent, and period lengths.
2. In the selection popup, check **Squad** for 5–15 players.
3. Check **Starter** for exactly five of those players.
4. Use **Add a guest for this game** for someone outside the permanent roster. Each guest has a local name and number, counts toward the 15-player limit, and can start.
5. Select **Confirm five**, then **Start game** at tip-off.

The squad stays fixed after play starts. Before starting, **Choose game players** lets you revise the squad and starters. CSV imports, shared-roster downloads, and edits in Manage refresh unstarted games while preserving their selected squad, starters, and guests. Newly added teammates become available in **Choose game players**; they are not automatically placed on court. Existing recorded games and player minutes remain unchanged.

## Record and substitute

The scoring panel shows the current five. Select a player and tap the shot or other stat. Original starters keep a starter marker even after substitutions.

Select **Substitute** to pause the clock and open this game's designated squad. Uncheck outgoing players and check incoming players, making several swaps if needed. Confirm with exactly five selected. A player who leaves the court is cleared as the selected scorer. Confirming or canceling leaves the clock paused; press **Resume** when play restarts.

Minutes accumulate only while the game clock runs, stop at zero, and carry across quarters and overtime. Paused time does not count. Manual clock corrections change the displayed clock without rewriting accumulated minutes. **Undo last** voids a stat event, not a substitution. **Box score** shows measured minutes, including zero minutes for unused designated bench players.

Old games recorded without lineups have no historical minutes. Archived games remain viewable and their event logs can still be exported. To continue an unfinished old game, select its squad and current five before resuming. That game has **partial** participation: only time measured from the new lineup onward is available, and the original starters are unknown.

## Save and transfer the data

| Export | Where to find it | What it contains |
| --- | --- | --- |
| Roster CSV | Manage → Export roster CSV | Every permanent university player, including those with no game actions |
| Event log CSV | Export Game Event Log | One row per action, including voided actions |
| Participation CSV | Box score → Export participation CSV | Designated players, starter/appearance counts, and measured milliseconds |
| JSON backup | Download backup | Complete local roster, games, individual guests, and history for restoration |

Guests remain separate players in the app. Database-facing event and participation exports replace their identities with `P_GUEST`, name `Guest Player`, and jersey `0`. Event rows remain separate so no shots or scores disappear. Participation adds their counts and minutes: two guests playing ten minutes each produce twenty guest player-minutes.

Export a fresh participation file after making game changes. It includes a revision so older data cannot replace newer imported participation. Use the [MySQL pipeline guide](mysql-pipeline.md) for upgrading your existing database and importing each CSV type. Uploading or importing a file in the offline browser does not itself write to MySQL.
