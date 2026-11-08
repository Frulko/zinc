# Shard F review, 2026-11-07

Counts: {'rewrite': 1, 'review-close': 15, 'keep': 25, 'park': 3, 'done-partly': 5, 'done': 4, 'drop': 10} (63 tasks).

## Findings
- The Hamlet roadmap (ZN-940 to ZN-973) is mostly overtaken: the game now has a camera, zoom, chunked Cite view, hints, a command log, presets, missions and save format H22. Eight tasks are done, six more are Review to close, and the pixel-plays promotion (951, 964 to 969) and the multiplayer document (972) are dropped.
- Nine Review tasks of the Discord and Pi shell work are done in code; their remaining criteria are live checks against real Discord or a tablet (869, 872, 875, 886, 899, 909, 912, 917, 920, 921, 889). Close them.
- ZN-839 (reMarkable ink canvas), ZN-889 (hub per target) have every criterion ticked.
- ZN-817: the Hermes licences are already in tools/hermes-pack; three small items remain.
- ZN-963 is a real engine gap: no fs.appDataDir exists (only the ZINC_APP_DATA variable).
- ZN-863 (online demos) is a coherent epic; subtasks 03, 06, 07 are small and Mac-only.
- Parked: CarPlay USB (847), Shell P2 KMS (887), Murdoku tablet pass (938).

## Ten that matter most
1. ZN-863.02 zinc:fs on web: unlocks several demos online.
2. ZN-863.05 clear bar for plugins missing on web: honest, usable demos.
3. ZN-863.03 device frames for web pages: small and visible.
4. ZN-963 fs.appDataDir: an engine gap with a T0 test.
5. ZN-817 release hygiene: .qbc stamp and V8 pin prevent a broken release.
6. ZN-884 shell test: finish the Pi shell phase P1.
7. ZN-863.08 gallery: the visible outcome of the web work.
8. ZN-863.07 CORS proxy: small and testable.
9. ZN-840 Zinc Go on the iPhone: assigned, near its coverage report.
10. ZN-937 publish Murdoku to the hub: one short run.

## Surprises
Several tasks carry the same Hamlet design in docs/reports and in code with different names (Cite view versus baked pixel layer), so the task texts no longer match the code.
