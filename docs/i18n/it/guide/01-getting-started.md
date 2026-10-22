---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 1. Per iniziare

I tuoi primi cinque minuti, comando per comando: installare, creare un progetto, una prima modifica sullo schermo, un primo errore e come leggerlo.
I comandi di progetto e i messaggi di errore di questo percorso sono eseguiti da `tests/t1/first_run.sh` su ogni modello, e l'installazione da
`tests/t1/install_nocompiler.sh` su una macchina preparata senza compilatore; entrambi girano senza finestra.

## Installare

Un solo comando, e niente da compilare: niente compilatore, niente CMake, niente Xcode, niente password di amministratore. Con
[Homebrew](https://brew.sh), su macOS o Linux:

```sh
brew install frulko/zinc/zinc
```

`brew update && brew upgrade zinc` installa ogni nuova versione (`zinc update` ti manda lì). Senza Homebrew:

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh
```

Scarica la CLI `zinc` fatta per il tuo computer (un Mac, Apple silicon o Intel; Linux, x86_64 o aarch64; circa 27 MB), controlla il suo
SHA-256 con il `SHA256SUMS` della versione, la decomprime in `~/.zinc/engine` e collega `zinc` in `/usr/local/bin` se
puoi scriverci, altrimenti in `~/.local/bin`, che aggiunge al tuo `PATH` (`~/.zprofile` o `~/.profile`). `zinc update`
la aggiorna (vedi "Aggiornare" più sotto). Apri un nuovo terminale, poi chiedi a zinc cosa vede:

```sh
zinc doctor
```

Il download contiene il motore, la libreria delle finestre, i font, i modelli e i plugin, con le librerie native dei
plugin già compilate (`zinc:system`, `zinc:three`, `zinc:svg`, `zinc:sqlite`, `zinc:audio`, i motori di fisica e gli
altri): un programma che li importa parte subito. `zinc doctor` finisce con i pochi plugin che non le hanno, e il perché:
`zinc:video` e `zinc:gphoto2`, per esempio, usano librerie del tuo sistema (FFmpeg, libgphoto2): il download contiene i loro
sorgenti, e vengono compilati la prima volta che un programma li importa, su un computer che ha quelle librerie e, su un Mac,
gli strumenti da riga di comando di Xcode.

Aggiungi `--atelier` per avere anche Zinc Atelier, l'app che modifica ed esegue i progetti senza terminale: su un Mac va in
`/Applications`, o in `~/Applications` quando non puoi scrivere lì; su Linux viene aggiunta al menu delle applicazioni:

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh -s -- --atelier
```

Se preferisci fare a mano, ogni versione ha questi download nella sua
[pagina delle versioni](https://github.com/Frulko/zinc/releases):

- `zinc-<version>-macos-<arch>.tar.gz` (o `-linux-<arch>.tar.gz`): la CLI. Decomprimila dove vuoi e collega il suo `bin/zinc`
  in una cartella del tuo `PATH` (`ln -s "$PWD/zinc-<version>-macos-arm64/bin/zinc" ~/.local/bin/zinc`); trova
  da sola gli altri file accanto a sé.
- `Zinc-Atelier-<version>-macos-<arch>.zip`: l'app, con la sua copia del motore. Decomprimila e trascina "Zinc Atelier" in
  Applicazioni. Un Mac ti chiede di confermare un'app arrivata da un browser e non notarizzata: fai clic destro > Apri su
  "Zinc Atelier" una volta sola.
- `zinc-<version>-windows-x86_64.zip`: la CLI per Windows 10 e 11 (`irm .../install.ps1 | iex` in PowerShell la installa).
- `Zinc-Atelier-<version>-windows-x86_64.zip`: l'app per Windows, con la sua copia del motore. Decomprimi l'intera cartella e
  apri "Zinc Atelier.exe" al suo interno. Non è ancora firmata: SmartScreen può chiederti di confermare.

### Aggiornare

```sh
zinc update --check      # is there a newer zinc? (exit 10 when there is)
zinc update              # install it; the previous version is kept
zinc update --rollback   # back to the previous version
```

`zinc update` scarica la nuova versione per il tuo computer, controlla la sua firma e il suo SHA-256, e la mette al posto di
`~/.zinc/engine` in un solo passaggio (la vecchia resta in `~/.zinc/engine.prev`); se qualcosa fallisce, non cambia nulla.
`zinc update --channel beta` segue le versioni beta (`--channel stable` torna indietro). Quando esiste uno zinc più recente, ogni comando
stampa una riga tenue con il comando che aggiorna il tuo (`zinc update`, `brew update && brew upgrade zinc`...), e `zinc doctor` dice se il tuo è aggiornato; il controllo gira in
sottofondo e non rallenta mai un comando. Spegnilo con `export ZINC_NO_UPDATE_CHECK=1` (è già spento in CI e
quando l'output non è un terminale). Zinc Atelier ha Aiuto > Controlla aggiornamenti…; l'app stessa si aggiorna scaricando il suo
nuovo zip (o con `install.sh --atelier` di nuovo). Uno zinc compilato dai sorgenti si aggiorna con `git pull` e `tools/build zinc`. Uno zinc installato con Homebrew si aggiorna con
`brew update && brew upgrade zinc` (Homebrew legge da solo i suoi tap al massimo una volta al giorno).
Dettagli: [Aggiornare zinc](07-distribution.md#updating-zinc).

### Dai sorgenti

Su Windows (ancora nessun download), o per lavorare su Zinc stesso, compili il programma `zinc` dai sorgenti. Ti servono git, CMake
3.20 o successivo e un compilatore C++20 (su un Mac: `xcode-select --install`, poi CMake da cmake.org o `brew install cmake`).
Nient'altro: la libreria delle finestre (SDL3), i font e le altre librerie sono nel repository, e Node.js non serve.

```sh
git clone https://github.com/Frulko/zinc.git
cd zinc
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
tools/build zinc                        # 6 to 8 minutes the first time on a 2019 laptop
sudo ln -s "$PWD/build/zinc" /usr/local/bin/zinc
```

Il collegamento mette `zinc` nel tuo `PATH`; il programma trova le sue librerie, i modelli e i plugin a partire da dove è stato compilato, quindi tieni
la cartella `zinc`. Ogni plugin viene poi compilato la prima volta che un programma lo importa.

`zinc doctor` stampa il motore e dove sono i suoi file, questo computer (profilo, GPU), gli strumenti che scaricherà da solo il giorno in cui
compilerai per una scheda, e i plugin. Niente in quell'elenco va installato a mano. `zinc` da solo, o `zinc help`, elenca i
comandi; `zinc help run` ne descrive uno; un comando scritto male nomina quello più vicino (`zinc rnu`: "did you mean 'zinc run'?").

## Creare un progetto ed eseguirlo

```sh
zinc new game my-game
cd my-game
zinc run
```

`zinc new` risponde `created my-game (game); next: cd my-game && zinc run`. `zinc run` apre una finestra con un quadrato giallo che
si muove con le frecce; la prima esecuzione stampa `zinc: compiling main.ts for this machine` e richiede qualche secondo, le successive
partono subito. Chiudi la finestra per fermare il programma.

`zinc new --list` stampa i modelli. Ognuno funziona così com'è:

| modello | cosa ottieni |
| --- | --- |
| `game` | una finestra, le frecce e un quadrato: il ciclo di gioco più piccolo (`zinc:gfx`) |
| `game-2d` | un gioco 2D da far crescere: scene di titolo, partita e game over, tastiera, gamepad e puntatore, sprite SVG, un record salvato |
| `canvas` | un disegno con le chiamate canvas del web (`zinc:canvas`): un cielo sfumato, una stella che gira, bolle dove fai clic |
| `3d` | una scena three.js: luci, un pavimento, un anello che gira; trascina per orbitare, rotella per fare zoom |
| `desktop-app` | un'app desktop: barra laterale, pagine Home / Note / Impostazioni, un menu dell'app, modalità scura, impostazioni salvate |
| `dashboard` | schede di statistiche, un grafico a linee e uno a barre, avvisi, alimentati da una sorgente di dati che sostituisci con la tua |
| `stage` | una scena di oggetti che tocchi e trascini (`zinc:stage`, stile AS3), leggera sui vecchi tablet |
| `cli` | un programma da riga di comando: i suoi argomenti e la piattaforma |
| `server` | un server HTTP sulla porta 3000 con un contatore di telemetria (fermalo con Ctrl-C) |
| `service` | un'API JSON HTTP con test e un'unità systemd per un computer Linux o un Raspberry Pi |
| `iot` | un pulsante sul GPIO 27 accende il pin 17 e invia un messaggio OSC, simulato fuori dalla scheda |
| `iot-board` | un ESP32-S3 con un sensore di movimento e un piccolo OLED (una livella a bolla), il sensore emulato sul desktop |
| `eink` | un quaderno reMarkable Paper Pro: una lista di cose da fare e una pagina di schizzi, mostrati in un emulatore e-paper |
| `remarkable` | una tela d'inchiostro reMarkable Paper Pro con annulla |
| `plugin` | un plugin da pubblicare: un'API Zinc, una parte nativa in C++, test, un esempio |

`zinc new my-app` senza il nome di un modello usa `game`. La cartella deve essere nuova o vuota.

## Cosa c'è nel progetto

```
my-game/
  zinc.json            the project: its name, its entry, its assets (reference below)
  src/main.ts          the program (main.tsx when it uses JSX)
  assets/              images, fonts and the other files of the program
  tests/smoke.test.ts  a first test: zinc test runs every *.test.ts
  tsconfig.json        for your editor (types of the zinc: modules)
  README.md  .gitignore
```

`build/` (creata da `zinc build`) e `dist/` (creata da `zinc export`) si possono cancellare in qualsiasi momento. In una cartella di progetto
`zinc run`, `zinc check`, `zinc test` e `zinc build` non vogliono argomenti; da altrove indica la cartella o il file:
`zinc run my-game`, `zinc run my-game/src/main.ts`.

## Una prima modifica

Avvia il programma in modalità dev: guarda i file e inserisce il nuovo codice nel programma in esecuzione a ogni salvataggio.

```sh
zinc dev
```

Apri `src/main.ts` nel tuo editor. L'ultima riga del fotogramma disegna il testo:

```ts
  text(4, 4, 'arrows to move', 0xffffff, 1);
```

Sostituisci `arrows to move` con `hello from me` e salva. Il terminale stampa `zinc dev: v1 refreshed src/main.ts (96 ms after the
save)` e la finestra mostra il nuovo testo senza chiudersi: il codice salvato viene scambiato nel programma in esecuzione (Fast Refresh). Cambia `0xfeca57` (il colore del quadrato, rosso verde blu in esadecimale) in `0xff6b6b`, salva: un quadrato
rosso. Ctrl-C ferma `zinc dev`.

## Un primo errore

Un errore non ferma niente: `zinc run` (o `zinc check`, che controlla soltanto) stampa una riga per errore, `file:line:column: error
code: what is wrong`, poi un'ultima riga che dice cosa fare. Con `zinc dev` le stesse righe appaiono nel terminale e in un riquadro
rosso nella finestra fino al prossimo salvataggio corretto. Sei errori che tutti fanno, e cosa risponde Zinc (`my-game/` sta per il percorso
completo che stampa):

**Un nome scritto male in un import** (`isDwon` invece di `isDown`):

```
my-game/src/main.ts:1:53: error Z0101: Cannot find name: 'isDwon' is not exported by 'zinc:gfx' (did you mean 'isDown'?)
my-game/src/main.ts:5:7: error Z0101: Cannot find name: 'isDown'
...
zinc: 5 errors, start with the first. Declare it before use, or fix the spelling. `zinc explain Z0101` shows an example.
```

Correggi prima il primo errore: gli altri quattro sono i punti che usano il nome che l'import non ha portato.

**Un file scritto male in un import** (`'./confg'` quando il file è `src/config.ts`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: './confg' (no file my-game/src/confg.ts or .tsx; did you mean './config'?)
zinc: 1 error. Fix the path or create the file. `zinc explain Z0119` shows an example.
```

**Un errore di tipo** (`let score: number = "ten";`):

```
my-game/src/main.ts:13:21: error Z0103: Type is not assignable: 'string' to 'number'
zinc: 1 error. Convert explicitly or change the declared type. `zinc explain Z0103` shows an example.
```

Il messaggio dice `number`, come il programma (su un desktop è un numero in virgola mobile a 64 bit, `f64`; `zinc explain Z0103` ne dice di più). Qui: scrivi `10`, oppure dichiara
`let score: string`.

**Un modulo `zinc:` che non esiste** (`'zinc:stoarge'`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:stoarge' (did you mean 'zinc:storage'?)
```

**Un plugin che non è installato** (`'zinc:confetti'`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:confetti' is not a module of the engine and no plugin of this project provides it (`zinc plugins` lists the ones it has, `zinc plugins search confetti` looks in the index, `zinc add <name>` installs one)
```

`zinc plugins` stampa ogni modulo che puoi importare adesso, con una riga di descrizione ciascuno.

**Un tag JSX lasciato aperto** (in un progetto `.tsx` come `zinc new remarkable`, un `<Text>` senza il suo `</Text>`):

```
my-app/src/main.tsx:10:7: error Z0002: Expected a specific token: JSX: <Text> is not closed (line 15 closes </View> instead): add </Text>, or end the tag with />
```

La riga è quella del tag che è stato aperto, non il punto in cui il parser si è arreso.

**Un file che non c'è** (`zinc run src/mian.ts`):

```
src/mian.ts:1:1: error Z0119: Cannot find module: no file src/mian.ts (did you mean src/main.ts?)
```

e `zinc run` in una cartella che non è un progetto dice `zinc: no project here` con i file che ha cercato.

`zinc explain Z0103` stampa, per qualsiasi codice, perché la regola esiste, come correggere e un piccolo esempio.

## Dove andare dopo

`zinc tour` ripercorre questa pagina nel tuo terminale, in otto passi che si controllano da soli: un progetto, un'esecuzione, una modifica, un
errore e `zinc explain`, Fast Refresh con `zinc dev`, un tipo di programma, la documentazione, Zinc Atelier. Ricorda dove sei arrivato
(`zinc tour --list`, `zinc tour 5`, `zinc tour --reset`), nella tua lingua. Poi [le lezioni](../learn/README.md) continuano.

- **Insegni.** [Il linguaggio](02-language.md) è TypeScript con le regole elencate lì, e ogni codice di errore si spiega da solo
  (`zinc explain`). `zinc new game-2d` è un piccolo gioco completo da leggere e modificare in classe; `zinc run examples/breakout` è
  un altro. `zinc test` esegue i file `*.test.ts` di un progetto ([test](06-testing.md)). I programmi girano allo stesso modo sulle
  vecchie macchine della scuola e su un Raspberry Pi.
- **Costruisci cose.** `zinc new iot-board` è un dispositivo con un sensore e uno schermo che gira sulla tua scrivania con il sensore
  emulato; il suo `README.md` prosegue verso il vero ESP32. `zinc new iot` è un pulsante e un LED sui pin di un Raspberry Pi.
  [Schede](../boards.md) elenca le schede e i pannelli supportati, [plugin](05-plugins.md) spiega come parlare con il tuo hardware.
- **Disegni, animi, ti esibisci.** `zinc run examples/canvas/sketch` è uno sketch Canvas 2D e `zinc new 3d` una scena three.js;
  `zinc run examples/hero` mostra cosa sa fare l'interfaccia. I plugin [canvas2d](../plugins/canvas2d.md), [svg](../plugins/svg.md),
  [lottie](../plugins/lottie.md), [audio](../plugins/audio.md) e [video](../plugins/video.md) sono a un import di distanza, e
  [App con interfaccia](03-ui-apps.md) spiega le schermate fatte di componenti.

Il resto di questa pagina è riferimento.

## Riferimento di `zinc.json`

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

| campo | significato |
| --- | --- |
| `name` | nome dell'app; l'eseguibile e `dist/<name>-<target>` prendono il suo nome |
| `entry` | entrata dei sorgenti (`.ts` / `.tsx` / `.js`) |
| `engine` | `"quickjs"` esegue il progetto sul motore QuickJS (TS, TSX e JS: [Bundle per QuickJS](11-quickjs-bundle.md)), `"zinc"` sui motori tipizzati; non impostato: QuickJS quando l'entrata è `.js`, `.mjs` o il `.qbc` di un bundle (`zinc run --engine quickjs` sulla riga di comando ha la precedenza) |
| `assets` | la cartella delle risorse (predefinita `assets`): le sue immagini e i suoi font sono incorporati nell'eseguibile, i suoi file si leggono durante l'esecuzione con `zinc:assets` (vedi [distribuzione](07-distribution.md#assets-of-a-built-program)); oppure un oggetto `{ dir, rules, groups, profiles, budgets }` per la build delle risorse (`zinc assets build`, `zinc assets info`: [la build delle risorse](../reports/zinc-next-assets.md)) |
| `splash` | il percorso di un'immagine, o `{ image, background, fit, minMs, fadeMs }`: mostrata dal primo fotogramma (anche per target, `targets.<id>.splash`) |
| `loading` | `{ screen, groups, minMs, fadeMs }`: la schermata (`default`, `bar` o un modulo) mostrata mentre i gruppi di risorse si caricano prima di `main` |
| `launcher` | `{ entry, skippable, targets }`: un modulo eseguito prima del gioco sui target elencati (impostazioni, mod) |
| `version` | versione semantica; finisce nel `Info.plist` di macOS, nel `.desktop` di Linux, e in `README.txt` all'esportazione |
| `id` | id del bundle/dell'app (`CFBundleIdentifier` di macOS); predefinito `dev.zinc.<name>` |
| `icon` | PNG usato per creare il `.icns` di macOS, l'icona di Linux, l'icona AppLoad di rmpp e la favicon wasm (vedi [distribuzione](07-distribution.md)) |
| `crash` | politica di crash in release: `exit` (predefinito), `redbox` (disegna l'errore, aspetta) o `restart` (vedi [modalità dev](../dev-mode.md)) |
| `display` | driver di display per gli schermi che non sono la finestra predefinita (`fbdev`, `ws2812`, `ssd1306`, `st7789`, `rmpp`, `gl`); stringa o `{ driver, ...options }` |
| `plugins` | opzioni per plugin, che sostituiscono i valori predefiniti di `plugin.json` |
| `pluginDirs` | radici aggiuntive di ricerca dei plugin (relative al progetto) |
| `targets.<id>` | modifiche per target del profilo: `width`, `height`, `heap`, `zoom`, `resize`, `fullscreen`, `kiosk`, `display`, `plugins`, `assets` (`{ profile, ...profile keys }`), `splash`, e chiavi specifiche del target (`esp32.wifi`) |

## Target e profili

Un **target** è ciò per cui compili: `zinc build --target T` compila in cross un eseguibile con zig fissato (niente Docker, nessun SDK da
installare) e `zinc export --target T` lo impacchetta. Un **profilo** è la rappresentazione dei numeri, la risoluzione e il budget di heap con cui
un programma viene controllato ed eseguito: `zinc run app --profile ps1` gira sul tuo computer ma con la virgola fissa Q20.12, 320x240 e un
heap di 256 KiB, così puoi fare il debug del comportamento in virgola fissa senza la console. I due sono separati: un profilo non è mai un target di compilazione.

| `zinc build --target` | risultato |
| --- | --- |
| `aarch64-linux`, `armhf-linux`, `armv7-linux`, `x86_64-linux` | un eseguibile Linux (Raspberry Pi e altre schede, server) |
| `aarch64-macos`, `x86_64-macos` | un eseguibile macOS |
| `x86_64-windows` | un programma da console (`-o name.exe`; ancora senza finestra né plugin) |
| `esp32` | firmware per l'ESP32 (`zinc run --target esp32`, `zinc flash`) |

`zinc export --target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp|macos|wasm|web|esp32|android|ios` scrive `dist/<name>-<target>/`
(`zinc help export` elenca cosa contiene ciascuno); `wasm` e `web` creano un sito statico.

Profili (`zinc run --profile`): `macos`, `linux`, `wasm`, `rpi1`, `rmpp`, `esp32`, `ps1`, `ps2`, `psp`, `vita`, `n3ds`, `chip`,
`pocketchip`, e `sim`, un profilo come `macos` con uno schermo 320x240 e hardware finto (non è più un target Node). Valori predefiniti per profilo (tipo
di numero, risoluzione, tipizzazione, heap): `macos`/`linux`/`sim` f64, graduale, 512 MiB; `wasm` f64, 64 MiB; `rpi1` f64, 1280×720, 64 MiB;
`esp32` f32, strict, 160 KiB; `ps1` fx12 (niente FPU), strict, 256 KiB. Cambia uno qualsiasi di questi in `zinc.json` `targets.<id>`.
Oggi solo macOS viene compilato e testato a ogni modifica; gli altri target sono elencati nella [tabella delle capacità](../targets/capabilities.md).

## Eseguire

```sh
zinc run [entry|dir] [--interp|--native] [--engine E] [--profile P] [--simulate D] [-- args]   # compile and run (E: quickjs, jsc, v8, hermes; D: a device of devices/)
zinc check [entry|dir]                                              # the errors, without running
zinc test                                                           # every *.test.ts of the project
zinc build [entry|dir] [-o out] [--target T]                        # an executable in build/
zinc dev [entry|dir] [--no-devtools] [-- args]                      # run, watch, swap each save in (Fast Refresh)
zinc dev [entry|dir] --lan                                          # the same on your phone, with Zinc Go (a QR code)
zinc help [command]
```

`zinc run` compila in codice nativo un programma che disegna e conserva l'eseguibile (`~/.zinc/cache/run`): la prima esecuzione di una
versione compila, le successive partono subito; `--interp` invece interpreta e parte subito. `zinc dev` inserisce ogni salvataggio nel
programma in esecuzione (o lo riavvia, e dice perché), con un riquadro rosso in caso di errore di compilazione e, per i programmi con interfaccia, un ispettore Chrome DevTools sulla porta 9229
(vedi [modalità dev](../dev-mode.md)). Passa gli argomenti del programma dopo `--`; leggili con `sys.args()`. `zinc dev --lan` serve il progetto a
Zinc Go, l'app player per Android e iOS (`examples/zinc-go`): inquadra il codice QR che stampa e ogni salvataggio aggiorna il telefono, come fa Expo Go
con `expo start`.

Variabili d'ambiente utili: `ZINC_HEADLESS=1` esegue senza finestra, `ZINC_BACKGROUND=1` (o `zinc --background run`) la apre senza prendere il focus, `ZINC_FRAMES=n` ferma un ciclo di fotogrammi dopo n fotogrammi,
`ZINC_SHOT=out.png` salva l'ultimo fotogramma (`zinc capture` salva dei fotogrammi qualsiasi), `ZINC_DETERMINISTIC=1` mette l'esecuzione su
un orologio virtuale.

Avanti: [il linguaggio](02-language.md).

## Configurare l'editor

`zinc init` scrive un `tsconfig.json` per VS Code (o per qualsiasi editor basato su tsserver): la libreria di Zinc al posto delle
librerie DOM / ES (così `document` o una regex vengono segnalati come farebbe il compilatore), moduli `zinc:*` e plugin risolti,
tag host JSX tipizzati (`View`, `Text`...), e un piccolo plugin di tsserver (`node_modules/zinc-ts-plugin`, collegato a
`lib/editor/zinc-ts-plugin`) che elimina solo le diagnostiche sui figli thunk di Zinc. Per un progetto esistente:

```sh
zinc tsconfig            # or: zinc tsconfig path/to/project
```

Poi usa il TypeScript dell'area di lavoro come al solito; `zinc check` resta il riferimento (codici Z, target).

## Fare il debug

`zinc debug src/main.ts` esegue un programma sotto il debugger da riga di comando: si ferma alla prima istruzione, poi `b main.ts:12`
imposta un punto di interruzione, `c` continua, `n` / `s` / `o` avanzano di un passo (sopra, dentro e fuori), `bt` stampa lo stack e `locals` le variabili (l'elenco completo:
[modalità dev, Debugger](../dev-mode.md#debugger-zinc-debug)).

In VS Code, l'estensione Zinc Debug (`lib/editor/vscode-zinc-debug`) esegue `zinc debug --dap`, un server Debug Adapter Protocol. Collegala alle
estensioni di VS Code una volta sola e riavvia VS Code:

```sh
ln -s "$ZINC_ROOT/lib/editor/vscode-zinc-debug" ~/.vscode/extensions/zinc.zinc-debug-0.1.0   # ZINC_ROOT: this repository
```

Poi `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    { "type": "zinc", "request": "launch", "name": "Zinc: debug", "program": "${workspaceFolder}/src/main.ts", "cwd": "${workspaceFolder}", "stopOnEntry": false }
  ]
}
```

F5 lo avvia: i punti di interruzione nei file `.ts` e `.tsx` (anche dentro gli elementi JSX) fermano il programma, la vista Variabili mostra le variabili locali di ogni
frame dello Stack di chiamate con oggetti e array da espandere, la barra del debug continua, avanza e mette in pausa un programma in esecuzione, e un watch o un
passaggio del mouse sul nome di una variabile locale mostra il suo valore. L'output del programma va nella Console di debug. L'adattatore usa lo `zinc` di questo repository quando
l'estensione è collegata da lì, altrimenti `$ZINC`, altrimenti lo `zinc` nel `PATH`.
