---
id: ZN-856
title: >-
  zinc doc: generated, themable static documentation with plugin pages, served
  or exported
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-29 00:15'
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
- [ ] #1 A report in docs/reports/ compares the approaches and the chosen one is recorded with its score
- [ ] #2 zinc doc builds a static site from a project or the repository: the API of its modules from the code (signatures, doc comments, types, records of plugin specs), plus its Markdown and MDX pages
- [ ] #3 A plugin adds its own pages (guides, steps to follow, examples, screenshots, notes) next to its generated API, from files in the plugin folder
- [ ] #4 Pages show screenshots, tutorials with steps, commands with a copy button, code with highlighting, search; light and dark themes and a theme a project can override
- [ ] #5 zinc doc --serve serves it on a local port with reload; zinc doc --out <dir> exports it, as cargo doc does; works offline, no network at build
- [ ] #6 Built for the repository's own std and plugins in a test, with a check that the output is static and its links resolve
<!-- AC:END -->
