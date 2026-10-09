---
id: ZN-352
title: 'GitHub organization zinc-engine: repository layout and setup script'
status: Done
assignee: []
created_date: '2026-10-08 14:42'
updated_date: '2026-10-09 06:01'
labels:
  - distribution
  - ci
  - size-S
milestone: m-19
dependencies:
  - ZN-335
ordinal: 55400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D37 (owner, 2026-10-08). tools/gh-org-setup creates, in the organization zinc-engine, the repositories: zinc (the engine), plugin-<name> per official plugin (mirrors of plugins/<name> pushed by ZN-335's split), index (signed index, ZN-336), plugin-starter (ZN-354) and templates. Settings: branch protection, the release secrets' names, the reusable plugin workflow. Creating the organization and running the script against GitHub are the owner's steps: the script has --dry-run, prints every gh command, and the task records them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `tools/gh-org-setup --dry-run` lists every repository and setting it would create, with the gh commands
- [x] #2 running it twice changes nothing the second time (idempotent, checked against a fake gh in the test)
- [x] #3 docs/guide/07-distribution.md says which repository holds what
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
tools/gh-org-setup [--dry-run] [--org]: creates zinc, index, templates, plugin-starter and plugin-<name> per committed plugin (gh repo create, only when gh repo view fails), protects zinc's main (gh api PUT with tools/gh-org-protection.json: PR review, the zinc-next checks, no force push; only when the GET fails), lists the CI secrets not set (never writes values); --dry-run runs no gh and prints every command, quoted for pasting. tests/t1/gh_org_setup.sh with a stateful fake gh: dry run lists all repositories, the protection and the secrets and calls nothing; the first run creates all; the second creates nothing. 07-distribution: 'The zinc-engine organization' (which repository holds what, the owner's steps). Creating the organization and running the script are the owner's steps. The reusable plugin workflow is ZN-338. usage: n/a
<!-- SECTION:NOTES:END -->
