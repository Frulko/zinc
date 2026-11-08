# Backlog review 2026-11-07, shard D (66 tasks)

Counts: keep 32, done-partly 11, park 8, rewrite 5, merge 4, done 4, split 1, drop 1. No task of this shard has an assignee.
Checks were by grep, file reads and git log; no build and no test run. Items marked "not verified" below were taken from the 2026-10-25 review notes.

## Notable findings
- Done: ZN-574 (gamepad, Phaser proves it; Kaplay check goes to ZN-707), ZN-611 (Intel QEMU pinned, tc.cpp:58-61), ZN-664 (`Object.keys` on parsed JSON is in tests/golden/run/json_keys_indent.ts), ZN-649 (the pinball epic: only the parked 649.12 is left).
- Merges: ZN-577, 579 and 580 into ZN-578 (its text already says it absorbs them; one FPS-gate task for the js-* demos). ZN-570 into ZN-707 (only the Kaplay/LittleJS text check is left, and ZN-707 vendors those libraries).
- Obsolete: ZN-591 (ABI array snapshots, written around the removed prototype, no user). ZN-600.01 was parked "needs an Apple Silicon Mac": the dev machine is the M1 Pro, so it is a short A/B run now (value low, D56 found the gain flat on Intel).
- ZN-567, 589.01, 592.02, 690 are measure-only tasks that the M1 Pro makes possible in minutes: one quiet-machine session closes four tasks (run them together, never while a build runs).
- ZN-575: a bytecode cache for `zinc run` seems to exist (launch_time.sh speaks of cached bytecode, qjs.cpp:759); verify before doing it again. GC scheduling and the GC phase in the profile are left.
- ZN-584 (zinc:game) is split; it is large and below UI and performance in value.
- The small bug tasks (ZN-639, 640, 643, 644, 667, 668, 671, 675, 693) are all S, isolated and provable on the Mac in minutes; best for tonight.
- Cross lane (keep, last): 562.04, 563.01, 563.02, 590.03, 592.04, 660, 686, 694. Parked: 560, 561, 585, 627, 632, 649.12, 662, 692.

## The 10 that matter most
1. ZN-643 and ZN-644: program output ordering and `zinc mem --json` pollution; first-run and tooling correctness.
2. ZN-693 and ZN-667/668: compiler and runtime defects (instanceof through `any`, duplicate names, self-referring closure leak).
3. ZN-639: parallel worktrees cannot run socket.sh together (UDP ports); unblocks the multi-agent workflow.
4. ZN-610: TLS 1.3 handshake timeout test; a silent hang is a real-user failure.
5. ZN-666: the 30 style scenes through the GL replay; the window renders on GPU and no test sees it.
6. ZN-671 and ZN-640: a silently missing icon, and secrets in the multipart network log.
7. ZN-567, 589.01, 592.02, 690: the four M1 Pro measures in one session.
8. ZN-603: AOT size and build time of hero (module already shrunk; measure the rest).
9. ZN-578: one FPS gate per JS-library demo (absorbs three tasks).
10. ZN-672/673/661: browser host gaps, then both showcase demos in headless Chrome.

## Surprises
- ZN-640 reads as undone: netlog.cpp has no multipart masking (grep).
- ZN-671: `trash-2` is still listed in examples/nuxt-ui/zinc.json.
- Several S bug tasks (667, 668, 693) have no regression program in tests/golden/run; I did not reproduce them.
