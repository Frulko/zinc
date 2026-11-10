# .zapp: one file per app

`zinc pack` puts a project into one runnable file, like a LÖVE `.love`:

```sh
zinc pack                  # build/<name>.zapp from the project in the current directory
zinc pack my-game -o game.zapp
zinc run game.zapp         # checks the archive, unpacks it once into ~/.zinc/cache/zapp/, runs it
zinc pack my-game --sources --cover picture.png -o shared.zapp
zinc unpack shared.zapp --out my-copy  # a new editable folder; never overwrites one
```

In Atelier, **Share → Pack** asks where to save a `.zapp`, captures the first frame as its cover, and includes the sketch's sources.
**Open shared sketch** (also in File) opens a fresh copy in the sketchbook; `zinc run app/atelier -- shared.zapp` opens it too.
The cover is the existing `icon.png` archive member. The original project and its icon are unchanged.
A command-line share uses `--sources` and optionally `--cover picture.png`. Ordinary packs keep their existing contents.
Editable copies refuse archives over 64 MiB and verify all hashes and paths before writing. Source sharing refuses symbolic links,
more than 4,096 source files, a source file over 8 MiB, more than 32 MiB of sources, or the reserved root name `manifest.json`. Archives without sources still run; they cannot be edited.

**Copy link** puts the source files in a `/play/#files-json/…` URL fragment, without an upload or an account. Anyone with the URL can read
and edit the sources. Links are limited to 8,192 URL characters; assets and native plugins travel in the `.zapp` instead. The playground
keeps reading its existing compressed `#files/…` links. Atelier accepts its own source links as a startup argument or in the Open Sketch
prompt when desktop dialogs are unavailable. Every import creates a new copy.

The archive is a POSIX ustar written deterministically (names sorted, time 0, owner 0, mode 0644): two packs of the same project are
byte-identical, and `tar tf game.zapp` lists it.

| File | What it is |
|---|---|
| `manifest.json` | `format` (1), `engine` (the zinc that made it, for information), `needs` (`{"zbc": 8, "rt": 412}`: what the program needs of the engine, below), `name`, `files` (each file's SHA-256), `signature` (empty: the slot for signed apps) |
| `program.zbc` | the compiled program (ZBC) |
| `resources.bin` | the fonts and images baked for the program |
| `zinc.json` | the project's manifest: window size, targets, permissions; a hub server reads `description`, `app.author`, `app.homepage` and `permissions` from it for its catalog (covered by the manifest's SHA-256, so by the publisher's signature) |
| `icon.png` | zinc.json `app.icon` (a PNG, an SVG or any image zinc decodes) as a 150 x 150 PNG on white: the launcher tile (`zinc-tile` on a reMarkable, the hub's list); absent when the app has no icon. The file itself is also packed at its own path |
| `assets/...` | the project's assets, read at run time (`zinc:assets`); hidden files stay out |
| `native/<target>-<arch>/<plugin>/` | the library of each native plugin the program calls, built for the machine that packed it, and its `exports` |
| `.zinc/app.js`, `.zinc/app.js.map`, `.zinc/app.qbc` | a QuickJS project's bundled source, source map and bytecode; the original project sources and entry are also kept |

QuickJS packs keep bytecode for the Zinc build that produced it: its `zinc-qbc` stamp records the engine version with its git commit,
and the native QuickJS-ng header records its bytecode version (28 in the pinned 0.17.0). Another engine build, unreadable bytecode or
bytecode older than its source uses the source with one warning; `zinc build` refreshes local bytecode.

Pack signatures are currently empty. File hashes detect damage but do not authenticate a publisher, and QuickJS does not validate bytecode
for safe execution ([QuickJS-ng C API](https://quickjs-ng.github.io/quickjs/developer-guide/intro/)). Running a QuickJS `.zapp`, including a fused one, therefore uses the original sources and prints one trust warning;
no packed bytecode sidecar is loaded. Fast loading from packed bytecode waits for authenticated provenance. For a project you trust,
`zinc build` produces local bytecode that `zinc run build/<name>.qbc` can load.
Packing a QuickJS project now uses the pinned esbuild, downloaded and verified once as for `zinc build`; running its source requires no bundler.

A program that calls a native plugin (`zinc:sqlite`, `zinc:audio`...) carries the plugin's library built for the packing machine (ZN-652).
A fused executable loads it as its own code: it starts with no toolchain and no build. `zinc run app.zapp` builds the plugin from the
engine's `plugins/` instead, like a compile would (cached in `~/.zinc`): a `.zapp` is not native code, and running one does not trust native
code it carries.

`zinc run` refuses an archive whose header checksums or file SHA-256 do not match (corrupted or edited), one in a newer format, one the
engine cannot run ("update zinc"), and one naming a file outside it.

An app is not tied to the zinc that packed it. `needs` names what its compiled program uses: `zbc`, the bytecode version, and `rt`, the
highest runtime call it makes plus one. The runtime call table only grows (`include/zn/runtime.h`), so any engine that reads that bytecode
version and has at least `rt` runtime calls runs the app, older or newer than the packer: "this app needs a newer zinc engine (runtime call
N, this engine has M): update zinc". A bytecode version change still needs the app packed again. An archive without `needs` (packed by an older
zinc, or a project on a JavaScript engine, which carries its sources) keeps the old rule: refused by an engine older than `engine`. The
engine gives its own numbers to the programs it runs as `ZINC_ENGINE_ZBC` and `ZINC_ENGINE_RT` (zinc:sys `env()`), which is how the Hub
(`app/hub`) refuses an update the tablet's engine cannot run before downloading it. Nothing of the archive runs before those checks. A launch reads only the
archive's headers and manifest while the file keeps its size and time; a changed file is checked again member by member (ZN-430).

## Fused executables

```sh
zinc fuse game.zapp -o game     # this engine with the archive appended: ./game runs the app, its arguments go to the app
```

The fused file needs no zinc on the machine (it unpacks the app once into `~/.zinc/cache/zapp/`); it is about 15 MB for a hello (the whole
engine, compiler included). `zinc export` stays the way to a small native build (the AOT). Fusing for another target than this machine's needs
a prebuilt player runtime per target (ZN-392).

Not yet: opening a `.zapp` by double-click needs the file type registered with the desktop (ZN-391), and signatures
are a slot only (the trust work of the plugin distribution tasks).
