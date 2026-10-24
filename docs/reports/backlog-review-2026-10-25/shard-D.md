# Backlog review 2026-10-25, shard D

63 tasks: games/assets/loading/toolchain (m-22), showcase demos (m-27), desktop integration (m-16), packaging and distribution (m-19). Data: `shard-D.json`.

## Counts

| Verdict | Tasks |
|---|---|
| review-close (close as done, or dropped) | 15 |
| keep | 21 |
| done-partly | 9 |
| done | 3 (ZN-568, ZN-586, ZN-650) |
| drop | 4 (ZN-341, ZN-348, ZN-582, ZN-649.11) |
| merge | 4 (ZN-577, 579, 580 into ZN-578; ZN-651 into ZN-555) |
| park | 3 (ZN-245, 246, 649.12) |
| rewrite | 3 (ZN-338, 437, 578) |
| split | 1 (ZN-440) |

Twelve tasks carry an `@parallel` assignee (ZN-354, 439, 446, 565, 570, 573, 574, 583, 649, 649.11, 650, 718). It is a leftover of finished worktree agents, not a live session; the coordinator should check before touching them.

## Findings

- **Review is the biggest pile.** Fifteen tasks sit in Review for a step that is not worth a person: a click on an OS permission prompt (ZN-235), an Apple notarization (ZN-321), a Pi 3 run (ZN-439, 446), an M1 Pro number (ZN-567), a GitHub run (ZN-331, 354). Everything the Mac can prove is proven. Close them and keep the outward steps as one line each in `later.md` (the cross-platform ones are already there).
- **The epics are finished.** Museum table (ZN-650): all 20 subtasks Done, README with screenshots. Pinball 3D (ZN-649): 18 of 20 done; the last two are a quiet-machine measure (drop to a later line) and a human play-test (parked).
- **Packaging moved past its tasks.** ZN-718 (nothing to compile) shipped as `tools/install.sh`, plugin prebuilts inside the archive and a release job; releases v0.7.4 to v0.7.6 came out of tag CI. ZN-331 (CI on every host) is green. ZN-321 signing is ready up to the owner's Developer ID. ZN-334 (pinned Linux sysroots) is mostly there as `tools/linux-sysroot` with a sha256 lock; only the automatic fetch is missing.
- **Names point at a repository that does not exist.** The plugin starter and `.github/workflows/plugin.yml` refer to `zinc-engine/zinc` and `zinc-engine/plugin-starter`; `gh repo view` finds neither and `origin` is `Frulko/zinc`. ZN-354 and ZN-338 need the names fixed before any outward step.
- **The JS-game-library plan was overtaken.** The web environment (ZN-568), canvas 2D on canvas_ity (D98), image decode, Web Audio facade and gamepads exist, and four unmodified-library demos run as `examples/js-p5|pixi|phaser|three` with T1 tests. JavaScriptCore and V8 engines shipped (6 to 32x faster than QuickJS), which removes the premise of the native Pixi accelerator (ZN-582, dropped) and of the JIT spike (ZN-586, done). The four demo tasks collapse into one "FPS gates" task (ZN-578).
- **Obsolete by decision:** ZN-348 (a minimal zinc fetching its parts) contradicts the offline-first archive decision of ZN-718; ZN-341 (independent rebuilders) has no community to rebuild; ZN-571 (Skia vs ThorVG spike) was bypassed by D98.
- **Assets pipeline is half built.** `zinc assets` has only `build` and `info`; ZN-437 is rewritten to the useful part (`check` as a budget gate, `report --diff`). ZN-440 (audio pipeline) is too big: decoders shipped, importer, streaming and Opus did not; split into three. ZN-429 still emits the blob as a string literal, softened by `--no-embed`.

## The ten that matter most

1. **ZN-334** sysroot auto-fetch (S): unlocks `zinc export --target rpi` with nothing installed, ZN-350 and ZN-338.
2. **ZN-661** both showcase demos in the browser: provable on the Mac with headless Chrome and the cheapest way to show the work.
3. **ZN-437** `zinc assets check`: a budget gate for games and the base of ZN-451.
4. **ZN-584** `zinc:game` native tier: the games accent of the owner's goal, large.
5. **ZN-578** FPS gates for the JS demos on quickjs/jsc/v8: turns the performance claims into tests.
6. **ZN-575** QuickJS GC at frame boundaries: p99 spikes hit every JS game (deep runtime, risky).
7. **ZN-342** provenance on releases: small now that tag CI works.
8. **ZN-338** (rewritten) plugin workflow published to the index with a fixture run, once names are fixed.
9. **ZN-706 / 707 / 708** small web-environment gaps (DOMParser, boot tests, Date): cheap, bounded.
10. **ZN-449** browser loading path (streaming, group packs, cache): needed for the web showcase.

## Surprises

- `@parallel` assignees on Backlog tasks (ZN-570, 573, 574) that already hold ticked criteria and tests.
- ZN-569 notes carry five un-created follow-up tasks (a) to (e) written as text; ZN-569 is rewritten to carry (a) to (c), Worker stays ZN-587.
- Possible overlaps in other shards: ZN-546 and ZN-528 (Pi sysroots) with ZN-334; ZN-690/692 (physics3d threads, targets) with ZN-583's open criteria; ZN-555 absorbs ZN-651.
