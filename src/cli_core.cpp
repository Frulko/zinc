#include "cli_web.h"
#include "cli_core.h"
#include "cli_pm.h"
#include "i18n/i18n.h"

#include <cstdio>
#include <cstring>
#include <ctime>
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <sstream>
#include <csignal>
#include <chrono>
#include <fcntl.h>
#include <sys/stat.h>
#include <thread>
#include <tuple>
#ifndef _WIN32   // serial ports (zinc monitor --port) and the dev and hot sockets of zinc dev: POSIX only for now (docs/reports/zinc-windows-port.md)
#include <sys/wait.h>
#include <termios.h>
#include <poll.h>        // zinc new: Esc alone or the start of an arrow key
#include <sys/ioctl.h>   // the width of the terminal
#include <arpa/inet.h>   // zinc dev --lan (ZN-631)
#include <ifaddrs.h>
#include <net/if.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <random>
#endif
#include "qrcodegen.h"

#include "platform/platform.h"
#include "platform/socket.h"
#ifdef _WIN32
#include <process.h>   // getpid
#endif

#include "assets/assets.h"
#include "assets/cook.h"
#include "assets/texture.h"
#include "res/codec.h"
#include "frontend/diagnostics.h"
#include "frontend/modules.h"
#include "frontend/plugin_manifest.h"
#include "frontend/profile.h"
#include "frontend/project.h"
#include "zn/app.h"
#include "zn/devproto.h"
#include "zapp.h"
#include "yyjson.h"
#include "tc/engines.h"
#include "tc/tc.h"
#include "tc/plugin_build.h"
#include "zpk/zpk.h"
#include "tc/policy.h"
#include "tc/tlog.h"
#include "tc/tuf.h"
#define NANOSVG_IMPLEMENTATION
#define NANOSVGRAST_IMPLEMENTATION
#include "../third_party/nanosvg/nanosvg.h"      // an SVG app.icon drawn for a launcher (appIconPng)
#include "../third_party/nanosvg/nanosvgrast.h"
#include "../plugins/display-rmpp/models.h"   // the verified vendor rows: the hash zinc export --target rmpp gives the display lease

namespace fs = std::filesystem;

namespace zn::cli {
namespace {

struct Command { const char* name; const char* usage; const char* summary; const char* detail; };   // summary: its id in i18n/<lang>/cli.json
const Command kCommands[] = {
  {"run", "zinc run [entry|dir] [--interp|--native] [--profile P] [--har file] [--target esp32 ...] [-- args]", "cli.cmd.run",
   "Compiles the entry (a .ts/.tsx/.js file, or a project directory: zinc.json \"entry\", else src/main.ts[x]) and runs it. With no entry it runs the project of the working directory.\n"
   "A program that draws is compiled to native code, as zinc build does, and the executable is cached (~/.zinc/cache/run): the first run of a version compiles, the next ones start at once.\n"
   "  --interp                interpret instead (starts at once; zinc dev and the test runs, ZINC_HEADLESS / ZINC_DETERMINISTIC, interpret too)\n"
   "  --native                compile even a headless or deterministic run\n"
   "  --profile <name>        a target profile (macos, linux, sim, wasm, rpi1, rmpp, esp32, ps1, ps2, psp, vita, n3ds, chip, pocketchip): numbers, heap and typing of that target\n"
   "  --har <file>            write every network request of the run (fetch, WebSocket, MQTT, TCP) as a HAR 1.2 file when the program ends\n"
   "  --simulate <device>     run as on a device of devices/ (hp-touchpad, phone...): its screen, battery, sensors and keys, set in a control panel\n"
   "  --engine quickjs        plain JavaScript on QuickJS-ng (chosen by itself for a .js or .mjs entry, or by zinc.json \"engine\")\n  --engine jsc | v8       the same on JavaScriptCore (the system's, on macOS) or V8 (downloaded and checked on first use: zinc engine), compiled to machine code: faster JavaScript\n  --engine hermes         the same on Hermes (experimental; downloaded and checked on first use: zinc engine; no WebAssembly); zinc build of a project on it precompiles <name>.hbc, run with zinc run build/<name>.hbc\n  --inspect[=port]        Chrome DevTools on an --engine v8 or hermes program (port 9229, chrome://inspect lists it), Safari's Web Inspector on --engine jsc (Develop menu); --inspect-brk[=port] waits for it at the first statement\n  --target esp32 [--port P | --device CMD | --qemu] [--boot-ms N] [--log]   run on the board or the emulator\n  --target esp32 --engine mquickjs [--port P | --emulator [--live]] [--run-ms N]   a zinc:gfx program as JavaScript on the board's MicroQuickJS firmware (zinc flash --target esp32 --engine mquickjs puts it there once): checked on the computer, sent as bytecode, its UART shown; --emulator runs it in esp32sim (built from its sources by cargo on first use) and writes the last frame to ZINC_SHOT or a PNG it names; --live shows it in a window, in real time, the mouse as the touch screen\n  --force                 run although zinc.json \"requires\" is not met\n"
   "Environment: ZINC_HEADLESS=1 (no window), ZINC_FRAMES=n, ZINC_SHOT=file.png, ZINC_DETERMINISTIC=1."},
  {"debug", "zinc debug [entry|dir] [-- args] | zinc debug --dap | zinc debug --cdp[=port] entry", "cli.cmd.debug",
   "Compiles a debug build (every call keeps its frame, each statement and each local is known) and runs it in the interpreter, paused at its first statement.\n"
   "Commands on standard input: b [file:]line [if cond] (break at the first line with code there), log [file:]line message {expr}, d n (delete), c (continue),\n"
   "n (next: over calls), s (step into), o (step out), bt (the stack with lines), locals [frame], closure [frame], globals, p expr, watch expr,\n"
   "catch [uncaught|all|none], q (quit). The standard library and the plugins run without stops. Without a terminal\n"
   "the commands are echoed, so a session can be scripted: zinc debug app.ts < commands.txt.\n"
   "--dap: the Debug Adapter Protocol on standard input and output, the program named by the launch request (VS Code: lib/editor/vscode-zinc-debug).\n"
   "--cdp[=port]: Chrome DevTools' Sources panel on 127.0.0.1:port (9222, in chrome://inspect's default list); the program starts paused when DevTools attaches.\n"
   "A compiled program debugs in lldb: zinc build --debug."},
  {"build", "zinc build [entry|dir] [-o out] [--target T] [--bundle] [--no-embed] [--debug]", "cli.cmd.build",
   "Compiles to C++ and builds an executable (out defaults to build/<project name>). --debug: a debug build for lldb (-g -O0, #line to the .ts lines, locals under their names, functions named after the Zinc ones). --target aarch64-linux|armhf-linux|armv7-linux|x86_64-linux|aarch64-macos|x86_64-macos cross builds with the pinned zig (no Docker); --target x86_64-windows builds a console program (-o name.exe; no window or plugin yet); --bundle makes a macOS .app, with the baked fonts and images in Contents/Resources/<name>.res instead of inside the executable. --no-embed: the same for a plain program, <out>.res beside it (it must stay there: the program reads it at start). A project on a JavaScript engine (zinc.json \"engine\": quickjs, jsc, v8 or hermes) is bundled instead: <out>.js, its map, and on QuickJS <out>.qbc, on Hermes <out>.hbc, its bytecode, which zinc run <out>.qbc|.hbc loads without parsing (the source runs when the bytecode is older or from another engine build)."},
  {"bundle", "zinc bundle [entry|dir] [-o out.js] [--minify] [--sourcemap] [--bytecode] [--check] [--watch]", "cli.cmd.bundle",
   "Bundles a program for the QuickJS engine (the role esbuild, Vite or Rollup play for the web): its TypeScript, TSX and JavaScript, the zinc: modules it imports, its plugins and its packages (tsconfig.json paths, node_modules, importmap.json) become one optimised ES module that `zinc run <out.js>` runs on QuickJS. The JSX is lowered as the typed engine does (className and capitalised components, Z0006 and Z0007), the types are stripped, the engine's native modules stay imports the host answers (zinc:native), and __ZINC_ENGINE__, __ZINC_TARGET__, __ZINC_PROFILE__, __ZINC_CAPS__ and process.env.NODE_ENV are folded in. The linking, tree shaking and minifying are esbuild's: the pinned esbuild is downloaded and verified once into ~/.zinc/toolchains (ZINC_ESBUILD names your own). `zinc run --engine quickjs` needs none of it: it runs the same transformed modules without linking them.\n"
   "  -o <file>        the bundle (default: dist/<entry>.js in the project)\n"
   "  --minify         whitespace, syntax and identifiers (the source map keeps the traces readable)\n"
   "  --sourcemap      <out>.map beside it; zinc run maps the stack traces of the bundle back to your files\n"
   "  --bytecode       also <out>.qbc, QuickJS bytecode: zinc run app.qbc starts without parsing (same QuickJS build only)\n"
   "  --check          only the diagnostics: the transform errors and what QuickJS-ng lacks (Q0001: Temporal, Intl formats, WebAssembly); exit 1 when there are any\n"
   "  --watch          bundle again on each save"},
  {"check", "zinc check [entry|dir]", "cli.cmd.check", "Parses and checks the entry and what it imports; prints the diagnostics (zinc explain <code> describes one). Exit 1 on errors."},
  {"test", "zinc test [--profile P] [--runner interp|aot|quickjs|jsc|v8|hermes|esp32-qemu|devicesim] [dir]", "cli.cmd.test", "Runs the *.test.ts / test-*.ts files and the conformance programs against their goldens: those of dir, else of the project in the current directory, else the engine's tests/conformance."},
  {"new", "zinc new [template|path|git-url|gh:user/repo[@ref]] <dir> | zinc new [<dir>] --from example:<name> | zinc new | zinc new --pick | zinc new --list", "cli.cmd.new", "With no argument it asks nothing: a game in my-game (my-game-2... when that folder is taken). --pick at a terminal asks what to make (the arrows and Enter, or a number), how to write it when that kind has several styles (a game: Drawing, Scene or Canvas; an app with windows: Interface or Scene), and the name of the new folder; in a script, a pipe or CI --pick prints this usage and writes nothing. Copies templates/<template>/ ({{name}}, {{id}} and {{ident}} filled in the files and their names; or a template directory, or a git repository cloned at its default branch or @ref, its commit recorded in zinc.json \"template\"; nothing of the template is run) (zinc.json, sources, assets, tests, README: its README.<lang>.md in the language in force when it has one) into a new or empty directory, writes tsconfig.json for this machine, and says what to do next. zinc new <dir> makes a game; --list prints the templates by what they make. zinc new plugin <dir>: a plugin repository to publish (docs/plugins.md, \"Plugin starter\")."},
  {"examples", "zinc examples [drawing|scene|canvas|interface]", "cli.cmd.examples", "Lists the graded examples of learn/catalog.txt by style, then by stars (one: the first hour; four: a whole program to read), each with its name and one line. They ship with zinc: zinc run example:<name> runs one where it is (zinc dev and zinc check take the name too), zinc new <folder> --from example:<name> copies it into a new folder to change. A name the catalogue does not have gets the closest one. Zinc Atelier shows the same examples on its start view."},
  {"tour", "zinc tour [step] [--list] [--reset] [--auto [--until step] [--dir path]]", "cli.cmd.tour", "A guided first walk in eight steps, in a real project: make it (the zinc new question), run it, change a line, make a mistake and read it with zinc explain, Fast Refresh with zinc dev, choose a kind of program, find the docs, open Zinc Atelier. Each step says what to do and checks by itself that it is done. Progress is kept in $ZINC_HOME/tour.json (~/.zinc/tour.json): zinc tour goes on where you stopped, zinc tour <step> goes to a step, --list shows the steps done, --reset starts again (the project stays). Without a terminal or under CI it asks nothing and prints the steps. --auto does every step itself (the edits too) without a question or a window, up to --until, in --dir (default: zinc-tour in the current directory); exit 1 at the first step that fails."},
  {"learn", "zinc learn [lesson] [--dir path] [--check | --hint | --solve | --unpack] [--json] [--reset]", "cli.cmd.learn", "The lessons of docs/learn as exercises, offline: zinc learn lists them with your progress; zinc learn <number> unpacks one into a folder (./<lesson>, or --dir), prints its step, watches the file and checks the step at each save (zinc check first, then the step's own check), going on to the next step when it passes. While it watches, Enter checks again, h prints a hint, s the solution, q stops. --check, --hint and --solve do it once in the folder (--dir); --json prints the state for Zinc Atelier's lesson panel; --reset starts the lesson over. Progress is kept in $ZINC_HOME/learn.json (~/.zinc/learn.json), shared with Zinc Atelier."},
  {"pack", "zinc pack [dir] [-o app.zapp]","cli.cmd.pack", "Writes build/<name>.zapp: a deterministic ustar with the compiled program, its baked fonts and images, its assets and zinc.json, every file listed with its SHA-256 in manifest.json (and a signature slot). zinc run app.zapp checks and runs it (docs/zapp.md)."},
  {"assets", "zinc assets build|info [dir] [--target T] [--release]", "cli.cmd.assets", "zinc assets info prints the asset profile (texture formats, max size, audio codecs, pack codec) and the budgets in force on each target: targets/capabilities.json, then zinc.json assets.profiles, targets.<id>.assets and assets.budgets. zinc assets build imports every file of the project's assets directory (zinc.json assets.dir; its assets.rules and assets.groups choose importers and packs) (images to premultiplied RGBA, texture rules to the GPU formats of the target's profile through basisu, model rules through gltfpack: a quantised GLB compressed with EXT_meshopt_compression for three or a .zmesh for zinc:3d, world rules a glTF scene to a zinc:3d .zworld with its cells, levels and chunks, the rest copied as is) and writes one ZPK pack per group with report.json (each asset's importer, group, source and output bytes, time) into build/assets/<target> (default: this machine). Artifacts are kept by content in ~/.zinc/cache/assets, so a second build of an unchanged project runs no importer and a changed file is imported alone. --release compresses the packs with the target's codec (zstd, lz4 on the Pi) and encodes textures (a dev build makes rgba8). zinc pack and zinc build do it for this machine, zinc export (release) for its target (docs/reports/zinc-next-assets.md)."},
  {"fuse", "zinc fuse app.zapp [-o app]", "cli.cmd.fuse", "Appends the .zapp to this engine: the result runs the app on a machine without zinc, its arguments going to the app (LOVE's fused mode). This machine's target only for now (ZN-392); zinc export builds with the AOT."},
  {"publish", "zinc publish [dir] --key <seed-hex> [--channel stable|beta] [--notes text] [-o dir] [--target rpi|rpi2|rpi1|<linux target> [--export]] [--hub <url> --token <t>] | [--itch user/game[:suffix]] [--site dir] [--dry-run]", "cli.cmd.publish", "Packs the app (zinc pack) and writes <channel>.manifest beside it, signed with the app's Ed25519 key (zinc update-keygen; its public key is zinc.json update.publicKey). Serve the directory at zinc.json update.url, or send it to a hub (app/hub-server) with --hub and its publisher token. ZINC_UPDATE_SEED and ZINC_HUB_TOKEN stand for --key and --token. --target packs for that machine (zinc pack --target: a Pi's plugins cross-built) and the manifest names it (target=linux-aarch64 for rpi, linux-armv7 for rpi2, linux-armv6 for rpi1); with --export it publishes the export of zinc export --target instead (a .tar of its directory, kind=export): the engine travels with the app. A hub keeps one package per channel and target, and a Pi's player installs the one made for it; without --target the .zapp is for any machine. --itch pushes every export directory of dist/ with itch.io's butler (pinned, fetched and checked once; channels mac, linux-arm64, linux-rpi..., html5, plus -suffix); --dry-run prints the butler commands and uploads nothing. --site writes a static download page: one button per artifact of dist/ (export directories as .tar.gz, .dmg, .deb, .zapp) with its size and SHA-256, and SHA256SUMS."},
  {"update-app", "zinc update-app [dir] [--check] [--channel C] [--url U]", "cli.cmd.update-app", "Fetches the channel manifest of zinc.json update (or of --url), verifies its signature with the app's key, refuses an older version, downloads the .zapp and checks its SHA-256 (into ~/.zinc/apps/<id>/updates). --check exits 10 when an update exists."},
  {"init", "zinc init <dir> [--template name]", "cli.cmd.init", "zinc new with the template given by --template (default game)."},
  {"doctor", "zinc doctor [--details]", "cli.cmd.doctor", "A short, coloured check-up (colours for a terminal only; NO_COLOR turns them off): is the engine ready, the window, the native build tools (macOS: the Xcode command line tools, with the `xcode-select --install` offer), the plugins, and what to do. --details prints the full report. Prints the engine, this machine's renderer tier, the pinned tools zinc downloads on first use (with their SHA-256 and whether they are installed), the host tools and the plugins."},
  {"config", "zinc config [get <key> | set <key> <value> | unset <key>]", "cli.cmd.config", "Your settings, in $ZINC_HOME/config.json (~/.zinc/config.json), which Zinc Atelier reads and writes too.\n  lang  the language of the messages: en, fr, es, it or de. Unset, ZINC_LANG and then the system's language decide; --lang on any command wins for that command.\nzinc config prints them all, zinc config get lang prints one (exit 1 when it is not set), zinc config set lang fr saves one, zinc config unset lang removes it."},
  {"toolchain", "zinc toolchain install [psp|vita|ps2|n3ds|ios-legacy|ppsspp-headless|ppsspp|vita3k|play|pcsx2|azahar]|path|esptool|esbuild|swc|basisu|gltfpack|targets|sha256 <file>", "cli.cmd.toolchain", "install: download and verify zig into ~/.zinc (with a console target: its SDK, pinned the same way); esbuild: the linker of zinc bundle; swc: the lowering to ES5 of --engine mquickjs; basisu and gltfpack: the texture encoder and the model processor of the asset build (their pinned sources built once with that zig); targets: the cross targets."},
  {"explain", "zinc explain <code>", "cli.cmd.explain", "Prints the text of a diagnostic code such as Z0101."},
  {"flash", "zinc flash --target esp32 [--engine mquickjs] [--port P]", "cli.cmd.flash", "Uses the pinned esptool. --engine mquickjs: the MicroQuickJS firmware instead, for zinc run --target esp32 --engine mquickjs."},
  {"engine", "zinc engine list [--available] | install <name>[@version] | update [name] | remove <name>[@version]", "cli.cmd.engine", "The engines beside the built-in QuickJS that are not shipped with zinc (V8) come as packs from the signed plugin index: the first zinc run --engine v8 downloads the newest pack made for this zinc (its engine ABI), checks its length, SHA-256 and signatures, and installs it in ~/.zinc/engines/<name>/<version>. list: the packs installed and the engines built beside zinc (JavaScriptCore on macOS); --available: what the index offers for this machine. install: a pack now, the newest or the version named (a prefix: v8@15.6). update: the newest pack of each installed engine (the older ones are removed); zinc run says once a day when one is newer. remove: a pack. ZINC_ENGINE_V8=<path of libzn_engine_v8> runs your own build instead. zinc export copies the pack an app uses into it."},
  {"update", "zinc update [--check] [--rollback] [--channel stable|beta] [manifest-url]", "cli.cmd.update", "Reads the signed manifest of this machine's CLI archive on the channel (default: the latest release, https://github.com/Frulko/zinc/releases/latest/download/zinc-<os>-<arch>[-beta].manifest; ZINC_UPDATE_REPO=<owner/repo>, ZINC_UPDATE_URL or the argument choose another), and when it is newer downloads the archive, checks its SHA-256 and the manifest's Ed25519 signature, unpacks it beside the engine and swaps the directories: the old engine is kept as <engine>.prev. --check only says (exit 10 when an update exists). --rollback swaps the previous engine back. --channel beta follows the betas from now on. Only a zinc installed by install.sh updates itself; a source build, a package manager or the Atelier app say how to update them. A manifest with signature=none (a release made without the signing key) is refused unless ZINC_UPDATE_ALLOW_UNSIGNED=1. zinc run and zinc dev print one line when a newer zinc exists, checked once a day in the background (ZINC_NO_UPDATE_CHECK=1 turns it off; never in CI, headless or without a terminal)."},
  {"plugins", "zinc plugins [project-dir] [--defines <plugin> [target]] | zinc plugins search [word] | zinc plugins update [plugin...]", "cli.cmd.plugins", "Lists the plugins visible to a project and where they run. search: the plugins and templates of the signed index whose name or description has the word, one line each (kind, name and version, targets, description). update: each dependency added by name moves to the highest version its range (name@^1.2, ~1.2, >=1.2, 1.2) allows, checked like zinc add; one line per plugin that moved."},
  {"capture", "zinc capture <entry|dir> [--frames 1,60] [--every n] [--out dir] [--size WxH]", "cli.cmd.capture", "Runs the program headless and deterministic and writes ZINC_SHOT frames (frame-<n>.png) into --out (default shots/). zinc capture --scene replays a scene dump instead."},
  {"bench", "zinc bench [entry|dir] [--frames n]", "cli.cmd.bench", "Runs headless for n frames (default 120) and prints p50 / p99 / max per phase (app, layout, paint, raster...)."},
  {"export", "zinc export [entry|dir] [--target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp|macos|wasm|web|esp32|android|ios] [-o dir] [--print] [--no-embed] [--deb] [--dmg] [--key <seed-hex>] [--aab | --apk [--release] [--abis list] | --ipa [--simulator]] [--dry-run]", "cli.cmd.export", "dist/<name>-<target>/: the executable (cross built with the pinned zig for another target), run.sh, README.txt, assets/, a .desktop file (Linux) or the .app (macOS); wasm: a static site (index.html, app.js, app.wasm, app.zbc, serve.py); esp32: core.bin, app.bin and flash.sh (--engine mquickjs: firmware.bin, app.img and flash.sh of the MicroQuickJS firmware); android: a Gradle project whose CMake builds the engine and the program with the NDK (--print lists ./gradlew assembleDebug and bundleRelease); ios: a CMake project for CMake's Xcode generator (--print lists the cmake, xcodebuild and simctl commands). --aab builds a release bundle for Google Play (Gradle bundleRelease, signed with the upload key of ZINC_ANDROID_KEYSTORE or zinc.json signing.android, its passwords from ZINC_ANDROID_STORE_PASSWORD and ZINC_ANDROID_KEY_PASSWORD, else the debug keystore) and checks that its 64-bit libraries are aligned to 16 KB; --apk a debug APK (zipalign -c -P 16 too; --abis armeabi-v7a,arm64-v8a,x86_64 picks the ABIs), --apk --release the release APK (not debuggable, signed with the upload key when one is named, else with the debug keystore for an install with adb); --ipa archives and exports an IPA with ExportOptions.plist from zinc.json signing.ios (team or ZINC_IOS_TEAM, method app-store-connect, release-testing, debugging or enterprise, profile), --ipa --simulator a zipped Debug .app for the simulator; --dry-run prints their commands and runs none. An iOS project carries PrivacyInfo.xcprivacy (the required-reason APIs of the engine and the plugins). --no-embed leaves the baked fonts and images out of the executable, in <name>.res beside it (the .app always keeps them in its Resources). --deb also writes dist/<name>_<version>_<arch>.deb (Linux targets; reproducible, written without dpkg); --dmg dist/<name>-<version>.dmg with the .app and an Applications link (macos; the .app needs zinc.json app.id). The .app is signed ad hoc, or by zinc.json \"signing\": { \"identity\", \"keychain\", \"notaryProfile\" } with the hardened runtime and the entitlements of \"permissions\"; the notarization commands are printed. --key (or ZINC_UPDATE_SEED) writes <file>.sig, an Ed25519 signature, beside the executable and the .deb or .dmg: zinc verify checks them. A project on \"engine\": \"jsc\", \"v8\" or \"hermes\" exports for macos only (on \"quickjs\", the macos export is the same .app with app.js and its bytecode app.qbc, no engine pack): <name>.app holds zinc (signed with the JIT entitlement), the program bundled for the engine and the engine's pack (zinc engine), and run.sh starts it."},
  {"add", "zinc add <name | git-url[@ref] | gh:user/repo[@ref] | archive URL> [dir]", "cli.cmd.add", "A name (name@range: ^1.2, ~1.2, >=1.2, 1.2) is looked up in the signed index, the highest version the range allows: its tier (official, or verified for a publisher the index delegates to) and publisher are printed first. Fetches the plugin (git: at its default branch or @ref; an archive: file:// or https://, .tar.gz, .tgz or .tar) into plugins/<name>, records it in zinc.json \"dependencies\" and pins it in zinc.lock: the commit or the archive's sha256, the version and the capabilities plugin.json \"permissions\" asks for (an update asking for a new one is refused until --accept). --key <public key>: the archive's <url>.sig must verify with it, and the key is locked too. Nothing of the plugin is run; links and special files are refused. What each tier guarantees, and what a mirror can and cannot do: docs/guide/08-security.md, \"Plugin distribution: threat model and guarantees\"."},
  {"sign", "zinc sign <file> <seed-hex>", "cli.cmd.sign", "Writes <file>.sig: the detached Ed25519 signature (128 hex digits) that zinc add --key <public key> checks. zinc update-keygen makes a key pair."},
  {"plugin-build", "zinc plugin-build <plugin> [project] [--target T] [--pack file.tar | --prebuild]", "cli.cmd.plugin-build", "Compiles the plugin's native code with the pinned zig into ~/.zinc/cache/<target>/plugins/<name>-<key> (or finds it there) and prints where; the key is the one every client computes for the same sources, options and target. --pack writes it as a deterministic archive: the binaries/<target>/<name>-<key>.tar a plugin index serves (tools/plugin-pack names it). --prebuild copies it into the plugin's prebuilt/<target>/. --target cross-builds it for a Linux target (aarch64-linux, armhf-linux, armv7-linux, x86_64-linux)."},
  {"update-pubkey", "zinc update-pubkey <seed-hex>", "cli.cmd.update-pubkey", "Prints the hex Ed25519 public key of a seed of zinc update-keygen: what update.pub holds for the release key."},
  {"update-keygen", "zinc update-keygen", "cli.cmd.update-keygen", "Prints seed=<64 hex digits>, the Ed25519 secret that signs (zinc sign, zinc publish --key, zinc export --key: keep it secret, for example as a CI secret), and public=<64 hex digits>, the key that checks (plugin.json publisher.publicKey, zinc.json update.publicKey, zinc add --key, zinc verify --key)."},
  {"compat", "zinc compat [--suite wpt,test262,node,quickjs] [--engines next,next-qjs,...] [--filter text] [--check]", "cli.cmd.compat", "Runs the pinned external suites (WPT, test262, quickjs-ng's tests, a Node API set) through this zinc (engines next and next-qjs by default) and the reference engines found, and writes docs/reports/zinc-next-compat.md: the harness of the checkout, tests/compat/run.mjs (needs Node)."},
  {"verify", "zinc verify <file> [--key <public-hex>]", "cli.cmd.verify", "Checks <file>.sig (zinc sign, zinc export --key) against the key, by default zinc.json update.publicKey of the project above the file; exit 1 when the file or the signature changed."},
  {"remove", "zinc remove <plugin> [dir]", "cli.cmd.remove", "Deletes plugins/<plugin> and drops it from zinc.json \"dependencies\" and zinc.lock."},
  {"trust", "zinc trust <plugin> [dir]", "cli.cmd.trust", "A community plugin's publisher key (plugin.json publisher.publicKey, checked against the archive's .sig) is pinned in zinc.json \"lock\" on first use; an archive signed with another key is refused. zinc trust forgets the pinned key, so the next zinc add pins the new one."},
  {"install", "zinc install [--offline] [--frozen] [dir]", "cli.cmd.install", "Fetches every plugin of zinc.lock into plugins/<name> again (a zinc.json dependency not locked yet is added; --frozen refuses when zinc.json and zinc.lock disagree): git at the pinned commit, archives checked against the pinned sha256 (a changed archive is refused). What was fetched once is kept in ~/.zinc/cache/sources by content; --offline (or ZINC_OFFLINE=1) uses only that and names what is missing."},
  {"deploy", "zinc deploy [entry|dir] --target T --device user@host [--dir path] [--print]", "cli.cmd.deploy", "Exports, copies with scp and starts with ssh. --print (or ZINC_DEPLOY_DRY=1) prints the three commands and runs nothing."},
  {"agent", "zinc agent [--port n] [--bind address] [--name name] [--no-shell] [--no-mdns] | zinc agent pair|clients|forget <client> | zinc agent install|uninstall [--print]", "cli.cmd.agent",
   "Runs without a UI on a Linux or macOS machine (port 7733) and announces it on the local network (mDNS, _zinc._tcp). A workstation pairs once with the code the agent shows (zinc agent pair gives a new one: 6 digits, 5 minutes, three tries, one workstation) and gets a key of its own; every session after that is TLS with that key. A paired workstation has a shell as the agent's user (--no-shell turns it off), so the agent refuses to run as root. Its files are in ~/.zinc/agent: apps, logs, the paired workstations (zinc agent clients, zinc agent forget). zinc agent install makes it start with the machine (a launchd agent at login on macOS, a systemd user unit with lingering at boot on Linux; --print shows the file and the commands and touches nothing), zinc agent uninstall removes that. docs/reports/zinc-next-agent.md."},
  {"device", "zinc device list | pair <name|host[:port]> [code] | unpair <device> | [<device>] info|shell|push|pull|deploy|install|run|stop|uninstall|apps|logs|update|forward|reverse|inspect|shot|monitor|top|profile|bench", "cli.cmd.device",
   "list: the agents of the network and the paired devices. pair: with the code the device shows. info [--json]: the kind of machine, system, CPU, memory, load, temperature, disk, engine, apps. shell [-t] [command]: a command with its exit status, or a terminal on the device. push <local> [remote], pull <remote> [local]: a file or a tree. deploy [dir] [--env K=V] [--no-logs] [--inspect] [--pack | --target <t>] [-- args]: the project built for the device, installed, started and its log followed; the transfer says its progress (percent, size, speed) as step lines; --inspect builds it with the inspector in front, as zinc dev does on this machine (zinc device inspect then opens it). On a Raspberry Pi, deploy sends the project sources and assets to its installed engine by default (no cross compilation); QuickJS projects keep their engine, typed projects run interpreted. Missing native plugins may build once on the Pi. Hidden files, build output and root user settings stay out; links and paths outside the project are refused. --target rpi makes the native export instead, and --inspect currently uses that export path. Ctrl-C stops a followed deploy/run; --no-logs leaves it running. The updated Pi image session grants one app the display before it starts and resumes the player after exit. On other machines, what is built follows from what info says the device is: a .zapp (zinc pack) for a machine of this one's system and architecture, else the export of zinc export for its target (rpi for a Raspberry Pi on a 64-bit system, rpi2 and rpi1 on a 32-bit one, linux, x86_64-linux), cross built here and left in dist/; one line says which and why, and a device zinc export has no target for is refused. --pack and --target <t> decide instead. install <app.zapp|export-dir> [--name n], run <app> [-f] [--env K=V] [-- args], stop, uninstall, apps, logs <app> [-f]. An app whose zinc.json has update.publicKey is replaced only by a .zapp signed with that key (zinc sign writes the .sig that install sends) and of a higher version; started and gone at once with an error, the update is rolled back to the version it replaced. update <app> [--url u]: the device fetches the app from its channel (what zinc publish wrote, as zinc update-app checks it); update alone: the engine, as zinc update. forward <local-port|0> <device-port>: a port of the device on this machine (the inspector of an app running there); reverse <device-port|0> <local-port>: a port of this machine on the device, on its own address (a server an app there calls). inspect <app> [--port n]: the app's inspector on a port of this machine, with the address for Chrome DevTools (Zinc Inspector lists the apps of paired devices by itself; a program has an inspector with import 'zinc:devtools'); shot <app> [file.png]: the frame it shows; screen [file.png]: what the device's screen shows now, whoever draws it (the player of a Zinc image, an app, a zinc dev program), screen.png by default; screen --live: that screen in a window here, live, driven by this machine's mouse and keyboard (close the window to stop); monitor <app>: its zinc:telemetry lines as zinc monitor prints them; top [-n count] [--json]: the machine's load, memory and temperature and each app's CPU and memory, every second. profile <app> [--frames n] [-o trace.json] [--env K=V] [-- args]: the installed app run there for n frames (600) with the frame profiler, its log and the profile's summary here, then its trace (<app>-trace.json, for https://ui.perfetto.dev or chrome://tracing). bench [zbench run options: --scene id,id --runs n --frames n --out file.json]: tools/zbench's render suite built for the device, run there and its JSON written here (docs/reports/bench/ or --out); it needs zinc's sources (tools/zbench beside build/). deploy --no-run installs without starting. <device> may be left out when one device is paired; the keys are in ~/.zinc/devices.json."},
  {"tsconfig", "zinc tsconfig [dir]", "cli.cmd.tsconfig", "Writes tsconfig.json with the engine's lib so an editor understands zinc:* modules."},
  {"lint", "zinc lint [--target <profile> | --all-targets] [--json] [--rules] [path]", "cli.cmd.lint", "Rules on the engine's own lexer and loader (zinc lint --rules lists them): the source rules (class in JSX, lowercase tags: the zinc migrate codemod that fixes them), and per target what cannot work or weighs too much there: zinc.json requires, plugins whose plugin.json requires or targets exclude it, @requires modules, styles its UI tier simplifies, fixed sizes beyond its screen, assets against its flash, ram and gpu budgets. The targets in force: --target, else the targets of zinc.json, else this machine; --all-targets adds every profile of targets/capabilities.json and prints the matrix (ok, warns, refuses and why). --json for editors and CI. Exit 1 only for an error on the source or on a target in force (docs/guide/10-lint-migrate.md)."},
  {"doc", "zinc doc [dir] [--std] [--out dir] [--serve [--port n]] | zinc doc --cheatsheet [--out file]", "cli.cmd.doc", "--cheatsheet prints one page, in Markdown, of every function of the engine's modules (lib/*.d.ts) with its signature and the first sentence of its comment (docs/cheatsheet.md). Otherwise it builds the documentation as a static site, as cargo doc does: the API of the code (exported functions, classes, interfaces, types and constants with their signatures and doc comments; a plugin's native spec), the Markdown and MDX pages of the project (zinc.json doc.pages, default docs/) and of its plugins (plugins/<name>/docs/), with search, light and dark themes, code highlighting and copy buttons. A project gets its pages, its API (doc.api, default src/), the plugins of its plugins/ folder and the engine plugins it imports; a plugin folder gets that plugin alone; --std (or the engine's checkout) the engine's guides, standard library and every plugin. MDX components (Steps, Tabs, Callout, Cards, Command, Screenshot, Example, Details, ApiRef) are rendered at build time, with no JavaScript toolchain; docs/theme.css (or doc.theme) overrides the theme's CSS variables. Writes build/doc (--out another folder; --std outside the checkout: ~/.zinc/doc/std) and nothing is fetched. --serve serves it on 127.0.0.1 (port 7878 or the next free one; --port n, --port 0 for any free port), rebuilds it when a source changes and the open pages reload; it opens no browser (docs/guide/14-doc.md)."},
  {"migrate", "zinc migrate [--list] [--dry-run | --apply] [<codemod>...] [paths]", "cli.cmd.migrate", "Runs the codemods (all, or those named; --list prints them with the engine change that needs them) over the .tsx, .jsx and .md files (their ts/tsx/js/jsx fences) of the paths (default: the current directory). --dry-run (the default) prints the diff, --apply writes the files. A codemod rewrites code tokens only: strings, comments and JSX text are left as they are; a second run changes nothing. A diagnostic that has a codemod names it (zinc explain Z0006)."},
  {"infer", "zinc infer <entry|dir>", "cli.cmd.infer", "Lists the Z0109 sites (a parameter or variable whose type is unknown) with file and line."},
  {"dev", "zinc dev [entry|dir] [--target web [--render canvas|dom] [--port n]] [--device name [--perf] [--live] [--force]] [--lan [--port n]] [--no-devtools] [-- args]", "cli.cmd.dev", "Runs the program on the interpreter and watches the project. A saved module is swapped into the running program (Fast Refresh): same process and window, the modules you did not touch keep their state, and the components of the edited files render again (zinc:ui/solid; their own local state starts over). When it cannot, the program restarts from its entry and zinc dev says why in one line: a top-level effect without import.meta.hot.dispose (a module that exports values, not only functions and classes, runs again with its importers), zinc.json or a plugin changed, a program on QuickJS (.js entries, --engine quickjs), a program without a frame loop. A compile error puts a red box with the diagnostics on the screen until the next good save. Programs with a frame loop (zinc:ui, zinc:stage, onFrame) get the Chrome DevTools inspector (chrome://inspect, localhost:9229; another port: zinc.json plugins.devtools.port or ZINC_DEVTOOLS_PORT); a project with \"engine\": \"v8\" or \"hermes\" gets its engine's own inspector there instead (Sources, breakpoints, Console on its JavaScript). A save under the assets directory of a project that packs them (zinc.json assets.rules or assets.groups) rebuilds those assets and swaps them into the running program instead (zinc:assets onReload): the program keeps its state. --device <name> runs the program on a paired device instead (zinc device pair): each save sends it what changed and restarts it there, its output comes back here, a compile error is a red box on its screen and assets are swapped in the same way; its inspector there is forwarded to localhost:9229 of this machine for the session (chrome://inspect; another free port, said, when 9229 is taken; --no-devtools leaves it out). The device's zinc may be another release of the same series (0.6.x), with a note; another series is refused with the way out (zinc device <name> update), and --force tries anyway (the program may crash). --perf shows the performance panel over the program (on the device with --device), --live opens the device's screen in a window here for the session (zinc device <name> screen --live). --lan serves the project to Zinc Go on phones and tablets instead of opening a window (as `expo start` serves Expo Go): it prints a QR code and a zinc://host:port/code link (port 8090 or the next free one; the code keeps other people on the network out), compiles the project for each phone's profile and sends it, swaps each save into the running program in the same way, and prints the program's console here. Open the link on the Android emulator with adb shell am start -a android.intent.action.VIEW -d zinc://10.0.2.2:<port>/<code>, on the iOS simulator with xcrun simctl launch booted dev.zinc.go zinc://127.0.0.1:<port>/<code>."},
  {"monitor", "zinc monitor [file | --port /dev/tty... [--baud n] | --udp port]", "cli.cmd.monitor", "Prints zinc:telemetry JSON lines (hello, metric, event, state_snapshot) from stdin, a file, a serial port or UDP, one readable line each; other lines pass through."},
  {"lsp", "zinc lsp", "cli.cmd.lsp", "Speaks LSP over stdio for an editor: diagnostics (the Z codes of zinc check --json), hover with types, completion (members, names in scope, module specifiers), go to definition, document symbols."},
  {"mem", "zinc mem <file.ts|file.zbc> [--json] [--check-leaks]", "cli.cmd.mem", "Runs a program in the interpreter and reports memory use and live objects at exit. --json writes the report as JSON; --check-leaks exits 4 when objects remain live."},
  {"version", "zinc version", "cli.cmd.version", "Prints the version of this zinc (also zinc --version)."},
  {"help", "zinc help [command]", "cli.cmd.help", "zinc help lists the commands; zinc help <command> describes one."},
};

const Command* findCommand(const std::string& n) { for (const Command& c : kCommands) if (n == c.name) return &c; return nullptr; }
// What `zinc help` shows first: the commands of a first day, then those that make something to give away; `zinc help --all` has the rest
const char* const kStartHere[] = {"new", "run", "dev", "check", "examples", "doctor", "explain", "tour"};
const char* const kShip[] = {"build", "pack", "export", "publish"};
// Two examples at the top of `zinc help <command>` for the commands of a first day
struct Example { const char* command; const char* line; const char* id; };
const Example kExamples[] = {
  {"new", "zinc new", "cli.example.new.game"}, {"new", "zinc new --pick", "cli.example.new.ask"},
  {"run", "zinc run", "cli.example.run.project"}, {"run", "zinc run hello.ts", "cli.example.run.file"},
  {"dev", "zinc dev", "cli.example.dev.project"}, {"dev", "zinc dev --lan", "cli.example.dev.lan"},
  {"check", "zinc check", "cli.example.check.project"}, {"check", "zinc check src/main.ts", "cli.example.check.file"},
  {"doctor", "zinc doctor", "cli.example.doctor.short"}, {"doctor", "zinc doctor --details", "cli.example.doctor.details"},
  {"explain", "zinc explain Z0103", "cli.example.explain.code"}, {"explain", "zinc explain --codes", "cli.example.explain.codes"},
  {"examples", "zinc examples", "cli.example.examples.all"}, {"examples", "zinc run example:breakout", "cli.example.examples.run"},
  {"tour", "zinc tour", "cli.example.tour.go"}, {"tour", "zinc tour --list", "cli.example.tour.list"},
  {"build", "zinc build", "cli.example.build.project"}, {"build", "zinc build --target aarch64-linux", "cli.example.build.target"},
};
}  // namespace
// The documentation site: every link the command line prints starts here (zinc tour's too)
std::string docs(const char* page) { return std::string("https://frulko.github.io/zinc/docs/") + page; }
namespace {

struct Paint {   // colours only for a person at a terminal (NO_COLOR off, ZINC_COLOR=always forces)
  bool on;
  Paint() { const char* f = std::getenv("ZINC_COLOR"); on = (f && !std::strcmp(f, "always")) || (!std::getenv("NO_COLOR") && isatty(1)); }
  std::string c(const char* code, const std::string& s) const { return on ? std::string("\033[") + code + "m" + s + "\033[0m" : s; }
  std::string ok(const std::string& s) const { return c("32", s); }
  std::string warn(const std::string& s) const { return c("33", s); }
  std::string bad(const std::string& s) const { return c("31", s); }
  std::string dim(const std::string& s) const { return c("2", s); }
  std::string bold(const std::string& s) const { return c("1", s); }
  std::string cmd(const std::string& s) const { return c("36", s); }
};
std::string pad(const std::string& s, std::size_t n) { return s.size() >= n ? s : s + std::string(n - s.size(), ' '); }

// ---- templates (ZN-315): templates/<name>/ beside lib/, any files, described by template.json
struct TemplateInfo { std::string name, description, entry; std::vector<std::string> tags, targets, plugins; fs::path dir; };   // plugins: what zinc new adds (ZN-349)
std::vector<std::string> jsonStrings(yyjson_val* a) {
  std::vector<std::string> out;
  std::size_t i, n; yyjson_val* v;
  if (yyjson_is_arr(a)) yyjson_arr_foreach(a, i, n, v) if (yyjson_is_str(v)) out.push_back(yyjson_get_str(v));
  return out;
}
// A template.json: an object with only the known keys (a template cannot ask for anything else, such as a script to run). Empty: valid.
std::string readTemplateInfo(const fs::path& dir, TemplateInfo& t) {
  std::ifstream f(dir / "template.json");
  if (!f) return "no template.json in " + dir.string();
  std::stringstream ss; ss << f.rdbuf();
  const std::string text = ss.str();
  yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
  yyjson_val* r = doc ? yyjson_doc_get_root(doc) : nullptr;
  std::string err;
  if (!yyjson_is_obj(r)) err = "template.json is not a JSON object";
  else {
    static const std::vector<std::string> known = {"name", "description", "tags", "targets", "entry", "variables", "plugins"};   // plugins: added by zinc new (ZN-349)
    std::size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(r, i, n, k, v) if (std::find(known.begin(), known.end(), yyjson_get_str(k)) == known.end() && err.empty()) err = std::string("template.json: unknown key \"") + yyjson_get_str(k) + "\"";
    t.dir = dir;
    t.name = dir.filename().string();
    if (const char* nm = yyjson_get_str(yyjson_obj_get(r, "name"))) t.name = nm;
    if (const char* d = yyjson_get_str(yyjson_obj_get(r, "description"))) t.description = d;
    if (const char* en = yyjson_get_str(yyjson_obj_get(r, "entry"))) t.entry = en;
    t.tags = jsonStrings(yyjson_obj_get(r, "tags"));
    t.targets = jsonStrings(yyjson_obj_get(r, "targets"));
    t.plugins = jsonStrings(yyjson_obj_get(r, "plugins"));
  }
  yyjson_doc_free(doc);
  return err;
}
// Runs a program with its arguments, no shell (a URL cannot inject a command); 0 on success.
int runArgv(const std::vector<std::string>& argv, bool quiet) {
  zn::plat::SpawnOptions o;
  o.quiet = quiet;
  return zn::plat::run(argv, o);
}
// A template given by a git URL (https, ssh, file://, gh:user/repo[@ref]) is cloned into `into` (no hooks of the template run: git copies none,
// and hooks are pointed at nothing); its commit is returned in `commit`. A local directory is used as it is. Empty: done.
std::string fetchTemplate(const std::string& spec, const fs::path& into, fs::path& dir, std::string& source, std::string& commit) {
  std::error_code ec;
  const bool git = spec.rfind("gh:", 0) == 0 || spec.rfind("https://", 0) == 0 || spec.rfind("http://", 0) == 0 || spec.rfind("ssh://", 0) == 0 ||
                   spec.rfind("git@", 0) == 0 || spec.rfind("file://", 0) == 0 || (spec.size() > 4 && spec.compare(spec.size() - 4, 4, ".git") == 0 && !fs::is_directory(spec, ec));
  if (!git) {
    if (!fs::is_directory(spec, ec)) return "no template '" + spec + "': not a template name, a directory or a git URL";
    dir = fs::absolute(spec).lexically_normal();
    source = dir.string();
    return "";
  }
  std::string url = spec, ref;
  if (const std::size_t at = spec.rfind('@'), slash = spec.rfind('/'); at != std::string::npos && slash != std::string::npos && at > slash) { ref = spec.substr(at + 1); url = spec.substr(0, at); }   // url@ref (git@host:... has its @ before the path)
  if (url.rfind("gh:", 0) == 0) url = "https://github.com/" + url.substr(3) + ".git";
  if (runArgv({"git", "-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=always", "clone", "--quiet", "--no-recurse-submodules", "--", url, into.string()}, true) != 0)
    return "cannot clone " + url;
  if (!ref.empty() && runArgv({"git", "-C", into.string(), "-c", "core.hooksPath=/dev/null", "checkout", "--quiet", "--detach", ref}, true) != 0) return "no ref '" + ref + "' in " + url;
  commit.clear();
  if (zn::plat::capture({"git", "-C", into.string(), "rev-parse", "HEAD"}, commit) != 0) commit.clear();
  while (!commit.empty() && (commit.back() == '\n' || commit.back() == '\r')) commit.pop_back();
  if (commit.size() != 40) return "cannot read the commit of " + url;
  dir = into;
  source = url + (ref.empty() ? "" : "@" + ref);
  return "";
}
std::vector<TemplateInfo> listTemplates(const std::string& engineRoot) {
  std::vector<TemplateInfo> out;
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / "templates", ec)) {
    TemplateInfo t;
    if (fs::exists(e.path() / "template.json", ec) && readTemplateInfo(e.path(), t).empty()) { t.name = e.path().filename().string(); out.push_back(t); }
  }
  std::sort(out.begin(), out.end(), [](const TemplateInfo& x, const TemplateInfo& y) { return x.name < y.name; });
  return out;
}
// The kinds of program, in the order zinc new offers them, each with its group and its one line; a template not named here comes last, under More
struct Kind { const char* tmpl; const char* group; const char* blurb; };
const Kind kKinds[] = {
  {"game", "cli.group.games", "cli.template.game"}, {"game-2d", "cli.group.games", "cli.template.game-2d"}, {"canvas", "cli.group.games", "cli.template.canvas"},
  {"desktop-app", "cli.group.apps", "cli.template.desktop-app"}, {"dashboard", "cli.group.apps", "cli.template.dashboard"},
  {"stage", "cli.group.apps", "cli.template.stage"},
  {"3d", "cli.group.3d", "cli.template.3d"},
  {"cli", "cli.group.tools", "cli.template.cli"}, {"server", "cli.group.tools", "cli.template.server"}, {"service", "cli.group.tools", "cli.template.service"},
  {"iot-board", "cli.group.boards", "cli.template.iot-board"}, {"iot", "cli.group.boards", "cli.template.iot"},
  {"eink", "cli.group.boards", "cli.template.eink"}, {"remarkable", "cli.group.boards", "cli.template.remarkable"},
  {"plugin", "cli.group.more", "cli.template.plugin"},
};
const Kind* kindOf(const std::string& name) { for (const Kind& k : kKinds) if (name == k.tmpl) return &k; return nullptr; }
// The styles of writing a program (D161, docs/start/styles.md): a kind of program written in several gets a second question, one line per
// style, each making its own template; a template that is only a style of another kind is offered by that question alone
struct Style { const char* kind; const char* tmpl; const char* line; };
const Style kStyles[] = {
  {"game", "game", "cli.style.drawing"}, {"game", "stage", "cli.style.scene"}, {"game", "canvas", "cli.style.canvas"},
  {"desktop-app", "desktop-app", "cli.style.interface"}, {"desktop-app", "stage", "cli.style.scene"},
};
bool onlyAStyle(const std::string& name) {
  bool style = false;
  for (const Style& s : kStyles) { if (name == s.kind) return false; style = style || name == s.tmpl; }
  return style;
}
std::vector<const TemplateInfo*> byKind(const std::vector<TemplateInfo>& all) {
  std::vector<const TemplateInfo*> out;
  for (const Kind& k : kKinds) for (const TemplateInfo& t : all) if (t.name == k.tmpl) out.push_back(&t);
  for (const TemplateInfo& t : all) if (!kindOf(t.name)) out.push_back(&t);
  return out;
}
std::string blurb(const TemplateInfo& t) {
  if (const Kind* k = kindOf(t.name)) return zn::i18n::tr(k->blurb);
  return t.description.substr(0, t.description.find(". "));   // a template of someone else: its own words, first sentence
}
// The templates by what they make, one line each
void printTemplates(std::FILE* to, const std::vector<TemplateInfo>& ts) {
  std::string group;
  for (const TemplateInfo* t : byKind(ts)) {
    const Kind* k = kindOf(t->name);
    const std::string g = zn::i18n::tr(k ? k->group : "cli.group.more");
    if (g != group) std::fprintf(to, "%s%s\n", group.empty() ? "" : "\n", g.c_str());
    group = g;
    std::fprintf(to, "  %-12s %s\n", t->name.c_str(), blurb(*t).c_str());
  }
}
// {{name}} and {{id}} in a text file; in a JSON file the values are escaped as JSON string contents. A file with a NUL byte is copied as it is.
std::string fillVariables(std::string text, const std::map<std::string, std::string>& vars, bool json) {
  if (text.find('\0') != std::string::npos) return text;
  for (const auto& [k, v] : vars) {
    std::string val = v;
    if (json) { val.clear(); for (char c : v) { if (c == '"' || c == '\\') val += '\\'; val += c; } }
    const std::string key = "{{" + k + "}}";
    for (std::size_t at = text.find(key); at != std::string::npos; at = text.find(key, at + val.size())) text.replace(at, key.size(), val);
  }
  return text;
}

std::string jsonString(const std::string& s) {
  std::string o = "\"";
  for (char c : s) { if (c == '"' || c == '\\') o += '\\'; o += c; }
  return o + "\"";
}

bool writeFile(const fs::path& p, const std::string& text) {
  std::error_code ec;
  fs::create_directories(p.parent_path(), ec);
  std::ofstream f(p, std::ios::binary);
  f << text;
  return static_cast<bool>(f);
}

// The port the project of `entry` gives its inspector (ZN-633): ZINC_DEVTOOLS_PORT, else zinc.json plugins.devtools.port (targets.<host>.plugins.devtools over it), else "":
// the default of plugins/devtools. The inspector reads the variable (native/cdp.next.ts), so `zinc run` exports what the project says.
std::string devtoolsPort(const std::string& entry) {
  if (const char* e = std::getenv("ZINC_DEVTOOLS_PORT"); e && *e) return e;
  const std::string pf = zn::frontend::findProjectFile(entry);
  if (pf.empty()) return "";
  zn::frontend::FoundPlugin devtools;   // the name is enough: the layers of the project are merged over no default
  devtools.manifest.name = "devtools";
  const char* host = zn::plat::osName();
  // ponytail: no engine root here, so a board file's plugins.devtools is not read; pass the root when a board sets the port
  for (const zn::frontend::PluginOption& o : zn::frontend::pluginOptions(devtools, fs::path(pf).parent_path().string(), "", host))
    if (o.key == "port" && !o.cpp.empty() && o.cpp.find_first_not_of("0123456789") == std::string::npos) return o.cpp;
  return "";
}

}  // namespace

// zinc run --simulate <device> (docs/guide/09-web-apis.md "Simulated devices"): the program runs as on that device. Its definition is
// devices/<device>.json (or a path): the screen's size, the battery and its chargers, the sensors, the keys. The control panel
// (app/devicesim, a Zinc program) starts beside it and writes the device's state into a file the host reads (src/host/sys_host.cpp SimDevice);
// the program stops the panel when it ends. A value the definition marks "relay" is this machine's own (a Mac's battery, its network).
bool simulate(std::vector<std::string>& args, const std::string& engineRoot, std::string& err) {
  if (args.size() < 2 || args[1] != "run") return true;
  std::size_t k = 2;
  while (k + 1 < args.size() && args[k] != "--" && args[k] != "--simulate") ++k;
  if (k + 1 >= args.size() || args[k] != "--simulate") return true;
  const std::string name = args[k + 1];
  args.erase(args.begin() + static_cast<std::ptrdiff_t>(k), args.begin() + static_cast<std::ptrdiff_t>(k) + 2);
  std::error_code ec;
  fs::path def = fs::exists(name, ec) ? fs::absolute(name) : fs::path(engineRoot) / "devices" / (name + ".json");
  if (!fs::exists(def, ec)) {
    std::string known;
    for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / "devices", ec)) if (e.path().extension() == ".json") known += " " + e.path().stem().string();
    err = "no device '" + name + "' (devices/<name>.json):" + (known.empty() ? " none" : known);
    return false;
  }
  def = fs::canonical(def, ec);
  const std::string state = (fs::temp_directory_path(ec) / ("zinc-sim-" + std::to_string(getpid()))).string();
  for (const char* x : {"", ".keys", ".app"}) fs::remove(state + x, ec);
  setenv("ZINC_SIM_DEVICE", def.string().c_str(), 1);
  setenv("ZINC_SIM_STATE", state.c_str(), 1);
  // the panel: this engine running app/devicesim, which reads the two variables; its window docks under the program's (targets/macos/hal_sdl.cpp
  // sim_dock) and lays out for the width it gets
  zn::plat::SpawnOptions po;
  po.env = {{"ZINC_SIM_DOCK", state}, {"ZINC_RESIZE", "fill"}};
  po.unset = {"ZINC_SIZE"};
  const zn::plat::Pid panel = zn::plat::spawn({zn::tc::executablePath(), "run", (fs::path(engineRoot) / "app" / "devicesim").string()}, po);
  if (panel > 0) setenv("ZINC_SIM_PANEL", std::to_string(panel).c_str(), 1);
  // the device's screen, unless the run names a size
  if (!getenv("ZINC_SIZE"))
    if (yyjson_doc* doc = yyjson_read_file(def.string().c_str(), 0, nullptr, nullptr)) {
      yyjson_val* s = yyjson_obj_get(yyjson_doc_get_root(doc), "screen");
      const int w = static_cast<int>(yyjson_get_int(yyjson_obj_get(s, "width"))), h = static_cast<int>(yyjson_get_int(yyjson_obj_get(s, "height")));
      if (w > 0 && h > 0) setenv("ZINC_SIZE", (std::to_string(w) + "x" + std::to_string(h)).c_str(), 1);
      yyjson_doc_free(doc);
    }
  for (int i = 0; i < 50 && !fs::exists(state, ec); ++i) std::this_thread::sleep_for(std::chrono::milliseconds(100));   // the panel's first state, up to 5 s (its first run compiles it)
  return true;
}

bool discoverEntry(std::vector<std::string>& args, std::string& err) {
  if (args.size() < 2 || (args[1] != "run" && args[1] != "build" && args[1] != "check")) return true;
  const std::string cmd = args[1];
  // zinc run --har file (ZN-370): the host writes its network log there when the program ends (src/host/netlog.h reads ZINC_HAR; compiled runs inherit it)
  for (std::size_t k = 2; cmd == "run" && k + 1 < args.size() && args[k] != "--"; ++k)
    if (args[k] == "--har") { setenv("ZINC_HAR", fs::absolute(args[k + 1]).string().c_str(), 1); args.erase(args.begin() + static_cast<std::ptrdiff_t>(k), args.begin() + static_cast<std::ptrdiff_t>(k) + 2); break; }
  // the position of the entry: the first argument after the command that is not an option (`--profile esp32` takes its value)
  std::size_t at = 2;
  while (at < args.size() && args[at].rfind("-", 0) == 0 && args[at] != "--") {
    const std::string& a = args[at];
    at += (a == "--profile" || a == "--engine" || a == "--target" || a == "-o" || a == "--port" || a == "--device" || a == "--boot-ms") && at + 1 < args.size() ? 2 : 1;
  }
  const bool hasEntry = at < args.size() && args[at] != "--";
  std::string entry = hasEntry ? args[at] : ".";
  // zinc run on plain JavaScript (ZN-719): a .js or .mjs entry, or zinc.json "engine": "quickjs", runs on QuickJS-ng as `--engine quickjs` does;
  // an engine or a target named on the command line wins, and "engine": "zinc" keeps the typed engines
  bool named = false;
  for (std::size_t k = 2; k < args.size() && args[k] != "--"; ++k) named = named || args[k] == "--engine" || args[k] == "--target";
  auto pickEngine = [&](const std::string& file, const std::string& engine) {
    const std::string ext = fs::path(file).extension().string();
    const bool js = engine == "quickjs" || engine == "jsc" || engine == "v8" || engine == "hermes";   // the JavaScript engines (ZN-773)
    if (cmd != "run" || named || engine == "zinc" || (!js && ext != ".js" && ext != ".mjs" && ext != ".qbc" && ext != ".hbc")) return;   // .qbc: a bundle's bytecode (zinc bundle --bytecode)
    args.insert(args.begin() + static_cast<std::ptrdiff_t>(at) + 1, {"--engine", js ? engine : ext == ".hbc" ? "hermes" : "quickjs"});   // .hbc: Hermes's (zinc build)
  };
  if (cmd == "run") if (const std::string port = devtoolsPort(entry); !port.empty()) setenv("ZINC_DEVTOOLS_PORT", port.c_str(), 1);
  std::error_code ec;
  std::string dirArg = entry;
  if (hasEntry && !fs::is_directory(entry, ec)) {
    if (cmd == "build") {   // a file: `-o` is optional too
      bool hasOut = false;
      for (const std::string& a : args) hasOut = hasOut || a == "-o";
      if (!hasOut) { fs::create_directories("build", ec); args.insert(args.begin() + at + 1, {"-o", "build/" + fs::path(entry).stem().string()}); }
    } else if (cmd == "check" && (at == 2 || args[2].rfind("--", 0) != 0)) args.insert(args.begin() + 2, "--check");
    pickEngine(entry, "");
    return true;
  }
  // a directory (or nothing): the project's entry
  std::string projDir = fs::absolute(dirArg).lexically_normal().string();
  std::string manifestText;
  { std::ifstream f(fs::path(projDir) / "zinc.json"); std::stringstream ss; ss << f.rdbuf(); manifestText = ss.str(); }
  zn::frontend::Project project;
  std::string perr;
  const bool have = !manifestText.empty() && zn::frontend::parseProject(manifestText, project, perr);
  std::string e = zn::frontend::entryOf(projDir, have ? &project : nullptr);
  if (e.empty()) { err = "no project here: " + projDir + " has no zinc.json \"entry\" and no src/main.ts, src/main.tsx, main.ts or main.tsx (zinc init <dir> creates one)"; return false; }
  const std::string name = have && !project.name.empty() ? project.name : fs::path(projDir).filename().string();
  if (have && !project.engine.empty() && project.engine != "quickjs" && project.engine != "jsc" && project.engine != "v8" && project.engine != "hermes" && project.engine != "zinc") { err = projDir + "/zinc.json: \"engine\" must be \"zinc\", \"quickjs\", \"jsc\", \"v8\" or \"hermes\", not \"" + project.engine + "\""; return false; }
  if (cmd == "run") { if (hasEntry) args[at] = projDir; else args.insert(args.begin() + at, projDir); pickEngine(e, have ? project.engine : ""); }
  else if (cmd == "build") {
    if (hasEntry) args[at] = e; else args.insert(args.begin() + at, e);
    bool hasOut = false;
    for (const std::string& a : args) hasOut = hasOut || a == "-o";
    if (!hasOut) { fs::create_directories(fs::path(projDir) / "build", ec); args.insert(args.begin() + at + 1, {"-o", (fs::path(projDir) / "build" / name).string()}); }
  } else {   // check
    if (hasEntry) args[at] = e; else args.insert(args.begin() + at, e);
    args.insert(args.begin() + 2, "--check");
  }
  return true;
}

int unknownCommand(const std::string& name) {
  using zn::i18n::tr;
  if (const Command* c = findCommand(name)) { std::fprintf(stderr, "%s\n%s\n", tr("cli.usage", {{"usage", c->usage}}).c_str(), tr("cli.usage.more", {{"command", c->name}}).c_str()); return 2; }
  // the closest by edit distance; on a tie the commands of a first day win (hlep is two edits from help and from lsp)
  std::vector<std::string> names(std::begin(kStartHere), std::end(kStartHere));
  names.insert(names.end(), std::begin(kShip), std::end(kShip));
  names.push_back("help");
  for (const Command& c : kCommands) if (std::find(names.begin(), names.end(), c.name) == names.end()) names.push_back(c.name);
  std::string guess = zn::frontend::nearest(name, names);   // not `near`: windows.h defines it away
  std::fprintf(stderr, "%s\n", (guess.empty() ? tr("cli.unknown.command", {{"name", name}}) : tr("cli.unknown.guess", {{"name", name}, {"guess", "zinc " + guess}})).c_str());
  return 2;
}

int help(const std::vector<std::string>& args) {
  using zn::i18n::tr;
  const Paint P;
  const std::string topic = args.size() >= 3 ? args[2] : "";
  auto row = [&](const Command& c) { std::printf("  %s %s\n", P.cmd(pad(c.name, 10)).c_str(), tr(c.summary).c_str()); };
  if (topic.empty()) {   // the commands of a first day, then those that ship
    std::printf("%s\n\n%s\n", P.bold(tr("cli.help.title")).c_str(), tr("cli.usage", {{"usage", "zinc <command> [options]"}}).c_str());
    std::printf("\n%s\n", P.bold(tr("cli.help.start")).c_str());
    for (const char* n : kStartHere) row(*findCommand(n));
    std::printf("\n%s\n", P.bold(tr("cli.help.ship")).c_str());
    for (const char* n : kShip) row(*findCommand(n));
    std::printf("\n%s\n\n%s\n%s\n", tr("cli.help.more").c_str(), tr("cli.next.learn", {{"url", docs("learn/")}}).c_str(), tr("cli.next.guide", {{"url", docs("guide/01-getting-started/")}}).c_str());
    return 0;
  }
  if (topic == "--all") {
    std::printf("%s\n\n%s\n\n", P.bold(tr("cli.help.title")).c_str(), tr("cli.usage", {{"usage", "zinc <command> [options]"}}).c_str());
    for (const Command& c : kCommands) row(c);
    std::printf("\n%s\n%s\n%s\n%s\n", tr("cli.help.project").c_str(), tr("cli.help.options").c_str(), tr("cli.help.log").c_str(), tr("cli.help.engine").c_str());
    return 0;
  }
  const Command* c = findCommand(topic);
  if (!c) { std::fprintf(stderr, "%s\n", tr("cli.help.none", {{"name", topic}}).c_str()); return 2; }
  std::printf("%s\n\n", tr("cli.usage", {{"usage", c->usage}}).c_str());
  bool examples = false;
  std::size_t width = 0;
  for (const Example& e : kExamples) if (topic == e.command) width = std::max(width, std::strlen(e.line) + 2);
  for (const Example& e : kExamples) {
    if (topic != e.command) continue;
    if (!examples) std::printf("%s\n", tr("cli.help.examples").c_str());
    examples = true;
    std::printf("  %s %s\n", P.cmd(pad(e.line, width)).c_str(), tr(e.id).c_str());
  }
  std::printf("%s%s\n", examples ? "\n" : "", c->detail);
  return 0;
}

namespace {
// A choice with the arrow keys: the terminal in raw mode, no echo, and Ctrl+C read as a key so that the terminal is always put back
#ifndef _WIN32
struct RawTerminal {
  termios old{};
  bool on = false;
  RawTerminal() {
    const char* term = std::getenv("TERM");
    if ((term && !std::strcmp(term, "dumb")) || tcgetattr(0, &old) != 0) return;
    termios t = old;
    t.c_lflag &= ~static_cast<tcflag_t>(ICANON | ECHO | ISIG);
    t.c_cc[VMIN] = 1;
    t.c_cc[VTIME] = 0;
    on = tcsetattr(0, TCSANOW, &t) == 0;
  }
  ~RawTerminal() { if (on) tcsetattr(0, TCSANOW, &old); }
};
int columns() { winsize w{}; return ioctl(1, TIOCGWINSZ, &w) == 0 && w.ws_col > 20 ? w.ws_col : 80; }
#endif
// `s` cut to `n` characters (UTF-8 code points): a row of the choice must stay on one line for the redraw
std::string fit(const std::string& s, int n) {
  int k = 0;
  for (std::size_t i = 0; i < s.size(); ++i) if ((static_cast<unsigned char>(s[i]) & 0xC0) != 0x80 && ++k > n) return s.substr(0, i);
  return s;
}
// One line typed by the person, without its end; false at the end of the input
bool askLine(const std::string& prompt, std::string& line) {
  std::printf("%s", prompt.c_str());
  std::fflush(stdout);
  char b[512];
  if (!std::fgets(b, sizeof b, stdin)) { std::printf("\n"); return false; }
  line = b;
  while (!line.empty() && (line.back() == '\n' || line.back() == '\r' || line.back() == ' ')) line.pop_back();
  while (!line.empty() && line.front() == ' ') line.erase(0, 1);
  return true;
}
// One of `rows`, chosen with the arrow keys (or j and k) and Enter; -1 when the person leaves (Ctrl+C, Esc, q). Without a raw mode
// (TERM=dumb, Windows) the rows are numbered and a number is typed.
int choose(const std::vector<std::string>& rows, const Paint& P) {
  using zn::i18n::tr;
#ifndef _WIN32
  RawTerminal raw;
  if (raw.on) {
    std::printf("%s\n", P.dim(tr("cli.new.keys")).c_str());
    const int width = columns() - 1;
    int at = 0;
    const int n = static_cast<int>(rows.size());
    for (bool first = true;; first = false) {
      if (!first) std::printf("\033[%dA", n);
      for (int i = 0; i < n; ++i) {
        const std::string line = fit((i == at ? "> " : "  ") + rows[i], width);
        std::printf("\r\033[2K%s\n", i == at ? P.cmd(line).c_str() : line.c_str());
      }
      std::fflush(stdout);
      unsigned char c = 0;
      if (read(0, &c, 1) != 1) return -1;
      if (c == '\r' || c == '\n') return at;
      if (c == 3 || c == 'q') return -1;
      if (c == 'k') at = (at + n - 1) % n;
      else if (c == 'j') at = (at + 1) % n;
      else if (c == 27) {   // Esc alone leaves; Esc [ A and Esc O A (and B) are the arrows
        pollfd pf{0, POLLIN, 0};
        unsigned char seq[2];
        if (poll(&pf, 1, 50) <= 0 || read(0, seq, 2) != 2) return -1;
        if (seq[1] == 'A') at = (at + n - 1) % n;
        if (seq[1] == 'B') at = (at + 1) % n;
      }
    }
  }
#endif
  for (std::size_t i = 0; i < rows.size(); ++i) std::printf("  %2zu. %s\n", i + 1, rows[i].c_str());
  for (std::string line;;) {
    if (!askLine(tr("cli.new.number", {{"max", std::to_string(rows.size())}}) + " ", line)) return -1;
    if (line.empty()) return 0;
    const int k = std::atoi(line.c_str());
    if (k >= 1 && k <= static_cast<int>(rows.size())) return k - 1;
  }
}
// zinc new alone at a terminal: what to make (unless --template said it) and, for a kind with several styles, how to write it; then the
// name of the new folder
bool newWizard(const std::vector<TemplateInfo>& all, bool kindGiven, std::string& tmpl, std::string& dir) {
  using zn::i18n::tr;
  const Paint P;
  if (!kindGiven) {
    std::vector<const TemplateInfo*> order;
    std::vector<std::string> rows;
    for (const TemplateInfo* t : byKind(all))
      if (!onlyAStyle(t->name)) { order.push_back(t); rows.push_back(pad(t->name, 12) + " " + blurb(*t)); }
    std::printf("%s\n", P.bold("? " + tr("cli.new.ask_kind")).c_str());
    const int k = choose(rows, P);
    if (k < 0) return false;
    tmpl = order[static_cast<std::size_t>(k)]->name;
    std::vector<const Style*> styles;
    std::vector<std::string> lines;
    for (const Style& s : kStyles) if (tmpl == s.kind) { styles.push_back(&s); lines.push_back(tr(s.line)); }
    if (styles.size() > 1) {
      std::printf("%s\n", P.bold("? " + tr("cli.new.ask_style")).c_str());
      const int s = choose(lines, P);
      if (s < 0) return false;
      tmpl = styles[static_cast<std::size_t>(s)]->tmpl;
    }
  }
  for (std::string name;;) {
    const std::string fallback = "my-" + tmpl;
    if (!askLine(P.bold("? " + tr("cli.new.ask_name")) + " " + P.dim("(" + fallback + ")") + " ", name)) return false;
    if (name.empty()) name = fallback;
    std::error_code ec;
    if (fs::exists(name, ec) && !fs::is_empty(name, ec)) { std::printf("%s\n", tr("cli.new.taken", {{"dir", name}}).c_str()); continue; }
    dir = name;
    return true;
  }
}
}  // namespace

void nextSteps() {
  using zn::i18n::tr;
  const Paint P;
  std::printf("%s\n", P.bold(tr("cli.start.title")).c_str());
  std::printf("  1. %s %s\n", P.cmd(pad("zinc new", 10)).c_str(), tr("cli.start.new").c_str());
  std::printf("  2. %s %s\n", P.cmd(pad("zinc dev", 10)).c_str(), tr("cli.start.dev").c_str());
  std::printf("  3. %s %s\n", P.cmd(pad("zinc tour", 10)).c_str(), tr("cli.start.tour").c_str());
  std::printf("%s\n%s\n%s\n", tr("cli.next.learn", {{"url", docs("learn/")}}).c_str(), tr("cli.next.guide", {{"url", docs("guide/01-getting-started/")}}).c_str(), tr("cli.start.doctor").c_str());
}

bool welcome(const std::string& version) {
  using zn::i18n::tr;
  const char* ci = std::getenv("CI");
  if (!isatty(0) || !isatty(1) || (ci && *ci) || !setting("welcomed").empty()) return false;
  const Paint P;
  static const char* const names[] = {"English", "Fran\xC3\xA7" "ais", "Espa\xC3\xB1" "ol", "Italiano", "Deutsch"};
  int pick = 0;
  for (int i = 0; i < 5; ++i) if (zn::i18n::language() == zn::i18n::kLanguages[i]) pick = i;
  std::printf("\n%s\n\n%s\n ", P.bold(tr("cli.welcome.title", {{"version", version}})).c_str(), tr("cli.welcome.lang").c_str());
  for (int i = 0; i < 5; ++i) std::printf("  %s %s", P.cmd(std::to_string(i + 1)).c_str(), names[i]);
  std::printf("\n");
  for (std::string line;;) {
    if (!askLine(tr("cli.welcome.choose", {{"default", names[pick]}}) + " ", line)) break;   // no answer: the language found
    if (line.empty()) break;
    const int k = std::atoi(line.c_str());
    if (k >= 1 && k <= 5) { pick = k - 1; break; }
    const std::string m = zn::i18n::match(line);
    bool found = false;
    for (int i = 0; i < 5; ++i) if (m == zn::i18n::kLanguages[i]) { pick = i; found = true; }
    if (found) break;
  }
  zn::i18n::use(zn::i18n::kLanguages[pick]);
  saveSetting("lang", zn::i18n::kLanguages[pick]);
  saveSetting("welcomed", version);
  std::printf("\n");
  nextSteps();
  std::printf("\n%s\n\n", P.dim(tr("cli.welcome.after")).c_str());
  return true;
}

static std::string templateFromIndex(const std::string& name, const std::string& engineRoot, std::string& spec, std::string& path, std::string& tier);
static void printIndexTemplates(const std::string& engineRoot, const std::vector<TemplateInfo>& local);
static std::string policyRefusal(const std::string& tier);
// tsc's and the editor's platform files: this machine's, as `zinc run` takes them ("moduleSuffixes": [".macos", ".native", ""]; docs/react-native.md)
static std::string moduleSuffixesJson() {
  std::string s;
  for (const std::string& x : zn::frontend::platformSuffixes()) s += (s.empty() ? "" : ", ") + jsonString(x);
  return "\"moduleSuffixes\": [" + s + "]";
}

int init(const std::vector<std::string>& args, const std::string& engineRoot) {
  using zn::i18n::tr;
  const std::string cmd = args.size() > 1 ? args[1] : "new";   // `zinc init <dir> --template t` is `zinc new [t] <dir>`
  std::string tmpl = "game";
  std::vector<std::string> pos;
  bool list = false, named = false, pick = false;
  std::string from;
  for (std::size_t i = 2; i < args.size(); ++i) {
    if (args[i] == "--template" && i + 1 < args.size()) { tmpl = args[++i]; named = true; }
    else if (args[i].rfind("--template=", 0) == 0) { tmpl = args[i].substr(11); named = true; }
    else if (args[i] == "--list") list = true;
    else if (args[i] == "--pick" || args[i] == "-i") pick = true;
    else if (args[i] == "--from" && i + 1 < args.size()) from = args[++i];
    else if (args[i].rfind("--from=", 0) == 0) from = args[i].substr(7);
    else if (args[i].rfind("-", 0) != 0) pos.push_back(args[i]);
    else { std::fprintf(stderr, "%s\n%s\n", tr("cli.option.unknown", {{"command", cmd}, {"option", args[i]}}).c_str(), tr("cli.usage", {{"usage", findCommand(cmd.c_str())->usage}}).c_str()); return 2; }
  }
  const std::vector<TemplateInfo> all = listTemplates(engineRoot);
  if (list) {
    printTemplates(stdout, all);
    std::printf("\n%s\n%s\n", tr("cli.new.list_how").c_str(), tr("cli.new.list_choose", {{"url", docs("start/choose/")}}).c_str());
    printIndexTemplates(engineRoot, all);
    return 0;
  }
  TemplateInfo example;   // --from example:<name> (ZN-774.33): that folder of learn/catalog.txt, copied to change; another --from is a template
  if (from.rfind("example:", 0) == 0) {
    std::string err;
    example.dir = exampleDir(from, engineRoot, err);
    if (example.dir.empty()) { std::fprintf(stderr, "%s\n", err.c_str()); return 2; }
    example.name = tmpl = from.substr(8);
    if (pos.empty()) pos.push_back(tmpl);
  } else if (!from.empty()) { tmpl = from; named = true; }
  if (pos.empty() && pick) {   // zinc new --pick: a person at a terminal is asked; a script, a pipe or CI gets the usage and nothing is written
    const char* ci = std::getenv("CI");
    if (!isatty(0) || !isatty(1) || (ci && *ci)) { std::fprintf(stderr, "%s\n%s\n", tr("cli.usage", {{"usage", findCommand(cmd.c_str())->usage}}).c_str(), tr("cli.usage.more", {{"command", cmd}}).c_str()); return 2; }
    std::string dir;
    if (!newWizard(all, named, tmpl, dir)) return 130;
    pos.push_back(dir);
  }
  if (pos.empty()) {   // zinc new alone asks nothing (ZN-774.32): my-game, or my-game-2... when that folder is taken
    std::error_code ec;
    std::string dir = "my-" + tmpl;
    for (int n = 2; fs::exists(dir, ec) && !fs::is_empty(dir, ec); ++n) dir = "my-" + tmpl + "-" + std::to_string(n);
    pos.push_back(dir);
  }
  if (pos.size() > 2 || (pos.size() == 2 && named)) { std::fprintf(stderr, "%s\n", tr("cli.usage", {{"usage", findCommand(cmd.c_str())->usage}}).c_str()); return 2; }
  if (pos.size() == 2) tmpl = pos[0];
  const std::string dir = pos.empty() ? "." : pos.back();
  const TemplateInfo* t = example.dir.empty() ? nullptr : &example;
  if (!t) for (const TemplateInfo& x : all) if (x.name == tmpl) t = &x;
  std::error_code ec;
  bool external = !t && (tmpl.find('/') != std::string::npos || tmpl.find(':') != std::string::npos || tmpl.rfind(".", 0) == 0);
  std::string subdir, tier = t ? "official" : "community";   // the engine's own templates are official; a URL is community (ZN-349)
  if (!t && !external) {   // a name the index knows: its descriptor's source, at its tier
    std::string spec;
    if (templateFromIndex(tmpl, engineRoot, spec, subdir, tier).empty()) { tmpl = spec; external = true; }
  }
  if (const std::string why = policyRefusal(tier); !why.empty()) { std::fprintf(stderr, "zinc %s: template %s: %s\n", cmd.c_str(), tmpl.c_str(), why.c_str()); return 1; }
  if (!t && !external) { std::fprintf(stderr, "%s\n", tr("cli.new.template", {{"command", cmd}, {"template", tmpl}}).c_str()); printTemplates(stderr, all); return 2; }
  if (fs::exists(dir, ec) && !fs::is_empty(dir, ec)) {
    std::fprintf(stderr, "%s\n", tr("cli.new.not_empty", {{"command", cmd}, {"dir", dir}}).c_str());
    printTemplates(stderr, all);
    return 1;
  }
  const std::string name = fs::path(fs::absolute(dir).lexically_normal()).filename().string().empty() ? "app" : fs::path(fs::absolute(dir).lexically_normal()).filename().string();
  std::string id;
  for (char c : name) id += std::isalnum(static_cast<unsigned char>(c)) ? static_cast<char>(std::tolower(static_cast<unsigned char>(c))) : '-';
  std::string ident = std::isdigit(static_cast<unsigned char>(id[0])) ? "_" : "";   // id as a C and TypeScript name: a native module's (ZN-354)
  for (char c : id) ident += c == '-' ? '_' : c;
  const std::map<std::string, std::string> vars{{"name", name}, {"id", id}, {"ident", ident}};
  // a template from a directory or a git URL (ZN-316): fetched into a scratch directory, its template.json checked; nothing of it is run
  TemplateInfo ext;
  std::string source, commit;
  struct Scratch { fs::path p; ~Scratch() { std::error_code e; if (!p.empty()) fs::remove_all(p, e); } } scratch;
  if (external) {
    scratch.p = fs::temp_directory_path(ec) / ("zinc-template-" + std::to_string(getpid()));
    fs::remove_all(scratch.p, ec);
    fs::path tdir;
    std::string err = fetchTemplate(tmpl, scratch.p, tdir, source, commit);
    if (err.empty() && !subdir.empty()) tdir = tdir / subdir;   // a template inside a larger repository (the index names its path)
    if (err.empty()) err = readTemplateInfo(tdir, ext);
    if (err.empty())   // only plain files and directories: a link could name a file outside the template
      for (auto it = fs::recursive_directory_iterator(tdir, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
        if (it->path().filename() == ".git") { it.disable_recursion_pending(); continue; }
        if (it->is_symlink() || (!it->is_regular_file() && !it->is_directory())) { err = "a file outside the template (link or special file): " + fs::relative(it->path(), tdir).string(); break; }
      }
    if (!err.empty()) { std::fprintf(stderr, "zinc %s: %s\n", cmd.c_str(), err.c_str()); return 1; }
    t = &ext;
    tmpl = ext.name;
  }
  fs::path root(dir);
  bool ok = true;
  // the README in the person's language (README.fr.md) becomes README.md when the template has one; the other languages' stay behind
  const std::string readme = "README." + zn::i18n::language() + ".md";
  const bool translated = fs::is_regular_file(t->dir / readme, ec);
  for (auto it = fs::recursive_directory_iterator(t->dir, ec); ok && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (it->path().filename() == ".git" || (it.depth() == 0 && it->path().filename() == "build")) { it.disable_recursion_pending(); continue; }   // build: an example's run output
    if (it->is_symlink() || !it->is_regular_file() || it->path().filename() == "template.json") continue;
    fs::path rel = fs::relative(it->path(), t->dir);
    const std::string r = rel.string();
    if (r == "README.md" ? translated : r.rfind("README.", 0) == 0 && r.size() > 3 && r.compare(r.size() - 3, 3, ".md") == 0) {
      if (r != readme) continue;
      rel = "README.md";
    }
    std::ifstream f(it->path(), std::ios::binary);
    std::stringstream ss; ss << f.rdbuf();
    ok = writeFile(root / fillVariables(rel.string(), vars, false), fillVariables(ss.str(), vars, rel.extension() == ".json"));   // names too: deploy/{{id}}.service
  }
  std::string libFiles;
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / "lib", ec))
    if (e.path().extension() == ".ts" && e.path().filename().string().size() > 5 && e.path().filename().string().rfind(".d.ts") == e.path().filename().string().size() - 5)
      libFiles += (libFiles.empty() ? "" : ",\n    ") + jsonString(fs::weakly_canonical(e.path()).string());
  // the editor configuration names this machine's engine files, so it is written here rather than kept in the template
  ok = ok && writeFile(root / "tsconfig.json", "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\", \"module\": \"ESNext\", \"moduleResolution\": \"Bundler\", \"strict\": true, \"noLib\": true, \"types\": [],\n    \"useUnknownInCatchVariables\": false, \"allowImportingTsExtensions\": true, \"noEmit\": true, \"jsx\": \"preserve\",\n    " + moduleSuffixesJson() + "\n  },\n  \"files\": [\n    " + libFiles + "\n  ],\n  \"include\": [\"src/**/*\", \"*.ts\", \"*.tsx\"]\n}\n");
  if (ok && external) {   // where the project came from: the source and, for git, the pinned commit
    std::ifstream zf(root / "zinc.json");
    std::stringstream zs; zs << zf.rdbuf();
    std::string z = zs.str();
    const std::size_t brace = z.find('{');
    const std::string rec = "\n  \"template\": { \"source\": " + jsonString(source) + (commit.empty() ? "" : ", \"commit\": " + jsonString(commit)) + " },";
    if (brace != std::string::npos) ok = writeFile(root / "zinc.json", z.substr(0, brace + 1) + rec + z.substr(brace + 1));
  }
  if (!ok) { std::fprintf(stderr, "%s\n", tr("cli.new.write", {{"command", cmd}, {"dir", dir}}).c_str()); return 1; }
  for (const std::string& plugin : t->plugins)   // the plugins the template needs, pinned in the new zinc.lock (ZN-349)
    if (addPlugin({"zinc", "add", plugin, fs::absolute(dir).string()}, engineRoot) != 0) { std::fprintf(stderr, "%s\n", tr("cli.new.plugin", {{"command", cmd}, {"plugin", plugin}}).c_str()); return 1; }
  // what to do now: run it with every save shown, the file to change, where to learn
  const Paint P;
  std::printf("%s\n\n%s\n", P.ok(tr("cli.new.done", {{"dir", dir}, {"template", tmpl}})).c_str(), P.bold(tr("cli.next.title")).c_str());
  if (dir != ".") std::printf("  %s\n", P.cmd("cd " + dir).c_str());
  std::printf("  %s %s\n", P.cmd(pad("zinc dev", 10)).c_str(), tr("cli.next.dev").c_str());
  if (!t->entry.empty()) std::printf("  %s\n", tr("cli.next.edit", {{"file", t->entry}}).c_str());
  std::printf("\n%s\n%s\n%s\n", tr("cli.next.learn", {{"url", docs("learn/")}}).c_str(), tr("cli.next.guide", {{"url", docs("guide/01-getting-started/")}}).c_str(), tr("cli.next.tour").c_str());
  return 0;
}

namespace {
int doctorDetails(const std::string& engineRoot, const std::string& rendererLines, const std::string& version) {
  std::printf("zinc-next %s\nengine files: %s\n\nthis machine\n", version.c_str(), engineRoot.c_str());
  std::istringstream is(rendererLines);
  std::string line;
  while (std::getline(is, line)) std::printf("  %s\n", line.c_str());
  std::printf("\npinned tools (downloaded on first use into %s/toolchains, SHA-256 checked before they are unpacked)\n", zn::tc::home().c_str());
  const std::vector<zn::tc::PinnedTool> tools = zn::tc::pinnedTools();
  if (tools.empty()) std::printf("  none pinned for %s: set ZINC_ZIG / ZINC_ESPTOOL / ZINC_QEMU to your own\n", zn::tc::hostName().c_str());
  for (const zn::tc::PinnedTool& t : tools)
    std::printf("  %-20s %-28s %s  %s\n    sha256 %s\n", t.name.c_str(), t.version.c_str(), t.present ? "installed" : "will be downloaded", t.archive.c_str(), t.sha256.c_str());
#if defined(__APPLE__)
  std::printf("\nXcode command line tools: %s\n", zn::tc::xcodeToolsInstalled() ? "installed" : "not installed: run `xcode-select --install`");
  std::printf("  needed for `zinc build` (a native program that draws) and for plugins that link macOS frameworks; `zinc run`, `zinc dev`, `zinc pack` and `zinc fuse` need nothing\n");
#endif
  std::printf("\nconsole SDKs (only to rebuild a console core or for an AOT build: zinc toolchain install <target>)\n");
  for (const zn::tc::ConsoleSdk& s : zn::tc::consoleSdks()) {
    std::string where, why;
    const bool there = zn::tc::consoleSdkPresent(s, where, why);
    std::printf("  %-11s %-10s %s\n", s.target, s.sdk, there ? ("installed: " + where).c_str() : why.c_str());
  }
  std::printf("\nhost tools (only needed to build the engine itself, not to use it)\n");
  for (const char* tool : {"cmake", "c++", "python3", "git", "node"}) {
    std::string cmd = std::string("command -v ") + tool + " >/dev/null 2>&1";
    std::printf("  %-8s %s\n", tool, std::system(cmd.c_str()) == 0 ? "found" : "not found");
  }
  std::printf("\ndisplay: SDL3 is built into the engine (static), no install needed; ZINC_HEADLESS=1 runs without a window\n");
  std::error_code ec;
  int plugins = 0;
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / "plugins", ec)) if (e.is_directory() && fs::exists(e.path() / "plugin.json")) ++plugins;
  std::printf("plugins: %d in %s/plugins (zinc plugins lists them with the targets they run on)\n", plugins, engineRoot.c_str());
  {   // ZN-718: which plugins with native code have no prebuilt library. This machine: the key of prebuilt/<target>/ is checked. The other platform: by the
      // manifest alone (a release prebuilds every plugin that names the platform and needs no system library)
    std::vector<std::string> problems;
    const std::vector<zn::frontend::FoundPlugin> found = zn::frontend::discoverPlugins(engineRoot, ".", problems);
    const std::string here = zn::tc::pluginTarget();
    for (const std::string& target : {here, std::string(here == "macos" ? "linux" : "macos")}) {
      int have = 0;
      std::string without;
      for (const zn::frontend::FoundPlugin& p : found) {
        bool native = p.manifest.kind == "display";
        for (const auto& e : fs::directory_iterator(fs::path(p.dir) / "native", ec)) native = native || (e.path().filename().string().ends_with(".spec.ts") && e.path().filename().string()[0] != '.');
        if (!native) continue;
        const auto ts = p.manifest.targetSettings.find(target);
        std::string why;
        if (ts == p.manifest.targetSettings.end()) why = "does not run there";
        else if (!ts->second.pkg.empty()) {
          why = "needs the system librar" + std::string(ts->second.pkg.size() > 1 ? "ies" : "y");
          for (const std::string& k : ts->second.pkg) why += " " + k;
        } else if (target == here) {
          std::string key;
          std::ifstream in(fs::path(p.dir) / "prebuilt" / target / "key");
          std::getline(in, key);
          if (key != zn::tc::prebuiltKey(p, engineRoot, ".", target)) why = key.empty() ? "built here on first use" : "its prebuilt is of another engine: built here on first use";
        }
        if (why.empty()) ++have; else without += "\n    " + p.manifest.name + ": " + why;
      }
      std::printf("\nplugin libraries for %s%s: %d prebuilt%s%s%s\n", target.c_str(), target == here ? " (this machine)" : " (by the manifests)", have, target == here ? "" : " in a release",
                  without.empty() ? "" : ", none for:", without.c_str());
    }
    std::string rust;   // plugins with Rust code (zinc:loro): cargo builds it the first time a program uses them; zinc never installs it
    for (const zn::frontend::FoundPlugin& p : found)
      if (const auto r = p.manifest.targetSettings.find(here); r != p.manifest.targetSettings.end() && !r->second.cargo.empty()) rust += (rust.empty() ? "" : ", ") + p.manifest.name;
    if (!rust.empty()) std::printf("\nRust (cargo), for the Rust code of %s: %s\n", rust.c_str(), zn::tc::cargoPath().empty() ? "not found: install it from https://rustup.rs to use them (zinc never installs it)" : ("found: " + zn::tc::cargoPath()).c_str());
    std::printf("\nplugin libraries for windows: none, no plugin names the windows target yet\n");
    std::printf("a plugin without a prebuilt library is compiled on first use with the pinned zig (macOS: its frameworks need the Xcode command line tools)\n");
  }
  {   // the trust policy in force here (ZN-346)
    std::error_code ec;
    const zn::tc::Policy& p = zn::tc::loadPolicy(fs::exists("zinc.json", ec) ? fs::current_path(ec).string() : "");
    std::printf("\ntrust policy (system $ZINC_SYSTEM_POLICY or /etc/zinc/policy.json, user ~/.zinc/policy.json, project zinc.json \"policy\")\n%s", zn::tc::describePolicy(p).c_str());
  }
  return 0;
}
}  // namespace


std::string settingsFile() { return zn::tc::home() + "/config.json"; }

std::string setting(const std::string& key) {
  std::string v;
  if (yyjson_doc* doc = yyjson_read_file(settingsFile().c_str(), 0, nullptr, nullptr)) {
    if (const char* s = yyjson_get_str(yyjson_obj_get(yyjson_doc_get_root(doc), key.c_str()))) v = s;
    yyjson_doc_free(doc);
  }
  return v;
}

bool saveSetting(const std::string& key, const std::string& value) {
  // the keys this zinc does not know (Zinc Atelier's own, a newer zinc's) are kept as they are
  yyjson_doc* old = yyjson_read_file(settingsFile().c_str(), 0, nullptr, nullptr);
  yyjson_mut_doc* doc = old && yyjson_is_obj(yyjson_doc_get_root(old)) ? yyjson_doc_mut_copy(old, nullptr) : yyjson_mut_doc_new(nullptr);
  yyjson_doc_free(old);
  yyjson_mut_val* root = yyjson_mut_doc_get_root(doc);
  if (!root) { root = yyjson_mut_obj(doc); yyjson_mut_doc_set_root(doc, root); }
  yyjson_mut_obj_remove_str(root, key.c_str());
  if (!value.empty()) yyjson_mut_obj_add_strcpy(doc, root, key.c_str(), value.c_str());
  std::error_code ec;
  fs::create_directories(zn::tc::home(), ec);
  const bool ok = yyjson_mut_write_file(settingsFile().c_str(), doc, YYJSON_WRITE_PRETTY_TWO_SPACES | YYJSON_WRITE_NEWLINE_AT_END, nullptr, nullptr);
  yyjson_mut_doc_free(doc);
  return ok;
}

int config(const std::vector<std::string>& args) {
  using zn::i18n::tr;
  const std::string op = args.size() > 2 ? args[2] : "";
  const std::string key = args.size() > 3 ? args[3] : "";
  const std::size_t want = op == "set" ? 5 : op == "get" || op == "unset" ? 4 : 2;
  if (args.size() != want || (!op.empty() && op != "get" && op != "set" && op != "unset")) { std::fprintf(stderr, "%s\n", tr("cli.usage", {{"usage", findCommand("config")->usage}}).c_str()); return 2; }
  if (op.empty()) {   // every setting, one per line
    if (yyjson_doc* doc = yyjson_read_file(settingsFile().c_str(), 0, nullptr, nullptr)) {
      std::size_t i, n; yyjson_val *k, *v;
      yyjson_obj_foreach(yyjson_doc_get_root(doc), i, n, k, v) if (yyjson_is_str(v)) std::printf("%s=%s\n", yyjson_get_str(k), yyjson_get_str(v));
      yyjson_doc_free(doc);
    }
    return 0;
  }
  if (key != "lang") { std::fprintf(stderr, "%s\n", tr("cli.config.key", {{"key", key}}).c_str()); return 2; }
  if (op == "get") { const std::string v = setting(key); if (v.empty()) return 1; std::printf("%s\n", v.c_str()); return 0; }
  const std::string lang = op == "set" ? zn::i18n::match(args[4]) : "";
  if (op == "set" && lang.empty()) { std::fprintf(stderr, "%s\n", tr("cli.config.lang", {{"lang", args[4]}}).c_str()); return 2; }
  if (!saveSetting(key, lang)) { std::fprintf(stderr, "%s\n", tr("cli.config.write", {{"file", settingsFile()}}).c_str()); return 1; }
  if (op == "set") { zn::i18n::use(lang); std::printf("%s\n", tr("cli.config.saved").c_str()); }
  return 0;
}

int doctor(const std::string& engineRoot, const std::string& rendererLines, bool details, const std::string& version) {
  if (details) return doctorDetails(engineRoot, rendererLines, version);
  using zn::i18n::tr;
  using zn::i18n::trn;
  const Paint P;
  struct Row { std::string mark, what, note; };
  std::vector<Row> rows;                // printed under the verdict, which needs them all first (ZN-774.03)
  std::vector<std::string> todo;        // what the person can do, in the order of the rows
  auto line = [&](const char* mark, const std::string& what, const std::string& note) { rows.push_back({mark, what, note}); };
  std::string profile = tr("cli.doctor.this_machine"), tier, gpu, renderer;
  { std::istringstream is(rendererLines); std::string l; while (std::getline(is, l)) {
      if (l.rfind("profile ", 0) == 0) profile = l.substr(8); else if (l.rfind("tier ", 0) == 0) tier = l.substr(5);
      else if (l.rfind("gpu ", 0) == 0) gpu = l.substr(4); else if (l.rfind("renderer ", 0) == 0) renderer = l.substr(9); } }
  std::error_code ec;
  if (fs::exists(fs::path(engineRoot) / "lib" / "std", ec)) line("ok", "Zinc " + version, engineRoot);
  else line("bad", "Zinc " + version, tr("cli.doctor.engine_missing", {{"dir", engineRoot}}));   // nothing runs without the standard library
  if (const std::string up = zn::tc::updateStatus(); up == "up to date") line("ok", tr("cli.doctor.up_to_date"), "");
  else if (!up.empty() && up[0] == '?') line("info", tr("cli.doctor.updates"), up.substr(1));
  else if (!up.empty()) { line("warn", tr("cli.doctor.update", {{"version", up}}), tr("cli.doctor.update_this", {{"version", version}})); const std::string how = zn::tc::updateHow();
    todo.push_back(how == "run zinc update" ? tr("cli.doctor.todo.update", {{"command", P.cmd("zinc update")}, {"rollback", P.cmd("zinc update --rollback")}}) : tr("cli.doctor.todo.update_how", {{"how", how}})); }
  line("ok", tr("cli.doctor.window"), tr("cli.doctor.window.note") + (gpu.empty() ? std::string() : "; GPU " + gpu) + (tier.empty() ? std::string() : ", tier " + tier) + (renderer.empty() ? std::string() : ", renderer " + renderer));
  for (const zn::tc::PinnedTool& t : zn::tc::pinnedTools()) {
    if (t.name == "zig") line(t.present ? "ok" : "info", tr("cli.doctor.zig", {{"tool", t.name + " " + t.version}}), tr(t.present ? "cli.doctor.tool_ready" : "cli.doctor.zig.later"));
    if (t.name == "esbuild") line(t.present ? "ok" : "info", tr("cli.doctor.esbuild", {{"tool", t.name + " " + t.version}}), tr(t.present ? "cli.doctor.esbuild.ready" : "cli.doctor.esbuild.later"));
  }
  {   // the engine packs (ZN-773.04): downloaded on first use, so none installed is information
    const std::string packs = zn::tc::engines::summary();
    line(packs.empty() ? "info" : "ok", tr("cli.doctor.engines"), packs.empty() ? tr("cli.doctor.engines.none") : tr("cli.doctor.engines.packs", {{"packs", packs}}));
  }
#if defined(__APPLE__)
  if (zn::tc::xcodeToolsInstalled()) line("ok", tr("cli.doctor.xcode"), tr("cli.doctor.xcode.ok"));
  else { line("warn", tr("cli.doctor.xcode"), tr("cli.doctor.xcode.missing")); todo.push_back(tr("cli.doctor.todo.xcode", {{"command", P.cmd("xcode-select --install")}})); }
#endif
  {   // npm packages (zinc add npm:..., the web target's node_modules): the managers this machine has, Node being only what they run on
    std::string have, none;
    bool node = false;
    for (const auto& [name, found] : zn::cli::packageManagersFound()) {
      if (name == "node") node = !found.empty();
      else if (!found.empty()) have += (have.empty() ? "" : ", ") + name + " " + found.substr(0, found.find(' '));
      else none += (none.empty() ? "" : ", ") + name;
    }
    line(have.empty() ? "info" : "ok", tr("cli.doctor.npm"), (have.empty() ? tr("cli.doctor.npm.none") : have) + "; " + tr(node ? "cli.doctor.npm.node" : "cli.doctor.npm.no_node") + (none.empty() ? "" : " (" + tr("cli.doctor.npm.missing", {{"list", none}}) + ")"));
  }
  {   // the plugins with native code: a missing prebuilt library is built on first use, which is information, not a failure (the console SDKs,
      // the iPhone 4S SDK and cargo are rows of --details: a beginner never needs them)
    std::vector<std::string> problems;
    const std::vector<zn::frontend::FoundPlugin> found = zn::frontend::discoverPlugins(engineRoot, ".", problems);
    const std::string here = zn::tc::pluginTarget();
    int total = 0, ready = 0;
    for (const zn::frontend::FoundPlugin& p : found) {
      bool native = p.manifest.kind == "display";
      for (const auto& e : fs::directory_iterator(fs::path(p.dir) / "native", ec)) native = native || (e.path().filename().string().ends_with(".spec.ts") && e.path().filename().string()[0] != '.');
      if (!native || p.manifest.targetSettings.find(here) == p.manifest.targetSettings.end()) continue;
      ++total;
      if (fs::exists(fs::path(p.dir) / "prebuilt" / here, ec)) ++ready;
    }
    if (total == 0) line("ok", tr("cli.doctor.plugins"), tr("cli.doctor.plugins.none"));
    else if (ready == total) line("ok", tr("cli.doctor.plugins"), trn("cli.doctor.plugins.all", total));
    else line("info", tr("cli.doctor.plugins"), ready == 0 ? tr("cli.doctor.plugins.first_use") : trn("cli.doctor.plugins.some", ready));
  }
  bool bad = false;
  for (const Row& r : rows) bad = bad || r.mark == "bad";
  std::printf("\n  %s  %s\n  %s\n\n", P.bold("Zinc doctor").c_str(), P.dim(tr("cli.doctor.on", {{"version", version}, {"profile", profile}})).c_str(), P.dim(tr("cli.doctor.intro")).c_str());
  std::printf("  %s %s\n\n", bad ? P.bad("\xE2\x9C\x97").c_str() : P.ok("\xE2\x9C\x93").c_str(), P.bold(tr(bad ? "cli.doctor.not_ready" : "cli.doctor.ready")).c_str());
  for (const Row& r : rows) {
    const std::string m = r.mark == "ok" ? P.ok("[\xE2\x9C\x93]") : r.mark == "warn" ? P.warn("[!]") : r.mark == "bad" ? P.bad("[\xE2\x9C\x97]") : P.dim("[\xE2\x80\xA2]");
    std::printf(" %s %s%s\n", m.c_str(), P.bold(r.what).c_str(), r.note.empty() ? "" : ("  " + P.dim(r.note)).c_str());
  }
  std::printf("\n");
  if (!todo.empty()) {
    std::printf("  %s\n", P.bold(tr("cli.doctor.worth")).c_str());
    for (const std::string& t : todo) std::printf("   \xE2\x80\xA2 %s\n", t.c_str());
    std::printf("\n");
  }
  if (!bad) std::printf("  %s  %s\n\n", P.dim(tr("cli.doctor.start")).c_str(), P.cmd("zinc new game hello && cd hello && zinc dev").c_str());
  std::printf("  %s\n\n", P.dim(tr("cli.doctor.more", {{"command", "zinc doctor --details"}})).c_str());
  return bad ? 1 : 0;
}

// ---- commands that run the engine itself (ZN-140)
namespace {

std::string q(const std::string& s) {   // shell quoting
  std::string o = "'";
  for (char c : s) { if (c == '\'') o += "'\\''"; else o += c; }
  return o + "'";
}
std::string self() { std::string e = zn::tc::executablePath(); return e.empty() ? "zinc" : e; }
int status(int rc) { const int code = zn::plat::exitStatus(rc); return code < 0 ? 1 : code; }

/** Splits `args` (after the command) into the positional entry and the named options listed in `valued`. */
struct Opts { std::string entry; std::map<std::string, std::string> v; std::vector<std::string> flags; bool bad = false; std::string badArg; };
Opts parseOpts(const std::vector<std::string>& args, const std::vector<std::string>& valued, const std::vector<std::string>& boolFlags) {
  Opts o;
  for (std::size_t i = 2; i < args.size(); ++i) {
    const std::string& a = args[i];
    bool took = false;
    for (const std::string& n : valued) if (a == n && i + 1 < args.size()) { o.v[n] = args[++i]; took = true; break; }
    if (took) continue;
    for (const std::string& n : boolFlags) if (a == n) { o.flags.push_back(n); took = true; break; }
    if (took) continue;
    if (a.rfind("-", 0) == 0) { o.bad = true; o.badArg = a; return o; }
    o.entry = a;
  }
  return o;
}
bool has(const Opts& o, const std::string& f) { for (const std::string& x : o.flags) if (x == f) return true; return false; }

struct ProjectInfo { std::string dir, entry, name, version, engine; };
bool resolveProject(const std::string& arg, ProjectInfo& p, std::string& err) {
  std::error_code ec;
  std::string a = arg.empty() ? "." : arg;
  std::string dir = fs::is_directory(a, ec) ? fs::absolute(a).lexically_normal().string() : fs::absolute(a).parent_path().lexically_normal().string();
  std::string text;
  { std::ifstream f(fs::path(dir) / "zinc.json"); std::stringstream ss; ss << f.rdbuf(); text = ss.str(); }
  zn::frontend::Project proj;
  std::string perr;
  const bool have = !text.empty() && zn::frontend::parseProject(text, proj, perr);
  if (fs::is_directory(a, ec)) {
    p.entry = zn::frontend::entryOf(dir, have ? &proj : nullptr);
    if (p.entry.empty()) { err = "no project in " + dir + " (zinc init creates one)"; return false; }
  } else p.entry = fs::absolute(a).lexically_normal().string();
  p.dir = dir;
  p.name = have && !proj.name.empty() ? proj.name : fs::path(p.entry).stem().string();
  p.version = have && !proj.app.version.empty() ? proj.app.version : "0.1.0";
  p.engine = have ? proj.engine : "";
  return true;
}

std::string zigTargetFor(const std::string& t) {
  if (t == "macos") return "";   // the host build
  if (t == "linux" || t == "rpi" || t == "rmpp") return "aarch64-linux";
  if (t == "rpi1") return "armhf-linux";   // ARMv6: the first Pi and the Zero
  if (t == "rpi2" || t == "chip" || t == "pocketchip") return "armv7-linux";   // a 32-bit OS on ARMv7 with NEON (ZN-414)
  if (t == "touchpad" || t == "webos") return "armv7-webos";
  return t;
}

}  // namespace

int capture(const std::vector<std::string>& args) {
  Opts o = parseOpts(args, {"--frames", "--every", "--out", "--size", "--format"}, {});
  if (o.bad) { std::fprintf(stderr, "zinc capture: unknown option %s\nusage: zinc capture <entry|dir> [--frames 1,60] [--every n] [--out dir] [--size WxH] [--format png|webp]\n", o.badArg.c_str()); return 2; }
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  std::string frames = o.v.count("--frames") ? o.v["--frames"] : (o.v.count("--every") ? "" : "1,60");
  std::string out = o.v.count("--out") ? o.v["--out"] : "shots";
  const std::string ext = o.v.count("--format") ? o.v["--format"] : "png";
  if (ext != "png" && ext != "webp") { std::fprintf(stderr, "zinc capture: --format is png or webp\n"); return 2; }
  std::error_code ec;
  fs::create_directories(out, ec);
  int last = 0;
  { std::stringstream ss(frames); std::string tok; while (std::getline(ss, tok, ',')) last = std::max(last, std::atoi(tok.c_str())); }
  const int every = o.v.count("--every") ? std::atoi(o.v["--every"].c_str()) : 0;
  const int total = std::max(last, every > 0 ? every * 3 : 0);
  if (total <= 0) { std::fprintf(stderr, "zinc capture: nothing to capture (--frames or --every)\n"); return 2; }
  std::string cmd = "env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=" + std::to_string(total) + " ZINC_SHOT=" + q((fs::path(out) / ("frame." + ext)).string());
  if (!frames.empty()) cmd += " ZINC_SHOT_FRAMES=" + q(frames);
  if (every > 0) cmd += " ZINC_SHOT_EVERY=" + std::to_string(every);
  if (o.v.count("--size")) cmd += " ZINC_SIZE=" + q(o.v["--size"]);
  cmd += " " + q(self()) + " run " + q(p.entry);
  int rc = status(std::system(cmd.c_str()));
  if (rc != 0) return rc;
  int n = 0;
  for (const auto& e : fs::directory_iterator(out, ec)) if (e.path().extension() == "." + ext) { std::printf("%s\n", e.path().string().c_str()); ++n; }
  if (!n) { std::fprintf(stderr, "zinc capture: the program drew no frame (does it use zinc:gfx or zinc:ui?)\n"); return 1; }
  return 0;
}

int bench(const std::vector<std::string>& args) {
  Opts o = parseOpts(args, {"--frames"}, {});
  if (o.bad) { std::fprintf(stderr, "zinc bench: unknown option %s\nusage: zinc bench [entry|dir] [--frames n]\n", o.badArg.c_str()); return 2; }
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  const std::string frames = o.v.count("--frames") ? o.v["--frames"] : "120";
  std::string cmd = "env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=" + frames + " ZINC_PROFILE=1 " + q(self()) + " run " + q(p.entry) + " 2>&1 >/dev/null | grep '^zinc profile:'";
  std::printf("bench %s, %s frames (headless, ms per frame)\n", p.name.c_str(), frames.c_str());
  std::fflush(stdout);
  int rc = status(std::system(cmd.c_str()));
  if (rc != 0) { std::fprintf(stderr, "zinc bench: no profile came back (a program with a frame loop is needed)\n"); return 1; }
  return 0;
}

// A .deb of an export directory (ZN-320.01), written directly: an ar of debian-binary, control.tar and data.tar (uncompressed tars, which dpkg
// reads), deterministic. The export goes to /opt/<package>/, a launcher to /usr/bin/<package>, the .desktop file to /usr/share/applications.
static bool writeDeb(const fs::path& exportDir, const std::string& name, const std::string& version, const std::string& arch, const fs::path& deb, std::string& err) {
  std::string pkg;
  for (char c : name) pkg += std::isalnum(static_cast<unsigned char>(c)) ? static_cast<char>(std::tolower(static_cast<unsigned char>(c))) : (c == '.' || c == '+' ? c : '-');
  if (pkg.size() < 2) pkg += "-app";
  std::vector<zn::zapp::TarEntry> data{{"./", "", 0755, true}, {"./opt/", "", 0755, true}, {"./opt/" + pkg + "/", "", 0755, true}};
  std::vector<fs::path> files;
  std::error_code ec;
  for (auto it = fs::recursive_directory_iterator(exportDir, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) files.push_back(it->path());
  std::sort(files.begin(), files.end());
  std::uintmax_t bytes = 0;
  for (const fs::path& f : files) {
    const std::string rel = "./opt/" + pkg + "/" + fs::relative(f, exportDir).generic_string();
    if (fs::is_directory(f, ec)) { data.push_back({rel + "/", "", 0755, true}); continue; }
    std::ifstream in(f, std::ios::binary); std::stringstream ss; ss << in.rdbuf();
    const bool exec = (fs::status(f, ec).permissions() & fs::perms::owner_exec) != fs::perms::none;
    bytes += ss.str().size();
    data.push_back({rel, ss.str(), exec ? 0755u : 0644u});
  }
  const std::string launcher = "#!/bin/sh\nexec /opt/" + pkg + "/run.sh \"$@\"\n";
  data.push_back({"./usr/", "", 0755, true}); data.push_back({"./usr/bin/", "", 0755, true}); data.push_back({"./usr/bin/" + pkg, launcher, 0755});
  data.push_back({"./usr/share/", "", 0755, true}); data.push_back({"./usr/share/applications/", "", 0755, true});
  data.push_back({"./usr/share/applications/" + pkg + ".desktop", "[Desktop Entry]\nType=Application\nName=" + name + "\nExec=/usr/bin/" + pkg + "\nTerminal=false\nCategories=Utility;\n"});
  const std::string control = "Package: " + pkg + "\nVersion: " + version + "\nArchitecture: " + arch + "\nMaintainer: " + name + " developers <noreply@localhost>\nInstalled-Size: " +
                              std::to_string((bytes + 1023) / 1024) + "\nSection: misc\nPriority: optional\nDescription: " + name + "\n " + name + " " + version + ", built with Zinc.\n";
  const std::string archive = zn::zapp::ar({{"debian-binary", "2.0\n"}, {"control.tar", zn::zapp::ustar({{"./", "", 0755, true}, {"./control", control}})}, {"data.tar", zn::zapp::ustar(data)}});
  std::ofstream out(deb, std::ios::binary);
  out.write(archive.data(), static_cast<std::streamsize>(archive.size()));
  if (!out) { err = "cannot write " + deb.string(); return false; }
  return true;
}

// The SBOM (SPDX 2.3 JSON) and the licence texts of what an exported program links (ZN-323): the scopes the build wrote in <exe>.components,
// matched against third_party/components.json; the program and the Zinc engine are packages too.
static bool writeSbom(const fs::path& out, const ProjectInfo& p, const std::string& engineRoot, bool icons, std::string& err) {
  const fs::path exe = out / p.name, compFile = exe.string() + ".components";
  std::ifstream cf(compFile);
  if (!cf) { err = "the build wrote no " + compFile.string(); return false; }
  std::vector<std::string> scopes;
  for (std::string l; std::getline(cf, l);) if (!l.empty()) scopes.push_back(l);
  cf.close();
  std::error_code ec;
  fs::remove(compFile, ec);
  if (icons) scopes.push_back("icons");
  const fs::path repo = fs::path(engineRoot);
  std::ifstream jf(fs::path(engineRoot) / "third_party" / "components.json");
  std::stringstream js; js << jf.rdbuf();
  const std::string text = js.str();
  yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
  yyjson_val* list = doc ? yyjson_obj_get(yyjson_doc_get_root(doc), "components") : nullptr;
  if (!yyjson_is_arr(list)) { yyjson_doc_free(doc); err = "cannot read third_party/components.json"; return false; }
  auto str = [](yyjson_val* o, const char* k) { const char* v = yyjson_get_str(yyjson_obj_get(o, k)); return std::string(v ? v : ""); };
  auto slurp = [](const fs::path& f) { std::ifstream in(f, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); };
  yyjson_mut_doc* d = yyjson_mut_doc_new(nullptr);
  yyjson_mut_val* root = yyjson_mut_obj(d);
  yyjson_mut_doc_set_root(d, root);
  std::string all;   // what the namespace is made from: the same program and components give the same SBOM
  for (const std::string& s : scopes) all += s + "\n";
  const char* sde = std::getenv("SOURCE_DATE_EPOCH");   // reproducible builds: the creation time comes from it, else from the newest source of the project
  std::time_t t = sde ? static_cast<std::time_t>(std::atoll(sde)) : 0;
  if (!sde) {
    for (auto it = fs::recursive_directory_iterator(p.dir, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
      const std::string nm = it->path().filename().string();
      if (it->is_directory() && (nm == "dist" || nm == "build" || nm == "node_modules" || nm[0] == '.')) { it.disable_recursion_pending(); continue; }
      if (!it->is_regular_file()) continue;
      long long size = 0, mtime = 0;
      if (zn::plat::fileStamp(it->path().string(), size, mtime) && mtime / 1000000000LL > t) t = mtime / 1000000000LL;
    }
  }
  char when[32]; std::strftime(when, sizeof when, "%Y-%m-%dT%H:%M:%SZ", std::gmtime(&t));
  yyjson_mut_obj_add_str(d, root, "spdxVersion", "SPDX-2.3");
  yyjson_mut_obj_add_str(d, root, "dataLicense", "CC0-1.0");
  yyjson_mut_obj_add_str(d, root, "SPDXID", "SPDXRef-DOCUMENT");
  yyjson_mut_obj_add_strcpy(d, root, "name", (p.name + "-" + p.version).c_str());
  yyjson_mut_obj_add_strcpy(d, root, "documentNamespace", ("https://zinc.dev/spdx/" + p.name + "-" + p.version + "-" + zn::tc::sha256Hex(all).substr(0, 16)).c_str());
  yyjson_mut_val* ci = yyjson_mut_obj_add_obj(d, root, "creationInfo");
  yyjson_mut_obj_add_strcpy(d, ci, "created", when);
  yyjson_mut_val* creators = yyjson_mut_obj_add_arr(d, ci, "creators");
  yyjson_mut_arr_add_strcpy(d, creators, (std::string("Tool: zinc-") + zn::tc::version()).c_str());
  yyjson_mut_val* pkgs = yyjson_mut_obj_add_arr(d, root, "packages");
  yyjson_mut_val* rels = yyjson_mut_obj_add_arr(d, root, "relationships");
  auto pkg = [&](const std::string& id, const std::string& name, const std::string& version, const std::string& lic, const std::string& url, const std::string& sha) {
    yyjson_mut_val* o = yyjson_mut_arr_add_obj(d, pkgs);
    yyjson_mut_obj_add_strcpy(d, o, "name", name.c_str());
    yyjson_mut_obj_add_strcpy(d, o, "SPDXID", ("SPDXRef-" + id).c_str());
    if (!version.empty()) yyjson_mut_obj_add_strcpy(d, o, "versionInfo", version.c_str());
    yyjson_mut_obj_add_strcpy(d, o, "downloadLocation", url.empty() ? "NOASSERTION" : url.c_str());
    yyjson_mut_obj_add_bool(d, o, "filesAnalyzed", false);
    yyjson_mut_obj_add_strcpy(d, o, "licenseConcluded", lic.c_str());
    yyjson_mut_obj_add_strcpy(d, o, "licenseDeclared", lic.c_str());
    yyjson_mut_obj_add_str(d, o, "copyrightText", "NOASSERTION");
    if (!sha.empty()) { yyjson_mut_val* cs = yyjson_mut_obj_add_arr(d, o, "checksums"); yyjson_mut_val* c = yyjson_mut_arr_add_obj(d, cs); yyjson_mut_obj_add_str(d, c, "algorithm", "SHA256"); yyjson_mut_obj_add_strcpy(d, c, "checksumValue", sha.c_str()); }
  };
  auto rel = [&](const std::string& a, const char* kind, const std::string& b) {
    yyjson_mut_val* o = yyjson_mut_arr_add_obj(d, rels);
    yyjson_mut_obj_add_strcpy(d, o, "spdxElementId", a.c_str());
    yyjson_mut_obj_add_str(d, o, "relationshipType", kind);
    yyjson_mut_obj_add_strcpy(d, o, "relatedSpdxElement", b.c_str());
  };
  std::string appId;
  for (char c : p.name) appId += std::isalnum(static_cast<unsigned char>(c)) || c == '.' || c == '-' ? c : '-';
  pkg("App-" + appId, p.name, p.version, "NOASSERTION", "", "");
  pkg("Zinc", "Zinc runtime", zn::tc::version(), "NOASSERTION", "https://github.com/Frulko/zinc", "");
  rel("SPDXRef-DOCUMENT", "DESCRIBES", "SPDXRef-App-" + appId);
  rel("SPDXRef-App-" + appId, "DEPENDS_ON", "SPDXRef-Zinc");
  std::string licences = p.name + " " + p.version + " contains the following third-party components. Their licences follow, in full.\n";
  std::size_t i, n; yyjson_val* c;
  yyjson_arr_foreach(list, i, n, c) {
    if (std::find(scopes.begin(), scopes.end(), str(c, "scope")) == scopes.end()) continue;
    const std::string id = str(c, "id"), name = str(c, "name"), version = str(c, "version"), lic = str(c, "license");
    pkg(id, name, version, lic, str(c, "url"), str(c, "sha256"));
    rel("SPDXRef-App-" + appId, "DEPENDS_ON", "SPDXRef-" + id);
    std::string body;
    if (yyjson_val* ex = yyjson_obj_get(c, "licenseExcerpt")) {   // the licence inside a source file: from the marker up to the end marker
      const std::string src = slurp(repo / str(ex, "file")), from = str(ex, "from"), to = str(ex, "to");
      const std::size_t a = src.find(from), b = a == std::string::npos ? a : src.find(to, a + from.size());
      if (a != std::string::npos) body = src.substr(a, b == std::string::npos ? std::string::npos : b - a);
    } else body = slurp(repo / str(c, "licenseFile"));
    if (body.empty()) { yyjson_doc_free(doc); yyjson_mut_doc_free(d); err = "no licence text for " + name + " (third_party/components.json)"; return false; }
    licences += "\n\n==== " + name + (version.empty() ? "" : " " + version) + " (" + lic + ") ====\n\n" + body + (body.back() == '\n' ? "" : "\n");
  }
  yyjson_doc_free(doc);
  char* json = yyjson_mut_write(d, YYJSON_WRITE_PRETTY_TWO_SPACES, nullptr);
  yyjson_mut_doc_free(d);
  const bool ok = json && writeFile(out / "sbom.spdx.json", std::string(json) + "\n") && writeFile(out / "THIRD-PARTY-LICENSES.txt", licences);
  std::free(json);
  if (!ok) err = "cannot write the SBOM into " + out.string();
  return ok;
}

// zinc export --target esp32 (ZN-326.02): the core firmware (core.bin, at 0x0) and the program (app.bin, at 0x300000) that the core runs at start-up: "ZNAPP1\0\0", the
// little-endian length, then the bytes of an upload (include/zn/devproto.h: the load line and the ZBC), so the firmware feeds it to the core as if it came over the UART.
static int exportEsp32(const ProjectInfo& p, const fs::path& out, const std::string& engineRoot) {
  const fs::path core = fs::path(engineRoot) / "firmware" / "esp32" / "prebuilt" / "esp32-core-flash.bin";
  std::error_code ec;
  if (!fs::exists(core, ec)) { std::fprintf(stderr, "zinc export: the core firmware image is missing: %s\n", core.string().c_str()); return 1; }
  const fs::path zbc = out / "app.zbc";
  if (status(std::system(("ZINC_DEVICE_TARGET=esp32 " + q(self()) + " --emit=zbc-bin " + q(p.entry) + " " + q(zbc.string())).c_str())) != 0) { std::fprintf(stderr, "zinc export: the build failed\n"); return 1; }
  std::ifstream zf(zbc, std::ios::binary);
  const std::string body((std::istreambuf_iterator<char>(zf)), std::istreambuf_iterator<char>());
  zf.close();
  fs::remove(zbc, ec);
  if (body.size() > 48 * 1024) { std::fprintf(stderr, "zinc export: the program is %zu bytes of bytecode; the ESP32 core takes 48 KB\n", body.size()); return 1; }
  const std::string stream = std::string(1, zn::dev::kMark) + "ZN load " + std::to_string(body.size()) + " " +
                             zn::dev::hex32(zn::dev::crc32(reinterpret_cast<const std::uint8_t*>(body.data()), body.size())) + "\n" + body;
  std::string rec("ZNAPP1\0\0", 8);
  for (int k = 0; k < 4; ++k) rec += static_cast<char>((stream.size() >> (8 * k)) & 0xff);
  writeFile(out / "app.bin", rec + stream);
  fs::copy_file(core, out / "core.bin", fs::copy_options::overwrite_existing, ec);
  writeFile(out / "flash.sh", "#!/bin/sh\n# Flashes " + p.name + " onto an ESP32: the Zinc core at 0x0, the program at 0x300000. Usage: ./flash.sh [port] (ESPTOOL overrides the esptool).\n"
            "cd \"$(dirname \"$0\")\" || exit 1\nESPTOOL=${ESPTOOL:-$(zinc toolchain esptool 2>/dev/null || command -v esptool || command -v esptool.py)}\n"
            "[ -n \"$ESPTOOL\" ] || { echo \"flash.sh: no esptool (zinc toolchain esptool fetches the pinned one, or pip install esptool)\"; exit 1; }\n"
            "exec \"$ESPTOOL\" --chip esp32 ${1:+-p \"$1\"} -b 460800 write-flash 0x0 core.bin 0x300000 app.bin\n");
  fs::permissions(out / "flash.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  writeFile(out / "README.txt", p.name + " " + p.version + " (esp32) built with Zinc.\nFlash: ./flash.sh /dev/ttyUSB0. The program starts when the board boots; its output arrives on the UART at 115200 baud,\n"
            "framed by the upload protocol, and the board then waits for `zinc run --target esp32` uploads as usual.\n");
  std::printf("%s\n", out.string().c_str());
  return 0;
}

// The engine splash in the page (ZN-446): the canvas's CSS background, the image inline, so the browser paints it before any script runs; the
// worker's first frame, opaque, covers it. "" without a splash.
static std::string splashStyle(const zn::assets::Splash& s) {
  if (!s.on) return "";
  char bg[16];
  std::snprintf(bg, sizeof bg, "#%06x", static_cast<unsigned>(s.background & 0xffffff));
  std::string css = std::string(" style=\"background: ") + bg;
  if (!s.image.empty()) {
    static const char* b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::ifstream in(s.image, std::ios::binary);
    std::stringstream ss;
    ss << in.rdbuf();
    const std::string bytes = ss.str(), ext = fs::path(s.image).extension().string();
    std::string data;
    for (std::size_t i = 0; i < bytes.size(); i += 3) {
      const std::size_t left = bytes.size() - i;
      std::uint32_t v = static_cast<std::uint32_t>(static_cast<std::uint8_t>(bytes[i])) << 16;
      if (left > 1) v |= static_cast<std::uint32_t>(static_cast<std::uint8_t>(bytes[i + 1])) << 8;
      if (left > 2) v |= static_cast<std::uint8_t>(bytes[i + 2]);
      data += b64[v >> 18 & 63];
      data += b64[v >> 12 & 63];
      data += left > 1 ? b64[v >> 6 & 63] : '=';
      data += left > 2 ? b64[v & 63] : '=';
    }
    const char* mime = ext == ".svg" ? "image/svg+xml" : ext == ".jpg" || ext == ".jpeg" ? "image/jpeg" : ext == ".webp" ? "image/webp" : "image/png";
    css += std::string(" url(data:") + mime + ";base64," + data + ") center / " + (s.fit == 1 ? "cover" : s.fit == 2 ? "auto" : "contain") + " no-repeat";
  }
  return css + "\"";
}

// zinc export --target android (ZN-621, D59, docs/reports/zinc-next-mobile-core.md): SDL's own Android project (third_party/SDL3/android-project,
// the template of SDL 3.4.16) changed as SDL's generator (third_party/SDL3/build-scripts/create-android-project.py) changes it: the package id, the
// activity subclass, the sources of libmain.so. Zinc changes little more, all listed in exportAndroid: the app's name, version, orientation and
// permissions, the ABIs (armeabi-v7a included), API 36, the Gradle and AGP pins, and the CMake entry that adds the engine (the checkout, the target
// zn_app, which builds SDL3) instead of SDL alone. So an SDL upgrade is a re-copy of the template. The engine's sources are referenced
// (gradle.properties zinc.engine), not copied. Nothing of Android runs here: ./gradlew assembleDebug does, with the SDK and the NDK.
namespace android {
constexpr const char* kAgp = "8.13.2";            // the Android Gradle Plugin of compileSdk 36 (the template's 8.7.3 stops at 35)
constexpr const char* kNdk = "29.0.14206865";     // NDK r29, named by its version as AGP wants it
constexpr const char* kGradle = "8.14.3";         // the wrapper's distribution, pinned by its sha256 (the template names 8.12, unpinned)
constexpr const char* kGradleSha = "bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531";
constexpr const char* kKotlin = "2.2.20";       // the Kotlin Gradle plugin, added only for a plugin with .kt sources (AGP 8 has no Kotlin of its own)
constexpr int kMinSdk = 24;   // libuv calls pthread_barrier_*, in bionic since API 24 (SDL3 alone needs 21); Android 7.0, the Nexus 7 2012 runs 7.1 (25)
std::string javaId(const std::string& s) {        // a Java package or applicationId: letters, digits and '_' in dot-separated parts
  std::string r;
  for (char c : s) r += std::isalnum(static_cast<unsigned char>(c)) || c == '.' ? c : '_';
  return r;
}
std::string xml(const std::string& s) {
  std::string r;
  for (char c : s) r += c == '&' ? "&amp;" : c == '<' ? "&lt;" : c == '>' ? "&gt;" : c == '"' ? "&quot;" : std::string(1, c);
  return r;
}
// replace_in_file of create-android-project.py: every `what` in the file becomes `with`; it must be there (a template that moved is an error, not a silent skip)
bool replaceIn(const fs::path& f, const std::string& what, const std::string& with, std::string& err) {
  std::ifstream in(f);
  std::stringstream ss; ss << in.rdbuf();
  std::string s = ss.str();
  std::size_t n = 0;
  for (std::size_t at = s.find(what); at != std::string::npos; at = s.find(what, at + with.size()), ++n) s.replace(at, what.size(), with);
  if (!n) { err = "the SDL template changed: \"" + what + "\" is not in " + f.string(); return false; }
  return writeFile(f, s);
}
}  // namespace android

// The program's plugins in the generated project (no dlopen in an app, D120; ZN-628): `names` from program.plugins, each compiled from the sources
// its plugin.json `targets.<platform>` entry lists (copied under `copyDir`; paths relative to `cmakeDir`, the plugin's own as ${ZINC_PLUGINS}) as a
// static library, and what the entry adds to the project: Java and Kotlin sources, Gradle dependencies, manifest permissions and fragments, the
// minimum API level (android); frameworks, Info.plist keys, entitlements (ios). A plugin without an entry for the platform is refused: its
// desktop build is not a phone's.
struct AppPlugins {
  std::string cmake, libs;
  std::vector<std::string> java, gradle, permissions, manifestXml, applicationXml, lifecycle, plist, entitlements, privacy;   // plist, entitlements, privacy: JSON objects
  int minSdk = 0;
  bool swift = false, objc = false;   // objc: an Objective-C or Swift class found by name at run time (class, lifecycle), which -ObjC keeps in the link
  std::vector<std::string> modules;   // the native modules of the plugins ("Sqlite"): what a player registers (ZN-631)
};
static bool appPluginsCmake(const std::vector<std::string>& names, const fs::path& engine, const ProjectInfo& p, const std::string& platform,
                            const fs::path& cmakeDir, const fs::path& copyDir, AppPlugins& out) {
  if (names.empty()) return true;
  std::vector<std::string> problems;
  std::string err;
  const auto found = zn::frontend::discoverPlugins(engine.string(), p.dir, problems);
  for (const std::string& nm : names) {
    const zn::frontend::FoundPlugin* hit = nullptr;
    for (const auto& f : found) if (f.manifest.name == nm) hit = &f;
    if (!hit) { std::fprintf(stderr, "zinc export: plugin '%s' not found\n", nm.c_str()); return false; }
    auto entry = hit->manifest.targetSettings.find(platform);
    if (entry == hit->manifest.targetSettings.end()) {
      std::string list;
      for (const std::string& t : hit->manifest.targets) list += (list.empty() ? "" : ", ") + t;
      std::fprintf(stderr, "zinc export: plugin '%s' is not made for %s: its plugin.json has no \"targets\".\"%s\" entry (it has %s); docs/plugins.md \"Phones\" says what one holds\n",
                   nm.c_str(), platform.c_str(), platform.c_str(), list.c_str());
      return false;
    }
    const zn::frontend::PluginTarget& ts = entry->second;
    zn::tc::PluginSource ps;
    if (!zn::tc::pluginSource(*hit, engine.string(), p.dir, platform, (copyDir / nm).string(), ps, err)) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return false; }
    const std::string lib = "zn_app_plugin_" + nm, pdir = fs::path(hit->dir).lexically_normal().string();
    // the engine's plugins by ${ZINC_PLUGINS}, as the engine by ${ZINC_ENGINE}; a project's own plugin (its plugins/ or pluginDirs) by its absolute path
    const std::string home = (engine / "plugins" / nm).lexically_normal().string() == pdir ? "${ZINC_PLUGINS}/" + nm : fs::path(pdir).generic_string();
    auto path = [&](const std::string& s) { return s.rfind(pdir, 0) == 0 ? home + s.substr(pdir.size()) : fs::path(s).lexically_relative(cmakeDir).generic_string(); };
    std::string swift;   // a plugin's Swift in a library of its own: the C++ options and NAME=value defines are not swiftc's
    for (const std::string& s : ps.own) if (fs::path(s).extension() == ".swift") swift += " " + path(s);
    if (!swift.empty()) { out.cmake += "add_library(" + lib + "_swift STATIC" + swift + ")\n"; out.swift = true; }
    out.cmake += "add_library(" + lib + " STATIC";
    for (const std::string& s : ps.own) if (fs::path(s).extension() != ".swift") out.cmake += " " + path(s);
    for (const std::string& s : ps.vendored) out.cmake += " " + path(s);
    out.cmake += ")\ntarget_include_directories(" + lib + " PRIVATE " + (copyDir / nm).lexically_relative(cmakeDir).generic_string() + " " + home + " ${ZINC_ENGINE}/src ${ZINC_ENGINE}/include ${ZINC_ENGINE}/runtime ${ZINC_ENGINE}/runtime/include ${ZINC_ENGINE}/third_party ${ZINC_ENGINE}/third_party/SDL3/include)\n"
             "target_compile_options(" + lib + " PRIVATE -O2 -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -w";
    for (std::string f : ps.flags) { if (const std::size_t at = f.find(pdir); at != std::string::npos) f.replace(at, pdir.size(), home); out.cmake += " " + f; }   // a flag's path, made absolute by pluginSource
    out.cmake += ")\nset_target_properties(" + lib + " PROPERTIES CXX_STANDARD 17)\ntarget_compile_definitions(" + lib + " PRIVATE";
    for (std::string d : ps.defines) {
      if (d.rfind("ZRT_PLATFORM=", 0) == 0) d = "ZRT_PLATFORM=\"" + platform + "\"";
      if (d.rfind("ZRT_HEAP_BYTES=", 0) == 0) continue;   // the runtime's region is sized at start (shell_sdl.cpp)
      std::string e;
      for (char c : d) e += c == '"' ? "\\\"" : std::string(1, c);
      out.cmake += " \"" + e + "\"";
    }
    out.cmake += ")\n";
    std::string vcxx;   // the vendored C++ sources take the entry's vendorFlags after the plugin's -fno-exceptions -fno-rtti (libdatachannel)
    for (const std::string& s : ps.vendored) if (fs::path(s).extension() != ".c") vcxx += " " + path(s);
    if (!vcxx.empty() && !ps.vendorFlags.empty()) {
      std::string opts;
      for (const std::string& f : ps.vendorFlags) opts += (opts.empty() ? "" : ";") + f;
      out.cmake += "set_source_files_properties(" + vcxx.substr(1) + " PROPERTIES COMPILE_OPTIONS \"" + opts + "\")\n";
    }
    if (!ps.libs.empty() || !ps.frameworks.empty()) {   // the system libraries (camera2ndk, mediandk, sqlite3...) and frameworks of the entry
      out.cmake += "target_link_libraries(" + lib + " PUBLIC";
      for (const std::string& l : ps.libs) out.cmake += " " + l;
      for (const std::string& f : ps.frameworks) out.cmake += " \"-framework " + f + "\"";
      out.cmake += ")\n";
    }
    if (!swift.empty()) out.cmake += "target_link_libraries(" + lib + " PUBLIC " + lib + "_swift)\n";
    out.libs += " " + lib;
    if (!ps.module.empty() && hit->manifest.kind != "display") out.modules.push_back(ps.module);
    out.java.insert(out.java.end(), ps.java.begin(), ps.java.end());
    out.gradle.insert(out.gradle.end(), ts.gradle.begin(), ts.gradle.end());
    out.permissions.insert(out.permissions.end(), ts.permissions.begin(), ts.permissions.end());
    if (!ts.manifestXml.empty()) out.manifestXml.push_back(ts.manifestXml);
    if (!ts.applicationXml.empty()) out.applicationXml.push_back(ts.applicationXml);
    if (!ts.lifecycle.empty()) out.lifecycle.push_back(ts.lifecycle);
    out.objc = out.objc || !ts.lifecycle.empty() || !ts.nativeClass.empty();
    if (!ts.plistJson.empty()) out.plist.push_back(ts.plistJson);
    if (!ts.entitlementsJson.empty()) out.entitlements.push_back(ts.entitlementsJson);
    if (!ts.privacyJson.empty()) out.privacy.push_back(ts.privacyJson);
    out.minSdk = std::max(out.minSdk, ts.minSdk);
  }
  return true;
}

// A JSON value as property-list XML (Info.plist keys and entitlements of the plugins, ZN-628), one level of tabs per depth
static std::string plistValue(yyjson_val* v, const std::string& tab) {
  if (yyjson_is_str(v)) return tab + "<string>" + android::xml(yyjson_get_str(v)) + "</string>\n";
  if (yyjson_is_bool(v)) return tab + (yyjson_get_bool(v) ? "<true/>\n" : "<false/>\n");
  if (yyjson_is_int(v)) return tab + "<integer>" + std::to_string(yyjson_get_sint(v)) + "</integer>\n";
  if (yyjson_is_real(v)) { char b[40]; std::snprintf(b, sizeof b, "%.17g", yyjson_get_real(v)); return tab + "<real>" + b + "</real>\n"; }
  std::string r;
  size_t i, n;
  if (yyjson_is_arr(v)) { yyjson_val* e; r = tab + "<array>\n"; yyjson_arr_foreach(v, i, n, e) r += plistValue(e, tab + "\t"); return r + tab + "</array>\n"; }
  yyjson_val *k, *e;
  r = tab + "<dict>\n";
  yyjson_obj_foreach(v, i, n, k, e) r += tab + "\t<key>" + android::xml(yyjson_get_str(k)) + "</key>\n" + plistValue(e, tab + "\t");
  return r + tab + "</dict>\n";
}
// The keys of JSON objects as plist entries of the top <dict>: the first object that names a key wins, and keys of `taken` are kept as they are
static std::string plistEntries(const std::vector<std::string>& objects, std::set<std::string>& taken) {
  std::string r;
  for (const std::string& o : objects) {
    yyjson_doc* d = yyjson_read(o.data(), o.size(), 0);
    if (!d) continue;
    size_t i, n;
    yyjson_val *k, *v;
    yyjson_obj_foreach(yyjson_doc_get_root(d), i, n, k, v) if (taken.insert(yyjson_get_str(k)).second) r += "\t<key>" + android::xml(yyjson_get_str(k)) + "</key>\n" + plistValue(v, "\t");
    yyjson_doc_free(d);
  }
  return r;
}

// zinc.json app.versionCode, else from the version: 1.2.3 -> 10203 (Android's versionCode, iOS's CFBundleVersion)
static int appVersionCode(const zn::frontend::Project& proj, const std::string& version) {
  if (proj.app.versionCode > 0) return proj.app.versionCode;
  int parts[3] = {0, 0, 0}, k = 0;
  for (std::size_t i = 0; i < version.size() && k < 3; ++i) { if (std::isdigit(static_cast<unsigned char>(version[i]))) parts[k] = parts[k] * 10 + (version[i] - '0'); else if (version[i] == '.') ++k; else break; }
  const int code = parts[0] * 10000 + parts[1] * 100 + parts[2];
  return code < 1 ? 1 : code;
}

// The program's C++ for a phone profile (ZN_AOT_CPP_ONLY, ZN-620) in `src`: the units (program.cpp, program.partN.cpp) and the plugins it calls
static bool appProgram(const ProjectInfo& p, const char* profile, const fs::path& src, std::vector<std::string>& units, std::vector<std::string>& plugins) {
  std::error_code ec;
  const std::string build = "ZN_AOT_CPP_ONLY=1 " + q(self()) + " build --profile " + profile + " " + q(p.entry) + " -o " + q((src / "program").string());
  if (status(std::system(build.c_str())) != 0) { std::fprintf(stderr, "zinc export: the build failed\n"); return false; }
  fs::remove(src / "program.libs", ec);   // the desktop's archives: the plugins are compiled from their sources
  units = {"program.cpp"};
  for (int k = 1; fs::exists(src / ("program.part" + std::to_string(k) + ".cpp")); ++k) units.push_back("program.part" + std::to_string(k) + ".cpp");
  { std::ifstream pn(src / "program.plugins"); for (std::string l; std::getline(pn, l);) if (!l.empty()) plugins.push_back(l); }
  fs::remove(src / "program.plugins", ec);
  return true;
}

// A player (zinc.json "player": true, Zinc Go, ZN-631): the program is its home screen, compiled in hot mode as zinc dev --lan sends programs
// (`unit`: zinc/home.unit in the package, read by src/app/player.cpp), and the plugins are every one made for the platform (the engine's and the
// project's), so that the projects it runs find theirs. The C++ unit is the table that registers their native modules (playerModules).
static bool playerProgram(const ProjectInfo& p, const fs::path& engine, const char* profile, const fs::path& unit, std::vector<std::string>& units, std::vector<std::string>& plugins) {
  std::error_code ec;
  fs::create_directories(unit.parent_path(), ec);
  const std::string build = "ZN_AOT_CPP_ONLY=1 " + q(self()) + " --emit=hot " + q(fs::absolute(p.entry).string()) + " " + q(unit.string()) + " --profile " + profile;
  if (status(std::system(build.c_str())) != 0) { std::fprintf(stderr, "zinc export: the build of the home screen failed\n"); return false; }
  std::vector<std::string> problems;
  for (const auto& f : zn::frontend::discoverPlugins(engine.string(), p.dir, problems)) {
    bool native = false;   // a plugin of Zinc code only (async-storage, gsap) travels in the programs zinc dev sends
    for (const auto& e : fs::directory_iterator(fs::path(f.dir) / "native", ec)) native = native || e.path().filename().string().find(".spec.ts") != std::string::npos;
    if (native && f.manifest.kind != "display" && f.manifest.targetSettings.count(profile) && std::find(plugins.begin(), plugins.end(), f.manifest.name) == plugins.end()) plugins.push_back(f.manifest.name);
  }
  units = {"player_modules.cpp"};
  return true;
}
static std::string playerModules(const std::vector<std::string>& modules, const std::vector<std::string>& plugins) {
  std::string decl, reg, names;
  for (const std::string& n : plugins) names += (names.empty() ? "" : ",") + n;
  for (const std::string& m : modules) {
    decl += "extern \"C\" const ZnModule* zn_module_" + m + "(void);\n";
    reg += "  if (zn_register_module(zn_module_" + m + "(), e, sizeof e) < 0) std::fprintf(stderr, \"zinc go: %s\\n\", e);\n";
  }
  return "// Written by zinc export for a player (zinc.json \"player\": true, ZN-631): the native modules of its plugins, registered at start (src/app/player.cpp).\n"
         "#include <cstdio>\n#include \"zn/native.h\"\n\n" + decl + "\nextern \"C\" void zn_player_modules(void) {\n  char e[256];\n" + reg + "}\n"
         "// the plugins, for the device mode's info (zinc device checks a program's native plugins against them, ZN-792)\n"
         "extern \"C\" const char* zn_player_plugins(void) { return \"" + names + "\"; }\n";
}

// The packages of a phone export (ZN-629): --aab (a release bundle for Google Play), --apk (a debug APK), --ipa (an App Store, TestFlight, ad hoc
// or development IPA; with --simulator a zipped debug .app). --dry-run prints every command and runs none, as tools/sign-macos does.
struct Pack { bool aab = false, apk = false, ipa = false, simulator = false, dry = false; std::string abis; bool release = false; };
static int versionCmp(const std::string& a, const std::string& b);

// One packaging command, run in `dir` (printed as `+ cmd` first; only printed with --dry-run)
static bool step(const fs::path& dir, const std::string& cmd, bool dry) {
  std::printf("+ %s\n", cmd.c_str());
  std::fflush(stdout);
  if (dry || status(std::system(("cd " + q(dir.string()) + " && " + cmd).c_str())) == 0) return true;
  std::fprintf(stderr, "zinc export: this step failed: %s\n", cmd.c_str());
  return false;
}

// The smallest alignment of an ELF file's LOAD segments (0: not a little-endian ELF file), and whether it is 64-bit. Android 15 devices with
// 16 KB pages load only libraries whose segments are aligned to 16 KB; Google Play requires it of 64-bit libraries since 2025-11-01.
static std::uint64_t elfLoadAlign(const fs::path& f, bool& is64) {
  std::ifstream in(f, std::ios::binary);
  unsigned char h[64] = {};
  if (!in.read(reinterpret_cast<char*>(h), 64) || std::memcmp(h, "\x7f" "ELF", 4) != 0 || h[5] != 1) return 0;   // every Android ABI is little-endian
  is64 = h[4] == 2;
  auto rd = [](const unsigned char* p, int n) { std::uint64_t v = 0; for (int i = n - 1; i >= 0; --i) v = v << 8 | p[i]; return v; };
  const std::uint64_t phoff = is64 ? rd(h + 32, 8) : rd(h + 28, 4), phentsize = rd(h + (is64 ? 54 : 42), 2), phnum = rd(h + (is64 ? 56 : 44), 2);
  std::uint64_t least = 0;
  for (std::uint64_t k = 0; k < phnum; ++k) {
    unsigned char ph[56] = {};
    in.seekg(static_cast<std::streamoff>(phoff + k * phentsize));
    if (!in.read(reinterpret_cast<char*>(ph), is64 ? 56 : 32)) return 0;
    if (rd(ph, 4) != 1) continue;   // PT_LOAD
    const std::uint64_t a = is64 ? rd(ph + 48, 8) : rd(ph + 28, 4);
    if (least == 0 || a < least) least = a;
  }
  return least;
}

// The 16 KB check of the native libraries of an AAB or an APK: the LOAD segments of each lib/<abi>/*.so (read here) and, in an APK, their place
// in the zip (zipalign -c -P 16: stored at 16 KB boundaries, so the system maps them from the package)
static bool checkPages(const fs::path& dir, const fs::path& pkg, bool apk, bool dry) {
  const fs::path libs = dir / "build-pages";
  std::error_code ec;
  fs::remove_all(libs, ec);
  if (!step(dir, "unzip -qq -o " + q(pkg.string()) + (apk ? " 'lib/*.so'" : " 'base/lib/*.so'") + " -d " + q(libs.string()), dry)) return false;
  std::string zipalign = "zipalign";   // the newest build-tools of the SDK (-P needs 35 or later), else the PATH's
  const char* sdk = std::getenv("ANDROID_HOME") && *std::getenv("ANDROID_HOME") ? std::getenv("ANDROID_HOME") : std::getenv("ANDROID_SDK_ROOT");
  if (sdk && *sdk && fs::is_directory(fs::path(sdk) / "build-tools", ec)) {
    std::vector<fs::path> bt;
    for (const auto& e : fs::directory_iterator(fs::path(sdk) / "build-tools", ec)) if (fs::exists(e.path() / "zipalign")) bt.push_back(e.path() / "zipalign");
    std::sort(bt.begin(), bt.end(), [](const fs::path& a, const fs::path& b) { return versionCmp(a.parent_path().filename().string(), b.parent_path().filename().string()) < 0; });
    if (!bt.empty()) zipalign = bt.back().string();
  }
  if (apk && !step(dir, q(zipalign) + " -c -P 16 4 " + q(pkg.string()), dry)) { std::fprintf(stderr, "zinc export: the APK's native libraries are not stored at 16 KB boundaries (zipalign -c -P 16)\n"); return false; }
  if (dry) { std::printf("  (then zinc reads each lib/<abi>/*.so: every LOAD segment of a 64-bit library must be aligned to 16 KB)\n"); return true; }
  bool ok = true;
  int n = 0;
  for (auto it = fs::recursive_directory_iterator(libs, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (it->path().extension() != ".so") continue;
    bool is64 = false;
    const std::uint64_t a = elfLoadAlign(it->path(), is64);
    const std::string name = it->path().parent_path().filename().string() + "/" + it->path().filename().string();
    const bool good = a >= 16384 || !is64;
    std::printf("  16 KB pages: %s %s (LOAD aligned to %llu bytes%s)\n", good ? "ok  " : "FAIL", name.c_str(), static_cast<unsigned long long>(a), !is64 && a < 16384 ? "; a 32-bit library, not required" : "");
    ok = ok && good;
    ++n;
  }
  fs::remove_all(libs, ec);
  if (!n) std::printf("  16 KB pages: no native library in %s\n", pkg.filename().string().c_str());
  if (!ok) std::fprintf(stderr, "zinc export: a 64-bit library is not aligned to 16 KB: link it with -Wl,-z,max-page-size=16384 (a plugin's prebuilt library: rebuild it so)\n");
  return ok;
}

// zinc export --target android --aab | --apk (ZN-629): Gradle builds the package in the exported project, then the 16 KB check. The upload key:
// its path and alias from ZINC_ANDROID_KEYSTORE and ZINC_ANDROID_KEY_ALIAS or zinc.json signing.android, its passwords only from
// ZINC_ANDROID_STORE_PASSWORD and ZINC_ANDROID_KEY_PASSWORD, read by Gradle (app/build.gradle signingConfigs.upload): nothing of it is written in
// the project. Without one the debug keystore signs (local tests; Play refuses it). Play App Signing re-signs with the app signing key.
static bool packAndroid(const zn::frontend::Project& proj, const ProjectInfo& p, const fs::path& out, const Pack& pk) {
  auto env = [](const char* k) { const char* v = std::getenv(k); return std::string(v ? v : ""); };
  std::string ks = env("ZINC_ANDROID_KEYSTORE");
  if (ks.empty() && !proj.androidKeystore.empty()) ks = fs::absolute(fs::path(p.dir) / proj.androidKeystore).lexically_normal().string();
  const std::string alias = !env("ZINC_ANDROID_KEY_ALIAS").empty() ? env("ZINC_ANDROID_KEY_ALIAS") : !proj.androidKeyAlias.empty() ? proj.androidKeyAlias : "upload";
  // --apk --release: the release APK (not debuggable: no CheckJNI, no launch variables, the engine built Release), signed with the upload key
  // when one is named, else with the debug keystore, which `adb install` takes: a build as users get it, on one's own device
  const bool rel = pk.aab || pk.release;
  std::string gradle = std::string("./gradlew ") + (pk.aab ? "bundleRelease" : pk.release ? "assembleRelease" : "assembleDebug");
  if (!pk.abis.empty()) gradle += " -Pzinc.abis=" + q(pk.abis);
  if (rel && !ks.empty()) {
    if (!pk.dry && !fs::exists(ks)) { std::fprintf(stderr, "zinc export: the upload keystore %s does not exist (keytool -genkeypair -v -keystore %s -alias %s -keyalg RSA -keysize 4096 -validity 10000 makes one)\n", ks.c_str(), q(ks).c_str(), alias.c_str()); return false; }
    if (!pk.dry && env("ZINC_ANDROID_STORE_PASSWORD").empty()) { std::fprintf(stderr, "zinc export: set ZINC_ANDROID_STORE_PASSWORD (and ZINC_ANDROID_KEY_PASSWORD when the key's differs): the passwords of the upload key are read from the environment, never written in the project\n"); return false; }
    gradle += " -Pzinc.keystore=" + q(ks) + " -Pzinc.keyAlias=" + q(alias);
    std::printf("upload key: %s, alias %s (passwords from ZINC_ANDROID_STORE_PASSWORD and ZINC_ANDROID_KEY_PASSWORD)\n", ks.c_str(), alias.c_str());
  } else if (pk.aab) {
    std::printf("no upload key (zinc.json signing.android.keystore or ZINC_ANDROID_KEYSTORE): the bundle is signed with the debug keystore, for local tests; Google Play refuses it\n");
  } else if (pk.release) {
    std::printf("no upload key (zinc.json signing.android.keystore or ZINC_ANDROID_KEYSTORE): the release APK is signed with the debug keystore, for an install with adb\n");
  }
  if (env("JAVA_HOME").empty())   // Gradle 8.14 runs on a JDK 17 to 24: Android Studio's own when no other is named (the first run of a maker)
    for (const char* jbr : {"/Applications/Android Studio.app/Contents/jbr/Contents/Home", "/opt/android-studio/jbr"})
      if (fs::exists(fs::path(jbr) / "bin/java")) { std::printf("+ export JAVA_HOME=%s   # Android Studio's JDK\n", q(jbr).c_str()); setenv("JAVA_HOME", jbr, 1); break; }
  if (!step(out, gradle, pk.dry)) return false;
  const fs::path pkg = out / (pk.aab ? "app/build/outputs/bundle/release/app-release.aab" : pk.release ? "app/build/outputs/apk/release/app-release.apk" : "app/build/outputs/apk/debug/app-debug.apk");
  if (!checkPages(out, pkg, pk.apk, pk.dry)) return false;
  std::printf("%s: %s\n", pk.aab ? "bundle" : "apk", pkg.string().c_str());
  if (pk.apk) std::printf("next: adb install -r %s\n", q(pkg.string()).c_str());
  else std::printf("next: upload it in the Play Console (Test and release > Production or a testing track > Create a release); to try it first:\n"
                   "  bundletool build-apks --bundle=%s --output=app.apks --connected-device%s && bundletool install-apks --apks=app.apks\n",
                   q(pkg.string()).c_str(), ks.empty() ? "" : (" --ks=" + q(ks) + " --ks-key-alias=" + q(alias) + " --ks-pass=pass:\"$ZINC_ANDROID_STORE_PASSWORD\"").c_str());
  return true;
}

static int exportAndroid(const ProjectInfo& p, const fs::path& out, const std::string& engineRoot, bool print, const Pack& pk) {
  using namespace android;
  std::error_code ec;
  std::string err;
  const fs::path engine = fs::absolute(engineRoot).lexically_normal(), tpl = engine / "third_party/SDL3/android-project", src = out / "app/jni/src";
  if (!fs::exists(engine / "src/app/shell_sdl.cpp") || !fs::exists(tpl / "app/build.gradle")) { std::fprintf(stderr, "zinc export: --target android needs the engine's sources (%s)\n", engine.string().c_str()); return 1; }
  zn::frontend::Project proj;
  { std::ifstream pf(fs::path(p.dir) / "zinc.json"); std::stringstream ps; ps << pf.rdbuf(); std::string perr; if (pf) zn::frontend::parseProject(ps.str(), proj, perr); }
  fs::copy(tpl, out, fs::copy_options::recursive | fs::copy_options::overwrite_existing, ec);   // shutil.copytree(SDL_ROOT / "android-project", build_path)
  if (ec) { std::fprintf(stderr, "zinc export: copying the SDL template: %s\n", ec.message().c_str()); return 1; }
  fs::remove(src / "YourSourceHere.c", ec);
  // the program's C++ for the android profile (number, heap, requires) in app/jni/src, where the script copies the sources, and the plugins it calls
  std::vector<std::string> units, names;
  if (proj.player ? !playerProgram(p, engine, "android", out / "app/src/main/assets/zinc/home.unit", units, names) : !appProgram(p, "android", src, units, names)) return 1;
  AppPlugins plugs;
  if (!appPluginsCmake(names, engine, p, "android", src, src / "plugins", plugs)) return 1;
  if (proj.player) writeFile(src / "player_modules.cpp", playerModules(plugs.modules, names));
  const std::string& pluginCmake = plugs.cmake;
  const std::string pluginLibs = plugs.libs + (proj.player ? " zn_app_player" : "");   // the interpreter and the link to zinc dev (src/app/player.cpp)
  const int minSdk = std::max(kMinSdk, plugs.minSdk);
  const zn::frontend::Profile* prof = zn::frontend::findProfile("android");
  const std::string heapMb = std::to_string(prof ? prof->heapBytes >> 20 : 128);
  const std::string id = javaId(proj.app.id.empty() ? "dev.zinc." + p.name : proj.app.id);
  const std::string version = !proj.app.version.empty() ? proj.app.version : !p.version.empty() ? p.version : "1.0";
  const int code = appVersionCode(proj, version);
  const std::string activity = [&] { std::string last = id.substr(id.rfind('.') + 1); if (!last.empty()) last[0] = static_cast<char>(std::toupper(static_cast<unsigned char>(last[0]))); return last + "Activity"; }();   // the script's name
  std::string units1;
  for (const std::string& u : units) { units1 += u + "\n    "; }
  std::string perms = zn::frontend::androidManifestPermissions(proj);   // <uses-permission> and <uses-feature> from zinc.json "permissions"
  // and those of the plugins' manifest entries: the manifest lists exactly what was declared, each once (SDL's template has VIBRATE, kept for
  // navigator.vibrate and zinc:haptics: a normal permission, granted at install without a prompt, as in Expo's template)
  const std::string tplManifest = [&] { std::ifstream in(out / "app/src/main/AndroidManifest.xml"); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }();
  for (const std::string& pm : plugs.permissions) {
    const std::string full = pm.find('.') == std::string::npos ? "android.permission." + pm : pm, at = "<uses-permission android:name=\"" + xml(full) + "\" />";
    if (perms.find(at) == std::string::npos && tplManifest.find("\n    " + at) == std::string::npos) perms += "    " + at + "\n";
  }
  if (proj.player) perms += "    <uses-permission android:name=\"android.permission.CHANGE_WIFI_MULTICAST_STATE\" />\n";   // its device mode's mDNS (ZN-792, ZincActivity.zincMulticast)
  std::string topXml, appXml;   // the plugins' fragments, inside <manifest> and inside <application>
  for (const std::string& x : plugs.manifestXml) topXml += "    " + x + "\n";
  for (const std::string& x : plugs.applicationXml) appXml += "        " + x + "\n";
  std::string links;   // zinc.json app.urlSchemes: the activity opens their links (deep links, zinc:system open-url)
  for (const std::string& s : proj.app.urlSchemes)
    links += "            <intent-filter>\n                <action android:name=\"android.intent.action.VIEW\" />\n                <category android:name=\"android.intent.category.DEFAULT\" />\n"
             "                <category android:name=\"android.intent.category.BROWSABLE\" />\n                <data android:scheme=\"" + xml(s) + "\" />\n            </intent-filter>\n";
  std::string appEnv;   // zinc.json targets.android, for every build (shell_sdl.cpp): the HAL's variables that zinc run sets on a desktop
  if (auto t = proj.targets.find("android"); t != proj.targets.end()) {
    if (t->second.fullscreen) appEnv += " ZINC_FULLSCREEN=1";
    if (t->second.kiosk) appEnv += " ZINC_KIOSK=1";
  }
  const std::string orient = proj.app.orientation == "portrait" ? "sensorPortrait" : proj.app.orientation == "landscape" ? "sensorLandscape" : "unspecified";
  std::string pkgPath = id;
  std::replace(pkgPath.begin(), pkgPath.end(), '.', '/');
  const bool ok =
      // what create-android-project.py changes: the sources of libmain.so, the package name, the activity
      replaceIn(src / "CMakeLists.txt", "YourSourceHere.c\n", units1 + "${ZINC_ENGINE}/src/app/shell_sdl.cpp\n", err) &&
      replaceIn(out / "app/build.gradle", "org.libsdl.app", id, err) &&
      replaceIn(out / "app/src/main/AndroidManifest.xml", "name=\"SDLActivity\"", "name=\"" + activity + "\"\n            android:screenOrientation=\"" + orient + "\"", err) &&
      // Zinc: the engine and the program in libmain.so (SDL3 is built inside the engine), linked with zn_app and the program's plugins
      replaceIn(out / "app/jni/CMakeLists.txt", "add_subdirectory(SDL)\n", "add_compile_options(-O2)   # Zinc: the engine and SDL optimized in a debug APK too (AGP builds it as Debug, -O0)\nset(ZN_WEBGL OFF CACHE BOOL \"\" FORCE)\nadd_subdirectory(${ZINC_ENGINE} zinc EXCLUDE_FROM_ALL)   # Zinc: the engine (zn_app), SDL3 inside it\n", err) &&
      replaceIn(src / "CMakeLists.txt", "target_link_libraries(main PRIVATE SDL3::SDL3)\n",
                "# Zinc (zinc export --target android): the program's plugins, then libmain.so = the program, the shell, the engine\nset(ZINC_PLUGINS ${ZINC_ENGINE}/plugins)\n" + pluginCmake +
                "set_target_properties(main PROPERTIES CXX_STANDARD 20)\ntarget_compile_definitions(main PRIVATE ZN_APP_LIBRARY ZN_APP_HEAP_MB=" + heapMb + (proj.perfHud ? " \"ZN_APP_DEV_ENV=\\\"ZINC_PERF_HUD=1\\\"\"" : "") + (appEnv.empty() ? "" : " \"ZN_APP_ENV=\\\"" + appEnv.substr(1) + "\\\"\"") + ")\n"   // zinc.json \"dev\": {\"perfHud\": true}, for debuggable builds (shell_sdl.cpp)
                "target_compile_options(main PRIVATE -O2 -w -ffp-contract=off -fno-stack-protector)\n"
                "target_include_directories(main PRIVATE ${ZINC_ENGINE}/include ${ZINC_ENGINE}/src ${ZINC_ENGINE}/third_party/mimalloc/include)\n"
                "target_link_libraries(main PRIVATE SDL3::SDL3" + pluginLibs + " zn_app log android)\n"
                "# SDL's JNI entry (SDL_android.c) is in a static archive nothing else refers to; 16 KB pages (Play, since 2025-11-01)\n"
                "target_link_options(main PRIVATE \"-Wl,-u,JNI_OnLoad\" \"-Wl,-z,max-page-size=16384\" \"-Wl,--gc-sections\")\n", err) &&
      // Zinc: API 36, the NDK of the pins, the ABIs, the version, the engine's path for the CMake
      replaceIn(out / "app/build.gradle", "compileSdkVersion 35", "compileSdkVersion 36", err) &&
      replaceIn(out / "app/build.gradle", "targetSdkVersion 35", "targetSdkVersion 36", err) &&
      replaceIn(out / "app/build.gradle", "ndkVersion = \"28.2.13676358\"", std::string("ndkVersion = \"") + kNdk + "\"", err) &&
      replaceIn(out / "app/build.gradle", "versionCode 1\n", "versionCode " + std::to_string(code) + "\n", err) &&
      replaceIn(out / "app/build.gradle", "versionName \"1.0\"", "versionName \"" + version + "\"", err) &&
      replaceIn(out / "app/build.gradle", "abiFilters 'arm64-v8a'", "abiFilters(*project.property('zinc.abis').split(','))", err) &&
      replaceIn(out / "app/build.gradle", "arguments \"-DANDROID_PLATFORM=android-21\", \"-DANDROID_STL=c++_static\"",
                std::string("arguments \"-DANDROID_PLATFORM=android-") + std::to_string(minSdk) + "\", \"-DANDROID_STL=c++_static\", \"-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON\", \"-DZINC_ENGINE=${project.property('zinc.engine')}\"\n                targets \"main\"   // Zinc: AGP builds every library of the CMake project otherwise, the engine's CLI and tools among them", err) &&
      replaceIn(out / "app/build.gradle", "minSdkVersion 21", "minSdkVersion " + std::to_string(minSdk), err) &&
      // Zinc: the upload key of a release (zinc export --aab, ZN-629), named at build time and never kept in the project; else the debug keystore
      replaceIn(out / "app/build.gradle", "    buildTypes {\n        release {\n",
                "    signingConfigs {   // Zinc: the upload key: path and alias from -Pzinc.keystore and -Pzinc.keyAlias (or ZINC_ANDROID_KEYSTORE, ZINC_ANDROID_KEY_ALIAS), passwords from the environment\n"
                "        upload {\n"
                "            def ks = project.findProperty('zinc.keystore') ?: System.getenv('ZINC_ANDROID_KEYSTORE')\n"
                "            if (ks) {\n"
                "                storeFile file(ks)\n"
                "                storePassword System.getenv('ZINC_ANDROID_STORE_PASSWORD')\n"
                "                keyAlias project.findProperty('zinc.keyAlias') ?: System.getenv('ZINC_ANDROID_KEY_ALIAS') ?: 'upload'\n"
                "                keyPassword System.getenv('ZINC_ANDROID_KEY_PASSWORD') ?: System.getenv('ZINC_ANDROID_STORE_PASSWORD')\n"
                "            }\n"
                "        }\n"
                "    }\n"
                "    buildTypes {\n        release {\n"
                "            signingConfig signingConfigs.upload.storeFile ? signingConfigs.upload : signingConfigs.debug   // Zinc: without an upload key, the debug keystore (local tests; Play refuses it)\n", err) &&
      replaceIn(out / "app/build.gradle", "APP_PLATFORM=android-21", "APP_PLATFORM=android-" + std::to_string(minSdk), err) &&
      replaceIn(out / "build.gradle", "com.android.tools.build:gradle:8.7.3", std::string("com.android.tools.build:gradle:") + kAgp, err) &&
      replaceIn(out / "gradle/wrapper/gradle-wrapper.properties", "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.12-bin.zip",
                std::string("distributionUrl=https\\://services.gradle.org/distributions/gradle-") + kGradle + "-bin.zip\ndistributionSha256Sum=" + kGradleSha, err) &&
      // Zinc: the app's name, its permissions
      replaceIn(out / "app/src/main/res/values/strings.xml", "<string name=\"app_name\">Game</string>", "<string name=\"app_name\">" + xml(!proj.app.name.empty() ? proj.app.name : p.name) + "</string>", err) &&
      replaceIn(out / "app/src/main/AndroidManifest.xml", "    <uses-feature android:glEsVersion=\"0x00020000\" />\n", "    <uses-feature android:glEsVersion=\"0x00020000\" />\n" + perms, err) &&
      // Zinc: back goes to the program's back handlers, the predictive gesture's progress too (Android 13+, ZincActivity.registerBack)
      replaceIn(out / "app/src/main/AndroidManifest.xml", "android:enableOnBackInvokedCallback=\"false\"", "android:enableOnBackInvokedCallback=\"true\"", err) &&
      // Zinc: the safe area is what the bars and the cutout cover (react-native-safe-area-context's); SDL adds the gesture zones, which padded
      // a portrait page by the back gesture's edges (ZN-625)
      replaceIn(out / "app/src/main/java/org/libsdl/app/SDLSurface.java", "WindowInsets.Type.systemBars() |\n                                               WindowInsets.Type.systemGestures() |\n                                               WindowInsets.Type.mandatorySystemGestures() |\n                                               WindowInsets.Type.tappableElement() |\n",
                "WindowInsets.Type.systemBars() |\n", err) &&
      // Zinc: the plugins' manifest fragments and Gradle dependencies (plugin.json targets.android)
      (topXml.empty() || replaceIn(out / "app/src/main/AndroidManifest.xml", "    <application android:label", topXml + "    <application android:label", err)) &&
      (appXml.empty() || replaceIn(out / "app/src/main/AndroidManifest.xml", "    </application>", appXml + "    </application>", err)) &&
      (links.empty() || replaceIn(out / "app/src/main/AndroidManifest.xml", "        </activity>", links + "        </activity>", err)) &&
      (plugs.gradle.empty() || replaceIn(out / "app/build.gradle", "    implementation fileTree(include: ['*.jar'], dir: 'libs')\n",
                                        "    implementation fileTree(include: ['*.jar'], dir: 'libs')\n" + [&] { std::string d; for (const std::string& g : plugs.gradle) d += "    implementation '" + g + "'   // a plugin's (plugin.json targets.android.gradle)\n"; return d; }(), err));
  if (!ok) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
  // the plugins' Java and Kotlin sources, in the directory of their package; Kotlin brings its Gradle plugin
  bool kotlin = false;
  for (const std::string& j : plugs.java) {
    std::ifstream in(j);
    std::string line, pkg;
    while (pkg.empty() && std::getline(in, line)) if (line.rfind("package ", 0) == 0) { pkg = line.substr(8); pkg = pkg.substr(0, pkg.find_first_of("; \r")); }
    std::replace(pkg.begin(), pkg.end(), '.', '/');
    fs::create_directories(out / "app/src/main/java" / pkg, ec);
    fs::copy_file(j, out / "app/src/main/java" / pkg / fs::path(j).filename(), fs::copy_options::overwrite_existing, ec);
    if (ec) { std::fprintf(stderr, "zinc export: copying %s: %s\n", j.c_str(), ec.message().c_str()); return 1; }
    kotlin = kotlin || fs::path(j).extension() == ".kt";
  }
  if (kotlin && !(replaceIn(out / "build.gradle", std::string("classpath 'com.android.tools.build:gradle:") + kAgp + "'", std::string("classpath 'com.android.tools.build:gradle:") + kAgp + "'\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:" + kKotlin + "'", err) &&
                  replaceIn(out / "app/build.gradle", "    id 'com.android.application'\n", "    id 'com.android.application'\n    id 'org.jetbrains.kotlin.android'   // a plugin's Kotlin sources\n", err) &&
                  replaceIn(out / "app/build.gradle", "    lint {", "    compileOptions { sourceCompatibility JavaVersion.VERSION_17; targetCompatibility JavaVersion.VERSION_17 }\n    lint {", err) &&
                  replaceIn(out / "app/build.gradle", "\ndependencies {", "\nkotlin { compilerOptions { jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17 } }\n\ndependencies {", err))) {
    std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1;
  }
  {   // gradle.properties: the CMake build of the template (BUILD_WITH_CMAKE), the engine, the ABIs
    std::ifstream in(out / "gradle.properties"); std::stringstream ss; ss << in.rdbuf();
    writeFile(out / "gradle.properties", ss.str() + "\n# Zinc (zinc export --target android): the CMake build, the engine whose sources it compiles (a checkout), the ABIs\n"
              "# (-Pzinc.abis=armeabi-v7a builds one)\nBUILD_WITH_CMAKE=1\nzinc.engine=" + engine.string() + "\nzinc.abis=armeabi-v7a,arm64-v8a,x86_64\n# the plugins' Gradle dependencies are AndroidX libraries (androidx.core, androidx.webkit...)\nandroid.useAndroidX=true\n");
  }
  fs::create_directories(out / "app/src/main/java" / pkgPath, ec);
  // Zinc's activity (src/app/android/java: ZincActivity, the system signals and commands, and ZincEdit, the text input connection), and the
  // script's activity on it, with SDL3 linked into libmain.so rather than a libSDL3.so of its own
  fs::copy(engine / "src/app/android/java", out / "app/src/main/java", fs::copy_options::recursive | fs::copy_options::overwrite_existing, ec);
  {   // the plugins' lifecycle subscribers (plugin.json targets.android.lifecycle), which ZincActivity calls
    std::string list;
    for (const std::string& c : plugs.lifecycle) list += "            new " + javaId(c) + "(),\n";
    writeFile(out / "app/src/main/java/dev/zinc/app/ZincPlugins.java", "// Written by zinc export from the program's plugins (plugin.json targets.android.lifecycle).\npackage dev.zinc.app;\n\nfinal class ZincPlugins {\n"
              "    static ZincLifecycle[] lifecycles() {\n        return new ZincLifecycle[] {\n" + list + "        };\n    }\n}\n");
  }
  writeFile(out / "app/src/main/java" / pkgPath / (activity + ".java"),
            "package " + id + ";\n\nimport dev.zinc.app.ZincActivity;\n\npublic class " + activity + " extends ZincActivity\n{\n    @Override\n    protected String[] getLibraries() { return new String[] { \"main\" }; }   // Zinc: SDL3 is inside libmain.so\n}\n");
  if (!proj.app.icon.empty() && fs::exists(fs::path(p.dir) / proj.app.icon))   // zinc.json app.icon, a PNG, for every density
    for (const char* d : {"mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"}) fs::copy_file(fs::path(p.dir) / proj.app.icon, out / "app/src/main/res" / (std::string("mipmap-") + d) / "ic_launcher.png", fs::copy_options::overwrite_existing, ec);
  // assets/ of the project: in the APK under zinc/assets, listed for the shell, which copies them once per version (src/app/shell_sdl.cpp)
  if (fs::is_directory(fs::path(p.dir) / "assets", ec)) {
    const fs::path dst = out / "app/src/main/assets/zinc/assets";
    fs::create_directories(dst, ec);
    fs::copy(fs::path(p.dir) / "assets", dst, fs::copy_options::recursive | fs::copy_options::overwrite_existing, ec);
    std::vector<std::string> files;
    for (auto it = fs::recursive_directory_iterator(dst, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) if (it->is_regular_file()) files.push_back(it->path().lexically_relative(dst).generic_string());
    std::sort(files.begin(), files.end());
    std::string list, all;
    for (const std::string& f : files) { list += f + "\n"; all += f + " " + zn::tc::sha256File((dst / f).string()) + "\n"; }
    writeFile(out / "app/src/main/assets/zinc/assets.txt", version + "-" + std::to_string(code) + "-" + zn::tc::sha256Hex(all).substr(0, 16) + "\n" + list);   // the stamp first: other assets, another copy
  }
  const std::string cmds = "  cd " + q(out.string()) + "\n  ./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk (-Pzinc.abis=armeabi-v7a for one ABI)\n"
                           "  adb install -r app/build/outputs/apk/debug/app-debug.apk\n"
                           "  ZINC_ANDROID_KEYSTORE=<upload.jks> ZINC_ANDROID_KEY_ALIAS=upload ZINC_ANDROID_STORE_PASSWORD=... ./gradlew bundleRelease   # app/build/outputs/bundle/release/app-release.aab (zinc export --aab also checks it)\n";
  writeFile(out / "README-zinc.txt", p.name + " " + version + " (android) exported by Zinc from SDL's Android project: a Gradle project. It needs the Android SDK (ANDROID_HOME or local.properties sdk.dir),\n"
            "the NDK " + kNdk + " and a JDK 17 to 21. The native build compiles the Zinc engine from " + engine.string() + " (gradle.properties zinc.engine).\n"
            "A release is signed with your upload key, named by the environment (never kept here); without one, with the debug keystore.\n\n" + cmds);
  if (print) std::printf("%s", cmds.c_str());
  std::printf("%s\n", out.string().c_str());
  if (pk.aab || pk.apk) return packAndroid(proj, p, out, pk) ? 0 : 1;
  return 0;
}

// zinc export --target ios (ZN-623, D59, docs/reports/zinc-next-ios.md): a CMake project that CMake's Xcode generator turns into the Xcode
// project, the way SDL documents an iOS build (docs/README-cmake.md: CMAKE_SYSTEM_NAME=iOS, SDL added with add_subdirectory) and the way the
// Android export builds its native code. The engine (zn_app, SDL3 with its UIKit backend inside) is compiled from its sources (ZINC_ENGINE),
// not copied; the project holds the program's C++, its plugins, Info.plist from zinc.json, the asset catalog with the icon and assets/.
// A hand-written .pbxproj (or SDL's Xcode template, not in the vendored tree) would list every engine source and break at each change of
// them. Nothing of Xcode runs here: cmake -G Xcode and xcodebuild do (--print lists them).
namespace ios {
constexpr const char* kMinIos = "16.3";   // the system libc++ has std::to_chars for doubles (the engine formats numbers with it) from 16.3: iPhone 8 and later
#if defined(__aarch64__) || defined(__arm64__)
constexpr const char* kSimArch = "arm64";   // the simulator runs this Mac's architecture
#else
constexpr const char* kSimArch = "x86_64";
#endif
// The required-reason APIs the engine calls (PrivacyInfo.xcprivacy, ZN-629), found with `nm -u` on the iOS build of hello and rn-showcase:
// stat, fstat, lstat (file timestamps: zinc:fs stat, the asset cache, sqlite) for files of the app's container; mach_absolute_time (SDL's ticks,
// performance.now) for elapsed time; statfs (libuv's uv_fs_statfs) to check the space before writing. App Store Connect refuses an upload
// whose binary calls one that the manifest does not declare. A plugin adds its own (plugin.json targets.ios.privacy).
const std::vector<std::pair<std::string, std::string>> kEnginePrivacy = {
    {"NSPrivacyAccessedAPICategoryFileTimestamp", "C617.1"},
    {"NSPrivacyAccessedAPICategorySystemBootTime", "35F9.1"},
    {"NSPrivacyAccessedAPICategoryDiskSpace", "E174.1"},
};
}  // namespace ios

// zinc export --target ios --ipa (ZN-629): the device build archived and exported with ExportOptions.plist (zinc.json signing.ios: the team,
// the method, a provisioning profile for manual signing), or with --simulator a Debug .app for the simulator zipped (what simulator test
// farms take). Signing identities and profiles are the developer's: Xcode makes them with -allowProvisioningUpdates for an automatic team.
static bool packIos(const ProjectInfo& p, const fs::path& out, const std::string& team, const std::string& profile, const Pack& pk) {
  const std::string& n = p.name;
  if (pk.simulator) {
    const std::string arch = ios::kSimArch, app = "build/Debug-iphonesimulator/" + n + ".app", zip = n + "-simulator.zip";
    if (!step(out, "cmake -S . -B build -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_ARCHITECTURES=" + arch + " -DCMAKE_OSX_SYSROOT=iphonesimulator", pk.dry) ||
        !step(out, "xcodebuild -quiet -project build/" + n + ".xcodeproj -scheme " + n + " -configuration Debug -sdk iphonesimulator -arch " + arch + " -derivedDataPath build/dd CODE_SIGNING_ALLOWED=NO build", pk.dry) ||
        !step(out, "ditto -c -k --keepParent " + app + " " + zip, pk.dry))
      return false;
    std::printf("simulator app: %s\nnext: xcrun simctl install booted %s\n", (out / zip).string().c_str(), q((out / app).string()).c_str());
    return true;
  }
  if (team.empty() && !pk.dry) { std::fprintf(stderr, "zinc export: a device build is signed by your Apple team: set zinc.json signing.ios.team or ZINC_IOS_TEAM (the team id of developer.apple.com, Membership); --simulator builds for the simulator without one\n"); return false; }
  const std::string t = team.empty() ? "<team id>" : team, archive = "build-device/" + n + ".xcarchive";
  if (!step(out, "cmake -S . -B build-device -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DZINC_TEAM=" + q(t) + (profile.empty() ? "" : " -DZINC_PROFILE=" + q(profile)), pk.dry) ||
      !step(out, "xcodebuild -quiet -project build-device/" + n + ".xcodeproj -scheme " + n + " -configuration Release -sdk iphoneos -derivedDataPath build-device/dd -allowProvisioningUpdates archive -archivePath " + archive, pk.dry) ||
      !step(out, "xcodebuild -quiet -exportArchive -archivePath " + archive + " -exportPath build-device/ipa -exportOptionsPlist ExportOptions.plist -allowProvisioningUpdates", pk.dry))
    return false;
  const fs::path ipa = out / "build-device/ipa" / (n + ".ipa");
  std::printf("ipa: %s\nnext (App Store Connect, TestFlight; an App Store Connect API key in ~/.appstoreconnect/private_keys):\n"
              "  xcrun altool --validate-app -f %s -t ios --api-key <key id> --api-issuer <issuer id>\n"
              "  xcrun altool --upload-app -f %s -t ios --api-key <key id> --api-issuer <issuer id>   # or drop the .ipa on Transporter.app\n",
              ipa.string().c_str(), q(ipa.string()).c_str(), q(ipa.string()).c_str());
  return true;
}

static int exportIos(const ProjectInfo& p, const fs::path& out, const std::string& engineRoot, bool print, const Pack& pk) {
  std::error_code ec;
  const fs::path engine = fs::absolute(engineRoot).lexically_normal(), src = out / "src";
  if (!fs::exists(engine / "src/app/shell_sdl.cpp") || !fs::exists(engine / "third_party/SDL3/src/video/uikit")) { std::fprintf(stderr, "zinc export: --target ios needs the engine's sources (%s)\n", engine.string().c_str()); return 1; }
  zn::frontend::Project proj;
  { std::ifstream pf(fs::path(p.dir) / "zinc.json"); std::stringstream ps; ps << pf.rdbuf(); std::string perr; if (pf) zn::frontend::parseProject(ps.str(), proj, perr); }
  fs::create_directories(src, ec);
  std::vector<std::string> units, names;
  if (proj.player ? !playerProgram(p, engine, "ios", out / "zinc/home.unit", units, names) : !appProgram(p, "ios", src, units, names)) return 1;
  AppPlugins plugs;
  if (!appPluginsCmake(names, engine, p, "ios", out, src / "plugins", plugs)) return 1;
  if (proj.player) writeFile(src / "player_modules.cpp", playerModules(plugs.modules, names));
  const std::string& pluginCmake = plugs.cmake;
  const std::string pluginLibs = plugs.libs + (proj.player ? " zn_app_player" : "");   // the interpreter and the link to zinc dev (src/app/player.cpp)
  const zn::frontend::Profile* prof = zn::frontend::findProfile("ios");
  const std::string heapMb = std::to_string(prof ? prof->heapBytes >> 20 : 256);
  const std::string id = proj.app.id.empty() ? "dev.zinc." + p.name : proj.app.id;   // zinc check took it as reverse DNS: a valid CFBundleIdentifier
  const std::string version = !proj.app.version.empty() ? proj.app.version : !p.version.empty() ? p.version : "1.0";
  const std::string display = android::xml(!proj.app.name.empty() ? proj.app.name : p.name);
  const bool icon = !proj.app.icon.empty() && fs::exists(fs::path(p.dir) / proj.app.icon);
  // Info.plist: the keys Xcode's iOS app template has, the launch screen without a storyboard (UILaunchScreen), the orientations of
  // zinc.json app.orientation, and a usage string for each permission that iOS asks the user for
  auto key = [](const std::string& k, const std::string& v) { return "\t<key>" + k + "</key>\n\t<string>" + v + "</string>\n"; };
  auto orients = [](std::initializer_list<const char*> l) { std::string r = "\t<array>\n"; for (const char* o : l) r += std::string("\t\t<string>UIInterfaceOrientation") + o + "</string>\n"; return r + "\t</array>\n"; };
  std::string usage;
  std::set<std::string> taken = {"CFBundleDevelopmentRegion", "CFBundleDisplayName", "CFBundleExecutable", "CFBundleIdentifier", "CFBundleInfoDictionaryVersion", "CFBundleName",
                                 "CFBundlePackageType", "CFBundleShortVersionString", "CFBundleVersion", "LSRequiresIPhoneOS", "UILaunchScreen", "UIRequiresFullScreen"};
  for (const auto& [k, v] : zn::frontend::usageStrings(proj, "ios", proj.app.name.empty() ? p.name : proj.app.name)) { usage += key(k, android::xml(v)); taken.insert(k); }   // zinc.json permissionStrings, else a default
  if (proj.player) {   // a player announces itself as a device of zinc device (ZN-792, src/app/player.cpp's DNSServiceRegister)
    usage += "\t<key>NSBonjourServices</key>\n\t<array>\n\t\t<string>_zinc._tcp</string>\n\t</array>\n";
    // its Documents folder in the Files app (On My iPhone > Zinc Go): what the programs it runs save there, a file to give one
    usage += "\t<key>UIFileSharingEnabled</key>\n\t<true/>\n\t<key>LSSupportsOpeningDocumentsInPlace</key>\n\t<true/>\n";
    taken.insert({"NSBonjourServices", "UIFileSharingEnabled", "LSSupportsOpeningDocumentsInPlace"});
  }
  if (!proj.app.urlSchemes.empty()) {   // zinc.json app.urlSchemes: the app opens their links (deep links, zinc:system open-url)
    usage += "\t<key>CFBundleURLTypes</key>\n\t<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>" + android::xml(id) + "</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n";
    for (const std::string& s : proj.app.urlSchemes) usage += "\t\t\t\t<string>" + android::xml(s) + "</string>\n";
    usage += "\t\t\t</array>\n\t\t</dict>\n\t</array>\n";
    taken.insert("CFBundleURLTypes");
  }
  usage += plistEntries(plugs.plist, taken);   // the plugins' Info.plist keys (plugin.json targets.ios.plist): Zinc's own keys and the first plugin's win
  const std::string phone = proj.app.orientation == "portrait" ? orients({"Portrait"}) : proj.app.orientation == "landscape" ? orients({"LandscapeLeft", "LandscapeRight"})
                                                                                                                        : orients({"Portrait", "LandscapeLeft", "LandscapeRight"});
  const std::string pad = proj.app.orientation == "portrait" ? orients({"Portrait", "PortraitUpsideDown"}) : proj.app.orientation == "landscape" ? orients({"LandscapeLeft", "LandscapeRight"})
                                                                                                                                              : orients({"Portrait", "PortraitUpsideDown", "LandscapeLeft", "LandscapeRight"});
  writeFile(out / "Info.plist", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n" +
            key("CFBundleDevelopmentRegion", "en") + key("CFBundleDisplayName", display) + key("CFBundleExecutable", p.name) + key("CFBundleIdentifier", "$(PRODUCT_BUNDLE_IDENTIFIER)") +
            key("CFBundleInfoDictionaryVersion", "6.0") + key("CFBundleName", display) + key("CFBundlePackageType", "APPL") + key("CFBundleShortVersionString", android::xml(version)) +
            key("CFBundleVersion", std::to_string(appVersionCode(proj, version))) + "\t<key>LSRequiresIPhoneOS</key>\n\t<true/>\n" + usage +
            "\t<key>UILaunchScreen</key>\n\t<dict/>\n"
            "\t<key>UIApplicationSupportsIndirectInputEvents</key>\n\t<true/>\n"   // an iPad's mouse and trackpad reach SDL as a mouse (SDL asks for it)
            "\t<key>UIRequiresFullScreen</key>\n\t<true/>\n"   // the window is the screen: no iPad split view, and every orientation is not required
            "\t<key>UISupportedInterfaceOrientations</key>\n" + phone + "\t<key>UISupportedInterfaceOrientations~ipad</key>\n" + pad + "</dict>\n</plist>\n");
  // the asset catalog: the icon (zinc.json app.icon, a PNG; one 1024 x 1024 image, which Xcode 14 and later scale for every size)
  writeFile(out / "Assets.xcassets/Contents.json", "{\n  \"info\" : {\n    \"author\" : \"xcode\",\n    \"version\" : 1\n  }\n}\n");
  if (icon) {
    fs::create_directories(out / "Assets.xcassets/AppIcon.appiconset", ec);
    // actool refuses any other size ("did not have any applicable content"): a smaller or SVG icon is drawn at 1024
    std::ifstream in(fs::path(p.dir) / proj.app.icon, std::ios::binary);
    const std::string bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    int w = 0, h = 0, scale = 1;
    std::vector<std::uint8_t> rgba, sized;
    std::string ierr;
    if (zn::assets::decodeImage(proj.app.icon, bytes, {{"scale", "8"}}, w, h, scale, rgba, ierr) && (w != 1024 || h != 1024)) {
      zn::assets::resizeRgba(rgba, w, h, sized, 1024, 1024);
      const std::vector<std::uint8_t> png = zn::res::encodePng(sized.data(), 1024, 1024, 4);
      writeFile(out / "Assets.xcassets/AppIcon.appiconset/icon.png", std::string(png.begin(), png.end()));
    } else {
      fs::copy_file(fs::path(p.dir) / proj.app.icon, out / "Assets.xcassets/AppIcon.appiconset/icon.png", fs::copy_options::overwrite_existing, ec);
    }
    writeFile(out / "Assets.xcassets/AppIcon.appiconset/Contents.json", "{\n  \"images\" : [\n    {\n      \"filename\" : \"icon.png\",\n      \"idiom\" : \"universal\",\n      \"platform\" : \"ios\",\n"
              "      \"size\" : \"1024x1024\"\n    }\n  ],\n  \"info\" : {\n    \"author\" : \"xcode\",\n    \"version\" : 1\n  }\n}\n");
  }
  // assets/ of the project: in the bundle under assets/, where the shell points zinc:assets and the working directory's assets link (src/app/shell_sdl.cpp)
  if (fs::is_directory(fs::path(p.dir) / "assets", ec)) fs::copy(fs::path(p.dir) / "assets", out / "assets", fs::copy_options::recursive | fs::copy_options::overwrite_existing, ec);
  std::string appEnv;   // zinc.json targets.ios, for every build (shell_sdl.cpp): the HAL's variables that zinc run sets on a desktop
  if (auto t = proj.targets.find("ios"); t != proj.targets.end()) {
    if (t->second.fullscreen) appEnv += " ZINC_FULLSCREEN=1";
    if (t->second.kiosk) appEnv += " ZINC_KIOSK=1";
  }
  if (!plugs.entitlements.empty()) {   // the plugins' entitlements (plugin.json targets.ios.entitlements), signed into a device build
    std::set<std::string> none;
    writeFile(out / (p.name + ".entitlements"), "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n" +
              plistEntries(plugs.entitlements, none) + "</dict>\n</plist>\n");
  }
  {   // PrivacyInfo.xcprivacy: the engine's required-reason APIs and the plugins' (targets.ios.privacy); no tracking, no data collected
    std::map<std::string, std::set<std::string>> reasons;
    for (const auto& [cat, why] : ios::kEnginePrivacy) reasons[cat].insert(why);
    for (const std::string& o : plugs.privacy) {
      yyjson_doc* d = yyjson_read(o.data(), o.size(), 0);
      size_t i, n2;
      yyjson_val *k, *v;
      if (d) yyjson_obj_foreach(yyjson_doc_get_root(d), i, n2, k, v) for (const std::string& r : jsonStrings(v)) reasons[yyjson_get_str(k)].insert(r);
      yyjson_doc_free(d);
    }
    std::string types;
    for (const auto& [cat, rs] : reasons) {
      types += "\t\t<dict>\n\t\t\t<key>NSPrivacyAccessedAPIType</key>\n\t\t\t<string>" + android::xml(cat) + "</string>\n\t\t\t<key>NSPrivacyAccessedAPITypeReasons</key>\n\t\t\t<array>\n";
      for (const std::string& r : rs) types += "\t\t\t\t<string>" + android::xml(r) + "</string>\n";
      types += "\t\t\t</array>\n\t\t</dict>\n";
    }
    writeFile(out / "PrivacyInfo.xcprivacy", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n"
              "\t<key>NSPrivacyTracking</key>\n\t<false/>\n\t<key>NSPrivacyTrackingDomains</key>\n\t<array/>\n\t<key>NSPrivacyCollectedDataTypes</key>\n\t<array/>\n"
              "\t<key>NSPrivacyAccessedAPITypes</key>\n\t<array>\n" + types + "\t</array>\n</dict>\n</plist>\n");
  }
  // ExportOptions.plist for xcodebuild -exportArchive (zinc export --ipa): zinc.json signing.ios, the team also from ZINC_IOS_TEAM; automatic
  // signing unless a provisioning profile is named (then the archive is signed manually with it too: ZINC_PROFILE in CMakeLists.txt)
  const char* envTeam = std::getenv("ZINC_IOS_TEAM");
  const std::string team = envTeam && *envTeam ? envTeam : proj.iosTeam, method = proj.iosMethod.empty() ? "app-store-connect" : proj.iosMethod;
  writeFile(out / "ExportOptions.plist", "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n" +
            key("method", method) + (team.empty() ? "" : key("teamID", android::xml(team))) + key("signingStyle", proj.iosProfile.empty() ? "automatic" : "manual") +
            (proj.iosProfile.empty() ? "" : "\t<key>provisioningProfiles</key>\n\t<dict>\n\t\t<key>" + android::xml(id) + "</key>\n\t\t<string>" + android::xml(proj.iosProfile) + "</string>\n\t</dict>\n") +
            key("destination", "export") + "</dict>\n</plist>\n");
  std::string unitList;
  for (const std::string& u : units) unitList += " src/" + u;
  if (plugs.swift) {   // a plugin's Swift in a static library: the app needs a Swift file of its own for Xcode to link the Swift runtime's libraries
    writeFile(src / "zinc_swift.swift", "// Empty: the plugins' Swift code is linked through it (zinc export --target ios)\n");
    unitList += " src/zinc_swift.swift";
  }
  const std::string& n = p.name;
  writeFile(out / "CMakeLists.txt",
            "# " + n + " " + version + " (ios), exported by Zinc (zinc export --target ios): CMake's Xcode generator makes the Xcode project (README-zinc.txt)\n"
            "cmake_minimum_required(VERSION 3.24)\n"
            "set(CMAKE_OSX_DEPLOYMENT_TARGET " + ios::kMinIos + " CACHE STRING \"the oldest iOS the app runs on\")\n"
            "project(" + n + " C CXX OBJC OBJCXX" + (plugs.swift ? " Swift" : "") + ")   # Objective-C for the plugins' .m and .mm sources, Swift for their .swift ones\n"
            "set(ZINC_ENGINE \"" + engine.generic_string() + "\" CACHE PATH \"the engine whose sources this project compiles (a checkout)\")\n"
            "set(ZINC_TEAM \"\" CACHE STRING \"the Apple team that signs a device build (DEVELOPMENT_TEAM)\")\n"
            "set(ZINC_BUNDLE_ID \"" + id + "\" CACHE STRING \"the bundle identifier (zinc.json app.id); another team signs it under its own, as an id belongs to one team\")\n"
            "set(ZINC_PROFILE \"\" CACHE STRING \"a provisioning profile that signs a device build manually (zinc.json signing.ios.profile; empty: automatic signing)\")\n"
            "add_compile_options(" + std::string(plugs.swift ? "\"$<$<NOT:$<COMPILE_LANGUAGE:Swift>>:-O2>\"" : "-O2") + ")   # the engine and SDL optimized in a Debug build too\n"
            "set(ZN_WEBGL OFF CACHE BOOL \"\" FORCE)\n"
            "add_subdirectory(${ZINC_ENGINE} zinc EXCLUDE_FROM_ALL)   # the engine (zn_app), SDL3 inside it\n"
            "set(ZINC_PLUGINS ${ZINC_ENGINE}/plugins)\n" + pluginCmake +
            "# the app: the program, the shell (SDL3's main callbacks over include/zn/app.h), the asset catalog and assets/ in the bundle\n"
            "file(GLOB_RECURSE ZINC_ASSET_FILES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/assets/*)\n"
            "add_executable(" + n + " MACOSX_BUNDLE" + unitList + " ${ZINC_ENGINE}/src/app/shell_sdl.cpp Assets.xcassets PrivacyInfo.xcprivacy ${ZINC_ASSET_FILES}" + (proj.player ? " zinc/home.unit" : "") + ")\n"
            "set_source_files_properties(Assets.xcassets PrivacyInfo.xcprivacy PROPERTIES MACOSX_PACKAGE_LOCATION Resources)\n" +
            (proj.player ? "set_source_files_properties(zinc/home.unit PROPERTIES MACOSX_PACKAGE_LOCATION Resources/zinc)   # a player's home screen (src/app/player.cpp)\n" : "") +
            "foreach(f ${ZINC_ASSET_FILES})\n"
            "  file(RELATIVE_PATH r ${CMAKE_CURRENT_SOURCE_DIR} ${f})\n"
            "  get_filename_component(d ${r} DIRECTORY)\n"
            "  set_source_files_properties(${f} PROPERTIES MACOSX_PACKAGE_LOCATION Resources/${d})\n"
            "endforeach()\n"
            "set_target_properties(" + n + " PROPERTIES CXX_STANDARD 20 MACOSX_BUNDLE_INFO_PLIST ${CMAKE_CURRENT_SOURCE_DIR}/Info.plist\n" +
            (plugs.entitlements.empty() ? "" : "  XCODE_ATTRIBUTE_CODE_SIGN_ENTITLEMENTS ${CMAKE_CURRENT_SOURCE_DIR}/" + n + ".entitlements\n") +
            "  XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER \"${ZINC_BUNDLE_ID}\" XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY \"1,2\"\n" +
            (icon ? "  XCODE_ATTRIBUTE_ASSETCATALOG_COMPILER_APPICON_NAME AppIcon\n" : "") +
            "  XCODE_ATTRIBUTE_CODE_SIGN_STYLE Automatic XCODE_ATTRIBUTE_DEVELOPMENT_TEAM \"${ZINC_TEAM}\")\n"
            "if(ZINC_PROFILE)   # manual signing: this profile and its certificate, for the app only (the static libraries are not signed)\n  set_target_properties(" + n + " PROPERTIES XCODE_ATTRIBUTE_CODE_SIGN_STYLE Manual XCODE_ATTRIBUTE_PROVISIONING_PROFILE_SPECIFIER \"${ZINC_PROFILE}\" XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY \"" + (method == "debugging" ? "Apple Development" : "Apple Distribution") + "\")\nendif()\n"
            "target_compile_definitions(" + n + " PRIVATE ZN_APP_LIBRARY ZN_APP_HEAP_MB=" + heapMb + (proj.perfHud ? " \"ZN_APP_DEV_ENV=\\\"ZINC_PERF_HUD=1\\\"\"" : "") +
            (appEnv.empty() ? "" : " \"ZN_APP_ENV=\\\"" + appEnv.substr(1) + "\\\"\"") +
            (plugs.lifecycle.empty() ? "" : " \"ZN_APP_LIFECYCLE=\\\"" + [&] { std::string l; for (const std::string& c : plugs.lifecycle) l += (l.empty() ? "" : ",") + android::javaId(c); return l; }() + "\\\"\"") + ")\n"   // zinc.json "dev": {"perfHud": true}, for Debug builds; the plugins' lifecycle classes (shell_sdl.cpp)
            "target_compile_options(" + n + " PRIVATE " + (plugs.swift ? "\"$<$<NOT:$<COMPILE_LANGUAGE:Swift>>:-w;-ffp-contract=off;-fno-stack-protector>\"" : "-w -ffp-contract=off -fno-stack-protector") + ")\n"   // not swiftc's (src/zinc_swift.swift)
            "target_include_directories(" + n + " PRIVATE ${ZINC_ENGINE}/include ${ZINC_ENGINE}/src ${ZINC_ENGINE}/third_party/mimalloc/include)\n"
            "target_link_libraries(" + n + " PRIVATE SDL3::SDL3" + pluginLibs + " zn_app)\n"
            "target_link_options(" + n + " PRIVATE -dead_strip" + (plugs.objc ? " -ObjC" : "") + ")\n");   // -ObjC: the plugins' classes that only NSClassFromString names
  const std::string cmds = "  cd " + q(out.string()) + "\n"
                           "  cmake -S . -B build -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_ARCHITECTURES=arm64 -DCMAKE_OSX_SYSROOT=iphonesimulator     # writes build/" + n + ".xcodeproj\n"
                           "  xcodebuild -project build/" + n + ".xcodeproj -scheme " + n + " -configuration Debug -sdk iphonesimulator -arch arm64 -derivedDataPath build/dd CODE_SIGNING_ALLOWED=NO build\n"
                           "  xcrun simctl install booted build/Debug-iphonesimulator/" + n + ".app\n"
                           "  xcrun simctl launch --console-pty booted " + id + "\n"
                           "  cmake -S . -B build-device -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DZINC_TEAM=<your team id> && xcodebuild -project build-device/" + n + ".xcodeproj -scheme " + n + " -configuration Release -sdk iphoneos -derivedDataPath build-device/dd -allowProvisioningUpdates archive -archivePath build-device/" + n + ".xcarchive\n"
                           "  xcodebuild -exportArchive -archivePath build-device/" + n + ".xcarchive -exportPath build-device/ipa -exportOptionsPlist ExportOptions.plist -allowProvisioningUpdates   # build-device/ipa/" + n + ".ipa (zinc export --ipa does these steps)\n";
  writeFile(out / "README-zinc.txt", n + " " + version + " (ios) exported by Zinc: a CMake project for CMake's Xcode generator (CMake 3.24 or later, Xcode 26). It compiles the\n"
            "Zinc engine from " + engine.string() + " (CMakeLists.txt ZINC_ENGINE). The simulator build needs no signing; a device build is signed by\n"
            "your Apple team (-DZINC_TEAM=, or in Xcode: Signing & Capabilities). An Intel Mac builds the simulator with -arch x86_64.\n\n" + cmds);
  if (print) std::printf("%s", cmds.c_str());
  std::printf("%s\n", out.string().c_str());
  if (pk.ipa) return packIos(p, out, team, proj.iosProfile, pk) ? 0 : 1;
  return 0;
}

// zinc export --target wasm (ZN-326.01): a static site, the program as ZBC (app.zbc) for the interpreter built for the browser (app.wasm, tools/build-wasm) and the
// page's glue (targets/wasm/glue: app.js, its worker and WASI). The SharedArrayBuffer of the frame loop needs COOP/COEP headers: serve.py serves the folder with them.
static int exportWasm(const ProjectInfo& p, const fs::path& out, const std::string& engineRoot) {
  const fs::path root = engineRoot, glue = root / "targets" / "wasm" / "glue", wasm = root / "build-wasm" / "vm-web.wasm";
  if (fs::exists(root / "tools" / "build-wasm") && status(std::system((q((root / "tools" / "build-wasm").string()) + " >/dev/null").c_str())) != 0) {   // incremental: links when the runtime changed
    std::fprintf(stderr, "zinc export: tools/build-wasm failed (zinc toolchain install fetches the pinned zig)\n"); return 1;
  }
  std::error_code ec;
  if (!fs::exists(wasm, ec)) { std::fprintf(stderr, "zinc export: %s is missing\n", wasm.string().c_str()); return 1; }
  if (status(std::system((q(self()) + " --emit=zbc-bin " + q(p.entry) + " " + q((out / "app.zbc").string())).c_str())) != 0) { std::fprintf(stderr, "zinc export: the build failed\n"); return 1; }
  // the baked images of a program with assets (the blob of zinc bake): the worker draws zinc:gfx images from it (ZN-432)
  if (fs::exists(fs::path(p.dir) / "assets", ec) && status(std::system((q(self()) + " bake " + q(p.entry) + " -o " + q((out / "app.res").string())).c_str())) != 0) { std::fprintf(stderr, "zinc export: the resources could not be baked\n"); return 1; }
  fs::copy_file(wasm, out / "app.wasm", fs::copy_options::overwrite_existing, ec);
  for (const char* f : {"app.js", "worker.mjs", "wasi.mjs"}) fs::copy_file(glue / f, out / f, fs::copy_options::overwrite_existing, ec);
  if (ec) { std::fprintf(stderr, "zinc export: %s\n", ec.message().c_str()); return 1; }
  int w = 480, h = 320;   // the canvas: zinc.json targets.wasm width / height
  std::ifstream pf(fs::path(p.dir) / "zinc.json");
  std::stringstream ps; ps << pf.rdbuf();
  zn::frontend::Project proj; std::string perr;
  const bool haveProj = pf && zn::frontend::parseProject(ps.str(), proj, perr);
  if (haveProj && proj.targets.count("wasm")) {
    const auto& t = proj.targets.at("wasm");
    if (t.width > 0) w = t.width;
    if (t.height > 0) h = t.height;
  }
  std::ifstream gf(glue / "index.html");
  std::stringstream gs; gs << gf.rdbuf();
  std::string page = gs.str();
  const std::string size = "width=\"480\" height=\"320\"";
  if (auto at = page.find(size); at != std::string::npos) page.replace(at, size.size(), "width=\"" + std::to_string(w) + "\" height=\"" + std::to_string(h) + "\"");
  if (auto at = page.find("<title>zinc</title>"); at != std::string::npos) page.replace(at, 19, "<title>" + p.name + "</title>");
  if (haveProj && !proj.app.icon.empty() && fs::copy_file(fs::path(p.dir) / proj.app.icon, out / "favicon.png", fs::copy_options::overwrite_existing, ec))   // zinc.json app.icon (a PNG)
    page.replace(page.find("</title>") + 8, 0, "<link rel=\"icon\" href=\"favicon.png\">");
  if (const std::string style = haveProj ? splashStyle(splashFor(proj, p.dir, "wasm")) : std::string(); !style.empty())
    if (const auto at = page.find("<canvas id=\"c\""); at != std::string::npos) page.insert(at + 14, style);
  writeFile(out / "index.html", page);
  writeFile(out / "serve.py", "#!/usr/bin/env python3\n# Serves this folder on http://127.0.0.1:8000 with the COOP/COEP headers the page needs (SharedArrayBuffer). Any static host that sends them works too.\n"
            "import http.server, os, sys\nclass H(http.server.SimpleHTTPRequestHandler):\n    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{'.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm'})\n"
            "    def end_headers(self):\n        self.send_header('Cross-Origin-Opener-Policy', 'same-origin'); self.send_header('Cross-Origin-Embedder-Policy', 'require-corp'); super().end_headers()\n"
            "os.chdir(os.path.dirname(os.path.abspath(__file__)))\nhttp.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8000), H).serve_forever()\n");
  fs::permissions(out / "serve.py", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  if (fs::exists(fs::path(p.dir) / "assets")) fs::copy(fs::path(p.dir) / "assets", out / "assets", fs::copy_options::recursive, ec);
  writeFile(out / "README.txt", p.name + " " + p.version + " (wasm) built with Zinc.\nServe this folder with the headers Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp\n(./serve.py does, then open http://127.0.0.1:8000).\n");
  std::printf("%s\n", out.string().c_str());
  return 0;
}

// After a macOS export signed by a Developer ID (zinc.json "signing"): the commands that notarize it, the owner's step (an Apple account; ZN-321).
static void notarizeHint(const ProjectInfo& p, const fs::path& out, const std::vector<fs::path>& artifacts) {
  std::ifstream pf(fs::path(p.dir) / "zinc.json");
  std::stringstream ps; ps << pf.rdbuf();
  zn::frontend::Project proj; std::string perr;
  const char* env = std::getenv("ZINC_SIGN_IDENTITY");
  if (!pf || !zn::frontend::parseProject(ps.str(), proj, perr)) return;
  const std::string id = !proj.signIdentity.empty() ? proj.signIdentity : env ? env : "-";
  if (id == "-") return;
  const fs::path app = out / (p.name + ".app");
  fs::path dmg;
  for (const fs::path& a : artifacts) if (a.extension() == ".dmg") dmg = a;
  const std::string profile = proj.notaryProfile.empty() ? "<profile of xcrun notarytool store-credentials>" : proj.notaryProfile;
  const std::string kc = proj.signKeychain.empty() ? "" : " --keychain " + q((fs::path(p.dir) / proj.signKeychain).lexically_normal().string());
  std::printf("notarize (needs the Apple account of the identity):\n");
  if (!dmg.empty()) {
    std::printf("  codesign --force --timestamp --sign %s%s %s\n", q(id).c_str(), kc.c_str(), q(dmg.string()).c_str());
    std::printf("  xcrun notarytool submit %s --keychain-profile %s --wait\n", q(dmg.string()).c_str(), q(profile).c_str());
    std::printf("  xcrun stapler staple %s\n", q(dmg.string()).c_str());
  } else {
    const fs::path zip = out / (p.name + ".zip");
    std::printf("  ditto -c -k --keepParent %s %s\n", q(app.string()).c_str(), q(zip.string()).c_str());
    std::printf("  xcrun notarytool submit %s --keychain-profile %s --wait\n", q(zip.string()).c_str(), q(profile).c_str());
    std::printf("  xcrun stapler staple %s\n", q(app.string()).c_str());
  }
  std::printf("  spctl --assess --type execute -vv %s\n", q(app.string()).c_str());
}

int exportApp(const std::vector<std::string>& args, const std::string& engineRoot) {
  Opts o = parseOpts(args, {"--target", "-o", "--key", "--abis", "--render", "--browsers"}, {"--deb", "--dmg", "--no-embed", "--inspect", "--print", "--aab", "--apk", "--release", "--ipa", "--simulator", "--dry-run", "--werror", "--no-pwa", "--sourcemap", "--check", "--prerender"});
  if (o.bad) { std::fprintf(stderr, "zinc export: unknown option %s\nusage: zinc export [entry|dir] [--target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp|macos|wasm|web|esp32|android|ios] [-o dir] [--print] [--deb] [--dmg] [--inspect] [--key <seed-hex>] [--aab | --apk [--release] [--abis list]] [--ipa [--simulator]] [--dry-run]\n", o.badArg.c_str()); return 2; }
  Pack pack{has(o, "--aab"), has(o, "--apk"), has(o, "--ipa"), has(o, "--simulator"), has(o, "--dry-run"), o.v.count("--abis") ? o.v["--abis"] : "", has(o, "--release")};
  if (pack.release && !pack.apk) { std::fprintf(stderr, "zinc export: --release goes with --apk (--aab is always a release build)\n"); return 2; }
  const std::string seed = o.v.count("--key") ? o.v["--key"] : std::getenv("ZINC_UPDATE_SEED") ? std::getenv("ZINC_UPDATE_SEED") : "";   // the artifacts' signatures (ZN-321)
  std::vector<fs::path> artifacts;
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  if (has(o, "--inspect")) p.entry = inspectEntry(p.dir, p.entry);   // a debug build for a device (zinc device deploy --inspect)
  for (char c : p.name) if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '.' || c == '_' || c == '-')) { std::fprintf(stderr, "zinc export: zinc.json name \"%s\" is not usable in a file name (letters, digits, '.', '_', '-')\n", p.name.c_str()); return 2; }
  const std::string target = o.v.count("--target") ? o.v["--target"] : zn::plat::osName();
  if (target == "web") {   // the program as JavaScript on the browser's own engine (docs/targets/web.md)
    WebArgs w;
    w.dir = p.dir; w.entry = p.entry; w.name = p.name; w.version = p.version; w.engineRoot = engineRoot;
    w.out = o.v.count("-o") ? o.v["-o"] : "";
    w.render = o.v.count("--render") ? o.v["--render"] : "";
    w.browsers = o.v.count("--browsers") ? o.v["--browsers"] : "";
    w.strict = has(o, "--werror"); w.noPwa = has(o, "--no-pwa"); w.sourcemap = has(o, "--sourcemap"); w.check = has(o, "--check"); w.prerender = has(o, "--prerender");
    if (!w.render.empty() && w.render != "canvas" && w.render != "dom") { std::fprintf(stderr, "zinc export: --render is canvas or dom\n"); return 2; }
    return exportWeb(w);
  }
  const std::string zt = zigTargetFor(target);
  const std::string arch = zt == "aarch64-linux" ? "arm64" : (zt == "armhf-linux" || zt == "armv7-linux") ? "armhf" : zt == "x86_64-linux" ? "amd64" : "";   // Debian's names
  if (has(o, "--deb") && arch.empty()) { std::fprintf(stderr, "zinc export: --deb is for the Linux targets (linux, rpi, rpi1, rpi2, chip, pocketchip, rmpp)\n"); return 2; }
  if (has(o, "--dmg") && target != "macos") { std::fprintf(stderr, "zinc export: --dmg is for the macos target\n"); return 2; }
  if ((pack.aab || pack.apk || !pack.abis.empty()) && target != "android") { std::fprintf(stderr, "zinc export: --aab, --apk and --abis are for the android target\n"); return 2; }
  if (pack.aab && pack.apk) { std::fprintf(stderr, "zinc export: --aab or --apk, not both\n"); return 2; }
  if ((pack.ipa || pack.simulator) && target != "ios") { std::fprintf(stderr, "zinc export: --ipa and --simulator are for the ios target\n"); return 2; }
  if (pack.simulator && !pack.ipa) { std::fprintf(stderr, "zinc export: --simulator goes with --ipa\n"); return 2; }
  if (pack.dry && !pack.aab && !pack.apk && !pack.ipa) { std::fprintf(stderr, "zinc export: --dry-run goes with --aab, --apk or --ipa (--print lists the commands of a plain export)\n"); return 2; }
  fs::path out = o.v.count("-o") ? fs::path(o.v["-o"]) : fs::path(p.dir) / "dist" / (p.name + "-" + target);
  std::error_code ec;
  fs::remove_all(out, ec);
  fs::create_directories(out, ec);
  if (!buildAssets(p.dir, target, true, err)) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }   // the release packs, build/assets/<target> (ZN-434)
  if (target == "wasm") return exportWasm(p, out, engineRoot);
  if (target == "esp32") return exportEsp32(p, out, engineRoot);
  if (target == "android") return exportAndroid(p, out, engineRoot, has(o, "--print"), pack);
  if (target == "ios") return exportIos(p, out, engineRoot, has(o, "--print"), pack);
  // JavaScript on an engine module (ZN-773.04): an .app of zinc, the program bundled for it and the engine's pack; on QuickJS (zinc's own, ZN-773.09)
  // the bundle and its bytecode, for macos (the other targets still build the program ahead of time)
  if (p.engine == "jsc" || p.engine == "v8" || p.engine == "hermes" || p.engine == "quickjs") {
    if (target != "macos") { std::fprintf(stderr, "zinc export: a native export on the %s engine supports macos only for now; use zinc device deploy <project> to run it with a Raspberry Pi's installed engine\n", p.engine.c_str()); return 2; }
    const fs::path app = out / (p.name + ".app");
    if (const int rc = status(std::system((q(self()) + " build --bundle " + q(p.entry) + " -o " + q(app.string())).c_str()))) { std::fprintf(stderr, "zinc export: the .app could not be made\n"); return rc; }
    writeFile(out / "run.sh", "#!/bin/sh\nexec \"$(dirname \"$0\")/" + p.name + ".app/Contents/MacOS/zinc\" \"$@\"\n");
    fs::permissions(out / "run.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
    std::printf("%s\n", out.string().c_str());
    return 0;
  }
  // the argument orders of the two build commands: `build <file> -o <out>` for this machine, `build --target <t> <file> -o <out>` for another
  const std::string embed = has(o, "--no-embed") ? " --no-embed" : "";   // the fonts and images in <name>.res beside the executable
  const std::string cmd = zt.empty() ? "ZINC_COMPONENTS=1 " + q(self()) + " build" + embed + " " + q(p.entry) + " -o " + q((out / p.name).string())   // ZINC_COMPONENTS: what it links, for the SBOM
                                     : "ZINC_COMPONENTS=1 ZINC_EXPORT_TARGET=" + q(target) + " " + q(self()) + " build" + embed + " --target " + q(zt) + " " + q(p.entry) + " -o " + q((out / p.name).string());
  if (target == "rmpp") {   // an AppLoad app directory (docs/targets/remarkable-paper-pro.md); zinc.json "display": {"ink": "session"} starts it through the display lease
    std::string ink, icon;
    if (yyjson_doc* jd = yyjson_read_file((fs::path(p.dir) / "zinc.json").string().c_str(), 0, nullptr, nullptr)) {
      yyjson_val* r = yyjson_doc_get_root(jd);
      if (const char* s = yyjson_get_str(yyjson_obj_get(yyjson_obj_get(r, "display"), "ink"))) ink = s;
      if (const char* s = yyjson_get_str(yyjson_obj_get(yyjson_obj_get(r, "app"), "icon"))) icon = s;
      yyjson_doc_free(jd);
    }
    const std::string dir = "/home/root/xovi/exthome/appload/" + p.name;
    const bool session = ink == "session";
    writeFile(out / "external.manifest.json", "{\n  \"name\": " + jsonString(p.name) + ",\n" +
              (!session ? "  \"application\": " + jsonString(p.name) + ",\n  \"qtfb\": true,\n" : "  \"application\": \"launch.sh\",\n  \"qtfb\": false,\n") +
              "  \"workingDirectory\": " + jsonString(dir) + ",\n  \"disablesWindowedMode\": true\n}\n");
    if (session) {   // the ink session (L2): the lease checks the vendor library, stops xochitl and runs the app with Quill's libquill.so beside it
      std::string verified;   // the libqsgepaper.so hashes of models.h: launch.sh passes the tablet's own, the lease checks it again
      for (const rmm::Vendor& v : rmm::vendors) verified += (verified.empty() ? "" : "|") + std::string(v.sha256);
      writeFile(out / "launch.sh", "#!/bin/sh\n# AppLoad starts this: the display lease (lease.c) runs " + p.name + " with xochitl stopped and brings xochitl back on every way out\n"
                "# (the app quits, crashes or hangs 10 s, a 2 s press on the power button, systemctl stop zinc-lease, 30 minutes at most).\n"
                "D=$(CDPATH= cd -- \"$(dirname -- \"$0\")\" && pwd)\n"
                "V=$(sha256sum /usr/lib/plugins/scenegraph/libqsgepaper.so | cut -c1-64)\n"
                "case \"$V\" in " + verified + ") ;; *) echo \"" + p.name + ": this OS's display engine ($V) is not verified for the ink session\" >&2; exit 1 ;; esac\n"
                "LD_LIBRARY_PATH=\"$D:/usr/lib/plugins/scenegraph\" exec \"$D/lease\" launch --watchdog 10 --vendor-sha256 \"$V\" \"$D/" + p.name + "\"\n");
      fs::permissions(out / "launch.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
    }
    // AppLoad's tile: zinc.json app.icon (PNG or SVG) on white, else a plain framed square to replace
    if (const std::string tile = appIconPng(p.dir, icon); !tile.empty()) writeFile(out / "icon.png", tile);
    else {
      std::vector<std::uint8_t> px(128 * 128 * 4, 255);
      for (int y = 0; y < 128; y++) for (int x = 0; x < 128; x++) if (x < 8 || y < 8 || x >= 120 || y >= 120) for (int c = 0; c < 3; c++) px[(y * 128 + x) * 4 + c] = 0;
      const std::vector<std::uint8_t> png = zn::res::encodePng(px.data(), 128, 128, 4);
      writeFile(out / "icon.png", std::string(png.begin(), png.end()));
    }
    const std::string files = "\"$D/" + p.name + "\" \"$D/external.manifest.json\" \"$D/icon.png\"" + (session ? " \"$D/launch.sh\" \"$D/lease\" \"$D/libquill.so\" \"$D/QUILL-LICENSE\"" : "");
    // scp -O: the tablet's dropbear has no SFTP server
    writeFile(out / "deploy.sh", "#!/bin/sh\n# usage: ./deploy.sh [root@10.11.99.1]  (developer mode + xovi/AppLoad installed on the tablet)\nset -e\nD=$(dirname \"$0\")\nHOST=\"${1:-root@10.11.99.1}\"\n"
              "ssh \"$HOST\" \"mkdir -p " + dir + "\"\nscp -O -q " + files + " \"$HOST:" + dir + "/\"\necho \"installed in " + dir + ": open AppLoad on the tablet, tap reload, then launch '" + p.name + "'\"\n");
    fs::permissions(out / "deploy.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
    if (session) {   // the lease supervisor (integrations/remarkable-ink/lease.c), a static binary beside the app
      std::string zig;
      const fs::path src = fs::path(engineRoot) / "integrations" / "remarkable-ink" / "lease.c";
      if (!zn::tc::ensureZig(zig, err)) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
      if (runArgv({zig, "cc", "-target", "aarch64-linux-musl", "-static", "-O2", src.string(), "-o", (out / "lease").string()}, false) != 0) { std::fprintf(stderr, "zinc export: the display lease (%s) did not build\n", src.string().c_str()); return 1; }
      // Quill's engine shim (MIT, github.com/MaximeRivest/quill), patched for OS 3.28+ and built with reMarkable's SDK (integrations/remarkable-ink/quill)
      const fs::path quill = fs::path(engineRoot) / "integrations" / "remarkable-ink" / "quill";
      if (!fs::copy_file(quill / "libquill.so", out / "libquill.so", fs::copy_options::overwrite_existing, ec) ||
          !fs::copy_file(quill / "LICENSE", out / "QUILL-LICENSE", fs::copy_options::overwrite_existing, ec)) {
        std::fprintf(stderr, "zinc export: Quill's libquill.so for the ink session (%s): %s\n", quill.string().c_str(), ec.message().c_str()); return 1;
      }
    }
  }
  int rc = status(std::system(cmd.c_str()));
  if (rc != 0) { std::fprintf(stderr, "zinc export: the build failed\n"); return rc; }
  if (fs::exists(fs::path(p.dir) / "assets")) fs::copy(fs::path(p.dir) / "assets", out / "assets", fs::copy_options::recursive, ec);
  writeFile(out / "run.sh", "#!/bin/sh\ncd \"$(dirname \"$0\")\" || exit 1\nexec ./" + p.name + " \"$@\"\n");
  fs::permissions(out / "run.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  writeFile(out / "README.txt", p.name + " " + p.version + " (" + target + ") built with Zinc.\nRun: ./run.sh\n" + (embed.empty() ? "The executable is self-contained: the fonts and images are baked in" : "The fonts and images are baked in " + p.name + ".res, which stays beside the executable") + "; assets/ holds the files the program reads at run time.\n");
  if (!zt.empty() && zt.find("linux") != std::string::npos)
    writeFile(out / (p.name + ".desktop"), "[Desktop Entry]\nType=Application\nName=" + p.name + "\nExec=" + p.name + "\nTerminal=false\nCategories=Utility;\n");
  if (target == "macos") {
    std::string bcmd = q(self()) + " build --bundle " + q(p.entry) + " -o " + q((out / (p.name + ".app")).string());
    if (status(std::system(bcmd.c_str())) != 0) std::fprintf(stderr, "zinc export: the .app bundle could not be made (the plain executable is in %s)\n", out.string().c_str());
  }
  artifacts.push_back(out / p.name);
  {   // what the exported app may do (ZN-322.03): zinc.json "permissions", enforced by the app
    std::ifstream pf(fs::path(p.dir) / "zinc.json");
    std::stringstream ps; ps << pf.rdbuf();
    zn::frontend::Project proj; std::string perr;
    const bool haveProj = pf && zn::frontend::parseProject(ps.str(), proj, perr);
    if (!engineRoot.empty() && fs::exists(out / (p.name + ".components"), ec)) {   // what it contains and under which licences (ZN-323)
      bool icons = false;   // zinc.json "icons": Lucide icons baked into the program
      if (yyjson_doc* jd = yyjson_read(ps.str().data(), ps.str().size(), 0)) { yyjson_val* ic = yyjson_obj_get(yyjson_doc_get_root(jd), "icons"); icons = yyjson_is_arr(ic) && yyjson_arr_size(ic) > 0; yyjson_doc_free(jd); }
      if (!writeSbom(out, p, engineRoot, icons, err)) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
      std::printf("sbom: %s, %s\n", (out / "sbom.spdx.json").string().c_str(), (out / "THIRD-PARTY-LICENSES.txt").string().c_str());
    }
    if (haveProj) {
      std::string list;
      for (const std::string& e : zn::frontend::permissionsFor(proj, target == "macos" ? "macos" : "linux")) list += (list.empty() ? "" : ", ") + e;
      std::printf("permissions: %s\n", !proj.permissionsDeclared ? "not declared (zinc.json \"permissions\": the app is not restricted)" : list.empty() ? "none (every checked call is refused)" : list.c_str());
    }
  }
  if (has(o, "--dmg")) {   // a disk image with the .app and a link to /Applications (ZN-320.02)
    const fs::path app = out / (p.name + ".app");
    if (!fs::exists(app, ec)) { std::fprintf(stderr, "zinc export: --dmg needs the .app, which needs \"app\": { \"id\": \"com.example.%s\" } in zinc.json\n", p.name.c_str()); return 1; }
    const fs::path stage = out.parent_path() / (p.name + "-dmg-staging");
    const fs::path dmg = out.parent_path() / (p.name + "-" + p.version + ".dmg");
    fs::remove_all(stage, ec);
    fs::create_directories(stage, ec);
    fs::create_symlink("/Applications", stage / "Applications", ec);
    const std::string cmd = "ditto " + q(app.string()) + " " + q((stage / app.filename()).string()) + " && hdiutil create -quiet -ov -fs HFS+ -format UDZO -volname " + q(p.name) +
                            " -srcfolder " + q(stage.string()) + " " + q(dmg.string());
    const int rc = status(std::system(cmd.c_str()));
    fs::remove_all(stage, ec);
    if (rc != 0) { std::fprintf(stderr, "zinc export: hdiutil could not make %s\n", dmg.string().c_str()); return 1; }
    std::printf("%s\n", dmg.string().c_str());
    artifacts.push_back(dmg);
  }
  if (has(o, "--deb")) {   // a Debian package of the export (ZN-320.01)
    const fs::path deb = out.parent_path() / (p.name + "_" + p.version + "_" + arch + ".deb");
    if (!writeDeb(out, p.name, p.version, arch, deb, err)) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
    std::printf("%s\n", deb.string().c_str());
    artifacts.push_back(deb);
  }
  if (!seed.empty()) for (const fs::path& a : artifacts) {   // Ed25519 signatures beside the artifacts, the update key's (zinc verify)
    std::ifstream in(a, std::ios::binary);
    const std::string bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    std::string sig;
    if (!in || !zn::tc::signBytes(bytes, seed, sig, err)) { std::fprintf(stderr, "zinc export: cannot sign %s: %s\n", a.string().c_str(), err.c_str()); return 1; }
    writeFile(a.string() + ".sig", sig + "\n");
    std::printf("signature: %s.sig\n", a.string().c_str());
  }
  if (target == "macos") notarizeHint(p, out, artifacts);
  std::printf("%s\n", out.string().c_str());
  return 0;
}

// zinc compat and zinc ui (ZN-155): the checkout's Node tools, run as they are (tests/compat/run.mjs already measures this engine; the zinc-ui
// tools generate code for the shared UI library, whichever engine runs it). ponytail: through Node; a C++ port of zinc ui if a release ships without it.
static int nodeTool(const std::string& engineRoot, const std::string& script, const std::vector<std::string>& args, const char* what) {
  const fs::path js = fs::path(engineRoot) / script;
  if (!fs::exists(js)) { std::fprintf(stderr, "zinc %s: %s is not in this installation (it comes with a Zinc checkout)\n", what, script.c_str()); return 2; }
  if (std::system("command -v node >/dev/null 2>&1") != 0) { std::fprintf(stderr, "zinc %s needs Node.js: it runs %s\n", what, script.c_str()); return 2; }
  std::string cmd = "node " + q(fs::absolute(js).lexically_normal().string());
  for (const std::string& a : args) cmd += " " + q(a);
  return status(std::system(cmd.c_str()));
}
int compat(const std::vector<std::string>& args, const std::string& engineRoot) {
  std::vector<std::string> rest(args.begin() + 2, args.end());
  if (std::find(rest.begin(), rest.end(), "--engines") == rest.end()) { rest.push_back("--engines"); rest.push_back("next,next-qjs"); }
  rest.push_back("--zinc-next"); rest.push_back(self());
  return nodeTool(engineRoot, "tests/compat/run.mjs", rest, "compat");
}

// zinc publish --itch / --site (ZN-325): the exports of dist/ to itch.io through butler, and a static download page. Uploading is the owner's
// step: --dry-run prints the butler commands and runs nothing.
namespace {
struct Artifact { fs::path path; std::string label, channel; bool dir = false; };
// What zinc export left in dist/: one directory per target (dist/<name>-<target>) and the installers beside them (.dmg, .deb, .AppImage, .zapp)
std::vector<Artifact> exportsOf(const ProjectInfo& p) {
  static const std::vector<std::pair<std::string, std::pair<std::string, std::string>>> targets = {   // target, its label and its itch channel (itch reads the platform from the channel name)
      {"macos", {"macOS", "mac"}}, {"linux", {"Linux (ARM64)", "linux-arm64"}}, {"rpi", {"Raspberry Pi (64-bit)", "linux-rpi"}}, {"rpi1", {"Raspberry Pi 1 and Zero", "linux-rpi1"}},
      {"rpi2", {"Raspberry Pi (32-bit)", "linux-rpi2"}}, {"chip", {"NTC CHIP", "linux-chip"}}, {"pocketchip", {"PocketCHIP", "linux-pocketchip"}}, {"rmpp", {"reMarkable Paper Pro", "linux-rmpp"}},
      {"wasm", {"Web", "html5"}}};
  std::vector<Artifact> out;
  const fs::path dist = fs::path(p.dir) / "dist";
  for (const auto& [t, lc] : targets) if (fs::is_directory(dist / (p.name + "-" + t))) out.push_back({dist / (p.name + "-" + t), lc.first, lc.second, true});
  std::error_code ec;
  std::vector<fs::path> loose;
  for (const auto& e : fs::directory_iterator(dist, ec)) {
    const std::string x = e.path().extension().string();
    if (e.is_regular_file() && (x == ".dmg" || x == ".deb" || x == ".AppImage" || x == ".zapp")) loose.push_back(e.path());
  }
  std::sort(loose.begin(), loose.end());
  for (const fs::path& f : loose) {
    const std::string x = f.extension().string();
    out.push_back({f, x == ".dmg" ? "macOS disk image" : x == ".deb" ? "Debian package" : x == ".AppImage" ? "Linux AppImage" : "Zinc app (.zapp)", "", false});
  }
  return out;
}
std::string htmlEsc(const std::string& s) { std::string o; for (char c : s) o += c == '<' ? "&lt;" : c == '>' ? "&gt;" : c == '&' ? "&amp;" : c == '"' ? "&quot;" : std::string(1, c); return o; }
}  // namespace

int publishStore(const std::vector<std::string>& args) {
  Opts o = parseOpts(args, {"--itch", "--site"}, {"--dry-run"});
  if (o.bad) { std::fprintf(stderr, "zinc publish: unknown option %s\nusage: zinc publish [dir] [--itch user/game[:suffix]] [--site dir] [--dry-run]\n", o.badArg.c_str()); return 2; }
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  const std::vector<Artifact> all = exportsOf(p);
  if (all.empty()) { std::fprintf(stderr, "zinc publish: nothing in %s/dist: zinc export --target <t> first\n", p.dir.c_str()); return 2; }
  const std::string version = p.version.empty() ? "0.0.0" : p.version;
  if (o.v.count("--itch")) {
    std::string game = o.v["--itch"], suffix;
    if (const std::size_t c = game.find(':'); c != std::string::npos) { suffix = "-" + game.substr(c + 1); game = game.substr(0, c); }
    if (game.find('/') == std::string::npos) { std::fprintf(stderr, "zinc publish: --itch wants user/game (the game's page is https://user.itch.io/game)\n"); return 2; }
    std::string butler = zn::tc::butlerPath();
    if (!has(o, "--dry-run") && !zn::tc::ensureButler(butler, err)) { std::fprintf(stderr, "zinc publish: %s\n", err.c_str()); return 1; }
    int pushed = 0;
    for (const Artifact& a : all) {
      if (!a.dir) continue;   // the export directories; butler makes its own patches, installers are for the download page
      const std::string cmd = q(butler) + " push " + q(a.path.string()) + " " + q(game + ":" + a.channel + suffix) + " --userversion " + q(version);
      std::printf("%s\n", cmd.c_str());
      if (!has(o, "--dry-run") && status(std::system(cmd.c_str())) != 0) { std::fprintf(stderr, "zinc publish: butler failed for %s\n", a.path.string().c_str()); return 1; }
      ++pushed;
    }
    if (!pushed) { std::fprintf(stderr, "zinc publish: no export directory in dist/ to push\n"); return 2; }
    if (has(o, "--dry-run")) std::printf("dry run: nothing was uploaded (butler %s, `%s login` once before the real push)\n", zn::tc::butlerVersion().c_str(), butler.c_str());
  }
  if (o.v.count("--site")) {   // a static page: one download per artifact (export directories as .tar.gz), its size and SHA-256, and SHA256SUMS
    const fs::path site = o.v["--site"];
    std::error_code ec;
    fs::create_directories(site, ec);
    std::string rows, sums;
    for (const Artifact& a : all) {
      const std::string file = a.dir ? a.path.filename().string() + ".tar.gz" : a.path.filename().string();
      const fs::path dst = site / file;
      if (a.dir) { if (status(std::system(("tar -czf " + q(dst.string()) + " -C " + q(a.path.parent_path().string()) + " " + q(a.path.filename().string())).c_str())) != 0) { std::fprintf(stderr, "zinc publish: cannot archive %s\n", a.path.string().c_str()); return 1; } }
      else { fs::copy_file(a.path, dst, fs::copy_options::overwrite_existing, ec); if (ec) { std::fprintf(stderr, "zinc publish: cannot copy %s: %s\n", a.path.string().c_str(), ec.message().c_str()); return 1; } }
      const std::string sha = zn::tc::sha256File(dst.string());
      const auto size = fs::file_size(dst, ec);
      char mb[32]; std::snprintf(mb, sizeof mb, "%.1f MB", static_cast<double>(size) / 1e6);
      rows += "<li><a class=\"button\" href=\"" + htmlEsc(file) + "\" download>" + htmlEsc(a.label) + "</a> <span class=\"file\">" + htmlEsc(file) + "</span> <span class=\"size\">" + mb + " (" + std::to_string(size) + " bytes)</span><br><code>sha256 " + sha + "</code></li>\n";
      sums += sha + "  " + file + "\n";
    }
    writeFile(site / "SHA256SUMS", sums);
    writeFile(site / "index.html", "<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<title>" + htmlEsc(p.name) + " " + htmlEsc(version) + "</title>\n"
              "<style>body{font-family:system-ui,sans-serif;max-width:46rem;margin:3rem auto;padding:0 1rem;color:#111}li{list-style:none;margin:0 0 1.2rem}"
              ".button{display:inline-block;padding:.5rem 1rem;border-radius:.4rem;background:#111;color:#fff;text-decoration:none}.file,.size{color:#555;margin-left:.5rem}"
              "code{font-size:.8rem;color:#555;word-break:break-all}</style></head>\n<body><h1>" + htmlEsc(p.name) + " " + htmlEsc(version) + "</h1>\n<ul>\n" + rows +
              "</ul>\n<p>Check a download: <code>shasum -a 256 &lt;file&gt;</code> against <a href=\"SHA256SUMS\">SHA256SUMS</a>.</p>\n</body></html>\n");
    std::printf("site: %s (%zu downloads)\n", (site / "index.html").string().c_str(), all.size());
  }
  return 0;
}

// zinc add / zinc install (ZN-328.01): a plugin from a git repository (pinned by commit) or a .tar.gz / .tgz / .tar archive (pinned by sha256), copied into
// <project>/plugins/<name> where the module loader and the native build already look, recorded in zinc.json "dependencies" and pinned in zinc.lock (ZN-344).
// Nothing of the plugin is run: git hooks are off, archives are unpacked by tar, links and special files are refused.
namespace {
struct PluginPin { std::string source, commit, sha256, publicKey, path, tier, publisher; };   // publicKey: the archive's <url>.sig must verify with it (ZN-328.02); path: the plugin's directory in its source (a monorepo); tier, publisher: ZN-340

bool isArchive(const std::string& s) {
  auto ends = [&](const char* e) { const std::size_t n = std::strlen(e); return s.size() > n && s.compare(s.size() - n, n, e) == 0; };
  return ends(".tar.gz") || ends(".tgz") || ends(".tar");
}

// Fetches `spec` into `scratch` and finds the plugin directory (plugin.json at the top, or in the archive's one top directory). `pin` (from the lock) fixes the commit or
// the sha256; `got` is what was fetched. Empty: done.
std::string fetchPlugin(const std::string& spec, const PluginPin& pin, const fs::path& scratch, fs::path& dir, PluginPin& got) {
  std::error_code ec;
  fs::create_directories(scratch, ec);
  fs::path top;
  // what was fetched once is kept by content (ZN-339.02): archives by SHA-256, git trees by commit; ZINC_OFFLINE (zinc install --offline) uses only that
  const fs::path store = fs::path(zn::tc::home()) / "cache" / "sources";
  if (isArchive(spec)) {
    const fs::path archive = scratch / "archive", x = scratch / "x";
    if (spec.rfind("file://", 0) != 0 && spec.rfind("https://", 0) != 0 && spec.rfind("http://", 0) != 0) return "an archive is given by a file:// or https:// URL: " + spec;
    const fs::path kept = pin.sha256.empty() ? fs::path() : store / "sha256" / pin.sha256;
    if (!kept.empty() && zn::tc::sha256File(kept.string()) == pin.sha256) fs::copy_file(kept, archive, fs::copy_options::overwrite_existing, ec);
    else if (zn::tc::offline()) return "offline: not in the local cache (" + spec + ")";
    else {   // the mirrors by content (<mirror>/sha256/<hash>) when the lock pins it, then the URL
      std::string err;
      if (!zn::tc::downloadTo(spec, pin.sha256.empty() ? "" : "sha256/" + pin.sha256, archive.string(), [&](const std::string& path, std::string& why) {
            if (pin.sha256.empty() || zn::tc::sha256File(path) == pin.sha256) return true;
            why = "its sha256 is not the locked " + pin.sha256;
            return false;
          }, err))
        return pin.sha256.empty() ? "cannot download " + spec : "the archive " + spec + " changed, or no source serves the locked bytes (" + err + "); nothing was installed";
    }
    got = PluginPin{spec, "", zn::tc::sha256File(archive.string()), "", "", "", ""};
    fs::create_directories(store / "sha256", ec);
    if (!fs::exists(store / "sha256" / got.sha256, ec)) fs::copy_file(archive, store / "sha256" / got.sha256, ec);
    if (!pin.sha256.empty() && got.sha256 != pin.sha256) return "the archive " + spec + " changed: sha256 " + got.sha256 + ", the lock pins " + pin.sha256 + "; nothing was installed";
    if (!pin.publicKey.empty()) {   // the detached signature next to the archive: <url>.sig, 128 hex digits
      const fs::path sig = scratch / "archive.sig", keptSig = store / "sha256" / (got.sha256 + ".sig");
      if (fs::exists(keptSig, ec)) fs::copy_file(keptSig, sig, ec);
      else if (!zn::tc::offline()) {
        if (spec.rfind("file://", 0) == 0) fs::copy_file(spec.substr(7) + ".sig", sig, ec);
        else runArgv({"curl", "-fL", "--retry", "3", "-sS", "-o", sig.string(), "--", spec + ".sig"}, true);
      }
      std::ifstream sf(sig), af(archive, std::ios::binary);
      std::string sigHex;
      sf >> sigHex;
      if (sigHex.empty()) return "no signature " + spec + ".sig (the lock names a key for this archive); nothing was installed";
      const std::string bytes((std::istreambuf_iterator<char>(af)), std::istreambuf_iterator<char>());
      if (!zn::tc::verifyBytes(bytes, sigHex, pin.publicKey)) return "the signature " + spec + ".sig does not verify with the key " + pin.publicKey + ": refused, nothing was installed";
      fs::copy_file(sig, keptSig, fs::copy_options::overwrite_existing, ec);
      got.publicKey = pin.publicKey;
    }
    fs::create_directories(x, ec);
    if (runArgv({"tar", "-xf", archive.string(), "-C", x.string()}, true) != 0) return "cannot unpack " + spec;
    top = x;
  } else {
    if (!pin.publicKey.empty()) return "a key checks the signature of an archive; a git source is pinned by its commit";
    if (!pin.commit.empty() && fs::exists(store / "git" / pin.commit / "plugin.json", ec)) { got = PluginPin{spec, pin.commit, "", "", "", "", ""}; top = store / "git" / pin.commit; }
    else if (zn::tc::offline()) return "offline: not in the local cache (" + spec + (pin.commit.empty() ? "" : " at " + pin.commit) + ")";
    else {
    std::string fetchSpec = spec;
    if (!pin.commit.empty()) { const std::size_t at = spec.rfind('@'), slash = spec.rfind('/'); fetchSpec = (at != std::string::npos && slash != std::string::npos && at > slash ? spec.substr(0, at) : spec) + "@" + pin.commit; }
    std::string source;
    if (std::string err = fetchTemplate(fetchSpec, scratch / "git", top, source, got.commit); !err.empty()) return err.rfind("no template", 0) == 0 ? "no plugin '" + spec + "': not a git URL or an archive (.tar.gz, .tgz, .tar)" : err;
    if (top == fs::absolute(spec).lexically_normal()) return "no plugin '" + spec + "': a local directory goes in zinc.json \"pluginDirs\"; zinc add takes a git URL or an archive";
    got.source = spec;
    if (!pin.commit.empty() && got.commit != pin.commit) return "the commit of " + spec + " is " + got.commit + ", the lock pins " + pin.commit;
    const fs::path keep = store / "git" / got.commit;   // the tree at that commit, without .git
    if (!fs::exists(keep / "plugin.json", ec)) {
      fs::create_directories(keep, ec);
      for (auto it = fs::recursive_directory_iterator(top, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
        if (it->path().filename() == ".git") { it.disable_recursion_pending(); continue; }
        if (it->is_symlink()) continue;
        const fs::path rel = fs::relative(it->path(), top);
        if (it->is_directory()) fs::create_directories(keep / rel, ec); else fs::copy_file(it->path(), keep / rel, fs::copy_options::overwrite_existing, ec);
      }
    }
    }
  }
  dir = pin.path.empty() ? top : top / pin.path;   // a plugin inside a larger repository (the index names its path)
  got.path = pin.path;
  if (!fs::exists(dir / "plugin.json", ec)) {   // an archive of a directory (GitHub's name-ref/)
    std::vector<fs::path> subs;
    for (const auto& e : fs::directory_iterator(top, ec)) if (e.path().filename() != ".git") subs.push_back(e.path());
    if (subs.size() == 1 && fs::exists(subs[0] / "plugin.json", ec)) dir = subs[0];
    else return "no plugin.json in " + spec;
  }
  for (auto it = fs::recursive_directory_iterator(dir, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (it->path().filename() == ".git") { it.disable_recursion_pending(); continue; }
    if (it->is_symlink() || (!it->is_regular_file() && !it->is_directory())) return "a file outside the plugin (link or special file): " + fs::relative(it->path(), dir).string();
  }
  return "";
}

// Copies the plugin into <project>/plugins/<name> (replacing it) and returns its name, from plugin.json.
std::string installPlugin(const fs::path& from, const fs::path& project, std::string& name) {
  std::ifstream mf(from / "plugin.json");
  std::stringstream ms; ms << mf.rdbuf();
  zn::frontend::PluginManifest pm;
  std::string err;
  std::vector<std::string> warnings;
  if (!zn::frontend::parsePluginManifest(ms.str(), pm, err, warnings)) return "plugin.json: " + err;
  name = pm.name;
  if (name.empty() || name[0] == '.' || name.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-") != std::string::npos) return "plugin.json \"name\" '" + name + "' is not usable as a directory name";
  const fs::path to = project / "plugins" / name;
  std::error_code ec;
  fs::remove_all(to, ec);
  fs::create_directories(to, ec);
  for (auto it = fs::recursive_directory_iterator(from, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (it->path().filename() == ".git") { it.disable_recursion_pending(); continue; }
    const fs::path rel = fs::relative(it->path(), from);
    if (it->is_directory()) fs::create_directories(to / rel, ec);
    else fs::copy_file(it->path(), to / rel, fs::copy_options::overwrite_existing, ec);
    if (ec) return "cannot write " + (to / rel).string() + ": " + ec.message();
  }
  return "";
}

struct ScratchDir { fs::path p; ~ScratchDir() { std::error_code e; if (!p.empty()) fs::remove_all(p, e); } };
}  // namespace

// zinc.lock (ZN-344): {"format": 1, "plugins": {name: {source, commit | sha256, publicKey, tier, publisher, path, version, permissions, requested}}} beside
// zinc.json, whose "dependencies" keep what was asked for (name -> what `zinc add` was given). A lock still inside zinc.json ("lock", ZN-328) is read and
// moved out at the next write.
struct Lock {
  yyjson_doc* doc = nullptr;
  yyjson_val* plugins = nullptr;
  ~Lock() { yyjson_doc_free(doc); }
};
static std::string slurp(const fs::path& f) { std::ifstream in(f, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
static void readLock(const fs::path& project, Lock& l) {
  yyjson_doc_free(l.doc);
  l = Lock{};
  std::error_code ec;
  const bool own = fs::exists(project / "zinc.lock", ec);
  const std::string t = slurp(project / (own ? "zinc.lock" : "zinc.json"));
  l.doc = yyjson_read(t.data(), t.size(), 0);
  yyjson_val* r = yyjson_doc_get_root(l.doc);
  l.plugins = yyjson_obj_get(own ? r : yyjson_obj_get(r, "lock"), "plugins");
}
static bool writeJson(const fs::path& f, yyjson_mut_doc* md) {
  char* out = yyjson_mut_write(md, YYJSON_WRITE_PRETTY_TWO_SPACES, nullptr);
  const bool ok = out && writeFile(f, std::string(out) + "\n");
  std::free(out);
  return ok;
}
// The lock with `plugins` (a mutable object of `md`) written to zinc.lock, and zinc.json's old "lock" removed.
static bool writeLock(const fs::path& project, yyjson_mut_doc* md, yyjson_mut_val* plugins) {
  yyjson_mut_val* root = yyjson_mut_obj(md);
  yyjson_mut_obj_add_int(md, root, "format", 1);
  yyjson_mut_obj_add_val(md, root, "plugins", plugins);
  yyjson_mut_doc_set_root(md, root);
  if (!writeJson(project / "zinc.lock", md)) return false;
  const std::string zt = slurp(project / "zinc.json");
  yyjson_doc* zd = yyjson_read(zt.data(), zt.size(), 0);
  if (!zd || !yyjson_obj_get(yyjson_doc_get_root(zd), "lock")) { yyjson_doc_free(zd); return true; }
  yyjson_mut_doc* zm = yyjson_doc_mut_copy(zd, nullptr);
  yyjson_doc_free(zd);
  yyjson_mut_obj_remove_key(yyjson_mut_doc_get_root(zm), "lock");
  const bool ok = writeJson(project / "zinc.json", zm);
  yyjson_mut_doc_free(zm);
  return ok;
}
static std::vector<std::string> strArr(yyjson_val* a) { std::vector<std::string> r; size_t i, n; yyjson_val* e; yyjson_arr_foreach(a, i, n, e) if (yyjson_is_str(e)) r.push_back(yyjson_get_str(e)); return r; }

// "" when the trust policy (of this machine: system, user) accepts `tier`, else why not.
static std::string policyRefusal(const std::string& tier) {
  const zn::tc::Policy& p = zn::tc::loadPolicy("");
  if (p.accepts(tier)) return "";
  std::string t;
  for (const std::string& x : p.tiers) t += (t.empty() ? "" : ", ") + x;
  return "the trust policy accepts only " + (t.empty() ? std::string("no tier") : t) + " (" + p.from.at("tiers") + "), not " + tier + ": refused";
}

// The index's templates the policy accepts, after the engine's own (zinc new --list).
static void printIndexTemplates(const std::string& engineRoot, const std::vector<TemplateInfo>& local) {
  std::unique_ptr<zn::tc::tuf::Client> index;
  std::string err;
  std::vector<zn::tc::tuf::Target> all;
  if (!zn::tc::tuf::openIndex(engineRoot, index, err) || !index->all(all, err)) return;   // no index here: the engine's templates only
  const zn::tc::Policy& policy = zn::tc::loadPolicy("");
  bool header = false;
  for (const auto& t : all) {
    std::string p = t.path;
    if (t.role != "targets") { const std::size_t slash = p.find('/'); if (slash == std::string::npos) continue; p = p.substr(slash + 1); }
    if (p.rfind("templates/", 0) != 0) continue;
    const std::string tier = zn::tc::tuf::tierOf(t);
    if (!policy.accepts(tier)) continue;
    std::string name, desc;
    if (yyjson_doc* d = yyjson_read(t.custom.data(), t.custom.size(), 0)) {
      yyjson_val* r = yyjson_doc_get_root(d);
      if (yyjson_is_str(yyjson_obj_get(r, "name"))) name = yyjson_get_str(yyjson_obj_get(r, "name"));
      if (yyjson_is_str(yyjson_obj_get(r, "description"))) desc = yyjson_get_str(yyjson_obj_get(r, "description"));
      yyjson_doc_free(d);
    }
    if (name.empty() || std::any_of(local.begin(), local.end(), [&](const TemplateInfo& l) { return l.name == name; })) continue;   // the engine's own: listed above
    if (!header) { std::printf("\nfrom the index:\n"); header = true; }
    std::printf("  %-14s %-9s %s%s\n", name.c_str(), tier.c_str(), t.role == "targets" ? "" : ("(" + t.role + ") ").c_str(), desc.c_str());
  }
}

// Revocations (ZN-345): what the index's revocations.json says about a plugin version or its publisher key ("" for nothing). `fresh` refreshes the index
// first (add, install); otherwise the copy of the last refresh is read (zinc run, which has no network).
static std::string revokedWhy(const std::string& engineRoot, bool fresh, const std::string& name, const std::string& version, const std::string& sha256, const std::string& commit, const std::string& key) {
  if (fresh) { std::unique_ptr<zn::tc::tuf::Client> c; std::string e; zn::tc::tuf::openIndex(engineRoot, c, e); }
  zn::tc::tuf::Revocations rv;
  if (!zn::tc::tuf::cachedRevocations(rv)) return "";
  if (const auto* r = rv.match(name, version, sha256, commit))
    return "plugin " + name + (version.empty() ? "" : " " + version) + " is revoked: " + (r->reason.empty() ? "no reason given" : r->reason) + (r->replacement.empty() ? "" : "; use " + r->replacement + " instead");
  if (auto k = rv.keys.find(key); !key.empty() && k != rv.keys.end()) return "the publisher key of plugin " + name + " is revoked: " + (k->second.empty() ? "no reason given" : k->second);
  return "";
}

void warnRevoked(const std::string& projectDir) {
  Lock lk;
  readLock(projectDir, lk);
  if (!lk.plugins) return;
  size_t i, n; yyjson_val *k, *v;
  yyjson_obj_foreach(lk.plugins, i, n, k, v) {
    auto str = [&](const char* key) { yyjson_val* x = yyjson_obj_get(v, key); return yyjson_is_str(x) ? std::string(yyjson_get_str(x)) : std::string(); };
    const std::string why = revokedWhy("", false, yyjson_get_str(k), str("version"), str("sha256"), str("commit"), str("publicKey"));
    if (!why.empty()) std::fprintf(stderr, "zinc: warning: %s (zinc.lock)\n", why.c_str());
  }
}

// `zinc add <name>` (ZN-340): the plugin's descriptor in the signed index, plugins/<name>.json signed by the top-level role (tier official) or
// <publisher>/plugins/<name>.json signed by a role delegated to that publisher (tier verified); its source becomes what is fetched.
// Versions (ZN-347): dotted numbers; a range is "" or "*" (any), "1.2.3" (that version: its given parts), "^1.2" (same major, or same minor under 1.0),
// "~1.2" (same minor), ">=1.2".
static std::vector<long> versionParts(const std::string& v) { std::vector<long> r; std::stringstream ss(v); std::string t; while (std::getline(ss, t, '.')) r.push_back(std::atol(t.c_str())); return r; }
static int versionCmp(const std::string& a, const std::string& b) {
  const auto x = versionParts(a), y = versionParts(b);
  for (std::size_t i = 0; i < std::max(x.size(), y.size()); ++i) { const long p = i < x.size() ? x[i] : 0, q = i < y.size() ? y[i] : 0; if (p != q) return p < q ? -1 : 1; }
  return 0;
}
static bool satisfies(const std::string& v, const std::string& range) {
  if (range.empty() || range == "*") return true;
  if (v.empty()) return false;
  const char op = range[0];
  const std::string base = (op == '^' || op == '~') ? range.substr(1) : range.rfind(">=", 0) == 0 ? range.substr(2) : range;
  const auto x = versionParts(v), b = versionParts(base);
  auto part = [](const std::vector<long>& p, std::size_t i) { return i < p.size() ? p[i] : 0; };
  if (range.rfind(">=", 0) == 0) return versionCmp(v, base) >= 0;
  if (op == '^') return versionCmp(v, base) >= 0 && part(x, 0) == part(b, 0) && (part(b, 0) != 0 || part(x, 1) == part(b, 1));
  if (op == '~') return versionCmp(v, base) >= 0 && part(x, 0) == part(b, 0) && part(x, 1) == part(b, 1);
  for (std::size_t i = 0; i < b.size(); ++i) if (part(x, i) != b[i]) return false;   // "1.2" is any 1.2.x
  return true;
}

// `zinc add <name>[@range]` (ZN-340, ZN-347): the plugin's descriptor in the signed index, plugins/<name>/<version>.json or plugins/<name>.json signed by the
// top-level role (tier official), or the same under <publisher>/ signed by a role delegated to that publisher (tier verified); the highest version the range
// allows wins, and its source becomes what is fetched. `version` gets the version chosen.
static std::string fromIndex(const std::string name, const std::string range, const std::string& engineRoot, PluginPin& want, std::string& spec, std::string& version, bool quiet, const std::string& folder) {   // by value: `spec` may be the same string
  std::unique_ptr<zn::tc::tuf::Client> index;
  std::string err, bytes;
  if (!zn::tc::tuf::openIndex(engineRoot, index, err)) return err;
  std::vector<zn::tc::tuf::Target> all;
  if (!index->all(all, err)) return err;
  zn::tc::tuf::Target t;
  std::string best;
  for (const auto& x : all) {   // plugins/<name>.json and plugins/<name>/<version>.json, at the top or under a publisher
    std::string p = x.path;
    if (x.role != "targets") { const std::size_t slash = p.find('/'); if (slash == std::string::npos || p.compare(0, slash, x.role) != 0) continue; p = p.substr(slash + 1); }
    std::string v;
    const std::string stem = folder + "/" + name;   // plugins/<name> or templates/<name>
    if (p == stem + ".json") v = "";
    else if (p.rfind(stem + "/", 0) == 0 && p.size() > 5 && p.compare(p.size() - 5, 5, ".json") == 0) v = p.substr(stem.size() + 1, p.size() - stem.size() - 6);
    else continue;
    if (yyjson_doc* cd = yyjson_read(x.custom.data(), x.custom.size(), 0)) { yyjson_val* cv = yyjson_obj_get(yyjson_doc_get_root(cd), "version"); if (yyjson_is_str(cv) && *yyjson_get_str(cv)) v = yyjson_get_str(cv); yyjson_doc_free(cd); }
    if (!satisfies(v, range)) continue;
    if (t.path.empty() || versionCmp(v, best) > 0 || (versionCmp(v, best) == 0 && x.role == "targets" && t.role != "targets")) { t = x; best = v; }
  }
  const std::string noun = folder == "templates" ? "template" : "plugin";
  if (t.path.empty()) return range.empty() ? "no " + noun + " '" + name + "' in the index (zinc plugins search lists them)" : "no version of '" + name + "' in the index satisfies " + range;
  if (!index->download(t, bytes, err)) return err;
  yyjson_doc* d = yyjson_read(bytes.data(), bytes.size(), 0);
  yyjson_val* src = yyjson_obj_get(yyjson_doc_get_root(d), "source");
  auto str = [&](const char* k) { yyjson_val* v = yyjson_obj_get(src, k); return yyjson_is_str(v) ? std::string(yyjson_get_str(v)) : std::string(); };
  const std::string repo = str("repository"), commit = str("commit"), path = str("path");
  yyjson_doc_free(d);
  if (repo.empty()) return "the index entry of '" + name + "' names no source";
  want.tier = zn::tc::tuf::tierOf(t);
  want.publisher = t.role == "targets" ? "Zinc (the index's release role)" : t.role;
  want.path = path;
  version = best;
  spec = repo + (commit.empty() ? "" : "@" + commit);
  if (!quiet) std::printf("%s%s: tier %s, publisher %s, from %s%s\n", name.c_str(), best.empty() ? "" : (" " + best).c_str(), want.tier.c_str(), want.publisher.c_str(), spec.c_str(), path.empty() ? "" : (" (" + path + ")").c_str());
  return "";
}

// Templates of the index (ZN-349): templates/<name>.json (or per version) at the top (official) or under a verified publisher; zinc new fetches its source.
static std::string templateFromIndex(const std::string& name, const std::string& engineRoot, std::string& spec, std::string& path, std::string& tier) {
  PluginPin want;
  std::string version;
  if (std::string err = fromIndex(name, "", engineRoot, want, spec, version, false, "templates"); !err.empty()) return err;
  path = want.path;
  tier = want.tier;
  return "";
}

int addPlugin(const std::vector<std::string>& args, const std::string& engineRoot) {
  std::vector<std::string> pos;
  PluginPin want;
  bool accept = false;
  for (std::size_t k = 2; k < args.size(); ++k) {
    if (args[k] == "--key" && k + 1 < args.size()) want.publicKey = args[++k];
    else if (args[k] == "--accept") accept = true;   // grants the new capabilities an update asks for (ZN-344)
    else if (args[k].rfind("--", 0) == 0) { std::fprintf(stderr, "zinc add: unknown option %s\n", args[k].c_str()); return 2; }
    else pos.push_back(args[k]);
  }
  if (pos.empty() || pos.size() > 2) { std::fprintf(stderr, "usage: zinc add <name | git-url[@ref] | gh:user/repo[@ref] | file:// or https:// archive (.tar.gz, .tgz, .tar)> [project-dir] [--key <public key hex>] [--accept]\n"); return 2; }
  if (!want.publicKey.empty() && want.publicKey.size() != 64) { std::fprintf(stderr, "zinc add: --key is a public key of 64 hex digits (zinc update-keygen)\n"); return 2; }
  const fs::path project = fs::absolute(pos.size() == 2 ? pos[1] : ".").lexically_normal();
  const fs::path zj = project / "zinc.json";
  std::ifstream zf(zj);
  std::stringstream zs; zs << zf.rdbuf();
  const std::string text = zs.str();
  yyjson_doc* doc = zf ? yyjson_read(text.data(), text.size(), 0) : nullptr;
  if (!doc || !yyjson_is_obj(yyjson_doc_get_root(doc))) { yyjson_doc_free(doc); std::fprintf(stderr, "zinc add: no zinc.json object in %s\n", project.string().c_str()); return 2; }
  ScratchDir scratch;
  std::error_code ec;
  scratch.p = fs::temp_directory_path(ec) / ("zinc-add-" + std::to_string(getpid()));
  fs::remove_all(scratch.p, ec);
  fs::path dir;
  PluginPin got;
  std::string spec = pos[0], name, err, indexVersion;
  const std::string asked = spec.substr(0, spec.find('@')), range = spec.find('@') == std::string::npos ? "" : spec.substr(spec.find('@') + 1);
  const bool byName = !asked.empty() && asked.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789._-") == std::string::npos && !fs::exists(spec, ec) && range.find('/') == std::string::npos;
  if (byName) err = fromIndex(asked, range, engineRoot, want, spec, indexVersion, false, "plugins");
  if (err.empty()) err = fetchPlugin(spec, want, scratch.p, dir, got);
  ScratchDir again;
  if (err.empty() && !byName) {   // a URL: the community tier (ZN-340.02); the key plugin.json names is checked against <url>.sig and pinned on first use
    std::ifstream mf(dir / "plugin.json");
    std::stringstream ms; ms << mf.rdbuf();
    std::string pname, pubName, pubKey;
    if (yyjson_doc* pd = yyjson_read(ms.str().data(), ms.str().size(), 0)) {
      yyjson_val* r = yyjson_doc_get_root(pd);
      yyjson_val* pub = yyjson_obj_get(r, "publisher");
      if (yyjson_is_str(yyjson_obj_get(r, "name"))) pname = yyjson_get_str(yyjson_obj_get(r, "name"));
      if (yyjson_is_str(yyjson_obj_get(pub, "name"))) pubName = yyjson_get_str(yyjson_obj_get(pub, "name"));
      if (yyjson_is_str(yyjson_obj_get(pub, "publicKey"))) pubKey = yyjson_get_str(yyjson_obj_get(pub, "publicKey"));
      yyjson_doc_free(pd);
    }
    if (!pubKey.empty() && want.publicKey.empty() && isArchive(spec)) {
      PluginPin signedPin = want;
      signedPin.publicKey = pubKey;
      signedPin.sha256 = got.sha256;   // the same bytes, from the cache
      again.p = scratch.p.string() + "-signed";
      fs::remove_all(again.p, ec);
      err = fetchPlugin(spec, signedPin, again.p, dir, got);
    }
    Lock lk;
    readLock(project, lk);
    yyjson_val* lockedV = yyjson_obj_get(yyjson_obj_get(lk.plugins, pname.c_str()), "publicKey");
    const std::string locked = yyjson_is_str(lockedV) ? yyjson_get_str(lockedV) : "";
    if (err.empty() && !locked.empty() && locked != got.publicKey)
      err = "plugin " + pname + ": its publisher key changed (pinned " + locked.substr(0, 16) + "..., now " + (got.publicKey.empty() ? std::string("none") : got.publicKey.substr(0, 16) + "...") + "): refused; `zinc trust " + pname + "` accepts the new key";
    want.tier = "community";
    want.publisher = pubName.empty() ? "unknown" : pubName;
    if (err.empty())
      std::printf("%s: tier community, publisher %s (%s), from %s\n", pname.c_str(), want.publisher.c_str(), got.publicKey.empty() ? (isArchive(spec) ? "unsigned" : "pinned by its commit") : ("key " + got.publicKey.substr(0, 16) + "..., pinned").c_str(), spec.c_str());
  }
  // the trust policy (ZN-346): the tiers it accepts
  const zn::tc::Policy& policy = zn::tc::loadPolicy(project.string());
  if (err.empty() && !policy.accepts(want.tier.empty() ? "community" : want.tier)) {
    std::string t;
    for (const std::string& x : policy.tiers) t += (t.empty() ? "" : ", ") + x;
    err = "the trust policy accepts only " + (t.empty() ? std::string("no tier") : t) + " (" + policy.from.at("tiers") + "), not " + (want.tier.empty() ? "community" : want.tier) + ": refused";
  }
  // capabilities (ZN-344): what plugin.json "permissions" asks for; an update that asks for one the lock does not grant stops unless --accept
  std::vector<std::string> perms, fresh;
  std::string version, pname;
  Lock lk;
  readLock(project, lk);
  if (err.empty()) {
    const std::string mt = slurp(dir / "plugin.json");
    if (yyjson_doc* pd = yyjson_read(mt.data(), mt.size(), 0)) {
      yyjson_val* r = yyjson_doc_get_root(pd);
      perms = strArr(yyjson_obj_get(r, "permissions"));
      if (yyjson_is_str(yyjson_obj_get(r, "version"))) version = yyjson_get_str(yyjson_obj_get(r, "version"));
      if (yyjson_is_str(yyjson_obj_get(r, "name"))) pname = yyjson_get_str(yyjson_obj_get(r, "name"));
      yyjson_doc_free(pd);
    }
    yyjson_val* old = yyjson_obj_get(lk.plugins, pname.c_str());
    const std::vector<std::string> granted = strArr(yyjson_obj_get(old, "permissions"));
    for (const std::string& c : perms) if (std::find(granted.begin(), granted.end(), c) == granted.end()) fresh.push_back(c);
    std::string list;
    for (const std::string& c : (old ? fresh : perms)) list += (list.empty() ? "" : ", ") + c;
    if (old && !fresh.empty() && !accept) err = "plugin " + pname + " now asks for capabilities the lock does not grant: " + list + "; `zinc add --accept " + pos[0] + "` grants them";
    else if (const std::string why = revokedWhy(engineRoot, true, pname, version, got.sha256, got.commit, got.publicKey); !why.empty()) err = why + ": refused";
    else if (!list.empty()) std::printf("%s: %s %s\n", pname.c_str(), old ? "granted the new capabilities" : "asks for the capabilities", list.c_str());
  }
  if (err.empty()) err = installPlugin(dir, project, name);
  if (!err.empty()) {   // the plugin, its version, then the reason (ZN-347)
    yyjson_doc_free(doc);
    if (pname.empty() && !dir.empty()) {   // fetched before it failed: its plugin.json names it
      const std::string mt = slurp(dir / "plugin.json");
      if (yyjson_doc* pd = yyjson_read(mt.data(), mt.size(), 0)) {
        yyjson_val* r = yyjson_doc_get_root(pd);
        if (yyjson_is_str(yyjson_obj_get(r, "name"))) pname = yyjson_get_str(yyjson_obj_get(r, "name"));
        if (yyjson_is_str(yyjson_obj_get(r, "version"))) version = yyjson_get_str(yyjson_obj_get(r, "version"));
        yyjson_doc_free(pd);
      }
    }
    const std::string who = !pname.empty() ? pname + (version.empty() ? "" : " " + version) : byName ? asked + (indexVersion.empty() ? "" : " " + indexVersion) : pos[0];
    std::fprintf(stderr, "zinc add: %s: %s\n", who.c_str(), err.c_str());
    return 1;
  }
  // zinc.lock: the entry pinned; zinc.json: the dependency as asked
  yyjson_mut_doc* lm = yyjson_mut_doc_new(nullptr);
  yyjson_mut_val* plugins = lk.plugins ? yyjson_val_mut_copy(lm, lk.plugins) : yyjson_mut_obj(lm);
  yyjson_mut_obj_remove_str(plugins, name.c_str());
  yyjson_mut_val* e = yyjson_mut_obj(lm);
  yyjson_mut_obj_add_strcpy(lm, e, "source", got.source.c_str());
  if (!got.commit.empty()) yyjson_mut_obj_add_strcpy(lm, e, "commit", got.commit.c_str());
  if (!got.sha256.empty()) yyjson_mut_obj_add_strcpy(lm, e, "sha256", got.sha256.c_str());
  if (!got.publicKey.empty()) yyjson_mut_obj_add_strcpy(lm, e, "publicKey", got.publicKey.c_str());
  if (!got.path.empty()) yyjson_mut_obj_add_strcpy(lm, e, "path", got.path.c_str());
  if (!want.tier.empty()) { yyjson_mut_obj_add_strcpy(lm, e, "tier", want.tier.c_str()); yyjson_mut_obj_add_strcpy(lm, e, "publisher", want.publisher.c_str()); }
  if (!version.empty()) yyjson_mut_obj_add_strcpy(lm, e, "version", version.c_str());
  yyjson_mut_val* pa = yyjson_mut_arr(lm);
  for (const std::string& c : perms) yyjson_mut_arr_add_strcpy(lm, pa, c.c_str());
  yyjson_mut_obj_add_val(lm, e, "permissions", pa);
  yyjson_mut_obj_add_strcpy(lm, e, "requested", pos[0].c_str());
  yyjson_mut_obj_add(plugins, yyjson_mut_strcpy(lm, name.c_str()), e);
  bool ok = writeLock(project, lm, plugins);
  yyjson_mut_doc_free(lm);
  yyjson_doc_free(doc);
  const std::string zt = slurp(zj);   // re-read: writeLock may have removed the old "lock"
  yyjson_doc* zd = yyjson_read(zt.data(), zt.size(), 0);
  yyjson_mut_doc* md = zd ? yyjson_doc_mut_copy(zd, nullptr) : nullptr;
  yyjson_doc_free(zd);
  if (md) {
    yyjson_mut_val* root = yyjson_mut_doc_get_root(md);
    yyjson_mut_val* deps = yyjson_mut_obj_get(root, "dependencies");
    if (!yyjson_mut_is_obj(deps)) { yyjson_mut_obj_remove_key(root, "dependencies"); deps = yyjson_mut_obj(md); yyjson_mut_obj_add_val(md, root, "dependencies", deps); }
    yyjson_mut_obj_remove_str(deps, name.c_str());
    yyjson_mut_obj_add(deps, yyjson_mut_strcpy(md, name.c_str()), yyjson_mut_strcpy(md, pos[0].c_str()));
    ok = ok && writeJson(zj, md);
    yyjson_mut_doc_free(md);
  }
  if (!ok) { std::fprintf(stderr, "zinc add: cannot write %s or zinc.lock\n", zj.string().c_str()); return 1; }
  std::printf("added %s (%s %s) in plugins/%s\n", name.c_str(), got.commit.empty() ? "sha256" : "commit", (got.commit.empty() ? got.sha256 : got.commit).c_str(), name.c_str());
  return 0;
}

// `zinc trust <name> [dir]` (ZN-340.02): forgets the publisher key pinned for a community plugin, so the next `zinc add` pins the key it brings.
int trustPlugin(const std::vector<std::string>& args) {
  if (args.size() < 3 || args.size() > 4) { std::fprintf(stderr, "usage: zinc trust <plugin> [project-dir]\n"); return 2; }
  const fs::path project = fs::absolute(args.size() == 4 ? args[3] : ".").lexically_normal();
  Lock lk;
  readLock(project, lk);
  if (!yyjson_obj_get(yyjson_obj_get(lk.plugins, args[2].c_str()), "publicKey")) { std::fprintf(stderr, "zinc trust: %s has no pinned publisher key in %s\n", args[2].c_str(), (project / "zinc.lock").string().c_str()); return 1; }
  yyjson_mut_doc* md = yyjson_mut_doc_new(nullptr);
  yyjson_mut_val* plugins = yyjson_val_mut_copy(md, lk.plugins);
  yyjson_mut_obj_remove_key(yyjson_mut_obj_get(plugins, args[2].c_str()), "publicKey");
  const bool ok = writeLock(project, md, plugins);
  yyjson_mut_doc_free(md);
  if (!ok) return 1;
  std::printf("%s: the publisher key is no longer pinned; the next `zinc add` pins the key it brings\n", args[2].c_str());
  return 0;
}

// `zinc remove <plugin> [dir]` (ZN-347): plugins/<name>, its dependency in zinc.json and its entry in zinc.lock go.
int removePlugin(const std::vector<std::string>& args) {
  if (args.size() < 3 || args.size() > 4) { std::fprintf(stderr, "usage: zinc remove <plugin> [project-dir]\n"); return 2; }
  const std::string name = args[2];
  const fs::path project = fs::absolute(args.size() == 4 ? args[3] : ".").lexically_normal();
  Lock lk;
  readLock(project, lk);
  const std::string zt = slurp(project / "zinc.json");
  yyjson_doc* zd = yyjson_read(zt.data(), zt.size(), 0);
  const bool dep = yyjson_obj_get(yyjson_obj_get(yyjson_doc_get_root(zd), "dependencies"), name.c_str()) != nullptr;
  if (!dep && !yyjson_obj_get(lk.plugins, name.c_str())) { yyjson_doc_free(zd); std::fprintf(stderr, "zinc remove: %s is not a dependency of %s\n", name.c_str(), project.string().c_str()); return 1; }
  yyjson_mut_doc* lm = yyjson_mut_doc_new(nullptr);
  yyjson_mut_val* plugins = lk.plugins ? yyjson_val_mut_copy(lm, lk.plugins) : yyjson_mut_obj(lm);
  yyjson_mut_obj_remove_key(plugins, name.c_str());
  bool ok = writeLock(project, lm, plugins);
  yyjson_mut_doc_free(lm);
  yyjson_doc_free(zd);
  const std::string zt2 = slurp(project / "zinc.json");
  if (yyjson_doc* d2 = yyjson_read(zt2.data(), zt2.size(), 0)) {
    yyjson_mut_doc* md = yyjson_doc_mut_copy(d2, nullptr);
    yyjson_doc_free(d2);
    yyjson_mut_obj_remove_key(yyjson_mut_obj_get(yyjson_mut_doc_get_root(md), "dependencies"), name.c_str());
    ok = ok && writeJson(project / "zinc.json", md);
    yyjson_mut_doc_free(md);
  }
  std::error_code ec;
  fs::remove_all(project / "plugins" / name, ec);
  return ok ? 0 : 1;
}

// `zinc plugins update [plugin...]` (ZN-347): each dependency added by name from the index moves to the highest version its range allows, through
// zinc add (signatures, policy, capabilities and revocations checked again); one line per plugin that moved, nothing when all are current.
int updatePlugins(const std::vector<std::string>& args, const std::string& engineRoot) {
  const fs::path project = fs::current_path();
  std::vector<std::string> only(args.begin() + std::min<std::size_t>(3, args.size()), args.end());
  Lock lk;
  readLock(project, lk);
  int failed = 0;
  size_t i, n; yyjson_val *k, *v;
  std::vector<std::tuple<std::string, std::string, std::string>> todo;   // name, requested, locked version
  yyjson_obj_foreach(lk.plugins, i, n, k, v) {
    const std::string name = yyjson_get_str(k);
    yyjson_val* req = yyjson_obj_get(v, "requested");
    yyjson_val* ver = yyjson_obj_get(v, "version");
    const std::string requested = yyjson_is_str(req) ? yyjson_get_str(req) : "";
    if ((!only.empty() && std::find(only.begin(), only.end(), name) == only.end()) || requested.empty() || requested.find("://") != std::string::npos || requested.find(':') != std::string::npos) continue;   // URLs are pinned as given
    todo.emplace_back(name, requested, yyjson_is_str(ver) ? yyjson_get_str(ver) : "");
  }
  for (const auto& [name, requested, locked] : todo) {
    PluginPin want;
    std::string spec, version;
    const std::string asked = requested.substr(0, requested.find('@')), range = requested.find('@') == std::string::npos ? "" : requested.substr(requested.find('@') + 1);
    if (std::string err = fromIndex(asked, range, engineRoot, want, spec, version, true, "plugins"); !err.empty()) { std::fprintf(stderr, "zinc plugins update: %s: %s\n", name.c_str(), err.c_str()); ++failed; continue; }
    if (versionCmp(version, locked) <= 0) continue;
    if (addPlugin({"zinc", "add", requested, project.string()}, engineRoot) != 0) { ++failed; continue; }
    std::printf("%s %s -> %s\n", name.c_str(), locked.empty() ? "?" : locked.c_str(), version.c_str());
  }
  return failed ? 1 : 0;
}

int installPlugins(const std::vector<std::string>& args, const std::string& engineRoot) {
  std::vector<std::string> pos;
  bool frozen = false;
  for (std::size_t k = 2; k < args.size(); ++k) {
    if (args[k] == "--offline") setenv("ZINC_OFFLINE", "1", 1);   // only the local cache of sources (ZN-339.02)
    else if (args[k] == "--frozen") frozen = true;               // zinc.json and zinc.lock must agree (ZN-344)
    else pos.push_back(args[k]);
  }
  if (pos.size() > 1) { std::fprintf(stderr, "usage: zinc install [--offline] [--frozen] [project-dir]\n"); return 2; }
  const fs::path project = fs::absolute(pos.empty() ? "." : pos[0]).lexically_normal();
  const std::string text = slurp(project / "zinc.json");
  yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
  if (!doc) { std::fprintf(stderr, "zinc install: no zinc.json in %s\n", project.string().c_str()); return 2; }
  Lock lk;
  readLock(project, lk);
  yyjson_val* plugins = lk.plugins;
  const zn::tc::Policy& policy = zn::tc::loadPolicy(project.string());   // ZN-346
  {   // the dependencies of zinc.json against the lock: --frozen refuses any difference; otherwise a dependency not locked yet is added
    yyjson_val* deps = yyjson_obj_get(yyjson_doc_get_root(doc), "dependencies");
    std::vector<std::string> problems, missing;
    size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(deps, i, n, k, v) {
      yyjson_val* e = yyjson_obj_get(plugins, yyjson_get_str(k));
      yyjson_val* req = yyjson_obj_get(e, "requested");
      if (!e) { problems.push_back(std::string(yyjson_get_str(k)) + " is a dependency but not in zinc.lock"); missing.push_back(yyjson_is_str(v) ? yyjson_get_str(v) : ""); }
      else if (yyjson_is_str(req) && yyjson_is_str(v) && std::strcmp(yyjson_get_str(req), yyjson_get_str(v)) != 0) problems.push_back(std::string(yyjson_get_str(k)) + " asks for " + yyjson_get_str(v) + ", zinc.lock pins " + yyjson_get_str(req));
    }
    yyjson_obj_foreach(plugins, i, n, k, v) if (deps && !yyjson_obj_get(deps, yyjson_get_str(k))) problems.push_back(std::string(yyjson_get_str(k)) + " is in zinc.lock but not a dependency");
    if (frozen && !problems.empty()) {
      for (const std::string& p : problems) std::fprintf(stderr, "zinc install --frozen: %s\n", p.c_str());
      yyjson_doc_free(doc);
      return 1;
    }
    for (const std::string& spec : missing) if (!spec.empty()) addPlugin({"zinc", "add", spec, project.string()}, engineRoot);
    if (!missing.empty()) { readLock(project, lk); plugins = lk.plugins; }
  }
  int failed = 0, done = 0;
  size_t i, n;
  yyjson_val *k, *v;
  yyjson_obj_foreach(plugins, i, n, k, v) {
    auto str = [&](const char* key) { yyjson_val* x = yyjson_obj_get(v, key); return yyjson_is_str(x) ? std::string(yyjson_get_str(x)) : std::string(); };
    const PluginPin pin{str("source"), str("commit"), str("sha256"), str("publicKey"), str("path"), str("tier"), str("publisher")};
    const std::string want = yyjson_get_str(k);
    ScratchDir scratch;
    std::error_code ec;
    scratch.p = fs::temp_directory_path(ec) / ("zinc-install-" + std::to_string(getpid()) + "-" + std::to_string(i));
    fs::remove_all(scratch.p, ec);
    fs::path dir;
    PluginPin got;
    std::string name, err = pin.commit.empty() && pin.sha256.empty() ? "the lock pins neither a commit nor a sha256" : revokedWhy(engineRoot, i == 0, want, str("version"), pin.sha256, pin.commit, pin.publicKey);
    if (!err.empty() && err.rfind("the lock pins", 0) != 0) err += ": refused (zinc add the replacement)";
    if (const std::string tier = str("tier").empty() ? "community" : str("tier"); err.empty() && !policy.accepts(tier)) err = "the trust policy (" + policy.from.at("tiers") + ") does not accept tier " + tier + ": refused";
    if (err.empty()) err = fetchPlugin(pin.source, pin, scratch.p, dir, got);
    if (err.empty()) err = installPlugin(dir, project, name);
    if (err.empty() && name != want) err = "the source now holds plugin '" + name + "'";
    if (!err.empty()) { std::fprintf(stderr, "zinc install: %s: %s\n", want.c_str(), err.c_str()); ++failed; continue; }
    ++done;
  }
  yyjson_doc_free(doc);
  std::printf("installed %d plugin(s)%s\n", done, failed ? (", " + std::to_string(failed) + " failed").c_str() : "");
  return failed ? 1 : 0;
}

// The plugin index's TUF metadata (ZN-336.02, D41). `zinc index-sign <file.json> <seed-hex>...` adds a signature per seed over the canonical "signed" part
// (keyid: SHA-256 of the canonical key object, as TUF defines it); `zinc index-get <repository-url> <cache-dir> [target-path]` runs the client: the root
// chain, timestamp, snapshot and targets checked, then the target fetched and checked (its length on stdout) or, without a path, every target listed.
int indexSign(const std::vector<std::string>& args) {
  if (args.size() < 4) { std::fprintf(stderr, "usage: zinc index-sign <metadata.json> <seed-hex>...\n"); return 2; }
  std::ifstream f(args[2]);
  std::stringstream ss; ss << f.rdbuf();
  yyjson_doc* d = yyjson_read(ss.str().data(), ss.str().size(), 0);
  yyjson_val* sv = d ? yyjson_obj_get(yyjson_doc_get_root(d), "signed") : nullptr;
  if (!sv) { yyjson_doc_free(d); std::fprintf(stderr, "zinc index-sign: %s has no \"signed\" object\n", args[2].c_str()); return 2; }
  char* sj = yyjson_val_write(sv, 0, nullptr);
  std::string body;
  const bool ok = sj && zn::tc::tuf::canonical(sj, body);
  std::free(sj);
  if (!ok) { yyjson_doc_free(d); std::fprintf(stderr, "zinc index-sign: the metadata cannot be canonicalised (floats?)\n"); return 2; }
  yyjson_mut_doc* md = yyjson_doc_mut_copy(d, nullptr);
  yyjson_doc_free(d);
  yyjson_mut_val* root = yyjson_mut_doc_get_root(md);
  yyjson_mut_val* sigs = yyjson_mut_obj_get(root, "signatures");
  if (!yyjson_mut_is_arr(sigs)) { yyjson_mut_obj_remove_key(root, "signatures"); sigs = yyjson_mut_arr(md); yyjson_mut_obj_add_val(md, root, "signatures", sigs); }
  for (std::size_t k = 3; k < args.size(); ++k) {
    std::string sig, err, keyCanon;
    const std::string pub = zn::tc::publicKeyOf(args[k]);
    if (pub.empty() || !zn::tc::signBytes(body, args[k], sig, err)) { yyjson_mut_doc_free(md); std::fprintf(stderr, "zinc index-sign: a seed is 64 hex digits\n"); return 2; }
    zn::tc::tuf::canonical("{\"keytype\":\"ed25519\",\"keyval\":{\"public\":\"" + pub + "\"},\"scheme\":\"ed25519\"}", keyCanon);
    yyjson_mut_val* s = yyjson_mut_obj(md);
    yyjson_mut_obj_add_strcpy(md, s, "keyid", zn::tc::sha256Hex(keyCanon).c_str());
    yyjson_mut_obj_add_strcpy(md, s, "sig", sig.c_str());
    yyjson_mut_arr_append(sigs, s);
  }
  char* out = yyjson_mut_write(md, YYJSON_WRITE_PRETTY_TWO_SPACES, nullptr);
  const bool wrote = out && writeFile(args[2], std::string(out) + "\n");
  std::free(out);
  yyjson_mut_doc_free(md);
  return wrote ? 0 : 1;
}

int indexGet(const std::vector<std::string>& args) {
  if (args.size() < 4 || args.size() > 5) { std::fprintf(stderr, "usage: zinc index-get <repository-url> <cache-dir> [target-path]\n"); return 2; }
  const std::string base = args[2];
  zn::tc::tuf::Client c(args[3], zn::tc::tuf::indexFetch(base), static_cast<long long>(std::time(nullptr)));
  std::string err;
  if (!c.refresh(err)) { std::fprintf(stderr, "zinc index-get: %s\n", err.c_str()); return 1; }
  if (args.size() == 5) {
    zn::tc::tuf::Target t;
    std::string bytes;
    if (!c.find(args[4], t, err) || !c.download(t, bytes, err)) { std::fprintf(stderr, "zinc index-get: %s\n", err.c_str()); return 1; }
    if (const std::string lk = zn::tc::tuf::logKey(""); !lk.empty() && !zn::tc::tlog::checkArtifact(zn::tc::tuf::indexFetch(base), lk, args[3] + "/log-state.json", t.path, t.sha256, err)) { std::fprintf(stderr, "zinc index-get: %s\n", err.c_str()); return 1; }   // ZN-343
    std::printf("%s %zu %s\n", t.path.c_str(), bytes.size(), t.role.c_str());
    return 0;
  }
  std::vector<zn::tc::tuf::Target> all;
  if (!c.all(all, err)) { std::fprintf(stderr, "zinc index-get: %s\n", err.c_str()); return 1; }
  for (const auto& t : all) std::printf("%s %lld %s\n", t.path.c_str(), t.length, t.role.c_str());
  return 0;
}

// `zinc plugins search [word]` (ZN-336.03): the signed index (ZINC_INDEX_URL, default the zinc-engine Pages site) refreshed through the TUF client into
// ~/.zinc/index; the trusted root is $ZINC_INDEX_ROOT or the engine's index/root.json. Lists the plugins and templates whose name or description has the word.
int indexSearch(const std::vector<std::string>& args, const std::string& engineRoot) {
  const std::string word = args.size() > 3 ? args[3] : "";
  std::unique_ptr<zn::tc::tuf::Client> index;
  std::string err;
  std::vector<zn::tc::tuf::Target> all;
  if (!zn::tc::tuf::openIndex(engineRoot, index, err) || !index->all(all, err)) { std::fprintf(stderr, "zinc plugins search: %s\n", err.c_str()); return 1; }
  auto lower = [](std::string x) { for (char& ch : x) ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch))); return x; };
  int shown = 0;
  for (const auto& t : all) {
    yyjson_doc* d = yyjson_read(t.custom.data(), t.custom.size(), 0);
    yyjson_val* o = yyjson_doc_get_root(d);
    auto str = [&](const char* k) { yyjson_val* v = yyjson_obj_get(o, k); return yyjson_is_str(v) ? std::string(yyjson_get_str(v)) : std::string(); };
    const std::string kind = str("kind"), name = str("name") + (str("version").empty() ? "" : " " + str("version")), desc = str("description");
    std::string targets;
    size_t i, n; yyjson_val* e;
    yyjson_arr_foreach(yyjson_obj_get(o, "targets"), i, n, e) if (yyjson_is_str(e)) targets += (targets.empty() ? "" : ",") + std::string(yyjson_get_str(e));
    yyjson_doc_free(d);
    if (!word.empty() && lower(name + " " + desc).find(lower(word)) == std::string::npos) continue;
    std::printf("%-9s %-20s %-28s %s\n", kind.c_str(), name.c_str(), targets.c_str(), desc.c_str());
    ++shown;
  }
  if (!shown) std::printf("nothing in the index matches '%s'\n", word.c_str());
  return 0;
}

int deploy(const std::vector<std::string>& args, const std::string& engineRoot) {
  Opts o = parseOpts(args, {"--target", "--device", "--dir"}, {"--print"});
  if (o.bad) { std::fprintf(stderr, "zinc deploy: unknown option %s\nusage: zinc deploy [entry|dir] --target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp --device user@host [--dir path] [--print]\n", o.badArg.c_str()); return 2; }
  if (!o.v.count("--device")) { std::fprintf(stderr, "zinc deploy: --device user@host is needed\n"); return 2; }
  const std::string device = o.v["--device"];
  for (char c : device) if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '@' || c == '.' || c == '-' || c == '_' || c == ':')) { std::fprintf(stderr, "zinc deploy: --device must look like user@host\n"); return 2; }
  const std::string target = o.v.count("--target") ? o.v["--target"] : "linux";
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  const std::string remote = o.v.count("--dir") ? o.v["--dir"] : "~/" + p.name;
  const bool dry = has(o, "--print") || std::getenv("ZINC_DEPLOY_DRY");
  std::vector<std::string> ex = {"zinc", "export", p.entry, "--target", target};
  if (!dry) { int rc = exportApp(ex, engineRoot); if (rc != 0) return rc; }
  const std::string dist = (fs::path(p.dir) / "dist" / (p.name + "-" + target)).string();
  const std::string mk = "ssh " + q(device) + " " + q("mkdir -p " + remote);
  const std::string cp = "scp -r " + q(dist + "/.") + " " + q(device + ":" + remote + "/");
  const std::string run = "ssh " + q(device) + " " + q("cd " + remote + " && ./run.sh");
  if (dry) { std::printf("%s\n%s\n%s\n", mk.c_str(), cp.c_str(), run.c_str()); return 0; }
  for (const std::string& c : {mk, cp, run}) { std::printf("+ %s\n", c.c_str()); std::fflush(stdout); if (int rc = status(std::system(c.c_str()))) return rc; }
  return 0;
}

int tsconfig(const std::vector<std::string>& args, const std::string& engineRoot) {
  std::string dir = args.size() >= 3 ? args[2] : ".";
  std::error_code ec;
  if (!fs::is_directory(dir, ec)) { std::fprintf(stderr, "zinc tsconfig: %s is not a directory\n", dir.c_str()); return 2; }
  std::string libFiles;
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / "lib", ec)) {
    const std::string f = e.path().filename().string();
    if (f.size() > 5 && f.compare(f.size() - 5, 5, ".d.ts") == 0) libFiles += (libFiles.empty() ? "" : ",\n    ") + jsonString(fs::weakly_canonical(e.path()).string());
  }
  if (!writeFile(fs::path(dir) / "tsconfig.json", "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\", \"module\": \"ESNext\", \"moduleResolution\": \"Bundler\", \"strict\": true, \"noLib\": true, \"types\": [],\n    \"useUnknownInCatchVariables\": false, \"allowImportingTsExtensions\": true, \"noEmit\": true, \"jsx\": \"preserve\",\n    " + moduleSuffixesJson() + "\n  },\n  \"files\": [\n    " + libFiles + "\n  ],\n  \"include\": [\"src/**/*\", \"*.ts\", \"*.tsx\"]\n}\n")) { std::fprintf(stderr, "zinc tsconfig: cannot write %s/tsconfig.json\n", dir.c_str()); return 1; }
  std::printf("wrote %s/tsconfig.json\n", dir.c_str());
  return 0;
}

int infer(const std::vector<std::string>& args) {
  Opts o = parseOpts(args, {}, {"--write"});
  if (o.bad) { std::fprintf(stderr, "zinc infer: unknown option %s\nusage: zinc infer <entry|dir>\n", o.badArg.c_str()); return 2; }
  if (has(o, "--write")) { std::fprintf(stderr, "zinc infer: --write is not available yet: the report below names the declarations to annotate\n"); return 2; }
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  const fs::path tmp = fs::temp_directory_path() / ("zinc-infer-" + std::to_string(getpid()));
  std::string cmd = q(self()) + " check --check " + q(p.entry) + " > " + q(tmp.string()) + " 2>&1";
  std::system(cmd.c_str());
  std::ifstream f(tmp);
  std::string line;
  int sites = 0, other = 0;
  while (std::getline(f, line)) {
    if (line.find("Z0109") != std::string::npos) { std::printf("%s\n", line.c_str()); ++sites; }
    else if (line.find("error") != std::string::npos) ++other;
  }
  std::error_code ec;
  fs::remove(tmp, ec);
  std::printf("%d site(s) where a type could not be inferred%s\n", sites, other ? " (other errors exist: zinc check lists them)" : "");
  return 0;
}

// ---- zinc dev (ZN-141)
bool readProject(const fs::path& project, zn::frontend::Project& p, std::string& err);
namespace {

volatile std::sig_atomic_t gStop = 0;
void onSignal(int) { gStop = 1; }
using Clock = std::chrono::steady_clock;
long msSince(Clock::time_point t) { return static_cast<long>(std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - t).count()); }

zn::plat::Pid spawnSelf(const std::vector<std::string>& args, const std::vector<std::pair<std::string, std::string>>& env, const std::string& cwd) {
  zn::plat::SpawnOptions o;
  o.newGroup = true;
  o.cwd = cwd;
  o.env = env;
  const zn::plat::Pid pid = zn::plat::spawn(args, o);
  return pid == -1 ? 0 : pid;
}
void killChild(zn::plat::Pid& pid) {
  if (pid <= 0) return;
  zn::plat::stop(pid);
  pid = 0;
}

using Stamps = std::map<std::string, std::pair<long long, long long>>;   // path -> (mtime ns, size)
Stamps snapshot(const fs::path& dir) {
  Stamps s;
  std::error_code ec;
  for (fs::recursive_directory_iterator it(dir, fs::directory_options::skip_permission_denied, ec), end; it != end; it.increment(ec)) {
    if (ec) break;
    const std::string name = it->path().filename().string();
    if (it->is_directory(ec)) { if (name == "build" || name == "dist" || name == "node_modules" || name == ".git" || name == "shots") it.disable_recursion_pending(); continue; }
    long long size = 0, mt = 0;
    if (!zn::plat::fileStamp(it->path().string(), size, mt)) continue;
    s[it->path().string()] = {mt, size};
  }
  return s;
}
// A program with a frame loop (zinc:ui, zinc:stage, or onFrame of zinc:gfx and zinc:3d): the inspector has a tree or a screen to show. A script has
// none, and the inspector's server would keep it from ending.
bool projectHasFrameLoop(const fs::path& dir) {
  std::error_code ec;
  for (fs::recursive_directory_iterator it(dir, fs::directory_options::skip_permission_denied, ec), end; it != end; it.increment(ec)) {
    if (ec) break;
    const std::string name = it->path().filename().string();
    if (it->is_directory(ec)) { if (name == "build" || name == "dist" || name == "node_modules" || name == ".git") it.disable_recursion_pending(); continue; }
    const std::string ext = it->path().extension().string();
    if (ext != ".ts" && ext != ".tsx" && ext != ".js" && ext != ".jsx") continue;
    std::ifstream f(it->path());
    std::stringstream ss; ss << f.rdbuf();
    const std::string text = ss.str();
    for (const char* mark : {"zinc:ui", "zinc:stage", "onFrame("}) if (text.find(mark) != std::string::npos) return true;
  }
  return false;
}
std::string readAll(const fs::path& p) { std::ifstream f(p); std::stringstream ss; ss << f.rdbuf(); return ss.str(); }

// Each entry of the packs in `dir` (zinc dev's packs: stored as they are, read whole).
void eachEntry(const fs::path& dir, const std::function<void(const std::string& name, std::uint8_t kind, const std::string& bytes)>& f) {
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(dir, ec)) {
    if (e.path().extension() != ".zpk") continue;
    const std::string pack = readAll(e.path());
    zn::zpk::Reader r;
    std::string err, bytes;
    if (!r.open(pack.data(), pack.size(), err)) continue;
    for (std::size_t i = 0; i < r.count(); ++i)
      if (r.read(i, bytes, err)) f(std::string(r.entry(i).name), r.entry(i).kind, bytes);
  }
}

// Asset hot reload (ZN-450): a save that changed files under the assets directory alone, in a project that packs them, builds the packs again
// (the cache imports only what changed) and sends the entries whose bytes changed to the running version on its dev socket, which swaps them
// in (src/host/assets_host.h): no restart, the program keeps its state. False when that does not apply or the program cannot take them.
bool reloadAssets(const std::string& dir, const Stamps& was, const Stamps& is, int fd, const DevRemote* remote, Clock::time_point t0) {
  zn::frontend::Project proj;
  std::string err;
  if (!readProject(dir, proj, err) || !proj.assets.packed()) return false;
  const std::string under = (fs::path(dir) / proj.assets.dir).lexically_normal().string() + "/";
  auto asset = [&](const std::string& f) { return fs::path(f).lexically_normal().string().rfind(under, 0) == 0; };
  for (const auto& [f, st] : is) if ((!was.count(f) || was.at(f) != st) && !asset(f)) return false;
  for (const auto& [f, st] : was) if (!is.count(f) && !asset(f)) return false;
  const std::string target = zn::tc::pluginTarget();
  const fs::path packs = fs::path(dir) / "build" / "assets" / target;
  std::map<std::string, std::string> had;   // name -> kind and hash of the bytes the program has
  eachEntry(packs, [&](const std::string& name, std::uint8_t kind, const std::string& bytes) { had[name] = std::to_string(kind) + zn::assets::Key().add(bytes).hex(); });
  if (!buildAssets(dir, target, false, err)) { std::fprintf(stderr, "zinc dev: %s (the program keeps the assets it has)\n", err.c_str()); return true; }
  std::string msg, names;
  const std::size_t were = had.size();
  std::size_t kept = 0;
  eachEntry(packs, [&](const std::string& name, std::uint8_t kind, const std::string& bytes) {
    kept += had.count(name);
    if (had[name] == std::to_string(kind) + zn::assets::Key().add(bytes).hex()) return;
    msg += "asset " + std::to_string(kind) + " " + std::to_string(bytes.size()) + " " + name + "\n" + bytes;
    names += (names.empty() ? "" : ", ") + name;
  });
  if (kept < were) return false;   // an entry is gone (a file removed): the program may name it, a restart says so
  if (msg.empty()) return true;
  msg += "end\n";
  if (remote && !remote->assets(msg)) return false;   // on a device: the same messages through the agent's session (ZN-729.03)
  for (std::size_t at = 0; !remote && at < msg.size();) {
    const long n = zn::plat::sockWrite(fd, msg.data() + at, msg.size() - at);
    if (n < 0 && errno != EINTR) return false;
    if (n > 0) at += static_cast<std::size_t>(n);
  }
  std::fprintf(stderr, "zinc dev: %s rebuilt and sent (%ld ms after the save)\n", names.c_str(), msSince(t0));
  return true;
}

// Fast Refresh (ZN-742): the running version's hot channel (ZINC_HOT_FD). One line from it, waiting at most `ms` (0: only what is there).
bool hotLine(int fd, std::string& buf, std::string& line, int ms) {
  const auto end = Clock::now() + std::chrono::milliseconds(ms);
  for (;;) {
    if (const std::size_t nl = buf.find('\n'); nl != std::string::npos) { line = buf.substr(0, nl); buf.erase(0, nl + 1); return true; }
    const int left = static_cast<int>(std::chrono::duration_cast<std::chrono::milliseconds>(end - Clock::now()).count());
    pollfd pf{};
    pf.fd = fd;
    pf.events = POLLIN;
    if (zn::plat::sockPoll(&pf, 1, left > 0 ? left : 0) <= 0) return false;
    char b[4096];
    const long n = zn::plat::sockRead(fd, b, sizeof b);
    if (n <= 0) return false;
    buf.append(b, static_cast<std::size_t>(n));
  }
}
// The files a save changed, relative to the project, and why the running version cannot take them in place (empty when it can: modules only).
std::string savedFiles(const std::string& dir, const Stamps& was, const Stamps& is, std::string& why) {
  std::string names;
  auto add = [&](const std::string& f) {
    std::error_code ec;
    const std::string rel = fs::relative(f, dir, ec).generic_string();
    names += (names.empty() ? "" : ", ") + rel;
    const std::string ext = fs::path(f).extension().string();
    if (why.empty() && ext != ".ts" && ext != ".tsx" && ext != ".js" && ext != ".jsx" && ext != ".mts" && ext != ".mjs") why = rel + " changed (not a module)";
  };
  for (const auto& [f, st] : is) if (!was.count(f) || was.at(f) != st) add(f);
  for (const auto& [f, st] : was) if (!is.count(f)) add(f);
  return names;
}

std::string redBoxSource(const std::vector<std::string>& lines) {
  std::string arr = "[";
  for (std::size_t i = 0; i < lines.size() && i < 16; ++i) arr += (i ? "," : "") + jsonString(lines[i].substr(0, 90));
  arr += "]";
  return "import { onFrame, clear, rect, text, width } from 'zinc:gfx';\nimport { env } from 'zinc:sys';\n// zinc dev: the red box of a compile error; the next save that compiles replaces it\nconst lines: string[] = " + arr + ";\n"
         "const top = env('ZINC_DEV_BAR') == '1' ? 14 : 0;   // below the dev bar\n"
         "onFrame((dt: number) => {\n  clear(0x3b0a0a);\n  rect(0, top, width(), 22, 0xdc2626);\n  text(6, top + 7, 'ZINC  COMPILE ERROR', 0xffffff, 1);\n  for (let i = 0; i < lines.length; i++) text(6, top + 32 + i * 12, lines[i], 0xfecaca, 1);\n});\n";
}

}  // namespace

bool hasFrameLoop(const std::string& dir) { return projectHasFrameLoop(dir); }

std::string appIconPng(const std::string& dir, const std::string& icon) {
  std::ifstream in(fs::path(dir) / icon, std::ios::binary);
  const std::string bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  const int n = kAppIconSize;
  int w = 0, h = 0, scale = 1, fw = 0, fh = 0;
  std::vector<std::uint8_t> rgba, fit;
  std::string err;
  if (icon.empty() || !in) return "";
  if (fs::path(icon).extension() == ".svg") {   // nanosvg: the baker's SVG reader fills shapes only, and an icon is mostly strokes (Lucide)
    std::string text = bytes;
    NSVGimage* im = nsvgParse(text.data(), "px", 96);
    if (!im || im->width <= 0 || im->height <= 0) { if (im) nsvgDelete(im); return ""; }
    const float k = n / std::max(im->width, im->height);
    fw = std::max(1, static_cast<int>(im->width * k + 0.5f)); fh = std::max(1, static_cast<int>(im->height * k + 0.5f));
    fit.assign(static_cast<std::size_t>(fw) * fh * 4, 0);
    NSVGrasterizer* r = nsvgCreateRasterizer();
    nsvgRasterize(r, im, 0, 0, k, fit.data(), fw, fh, fw * 4);
    nsvgDeleteRasterizer(r);
    nsvgDelete(im);
  } else {
    if (!zn::assets::decodeImage(icon, bytes, {}, w, h, scale, rgba, err) || w <= 0 || h <= 0) return "";
    fw = std::max(1, w >= h ? n : w * n / h); fh = std::max(1, h >= w ? n : h * n / w);
    zn::assets::resizeRgba(rgba, w, h, fit, fw, fh);
  }
  std::vector<std::uint8_t> px(n * n * 4, 0);   // transparent around the picture
  for (int y = 0; y < fh; y++)
    for (int x = 0; x < fw; x++)
      std::memcpy(&px[((y + (n - fh) / 2) * n + x + (n - fw) / 2) * 4], &fit[(y * fw + x) * 4], 4);
  const std::vector<std::uint8_t> png = zn::res::encodePng(px.data(), n, n, 4);
  return std::string(png.begin(), png.end());
}

std::string inspectEntry(const std::string& dir, const std::string& entry) {
  if (!projectHasFrameLoop(dir)) return entry;
  const fs::path devDir = fs::path(dir) / "build" / ".zinc-dev";
  std::error_code ec;
  fs::create_directories(devDir, ec);
  const std::string text = "import 'zinc:devtools';\nimport " + jsonString(fs::relative(entry, devDir, ec).string()) + ";\n";
  if (readAll(devDir / "main.ts") != text) writeFile(devDir / "main.ts", text);   // rewritten, it would stale the cached program (ZN-774.16)
  return (devDir / "main.ts").string();
}

// ---- zinc dev --lan (ZN-631): the project for Zinc Go players on the network, as `expo start` serves Expo Go
#ifndef _WIN32
namespace {

// The first IPv4 address of an interface that is up and not the loopback, en0 (a Mac's Wi-Fi) first; 127.0.0.1 without one
std::string lanAddress() {
  ifaddrs* all = nullptr;
  std::string best = "127.0.0.1";
  if (getifaddrs(&all) != 0) return best;
  int rank = 0;
  for (ifaddrs* i = all; i; i = i->ifa_next) {
    if (!i->ifa_addr || i->ifa_addr->sa_family != AF_INET || !(i->ifa_flags & IFF_UP) || (i->ifa_flags & IFF_LOOPBACK)) continue;
    char b[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &reinterpret_cast<sockaddr_in*>(i->ifa_addr)->sin_addr, b, sizeof b);
    const int r = std::strcmp(i->ifa_name, "en0") == 0 ? 3 : std::strncmp(i->ifa_name, "en", 2) == 0 || std::strncmp(i->ifa_name, "wl", 2) == 0 || std::strncmp(i->ifa_name, "eth", 3) == 0 ? 2 : 1;
    if (r > rank) { rank = r; best = b; }
  }
  freeifaddrs(all);
  return best;
}

// `text` as a QR code for the terminal: two modules per character with half blocks, black on white whatever the terminal's colours, the quiet zone
// of the standard (4 modules) around it
std::string qrTerminal(const std::string& text) {
  std::vector<std::uint8_t> qr(qrcodegen_BUFFER_LEN_MAX), tmp(qrcodegen_BUFFER_LEN_MAX);
  if (!qrcodegen_encodeText(text.c_str(), tmp.data(), qr.data(), qrcodegen_Ecc_LOW, qrcodegen_VERSION_MIN, qrcodegen_VERSION_MAX, qrcodegen_Mask_AUTO, true)) return "";
  const int size = qrcodegen_getSize(qr.data()), q0 = 4;
  auto dark = [&](int x, int y) { return x >= 0 && y >= 0 && x < size && y < size && qrcodegen_getModule(qr.data(), x, y); };
  std::string out;
  for (int y = -q0; y < size + q0; y += 2) {
    out += "  \x1b[30;47m";
    for (int x = -q0; x < size + q0; ++x) {
      const bool top = dark(x, y), bottom = y + 1 < size + q0 && dark(x, y + 1);
      out += top && bottom ? "█" : top ? "▀" : bottom ? "▄" : " ";
    }
    out += "\x1b[0m\n";
  }
  return out;
}

struct Player {
  int fd = -1;
  std::string in, profile, device;
  bool hello = false;
  int version = 0;
};

bool sendAll(int fd, const std::string& s) {
  for (std::size_t at = 0; at < s.size();) {
    const long n = zn::plat::sockWrite(fd, s.data() + at, s.size() - at);
    if (n < 0 && errno == EINTR) continue;
    if (n <= 0) return false;
    at += static_cast<std::size_t>(n);
  }
  return true;
}

// The project compiled in hot mode for a player's profile (zinc --emit=hot): the unit's bytes, or false with the diagnostics
bool hotUnit(const ProjectInfo& p, const std::string& profile, const fs::path& devDir, std::string& bytes, std::vector<std::string>& errors) {
  const fs::path out = devDir / ("player-" + profile + ".unit"), log = devDir / ("player-" + profile + ".txt");
  // without the optimiser, as Metro serves development bundles unminified: 200 ms less per save on rn-showcase (770 -> 570 ms), the keys the same
  const std::string cmd = "cd " + q(p.dir) + " && ZN_NO_OPT=1 " + q(self()) + " --emit=hot " + q(fs::absolute(p.entry).string()) + " " + q(out.string()) + " --profile " + q(profile) + " > " + q(log.string()) + " 2>&1";
  const int rc = status(std::system(cmd.c_str()));
  errors.clear();
  if (rc != 0) {
    std::istringstream is(readAll(log));
    std::error_code ec;
    const std::string here = fs::weakly_canonical(p.dir, ec).string() + "/";
    for (std::string line; std::getline(is, line);)
      if (!line.empty() && line.rfind("  ", 0) != 0) errors.push_back(line.rfind(here, 0) == 0 ? line.substr(here.size()) : line);   // not zinc's indented steps
    if (errors.empty()) errors.push_back("the build failed");
    return false;
  }
  bytes = readAll(out);
  return !bytes.empty();
}

int devLan(const ProjectInfo& p, const fs::path& devDir, int port) {
  const int lfd = ::socket(AF_INET, SOCK_STREAM, 0);
  const int one = 1;
  setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof one);
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_addr.s_addr = htonl(INADDR_ANY);
  int bound = 0;
  for (int k = 0; k < 20 && !bound; ++k) {   // the next free port when this one is taken (another zinc dev)
    a.sin_port = htons(static_cast<std::uint16_t>(port + k));
    if (::bind(lfd, reinterpret_cast<sockaddr*>(&a), sizeof a) == 0) bound = port + k;
  }
  if (!bound || ::listen(lfd, 8) != 0) { std::fprintf(stderr, "zinc dev: cannot listen on port %d: %s\n", port, std::strerror(errno)); return 1; }
  fcntl(lfd, F_SETFD, FD_CLOEXEC);
  std::string token;   // in the link: a phone on the same network without it gets nothing (a school's Wi-Fi)
  {
    std::random_device rd;
    static const char hex[] = "0123456789abcdef";
    for (int k = 0; k < 8; ++k) token += hex[rd() & 15];
  }
  const std::string host = lanAddress(), url = "zinc://" + host + ":" + std::to_string(bound) + "/" + token;
  std::fprintf(stderr, "\n%s\n  Scan it with Zinc Go, or open %s\n  Android emulator: adb shell am start -a android.intent.action.VIEW -d zinc://10.0.2.2:%d/%s\n"
               "  iOS simulator:    xcrun simctl launch booted dev.zinc.go zinc://127.0.0.1:%d/%s   (openurl works too, after a tap on Open)\n\n",
               qrTerminal(url).c_str(), url.c_str(), bound, token.c_str(), bound, token.c_str());
  std::fflush(stderr);
  std::vector<Player> players;
  std::map<std::string, std::string> units;   // profile -> the bytes of the last unit that compiled
  Stamps seen = snapshot(p.dir);
  Clock::time_point saved = Clock::now();
  std::string savedNames;
  long compileMs = 0;
  auto drop = [&](Player& pl, const char* why) {
    if (pl.hello) std::fprintf(stderr, "zinc dev: %s %s\n", pl.device.c_str(), why);
    zn::plat::sockClose(pl.fd);
    pl.fd = -1;
  };
  auto sendUnit = [&](Player& pl, bool compile) {
    std::vector<std::string> errors;
    std::string& bytes = units[pl.profile];
    if (compile || bytes.empty()) {
      std::string fresh;
      const auto c0 = Clock::now();
      const bool ok = hotUnit(p, pl.profile, devDir, fresh, errors);
      compileMs = msSince(c0);
      if (!ok) {
        std::string text;
        for (const std::string& e : errors) text += e + "\n";
        std::fprintf(stderr, "zinc dev: compile error: %s\n", errors[0].c_str());
        if (!sendAll(pl.fd, "error " + std::to_string(text.size()) + "\n" + text)) drop(pl, "is gone");
        return;
      }
      bytes = fresh;
    }
    if (!sendAll(pl.fd, "unit " + std::to_string(bytes.size()) + "\n" + bytes)) drop(pl, "is gone");
  };
  while (!gStop) {
    std::vector<pollfd> fds{{lfd, POLLIN, 0}};
    for (const Player& pl : players) fds.push_back({pl.fd, POLLIN, 0});
    zn::plat::sockPoll(fds.data(), static_cast<unsigned>(fds.size()), 40);
    if (fds[0].revents & POLLIN) {
      const int c = ::accept(lfd, nullptr, nullptr);
      if (c >= 0) {
        fcntl(c, F_SETFD, FD_CLOEXEC);
        setsockopt(c, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
        const timeval wait{5, 0};   // a player that stopped reading costs a save 5 s, then it is dropped
        setsockopt(c, SOL_SOCKET, SO_SNDTIMEO, &wait, sizeof wait);
#ifdef SO_NOSIGPIPE
        setsockopt(c, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
        Player pl;
        pl.fd = c;
        players.push_back(pl);
      }
    }
    for (Player& pl : players) {   // what the players said: whole lines, and the blobs of `log`
      char b[16384];
      const char* gone = nullptr;   // the lines that came before the end are read first
      for (long n; pl.fd >= 0;) {
        n = zn::plat::sockReadNow(pl.fd, b, sizeof b);
        if (n == 0) { gone = "left"; break; }
        if (n < 0) { if (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR) gone = "is gone"; break; }
        pl.in.append(b, static_cast<std::size_t>(n));
      }
      for (std::size_t nl; pl.fd >= 0 && (nl = pl.in.find('\n')) != std::string::npos;) {
        const std::string line = pl.in.substr(0, nl);
        if (line.rfind("log ", 0) == 0) {   // a console line of the program
          const std::size_t n = std::strtoull(line.c_str() + 4, nullptr, 10);
          if (pl.in.size() < nl + 1 + n) break;
          std::fprintf(stderr, "  %s | %s\n", pl.device.c_str(), pl.in.substr(nl + 1, n).c_str());
          pl.in.erase(0, nl + 1 + n);
          continue;
        }
        pl.in.erase(0, nl + 1);
        std::istringstream ws(line);
        std::string verb;
        ws >> verb;
        if (!pl.hello) {
          std::string ver, tok;
          ws >> ver >> tok >> pl.profile;
          std::getline(ws >> std::ws, pl.device);
          if (verb != "zinc-go" || ver != "1") { sendAll(pl.fd, "no this Zinc Go speaks another protocol than this zinc dev (update one of them)\n"); drop(pl, "speaks another protocol"); break; }
          if (tok != token) { sendAll(pl.fd, "no wrong code: scan the QR code zinc dev prints again\n"); drop(pl, "had a wrong code"); break; }
          if (!zn::frontend::findProfile(pl.profile)) { sendAll(pl.fd, "no unknown profile " + pl.profile + "\n"); drop(pl, "has an unknown profile"); break; }
          if (pl.device.empty()) pl.device = pl.profile;
          pl.hello = true;
          std::fprintf(stderr, "zinc dev: %s connected (profile %s)\n", pl.device.c_str(), pl.profile.c_str());
          saved = Clock::now();
          savedNames.clear();
          sendUnit(pl, false);
          continue;
        }
        std::string rest;
        std::getline(ws >> std::ws, rest);
        if (verb == "ok") {
          std::istringstream rs(rest);
          long ms = 0;
          rs >> ms;
          std::fprintf(stderr, "zinc dev: v%d refreshed %s on %s (%ld ms after the save: compile %ld, the device %ld)\n", pl.version, savedNames.c_str(), pl.device.c_str(), msSince(saved), compileMs, ms);
        } else if (verb == "started") std::fprintf(stderr, "zinc dev: v%d started on %s (%ld ms after the %s)\n", ++pl.version, pl.device.c_str(), msSince(saved), savedNames.empty() ? "connection" : "save");
        else if (verb == "restart") std::fprintf(stderr, "zinc dev: restart on %s: %s\n", pl.device.c_str(), rest.c_str());
        else if (verb == "missing") std::fprintf(stderr, "zinc dev: %s has no plugin '%s': this program cannot run in this Zinc Go (a player exported with the plugin can)\n", pl.device.c_str(), rest.c_str());
        else if (verb == "ended") std::fprintf(stderr, "zinc dev: the program ended on %s (%s)\n", pl.device.c_str(), rest.c_str());
        else if (verb == "reload") { saved = Clock::now(); savedNames.clear(); sendUnit(pl, true); }
      }
      if (gone && pl.fd >= 0) drop(pl, gone);
    }
    players.erase(std::remove_if(players.begin(), players.end(), [](const Player& pl) { return pl.fd < 0; }), players.end());
    std::fflush(stderr);
    Stamps now = snapshot(p.dir);
    if (now == seen) continue;
    saved = Clock::now();
    std::this_thread::sleep_for(std::chrono::milliseconds(30));   // an editor writes a file in several steps: take the settled state
    now = snapshot(p.dir);
    std::string why;
    savedNames = savedFiles(p.dir, seen, now, why);
    seen = now;
    units.clear();
    for (Player& pl : players) if (pl.hello) sendUnit(pl, units.find(pl.profile) == units.end());   // one compile per profile
  }
  for (Player& pl : players) zn::plat::sockClose(pl.fd);
  zn::plat::sockClose(lfd);
  return 0;
}

}  // namespace
#endif

int dev(const std::vector<std::string>& args, const DevRemote* remote) {
  for (std::size_t i = 0; i + 1 < args.size(); ++i) {
    if (args[i] != "--target" || args[i + 1] != "web") continue;   // zinc dev --target web: the page, a dev server and a WebSocket (docs/targets/web.md)
    WebArgs w;
    std::string entryArg;
    for (std::size_t k = 0; k < args.size(); ++k) {
      if (k == i || k == i + 1) continue;
      if (args[k] == "--render" && k + 1 < args.size()) w.render = args[++k];
      else if (args[k] == "--browsers" && k + 1 < args.size()) w.browsers = args[++k];
      else if (args[k] == "--port" && k + 1 < args.size()) w.port = std::atoi(args[++k].c_str());
      else if (args[k] == "--lan") w.lan = true;
      else if (args[k] == "--prepare" && k + 1 < args.size()) w.prepare = args[++k];   // the Vite plugin's step (packages/vite-plugin-zinc)
      else if (args[k] == "--build") w.build = true;
      else if (args[k][0] != '-') entryArg = args[k];
      else { std::fprintf(stderr, "zinc dev: unknown option %s\nusage: zinc dev [entry|dir] --target web [--render canvas|dom] [--port n] [--lan]\n", args[k].c_str()); return 2; }
    }
    ProjectInfo wp; std::string werr;
    if (!resolveProject(entryArg, wp, werr)) { std::fprintf(stderr, "zinc: %s\n", werr.c_str()); return 2; }
    w.dir = wp.dir; w.entry = wp.entry; w.name = wp.name; w.version = wp.version; w.engineRoot = zn::tc::sourceRoot(ZN_SOURCE_DIR);
    if (!w.render.empty() && w.render != "canvas" && w.render != "dom") { std::fprintf(stderr, "zinc dev: --render is canvas or dom\n"); return 2; }
    return devWeb(w);
  }
  setenv("ZINC_RUN", "interp", 1);   // the restarts interpret: a save restarts in 0.2 s, a compiled run would rebuild (ZN-398)
  std::vector<std::string> own, rest;
  bool noTools = false, lan = false;   // --lan: the project for Zinc Go on the network (ZN-631), no desktop window
  int lanPort = 8090;
  for (std::size_t i = 0; i < args.size(); ++i) {
    if (args[i] == "--") { rest.assign(args.begin() + i, args.end()); break; }
    if (args[i] == "--no-devtools") noTools = true;
    else if (args[i] == "--lan") lan = true;
    else if (args[i] == "--port" && i + 1 < args.size()) lanPort = std::atoi(args[++i].c_str());
    else own.push_back(args[i]);
  }
  Opts o = parseOpts(own, {}, {});
  if (o.bad) { std::fprintf(stderr, "zinc dev: unknown option %s\nusage: zinc dev [entry|dir] [--device name] [--lan [--port n]] [--no-devtools] [-- args]\n", o.badArg.c_str()); return 2; }
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  const fs::path devDir = fs::path(p.dir) / "build" / ".zinc-dev";
  std::error_code ec;
  fs::create_directories(devDir, ec);
  if (lan) {
#ifdef _WIN32
    std::fprintf(stderr, "zinc dev: --lan is not on Windows yet\n");
    return 2;
#else
    std::signal(SIGINT, onSignal);
    std::signal(SIGTERM, onSignal);
    std::signal(SIGPIPE, SIG_IGN);
    return devLan(p, devDir, lanPort);
#endif
  }
  // the inspector: the same program with `import 'zinc:devtools'` in front; on a device (--device) the pack puts it there and the session forwards it here (dev.cpp)
  // an "engine": "v8" or "hermes" project gets its engine's own inspector instead (Chrome DevTools on its JavaScript, zinc run --inspect: ZN-773.05, .08)
  const bool v8Tools = !remote && !noTools && (p.engine == "v8" || p.engine == "hermes");
  const std::string runEntry = !remote && !noTools && !v8Tools ? inspectEntry(p.dir, p.entry) : p.entry;
  const bool tools = runEntry != p.entry || v8Tools;
  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);
#ifdef SIGPIPE
  std::signal(SIGPIPE, SIG_IGN);   // a version that exited closed its dev socket: the write fails and the save restarts it
#endif
  const std::string exe = self();
  std::vector<std::pair<std::string, std::string>> env = {{"ZINC_SHOT_DIR", (fs::path(p.dir) / "build" / "shots").string()}, {"ZINC_DEV", "1"}};
  if (v8Tools) env.push_back({"ZINC_INSPECT", devtoolsPort(p.entry).empty() ? "9229" : devtoolsPort(p.entry)});
  std::string inspectPort = devtoolsPort(p.dir);
  if (inspectPort.empty()) inspectPort = "9229";
  // any free port (0): the first version binds one and says which on its dev socket ("devtools <port>"); the next versions ask for the same
  // one and take another when it is taken (ZINC_DEVTOOLS_ANY), so the inspector stays where it was across saves
  const bool anyPort = tools && !v8Tools && inspectPort == "0";
  std::string boundPort, devIn;   // the port the running version said, what it sent that is not a whole line yet
  fs::create_directories(fs::path(p.dir) / "build" / "shots", ec);
  zn::plat::Pid child = 0;
  std::string lastSaved;   // the files of the save that starts the next version, for its line
  int version = 0, devFd = -1;   // devFd: our end of the running version's dev socket (asset hot reload)
  int hotFd = -1;                // our end of its hot channel (Fast Refresh, ZN-742): it swaps the code of a save in place
  bool hotReady = false;         // it said `hot ready`: its frame loop runs
  std::string hotOff;            // or `hot off <why>`: it cannot swap (QuickJS)
  std::string hotBuf;
  auto startProgram = [&](long sinceSave, bool redbox, const std::vector<std::string>& msg) {
    killChild(child);
    if (devFd >= 0) { zn::plat::sockClose(devFd); devFd = -1; }
    if (hotFd >= 0) { zn::plat::sockClose(hotFd); hotFd = -1; }
    hotReady = false;
    hotOff.clear();
    hotBuf.clear();
    std::vector<std::string> cmd = {exe, "run", redbox ? (devDir / "redbox.ts").string() : runEntry};
    if (!redbox && (p.engine == "quickjs" || p.engine == "jsc" || p.engine == "v8" || p.engine == "hermes")) cmd.insert(cmd.end(), {"--engine", p.engine});   // a file names no project: its engine on the command line
    if (!redbox) cmd.insert(cmd.end(), rest.begin(), rest.end());
    if (redbox) writeFile(devDir / "redbox.ts", redBoxSource(msg));
    auto childEnv = env;
    devIn.clear();
    if (anyPort) childEnv.push_back({"ZINC_DEVTOOLS_PORT", boundPort.empty() ? "0" : boundPort});
    if (anyPort && !boundPort.empty()) childEnv.push_back({"ZINC_DEVTOOLS_ANY", "1"});
    if (version > 0) childEnv.push_back({"ZINC_DEVTOOLS_QUIET", "1"});   // the inspector's address was said at the first start: each restart does not say it again
    int sv[2] = {-1, -1};
    int hv[2] = {-1, -1};   // the hot channel: hot mode on the child only, never on zinc run, build, export or pack
#ifndef _WIN32   // no socketpair on Windows yet: a save restarts the program there (no asset reload, no Fast Refresh)
    if (!redbox && socketpair(AF_UNIX, SOCK_STREAM, 0, sv) == 0) {
      fcntl(sv[0], F_SETFD, FD_CLOEXEC);
      const timeval wait{2, 0};   // a version that stopped reading costs a save 2 s, then a restart
      const int room = 4 << 20;   // an atlas page in one write
      setsockopt(sv[0], SOL_SOCKET, SO_SNDTIMEO, &wait, sizeof wait);
      setsockopt(sv[0], SOL_SOCKET, SO_SNDBUF, &room, sizeof room);
      setsockopt(sv[1], SOL_SOCKET, SO_RCVBUF, &room, sizeof room);
      childEnv.push_back({"ZINC_DEV_FD", std::to_string(sv[1])});
    }
    if (!redbox && socketpair(AF_UNIX, SOCK_STREAM, 0, hv) == 0) {
      fcntl(hv[0], F_SETFD, FD_CLOEXEC);
      childEnv.push_back({"ZINC_HOT", "1"});
      childEnv.push_back({"ZINC_HOT_FD", std::to_string(hv[1])});
    }
#endif
    child = spawnSelf(cmd, childEnv, p.dir);
    if (sv[1] >= 0) { zn::plat::sockClose(sv[1]); devFd = sv[0]; }
    if (hv[1] >= 0) { zn::plat::sockClose(hv[1]); hotFd = hv[0]; }
    if (!redbox) ++version;
    if (redbox) std::fprintf(stderr, "zinc dev: red box on screen (%ld ms after the save)\n", sinceSave);
    else {
      const std::string port = anyPort ? boundPort : inspectPort;   // any port: said when the version has bound it
      const std::string after = version == 1 ? "" : " (" + std::to_string(sinceSave) + " ms after the save" + (lastSaved.empty() ? "" : " of " + lastSaved) + ")";   // the first start follows no save
      std::fprintf(stderr, "zinc dev: v%d started%s%s\n", version, tools ? (" with the inspector" + (port.empty() ? std::string() : " on port " + port)).c_str() : "", after.c_str());
    }
    std::fflush(stderr);
  };
  // On a device (ZN-729.03): the pack is the check (it compiles the program here, and what the device gets is always a packed project), so
  // the red box is a project of one file packed the same way.
  bool boxed = false;
  auto startRemote = [&](Clock::time_point t0) {
    std::string out;
    boxed = false;
    if (remote->start(p.dir, {rest.begin() + (rest.empty() ? 0 : 1), rest.end()}, false, out)) { ++version; std::fprintf(stderr, "zinc dev: v%d started on the device%s\n", version, version == 1 ? "" : (" (" + std::to_string(msSince(t0)) + " ms after the save)").c_str()); return; }
    if (!remote->poll()) return;   // the device is gone: the loop below says so
    std::vector<std::string> lines;
    std::istringstream is(out);
    const std::string here = fs::absolute(p.dir, ec).lexically_normal().string() + "/";   // the pack names files in full: the box is 90 characters wide
    for (std::string line; std::getline(is, line);) if (!line.empty()) lines.push_back(line.rfind(here, 0) == 0 ? line.substr(here.size()) : line);
    std::fprintf(stderr, "zinc dev: compile error: %s\n", lines.empty() ? "the build failed" : lines[0].c_str());
    writeFile(devDir / "redbox" / "src" / "main.ts", redBoxSource(lines));
    boxed = remote->start((devDir / "redbox").string(), {}, true, out);
    if (boxed) std::fprintf(stderr, "zinc dev: red box on the device (%ld ms after the save)\n", msSince(t0));
    else std::fprintf(stderr, "zinc dev: %s\n", out.c_str());
  };
  Stamps seen = snapshot(p.dir);
  if (remote) startRemote(Clock::now()); else startProgram(0, false, {});
  {   // what to do now, once (ZN-774.03): the file to change, that a save shows it, how to stop
    const std::string rel = fs::path(p.entry).lexically_relative(p.dir).generic_string();
    std::fprintf(stderr, "%s\n", zn::i18n::tr("cli.dev.hint", {{"file", rel.empty() || rel.rfind("..", 0) == 0 ? p.entry : rel}}).c_str());
    std::fflush(stderr);
  }
  while (!gStop) {
    std::this_thread::sleep_for(std::chrono::milliseconds(40));
    if (remote && !remote->poll()) { std::fprintf(stderr, "zinc dev: the session with the device ended\n"); return 1; }
    int st;
    if (child > 0 && zn::plat::wait(child, st, false)) { std::fprintf(stderr, "zinc dev: program exited (%d), waiting for changes...\n", st); child = 0; }
#ifndef _WIN32
    if (anyPort && devFd >= 0) {   // the running version's lines: the port its inspector bound
      char buf[256];
      for (ssize_t got; (got = ::recv(devFd, buf, sizeof buf, MSG_DONTWAIT)) > 0;) devIn.append(buf, static_cast<std::size_t>(got));
      for (std::size_t nl; (nl = devIn.find('\n')) != std::string::npos; devIn.erase(0, nl + 1)) {
        const std::string line = devIn.substr(0, nl);
        if (line.rfind("devtools ", 0) != 0 || line.substr(9) == boundPort) continue;
        boundPort = line.substr(9);
        std::fprintf(stderr, "zinc dev: the inspector listens on port %s\n", boundPort.c_str());
        std::fflush(stderr);
      }
    }
#endif
    Stamps now = snapshot(p.dir);
    if (now == seen) continue;
    const auto t0 = Clock::now();
    std::this_thread::sleep_for(std::chrono::milliseconds(30));   // an editor writes a file in several steps: take the settled state
    now = snapshot(p.dir);
    const Stamps was = seen;
    seen = now;
    if ((remote ? !boxed : child > 0 && devFd >= 0) && reloadAssets(p.dir, was, now, devFd, remote, t0)) continue;
    if (remote) { startRemote(t0); continue; }
    // Fast Refresh (ZN-742): the running version compiles the save itself and swaps it in, keeping its process, window and state; it answers
    // why not when it cannot, and the save restarts it as before
    std::string why;
    const std::string saved = savedFiles(p.dir, was, now, why);
    lastSaved = saved;
    if (child > 0 && hotFd >= 0) {
      std::string line;
      while (!hotReady && hotOff.empty() && hotLine(hotFd, hotBuf, line, 0)) {
        hotReady = line == "hot ready";
        if (line.rfind("hot off ", 0) == 0) hotOff = line.substr(8);
      }
      if (why.empty() && !hotReady) why = hotOff.empty() ? "the program has no frame loop" : hotOff;
      if (why.empty()) {
        const bool sent = write(hotFd, "reload\n", 7) == 7;
        if (!sent || !hotLine(hotFd, hotBuf, line, 5000)) why = "the program did not answer";
        else if (line.rfind("ok", 0) == 0) {
          std::fprintf(stderr, "zinc dev: v%d refreshed %s (%ld ms after the save)\n", version, saved.c_str(), msSince(t0));
          std::fflush(stderr);
          continue;
        } else if (line.rfind("restart ", 0) == 0) {   // it compiled: no check needed
          std::fprintf(stderr, "zinc dev: restart: %s\n", line.c_str() + 8);
          startProgram(msSince(t0), false, {});
          continue;
        } else if (line == "error") {   // the red box, as a check failure gives it
          std::vector<std::string> lines;
          std::error_code hec;
          const std::string here = fs::weakly_canonical(p.dir, hec).string() + "/";   // it compiles the absolute path from its real directory: the box is 90 characters wide
          while (hotLine(hotFd, hotBuf, line, 2000) && line != "end")
            if (!line.empty() && line.rfind("  ", 0) != 0) lines.push_back(line.rfind(here, 0) == 0 ? line.substr(here.size()) : line);   // not the steps zinc run prints (indented)
          std::fprintf(stderr, "zinc dev: compile error: %s\n", lines.empty() ? "the build failed" : lines[0].c_str());
          startProgram(msSince(t0), true, lines);
          continue;
        } else why = "the program answered " + line;
      }
    }
    if (!why.empty() && child > 0) std::fprintf(stderr, "zinc dev: restart: %s\n", why.c_str());
    const fs::path out = devDir / "check.txt";
    const std::string cmd = q(exe) + " check --check " + q(p.entry) + " > " + q(out.string()) + " 2>&1";
    const int rc = status(std::system(cmd.c_str()));
    if (rc != 0) {
      std::vector<std::string> lines;
      std::istringstream is(readAll(out));
      std::string line;
      while (std::getline(is, line)) if (!line.empty()) lines.push_back(line);
      std::fprintf(stderr, "zinc dev: compile error: %s\n", lines.empty() ? "check failed" : lines[0].c_str());
      startProgram(msSince(t0), true, lines);
    } else startProgram(msSince(t0), false, {});
  }
  killChild(child);
  if (hotFd >= 0) close(hotFd);
  return 0;
}

// ---- zinc monitor
namespace {

void printTelemetry(const std::string& line) {
  yyjson_doc* doc = yyjson_read(line.c_str(), line.size(), 0);
  yyjson_val* root = doc ? yyjson_doc_get_root(doc) : nullptr;
  yyjson_val* type = root && yyjson_is_obj(root) ? yyjson_obj_get(root, "type") : nullptr;
  if (!type || !yyjson_is_str(type)) { std::printf("%s\n", line.c_str()); if (doc) yyjson_doc_free(doc); return; }
  const std::string t = yyjson_get_str(type);
  yyjson_val* pl = yyjson_obj_get(root, "payload");
  yyjson_val* ts = yyjson_obj_get(root, "ts");
  char head[48];
  std::snprintf(head, sizeof head, "%9.3f s  ", ts && yyjson_is_num(ts) ? yyjson_get_num(ts) / 1000.0 : 0.0);
  auto str = [&](yyjson_val* v, const char* k) { yyjson_val* x = v ? yyjson_obj_get(v, k) : nullptr; return x && yyjson_is_str(x) ? std::string(yyjson_get_str(x)) : std::string(); };
  auto num = [&](yyjson_val* v, const char* k) { yyjson_val* x = v ? yyjson_obj_get(v, k) : nullptr; char b[40]; if (!x) return std::string(); if (yyjson_is_int(x)) std::snprintf(b, sizeof b, "%lld", static_cast<long long>(yyjson_get_sint(x))); else if (yyjson_is_num(x)) std::snprintf(b, sizeof b, "%g", yyjson_get_num(x)); else return std::string("null"); return std::string(b); };
  if (t == "hello") std::printf("%shello  platform %s\n", head, str(pl, "platform").c_str());
  else if (t == "metric") std::printf("%s%-7s %s = %s\n", head, str(pl, "kind").c_str(), str(pl, "name").c_str(), num(pl, "value").c_str());
  else if (t == "event") std::printf("%sevent   %s  %s\n", head, str(pl, "name").c_str(), str(pl, "data").c_str());
  else if (t == "state_snapshot") {
    std::string vars;
    yyjson_val* v = pl ? yyjson_obj_get(pl, "vars") : nullptr;
    size_t i, n; yyjson_val *k, *x;
    if (v && yyjson_is_obj(v)) yyjson_obj_foreach(v, i, n, k, x) vars += std::string(vars.empty() ? "" : "  ") + yyjson_get_str(k) + "=" + (yyjson_is_num(x) ? num(v, yyjson_get_str(k)) : "?");
    std::printf("%sstate   %s\n", head, vars.c_str());
  } else std::printf("%s%s\n", head, line.c_str());
  yyjson_doc_free(doc);
}

}  // namespace

int monitor(const std::vector<std::string>& args) {
  std::string file, port, udp, baud = "115200";
  for (std::size_t i = 2; i < args.size(); ++i) {
    if (args[i] == "--port" && i + 1 < args.size()) port = args[++i];
    else if (args[i] == "--baud" && i + 1 < args.size()) baud = args[++i];
    else if (args[i] == "--udp" && i + 1 < args.size()) udp = args[++i];
    else if (args[i].rfind("-", 0) != 0) file = args[i];
    else { std::fprintf(stderr, "zinc monitor: unknown option %s\nusage: zinc monitor [file | --port /dev/tty... [--baud n] | --udp port]\n", args[i].c_str()); return 2; }
  }
  std::signal(SIGINT, onSignal);
  int fd = 0;
#ifdef _WIN32
  if (!udp.empty() || !port.empty()) { std::fprintf(stderr, "zinc monitor: --port and --udp are not supported on Windows yet; a file is\n"); return 2; }
  if (!file.empty()) {
    fd = open(file.c_str(), O_RDONLY | O_BINARY);
    if (fd < 0) { std::fprintf(stderr, "zinc monitor: cannot open %s\n", file.c_str()); return 1; }
  }
#else
  if (!udp.empty()) {
    fd = socket(AF_INET, SOCK_DGRAM, 0);
    sockaddr_in a{};
    a.sin_family = AF_INET; a.sin_addr.s_addr = htonl(INADDR_ANY); a.sin_port = htons(static_cast<uint16_t>(std::atoi(udp.c_str())));
    if (fd < 0 || bind(fd, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0) { std::fprintf(stderr, "zinc monitor: cannot listen on UDP %s\n", udp.c_str()); return 1; }
  } else if (!port.empty() || !file.empty()) {
    const std::string path = port.empty() ? file : port;
    fd = open(path.c_str(), O_RDONLY | O_NOCTTY | O_NONBLOCK);
    if (fd < 0) { std::fprintf(stderr, "zinc monitor: cannot open %s\n", path.c_str()); return 1; }
    if (!port.empty()) {
      termios tio{};
      tcgetattr(fd, &tio);
      cfmakeraw(&tio);
      const int b = std::atoi(baud.c_str());
      speed_t sp = b == 9600 ? B9600 : b == 19200 ? B19200 : b == 38400 ? B38400 : b == 57600 ? B57600 : b == 230400 ? B230400 : B115200;
      cfsetspeed(&tio, sp);
      tio.c_cflag |= CLOCAL | CREAD;
      tcsetattr(fd, TCSANOW, &tio);
    }
  }
#endif
  std::string buf;
  char chunk[4096];
  bool regular = false;
  { struct stat st; regular = fstat(fd, &st) == 0 && S_ISREG(st.st_mode); }
  while (!gStop) {
#ifdef _WIN32
    int n = 1;   // a file or a pipe: a blocking read
#else
    pollfd pfd{fd, POLLIN, 0};
    int n = regular ? 1 : poll(&pfd, 1, 200);
#endif
    if (n < 0) { if (errno == EINTR) continue; break; }
    if (n == 0) continue;
    ssize_t r = read(fd, chunk, sizeof chunk);
    if (r == 0) { if (regular || file.empty()) { if (regular) break; if (!port.empty()) { std::this_thread::sleep_for(std::chrono::milliseconds(100)); continue; } break; } }
    if (r < 0) { if (errno == EAGAIN || errno == EINTR) { std::this_thread::sleep_for(std::chrono::milliseconds(20)); continue; } break; }
    buf.append(chunk, static_cast<std::size_t>(r));
    std::size_t nl;
    while ((nl = buf.find('\n')) != std::string::npos) {
      std::string line = buf.substr(0, nl);
      buf.erase(0, nl + 1);
      if (!line.empty() && line.back() == '\r') line.pop_back();
      if (!line.empty()) printTelemetry(line);
    }
    std::fflush(stdout);
  }
  if (!buf.empty()) printTelemetry(buf);
  return 0;
}

std::string assetCacheDir() { return std::getenv("ZINC_NO_CACHE") ? "" : (fs::path(zn::tc::home()) / "cache" / "assets").string(); }
std::string engineBuild() {   // two builds of the engine share a version, not an executable's time and size
  std::error_code ec;
  const std::string e = zn::tc::executablePath();
  const auto t = fs::last_write_time(e, ec);
  return ec ? "unknown" : std::to_string(std::chrono::duration_cast<std::chrono::nanoseconds>(t.time_since_epoch()).count()) + " " + std::to_string(fs::file_size(e, ec));
}

/** The project's zinc.json (none: the defaults). False with `err` when it breaks a manifest rule (a malformed "assets" key...). */
bool readProject(const fs::path& project, zn::frontend::Project& p, std::string& err) {
  const std::string text = readAll(project / "zinc.json");
  if (text.empty() || zn::frontend::parseProject(text, p, err) || !p.fatal) { err.clear(); return true; }
  err = (project / "zinc.json").string() + ": " + err;
  return false;
}

zn::assets::Splash splashFor(const zn::frontend::Project& p, const std::string& projectDir, const std::string& target) {
  auto t = p.targets.find(target);
  const zn::frontend::Splash& s = t != p.targets.end() && t->second.splash.present ? t->second.splash : p.splash;
  zn::assets::Splash out;
  if (!s.present) return out;
  out.on = true;
  if (!s.image.empty()) out.image = (fs::path(projectDir) / s.image).lexically_normal().string();
  if (!s.background.empty()) {   // "#rgb", "#rrggbb" or "#rrggbbaa" (the manifest checked it)
    std::string h = s.background.substr(1);
    if (h.size() == 3) h = {h[0], h[0], h[1], h[1], h[2], h[2]};
    const std::uint32_t v = static_cast<std::uint32_t>(std::stoul(h, nullptr, 16));
    out.background = h.size() == 8 ? (v >> 8 | v << 24) : (0xff000000u | v);
  }
  out.fit = s.fit == "cover" ? 1 : s.fit == "center" ? 2 : 0;
  out.minMs = static_cast<std::uint32_t>(s.minMs);
  out.fadeMs = static_cast<std::uint32_t>(s.fadeMs);
  return out;
}

namespace {
// The loop of the loader stage: zinc:gfx and the host calls of the asset scheduler (src/host/assets_host.h) only, so the same text runs on
// the typed engines and on QuickJS. Progress is the bytes done over the bytes of every group, monotone, 1 only once all are resident.
const char* kLoaderStage = R"ZN(import { overlay, createImage, destroyImage, beginImage, endImage, drawImage, width, height } from 'zinc:gfx';
function __loaderSettled(ids: i32[]): boolean {
  let all = true;
  for (const id of ids) {
    const st = __host_assetsReqState(id);
    if (st === 2) throw new Error(__host_assetsReqError(id));
    if (st === 0) all = false;
  }
  return all;
}
function __loaderStage(groups: string[], minMs: number, fadeMs: number, screen: (progress: number, dt: number) => void): void {
  if (groups.length === 0) { const n = __host_assetsGroupsCount(); for (let i: i32 = 0; i < n; i++) groups.push(__host_assetsName(i)); }
  const ids: i32[] = [];
  for (const g of groups) {
    if (__host_assetsGroupState(g) === 2) continue;   // resident already
    const id = __host_assetsLoadGroup(g, 0);
    if (id === 0) { __host_fsFailed(); throw new Error(__host_fsError()); }
    ids.push(id);
  }
  if (ids.length === 0) return;   // nothing to load: no loader
  __host_assetsTurn();
  if ((__host_loopReal() & 1) !== 0) {   // a load shorter than a frame shows no loader; a deterministic turn waits for its jobs instead
    const until = __host_loopNow() + 16;
    while (!__loaderSettled(ids) && __host_loopNow() < until) { __host_loopWait(until - __host_loopNow()); __host_assetsTurn(); }
  }
  let frames = __host_gfxFrames();   // ZINC_FRAMES counts the loader's frames too
  let shown: number = 0;
  if (!(__loaderSettled(ids) && minMs <= 0)) {
    while (frames > 0) {
      const dt = __host_gfxPoll();
      if (__host_gfxShouldQuit()) { __host_gfxFinish(); __host_sysExit(0); }
      __host_assetsTurn();
      const settled = __loaderSettled(ids);
      let done: number = 0, total: number = 0;
      for (const id of ids) { done += __host_assetsReqDone(id); total += __host_assetsReqTotal(id); }
      shown += dt * 1000;
      const last = settled && shown >= minMs;
      __host_gfxBegin();
      screen(total > 0 ? done / total : 1, dt);
      if (last && fadeMs > 0) {   // fadeMs: this frame, drawn over the program's first frames with a falling opacity (a cross-fade)
        const img = createImage(width(), height());
        beginImage(img);
        screen(1, 0);
        endImage();
        let gone: number = 0;
        overlay((step: number): boolean => {
          gone += step * 1000;
          if (gone >= fadeMs) { destroyImage(img); return false; }
          drawImage(img, 0, 0, width(), height(), Math.round(255 - 255 * gone / fadeMs), 0);
          return true;
        });
      }
      __host_gfxEnd();
      frames--;
      if (last) break;
    }
  }
  for (const id of ids) __host_assetsReqForget(id);
}
)ZN";

std::string hexOf(std::uint32_t v) { char b[16]; std::snprintf(b, sizeof b, "0x%06x", v & 0xffffffu); return b; }
}  // namespace

zn::frontend::LoaderStage loaderStageFor(const zn::frontend::Project& p, const std::string& projectDir, const std::string& entry, const std::string& target) {
  namespace fs = std::filesystem;
  std::error_code ec;
  const std::string main = zn::frontend::entryOf(projectDir, &p);
  if (!p.loading.present || main.empty() || !fs::equivalent(main, entry, ec)) return {};
  auto t = p.targets.find(target);
  const zn::frontend::Splash& s = t != p.targets.end() && t->second.splash.present ? t->second.splash : p.splash;
  // the app's colours: the splash background (black under a splash image alone, as the engine splash), else a dark grey; the bar light on a
  // dark background, dark on a light one
  std::uint32_t bg = s.present ? 0 : 0x101418;
  if (s.present && !s.background.empty()) {
    std::string h = s.background.substr(1);
    if (h.size() == 3) h = {h[0], h[0], h[1], h[1], h[2], h[2]};
    bg = static_cast<std::uint32_t>(std::stoul(h.substr(0, 6), nullptr, 16));
  }
  const std::uint32_t luma = ((bg >> 16) * 299 + ((bg >> 8) & 255) * 587 + (bg & 255) * 114) / 1000;
  const std::string fg = hexOf(luma < 128 ? 0xf0f0f0 : 0x202428);
  std::string imports, screen;
  const std::string& sc = p.loading.screen;
  if (sc == "bar" || (sc == "default" && s.image.empty())) {
    imports = "import { bar } from 'zinc:loader';\n";
    screen = "bar(" + hexOf(bg) + ", " + fg + ")";
  } else if (sc == "default") {   // the splash image placed as the engine splash places it (an SVG is imported at 8 pixels a unit, src/assets)
    const std::string ext = fs::path(s.image).extension().string();
    imports = "import { splash } from 'zinc:loader';\n";
    screen = "splash(" + hexOf(bg) + ", " + std::string(s.fit == "cover" ? "1" : s.fit == "center" ? "2" : "0") + ", " + (ext == ".svg" ? "8" : "1") + ", " + fg + ")";
  } else {   // a module of the project whose default export is the screen
    std::string rel = sc.rfind("./", 0) == 0 ? sc.substr(2) : sc, quoted;
    for (char c : rel) { if (c == '\\' || c == '\'') quoted += '\\'; quoted += c; }
    imports = "import __screen from './" + quoted + "';\n";
    screen = "__screen";
  }
  std::vector<std::string> groups = p.loading.groups;   // none named: boot when assets.groups has it, else every group of the packs
  if (groups.empty() && std::any_of(p.assets.groups.begin(), p.assets.groups.end(), [](const zn::frontend::AssetGroup& g) { return g.name == "boot"; })) groups.push_back("boot");
  std::string list;
  for (const std::string& g : groups) {
    list += list.empty() ? "'" : ", '";
    for (char c : g) { if (c == '\\' || c == '\'') list += '\\'; list += c; }
    list += "'";
  }
  zn::frontend::LoaderStage out;
  out.path = (fs::absolute(projectDir) / "zinc.json.loading.ts").lexically_normal().string();
  out.source = "// zinc.json \"loading\" (ZN-447), generated: initialised before the program's own modules\n" + imports + kLoaderStage +
               "__loaderStage([" + list + "], " + std::to_string(p.loading.minMs) + ", " + std::to_string(p.loading.fadeMs) + ", " + screen + ");\n";
  return out;
}

bool buildAssets(const std::string& dir, const std::string& target, bool release, std::string& err, std::string* summary) {
  const fs::path project = fs::absolute(dir).lexically_normal();
  zn::frontend::Project proj;
  if (!readProject(project, proj, err)) return false;
  const fs::path src = project / proj.assets.dir;
  std::error_code ec;
  const zn::assets::Splash splash = splashFor(proj, project.string(), target);
  if (!fs::is_directory(src, ec) && !splash.on) return true;
  zn::assets::Options o;
  o.splash = splash;
  o.sourceDir = src.string();
  o.outDir = (project / "build" / "assets" / target).string();
  o.cacheDir = assetCacheDir();
  o.tool = engineBuild();
  o.target = target;
  o.profile = release ? "release" : "dev";
  std::vector<zn::frontend::TargetAssets> rows;   // the target's asset profile: texture formats, sizes, pack codec (ZN-439)
  if (!zn::frontend::assetProfiles(proj, readAll(fs::path(zn::tc::sourceRoot(ZN_SOURCE_DIR)) / "targets" / "capabilities.json"), rows, err)) return false;
  for (const auto& t : rows) if (t.target == target) o.targetProfile = t.keys;
  o.basisu = [](std::string& path, std::string& e) { return zn::tc::ensureBasisu(path, e); };
  o.gltfpack = [](std::string& path, std::string& e) { return zn::tc::ensureGltfpack(path, e); };
  for (const auto& r : proj.assets.rules) o.rules.push_back({r.match, r.as, r.options});
  for (const auto& g : proj.assets.groups) o.groups.push_back({g.name, g.include, g.exclude});
  zn::assets::Report r;
  if (!zn::assets::build(o, r, err)) return false;
  std::uint64_t bytes = 0;
  for (const zn::assets::Pack& p : r.packs) bytes += p.bytes;
  char line[512];
  std::snprintf(line, sizeof line, "assets: %zu (%zu imported, %zu from the cache), %zu pack%s of %llu bytes in %.0f ms: %s", r.items.size(), r.imported,
                r.items.size() - r.imported, r.packs.size(), r.packs.size() == 1 ? "" : "s", static_cast<unsigned long long>(bytes), r.ms, o.outDir.c_str());
  if (summary) *summary = line;
  return true;
}

bool assetRun(const std::string& dir, const std::string& target, const std::string& engineRoot, bool build, std::string& packs, std::uint64_t& ram, std::string& err) {
  const fs::path project = fs::absolute(dir).lexically_normal();
  zn::frontend::Project proj;
  packs.clear();
  ram = 0;
  if (!readProject(project, proj, err)) return false;
  std::vector<zn::frontend::TargetAssets> rows;
  if (!zn::frontend::assetProfiles(proj, readAll(fs::path(engineRoot) / "targets" / "capabilities.json"), rows, err)) return false;
  for (const auto& t : rows)
    if (t.target == target) { auto b = t.budgets.find("ram"); ram = b == t.budgets.end() ? 0 : b->second; }
  if (!build || !proj.assets.packed()) return true;   // no rules nor groups: the program reads its assets directory as before, no pack to build
  if (!buildAssets(project.string(), target, false, err)) return false;
  packs = (project / "build" / "assets" / target).string();
  return true;
}

/** zinc assets info: the profile and budgets in force on each target (or on --target T), one line each. */
int assetsInfo(const fs::path& project, const std::string& only, const std::string& engineRoot) {
  zn::frontend::Project proj;
  std::string err;
  if (!readProject(project, proj, err)) { std::fprintf(stderr, "zinc assets: %s\n", err.c_str()); return 2; }
  for (const std::string& w : proj.warnings) std::fprintf(stderr, "zinc assets: %s: %s\n", (project / "zinc.json").string().c_str(), w.c_str());
  std::vector<zn::frontend::TargetAssets> rows;
  if (!zn::frontend::assetProfiles(proj, readAll(fs::path(engineRoot) / "targets" / "capabilities.json"), rows, err)) { std::fprintf(stderr, "zinc assets: %s\n", err.c_str()); return 1; }
  std::string groups;
  for (const auto& g : proj.assets.groups) groups += (groups.empty() ? " (" : ", ") + g.name;
  std::printf("assets: %s, %zu rule%s, %zu group%s%s\n", proj.assets.dir.c_str(), proj.assets.rules.size(), proj.assets.rules.size() == 1 ? "" : "s",
              proj.assets.groups.size(), proj.assets.groups.size() == 1 ? "" : "s", groups.empty() ? "" : (groups + ")").c_str());
  bool found = only.empty();
  for (const auto& t : rows) {
    if (!only.empty() && t.target != only) continue;
    found = true;
    std::string line = t.target + ": profile " + t.profile;
    for (const auto& [k, v] : t.keys) line += ", " + k + " " + v;
    std::string budgets;
    for (const auto& [k, v] : t.budgets) budgets += (budgets.empty() ? "; budgets " : ", ") + k + " " + zn::frontend::byteSize(v);
    std::printf("%s%s\n", line.c_str(), budgets.c_str());
  }
  if (!found) { std::fprintf(stderr, "zinc assets: no target %s in targets/capabilities.json\n", only.c_str()); return 2; }
  return 0;
}

int assets(const std::vector<std::string>& args, const std::string& engineRoot) {
  const char* usage = "usage: zinc assets build [dir] [--target T] [--release]\n       zinc assets info [dir] [--target T]\n       zinc assets cook <gltf> [profile] [-o dir]\n       zinc assets view <file.zcook>\n";
  if (args.size() < 3 || (args[2] != "build" && args[2] != "info" && args[2] != "cook" && args[2] != "view")) { std::fprintf(stderr, "%s", usage); return 2; }
  if (args[2] == "view") {
    zn::assets::CookReceipt rc;
    std::string err;
    if (!zn::assets::readCook(args[3], rc, err)) { std::fprintf(stderr, "zinc assets view: %s\n", err.c_str()); return 1; }
    std::printf("profile=%s vertices=%llu triangles=%llu\n", rc.profile.c_str(), (unsigned long long)rc.vertices, (unsigned long long)rc.triangles);
    return 0;
  }
  if (args[2] == "cook") {
    std::string gltf = args.size() > 3 ? args[3] : "";
    std::string profile = (args.size() > 4 && (args[4] == "psp30" || args[4] == "vita60" || args[4] == "n3ds30" || args[4] == "ios60")) ? args[4] : "psp30";
    (void)0;
    std::string outdir = "build/cooked";
    for (std::size_t i = 4; i < args.size(); ++i) {
      if (args[i] == "-o" && i + 1 < args.size()) { outdir = args[i + 1]; ++i; }
    }
    zn::assets::CookProfile p; p.name = profile;
    if (profile == "psp30") p.triBudget = 200000;
    else if (profile == "vita60") p.triBudget = 1000000;
    else if (profile == "n3ds30") p.triBudget = 100000;
    else if (profile == "ios60") p.triBudget = 500000;
    zn::assets::CookReceipt rc;
    std::string err;
    if (!zn::assets::cook(gltf, p, outdir, rc, err)) { std::fprintf(stderr, "zinc assets cook: %s\n", err.c_str()); return 1; }
    std::printf("cooked %s -> %s (%llu tris)\n", gltf.c_str(), outdir.c_str(), (unsigned long long)rc.triangles);
    return 0;
  }
  std::vector<std::string> rest(args.begin() + 1, args.end());   // parseOpts reads from the third word: the one after the subcommand
  Opts o = parseOpts(rest, {"--target"}, {"--release"});
  if (o.bad) { std::fprintf(stderr, "zinc assets: unknown option %s\n%s", o.badArg.c_str(), usage); return 2; }
  const fs::path project = fs::absolute(o.entry.empty() ? "." : o.entry).lexically_normal();
  if (args[2] == "info") return assetsInfo(project, o.v.count("--target") ? o.v["--target"] : "", engineRoot);
  const std::string target = o.v.count("--target") ? o.v["--target"] : zn::plat::osName();
  zn::frontend::Project proj;
  std::string err, line;
  if (!readProject(project, proj, err)) { std::fprintf(stderr, "zinc assets: %s\n", err.c_str()); return 2; }
  std::error_code ec;
  if (!fs::is_directory(project / proj.assets.dir, ec) && !splashFor(proj, project.string(), target).on) { std::fprintf(stderr, "zinc assets: %s has no %s directory\n", project.string().c_str(), proj.assets.dir.c_str()); return 2; }
  if (!buildAssets(project.string(), target, has(o, "--release"), err, &line)) { std::fprintf(stderr, "zinc assets: %s\n", err.c_str()); return 1; }
  std::printf("%s\n", line.c_str());
  return 0;
}

}  // namespace zn::cli
