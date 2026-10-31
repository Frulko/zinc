# An independent iPod restoration assistant

Research date: 2026-10-31. Scope: feasibility, source audit, a read-only observation of the connected iPod, and a proposed implementation. No device was formatted, unmounted, rebooted, put into DFU, or flashed. No third-party restore executable was run. This is a proposal, not an implemented or hardware-qualified restoration feature.

## Conclusion

A standalone restoration application, also launchable from the iPod demo, is feasible. FAT32 creation on macOS is available; complete Apple firmware recovery requires a model-specific USB/SCSI workflow. HFS+ restoration needs separately qualified layouts and firmware paths. Neither should be advertised as universal or incapable of bricking a device.

Start with Classic 6G/6.5G/7G diagnostics and preservation of the current device identity. Prove the macOS recovery transport before exposing destructive operations. A successful music-library backup is not a backup of the firmware or NOR.

## Evidence from the connected device

Read with `diskutil list external physical`, `diskutil info -plist`, and the existing Device files. Serial numbers and GUIDs are deliberately omitted here. The BSD identifier is ephemeral and must never become a saved restoration target.

| Observation | Value | Interpretation |
|---|---|---|
| Connection | External, physical, USB, media reported as iPod | Useful corroboration, not enough to authorize an erase |
| Current whole-disk size | 127,663,869,952 bytes | Host-visible capacity; does not establish the installed physical storage or its maximum capacity |
| Partition scheme and data filesystem | MBR (`FDisk_partition_scheme`), FAT32 | Existing Windows-format data volume |
| Host logical device block size | 4096 bytes | Layout arithmetic must distinguish host blocks, protocol units and filesystem sectors |
| Data partition offset | 258,048 bytes | Preserve as an observation, not a universal recipe |
| Device files' claimed identity | `xC297`, “7th Gen”, nominal 160GB | Reported identity, not proof of physical board revision |
| Device files' firmware values | `VisibleBuildID=2.0.2` in SysInfoExtended; `visibleBuildID: 1.62` in SysInfo | Conflicting sources; do not treat 1.62 as an authoritative installed OS version |
| Other file metadata | `UpdaterFamilyID=35`, `FamilyID=11`, claimed USB PID `0x1261` | File metadata; obtain fresh bus descriptors separately for restoration |
| Recovery files at volume root | No name containing syscfg, rockbox, boot or emcore | Does not rule out a backup elsewhere, a NOR bootloader, or previous modification |

The file observations fit the owner's account of a converted Classic, but do not establish the original hardware or verify a live boot of 2.0.2. Disk Utility's partition listing alone does not establish the location or integrity of every firmware store. Raw firmware regions and NOR were not read.

## What the existing projects actually provide

| Project | Useful capability | Limit / integration decision |
|---|---|---|
| [freemyipod restoration guide](https://freemyipod.org/index.php?title=Restore_iPod_without_iTunes&oldid=22348) | Describes signed recovery stages and the final firmware transfer | Procedure, not a safe production orchestration layer |
| [Rockbox mks5lboot](https://github.com/Rockbox/rockbox/tree/master/utils/mks5lboot) | DFU enumeration and sending Apple recovery images; source includes an IOKit backend | Build a pinned modern host binary; distinguish signed recovery from Rockbox bootloader installation |
| [freemyipod ipodscsi_linux](https://github.com/freemyipod/freemyipod/blob/d488d64bf30bdd82af18b65872afbf728dc84d4b/tools/ipodscsi_linux/main.c) | Classic vendor commands for partitioning, firmware transfer and reboot | Linux-specific SCSI transport; not a macOS implementation |
| [wInd3x](https://github.com/freemyipod/wInd3x/tree/7c7c4d83c8b923f29e7559585b2cdbbf4e028045) | BootROM exploration, memory dumping, temporary execution | Recovery toolbox, not a complete stock restore app. Classic support marked experimental. Nano 4G/5G exploitation requires native Linux according to upstream |
| [LeUnBrIck](https://github.com/lycanld/LeUnBrIck/tree/1c9a1e78f515662f420e9e2eb5492272a6623584) | Existing orchestration for Nano 6G/7G | README explicitly marks macOS untested; script references Linux ipodscsi and downloads firmware archives from its own releases. Do not execute as our trusted restore backend |
| [RepriseOS / osos-lab](https://github.com/lgreitis/osos-lab/tree/c31c65d8c469cd90f305cbd90139d98e62c2b7ae) | NOR/SysCfg inspection, JSON CLI, firmware preparation and verified USB file uploads | Valuable independent helper/patterns. Its application targets customized 2.0.5 and FAT32; not proof of a stock HFS+ restore |
| [HFS+ restoration example](https://gist.github.com/VinDuv/7aaf08e41b8b6f09ab1d2b7466731569) | APM, separate firmware region, HFS+ data restoration | Author tested an iPod 3G. Its 512-byte layout must not be transplanted onto a Classic |
| [flashpod](https://github.com/davidbarnhart/flashpod) | Early FireWire-era iPod storage/firmware tooling | Separate historical-device path, not a Classic recovery backend |

### The wiki's macOS gap

The wiki was read through a headed browser on the Mac after automated retrieval received HTTP 403. The inspected revision is dated May 31, 2026. Its overview is DFU → WTF → re-enumeration → model-specific FIRMWARE stage → recovery disk mode → firmware transfer/repartition/reboot → FAT32 formatting.

It identifies Classic recovery PIDs 1241, 1245, 1247 and 1250. Those are stage identities, not a substitute for hardware eligibility checks. Although the page includes macOS, the linked Linux implementation includes `scsi/sg.h` and calls `SG_IO` on a SCSI-generic device. Its syntax also differs from the Windows command printed in the guide.

The source only checks the ioctl return in its transfer path: it does not validate all SCSI status/sense results. Its file-read loop does not handle unexpected EOF. Reusing the protocol requires stronger error handling and verification than accepting its exit code or progress dots.

On macOS, investigate IOKit's SCSITaskDeviceInterface and exclusive access, using Apple's [documented access semantics](https://developer.apple.com/documentation/iokit/scsitaskdeviceinterface/1575374-obtainexclusiveaccess). An available API does not prove that this iPod's current storage driver exposes it. Begin with enumeration and a narrowly scoped read-only inquiry on a test device. Do not unload drivers or weaken system security to make the path work. If unavailable, a separate audited recovery USB helper is another research path; it is more work and must not silently replace the signed stock procedure.

### Source and firmware trust

The 2.0.2 IPSW URL in Olsro's guide returned HTTP 200 over HTTPS on this date, with Content-Length 61,033,067. This was a HEAD request, not a download or validation. It demonstrates availability only for this archive. The wiki's statement that Apple files require HTTP must be evaluated per URL, not copied as a global network policy.

Prepare all recovery inputs before erasing: exact IPSW, both recovery stages, expected sizes and independently established digests, hardware eligibility and filesystem/layout recipe. ZIP CRC and a freshly computed SHA-256 do not establish provenance. Validate Apple's signatures where applicable; retain a pinned trusted catalog. Refuse unknown, truncated, incompatible or unavailable inputs before any write. Prefer Apple-hosted downloads or a verified local archive; do not silently source substitute firmware from arbitrary mirrors.

## The Olsro conversion and this iPod

Owner clarification: repeated restore failures on recent macOS occurred **before** the SysCFG modification. A command-line Windows restore to FAT32 succeeded, but was laborious. Therefore the product must solve stock restoration and Mac-hosted FAT32 preparation independently of support for converted devices; the conversion must not be blamed for the earlier failures.

For the currently converted device, reinstalling the same eligible signed firmware (the mounted metadata reports 2.0.2) while preserving its current SysCFG is the intended default. This is conditional on confirming the actual working version and compatible restore bundle. A data-volume problem, missing disk firmware, and failed NOR boot code need different recovery stages. “Same version” is an input policy, not proof that copying a single IPSW or firmware blob will repair every state. Reinstalling the firmware does not itself imply reverting the identity conversion. Do not rerun the identity-editing procedure as a routine recovery step.

The [owner's guide](https://github.com/Olsro/reddit-ipod-guides/blob/main/guides/ipod6g-flash-more-recent-firmwares.md) changes NOR SysCFG fields to admit later signed Apple firmware. It warns that corrupted identity data can prevent normal recovery. Its procedure removes the Rockbox bootloader during Apple restore. It also documents a Rockbox-installation caveat with 2.0.2.

For this device, preserve the currently working converted identity by default. Do not recommend an original-generation downgrade or 2.0.5 merely because a model table suggests it. A return to factory identity is a separate expert operation requiring an original backup or independently verified reconstruction and a compatible firmware/storage plan. A fresh NOR dump captures today's state; it cannot recover erased historical identity.

Represent identity evidence with its source and confidence: physical board (possibly unknown), current NOR configuration, USB mode/descriptors, mounted metadata and observed firmware. Differences are information to explain, not automatic repair instructions. An unmodified device and a successfully converted one can present the same software identity.

## Formatting: the choices the assistant can honestly offer

| Requested operation | Necessary behavior |
|---|---|
| Clear music/library only | Explicitly describe data deletion; preserve firmware and identity; do not call it firmware restoration |
| Reformat the data volume as FAT32 on Mac | Use the system formatter on the verified data partition, with a qualified layout; macOS does not require Windows to create FAT32 |
| Reformat as HFS+ | Offer only with a validated model/firmware/layout combination; HFS+ support in macOS alone is insufficient |
| Full stock recovery | Stage recovery software, recreate the correct firmware/data layout, install eligible stock firmware, initialize and verify data volume, then verify reboot |
| Restore original factory identity | Separate advanced NOR operation; never bundled into ordinary restore |

Rockbox's [Classic installation manual](https://github.com/Rockbox/rockbox/blob/master/manual/getting_started/ipod6g_install.tex) requires FAT32 and excludes HFS/HFS+. Choosing HFS+ must explain loss of Rockbox compatibility. Do not offer exFAT or APFS as interchangeable iPod formats.

A full-disk generic erase can remove recovery-relevant layout. Formatting and firmware installation must be planned together, with byte-based offsets and explicit conversions for each protocol's units. Do not infer an intact firmware layout merely because the music volume mounts.

“Erase” means logical deletion/reformat in the ordinary restore path. It must not promise forensic secure erasure, especially on flash adapters with wear leveling and inaccessible blocks. A physical sanitization feature is outside this initial scope.

## Proposed app and safety contract

Use one independent restoration service/helper and a standalone Zinc application, tentatively `app/ipod-recovery`. The demo launches that assistant and hands it an identity hint, never an authoritative disk path. Keep the engine agnostic. Existing `zinc:ipod` remains responsible for library operations; restore work belongs behind a separate narrow native interface. Use the same service from any future CLI instead of maintaining two restoration implementations.

Most UI and diagnostics run without elevation. A small privileged helper accepts a validated operation plan and fixed operations, not arbitrary commands or shell fragments. Pin external tool versions. Keep GPL tools in an independently distributed process with their notices/source obligations rather than linking them into the engine; confirm packaging obligations for each selected dependency before shipping.

1. **Identify.** Correlate USB topology/IORegistry identity with whole disk and partitions. Require unique matching evidence and a qualified hardware profile. Refuse the internal/boot disk and ambiguous devices. Capture all evidence before state changes. Multiple iPods require selection; never choose the first external disk.
2. **Diagnose.** Report storage capacity, host block size, partition layout, filesystem, USB mode, file metadata, current NOR identity when obtainable by the selected method, and firmware eligibility. A NOR-reading method that executes temporary device code is disclosed as such; it is not equivalent to passive disk inspection.
3. **Protect.** Preserve metadata, music when requested, layout and firmware regions as supported, plus current SysCFG/NOR where supported. Save onto another disk, hash and verify backups. Display separately what was and was not captured. No “full backup” claim for a library-only copy.
4. **Prepare.** Validate every input and available recovery route, local free space, required permissions, storage readability and power prerequisites before writes. A storage adapter may hide health telemetry; unknown health is not a clean bill of health. Hold exclusive ownership against the demo and competing apps.
5. **Review.** Present the exact target, identities, requested filesystem, chosen firmware, affected stores and backup location. Require deliberate local confirmation immediately before the first destructive step. An expert override cannot authorize writing a guessed device or unverified firmware.
6. **Execute.** Journal durable checkpoints. Observe actual USB transitions and reacquire the same physical device after re-enumeration; a new BSD number is expected. Refuse ambiguity. Stop at unexpected states. Never retry partitioning or flashing blindly after timeout, and never let progress cancellation interrupt a critical write as though it were an ordinary file download.
7. **Verify.** Check transfer status and readback wherever supported, filesystem and reported capacity, expected mounted metadata, return to the correct boot mode, and unchanged SysCFG when preservation was promised. Some signed firmware operations may not expose readback: show the verification limit and require successful boot evidence. A file copy alone is not success.
8. **Recover.** On error, retain evidence and explain the observed state, safe next step and exact compatible recovery inputs. Reconcile the device with the journal after an app crash; do not automatically resume an uncertain NOR operation. Keep host awake during a write and release every resource afterward.

The assistant reduces preventable failures; a cable disconnect, bad storage or interrupted NOR programming still prevents an absolute no-brick guarantee. The UI should distinguish “recoverable DFU state”, “firmware transfer failed”, “identity uncertain”, and “hardware not responding”.

## Technical logs

Keep two views of the same events: plain-language progress and expandable technical detail. Persist JSONL events plus raw tool stdout/stderr and a final report under a session directory on the host. Record:

- UTC and monotonic timestamps, session/operation IDs, app/helper/tool versions and plan digest.
- Evidence source and confidence; USB descriptors, topology and every re-enumeration; disk block sizes, byte ranges and the units used in protocol requests.
- Archive/image hashes, validated catalog entry, backup artifact checksums and verification results.
- State transitions, commands/CDBs, transfer lengths, actual bytes transferred, timeout, OS errors, SCSI status/sense and DFU status. Exclude passwords and authorization credentials.
- Whether an operation was attempted, acknowledged or independently verified. These are different states.
- Interruption, retry decision, final mounted state and the precise remaining recovery options.

Store raw device identifiers locally with restrictive permissions. Export a redacted support bundle by default; the user can explicitly include identifying evidence. Do not log whole NOR dumps as text or attach them automatically to public bug reports. Provide the same diagnostics on failure as on success, including paths to saved artifacts.

## Smallest useful implementation order and proof

1. Deliver passive diagnostic collection, comparison of reported identities, local support bundle and a firmware eligibility plan. No erase control yet.
2. Qualify the Mac transport on a spare Classic: signed DFU stages, device correlation and read-only SCSI access. Preserve current identity. Failure here blocks an advertised end-to-end Mac restore.
3. Prove FAT32/data-volume operations on disposable images, then full stock recovery on a dedicated Classic with known backups. Add the standalone UI and the demo launch action over this one backend.
4. Qualify HFS+ separately for the exact supported Classic profiles, then expand to older iPods and Nanos. Keep unsupported combinations visible with a reason rather than guessed recipes.

Tests should cover wrong-target rejection, two devices, disconnect/re-enumeration, changed disk identifiers, malformed images/catalogs, conflicting identity metadata, modified SysCFG, 512/4096-unit conversion, short transfers, SCSI CHECK CONDITION, power loss between checkpoints and process restart. Image fixtures prove planning and layout only; they do not prove hardware recovery. Every advertised generation/filesystem/firmware combination needs hardware evidence, including restore after an interrupted recoverable stage. Do not perform those destructive tests on the owner's working iPod.

## Changes needed in the existing Zinc detection path

`plugins/ipod/native/ipod_core.cpp` currently derives model/generation/capacity from libgpod, reads firmware first from SysInfoExtended, and correlates disk/USB identity by FireWire GUID with a single-device fallback. Its USB filter covers normal mass-storage products, not the full DFU PID range. These are suitable library-management conveniences, not restoration authorization.

The restore backend must independently enumerate DFU/WTF/recovery modes and collect provenance, block geometry and fresh physical-device correlation. Do not widen a normal library operation into a flash operation or trust the existing single-device fallback for destructive work. The existing `restoreBackup` restores library data and intentionally preserves `iPod_Control/Device`; name the new firmware restoration distinctly.

No production code, backlog tasks or device contents were changed for this analysis.

## Implementation follow-up: standalone guarded demo

The first implementation is [examples/ipod-rescue](../../examples/ipod-rescue/README.md), tracked by ZN-926. It provides actual passive Mac diagnostics (including the connected device's reported 2.0.2 / 4096-byte geometry), bounded local archive inspection, verified metadata-only copies, an explicit nine-stage recovery rehearsal with injected failures, and private technical sessions with redacted export. Its JSONL backend and lifecycle-free panel can be reused by the existing iPod app.

Physical formatting, DFU writes, firmware authentication, current NOR capture and boot verification remain unavailable. The simulator uses local firmware bytes and a JSON volume model; it does not implement a FAT/HFS formatter or validate an Apple image. Hardware capabilities cannot be unlocked by changing a request flag. The transport and real-device qualification described above remain prerequisites for actual restoration.
