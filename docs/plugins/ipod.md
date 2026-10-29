# zinc:ipod — classic iPods

Manage the music of a classic iPod (Classic, Nano 1G to 7G, Mini, Video, Shuffle) from a Zinc app: find it, read and
change its tracks, playlists and covers, and keep it safe. Built on [libgpod](https://github.com/gerion0/libgpod)
(the database format every Linux player uses), vendored in the plugin with
[hashab](https://github.com/DigiDNA/hashab) for the Nano 6G/7G checksum, TagLib for the tags of the files you add and
libusb for the iPod's description file. Targets: macOS, Linux, Raspberry Pi.

```ts
import * as ipod from 'zinc:ipod';

const [pod] = await ipod.detect();                 // mounted iPods
if (!pod) throw new Error('plug in an iPod (disk mode)');
await ipod.open(pod.mountpoint);                   // pod.hasDatabase false? ipod.open(mp, true, '', 'My iPod') creates one
ipod.onProgress((phase, done, total, file) => console.log(phase, done, '/', total, file));
const results = await ipod.add(['/Music/a.mp3', '/Music/b.m4a'], 'Road trip');
for (const r of results) if (r.error !== '') console.log(r.file, r.error);
for (const t of await ipod.tracks()) console.log(t.artist, '-', t.title, t.artwork ? '(cover)' : '');
await ipod.eject(pod.mountpoint);
```

## What it does for you

| | |
|---|---|
| **SysInfoExtended** | `open()` writes `iPod_Control/Device/SysInfoExtended` when it is missing (after a restore or a format): read from the iPod over USB when it is plugged in, else built from `SysInfo`, the model table and the USB serial (the FireWire GUID the checksums need). The built file carries libgpod's artwork formats for the model, so covers keep working. |
| **Tags and covers** | `add()` reads title, artist, album, album artist, composer, genre, track and disc numbers, year, duration, bitrate and the embedded cover of each file. `addWith()` overrides any of them, `artworkFile` sets another cover; `update()` changes them later (see Editing tags). |
| **Formats** | MP3, AAC/M4A, ALAC, WAV, AIFF, M4B audiobooks, MP4/M4V/MOV video. Anything else (FLAC, OGG...) is refused with a message that says to convert it. |
| **Space** | A batch is refused before anything is copied when it does not fit, keeping 64 MB free for the database and covers. |
| **Transfers** | Each file is copied in 1 MB blocks with progress, then `fsync`: a pulled cable never leaves the database pointing at half a file. |
| **Restore points** | Before the first change of a session (and before any restore), the database and covers are copied to the computer, in `~/.zinc/ipod/<serial>/<date>/` (`ZINC_IPOD_BACKUPS` or `ZINC_HOME` move it; the last ten automatic ones are kept). `snapshots()` lists them, `restoreSnapshot(id)` puts one back. Nothing is written on the iPod for them. |
| **Backups** | `backup(dir, music)` copies the database to `dir/<serial>/<date>/` (`''`: the place above) and, with `music`, the music into `dir/<serial>/Music`, which the backups share: only new files are copied, and files unchanged since the previous backup are hard links, so a second backup of 700 MB of covers costs nothing. `backups(dir)` lists them; `restoreBackup(folder, mountpoint)` puts one back, copying only the music the iPod lacks, after checking the space. `deleteBackup(folder)` deletes one, and refuses any folder that is not a backup inside that place (the shared Music folder is kept). |
| **Download** | `download(ids, dir)` copies tracks from the iPod to `dir` as `Artist/Album/NN Title.ext` (album artist first; `D-NN` on a multi-disc album; names made safe for any disk), skipping a file of the same size already there; one result per track (`file`, `skipped`, `error`), progress in the phases `copy` and `download`. It only reads the iPod. |
| **Specs** | `specs()`: every detail of the open iPod as groups of name and value: model, capacity, serial, FireWire GUID, firmware, storage by kind of media, library counts, playing time, the cover sizes it stores, and every key of SysInfoExtended. |
| **Photos** | `photoAlbums()` lists the photo albums (the master one, "Photo Library", holds every photo); `photo(id, size)` gives a photo in RGBA pixels at about `size` on its long side, `photoImage(id, size)` as an image. They are read from the screen sizes the iPod stores (RGB), not its TV-out size, which iTunes stores as interlaced YUV. |
| **Notes and files** | `extras()` lists the notes, contacts, calendars and voice recordings kept beside the music (`Notes`, `Contacts`, `Calendars`, `Recordings`), with their path to read or play them. |
| **Covers** | `artwork(id, size)` gives a track's cover in RGBA pixels; `cover(id, size)` makes it a runtime image for `<Image image={...} />`. |
| **Check and repair** | `check()` lists tracks whose file is gone and files no track uses; `repair()` fixes both. |
| **Duplicates** | `analyze(fingerprints)` finds the songs that are there twice or more: by their tags (the same normalised title and artist, the same album or one without, lengths within 2 s), by identical files (the same size, then the same XXH3 hash) and by their sound (a Chromaprint fingerprint of the first 30 s, decoded by AudioToolbox on macOS; on Linux there is no decoder yet, so only tags and files match). Each group (`DuplicateGroup`) says why it matched (`reasons`), lists its copies with the one to keep first and what the score sees of each (`quality`), why the first wins (`keepWhy`) and the bytes freed. The score compares, in order: lossless, bitrate (within 5% is a tie), sample rate, tags filled, a cover, track and disc numbers, a year, the copy added first. The same analysis lists the music without a cover or with missing tags, `check()`'s findings and the empty playlists. It only reads the iPod; file hashes and fingerprints are cached on the computer (`<backups>/<serial>/hashes.txt` and `fingerprints.txt`, by track, size and file time), so the next analysis reads and decodes only what changed. Progress: phases `read`, `hash`, `fingerprint`, `group` and `check`, each step's detail naming the file and what was found. |
| **Merge** | `merge([{ keep, remove }])` gives each kept track the text tags, numbers, year and cover it lacks from the copies, sums their play and skip counts, keeps the higher rating, the last played and the first added date, moves their playlist places to it, then removes the copies with their files (a file the kept track also uses is kept) and saves once, after the session's restore point. One `MergeResult` per group; a group with an unknown or repeated track is left alone with its `error`. |
| **Play counts** | `played([{ id, count, at }])` counts plays heard away from the iPod (on the computer, a speaker, a Subsonic client) as the iPod counts its own: each track's play count goes up by `count` and its last played becomes `at` (Unix seconds) when later. Tracks no longer there are skipped; one save at the end, after the session's restore point; resolves with the tracks counted. |
| **Detection** | `detect()` lists the mounted iPods (`connection` `disk`) and those plugged in by USB but not mounted (`usb`: found in the system's USB list, IORegistry on macOS and sysfs on Linux, without opening the device, so a scan sends nothing to an iPod, mounted, being ejected or ejected; its model, serial and firmware are those its disk gave while mounted in this session, else the model is just "iPod"). iPhones, iPads and iPod touch are not listed: they have no disk mode. |
| **Mount** | `mount(device)` mounts an iPod seen over USB but not mounted: `''` mounts every external disk whose media name says iPod (`diskutil mountDisk` on macOS), or a disk name (`disk4`, `sdb2` with `udisksctl` on Linux). An iPod ejected on macOS keeps no disk ("OK to disconnect"): `mount('')` then resets it on USB, as plugging it in again does, and mounts the disk it offers. It writes nothing. |
| **Eject** | `eject()` flushes and ejects (`diskutil` on macOS, `udisksctl` then `umount` on Linux) so the iPod shows "OK to disconnect". |
| **Read-only volumes** | A Mac-formatted (HFS+) iPod mounts read-only on Linux: every write is refused with that reason instead of failing halfway. |

Ids are strings (the database's 64-bit ids in hex) and stay the same across saves. Ratings are 0 to 5 stars.
Each `Track` also carries `bpm` (0 when unknown; `update(id, { file: '', bpm: 124 })` sets it), `skipCount` and `lastSkipped` (the
skips the iPod counted, Unix seconds).

## Editing tags (Get Info)

`update(id, fields)` writes the fields given and keeps the others; `''`, `0` and `false` are written too, so a field can be cleared:

```ts
await ipod.update(id, { file: '', comment: '', rating: 0, grouping: 'Live', compilation: true });   // file is ignored by update
for (const other of ids) await ipod.update(other, { file: '', genre: 'Jazz' });                    // a selection: one save at the end
await ipod.save();
```

Besides title, artist, album, album artist, genre, composer, comment, track and disc numbers and counts, year, rating, BPM, media
kind and `artworkFile`, a `Track` has and `update` writes what iTunes' Get Info shows: `grouping`, `description`, `compilation`, the
sort names (`sortTitle`, `sortArtist`, `sortAlbum`, `sortAlbumArtist`, `sortComposer`: the iPod sorts by them when set), `startMs` and
`stopMs` (where the song starts and stops; 0 = its end), `volume` (-100 to 100 percent), `skipWhenShuffling`, `rememberPosition`,
`lyrics` (the flag that tells the iPod the file has lyrics: the text itself is in the file's tags, which `writeLyrics` writes)
and `playCount` (`0` is iTunes' Reset Plays). Read only: `kind` (the file type, "MPEG audio file") and `modified` (Unix seconds, set
by every `update`). `add` and `addWith` take the same fields; given, they win over the file's tags.

`writeLyrics(id, text)` writes the lyrics into the song's file on the iPod (TagLib's LYRICS: an ID3v2 USLT frame in MP3, WAV and AIFF, the
MP4 lyrics atom in M4A and M4B; `''` removes them), sets the lyrics flag and the file's new size; `save()` writes the database, and the
iPod then shows them on the Now Playing screen. `readLyrics(id)` reads them back (`''` when the file has none). A file kind TagLib keeps
no lyrics in is refused with its reason.

## Smart playlists

The classic iPods (everything with an iTunesDB: Classic, Video, Mini, Nano 1G to 5G, Shuffle) keep smart playlists: rules, a limit and
the songs they selected. The iPod plays the song list written at the last save; it is the computer that evaluates the rules, as iTunes
did. The plugin does it with libgpod's evaluator:

```ts
const id = await ipod.createSmartPlaylist('Tempo', {
  match: 'all',
  rules: [{ field: 'bpm', action: 'inRange', value: 120, value2: 130, units: '', text: '' },
          { field: 'lastPlayed', action: 'notInTheLast', value: 2, value2: 0, units: 'weeks', text: '' }],
  limit: { type: 'songs', value: 25, sort: 'mostRecentlyAdded' },
  liveUpdate: true, checkedOnly: false, refreshable: true,
});
await ipod.save();
for (const p of await ipod.playlists()) if (p.smart) console.log(p.name, ipod.describeSmart(p.rules, await ipod.playlists()), p.trackIds.length);
```

- `playlists()` gives each smart playlist's `rules` (`SmartRules`: `match` all or any, `rules`, `limit` {type, value, sort}, `liveUpdate`,
  `checkedOnly`, `refreshable`). `createSmartPlaylist(name, rules)` makes one and fills it, `setSmartRules(id, rules)` replaces its rules
  and refills it; `save()` writes them. `setPlaylistTracks` refuses a smart playlist (its rules fill it).
- **Refills.** Every save (yours, and those of `add`, `remove`, `played`, `merge`, `repair`) first refills the playlists marked live
  updating, from the play counts, ratings and tags as they are then. `refreshSmartPlaylists()` refills all of them, live or not, and
  saves: call it when an iPod is connected after being played on its own.
- **Rules the plugin cannot evaluate** (a field of a newer iTunes, such as album rating or "loved") read back with the field or action
  as its number in hex (`"0x5a"`) and `refreshable: false`: the playlist keeps the songs iTunes chose, its rules are kept byte for byte
  at every save, and they cannot be written by `setSmartRules`.
- **Nano 6G and 7G** keep their library in SQLite, which holds no smart playlists: `createSmartPlaylist` and `setSmartRules` are refused
  with "this iPod keeps no smart playlists; save it as a normal playlist". Do what it says: `createPlaylist` + `setPlaylistTracks` with
  the ids `evaluateSmart` gives.
- **Preview without writing.** `evaluateSmart(rules, tracks, playlists, now)` (TypeScript, every engine and the sim stand-in) gives the
  ids the playlist would hold, with libgpod's semantics: text compared without case, and a song without the tag matches no text rule
  (not even "is not"); ranges in either order; "in the last" counted from `now` (Unix seconds, 0 = the current time); with a limit, a
  stable sort then songs taken while the total stays within it (a song that would pass it is skipped, the next ones are still tried).
  It knows the fields `Track` has, `playlist`, and `videoKind` (from `Track.mediaType`: `MEDIA_TYPES[i]` is the bit `MEDIA_BITS[i]`); a
  rule on grouping, kind, tvShow, season, compilation or modified never matches in the preview (the native side evaluates them). `checkedOnly` is ignored there (`Track` does not say whether a song is
  checked); a random limit shuffles. `describeSmart(rules)` says the rules in one line.

| field | kind | value | actions |
|---|---|---|---|
| `title`, `album`, `artist`, `albumArtist`, `composer`, `genre`, `comment`, `grouping`, `kind` (file type), `tvShow` | text | `text` | `is`, `isNot`, `contains`, `doesNotContain`, `startsWith`, `doesNotStartWith`, `endsWith`, `doesNotEndWith` |
| `bitrate` (kbps), `sampleRate` (Hz), `year`, `trackNr`, `cdNr`, `size` (bytes), `durationMs`, `playCount`, `skipCount`, `rating` (stars), `bpm`, `season` | number | `value` (and `value2`) | `is`, `isNot`, `greaterThan`, `lessThan`, `inRange`, `notInRange` |
| `added`, `modified`, `lastPlayed`, `lastSkipped` | date | `value` Unix seconds (and `value2`); "in the last": `value` a count and `units` minutes, hours, days, weeks, months or years | `is`, `isNot`, `greaterThan` (after), `notGreaterThan`, `lessThan` (before), `notLessThan`, `inRange`, `notInRange`, `inTheLast`, `notInTheLast` |
| `compilation` | yes/no | none | `is` (is set), `isNot` |
| `playlist` | playlist | `text`: the playlist's id | `is` (in it), `isNot` |
| `videoKind` ("Media Kind") | media bits: audio 1, video 2, podcast 4, audiobook 8, musicvideo 0x20, tvshow 0x40 | `value` | `is` (any bit in common), `isNot` |

Limit `type`: `none`, `songs`, `minutes`, `hours`, `MB`, `GB`. Limit `sort`: `random`, `title`, `album`, `artist`, `genre`,
`mostRecentlyAdded`, `leastRecentlyAdded`, `mostOftenPlayed`, `leastOftenPlayed`, `mostRecentlyPlayed`, `leastRecentlyPlayed`,
`highestRating`, `lowestRating`.

## Install

The plugin compiles its vendored C sources with your app; it needs a few system libraries:

- macOS: `brew install glib libplist taglib libusb` (libxml2, SQLite and zlib come with the system)
- Debian, Ubuntu, Raspberry Pi OS: `sudo apt install libglib2.0-dev libplist-dev libtag1-dev libusb-1.0-0-dev libxml2-dev libsqlite3-dev zlib1g-dev`

With TagLib 1 (Debian 12, Raspberry Pi OS) the cover embedded in a file is not read; pass `artworkFile` instead.

## Testing without an iPod

- `tests/t0/ipod.sh` runs every operation on a fake iPod folder (a `SysInfo` file is enough for libgpod to know the model), smart
  playlists included; `tests/t1/ipod_plugin.sh` checks `evaluateSmart` against libgpod on a table of rules on every engine.
- `ZINC_IPOD_ROOTS=/some/folder` makes `detect()` look only in that folder, its subfolders taken as mounted volumes (a real iPod plugged in is not read); `ZINC_IPOD_NO_USB=1` skips USB;
  `ZINC_IPOD_BACKUPS=/tmp/b` keeps the backups of a test out of your home.
- `ZINC_NATIVE=sim` (and the sim target) uses `native/ipod.sim.ts`: an iPod Classic in memory.

## Licences

libgpod is LGPL 2 (or later): it is compiled into your app, so an app you distribute must let its users relink it with
another libgpod (ship the object files, or keep the source of your app open). hashab is public domain (Unlicense). Chromaprint
1.6.0 is MIT, with KissFFT (BSD-3-Clause); its LGPL resampler from FFmpeg is left out (the platform decoder resamples).
