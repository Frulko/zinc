# Backlog review 2026-10-25, shard A (handhelds m-23, mobile m-26): 61 tasks

## Counts per verdict

drop 14, park 11, merge 9, done-partly 7, rewrite 7, keep 7, done 3, review-close 3.
Six tasks carry an assignee (631, 741, 743, 753, 757, 761): their verdicts are advice only.

## Notable findings

- **The console work of the last days closes a lot.** ZN-469 (3DS citro3d replay, both eyes and the bottom screen), ZN-470 (Vita GPU path: GXM at 60 fps, vitaGL at 60 fps, D151 and D165) and ZN-482 (audio on PSP, Vita, 3DS through the HALs) are done. ZN-467, ZN-471 and the hello tasks 458 to 460 are mostly done; their leftovers are small and now written down.
- **Hello tasks 458/459/460 merge into one.** The cores boot in all three emulators and on the owner's hardware (`tests/t2/console_emulators.sh`). What is missing is `zinc run/export --target <console>` with a prebuilt core (a `later.md` line), kept as ZN-458.
- **Bouncing-ball tasks 463/464/465 merge into the bench task ZN-486.** The ball runs on all three; only the recorded ball count and gate are left.
- **UI tasks 472/473/474 merge into one:** the kit-gallery they name is gone, pad/touch/sticks are in the hardware demos, and what is really missing is text input (OSK, IME, swkbd) plus focus navigation.
- **The iPhone 4S (iOS 9) cluster is parked** (461, 462, 466, 475, 479, 483, 497, 498): no `targets/ios-legacy` and no libc++ build tool exist, it needs the owner's phone and an old Xcode SDK, and it is far from the goal. The modern iOS export is a separate line of tasks.
- **The Pocket3D clone demos are dropped** (500 to 511, 499): Strike-class FPS, Tokyo city, crowd, places, voxel, town, tile pyramid, 3DS skinning, PocketJS showcase parity. They copy other people's tech demos, each wants hardware receipts on several devices, and no education, maker or artist user asked for them. The 3D renderers and one diorama demo prove the path; the research report stays if one is wanted later.
- **CI emulator matrix (484) is dropped:** CI runs only on release and console tests skip on hosted runners.
- **Two Vita 3D paths conflict:** D144 says GXM with precompiled GXP (ZN-493), D165 says vitaGL for zinc:3d and WebGL1 (ZN-477). ZN-477 is rewritten on vitaGL (working on the Vita), ZN-493 is rewritten to prove one triangle on hardware first. The coordinator should note the decision.
- **Reviews to close:** 753 (breakout on four consoles, PCSX2 replaced Play!), 631 (Zinc Go, only the Nexus 7 scan left, moved to ZN-752), 757 (Relay app; the rest is an owner check).
- ZN-493 is in Review but nothing is provable yet; set it back to Backlog.

## The 10 tasks that matter most

1. **ZN-486** console bench with JSONL, tape and ball counts: gives every console GPU claim a number (absorbs 463/464/465).
2. **ZN-458** `zinc run/export --target <console>` with prebuilt cores: turns the tools scripts into the product a user runs (absorbs 459/460).
3. **ZN-467** ff_replay CPU reference and T1: the only test of the shared replay on the Mac.
4. **ZN-471** Vita GXM onto ff_replay: rounded UI on the Vita GPU without a private copy.
5. **ZN-476** PSP zinc:3d on the GE (first of the 3D renderers).
6. **ZN-477** Vita zinc:3d and WebGL1 on vitaGL (it works on the Vita now).
7. **ZN-478** 3DS zinc:3d with stereo (stereo plumbing already exists in the HAL).
8. **ZN-472** console text input and focus navigation (the gap for zinc:ui on consoles).
9. **ZN-487** pocket-hero on the PSP core (short, visible).
10. **ZN-480** AOT builds for the console cores (performance on modest machines).

## Mobile (m-26)

ZN-741 and ZN-743 are mostly done; only hero numbers (blocked by zinc:video on phones), a standalone CMake target and the Android default decision remain. ZN-627 keeps the GLES 3 Android replay and the frame times. ZN-752 (Nexus 7 camera) and ZN-761 (iPhone/Android device info proofs) stay. ZN-632 stays parked.

## Surprises

- pocket-hero already exists in `examples/`, so ZN-487 is a short job.
- Vita3K stubs the GXM memory calls, so the GXM and 3D proofs must run on the owner's Vita.
- Stale text: ZN-754 still says zinc:audio has no psp/ps2 target.
