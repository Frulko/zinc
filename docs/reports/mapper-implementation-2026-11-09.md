# Mapper implementation progress

The real mapper editor now has dedicated workspaces and connected project/delivery actions. Precision controls, stale-client protection and background transfers are integrated; the original mockup remains a design reference, not runtime evidence.

## Active implementation loop

Owner requested completion with parallel agents on 2026-11-09. Work is divided by owned code, integrated and checked after each delivery; this is not the unrelated engine backlog coordinator.

| Batch | Acceptance | Owner / status |
| --- | --- | --- |
| Workspaces | Composition, Mapping, Zones, Players and Project/delivery navigation; no hidden-cue actions during calibration; preserve native editing tools; capture connected UI | `mapper_workspaces`, implemented and checked |
| Projects and delivery | Select/create/open a complete project honestly, collect assets, choose bake column, verify actual panel-to-output path and errors | `mapper_project_delivery`, implemented and checked |
| Remote players | Stage and validate complete revisions, deliberate activation, preserve active project on failed delivery, show real states | `mapper_player_delivery`, implemented and checked |
| Authoring interchange | Explicit AE and Cavalry actions, editable geometry guides and accurate export boundaries | coordinator, implemented and checked |
| Integration and remote UX | Review the complete real journey, phone controls, failure states, desktop/mobile captures and narrow smoke checks | coordinator, integrated and checked |

Workers use isolated worktrees with a mapper-only baseline copied from this tree. Only changes after that baseline are integrated; other sessions' engine and UI-kit work is preserved. No background scheduler was installed: the active goal and this ledger carry the loop across turns.

- Composition, Mapping, Zones, Players and Project/exports are separate workspaces. Composition retains library, inspector and cues; Mapping/Zones maximize the canvas and have an optional layer inspector. Hidden cues cannot be removed from calibration. The composition preview is explicitly a geometry plan, not a live video monitor.
- A web phone controller at `/#remote` uses the existing pairing and moves the selected output corner in 1, 5 or 10 pixel steps. The mapper status card displays a token-free phone QR and the Devices view shows the address. It uses the existing linked-corner mapping code. Command batches are serialized and discarded on connection failure. Real phone/projector and concurrent-client behavior remain to be proven.
- Calibration exports After Effects JSX and Cavalry JavaScript scripts with flat compositions and editable zone/mask outlines. Cavalry's ordinary outline layers must be hidden before rendering. Neither export transfers source media, warps, curves, feather or animations. Scripts create compositions in the authoring tool; they do not write a native project file themselves.
- `assemble` copies a stopped local project, scenes and media into a new directory, refusing missing media. Local projects can now be opened on the local player and saved through the connected editor. Project files are separate from device credentials; the active-project pointer survives restart and a failed activation restores the old project. Native Mac HTTP proof covered open, save, failed pointer write, restart and token preservation. Project epochs reject stale editors, including requests whose bodies finish after a project switch. Reopening the active project saves current edits without reloading stale disk data. Android native-media folder switching remains explicitly unsupported.
- `bake/bake.py` renders through the mapping compositor and encodes a silent MP4. Static output and a limited offline video path are implemented. The command line can render one selected show column with up to four videos from time zero, 120 frames maximum, at up to 1920×1080; it does not render transitions, timing changes, loops or sound. See `examples/video/mapper/bake/USAGE.md`. The native Delivery panel selects a show column and invokes the real bake pipeline; two videos produced a 320×180, 3 fps, three-frame MP4. The panel now reports output and can cancel a bake, with renderer exit and temporary-file cleanup verified separately.
- Remote-player sessions reject commands, clock joins and media replies belonging to an older connection. Players pair in independent mode; preparing a complete snapshot, transferring with per-file SHA-256 and activating deliberately are implemented. A native 2 MiB transfer in three HTTP ranges passed on interpreter and QuickJS. Copy/hash work runs in a worker; activation rechecks the ticket and project/session generations. Stopping live follow invalidates scheduled commands and clock joins. No physical two-machine proof has been performed.
- The older revision prototype `fbb87b526` has been superseded by the integrated transfer service. Snapshot URLs use expiring random tickets scoped to that snapshot; the editor credential is not sent to download URLs. Activation uses the common project service.
- Scene show data is validated before applying a mapping during restore. Disk-write failures and a malformed mapping still need atomicity work.

## Proof and limits

With `ZINC_ROOT=/tmp/zinc-mapper-exports`, the shared `build/zinc` checked the integrated editor, mapper and bake project. The workspaces were captured against a connected HTTP fixture; keyboard corner movement and mask creation sent the expected commands, and composition read-only/hidden-cue checks sent none. Web export completed. The delivery web variant avoids importing the desktop process module. Final integrated checks passed: editor (59 files), mapper (27 files), and web export (125 modules). All five workspaces were inspected in the exported browser editor with no browser errors.

The agents proved: a phone browser against an authenticated HTTP fixture; a token-free QR decoded from a capture and pairing via a local fixture; project copy including binary media and missing-file rejection; local project creation and structural inspection; AE script generation in a simulated host; an offline animated three-frame RGB export; remote-player session transitions and late HTTP response rejection; and a native delivery-panel assembly through simulated dialogs. Physical equipment, real After Effects/Cavalry and the complete live workflow remain untested.

On the integrated tree a masked static mapping was rendered to `/tmp/mapper-integrated-proof/output.mp4`; ffprobe reported 320×180, 5 fps and 5 frames. A selected column with two videos was also rendered to `/tmp/mapper-integrated-proof/two-output.mp4`. The main tree's unrelated modified `lib/std/ui.ts` prevents a check using that copy; an isolated clean standard library was used instead. Other sessions' changes were preserved; only Mapper release notes are included in this delivery.

The continuation adds a locked-by-default phone alignment controller and relative touchpad. At 390×844, real browser pointer input moved the selected corner by 30×10 output pixels; the HTTP fixture received the corresponding normalized `/layer/0/corner` command. Locking and repeating the gesture sent no command. See [implemented phone](../img/mapper-phone-implemented.png). This is browser/HTTP-fixture proof, not physical touch hardware or a projector. A focused command-link check proved latest-position coalescing for corners and mesh points, serialized batches, queue clearing on disconnect, stale failure rejection and failed-save reporting. Cavalry generation passed an API-fixture check for escaped names, composition dimensions, pixel coordinates, preflight rejection and restoration of the previous active composition on failure. The real Cavalry host remains untested.

## Final integration checks

Native HTTP checks proved same-project reopen preserves unsaved corners and project epochs reject old writes. Client fixtures proved queued show saves remain ordered and selection resets only when the project changes. Bake cancellation stops its renderer, removes temporary files, and allows another export. Worker hashing/copying passed on interpreter and QuickJS. These narrow proofs do not replace hardware acceptance.

Final captures: [Composition](../img/mapper-composition-implemented.png), [Mapping](../img/mapper-mapping-implemented.png), [maximum canvas](../img/mapper-mapping-max-implemented.png), [Zones](../img/mapper-zones-implemented.png), [Players](../img/mapper-players-implemented.png), [Project](../img/mapper-project-implemented.png), [phone](../img/mapper-phone-implemented.png). Desktop captures use a connected HTTP fixture; local filesystem and bake actions were exercised separately in the native editor.

## Proposed tests

- Physical smartphone + projector: pairing, locked/unlocked touchpad and corner adjustment; about 10 minutes, one mapper process.
- Two actual player machines: prepare while projecting, interrupted transfer, deliberate activation and live-follow restart; about 15 minutes.
- After Effects and Cavalry: execute generated guides, inspect dimensions/masks and render with guides hidden; about 10 minutes per host.
- Longer offline exports, audio, transitions and full animated authoring interchange are outside the current bounded exporters; no claim of complete Resolume/Millumin parity.
