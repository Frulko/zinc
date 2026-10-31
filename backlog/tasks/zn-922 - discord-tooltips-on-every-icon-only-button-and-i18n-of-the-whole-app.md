---
id: ZN-922
title: 'discord: tooltips on every icon-only button and i18n of the whole app'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 09:31'
updated_date: '2026-10-31 09:32'
labels:
  - discord
  - ui
dependencies: []
ordinal: 616460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: every button that has only an icon needs a tooltip, everywhere, and everything translated (i18n everywhere). zinc:ui/kit already has Tooltip and lib/std/i18n.ts a Catalog; Discord uses neither.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every icon-only button in examples/discord has a Tooltip (kit) with its translated label, also reachable by keyboard focus, and an aria-label
- [x] #2 Every user-visible string of examples/discord goes through the i18n catalog (en as the source, fr complete, language picked from the system and changeable in settings), including plurals, dates and error messages
- [x] #3 A test that fails when a visible string or an icon-only button has no catalog entry or tooltip
- [x] #4 Slack theme checked on a frame with DISCORD_THEME=slack (aubergine sidebar visible)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Kit: `Tooltip` shows on keyboard focus (new `ui.onFocusWithin`), hides on press; `attachTooltip` (lib/std/kit/tooltip.ts) for imperative nodes; `ImageViewer` and `CallStats` take a `labels` map. Test: kit_tooltip (hover delay, press hide, Tab, stays in window).
Buttons with a Tooltip: guild rail pills (right); side pane unpin / open as channel / close; call controls (mute, deafen, camera, share screen, stop watching, disconnect) and the quality bars; picker close / GIFs / Stickers / Emoji; code insert (code, paste, copy, close editor); message actions, cancel reply/edit, send files, pins; user bar (DM call, disconnect, safe mode, mute, deafen, settings, log out); Settings close; image viewer (zoom out/in, copy, save, close, previous, next).
i18n: i18n/{en,fr}/discord.json (~470 keys), examples/discord/src/i18n.ts (tr, trn, language row in Settings > Appearance, saved). Dates, relative times, sizes are catalog patterns (en, fr only; de/es/it fall back to English). Content of Discord untouched. Test discord_i18n: tools/discord-i18n-check (visible string, literal attribute, icon-only button without Tooltip, missing key; negative fixture) plus fr/en Tab walk, language switch, frame hashes.
Slack: frame with DISCORD_THEME=slack shows the aubergine rail, sidebar and member list; Appearance lists the Slack themes. Choosing it by click was not run separately.
Tests: discord, discord_code, discord_safety, discord_viewer, discord_login, discord_i18n, kit_tooltip pass; i18n-check 0 errors (12 fr _many warnings); the i18n_test binary was not built here.
<!-- SECTION:NOTES:END -->
