# CarPlay integration — 2026-10-28

Separate `plugins/carplay`, imported as `zinc:carplay`; no CarPlay code in the
engine. Native macOS demo runs. **No real iPhone session has been verified.**

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
