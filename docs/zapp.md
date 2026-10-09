# .zapp: one file per app

`zinc pack` puts a project into one runnable file, like a LÖVE `.love`:

```sh
zinc pack                  # build/<name>.zapp from the project in the current directory
zinc pack my-game -o game.zapp
zinc run game.zapp         # checks the archive, unpacks it once into ~/.zinc/cache/zapp/, runs it
```

The archive is a POSIX ustar written deterministically (names sorted, time 0, owner 0, mode 0644): two packs of the same project are
byte-identical, and `tar tf game.zapp` lists it.

| File | What it is |
|---|---|
| `manifest.json` | `format` (1), `engine` (the zinc that made it), `name`, `files` (each file's SHA-256), `signature` (empty: the slot for signed apps) |
| `program.zbc` | the compiled program (ZBC) |
| `resources.bin` | the fonts and images baked for the program |
| `zinc.json` | the project's manifest: window size, targets, permissions |
| `assets/...` | the project's assets, read at run time (`zinc:assets`); hidden files stay out |

A program that calls a native plugin (`zinc:sqlite`, `zinc:system`...) gets it loaded at start, built from the engine's `plugins/` like
a compile would (cached in `~/.zinc`); a machine running a `.zapp` therefore needs the engine's plugin sources and a compiler for those.

`zinc run` refuses an archive whose header checksums or file SHA-256 do not match (corrupted or edited), one made by a newer zinc or in a
newer format ("update zinc"), and one naming a file outside it. Nothing of the archive runs before those checks.

## Fused executables

```sh
zinc fuse game.zapp -o game     # this engine with the archive appended: ./game runs the app, its arguments go to the app
```

The fused file needs no zinc on the machine (it unpacks the app once into `~/.zinc/cache/zapp/`); it is about 15 MB for a hello (the whole
engine, compiler included). `zinc export` stays the way to a small native build (the AOT). Fusing for another target than this machine's needs
a prebuilt player runtime per target (ZN-392).

Not yet: opening a `.zapp` by double-click needs the file type registered with the desktop (ZN-391), and signatures
are a slot only (the trust work of the plugin distribution tasks).
