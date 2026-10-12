---
id: ZN-736
title: 'Atelier: a project card for an app with a zinc.json'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-12 16:30'
labels:
  - app
  - ui
  - size-M
milestone: m-10
dependencies: []
ordinal: 496410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-10-12): when the sketch opened in Atelier is a real app (its folder has a zinc.json), Atelier should say so and offer a small card with the project's information and the means to manage it. Today the header shows the folder's name only, zinc.json has no tab and nothing tells a one-file sketch from a project with an identity, permissions, targets, assets and plugins.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The header tells a project from a plain sketch (the app's name and version from zinc.json, its icon when it has one) and opens the project card; a plain sketch offers to become a project (a zinc.json written with its name and entry)
- [ ] #2 The card shows what zinc.json says, read through the engine's own parser or a command of the CLI: name, app id and version, icon, entry, the targets with their sizes, the permissions with one line on what each allows, the plugins the code imports, the assets folder and its size, what the project requires
- [ ] #3 From the card: edit the name, the version, the window size and the permissions (zinc.json rewritten without losing its other keys or its layout more than needed, and checked again), open zinc.json as a tab, show the folder in the Finder, build the app for this machine with its progress in the console
- [ ] #4 A scripted session opens a project, reads the card, changes one permission and finds it in zinc.json; one golden of the card, light
<!-- AC:END -->
