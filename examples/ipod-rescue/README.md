# iPod Rescue — recovery workshop

A standalone native Zinc demo, in French, for investigating an iPod and rehearsing recovery. Its reusable backend and embeddable UI are independent of the music manager.

**This version cannot erase or flash a physical iPod.** The Mac USB/SCSI restoration transport, firmware authentication and model-specific layouts are not qualified. The UI and backend both enforce this limit. A completed rehearsal is not evidence of hardware restoration.

## Run

Requires the development Mac, Zinc and Python 3.9 or newer in `PATH`. No additional Python packages, network services or administrator rights are needed.

```sh
build/zinc run examples/ipod-rescue
# Rehearse without reading the connected iPods:
IPOD_RESCUE_MODE=simulation build/zinc run examples/ipod-rescue
```

When running headless or inside the test runner, set `ZINC_NATIVE=real` to use the actual process and system plugins. The helper still refuses physical writes. Use `ZINC_BACKGROUND=1` for agent-started visible runs.

- **Appareils réels:** passive macOS `diskutil` / IORegistry diagnostics, mounted identity and declared firmware, partition scheme, capacity and logical block size. DFU/recovery USB entries appear even without a mounted library. Reported identity is never equated to original hardware. Ambiguous disks are not automatically selected.
- **Sauvegarder les métadonnées:** copy and SHA-256 readback of available SysInfo files and library database. A root `syscfg` file, if present, is copied as an unverified file. This excludes music, artwork, partition table, disk firmware and live NOR. It is **not** a complete recovery backup. The target is re-enumerated before/after; changed or incomplete copies retain an `INCOMPLETE` marker.
- **Inspecter un fichier IPSW:** inspect a local ZIP/IPSW, check its entries/CRC and SHA-256 without extracting or executing it. Reject traversal, duplicates, symlinks, encrypted entries and excessive sizes/expansion. This does **not** verify Apple signatures or establish compatibility. No automatic download or installation.
- **Établir le plan:** preserve current identity, keep the reported version as the candidate and display missing prerequisites. FAT32 and HFS+ are separate choices; HFS+ excludes Rockbox and requires its own hardware qualification.
- **Simulation:** two fictitious Classics (converted 2.0.2 / 4096-byte blocks and stock 1.1.2 / 512-byte blocks). Rehearse nine stages using local files, with byte-for-byte identity preservation and firmware readback. FAT/HFS volumes are explicitly JSON models, not real formatted filesystems. Inject disconnect, wrong target, incompatible firmware, short write or SCSI rejection; none is reported as success.
- **Journal:** UTC/monotonic timestamps, operation IDs, helper/Python/OS versions, stage status and technical transfer/error details. Full local JSONL remains available. Export creates a ZIP with identifying metadata and backups excluded, and preserves the outcome of the preceding operation.

Cmd+R refreshes, Cmd+P creates a plan, Cmd+Enter asks to rehearse. Native buttons also work with Tab and keyboard activation; views scroll with mouse/trackpad/touch. Switch modes explicitly: real devices never become simulation targets. The simulator neither needs nor contacts a physical iPod.

Sessions are private host folders under `~/.zinc/ipod-rescue/session-*`. `IPOD_RESCUE_OUTPUT` changes the parent for tests. Canonical paths under `/Volumes` (case-insensitive) and output ancestors outside the home filesystem are refused before directory creation, including through ancestor symlinks. Raw evidence and backups remain private in that folder; the support ZIP omits them. Do not publish the entire folder without reviewing it.

## The same backend without the UI

The helper is a persistent JSONL service: one JSON object per stdin line, typed events/results on stdout. It accepts only `scan`, `inspect`, `plan`, `backup`, `rehearse`, `export`. There is no raw device or shell-command escape hatch.

```sh
python3 -u examples/ipod-rescue/backend/rescue.py <<'JSONL'
{"command":"scan","mode":"simulation"}
{"command":"plan","deviceId":"sim-converted","filesystem":"FAT32"}
{"command":"rehearse","deviceId":"sim-converted","filesystem":"FAT32","confirmation":"SIMULER","fault":"short-write"}
{"command":"export"}
JSONL
```

For real diagnostics, send `{"command":"scan","mode":"hardware"}`. Use a device ID from that service's current result for subsequent requests; never invent a BSD path. Keep stdin open to retain the same session and selection. Exit closes the service. The helper uses no elevated privileges and never invokes a device formatter, DFU writer or flasher.

## Integration with the iPod app

`src/pages/RescuePanel.tsx` exports `RescuePanel` with no import-time process side effects. `src/state.ts` exports `initialize()` and `shutdown()`; the standalone entry owns their lifecycle. A future iPod page can mount the panel inside its own root and call these functions on entry/exit, or launch this independent app.

The Python service knows nothing about the UI or `zinc:ipod`; another host can consume its protocol. `IPOD_RESCUE_BACKEND` supplies an absolute helper path when the caller is outside this source tree. For a packaged app, bundle Python/the helper or replace it with the qualified native service; the current source demo does not pretend to be a self-contained installer. No UI or engine changes in the existing music app are required now.

Do not hand an existing library handle or a remembered `/dev/diskN` to a future destructive service. Re-identify the physical device, close competing library owners, validate inputs, protect current NOR identity and ask for the exact destructive plan immediately before writing. A future backend must add independently tested capabilities; removing a disabled button or changing a JSON flag cannot enable hardware writes here.

## Layout and verification

- `src/main.tsx`: lifecycle and keyboard shortcuts.
- `src/state.ts`, `models.ts`: typed UI state and protocol decoding.
- `src/services/backend.ts`: streamed child process, path discovery and cleanup.
- `src/components`, `src/pages`: native Zinc views and controls.
- `backend/host.py`: passive Mac evidence, no-follow source reading, bounded archive inspection.
- `backend/model.py`: planning, immutable identity policy and simulation fixtures.
- `backend/session.py`: private host artifacts, verified metadata copy, explicit simulation and support export.
- `backend/rescue.py`: shared protocol and operation boundary.

```sh
build/zinc check examples/ipod-rescue
tests/run --tier demo --only ipod_rescue
tests/run --tier t1 --only ipod_rescue_ui
```

The UI test waits for the real Python/process exchange to finish before starting its headless frame budget; it normalizes displayed timing only. It never enumerates or modifies real USB devices. The behavior test covers identity preservation, both simulated formats, injected failures, command rejection, archive attacks, symlink rejection, bounded metadata backup and redacted failure export. Real firmware restoration and actual FAT32/HFS+ formatting remain untested and unavailable.

Research, sources and the qualification plan: [restoration assistant report](../../docs/reports/ipod-restore-assistant-2026-10-31.md).
