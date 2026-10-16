---
id: ZN-747
title: 'Platform identity: platform() says ios or android, Platform.select branches'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-16 20:29'
updated_date: '2026-10-16 21:04'
labels:
  - mobile
  - ui
  - size-S
milestone: m-26
dependencies: []
ordinal: 198500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-16 (native fidelity, ../docs/reports/native-fidelity-and-plugins.md §5 step 1): on Android platform() returns linux today, so programs and the kits cannot tell a phone. zinc:platform platform() and zinc:react-native Platform.OS return ios / android / macos / linux / web / webos..., Platform.select gains ios and android branches (native for every non-web), Platform.Version is the OS version (API level on Android, iOS version), isPad / isTV set where known. The profile of the build decides at compile time; the running OS confirms at start.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a T0 test: one program prints platform(), Platform.OS and a Platform.select result, built for android, ios, macos and linux profiles
- [ ] #2 on the Nexus 7 the values are android and 25; on the iOS simulator ios and 26.x
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16: done by the session zinc-f5 (commit 640cb5fb, docs/reports/mobile-native-feel.md item 1): ZINC_PLATFORM, platform()/Platform.OS/select/Version, zn/platform.h; tests/t0/platform_identity.sh covers android, ios, the host and the interpreter (AC1). Left: AC2, the values on the Nexus 7 (expect android / 25) and the iOS simulator (ios / 26.x): one run of tests/golden/platform-identity/main.tsx exported to each.
<!-- SECTION:NOTES:END -->
