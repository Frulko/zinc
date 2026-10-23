---
id: ZN-786
title: Fix intermittent release gates for compatibility and notifications
status: Done
assignee: []
created_date: '2026-10-23 15:20'
updated_date: '2026-10-23 15:26'
labels:
  - bug
  - ci
  - size-M
dependencies: []
ordinal: 522460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Compatibility fetch/startup failures preserve actionable diagnostics and transient downloads do not erase the regression gate.
- [x] #2 Per the owner's revised scope, skip the unresolved relay integration gate explicitly in CI while preserving local integration and CI unit/capture checks.
- [x] #3 Relevant native checks pass and the remaining publication/image steps are recorded.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
In Progress. Later tag run39958820169 (v0.6.3 at e1161467) failed compat and notify_relay; release blocked. Compat original diagnostic filtered out; traced rerun 2749 cases/two engines/zero regressions, so fetch failure only inferred. Preserve all failing output + original rc. Relay original+trace delivers4/5 notifications then no secondnews; ten distinct fixture UUIDs; no proven blocking call. Native notify_relay PASS, also with the exact macOS binary from that failing run. New notify_capture PASS: real SQLite/WAL and binary plists across batches, history skipped, same dates delivered once, identity image and clock correction retained. Add bounded native stack sampling of fixture relay/receiver before cleanup, retaining sampling errors too; no TLS change on unproven ticket-spin hypothesis (PSK server sends no tickets). release_gate_diagnostics PASS with fake node/sample commands, status preservation, valid-PID and denied-sampling checks; ci_plan PASS. No real relay touched. Report: docs/reports/ci-pre-release-2026-10-23.md. Owner requests local targeted checks first, CI later; no unchanged Pi/UI checks repeated. No push/dispatch/publication performed. Final release/image remain pending. When the owner chooses the CI step: git push origin develop; gh workflow run zinc-next --ref develop; inspect captured stacks if relay stalls.
<!-- SECTION:NOTES:END -->

Owner scope change: "on désactive le relay, plus simple". Disable only the hosted integration gate with exit 77 under ZINC_CI, preserve the app and local integration, retain unit/capture checks in CI. The unresolved stall is documented in TESTING.md and the report. The native release_gate_diagnostics check covers the skip. Closed on the owner's revised scope; no root-cause fix claimed and no push/CI/publication performed.
