---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 1. Premiers pas

Vos cinq premières minutes, commande après commande : installer, créer un projet, faire un premier changement à l'écran, faire une première erreur et apprendre à la lire.
Les commandes de projet et les messages d'erreur de ce parcours sont exécutés par `tests/t1/first_run.sh` sur chaque modèle, et l'installation par
`tests/t1/install_nocompiler.sh` sur une machine sans compilateur ; les deux tournent sans fenêtre.

## Installer

Une seule commande, et rien à compiler : pas de compilateur, pas de CMake, pas de Xcode, pas de mot de passe d'administrateur. Avec
[Homebrew](https://brew.sh), sur macOS ou Linux :

```sh
brew install frulko/zinc/zinc
```

`brew update && brew upgrade zinc` installe chaque nouvelle version (`zinc update` vous y envoie). Sans Homebrew :

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh
```

Cette commande télécharge le programme `zinc` adapté à votre machine (un Mac, Apple silicon ou Intel ; Linux, x86_64 ou aarch64 ; environ 27 Mo), vérifie son
SHA-256 avec le fichier `SHA256SUMS` de la version, le décompresse dans `~/.zinc/engine` et place un lien `zinc` dans `/usr/local/bin` si vous
pouvez y écrire, sinon dans `~/.local/bin`, qu'elle ajoute à votre `PATH` (`~/.zprofile` ou `~/.profile`). `zinc update`
le met à jour (voir « Mettre à jour » plus bas). Ouvrez un nouveau terminal, puis demandez à zinc ce qu'il voit :

```sh
zinc doctor
```

Le téléchargement contient le moteur, la bibliothèque de fenêtres, les polices, les modèles et les plugins, avec les bibliothèques natives des
plugins déjà compilées (`zinc:system`, `zinc:three`, `zinc:svg`, `zinc:sqlite`, `zinc:audio`, les moteurs de physique et les
autres) : un programme qui les importe démarre tout de suite. `zinc doctor` se termine par les quelques plugins qui n'en ont pas, et pourquoi :
`zinc:video` et `zinc:gphoto2`, par exemple, utilisent des bibliothèques de votre système (FFmpeg, libgphoto2) : le téléchargement contient leurs
sources, et ils sont compilés la première fois qu'un programme les importe, sur une machine qui possède ces bibliothèques et, sur un Mac,
les outils en ligne de commande de Xcode.

Ajoutez `--atelier` pour obtenir aussi Zinc Atelier, l'application qui modifie et lance des projets sans terminal : sur un Mac, elle va dans
`/Applications`, ou dans `~/Applications` si vous ne pouvez pas y écrire ; sur Linux, elle est ajoutée au menu des applications :

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh -s -- --atelier
```

À la main, chaque version propose ces téléchargements sur sa
[page des versions](https://github.com/Frulko/zinc/releases) :

- `zinc-<version>-macos-<arch>.tar.gz` (ou `-linux-<arch>.tar.gz`) : le programme en ligne de commande. Décompressez-le où vous voulez et faites un lien de son `bin/zinc`
  vers un dossier de votre `PATH` (`ln -s "$PWD/zinc-<version>-macos-arm64/bin/zinc" ~/.local/bin/zinc`) ; il retrouve
  ses autres fichiers à côté de lui.
- `Zinc-Atelier-<version>-macos-<arch>.zip` : l'application, avec sa propre copie du moteur. Décompressez-la et glissez « Zinc Atelier » dans
  Applications. Un Mac vous demande de confirmer une application venue d'un navigateur et non notariée : faites un clic droit > Ouvrir sur
  « Zinc Atelier », une seule fois.
- `zinc-<version>-windows-x86_64.zip` : le programme en ligne de commande pour Windows 10 et 11 (`irm .../install.ps1 | iex` dans PowerShell l'installe).
- `Zinc-Atelier-<version>-windows-x86_64.zip` : l'application pour Windows, avec sa propre copie du moteur. Décompressez tout le dossier et
  ouvrez « Zinc Atelier.exe » à l'intérieur. Elle n'est pas encore signée : SmartScreen peut vous demander de confirmer.

### Mettre à jour

```sh
zinc update --check      # is there a newer zinc? (exit 10 when there is)
zinc update              # install it; the previous version is kept
zinc update --rollback   # back to the previous version
```

`zinc update` télécharge la nouvelle version pour votre machine, vérifie sa signature et son SHA-256, et la met à la place de
`~/.zinc/engine` en une seule étape (l'ancienne reste dans `~/.zinc/engine.prev`) ; si quelque chose échoue, rien ne change.
`zinc update --channel beta` suit les versions bêta (`--channel stable` revient en arrière). Quand un zinc plus récent existe, chaque commande
affiche une ligne discrète avec la commande qui met le vôtre à jour (`zinc update`, `brew update && brew upgrade zinc`...), et `zinc doctor` dit si le vôtre est à jour ; la vérification se fait
en arrière-plan et ne ralentit jamais une commande. Désactivez-la avec `export ZINC_NO_UPDATE_CHECK=1` (elle l'est déjà en CI et
quand la sortie n'est pas un terminal). Zinc Atelier a Aide > Rechercher des mises à jour… ; l'application elle-même se met à jour en téléchargeant son
nouveau zip (ou en relançant `install.sh --atelier`). Un zinc compilé depuis les sources se met à jour avec `git pull` et `tools/build zinc`. Un zinc installé avec Homebrew se met à jour avec
`brew update && brew upgrade zinc` (Homebrew lit ses dépôts au plus une fois par jour tout seul).
Détails : [Mettre à jour zinc](07-distribution.md#updating-zinc).

### Depuis les sources

Sur Windows (pas encore de téléchargement), ou pour travailler sur Zinc lui-même, vous compilez le programme `zinc` depuis les sources. Il vous faut git, CMake
3.20 ou plus récent et un compilateur C++20 (sur un Mac : `xcode-select --install`, puis CMake depuis cmake.org ou `brew install cmake`).
Rien d'autre : la bibliothèque de fenêtres (SDL3), les polices et les autres bibliothèques sont dans le dépôt, et Node.js n'est pas nécessaire.

```sh
git clone https://github.com/Frulko/zinc.git
cd zinc
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
tools/build zinc                        # 6 to 8 minutes the first time on a 2019 laptop
sudo ln -s "$PWD/build/zinc" /usr/local/bin/zinc
```

Le lien place `zinc` dans votre `PATH` ; le programme retrouve ses bibliothèques, ses modèles et ses plugins à l'endroit où il a été compilé, donc gardez
le dossier `zinc`. Chaque plugin est ensuite compilé la première fois qu'un programme l'importe.

`zinc doctor` affiche le moteur et l'endroit où sont ses fichiers, cette machine (profil, carte graphique), les outils qu'il téléchargera tout seul le jour où vous
compilerez pour une carte, et les plugins. Rien dans cette liste n'est à installer à la main. `zinc` seul, ou `zinc help`, liste les
commandes ; `zinc help run` décrit l'une d'elles ; une commande mal écrite propose la plus proche (`zinc rnu` : « did you mean 'zinc run'? »).

## Créer un projet et le lancer

```sh
zinc new game my-game
cd my-game
zinc run
```

`zinc new` répond `created my-game (game); next: cd my-game && zinc run`. `zinc run` ouvre une fenêtre avec un carré jaune que
les flèches du clavier déplacent ; le premier lancement affiche `zinc: compiling main.ts for this machine` et prend quelques secondes, les suivants
démarrent tout de suite. Fermez la fenêtre pour arrêter le programme.

`zinc new --list` affiche les modèles. Chacun se lance tel quel :

| modèle | ce que vous obtenez |
| --- | --- |
| `game` | une fenêtre, les flèches du clavier et un carré : la plus petite boucle de jeu (`zinc:gfx`) |
| `game-2d` | un jeu 2D à faire grandir : scènes de titre, de jeu et de fin, clavier, manette et pointeur, sprites SVG, un meilleur score enregistré |
| `canvas` | un dessin avec les appels canvas du web (`zinc:canvas`) : un ciel en dégradé, une étoile qui tourne, des bulles là où vous cliquez |
| `3d` | une scène three.js : des lumières, un sol, un anneau qui tourne ; faites glisser pour tourner autour, molette pour zoomer |
| `desktop-app` | une application de bureau : barre latérale, pages Accueil / Notes / Réglages, un menu d'application, mode sombre, réglages enregistrés |
| `dashboard` | des cartes de chiffres, un graphique en courbe et en barres, des alertes, nourris par une source de données que vous remplacez par la vôtre |
| `stage` | une scène d'objets que vous touchez et glissez (`zinc:stage`, style AS3), légère sur les vieilles tablettes |
| `cli` | un programme en ligne de commande : ses arguments et la plateforme |
| `server` | un serveur HTTP sur le port 3000 avec un compteur de télémétrie (arrêtez-le avec Ctrl-C) |
| `service` | une API HTTP JSON avec des tests et une unité systemd pour une machine Linux ou un Raspberry Pi |
| `iot` | un bouton sur la broche GPIO 27 allume la broche 17 et envoie un message OSC, simulé hors de la carte |
| `iot-board` | un ESP32-S3 avec un capteur de mouvement et un petit écran OLED (un niveau à bulle), le capteur étant émulé sur le bureau |
| `eink` | un carnet reMarkable Paper Pro : une liste de tâches et une page de croquis, affichés dans un émulateur d'encre électronique |
| `remarkable` | un canevas d'encre reMarkable Paper Pro avec annulation |
| `plugin` | un plugin à publier : une API Zinc, une partie native en C++, des tests, un exemple |

`zinc new my-app` sans nom de modèle prend `game`. Le dossier doit être nouveau ou vide.

## Ce que contient le projet

```
my-game/
  zinc.json            the project: its name, its entry, its assets (reference below)
  src/main.ts          the program (main.tsx when it uses JSX)
  assets/              images, fonts and the other files of the program
  tests/smoke.test.ts  a first test: zinc test runs every *.test.ts
  tsconfig.json        for your editor (types of the zinc: modules)
  README.md  .gitignore
```

`build/` (créé par `zinc build`) et `dist/` (créé par `zinc export`) peuvent être supprimés à tout moment. Dans un dossier de projet,
`zinc run`, `zinc check`, `zinc test` et `zinc build` n'ont besoin d'aucun argument ; depuis un autre endroit, donnez le dossier ou le fichier :
`zinc run my-game`, `zinc run my-game/src/main.ts`.

## Un premier changement

Lancez le programme en mode développement : il surveille les fichiers et injecte le nouveau code dans le programme en marche à chaque enregistrement.

```sh
zinc dev
```

Ouvrez `src/main.ts` dans votre éditeur. La dernière ligne de l'image dessine le texte :

```ts
  text(4, 4, 'arrows to move', 0xffffff, 1);
```

Remplacez `arrows to move` par `hello from me` et enregistrez. Le terminal affiche `zinc dev: v1 refreshed src/main.ts (96 ms after the
save)` et la fenêtre montre le nouveau texte sans se fermer : le code de l'enregistrement est échangé dans le programme en marche (Fast Refresh). Changez `0xfeca57` (la couleur du carré, rouge vert bleu en hexadécimal) en `0xff6b6b`, enregistrez : un carré
rouge. Ctrl-C arrête `zinc dev`.

## Une première erreur

Une erreur n'arrête rien : `zinc run` (ou `zinc check`, qui ne fait que vérifier) affiche une ligne par erreur, `file:line:column: error
code: what is wrong`, puis une dernière ligne qui dit quoi faire. Avec `zinc dev`, les mêmes lignes apparaissent dans le terminal et dans une boîte
rouge dans la fenêtre jusqu'au prochain bon enregistrement. Six erreurs que tout le monde fait, et ce que Zinc répond (`my-game/` remplace le chemin
complet qu'il affiche) :

**Un nom mal écrit dans un import** (`isDwon` au lieu de `isDown`) :

```
my-game/src/main.ts:1:53: error Z0101: Cannot find name: 'isDwon' is not exported by 'zinc:gfx' (did you mean 'isDown'?)
my-game/src/main.ts:5:7: error Z0101: Cannot find name: 'isDown'
...
zinc: 5 errors, start with the first. Declare it before use, or fix the spelling. `zinc explain Z0101` shows an example.
```

Corrigez d'abord la première erreur : les quatre autres sont les endroits qui utilisent le nom que l'import n'a pas apporté.

**Un fichier mal écrit dans un import** (`'./confg'` alors que le fichier est `src/config.ts`) :

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: './confg' (no file my-game/src/confg.ts or .tsx; did you mean './config'?)
zinc: 1 error. Fix the path or create the file. `zinc explain Z0119` shows an example.
```

**Une erreur de type** (`let score: number = "ten";`) :

```
my-game/src/main.ts:13:21: error Z0103: Type is not assignable: 'string' to 'number'
zinc: 1 error. Convert explicitly or change the declared type. `zinc explain Z0103` shows an example.
```

Le message dit `number`, comme le programme (sur un ordinateur, c'est un nombre à virgule flottante sur 64 bits, `f64` ; `zinc explain Z0103` en dit plus). Ici : écrivez `10`, ou déclarez
`let score: string`.

**Un module `zinc:` qui n'existe pas** (`'zinc:stoarge'`) :

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:stoarge' (did you mean 'zinc:storage'?)
```

**Un plugin qui n'est pas installé** (`'zinc:confetti'`) :

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:confetti' is not a module of the engine and no plugin of this project provides it (`zinc plugins` lists the ones it has, `zinc plugins search confetti` looks in the index, `zinc add <name>` installs one)
```

`zinc plugins` affiche tous les modules que vous pouvez importer maintenant, avec une ligne de description chacun.

**Une balise JSX restée ouverte** (dans un projet `.tsx` comme `zinc new remarkable`, un `<Text>` sans son `</Text>`) :

```
my-app/src/main.tsx:10:7: error Z0002: Expected a specific token: JSX: <Text> is not closed (line 15 closes </View> instead): add </Text>, or end the tag with />
```

La ligne indiquée est celle de la balise qui a été ouverte, pas l'endroit où l'analyseur a abandonné.

**Un fichier qui n'existe pas** (`zinc run src/mian.ts`) :

```
src/mian.ts:1:1: error Z0119: Cannot find module: no file src/mian.ts (did you mean src/main.ts?)
```

et `zinc run` dans un dossier qui n'est pas un projet dit `zinc: no project here` avec les fichiers qu'il a cherchés.

`zinc explain Z0103` affiche, pour n'importe quel code, pourquoi la règle existe, comment la corriger et un petit exemple.

## Où aller ensuite

`zinc tour` reprend cette page dans votre terminal, en huit étapes qui se vérifient toutes seules : un projet, un lancement, un changement, une
erreur et `zinc explain`, Fast Refresh avec `zinc dev`, un type de programme, la documentation, Zinc Atelier. Il garde votre place
(`zinc tour --list`, `zinc tour 5`, `zinc tour --reset`), dans votre langue. Ensuite, [les leçons](../learn/README.md) continuent.

- **Vous enseignez.** [Le langage](02-language.md) est du TypeScript avec les règles qui y sont listées, et chaque code d'erreur
  s'explique lui-même (`zinc explain`). `zinc new game-2d` est un petit jeu complet à lire et à modifier en classe ; `zinc run examples/breakout` en est
  un autre. `zinc test` lance les fichiers `*.test.ts` d'un projet ([les tests](06-testing.md)). Les programmes tournent de la même façon sur les
  vieilles machines de l'école et sur un Raspberry Pi.
- **Vous fabriquez.** `zinc new iot-board` est un appareil avec un capteur et un écran qui tourne sur votre bureau avec le capteur
  émulé ; son `README.md` continue vers le vrai ESP32. `zinc new iot` est un bouton et une LED sur les broches d'un Raspberry Pi.
  [Les cartes](../boards.md) liste les cartes et écrans pris en charge, [les plugins](05-plugins.md) expliquent comment parler à votre propre matériel.
- **Vous dessinez, animez, jouez.** `zinc run examples/canvas/sketch` est un croquis Canvas 2D et `zinc new 3d` une scène three.js ;
  `zinc run examples/hero` montre ce que l'interface sait faire. Les plugins [canvas2d](../plugins/canvas2d.md), [svg](../plugins/svg.md),
  [lottie](../plugins/lottie.md), [audio](../plugins/audio.md) et [video](../plugins/video.md) sont à un import de distance, et
  [les applications d'interface](03-ui-apps.md) expliquent les écrans faits de composants.

Le reste de cette page est une référence.

## Référence de `zinc.json`

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

| champ | sens |
| --- | --- |
| `name` | nom de l'application ; l'exécutable et `dist/<name>-<target>` portent ce nom |
| `entry` | point d'entrée des sources (`.ts` / `.tsx` / `.js`) |
| `engine` | `"quickjs"` lance le projet sur le moteur QuickJS (TS, TSX et JS : [Empaqueter pour QuickJS](11-quickjs-bundle.md)), `"zinc"` sur les moteurs typés ; sans valeur : QuickJS quand l'entrée est en `.js`, `.mjs` ou un `.qbc` empaqueté (`zinc run --engine quickjs` en ligne de commande l'emporte) |
| `assets` | le dossier des ressources (`assets` par défaut) : ses images et ses polices sont intégrées à l'exécutable, ses fichiers sont lus à l'exécution avec `zinc:assets` (voir [la distribution](07-distribution.md#assets-of-a-built-program)) ; ou un objet `{ dir, rules, groups, profiles, budgets }` pour la construction des ressources (`zinc assets build`, `zinc assets info` : [la construction des ressources](../reports/zinc-next-assets.md)) |
| `splash` | un chemin d'image, ou `{ image, background, fit, minMs, fadeMs }` : affiché dès la première image (aussi par cible, `targets.<id>.splash`) |
| `loading` | `{ screen, groups, minMs, fadeMs }` : l'écran (`default`, `bar` ou un module) affiché pendant le chargement des groupes de ressources avant `main` |
| `launcher` | `{ entry, skippable, targets }` : un module lancé avant le jeu sur les cibles listées (réglages, mods) |
| `version` | version sémantique ; elle va dans le `Info.plist` de macOS, le `.desktop` de Linux, et `README.txt` à l'export |
| `id` | identifiant de bundle ou d'application (`CFBundleIdentifier` de macOS) ; `dev.zinc.<name>` par défaut |
| `icon` | PNG utilisé pour fabriquer le `.icns` de macOS, l'icône Linux, l'icône AppLoad de rmpp et le favicon de wasm (voir [la distribution](07-distribution.md)) |
| `crash` | politique en cas de plantage en version finale : `exit` (par défaut), `redbox` (dessiner l'erreur, attendre) ou `restart` (voir [le mode développement](../dev-mode.md)) |
| `display` | pilote d'affichage pour les écrans qui ne sont pas la fenêtre par défaut (`fbdev`, `ws2812`, `ssd1306`, `st7789`, `rmpp`, `gl`) ; chaîne ou `{ driver, ...options }` |
| `plugins` | options par plugin, qui remplacent les valeurs par défaut de `plugin.json` |
| `pluginDirs` | dossiers supplémentaires où chercher des plugins (relatifs au projet) |
| `targets.<id>` | réglages par cible qui remplacent ceux du profil : `width`, `height`, `heap`, `zoom`, `resize`, `fullscreen`, `kiosk`, `display`, `plugins`, `assets` (`{ profile, ...profile keys }`), `splash`, et les clés propres à une cible (`esp32.wifi`) |

## Cibles et profils

Une **cible** est ce pour quoi vous compilez : `zinc build --target T` compile un exécutable pour une autre machine avec zig, dont la version est fixée (pas de Docker, pas de SDK à
installer) et `zinc export --target T` l'empaquette. Un **profil** est la représentation des nombres, la résolution et le budget de mémoire selon lesquels un
programme est vérifié et lancé : `zinc run app --profile ps1` tourne sur votre ordinateur mais avec des nombres à virgule fixe Q20.12, 320x240 et un
tas de 256 Kio, pour que vous puissiez déboguer le comportement de la virgule fixe sans la console. Les deux sont distincts : un profil n'est jamais une cible de compilation.

| `zinc build --target` | résultat |
| --- | --- |
| `aarch64-linux`, `armhf-linux`, `armv7-linux`, `x86_64-linux` | un exécutable Linux (Raspberry Pi et autres cartes, serveurs) |
| `aarch64-macos`, `x86_64-macos` | un exécutable macOS |
| `x86_64-windows` | un programme en console (`-o name.exe` ; pas encore de fenêtre ni de plugin) |
| `esp32` | un micrologiciel pour l'ESP32 (`zinc run --target esp32`, `zinc flash`) |

`zinc export --target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp|macos|wasm|web|esp32|android|ios` écrit `dist/<name>-<target>/`
(`zinc help export` liste ce que contient chacune) ; `wasm` et `web` produisent un site statique.

Profils (`zinc run --profile`) : `macos`, `linux`, `wasm`, `rpi1`, `rmpp`, `esp32`, `ps1`, `ps2`, `psp`, `vita`, `n3ds`, `chip`,
`pocketchip`, et `sim`, un profil comme `macos` avec un écran de 320x240 et un faux matériel (ce n'est plus une cible Node). Valeurs par défaut par profil (type de
nombre, résolution, typage, tas) : `macos`/`linux`/`sim` f64, graduel, 512 Mio ; `wasm` f64, 64 Mio ; `rpi1` f64, 1280×720, 64 Mio ;
`esp32` f32, strict, 160 Kio ; `ps1` fx12 (pas de FPU), strict, 256 Kio. Changez n'importe laquelle dans `targets.<id>` de `zinc.json`.
Seul macOS est compilé et testé à chaque changement aujourd'hui ; les autres cibles sont listées dans [le tableau des capacités](../targets/capabilities.md).

## Lancer

```sh
zinc run [entry|dir] [--interp|--native] [--engine E] [--profile P] [--simulate D] [-- args]   # compile and run (E: quickjs, jsc, v8, hermes; D: a device of devices/)
zinc check [entry|dir]                                              # the errors, without running
zinc test                                                           # every *.test.ts of the project
zinc build [entry|dir] [-o out] [--target T]                        # an executable in build/
zinc dev [entry|dir] [--no-devtools] [-- args]                      # run, watch, swap each save in (Fast Refresh)
zinc dev [entry|dir] --lan                                          # the same on your phone, with Zinc Go (a QR code)
zinc help [command]
```

`zinc run` compile en code natif un programme qui dessine et garde l'exécutable (`~/.zinc/cache/run`) : le premier lancement d'une
version compile, les suivants démarrent tout de suite ; `--interp` interprète à la place et démarre tout de suite. `zinc dev` injecte chaque enregistrement dans le
programme en marche (ou le relance, et dit pourquoi), avec une boîte rouge en cas d'erreur de compilation et, pour les programmes d'interface, un inspecteur Chrome DevTools sur le port 9229
(voir [le mode développement](../dev-mode.md)). Passez les arguments du programme après `--` ; lisez-les avec `sys.args()`. `zinc dev --lan` sert le projet à
Zinc Go, l'application de lecture pour Android et iOS (`examples/zinc-go`) : scannez le code QR qu'il affiche et chaque enregistrement met à jour le téléphone, comme Expo Go
le fait pour `expo start`.

Variables d'environnement utiles : `ZINC_HEADLESS=1` lance sans fenêtre, `ZINC_BACKGROUND=1` (ou `zinc --background run`) ouvre la fenêtre sans prendre le focus, `ZINC_FRAMES=n` arrête une boucle d'images après n images,
`ZINC_SHOT=out.png` enregistre la dernière image (`zinc capture` enregistre n'importe quelles images), `ZINC_DETERMINISTIC=1` met l'exécution sur
une horloge virtuelle.

Ensuite : [le langage](02-language.md).

## Configurer l'éditeur

`zinc init` écrit un `tsconfig.json` pour VS Code (ou tout éditeur fondé sur tsserver) : la bibliothèque propre à Zinc à la place de
DOM / ES lib (ainsi `document` ou une expression régulière est signalé comme le ferait le compilateur), les modules `zinc:*` et les plugins résolus,
des balises JSX typées (`View`, `Text`...), et un petit plugin tsserver (`node_modules/zinc-ts-plugin`, lié à
`lib/editor/zinc-ts-plugin`) qui supprime seulement les diagnostics sur les enfants « thunk » de Zinc. Pour un projet existant :

```sh
zinc tsconfig            # or: zinc tsconfig path/to/project
```

Utilisez ensuite le TypeScript de l'espace de travail comme d'habitude ; `zinc check` reste la référence (codes Z, cibles).

## Déboguer

`zinc debug src/main.ts` lance un programme sous le débogueur en ligne de commande : il s'arrête à la première instruction, puis `b main.ts:12`
pose un point d'arrêt, `c` continue, `n` / `s` / `o` avancent pas à pas (par-dessus, dans, hors de), `bt` affiche la pile et `locals` les variables (la liste complète :
[mode développement, Débogueur](../dev-mode.md#debugger-zinc-debug)).

Dans VS Code, l'extension Zinc Debug (`lib/editor/vscode-zinc-debug`) lance `zinc debug --dap`, un serveur Debug Adapter Protocol. Liez-la aux
extensions de VS Code une seule fois, puis redémarrez VS Code :

```sh
ln -s "$ZINC_ROOT/lib/editor/vscode-zinc-debug" ~/.vscode/extensions/zinc.zinc-debug-0.1.0   # ZINC_ROOT: this repository
```

Puis `.vscode/launch.json` :

```json
{
  "version": "0.2.0",
  "configurations": [
    { "type": "zinc", "request": "launch", "name": "Zinc: debug", "program": "${workspaceFolder}/src/main.ts", "cwd": "${workspaceFolder}", "stopOnEntry": false }
  ]
}
```

F5 le démarre : les points d'arrêt dans les fichiers `.ts` et `.tsx` (y compris à l'intérieur des éléments JSX) arrêtent le programme, la vue Variables montre les variables locales de chaque
cadre de la pile d'appels, avec les objets et les tableaux à déplier, la barre de débogage continue, avance pas à pas et met en pause un programme en marche, et un point de surveillance ou un
survol du nom d'une variable locale montre sa valeur. La sortie du programme va dans la Console de débogage. L'adaptateur utilise le `zinc` de ce dépôt quand
l'extension en est liée, sinon `$ZINC`, sinon le `zinc` du `PATH`.
