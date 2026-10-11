---
id: ZN-354
title: 'Plugin starter: a repository a community author clones to publish a plugin'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-08 14:42'
updated_date: '2026-10-11 10:30'
labels:
  - plugins
  - templates
  - size-S
milestone: m-19
dependencies: []
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A plugin starter (plugin.json, a Zinc API, an optional native part, tests, README, the reusable CI of ZN-338 wired, a signing key how-to) that `zinc new plugin <dir>` also creates; it builds, tests and packages alone, outside the engine repository.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc new plugin` creates it and `zinc plugins` in a project that adds it lists it
- [ ] #2 its CI runs the 4-target matrix with the reusable workflow and produces the artifacts the index expects
- [x] #3 the README walks from new to a published, signed release
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review: everything runs on this Mac; AC 2 needs the owner's push and a real GitHub run on the four targets (steps below).

Done:
- templates/plugin/ (zinc new plugin <dir>, also zinc new --list): plugin.json (name and module zinc:<id>, version 0.1.0, "deterministic": true, permissions), index.ts (greet in Zinc, checksum through the native part), native/<id>.spec.ts + .host.cpp (FNV-1a, class in an anonymous namespace so two plugins never share one) + .sim.ts (the same in Zinc, UTF-8 included), tests/<id>.test.ts, example/main.ts, zinc.json ("pluginDirs": [".."]: the repository is its own test project), README (develop, use, publish a signed release, verified tier), .github/workflows/ci.yml (calls zinc-engine/zinc/.github/workflows/plugin.yml@main, secrets: inherit), .gitignore.
- .github/workflows/plugin.yml (workflow_call): the matrix macos-arm64 (macos-14), linux-x86_64 (ubuntu-24.04), linux-aarch64 (ubuntu-24.04-arm), linux-armhf (ubuntu-24.04, cross: armhf-linux); per leg zinc built at input zinc-ref, zinc test (not on the cross leg), next/tools/plugin-pack, artifact index-<target>. Release job on a v* tag: stops first without ZINC_PUBLISHER_SEED (::error:: with the reason) or when the tag is not v + plugin.json version, rebuilds zinc, merges the artifacts, plugin-pack --release (source archive, a .sig beside every file), gh release create.
- next/tools/plugin-pack: binaries/<target>/<name>-<key>.tar (zinc plugin-build --pack from a copy of the plugin in a project that sets none of its options, ZINC_PREBUILT=0, named by the cache key of the cache path) and plugins/<name>/<version>.json (the index-repo descriptor fields, source = git origin and commit); --release: git archive of HEAD and zinc sign of every file.
- zinc plugin-build --target <aarch64|armhf|armv7|x86_64>-linux (cross build as zinc build --target does; another target exits 2); plugin-build and update-keygen are in zinc help now; zinc new fills {{ident}} (id with _ for -, _ before a leading digit).
- Bug fixed (own commit): the frontend loader ignored zinc.json "pluginDirs" for imports (Z0119) while zinc plugins and the native build used them; the prototype resolves them (compiler/src/plugins.ts discover/modulePaths). readPlugins now reads the pluginDirs of every zinc.json on the way up, before that project's plugins/ (they shadow it, as in the prototype). Regression case in tests/t0/plugin_manifest.sh (fails on the previous binary with Z0119).
- Docs: docs/templates.md ({{ident}}, the plugin row), docs/plugins.md ("Plugin starter"), docs/guide/05-plugins.md (publishing), docs/guide/08-security.md (the starter and the workflow in the publishing steps).

Decisions (no number, worktree rule; for the coordinator's record):
- The reusable workflow did not exist (ZN-338 is Backlog): its first version is written here, as the starter cannot call nothing. ZN-338 keeps provenance (ZN-342), publication into the index under a publisher delegation, the sysroots (ZN-334) and its fixture run.
- The native module name comes from a new template variable {{ident}}: requireNative names are global (pluginForModule matches them across plugins) and become C++ identifiers, which an id with - cannot be. Score: one variable (chosen) vs two (PascalCase + lower case for the generated header name) vs a fixed name (collides between plugins).
- The repository is its own test project through "pluginDirs": [".."] (no copy, no link; a GitHub checkout puts plugin/ and zinc/ side by side): needed the loader fix above.
- Release signing with zinc sign in a release job that rebuilds zinc (one way to get zinc in every job) rather than Python signing; the binaries are not signed per leg, the release signs everything once.

Tests (this Mac, worktree build): tests/run --tier t1 --only plugin_starter PASS (5.7 s): zinc new plugin, the example and the tests on the native part and on the sim, zinc add of the repository + zinc plugins lists zinc:hello-zinc + the project runs it; the workflow's steps Tests, Pack (macOS leg), the release job's key check (stops without the secret with its ::error::), tag check (v0.2.0 refused, v0.1.0 accepted), Sign and Release (gh recorded) run as written in a runner layout; the binary name equals the cache key the project computed; the descriptor names the commit; every file verifies with zinc verify; the release archive added by URL installs as community with the publisher and the key in zinc.lock; a changed archive is refused; the README's Develop and by-hand release blocks run as written; the matrix and the call are read with PyYAML. Two mutations (seed check removed, key renamed) make it fail. Also PASS: templates, templates_kickstart, plugin_manifest, cli_core, modules, checker, templates_remote, templates_index, plugin_prebuilt, plugin_fetch, plugin_build, plugin_cli, plugin_community, plugin_sign, security_guide, affected_paths, ci_plan. actionlint 1.7.7 (release binary): 0 errors on plugin.yml and ci.yml, the call checked against the local reusable workflow (an undefined input is reported). Warning-free build. Not run (cross-platform pass): tests/t2/cross_plugin_pack.sh (plugin-pack --target armhf-linux and aarch64-linux, ELF machine of plugin.a).

Owner's steps (outward-facing):
1. Push main, so zinc-engine/zinc/.github/workflows/plugin.yml@main exists.
2. A test repository from the starter: zinc new plugin hello-zinc && cd hello-zinc && git init && git add -A && git commit -m "a plugin" && gh repo create <owner>/hello-zinc --public --source . --push; gh run watch; gh run download -D artifacts; expect artifacts/index-*/binaries/{macos,linux,armhf-linux}/hello-zinc-<key>.tar (two linux keys) and plugins/hello-zinc/0.1.0.json. Then tick AC 2.
3. A release: zinc update-keygen; gh secret set ZINC_PUBLISHER_SEED --body <seed>; add "publisher": { "name": ..., "publicKey": <public> } to plugin.json; git commit -am "publisher key" && git tag v0.1.0 && git push origin main v0.1.0; then zinc add https://github.com/<owner>/hello-zinc/releases/download/v0.1.0/hello-zinc-0.1.0.tar.gz in a project.
4. The starter as its own repository (docs/plugins.md names zinc new gh:zinc-engine/plugin-starter): gh repo create zinc-engine/plugin-starter --public; git subtree split --prefix templates/plugin -b plugin-starter; git push git@github.com:zinc-engine/plugin-starter.git plugin-starter:main.

later.md lines (for the coordinator):
- Cross-platform pass: run tests/t2/cross_plugin_pack.sh (zinc plugin-build --target armhf-linux / aarch64-linux through tools/plugin-pack) and the linux-armhf leg of .github/workflows/plugin.yml.
- plugin.yml: the linux-armhf leg runs no tests; run the plugin's tests under qemu-arm (ZINC_QEMU) or on a Pi.
- plugin.yml rebuilds zinc in every leg and in the release job (5 to 10 min each): use a zinc release package when zinc-ref is a release tag, or cache the build by commit.
- zinc-next.yml's path filters miss templates/** and .github/workflows/plugin.yml: a change there runs no CI test (plugin_starter, templates, templates_kickstart).
- zinc test in a project also runs the tests its plugins/ carry (a plugin added from the starter brings tests/ and example/): skip plugins/ as build/ is skipped?

usage: n/a
<!-- SECTION:NOTES:END -->
