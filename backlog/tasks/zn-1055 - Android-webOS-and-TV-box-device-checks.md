---
id: ZN-1055
title: 'Android, webOS and TV box device checks'
status: Backlog
assignee: []
created_date: '2026-11-07 16:40'
labels:
  - cross
  - android
  - webos
  - size-M
  - parked
milestone: m-26
dependencies: []
ordinal: 102000
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Device checks for the mapper, music and sonos paths.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- Mapper on Android: `zgl_program` now writes `#extension GL_OES_EGL_image_external : require` for external textures; check it on the Toumei C800 (Mali-400) at the next install.
- A mapper follows its master on Android: the compositor's `MediaPlayer` has no rate before API 23, `seekTo` and a hold could do; and `zinc:video` seek on Android (real), iOS and webOS (decodes up to the place) never ran on a device, nor the mapper's media copy between two real machines.
- mapper: announce, pair by code and video thumbnails on the Toumei projector (Android 4.4), and on the Xiaomi box and the Chromecast.
- music-airplay: music-tree's setup page and scrobbler on a real TouchPad (`openPort` through zinc-helper, a phone reaching the page, mode 600 under `/media/cryptofs`, `zinc:qrcode` in the webOS build) and `zinc:qrcode` on Android.
- async-hot-paths: the parallel Sonos reads (7 SOAP calls at once, `update` and `readVolumes`) on the TouchPad; measured only from the Mac, one group of 3 rooms (32 to 50 ms, no failure).
- ZN-792: the device player on a real PSP, Vita, 3DS and the TouchPad over Wi-Fi; EC J-PAKE pairing time on each; iPhone signing and the local network permission prompt.
- ZN-792: the phone player on a real iPhone (signing, the local network prompt, Bonjour on Wi-Fi) and the TouchPad player (`tools/webos-player install/start`, pair, deploy hello).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mapper external-texture shader on the Toumei C800; announce, pair and thumbnails on Toumei, Xiaomi box, Chromecast
- [ ] #2 zinc:video seek and the mapper follower on Android, iOS and webOS
- [ ] #3 music-tree setup page and scrobbler on a TouchPad; zinc:qrcode on Android; parallel Sonos reads on the TouchPad
<!-- AC:END -->
