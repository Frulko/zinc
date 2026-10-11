---
id: ZN-321
title: Code signing and notarization
status: Review
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-11 08:20'
labels:
  - packaging
  - security
  - size-M
milestone: m-19
dependencies: []
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
macOS: `signing` in zinc.json (Developer ID identity, team), codesign with the hardened runtime and entitlements derived from the permissions, notarytool submit and staple; Linux: an ed25519 signature next to each artifact (the update keys). Submitting to Apple needs the owner's account: the task does everything up to that step and prints the exact command.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `codesign --verify --strict` and `spctl --assess` pass on an ad-hoc and on a test identity build
- [x] #2 the entitlements follow the permission manifest (camera, network...)
- [ ] #3 Linux artifacts verify with `zinc verify`; a changed byte fails
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review (2026-10-11): everything up to Apple's step is done; the rest needs the owner's Developer ID. zinc.json "signing": { identity, keychain, notaryProfile } (or ZINC_SIGN_IDENTITY, ZINC_SIGN_KEYCHAIN): the .app of zinc export / zinc build --bundle is signed ad hoc as before or by that identity with the hardened runtime (--options runtime; --timestamp for a Developer ID), with an entitlements plist from "permissions" (camera -> device.camera, microphone -> device.audio-input, location -> personal-information.location, any net entry -> network.client, net or net:* -> network.server; src/main.cpp bundleSpecOf, src/tc/bundle.cpp). A signed macOS export prints the notarization commands (zip or the .dmg, notarytool submit --keychain-profile, stapler staple, spctl). zinc export --key <seed-hex> (or ZINC_UPDATE_SEED) writes an Ed25519 <file>.sig beside the executable and the .deb / .dmg; new command zinc verify <file> [--key <public-hex>] (zinc.json update.publicKey by default). Test tests/t1/codesign.sh (15 s): ad hoc and a test identity (self-signed code signing certificate in a temporary keychain, added to the search list for the test and restored by its trap; an untrusted identity must be named by its SHA-1, codesign does not find it by name) both pass codesign --verify --strict; the test identity's signature has the runtime flag; entitlements camera and network.client, no network.server for net:127.0.0.1; zinc verify accepts the export's signature and refuses another key and a changed byte. AC1 open: spctl --assess rejects ad hoc and self-signed apps by design; it passes only for a notarized Developer ID app. Owner: set signing.identity to the Developer ID, `xcrun notarytool store-credentials zinc-notary`, run `zinc export --target macos --dmg` and the printed commands, then `spctl --assess --type execute -vv dist/<name>-macos/<name>.app`. AC3 open on its Linux half: the .deb is signed by the same code (artifacts list), but a .deb needs a Linux cross build, left to the cross-platform pass (backlog/later.md). Tests: codesign, permissions_export, macos_bundle, installer_dmg, plugin_sign, cli_core, cli_tools, project, app_update pass. usage: n/a
<!-- SECTION:NOTES:END -->
