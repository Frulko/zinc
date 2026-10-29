---
id: ZN-857
title: 'iPod demo: Optimise page, find and merge duplicate tracks'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-29 06:38'
updated_date: '2026-10-29 07:13'
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
- [x] #1 zinc:ipod finds duplicate groups from tags (normalised title, artist, album, duration within 2 s), identical files (size and content hash) and an audio fingerprint (Chromaprint, vendored with licence and pin), each group with why it matched
- [x] #2 Each group names the copy to keep by a documented score (lossless, bitrate, sample rate, tags filled, artwork, track and disc numbers, year), the owner can change it
- [x] #3 Merging keeps the best tags and artwork, sums play counts, keeps the higher rating and last played, moves the removed copies' playlist places to the kept one, then removes the others and their files, after a restore point and only with Allow changes on
- [x] #4 The Optimise page shows the analysis (duplicates, tracks without artwork or tags, orphan files, empty playlists) with a preview and per-group checkboxes, and every merge is a job of Transfers with its lines and a Logs entry
- [x] #5 Tested on the simulated iPod and a disk image (native test and ipod_demo frames); never on the owner's iPod
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design (resumed from an earlier agent's uncommitted native work; finished the core, wrote the sim, the demo page and the tests).

Native (plugins/ipod/native): ipod_optimise.cpp holds the plain functions (normaliseTag: NFKD, marks dropped, lowercase alnum; compareCopies, the keep score; quality; groupDuplicates: union-find over tags, file and audio links). ipod_fingerprint.cpp: AudioToolbox ExtAudioFile decodes the first 30 s straight to 11025 Hz mono 16-bit (so Chromaprint's FFmpeg resampler, LGPL, is not needed), Chromaprint 1.6.0 raw fingerprint, similarity = best bit agreement within +-18 values (~2 s), same audio at >= 0.8 (measured: the same melody as WAV/AAC 64/MP3 96 ~1.0, different melodies 0.61-0.64). Only tracks of the same media type with a duration within 5 s of another are fingerprinted. Linux: no decoder yet, analyze() matches by tags and files only (documented). Identical files: XXH3-128 over files whose size another file shares. Cache: <backups>/<serial>/fingerprints.txt, key 'dbid size mtime', '-' for no fingerprint; rewritten only when something was decoded or a track left. Library::analyze also returns noArtwork, missingTags (music), check()'s missing/orphans, empty non-smart playlists. Library::merge: writable() first (the session restore point), fillFrom (text tags, numbers, year, cover through the largest stored thumbnail), play and skip counts summed, max rating, latest time_played, earliest time_added, playlist places moved (index kept), dropTrack (shared with remove/repair) keeps a file the kept track also uses, one save.

Keep score (ipod.spec.ts DuplicateGroup): lossless > bitrate (5% tie) > sample rate > tags filled (6 text tags) > cover > track/disc numbers > year > added first; the owner can keep another copy (MergeGroup.keep).

Sim: analyze groups by normalised tags and by the source file added; merge does the same bookkeeping; no fingerprints.

Demo: src/optimise.ts (analysis tied to the open iPod, DuplicateRow with ticked/keep signals, analyse() and mergeTicked() as Transfers jobs, merge behind allowed() and a confirm), pages/optimise/OptimisePage.tsx, sidebar row under Manage after Backups. main.tsx's content column got basis-0 (a long text line made the page wider than the window: Yoga semantics, grow without basis-0 takes the content's width, not an engine gap) and GRID_COLUMNS 4 (five albums ran past the 1180 px window).

Proof: tests/t0/ipod.sh (score, normalisation, grouping by tags+file+audio over WAV/AAC/MP3, cache hit, fingerprints off, merge with cover/counts/rating/last played/playlist place/restore point/bad group, two database entries for one file keep the file) 'ipod core: ok'; tests/t1/ipod_plugin.sh ok (interpreter, QuickJS, AOT); tests/t1/ipod_demo.sh ok with the golden updated (frames 570 Optimise analysed, 600 after the merge, 650 the merge job's lines), log lines Analyse/Merge checked.
<!-- SECTION:NOTES:END -->
