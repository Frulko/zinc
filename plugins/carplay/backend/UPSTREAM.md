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

This revision supports wireless on macOS, not USB or Linux Bluetooth.
DiPlay's USB transport uses Android UsbDeviceConnection, bulk endpoints, USBMUX
and NCM; it needs a native host adapter, not a UI-only port.
