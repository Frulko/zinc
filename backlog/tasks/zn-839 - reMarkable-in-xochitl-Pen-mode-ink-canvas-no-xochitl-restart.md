---
id: ZN-839
title: 'reMarkable: in-xochitl Pen-mode ink canvas, no xochitl restart'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-25 18:57'
updated_date: '2026-10-25 20:05'
labels:
  - remarkable
  - size-L
milestone: m-11
dependencies: []
ordinal: 548460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Route 2 of docs/reports/remarkable-fast-ink-landscape.md (owner 2026-10-25: the best, fastest, best integrated ink): a XOVI extension adds a painted Qt item inside xochitl under its QML Pen screen mode (xofm.libs.epaper), fed by the app's qtfb shared memory with update(rect), so a Zinc app gets the handwriting waveform while xochitl keeps running. Plus the lease reopening the last document after an L2 session (rm-hacks-qmd approach).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a XOVI extension (exported Qt symbols and xochitl QML types only, no native engine addresses) shows an AppLoad app's qtfb strokes through xochitl's Pen mode on the stroke's rect; it fails closed (stays off with one journal line) on an unknown OS hash
- [x] #2 display-rmpp selects it as the ink layer when present (ink: native), with the existing downgrade to plain qtfb
- [x] #3 the lease reopens the document xochitl had open before an L2 session, or says why it could not
- [x] #4 proven on the Mac (build in the SDK container, the fake-xochitl harness extended); the tablet steps written in docs/targets/remarkable-paper-pro.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design (2026-10-25, agent worktree):
- Extension zinc-canvas (integrations/remarkable-ink/canvas.cpp, canvas.xovi), separate from AppLoad (its maintainer asked for that in PR #61) and from the zinc-ink lane (same socket and protocol 2; install.sh installs one at a time). No override, no import, no QMD: it starts from qAddPreRoutine (Qt6Core) and builds its objects at run time. So a hashtab change (OS 3.29 broke an old ghostbuster.qmd) cannot crash xochitl through it.
- Names, decoded from AppLoad's appload.qmd with qmldiff's hash (djb2, seed 5481): import xofm.libs.epaper as Epaper, Epaper.ScreenModeItem, property mode, enum Pen / Mono / Animation / Content / UI (AppLoad maps qtfb UFAST..UI to them). From rm-hacks-qmd (<= 3.24): Settings.lastOpen, Library.entryForId(id), navigator.requestOpenDocument(entry).
- Hello: find AppLoad's FBController item (fullscreen 1:1), create a QQuickPaintedItem (renderTarget Image, z on top, no input) over it, reading the app's qtfb shm as a QImage (no copy), plus a child ScreenModeItem created from inline QML in AppLoad's engine with `mode: inking ? Pen : UI`. StrokeBegin -> Pen; Ink(rect) -> update(rect) of that rect only; StrokeEnd -> UI, the item transparent again, AppLoad's item update(box) (the colour settle, as the lane did). Welcome.key = zink::Canvas (new enum in protocol.h, compatible), hash = xochitl's SHA-256; lane.h accepts it without a vendor row.
- Gate (fail closed, one journal line): model row; SHA-256 of /proc/self/exe (hashed on a thread at load) listed with the codename in exthome/zinc-canvas/verified, written by `install.sh canvas` on the tablet (a new OS = run install.sh again after checking, no build; rule 8); QML type and modes present (a QML error is caught). Crash guard /run/zinc-canvas/armed as the lane's; lease.c clears it after its own clean stop.
- Reopen (AC3): the canvas records Settings.lastOpen in /run/zinc-canvas/document (QQmlExpression notify); lease session copies it to /run/zinc-lease/reopen before the stop, or says why it cannot (canvas not loaded / no document); at xochitl's next start the canvas opens it once (Library.entryForId + navigator.requestOpenDocument, retried 20 s while the library loads) and writes /run/zinc-lease/reopened; lease status prints it. "Last opened" stands for "open": xochitl exposes no other state we can read without a QMD.
- Unverified on a tablet: whether our ScreenModeItem (Pen) wins over AppLoad's (UI) in the same region, the latency, the colour settle, an initial full transparent paint when the item appears, and whether 3.29 still has Settings.lastOpen / Library.entryForId / navigator.requestOpenDocument (if not: one journal line, nothing opened).

Proof on the Mac: `sh integrations/remarkable-ink/build.sh` (official ferrari SDK 5.7.119, one-shot container) builds dist/zinc-canvas.so and dist/zinc-ink.so without warnings; zinc-canvas.so needs only Qt6 Core/Gui/Qml/Quick (qt_version_tag Qt_6.8, as the lane that XOVI loaded on 3.27). `sh tests/native/rmpp/fake-xochitl/run.sh`: 12/12 ok (the six lane scenarios, then canvas-install, canvas-load, canvas-stroke: Pen at the stroke start, paints 100,100 20x10 / 118,104 20x10 / 136,108 20x10 only, then UI and AppLoad's repaint of 100,100 56x18; canvas-crash, canvas-hash: one journal line, no socket, the lease's reopen answered "no"; canvas-reopen). `tests/run --only rmpp_sim` and `--only rmpp_lease` pass (a canvas run in rmpp_sim; the lease-sim checks the reopen record and the cleared crash mark).
Status Review: the rest is the tablet (owner): one xovi/start, the journal, then ink, settle and reopen (steps in docs/targets/remarkable-paper-pro.md, "The ink canvas"). Tablet now on OS 3.29.0.153 with AppLoad 0.6.0 (coordinator, 2026-10-25): nothing here depends on the hashtab; the 3.29 libqsgepaper row for the lane is not added (later.md).

Tablet, OS 3.29, 2026-10-25: canvas granted after the shm key fix (66cb9ecf), but the owner found it much worse than plain qtfb ufast (flashes everywhere: qtfb in UI mode at 8 Hz, UI-waveform repaint at each pen-up). Removed from extensions.d. Stays in Review: tune per backlog/later.md or retire.
<!-- SECTION:NOTES:END -->
