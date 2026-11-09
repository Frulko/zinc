# Zinc repository separation

Preparation dated 2026-11-09. The current source of truth remains `Frulko/zinc` on `develop`. Staging repositories contain migration documentation only, not migrated products. No source deletion or transfer is part of this preparation.

## Ownership map

| Repository under madewithzinc | Source | Responsibility |
|---|---|---|
| `zinc` (reserved for transfer) | `src/`, `include/`, `runtime/`, `lib/`, `targets/`, `boards/`, `devices/`, `firmware/`, `third_party/`, engine tools and tests | Language, runtime, standard library, hardware contracts, SDK and CLI; one coherent release |
| `ecosystem` | New coordination documents | Repository map, migration coordination and shared contribution guidance. |
| `website` | `site/` | Website, navigation and documentation publishing; consumes versioned engine docs and playground artifacts. |
| `examples` | `examples/` | Learning examples and showcases; excludes Mapper, which has its own product lifecycle. |
| `apps` | `app/` | Applications and their packaging; excludes Atelier. Engine regression fixtures stay with the engine. |
| `atelier` | `app/atelier/` | Atelier authoring application, starters and its product release lifecycle. |
| `mapper` | `examples/video/mapper/` | Projection mapping product: editor, player, assembly and baking tools. |
| `hardware` | Curated device recipes and profiles after dependency audit | Device setup, recovery, wiring and support matrix; no engine fork |
| `integrations` | `integrations/`, `packages/vite-plugin-zinc/` | Adapters for external tools, devices and editors; no compiler or runtime implementation. |
| `plugin-<name>` (created progressively) | `plugins/<name>/` | One independently buildable plugin, version and compatibility declaration |

More specific paths win: Mapper is excluded from examples; Atelier is excluded from apps. Other application pairs (hub/hub-server, sidecar/sidecar-screen, web/web-relay) stay together in apps. `app/inspector` and `app/devicesim` require a CLI coupling audit before extraction; their source remains in zinc until that audit passes. Small apps share a repository until independent ownership or release cadence warrants separation. Existing Spotify-for-Zinc and test repositories are left untouched.

Engine docs, architecture, decisions, ABI headers, conformance corpus, regression fixtures and Backlog.md remain in zinc. The website consumes a versioned documentation snapshot; it does not become the owner of language semantics. Templates stay with the CLI until template distribution is independent. Plugin SDK and reusable build workflow stay with the engine. Do not split frontend, VM, AOT and QuickJS into separate repositories.

## HAL, platform ports and physical devices

The engine owns HAL contracts (`runtime/include/hal.h`, `include/zn/`), shared implementations, OS target ports and capability schemas. Keep `targets/`, firmware runtime glue, cross-compilation/sysroot integration and generic device transports with zinc while they are built/versioned with it. Do not create a HAL repository or a fork per device. A future independently released platform SDK requires a versioned contract and standalone build proof first.

Optional implementations already behind the plugin ABI remain plugins: display-webos, webos system services, display-fbdev, display-gl and similar drivers. They follow the progressive `plugin-<name>` extraction gates. They must consume the SDK, never copy the engine or its headers. Compile-time OS ports and dynamically loaded drivers are distinct responsibilities.

`hardware` is the destination for device recipes, provisioning/recovery instructions, wiring, device-specific configuration and hardware support records. It contains no engine fork, no shared Android compatibility implementation and no personal device credentials, serial numbers or addresses. Review old lab reports before publishing them; retain original dated measurements in the engine's historical performance log and link them rather than moving or duplicating history blindly.

| Device or family | Engine / plugin responsibility | hardware responsibility |
|---|---|---|
| webOS / HP TouchPad | ARMv7 webOS target, sysroot contract, common novacom transport; display-webos and webos plugins | TouchPad preset, installation/recovery, orientation, power, device service setup, known limitations |
| Android / Nexus 7 | Shared Android target, GLES capabilities, input/audio and deployment; generic legacy compatibility | Nexus 7 model/ROM/API profile, Tegra capabilities, pogo wiring, reversible tuning and recovery |
| Android / Toumei C800 projector | Shared Android legacy support, API-level compatibility and GLES2 renderer | C800 preset, physical/logical resolution, remote inputs, installation and recovery; device control if model-specific |
| Raspberry Pi and panels | Linux target, DRM/fbdev/GL and input plugins; runtime firmware/ABI where relevant | Board/panel presets, image assembly/provisioning recipes, wiring and kiosk service configuration |

Projection surfaces, calibration, output mapping, shows and fleet playback belong to mapper. Projector hardware control must expose an adapter usable by Mapper and other apps. A generic PJLink/CEC/serial protocol, if implemented, belongs to a reusable plugin; model-specific commands belong to the device adapter. No protocol support is claimed by this plan.

A device is described by OS/API, CPU/ABI, GPU/features, display/input capabilities and a tested engine/plugin version tuple. Models select capabilities; core code does not branch on commercial device names. Keep generic simulator schemas and fixtures in zinc. Device JSON files used directly by the CLI stay there until versioned profile-pack discovery exists; hardware becomes their sole authoring location only at that cutover. Never copy all of boards/ or devices/ into a second writable catalog.

Initial extraction candidates: curated `docs/reports/hardware/` instructions and device-only scripts. Audit `tools/webos-*`, `tools/pi-*`, `boards/`, `devices/` and firmware individually: build/sysroot machinery stays engine-owned; installation and image assembly can move once they consume a pinned released SDK. In particular tools/webos-player mixes product and build concerns and must be inspected before movement. Existing C800 API19 shim notes are historical evidence: generic compatibility fixes belong in the Android target, never a permanent per-project export patch.

Track platforms and drivers in Engine & SDK (Area: Platforms & hardware), device recipes in Products & ecosystem (Area: Hardware), and their extraction in Repository migration. Device support state is explicit: planned, build-only, smoke-tested, maintained or blocked, with date, exact versions and proof command. A prepared repository does not imply tested hardware support.

## Migration order and completion gates

1. Transfer the existing repository to `madewithzinc/zinc`; never create an empty repository at that name. Preserve issues, releases, tags and history. Audit Pages/custom domains, Actions secrets, packages, installed GitHub Apps and release permissions before executing the transfer. Current organization plan is Free and current source repository is public; keep visibility unchanged during transfer.
2. Export Atelier and Mapper from a pinned, committed develop revision using fresh clones. Never export the dirty working tree. Keep a mapping of source commit, source tree, destination commit and exclusions.
3. Extract remaining apps and examples with the above exclusions. Preserve engine regression coverage in zinc; retain only small intentional feature examples there. Update affected-path test mappings and docs links before removing old paths.
4. Extract integrations, then website. Website currently reads `../docs` and its Pages workflow builds WASM and the signed plugin index: first separate those artifacts and their publishing credentials. Website consumes released WASM and docs; engine/index publishers retain signing ownership.
5. Extract plugins incrementally using `tools/plugin-split`. First prove standalone packaging against a pinned engine revision. Existing script and reusable workflow still reference `zinc-engine`; replace these references as one cutover change after the real destination exists. Generate plugins.lock at release, not from this uncommitted workspace.
6. Remove each source directory only after a clean destination checkout works, all callers/imports/packaging paths have migrated, a short bounded smoke check passes, and one source of truth is declared. Disable mirrors when ownership moves; never permit two writable canonical copies.

For a single-path extraction, use `git subtree split --prefix=<path> <pinned-commit>` in a disposable clone. Multi-path extraction or exclusions require `git filter-repo` in a disposable clone with a reviewed path list. Preserve license/NOTICE and required root metadata explicitly. Bootstrap documentation lives on develop in destination repositories: import extracted history via a reviewed migration branch and merge preserving both histories; do not force-push over the bootstrap. Tag the imported source revision. No full CI or release runs during preparation.

Product dependencies must use released Zinc SDK/toolchain versions and declared plugins. Replace `../../lib`, `../../plugins`, engine build paths and copied ABI headers with supported distribution contracts before cutover. Product-specific native plugins stay with their product unless reused independently. Engine changes discovered by products are fixed and tested in zinc.

## Work distribution

Three private organization Projects:

- Engine & SDK: compiler, engines, rendering, standard library, hardware, plugin ABI and distribution.
- Products & ecosystem: apps, Atelier, Mapper, examples, website and integrations.
- Repository migration: one item per extraction, with source revision, destination, dependency audit, proof command and cutover status.

Fields: Status (Backlog, Ready, In Progress, Review, Done), Area, Repository, Wave, Blocked by, Source task. Existing ZN identifiers remain stable. Backlog.md is authoritative until an explicit issue migration; do not duplicate its entire queue into GitHub issues. Product work transfers with its source task and backlink when its repository becomes canonical. Engine bugs remain engine tasks even when reported by an app. No new backlog task is created for this preparation.

Projects created and verified on 2026-11-09. Repository is the built-in GitHub field (populated when drafts become repository issues).

- [Engine & SDK](https://github.com/orgs/madewithzinc/projects/1)
- [Products & ecosystem](https://github.com/orgs/madewithzinc/projects/2)
- [Repository migration](https://github.com/orgs/madewithzinc/projects/3)

## Operational policy

All implementation commits land on develop; main is reserved for releases. Staging repos have develop as default and no workflow, secret, deployment, release or public publishing enabled by this preparation. Add CI only at cutover, scoped to each repository. Use a narrowly scoped GitHub App or token for cross-repository publishing; GITHUB_TOKEN is not an organization-wide credential. Configure ownership by actual maintainers before adding CODEOWNERS teams. No invented teams or broad organization permission changes.

Rollback before cutover: keep using original paths. After cutover: revert the removal commit and pin consumers to the last compatible release, stop destination changes until ownership is reconciled. Never delete destination history.

References: [GitHub transfer](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository), [history-preserving extraction](https://docs.github.com/en/get-started/using-git/splitting-a-subfolder-out-into-a-new-repository). Existing implementation: `tools/plugin-split`, `.github/workflows/plugin.yml`, `.github/workflows/pages.yml`; historical work: ZN-335 and ZN-335.01.
