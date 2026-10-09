---
id: ZN-347
title: >-
  `zinc plugins search`, `zinc add/remove/install/update`, `zinc trust` over the
  index
status: Done
assignee: []
created_date: '2026-10-08 14:34'
updated_date: '2026-10-09 05:49'
labels:
  - distribution
  - cli
  - size-M
milestone: m-19
dependencies:
  - ZN-336
  - ZN-337
  - ZN-344
  - ZN-328
ordinal: 55380
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user-facing commands on top of the index (ZN-328 covers git and URL sources): search, add a plugin or template by name and version range, remove, install from the lock, update within ranges, trust a publisher key. Output follows the CLI conventions (quiet on success, one line per item).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 end-to-end test against a local index: search, add, install on a clean machine, update, remove
- [x] #2 `zinc help` documents each command
- [x] #3 errors name the plugin, the version and the reason (signature, policy, capability, revoked)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zinc add <name>@<range> (^, ~, >=, exact, none): the index's plugins/<name>/<version>.json (or plugins/<name>.json), official or under a verified publisher, the highest version allowed; the dependency keeps name@range, the lock the version. zinc plugins update [name...] (zinc update stays the engine's self-update): each by-name dependency moves within its range through zinc add, one line 'greet 1.1 -> 1.2', silent when current. zinc remove <name> [dir]. zinc plugins search shows the version; index-repo entries carry plugin.json's version. Errors: 'zinc add: <plugin> <version>: <reason>' (from the index, or plugin.json once fetched). Help entries for add, remove, trust, install, plugins (search, update). tuf::Client::all skips a delegated role that does not verify instead of failing the whole listing (find stays strict). tests/t1/plugin_cli.sh: search, add ^1.0 -> 1.1, clean-machine install --frozen, update -> 1.2 not 2.0 and silent after, errors for capability (1.3 camera), revocation (1.2), policy (tiers verified), signature (eve's archive) each with name, version and reason, remove. tests/run --changed 64 pass. usage: n/a
<!-- SECTION:NOTES:END -->
