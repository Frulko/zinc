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
| **Tags and covers** | `add()` reads title, artist, album, album artist, composer, genre, track and disc numbers, year, duration, bitrate and the embedded cover of each file. `addWith()` overrides any of them, `artworkFile` sets another cover. |
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
| **Detection** | `detect()` lists the mounted iPods (`connection` `disk`) and those plugged in by USB but not mounted (`usb`: model, serial and firmware from the USB description). iPhones, iPads and iPod touch are not listed: they have no disk mode. |
| **Mount** | `mount(device)` mounts an iPod seen over USB but not mounted: `''` mounts every external disk whose media name says iPod (`diskutil mountDisk` on macOS), or a disk name (`disk4`, `sdb2` with `udisksctl` on Linux). It writes nothing. |
| **Eject** | `eject()` flushes and ejects (`diskutil` on macOS, `udisksctl` then `umount` on Linux) so the iPod shows "OK to disconnect". |
| **Read-only volumes** | A Mac-formatted (HFS+) iPod mounts read-only on Linux: every write is refused with that reason instead of failing halfway. |

Ids are strings (the database's 64-bit ids in hex) and stay the same across saves. Ratings are 0 to 5 stars.

## Install

The plugin compiles its vendored C sources with your app; it needs a few system libraries:

- macOS: `brew install glib libplist taglib libusb` (libxml2, SQLite and zlib come with the system)
- Debian, Ubuntu, Raspberry Pi OS: `sudo apt install libglib2.0-dev libplist-dev libtag1-dev libusb-1.0-0-dev libxml2-dev libsqlite3-dev zlib1g-dev`

With TagLib 1 (Debian 12, Raspberry Pi OS) the cover embedded in a file is not read; pass `artworkFile` instead.

## Testing without an iPod

- `tests/t0/ipod.sh` runs every operation on a fake iPod folder (a `SysInfo` file is enough for libgpod to know the model).
- `ZINC_IPOD_ROOTS=/some/folder` adds a folder whose subfolders `detect()` treats as mounted volumes; `ZINC_IPOD_NO_USB=1` skips USB;
  `ZINC_IPOD_BACKUPS=/tmp/b` keeps the backups of a test out of your home.
- `ZINC_NATIVE=sim` (and the sim target) uses `native/ipod.sim.ts`: an iPod Classic in memory.

## Licences

libgpod is LGPL 2 (or later): it is compiled into your app, so an app you distribute must let its users relink it with
another libgpod (ship the object files, or keep the source of your app open). hashab is public domain (Unlicense).
