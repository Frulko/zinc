---
id: ZN-316
title: Templates from a git URL or a local path
status: Done
assignee: []
created_date: '2026-10-08 14:19'
updated_date: '2026-10-08 23:19'
labels:
  - templates
  - cli
  - security
  - size-S
milestone: m-19
dependencies:
  - ZN-315
ordinal: 55010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc new <git-url|gh:user/repo[@ref]|path> <dir>`: the template is fetched (pinned commit recorded in the new zinc.json), its template.json validated; creating a project never runs code from the template.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a local path and a file:// git repository work in the test (no network)
- [x] #2 the commit is recorded; a template.json with unknown keys or files outside the template is refused
- [x] #3 no script of the template runs (test with a hostile template)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: zinc new <path|git-url|gh:user/repo[@ref]> <dir>. A directory is used as it is; git (https, ssh, git@, file://, gh:) is cloned with fork/exec (no shell), core.hooksPath=/dev/null, no submodules, @ref checked out detached; the source and the commit are recorded in the new zinc.json ("template" key, known to the project parser). template.json may only hold name, description, tags, targets, entry, variables; a link or special file in the template is refused; .git is never copied. Test tests/t0/templates_remote.sh (no network): local path, file:// repo with the commit recorded, a git work tree as a directory, unknown key and link refused, a hostile template (post-checkout hook, smudge filter in its repo config, setup.sh, npm postinstall) leaves no marker. templates, cli_core, project pass; tests/run --changed 45/45. usage: n/a
<!-- SECTION:NOTES:END -->
