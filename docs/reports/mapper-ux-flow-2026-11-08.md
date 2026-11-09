# Mapper Studio: professional workbench and user journeys

Date: 2026-11-08; refined 2026-11-09. The owner rejected the first prototype as too simplistic, then asked to give mapping/zone settings the maximum canvas area and add smartphone point adjustment. This revision supersedes both the earlier Installer / Composer / Jouer proposal and the version that retained cues during calibration.

Related: [interactive workbench](mapper-ux-proposal-2026-11-08.html), [product review](mapper-product-ux-review-2026-11-08.md), [research](mapper-projection-mapping-research-2026-11-08.md).

## Design direction

In Composition, an operator sees media, layers, output and playback together. The default screen opens a working project with a docked library, two monitors, contextual properties, a clip matrix and transport. Mapping and Zones are dedicated calibration spaces: a zone tree, one large canvas and a contextual inspector. They hide cues, media, source preview and transport. Lecteurs owns distribution and activation. These are workspaces, not sequential onboarding steps.

Keep Zinc's dark palette and amber selection. Green identifies playing/ready states. Use compact controls, numerical fields, stable alignment and high information density. Desktop is an editing console. On mobile, Composition has contained matrix scrolling and fixed transport; calibration has a scrollable canvas/tree/inspector without transport, and the dedicated phone controller has large touch targets. Avoid ornamental motion and explanatory hero sections in the working interface.

The owner's **assemblage** means exporting the complete project **with its assets**. Its project-level action remains available from the header and Project menu.

## Reference patterns

- [Millumin Dashboard](https://help.millumin.com/docs/playback/dashboard/): columns represent show moments; layers, timing, boards and silent editing have dedicated controls. The prototype uses a four-layer/six-column board and distinguishes selection from launched content.
- [Millumin Workspace](https://help.millumin.com/docs/playback/workspace/): canvas manipulation, mapping tools, coordinate entry and navigation. The prototype adds draggable points, pixel entry, keyboard nudging, grid, zoom and geometry locking.
- [Resolume Decks](https://resolume.com/support/en/6/decks) and [Advanced Output](https://resolume.com/support/en/advanced-output): organized content decks and output configuration. The prototype exposes media filters, two boards, source/output monitors and an Output inspector.

These are selected interaction patterns, not a claim of feature parity or an exact copy of either interface.

For this refinement, [Resolume Output Transformation](https://resolume.com/support/en/output-transformation) and [keyboard shortcuts](https://resolume.com/support/en/shortcuts) support the distinction between output point editing and playback, with pan and 1/10 px nudging. [MiniMad's official FAQ](https://madmapper.com/minimad/faq) documents phone/tablet OSC control over a Wi-Fi network; that is precedent for remote control, not evidence that Zinc's dedicated phone calibration UI already exists.

## First prototype versus revised workbench

| Before | After |
| --- | --- |
| Guided pages with large headings and introductory copy | Compact console opens directly on an example project |
| Installer / Composer / Jouer as separate pages | Composition / Mapping / Zones / Lecteurs workspaces; playback tools remain in Composition |
| Three large media tiles | Searchable library with nine procedural thumbnails, type filters and metadata |
| List of three cues | Four-layer/six-column matrix with separate cell and column launch controls |
| One schematic preview | Source and output monitors, correct preview aspect ratios, animated procedural artwork and a facade stage preview |
| Generic context card | Clip / Surface / Output inspector with sliders and numerical entry |
| Read-only geometry sketch | Draggable corners, pixel coordinates, arrows, geometry lock, grid and zoom |
| Fixed panels | Redimensionable library, inspector and board; keyboard-operable separators |
| Simple assignment button | Pointer-based library-to-cell drop, clip moves, duplicate, copy/paste, delete and undo/redo |
| Cue name doubles as playback status | Selected cell, per-layer playing markers, active column and transport timecode are separate |
| Preparation and playback look similar | Explicit Draft / Program views; program clip and geometry snapshots taken at launch |
| A few large playback actions | Permanent play/pause/stop, scrub, next column, master opacity and reversible blackout |
| Isolated player overview | Two-player group, active/staged revisions, transfer progress, retry and deliberate activation |
| Collection as the only export dialog | Complete-project inventory plus AE, Cavalry, pre-baked and remote-delivery routes |
| Error scenarios dominate the page | Nominal console by default; edge cases under the discreet Scenarios control |
| Phone view repeats the desktop page structure | Stacked panels, horizontally contained matrix and fixed transport/status |

## Workspace structure

| Region | Role |
| --- | --- |
| Project/menu bar | Project identity, local save, undo/redo, collection, exports and shortcuts |
| Library | Filter/search media and sources; preview and assign |
| Source monitor | Selected asset independently of what is playing |
| Output monitor | Draft or program view; corner tools in the draft |
| Inspector | Clip properties, surface coordinates/tools or output/player configuration |
| Matrix | Layers across named columns; cell/column launch, visibility, solo and opacity |
| Board tabs | Main show and test/calibration board; switching board preserves program |
| Transport/status | Current playback, time, scrub, next column, master, blackout and feedback |

The library, Source monitor, matrix, board tabs and transport above describe Composition. Mapping and Zones replace them with the following calibration layout.

## Calibration refinement against the existing editor

Source evidence: [EditorScreen](../../examples/video/mapper/editor/src/components/EditorScreen.tsx) currently keeps Library, PropsPanel and Dashboard around every central view. OutputView already exposes corners/mesh/edges and linking. [SurfaceCanvas](../../examples/video/mapper/editor/src/components/SurfaceCanvas.tsx) owns crop and polygon/curve masks in local coordinates. [FrameEditor](../../examples/video/mapper/editor/src/components/FrameEditor.tsx) already supports media framing; it must retain fit/frame/picture semantics when enlarged. [PointEditor](../../examples/video/mapper/editor/src/model/pointEditor.ts) already owns selection and point movement. This pass inspects those sources; it does not run or modify the Zinc editor.

| Before | After |
| --- | --- |
| Cues, library, transport and Source monitor stay visible during mapping | Dedicated Mapping and Zones layouts hide those regions and give the canvas the central work area |
| Calibration target follows clip selection without its own visible navigation | Output/zone tree selects one of four independently stored zone geometries without launching a cue |
| Mockup represents only four corners | Coins, Maillage and Raccords correspond to the existing output tools; mesh presets 3/4/6/9 and four edge widths/gamma have editable draft state |
| Native crop/mask capabilities are only mentioned in copy | Zones exposes local crop, mask points, illustrative angular/curved contour, invert, feather, point insertion/removal and undo |
| No dedicated maximum canvas mode | Vue maximale / F hides tree, inspector and project chrome; Escape restores them without losing edits |
| Fixed view center and button zoom only | Cadrer la zone centers/fits the selected geometry; Main pans; wheel zoom preserves the coordinate under the pointer; Ajuster restores the complete 16:9 space |
| Cue keyboard actions remain global | Enter, Space and Delete cannot launch/remove hidden cues in calibration; arrows nudge and N/Shift+N select the next/previous point; Tab retains normal focus navigation |
| Point labels can run beyond the canvas | Labels are bounded and a larger selection radius helps acquire small control handles |
| One draft quad shared by every target | Per-zone corners, mesh, crop, mask and edge settings; geometry history includes all zones and preserves program snapshots |
| Phone receives a compressed desktop layout | A dedicated controller has zone/tool/point selection, pixel readout, 1/5/10 px arrows, relative touchpad, lock, undo and test card |
| No pairing or interrupted-control state in the proposal | Explicit local pairing, connected, lost and ended states; lost/locked sessions reject edits, and reconnect never replays a drag |
| Smartphone controls have no reviewable entry point | Smartphone button opens a shared-state phone preview; `?controller=1` opens an independent full-width phone mockup with its own demo pairing |
| Dense desktop panels collapse on narrow screens | Calibration uses a scrollable canvas, two-column zone selector and single-column inspector; phone view fills the viewport with touch controls |

Point and mesh interactions are local mockup state. The quad preview is illustrative; mesh edits do not execute video deformation. Edge widths show bands rather than photometric blends. The curve view does not implement the native editable Bézier handles, multiple mask slots or linked corner behavior. Keep those existing capabilities when implementing the real screens rather than replacing them with these simplified drawings. Existing [CalibrationPanel](../../examples/video/mapper/editor/src/components/CalibrationPanel.tsx) also provides grid/focus/colours/white/sync cards with output/all-zones/selected-zone targets, recommended media sizes and SVG/calibration exports: the single Mire toggle here is an entry-point illustration, not a replacement for that panel.

## Critical journeys

### Inspect, edit and launch

Select a library asset to preview it. Assign by dragging into a cell or through the inspector. Selecting a cell edits its draft settings without launching. Its play control or Enter launches it on its layer. A column launch takes a snapshot of every layer in that column. Program markers identify the launched cells rather than every duplicate of a filename.

The prototype keeps program clip properties and geometry separate from draft. Production Zinc must implement or explicitly limit this isolation: a visual label alone cannot make the current engine perform silent editing.

### Map while preserving the program

Entering Mapping switches to the dedicated projector-space canvas. Select a zone, then Coins, Maillage or Raccords. Zones instead presents crop/masks in local space and retains the zone selection. Drag a point, type coordinates or use arrows for 1 px / Shift for 10 px. N/Shift+N select next/previous point while Tab leaves the canvas normally. Lock prevents edits. Undo/redo operates on draft. The program retains its earlier snapshot. Drawing, hit testing, zoom and pan share the same view transform.

Use Cadrer la zone, then Vue maximale / F to fit precise work around the selected target. Main pans; wheel zooms under the pointer. Escape exits maximum view. No cue is launched by those navigation actions. Calibration is silently local in the prototype; actual visible-on-projector calibration needs an explicit test/live session with clear restore behavior in production.

This is an illustrative quad/clipping preview, not Zinc's projective renderer, mesh warp, native Bézier mask editor or physical optical simulation. Existing Zinc implementations should replace those prototype boundaries.

### Adjust points from the installation floor

Smartphone opens an illustrated controller sharing the current page's geometry. Enter demonstration code `482196`, choose zone/tool/point and nudge by 1/5/10 px. A drag on the relative pad moves one source/output pixel per CSS pixel, independently of the preview zoom. A pad gesture is one undo operation. Lock and connection loss block writes; reassociation opens a fresh gesture state without replay. Terminer ends control. Closing the preview alone does not end the associated local session. The standalone `?controller=1` page is an independent simulation, not a second-device connection.

Reuse evidence and remaining integration:

| Need | Existing provider | Remaining gap |
| --- | --- | --- |
| Browser on the local network | [web.ts](../../examples/video/mapper/src/services/web.ts), existing hosted web editor and advertised LAN URL | A dedicated phone page and actual host/device validation |
| Association | [pairing.ts](../../examples/video/mapper/src/services/pairing.ts), `/pair/ask`, one-time code exchange, three wrong-code attempts and token validation | Calibration-scoped authorization/revocation; current token grants broad editor access |
| Point edits | Existing `/osc` command endpoint, `/state`, `setLayer`, point/geometry editors and history | Authoritative revision acknowledgements, bounded/coalesced gesture updates and stale-command refusal |
| Two operators | Existing shared player/editor state | One calibration owner/lease per target; desktop read-only/ownership indication and deliberate takeover |
| Readable projection during calage | Existing output/mire and mapping tools | Explicit live-test/restore lifecycle that cannot silently replace a running cue |

The real phone UI should offer the existing QR/link and fallback address/code. This HTML deliberately generates no fake QR, network token or reachable server. Wi-Fi latency, dropped packets, browser suspension, iOS/Android touch behavior and multi-client ownership remain unproven.

### Assemble a complete project

Use Assembler in the header, Project menu or export chooser. Review scenes, mapping, media, models/textures, source resources, missing files and folder layout. Missing required assets block completion and offer repair. Originals and device credentials are preserved. Collection and delivery have independent job lifecycles: collection cannot erase a staged remote revision.

No package is written by the prototype. Production collection must resolve transitive dependencies, relative paths, repeated basenames and unavailable resources, then be proven with original folders unavailable.

### Prepare and activate remote players

Lecteurs displays two fictional players and their active revisions. Preparing/sending stages r12 without altering r11. Failure preserves active revisions and offers retry. Successful transfer enables activation. Offline state blocks group delivery/activation and offers reconnect. Local demo playback is separate from remote-player revision state.

Closing the real editor must leave deliberately persistent installations playing; agent/session lifetime rules still require integration.

### Export for authoring or playback

Exporter / Livrer offers After Effects, Cavalry, final-output bake, complete project collection and remote delivery. Authoring routes expose resolution/cadence and explain the flat-guide boundary. Bake explains that final mapping is included and must not be applied again. Progress, cancel and completion are simulated; no external application or encoder runs.

## Prototype boundaries

Locally implemented: filtering/search, assignment/moves, matrix launch, draft properties, layer preview controls, board switching, geometry-inclusive undo/redo, numeric/drag/keyboard point editing, per-zone geometry, calibration layouts/maximum view, framing/pan/pointer zoom, illustrative mesh/masks/edges, local phone pairing/controller states, procedural previews, transport, dependency repair, delivery/retry/activation and export dialogs. Save writes a demo snapshot to browser storage; a complete project open/restore flow is not implemented.

Absent: actual video decode/audio mix, projective/physical rendering, multi-surface solving, native mesh/mask/edge editors, real transfers, AE/Cavalry scripts, movie encoding, generated archives and device communication. Imported filenames/sizes enter an illustrative inventory; their media pixels are not decoded. The displayed refresh/output facts are example configuration, not performance measurements.

## Implementation in Zinc

Reuse EditorScreen, Dashboard, Library, PropsPanel, FrameEditor, OutputCanvas, scene/show/history/fleet services, kit controls and i18n. First implement the docked console and interaction distinctions; then connect actual program state and mapping tools. Collection, authoring exchange and remote activation need their backend completed before exposure as production actions.

The first-projection guide remains optional help. It must not replace the professional workbench. Preserve direct matrix access in Composition, keyboard precision, workspace sizing and the ability to inspect content while a show plays; do not keep the cue matrix visible in the calibration workspace by default.

## Verification

Browser verification passed 33 assertions covering selection/program isolation, explicit launches, clip edits and undo/redo, geometry, collection repair, independent collection/delivery jobs, failure/retry/staging/activation, export options and cancellation. Actual mouse gestures verified media drop, corner manipulation and panel resizing; keyboard checks verified matrix navigation/launch, pixel nudging and dialog focus return/trapping.

Layout was inspected at 1440×1000, 1280×800 and 390×844. The nine mobile workspace/inspector combinations had no page overflow; the matrix retains its own horizontal scrolling. The automated WCAG A/AA scan reported zero violations, with canvas-overlay contrast requiring manual review; this is not accessibility certification or a real-device usability study. No production encoder, archive, authoring integration, remote protocol or Zinc runtime was exercised.

The 2026-11-09 calibration refinement passed 34 additional browser assertions for dedicated layouts, per-zone selection, corner/mesh/mask/crop edits, geometry undo, maximum-view restoration, hidden-cue shortcut isolation, local phone pairing/nudging/lock/disconnect/reassociation and program preservation. Seven follow-up checks verified all four workspaces at 1280×800, crop coordinate bounds, pointer-centered wheel zoom and program isolation. Actual mouse input moved a zoomed corner and moved a phone-pad point by 30×10 source/output pixels; release returned the gesture to idle. Actual N, ArrowRight and Tab selected/nudged a point then moved focus out of the canvas.

Desktop, maximum canvas and 390×844 calibration/phone layouts were visually inspected. Mobile calibration retains its zone selector and the footer reaches the viewport bottom; the phone-only page hides the desktop and fills the viewport. The A/AA scan found zero violations in mapping and phone views, with one/two incomplete contrast checks respectively. These checks do not cover a physical smartphone, projector, Wi-Fi connection or multi-operator session.

Captured views: [Composition](../img/mapper-studio-proposal.png), [Mapping](../img/mapper-studio-mapping-proposal.png), [maximum canvas](../img/mapper-studio-mapping-max-proposal.png), [Zones](../img/mapper-studio-zones-proposal.png) and [phone controller](../img/mapper-studio-remote-proposal.png). App/demo tests remain proposed for the owner's chosen milestone.
