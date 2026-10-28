# CarPlay integration — 2026-10-28

Separate `plugins/carplay`, imported as `zinc:carplay`; no CarPlay code in the
engine. **Real USB CarPlay projection is verified on macOS with an iPhone18,1
running iOS 27.0.1, using software authentication without a physical MFi chip.**
Audio, microphone, physical multitouch/day-night and wireless acceptance remain
separate checks; earlier sections below retain the debugging history.

## Implemented and proven locally

- FFmpeg H.264/HEVC images and AAC/Opus/LPCM playback, actual loopback WebSocket
  media/control, two stable touch slots and remembered Day/Night appearance.
- Receiver-requested microphone capture reuses Zinc's miniaudio/macOS permission
  implementation. FFmpeg/libopus or PCM16 uplink matches pinned PlayPort wire
  bytes. Capture, encoders and timers stop on mic stop, session end, disconnect,
  failed send and close. Fake capture requires explicit test opt-in.
- Reconnect starts at 0.5 seconds, doubles to eight seconds, and is cancelled by
  Disconnect or replacement. A receiver policy/token rejection stops retries
  with an access error. Old callbacks cannot change a replacement session.
  Keyboard arrows/Enter/Escape/Backspace/Home/S map to upstream rotary/Siri HID.
- Pinned Kotlin JSON omits default `false` values: absent `sessionActive` on a
  session event and absent `micActive` on a mic event correctly trigger cleanup.
- `examples/carplay/run` generates and plays an eight-frame four-second H.264
  pattern and PCM tone. It says **OFFLINE MEDIA / no iPhone authentication**.
  `--live` requires a receiver URL and never substitutes simulated phone media.

Validation (main engine `/Users/mowmow/Lab/zinc/build/zinc` used read-only;
`ZINC_ROOT` selects this checkout's native modules):

- `tests/run --only carplay`: real FFmpeg decoder fixtures, malformed input,
  cleanup, two-contact reports, day/night, keyboard payloads, reconnect and its
  cancellation, invalid URLs, session stop, receiver-requested PCM/Opus capture
  and omitted-false microphone stop. Default engine and explicit interpreter.
- `tests/run --only carplay_microphone`: exact PCM; mono/stereo Opus round trips
  at 8/12/16/24/48 kHz; packet assembly; fake capture over WebSocket; repeated
  start/stop, permission/fake fallback refusal and transport-error cleanup.
- `tests/run --only carplay_demo`: checker, headless UI capture, nine decoded
  frames across the complete local loop, PCM envelopes, cleanup, missing live
  URL diagnostic. Background native window also ran and exited successfully.
- Screenshot inspected: `build/carplay/verified-native.png` (Retina native window)
  and `/tmp/zinc-carplay-offline.png` (headless logical-size capture).

## Wired implementation

The separate GPL overlay ports DiPlay revision
`615b32ce0b40cd0b99ce94ba23a512001553684f`: native macOS libusb USBMUX/NCM,
Lockdown pairing/TLS/carkit, wired iAP2 software authentication and a utun IPv6
bridge with NDP. This is an actual transport/bootstrap, not a `--usb` placeholder.
Explicit serial selection limits device capture; discovery does not claim or
switch a phone. Pair keys are session-local. Mode transition and privileged
capture/utun setup are left to the operator, with driver/interface cleanup.

The desktop port required KXML2 without an Android-only feature and named
certificate DNs accepted by JDK X.509. Generated certificate signatures and
TLS-engine loading are tested; no global JVM security or wireless TLS setting
was changed. A source-hash manifest permits repeat builds while refusing
unmanaged edits. GPL lineage/licences remain in backend/usb/UPSTREAM.md.

Worker proof: native C++20 warning-free build, 168 protocol tests passed and
six server tests passed (one upstream server test skipped). `carplay_usb` covers
descriptors, no-device JNI, USBMUX handshake/close and transfer splits/padding,
NCM queue bounds/NDP checksums, wired messages, Lockdown framing/XXE,
certificate signatures and TLS loading. Real safe discovery found no phone;
startup with a nonexistent serial and external identity failed usefully.
Coordinator integration also built the complete receiver from a fresh pinned
checkout: 168 protocol tests passed, six server tests passed and one upstream
server test skipped. The fresh build caught an overlay initializer-scope bug
masked by the worker's warm checkout; prepare now regenerates Main.kt from
pinned Git source and a fresh-versus-repeat regression passes. Integrated
`tests/run --only carplay_usb` passes. Current safe discovery reports no Apple
USBMUX/NCM device; an explicitly nonexistent serial with the external identity
exits with an actionable no-device error before starting a listener.
No sudo, mode switch, real USB capture, Trust or utun interface was attempted.
The owner is checking real wireless phone setup separately; no competing
receiver was started on 8080/7000.

## Backend and identity

Separate GPL-3.0 PlayPort revision
`9a0882dd0ffe48e467b59d58b12d81391df55ade`, from DiPlay/xcertplay. The preserved
prototype had 96 passing protocol/server tests and a compiled Bluetooth helper.
See `plugins/carplay/backend/UPSTREAM.md` for provenance and build details.

The documented DiPlay v0.2.7 preview APK supplies an experimental runtime
identity recovered from Carlinkit firmware. Its provenance and extraction path
are linked in the plugin README. For this session the APK and extracted files
are outside Git in `~/.local/share/zinc/carplay-experiment`, with owner-only
permissions. No key contents were printed or committed. OpenSSL challenge
sign/verify passed. The actual pinned receiver loaded the identity and accepted
a token-protected loopback WebSocket upgrade/hello plus a public read-only
status API request;
`sessionActive` was false. Own receiver process group and temporary state were
cleaned up. Loopback JmDNS had no multicast route, so that smoke does not prove
advertisement, discovery or pairing.

A certificate/key consistency check is not iPhone acceptance. Shared experimental
credentials may cease to be accepted. A self-signed certificate is not a usable
replacement. No Bluetooth scan/pairing or wireless bootstrap was started.

## Remaining acceptance

ZN-849's local demo/lifecycle criteria pass. ZN-848 remains Review for real
microphone/OS prompt and Siri/call acceptance. ZN-847 remains Review: the wired implementation and independent tests are
integrated, but its physical receiver criterion stays unchecked.

The plugin README contains the exact live checklist: transport setup and
external identity, phone pairing, native live viewer, video/audio/touch/night,
Siri/calls, disconnect/reconnect and resource cleanup. Record actual model/iOS
and results before claiming a complete receiver. No latency, refresh-rate,
hardware decode, zero-copy, echo cancellation or live voice-quality claim.
Pi/Linux, Android Auto, GPS injection and cluster display remain later work;
no cross build was run.

## First physical USB attempt: serial padding

The attached iPhone listed a 24-character serial, but libusb returned 40 bytes
including NUL padding. JNI NewStringUTF hid the padding during listing; open
compared the full string and reported no matching device. serialText now bounds
the identifier at the first NUL in both paths. Native descriptor regression
tests (padded, plain and empty) pass and the library was rebuilt. A live non-root
retry now matches the phone and reaches driver capture, which returns
LIBUSB_ERROR_ACCESS as expected without privilege. The next step is the same
root backend launch; no CarPlay session has yet been established.

## Physical USB attempt: scoped IPv6 certificate

After the serial fix, the privileged run reached certificate generation and
failed with BouncyCastle GeneralName “IP Address is invalid”. The USB link uses
an IPv6 zone suffix (%utun), which is routing context, not an X.509 IP SAN.
The reproducible overlay encodes IP SANs from InetAddress.address bytes instead
of hostAddress text. TlsCertificateUsbTest generates, verifies and reloads an
IPv6-scoped/IPv4 certificate. Full backend build and tests and fresh/repeated
overlay regression pass. The receiver was rebuilt for the next live attempt.

## Physical USB attempt: handshake transfer timeout

The receiver started its RTSP and WebSocket listeners, but wired bootstrap
failed before Trust with an unlabelled IllegalArgumentException. The first
USBMUX write used HANDSHAKE_TIMEOUT_MILLIS (60000), exceeding the native adapter's
5000 ms transfer bound. It now uses WRITE_TIMEOUT_MILLIS (2000), preserving the
60-second response deadline. The handshake lifecycle test now composes the real
MacUsbSession boundary with fake UsbIo, rather than bypassing that validation.
Timeout validation has explicit messages and bootstrap logs full exceptions.
The iPhone screenshot of the CarPlay settings list did not show an established
Zinc session; network advertisements alone are not successful USB negotiation.

## Physical USB attempt: InvalidPairRecord

USBMUX v2 is accepted by the physical phone and Lockdown values are received.
The first Pair returned PasswordProtected; the unlocked retry returned
InvalidPairRecord. Comparing the port with pinned DiPlay found an intentional
port divergence: nonempty certificate issuer/subject names added for JDK parsing.
Restored DiPlay's empty-name profile. USB TLS certificate loading uses the
already-installed Bouncy Castle CertificateFactory by explicit local provider,
without changing global JDK TLS policy. Regression verifies root, host and device
empty names, certificate signatures, device public-key binding and TLS engine
creation. Complete backend build/tests pass. This fixes the port divergence;
the cause of the phone's rejection is not fully confirmed until a live retry.

## Pair rejection persists: caller parity

The physical phone still returns InvalidPairRecord after the certificate profile
change. This disproves that change alone as a sufficient fix. Pinned DiPlay's
CarPlayController generates uppercase host and system UUIDs (lines 223-224);
the new Mac bootstrap had used lowercase UUID.toString(). Bootstrap now matches
upstream casing with Locale.ROOT. Complete backend build/tests pass; this is
a reference-parity correction, not proven resolution of the device rejection.
A separate read-only audit is checking remaining wire/profile differences.

## Physical USB attempt: Pair accepted, peer TLS parsing

The next physical run progressed through Pair and StartSession into TLS 1.2.
SunJSSE rejected the peer certificate with Empty issuer DN not allowed. Choosing
a local CertificateFactory for our own identity did not change SunJSSE's
internal peer-certificate reader. The USB TLS context and key manager now use
explicit BCJSSE/BC provider instances, with bctls-jdk18on pinned at 1.79. No
global provider registration or security-property relaxation was added.
UsbLockdownTlsHandshakeTest completes a real mutual TLS 1.2 handshake with the
empty-DN pairing profile and sends encrypted application data. It also verifies
that installed/default providers are unchanged. Full backend build/tests,
fresh/repeated overlay check and packaged bctls jar verification pass. The
physical carkit/TLS continuation remains to be verified with a root restart.

## Physical USB attempt: authentication succeeds, projection pending

The physical phone now reports MFi authentication-succeeded (0xaa05), accepts
iAP2 identification/authentication, advertises wiredAvailable=true, receives
CarPlayStartSession and displays the CarPlay permission prompt. The user reports
that tapping Allow reacts but leaves the prompt visible. No RTSP connection or
media has been observed. This confirms software authentication without an MFi
chip on this phone, not a completed projection session.

Runtime NCM used fe80::1, unlike pinned DiPlay's receiver default fe80::2. It
now uses fe80::2. Tests use the host default and a distinct peer and verify that
NDP does not claim the peer address. A collision with the real phone's address
is still a hypothesis until headers are captured. Initial NCM logs show only
IPv6 headers/destination ports (12 packets per direction), and native logs mark
the first NCM write timeout and first accepted Ethernet transfer. No packet
payload is logged. Full backend build/tests pass; root restart is needed to
observe the phone's actual NCM/RTSP path.

## Physical NCM traffic: two USB network functions

Phone logs now show real NCM IPv6 RX/TX and successful native bulk-out. The
first packet budget contains multicast; it cannot prove absence of later TCP.
The Mac's IORegistry shows iPhone NCM control/data pairs 3/4 and 5/6. Descriptor
scanning was overwriting the first pair with later matches. It now follows
pinned DiPlay NcmFunctionDiscovery: first control, first bulk data with preferred
alternate 1. Native interfaceNumber now returns the control interface, matching
DiPlay's declaration of interface 3, rather than the selected data interface.
A synthetic two-function descriptor test preserves the first control/data/MAC
selection against the second pair. Native startup logs the selected interfaces.

CarPlayStartSession also used the persistent server ID instead of NCM host MAC;
it now matches the reference controller's wired endpoint. MAC formatting has a
regression test. Pinned NcmTrafficCounter and its tests were reused to report
all incoming SYN counts every five seconds for the first minute, beyond the
initial header log budget. TX is labelled submitted, not successfully sent.
Complete backend build/tests and native descriptor tests pass. Real projection
is still pending; next attempt must verify control=3/data=4 and TCP to AirPlay.

## Physical USB projection confirmed — 23:20–23:21

Owner-provided logs and native-window screenshot confirm the first real iPhone
projection on Mac, after commit aa2a9ae8. Phone model iPhone18,1, iOS 27.0.1.
Selected NCM control=3/data=4/alternate=1; offline MFi authentication succeeds;
Lockdown/carkit TLS completes. AirPlay accepts the phone connection, completes
pair-setup/pair-verify/auth-setup, encrypts control, and accepts SETUP/RECORD.
The backend logs CarPlay session active, stream 110 H.264 codec configuration
and decrypted video. The Zinc window visibly shows Spotify CarPlay at 1280x720
and 1520 accepted packets. Continued receive reports show no sequence gaps or
late/duplicate packets in the supplied interval; these are transport counters,
not measured display FPS or latency.

A touch HID report is sent and the shown UI is navigated. The report has two
slots but only one active contact; physical two-finger gestures are not proven.
Ctrl-C produces session-ended/control-closed shutdown logs. No extra hardware
MFi coprocessor was used. This closes ZN-847's USB transport acceptance.

Only stream 110 is configured in the supplied logs: actual music playback,
microphone/Siri/calls, day/night appearance, physical multitouch, reconnect and
wireless remain to verify. FFmpeg emits deprecated pixel-format/range warnings
in the viewer; projection continues, but exact colour-range correctness is not
claimed. No Raspberry Pi, hardware decode, zero-copy or performance claim.

## Audio acceptance: sound remains on the phone

Owner confirms Spotify sound remains on the iPhone during the successful USB
projection. The supplied log SETUPs only stream 110, so no received audio can
be blamed on the Zinc decoder yet. Pinned CarPlayServer still set microphone
false in AirPlayConfig despite integrated microphone capture/uplink. Overlay now
advertises microphone=true, with receiver-instance regression asserting default
input/output and AAC media output formats without starting capture.

Changed modes/resource ownership metadata is logged (no audio payload or app
state), to distinguish routing from stream setup. Full backend build/tests and
fresh/repeated overlay checks pass. This is a confirmed capability integration
defect, not confirmed resolution of playback staying on the phone. Next live
check: keep USB session active, inspect/select PlayPort in the phone output
picker and collect resource ownership plus any audio SETUP lines.


## Physical USB audio confirmed — 23:31

After a physical cable reconnect, NCM bulk-out accepts frames again. Lockdown
trust polling completes on attempt five, followed by TLS, iAP2 authentication
and real projection. The owner confirms sound automatically plays on the Mac.
The phone SETUPs stream 100, media LPCM at 48000 Hz/stereo; the supplied interval
reaches 4000 decrypted packets with authFailures=0. Video stream 110 continues.
This proves the physical receive/playback path; it does not isolate whether the
capability fix or the new phone session caused the routing change.

The launcher now honours explicit ZINC_BACKGROUND=0 so a manual foreground
Siri test can request macOS microphone permission. Background remains the
default, including agent-started windows. Microphone request/encoding/lifecycle
have automated proof; real Siri recognition, calls, physical two-contact touch
and day/night appearance remain unverified. A prior restart NAKed all NCM TX
until the cable was reconnected; reconnect reliability remains open.


## Physical Siri attempt and appearance corrections — 23:36

The phone requests speechRecognition input streams (LPCM 24 kHz and 48 kHz
mono). Owner observes Continuity selecting the iPhone microphone and reports
no day/night appearance change. This is not acceptance of Mac microphone Siri.

Zinc microphone enumeration previously used backend enumeration order, ignoring
miniaudio's isDefault flag. It now places the system default first while keeping
all device IDs and non-default ordering. Read-only enumeration on the Mac now
returns MacBook Pro Microphone before the iPhone Continuity microphone; System
Profiler independently identifies the Mac microphone as default. No microphone
was opened by that check. Explicit device IDs retain their meaning; if the
system default is changed, the next capture follows it. Capture already open
does not migrate automatically.

Compared with pinned DiPlay, receiver /info omitted uiAppearanceMode,
uiAppearanceSetting, mapAppearanceMode and mapAppearanceSetting. Overlay now
sets all four to automatic (0) and tests each declared display. Runtime command
format is unchanged; nightMode intent and send result are logged. Full backend
build/tests and fresh/repeated overlay proof pass. Live appearance and Siri
recognition using the Mac microphone remain to verify after restart.


## Appearance and microphone still fail live — 23:41

Owner reports no audible Siri recognition and no visible day/night change after
1b21cbb7. The phone /info contains all four appearance fields, and nightMode
commands return sent=true, but this only proves local encrypted socket writes.
The receiver previously discarded RTSP event responses. Overlay now logs their
CSeq, RTSP status, optional plist status and body length, with night command CSeq
for correlation. No response body, keys, certificates or audio are logged.

Read-only microphone permission check returns granted (1), explaining absence
of a new OS prompt; this check did not request permission or start capture.
Viewer diagnostics now log requested configuration, selected device on capture
start, first WebSocket packet and its capture level, failure reason and stop
packet count. Receiver logs uplink creation and first successful UDP send.
These locate missing capture, bridge or routing without recording voice.
The fake-capture regression now also exercises the phone's LPCM 24 kHz format.
Real Siri recognition and appearance remain unresolved; these changes add
evidence, not a claimed repair.


## Confirmed microphone wire-format defect — 23:46

Physical logs now show WebBridge requesting 24 kHz mono capture and MicUplink
sending its first UDP packet (996 bytes, 480 samples). This proves viewer data
reaches the sender, not receipt/decryption/recognition by the iPhone. Inspection
against pinned DiPlay's MicrophoneUplink and the existing MicrophonePacketizer
helper found the separate server failed to call toWirePcm: viewer PCM16 is
little-endian, but wired microphone PCM is big-endian. Fix conversion in
MicUplink before sealing; keep Opus bytes unchanged. The UDP regression receives
and decrypts a known sample packet with the input key and RTP AAD, asserting
exact big-endian PCM, unchanged Opus and unmodified caller input. Full backend
build/tests and fresh/repeated overlay checks pass. No physical voice repair
is claimed until another owner test.

Night commands now receive RTSP 200 with empty bodies and no CSeq echoed by the
phone. Their visible effect remains unconfirmed; no evidence justifies changing
the reference command format. Check the projected CarPlay Settings appearance
selection (Automatic vs Always Dark) before adding further protocol variants.


## Display-addressed appearance path

Owner confirms projected CarPlay Settings already uses Automatic and legacy
setNightMode still has no visible effect. Compared source of LIVI at
9d7862b06f4d842838417cf0f05842fb95839395,
`native/crates/livi-cp/src/stack/events.rs`: it sends setNightMode followed by
uiAppearanceUpdate and mapAppearanceUpdate. Both updates carry params uuid,
appearanceMode (day=0/night=1) and appearanceSetting=0 (automatic). Reference:
https://github.com/f-io/LIVI/blob/9d7862b06f4d842838417cf0f05842fb95839395/native/crates/livi-cp/src/stack/events.rs

Added those two updates for the same MAIN_UUID declared in /info. Keep the
legacy command and existing deferred send until the encrypted event channel is
ready. Clear pending state only once all commands are written. The binary-plist
regression checks ordered command types, Boolean legacy state, exact display
UUID and integer appearance values for day and night. This targets the observed
missing runtime path; visible switching on the physical phone remains pending.
