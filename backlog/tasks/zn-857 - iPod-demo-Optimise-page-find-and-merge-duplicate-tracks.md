---
id: ZN-857
title: 'iPod demo: Optimise page, find and merge duplicate tracks'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-29 06:38'
labels:
  - ipod
  - demo
  - size-L
milestone: m-25
dependencies: []
ordinal: 565460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-29: a new Optimisation section that analyses the iPod, consolidates the library, finds duplicates and removes them keeping the most complete and best copy, based on tags, file and an audio fingerprint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc:ipod finds duplicate groups from tags (normalised title, artist, album, duration within 2 s), identical files (size and content hash) and an audio fingerprint (Chromaprint, vendored with licence and pin), each group with why it matched
- [ ] #2 Each group names the copy to keep by a documented score (lossless, bitrate, sample rate, tags filled, artwork, track and disc numbers, year), the owner can change it
- [ ] #3 Merging keeps the best tags and artwork, sums play counts, keeps the higher rating and last played, moves the removed copies' playlist places to the kept one, then removes the others and their files, after a restore point and only with Allow changes on
- [ ] #4 The Optimise page shows the analysis (duplicates, tracks without artwork or tags, orphan files, empty playlists) with a preview and per-group checkboxes, and every merge is a job of Transfers with its lines and a Logs entry
- [ ] #5 Tested on the simulated iPod and a disk image (native test and ipod_demo frames); never on the owner's iPod
<!-- AC:END -->
