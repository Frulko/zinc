#include "cli_core.h"

#include <cstdio>
#include <cstring>
#include <ctime>
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>
#include <arpa/inet.h>
#include <csignal>
#include <chrono>
#include <fcntl.h>
#include <netinet/in.h>
#include <poll.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <termios.h>
#include <thread>
#include <tuple>
#include <unistd.h>

#include "assets/assets.h"
#include "frontend/diagnostics.h"
#include "frontend/plugin_manifest.h"
#include "frontend/project.h"
#include "zn/devproto.h"
#include "zapp.h"
#include "yyjson.h"
#include "tc/tc.h"
#include "tc/plugin_build.h"
#include "zpk/zpk.h"
#include "tc/policy.h"
#include "tc/tlog.h"
#include "tc/tuf.h"

namespace fs = std::filesystem;

namespace zn::cli {
namespace {

struct Command { const char* name; const char* usage; const char* summary; const char* detail; };
const Command kCommands[] = {
  {"run", "zinc run [entry|dir] [--interp|--native] [--profile P] [--har file] [--target esp32 ...] [-- args]", "run a program or project",
   "Compiles the entry (a .ts/.tsx/.js file, or a project directory: zinc.json \"entry\", else src/main.ts[x]) and runs it. With no entry it runs the project of the working directory.\n"
   "A program that draws is compiled to native code, as zinc build does, and the executable is cached (~/.zinc/cache/run): the first run of a version compiles, the next ones start at once.\n"
   "  --interp                interpret instead (starts at once; zinc dev and the test runs, ZINC_HEADLESS / ZINC_DETERMINISTIC, interpret too)\n"
   "  --native                compile even a headless or deterministic run\n"
   "  --profile <name>        a target profile (macos, linux, sim, wasm, rpi1, rmpp, esp32, ps1, ps2, psp, vita, n3ds, chip, pocketchip): numbers, heap and typing of that target\n"
   "  --har <file>            write every network request of the run (fetch, WebSocket, MQTT, TCP) as a HAR 1.2 file when the program ends\n"
   "  --engine quickjs        plain JavaScript on QuickJS-ng (chosen by itself for a .js or .mjs entry, or by zinc.json \"engine\")\n  --target esp32 [--port P | --device CMD | --qemu] [--boot-ms N] [--log]   run on the board or the emulator\n  --force                 run although zinc.json \"requires\" is not met\n"
   "Environment: ZINC_HEADLESS=1 (no window), ZINC_FRAMES=n, ZINC_SHOT=file.png, ZINC_DETERMINISTIC=1."},
  {"debug", "zinc debug [entry|dir] [-- args] | zinc debug --dap | zinc debug --cdp[=port] entry", "run a program under the debugger",
   "Compiles a debug build (every call keeps its frame, each statement and each local is known) and runs it in the interpreter, paused at its first statement.\n"
   "Commands on standard input: b [file:]line [if cond] (break at the first line with code there), log [file:]line message {expr}, d n (delete), c (continue),\n"
   "n (next: over calls), s (step into), o (step out), bt (the stack with lines), locals [frame], closure [frame], globals, p expr, watch expr,\n"
   "catch [uncaught|all|none], q (quit). The standard library and the plugins run without stops. Without a terminal\n"
   "the commands are echoed, so a session can be scripted: zinc debug app.ts < commands.txt.\n"
   "--dap: the Debug Adapter Protocol on standard input and output, the program named by the launch request (VS Code: lib/editor/vscode-zinc-debug).\n"
   "--cdp[=port]: Chrome DevTools' Sources panel on 127.0.0.1:port (9222, in chrome://inspect's default list); the program starts paused when DevTools attaches.\n"
   "A compiled program debugs in lldb: zinc build --debug."},
  {"build", "zinc build [entry|dir] [-o out] [--target T] [--bundle] [--debug]", "compile to a native program",
   "Compiles to C++ and builds an executable (out defaults to build/<project name>). --debug: a debug build for lldb (-g -O0, #line to the .ts lines, locals under their names, functions named after the Zinc ones). --target aarch64-linux|armhf-linux|armv7-linux|x86_64-linux|aarch64-macos|x86_64-macos cross builds with the pinned zig (no Docker); --target x86_64-windows builds a console program (-o name.exe; no window or plugin yet); --bundle makes a macOS .app."},
  {"check", "zinc check [entry|dir]", "type check without running", "Parses and checks the entry and what it imports; prints the diagnostics (zinc explain <code> describes one). Exit 1 on errors."},
  {"test", "zinc test [--profile P] [--runner interp|aot|quickjs|esp32-qemu|devicesim] [dir]", "run the test files of a project", "Runs the *.test.ts / test-*.ts files and the conformance programs against their goldens: those of dir, else of the project in the current directory, else the engine's tests/conformance."},
  {"new", "zinc new [template|path|git-url|gh:user/repo[@ref]] <dir> | zinc new --list", "create a project from a template", "Copies templates/<template>/ ({{name}}, {{id}} and {{ident}} filled in the files and their names; or a template directory, or a git repository cloned at its default branch or @ref, its commit recorded in zinc.json \"template\"; nothing of the template is run) (zinc.json, sources, assets, tests, README) into a new or empty directory, filling {{name}} and {{id}}, and writes tsconfig.json for this machine. Default template: game; --list prints the templates with their targets. zinc new plugin <dir>: a plugin repository to publish (docs/plugins.md, \"Plugin starter\")."},
  {"pack", "zinc pack [dir] [-o app.zapp]", "one runnable file per app", "Writes build/<name>.zapp: a deterministic ustar with the compiled program, its baked fonts and images, its assets and zinc.json, every file listed with its SHA-256 in manifest.json (and a signature slot). zinc run app.zapp checks and runs it (docs/zapp.md)."},
  {"assets", "zinc assets build|info [dir] [--target T] [--release]", "build the asset packs", "zinc assets info prints the asset profile (texture formats, max size, audio codecs, pack codec) and the budgets in force on each target: targets/capabilities.json, then zinc.json assets.profiles, targets.<id>.assets and assets.budgets. zinc assets build imports every file of the project's assets directory (zinc.json assets.dir; its assets.rules and assets.groups choose importers and packs) (images to premultiplied RGBA, texture rules to the GPU formats of the target's profile through basisu, the rest copied as is) and writes one ZPK pack per group with report.json (each asset's importer, group, source and output bytes, time) into build/assets/<target> (default: this machine). Artifacts are kept by content in ~/.zinc/cache/assets, so a second build of an unchanged project runs no importer and a changed file is imported alone. --release compresses the packs with the target's codec (zstd, lz4 on the Pi) and encodes textures (a dev build makes rgba8). zinc pack and zinc build do it for this machine, zinc export (release) for its target (docs/reports/zinc-next-assets.md)."},
  {"fuse", "zinc fuse app.zapp [-o app]", "one executable per app", "Appends the .zapp to this engine: the result runs the app on a machine without zinc, its arguments going to the app (LOVE's fused mode). This machine's target only for now (ZN-392); zinc export builds with the AOT."},
  {"publish", "zinc publish [dir] --key <seed-hex> [--channel stable|beta] [--notes text] [-o dir] | [--itch user/game[:suffix]] [--site dir] [--dry-run]", "publish an app update, to itch.io or a download page", "Packs the app (zinc pack) and writes <channel>.manifest beside it, signed with the app's Ed25519 key (zinc update-keygen; its public key is zinc.json update.publicKey). Serve the directory at zinc.json update.url. --itch pushes every export directory of dist/ with itch.io's butler (pinned, fetched and checked once; channels mac, linux-arm64, linux-rpi..., html5, plus -suffix); --dry-run prints the butler commands and uploads nothing. --site writes a static download page: one button per artifact of dist/ (export directories as .tar.gz, .dmg, .deb, .zapp) with its size and SHA-256, and SHA256SUMS."},
  {"update-app", "zinc update-app [dir] [--check] [--channel C] [--url U]", "update an app from its channel", "Fetches the channel manifest of zinc.json update (or of --url), verifies its signature with the app's key, refuses an older version, downloads the .zapp and checks its SHA-256 (into ~/.zinc/apps/<id>/updates). --check exits 10 when an update exists."},
  {"init", "zinc init <dir> [--template name]", "create a project (zinc new)", "zinc new with the template given by --template (default game)."},
  {"doctor", "zinc doctor", "check the machine", "Prints the engine, this machine's renderer tier, the pinned tools zinc downloads on first use (with their SHA-256 and whether they are installed), the host tools and the plugins."},
  {"toolchain", "zinc toolchain install|path|esptool|basisu|targets|sha256 <file>", "the pinned cross toolchain", "install: download and verify zig into ~/.zinc; basisu: the texture encoder of the asset build (its pinned sources built once with that zig); targets: the cross targets."},
  {"explain", "zinc explain <code>", "describe a diagnostic", "Prints the text of a diagnostic code such as Z0101."},
  {"flash", "zinc flash --target esp32 [--port P]", "flash the ESP32 core firmware", "Uses the pinned esptool."},
  {"update", "zinc update [--check] [manifest-url]", "look for a newer release", "Downloads and verifies a signed manifest's package."},
  {"plugins", "zinc plugins [project-dir] [--defines <plugin> [target]] | zinc plugins search [word] | zinc plugins update [plugin...]", "the plugin table, the index", "Lists the plugins visible to a project and where they run. search: the plugins and templates of the signed index whose name or description has the word, one line each (kind, name and version, targets, description). update: each dependency added by name moves to the highest version its range (name@^1.2, ~1.2, >=1.2, 1.2) allows, checked like zinc add; one line per plugin that moved."},
  {"capture", "zinc capture <entry|dir> [--frames 1,60] [--every n] [--out dir] [--size WxH]", "a program's frames as PNG", "Runs the program headless and deterministic and writes ZINC_SHOT frames (frame-<n>.png) into --out (default shots/). zinc capture --scene replays a scene dump instead."},
  {"bench", "zinc bench [entry|dir] [--frames n]", "frame timings of a program", "Runs headless for n frames (default 120) and prints p50 / p99 / max per phase (app, layout, paint, raster...)."},
  {"export", "zinc export [entry|dir] [--target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp|macos|wasm|esp32] [-o dir] [--deb] [--dmg] [--key <seed-hex>]", "package a program", "dist/<name>-<target>/: the executable (cross built with the pinned zig for another target), run.sh, README.txt, assets/, a .desktop file (Linux) or the .app (macOS); wasm: a static site (index.html, app.js, app.wasm, app.zbc, serve.py); esp32: core.bin, app.bin and flash.sh. --deb also writes dist/<name>_<version>_<arch>.deb (Linux targets; reproducible, written without dpkg); --dmg dist/<name>-<version>.dmg with the .app and an Applications link (macos; the .app needs zinc.json app.id). The .app is signed ad hoc, or by zinc.json \"signing\": { \"identity\", \"keychain\", \"notaryProfile\" } with the hardened runtime and the entitlements of \"permissions\"; the notarization commands are printed. --key (or ZINC_UPDATE_SEED) writes <file>.sig, an Ed25519 signature, beside the executable and the .deb or .dmg: zinc verify checks them."},
  {"add", "zinc add <name | git-url[@ref] | gh:user/repo[@ref] | archive URL> [dir]", "add a plugin from the index, git or an archive", "A name (name@range: ^1.2, ~1.2, >=1.2, 1.2) is looked up in the signed index, the highest version the range allows: its tier (official, or verified for a publisher the index delegates to) and publisher are printed first. Fetches the plugin (git: at its default branch or @ref; an archive: file:// or https://, .tar.gz, .tgz or .tar) into plugins/<name>, records it in zinc.json \"dependencies\" and pins it in zinc.lock: the commit or the archive's sha256, the version and the capabilities plugin.json \"permissions\" asks for (an update asking for a new one is refused until --accept). --key <public key>: the archive's <url>.sig must verify with it, and the key is locked too. Nothing of the plugin is run; links and special files are refused. What each tier guarantees, and what a mirror can and cannot do: docs/guide/08-security.md, \"Plugin distribution: threat model and guarantees\"."},
  {"sign", "zinc sign <file> <seed-hex>", "sign a plugin archive", "Writes <file>.sig: the detached Ed25519 signature (128 hex digits) that zinc add --key <public key> checks. zinc update-keygen makes a key pair."},
  {"plugin-build", "zinc plugin-build <plugin> [project] [--target T] [--pack file.tar | --prebuild]", "build a plugin's native part", "Compiles the plugin's native code with the pinned zig into ~/.zinc/cache/<target>/plugins/<name>-<key> (or finds it there) and prints where; the key is the one every client computes for the same sources, options and target. --pack writes it as a deterministic archive: the binaries/<target>/<name>-<key>.tar a plugin index serves (next/tools/plugin-pack names it). --prebuild copies it into the plugin's prebuilt/<target>/. --target cross-builds it for a Linux target (aarch64-linux, armhf-linux, armv7-linux, x86_64-linux)."},
  {"update-keygen", "zinc update-keygen", "make a signing key pair", "Prints seed=<64 hex digits>, the Ed25519 secret that signs (zinc sign, zinc publish --key, zinc export --key: keep it secret, for example as a CI secret), and public=<64 hex digits>, the key that checks (plugin.json publisher.publicKey, zinc.json update.publicKey, zinc add --key, zinc verify --key)."},
  {"compat", "zinc compat [--suite wpt,test262,node,quickjs] [--engines next,next-qjs,...] [--filter text] [--check]", "standards conformance", "Runs the pinned external suites (WPT, test262, quickjs-ng's tests, a Node API set) through this zinc (engines next and next-qjs by default) and the reference engines found, and writes docs/reports/zinc-next-compat.md: the harness of the checkout, tests/compat/run.mjs (needs Node)."},
  {"ui", "zinc ui check|code|import|pack|serve <design.zui.json|zip|project> [--out path] [--port 7331]", "Figma designs to Zinc UI", "zinc-ui/1 documents from the Figma plugin (integrations/figma): check validates one, code prints the generated UI, import writes a project, pack makes a .zui.zip, serve pairs a project with the plugin. The tools of the checkout (compiler/src/ui-tools.ts, needs Node)."},
  {"verify", "zinc verify <file> [--key <public-hex>]", "check a signed artifact", "Checks <file>.sig (zinc sign, zinc export --key) against the key, by default zinc.json update.publicKey of the project above the file; exit 1 when the file or the signature changed."},
  {"remove", "zinc remove <plugin> [dir]", "remove a plugin", "Deletes plugins/<plugin> and drops it from zinc.json \"dependencies\" and zinc.lock."},
  {"trust", "zinc trust <plugin> [dir]", "accept a community plugin's new key", "A community plugin's publisher key (plugin.json publisher.publicKey, checked against the archive's .sig) is pinned in zinc.json \"lock\" on first use; an archive signed with another key is refused. zinc trust forgets the pinned key, so the next zinc add pins the new one."},
  {"install", "zinc install [--offline] [--frozen] [dir]", "fetch the locked plugins", "Fetches every plugin of zinc.lock into plugins/<name> again (a zinc.json dependency not locked yet is added; --frozen refuses when zinc.json and zinc.lock disagree): git at the pinned commit, archives checked against the pinned sha256 (a changed archive is refused). What was fetched once is kept in ~/.zinc/cache/sources by content; --offline (or ZINC_OFFLINE=1) uses only that and names what is missing."},
  {"deploy", "zinc deploy [entry|dir] --target T --device user@host [--dir path] [--print]", "export and start on a device", "Exports, copies with scp and starts with ssh. --print (or ZINC_DEPLOY_DRY=1) prints the three commands and runs nothing."},
  {"tsconfig", "zinc tsconfig [dir]", "editor configuration", "Writes tsconfig.json with the engine's lib so an editor understands zinc:* modules."},
  {"infer", "zinc infer <entry|dir>", "where gradual typing could not infer", "Lists the Z0109 sites (a parameter or variable whose type is unknown) with file and line."},
  {"dev", "zinc dev [entry|dir] [--no-devtools] [-- args]", "run, watch, restart on save", "Runs the program and watches the project: on every save it type checks and restarts the program (~0.2 s). A compile error puts a red box with the diagnostics on the screen until the next good save. UI programs get the Chrome DevTools inspector (chrome://inspect, localhost:9229; another port: zinc.json plugins.devtools.port or ZINC_DEVTOOLS_PORT). The program restarts from its entry: state is not kept. A save under the assets directory of a project that packs them (zinc.json assets.rules or assets.groups) rebuilds those assets and swaps them into the running program instead (zinc:assets onReload): the program keeps its state."},
  {"monitor", "zinc monitor [file | --port /dev/tty... [--baud n] | --udp port]", "read telemetry", "Prints zinc:telemetry JSON lines (hello, metric, event, state_snapshot) from stdin, a file, a serial port or UDP, one readable line each; other lines pass through."},
  {"lsp", "zinc lsp", "language server", "Speaks LSP over stdio for an editor: diagnostics (the Z codes of zinc check --json), hover with types, completion (members, names in scope, module specifiers), go to definition, document symbols."},
  {"help", "zinc help [command]", "this text", "zinc help lists the commands; zinc help <command> describes one."},
};

const Command* findCommand(const std::string& n) { for (const Command& c : kCommands) if (n == c.name) return &c; return nullptr; }

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
  pid_t pid = fork();
  if (pid < 0) return -1;
  if (pid == 0) {
    if (quiet) { int fd = open("/dev/null", O_WRONLY); if (fd >= 0) { dup2(fd, 1); dup2(fd, 2); } }
    std::vector<char*> a;
    for (const std::string& x : argv) a.push_back(const_cast<char*>(x.c_str()));
    a.push_back(nullptr);
    execvp(a[0], a.data());
    _exit(127);
  }
  int st = 0;
  while (waitpid(pid, &st, 0) < 0 && errno == EINTR) {}
  return WIFEXITED(st) ? WEXITSTATUS(st) : -1;
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
  int fd[2];
  if (pipe(fd) != 0) return "cannot read the commit";
  pid_t pid = fork();
  if (pid == 0) { dup2(fd[1], 1); close(fd[0]); execlp("git", "git", "-C", into.c_str(), "rev-parse", "HEAD", static_cast<char*>(nullptr)); _exit(127); }
  close(fd[1]);
  char buf[128]; ssize_t k = read(fd[0], buf, sizeof buf - 1); close(fd[0]);
  int st = 0; waitpid(pid, &st, 0);
  commit = k > 0 ? std::string(buf, static_cast<std::size_t>(k)) : "";
  while (!commit.empty() && (commit.back() == '\n' || commit.back() == '\r')) commit.pop_back();
  if (commit.size() != 40) return "cannot read the commit of " + url;
  dir = into;
  source = url + (ref.empty() ? "" : "@" + ref);
  return "";
}
std::vector<TemplateInfo> listTemplates(const std::string& engineRoot) {
  std::vector<TemplateInfo> out;
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / ".." / "templates", ec)) {
    TemplateInfo t;
    if (fs::exists(e.path() / "template.json", ec) && readTemplateInfo(e.path(), t).empty()) { t.name = e.path().filename().string(); out.push_back(t); }
  }
  std::sort(out.begin(), out.end(), [](const TemplateInfo& x, const TemplateInfo& y) { return x.name < y.name; });
  return out;
}
void printTemplates(std::FILE* to, const std::vector<TemplateInfo>& ts) {
  for (const TemplateInfo& t : ts) {
    std::string targets;
    for (const std::string& x : t.targets) targets += (targets.empty() ? "" : ", ") + x;
    std::fprintf(to, "  %-12s %s (%s)\n", t.name.c_str(), t.description.c_str(), targets.c_str());
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
#if defined(__APPLE__)
  const char* host = "macos";
#else
  const char* host = "linux";
#endif
  // ponytail: no engine root here, so a board file's plugins.devtools is not read; pass the root when a board sets the port
  for (const zn::frontend::PluginOption& o : zn::frontend::pluginOptions(devtools, fs::path(pf).parent_path().string(), "", host))
    if (o.key == "port" && !o.cpp.empty() && o.cpp.find_first_not_of("0123456789") == std::string::npos) return o.cpp;
  return "";
}

}  // namespace

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
    if (cmd != "run" || named || engine == "zinc" || (engine != "quickjs" && ext != ".js" && ext != ".mjs")) return;
    args.insert(args.begin() + static_cast<std::ptrdiff_t>(at) + 1, {"--engine", "quickjs"});
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
  if (have && !project.engine.empty() && project.engine != "quickjs" && project.engine != "zinc") { err = projDir + "/zinc.json: \"engine\" must be \"quickjs\" or \"zinc\", not \"" + project.engine + "\""; return false; }
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
  if (const Command* c = findCommand(name)) { std::fprintf(stderr, "usage: %s\n(zinc help %s says more)\n", c->usage, c->name); return 2; }
  std::vector<std::string> names;
  for (const Command& c : kCommands) names.push_back(c.name);
  std::string near = zn::frontend::nearest(name, names);
  std::fprintf(stderr, "zinc: unknown command '%s'%s (zinc help lists the commands)\n", name.c_str(), near.empty() ? "" : (": did you mean 'zinc " + near + "'?").c_str());
  return 2;
}

int help(const std::vector<std::string>& args) {
  std::string topic = args.size() >= 3 ? args[2] : "";
  if (topic.empty()) {
    std::puts("zinc: typed TypeScript for apps, games, services and boards\n\nusage: zinc <command> [options]\n");
    for (const Command& c : kCommands) std::printf("  %-10s %s\n", c.name, c.summary);
    std::puts("\nzinc help <command> describes one. In a project directory `zinc run`, `zinc build` and `zinc check` need no argument.\nOther commands for engine work: lex, parse, ir, zbc, bake, profile, mem, device-sim, --version, --emit=cpp|zbc.");
    std::puts("\nWith any command: -v (or --verbose) prints the build phases with their durations, the plugins' cache decisions and the engine at run; -vv more;\n--log-format json one JSON object per line. ZINC_LOG=<module>=<level>,... chooses (modules build, plugin, run, ui; levels info, debug, trace),\ne.g. ZINC_LOG=ui=debug for the layout passes.\nIn a terminal, build and run show their steps (compile, resources, native build, run) with durations and the plugins the program imports\n(zinc: plugins: a, b): -q (or ZINC_STEPS=0) hides them,\nZINC_STEPS=1 shows them when stderr is not a terminal.");
    return 0;
  }
  const Command* c = findCommand(topic);
  if (!c) { std::fprintf(stderr, "zinc: no help for '%s' (zinc help lists the commands)\n", topic.c_str()); return 2; }
  std::printf("usage: %s\n\n%s\n", c->usage, c->detail);
  return 0;
}

static std::string templateFromIndex(const std::string& name, const std::string& engineRoot, std::string& spec, std::string& path, std::string& tier);
static void printIndexTemplates(const std::string& engineRoot);
static std::string policyRefusal(const std::string& tier);

int init(const std::vector<std::string>& args, const std::string& engineRoot) {
  const std::string cmd = args.size() > 1 ? args[1] : "new";   // `zinc init <dir> --template t` is `zinc new [t] <dir>`
  std::string tmpl = "game";
  std::vector<std::string> pos;
  bool list = false, named = false;
  for (std::size_t i = 2; i < args.size(); ++i) {
    if (args[i] == "--template" && i + 1 < args.size()) { tmpl = args[++i]; named = true; }
    else if (args[i].rfind("--template=", 0) == 0) { tmpl = args[i].substr(11); named = true; }
    else if (args[i] == "--list") list = true;
    else if (args[i].rfind("-", 0) != 0) pos.push_back(args[i]);
    else { std::fprintf(stderr, "zinc %s: unknown option %s\nusage: %s\n", cmd.c_str(), args[i].c_str(), findCommand(cmd.c_str())->usage); return 2; }
  }
  const std::vector<TemplateInfo> all = listTemplates(engineRoot);
  if (list) { printTemplates(stdout, all); printIndexTemplates(engineRoot); return 0; }
  if (pos.size() > 2 || (pos.size() == 2 && named)) { std::fprintf(stderr, "usage: %s\n", findCommand(cmd.c_str())->usage); return 2; }
  if (pos.size() == 2) tmpl = pos[0];
  const std::string dir = pos.empty() ? "." : pos.back();
  const TemplateInfo* t = nullptr;
  for (const TemplateInfo& x : all) if (x.name == tmpl) t = &x;
  std::error_code ec;
  bool external = !t && (tmpl.find('/') != std::string::npos || tmpl.find(':') != std::string::npos || tmpl.rfind(".", 0) == 0);
  std::string subdir, tier = t ? "official" : "community";   // the engine's own templates are official; a URL is community (ZN-349)
  if (!t && !external) {   // a name the index knows: its descriptor's source, at its tier
    std::string spec;
    if (templateFromIndex(tmpl, engineRoot, spec, subdir, tier).empty()) { tmpl = spec; external = true; }
  }
  if (const std::string why = policyRefusal(tier); !why.empty()) { std::fprintf(stderr, "zinc %s: template %s: %s\n", cmd.c_str(), tmpl.c_str(), why.c_str()); return 1; }
  if (!t && !external) { std::fprintf(stderr, "zinc %s: unknown template '%s'; choose one of (or a directory or git URL):\n", cmd.c_str(), tmpl.c_str()); printTemplates(stderr, all); return 2; }
  if (fs::exists(dir, ec) && !fs::is_empty(dir, ec)) {
    std::fprintf(stderr, "zinc %s: %s is not empty; give a new or empty directory (zinc new [template] <dir>), templates:\n", cmd.c_str(), dir.c_str());
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
  for (auto it = fs::recursive_directory_iterator(t->dir, ec); ok && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (it->path().filename() == ".git") { it.disable_recursion_pending(); continue; }
    if (it->is_symlink() || !it->is_regular_file() || it->path().filename() == "template.json") continue;
    const fs::path rel = fs::relative(it->path(), t->dir);
    std::ifstream f(it->path(), std::ios::binary);
    std::stringstream ss; ss << f.rdbuf();
    ok = writeFile(root / fillVariables(rel.string(), vars, false), fillVariables(ss.str(), vars, rel.extension() == ".json"));   // names too: deploy/{{id}}.service
  }
  std::string libFiles;
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / ".." / "lib", ec))
    if (e.path().extension() == ".ts" && e.path().filename().string().size() > 5 && e.path().filename().string().rfind(".d.ts") == e.path().filename().string().size() - 5)
      libFiles += (libFiles.empty() ? "" : ",\n    ") + jsonString(fs::weakly_canonical(e.path()).string());
  // the editor configuration names this machine's engine files, so it is written here rather than kept in the template
  ok = ok && writeFile(root / "tsconfig.json", "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\", \"module\": \"ESNext\", \"moduleResolution\": \"Bundler\", \"strict\": true, \"noLib\": true, \"types\": [],\n    \"useUnknownInCatchVariables\": false, \"allowImportingTsExtensions\": true, \"noEmit\": true, \"jsx\": \"preserve\"\n  },\n  \"files\": [\n    " + libFiles + "\n  ],\n  \"include\": [\"src/**/*\", \"*.ts\", \"*.tsx\"]\n}\n");
  if (ok && external) {   // where the project came from: the source and, for git, the pinned commit
    std::ifstream zf(root / "zinc.json");
    std::stringstream zs; zs << zf.rdbuf();
    std::string z = zs.str();
    const std::size_t brace = z.find('{');
    const std::string rec = "\n  \"template\": { \"source\": " + jsonString(source) + (commit.empty() ? "" : ", \"commit\": " + jsonString(commit)) + " },";
    if (brace != std::string::npos) ok = writeFile(root / "zinc.json", z.substr(0, brace + 1) + rec + z.substr(brace + 1));
  }
  if (!ok) { std::fprintf(stderr, "zinc %s: cannot write into %s\n", cmd.c_str(), dir.c_str()); return 1; }
  for (const std::string& plugin : t->plugins)   // the plugins the template needs, pinned in the new zinc.lock (ZN-349)
    if (addPlugin({"zinc", "add", plugin, fs::absolute(dir).string()}, engineRoot) != 0) { std::fprintf(stderr, "zinc %s: the template's plugin %s could not be added\n", cmd.c_str(), plugin.c_str()); return 1; }
  std::printf("created %s (%s); next: cd %s && zinc run\n", dir.c_str(), tmpl.c_str(), dir.c_str());
  return 0;
}

int doctor(const std::string& engineRoot, const std::string& rendererLines) {
  std::printf("zinc-next 0.0.1\nengine files: %s\n\nthis machine\n", engineRoot.c_str());
  std::istringstream is(rendererLines);
  std::string line;
  while (std::getline(is, line)) std::printf("  %s\n", line.c_str());
  std::printf("\npinned tools (downloaded on first use into %s/toolchains, SHA-256 checked before they are unpacked)\n", zn::tc::home().c_str());
  const std::vector<zn::tc::PinnedTool> tools = zn::tc::pinnedTools();
  if (tools.empty()) std::printf("  none pinned for %s: set ZINC_ZIG / ZINC_ESPTOOL / ZINC_QEMU to your own\n", zn::tc::hostName().c_str());
  for (const zn::tc::PinnedTool& t : tools)
    std::printf("  %-20s %-28s %s  %s\n    sha256 %s\n", t.name.c_str(), t.version.c_str(), t.present ? "installed" : "will be downloaded", t.archive.c_str(), t.sha256.c_str());
  std::printf("\nhost tools (only needed to build the engine itself, not to use it)\n");
  for (const char* tool : {"cmake", "c++", "python3", "git", "node"}) {
    std::string cmd = std::string("command -v ") + tool + " >/dev/null 2>&1";
    std::printf("  %-8s %s\n", tool, std::system(cmd.c_str()) == 0 ? "found" : "not found");
  }
  std::printf("\ndisplay: SDL3 is built into the engine (static), no install needed; ZINC_HEADLESS=1 runs without a window\n");
  std::error_code ec;
  int plugins = 0;
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / ".." / "plugins", ec)) if (e.is_directory() && fs::exists(e.path() / "plugin.json")) ++plugins;
  std::printf("plugins: %d in %s/../plugins (zinc plugins lists them with the targets they run on)\n", plugins, engineRoot.c_str());
  {   // ZN-718: which plugins with native code have no prebuilt library. This machine: the key of prebuilt/<target>/ is checked. The other platform: by the
      // manifest alone (a release prebuilds every plugin that names the platform and needs no system library)
    std::vector<std::string> problems;
    const std::vector<zn::frontend::FoundPlugin> found = zn::frontend::discoverPlugins(engineRoot + "/..", ".", problems);
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


// ---- commands that run the engine itself (ZN-140)
namespace {

std::string q(const std::string& s) {   // shell quoting
  std::string o = "'";
  for (char c : s) { if (c == '\'') o += "'\\''"; else o += c; }
  return o + "'";
}
std::string self() { std::string e = zn::tc::executablePath(); return e.empty() ? "zinc" : e; }
int status(int rc) { return rc == -1 ? 1 : WIFEXITED(rc) ? WEXITSTATUS(rc) : 1; }

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

struct ProjectInfo { std::string dir, entry, name, version; };
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
  return true;
}

std::string zigTargetFor(const std::string& t) {
  if (t == "macos") return "";   // the host build
  if (t == "linux" || t == "rpi" || t == "rmpp") return "aarch64-linux";
  if (t == "rpi1") return "armhf-linux";   // ARMv6: the first Pi and the Zero
  if (t == "rpi2" || t == "chip" || t == "pocketchip") return "armv7-linux";   // a 32-bit OS on ARMv7 with NEON (ZN-414)
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
// matched against next/third_party/components.json; the program and the Zinc engine are packages too.
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
  const fs::path repo = fs::path(engineRoot) / "..";
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
      struct stat st;
      if (stat(it->path().c_str(), &st) == 0 && st.st_mtime > t) t = st.st_mtime;
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
  yyjson_mut_arr_add_str(d, creators, "Tool: zinc-0.0.1");
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
  pkg("Zinc", "Zinc runtime", "0.0.1", "NOASSERTION", "https://github.com/Frulko/zinc", "");
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
  Opts o = parseOpts(args, {"--target", "-o", "--key"}, {"--deb", "--dmg"});
  if (o.bad) { std::fprintf(stderr, "zinc export: unknown option %s\nusage: zinc export [entry|dir] [--target linux|rpi|rpi1|rpi2|chip|pocketchip|rmpp|macos|wasm|esp32] [-o dir] [--deb] [--dmg] [--key <seed-hex>]\n", o.badArg.c_str()); return 2; }
  const std::string seed = o.v.count("--key") ? o.v["--key"] : std::getenv("ZINC_UPDATE_SEED") ? std::getenv("ZINC_UPDATE_SEED") : "";   // the artifacts' signatures (ZN-321)
  std::vector<fs::path> artifacts;
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  for (char c : p.name) if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '.' || c == '_' || c == '-')) { std::fprintf(stderr, "zinc export: zinc.json name \"%s\" is not usable in a file name (letters, digits, '.', '_', '-')\n", p.name.c_str()); return 2; }
#if defined(__APPLE__)
  const std::string target = o.v.count("--target") ? o.v["--target"] : "macos";
#else
  const std::string target = o.v.count("--target") ? o.v["--target"] : "linux";
#endif
  const std::string zt = zigTargetFor(target);
  const std::string arch = zt == "aarch64-linux" ? "arm64" : (zt == "armhf-linux" || zt == "armv7-linux") ? "armhf" : zt == "x86_64-linux" ? "amd64" : "";   // Debian's names
  if (has(o, "--deb") && arch.empty()) { std::fprintf(stderr, "zinc export: --deb is for the Linux targets (linux, rpi, rpi1, rpi2, chip, pocketchip, rmpp)\n"); return 2; }
  if (has(o, "--dmg") && target != "macos") { std::fprintf(stderr, "zinc export: --dmg is for the macos target\n"); return 2; }
  fs::path out = o.v.count("-o") ? fs::path(o.v["-o"]) : fs::path(p.dir) / "dist" / (p.name + "-" + target);
  std::error_code ec;
  fs::remove_all(out, ec);
  fs::create_directories(out, ec);
  if (!buildAssets(p.dir, target, true, err)) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }   // the release packs, build/assets/<target> (ZN-434)
  if (target == "wasm") return exportWasm(p, out, engineRoot);
  if (target == "esp32") return exportEsp32(p, out, engineRoot);
  // the argument orders of the two build commands: `build <file> -o <out>` for this machine, `build --target <t> <file> -o <out>` for another
  const std::string cmd = zt.empty() ? "ZINC_COMPONENTS=1 " + q(self()) + " build " + q(p.entry) + " -o " + q((out / p.name).string())   // ZINC_COMPONENTS: what it links, for the SBOM
                                     : "ZINC_COMPONENTS=1 " + q(self()) + " build --target " + q(zt) + " " + q(p.entry) + " -o " + q((out / p.name).string());
  int rc = status(std::system(cmd.c_str()));
  if (rc != 0) { std::fprintf(stderr, "zinc export: the build failed\n"); return rc; }
  if (fs::exists(fs::path(p.dir) / "assets")) fs::copy(fs::path(p.dir) / "assets", out / "assets", fs::copy_options::recursive, ec);
  writeFile(out / "run.sh", "#!/bin/sh\ncd \"$(dirname \"$0\")\" || exit 1\nexec ./" + p.name + " \"$@\"\n");
  fs::permissions(out / "run.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  writeFile(out / "README.txt", p.name + " " + p.version + " (" + target + ") built with Zinc.\nRun: ./run.sh\nThe executable is self-contained: the fonts and images are baked in; assets/ holds the files the program reads at run time.\n");
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
  const fs::path js = fs::path(engineRoot) / ".." / script;
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
int ui(const std::vector<std::string>& args, const std::string& engineRoot) {
  std::vector<std::string> rest{"ui"};
  rest.insert(rest.end(), args.begin() + 2, args.end());
  return nodeTool(engineRoot, "compiler/bin/zinc.mjs", rest, "ui");
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
static void printIndexTemplates(const std::string& engineRoot) {
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
    if (name.empty()) continue;
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

int deploy(const std::vector<std::string>& args) {
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
  if (!dry) { int rc = exportApp(ex); if (rc != 0) return rc; }
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
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / ".." / "lib", ec)) {
    const std::string f = e.path().filename().string();
    if (f.size() > 5 && f.compare(f.size() - 5, 5, ".d.ts") == 0) libFiles += (libFiles.empty() ? "" : ",\n    ") + jsonString(fs::weakly_canonical(e.path()).string());
  }
  if (!writeFile(fs::path(dir) / "tsconfig.json", "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\", \"module\": \"ESNext\", \"moduleResolution\": \"Bundler\", \"strict\": true, \"noLib\": true, \"types\": [],\n    \"useUnknownInCatchVariables\": false, \"allowImportingTsExtensions\": true, \"noEmit\": true, \"jsx\": \"preserve\"\n  },\n  \"files\": [\n    " + libFiles + "\n  ],\n  \"include\": [\"src/**/*\", \"*.ts\", \"*.tsx\"]\n}\n")) { std::fprintf(stderr, "zinc tsconfig: cannot write %s/tsconfig.json\n", dir.c_str()); return 1; }
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

pid_t spawnSelf(const std::vector<std::string>& args, const std::vector<std::pair<std::string, std::string>>& env, const std::string& cwd) {
  pid_t pid = fork();
  if (pid != 0) return pid;
  setpgid(0, 0);
  for (const auto& kv : env) setenv(kv.first.c_str(), kv.second.c_str(), 1);
  if (!cwd.empty() && chdir(cwd.c_str()) != 0) _exit(127);
  std::vector<std::string> a = args;
  std::vector<char*> av;
  for (std::string& x : a) av.push_back(x.data());
  av.push_back(nullptr);
  execv(av[0], av.data());
  _exit(127);
}
void killChild(pid_t& pid) {
  if (pid <= 0) return;
  kill(-pid, SIGTERM);
  for (int i = 0; i < 25; ++i) { int st; if (waitpid(pid, &st, WNOHANG) == pid) { pid = 0; return; } usleep(10000); }
  kill(-pid, SIGKILL);
  int st; waitpid(pid, &st, 0);
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
    struct stat st;
    if (stat(it->path().c_str(), &st) != 0) continue;
#if defined(__APPLE__)
    const long long mt = static_cast<long long>(st.st_mtimespec.tv_sec) * 1000000000LL + st.st_mtimespec.tv_nsec;
#else
    const long long mt = static_cast<long long>(st.st_mtim.tv_sec) * 1000000000LL + st.st_mtim.tv_nsec;
#endif
    s[it->path().string()] = {mt, static_cast<long long>(st.st_size)};
  }
  return s;
}
bool projectUsesUi(const fs::path& dir) {
  std::error_code ec;
  for (fs::recursive_directory_iterator it(dir, fs::directory_options::skip_permission_denied, ec), end; it != end; it.increment(ec)) {
    if (ec) break;
    const std::string name = it->path().filename().string();
    if (it->is_directory(ec)) { if (name == "build" || name == "dist" || name == "node_modules" || name == ".git") it.disable_recursion_pending(); continue; }
    const std::string ext = it->path().extension().string();
    if (ext != ".ts" && ext != ".tsx") continue;
    std::ifstream f(it->path());
    std::stringstream ss; ss << f.rdbuf();
    if (ss.str().find("zinc:ui") != std::string::npos) return true;
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
bool reloadAssets(const std::string& dir, const Stamps& was, const Stamps& is, int fd, Clock::time_point t0) {
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
  for (std::size_t at = 0; at < msg.size();) {
    const ssize_t n = write(fd, msg.data() + at, msg.size() - at);
    if (n < 0 && errno != EINTR) return false;
    if (n > 0) at += static_cast<std::size_t>(n);
  }
  std::fprintf(stderr, "zinc dev: %s rebuilt and sent (%ld ms after the save)\n", names.c_str(), msSince(t0));
  return true;
}

std::string redBoxSource(const std::vector<std::string>& lines) {
  std::string arr = "[";
  for (std::size_t i = 0; i < lines.size() && i < 16; ++i) arr += (i ? "," : "") + jsonString(lines[i].substr(0, 90));
  arr += "]";
  return "import { onFrame, clear, rect, text, width } from 'zinc:gfx';\n// zinc dev: the red box of a compile error; the next save that compiles replaces it\nconst lines: string[] = " + arr + ";\n"
         "onFrame((dt: number) => {\n  clear(0x3b0a0a);\n  rect(0, 0, width(), 22, 0xdc2626);\n  text(6, 7, 'ZINC  COMPILE ERROR', 0xffffff, 1);\n  for (let i = 0; i < lines.length; i++) text(6, 32 + i * 12, lines[i], 0xfecaca, 1);\n});\n";
}

}  // namespace

int dev(const std::vector<std::string>& args) {
  setenv("ZINC_RUN", "interp", 1);   // the restarts interpret: a save restarts in 0.2 s, a compiled run would rebuild (ZN-398)
  std::vector<std::string> own, rest;
  bool noTools = false;
  for (std::size_t i = 0; i < args.size(); ++i) {
    if (args[i] == "--") { rest.assign(args.begin() + i, args.end()); break; }
    if (args[i] == "--no-devtools") noTools = true; else own.push_back(args[i]);
  }
  Opts o = parseOpts(own, {}, {});
  if (o.bad) { std::fprintf(stderr, "zinc dev: unknown option %s\nusage: zinc dev [entry|dir] [--no-devtools] [-- args]\n", o.badArg.c_str()); return 2; }
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  const fs::path devDir = fs::path(p.dir) / "build" / ".zinc-dev";
  std::error_code ec;
  fs::create_directories(devDir, ec);
  std::string runEntry = p.entry;
  const bool tools = !noTools && projectUsesUi(p.dir);
  if (tools) {   // the inspector: the same program with `import 'zinc:devtools'` in front
    runEntry = (devDir / "main.ts").string();
    writeFile(runEntry, "import 'zinc:devtools';\nimport " + jsonString(fs::relative(p.entry, devDir, ec).string()) + ";\n");
  }
  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);
  std::signal(SIGPIPE, SIG_IGN);   // a version that exited closed its dev socket: the write fails and the save restarts it
  const std::string exe = self();
  std::vector<std::pair<std::string, std::string>> env = {{"ZINC_SHOT_DIR", (fs::path(p.dir) / "build" / "shots").string()}, {"ZINC_DEV", "1"}};
  fs::create_directories(fs::path(p.dir) / "build" / "shots", ec);
  pid_t child = 0;
  int version = 0, devFd = -1;   // devFd: our end of the running version's dev socket (asset hot reload)
  auto startProgram = [&](long sinceSave, bool redbox, const std::vector<std::string>& msg) {
    killChild(child);
    if (devFd >= 0) { close(devFd); devFd = -1; }
    std::vector<std::string> cmd = {exe, "run", redbox ? (devDir / "redbox.ts").string() : runEntry};
    if (!redbox) cmd.insert(cmd.end(), rest.begin(), rest.end());
    if (redbox) writeFile(devDir / "redbox.ts", redBoxSource(msg));
    auto childEnv = env;
    int sv[2] = {-1, -1};
    if (!redbox && socketpair(AF_UNIX, SOCK_STREAM, 0, sv) == 0) {
      fcntl(sv[0], F_SETFD, FD_CLOEXEC);
      const timeval wait{2, 0};   // a version that stopped reading costs a save 2 s, then a restart
      const int room = 4 << 20;   // an atlas page in one write
      setsockopt(sv[0], SOL_SOCKET, SO_SNDTIMEO, &wait, sizeof wait);
      setsockopt(sv[0], SOL_SOCKET, SO_SNDBUF, &room, sizeof room);
      setsockopt(sv[1], SOL_SOCKET, SO_RCVBUF, &room, sizeof room);
      childEnv.push_back({"ZINC_DEV_FD", std::to_string(sv[1])});
    }
    child = spawnSelf(cmd, childEnv, p.dir);
    if (sv[1] >= 0) { close(sv[1]); devFd = sv[0]; }
    if (!redbox) ++version;
    if (redbox) std::fprintf(stderr, "zinc dev: red box on screen (%ld ms after the save)\n", sinceSave);
    else {
      const std::string port = devtoolsPort(p.dir);
      std::fprintf(stderr, "zinc dev: v%d started%s (%ld ms after the save)%s\n", version, tools ? (" with the inspector on port " + (port.empty() ? "9229" : port)).c_str() : "", sinceSave, "");
    }
    std::fflush(stderr);
  };
  Stamps seen = snapshot(p.dir);
  startProgram(0, false, {});
  while (!gStop) {
    usleep(40000);
    int st;
    if (child > 0 && waitpid(child, &st, WNOHANG) == child) { std::fprintf(stderr, "zinc dev: program exited (%d), waiting for changes...\n", WIFEXITED(st) ? WEXITSTATUS(st) : -1); child = 0; }
    Stamps now = snapshot(p.dir);
    if (now == seen) continue;
    const auto t0 = Clock::now();
    usleep(30000);   // an editor writes a file in several steps: take the settled state
    now = snapshot(p.dir);
    const Stamps was = seen;
    seen = now;
    if (child > 0 && devFd >= 0 && reloadAssets(p.dir, was, now, devFd, t0)) continue;
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
  std::string buf;
  char chunk[4096];
  bool regular = false;
  { struct stat st; regular = fstat(fd, &st) == 0 && S_ISREG(st.st_mode); }
  while (!gStop) {
    pollfd pfd{fd, POLLIN, 0};
    int n = regular ? 1 : poll(&pfd, 1, 200);
    if (n < 0) { if (errno == EINTR) continue; break; }
    if (n == 0) continue;
    ssize_t r = read(fd, chunk, sizeof chunk);
    if (r == 0) { if (regular || file.empty()) { if (regular) break; if (!port.empty()) { usleep(100000); continue; } break; } }
    if (r < 0) { if (errno == EAGAIN || errno == EINTR) { usleep(20000); continue; } break; }
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
  if (__host_loopReal() !== 0) {   // a load shorter than a frame shows no loader; a deterministic turn waits for its jobs instead
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
  if (!zn::frontend::assetProfiles(proj, readAll(fs::path(zn::tc::sourceRoot(ZN_SOURCE_DIR)) / ".." / "targets" / "capabilities.json"), rows, err)) return false;
  for (const auto& t : rows) if (t.target == target) o.targetProfile = t.keys;
  o.basisu = [](std::string& path, std::string& e) { return zn::tc::ensureBasisu(path, e); };
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
  if (!zn::frontend::assetProfiles(proj, readAll(fs::path(engineRoot) / ".." / "targets" / "capabilities.json"), rows, err)) return false;
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
  for (const std::string& w : proj.warnings) std::fprintf(stderr, "zinc assets: %s: %s\n", (project / "zinc.json").c_str(), w.c_str());
  std::vector<zn::frontend::TargetAssets> rows;
  if (!zn::frontend::assetProfiles(proj, readAll(fs::path(engineRoot) / ".." / "targets" / "capabilities.json"), rows, err)) { std::fprintf(stderr, "zinc assets: %s\n", err.c_str()); return 1; }
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
  const char* usage = "usage: zinc assets build [dir] [--target T] [--release]\n       zinc assets info [dir] [--target T]\n";
  if (args.size() < 3 || (args[2] != "build" && args[2] != "info")) { std::fprintf(stderr, "%s", usage); return 2; }
  std::vector<std::string> rest(args.begin() + 1, args.end());   // parseOpts reads from the third word: the one after the subcommand
  Opts o = parseOpts(rest, {"--target"}, {"--release"});
  if (o.bad) { std::fprintf(stderr, "zinc assets: unknown option %s\n%s", o.badArg.c_str(), usage); return 2; }
  const fs::path project = fs::absolute(o.entry.empty() ? "." : o.entry).lexically_normal();
  if (args[2] == "info") return assetsInfo(project, o.v.count("--target") ? o.v["--target"] : "", engineRoot);
#if defined(__APPLE__)
  const std::string target = o.v.count("--target") ? o.v["--target"] : "macos";
#else
  const std::string target = o.v.count("--target") ? o.v["--target"] : "linux";
#endif
  zn::frontend::Project proj;
  std::string err, line;
  if (!readProject(project, proj, err)) { std::fprintf(stderr, "zinc assets: %s\n", err.c_str()); return 2; }
  std::error_code ec;
  if (!fs::is_directory(project / proj.assets.dir, ec) && !splashFor(proj, project.string(), target).on) { std::fprintf(stderr, "zinc assets: %s has no %s directory\n", project.c_str(), proj.assets.dir.c_str()); return 2; }
  if (!buildAssets(project.string(), target, has(o, "--release"), err, &line)) { std::fprintf(stderr, "zinc assets: %s\n", err.c_str()); return 1; }
  std::printf("%s\n", line.c_str());
  return 0;
}

}  // namespace zn::cli
