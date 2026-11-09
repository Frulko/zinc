# Mapper: leads from Projection Mapping Central

Date: 2026-11-08. Extension of the [product and UX review](mapper-product-ux-review-2026-11-08.md), requested by the owner after the VirtualMapper review.

Terminology: the owner's “assemblage” means **collect/export the complete project with its assets**. References below to 3D scene layout or the artwork named *Assembly* concern separate research ideas, not that requested export action.

## Scope and evidence

Explored [Projection Mapping Central](https://projection-mapping.org/), its software directory, archive links and selected tutorials/tool profiles. The bounded discovery returned 180 URLs, including categories and tags; this is not 180 reviewed articles or an exhaustive crawl. Ten selected profiles/tutorials were read in detail, with additional calculator and research material. Product claims were checked against upstream documentation where accessible.

PMC is a useful discovery archive, not a current support matrix. Do not copy historical prices, performance figures, hardware compatibility or the label “open source” into Zinc's requirements. No referenced application, hardware or integration was executed.

## Findings that change the proposal

### 1. Make the source-to-surface relationship visible

The first-person [Pittsburgh skyline tutorial](https://projection-mapping.org/simple-pittsburgh-skyline-projection-mapping-tutorial/) describes preparing separate vector objects, arranging them into a content template in After Effects, then mapping each source region onto its physical object. It emphasizes keeping the content template stable after authoring starts.

**Zinc proposal:** add a Source/Input view alongside Output. Select a surface and see both the region it samples from a media/atlas and its destination on the projector. Connect them through the same stable surface ID. Copy, rotate, crop and name source regions; lock the authoring atlas independently of the installation calibration.

Reuse the mapper's `FrameEditor.tsx`, `model/templates.ts`, geometry, fit and framing operations. This adds an explicit visual workflow to existing sampling controls rather than introducing a second warping engine. An atlas revision should accompany authoring-kit export and returned renders.

**Proof to propose:** author two objects in one atlas, place the physical objects differently, replace the animation, and retain both source assignments and calibration.

### 2. Prepare a delivery for a specific reader

[MiniMad's product page](https://madmapper.com/minimad/product) describes exporting a chosen projector's surfaces and content, with splitting and optimization of movies. Its [FAQ](https://madmapper.com/minimad/faq) suggests recording a final output and replaying it on a fullscreen quad for materials its player cannot execute.

**Zinc proposal:** one “Prepare for this player” action should offer editable mapping or final-output bake, using actual device capabilities. Show dimensions, media compatibility, storage estimate, required source types and what will remain adjustable. Then prepare a staged revision, send it, verify it and activate deliberately.

Do not make transcoding automatic for every file: reuse a compatible original, transcode when the target needs it, bake when the content/composition requires it. Keep these derived files separate from the authoring media. This builds on Zinc's agent, fleet and packaging facilities; it does not require MiniMad's implementation.

### 3. Expose several levels of synchronization

MiniMad's FAQ explicitly acknowledges a possible one-frame difference between players and advises against using that synchronization for soft-edge overlaps. This is a useful example of documenting the boundary between synchronized media and synchronized video signals; its limit is not a measurement of Zinc.

**Zinc proposal:** distinguish media present/verified, shared clock, followed playback, and physically verified seam. Existing fleet metrics address parts of these, not all of them. A bake does not remove display-phase or projector-latency differences. Do not label an installation “seamless” from clock offset alone.

Keep media digests, timeline error and physical output checks separate. Initially summarize existing facts without claiming a new genlock mechanism.

### 4. Make an unattended installation a first-class use case

[PocketVJ's official site](https://magdesign.github.io/pocketvj_website/) presents browser management, autostart, scheduling and controls whose availability varies by product. [ofxPiMapper](https://github.com/kr15h/ofxPiMapper) documents presentation mode and saved compositions; MiniMad documents autonomous startup. These are product patterns, not reliability results reproduced here.

**Zinc proposal:** provide a compact phone-friendly Player page with active project/revision, chosen boot show, connection, transfers, identification, supported controls, logs and last error. Basic scheduling belongs with the installation/player rather than an individual clip. Start with one local daily start/stop window and an explicit manual override if a real installation needs it.

Reuse agent/session startup and ownership rules. Verify that the device knows the correct local time/timezone before promising calendar operation. Distinguish stopping playback, stopping the app, blanking the output and powering down the projector. Existing OSC and serial/socket facilities can carry supported control protocols; no generic projector-management adapter was established by this review.

**Proof to propose:** restart with no editor/network, recover the chosen project, and show the real playback status when the editor returns. A power-cut proof is separate from an ordinary process restart.

### 5. Keep procedural Zinc content as a source

ofxPiMapper's custom framebuffer sources provide a relevant model: a generator produces an image independently of the surface receiving it. Its MIT code is tied to openFrameworks and platform-specific playback components; it is not a drop-in Zinc dependency.

**Zinc proposal:** alongside media/camera/screen/remote sources, allow a Zinc generator with named parameters, time/seed and a runtime-image output. Retain the generator in an editable project; bake it for a target that cannot execute it. Reuse `mapping.setImage()`, the mapper's `src/live.ts` example and existing graphics/3D/SVG/Lottie facilities as appropriate.

Begin with a small number of existing source types and app-local adapters. Do not invent a new universal plugin system. Every source needs a clear start/ready/failed/stop lifecycle; unsupported sources must report why. External inputs such as OSC, MIDI or serial can drive a live generator, but reproducible baking requires recording or fixing those inputs.

### 6. Preserve the modelling and authoring round trip

PMC's [Splash profile](https://projection-mapping.org/portfolio/splash/) leads to [Splash's upstream mirror](https://github.com/paperManu/splash), which describes UV-mapped models, calibration and a Blender addon for configuration export and live mesh updates. The mirror directs current development to [GitLab](https://gitlab.com/splashmapper/splash). Its website documentation could not be inspected through the tools used here.

**Zinc proposal:** complement the existing GLB export with a checked import/update workflow. Update geometry by stable surface/object ID, preserve media/cues when a designer corrects a model, and identify the affected calibration and bakes. Use the existing GLTF loader before considering another model format. Keep assembly geometry, source UV layout and physical projector calibration separate.

Splash is GPL-3.0; treat it as an architectural reference rather than copying its engine into Zinc. No library or addon was vendored.

### 7. Add installation planning before promising optical simulation

PMC's [Mapping Matter profile](https://projection-mapping.org/portfolio/mapping-matter/) points toward 3D installation planning; the upstream site was unreachable during this review, so its current features are not established. PMC's [brightness calculator](https://projection-mapping.org/calc/) itself notes that brightness estimates omit other installation constraints.

**Zinc proposal:** keep a reference photo, real dimensions, projector/lens notes, mounting position and expected output resolution with an installation preset. Start with photo/guide overlays and explicit throw-ratio/distance information based on entered specifications. Later add validated coverage, occlusion and overlap views.

Do not turn a rough brightness or throw estimate into a guaranteed setup. Reuse Room's dimensions/lens model, but distinguish an illustrative preview from a calibrated physical prediction. This is a planning lead, not a reason to clone a commercial simulator.

### 8. Research assisted calibration as a separate capability

PMC's [Assembly installation article](https://projection-mapping.org/assembly/) links to the creators' [HanRiver source](https://github.com/elliotwoods/HanRiver-openFrameworks), including scan, correspondence and calibration tools. Its [projector-camera calibration profile](https://projection-mapping.org/portfolio/cqt-projector-camera-calibration/) also leads to [Calibrator](https://github.com/hezhao/Calibrator), whose documented dependencies are older Qt/OpenCV/Canon SDK versions. These are algorithm/workflow leads, not ready integrations.

**Zinc proposal:** advance from manual points to a saved calibration session, then evaluate assisted point correspondence or structured-light capture. A session records source images, resolution, exposure/focus settings, observed points, solver result and a visible residual/error report. Candidate calibration must be previewed and accepted before replacing the active one, with undo available.

Reuse `zinc:camera`, `zinc:gphoto2`, calibration-card presentation and project persistence for acquisition/UI. OpenCV's official [Gray-code API](https://docs.opencv.org/4.9.0/d1/dec/classcv_1_1structured__light_1_1GrayCodePattern.html) provides correspondence primitives; it is not an existing Zinc solver. Choose a proven solver and inspect its licence/platform cost before any vendoring. A Gray-code correspondence alone is neither a complete optical calibration nor automatic colour correction.

Geometric calibration, overlap/blending and photometric correction need separate success criteria. Full automatic scanning, moving-object tracking and RoomAlive-style depth interaction remain research, beyond the first usable release.

## Reuse and dependency decisions

| Reference | Useful pattern | Decision for Zinc |
| --- | --- | --- |
| MiniMad | Targeted export, baked fallback, independent playback | Product inspiration; use Zinc's existing playback and deployment |
| PocketVJ | Mobile maintenance, scheduling, capability-specific UI | UX inspiration; its older CP v3 repository is not a permissive reuse candidate |
| ofxPiMapper | Source/surface separation, generators, presentation mode | MIT reference, but importing its openFrameworks engine is unnecessary |
| Splash | Model/UV workflow, Blender update, calibration stages | GPL architectural reference; do not embed its engine |
| VirtualMapper | Textured assembly preview and stored views | Extend Zinc Room/three rather than depend on the old application |
| OpenCV / Calibrator | Calibration primitives and capture/solve workflow | Further solver evaluation required; no current integration claimed |

The older [PocketVJ CP v3 licence](https://github.com/magdesign/PocketVJ-CP-v3/blob/master/LICENSE.md) explicitly restricts several uses. PMC's “open source” description is therefore insufficient grounds for copying code. Likewise, availability of historic Raspberry Pi images does not establish support for current Pi models.

## Priority changes and proposed proofs

Keep the existing reliability and project work first. Integrate the following refinements into its batches rather than starting unrelated subsystems:

| Existing batch | Added outcome | Small proof to propose |
| --- | --- | --- |
| Project collection / authoring | Portable project + assets, visible Source/Output assignments and versioned atlas | Reopen with original folders unavailable; two source regions; replacement content without remapping |
| Remote delivery / bake | Prepare for player; editable vs baked choice; compatibility and staging feedback | A compatible original is reused; a required bake is identified; failed copy leaves the active revision intact |
| Player operation | Compact maintenance view and boot-project selection | Offline restart and reconnection reflect the saved active revision |
| Sources | One existing Zinc generator as a parameterized image source | Same fixed time/seed gives a reproducible source frame; unsupported player reports or requests bake |
| Later calibration work | Recorded acquisition plus candidate result and undo | Known calibration fixture, reported residual, rejection leaves the active calibration untouched |

These are proposed scenarios only. No app/demo suite, hardware campaign, performance number or new backlog task was produced. The useful result of the research is a more explicit source-to-surface and author-to-player workflow, not a larger list of protocols to implement.
