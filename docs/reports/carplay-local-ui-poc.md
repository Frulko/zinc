# CarPlay Ultra Local UI: original-script POC

29 October 2026. Developer experiment, not a complete Ultra renderer.

## Discovery

The `44C9FA31EC:985` catalog ZIP contains both phone assets and
**AssetData/CarPlayAccessory.assets.zip**. Earlier conclusions drawn from
phone-side Core Animation files did not establish the accessory format.
The accessory archive contains 193 plaintext Lua modules, 193 `.luac` files,
and 2875 PNGs. Its `main.lua` loads package/theme data and starts LayoutController.
The scripts expect native `CP` graphics, vehicle-data and messaging functions;
APL declares bridge version 1.4.0.

Outer SHA-256: `872c2a33ea16b481da6515f5c19c5ea736a23ed4ae5be97d6994ac2649cdb385`.
Accessory SHA-256: `ddf1317ef051f8ac251c9d892b5ea0651a75e14dd59e0f5ac2ff13b37729d504`.
Hashes identify the inspected bytes, not their authenticity. The 70-byte
`.sha256` companion is binary and signature-shaped, not a printable checksum.
Signature verification remains unimplemented. No Apple scripts/images are committed.

## Run the proof

Requires Python 3, Lua 5.3+ (`lua` on PATH), built Zinc and a supplied catalog ZIP.
Choose a new output directory:

```sh
tools/carplay-local-ui-poc/run /path/to/catalog.zip --out build/carplay/local-ui-probe
ZINC_BACKGROUND=1 build/zinc run build/carplay/local-ui-probe
python3 tools/carplay-local-ui-poc/test.py
```

Outputs: inventory.json (counts, hashes, CP symbols, provenance), probe.json
(geometry, results, theme data), six extracted PNGs in assets/, gauge.svg and
a generated Zinc project. Temporary Lua sources are removed after execution.

Original `SpeedometerUtils._getNormalizedValue` processes 0, 65 and 130 km/h
supplied in meters/hour against maximum 160: results 0, 0.40625 and 0.8125.
Original DigiBarRadialStyle, AngleConfiguration and DigiBarRadialLayout compute
geometry from PackageData. The selected thick track is the Cobranded speedometer's
**cruise-control track configuration**, not the complete speedometer assembly.
A small APL shim records path calls. Python converts them to SVG; Zinc draws
the geometry and separately displays three original decorative PNG resources.

Orange/grey are diagnostic colors. The full palette, ticks, text, animation,
video composition and live state updates are not implemented. This is selected
original Lua running in an external process, not `main.lua` embedded in Zinc.
Some modules use table iteration conventions requiring further dialect analysis;
the whole package is not yet proven compatible with stock Lua.

The restricted loader exposes no IO, OS or native-module loading and permits
only selected modules, with an instruction limit and parent timeout. Archive
expansion/member names are bounded. This is not a hardened hostile-code sandbox.

## Runtime implementation path

Embed a proven Lua runtime in the CarPlay plugin after checking dialect compatibility.
Keep it separate from Zinc's language/compiler; do not depend on `.luac` ABI compatibility.

| Boundary | Observed script interface | Work remaining |
|---|---|---|
| Package handle | PackageParser, asset manifests | Verified immutable package, bounded lookup, resource lifetime |
| Graphics | DPLayer, DPShapeLayer, DPImageLayer, DPTexture, DPPath | Retained layers, transforms, paths, masks and blending |
| Text | RasterFont, VectorFont, DPTextLayout | Atlas/layout and compatible metrics |
| Vehicle data | registerVehicleDataTypes, getVehicleDataUpdates, setVehicleData | Typed local state and callbacks, initially simulated |
| Timing | PTS, Timer, RunQueue | One rendering clock and scheduling |
| UI Sync | status, receiveMessage, sendMessage, reset | Decrypted per-display messages with original timestamps |
| Video | DPVideoLayer, enumerateInputStreams | Associate decoded textures with streams and presentation times |
| Output | setRootLayer, enumerateOutputStreams | Composite local, remote and punch-through layers |

Next: run a complete original gauge constructor with appearance/state controllers,
implement its CP subset, replace offline SVG export with retained Zinc graphics,
then connect recorded and finally live UI Sync. Unsupported calls must fail visibly.

## Receiving assets from iPhone

[Apple's architecture session](https://developer.apple.com/videos/play/wwdc2024/10111/)
describes asset transfer from iPhone during pairing. **This archive came from the
catalog; it is not a captured phone transfer.**

Our Iap2FileTransferReceiver accepts only Now Playing artwork type 2, with a 2 MiB
limit, and cancels other types. It cannot currently receive this 30,821,866-byte
accessory ZIP. It is not established that Ultra assets use that same session or
Setup format. Raising the cover limit would not implement the missing negotiation.

Capture the asset offer, identify transport/metadata, then implement a separate
bounded disk-backed receiver. Preserve raw package, provenance, asset/version,
hashes and verification state. Authenticate before activation and retain the
previous verified package. No fresh pairing or Pi changes were made for this proof.

## Verified and unverified

The real-archive probe completed and asserted speed results. Asset-free tests cover
unsafe/duplicate ZIP members and signed arc conversion. The generated app compiled
and rendered on the Mac. The final interpreter screenshot shows geometry, text and
original images; the final native build displays geometry but omits text/images.
This engine defect is tracked as ZN-861; the probe source is not changed to hide it. Full runtime, phone asset capture, signature validation,
UI Sync composition and Pi performance remain unproven.


## POC 2: original complete speedometer component

`tools/carplay-local-ui-poc/component/run.py` executes the first Speedometer
component of the Cobranded layout, including its original slots, appearance
controllers, labels, progress and visibility controllers. It does not replace
these modules with locally drawn gauges. The 193 plaintext modules are wrapped
unchanged; the output report records each SHA-256. No original module or artwork
is committed to the repository.

This is an **offline scene export**, not a completed Local UI runtime in the player:

1. Official Luau executes the original modules against our limited CP layer recorder.
2. One component instance receives simulated speed changes 0 → 65 → 130 km/h.
3. Its retained layer tree is serialized, including masks and image atlas windows.
4. Python exports SVG with the original PNGs and raster glyphs. librsvg renders it.
5. A generated Zinc app displays the three snapshots.

The genuine script results include the speed text, tick labels, decorative image,
unit, fuel icon, range label and progress arc. Fuel and range are simulated at
68% and 320 km. Assertions check three updates, the normalized progress values,
the original decoration and changing glyph windows. Missing data subscriptions
or unsupported CP calls fail the export. This does not prove compatibility with
other layouts, video, notifications, input, package updates or UI Sync.

The dialect is executable by [Luau](https://github.com/luau-lang/luau): the modules
use its [generalized table iteration](https://luau.org/syntax/), and the original
logger even mentions Luau. Standard Lua is insufficient for the full constructor.
The experiment runs plaintext `.lua`, not `.luac`; embedding a bytecode-compatible
runtime is not yet established.

### Reproduce locally

Dependencies: Python 3 with Pillow and NumPy, `rsvg-convert` (librsvg), CMake and a
C++ compiler to build the standalone Luau CLI. No Luau library is vendored into
Zinc yet. Pin the tested official MIT-licensed runtime:

```sh
git clone --depth 1 --branch 0.692 https://github.com/luau-lang/luau /tmp/zinc-luau-0692
git -C /tmp/zinc-luau-0692 rev-parse HEAD
# Expected: 9457397af45f9d69423c5168d23fddd998a5f0fd
cmake -S /tmp/zinc-luau-0692 -B /tmp/zinc-luau-0692/build -DCMAKE_BUILD_TYPE=Release -DLUAU_BUILD_TESTS=OFF -DLUAU_BUILD_WEB=OFF
cmake --build /tmp/zinc-luau-0692/build --target Luau.Repl.CLI -- -j2 -l8
python3 tools/carplay-local-ui-poc/component/run.py /path/to/catalog.zip \
  --luau /tmp/zinc-luau-0692/build/luau --out build/carplay/original-component
ZINC_BACKGROUND=1 build/zinc run build/carplay/original-component
```

Choose a new output directory for each export. It contains the reproducible
bundle, execution log, `scene-{speed}.json`, SVGs, PNGs in `assets/`, the Zinc
project and `report.json`. Keep these outputs private: they include the supplied
package's code and artwork. The input archive is still the catalog ZIP, not a
package captured from an iPhone, and its signature remains unverified.

### Fidelity limits and current evidence

The CP bridge's geometry conventions are inferred from the scripts. The exporter
samples arcs at two pixels per segment, rasterizes conical gradients with an
inferred direction, and approximates PLUSLIGHTER using screen blending. The bright
sector and some dark tick labels are not validated against an Apple-rendered
reference. Original assets and scripts do not imply pixel-identical output.

On 2026-10-29 the real archive export and `carplay_local_ui_probe` tests pass.
Generated `build/carplay/local-ui-component-2` renders all three gauges in native
Zinc. Its explanatory UI text is missing in AOT, including a separate build with
symbols, but present in the interpreter. Captures:
`/private/tmp/carplay-original-component-repeat.png` (native) and
`/private/tmp/carplay-component-interp2.png` (interpreter). ZN-861 remains open;
no source workaround or engine fix is claimed. The earlier probe-4 happened to
render correctly on a repeated native run, so a general cache diagnosis is not
established.

Next implementation boundary: fix ZN-861, then map this recorded layer model to
retained Zinc graphics with correct alpha/additive masks and a shared animation
clock. Connect recorded UI Sync only after matching an original reference frame;
phone asset transfer and live video composition remain subsequent work.
