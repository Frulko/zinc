#include "cli_core.h"

#include <cstdio>
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
#include <unistd.h>

#include "frontend/project.h"
#include "zapp.h"
#include "yyjson.h"
#include "tc/tc.h"

namespace fs = std::filesystem;

namespace zn::cli {
namespace {

struct Command { const char* name; const char* usage; const char* summary; const char* detail; };
const Command kCommands[] = {
  {"run", "zinc run [entry|dir] [--profile P] [--target esp32 ...] [-- args]", "run a program or project",
   "Compiles the entry (a .ts/.tsx/.js file, or a project directory: zinc.json \"entry\", else src/main.ts[x]) and runs it. With no entry it runs the project of the working directory.\n"
   "  --profile <name>        a target profile (macos, linux, sim, wasm, rpi1, rmpp, esp32, ps1, ps2): numbers, heap and typing of that target\n"
   "  --engine quickjs        plain JavaScript on QuickJS-ng\n  --target esp32 [--port P | --device CMD | --qemu] [--boot-ms N] [--log]   run on the board or the emulator\n  --force                 run although zinc.json \"requires\" is not met\n"
   "Environment: ZINC_HEADLESS=1 (no window), ZINC_FRAMES=n, ZINC_SHOT=file.png, ZINC_DETERMINISTIC=1."},
  {"build", "zinc build [entry|dir] [-o out] [--target T] [--bundle]", "compile to a native program",
   "Compiles to C++ and builds an executable (out defaults to build/<project name>). --target aarch64-linux|armhf-linux|x86_64-linux|aarch64-macos|x86_64-macos cross builds with the pinned zig (no Docker); --bundle makes a macOS .app."},
  {"check", "zinc check [entry|dir]", "type check without running", "Parses and checks the entry and what it imports; prints the diagnostics (zinc explain <code> describes one). Exit 1 on errors."},
  {"test", "zinc test [--profile P] [--runner interp|aot|quickjs|esp32-qemu|devicesim] [dir]", "run the test files of a project", "Runs the *.test.ts / test-*.ts files and the conformance programs against their goldens: those of dir, else of the project in the current directory, else the engine's tests/conformance."},
  {"new", "zinc new [template|path|git-url|gh:user/repo[@ref]] <dir> | zinc new --list", "create a project from a template", "Copies templates/<template>/ ({{name}} and {{id}} filled in the files and their names; or a template directory, or a git repository cloned at its default branch or @ref, its commit recorded in zinc.json \"template\"; nothing of the template is run) (zinc.json, sources, assets, tests, README) into a new or empty directory, filling {{name}} and {{id}}, and writes tsconfig.json for this machine. Default template: game; --list prints the templates with their targets."},
  {"pack", "zinc pack [dir] [-o app.zapp]", "one runnable file per app", "Writes build/<name>.zapp: a deterministic ustar with the compiled program, its baked fonts and images, its assets and zinc.json, every file listed with its SHA-256 in manifest.json (and a signature slot). zinc run app.zapp checks and runs it (docs/zapp.md)."},
  {"fuse", "zinc fuse app.zapp [-o app]", "one executable per app", "Appends the .zapp to this engine: the result runs the app on a machine without zinc, its arguments going to the app (LOVE's fused mode). This machine's target only for now (ZN-392); zinc export builds with the AOT."},
  {"init", "zinc init <dir> [--template name]", "create a project (zinc new)", "zinc new with the template given by --template (default game)."},
  {"doctor", "zinc doctor", "check the machine", "Prints the engine, this machine's renderer tier, the pinned tools zinc downloads on first use (with their SHA-256 and whether they are installed), the host tools and the plugins."},
  {"toolchain", "zinc toolchain install|path|esptool|targets|sha256 <file>", "the pinned cross toolchain", "install: download and verify zig into ~/.zinc; targets: the cross targets."},
  {"explain", "zinc explain <code>", "describe a diagnostic", "Prints the text of a diagnostic code such as Z0101."},
  {"flash", "zinc flash --target esp32 [--port P]", "flash the ESP32 core firmware", "Uses the pinned esptool."},
  {"update", "zinc update [--check] [manifest-url]", "look for a newer release", "Downloads and verifies a signed manifest's package."},
  {"plugins", "zinc plugins [project-dir] [--defines <plugin> [target]]", "the plugin table", "Lists the plugins visible to a project and where they run."},
  {"capture", "zinc capture <entry|dir> [--frames 1,60] [--every n] [--out dir] [--size WxH]", "a program's frames as PNG", "Runs the program headless and deterministic and writes ZINC_SHOT frames (frame-<n>.png) into --out (default shots/). zinc capture --scene replays a scene dump instead."},
  {"bench", "zinc bench [entry|dir] [--frames n]", "frame timings of a program", "Runs headless for n frames (default 120) and prints p50 / p99 / max per phase (app, layout, paint, raster...)."},
  {"export", "zinc export [entry|dir] [--target linux|rpi|rpi1|rmpp|macos] [-o dir] [--deb] [--dmg]", "package a program", "dist/<name>-<target>/: the executable (cross built with the pinned zig for another target), run.sh, README.txt, assets/, a .desktop file (Linux) or the .app (macOS). --deb also writes dist/<name>_<version>_<arch>.deb (Linux targets; reproducible, written without dpkg); --dmg dist/<name>-<version>.dmg with the .app and an Applications link (macos; the .app needs zinc.json app.id)."},
  {"deploy", "zinc deploy [entry|dir] --target T --device user@host [--dir path] [--print]", "export and start on a device", "Exports, copies with scp and starts with ssh. --print (or ZINC_DEPLOY_DRY=1) prints the three commands and runs nothing."},
  {"tsconfig", "zinc tsconfig [dir]", "editor configuration", "Writes tsconfig.json with the engine's lib so an editor understands zinc:* modules."},
  {"infer", "zinc infer <entry|dir>", "where gradual typing could not infer", "Lists the Z0109 sites (a parameter or variable whose type is unknown) with file and line."},
  {"dev", "zinc dev [entry|dir] [--no-devtools] [-- args]", "run, watch, restart on save", "Runs the program and watches the project: on every save it type checks and restarts the program (~0.2 s). A compile error puts a red box with the diagnostics on the screen until the next good save. UI programs get the Chrome DevTools inspector (chrome://inspect, localhost:9229). The program restarts from its entry: state is not kept."},
  {"monitor", "zinc monitor [file | --port /dev/tty... [--baud n] | --udp port]", "read telemetry", "Prints zinc:telemetry JSON lines (hello, metric, event, state_snapshot) from stdin, a file, a serial port or UDP, one readable line each; other lines pass through."},
  {"lsp", "zinc lsp", "language server", "Speaks LSP over stdio for an editor: diagnostics (the Z codes of zinc check --json), hover with types, completion (members, names in scope, module specifiers), go to definition, document symbols."},
  {"help", "zinc help [command]", "this text", "zinc help lists the commands; zinc help <command> describes one."},
};

const Command* findCommand(const std::string& n) { for (const Command& c : kCommands) if (n == c.name) return &c; return nullptr; }

// ---- templates (ZN-315): templates/<name>/ beside lib/, any files, described by template.json
struct TemplateInfo { std::string name, description, entry; std::vector<std::string> tags, targets; fs::path dir; };
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
    static const std::vector<std::string> known = {"name", "description", "tags", "targets", "entry", "variables"};
    std::size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(r, i, n, k, v) if (std::find(known.begin(), known.end(), yyjson_get_str(k)) == known.end() && err.empty()) err = std::string("template.json: unknown key \"") + yyjson_get_str(k) + "\"";
    t.dir = dir;
    t.name = dir.filename().string();
    if (const char* nm = yyjson_get_str(yyjson_obj_get(r, "name"))) t.name = nm;
    if (const char* d = yyjson_get_str(yyjson_obj_get(r, "description"))) t.description = d;
    if (const char* en = yyjson_get_str(yyjson_obj_get(r, "entry"))) t.entry = en;
    t.tags = jsonStrings(yyjson_obj_get(r, "tags"));
    t.targets = jsonStrings(yyjson_obj_get(r, "targets"));
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
  if (spec.rfind("gh:", 0) == 0) {
    std::string repo = spec.substr(3);
    const std::size_t at = repo.find('@');
    if (at != std::string::npos) { ref = repo.substr(at + 1); repo = repo.substr(0, at); }
    url = "https://github.com/" + repo + ".git";
  }
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

}  // namespace

bool discoverEntry(std::vector<std::string>& args, std::string& err) {
  if (args.size() < 2 || (args[1] != "run" && args[1] != "build" && args[1] != "check")) return true;
  const std::string cmd = args[1];
  // the position of the entry: the first argument after the command that is not an option (`--profile esp32` takes its value)
  std::size_t at = 2;
  while (at < args.size() && args[at].rfind("-", 0) == 0 && args[at] != "--") {
    const std::string& a = args[at];
    at += (a == "--profile" || a == "--engine" || a == "--target" || a == "-o" || a == "--port" || a == "--device" || a == "--boot-ms") && at + 1 < args.size() ? 2 : 1;
  }
  const bool hasEntry = at < args.size() && args[at] != "--";
  std::string entry = hasEntry ? args[at] : ".";
  std::error_code ec;
  std::string dirArg = entry;
  if (hasEntry && !fs::is_directory(entry, ec)) {
    if (cmd == "build") {   // a file: `-o` is optional too
      bool hasOut = false;
      for (const std::string& a : args) hasOut = hasOut || a == "-o";
      if (!hasOut) { fs::create_directories("build", ec); args.insert(args.begin() + at + 1, {"-o", "build/" + fs::path(entry).stem().string()}); }
    } else if (cmd == "check" && (at == 2 || args[2].rfind("--", 0) != 0)) args.insert(args.begin() + 2, "--check");
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
  if (cmd == "run") { if (hasEntry) args[at] = projDir; else args.insert(args.begin() + at, projDir); }
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

int help(const std::vector<std::string>& args) {
  std::string topic = args.size() >= 3 ? args[2] : "";
  if (topic.empty()) {
    std::puts("zinc: typed TypeScript for apps, games, services and boards\n\nusage: zinc <command> [options]\n");
    for (const Command& c : kCommands) std::printf("  %-10s %s\n", c.name, c.summary);
    std::puts("\nzinc help <command> describes one. In a project directory `zinc run`, `zinc build` and `zinc check` need no argument.\nOther commands for engine work: lex, parse, ir, zbc, bake, profile, mem, device-sim, --version, --emit=cpp|zbc.");
    return 0;
  }
  const Command* c = findCommand(topic);
  if (!c) { std::fprintf(stderr, "zinc: no help for '%s' (zinc help lists the commands)\n", topic.c_str()); return 2; }
  std::printf("usage: %s\n\n%s\n", c->usage, c->detail);
  return 0;
}

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
  if (list) { printTemplates(stdout, all); return 0; }
  if (pos.size() > 2 || (pos.size() == 2 && named)) { std::fprintf(stderr, "usage: %s\n", findCommand(cmd.c_str())->usage); return 2; }
  if (pos.size() == 2) tmpl = pos[0];
  const std::string dir = pos.empty() ? "." : pos.back();
  const TemplateInfo* t = nullptr;
  for (const TemplateInfo& x : all) if (x.name == tmpl) t = &x;
  std::error_code ec;
  const bool external = !t && (tmpl.find('/') != std::string::npos || tmpl.find(':') != std::string::npos || tmpl.rfind(".", 0) == 0);
  if (!t && !external) { std::fprintf(stderr, "zinc %s: unknown template '%s'; choose one of (or a directory or git URL):\n", cmd.c_str(), tmpl.c_str()); printTemplates(stderr, all); return 2; }
  if (fs::exists(dir, ec) && !fs::is_empty(dir, ec)) {
    std::fprintf(stderr, "zinc %s: %s is not empty; give a new or empty directory (zinc new [template] <dir>), templates:\n", cmd.c_str(), dir.c_str());
    printTemplates(stderr, all);
    return 1;
  }
  const std::string name = fs::path(fs::absolute(dir).lexically_normal()).filename().string().empty() ? "app" : fs::path(fs::absolute(dir).lexically_normal()).filename().string();
  std::string id;
  for (char c : name) id += std::isalnum(static_cast<unsigned char>(c)) ? static_cast<char>(std::tolower(static_cast<unsigned char>(c))) : '-';
  const std::map<std::string, std::string> vars{{"name", name}, {"id", id}};
  // a template from a directory or a git URL (ZN-316): fetched into a scratch directory, its template.json checked; nothing of it is run
  TemplateInfo ext;
  std::string source, commit;
  struct Scratch { fs::path p; ~Scratch() { std::error_code e; if (!p.empty()) fs::remove_all(p, e); } } scratch;
  if (external) {
    scratch.p = fs::temp_directory_path(ec) / ("zinc-template-" + std::to_string(getpid()));
    fs::remove_all(scratch.p, ec);
    fs::path tdir;
    std::string err = fetchTemplate(tmpl, scratch.p, tdir, source, commit);
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
  if (t == "rpi1") return "armhf-linux";
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

int exportApp(const std::vector<std::string>& args) {
  Opts o = parseOpts(args, {"--target", "-o"}, {"--deb", "--dmg"});
  if (o.bad) { std::fprintf(stderr, "zinc export: unknown option %s\nusage: zinc export [entry|dir] [--target linux|rpi|rpi1|rmpp|macos] [-o dir] [--deb] [--dmg]\n", o.badArg.c_str()); return 2; }
  ProjectInfo p; std::string err;
  if (!resolveProject(o.entry, p, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  for (char c : p.name) if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '.' || c == '_' || c == '-')) { std::fprintf(stderr, "zinc export: zinc.json name \"%s\" is not usable in a file name (letters, digits, '.', '_', '-')\n", p.name.c_str()); return 2; }
#if defined(__APPLE__)
  const std::string target = o.v.count("--target") ? o.v["--target"] : "macos";
#else
  const std::string target = o.v.count("--target") ? o.v["--target"] : "linux";
#endif
  const std::string zt = zigTargetFor(target);
  const std::string arch = zt == "aarch64-linux" ? "arm64" : zt == "armhf-linux" ? "armhf" : zt == "x86_64-linux" ? "amd64" : "";   // Debian's names
  if (has(o, "--deb") && arch.empty()) { std::fprintf(stderr, "zinc export: --deb is for the Linux targets (linux, rpi, rpi1, rmpp)\n"); return 2; }
  if (has(o, "--dmg") && target != "macos") { std::fprintf(stderr, "zinc export: --dmg is for the macos target\n"); return 2; }
  fs::path out = o.v.count("-o") ? fs::path(o.v["-o"]) : fs::path(p.dir) / "dist" / (p.name + "-" + target);
  std::error_code ec;
  fs::remove_all(out, ec);
  fs::create_directories(out, ec);
  // the argument orders of the two build commands: `build <file> -o <out>` for this machine, `build --target <t> <file> -o <out>` for another
  const std::string cmd = zt.empty() ? q(self()) + " build " + q(p.entry) + " -o " + q((out / p.name).string())
                                     : q(self()) + " build --target " + q(zt) + " " + q(p.entry) + " -o " + q((out / p.name).string());
  int rc = status(std::system(cmd.c_str()));
  if (rc != 0) { std::fprintf(stderr, "zinc export: the build failed\n"); return rc; }
  if (fs::exists(fs::path(p.dir) / "assets")) fs::copy(fs::path(p.dir) / "assets", out / "assets", fs::copy_options::recursive, ec);
  writeFile(out / "run.sh", "#!/bin/sh\ncd \"$(dirname \"$0\")\" || exit 1\nexec ./" + p.name + " \"$@\"\n");
  fs::permissions(out / "run.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  writeFile(out / "README.txt", p.name + " " + p.version + " (" + target + ") built with Zinc.\nRun: ./run.sh\nThe executable is self-contained: the fonts and images are baked in; assets/ holds the files the program reads at run time.\n");
  if (target == "linux" || target == "rpi" || target == "rpi1" || target == "rmpp")
    writeFile(out / (p.name + ".desktop"), "[Desktop Entry]\nType=Application\nName=" + p.name + "\nExec=" + p.name + "\nTerminal=false\nCategories=Utility;\n");
  if (target == "macos") {
    std::string bcmd = q(self()) + " build --bundle " + q(p.entry) + " -o " + q((out / (p.name + ".app")).string());
    if (status(std::system(bcmd.c_str())) != 0) std::fprintf(stderr, "zinc export: the .app bundle could not be made (the plain executable is in %s)\n", out.string().c_str());
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
  }
  if (has(o, "--deb")) {   // a Debian package of the export (ZN-320.01)
    const fs::path deb = out.parent_path() / (p.name + "_" + p.version + "_" + arch + ".deb");
    if (!writeDeb(out, p.name, p.version, arch, deb, err)) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
    std::printf("%s\n", deb.string().c_str());
  }
  std::printf("%s\n", out.string().c_str());
  return 0;
}

int deploy(const std::vector<std::string>& args) {
  Opts o = parseOpts(args, {"--target", "--device", "--dir"}, {"--print"});
  if (o.bad) { std::fprintf(stderr, "zinc deploy: unknown option %s\nusage: zinc deploy [entry|dir] --target linux|rpi|rpi1|rmpp --device user@host [--dir path] [--print]\n", o.badArg.c_str()); return 2; }
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

std::string redBoxSource(const std::vector<std::string>& lines) {
  std::string arr = "[";
  for (std::size_t i = 0; i < lines.size() && i < 16; ++i) arr += (i ? "," : "") + jsonString(lines[i].substr(0, 90));
  arr += "]";
  return "import { onFrame, clear, rect, text, width } from 'zinc:gfx';\n// zinc dev: the red box of a compile error; the next save that compiles replaces it\nconst lines: string[] = " + arr + ";\n"
         "onFrame((dt: number) => {\n  clear(0x3b0a0a);\n  rect(0, 0, width(), 22, 0xdc2626);\n  text(6, 7, 'ZINC  COMPILE ERROR', 0xffffff, 1);\n  for (let i = 0; i < lines.length; i++) text(6, 32 + i * 12, lines[i], 0xfecaca, 1);\n});\n";
}

}  // namespace

int dev(const std::vector<std::string>& args) {
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
  const std::string exe = self();
  std::vector<std::pair<std::string, std::string>> env = {{"ZINC_SHOT_DIR", (fs::path(p.dir) / "build" / "shots").string()}, {"ZINC_DEV", "1"}};
  fs::create_directories(fs::path(p.dir) / "build" / "shots", ec);
  pid_t child = 0;
  int version = 0;
  auto startProgram = [&](long sinceSave, bool redbox, const std::vector<std::string>& msg) {
    killChild(child);
    std::vector<std::string> cmd = {exe, "run", redbox ? (devDir / "redbox.ts").string() : runEntry};
    if (!redbox) cmd.insert(cmd.end(), rest.begin(), rest.end());
    if (redbox) writeFile(devDir / "redbox.ts", redBoxSource(msg));
    child = spawnSelf(cmd, env, p.dir);
    if (!redbox) ++version;
    if (redbox) std::fprintf(stderr, "zinc dev: red box on screen (%ld ms after the save)\n", sinceSave);
    else std::fprintf(stderr, "zinc dev: v%d started%s (%ld ms after the save)%s\n", version, tools ? " with the inspector on port 9229" : "", sinceSave, "");
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
    seen = now;
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

}  // namespace zn::cli
