---
id: ZN-859
title: Document CarPlay themes and manage paired devices in player
status: Done
assignee: []
created_date: '2026-10-29 14:41'
updated_date: '2026-10-29 14:41'
labels: []
dependencies: []
documentation:
  - docs/plugins/carplay-themes.md
modified_files:
  - examples/carplay/src/components/DevicesPanel.tsx
  - plugins/carplay/backend/usb/server/PairingManagement.kt
type: feature
ordinal: 561460
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Theme guide explains customization, creation limits, and proposed styles
- [x] #2 Player shows live receiver, connected iPhone, and paired identifiers
- [x] #3 Player can forget one exact pairing with confirmation and resume wireless invitations
- [x] #4 Focused backend and player checks pass
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a theme guide, live status and pairing management in the Zinc player. Verified Kotlin server tests, Zinc check, CarPlay demo test, and live Pi status including iPhone name, model, and battery. The destructive unpair action was validated with a fake store, not on the user's paired iPhone.
<!-- SECTION:FINAL_SUMMARY:END -->
