---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 1. Erste Schritte

Deine ersten fünf Minuten, Befehl für Befehl: installieren, ein Projekt, eine erste Änderung auf dem Bildschirm, ein erster Fehler und wie du ihn liest.
Die Projektbefehle und die Fehlermeldungen dieses Rundgangs führt `tests/t1/first_run.sh` für jede Vorlage aus, und die Installation führt
`tests/t1/install_nocompiler.sh` auf einem Rechner ohne Compiler aus; beide laufen ohne Fenster.

## Installieren

Ein Befehl, und nichts muss kompiliert werden: kein Compiler, kein CMake, kein Xcode, kein Administratorpasswort. Mit
[Homebrew](https://brew.sh), auf macOS oder Linux:

```sh
brew install frulko/zinc/zinc
```

`brew update && brew upgrade zinc` installiert jede neue Version (`zinc update` schickt dich dorthin). Ohne Homebrew:

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh
```

Das Skript lädt das `zinc`-CLI für deinen Rechner herunter (ein Mac, Apple Silicon oder Intel; Linux, x86_64 oder aarch64; etwa 27 MB), prüft seine
SHA-256-Summe gegen die `SHA256SUMS` der Version, entpackt es nach `~/.zinc/engine` und verlinkt `zinc` nach `/usr/local/bin`, wenn du dort
schreiben darfst, sonst nach `~/.local/bin`, das es zu deinem `PATH` hinzufügt (`~/.zprofile` oder `~/.profile`). `zinc update`
aktualisiert es (siehe "Aktualisieren" unten). Öffne ein neues Terminal und frage dann Zinc, was es sieht:

```sh
zinc doctor
```

Der Download enthält die Engine, die Fensterbibliothek, die Schriften, die Vorlagen und die Plugins, mit den nativen Bibliotheken der
Plugins bereits kompiliert (`zinc:system`, `zinc:three`, `zinc:svg`, `zinc:sqlite`, `zinc:audio`, die Physik-Engines und die
anderen): Ein Programm, das sie importiert, startet sofort. `zinc doctor` endet mit den wenigen Plugins, die keine haben, und warum:
`zinc:video` und `zinc:gphoto2` zum Beispiel nutzen Bibliotheken deines Systems (FFmpeg, libgphoto2): Der Download enthält ihre
Quellen, und sie werden beim ersten Import durch ein Programm kompiliert, auf einem Rechner, der diese Bibliotheken hat und, auf einem Mac,
die Kommandozeilenwerkzeuge von Xcode.

Füge `--atelier` hinzu, um auch Zinc Atelier zu bekommen, die App, die Projekte ohne Terminal bearbeitet und ausführt: Auf einem Mac landet sie in
`/Applications` oder in `~/Applications`, wenn du dort nicht schreiben darfst; unter Linux wird sie dem Anwendungsmenü hinzugefügt:

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh -s -- --atelier
```

Von Hand gibt es zu jeder Version diese Downloads auf der
[Releases-Seite](https://github.com/Frulko/zinc/releases):

- `zinc-<version>-macos-<arch>.tar.gz` (oder `-linux-<arch>.tar.gz`): das CLI. Entpacke es irgendwo und verlinke sein `bin/zinc`
  in ein Verzeichnis deines `PATH` (`ln -s "$PWD/zinc-<version>-macos-arm64/bin/zinc" ~/.local/bin/zinc`); es findet den
  Rest seiner Dateien neben sich.
- `Zinc-Atelier-<version>-macos-<arch>.zip`: die App, mit ihrer eigenen Kopie der Engine. Entpacke sie und ziehe "Zinc Atelier" in den
  Ordner Programme. Ein Mac fragt nach einer Bestätigung für eine App, die über einen Browser kam und nicht notarisiert ist: Klicke einmal mit der rechten Maustaste auf
  "Zinc Atelier" > Öffnen.
- `zinc-<version>-windows-x86_64.zip`: das CLI für Windows 10 und 11 (`irm .../install.ps1 | iex` in PowerShell installiert es).
- `Zinc-Atelier-<version>-windows-x86_64.zip`: die App für Windows, mit ihrer eigenen Kopie der Engine. Entpacke den ganzen Ordner und
  öffne darin "Zinc Atelier.exe". Sie ist noch nicht signiert: SmartScreen fragt eventuell nach einer Bestätigung.

### Aktualisieren

```sh
zinc update --check      # is there a newer zinc? (exit 10 when there is)
zinc update              # install it; the previous version is kept
zinc update --rollback   # back to the previous version
```

`zinc update` lädt die neue Version für deinen Rechner herunter, prüft ihre Signatur und ihre SHA-256-Summe und setzt sie in einem Schritt an die Stelle von
`~/.zinc/engine` (die alte bleibt in `~/.zinc/engine.prev`); wenn etwas schiefgeht, ändert sich nichts.
`zinc update --channel beta` folgt den Beta-Versionen (`--channel stable` geht zurück). Wenn es ein neueres Zinc gibt, gibt jeder Befehl
eine blasse Zeile mit dem Befehl aus, der deins aktualisiert (`zinc update`, `brew update && brew upgrade zinc` ...), und `zinc doctor` sagt, ob deins aktuell ist; die Prüfung läuft im
Hintergrund und bremst nie einen Befehl. Schalte sie mit `export ZINC_NO_UPDATE_CHECK=1` aus (sie ist in CI schon aus, und
wenn die Ausgabe kein Terminal ist). Zinc Atelier hat Hilfe > Nach Updates suchen …; die App selbst aktualisierst du, indem du ihr
neues Zip herunterlädst (oder `install.sh --atelier` noch einmal ausführst). Ein aus den Quellen gebautes Zinc aktualisiert sich mit `git pull` und `tools/build zinc`. Ein mit Homebrew installiertes Zinc aktualisiert sich mit
`brew update && brew upgrade zinc` (Homebrew liest seine Taps von sich aus höchstens einmal am Tag).
Einzelheiten: [Zinc aktualisieren](07-distribution.md#updating-zinc).

### Aus den Quellen

Unter Windows (noch kein Download) oder um an Zinc selbst zu arbeiten, baust du das Programm `zinc` aus den Quellen. Du brauchst git, CMake
3.20 oder neuer und einen C++20-Compiler (auf einem Mac: `xcode-select --install`, dann CMake von cmake.org oder `brew install cmake`).
Sonst nichts: Die Fensterbibliothek (SDL3), die Schriften und die anderen Bibliotheken liegen im Repository, und Node.js wird nicht gebraucht.

```sh
git clone https://github.com/Frulko/zinc.git
cd zinc
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
tools/build zinc                        # 6 to 8 minutes the first time on a 2019 laptop
sudo ln -s "$PWD/build/zinc" /usr/local/bin/zinc
```

Der Link legt `zinc` in deinen `PATH`; das Programm findet seine Bibliotheken, Vorlagen und Plugins dort, wo es gebaut wurde, also behalte
das Verzeichnis `zinc`. Jedes Plugin wird dann beim ersten Import durch ein Programm kompiliert.

`zinc doctor` gibt die Engine aus und wo ihre Dateien liegen, diesen Rechner (Profil, GPU), die Werkzeuge, die es am Tag, an dem du für ein Board
baust, selbst herunterlädt, und die Plugins. Nichts in dieser Liste musst du von Hand installieren. `zinc` allein oder `zinc help` listet die
Befehle auf; `zinc help run` beschreibt einen; ein falsch geschriebener Befehl nennt den ähnlichsten (`zinc rnu`: "did you mean 'zinc run'?").

## Ein Projekt erstellen und ausführen

```sh
zinc new game my-game
cd my-game
zinc run
```

`zinc new` antwortet `created my-game (game); next: cd my-game && zinc run`. `zinc run` öffnet ein Fenster mit einem gelben Quadrat, das
du mit den Pfeiltasten bewegst; beim ersten Lauf erscheint `zinc: compiling main.ts for this machine`, und es dauert ein paar Sekunden, die nächsten
starten sofort. Schließe das Fenster, um das Programm zu beenden.

`zinc new --list` gibt die Vorlagen aus. Jede läuft so, wie sie ist:

| Vorlage | was du bekommst |
| --- | --- |
| `game` | ein Fenster, die Pfeiltasten und ein Quadrat: die kleinste Spielschleife (`zinc:gfx`) |
| `game-2d` | ein 2D-Spiel zum Weiterbauen: Titel-, Spiel- und Game-over-Szenen, Tastatur, Gamepad und Zeiger, SVG-Sprites, ein gespeicherter Highscore |
| `canvas` | eine Zeichnung mit den Canvas-Aufrufen des Webs (`zinc:canvas`): ein Himmel mit Farbverlauf, ein drehender Stern, Blasen dort, wo du klickst |
| `3d` | eine three.js-Szene: Lichter, ein Boden, ein rotierender Ring; ziehe zum Kreisen, drehe das Rad zum Zoomen |
| `desktop-app` | eine Desktop-App: Seitenleiste, die Seiten Home / Notes / Settings, ein App-Menü, dunkler Modus, gespeicherte Einstellungen |
| `dashboard` | Statistikkarten, ein Linien- und ein Balkendiagramm, Warnungen, gespeist von einer Datenquelle, die du durch deine ersetzt |
| `stage` | eine Szene aus Objekten, die du antippst und ziehst (`zinc:stage`, AS3-Stil), leicht für alte Tablets |
| `cli` | ein Kommandozeilenprogramm: seine Argumente und die Plattform |
| `server` | ein HTTP-Server auf Port 3000 mit einem Telemetriezähler (beende ihn mit Strg-C) |
| `service` | eine HTTP-JSON-API mit Tests und einer systemd-Unit für einen Linux-Rechner oder einen Raspberry Pi |
| `iot` | ein Button an GPIO 27 schaltet Pin 17 ein und sendet eine OSC-Nachricht, simuliert abseits des Boards |
| `iot-board` | ein ESP32-S3 mit Bewegungssensor und einem kleinen OLED (eine Wasserwaage), der Sensor wird auf dem Desktop emuliert |
| `eink` | ein reMarkable-Paper-Pro-Notizbuch: eine To-do-Liste und eine Skizzenseite, gezeigt in einem E-Paper-Emulator |
| `remarkable` | eine Tinten-Zeichenfläche für das reMarkable Paper Pro mit Rückgängig |
| `plugin` | ein Plugin zum Veröffentlichen: eine Zinc-API, ein nativer Teil in C++, Tests, ein Beispiel |

`zinc new my-app` ohne Vorlagennamen nimmt `game`. Das Verzeichnis muss neu oder leer sein.

## Was im Projekt steckt

```
my-game/
  zinc.json            the project: its name, its entry, its assets (reference below)
  src/main.ts          the program (main.tsx when it uses JSX)
  assets/              images, fonts and the other files of the program
  tests/smoke.test.ts  a first test: zinc test runs every *.test.ts
  tsconfig.json        for your editor (types of the zinc: modules)
  README.md  .gitignore
```

`build/` (von `zinc build` angelegt) und `dist/` (von `zinc export` angelegt) kannst du jederzeit löschen. In einem Projektverzeichnis
brauchen `zinc run`, `zinc check`, `zinc test` und `zinc build` kein Argument; von anderswo gibst du das Verzeichnis oder die Datei an:
`zinc run my-game`, `zinc run my-game/src/main.ts`.

## Eine erste Änderung

Starte das Programm im Dev-Modus: Er beobachtet die Dateien und setzt den neuen Code bei jedem Speichern in das laufende Programm ein.

```sh
zinc dev
```

Öffne `src/main.ts` in deinem Editor. Die letzte Zeile des Frames zeichnet den Text:

```ts
  text(4, 4, 'arrows to move', 0xffffff, 1);
```

Ersetze `arrows to move` durch `hello from me` und speichere. Das Terminal gibt `zinc dev: v1 refreshed src/main.ts (96 ms after the
save)` aus, und das Fenster zeigt den neuen Text, ohne sich zu schließen: Der Code des Speicherns wird in das laufende Programm eingetauscht (Fast Refresh). Ändere `0xfeca57` (die Farbe des Quadrats, Rot Grün Blau in Hexadezimal) in `0xff6b6b` und speichere: ein rotes
Quadrat. Strg-C beendet `zinc dev`.

## Ein erster Fehler

Ein Fehler hält nichts an: `zinc run` (oder `zinc check`, das nur prüft) gibt pro Fehler eine Zeile aus, `file:line:column: error
code: what is wrong`, dann eine letzte Zeile, die sagt, was zu tun ist. Mit `zinc dev` erscheinen dieselben Zeilen im Terminal und in einer roten
Box im Fenster, bis zum nächsten guten Speichern. Sechs Fehler, die jeder macht, und was Zinc antwortet (`my-game/` steht für den vollständigen
Pfad, den es ausgibt):

**Ein falsch geschriebener Name in einem Import** (`isDwon` statt `isDown`):

```
my-game/src/main.ts:1:53: error Z0101: Cannot find name: 'isDwon' is not exported by 'zinc:gfx' (did you mean 'isDown'?)
my-game/src/main.ts:5:7: error Z0101: Cannot find name: 'isDown'
...
zinc: 5 errors, start with the first. Declare it before use, or fix the spelling. `zinc explain Z0101` shows an example.
```

Behebe zuerst den ersten Fehler: Die vier anderen sind die Stellen, die den Namen benutzen, den der Import nicht mitgebracht hat.

**Eine falsch geschriebene Datei in einem Import** (`'./confg'`, wenn die Datei `src/config.ts` ist):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: './confg' (no file my-game/src/confg.ts or .tsx; did you mean './config'?)
zinc: 1 error. Fix the path or create the file. `zinc explain Z0119` shows an example.
```

**Ein Typfehler** (`let score: number = "ten";`):

```
my-game/src/main.ts:13:21: error Z0103: Type is not assignable: 'string' to 'number'
zinc: 1 error. Convert explicitly or change the declared type. `zinc explain Z0103` shows an example.
```

Die Meldung sagt `number`, so wie das Programm es tut (auf einem Desktop ist das eine 64-Bit-Gleitkommazahl, `f64`; `zinc explain Z0103` sagt mehr). Hier schreibst du `10`, oder du deklarierst
`let score: string`.

**Ein `zinc:`-Modul, das es nicht gibt** (`'zinc:stoarge'`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:stoarge' (did you mean 'zinc:storage'?)
```

**Ein Plugin, das nicht installiert ist** (`'zinc:confetti'`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:confetti' is not a module of the engine and no plugin of this project provides it (`zinc plugins` lists the ones it has, `zinc plugins search confetti` looks in the index, `zinc add <name>` installs one)
```

`zinc plugins` gibt jedes Modul aus, das du jetzt importieren kannst, mit je einer Zeile Beschreibung.

**Ein offen gelassenes JSX-Tag** (in einem `.tsx`-Projekt wie `zinc new remarkable`, ein `<Text>` ohne sein `</Text>`):

```
my-app/src/main.tsx:10:7: error Z0002: Expected a specific token: JSX: <Text> is not closed (line 15 closes </View> instead): add </Text>, or end the tag with />
```

Die Zeile ist die des Tags, das geöffnet wurde, nicht die Stelle, an der der Parser aufgegeben hat.

**Eine Datei, die es nicht gibt** (`zinc run src/mian.ts`):

```
src/mian.ts:1:1: error Z0119: Cannot find module: no file src/mian.ts (did you mean src/main.ts?)
```

und `zinc run` in einem Verzeichnis, das kein Projekt ist, sagt `zinc: no project here` und nennt die Dateien, die es gesucht hat.

`zinc explain Z0103` gibt für jeden Code aus, warum die Regel existiert, wie du den Fehler behebst und ein kleines Beispiel.

## Wie es weitergeht

`zinc tour` geht diese Seite noch einmal in deinem Terminal durch, in acht Schritten, die sich jeweils selbst prüfen: ein Projekt, ein Lauf, eine Änderung, ein
Fehler und `zinc explain`, Fast Refresh mit `zinc dev`, eine Programmart, die Dokumentation, Zinc Atelier. Er merkt sich, wo du warst
(`zinc tour --list`, `zinc tour 5`, `zinc tour --reset`), in deiner Sprache. Danach machen [die Lektionen](../learn/README.md) weiter.

- **Du unterrichtest.** [Die Sprache](02-language.md) ist TypeScript mit den dort aufgelisteten Regeln, und jeder Fehlercode erklärt sich selbst
  (`zinc explain`). `zinc new game-2d` ist ein vollständiges kleines Spiel zum Lesen und Ändern im Unterricht; `zinc run examples/breakout` ist
  ein weiteres. `zinc test` führt die `*.test.ts`-Dateien eines Projekts aus ([Testen](06-testing.md)). Die Programme laufen auf den
  alten Rechnern der Schule genauso wie auf einem Raspberry Pi.
- **Du baust Dinge.** `zinc new iot-board` ist ein Gerät mit Sensor und Display, das auf deinem Schreibtisch mit emuliertem Sensor läuft;
  seine `README.md` führt weiter zum echten ESP32. `zinc new iot` ist ein Button und eine LED an den Pins eines Raspberry Pi.
  [Boards](../boards.md) listet die unterstützten Boards und Panels auf, [Plugins](05-plugins.md) erklärt, wie du mit deiner eigenen Hardware sprichst.
- **Du zeichnest, animierst, trittst auf.** `zinc run examples/canvas/sketch` ist eine Canvas-2D-Skizze und `zinc new 3d` eine three.js-Szene;
  `zinc run examples/hero` zeigt, was die UI kann. Die Plugins [canvas2d](../plugins/canvas2d.md), [svg](../plugins/svg.md),
  [lottie](../plugins/lottie.md), [audio](../plugins/audio.md) und [video](../plugins/video.md) sind nur einen Import entfernt, und
  [UI-Apps](03-ui-apps.md) erklärt Bildschirme aus Komponenten.

Der Rest dieser Seite ist Referenz.

## Referenz zu `zinc.json`

```json
{
  "name": "myapp",
  "entry": "src/main.tsx",
  "assets": "assets",
  "version": "0.1.0",
  "id": "com.example.myapp",
  "icon": "assets/icon.png",
  "crash": "exit",
  "display": "fbdev",
  "plugins": { "devtools": { "port": 9229 } },
  "pluginDirs": ["../shared-plugins"],
  "targets": {
    "macos": { "width": 800, "height": 600, "zoom": 1, "resize": "fill", "fullscreen": false, "kiosk": false },
    "esp32": { "heap": 163840, "display": { "driver": "ssd1306", "address": 60 }, "wifi": { "ssid": "net", "password": "…" } }
  }
}
```

| Feld | Bedeutung |
| --- | --- |
| `name` | Name der App; die ausführbare Datei und `dist/<name>-<target>` sind danach benannt |
| `entry` | Einstiegsquelle (`.ts` / `.tsx` / `.js`) |
| `engine` | `"quickjs"` führt das Projekt auf der QuickJS-Engine aus (TS, TSX und JS: [Bundling für QuickJS](11-quickjs-bundle.md)), `"zinc"` auf den typisierten Engines; nicht gesetzt: QuickJS, wenn der Einstieg `.js`, `.mjs` oder die `.qbc` eines Bundles ist (`zinc run --engine quickjs` auf der Kommandozeile hat Vorrang) |
| `assets` | das Assets-Verzeichnis (Standard `assets`): Seine Bilder und Schriften werden in die ausführbare Datei eingebacken, seine Dateien werden zur Laufzeit mit `zinc:assets` gelesen (siehe [Verteilung](07-distribution.md#assets-of-a-built-program)); oder ein Objekt `{ dir, rules, groups, profiles, budgets }` für den Asset-Build (`zinc assets build`, `zinc assets info`: [der Asset-Build](../reports/zinc-next-assets.md)) |
| `splash` | ein Bildpfad oder `{ image, background, fit, minMs, fadeMs }`: ab dem ersten Frame gezeigt (auch pro Ziel, `targets.<id>.splash`) |
| `loading` | `{ screen, groups, minMs, fadeMs }`: der Bildschirm (`default`, `bar` oder ein Modul), der gezeigt wird, während die Asset-Gruppen vor `main` laden |
| `launcher` | `{ entry, skippable, targets }`: ein Modul, das auf den aufgelisteten Zielen vor dem Spiel läuft (Einstellungen, Mods) |
| `version` | semantische Version; sie landet in der macOS-`Info.plist`, im Linux-`.desktop` und beim Export in `README.txt` |
| `id` | Bundle-/App-ID (macOS `CFBundleIdentifier`); Standard ist `dev.zinc.<name>` |
| `icon` | PNG, aus dem das macOS-`.icns`, das Linux-Icon, das rmpp-AppLoad-Icon und das Wasm-Favicon gebaut werden (siehe [Verteilung](07-distribution.md)) |
| `crash` | Absturzverhalten im Release: `exit` (Standard), `redbox` (den Fehler zeichnen, warten) oder `restart` (siehe [Dev-Modus](../dev-mode.md)) |
| `display` | Display-Treiber für Bildschirme, die nicht das Standardfenster sind (`fbdev`, `ws2812`, `ssd1306`, `st7789`, `rmpp`, `gl`); String oder `{ driver, ...options }` |
| `plugins` | Optionen pro Plugin, die die Standardwerte aus `plugin.json` überschreiben |
| `pluginDirs` | zusätzliche Suchwurzeln für Plugins (relativ zum Projekt) |
| `targets.<id>` | Überschreibungen des Profils pro Ziel: `width`, `height`, `heap`, `zoom`, `resize`, `fullscreen`, `kiosk`, `display`, `plugins`, `assets` (`{ profile, ...profile keys }`), `splash`, und zielspezifische Schlüssel (`esp32.wifi`) |

## Ziele und Profile

Ein **Ziel** ist das, wofür du baust: `zinc build --target T` baut mit dem festgelegten zig eine ausführbare Datei für ein anderes System (kein Docker, kein SDK zu
installieren), und `zinc export --target T` verpackt sie. Ein **Profil** ist die Zahlendarstellung, die Auflösung und das Heap-Budget, unter denen ein
Programm geprüft und ausgeführt wird: `zinc run app --profile ps1` läuft auf deinem Computer, aber mit Q20.12-Festkomma, 320x240 und einem
256-KiB-Heap, sodass du das Festkomma-Verhalten ohne die Konsole debuggen kannst. Die beiden sind getrennt: Ein Profil ist nie ein Build-Ziel.

| `zinc build --target` | Ergebnis |
| --- | --- |
| `aarch64-linux`, `armhf-linux`, `armv7-linux`, `x86_64-linux` | eine ausführbare Linux-Datei (Raspberry Pi und andere Boards, Server) |
| `aarch64-macos`, `x86_64-macos` | eine ausführbare macOS-Datei |
| `x86_64-windows` | ein Konsolenprogramm (`-o name.exe`; noch kein Fenster und kein Plugin) |
| `esp32` | Firmware für den ESP32 (`zinc run --target esp32`, `zinc flash`) |

`zinc export --target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp|macos|wasm|web|esp32|android|ios` schreibt `dist/<name>-<target>/`
(`zinc help export` listet auf, was jedes enthält); `wasm` und `web` erzeugen eine statische Website.

Profile (`zinc run --profile`): `macos`, `linux`, `wasm`, `rpi1`, `rmpp`, `esp32`, `ps1`, `ps2`, `psp`, `vita`, `n3ds`, `chip`,
`pocketchip` und `sim`, ein Profil wie `macos` mit einem 320x240-Bildschirm und falscher Hardware (es ist kein Node-Ziel mehr). Standardwerte pro Profil (Zahlenart,
Auflösung, Typisierung, Heap): `macos`/`linux`/`sim` f64, gradual, 512 MiB; `wasm` f64, 64 MiB; `rpi1` f64, 1280×720, 64 MiB;
`esp32` f32, strikt, 160 KiB; `ps1` fx12 (keine FPU), strikt, 256 KiB. Überschreibe jeden davon in `zinc.json` unter `targets.<id>`.
Heute wird nur macOS bei jeder Änderung gebaut und getestet; die anderen Ziele stehen in [der Tabelle der Fähigkeiten](../targets/capabilities.md).

## Ausführen

```sh
zinc run [entry|dir] [--interp|--native] [--engine E] [--profile P] [--simulate D] [-- args]   # compile and run (E: quickjs, jsc, v8, hermes; D: a device of devices/)
zinc check [entry|dir]                                              # the errors, without running
zinc test                                                           # every *.test.ts of the project
zinc build [entry|dir] [-o out] [--target T]                        # an executable in build/
zinc dev [entry|dir] [--no-devtools] [-- args]                      # run, watch, swap each save in (Fast Refresh)
zinc dev [entry|dir] --lan                                          # the same on your phone, with Zinc Go (a QR code)
zinc help [command]
```

`zinc run` kompiliert ein Programm, das zeichnet, zu nativem Code und behält die ausführbare Datei (`~/.zinc/cache/run`): Der erste Lauf einer
Version kompiliert, die nächsten starten sofort; `--interp` interpretiert stattdessen und startet sofort. `zinc dev` tauscht jedes Speichern in das
laufende Programm ein (oder startet es neu und sagt, warum), mit einer roten Box bei einem Kompilierfehler und, für UI-Programme, einem Chrome-DevTools-Inspektor auf Port 9229
(siehe [Dev-Modus](../dev-mode.md)). Gib Programmargumente nach `--` an; lies sie mit `sys.args()`. `zinc dev --lan` stellt das Projekt
Zinc Go bereit, der Player-App für Android und iOS (`examples/zinc-go`): Scanne den QR-Code, den es ausgibt, und jedes Speichern aktualisiert das Handy, so wie Expo Go es
für `expo start` tut.

Nützliche Umgebungsvariablen: `ZINC_HEADLESS=1` läuft ohne Fenster, `ZINC_BACKGROUND=1` (oder `zinc --background run`) öffnet es, ohne den Fokus zu nehmen, `ZINC_FRAMES=n` beendet eine Frame-Schleife nach n Frames,
`ZINC_SHOT=out.png` speichert den letzten Frame (`zinc capture` speichert beliebige Frames), `ZINC_DETERMINISTIC=1` stellt den Lauf auf
eine virtuelle Uhr.

Weiter: [die Sprache](02-language.md).

## Editor einrichten

`zinc init` schreibt eine `tsconfig.json` für VS Code (oder jeden Editor auf Basis von tsserver): Zinc's eigene Bibliothek statt der
DOM-/ES-Lib (so wird `document` oder ein Regex so markiert, wie es der Compiler täte), `zinc:*`-Module und Plugins aufgelöst,
typisierte JSX-Host-Tags (`View`, `Text` ...) und ein kleines tsserver-Plugin (`node_modules/zinc-ts-plugin`, verlinkt nach
`lib/editor/zinc-ts-plugin`), das nur die Diagnosen zu den Thunk-Kindern von Zinc entfernt. Für ein bestehendes Projekt:

```sh
zinc tsconfig            # or: zinc tsconfig path/to/project
```

Nutze dann wie gewohnt das TypeScript des Workspace; `zinc check` bleibt die Referenz (Z-Codes, Ziele).

## Debuggen

`zinc debug src/main.ts` führt ein Programm unter dem Debugger auf der Kommandozeile aus: Es hält bei der ersten Anweisung, dann setzt `b main.ts:12`
einen Haltepunkt, `c` macht weiter, `n` / `s` / `o` gehen über, hinein und hinaus, `bt` gibt den Stack aus und `locals` die Variablen (die ganze Liste:
[Dev-Modus, Debugger](../dev-mode.md#debugger-zinc-debug)).

In VS Code führt die Erweiterung Zinc Debug (`lib/editor/vscode-zinc-debug`) `zinc debug --dap` aus, einen Debug-Adapter-Protocol-Server. Verlinke sie einmal in
die Erweiterungen von VS Code und starte VS Code neu:

```sh
ln -s "$ZINC_ROOT/lib/editor/vscode-zinc-debug" ~/.vscode/extensions/zinc.zinc-debug-0.1.0   # ZINC_ROOT: this repository
```

Dann `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    { "type": "zinc", "request": "launch", "name": "Zinc: debug", "program": "${workspaceFolder}/src/main.ts", "cwd": "${workspaceFolder}", "stopOnEntry": false }
  ]
}
```

F5 startet es: Haltepunkte in `.ts`- und `.tsx`-Dateien (auch innerhalb von JSX-Elementen) halten das Programm an, die Ansicht Variables zeigt die lokalen Variablen jedes
Frames des Call Stack, mit Objekten und Arrays zum Aufklappen, die Debug-Leiste setzt fort, geht Schritt für Schritt und pausiert ein laufendes Programm, und eine Überwachung oder ein
Hover über den Namen einer lokalen Variable zeigt ihren Wert. Die Ausgabe des Programms geht in die Debug Console. Der Adapter nutzt das `zinc` dieses Repositorys, wenn
die Erweiterung von dort verlinkt ist, sonst `$ZINC`, sonst das `zinc` im `PATH`.
