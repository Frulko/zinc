# Native wired backend (experimental)

Build once with `plugins/carplay/backend/build` (JDK 21+, CMake, pkg-config,
libusb >= 1.0.25 and Xcode tools). The native library and GPL receiver stay
under build/carplay; nothing is linked into Zinc. The build verifies its generated
source overlay by hash and refuses unexpected local edits on subsequent runs.

Safe discovery, without an identity or device capture:

```
plugins/carplay/backend/run --usb-list
```

For a live session, connect/unlock the iPhone, note its exact serial, then use
an external accessory identity as described in the plugin README:

```
export ZINC_CARPLAY_IDENTITY=/absolute/path/to/identity
export ZINC_CARPLAY_USB_SERIAL=SERIAL_FROM_LIST
sudo env ZINC_CARPLAY_IDENTITY="$ZINC_CARPLAY_IDENTITY" \
  ZINC_CARPLAY_USB_SERIAL="$ZINC_CARPLAY_USB_SERIAL" \
  plugins/carplay/backend/run --usb --token YOUR_LOCAL_TOKEN
```

Root is required for utun configuration and capture of an
Apple device from macOS drivers. The wrapper does not elevate privileges itself.
Capture temporarily takes this selected phone away from Apple's USB services;
interfaces/drivers are released/restored on close. No unrelated Apple peripheral
is selected. Select only the phone intended for this experiment.

If the phone is not in CarPlay mode, explicitly request the mode transition:
`sudo plugins/carplay/backend/run --usb-switch SERIAL_FROM_LIST`.
This sends Apple's vendor request and **exits with a re-enumeration diagnostic**;
wait for the phone to return, list it again, then start `--usb`. No mode switch
happens during discovery or ordinary startup. Unlock and accept the phone's
Trust prompt when pairing. Lockdown pair keys are session-local, so a restart
can require another Trust prompt; no pair keys are persisted by this adapter.

The backend selects the USBMUX/NCM configuration by descriptors (not a fixed
configuration id), uses the NCM descriptor MAC when available, and exchanges
NTB16 Ethernet/IPv6 through a temporary macOS utun interface. It answers wired
NDP and binds the existing AirPlay receiver to that interface's scoped IPv6
address. The existing loopback WebSocket media/input API is unchanged. In Zinc,
connect to `ws://127.0.0.1:8080/ws?token=YOUR_LOCAL_TOKEN` as for wireless mode.
Stop with Ctrl-C; the shutdown hook closes iAP2, USBMUX, NCM and the utun fd.

`tests/run --only carplay_usb` runs isolated descriptor, framing, lifecycle,
wired-message, neighbour/checksum and native no-device tests against the built
backend. It skips if that optional backend has not been built. No test captures
a phone, switches USB mode, pairs, creates utun or runs sudo.

Real USB projection was verified on 2026-10-28 with an iPhone18,1 on iOS 27.0.1:
offline software authentication, pairing/TLS, NCM, AirPlay and H.264 video in the
native Zinc viewer at 1280x720. Pointer HID return and shutdown were observed.
This is one device/session, not a compatibility guarantee. Audio, microphone,
physical two-finger gestures, day/night and sustained reconnect remain separate
acceptance checks. Linux/Pi verification is deferred. See
[the implementation report](../../../../docs/reports/zinc-next-carplay.md) for
proof and limitations, and UPSTREAM.md for provenance.
