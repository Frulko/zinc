---
id: ZN-706
title: 'Web environment: DOMParser on a vendored XML parser'
status: Done
assignee: []
created_date: '2026-10-10 22:50'
updated_date: '2026-11-09 06:07'
labels:
  - js
  - qjs
  - size-S
milestone: m-22
dependencies: []
ordinal: 13400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) Libraries parse SVG and XML (bitmap fonts, tile maps) with DOMParser. Vendor a mature parser (@xmldom/xmldom, MIT) rather than write one, loaded at the first use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a bitmap font XML and an SVG parse to the nodes a browser gives (golden)
- [x] #2 nothing is loaded when DOMParser is not used
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent). @xmldom/xmldom 0.9.12 vendored unmodified in third_party/xmldom (lib/*.js, LICENSE, PIN with the tarball's sha256 and the registry's dist record; README row; tools/package copies it to share/zinc/third_party). lib/std/webenv.js: DOMParser and XMLSerializer are shells; the first parse reads the eight CommonJS files through native.xmldom (src/qjs/webenv.cpp, the engine's own file next to lib/std, not the host's file row so the program's permissions do not apply to it), runs them under a small require, and adds what a browser's XML document has: element traversal getters, querySelector/All, matches, closest (the simple selector matcher now tests attributes and the local name, so it serves both trees). The document drops the XML declaration PI and the blanks around the root, as browsers do; a well-formedness error gives a <parsererror> document (Firefox's shape), a wrong type a TypeError. Load: 9 to 10 ms on the M1 Pro (ZINC_WEB=trace prints it).
Proof: tests/t0/webenv_domparser.sh (PASS): a BMFont XML and an SVG dumped node by node equal headless Chrome's DOMParser output (golden written through tools/cdp.py); the same file matches Chrome on --engine jsc, hermes and v8 too; ZINC_WEB=trace shows no load for a program that parses nothing, one load at the first parse. tests/run --only webenv and webenv_touch PASS.
Known difference: XMLSerializer writes a namespace declaration it adds after the attributes (Chrome: first); the golden compares the reparsed attributes.
Research (sonnet sub-agent): xmldom is the only small parser with a ready W3C DOM (https://www.npmjs.com/package/@xmldom/xmldom, https://github.com/xmldom/xmldom); fast-xml-parser and txml give JS trees, saxes/sax are SAX only. Errors go to onError (ParseError on fatalError), browsers give a parsererror document instead.
Proposed tests: none beyond the T0 (seconds). A T1 that loads a Phaser bitmap font (load.bitmapFont) and a Pixi 7 BitmapFont XML through Assets.load would prove the libraries' loaders end to end (about 10 s, 200 MB).
<!-- SECTION:NOTES:END -->
