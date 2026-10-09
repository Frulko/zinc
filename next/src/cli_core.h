#pragma once
// The command line beyond the compiler (ZN-138, audit 01 table D): bare `zinc run|build|check` in a project, `zinc help [command]`, `zinc init <dir> [--template t]`, `zinc doctor`.
#include <string>
#include <vector>

namespace zn::cli {

/** `zinc run|build|check` with no entry (or only options): the project of the working directory supplies it (zinc.json "entry", else src/main.ts[x]).
 *  Rewrites `args` in place to the form the compiler commands take; false with `err` set when there is no project. Other commands are left alone. */
bool discoverEntry(std::vector<std::string>& args, std::string& err);

/** `zinc help [command]`, `zinc --help`, `zinc <command> --help`: the text on stdout, exit code 0; an unknown command: stderr, 2. */
int help(const std::vector<std::string>& args);

/** `zinc init <dir> [--template game|cli|server|iot|remarkable]`: a project that `zinc run` runs. */
int init(const std::vector<std::string>& args, const std::string& engineRoot);

/** `zinc doctor`: the engine, this machine's renderer, the pinned tools it downloads on first use, the host tools and the plugins. `renderer` is the lines main() already prints. */
int doctor(const std::string& engineRoot, const std::string& rendererLines);

/** `zinc capture <entry|dir> [--frames 1,60] [--every n] [--out dir]`: the program headless and deterministic, its frames as PNG files. (`capture --scene` is the scene replay.) */
int capture(const std::vector<std::string>& args);
/** `zinc bench [entry|dir] [--frames n]`: the frame timings (p50 / p99 / max per phase) of a program run headless. */
int bench(const std::vector<std::string>& args);
/** `zinc export [entry|dir] [--target linux|rpi|rpi1|rmpp|macos|<zig target>] [-o dir]`: dist/<name>-<target>/ with the executable, run.sh and README.txt (macOS: the .app too). */
int exportApp(const std::vector<std::string>& args, const std::string& engineRoot = "");
/** `zinc deploy [entry|dir] --target T --device user@host [--dir path] [--print]`: export, copy with scp and start over ssh; --print (or ZINC_DEPLOY_DRY=1) only prints the commands. */
int deploy(const std::vector<std::string>& args);
/** `zinc tsconfig [dir]`: tsconfig.json for the editor, with the engine's lib. */
int tsconfig(const std::vector<std::string>& args, const std::string& engineRoot);
/** `zinc infer <entry|dir>`: the places where gradual typing could not infer a type (Z0109), by file and line. */
int infer(const std::vector<std::string>& args);

/** `zinc dev [entry|dir] [--no-devtools] [-- args]`: runs the program, watches the project, and on every save checks it and restarts it (the new version on screen in ~0.2 s with the interpreter).
 *  A compile error stops the program and puts a red-box program on the screen with the diagnostics; the next good save replaces it. UI programs get the Chrome DevTools inspector (port 9229). */
int dev(const std::vector<std::string>& args);
/** `zinc monitor [file | --port /dev/tty... [--baud n] | --udp port]`: telemetry JSON lines (zinc:telemetry) from stdin, a file, a serial port or UDP, one readable line each; other lines pass through. */
int monitor(const std::vector<std::string>& args);

}  // namespace zn::cli
