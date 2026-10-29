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
