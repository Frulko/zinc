# Backlog review 2026-10-25: brief for the review agents

The owner asked for a full review of the backlog after release 0.8.0: what is already done, what is left, duplicates, useless tasks, a new
priority. You review one part (your shard) and write a result; the coordinator merges all parts and applies the changes. **You change no file
of the repository except your two result files** (`docs/reports/backlog-review-2026-10-25/<shard>.json` and `<shard>.md`). No build, no test run
longer than a few seconds, no git commit, no backlog CLI command that writes.

## Context you need (read once, quickly)

- `AGENTS.md` (the project, the backlog rules, "Keep the backlog shrinking", the owner's priorities), `RULES.md` §4 (how choices are scored).
- `docs/reports/backlog-review-2026-10-10.md` sections 1-2 (the previous review: method, classes, score). Its result
  `docs/reports/backlog-review-2026-10-10.json` has a line per task as it stood then.
- `backlog/priority.json` (the groups of the order now), `CHANGELOG.md` (what shipped up to 0.8.0, Unreleased included).
- What changed since the last review, that makes tasks obsolete: the Node prototype (`compiler/`, `sim/`) was removed on 2026-10-20 (tag
  `prototype-final`): a task that only serves it is useless. The repository root is now the engine (old paths `next/...` moved to the root).
  Shipped since: the device agent (`zinc agent`, `zinc device`: pairing, deploy, dev --device, screen, screen --live, OTA), the Pi OS image and
  its builder app, packaging (`zinc pack`, .zapp, signed updates), releases with CI on tags, macOS 12 floor, consoles work (PSP, Vita, 3DS cores).
- The owner's goal (2026-10-11): desktop and mobile apps the way Electron makes them, without a browser; accent on UI, performance and the
  widest range of hardware; users: education, makers, artists, DIY. Mac first; the cross-platform pass (Windows first, then handhelds, boards,
  mobile last) at the end.

## For every task of your shard

Read the whole task file (description, acceptance criteria, notes). Then **check the code**: is what it asks already there? Use `git log
--oneline --grep '<id>'` (commits name tasks rarely; also grep the title's key words), grep the sources (`src/`, `runtime/`, `lib/`,
`plugins/`, `tools/`, `tests/`, `targets/`, `image/`, `app/`), the tests named in the criteria (`tests/run --only <name>` only if it takes seconds
and proves a verdict; `ZINC=build/zinc`). A verdict "done" needs evidence: a file:line, a test name, a commit.

Verdicts (one per task):
- `done`: everything it asks exists (evidence). Also for a Review task whose remaining step is done.
- `done-partly`: most exists; say exactly what is left (that becomes the rewritten task).
- `keep`: still to do, still useful, well written.
- `rewrite`: still useful but the text is stale (paths, prototype, a decision that changed); give the new title/description/criteria in short.
- `merge`: the same work as another task (`into`: the id that stays; say what to carry over).
- `drop`: useless now (the prototype, superseded by a decision or another design, a measure nobody needs, an idea with no user). Say why.
- `split`: too big for one session; name the parts (titles only).
- `park`: needs hardware, Windows or a paid account the owner does not have now (label `parked`), or is far from the goal.
- `review-close`: status Review and the person/board step it waits for is not worth keeping open: close (done) or drop, say which.

Marks for `keep`, `rewrite`, `done-partly`, `split` (1 to 5, as in the 2026-10-10 review): `value` (to the goal and the owner's asks), `novelty`
(what a user sees), `unblocks` (open tasks behind it), `confidence` (it can be finished and proven on the development Mac), `effort` (S 5, M 3,
L 1), `risk` (5 isolated, 1 deep in IR/runtime/raster/layout/text/ui.ts). And `lane`: `mac` (Mac work), `cross` (the cross-platform pass),
`parked`.

Duplicates: look across your shard, and grep the titles of the other open tasks (`grep -l` on `backlog/tasks/*.md` whose status is not Done)
for the same subject: a duplicate may be in another shard. Also compare with `backlog/later.md` lines (a task that is also a later line).

Tasks with an `assignee` are being worked by another session: give a verdict but say `"assigned": true`; the coordinator will not change them.

## Result files

`<shard>.json`: a JSON array, one object per task, in this shape (keep strings short, one or two sentences):

```json
{"id": "ZN-123", "title": "...", "status": "Backlog", "milestone": "m-21", "assigned": false,
 "verdict": "done", "evidence": "src/host/mirror.cpp:120; tests/t1/device_screen.sh", "into": "", "reason": "...",
 "new_title": "", "rewrite": "", "parts": [],
 "marks": {"value": 0, "novelty": 0, "unblocks": 0, "confidence": 0, "effort": 0, "risk": 0}, "lane": "mac", "size": "S"}
```

`<shard>.md`: one page for the owner: counts per verdict, the notable findings (big tasks already done, real duplicates, what is obsolete and
why), the 10 tasks of your shard that matter most and why, anything that surprised you. English, plain sentences.

Finish with a final message of five lines: counts per verdict and the path of your files.
