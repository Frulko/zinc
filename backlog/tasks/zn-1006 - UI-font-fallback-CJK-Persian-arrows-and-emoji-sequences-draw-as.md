---
id: ZN-1006
title: 'UI font fallback: CJK, Persian, arrows and emoji sequences draw as "?"'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:33'
updated_date: '2026-11-08 20:15'
labels:
  - text
  - ui
  - a11y
  - size-M
milestone: m-17
dependencies: []
ordinal: 1700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The UI font has no glyph fallback: CJK text draws as "?" while Arial Unicode is a system fallback, geocoding names in Persian and similar, the arrows and triangles `▸▾↑↓` show as "?", and some emoji sequences print a stray hint glyph. Add a fallback chain by script (system fonts on the desktop, a bundled subset where there is none), an accessibility need for education users with non-Latin languages.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- text: CJK text (木, き) draws as '?' in zinc:ui while Arial Unicode is among the system fallbacks (examples/trieur flashcards, Japanese deck).
- ZN-755: some geocoding names show "?" (Persian and similar letters): the bundled Inter has no glyph for them; a fallback font.
- UI fonts: no glyph fallback, so ▾▸↑↓ show as "?" in the UI font (the inspector uses + - >> << for now).
- Text: the UI font has no ▸/▾ glyphs (drawn as "?") while ▶/▼ render: a font coverage or fallback gap.
- ZN-868: emoji maps print a stray hint glyph ('ᵉʳ') for some sequences; check the shaped text tier's fallback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a text with Japanese, Persian and `▸▾↑↓` renders real glyphs on macOS in zinc:ui (frame golden)
- [x] #2 a missing glyph falls back to the next font before showing "?"
- [x] #3 the inspector can use `▾▸` again
- [x] #4 no change in the frames of programs that use only Latin text (style-neutrality)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worktree agent).
- Research: Chromium/Skia/SkParagraph shape a run with the first font, re-shape the .notdef clusters with the next one, per grapheme cluster (UAX #29; ZWJ, VS16, tags and skin tones are Extend); CoreText CTFontCreateForString / CTFontCopyDefaultCascadeListForLanguages give the system cascade; HarfBuzz hides default-ignorables (ZWJ, VS, tags) unless HB_BUFFER_FLAG_PRESERVE_DEFAULT_IGNORABLES. macOS files: Hiragino (/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc), GeezaPro.ttc, SFArabic.ttf, Apple Symbols.ttf, Supplemental/Arial Unicode.ttf; Noto Sans Symbols 2, Noto Sans Arabic, Noto Sans CJK (OFL) on Linux. Links: https://unicode.org/reports/tr29/, https://unicode.org/reports/tr51/.
- Finding: the fallback chain already existed in the shaping tier (src/text/shaped_gfx.cpp: the embedded TTFs, then Apple Color Emoji, Apple Symbols, Arial Unicode), but the tier was opt-in (D32, zinc.json "text": "shaped"), so zinc:ui text drew '?'. ZINC_TEXT=shaped already drew Japanese, Persian, ▸▾↑↓, flags, skin tones, ZWJ and tag sequences (England flag) right on the interpreter, QuickJS and AOT.
- Change (decision for the coordinator, it revises D32's default): the tier is on wherever it is linked: zinc run on the three engines, the compiled run, and zinc build on the host when this zinc has libzn_text_gfx.a (not for ZN_AOT_CPP_ONLY: app libraries, Android export). "text": "simple" in zinc.json or ZINC_TEXT=simple keeps the tables alone; "shaped" from either still wins. Latin text keeps the codepoint tables (needs_shaping only sends a text with a character the tables lack), so its pixels do not move; fonts stay subset (wholeFonts only on an explicit "shaped"). Cost: +1.5 MB in a built program that draws (D32's number), nothing for zinc run.
- The system fallback files are mapped (mmap), not read: Arial Unicode is 23 MB and was copied into memory at the first non-Latin text. Linux list gains Noto Sans Symbols 2, Noto Sans Arabic and Noto Sans CJK paths (not proven: no Linux run, cross pass).
- Inspector: folds show ▸/▾ (were +/-), WebSocket frames ↑/↓ (were >>/<<); tests/t1/inspector.sh expectations updated (not run).
- ZN-868's stray 'ᵉʳ' glyph: not reproduced (tags, keycaps, ZWJ, skin tones all draw as one emoji); no sequence was recorded.
- Proof: tests/t0/text_fallback.sh (new, 4 s): same frame interpreter/QuickJS, not the 'simple' frame, no '?' hint, the macOS frame recorded after looking at it (tests/golden/text-fallback/frame.hash 8e9d79292a052030), and a Latin program draws the same frame with and without the tier. emoji_text passes (compiled run equals the interpreter). nuxt-ui rows gallery light, navigation dark, home light, menu light give their recorded hashes with the tier on. tests/t1/text_shaped.sh's 'plain' project now says "text": "simple".
- Not done: a bundled font for machines without system fonts (Pi OS Lite, ESP32): later.md line. Japanese text takes Arial Unicode's Han forms; a language-aware choice (Hiragino for ja, PingFang for zh) is a later.md line.
- Proposed tests: text_shaped, inspector, tests/t2/examples_pixels.sh (style neutrality over all demos), tools/style-neutrality, aot_size_inline and any size budget of built apps (+1.5 MB).
<!-- SECTION:NOTES:END -->
