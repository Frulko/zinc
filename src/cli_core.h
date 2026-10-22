#pragma once
// The command line beyond the compiler (ZN-138, audit 01 table D): bare `zinc run|build|check` in a project, `zinc help [command]`, `zinc init <dir> [--template t]`, `zinc doctor`.
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace zn::frontend { struct Project; struct LoaderStage; }
namespace zn::assets { struct Splash; }

namespace zn::cli {

/** `zinc run|build|check` with no entry (or only options): the project of the working directory supplies it (zinc.json "entry", else src/main.ts[x]).
 *  Rewrites `args` in place to the form the compiler commands take; false with `err` set when there is no project. Other commands are left alone. */
// zinc run --simulate <device>: the definition, the state file and the control panel of a simulated device; false and `err` when it is unknown.
bool simulate(std::vector<std::string>& args, const std::string& engineRoot, std::string& err);
bool discoverEntry(std::vector<std::string>& args, std::string& err);

/** `zinc help [command]`, `zinc --help`, `zinc <command> --help`: the text on stdout, exit code 0; an unknown command: stderr, 2. */
int help(const std::vector<std::string>& args);
/** The first bare `zinc` of a person at a terminal (stdin and stdout, no CI): a greeting, the choice of the five languages, saved in
 *  config.json with the version that welcomed, then the three steps to start. False, with nothing printed, in every other case. */
bool welcome(const std::string& version);
/** The three steps to start and the links to learn (the welcome, and `zinc --next-steps` for install.sh and install.ps1). */
void nextSteps();
/** A command that does not exist, or arguments no command takes: the closest command and `zinc help` on stderr; returns 2. */
int unknownCommand(const std::string& name);

/** `zinc init <dir> [--template game|cli|server|iot|remarkable]`: a project that `zinc run` runs. */
int init(const std::vector<std::string>& args, const std::string& engineRoot);

/** Your settings ($ZINC_HOME/config.json, shared with Zinc Atelier): one string value, "" when it is not set; saving keeps the keys
 *  this zinc does not know, and an empty value removes the key. */
std::string settingsFile();
std::string setting(const std::string& key);
bool saveSetting(const std::string& key, const std::string& value);
/** `zinc config [get <key> | set <key> <value> | unset <key>]`: the settings a person changes by hand (lang). */
int config(const std::vector<std::string>& args);

/** `zinc doctor`: the engine, this machine's renderer, the pinned tools it downloads on first use, the host tools and the plugins. `renderer` is the lines main() already prints. */
// `details`: the full report (every pinned tool with its hash, every plugin without a prebuilt library: tests and scripts read it); else the short, coloured check-up.
int doctor(const std::string& engineRoot, const std::string& rendererLines, bool details, const std::string& version);

/** `zinc capture <entry|dir> [--frames 1,60] [--every n] [--out dir]`: the program headless and deterministic, its frames as PNG files. (`capture --scene` is the scene replay.) */
int capture(const std::vector<std::string>& args);
/** `zinc bench [entry|dir] [--frames n]`: the frame timings (p50 / p99 / max per phase) of a program run headless. */
int bench(const std::vector<std::string>& args);
/** `zinc export [entry|dir] [--target linux|rpi|rpi1|rmpp|macos|<zig target>] [-o dir]`: dist/<name>-<target>/ with the executable, run.sh and README.txt (macOS: the .app too). */
int exportApp(const std::vector<std::string>& args, const std::string& engineRoot = "");
// zinc compat, zinc ui (ZN-155): the checkout's Node tools.
int compat(const std::vector<std::string>& args, const std::string& engineRoot);
// zinc publish --itch / --site (ZN-325): dist/ to itch.io through butler (--dry-run prints the commands), a static download page.
int publishStore(const std::vector<std::string>& args);
/** `zinc deploy [entry|dir] --target T --device user@host [--dir path] [--print]`: export, copy with scp and start over ssh; --print (or ZINC_DEPLOY_DRY=1) only prints the commands. */
int deploy(const std::vector<std::string>& args);
/** `zinc add <git-url[@ref] | archive URL> [dir]`: the plugin into <dir>/plugins/<name>, its commit or sha256 in zinc.json "lock" (ZN-328.01). */
int addPlugin(const std::vector<std::string>& args, const std::string& engineRoot = "");
/** `zinc install [dir]`: every plugin of zinc.json "lock" fetched again at its pinned commit or checked against its pinned sha256. */
int installPlugins(const std::vector<std::string>& args, const std::string& engineRoot = "");
/** A warning on stderr for each plugin of the project's zinc.lock that the last index refresh revoked (ZN-345); run by `zinc run`. */
void warnRevoked(const std::string& projectDir);
/** `zinc remove <plugin> [dir]` and `zinc plugins update [plugin...]` (ZN-347). */
int removePlugin(const std::vector<std::string>& args);
int updatePlugins(const std::vector<std::string>& args, const std::string& engineRoot);
/** `zinc trust <plugin> [dir]`: forget a community plugin's pinned publisher key (ZN-340.02). */
int trustPlugin(const std::vector<std::string>& args);
/** `zinc index-sign <metadata.json> <seed-hex>...` and `zinc index-get <repository-url> <cache-dir> [target-path]`: TUF metadata of the plugin index (ZN-336.02). */
int indexSign(const std::vector<std::string>& args);
int indexGet(const std::vector<std::string>& args);
/** `zinc plugins search [word]`: the plugins and templates of the signed index (ZN-336.03). */
int indexSearch(const std::vector<std::string>& args, const std::string& engineRoot);
/** `zinc tsconfig [dir]`: tsconfig.json for the editor, with the engine's lib. */
int tsconfig(const std::vector<std::string>& args, const std::string& engineRoot);
/** `zinc infer <entry|dir>`: the places where gradual typing could not infer a type (Z0109), by file and line. */
int infer(const std::vector<std::string>& args);

/** Where `zinc dev --device <d>` runs the program instead of this machine (ZN-729.03; src/agent/dev.cpp fills it, main hands it over). */
struct DevRemote {
  /** Packs the project of `dir`, sends the device what changed since the last start and starts it there with `args`. `over`: the files
   *  the device holds stay beside it (the red box over the project: its window, and nothing to send again at the fix). False with the
   *  compiler's diagnostics, or the reason, in `out`. */
  std::function<bool(const std::string& dir, const std::vector<std::string>& args, bool over, std::string& out)> start;
  /** The messages of an asset reload (src/host/assets_host.h) for the version that runs there; false when none runs. */
  std::function<bool(const std::string& messages)> assets;
  /** Prints what the program wrote since the last call; false once the device is gone. */
  std::function<bool()> poll;
};
/** `zinc dev [entry|dir] [--no-devtools] [-- args]`: runs the program, watches the project, and on every save checks it and restarts it (the new version on screen in ~0.2 s with the interpreter).
 *  A compile error stops the program and puts a red-box program on the screen with the diagnostics; the next good save replaces it. UI programs get the Chrome DevTools inspector (port 9229).
 *  A save under the assets directory of a project that packs them swaps the rebuilt entries into the running version over its dev socket instead (ZN-450).
 *  With `remote` the program runs on a paired device: each save packs it, and the pack's diagnostics are the check. */
int dev(const std::vector<std::string>& args, const DevRemote* remote = nullptr);
/** `zinc monitor [file | --port /dev/tty... [--baud n] | --udp port]`: telemetry JSON lines (zinc:telemetry) from stdin, a file, a serial port or UDP, one readable line each; other lines pass through. */
int monitor(const std::vector<std::string>& args);

/** `zinc assets build [dir] [--target T] [--release]` (ZN-434): the packs and report.json of a project's assets; `zinc assets info [dir]
 *  [--target T]` (ZN-435): the asset profile and budgets in force on each target (targets/capabilities.json under zinc.json). */
int assets(const std::vector<std::string>& args, const std::string& engineRoot);
/** The asset build of the project in `dir` (zinc pack, build and export call it): <dir>/build/assets/<target>, the release profile compressing
 *  the packs. True with nothing done when the project has no assets directory; `summary` gets the line zinc assets build prints. */
/** The entry of the project in `dir` with the inspector in front, as zinc dev runs it (and --inspect of pack, export and zinc device deploy): a file in
 *  build/.zinc-dev that imports 'zinc:devtools', then `entry`. A project that never names zinc:ui has nothing to inspect: `entry` itself. */
std::string inspectEntry(const std::string& dir, const std::string& entry);
bool buildAssets(const std::string& dir, const std::string& target, bool release, std::string& err, std::string* summary = nullptr);
/** What zinc:assets needs to run the project in `dir` on `target` (ZN-436): `ram`, the ram budget zinc.json and targets/capabilities.json put
 *  in force there (0: none); `packs`, when zinc.json has asset groups and `build`, the directory of its dev packs, built now (empty otherwise). */
bool assetRun(const std::string& dir, const std::string& target, const std::string& engineRoot, bool build, std::string& packs, std::uint64_t& ram, std::string& err);
/** zinc.json `splash` in force on `target` (targets.<id>.splash replaces the project's), its image path made absolute (ZN-446). */
zn::assets::Splash splashFor(const zn::frontend::Project& p, const std::string& projectDir, const std::string& target);
/** The loader stage (ZN-447) of `entry` compiled for `target`, as Zinc source: zinc.json `loading` with its screen (`bar` and `default` from the
 *  zinc:loader plugin, or the project's module); none unless the project declares `loading` and `entry` is its entry. */
zn::frontend::LoaderStage loaderStageFor(const zn::frontend::Project& p, const std::string& projectDir, const std::string& entry, const std::string& target);
/** Where the asset build keeps its artifacts (~/.zinc/cache/assets; empty under ZINC_NO_CACHE), and the engine's build its keys name. */
std::string assetCacheDir();
std::string engineBuild();

}  // namespace zn::cli
