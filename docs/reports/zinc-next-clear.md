# Clear demo — 2026-10-31

Owner-requested recreation of supplied classic Clear screenshots, under `examples/clear`. Uses native `zinc:ui/solid`, existing system window APIs, icons and `zinc:storage`. Fourteen small TS/TSX modules separate the document, persistence, state, keyboard, screens and individual components. No new package or app framework.

The implemented path includes lists/tasks, inline typing and editing, horizontal completion/deletion, long-press reorder, pull and pinch actions, keyboard navigation, palettes, local persistence and undo/redo. Save failures restore the document and retain the editor draft. README records controls, attribution and scope.

Three shared defects surfaced in the real app:

- Numeric JSX callback indices stayed captured after keyed rows moved. Standard Solid helpers rebuild moved rows when the callback declares an index; index-free rows preserve keyed lifetime. The neutral kit forwards this flag. Custom JSX helpers keep their existing three-argument protocol.
- A focused invisible input repainted for its caret. Caret animation now requires a visible editable layer.
- Storage errors were silently swallowed and direct writes could truncate existing data. The standard module now throws host I/O errors; the host writes a same-directory temporary file and renames it only after successful close. This preserves the old file on failed writes, without claiming fsync durability or concurrent-writer transactions.

Proof: `clear` T1 compares all three engines to the new reference frame and checks 300 idle frames; the demo session drives actual UI events and checks saved data after a process restart and write failure. `storage_errors` and `solid_index` exercise shared regressions on all three engines. Existing JSX and storage tests cover compatibility. Native macOS source and standalone builds are checked separately. No cross-target build or physical touch-device verification.
