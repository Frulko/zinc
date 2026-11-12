---
id: ZN-1053
title: 'Discord client: layout and message polish at real window sizes'
status: Backlog
assignee: []
created_date: '2026-11-07 16:40'
labels:
  - discord
  - ui
  - size-M
milestone: m-28
dependencies: []
ordinal: 17600
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Visible gaps of examples/discord on a Mac window: narrow widths, lists, avatars, pins, thread composer, share dialog.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-867: the Discord client acks without checking whether its window has the focus; ack only when the channel is visible in a focused window, as the web client does.
- ZN-867: Discord lists (`- item`) stay plain text in the client; draw bullets.
- ZN-868: the Discord client's CDN picture map never evicts; cap it (LRU) for long sessions.
- ZN-868: the default avatar index needs the 64-bit shift (`(id >> 22) % 6`); check it against big ids.
- ZN-868: the member list ignores the list id of GUILD_MEMBER_LIST_UPDATE; verify op 37 against the real gateway.
- ZN-903: load newer pages when a history left after a jump far back is scrolled to its end, instead of only Jump to present.
- ZN-903: a composer in the thread pane (today the arrow opens the thread as the channel, to write).
- ZN-903: my roles changed during the session (GUILD_MEMBER_UPDATE for me) do not update the pin permission until the next start.
- ZN-911: the share dialog could update its thumbnails in place when the sources are the same, instead of rebuilding the list every 1.5 s (cheaper on modest machines).
- ZN-911: the safe mode shield of the user bar is icon-only; a tooltip or a small label would help first-time users.
- ZN-913: the share dialog's Settings button is a text label and the screen card icon a drawn rectangle: use real gear and monitor icons; Discord's HD banner also has Get Nitro and heart buttons.
- ZN-915: the real minimum window size (`zinc.json` `minWidth`) and widths below 640 px are unverified; CallView and Settings were not reviewed at narrow widths.
- ZN-?: Discord at 320 px: the composer should fold some buttons into a menu (the placeholder reads "Message #"), the Go Live dialog needs a smaller list on short windows (footer pushed off a 700 px window), the image viewer hides its caption.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 At 320 px the composer folds buttons into a menu and the Go Live dialog fits a 700 px window; minWidth verified
- [ ] #2 Markdown lists draw bullets; the member list reads its list id; the picture map is capped (LRU); acks only when the channel is visible and focused
- [ ] #3 Thread pane has a composer; newer pages load when a jump-back history is scrolled to its end; pin permission follows GUILD_MEMBER_UPDATE
- [x] #4 Share dialog uses real gear and monitor icons and updates thumbnails in place; the shield has a tooltip
<!-- AC:END -->


## Implementation Notes

### AC4 share-picker glyphs (2026-11-12)

- Reused `zinc:icons` lazy `Icon` canvases for the literal Lucide `monitor` and `settings` names, with current kit `themeColor` roles. Kept Settings text, button role, accessible “Resolution and frame rate” name and keyboard action. No public picker/provider contract, thumbnail ownership, constructor/close path or native lifecycle changed.
- The same-source refresh already updates `this.thumbs` image handles without rebuilding cards/list; retained it. The existing safe-mode shield in `examples/discord/src/components/ChannelList.tsx` already uses `Tooltip` and the same translated safe-on/off/until aria-label; source-audited it without a Discord/account/network run.
- Delegated research: [Lucide monitor](https://lucide.dev/icons/monitor), [Lucide settings](https://lucide.dev/icons/settings); shipped glyphs use the existing vendored Lucide data. Need → provider → gap: two glyphs → existing icons + kit themeColor → two picker drawing sites, no wrapper/dependency/palette.
- `zinc check plugins/screen-capture/picker.ts` and representative `examples/discord/src/call.ts` pass. Both used approved candidate CLI SHA256 `1c561fc5809fe7876897f73d6a424bb422c5d8960aff738cf57561d4b1725e4e`. The checks automatically built existing screen-capture, camera and microphone providers; all build output retained. Camera/microphone were imported by the authorized caller check but exceeded its initially narrower native-build allowance; coordinator informed. No capture/open/device/network API ran.
- Final proof imports the actual production picker, with native fake sources only (`ZINC_FAKE_SCREEN=1`, eight fake windows), interpreter, deterministic/headless/background + realtime, 126 frames / about 2.1 seconds (indicative, not a performance measurement). Frozen candidate `.worktrees/1124-1125-boundaries/.logs/candidate-final/zinc` verified above hash. One normal 1500ms refresh changes thumbnail image `1048579 → 1048596` while preserving node `21`, serial `22`, list identity and scroll `150`. Literal icon reachability, both glyph canvases, meaningful labels, Enter opening quality settings on the next frame, cancel and resolved null all pass. Frame120 screenshot inspected with dialog/settings visible, before cancel124.
- Evidence in worker `.logs/picker1053/`: `check-03/picker.log`, `caller-check-04/caller.log`, `smoke-07/run.log`, `smoke-07/picker-120.png`, complete source/fixture/import/config snapshots and provider/compiler manifests. Earlier smoke05 wrongly treated `ui.find` as a text handle; smoke06 wrongly asserted synchronous keyDown handling. Authentic failure logs and fixtures retained; only fixture corrected. Smoke06 launched before the binary-freeze message and the build-path CLI changed before its post-run hash: do not use that run for stable compiler provenance. Final smoke07 uses the frozen CLI.
- AC4 checked; AC1/2/3 remain open and this task stays Backlog. Expanded dialog footer clipping at 700px remains AC1, visible in the screenshot. The screen-capture audit's native stale-slot/race/open-timeout issues are outside glyph scope and remain unfixed. No AOT/QuickJS/full Discord/real capture or cross-platform runtime claim; no suite, T1/T2, demo test, pixel comparison or benchmark run. No new lifecycle or committed app test introduced.

Session usage: `usage: n/a`.

### Proposed tests

- Owner-selected existing `tests/run --only screen_picker`: full repeated-refresh/scroll/search/share session, roughly 6 seconds runtime plus compile, memory unmeasured. Not run here.
- Owner-selected offline Discord safe-mode hover/focus and dark/light share-picker interaction: verify current translated tooltip and theme glyphs, bounded 10 seconds plus compile, memory unmeasured; no account/network or real capture needed.
