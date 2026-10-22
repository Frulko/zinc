# Zinc Next: resume

Overwritten at the end of the session. Binding rules: `RULES.md`, `ARCHITECTURE.md`, `TESTING.md`.

## 2026-10-22: faithful Fatty AS3 port (ZN-776)

- `examples/fatty` ports the complete `Desktop/Fatty/Projet Flash` game: 27 original source files, the `fatOutFood` tree and authored comments, unchanged PNG/XML/bitmap font/MP3 assets. Compared all versions; Unknown version matches, Gobelins.zip only changes initial speed, New Folder is incomplete. Original sources and hashes are kept in tests/data/fatty/as3 and source-manifest.json.
- Uses Zinc/QuickJS and a game-specific adapter over zinc:stage/gfx/audio. No engine changes or new dependencies. Original 1024×768 composition, fixed 60-Hz rules, all screens and cross-screen page lookup retained. Legacy PHP scores become a local persistent Top 5. The old web download/preloader timeline is not replayed.
- Proof: TypeScript and bundle checks; fatty T1 (full 60-second simulation, real rotating target hit, six reviewed feature captures, end countdown, name entry with zero/multiple ticks, save, navigation, 300 idle frames); fatty_logic (1/2/3-hit and friend rules, bubbling, lives, detached timers, score getter, sorted/persistent Top 5, invalid data, byte/comment fidelity, reproducible atlas metrics). Both passed. T1 accelerates only simulation between rendered frames in its test copy to stay below a minute.
- Run: `build/zinc run examples/fatty` (`ZINC_BACKGROUND=1` for an agent). README explains the few changes. Native/AOT and cross-platform runs are not supported/claimed; checked on the development Mac headless. `zinc check` still chooses the native subset checker: use the TS check and `zinc bundle --check` as documented. Nothing pushed. Usage: n/a for Codex.
- Previous Kanban editor autofocus work was completed independently and left untouched.

## Earlier known limits (unrelated, not re-investigated)

- Prior resume recorded diagnostics, netlog and Windows pixel test failures, plus an agent_ota CI flake. Verify these in their own tasks, not while changing a demo.
- Mobile follow-ups remain in their tasks and `backlog/later.md`: ZN-744/741 rendering on Nexus 7, ZN-627 Android GLES 3, ZN-746 software rendering, ZN-743 hero; ZN-631 real Nexus 7 QR scan is in Review. Do not disturb the owner's music app on the tablet. Paid store/device publishing remains the owner's step.

## Next

`tools/next-task`: ZN-568 — Web environment module for QuickJS contexts (DOM/BOM, events, rAF, fetch/XHR, storage). The current owner request is complete; no unrelated backlog task started.
