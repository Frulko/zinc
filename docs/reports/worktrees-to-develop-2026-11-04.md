# What develop lacks: every worktree and branch, 2026-11-04

Read-only inventory against `develop` at `ffb2561ab`: 42 worktrees and the branches without one. Nothing was merged, moved or deleted.

"In develop" and "in the merge" compare commit subjects as well as patches (`git cherry`), because a commit cherry-picked with a resolved
conflict has another patch. So this list says the commit was landed, not that every line survived. Conflict counts come from
`git merge-tree`, which changes no branch.

## 1. The release line: 0.10.14 to 0.10.18 is not in develop

`develop` and `origin/develop` diverged (160 and 45 commits). The releases were cut from `release-0.10`, so `main` holds 41 commits that
`develop` lacks: Pi screen rotation (Display section), portrait layouts, under-voltage warning, screenshots and live screen with planes,
`tools/pi-install-dev`, image decoding on a worker, smooth stretch, music-tree caches, multi-touch rotation in fbdev.

**`merge/origin-develop` already holds this merge.** It is 2 commits behind `develop`, and merging those 2 is clean in simulation.
RESUME.md warns that 23 files it changes hold uncommitted work in the main tree.

These contain nothing beyond that merge, so they need no integration of their own:
`zinc-release`, `main`, `integrate`, `agent-a0127d57`, `agent-a8b2375e`, `agent-a90ba40b`, `agent-ab8eae29`, `agent-ac31ff6c`.

## 2. Commits that are nowhere in develop or in the merge

| Work | Where (the tip that holds it) | Commits | Conflicts | Note |
|---|---|---|---|---|
| Hamlet: terrain, clusters, missions, Cite GPU view, economy | 13 parallel agent tips, see below | 37 distinct subjects | clean one by one, up to 37 in a chain | the hard part |
| Engine work carried by the Hamlet branch: `Array.fill`/`set` as a block, `--native`, worker numeric arrays, `ZINC_CLOCK_TICK`, closure names in the profiler, Math constants, an IR vtable fix | `agent-a8c6ceee` (8), `agent-af0403a4` (the rest) | about 15 | 3 to 5 | land before Hamlet |
| GPU: Metal renderer, transparent render targets, partial image updates, GPU frame stats, sprite bench | `agent-aa54022f` | 6 | 2 to 3 | `targets/macos/hal_metal.mm` exists in the main tree: compare first |
| CarPlay: 103 carplay commits, plus transparent groups and alpha masks in the raster, percent widths, `.ttf` by path, `toString(radix)`, `Array.push` with several values | `carplay-finish` (121) | 121 | 13 | `raster-alpha` adds no commit (0 not in `carplay-finish`); the backup branch is included too |
| CarPlay, uncommitted | `raster-alpha`: 4 files, the golden and test `carplay_local_ui` | 4 + untracked | | commit before anything |
| React on Zinc (Athena): CommonJS, `react-dom` preset, `zinc:ui/fiber`, CSS animations, HTTP keep-alive | `zinc-athena` | 9 | 24 | oldest (2026-10-21) and most conflicts |
| Render thread on macOS, compositor rotations | `integrate-compositor` | 3 | 6 | no render-thread commit in develop |
| js-anatomy SVG scene | `wip/zn-727-anatomy` | 1 | 2 | unfinished |
| Text and UI from the prototype era (2026-09-28) | `worktree-agent-a3d5891c`, `worktree-agent-aa66ffba` | 10 | 31, 16 | they touch `compiler/`, removed on 2026-10-20: archive, do not merge |

### The Hamlet chain

The tips were developed in parallel. Merged in this order over `merge/origin-develop`, each conflict count below is what that tip adds:

| Tip | Conflicts | | Tip | Conflicts |
|---|---|---|---|---|
| `agent-a1c51ce9` | 0 | | `agent-a7111765` | 24 (atlas PNGs) |
| `agent-af58f7fc` | 6 | | `agent-a28aa876` | 16 |
| `agent-a7de0b00` | 2 | | `agent-aead4a50` | 2 |
| `agent-ac1af072` | 12 | | `agent-ab564fa2` | 11 |
| `agent-a2719f69` | 2 | | `agent-a8c6ceee` | 3 |
| `agent-a6c6c433` | 4 | | `agent-aa54022f` | 2 |
| | | | `agent-af0403a4` | 37 |

The simulation carries conflict markers forward, so the later counts are upper bounds, and a different order gives different numbers.
Tips inside another tip need no merge: `a32d1d46` and `acb91399` (in `a6c6c433`), `a67f4bfc` and `af5f90dc` (in `a28aa876`), `a95c392e` (in
`a2719f69`), `a5ccf960` (in `af0403a4`), `a9103fc3` (in `aa54022f`).

Hamlet also needs `examples/pixel-plays/`, which is untracked everywhere, so a clean tree of develop cannot build it (RESUME.md).

## 3. Nothing to integrate

Every commit is already in develop: `zinc-go-ios`, `esp32`, `Frulko/pi-os`, `jsc`, `spline`, `agent-a4984214`, `agent-a63ba3b4`,
`agent-a7663fae`, `agent-a7c4422b`. Their conflict counts only reflect the code having moved on. `zinc-go-ios`, `esp32` and `Frulko/pi-os`
carry commits with another patch: the subjects match, the lines were not compared.

## 4. Work that exists only as uncommitted files

The most exposed: one `git checkout` or a removed worktree loses it.

| Tree | Uncommitted | Status |
|---|---|---|
| main tree (`develop`) | 351 entries, 157 of them untracked (`tests/`, `docs/reports/`, `examples/pixel-plays/`...) | mixes several sessions, among them this one's sleep, pacing and live work |
| `music-airplay` | 48 modified (39 differ from the main tree), 22 untracked (`app/sonos-lastfm/`, `docs/plugins/lastfm.md`, music-tree), and `stash@{0}` (19 files) | not in the main tree |
| `figma` | 7 modified, 14 untracked (`app/figma-live/`, `app/maison/`, `integrations/figma/`) | not in the main tree |
| `raster-alpha` | 4 modified, untracked CarPlay test and golden | not in the main tree |
| `zinc-psp-bisect` | 5 staged | bisect state: compare before dropping |
| `rmpp-engine`, `agent-ab564fa2` | 13 and 3 modified | byte-identical to the main tree |
| `zinc-pi-sleep` | this session's test copy | same work as the main tree, removable |

## 5. Order that loses nothing

1. **Save first.** Commit each session's uncommitted work on its own branch: the main tree file by file (never `git add .`), then
   `music-airplay`, `figma`, `raster-alpha`. Add `examples/pixel-plays/`.
2. **Land `merge/origin-develop`** after merging the 2 newer commits: this gets develop 0.10.14 to 0.10.18 and ends the divergence.
3. **Engine**: `agent-a8c6ceee`, then the engine commits of `agent-af0403a4` by cherry-pick.
4. **GPU**: `agent-aa54022f`, then `integrate-compositor`, each with its renderer tests.
5. **Hamlet**: one agent takes the chain and decides which atlas wins, since the PNGs cannot be merged; run the `hamlet_*` tests.
6. **CarPlay**: `carplay-finish`, its raster commits first.
7. **Athena**: rebase or re-port, last, the oldest and most conflicted.
8. **Clean up**: once landed, remove the worktrees of sections 1 to 3, about 30 of them. Archive the two prototype-era branches under a tag.

Step 8 deletes work and pushing is the owner's step: both wait for the owner.
