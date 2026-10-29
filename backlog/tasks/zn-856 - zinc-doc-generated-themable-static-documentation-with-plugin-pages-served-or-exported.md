---
id: ZN-856
title: >-
  zinc doc: generated, themable static documentation with plugin pages, served
  or exported
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-29 00:15'
updated_date: '2026-10-29 00:52'
labels:
  - size-L
  - docs
  - tools
milestone: m-19
dependencies: []
ordinal: 564460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-29: "trouver un moyen de faire de la documentation visuellement sympa, de manière automatique mais possible ajout manuel, un peu sur le modèle de Rust ou Go: zinc permet de générer la doc, les plugins peuvent ajouter des choses en plus spécifiques à eux ou à une démarche à faire, des exemples etc. Visuellement très sympa, très tendance et themable et statique bien sûr, capable de gérer des captures d'écran, des tutos, des commandes, du md et même du mdx; le système comme Rust pour exporter ou servir un petit serveur." Research first (rustdoc, godoc/pkgsite, TypeDoc, Starlight, VitePress, Docusaurus, mdBook, Mintlify-style), score the options (RULES.md §4), record the decision, then implement end to end.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A report in docs/reports/ compares the approaches and the chosen one is recorded with its score
- [x] #2 zinc doc builds a static site from a project or the repository: the API of its modules from the code (signatures, doc comments, types, records of plugin specs), plus its Markdown and MDX pages
- [x] #3 A plugin adds its own pages (guides, steps to follow, examples, screenshots, notes) next to its generated API, from files in the plugin folder
- [x] #4 Pages show screenshots, tutorials with steps, commands with a copy button, code with highlighting, search; light and dark themes and a theme a project can override
- [x] #5 zinc doc --serve serves it on a local port with reload; zinc doc --out <dir> exports it, as cargo doc does; works offline, no network at build
- [x] #6 Built for the repository's own std and plugins in a test, with a check that the output is static and its links resolve
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-29 in a parallel worktree. zinc doc (src/doc: doc.cpp site/CLI/serve, api.cpp API from the frontend lexer, md.cpp md4c + MDX components, highlight.cpp, theme.cpp), md4c 0.6.0 vendored in third_party/md4c, guide docs/guide/14-doc.md, design and scores docs/reports/zinc-doc-design-2026-10-29.md (option C, own generator in zinc, 65/70; decision number to be given by the coordinator).

Proofs (tests/run --only doc, tests/t0/doc.sh, 5 s):
#1 docs/reports/zinc-doc-design-2026-10-29.md: rustdoc, pkgsite, TypeDoc, Starlight, VitePress, Docusaurus, mdBook, Nextra/Mintlify compared, six options scored (RULES.md 4).
#2 the fixture tests/data/doc/starfield: api/src-world.html (World.step with Parameters, STARS, doc comments, private stars and unexported hidden absent), Markdown and MDX pages rendered (steps, tabs, callouts, command, screenshot, ApiRef link).
#3 the fixture's plugin plugins/blink/docs (index.md, 01-wiring.mdx with Steps, Example + screenshot, ApiRef) beside plugins/blink/api.html (entry exports + Native interface: PinInfo record, Spec.open); the plugin alone (zinc doc plugins/blink) makes its own site; engine plugins take docs/plugins/<name>.md as overview.
#4 screenshot sized (width/height from the file), steps, command with copy (prompt not copied), highlighted ts/sh, search index with symbols, theme.css override loaded; light/dark checked in headless Chrome (docs/reports/zinc-doc/*.png).
#5 --serve --port 0 answers on a free port, 404 for missing and for paths outside the folder, version bumps and the page is rebuilt after a save; --out exports; nothing fetched (check_site.py: no http(s) script/style/image, no localhost).
#6 zinc doc --std: 256 pages, 7880 symbols, 67 plugins in 0.3 s; check_site.py --anchors: every link and anchor resolves, no MDX left, search index present.

Lines for backlog/later.md are in the agent's final report.
<!-- SECTION:NOTES:END -->
