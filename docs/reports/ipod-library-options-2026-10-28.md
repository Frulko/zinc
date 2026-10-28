# iPod library options for the Zinc iPod plugin (2026-10-28)

Web research, no code. Items marked (unverified) come from memory of libgpod internals or were not confirmed by a page fetched today.

## 1. Options compared

| Option | License | Language / deps | Last activity | Devices | Checksums | Artwork write | SQLite (Nano 6G/7G) | Notes |
|---|---|---|---|---|---|---|---|---|
| libgpod 0.8.3 upstream (SourceForge gtkpod) | LGPL-2.1+ | C, glib, gdk-pixbuf, libplist, sqlite3, libusb optional | Frozen at 0.8.3 (2013). Distros still ship it: Debian -23, Alpine r12, Ubuntu noble rebuilt 2024 | Classic, Nano 1G-5G native; Mini, Video, Shuffle 1G-4G; Nano 6G/7G only with an external hash lib | hash58 yes, hash72 yes (needs a HashInfo file written by iTunes, unverified), hashAB only through an external `libhashab.so` hook | Yes (ithmb, many formats) | Partial (Nano 6G/7G, writes `iTunesCDB`/sqlite, needs hashAB) | The reference. 2020 mailing-list thread proposed a GitHub move, nothing followed |
| john8675309/libgpod-0.8.3 (planned) and fadingred/libgpod | LGPL | same as above | no confirmed 2023+ activity | same | same | same | same | fadingred is a plain mirror, john8675309 adds Python 3 fixes (not verified here) |
| gerion0/libgpod | LGPL | C, glib; Meson build, HAL dropped, Python 3 support | not dated in results | same as upstream | same | same | same | Only fork where a Meson switch is confirmed; its Meson files and HAL removal are worth reading |
| Distro patches (Debian/Ubuntu/Arch/Fedora/openmamba) | LGPL | quilt patches | Debian 0.8.3-23 (2024-25) | - | - | - | - | Small fixes: `itdb_resolve_path` speed-up, libplist 2.2 requirement, gdk-pixbuf now mandatory, mono binding fixes. No new device support |
| hashab (DigiDNA, fork of dstaley/hashab) | **Unlicense** | C (plus Zig tests, WASM/TS), no deps | 2 commits, 2026 footer | Nano 6G/7G | **hashAB**: input 20-byte SHA1 + 8-byte UUID, output 57 bytes. Reverse-engineered from `libhashab32.so`, tested on 10,000 random inputs against the original | n/a | n/a | **Removes the "closed blob" gotcha**: a clean-room C implementation, public domain, tiny |
| ipodsync (buldiei) | MIT (hashAB part public domain) | Pure Python >= 3.9, macOS + Linux | alpha, 2025-26 | Nano 6G/7G | hashAB (Python port of dstaley/hashab, 100/100 vectors) | Yes, own ArtworkDB + `F<fmt>_1.ithmb` writer, RGB565 LE, formats 1010/1013/1015/1016, incremental append | Yes: writes `iTunes Library.itlp/*.itdb`, signs only `Locations.itdb`, device regenerates `iTunesCDB` | Best documentation of the Nano 6G/7G path. MP3 upload only, optional backup (`-b`) |
| iOpenPod (TheRealSavi) | GPL-3.0-or-later | Python + PyQt6, ffmpeg | 172 commits, last push 2026-04 | Classic/Video/Mini/Nano 1G-7G; no Shuffle, no Touch | Credits HASHAB; details not on the page | Yes (parser and writer modules for ArtworkDB) | Nano 6G/7G listed, details not documented | GPL, so code cannot be copied into Zinc; use as a format reference only. Spiritual libgpod successor in Python |
| pygpod (PyPI) | not checked | Pure Python | not checked | Classic family stated; says it re-writes iTunesDB byte-identically | not checked | not checked | not checked | Page failed to load; check before relying on it |
| podsy (mescam) | not checked | Python + Textual TUI | not checked | iTunesDB versions 0x13-0x15 read/write | - | - | - | Small reference |
| iTunesDB-Parser (raleighlittles) | not checked | Rust | WIP | read-only (iTunesDB, Photos DB, EQ, Playcounts) | - | - | - | Not a writer. No real Rust or Go crate with write support was found |
| rust-libgpod (audy) | not checked | Rust over libgpod | demo | = libgpod | = libgpod | = libgpod | = libgpod | Bindings only, nothing to borrow |
| Strawberry | GPL-3 | C++/Qt, optional libgpod | active | = libgpod | = libgpod | = libgpod | = libgpod | Still links libgpod (optional at build time). Forum reports: macOS 0.9.3 had no iPod, dev builds added it; Debian 1.2.19 detects an iPod Photo but sync is unclear. Clementine, Rhythmbox and Amarok also wrap libgpod (not re-checked today) |
| Rockbox | GPL-2 | C, firmware | active | iPod firmware side | no DB writing | n/a | n/a | Documents the hardware and disk layout, not iTunesDB |
| libimobiledevice (+ libgpod's `ipod-lockdown`) | LGPL | C | active | iPod Touch/iPhone/Nano 6G+ over lockdown/AFC | - | - | - | libgpod's tool reads `/iTunes_Control/Device/SysInfoExtended` over AFC for lockdown devices. Not relevant to mass-storage classics |

Note: no 2020+ GitHub or GitLab fork of libgpod with new device or checksum features was found (search covered "libgpod fork", Meson/CMake, 2023-2025). Treat libgpod as frozen.

## 2. Key findings

1. **hashAB is no longer a blocker.** Two independent open implementations exist: `DigiDNA/hashab` (C, Unlicense) and the Python port in ipodsync (MIT/PD). We can ship Nano 6G/7G signing without any closed binary. libgpod itself only calls an external `libhashab.so`; patching a call to the C function is about 100 lines. Source: https://github.com/DigiDNA/hashab
2. **Nano 6G/7G need more than hashAB.** ipodsync writes the sqlite `iTunes Library.itlp/*.itdb` set, signs `Locations.itdb` only, and lets the device rebuild `iTunesCDB`. It also writes its own ArtworkDB with RGB565 LE ithmb (formats 1010/1013/1015/1016). That path is lighter than libgpod's 6G/7G code, which is incomplete. Source: https://github.com/buldiei/ipodsync
3. **FireWire GUID comes from the USB serial.** ipodsync reads the GUID from the USB serial number (udev `ID_SERIAL`) because `SysInfo*` files are HFS+-compressed and unreadable on Linux; the env var `IPODSYNC_FIREWIRE_GUID` is the fallback. This is cheaper than the vendor request 0x40 and needs no control transfer. On macOS the equivalent is the IORegistry `USB Serial Number` property (unverified, standard IOKit key). Plan: GUID from the USB descriptor first, SysInfoExtended via libusb vendor request only when the full XML is needed (artwork formats, model details).
4. **Vendor request.** libgpod's `tools/ipod-usb.c` uses `libusb_control_transfer` with request 0x40, device-to-host, device recipient, found by bus number and address. Source: https://git.stg.centos.org/source-git/libgpod/blob/c8/f/tools/ipod-usb.c . It is a device-level control transfer, so no interface claim should be needed and the mass-storage driver can stay bound (unverified on macOS). Test early on a Mac with the volume mounted; fallback is IOKit `IOUSBDeviceInterface::DeviceRequest`. Nano 5G needs the libusb path (libgpod 0.7.90 NEWS).
5. **HFS+ journaling.** On Linux/Pi, iPod HFS+ volumes mount read-only when journaled. Disabling the journal needs a Mac (`diskutil disableJournal`); forcing rw on a journaled volume can corrupt it. Detect read-only mount and tell the user (clear error). Also `SysInfo*` unreadable on Linux for the same reason.
6. **Apple auto-sync destroys manual content.** Both ipodsync and iOpenPod document that an Apple/iTunes sync rebuilds the library. Our UI should say "manual management" is required.
7. **iOpenPod docs say** the iPod must already be mountable and accessible by the OS, and conversion needs ffmpeg. Same constraint for us.
8. **Hash coverage in libgpod**: hash58 (Classic 6G/7G, Nano 3G/4G) needs the FireWire GUID. hash72 (Nano 5G) needs a `HashInfo` file created on the device by iTunes (unverified: no fetched page confirms the details), so a never-iTunes-synced Nano 5G cannot be signed by libgpod 0.8.3. hashAB (6G/7G) is covered by item 1.

## 3. Does vendoring libgpod 0.8.3 still make sense?

| Criterion | Vendor libgpod (plan) | Write our own C++20 (pure) | Hybrid |
|---|---|---|---|
| Classic, Nano 1G-5G, Video, Mini, Shuffle | Proven for 15 years | Large work, high corruption risk | libgpod |
| Nano 6G/7G | Incomplete, needs patch | Small sqlite + ithmb writer, reference exists (ipodsync) | New code |
| glib dependency | Real: GList/GHashTable/GError throughout, plus gdk-pixbuf shim; hurts Windows, ESP-like portability, link size | None | glib remains in the libgpod part |
| License fit | LGPL-2.1: ok if compiled as a separable plugin with sources provided; static into a closed binary is the sticking point | Free choice | LGPL part isolated |
| Time | Days | Weeks to months | Days + a week |

The rule "never reinvent proven libraries" (AGENTS.md) favours keeping libgpod for the classic family.

## 4. Recommendation

**Keep the vendored libgpod 0.8.3 plan, add three things, do not switch.**

1. Base: john8675309 fork or gerion0 (compare the two diffs first; gerion0 has Meson, HAL removal, Python 3). We compile sources directly, so only the C changes matter, not the build files.
2. Carry from Debian: gdk-pixbuf handling already replaced by the stb shim, the `itdb_resolve_path` speed-up, libplist >= 2.2 API fixes (check the new libplist 2.3+ headers when pkg-config finds one; a vendored libplist avoids the issue).
3. Add hashAB: vendor `DigiDNA/hashab` `src/` (Unlicense) and register it in libgpod's hash hooks (it normally dlopens `libhashab.so`). Unlocks Nano 6G/7G signing with no closed blob. Pin the commit, record the licence in `third_party/README.md`.
4. For Nano 6G/7G sqlite content and ArtworkDB, test libgpod first. If it fails on real hardware, port ipodsync's small sqlite + ithmb writer (MIT, formats 1010/1013/1015/1016 RGB565 LE) into C++ as a separate module. Do not copy iOpenPod (GPL-3).
5. FireWire GUID: read it from the USB serial (IOKit on macOS, udev/sysfs on Linux, SetupAPI/WinUSB on Windows) and write a minimal SysInfoExtended when missing; use the libusb 0x40 request for the full XML. Check macOS behaviour with the volume mounted before building more on it.
6. Pre-write safety (already in the plugin plan): backup `iTunesDB`/`ArtworkDB` (ipodsync `-b` model) and refuse to write if the volume is read-only (journaled HFS+).

Open questions to test on hardware: vendor request 0x40 on macOS with the disk mounted; hash72 on a Nano 5G never synced by iTunes; libgpod 6G/7G sqlite writing.

## Sources

- https://github.com/DigiDNA/hashab
- https://github.com/buldiei/ipodsync
- https://github.com/TheRealSavi/iOpenPod , https://pypi.org/project/iopenpod , https://pypi.org/project/pygpod/
- https://github.com/raleighlittles/iTunesDB-Parser , https://github.com/audy/rust-libgpod
- https://github.com/fadingred/libgpod , https://github.com/gerion0/libgpod
- https://sourceforge.net/p/gtkpod/mailman/message/37053865 (2020 move-to-GitHub thread)
- https://git.stg.centos.org/source-git/libgpod/blob/c8/f/tools/ipod-usb.c , .../tools/ipod-lockdown.c , .../NEWS
- https://packages.debian.org/source/stable/libgpod , https://sources.debian.org/patches/libgpod/0.8.3-8.2+deb9u1/
- https://forum.strawberrymusicplayer.org/post/943 , /post/8695 , /post/9161
