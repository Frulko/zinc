# Receiver backend

PlayPort: https://github.com/youcci/playport
Pinned revision: `9a0882dd0ffe48e467b59d58b12d81391df55ade`.
License: GPL-3.0 (see the fetched LICENSE and upstream notices).
PlayPort ports protocol code from DiPlay by shihabal3amri, based on
xcertplay by shilapi. Preserve all notices when distributing the backend.

The build script fetches upstream into build/carplay/playport. Its JVM process
is separate from Zinc; no GPL protocol implementation is linked into the engine.
The media envelope used by index.ts is documented in upstream Wire.kt.
No identity, key, certificate or APK is supplied by this plugin.

The unmodified PlayPort revision supports wireless on macOS, not USB or Linux
Bluetooth. Its USB overlay is described below.

The separately licensed `usb/` overlay ports DiPlay revision
`615b32ce0b40cd0b99ce94ba23a512001553684f` into this pinned PlayPort receiver.
It adds macOS libusb USBMUX/NCM, utun IPv6 routing, Lockdown pairing/TLS/carkit
and wired iAP2 bootstrap. See usb/UPSTREAM.md and usb/LICENSE for full provenance,
and usb/README.md for build, privileges, lifecycle and physical verification limits.
The upstream PlayPort revision itself remains wireless-only; the wired path is
this plugin's external GPL overlay, not an upstream feature claim.
