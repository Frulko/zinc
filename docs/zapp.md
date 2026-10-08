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

`zinc run` refuses an archive whose header checksums or file SHA-256 do not match (corrupted or edited), one made by a newer zinc or in a
newer format ("update zinc"), and one naming a file outside it. Nothing of the archive runs before those checks.

Not yet: opening a `.zapp` by double-click needs the file type registered with the desktop (ZN-391), and signatures
are a slot only (the trust work of the plugin distribution tasks).
