---
id: ZN-626
title: 'Mobile text input on ios and android: keyboard, IME, avoidance'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:06'
updated_date: '2026-10-17 01:26'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-625
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The on-screen keyboard opens and closes with focus; composition text (CJK) reaches the field; the focused field scrolls above the keyboard; keyboard type hints (email, number) (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `tests/golden/ui/type.tsx` passes on the emulator and the simulator
- [x] #2 a composition script on the desktop (`ZINC_INPUT` `compose`) has a golden
- [x] #3 the keyboard never covers the focused field in rn-showcase
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (worktree agent, after zinc-f5's text input seam): proven.
- AC1: tests/golden/ui/type.tsx exported as an app. API 37 emulator: tap the field, Gboard's keys z i n c, delete, then '!': the field and the text below show 'zin!', as type-20.png (docs/reports/zinc-next-android/type-gboard.png). iPhone 17 simulator (iOS 26.3): the keyboard's keys through idb (shift off, z i n c, delete, then '!'): 'zin!' (zinc-next-ios/type-keyboard.png). Both go through the input connections (ZincEdit's commitText and deleteSurroundingText, ZincTextInput's insertText and deleteBackward). adb shell input text zinc gives 'Zin!': the injected keys pass through Gboard, which capitalises the start of a sentence field.
- AC2: tests/t1/text_touch.sh (compose script: compose n, ni, 你, commit; golden expected.txt with the frames' hashes) passes on the desktop.
- AC3: tests/t1/keyboard_avoid.sh (new): rn-showcase's sign-up form as an Android (360x808, safe area 47 0 21 0, keyboard 290) and an iOS phone (402x874, 62 0 34 0, keyboard 336): a finger on the Phone field, then the keyboard; the focused field's box, read from the screen reader's mirror (a11y 1, ZINC_DEVICE_LOG), ends above the keyboard (464..510 under 518; 484..530 under 538) and within 40 px of it. It fails on the code before (the field ends hidden, box 0) and with the old KeyboardAvoidingView (the field 97 px above the keyboard). On the emulator and the simulator the phone pad opens with the field 8 px above it (rn-showcase-keyboard.png in both report folders).
- Fixes the runs showed: (1) the focused field was revealed before KeyboardAvoidingView's padding was laid out, then scrolled out of the shrunk area: zinc:ui reveals it again after each layout while the keyboard is up (lib/std/ui.ts), with 8 px of room. (2) KeyboardAvoidingView padded by the keyboard's whole height (a tab bar below it counted twice): it pads by the part of its own box the keyboard covers, as React Native's. (3) Android: the window panned (adjustPan, SDL's default) as well: ZincActivity sets adjustResize from API 35, where an edge-to-edge window only gets the IME's insets. (4) iOS: a field losing the focus left the keyboard up (SDL's StopTextInput resigns SDL's own text field, not ZincTextInput): zinc:ui sends keyboard-traits with nothing and the glue resigns its view.
- Not proven here: a Japanese or Chinese IME's composition on a phone, swipe typing, dictation, a password manager (cross-platform pass); Android below API 35 keeps adjustPan (later.md line).
<!-- SECTION:NOTES:END -->
