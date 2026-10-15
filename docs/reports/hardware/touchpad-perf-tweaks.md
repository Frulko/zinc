# HP TouchPad webOS 3.0.0: performance tweaks from the homebrew community

Web research only (2026-10-15); nothing was run on a device. Most sources are 2011-2014 and many forum threads
(webOS Nation, XDA, PreCentral) were not reachable by the search tool, so several claims below are
secondary and marked **[uncertain]**. Anything not backed by a URL in "Sources" is inference.

Our measured limits: ~38 ms GPU/driver per UI frame (~115 draws), ~28 ms to read a 1080p frame from uncached pmem.
Key finding up front: **the community never published a GPU (kgsl / Adreno 220) clock patch for the webOS
kernel, and nothing about making pmem cached.** The community work is CPU frequency, governors, I/O schedulers,
logging patches and Mojo/LunaSysMgr UI patches. Only the CPU-side items could help us, and our GPU/pmem-bound
numbers will mostly not move.

## Ranked table

| # | Tweak | What it changes | Reported gain | Risk | Works on 3.0.0? | How to apply |
|---|---|---|---|---|---|---|
| 1 | Muffle system logging (Preware patch, Patch > System) | Patches syslog/log config so almost nothing but critical errors is logged | Less CPU/flash I/O; no numbers found. "Snappier" anecdotes only | Low (a patch, removable; harder debugging) | Probably (patch targets files, version-gated by Preware). Unverified for 3.0.0 [uncertain] | Preware patch `muffle-system-logging`-style id (exact id not confirmed). Manual alternative: set logging minimal (see #2) |
| 2 | Minimal logging via service-menu code `#*5647#` ("logging" app) | Sets PmLogger / syslog level to minimal, clears logs | Same as #1, no numbers | Very low | Phone-era instruction; TouchPad equivalent is unconfirmed [uncertain] | As root: inspect `/etc/PmLogging.conf`, `/etc/syslog-ng/*` / `/etc/rsyslog*`, `/var/log/messages`; lower levels to `err`. Not verified by a source |
| 3 | Quiet powerd messages, Remove Dropped Packet logging (Preware patches) | Stops sleep/wake and firewall (iptables drop) logging | Small | Low | Probably [uncertain] | Preware patches of those names |
| 4 | UberKernel 3.0.0-36 (Preware `org.webosinternals.kernels.uber-kernel-touchpad`, feed `webos-kernels/3.0.0`) | Replaces kernel image. 1.5 GHz operating point (3.0.0-20), standard cpufreq governors, BFQ I/O scheduler (3.0.0-22), NFS/CIFS, TrueCrypt crypto modules | CPU 1.2 to 1.5 GHz (+25% peak). PreCentral: "not much impact on performance". Nothing on GPU | Medium: voids warranty, heat/battery. Recovery: package `org.webosinternals.kernels.palm-kernel-touchpad` 3.0.0-1 restores stock kernel; webOS Doctor if it does not boot | **Yes: a 3.0.0 build exists (3.0.0-36)**. Newer features (1.8 GHz, ondemand-ng, SIO/V(R), EXT4, "Too Many Cards" fix) only in 3.0.4/3.0.5 builds | Preware with beta/testing feeds, install package, reboot, tune in Govnah. By hand: the kernel is `/boot/uImage*` plus modules (path not confirmed [uncertain]); do not hand-copy, use the ipk |
| 5 | Govnah profiles (OnDemandTcl highest number, e.g. "OnDemandTcl 1512") | Changes cpufreq governor/tunables, max freq. Needs UberKernel | Lets the CPU hold max under load. We already force `performance` so little extra | Low (lower profile if crashes) | Needs UberKernel | We already do the equivalent: `echo performance > /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor`. With UberKernel also write `scaling_max_freq` (1512000 kHz) [uncertain: exact sysfs names for the 1.5 GHz point] |
| 6 | UberKernel 3.0.5-89 1.8 GHz (and unixPsycho 1.9 GHz kernel, 1.7 GHz said most stable) | Voltage-selectable overclock to 1.7-1.9 GHz | Reported working, no benchmarks found | Higher: heat, instability, battery | **No for 1.8/1.9 on 3.0.0** (only in 3.0.4/3.0.5 builds). Running 3.0.5 would mean a webOS update | Preware, Govnah |
| 7 | Unset CFQ IO scheduler (Preware patch) and BFQ/SIO/V(R) schedulers via UberKernel | Switches block I/O scheduler away from CFQ | Faster app/launch I/O; no numbers. Irrelevant for our GPU/pmem limits | Low | BFQ yes (3.0.0-22). SIO/V(R) only 3.0.4+ | `echo bfq > /sys/block/mmcblk0/queue/scheduler` (device name unverified [uncertain]) |
| 8 | Faster Card Animations HYPER, Mojo FPS Booster, Mojo Tap Responsiveness, Buttah (Preware patches) | Edits Mojo framework / LunaSysMgr JS/config to shorten animations, raise Mojo UI FPS to 60 | Perceived; no measurements | Low, but affect only Mojo/Luna UI, not PDK full-screen cards | Unknown for 3.0.0 (patch version-gated) [uncertain] | Preware. No effect on our native engine |
| 9 | Tweaks app (webOS Internals) | Toggle hidden system options (incl. some LunaSysMgr switches) | n/a | Low | Unknown [uncertain] | Preware |
| 10 | UberKernel 3.0.5-68 "Too Many Cards" fix (lowmemnotify threshold counts free swap) | Memory-pressure notification tuning | Fewer card kills, only when memory is tight | Low | No (3.0.4+) | Part of the 3.0.5 kernel |
| 11 | Unthrottle Download Manager | Removes the 64 KB/s download cap | Downloads only | Low | Unknown | Preware patch. Might matter for streaming media downloads, not rendering |
| 12 | EOM Overlord Monitoring removal | Stops uploads of app/Wi-Fi data to Palm servers | Some background CPU/network saved | Low | Unknown | Preware patch |
| 13 | swappiness, compcache/zram, interactive governor, GPU clocks, cached pmem, disable LunaSysMgr animations, kill daemons, "Remove Dr Watson", jail changes | **No community package found** | none | n/a | n/a | See "Not found" |

## Details

### Kernels (question 1)
- The webOS Internals feed lists UberKernel for 3.0.0, 3.0.4 and 3.0.5. The **3.0.0 build is 3.0.0-36**: 1.5 GHz,
  standard Linux cpufreq governors, BFQ, TrueCrypt crypto, NFS/CIFS. It is the newest kernel for our version.
  Its changelog: -8 initial, -20 1.5 GHz, -22 BFQ, -36 NFS/CIFS.
  https://stacks.webosarchive.org/feeds/ipkg.preware.net/webos-kernels/3.0.0/Packages.html
- The 3.0.4 and 3.0.5 builds (-93) add: 1.8 GHz with voltage selection (-89), EXT4/iSCSI/AoE, BFQ/SIO/V(R) schedulers and
  the `ondemand-ng` governor with screen-off frequency limiting (-88), the Too-Many-Cards fix (-68), USB audio (-92).
  Note the 3.0.4 feed says -91 was "forward-ported to the 3.0.5 kernel".
  https://stacks.webosarchive.org/feeds/ipkg.preware.net/webos-kernels/3.0.5/Packages.html ,
  https://stacks.webosarchive.org/feeds/ipkg.preware.net/webos-kernels/3.0.4/Packages.html
- A 1.7 GHz result and a separate unixPsycho kernel reaching 1.9 GHz (1.7 most stable) were reported in 2011.
  https://liliputing.com/overclock-an-hp-touchpad-to-1-7-ghz-with-uberkernel-for-webos-3-0-4/ ,
  https://addictivetips.com/mobile/overclock-hp-touchpad-webos-3-0-tablet-to-1-9ghz (title only; content not read)
- 1.5 GHz first reported Aug 2011 with "not much impact on performance" and slightly lower battery life.
  https://liliputing.com/hp-touchpad-tablet-overclocked-to-1-5-ghz/
- **GPU clocks: nothing.** No source mentions raising Adreno 220 / kgsl frequency under webOS. The kgsl clock table is
  in the kernel's board file (`board-tenderloin`/msm8660 `kgsl` platform data: max_axi/gpu freq); only a rebuilt kernel
  could change it, and no such build was found. This is inference, not sourced.
- Kernel sources: the freedreno wiki says the TouchPad ships a modified 2.6.35 kernel, that the 3.0.8 kgsl drivers were
  "stably backported" to 2.6.35 in `willcast/kernel_tenderloin` branch `2.6.35_desktop`, plus desktop_3.0 / desktop_3.4 branches.
  That is the Android/desktop-Linux line (Mesa/freedreno), not a webOS kernel, and it says nothing about GPU clocks or pmem.
  https://github.com/freedreno/freedreno/wiki/HP-TouchPad
  HP's Android kernel source: https://www.cnx-software.com/2012/02/10/android-kernel-source-released-for-hp-touchpad/
  (dalingrin/hp-kernel-tenderloin, branch hp-topaz-android). These are the best starting point if we ever wanted a custom
  kernel (e.g. to set pmem cached / change the kgsl table), but flashing a custom kernel is a large project and risk
  (needs Moboot/novacom, webOS Doctor to recover). Not recommended without a second device.
- Risk of kernel packages: warranty warnings; the "Palm Kernel" package only restores kernel files, not other files changed
  by overclock patches; users lost overclocks / broke dual-boot after the 3.0.5 OTA update.
  https://liliputing.com/hp-releases-webos-3-0-5-for-the-hp-touchpad-tablet/ (comments)

### pmem / video buffers (question 2)
No hit. No homebrew package or post mentions pmem, cached pmem or the video decoder buffer mapping. Practical ideas
(inference, untested): read the decoder output with NEON non-temporal-free copies or, better, avoid CPU reads
entirely (give the buffer straight to GL via the decoder's EGL/overlay path, if palmvideodecoder exposes one).
The 28 ms cost is typical of uncached (strongly-ordered / device) mappings, which a userspace patch cannot change
without kernel pmem flags (`PMEM_CACHED` flags exist in the Android msm pmem driver; whether the webOS kernel honors them is **unknown**).

### Logging and daemons (question 3)
- The 2014 webosarchive guide (phone-oriented, "Part 2") lists: Muffle system logging, Remove Dropped Packet logging,
  Unset CFQ IO scheduler, Quiet powerd messages, Unthrottle Download Manager, EOM Overlord Monitoring, and the service-code
  `#*5647#` method to set logging minimal. It warns it makes Lumberjack debugging harder.
  https://www.webosarchive.org/pivot/2014/11/02/guide-coming-back-to-webos-in-2014-part-2/
- Others call Muffle "the main logging patch if you do not want the custom kernel".
  https://www.techradar.com/news/mobile-computing/tablets/how-to-speed-up-your-hp-touchpad-1037020 (not fetched; per search snippet)
- "Remove Dr Watson" was not found as a package [uncertain it exists].
- No measured CPU savings found. For us, as root over novacom, the lowest-risk manual equivalent is lowering log levels
  in the logging config and stopping unused services via upstart (`stop <job>`); which jobs are safe to stop on 3.0.0 was
  not found in any source. Needs a device-side survey (`initctl list`, `top`) before acting.

### GPU / LunaSysMgr settings for PDK full-screen apps (question 4)
- Found only Mojo-level patches (Faster Card Animations HYPER, Mojo FPS Booster, Buttah). They modify the Mojo JS framework
  for webOS apps; a PDK full-screen card is not affected. No patch for LunaSysMgr compositing or GPU frequency was found.
- LunaSysMgr was modified in webOS CE / LuneOS, but those are replacement OS builds, not tweaks for 3.0.0.
  https://www.webosarchive.org/pivot/2014/06/13/webos-ports-surprises-with-touchpad-port-namelogo-change/
- Stopping LunaSysMgr's other cards/compositor while our card runs (e.g. keep only our card active) is a plausible win
  but unsourced.

### PDK jail, extra device nodes, unsigned jail_app.conf
Nothing public found: searches for `jail_app.conf`, `jailer` and `/dev` access returned nothing on webOS. The webOS
developer guide only says developer mode gives a device shell with full file-system access.
https://sdk.webosarchive.org/docs/dev-guide.html
So: **no known community recipe** to allow `/dev/msm_vidc_dec` in the jail. Since we are root, the practical
approach is to inspect the jail definition on the device itself (look for `jail*.conf` under `/etc/palm/` or `/usr/lib/luna/`,
and `jailer` binary strings) and test a bind/`mknod` of the node inside the app's jail root. Unverified.
The PDK/PDL docs: https://sdk.webosarchive.org/docs/dev-guide/pdk/overview.html

### Not found (explicit)
swappiness/vm tuning, compcache/zram (the UberKernel changelog has no zram; only the Too-Many-Cards swap-aware
lowmem threshold), interactive governor (only `ondemand-ng`, 3.0.4+), GPU/kgsl overclock, cached pmem, a LunaSysMgr
animation-disabling switch outside Mojo patches, Govnah internals (what sysfs files it writes).

## Recommendations for us
1. We already do the best CPU-side thing (performance governor, core 1 online). UberKernel 3.0.0-36 would add only a 1.5 GHz
   point; expected gain small and not on the GPU/pmem bottleneck. Try only if CPU-bound phases show up in profiling.
2. Logging reduction: low risk, small gain; survey first.
3. Our big costs (GPU 38 ms/frame, pmem reads 28 ms) have no community fix. Levers are in our own code: fewer draw calls,
   avoid CPU readback of decoder buffers.

## Sources
- https://stacks.webosarchive.org/feeds/ipkg.preware.net/webos-kernels/3.0.0/Packages.html
- https://stacks.webosarchive.org/feeds/ipkg.preware.net/webos-kernels/3.0.4/Packages.html
- https://stacks.webosarchive.org/feeds/ipkg.preware.net/webos-kernels/3.0.5/Packages.html
- https://www.webosarchive.org/pivot/2014/11/02/guide-coming-back-to-webos-in-2014-part-2/
- https://github.com/freedreno/freedreno/wiki/HP-TouchPad
- https://liliputing.com/hp-touchpad-tablet-overclocked-to-1-5-ghz/
- https://liliputing.com/overclock-an-hp-touchpad-to-1-7-ghz-with-uberkernel-for-webos-3-0-4/
- https://liliputing.com/hp-releases-webos-3-0-5-for-the-hp-touchpad-tablet/
- https://www.cnx-software.com/2012/02/10/android-kernel-source-released-for-hp-touchpad/
- https://sdk.webosarchive.org/docs/dev-guide.html
- https://www.webosarchive.org/pivot/2014/06/13/webos-ports-surprises-with-touchpad-port-namelogo-change/
