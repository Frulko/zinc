---
id: ZN-876
title: 'zinc:secure-store: secrets in the system keychain (expo-secure-store API)'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 14:59'
labels:
  - desktop
  - size-S
milestone: m-28
dependencies: []
ordinal: 95
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The engine has no store for secrets: zinc:storage and AsyncStorage write plain files. A login token (examples/discord, ZN-866) must live in the system keychain. A plugin zinc:secure-store with the expo-secure-store API (getItemAsync, setItemAsync, deleteItemAsync, isAvailableAsync; module alias expo-secure-store), on the macOS Keychain (Security.framework generic passwords, service = the app id). Targets without a keychain refuse with a clear error, never a plain-file fallback; Linux libsecret and Windows Credential Manager go to the cross-platform pass.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 setItemAsync, getItemAsync and deleteItemAsync round-trip a value through the macOS Keychain on the interpreter, AOT and QuickJS
- [ ] #2 isAvailableAsync is false and the calls reject with a clear error where no keychain exists
- [ ] #3 A T0 test (with a test service name, cleaned up after) and docs/plugins/secure-store.md
<!-- AC:END -->
