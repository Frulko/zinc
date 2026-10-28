---
id: ZN-847
title: 'CarPlay: Native USB transport on macOS'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-28 21:07'
updated_date: '2026-10-28 21:51'
labels:
  - carplay
  - size-L
dependencies: []
ordinal: 556460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: finish the separate Zinc CarPlay plugin, wired and wireless, with software identity authentication. Reuse proven open protocol implementations; do not put CarPlay into the engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A separate plugin backend provides a real USB CarPlay transport on macOS without an MFi chip
- [x] #2 USB transport framing and lifecycle have targeted automated tests and physical verification limits are explicit
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Separate GPL overlay: DiPlay `615b32ce0b40cd0b99ce94ba23a512001553684f`
  on pinned PlayPort `9a0882dd0ffe48e467b59d58b12d81391df55ade`; all original
  protocol classes remain auditable under backend/usb, with licence and provenance.
- Native Darwin libusb host: explicit serial, USBMUX/NCM descriptor matching,
  explicit Apple mode request/re-enumeration, actual configuration/interface/alt
  selection, partial-timeout reads, checked writes, descriptor MAC and endpoint
  packet sizes, finite I/O, driver restoration and owning handle cleanup.
- Ported USBMUX v2/TCP, Lockdown trust pairing/certificates/TLS/carkit and wired
  iAP2 authentication/control. No physical MFi coprocessor; the existing software
  accessory identity feeds the wired authenticator. Pair keys stay session-local.
- Native macOS utun IPv6 link carries NCM media to the existing AirPlay receiver;
  includes fragmented NTB16 framing, bounded queues, explicit NDP replies/checksums,
  scoped IPv6 binding and shutdown. --usb is an actual wired bootstrap, not a stub.
- Desktop compatibility: KXML2 replaces Android Xml without external entity
  resolution; named pair-certificate DNs satisfy JDK X.509. The dedicated USB
  Lockdown trust behavior is preserved; no global JVM or wireless TLS changes.
- backend/build verifies a generated-source hash manifest and rejects owner edits;
  repeat builds work. backend/run adds --usb, --usb-list and --usb-switch. See
  plugins/carplay/backend/usb/README.md for privileges and exact live commands.

## Validation

- Native C++20 library and descriptor test built via tools/build targets with
  -Wall -Wextra -Werror on this Mac; descriptor test passes.
- Full separately built receiver: 168 protocol tests, zero failures/skips;
  seven server tests, zero failures (one upstream skipped test). Distribution and
  existing Bluetooth helper built; no Zinc engine build needed.
- tests/run --only carplay_usb passes: native no-device/discovery, mode-independent
  descriptor selection, mux handshake/close, every transfer split/pad, NCM queue
  limits/full-speed padding, neighbour checksums, wired message encoding,
  Lockdown frame/ownership/XXE, generated certificate signatures and TLS loading.
- Overlay ownership self-check proves clean/repeat builds pass and unmanaged
  tracked/untracked edits are rejected without overwriting them.
- Actual backend/run --usb-list reports no phone. backend/run --usb with the
  coordinator-provided external experimental identity and a nonexistent test
  serial exits nonzero with: Wired USB unavailable: No matching Apple USBMUX/NCM
  device; unlock/connect iPhone. No key material was logged or tracked.
- No sudo, USB capture, mode transition, pairing, utun creation, phone media/input,
  reconnect or cross build was executed. Child build/test processes exited.

## Physical acceptance still open

Criterion #1 stays unchecked and this task stays Review: the complete wired path
is implemented and built, but no iPhone/accepted accessory identity was supplied
for live acceptance. Verify privileged macOS capture, mode re-enumeration, Trust,
identity acceptance, utun/NCM routing, media and return input with a real phone;
record any needed hardware calibration rather than treating the isolated tests
as physical proof. Linux/Pi remains in the coordinator's cross-platform pass.

Coordinator integration: add tests/affected.json mapping for backend/usb and
carplay_usb, user changelog/report updates and the live checklist. No shared
index.ts/demo/engine/report/session files were edited by this worker.

Coordinator integration: fresh pinned-checkout build exposed Main.kt overlay cleanup referencing wired inside its own initializer. Fixed prepare to regenerate Main.kt deterministically from pinned Git source and add cleanup before insertion; new fresh/repeat generation regression passes. Fresh full receiver build: 168 protocol tests pass, 6 server tests pass, 1 upstream server skip. Integrated carplay_usb passes, safe discovery currently reports no Apple USBMUX/NCM device, and explicitly nonexistent serial fails with actionable error before listener startup. Shared test mapping, changelog, provenance/report, Mac sudo instructions and live checklist updated. No receiver started on 8080/7000; owner is checking live wireless setup. Physical USB criterion remains open/Review.

Physical iPhone discovery/open regression found on 2026-10-28: libusb returned a 40-byte serial descriptor for a 24-character identifier with embedded NUL padding. list() hid it through NewStringUTF while open() compared the padded bytes. Shared serialText normalization now terminates at the first NUL; native regression covers padded/plain/empty inputs. Rebuilt native USB library and descriptor tests pass. Actual connected iPhone now matches and advances to privileged driver capture (non-root LIBUSB_ERROR_ACCESS), so root live run is next. Physical CarPlay acceptance remains unverified.

Second physical run advanced past USB capture, then failed in web TLS certificate generation: scoped IPv6 hostAddress includes %utun zone, rejected by BouncyCastle GeneralName. Backend overlay now encodes IP SANs as raw address octets via DEROctetString. New server regression generates, verifies and reloads a certificate with scoped IPv6 and IPv4. Fresh/repeated overlay test and complete backend build/tests pass; live root restart remains to verify next handshake stage.
<!-- SECTION:NOTES:END -->
