---
id: ZN-1018
title: 'React, Vue and Svelte: first-class integration with polished demos'
status: Backlog
assignee: []
created_date: '2026-11-07 16:35'
labels:
  - ui
  - frameworks
  - size-L
milestone: m-17
dependencies: []
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-11-07): React, Svelte and Vue as first-class ways to write a Zinc app, with a clean integration and polished demos. Not a priority: it queues after the Mac list, before the cross-platform pass. Too big for one session: split it when it starts (`New-task: split ZN-n`), one framework per subtask plus one per demo.

## Where it stands

- React: `zinc:ui/react` (function components, hooks, reconciliation, D-12/UI-04), the react-native preset that maps `react` and `react-native` imports (src/frontend/jsx.cpp, ZN-367.05), Fast Refresh (D124), the demos rn-showcase, rn-port, rn-tester. A plain `import React from 'react'` outside the preset is refused (src/frontend/modules.cpp, "diag.detail.react").
- Solid: `zinc:ui/solid` (fine-grained signals), the closest model to Vue's reactivity and Svelte 5's runes.
- Svelte and Vue: nothing yet.

## What to build

1. **React**: `import { useState } from 'react'` and `react-dom`-free JSX work in any project (not only the react-native preset), with the hooks people use (state, effect, memo, ref, context, reducer, transition where it makes sense), `key`, fragments, portals to a NativeView or an overlay. Decide (decision record, RULES §4) between the typed `zinc:ui/react` and the official React with `react-reconciler` and a host config over zinc:ui nodes on QuickJS (the React Native and react-three-fiber way); the typed route keeps AOT speed, the official one runs npm components as they are: possibly both, chosen per project.
2. **Vue 3**: single-file components (`.vue`: `<script setup lang="ts">`, `<template>`, scoped `<style>` mapped to the style system), compiled at build time by Vue's own compiler (`@vue/compiler-sfc`, vendored or through the pinned toolchain), run on a custom renderer (`createRenderer` of `@vue/runtime-core`, as NativeScript-Vue and TroisJS do) whose nodes are zinc:ui nodes; reactivity (`ref`, `computed`, `watch`) native or Vue's own, chosen by measure. Vapor mode as a later lead.
3. **Svelte 5**: `.svelte` files with runes (`$state`, `$derived`, `$effect`, props, snippets), compiled by Svelte's own compiler; Svelte has no custom-renderer API, so compare a minimal DOM over zinc:ui nodes (the svelte-native / dominative way) with a Zinc target for the compiler's output, and record the choice.
4. **Tooling for all three**: `zinc new --template react|vue|svelte`, `zinc dev` with hot reload that keeps state, `zinc check` and the LSP on the files (`.vue`, `.svelte` diagnostics through the frameworks' language tools where they exist), clear errors when a browser-only API is used (`document`, `window`), docs pages (`docs/react.md`, `docs/vue.md`, `docs/svelte.md`) and a line in the guide.
5. **Polished demos**, one per framework, following `examples/GUIDELINES.md`, the same small app written three ways so they compare (for instance a notes or a music-library app: list, detail, edit, search, animations, keyboard, dark mode), plus one showing each framework's strength (React: a component library in use; Vue: transitions and forms; Svelte: animations and stores). Each at 60 fps on the Mac and idle when nothing moves.

## Research to start with

How React Native, react-three-fiber and Ink write React renderers; NativeScript-Vue, Vue's `createRenderer`, Lynx and Vue Vapor; Svelte Native, Svelte's compiler output and the `dominative` DOM shims; what Tauri and Capacitor templates offer for the three. Measure the cost of each runtime on QuickJS against the typed route.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a decision record scores, for each framework, the official runtime on QuickJS with a renderer over zinc:ui nodes against a typed Zinc route, and states the choice
- [ ] #2 react imports work in any project with the common hooks, context, fragments and portals, on the interpreter, AOT and QuickJS as the decision says
- [ ] #3 .vue single-file components (script setup with TypeScript, template, scoped style) and .svelte components with runes compile and run, with hot reload that keeps state
- [ ] #4 zinc new has react, vue and svelte templates; zinc check and the LSP report errors in .vue and .svelte files; using document or window gives a clear diagnostic
- [ ] #5 three demos in examples/ write the same app in React, Vue and Svelte, plus one per framework showing its strength, each following examples/GUIDELINES.md, 60 fps on the Mac and idle when nothing moves
- [ ] #6 docs/react.md, docs/vue.md and docs/svelte.md explain how to start, what is supported and what is not; CHANGELOG.md has the lines
<!-- AC:END -->
