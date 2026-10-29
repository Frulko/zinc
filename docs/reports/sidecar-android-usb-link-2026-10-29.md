# Sidecar to Android over USB: what adb gives, what could replace it (2026-10-29)

Device: Nexus 7 2012 (grouper), kernel 3.1.10, Android 7.1.2, rooted, serial 015d2ebe8c081c06. Host: M1 Pro, macOS 15, adb 1.0.41 (37.0.0).
Scripts were throwaway (`~/.claude/jobs/31e2fafb/tmp`); nothing in the repo changed; the device was not rebooted, no USB mode was changed.

## 1. Measurements (this device, this cable)

USB topology (`system_profiler SPUSBDataType`): Nexus 7 (18d1:4ee7, "Speed: Up to 480 Mb/s", 500 mA) hangs under a Dell dock USB 2.0 hub chain
(Realtek 0bda:5413 / Dell 413c hubs) behind a Fresco Logic 1d5c:5801 USB 2.0 hub, on the Mac's AppleT6000USBXHCI. Several hubs deep (adb location `usb:2-1.1.3.3`).
Device gadget log: `android_usb gadget: high speed config #1` (so it enumerates at 480 Mbit/s).

| Test | Result | Notes |
|---|---|---|
| `dd \| adb exec-in 'cat >/dev/null'` 64 MB (Mac to device) | 3.5 MB/s (18.4 s) | no flash involved |
| same through `adb shell` (shell_v2) | 3.5 MB/s (18.5 s) | identical, so not the pty |
| TCP stream via `adb forward` to `nc` on device, 32 MB | 3.72 MB/s (9.0 s) | adbd 2% CPU, device idle (4% user) |
| same with `ADB_LIBUSB=1` server, 24 MB | 3.61 MB/s | backend makes no difference |
| `adb push` 100 MB to /data/local/tmp | 3.4 MB/s (29.2 s) | same as the sink: flash is not the limit |
| `adb pull` 100 MB (device to Mac) | 10.4 MB/s (9.6 s) | |
| device to Mac TCP via forward (52 MB) | 11.9 MB/s | |
| app speed test (`sidecar-screen --host adb`, "speedtest" on stdin) | 27 Mbit/s = 3.4 MB/s (11.3 MB in 3.3 s) | matches the raw tests |
| app ping, empty SINK/ECHO over host:transport+tcp:7710 | 4.2 ms median, 3.2 best, 7.6 worst (20 of 20) | idle link |
| app picture round trip while streaming (info line) | 12 ms median, 422 ms max at 17 fps; 220-285 ms median at 2-3 fps with big frames | frames of ~25-50 KB at 3.5 MB/s take 10+ ms each way |

Findings:
- The Mac to device direction is asymmetric: 3.5-3.7 MB/s (about 29 Mbit/s) out versus 10-12 MB/s in. That is 7-8% of the 480 Mbit/s line rate (and ~10% of a realistic 35-40 MB/s bulk ceiling) for the direction Sidecar uses for pictures.
- Not CPU (adbd 2%), not flash (sink equals push), not the host adb backend (libusb equals native), not TCP/forward overhead (exec-in equals forward). So it is the device's USB gadget path: adbd plus the `f_adb` function and the Tegra `fsl-tegra-udc` OUT path, probably also the multi-hub chain (unmeasured: no direct-port test was possible, the Mac ports are behind the dock).
- Recollection of the kernel source (not verified here): the 3.1-era `f_adb.c` uses 4096-byte bulk buffers with 4 requests in flight (`BULK_BUFFER_SIZE 4096`, `RX_REQ_MAX 4`), and adbd on 7.1 reads in small pieces. The 4 KB buffers explain a per-request-latency-bound OUT rate. Verify with the kernel tree of this ROM before relying on it.
- The only adb-side levers: payload size is negotiated in the protocol (4 KB v1, 256 KB later, 1 MiB newest, [AOSP change](https://android.googlesource.com/platform/system/core/+/3d2904c%5E!/)); the device speaks the old one and the host cannot override it. No flag changes the result. Parallel streams share one USB pipe and gain nothing (the pipe, not the stream, is the limit).
- `error: closed` / drops: dmesg shows 64 `USB_STATE=DISCONNECTED` events in 37 min uptime, many caused by my own adb server restarts and by the earlier sessions, but each one re-enumerates the gadget and kills every adb stream. Hub chain and the 500 mA draw (`Current Required 500`) are plausible causes of spontaneous ones; not isolated.
- Ceiling for reference: USB 2.0 high speed bulk is 13 packets of 512 B per 125 us microframe at most = 53 MB/s raw, 35-40 MB/s in practice (host-controller dependent; figure from general USB 2.0 knowledge, not measured here).

## 2. Alternatives for this kernel and a macOS host

What the device offers (`/sys/class/android_usb/android0/`): `f_accessory f_acm f_adb f_audio_source f_mass_storage f_mtp f_ptp f_rndis`; `/dev/usb_accessory`, `/dev/android_adb`, `/dev/ttyGS0-3`; UDC `fsl-tegra-udc`; no `/config/usb_gadget` (no configfs), no `/dev/usb-ffs`, no f_ncm / f_ecm. Root works (`su`).

| Option | Works on this device? | Mac side | Expected speed | Cost / risk |
|---|---|---|---|---|
| A. Android Open Accessory (AOA 2.0) with libusb | yes: `f_accessory` and `/dev/usb_accessory` exist; Android 7.1 `UsbManager.openAccessory()` is the Java path | libusb sends control request 51 (get protocol), strings (52), start (53); device re-enumerates as 18d1:2d00 (2d01 keeps adb on a second interface); claim interface, bulk IN/OUT | unmeasured. `f_accessory` uses its own larger buffers (recollection: 16 KB, 4 requests), no adbd, no shell layer; expect clearly above 3.6 MB/s OUT, perhaps 15-30 MB/s | needs the Java app to open the accessory; permission dialog on first connect (can be pre-granted with root); adb vanishes during the session unless 2d01 works; Mac side needs libusb |
| B. USB tethering (RNDIS) | the gadget has `f_rndis`, but macOS has no RNDIS driver | [HoRNDIS](https://github.com/jwise/HoRNDIS/issues/146) is a kext: dead on macOS 15 / Apple silicon ([Speedify](https://support.speedify.com/article/415-tether-android-mac-usb), [The Register](https://www.theregister.com/2024/02/07/horndis_android_mac/)); userspace re-implementations (muta, TetherKit) claim Sequoia support from READMEs only | RNDIS on this UDC: unknown, typically 15-30 MB/s | needs a third-party userspace driver on every Mac; fragile |
| C. CDC-NCM / ECM (native macOS driver) | no: the 3.1.10 android_usb list has no ncm/ecm, and `svc usb setFunctions ncm` is Android 12+/13+ only | macOS would work with no driver | would be the best | not available without building a new kernel (no); out |
| D. FunctionFS bulk gadget | no: no `/dev/usb-ffs`, no configfs; kernel 3.1 may lack FFS | libusb | | out unless the kernel is rebuilt |
| E. ACM serial (`f_acm`, /dev/ttyGS0) | present, but not a normal Android Settings function; Mac side is a CDC serial port | `/dev/cu.usbmodem*` | tty layer, probably 1-5 MB/s | not better than adb; out |
| F. adb tuning | no knob moves it (section 1) | | 3.6 MB/s | none |
| G. Wi-Fi/Ethernet instead | Nexus 7 has Wi-Fi only, no Ethernet | | the app already supports addresses | not a cable answer |

macOS notes for A: libusb talks to the device through IOUSBHost without a driver or entitlement for a vendor/AOA device; it must not be claimed by `adb` at the same time (adb's server holds the adb interface of 18d1:4ee7 only; the AOA device is a different product id, so no clash). libusb is LGPL-2.1+; vendored as a dynamic library or compiled in with the licence file, per `third_party/README.md` practice. scrcpy uses its own adb, not AOA, for video; AOA on the host side is what [Google documents](https://source.android.com/docs/core/interaction/accessories/aoa) (2d00 one interface with two bulk endpoints, 2d01 adds the adb interface). I found no published MB/s for AOA on USB 2 with libusb (searched), so the figure above is a hypothesis to measure, not a fact.

## 3. Recommendation

1. Implement first: AOA with libusb as a second transport next to adb (keep adb as the fallback; the code in `adb.swift` stays).
   - Device: in the existing Java app add `UsbManager.getAccessoryList()/openAccessory()`, a manifest `<intent-filter>` for `USB_ACCESSORY_ATTACHED` with `accessory_filter.xml`, and bridge the two ParcelFileDescriptor streams to the existing 7710/7711 handlers (a local socket pair or direct calls). Multiplex picture and sound over the two bulk endpoints with the wire format already in use (one stream with the existing 16-byte headers). No root needed; root only helps to pre-grant the permission (a one-time dialog otherwise).
   - Mac: vendor libusb (LGPL-2.1, or the macOS IOKit calls directly), AOA handshake, bulk transfers with 16-64 KB buffers and 4-8 transfers queued; reconnect on re-enumeration.
   - Throughput and latency: expected several times 3.6 MB/s OUT and well below the 4 ms adb ping; to be measured by a 100-line libusb spike before building the product path (send zeros, count bytes).
2. Do not do RNDIS/HoRNDIS (needs a third-party driver, no native macOS driver) and nothing relying on NCM/ECM/FFS (this kernel lacks them).
3. Meanwhile with adb: budget about 3.5 MB/s out. At 17 fps, 25-50 KB frames use 40-85% of that; keep frames small, coalesce, and keep the sound stream small. Avoid hub chains and use a direct port to measure the effect of the dock (not tested here).

Risks of A: switching to accessory mode drops adb for that session (other tools using adb on this device lose it; 2d01 mode keeps adb as a second interface if the kernel exposes accessory,adb together, which `f_accessory` supports, untested here); unplugging or a Mac sleep needs the re-enumeration handled; the first-run permission dialog; the hub's drops affect every USB path equally (AOA at least restores quickly with no adb server in between).

## Sources
- AOSP ADB payload size change: https://android.googlesource.com/platform/system/core/+/3d2904c%5E!/
- AOA protocol: https://source.android.com/docs/core/interaction/accessories/aoa
- HoRNDIS state: https://github.com/jwise/HoRNDIS/issues/146 , https://www.theregister.com/2024/02/07/horndis_android_mac/ , https://support.speedify.com/article/415-tether-android-mac-usb
- All device numbers: measured 2026-10-29 on this Mac and Nexus 7.
