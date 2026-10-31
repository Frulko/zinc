---
id: ZN-926
title: Build standalone iPod recovery demo with guarded restore workflow
status: Done
assignee: []
created_date: '2026-10-31 13:19'
labels:
  - ui
  - ipod
  - size-L
dependencies: []
ordinal: 620460
---

## Description

Owner request: build a separate iPod rescue demo, keeping future integration into the existing iPod app possible. This first guarded demo implements real passive Mac diagnostics, local archive inspection and metadata backup, plus a fully explicit recovery rehearsal. It does not enable unqualified physical formatting or firmware writes.

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Standalone Zinc demo provides live read-only Mac diagnostics and exportable technical sessions
- [x] #2 Reusable backend validates firmware archives and models identity-preserving FAT32 and HFS+ recovery with injected failures
- [x] #3 Unqualified destructive hardware operations are refused and covered by regression tests
- [x] #4 Document app integration and remaining hardware qualification
<!-- AC:END -->

## Implementation Notes

- Added `examples/ipod-rescue`: native French UI, a standalone JSONL Python service, passive real Mac diagnostics, bounded ZIP/IPSW inspection, no-follow metadata backup/readback, immutable current-identity planning and private support sessions. The existing iPod app remains untouched; `RescuePanel` has no import-time lifecycle side effects and can be embedded.
- The explicit simulator exercises nine recovery stages, converted 2.0.2 / 4096-byte and stock 1.1.2 / 512-byte devices, FAT32/HFS+ volume models, and five failure injections. Filesystem formats are models, not real formatted filesystems. No formatter, DFU sender or raw-device flasher exists in this version.
- Real erase/firmware operations remain blocked pending a qualified macOS USB/SCSI transport, authenticated compatible images, NOR protection and actual boot verification. Full hardware restoration is not delivered by this guarded demo. These prerequisites remain in the research report; no unrelated task created.
- Independent safety review caught and fixed output ancestor symlinks/case/custom mountpoints, export overwriting a failure, valid plist binary values, and stale selections after failed refresh. Regression coverage is included.

## Verification

- `build/zinc check examples/ipod-rescue`: 7 project files and imports, no errors.
- `tests/run --tier demo --only ipod_rescue`: PASS, 19 behavioral/security cases.
- `tests/run --only ipod_rescue_ui`: PASS, real Python/process exchange on interpreter, QuickJS and AOT; matching completed-rehearsal pixels, failure golden, idle paint p50/p99 zero. Timing is normalized only in displayed test logs.
- Reviewed both new UI captures by eye; one finite background-window run completed successfully. No helper process left running.
- Live read-only scan identified the connected device's declared xC297 / 2.0.2, FAT32, 4096-byte blocks, with explicit identity-provenance warnings. No real backup, erase, format, DFU transition or flash was performed.

## Handover

Run `build/zinc run examples/ipod-rescue`, or prefix `IPOD_RESCUE_MODE=simulation` for a hardware-free demonstration. Source-demo requirements and integration lifecycle are in its README. Packaged Python/helper distribution and physical restoration qualification remain future work; do not unlock them through the UI.
