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
| `integrations` | `integrations/`, `packages/vite-plugin-zinc/` | Adapters for external tools, devices and editors; no compiler or runtime implementation. |
| `plugin-<name>` (created progressively) | `plugins/<name>/` | One independently buildable plugin, version and compatibility declaration |

More specific paths win: Mapper is excluded from examples; Atelier is excluded from apps. Other application pairs (hub/hub-server, sidecar/sidecar-screen, web/web-relay) stay together in apps. `app/inspector` and `app/devicesim` require a CLI coupling audit before extraction; their source remains in zinc until that audit passes. Small apps share a repository until independent ownership or release cadence warrants separation. Existing Spotify-for-Zinc and test repositories are left untouched.

Engine docs, architecture, decisions, ABI headers, conformance corpus, regression fixtures and Backlog.md remain in zinc. The website consumes a versioned documentation snapshot; it does not become the owner of language semantics. Templates stay with the CLI until template distribution is independent. Plugin SDK and reusable build workflow stay with the engine. Do not split frontend, VM, AOT and QuickJS into separate repositories.

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

Prepare three organization Projects, all private initially:

- Engine & SDK: compiler, engines, rendering, standard library, hardware, plugin ABI and distribution.
- Products & ecosystem: apps, Atelier, Mapper, examples, website and integrations.
- Repository migration: one item per extraction, with source revision, destination, dependency audit, proof command and cutover status.

Fields: Status (Backlog, Ready, In Progress, Review, Done), Area, Repository, Wave, Blocked by, Source task. Existing ZN identifiers remain stable. Backlog.md is authoritative until an explicit issue migration; do not duplicate its entire queue into GitHub issues. Product work transfers with its source task and backlink when its repository becomes canonical. Engine bugs remain engine tasks even when reported by an app. No new backlog task is created for this preparation.

The active gh token lacks read:project/project. Project creation is not performed. Owner authentication command: `gh auth refresh -s project`. Then use `gh project create --owner madewithzinc --title '<title above>'`; record URLs in this document and set fields before importing items. Do not describe documentation as existing GitHub Projects.

## Operational policy

All implementation commits land on develop; main is reserved for releases. Staging repos have develop as default and no workflow, secret, deployment, release or public publishing enabled by this preparation. Add CI only at cutover, scoped to each repository. Use a narrowly scoped GitHub App or token for cross-repository publishing; GITHUB_TOKEN is not an organization-wide credential. Configure ownership by actual maintainers before adding CODEOWNERS teams. No invented teams or broad organization permission changes.

Rollback before cutover: keep using original paths. After cutover: revert the removal commit and pin consumers to the last compatible release, stop destination changes until ownership is reconciled. Never delete destination history.

References: [GitHub transfer](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository), [history-preserving extraction](https://docs.github.com/en/get-started/using-git/splitting-a-subfolder-out-into-a-new-repository). Existing implementation: `tools/plugin-split`, `.github/workflows/plugin.yml`, `.github/workflows/pages.yml`; historical work: ZN-335 and ZN-335.01.
