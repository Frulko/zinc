# Mapper: product and UX restart review

Date: 2026-11-08. Requested by the owner: review the video mapper, identify missing features, and improve the user experience.

Extended at the owner's request: remote players, After Effects/Cavalry exchange, projects, complete project collection with assets (the owner's meaning of “assemblage”), pre-baked export and research into [VirtualMapper](https://github.com/baku89/VirtualMapper).

Further research: [Projection Mapping Central findings](mapper-projection-mapping-research-2026-11-08.md), including target-specific export, Source/Output editing, unattended operation, generative sources and assisted-calibration leads. External tool claims are distinguished from proposed Zinc behaviour.

## Recommendation

Keep the product promise: prepare a mapping from a browser, leave an inexpensive player with the projector, and let it run independently. The next useful release should make that workflow predictable before adding more creative sources.

Start with trustworthy command/save feedback, an editor that reflects the actual playback state, and protection against accidental changes during a show. Build the next workflow around a portable project: prepare content in Zinc or an external authoring tool, optionally bake it, collect the complete project and its assets, deploy a revision to remote players, and perform. Calibration precision and additional live sources follow those foundations.

This is a source review and product proposal, not a runtime certification. The player, editor, plugin, tests and existing reports were read; the existing editor screenshot was inspected as historical context. The extension also uses public source and official documentation linked below. No application, browser session, build, benchmark or test suite was launched. Other sessions were building during the initial review. No application code was changed and no backlog tasks were created.

## What already exists

These are implemented paths, although this review did not execute them:

| Area | Existing capability | Evidence |
| --- | --- | --- |
| Connection | Browser editor, native editor, QR address, discovery and code pairing | `editor/src/main.tsx`, `ConnectScreen.tsx`, `services/discovery.ts`; player `services/pairing.ts` |
| Geometry | Corner pin, deformation grid, movement of whole surfaces, linked corners, keyboard nudging | `OutputCanvas.tsx`, `PointCanvas.tsx`, `model/links.ts` |
| Light and shape | Curved masks, feathering, crop, edge fades, colour correction, blend modes | `SurfaceCanvas.tsx`, `EdgeControls.tsx`, `PropsPanel.tsx`; `plugins/mapping` |
| Calibration | Grid, focus, colour, white and sync cards; recommended media dimensions; SVG/JSON templates | `CalibrationPanel.tsx`, player `services/cards.ts` |
| Content | Media library, file/folder upload, progress, clip grid, per-clip framing and looping setting | `Library.tsx`, `Dashboard.tsx`, `FrameEditor.tsx`, `transfers.ts` |
| Projects | Automatic persistence, named scenes, JSON import/export, previous-scene recovery | Player `services/scenes.ts`, `show.ts`; editor `ScenePanel.tsx` |
| Editing | Shared undo/redo history, resizable panels, translations, editor preferences | Player `services/history.ts`; editor `state.ts`, `i18n.ts`, `OptionsPanel.tsx` |
| Installation | Room reconstruction from typed dimensions and lens, GLB export | `RoomPanel.tsx`, `RoomView.tsx`, `model/room.ts` |
| Control | OSC, transport commands, feedback and Millumin/Resolume aliases; Chataigne project | Player `services/control.ts`, `oscAliases.ts`, `oscFeedback.ts` |
| Fleet | Pairing, viewports, timed commands, replicated setup/show, resumable media copying and desktop video correction | Player `services/fleet*.ts`; editor `DevicesPanel.tsx` |

Editor component paths above are relative to [`editor/src/components`](../../examples/video/mapper/editor/src/components/). Player paths are relative to [`src`](../../examples/video/mapper/src/).

Do not schedule a replacement for the existing geometry editor, history, pairing or fleet protocol. Improve their visible behaviour.

## Reliability gaps to address first

The following observations are established by reading the code. Their user-visible failure cases still need a short reproduction before a fix is declared verified.

### 1. A sent change is not always a confirmed change

In [`editor/src/services/link.ts`](../../examples/video/mapper/editor/src/services/link.ts), `postCommands()` and `putJson()` await `fetch()` but do not check `reply.ok`. An HTTP rejection can therefore pass without a failure reaching the editor. `getJson()` and `postJson()` already demonstrate response checks to reuse.

The command queue is cleared before the request completes. A network failure reports a message but does not establish whether an edit reached the player. A failed show save only writes a general status message in `state.ts`.

**Smallest useful improvement:** check response statuses centrally; expose connection and persistence states such as connecting, connected, saving, saved and failed. Reload authoritative state after reconnection. Preserve unsaved edits until the user can retry or export them. Do not blindly replay launch/stop commands whose outcome is unknown.

**Acceptance:** a rejected save never reports success; a lost connection is visible; reconnecting shows what the player is actually doing.

### 2. Playback shown by the editor can become stale

`loadState()` and `loadShow()` in [`editor/src/state.ts`](../../examples/video/mapper/editor/src/state.ts) run at connection and selected editing operations. There is no continuous refresh of the clip grid's playback state. The one-second refresh in `StatusBar.tsx` reads `/device`, and the Devices view reads `/fleet`; neither refreshes the show's playing clips.

OSC, another editor or the physical remote can therefore change the player without updating this editor's playback markers.

**Smallest useful improvement:** refresh playback state at a modest rate, starting with the existing API. Keep local field editing separate from authoritative playback indicators so refreshes do not rebuild controls under the pointer. Add revision/conflict handling before allowing one editor's stale full-show save to overwrite another editor's newer changes.

**Acceptance:** a column launched by the remote or OSC appears in the editor without reloading the page; a stale save does not silently replace newer content.

### 3. The looping control is not wired consistently across playback paths

[`src/services/layerMedia.ts`](../../examples/video/mapper/src/services/layerMedia.ts) creates desktop video players with `player.repeat = LOOP`. `followLayerMedia()` returns early when the media name is unchanged and does not propagate the layer's looping setting. The editor and show model do expose and send that setting. The native Android mapping path has separate loop handling.

**Smallest useful improvement:** apply the requested repeat mode when a desktop player opens and when its setting changes. Define the end-of-clip behaviour explicitly: hold the last frame, clear, or advance. Begin with one documented behaviour rather than adding several modes.

**Acceptance:** loop disabled plays once on desktop; changing it during playback takes effect; the UI describes the same behaviour on supported backends.

### 4. Preparation can unexpectedly change the projection

[`Dashboard.tsx`](../../examples/video/mapper/editor/src/components/Dashboard.tsx) launches or stops a populated cell when it is clicked. Clicking a cell in an entirely empty column stops all layers. [`transfers.ts`](../../examples/video/mapper/editor/src/transfers.ts) automatically places and plays a single successfully uploaded file when a layer is selected.

These are existing interaction choices, not crashes, but they make inspecting or preparing content hazardous during a show.

**Smallest useful improvement:** a clearly labelled live lock that disables automatic launch on import and geometry editing; an explicit way to inspect a clip without launching it. Keep an intentional launch action immediately accessible. Provide a reversible blackout that preserves playback, distinct from Stop all, which currently empties layers.

**Acceptance:** importing or inspecting a clip in the protected mode does not alter the projection; leaving blackout restores the running show without relaunching its clips.

### 5. Media identity is only a filename in the import workflow

[`editor/src/services/files.ts`](../../examples/video/mapper/editor/src/services/files.ts) flattens folders to basenames and sanitizes them. Different original paths, and different names after sanitization, can resolve to the same destination. `transfers.ts` sends to that destination without a collision choice; [`mediaStore.ts`](../../examples/video/mapper/src/services/mediaStore.ts) renames the completed upload to it.

Deleting media removes the file and references in the current editor's grid; named scene copies can still refer to it. Geometry history cannot restore deleted file bytes.

**Smallest useful improvement:** detect collisions before upload and offer replace or keep both, preserving the mapping to the actual stored name. Before deletion, show use in the current show and saved scenes. Offer removal from the show separately from deleting the underlying file.

**Acceptance:** importing two folders containing `intro.mp4` cannot silently replace the first file; deleting a referenced media explains which scenes will need repair.

## Missing features, in useful order

| Priority | Improvement | Why it helps | Small first version |
| --- | --- | --- | --- |
| P1 | Collect complete project / “assemblage” | A scene JSON currently carries mapping and show data, not all assets needed elsewhere | Export the project and its referenced assets with a manifest and relative paths; reopen independently of the original folders |
| P1 | Project workspace | Named scene copies do not organize an entire installation, its content and deliveries | Offline project workspace with stable surface/media identities and separately saved installation calibration |
| P1 | Remote player workflow | Fleet playback exists, but an operator needs an explicit project delivery and activation workflow | Choose a paired player, send a project revision, wait for readiness, activate deliberately and retain the last working revision |
| P1 | After Effects/Cavalry exchange | Existing SVG/JSON templates are a foundation, not a complete authoring round trip | Per-surface and atlas guides, generated authoring scripts, render naming manifest and relink of returned media |
| P1 | Source/Input and Output views | Atlas regions and physical surfaces need a visible, stable relationship | Select a surface and edit its source region beside its projector destination; version and lock the authoring atlas |
| P2 | Pre-baked output | A fixed show should be able to run with less compositing work on the player | Content bake retaining installation calibration; optional final-output bake for a fixed projector setup |
| P1 | Readiness summary | A running process or an uploaded file does not prove that every output can play the show | Show player connection, missing files, pending transfers and known playback limitations before launch; reuse existing fleet/device facts |
| P1 | First-projection guide | The current entry offers nine views and an expert layout immediately | A dismissible sequence: connect, identify output, add one surface, adjust corners, add a media, launch, save |
| P1 | Visible transport | Pause, seek and speed exist as control commands but not as a full editor transport | Play/pause, elapsed/duration and seek for a selected supported video; next/previous column for the show |
| P1 | Explicit output selection | The mapper has device viewports but no editor flow for selecting a local physical display | List supported displays, identify one, choose fullscreen output and show its actual resolution |
| P2 | Precision tools | Keyboard nudging already works; small and overlapping surfaces remain awkward | Zoom/pan, editable point coordinates, surface lock, duplicate surface and optional snapping |
| P2 | Manageable media library | Current tiles show name and bytes, with no search or media metadata | Search, type filter, dimensions/duration, clear unsupported-file errors and missing-media markers |
| P2 | Consistent thumbnails | `/thumbs` explicitly returns no video thumbnail on the desktop player path when none is cached | Generate/cache one modest image per video where the backend supports it; keep memory and decode work bounded |
| P2 | Organizable show grid | Columns have names in data, but the current grid headers only launch them | Rename/reorder/duplicate columns and clips, with an obvious inspection/launch distinction |
| P2 | Installation presets | A saved scene currently combines physical mapping and content | Reuse the same surface calibration across shows, and move a show to another saved installation through an explicit mapping step |
| P2 | Tablet control layout | The desktop layout retains both sidebars, nine tabs and the clip grid | Collapsible inspector/library, larger touch targets and a compact playback view; verify gestures on an actual tablet |
| P3 | Simple transitions and cues | Hard switching limits small performances and unattended sequences | A timed fade and a next-cue action; then optional auto-advance, without starting with a full timeline editor |
| P2 | Procedural Zinc sources | Existing Zinc programs can produce images, but the library does not expose a generator workflow | One parameterized generator with explicit time/seed; retain it in the project and bake for unsupported targets |
| P3 | Live sources | The library exposes patterns/colours and media, not camera or screen inputs | Add one camera source, then one screen source, using existing Zinc plugins and runtime capability reporting |
| P3 | Remote output preview | The current Output canvas draws coloured geometry rather than the actual composited video | Start with an on-demand snapshot or low-rate preview, off by default on weak players |

The complete-project export is distinct from fleet copying: copying already exists between paired players; an archive is for moving, backing up and restoring a self-contained project.

## Extended product workflow

The requested features form one workflow: **Project → Author → Preview → Bake if useful → Collect project + assets → Deploy → Play**. Collection is also available at any editing stage for handoff or backup. Treat these as connected parts of the mapper rather than separate utilities.

### Project: the document the operator owns

A scene is a saved mapping/show snapshot today. A project should own the whole job: its name, surfaces, media, shows/cues, output assignments, installation presets, authoring exchanges and export recipes. A deployment is a specific revision of that project on a player, not the only editable copy.

First version:

- New/open/recent/save-as project; a local workspace can be edited with no player connected. The current editor is entered after connecting, so offline preparation needs an explicit path.
- One versioned manifest, relative asset paths and stable IDs for referenced media, surfaces and outputs. Display names remain editable; existing name-based links and scene JSON need a migration together.
- Keep originals, generated guides and rendered deliveries distinguishable. Generated outputs can be rebuilt; replacing one must not overwrite the source artwork.
- Save, recover, collect and export all referenced content. Importing an existing scene creates a project without losing geometry or clips.
- Keep device pairing keys, web tokens and workstation paths outside the shareable project. A show archive and an executable `.zapp` serve different purposes.

Reuse the existing scene/show serializers initially, inside the project, rather than replacing their geometry model. Add only the manifest and relationships that the workflow needs. Put visible project/save/revision information in the editor header.

### Collect project and assets: “assemblage”

The owner clarified that **“assemblage” means exporting a complete project together with its assets**, as in Collect Files / Collect & Save. This is a first-class project action, not a grouping operation on surfaces.

Provide **Collect project and assets…** with a review of the files to include, missing dependencies, total size and destination. Collect the selected project revision's scenes/shows, mapping/calibration, referenced videos/images/audio, 3D models/textures, fonts and source resources needed by its generators or authoring exchanges. Resolve transitive dependencies too: a model's external textures or a generator's imported resources must not remain linked to the original workstation. Copy the assets, rewrite references relative to the collected project, preserve stable IDs and handle filename collisions without silently overwriting files. Leave the original project and media untouched.

Use one collected folder as the canonical portable result; an archive can wrap the same folder for transfer. Record a format/version and asset inventory with integrity information in its manifest. Exclude temporary caches and credentials. Keep derived baked media identifiable and include them when required by the chosen delivery. Missing or unavailable external dependencies must be listed explicitly; live cameras and remote streams are connection requirements, not files that collection can embed.

Distinguish collecting an editable project from delivering only a baked playback result. The first retains the sources needed to continue editing; the second can contain just the selected playback assets and settings. Show which is being exported and which external software/plugins a recipient still needs. Assets that cannot be redistributed should be reported, not silently assumed to be portable.

**Acceptance:** reopen the collected project on another workstation or player with the original source folders unavailable; every packaged dependency resolves, calibration and cue references survive, and missing external requirements are explained. Exporting, cancelling or failing a collection leaves the original intact. Repeated basenames and nested model/resource dependencies are included in the proposed proof.

### Additional spatial editing and show construction

Surface grouping is a separate, optional improvement suggested by the research. It can later provide reusable groups such as “three faces of a cube”, with local dimensions/transforms and independent installation placement. It is not a prerequisite for the requested complete-project export.

For content, choose individual surface canvases or an atlas where a single animation crosses several surfaces. Save each region's UV rectangle/orientation and intended resolution. Preserve these references when surfaces are renamed or cues are reordered.

Extend the existing Room view to show the content on the geometry, guides/decor, output assignments and saved viewing positions. A GLB import through the existing loader is a sensible first 3D exchange; metres, axes, UV orientation and surface identity still need a checked convention. Do not add a new FBX dependency just to copy VirtualMapper's input format.

For shows, provide named/reorderable cues, duplicate/reuse of clip arrangements, and later timed transitions. Reuse the current column engine for the first version rather than introducing a second timeline implementation.

### Remote player: delivery, independent playback and supervision

Separate three operations that are often called “remote”:

| Operation | Existing Zinc foundation | Mapper work still required |
| --- | --- | --- |
| Deliver and operate a player | `zinc agent` / `zinc device`: discovery, pairing, install/deploy, run/stop, logs, telemetry, shots and screen viewing | An operator-facing player list and project delivery flow; report actual supported capabilities |
| Play the same show across devices | Mapper `fleet*.ts`, `zinc:link`, `zinc:fleet`, copied media and scheduled commands | Associate the intended project revision with each player; expose readiness, activation and divergence clearly |
| Receive a remote app as content | `zinc:remote` provides a runtime image; `mapping.setImage()` accepts runtime images | A source adapter, connection/error handling, aspect/size selection and availability reporting |

The target workflow is: select a player, choose project/show and editable or baked delivery, transfer into a staging revision, verify dependencies, mark ready, activate intentionally, and keep the previous working revision. A failed transfer leaves the active show running. Closing the editor leaves the activated show running; a transient control disconnect does not stop it. Offer restart/resume and boot-project selection using the platform's existing player/session mechanisms.

This must be distinguished from today's fleet behaviour, which replicates edits as they happen. A staged delivery must not change the active fleet's geometry or show halfway through a copy. Activation, project identity and playback state require an explicit protocol transition.

Existing device deployment has useful mechanisms but also command-specific lifetime rules: current `deploy` with followed logs stops its app on disconnect/Ctrl-C; `--no-logs` deliberately persists. The product's “leave playing” action must select and verify the intended lifetime. Agent deployment applies to supported agent devices, not automatically every Android player. See [`zinc-next-agent.md`](zinc-next-agent.md).

Start with a status/shot view, then a bounded low-rate preview. [`zinc:remote`](../plugins/remote.md) transports damaged pixel rectangles with RLE; its documentation explicitly targets UI and games rather than full-motion HD video. It is useful as a source and diagnostic, but not a substitute for distributing local media. Its native plugin targets also do not establish browser/Android support. Verify whether a screen mirror includes the mapping compositor before calling it the final-output preview.

### After Effects and Cavalry: a checked authoring round trip

Offer three separately labelled exchanges: **authoring kit out**, **live preview in**, and **finished render back**. A live texture connection does not export an editable authoring project.

The first kit should contain flat guides per surface, a whole-stage/atlas layout, a PNG fallback, calibration metadata and expected output filenames. Record dimensions, frame rate, duration, surface IDs, UVs, orientation, alpha and colour-space expectations. The current SVG templates already cover part of this; preserve curved-mask handles or sample their contours correctly before treating the kit as an exact mask reference.

| Tool | First integration | Important boundary |
| --- | --- | --- |
| After Effects | Generate a `.jsx` setup script that builds named surface/atlas compositions, imports raster guides, adds guide layers and prepares render destinations | Use Adobe's supported ExtendScript path, not hand-written `.aep` serialization. Optional `aerender` integration operates on a saved AE project on a machine with AE and its dependencies installed |
| Cavalry | Generate a script for its JavaScript Editor using its API to prepare guides/layers and render-queue entries; keep a manually importable guide kit as fallback | Its API documents SVG-to-layers and render-queue operations. Its legacy CLI page says the CLI is unavailable in 2.7 and later; do not make that CLI a prerequisite |
| Returned renders | Match manifest entries to stable surface/media IDs, present changed/missing renders, and replace media references while preserving calibration | Do not guess identity only from a basename, or reset geometry when a designer exports a new version |

Sources: [Adobe scripts](https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html), [Adobe automated rendering](https://helpx.adobe.com/after-effects/desktop/render-and-export/automate-rendering/automated-rendering-network-rendering.html), [Cavalry API](https://cavalry.studio/docs/tech-info/scripting/api-module/), [Cavalry CLI limitation](https://cavalry.studio/docs/applications/cavalry-cli/).

Exact conversion of arbitrary warp grids, curved masks and blend operations to native authoring-tool effects is a separate compatibility problem. A four-corner operation is sufficient only for the matching planar transform. Keep the authoritative calibration in Zinc and export flat content guides first. Syphon/Spout reception can follow as an optional preview adapter on supported hosts; there is no verified Zinc adapter established by this review.

### Pre-baked export: two products with different freedoms

| Export | What is baked | What remains adjustable |
| --- | --- | --- |
| Content bake | Chosen content, cue timing and content effects flattened per surface or atlas | Installation geometry, final masks/blending and output assignment, when deliberately excluded from the bake |
| Final-output bake | Composition at the actual resolution of each output, including its chosen warp, masks and blending | Playback and supported device-level controls; changing the installation requires a new bake |

For fixed installations, one output movie per projector can reduce the compositing required on a small player. It does not guarantee that the player can decode that resolution/codec, or remove the need for synchronization. Multiple files must have the same time origin, frame rate and duration. Retain the editable project alongside the baked deliverable.

Each render recipe must state output dimensions, rational frame rate, frame range, audio handling, codec/profile, alpha and colour settings, and which mapping stages are included. A final-output movie is played through an identity/full-output path: applying its warp or edge fade a second time is wrong. Any relevant content/calibration change marks that bake outdated; unchanged dependencies can reuse it.

Zinc already provides capture, a fixed runtime clock, and display-gl framebuffer/readback code. These are building blocks, not a complete offline movie renderer:

- `zinc capture` currently runs a bounded set of screenshot frames; the GL driver's screenshot path has its own output handling. Reuse the compositor and capture plumbing, but prove the exported pixels include the complete intended mapping pass and omit the HUD, code and selection frame.
- The documented deterministic mode does **not** make threaded video decoding deterministic. For export frame `n`, evaluate at `n / fps`, obtain the correct decoded source frames and wait for them before composing; do not record wall-clock playback or merely speed up the main loop. Fix the shared engine/plugin boundary if a frame-stepping API is missing.
- The first proof can write a bounded image sequence and encode with FFmpeg on the authoring workstation through the existing process support. Check encoder availability: linking FFmpeg for decoding does not establish an installed encoder command or supported output profile. No handwritten movie codec is needed.
- Keep a bounded number of frames in flight, stream to disk/encoder, report progress, allow cancel, and finalize only a successful export. Do not retain the entire movie in RAM. Audio is an explicit path to implement or reject; the current desktop mapping path does not supply a complete audio mix.
- Exclude unpredictable camera/remote/live inputs from a reproducible bake unless recorded first. A rendered clip, its timing and calibration can be baked; a future interactive response cannot.

## Reuse map for the extension

| Existing code or facility | Reuse | What must not be assumed |
| --- | --- | --- |
| `mapper/editor/src/model/{geometry,templates,room,links}.ts` | Surface maths, guide generation, scene geometry, GLB export and corner relationships | Exact external-tool mask conversion or imported model identity is not already solved |
| `mapper/editor/src/components/RoomView.tsx`, `plugins/three/addons/GLTFLoader.ts` | Extend the room preview and load a conventional 3D scene | Current Room view's coloured surfaces are not already textured projection simulation |
| `mapper/src/services/{scenes,show,history,fleetMedia}.ts` | Project migration, cue playback, recovery and resumable file distribution | No complete project manifest, staged activation or content-hash verification follows automatically |
| `plugins/remote-view`, `mapping.setImage()` | Feed an existing remote image into a surface | No proven HD movie transport or browser remote-source adapter |
| `src/agent`, existing Pi player/session | Deploy, supervise and deliberately persist playback | Reusing device transport does not give mapper project rollback/activation semantics for free |
| `src/cli_core.cpp::capture`, `plugins/display-gl/src/display_gl.cpp` | Frame scheduling/capture scaffolding and composed-output readback | No existing arbitrary-duration deterministic video bake established |
| `plugins/video`, `plugins/process`, `lib/std/web.ts::sha256` | Decode, invoke installed authoring/encoding tools, identify assets | Avoid whole-movie buffering or whole-file hashing in RAM for large media |
| Existing `.zapp` / `.zpk` packaging | Deliver executable players and bundled resources where appropriate | A shareable editable show is not itself necessarily an executable app; reuse packaging deliberately |

## VirtualMapper: useful patterns and limits

[VirtualMapper](https://github.com/baku89/VirtualMapper) is a useful reference for previewing authored images on an assembled 3D scene. Its MIT licence permits reuse under its terms; adapting its concepts to Zinc is preferable to adding its older openFrameworks/FBX application as a runtime dependency.

- Separate projection meshes, guides and environment geometry. Its FBX importer identifies roles by names such as `screen` and `guide`; Zinc can use explicit project roles instead. [Importer source](https://github.com/baku89/VirtualMapper/blob/master/src/ExtendedFBXManager.h).
- Put incoming content on the screens' UVs, and save camera/view presets. Apply that pattern to the existing Room view, with named audience/projector/overview viewpoints. [View source](https://github.com/baku89/VirtualMapper/blob/master/src/Manager/ViewManager.h), [scene source](https://github.com/baku89/VirtualMapper/blob/master/src/Manager/SceneManager.h).
- Accept a rendered file or a live texture source through one source-selection workflow. Its implementation includes platform-specific Syphon/Spout sources. [Source manager](https://github.com/baku89/VirtualMapper/blob/master/src/Manager/SourceManager.h).
- Its documented AE workflow receives an image stream, not an editable AE project. Its README still lists image/video export as a TODO. Neither a production bake pipeline nor a remote-player fleet should be credited to it. [Workflow and TODO](https://github.com/baku89/VirtualMapper#readme).

A UV-textured room preview is distinct from simulating a physical projector with calibrated optics, depth/occlusion and overlap behaviour. Label the first version as content preview. Add projector-frustum projection and its validation as a separate capability if required; neither an orbit camera nor a mesh textured with a video proves physical accuracy.

## Refinements from Projection Mapping Central

The [research appendix](mapper-projection-mapping-research-2026-11-08.md) adds five practical requirements to the workflow above:

1. **Source/Input beside Output:** expose atlas-region assignments explicitly and keep source layout independent of installation adjustments.
2. **Prepare for this player:** decide whether to reuse, transcode or bake content from reported target capabilities, before sending a staged revision. Keep originals intact.
3. **Unattended operation:** a compact player-maintenance page, saved boot project and deliberate persistence; scheduling follows an installation need and a verified device clock.
4. **Procedural content:** preserve Zinc generators as editable sources and bake them only where required. Reuse runtime images rather than import another engine.
5. **Separate synchronization claims:** matching media, shared clock, followed playback and verified projector seams are different facts. Final-output bake does not synchronize physical display phases.

Model updates from Blender/GLB, photo-based installation planning and recorded camera-calibration sessions are documented as further leads. Automated calibration remains separate research, with candidate/accept/undo semantics and actual optical validation required.

## Platform limits to make visible

- Desktop layer playback currently decodes pictures without sound. `SoundPanel.tsx` exists, but this is not evidence of desktop audio playback. Disable unavailable controls with a reason before expanding audio support.
- Android's mapping media path is separate from `layerMedia.ts`; the current shared-clock video correction does not establish Android playback synchronization. Treat Android transport and synchronization as backend work, not merely missing buttons.
- Fleet content comparison uses size and recorded timestamps. `fleetMedia.ts::needed()` accepts an unknown local file of the correct size as already matching. A readiness check should not label that as content verification; use a digest if exact media identity is required.
- Existing Pi results are recorded in [`mapper-multi-device.md`](mapper-multi-device.md), including a real-network follower run. They are previous evidence, not a new proof of arbitrary HDMI projectors, NUCs, three or more machines, or operation during a large SD-card write.
- Keep the detailed metrics, but turn them into useful summaries: ready, copying, disconnected or unsupported, with the specific reason. Do not invent timing thresholds before choosing an installation's requirements.

## Proposed interaction model

Latest direction: the owner rejected the first UI proposal as too simplistic and requested a professional workbench inspired by Resolume and Millumin. The revised [UI and user journeys](mapper-ux-flow-2026-11-08.md) and [interactive prototype](mapper-ux-proposal-2026-11-08.html) supersede that first layout. They model source/output monitors, a docked clip matrix, contextual inspection, corner editing, project collection and remote activation using fictional data, without production integrations.

Keep the current components and dark workbench. The owner's 2026-11-09 refinement separates four workspaces:

1. **Composition:** library, source/output previews, clip/layer properties and a multi-layer clip matrix. Selection and draft editing are distinct from launching.
2. **Mapping:** projector-space geometry, linked corners, mesh and edge blend. Hide the cue matrix, media library, source monitor and playback transport; keep a zone tree, a large canvas and numerical geometry controls. Maximum view also hides the tree and inspector.
3. **Zones:** local-space crop, masks, curve handles and feather for the selected zone. Keep the same calibration layout and selected zone when moving between Mapping and Zones.
4. **Lecteurs:** output assignments, active/prepared revisions, transfer/readiness and deliberate activation. Project collection, authoring export and bake remain project-level actions.

Playback transport, timecode and cell/column launches belong to Composition. Calibration retains a compact blackout control, with no hidden-cue launch/delete shortcuts. A first-projection guide remains optional help. The prototype illustrates draft/program isolation; production implementation must complete or explicitly limit that rendering/state boundary.

A smartphone calibration controller complements the desktop: choose the zone/tool/point, nudge by 1/5/10 pixels or move a relative touchpad, undo and show a test card. The prototype has an explicit pairing/connected/lost lifecycle and locally shares draft geometry with the illustrated phone. It does not communicate between devices. Reuse the existing web editor, token-checked `/osc` route, `/state`, pairing and point editor when implementing the real controller; a scoped calibration session, ownership, revision acknowledgements and revocation still need design and implementation.

Show a persistent summary: project name, save state, player connection, current cue and whether the operator is editing or performing. Keep technical diagnostics in the existing detail panels. Use the current translation system for new labels.

## Delivery sequence and acceptance

These are suggested batches, not new backlog tasks. Reuse existing work where possible and do not change the shared engine work already in progress.

| Batch | Scope | Proof to propose |
| --- | --- | --- |
| 1. Trust the editor | HTTP error handling, explicit connection/save state, actual playback refresh, desktop loop correction | Rejected save; disconnect/reconnect; OSC/remote launch; one-shot video |
| 2. Protect the show | Inspect without launch, live lock, import without autoplay in protected mode, reversible blackout | Import and inspect while a clip plays; lock geometry; blackout and restore |
| 3. Own and collect the project | Offline workspace, legacy-scene import, asset IDs/collisions, project + transitive assets collection/import, missing-file repair | Reopen elsewhere with original folders unavailable; duplicate basenames; model textures/generator resources; source project survives cancellation |
| 4. Deliver remotely | Prepare for player, staged project revision, readiness, deliberate activation, previous revision and boot-project selection | Disconnect mid-copy without disturbing the active show; activate when ready; editor close and offline restart preserve intended playback |
| 5. Author and preview | Atlas, Source/Output editing, content on Room, saved views, AE/Cavalry kits and render relink | One design crossing two surfaces; replace content without changing its region assignments; returned render preserves calibration |
| 6. Bake and play | Short content bake first, then final-output bake, encoder output and player delivery | Exact frame count/timing; no HUD or double warp; cancel stays bounded; show outdated bake after a relevant edit |
| 7. Reduce setup time and expand | First-projection guide, physical output selection, precision/tablet tools, transport, one Zinc generator, one live source, basic fades | First setup; reproducible generator frame; unsupported capability explanation; switching shows preserves calibration |

For each implementation, prove the affected feature with a short bounded run. Reproduce defects in the smallest case first. App/demo scenarios above are proposed tests only: do not add a new suite or run T1/T2, hardware campaigns or benchmarks without the owner's chosen milestone.

## Reference patterns

The recommendations use selected patterns, not feature parity with large media servers:

- [HeavyM: sequences](https://help.heavym.net/hc/en-us/articles/9172868530066-Module-1-the-Sequences) distinguishes edited, played and draft sequences. This supports making inspection and projection explicit.
- [HeavyM: Collect & Save](https://help.heavym.net/hc/en-us/articles/6611135681810-Collect-Save-and-file-handling) collects external files alongside the project and keeps backup copies. This supports portable projects.
- [Resolume: Media Manager](https://resolume.com/support/en/6/media-manager) identifies missing files, relocates them and collects project media. This supports a repair workflow rather than a generic playback failure.
- [Resolume: Output Setup](https://resolume.com/support/en/output-setup) exposes display selection, identification, test cards and output information. Zinc already has cards; the improvement is connecting those tools to a guided output setup.

## Documentation drift and deferred work

The README describes media copying and followed video playback, then says neither exists. It also says show replication is future work, fleet sync is only studied, and Pi has not run on hardware. These claims conflict with current code and the updated multi-device report. Rewrite the status sections together and replace the historical editor screenshot after the next verified UI run.

The multi-device report itself mixes an original research inventory, later completion notes and older blockers. Preserve the research, but add a short current-state summary so a returning contributor does not reimplement completed work.

Defer automatic camera calibration, a full timeline, DMX/MIDI learn, NDI/Syphon/Spout routing, automatic leader failover and advanced audio routing until an actual installation needs them. Some could be useful later; none is needed to fix the everyday workflow identified here.

Outstanding validation: no current interactive usability session, no new projector/tablet run, no decoder or cross-device measurements, and no real Chataigne/Millumin/Resolume integration test. AE/Cavalry script execution, GLB round trip, remote mapping-source capture, staged project activation and pre-baked playback are proposed work, not demonstrated integrations. Current source, historical reports and the cited external documentation are the evidence for this review.
