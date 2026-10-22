---
source: dbfb9c4c1347ecc0a9b017910c28097afbe353c5
---
# 1. Primeros pasos

Tus primeros cinco minutos, comando por comando: instalar, un proyecto, un primer cambio en pantalla, un primer error y cómo leerlo.
Los comandos de proyecto y los mensajes de error de este recorrido los ejecuta `tests/t1/first_run.sh` en cada plantilla, y la
instalación la ejecuta `tests/t1/install_nocompiler.sh` en una máquina preparada sin compilador; ambos funcionan sin ventana.

## Instalar

Un solo comando y nada que compilar: sin compilador, sin CMake, sin Xcode, sin contraseña de administrador. Con
[Homebrew](https://brew.sh), en macOS o Linux:

```sh
brew install frulko/zinc/zinc
```

`brew update && brew upgrade zinc` instala cada nueva versión (`zinc update` te envía ahí). Sin Homebrew:

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh
```

Descarga la CLI `zinc` hecha para tu máquina (un Mac, Apple silicon o Intel; Linux, x86_64 o aarch64; unos 27 MB), comprueba
su SHA-256 con el `SHA256SUMS` de la versión, la descomprime en `~/.zinc/engine` y enlaza `zinc` en `/usr/local/bin` si puedes
escribir ahí, y si no en `~/.local/bin`, que añade a tu `PATH` (`~/.zprofile` o `~/.profile`). `zinc update`
la actualiza (mira "Actualizar" más abajo). Abre una terminal nueva y pregunta a zinc qué ve:

```sh
zinc doctor
```

La descarga contiene el motor, la biblioteca de ventanas, las fuentes, las plantillas y los plugins, con las bibliotecas nativas
de los plugins ya compiladas (`zinc:system`, `zinc:three`, `zinc:svg`, `zinc:sqlite`, `zinc:audio`, los motores de física y los
demás): un programa que los importa arranca al instante. `zinc doctor` termina con los pocos plugins que no las tienen, y por qué:
`zinc:video` y `zinc:gphoto2`, por ejemplo, usan bibliotecas de tu sistema (FFmpeg, libgphoto2): la descarga contiene sus
fuentes, y se compilan la primera vez que un programa los importa, en una máquina que tenga esas bibliotecas y, en un Mac,
las herramientas de línea de comandos de Xcode.

Añade `--atelier` para conseguir también Zinc Atelier, la aplicación que edita y ejecuta proyectos sin terminal: en un Mac va a
`/Applications`, o a `~/Applications` cuando no puedes escribir ahí; en Linux se añade al menú de aplicaciones:

```sh
curl -fsSL https://github.com/Frulko/zinc/releases/latest/download/install.sh | sh -s -- --atelier
```

A mano, en cambio, cada versión tiene estas descargas en su
[página de versiones](https://github.com/Frulko/zinc/releases):

- `zinc-<version>-macos-<arch>.tar.gz` (o `-linux-<arch>.tar.gz`): la CLI. Descomprímela donde quieras y enlaza su `bin/zinc`
  en una carpeta de tu `PATH` (`ln -s "$PWD/zinc-<version>-macos-arm64/bin/zinc" ~/.local/bin/zinc`); encuentra el
  resto de sus archivos a su lado.
- `Zinc-Atelier-<version>-macos-<arch>.zip`: la aplicación, con su propia copia del motor. Descomprímela y arrastra "Zinc Atelier" a
  Aplicaciones. Un Mac te pide confirmar una aplicación que llegó por un navegador y no está notarizada: haz clic derecho > Abrir sobre
  "Zinc Atelier" una vez.
- `zinc-<version>-windows-x86_64.zip`: la CLI para Windows 10 y 11 (`irm .../install.ps1 | iex` en PowerShell la instala).
- `Zinc-Atelier-<version>-windows-x86_64.zip`: la aplicación para Windows, con su propia copia del motor. Descomprime la carpeta entera y
  abre "Zinc Atelier.exe" dentro. Aún no está firmada: SmartScreen puede pedirte que lo confirmes.

### Actualizar

```sh
zinc update --check      # is there a newer zinc? (exit 10 when there is)
zinc update              # install it; the previous version is kept
zinc update --rollback   # back to the previous version
```

`zinc update` descarga la nueva versión para tu máquina, comprueba su firma y su SHA-256, y la pone en lugar de
`~/.zinc/engine` de una sola vez (la anterior queda en `~/.zinc/engine.prev`); si algo falla, no cambia nada.
`zinc update --channel beta` sigue las versiones beta (`--channel stable` vuelve atrás). Cuando existe un zinc más nuevo, cada comando
imprime una línea tenue con el comando que actualiza el tuyo (`zinc update`, `brew update && brew upgrade zinc`...), y `zinc doctor` dice si el tuyo está al día; la comprobación se hace en
segundo plano y nunca ralentiza un comando. Desactívala con `export ZINC_NO_UPDATE_CHECK=1` (ya está desactivada en CI y
cuando la salida no es una terminal). Zinc Atelier tiene Ayuda > Buscar actualizaciones…; la aplicación se actualiza descargando su
nuevo zip (o con `install.sh --atelier` otra vez). Un zinc compilado desde las fuentes se actualiza con `git pull` y `tools/build zinc`. Un zinc instalado con Homebrew se actualiza con
`brew update && brew upgrade zinc` (Homebrew lee sus taps como mucho una vez al día por su cuenta).
Detalles: [Actualizar zinc](07-distribution.md#updating-zinc).

### Desde las fuentes

En Windows (aún sin descarga), o para trabajar en el propio Zinc, compilas el programa `zinc` desde las fuentes. Necesitas git, CMake
3.20 o posterior y un compilador C++20 (en un Mac: `xcode-select --install`, y luego CMake desde cmake.org o `brew install cmake`).
Nada más: la biblioteca de ventanas (SDL3), las fuentes y las demás bibliotecas están en el repositorio, y no hace falta Node.js.

```sh
git clone https://github.com/Frulko/zinc.git
cd zinc
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
tools/build zinc                        # 6 to 8 minutes the first time on a 2019 laptop
sudo ln -s "$PWD/build/zinc" /usr/local/bin/zinc
```

El enlace pone `zinc` en tu `PATH`; el programa encuentra sus bibliotecas, plantillas y plugins desde donde se compiló, así que conserva
la carpeta `zinc`. Cada plugin se compila entonces la primera vez que un programa lo importa.

`zinc doctor` imprime el motor y dónde están sus archivos, esta máquina (perfil, GPU), las herramientas que descargará solo el día que
compiles para una placa, y los plugins. Nada de esa lista hay que instalarlo a mano. `zinc` solo, o `zinc help`, lista los
comandos; `zinc help run` describe uno; un comando mal escrito nombra el más cercano (`zinc rnu`: "did you mean 'zinc run'?").

## Crear un proyecto y ejecutarlo

```sh
zinc new game my-game
cd my-game
zinc run
```

`zinc new` responde `created my-game (game); next: cd my-game && zinc run`. `zinc run` abre una ventana con un cuadrado amarillo que
mueven las flechas del teclado; la primera ejecución imprime `zinc: compiling main.ts for this machine` y tarda unos segundos, las siguientes
arrancan al instante. Cierra la ventana para detener el programa.

`zinc new --list` imprime las plantillas. Cada una se ejecuta tal cual:

| plantilla | lo que obtienes |
| --- | --- |
| `game` | una ventana, las flechas del teclado y un cuadrado: el bucle de juego más pequeño (`zinc:gfx`) |
| `game-2d` | un juego 2D para hacerlo crecer: escenas de título, juego y fin de partida, teclado, mando y puntero, sprites SVG, una mejor puntuación guardada |
| `canvas` | un dibujo con las llamadas del canvas de la web (`zinc:canvas`): un cielo en degradado, una estrella que gira, burbujas donde haces clic |
| `3d` | una escena de three.js: luces, un suelo, un anillo que gira; arrastra para orbitar, la rueda para acercar |
| `desktop-app` | una aplicación de escritorio: barra lateral, páginas Inicio / Notas / Ajustes, un menú de aplicación, modo oscuro, ajustes guardados |
| `dashboard` | tarjetas de cifras, un gráfico de líneas y uno de barras, alertas, alimentado por una fuente de datos que sustituyes por la tuya |
| `stage` | una escena de objetos que tocas y arrastras (`zinc:stage`, estilo AS3), ligera en tabletas antiguas |
| `cli` | un programa de línea de comandos: sus argumentos y la plataforma |
| `server` | un servidor HTTP en el puerto 3000 con un contador de telemetría (se detiene con Ctrl-C) |
| `service` | una API HTTP JSON con pruebas y una unidad systemd para un equipo Linux o una Raspberry Pi |
| `iot` | un botón en el GPIO 27 enciende el pin 17 y envía un mensaje OSC, simulado fuera de la placa |
| `iot-board` | un ESP32-S3 con un sensor de movimiento y una pequeña pantalla OLED (un nivel de burbuja), el sensor emulado en el escritorio |
| `eink` | un cuaderno reMarkable Paper Pro: una lista de tareas y una página de dibujo, mostrados en un emulador de papel electrónico |
| `remarkable` | un lienzo de tinta reMarkable Paper Pro con deshacer |
| `plugin` | un plugin para publicar: una API de Zinc, una parte nativa en C++, pruebas, un ejemplo |

`zinc new my-app` sin nombre de plantilla toma `game`. La carpeta debe ser nueva o estar vacía.

## Qué hay en el proyecto

```
my-game/
  zinc.json            the project: its name, its entry, its assets (reference below)
  src/main.ts          the program (main.tsx when it uses JSX)
  assets/              images, fonts and the other files of the program
  tests/smoke.test.ts  a first test: zinc test runs every *.test.ts
  tsconfig.json        for your editor (types of the zinc: modules)
  README.md  .gitignore
```

`build/` (creada por `zinc build`) y `dist/` (creada por `zinc export`) se pueden borrar en cualquier momento. En la carpeta de un proyecto
`zinc run`, `zinc check`, `zinc test` y `zinc build` no necesitan argumento; desde otro sitio da la carpeta o el archivo:
`zinc run my-game`, `zinc run my-game/src/main.ts`.

## Un primer cambio

Inicia el programa en modo dev: vigila los archivos y pone el código nuevo en el programa en marcha cada vez que guardas.

```sh
zinc dev
```

Abre `src/main.ts` en tu editor. La última línea del fotograma dibuja el texto:

```ts
  text(4, 4, 'arrows to move', 0xffffff, 1);
```

Cambia `arrows to move` por `hello from me` y guarda. La terminal imprime `zinc dev: v1 refreshed src/main.ts (96 ms after the
save)` y la ventana muestra el texto nuevo sin cerrarse: el código de lo que guardaste se cambia dentro del programa en marcha (Fast Refresh). Cambia `0xfeca57` (el color del cuadrado, rojo verde azul en hexadecimal) por `0xff6b6b`, guarda: un
cuadrado rojo. Ctrl-C detiene `zinc dev`.

## Un primer error

Un error no detiene nada: `zinc run` (o `zinc check`, que solo comprueba) imprime una línea por error, `file:line:column: error
code: what is wrong`, y una última línea que dice qué hacer. Con `zinc dev` aparecen las mismas líneas en la terminal y en un cuadro
rojo en la ventana hasta el siguiente guardado correcto. Seis errores que todo el mundo comete, y lo que responde Zinc (`my-game/` representa la
ruta completa que imprime):

**Un nombre mal escrito en un import** (`isDwon` en vez de `isDown`):

```
my-game/src/main.ts:1:53: error Z0101: Cannot find name: 'isDwon' is not exported by 'zinc:gfx' (did you mean 'isDown'?)
my-game/src/main.ts:5:7: error Z0101: Cannot find name: 'isDown'
...
zinc: 5 errors, start with the first. Declare it before use, or fix the spelling. `zinc explain Z0101` shows an example.
```

Corrige primero el primer error: los otros cuatro son los lugares que usan el nombre que el import no trajo.

**Un archivo mal escrito en un import** (`'./confg'` cuando el archivo es `src/config.ts`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: './confg' (no file my-game/src/confg.ts or .tsx; did you mean './config'?)
zinc: 1 error. Fix the path or create the file. `zinc explain Z0119` shows an example.
```

**Un error de tipo** (`let score: number = "ten";`):

```
my-game/src/main.ts:13:21: error Z0103: Type is not assignable: 'string' to 'number'
zinc: 1 error. Convert explicitly or change the declared type. `zinc explain Z0103` shows an example.
```

El mensaje dice `number`, como el programa (en un escritorio es un número de coma flotante de 64 bits, `f64`; `zinc explain Z0103` dice más). Aquí: escribe `10`, o declara
`let score: string`.

**Un módulo `zinc:` que no existe** (`'zinc:stoarge'`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:stoarge' (did you mean 'zinc:storage'?)
```

**Un plugin que no está instalado** (`'zinc:confetti'`):

```
my-game/src/main.ts:1:1: error Z0119: Cannot find module: 'zinc:confetti' is not a module of the engine and no plugin of this project provides it (`zinc plugins` lists the ones it has, `zinc plugins search confetti` looks in the index, `zinc add <name>` installs one)
```

`zinc plugins` imprime todos los módulos que puedes importar ahora, con una línea de descripción cada uno.

**Una etiqueta JSX que se queda abierta** (en un proyecto `.tsx` como `zinc new remarkable`, un `<Text>` sin su `</Text>`):

```
my-app/src/main.tsx:10:7: error Z0002: Expected a specific token: JSX: <Text> is not closed (line 15 closes </View> instead): add </Text>, or end the tag with />
```

La línea es la de la etiqueta que se abrió, no el lugar donde el analizador se rindió.

**Un archivo que no está** (`zinc run src/mian.ts`):

```
src/mian.ts:1:1: error Z0119: Cannot find module: no file src/mian.ts (did you mean src/main.ts?)
```

y `zinc run` en una carpeta que no es un proyecto dice `zinc: no project here` con los archivos que buscó.

`zinc explain Z0103` imprime, para cualquier código, por qué existe la regla, cómo corregirlo y un pequeño ejemplo.

## Adónde ir ahora

`zinc tour` recorre esta página otra vez en tu terminal, en ocho pasos que se comprueban solos: un proyecto, una ejecución, un cambio, un
error y `zinc explain`, Fast Refresh con `zinc dev`, un tipo de programa, la documentación, Zinc Atelier. Guarda tu sitio
(`zinc tour --list`, `zinc tour 5`, `zinc tour --reset`), en tu idioma. Después [las lecciones](../learn/README.md) continúan.

- **Enseñas.** [El lenguaje](02-language.md) es TypeScript con las reglas que se listan ahí, y cada código de error se explica solo
  (`zinc explain`). `zinc new game-2d` es un juego pequeño y completo para leer y cambiar en clase; `zinc run examples/breakout` es
  otro. `zinc test` ejecuta los archivos `*.test.ts` de un proyecto ([pruebas](06-testing.md)). Los programas funcionan igual en las
  máquinas viejas de la escuela y en una Raspberry Pi.
- **Fabricas cosas.** `zinc new iot-board` es un dispositivo con un sensor y una pantalla que funciona en tu mesa con el sensor
  emulado; su `README.md` sigue hacia el ESP32 real. `zinc new iot` es un botón y un LED en los pines de una Raspberry Pi.
  [Placas](../boards.md) lista las placas y pantallas compatibles, [plugins](05-plugins.md) cómo hablar con tu propio hardware.
- **Dibujas, animas, actúas.** `zinc run examples/canvas/sketch` es un boceto de Canvas 2D y `zinc new 3d` una escena de three.js;
  `zinc run examples/hero` muestra lo que puede hacer la interfaz. Los plugins [canvas2d](../plugins/canvas2d.md), [svg](../plugins/svg.md),
  [lottie](../plugins/lottie.md), [audio](../plugins/audio.md) y [video](../plugins/video.md) están a un import de distancia, y
  [Aplicaciones de interfaz](03-ui-apps.md) explica pantallas hechas de componentes.

El resto de esta página es referencia.

## Referencia de `zinc.json`

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

| campo | significado |
| --- | --- |
| `name` | nombre de la aplicación; el ejecutable y `dist/<name>-<target>` se nombran con él |
| `entry` | entrada del código fuente (`.ts` / `.tsx` / `.js`) |
| `engine` | `"quickjs"` ejecuta el proyecto en el motor QuickJS (TS, TSX y JS: [Empaquetar para QuickJS](11-quickjs-bundle.md)), `"zinc"` en los motores tipados; sin definir: QuickJS cuando la entrada es `.js`, `.mjs` o un `.qbc` de un paquete (`zinc run --engine quickjs` en la línea de comandos prevalece) |
| `assets` | la carpeta de recursos (por defecto `assets`): sus imágenes y fuentes se incluyen en el ejecutable, sus archivos se leen en tiempo de ejecución con `zinc:assets` (mira [distribución](07-distribution.md#assets-of-a-built-program)); o un objeto `{ dir, rules, groups, profiles, budgets }` para la compilación de recursos (`zinc assets build`, `zinc assets info`: [la compilación de recursos](../reports/zinc-next-assets.md)) |
| `splash` | una ruta de imagen, o `{ image, background, fit, minMs, fadeMs }`: se muestra desde el primer fotograma (también por destino, `targets.<id>.splash`) |
| `loading` | `{ screen, groups, minMs, fadeMs }`: la pantalla (`default`, `bar` o un módulo) que se muestra mientras los grupos de recursos se cargan antes de `main` |
| `launcher` | `{ entry, skippable, targets }`: un módulo que se ejecuta antes del juego en los destinos listados (ajustes, mods) |
| `version` | versión semántica; va al `Info.plist` de macOS, al `.desktop` de Linux y a `README.txt` al exportar |
| `id` | id de paquete/aplicación (`CFBundleIdentifier` de macOS); por defecto `dev.zinc.<name>` |
| `icon` | PNG usado para crear el `.icns` de macOS, el icono de Linux, el icono AppLoad de rmpp y el favicon de wasm (mira [distribución](07-distribution.md)) |
| `crash` | política de fallos en versión final: `exit` (por defecto), `redbox` (dibuja el error y espera) o `restart` (mira [modo dev](../dev-mode.md)) |
| `display` | controlador de pantalla para pantallas que no son la ventana por defecto (`fbdev`, `ws2812`, `ssd1306`, `st7789`, `rmpp`, `gl`); una cadena o `{ driver, ...options }` |
| `plugins` | opciones por plugin, que sustituyen los valores por defecto de `plugin.json` |
| `pluginDirs` | carpetas adicionales de búsqueda de plugins (relativas al proyecto) |
| `targets.<id>` | cambios por destino del perfil: `width`, `height`, `heap`, `zoom`, `resize`, `fullscreen`, `kiosk`, `display`, `plugins`, `assets` (`{ profile, ...profile keys }`), `splash`, y claves propias de un destino (`esp32.wifi`) |

## Destinos y perfiles

Un **destino** es para lo que compilas: `zinc build --target T` compila de forma cruzada un ejecutable con el zig fijado (sin Docker, sin SDK que
instalar) y `zinc export --target T` lo empaqueta. Un **perfil** es la representación de números, la resolución y el presupuesto de memoria con que se
comprueba y ejecuta un programa: `zinc run app --profile ps1` se ejecuta en tu ordenador pero con coma fija Q20.12, 320x240 y un
montón de 256 KiB, para que puedas depurar el comportamiento de la coma fija sin la consola. Son cosas distintas: un perfil nunca es un destino de compilación.

| `zinc build --target` | resultado |
| --- | --- |
| `aarch64-linux`, `armhf-linux`, `armv7-linux`, `x86_64-linux` | un ejecutable de Linux (Raspberry Pi y otras placas, servidores) |
| `aarch64-macos`, `x86_64-macos` | un ejecutable de macOS |
| `x86_64-windows` | un programa de consola (`-o name.exe`; aún sin ventana ni plugin) |
| `esp32` | firmware para el ESP32 (`zinc run --target esp32`, `zinc flash`) |

`zinc export --target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp|macos|wasm|web|esp32|android|ios` escribe `dist/<name>-<target>/`
(`zinc help export` lista lo que contiene cada uno); `wasm` y `web` hacen un sitio estático.

Perfiles (`zinc run --profile`): `macos`, `linux`, `wasm`, `rpi1`, `rmpp`, `esp32`, `ps1`, `ps2`, `psp`, `vita`, `n3ds`, `chip`,
`pocketchip`, y `sim`, un perfil como `macos` con una pantalla de 320x240 y hardware falso (ya no es un destino de Node). Valores por defecto de cada perfil (tipo de
número, resolución, tipado, memoria): `macos`/`linux`/`sim` f64, gradual, 512 MiB; `wasm` f64, 64 MiB; `rpi1` f64, 1280×720, 64 MiB;
`esp32` f32, estricto, 160 KiB; `ps1` fx12 (sin FPU), estricto, 256 KiB. Cambia cualquiera de ellos en `targets.<id>` de `zinc.json`.
Hoy solo macOS se compila y se prueba en cada cambio; los demás destinos se listan en [la tabla de capacidades](../targets/capabilities.md).

## Ejecutar

```sh
zinc run [entry|dir] [--interp|--native] [--engine E] [--profile P] [--simulate D] [-- args]   # compile and run (E: quickjs, jsc, v8, hermes; D: a device of devices/)
zinc check [entry|dir]                                              # the errors, without running
zinc test                                                           # every *.test.ts of the project
zinc build [entry|dir] [-o out] [--target T]                        # an executable in build/
zinc dev [entry|dir] [--no-devtools] [-- args]                      # run, watch, swap each save in (Fast Refresh)
zinc dev [entry|dir] --lan                                          # the same on your phone, with Zinc Go (a QR code)
zinc help [command]
```

`zinc run` compila a código nativo un programa que dibuja y conserva el ejecutable (`~/.zinc/cache/run`): la primera ejecución de una
versión compila, las siguientes arrancan al instante; `--interp` interpreta en su lugar y arranca al instante. `zinc dev` cambia cada guardado dentro del
programa en marcha (o lo reinicia, y dice por qué), con un cuadro rojo ante un error de compilación y, para programas de interfaz, un inspector Chrome DevTools en el puerto 9229
(mira [modo dev](../dev-mode.md)). Pasa argumentos al programa después de `--`; léelos con `sys.args()`. `zinc dev --lan` sirve el proyecto a
Zinc Go, la aplicación reproductora para Android e iOS (`examples/zinc-go`): escanea el código QR que imprime y cada guardado actualiza el teléfono, como Expo Go lo hace
con `expo start`.

Variables de entorno útiles: `ZINC_HEADLESS=1` ejecuta sin ventana, `ZINC_BACKGROUND=1` (o `zinc --background run`) la abre sin quitarte el foco, `ZINC_FRAMES=n` detiene un bucle de fotogramas tras n fotogramas,
`ZINC_SHOT=out.png` guarda el último fotograma (`zinc capture` guarda cualquier fotograma), `ZINC_DETERMINISTIC=1` pone la ejecución en
un reloj virtual.

Siguiente: [el lenguaje](02-language.md).

## Configurar el editor

`zinc init` escribe un `tsconfig.json` para VS Code (o cualquier editor basado en tsserver): la biblioteca propia de Zinc en lugar de la
biblioteca DOM / ES (así `document` o una expresión regular se marcan como lo haría el compilador), módulos `zinc:*` y plugins resueltos,
etiquetas JSX tipadas (`View`, `Text`...), y un pequeño plugin de tsserver (`node_modules/zinc-ts-plugin`, enlazado a
`lib/editor/zinc-ts-plugin`) que solo elimina los diagnósticos sobre los hijos thunk de Zinc. Para un proyecto existente:

```sh
zinc tsconfig            # or: zinc tsconfig path/to/project
```

Después usa el TypeScript del espacio de trabajo como siempre; `zinc check` sigue siendo la referencia (códigos Z, destinos).

## Depurar

`zinc debug src/main.ts` ejecuta un programa bajo el depurador en la línea de comandos: se detiene en la primera instrucción, luego `b main.ts:12`
pone un punto de interrupción, `c` continúa, `n` / `s` / `o` avanzan por encima, dentro y fuera, `bt` imprime la pila y `locals` las variables (la lista completa:
[modo dev, Depurador](../dev-mode.md#debugger-zinc-debug)).

En VS Code, la extensión Zinc Debug (`lib/editor/vscode-zinc-debug`) ejecuta `zinc debug --dap`, un servidor del Debug Adapter Protocol. Enlázala en
las extensiones de VS Code una vez y reinicia VS Code:

```sh
ln -s "$ZINC_ROOT/lib/editor/vscode-zinc-debug" ~/.vscode/extensions/zinc.zinc-debug-0.1.0   # ZINC_ROOT: this repository
```

Después `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    { "type": "zinc", "request": "launch", "name": "Zinc: debug", "program": "${workspaceFolder}/src/main.ts", "cwd": "${workspaceFolder}", "stopOnEntry": false }
  ]
}
```

F5 lo inicia: los puntos de interrupción en archivos `.ts` y `.tsx` (también dentro de elementos JSX) detienen el programa, la vista Variables muestra las locales de cada
marco de la pila de llamadas con objetos y arrays que se despliegan, la barra de depuración continúa, avanza y pausa un programa en marcha, y una expresión vigilada o pasar el ratón
sobre el nombre de una local muestra su valor. La salida del programa va a la Consola de depuración. El adaptador usa el `zinc` de este repositorio cuando
la extensión está enlazada desde él, si no `$ZINC`, si no el `zinc` del `PATH`.
