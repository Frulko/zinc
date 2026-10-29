# CarPlay Ultra feasibility on the Pi

Update: [the Local UI POC](carplay-local-ui-poc.md) found 193 plaintext Lua modules
and 2875 PNGs in the nested accessory archive. Selected original behavior/geometry
functions now run offline and produce a Zinc preview. This corrects the incomplete
earlier inspection of phone-side Core Animation assets; full runtime remains open.

Research and receiver probes on 29 October 2026. Vehicle State and UI Sync
have both exchanged messages with a real iPhone. An Apple catalog theme was
identified and advertised, but its signature chain and a synchronized Ultra
composition remain unverified.

## What the iPhone prompt proves

An iPhone showing **CarPlay Ultra** for PlayPort Pi proves that it recognized an
accessory offer. It does not prove that the later Ultra transport, vehicle-state
channels, asset package, or instrument UI were negotiated. The initial receiver
advertises a main display (stream 110) and an auxiliary cluster display (stream
111) in the generated `AirPlayInfoPlist.kt` patched by
[`plugins/carplay/backend/usb/prepare`](../../plugins/carplay/backend/usb/prepare).
At that stage it only listed `vocoderInfo` and `enhancedRequestCarUI` as extended features and
had no observed UI-sync or vehicle-state channel implementation. The cluster
map already shown by Zinc is an iPhone-rendered **classic** auxiliary video
stream. Its existence alone is not evidence of Ultra.

The supplied `carplay.pdf` is dated 2015. Its §23.2.7, printed pages 409–411,
supports iAP2 vehicle metadata and an instrument-cluster display, but it
predates Ultra and omits the linked Vehicle Status chapter. It cannot supply
the new Ultra wire format.

## What Ultra adds

Apple describes four visual parts for each vehicle display: **Remote UI**
(iPhone video), **Local UI** (vehicle-rendered gauges), **Punch-through UI**
(vehicle-specific content), and a vehicle-owned **Overlay UI** for telltales
and essential indicators. The vehicle composes these layers. Apple also
describes a separate low-latency **UI sync** channel, an authenticated asset
package transferred from iPhone, and a **vehicle-state protocol** that
configures the available controls and carries current values. Configuration
is fixed for a session; values change during it. The public WWDC presentation
names categories including drive state, vehicle motion, fuel, engine, charging,
climate, tires and driver assistance, but refers implementers to the MFi
technical documentation for the wire protocol. Sources:
[Apple architecture presentation](https://developer.apple.com/videos/play/wwdc2024/10111/),
[Apple design presentation](https://developer.apple.com/videos/play/wwdc2024/10112/),
[Apple CarPlay developer page](https://developer.apple.com/carplay/).

Open-source evidence is encouraging but uneven. [LIVI](https://github.com/f-io/LIVI)
documents a native Ultra dashboard, simulated vehicle telemetry (`speedKph`,
`rpm`, `fuelPct`, `gear`, climate, etc.), and bidirectional climate controls;
its own dashboard is marked work in progress. Its open code is a useful
protocol oracle, subject to its GPL boundary and live verification on our
iPhone. [xcertplay](https://github.com/shilapi/xcertplay/blob/master/README.md)
explicitly says its Ultra stack is untested/incomplete and can trigger the
iPhone prompt. Our receiver derives from that project, so we must not equate
the prompt with a working Ultra session.

## The smallest useful implementation

1. **Make negotiation observable.** In a private trace, record the keys of
   the receiver's `/info`, the iPhone's SETUP/RECORD exchanges, each stream
   type, and every newly opened data channel. Detect `uiSync` and
   `vehicleStateProtocol` as candidate feature names, then confirm their
   actual presence and channel behavior from a live trace. Keep pairing keys,
   Wi-Fi credentials, location and call bodies out of the shared report.
2. **Build a local dashboard simulator in the Zinc player.** A dedicated
   full-width view and the debug panel now share typed local state and parked,
   city and motorway presets for speed, RPM, gear and fuel, displayed with the stream-111 map. This
   exercises the display layout without claiming Ultra negotiation. Extend
   it with charge, temperature and telltales once the active vehicle profile
   is known. A synthetic state source is enough; fabricated CAN frames would
   add a car-specific transport before we know the required semantics.
3. **Add vehicle-state TX/RX in the separate receiver only after a real
   handshake is identified.** Translate the same `VehicleState` into the
   negotiated protocol, then prove one bidirectional round trip such as
   climate target temperature: change it in Zinc, observe it on iPhone,
   change it on iPhone, observe the receiver and Zinc update. Start with a
   mock source and explicit capability advertisement. Do not send guessed
   iAP2 TLVs or treat the old VehicleStatus messages as Ultra's full protocol.
4. **Add local asset rendering and UI sync only when the trace requires them.**
   Authenticate the received package before using it, match its UI-sync
   timestamps to video frames, and keep essential telltales as local overlay.
   This is the substantial Ultra-specific work. The current player has a
   separate video decoder and a Zinc UI, but no Ultra asset interpreter or
   frame-synchronized compositor. Measure the two-video-stream cost on Pi 3B+
   before making a Zero 2 W promise.

The first acceptance gate is a captured session showing more than the prompt:
an Ultra-specific capability exchange or channel, followed by a vehicle-state
value reaching the phone. Until then the honest label in Zinc is **cluster
video + local simulated dashboard**. No CAN bus or live vehicle actuator is
needed for this gate.

### Live Pi trace, 29 October

With the Pi receiver launched using `ZINC_CARPLAY_CLUSTER=1`, the iPhone
reconnected automatically over Bluetooth and the Pi access point. The actual
`/info` response listed display types 110 and 111; the iPhone requested both
video streams and type 130, the existing wireless iAP2 data tunnel. The Mac
Zinc player received and rendered the main stream over the Pi's USB Ethernet
link. In the private receiver trace, there was no `uiSync`,
`vehicleStateProtocol`, asset-package exchange, or observed vehicle-state
round trip. This is a working classic cluster session, not proof of Ultra.
The session trace is owner-private because it contains phone and media data.

## Integration seam

Keep the receiver and player independent as in the
[Pi process plan](zinc-next-carplay-pi-performance.md). The receiver owns
Bluetooth, AirPlay, vehicle-state messages and package authentication. The
Zinc player owns local gauges and display composition. A small, versioned
vehicle-state message over their existing WebSocket gives the simulator and a
future CAN adapter the same consumer. A real CAN adapter would decode known
vehicle-specific signals into `VehicleState`; it must not be the UI model.

The full Ultra protocol cannot be implemented reliably from the supplied PDF
excerpts alone. Do not change the receiver's advertised capabilities until it
can handle what the iPhone requests after negotiation.

## Negotiation observed on Pi, 29 October

An instrumented receiver captured the iPhone's session SETUP feature offer.
It includes **`uiSync`** and **`vehicleStateProtocol`**. The receiver responds
with only `iAPChannel`, `viewAreas` and `altScreen`. The same session then
establishes type-130 iAP2 and types 110/111 video, with no Ultra-specific
data channel. This identifies a concrete negotiation gap. The Zinc Debug
panel now shows offered and enabled capabilities separately; a CarPlay Ultra
label on the phone must not be read as proof that either feature was enabled.

The [LIVI receiver implementation](https://github.com/f-io/LIVI) provides a
candidate protocol map. Its `stack/setup.rs` selects the two feature names,
`vehicle_state.rs` handles a bidirectional OPACK vehicle protocol over two
type-130 data streams, and `ui_sync.rs` handles a separate UI sync stream.
Its vehicle streams use UUIDs `FF4A6720-F2BE-4F56-A3E1-DB3B4E37D634`
and `3E2F3C61-AAD0-42CB-A8AA-BF22186DA62E`; UI sync uses
`07D9F906-8D64-4B54-A808-A20BCA2C51C2`. These are implementation
evidence to verify in a live exchange, not a claim of Apple protocol support
by this receiver. The current Kotlin `IapTunnel` accepts the iAP2 stream
only, and its parser lacks OPACK vehicle messages. Enabling the feature bits
without routing and responding on those streams would create a broken session.

The first implementation slice is a duplex type-130 channel dispatcher keyed
by UUID, OPACK vehicle request/reply handling for a small fixed simulated
vehicle profile, then a live test showing a phone request and one reflected
value. UI sync and authenticated graphics assets follow separately. The
receiver remains on Pi and the Zinc player on Mac; no Pi screen takeover is
required. Keep LIVI's GPL source as a behavioral reference rather than
copying it into Zinc's independent player.

The first transport primitive is now implemented in the separate GPL receiver:
type-130 packages can be acknowledged and answered over an encrypted TCP
DataStream. A loopback test checks a real socket, both key directions, a sync
reply, a command, and a package spanning two encrypted frames. It remains
disabled for the phone until UUID routing and validated OPACK handlers exist.

Additional public references checked: [carlink_linux's capability
map](https://github.com/lvalen91/carlink_linux/blob/main/docs/CARPLAY_CAPABILITIES.md)
identifies the same SETUP response tokens, but labels several newer details
as iOS-binary findings or inference. [CarCast's public
documentation](https://github.com/rPlayAI/carcast-public) claims an Ultra
cluster renderer with simulated gauges, but its receiver source is closed.
Reddit reports add no independently verifiable channel trace. LIVI remains
the most useful open implementation reference, with every inferred field
checked against our live Pi/iPhone exchange before enabling it.

## Vehicle State probe on Pi, 29 October

With `ZINC_CARPLAY_ULTRA_VEHICLE=1`, the iPhone offered both
`vehicleStateProtocol` and `uiSync`; the receiver enabled Vehicle State only.
The phone opened both distinct type-130 Vehicle State UUIDs and sent two
encrypted `comm` packages on the high-priority channel (70 and 83 bytes).
The receiver parsed each as OPACK and emitted one encrypted command response
for each. A protocol test covers the same duplex framing and a separate test
covers the bounded OPACK configuration, registration, update and write logic.
This is a real bidirectional Vehicle State transport exchange, but the phone
has not yet been observed registering for RPM or fuel. A WebSocket probe sent
those two simulated gauges while the feature was enabled; no phone-subscribed
value update was observed. A subsequent Mac-to-Pi WebSocket probe confirmed
that the receiver accepted RPM 1900 and fuel 66 and sent the updated snapshots
back to the client while the phone session remained active. The viewer now
exposes received climate and gauge snapshots, and the preset controls send
RPM/fuel when the phone subscribes.
Speed and gear remain local simulator values.

UI sync is the next distinct channel. LIVI identifies UUID
`07D9F906-8D64-4B54-A808-A20BCA2C51C2` and an OPACK envelope containing a
binary plist session protocol (reset, reset-complete, commands and
acknowledgements). Its feature is guarded by a theme configuration. PlayPort
now has a bounded experimental reset/command handler and panel descriptors,
gated by `ZINC_CARPLAY_ULTRA_UI_SYNC=1` and an active cluster. In a physical
Pi/iPhone session the phone offered `uiSync`, the receiver enabled it, `/info`
completed, and classic streams 110/111 remained active. The phone did not
open the UI Sync UUID during the observed session. This proves negotiation
compatibility, not UI Sync traffic or composed Ultra presentation. The likely
missing piece is an authenticated theme asset package and layout request.
LIVI sends a `theme_asset_identifier` in field 6 of the iAP2
WirelessCarPlayTransport identification component, while our identification
omits that field. This is a concrete protocol difference and a plausible
cause, not a confirmed phone error. An arbitrary identifier without a matching
authenticated theme would be misleading.
The flag stays off by default. Stream 111 remains the iPhone-rendered cluster
video on the Mac; the Pi display is untouched. The Pi service was stopped
after the probe, and its drop-in was restored to Vehicle State only.

## Theme and UI Sync live exchange, 29 October

The Apple MobileAsset `com.apple.MobileAsset.CarDDPAssets` catalog returned
asset `44C9FA31EC` version 985, minimum SDK 19.0. The downloaded 50,870,896
byte ZIP matched the catalog's SHA-1 measurement and had SHA-256
`872c2a33ea16b481da6515f5c19c5ea736a23ed4ae5be97d6994ac2649cdb385`.
Its `package.json` names `Center_Display` and `Cluster_Display`; `theme.json`
names the Cobranded layout `6C45CC47-EC01-527A-B40D-1316AA9C936F`, default
palette `custom`, and the four active zones used by the request. This is a
third-party branded theme used only as an experimental protocol probe. The
catalog measurement was checked; the package's certificate chain and asset
signature were not independently verified. The ZIP and artwork are outside
the repository.

With `ZINC_CARPLAY_CLUSTER=1`, `ZINC_CARPLAY_ULTRA_THEME=44C9FA31EC:985` and
`ZINC_CARPLAY_ULTRA_UI_SYNC=1`, the receiver announced one consistent asset ID
in iAP2 Identification and CarPlayStartSession and used the package's display
IDs in AirPlay `/info` and UI Sync panels. The iPhone connected over Wi-Fi,
opened both classic video streams, then opened the encrypted UI Sync type-130
UUID `07D9F906-8D64-4B54-A808-A20BCA2C51C2`. Reset received 1 reply;
reset-complete received 4, including a layout request; later phone commands
received acknowledgements and layout/palette choices. This is observed
bidirectional UI Sync traffic, beyond accepted feature bits. A follow-up
restart did not complete the Wi-Fi handoff, so the final typed player event and
Day/Night retransmission are validated locally only. The Pi service is stopped
after the probe. The composed Mac dashboard is a local simulation of the
theme's three principal zones; it is not a pixel-accurate render of Apple
assets, and the phone has not yet confirmed synchronized appearance on screen.

The next live session exposed a geometry mismatch: `/info` named the theme's
`Center_Display` and `Cluster_Display` but advertised 1280×720 and 960×360.
The theme's `package.json` defines **1920×720 for both**, at density 157. The
experimental profile now uses those pixel sizes and approximate 311×117 mm
physical sizes, without applying the classic UI-scale override. The Cobranded
layout's only wallpaper is `dynamicColor`, black in dark mode and `#f2f2f2`
in light mode; the Mac simulator now uses those colors. It still does not
render the package's Core Animation assets, so full themed wallpaper and
gauge composition remain open under criterion #4.

The next phone screenshot showed why the geometry fix was incomplete: `/info`
advertised 1920×720, while the WebSocket `VIDEO_CONFIG` still carried the
classic 1280×720 main and 960×360 cluster sizes. The main Zinc player also kept
that configuration size after decoding a frame. Both wire configurations now
follow the Ultra theme, and the player uses the decoded image size for display
and touch coordinates. The wireless iAP2 GPS path had a separate omitted
`onRequested` call: the phone subscribed, but the provider saw no NMEA
selectors and emitted no sentences. The call is now made before `start`.

The package separates `Center_Display`'s Wallpaper layout from
`Cluster_Display`'s Cobranded layout. The center catalog has solid color,
gradient, landscape and topography wallpapers; the selected cluster Cobranded
layout offers only a solid dynamic color. The current UI Sync request hardcodes
that cluster layout. The phone's Voiture, Radio and Climat apps are visible, but
the receiver currently declares only RPM, fuel and two climate characteristics;
it does not implement those apps' full vehicle and radio services. A blank app
screen is therefore not evidence of a working feature.

In the next live Pi/Mac run, both WebSocket video configurations and decoded
frames reported 1920×720. The main screen rendered with square app icons. The
cluster stream was likewise 1920×720, but its navigation occupied the Cobranded
layout's Zone1 rectangle (660,120,600,480); displaying the full stream inside
the Mac dashboard had left a tiny map in a large black frame. The local dashboard
now crops to Zone1 and preserves its 5:4 ratio. A live wireless location probe
reported `subscribed=true`, requested selectors `[0,1,2,32769,32770]` and
`sent=8` after a Paris debug fix. This proves iAP2 TX activity, not that iOS
has adopted the simulated location in Plans.
The local CarPlay specification says the accessory location augments the
iPhone's built-in location services, and Apple WWDC16 session 722 says vehicle
satellite location is used alongside iPhone sensors. The Mac cluster map still
showed the phone's local area after the Paris fix, consistent with iOS choosing
its own position. Debug GPS should be treated as external GNSS input, not a
guaranteed location override. The specification also distinguishes the brief
Bluetooth handoff link from the iAP2-over-CarPlay runtime link; the current
receiver advertises LocationInformation on both, so a separate link-scoping
cleanup and phone trace are needed before calling the GPS behavior complete.

The experimental Vehicle State profile was later expanded with two climate
zones, fan and seat controls, fuel range, odometer and four tire sensors.
A live Mac → Pi → Mac WebSocket probe during an Ultra session observed fan
level 4 and front-left tire pressure 250 kPa after sending those simulated
values. This confirms receiver state transport only. The iPhone's native
Climate and Car screens, their subscriptions and phone-origin writes remain
unverified; the profile does not include an authenticated car theme renderer.
