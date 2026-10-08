#include "cli_core.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <map>
#include <sstream>

#include "frontend/project.h"
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
  {"test", "zinc test [--profile P] [--runner interp|aot|quickjs|esp32-qemu|devicesim] [dir]", "run the test files of a project", "Runs the *.test.ts / test-*.ts files and the conformance programs against their goldens."},
  {"init", "zinc init <dir> [--template game|cli|server|iot|remarkable]", "create a project", "Writes zinc.json, src/main.ts[x], assets/, tsconfig.json, .gitignore and a README into an empty directory. Default template: game."},
  {"doctor", "zinc doctor", "check the machine", "Prints the engine, this machine's renderer tier, the pinned tools zinc downloads on first use (with their SHA-256 and whether they are installed), the host tools and the plugins."},
  {"toolchain", "zinc toolchain install|path|esptool|targets|sha256 <file>", "the pinned cross toolchain", "install: download and verify zig into ~/.zinc; targets: the cross targets."},
  {"capture", "zinc capture --scene <dump> <entry> -o <png> | --bench N T | --damage <dump>", "replay a scene dump", "Renders a ZINC_SCENE_DUMP through the software raster (see docs/reports/ui-rendering-architecture.md)."},
  {"explain", "zinc explain <code>", "describe a diagnostic", "Prints the text of a diagnostic code such as Z0101."},
  {"flash", "zinc flash --target esp32 [--port P]", "flash the ESP32 core firmware", "Uses the pinned esptool."},
  {"update", "zinc update [--check] [manifest-url]", "look for a newer release", "Downloads and verifies a signed manifest's package."},
  {"plugins", "zinc plugins [project-dir] [--defines <plugin> [target]]", "the plugin table", "Lists the plugins visible to a project and where they run."},
  {"help", "zinc help [command]", "this text", "zinc help lists the commands; zinc help <command> describes one."},
};

const Command* findCommand(const std::string& n) { for (const Command& c : kCommands) if (n == c.name) return &c; return nullptr; }

// ---- init templates (the prototype's, compiler/src/tools.ts)
struct Template { const char* name; const char* entry; const char* source; };
const Template kTemplates[] = {
  {"game", "src/main.ts", R"(import { onFrame, clear, rect, text, width, height, isDown, Btn } from 'zinc:gfx';

let x = width() / 2, y = height() / 2;
onFrame((dt: number) => {
  if (isDown(Btn.Left)) x -= 120 * dt;
  if (isDown(Btn.Right)) x += 120 * dt;
  if (isDown(Btn.Up)) y -= 120 * dt;
  if (isDown(Btn.Down)) y += 120 * dt;
  clear(0x101820);
  rect(x - 8, y - 8, 16, 16, 0xfeca57);
  text(4, 4, 'arrows to move', 0xffffff, 1);
});
)"},
  {"cli", "src/main.ts", R"(import * as sys from 'zinc:sys';

const args = sys.args();
console.log(`hello from ${sys.platform()}`, args);
)"},
  {"server", "src/main.ts", R"(import { serve, Request, Reply } from 'zinc:net';
import * as telemetry from 'zinc:telemetry';

let hits = 0;
telemetry.expose('hits', () => hits);
serve(3000, (req: Request): Reply => {
  hits++;
  return { status: 200, contentType: 'application/json', body: JSON.stringify({ path: req.path, hits }) };
});
console.log('listening on http://localhost:3000');
)"},
  {"iot", "src/main.ts", R"(import * as gpio from 'zinc:gpio';
import { send } from 'zinc:osc';

gpio.setup(17, 'out', 'none');
gpio.setup(27, 'in', 'up');
gpio.watch(27, 'falling', 20, (e: gpio.PinEdge) => {
  gpio.write(17, 1);
  send('127.0.0.1', 9000, '/button', [e.pin, e.timestampMs]);
  console.log('button', e.pin);
});
console.log('waiting for the button on pin 27 (ZINC_GPIO_SCRIPT="27:0@500" simulates a press)');
)"},
  {"remarkable", "src/main.tsx", R"(import { createSignal, render } from 'zinc:ui/solid';
import { Ink, InkCanvas } from 'zinc:ink';

const ink = new Ink();
const [strokes, setStrokes] = createSignal<i32>(0);

function App(): i32 {
  return <view class="flex-col h-full bg-white">
    <view class="flex-row items-center gap-6 p-6">
      <text class="text-[48px] font-bold text-black">My app</text>
      <button class="px-6 py-4 rounded-lg border-2 border-black bg-white focus:bg-white" onClick={() => { ink.undo(); setStrokes(ink.strokes.length); }}>
        <text class="text-[34px] text-black">Undo</text>
      </button>
      <text class="text-[34px] text-gray-600">{strokes()} stroke(s)</text>
    </view>
    <view class="h-[3px] bg-black"></view>
    <InkCanvas ink={ink} class="grow" />
  </view>;
}

render(App, 0xffffff, (dt: number) => { if (ink.strokes.length !== strokes()) setStrokes(ink.strokes.length); });
)"},
};

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
  std::string dir = ".", tmpl = "game";
  for (std::size_t i = 2; i < args.size(); ++i) {
    if (args[i] == "--template" && i + 1 < args.size()) tmpl = args[++i];
    else if (args[i].rfind("--template=", 0) == 0) tmpl = args[i].substr(11);
    else if (args[i].rfind("-", 0) != 0) dir = args[i];
    else { std::fprintf(stderr, "zinc init: unknown option %s\nusage: %s\n", args[i].c_str(), findCommand("init")->usage); return 2; }
  }
  const Template* t = nullptr;
  for (const Template& x : kTemplates) if (tmpl == x.name) t = &x;
  if (!t) {
    std::string all;
    for (const Template& x : kTemplates) all += (all.empty() ? "" : ", ") + std::string(x.name);
    std::fprintf(stderr, "zinc init: unknown template '%s' (%s)\n", tmpl.c_str(), all.c_str());
    return 2;
  }
  std::error_code ec;
  if (fs::exists(dir, ec) && !fs::is_empty(dir, ec)) { std::fprintf(stderr, "zinc init: %s is not empty\n", dir.c_str()); return 1; }
  const std::string name = fs::path(fs::absolute(dir).lexically_normal()).filename().string().empty() ? "app" : fs::path(fs::absolute(dir).lexically_normal()).filename().string();
  std::string libFiles;
  for (const auto& e : fs::directory_iterator(fs::path(engineRoot) / ".." / "lib", ec))
    if (e.path().extension() == ".ts" && e.path().filename().string().size() > 5 && e.path().filename().string().rfind(".d.ts") == e.path().filename().string().size() - 5)
      libFiles += (libFiles.empty() ? "" : ",\n    ") + jsonString(fs::weakly_canonical(e.path()).string());
  fs::path root(dir);
  bool ok = writeFile(root / "zinc.json", "{\n  \"name\": " + jsonString(name) + ",\n  \"entry\": " + jsonString(t->entry) + ",\n  \"assets\": \"assets\",\n  \"targets\": {}\n}\n");
  ok = ok && writeFile(root / t->entry, t->source);
  ok = ok && writeFile(root / "assets/.gitkeep", "");
  ok = ok && writeFile(root / ".gitignore", "build/\ndist/\nnode_modules/\n");
  ok = ok && writeFile(root / "tsconfig.json", "{\n  \"compilerOptions\": {\n    \"target\": \"ES2022\", \"module\": \"ESNext\", \"moduleResolution\": \"Bundler\", \"strict\": true, \"noLib\": true, \"types\": [],\n    \"useUnknownInCatchVariables\": false, \"allowImportingTsExtensions\": true, \"noEmit\": true, \"jsx\": \"preserve\"\n  },\n  \"files\": [\n    " + libFiles + "\n  ],\n  \"include\": [\"src/**/*\", \"*.ts\", \"*.tsx\"]\n}\n");
  ok = ok && writeFile(root / "README.md", "# " + name + "\n\nA Zinc app (" + tmpl + " template).\n\n```sh\nzinc run     # compile and run\nzinc build   # native executable in build/\nzinc check   # type check\n```\n");
  if (!ok) { std::fprintf(stderr, "zinc init: cannot write into %s\n", dir.c_str()); return 1; }
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

}  // namespace zn::cli
