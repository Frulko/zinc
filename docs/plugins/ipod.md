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
| **Snapshots** | Every save first copies the current database and covers to `iPod_Control/iTunes/Zinc Snapshots/<date>/` (the last five kept). `snapshots()` lists them, `restoreSnapshot(id)` puts one back. |
| **Backups** | `backup(dir, music)` copies the database (and the music) to a folder of your computer; `restoreBackup(folder, mountpoint)` puts it back on an iPod, after checking the space. |
| **Check and repair** | `check()` lists tracks whose file is gone and files no track uses; `repair()` fixes both. |
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
- `ZINC_IPOD_ROOTS=/some/folder` adds a folder whose subfolders `detect()` treats as mounted volumes.
- `ZINC_NATIVE=sim` (and the sim target) uses `native/ipod.sim.ts`: an iPod Classic in memory.

## Licences

libgpod is LGPL 2 (or later): it is compiled into your app, so an app you distribute must let its users relink it with
another libgpod (ship the object files, or keep the source of your app open). hashab is public domain (Unlicense).
