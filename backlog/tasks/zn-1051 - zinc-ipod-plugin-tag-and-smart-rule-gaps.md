---
id: ZN-1051
title: 'zinc:ipod plugin: tag and smart-rule gaps'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:40'
labels:
  - ipod
  - plugin
  - size-M
  - demo
milestone: m-9
dependencies: []
ordinal: 18700
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native plugin loses data or logs assertions for some iPods and playlists.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- zinc:ipod: ensureSysInfoExtended built from SysInfo never writes the SQLiteDB key; a Nano 5G-7G set up that way would get a plain iTunesDB and lose its SQLite database. Write the key for those generations.
- zinc:ipod: libgpod logs g_utf8_casefold assertions when a text smart rule meets a track without that tag; patch the vendored itdb_splr_eval.
- iPod Genius batch B: setSmartRules cannot write back a rule it has no name for (album rating, loved); the editor keeps those playlists read-only or keeps the raw rule.
- zinc:ipod: expose Track.checked, grouping and compilation so smart previews cover those fields.
- zinc:ipod: Track lacks file kind, grouping, compilation and modified, so smart previews and the editor skip those fields.
- zinc:ipod: the smart preview maps mediaType to a single libgpod bit; a track with several media bits could differ from libgpod.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SQLiteDB key written by ensureSysInfoExtended for Nano 5G-7G
- [ ] #2 libgpod g_utf8_casefold assertion fixed in the vendored itdb_splr_eval
- [ ] #3 Track exposes checked, grouping, compilation, file kind, modified; smart preview maps every media bit
- [ ] #4 setSmartRules keeps or round-trips a rule it has no name for; a test per fix
<!-- AC:END -->
