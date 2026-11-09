---
id: ZN-704
title: Styles panel edits work in the real Chrome DevTools frontend
status: Done
assignee: []
created_date: '2026-10-10 22:24'
updated_date: '2026-11-09 05:37'
labels:
  - devtools
  - ui
  - size-S
milestone: m-20
dependencies: []
ordinal: 11800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-369: element.style and the box model were checked with a scripted CDP client (scripts/cdp-check.mjs --styles), not with the DevTools frontend itself, which may ask for more (CSS.enable events, styleSheetAdded for the inline sheet ids, rule origins without a styleSheetId, computed-style tracking). Load devtools://devtools/bundled/inspector.html?ws=127.0.0.1:<port>/zinc in headless Chrome (tools/cdp.py drives it) against tests/data/devtools_styles, select a box, edit padding-left in the box model and a colour in element.style through the frontend's own UI, and check the app's frame and the console patch; fix what the frontend needs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 an edit made through the DevTools frontend's box model changes the app's frame (scripted headless Chrome)
- [x] #2 the Styles pane shows the class and StyleSheet rules without a frontend error
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-11-09). Chrome 157's own inspector.html in headless Chrome against tests/data/devtools_styles (a dev run), its WebSocket watched through Chrome's Network domain (every method and error logged). What it needed on top of the scripted client: Network.emulateNetworkConditionsByRule must return ruleIds and Page.getNavigationHistory an entry (both threw in the frontend: sdk.js and the screencast panel), DOM.pushNodesByBackendIdsToFrontend answered [0] for an empty list (now the list as it came), and a shorthand in a rule (border-radius, gap, border-width, border-color) showed its longhands with empty values: the frontend unfolds a shorthand from CSSProperty.longhandProperties and makes empty ones without it, so props() now sends them. Not needed: CSS.styleSheetAdded for the inline ids (setStyleTexts on inline:<node> works without a header; the rules without a styleSheetId show read-only as intended), computed-style tracking answered empty. Proof: tests/devtools_frontend_check.py styles <port> (20 checks, about 10 s): rows of Elements clicked on their tag names and unfolded with ArrowRight, the class rule .p-2.bg-rose-600.rounded with its declarations and no empty value, the Computed tab's box model shows padding-left 8, a double click and typing 20 then Enter sends CSS.setStyleTexts padding-left: 20px, the box model reads 20 back, the console patch pl-[20px], the app's frame (Page.captureScreenshot over the frontend's own connection) changes; a click on element.style's closing brace, background-color Tab #10b981 Enter sends both declarations, the patch bg-[#10b981], the frame changes again; the StyleSheet box shows style={StyleSheet} with background-color #2563eb and its radius longhands; no error reply, no frontend exception or console warning. tests/t1/devtools_frontend_styles.sh wraps it; scripts/cdp-check.mjs --styles still passes. One trap of the frontend itself: after Enter on a new declaration it opens the next one's prompt, which steals the next selection in Elements (Escape first). Research: https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json and browser_protocol.json (CSSProperty.longhandProperties), Chromium's ui_devtools protocol as a non-browser CSS target (https://chromium.googlesource.com/chromium/src/+/2b7c19d3/components/ui_devtools/protocol.json), NativeScript's CSS agent (https://cdn.jsdelivr.net/npm/@akylas/nativescript@8.9.15/debugger/webinspector-css.d.ts). usage: n/a
<!-- SECTION:NOTES:END -->
