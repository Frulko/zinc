---
id: ZN-904
title: 'examples/discord: emoji, GIF and sticker pickers, animated GIFs and memes'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-30 23:05'
updated_date: '2026-10-31 00:20'
labels:
  - ui
  - media
  - size-M
milestone: m-28
dependencies: []
ordinal: 598460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request: an emoji picker (unicode by category with search, the servers' custom emoji, recent), a GIF picker through Discord's own GIF search endpoints, stickers, animated GIF/WebP/APNG playback in messages and embeds (Tenor/Giphy links), reactions with any emoji; decode animations only while visible and at display size.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. Pickers (components/Picker.tsx): emoji (recent, the servers' custom emoji, Unicode 15.1 groups from assets/emoji.txt written by tools/emoji.py, search by name; the smile on a row reacts), GIFs (Discord's /gifs/trending-gifs and /gifs/search, after a 400 ms pause, one request per query per session, in-flight requests shared: services/gifs.ts), stickers (the servers', Lottie left out; sent with sticker_ids). Other servers' emoji and stickers need Nitro. Animations (components/Animated.tsx): GIF attachments up to 8 MB, GIF and APNG stickers and Tenor GIFs play while on screen and the app is active, decoded at the size drawn by zinc:imageio frames() (new: ImageIO frames and delays on Apple, stb GIF elsewhere), freed when the row leaves (effect cleanup). Engine gaps fixed with tests: useEffect stores and runs the returned cleanup (before the next run and at unmount; tests/golden/react-effects in react_class.sh); a function whose return type holds undefined may end without a value or with a bare return, and a (): void lambda is accepted where () => F | undefined is expected (tests/golden/run/return_undefined.ts in t0 run). Proof: tests/run --only discord (scripted pickers() step: emoji search and insert, reaction from the picker, trending plus a search asked once, a GIF link and a sticker sent, a GIF attachment that advances frames), imageio, ui_runs, react_class, checker, diagnostics. Frames looked at: the emoji and GIF pickers (DISCORD_SHOTS). Not done: animated WebP/APNG off macOS (first frame), animated custom emoji inside text runs, Giphy links (no API without a key). t0 run fails on promise_statics.ts with the main binary too (not this task).
<!-- SECTION:NOTES:END -->
