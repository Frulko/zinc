// zinc on the mquickjs firmware of the ESP32 (cli_mqjs.h, firmware/esp32-mquickjs/README.md). The program is prepared on the computer: zinc
// bundle links it as for --engine quickjs (the same transform, zinc:gfx's QuickJS module, esbuild), the pinned SWC lowers it to the ES5 that
// mquickjs parses, js/prelude.js adds the library methods mquickjs lacks, zinc-mqjs (the host mquickjs, built beside zinc) runs it for a few
// frames against the board's host calls (js/sim.js) inside the board's heap, then compiles it to 32-bit bytecode. Only that goes to the board,
// into the js partition the firmware runs at start-up.
#include "cli_mqjs.h"

#include <algorithm>
#include <atomic>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <set>
#include <sstream>
#include <thread>

#include <unistd.h>
#ifndef _WIN32
#include <arpa/inet.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <signal.h>
#include <spawn.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/wait.h>
extern char** environ;
#else
static int setenv(const char* name, const char* value, int) { return _putenv_s(name, value); }   // the CRT's, as host/posix_shims.h gives it
#endif
#ifdef ZN_HOST_GFX
#include "hal.h"   // the engine's window, for --emulator --live
#endif

#include "dev/client.h"
#include "frontend/native_gen.h"
#include "frontend/plugin_manifest.h"
#include "frontend/project.h"
#include "qjs/qjs.h"
#include "tc/plugin_build.h"
#include "tc/tc.h"
#include "yyjson.h"
#include "zn/log.h"

namespace zn::cli {

namespace fs = std::filesystem;

namespace {

constexpr int kHeap = 96 * 1024;               // main/main.c JS_HEAP
constexpr const char* kJsOffset = "0x320000";  // partitions.csv: the js partition, 512 KB
constexpr std::size_t kJsSize = 0x80000;         // a program is half of it at most: the firmware relocates bytecode into the other half
constexpr std::size_t kAppOffset = 0x20000;      // partitions.csv: ota_0, where a merged image's firmware starts

std::string quote(const std::string& s) { std::string r = "'"; for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; } return r + "'"; }
bool readText(const fs::path& p, std::string& out) { std::ifstream in(p, std::ios::binary); if (!in) return false; std::stringstream ss; ss << in.rdbuf(); out = ss.str(); return true; }
bool writeText(const fs::path& p, const std::string& text) {   // a file that holds it already keeps its time (ESP-IDF configures nothing again)
  std::string old;
  if (readText(p, old) && old == text) return true;
  std::ofstream o(p, std::ios::binary);
  return static_cast<bool>(o << text);
}

// a shell command's exit code, its stdout and stderr in `out`
int capture(const std::string& cmd, std::string& out) {
  out.clear();
  FILE* p = popen((cmd + " 2>&1").c_str(), "r");
  if (!p) return -1;
  char buf[4096];
  for (std::size_t n; (n = std::fread(buf, 1, sizeof buf, p)) > 0;) out.append(buf, n);
  const int rc = pclose(p);
#ifdef _WIN32
  return rc;
#else
  return WIFEXITED(rc) ? WEXITSTATUS(rc) : 1;
#endif
}

std::string mqjsTool(std::string& err) {
  if (const char* e = std::getenv("ZINC_MQJS")) return e;
  const fs::path p = fs::path(zn::tc::executablePath()).parent_path() / "zinc-mqjs";
  std::error_code ec;
  if (fs::exists(p, ec)) return p.string();
  err = "zinc-mqjs, the host mquickjs that checks and compiles the program, is not beside zinc (" + p.string() + "); tools/build zinc-mqjs builds it";
  return "";
}

// A plugin's native module the program opens (requireNative): C on the native ABI (native/<x>.abi.c), built into the firmware
struct Native { std::string module, dir, impl, header; std::vector<std::string> sources, defines, idf, sdkconfig; std::map<std::string, std::string> registry; };

struct Program {
  std::string work, name, map, img;   // the scratch directory, the program's file name there (<name>.js), its source map, the image for the board
  bool net = false;                   // it calls zinc:wifi, zinc:espnow or zinc:ble: the network image (main/CMakeLists.txt ZN_NET)
  std::vector<Native> natives;        // the firmware is then built for it (nativeFirmware)
  // the positions of <name>.js in `text` (the traces of the check and of the board), back to the user's files
  std::string mapped(std::string text) const {
    const std::string file = name + ".js:", abs = work + "/" + file;
    for (std::size_t at = 0; (at = text.find(file, at)) != std::string::npos;) {
      if (at > 0 && text[at - 1] == '/') { at += file.size(); continue; }
      text.replace(at, file.size(), abs);
      at += abs.size();
    }
    return zn::qjs::mapStack(text, work + "/" + name + ".js", map);
  }
};

// The plugins' native modules the program opens, requireNative("Qrcode") of their spec: each one's C on the native ABI goes into the firmware
// (nativeFirmware), and the check loads the plugin's library for this computer (main/zn_native.c, ZINC_MQJS_NATIVE), so it runs the same C.
// `env` gets "<library>=<Module>;..." for the check, "" when a plugin has no library for this computer (the program is then not run). 0, or 1.
int findNatives(const std::string& root, const std::string& entry, const std::string& es5, Program& p, std::string& env) {
  std::vector<std::string> names;
  for (std::size_t at = 0; (at = es5.find("requireNative(", at)) != std::string::npos; at += 14) {
    const char q = at + 14 < es5.size() ? es5[at + 14] : 0;
    const std::size_t end = q == '"' || q == '\'' ? es5.find(q, at + 15) : std::string::npos;
    if (end != std::string::npos && std::find(names.begin(), names.end(), es5.substr(at + 15, end - at - 15)) == names.end()) names.push_back(es5.substr(at + 15, end - at - 15));
  }
  if (names.empty()) return 0;
  std::vector<std::string> problems;
  const std::string pf = zn::frontend::findProjectFile(entry), projectDir = pf.empty() ? fs::path(entry).parent_path().string() : fs::path(pf).parent_path().string();
  const std::vector<zn::frontend::FoundPlugin> plugins = zn::frontend::discoverPlugins(root, projectDir, problems);
  bool run = true;
  for (const std::string& name : names) {
    const zn::frontend::FoundPlugin* fp = zn::tc::pluginForModule(plugins, name);
    if (!fp) { std::fprintf(stderr, "zinc: requireNative('%s'): no plugin of this project or of zinc has this native module\n", name.c_str()); return 1; }
    const fs::path nd = fs::path(fp->dir) / "native";
    std::string spec, text, err;
    std::error_code ec;
    for (const auto& e : fs::directory_iterator(nd, ec)) if (e.path().filename().string().size() > 8 && e.path().string().ends_with(".spec.ts")) spec = e.path().string();
    zn::frontend::NativeGen gen;
    if (spec.empty() || !readText(spec, text) || !zn::frontend::generateNative(spec, text, gen, err)) { std::fprintf(stderr, "zinc: plugin '%s': its native spec: %s\n", fp->manifest.name.c_str(), err.c_str()); return 1; }
    const std::string base = fs::path(spec).filename().string().substr(0, fs::path(spec).filename().string().size() - 8);
    const std::string impl = (nd / (base + (fs::exists(nd / (base + ".abi.cpp")) ? ".abi.cpp" : ".abi.c"))).string();   // C, or C++ for a C++ library (Arduino's)
    const auto ts = fp->manifest.targetSettings.find("esp32");
    if (!fs::exists(impl) || gen.cHeader.empty()) {
      std::fprintf(stderr, "zinc: plugin '%s' has no native code for the ESP32 under mquickjs: it needs its code on Zinc's native ABI, native/%s.abi.c or .abi.cpp (docs/plugins/native-esp32.md)\n", fp->manifest.name.c_str(), base.c_str());
      return 1;
    }
    if (ts == fp->manifest.targetSettings.end()) { std::fprintf(stderr, "zinc: plugin '%s' does not list the esp32 target in its plugin.json\n", fp->manifest.name.c_str()); return 1; }
    Native n{name, fp->dir, impl, gen.cHeader, {}, ts->second.defines, ts->second.idf, ts->second.sdkconfig, ts->second.idfComponents};
    for (const std::string& src : ts->second.sources) n.sources.push_back((fs::path(fp->dir) / src).lexically_normal().string());
    p.natives.push_back(n);
    // the check runs the firmware's C: where the computer's library is another implementation (the manifest's, <x>.<target>.cpp or
    // <x>.host.cpp come first there; zinc:device's is on zinc's runtime, which zinc-mqjs has not), the ABI file is built as a target of
    // its own, "mquickjs", with the computer's settings and its own cache
    zn::frontend::FoundPlugin check = *fp;
    std::string target = zn::tc::pluginTarget();
    const auto computer = check.manifest.targetSettings.find(target);
    if (computer != check.manifest.targetSettings.end() &&
        (check.manifest.nativeImpl.count(target) || fs::exists(nd / (base + "." + target + ".cpp")) || fs::exists(nd / (base + ".host.cpp")))) {
      const zn::frontend::PluginTarget settings = computer->second;
      target = "mquickjs";
      check.manifest.targets.push_back(target);
      check.manifest.targetSettings[target] = settings;
      check.manifest.nativeImpl[target] = fs::path(impl).lexically_relative(fp->dir).string();
    }
    zn::tc::PluginLib lib;
    if (run && zn::tc::buildPlugin(check, root, projectDir, target, lib, err) && !lib.shared.empty()) env += lib.shared + "=" + name + ";";
    else if (run) {
      std::fprintf(stderr, "zinc: plugin '%s' has no library for this computer (%s): the program is compiled for the board without being run here first\n", fp->manifest.name.c_str(), err.c_str());
      run = false;
    }
  }
  if (!run) env.clear();
  return 0;
}

// 0, 1 when the program has errors, 2 for a tool problem
int prepare(const std::string& root, const std::string& entry, const std::string& cacheDir, int frames, Program& p) {
  const fs::path js = fs::path(root) / "firmware/esp32-mquickjs/js";
  const auto t0 = std::chrono::steady_clock::now();
  setenv("ZINC_PLATFORM", "esp32", 1);   // zinc:platform's TARGET and screen are the board's
  setenv("ZINC_SIZE", "240x320", 1);
  zn::qjs::BundleOptions bo;
  bo.engine = "mquickjs";
  bo.entry = fs::absolute(entry).lexically_normal().string();
  bo.stdRoot = fs::path(root + "/lib/std").lexically_normal().string();
  bo.capsFile = root + "/targets/capabilities.json";
  bo.cacheDir = cacheDir;
  bo.work = p.work = zn::tc::home() + "/cache/mquickjs/" + std::to_string(std::hash<std::string>{}(bo.entry));
  bo.out = p.work + "/bundle.js";
  bo.sourcemap = bo.quiet = true;
  bo.modules = (js / "modules").string();   // zinc:gpio, zinc:storage, zinc:wifi, zinc:ble...: the board's, on its host calls
  std::string err, swc, mqjs, log;
  if (!zn::tc::ensureEsbuild(bo.esbuild, err) || !zn::tc::ensureSwc(swc, err) || (mqjs = mqjsTool(err)).empty()) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  zn::log::step("bundle", zn::log::shortPath(bo.entry) + " for mquickjs");
  if (const int rc = zn::qjs::bundle(bo)) return rc;
  // ES5: SWC lowers the linked program, its source map chained to the bundle's (the traces name the user's files)
  const std::string es5File = p.work + "/es5.js";
  if (capture(quote(swc) + " compile --config-file " + quote((js / "swcrc.json").string()) + " " + quote(bo.out) + " --out-file " + quote(es5File), log) != 0) {
    std::fprintf(stderr, "%szinc: SWC cannot lower the program to ES5 (above)\n", log.c_str());
    return 1;
  }
  std::string es5, prelude, runtime, post, sim;
  if (!readText(es5File, es5) || !readText(es5File + ".map", p.map) || !readText(js / "prelude.js", prelude) || !readText(js / "runtime.js", runtime) ||
      !readText(js / "post.js", post) || !readText(js / "sim.js", sim)) {
    std::fprintf(stderr, "zinc: cannot read the files of %s or SWC's output in %s\n", js.string().c_str(), p.work.c_str());
    return 2;
  }
  for (std::size_t at; (at = es5.find("//# sourceMappingURL=")) != std::string::npos;) es5.erase(at, es5.find('\n', at) == std::string::npos ? std::string::npos : es5.find('\n', at) - at);
  // the host calls the board does not have (sim.js lists those it has): each one throws when it is called, naming what is missing
  auto ident = [](const std::string& s, std::size_t at) { std::size_t e = at; while (e < s.size() && (std::isalnum(static_cast<unsigned char>(s[e])) || s[e] == '_')) e++; return s.substr(at, e - at); };
  std::set<std::string> have{"__host_nativeOpen", "__host_nativeCall"}, missing;   // zinc:native's are zinc-mqjs's own, as the firmware's (main/zn_native.c)
  for (std::size_t at = 0; (at = sim.find("function __host_", at)) != std::string::npos; at += 9) have.insert(ident(sim, at + 9));
  for (std::size_t at = 0; (at = es5.find("__host_", at)) != std::string::npos; at += 7) if (!have.count(ident(es5, at))) missing.insert(ident(es5, at));
  std::string head = prelude + runtime;
  for (const std::string& h : missing) {   // __host_gpioWatch: "zinc:gpio watch()"
    std::string what = h.substr(7);
    const std::size_t up = std::find_if(what.begin(), what.end(), [](char c) { return std::isupper(static_cast<unsigned char>(c)); }) - what.begin();
    if (up > 0 && up < what.size()) { std::string fn = what.substr(up); fn[0] = static_cast<char>(std::tolower(static_cast<unsigned char>(fn[0]))); what = "zinc:" + what.substr(0, up) + " " + fn + "()"; }
    head += "function " + h + "() { throw new Error(\"" + what + " is not on the ESP32 under mquickjs\"); }\n";
  }
  // the helpers of post.js that SWC's output defines, written again after it (the later declaration holds)
  std::string tail;
  for (std::size_t at = post.find("\nfunction "); at != std::string::npos;) {
    const std::size_t next = post.find("\nfunction ", at + 1);
    const std::string fn = post.substr(at + 1, next == std::string::npos ? std::string::npos : next - at - 1);
    if (es5.find(fn.substr(0, fn.find('(') + 1)) != std::string::npos) tail += fn;
    at = next;
  }
  // the program; what comes before the ES5 moves its lines down, and its source map with them (one ';' per line)
  const std::size_t mappings = p.map.find("\"mappings\":\"");
  if (mappings != std::string::npos) p.map.insert(mappings + 12, std::string(std::count(head.begin(), head.end(), '\n'), ';'));
  p.name = fs::path(bo.entry).stem().string();
  if (!writeText(p.work + "/" + p.name + ".js", head + es5 + "\n" + tail) || !writeText(p.work + "/sim.js", "var FRAMES = " + std::to_string(frames) + ";\n" + sim)) return 2;
  std::string natives;
  if (findNatives(root, bo.entry, es5, p, natives)) return 1;
  // the check: the host mquickjs runs it for `frames` frames against the board's host calls, in twice the board's heap (the computer's values
  // are 8 bytes, the board's 4) plus the program's bytecode, which it compiles into that heap where the board runs it from the flash; from
  // its directory, so that the traces name <name>.js as the board's do
  std::string bc64;
  if (capture("cd " + quote(p.work) + " && " + quote(mqjs) + " -o " + quote(p.name + ".bc64") + " " + quote(p.name + ".js"), log) != 0 || !readText(p.work + "/" + p.name + ".bc64", bc64)) bc64.clear();   // a syntax error: the check says it
  if ((p.natives.empty() || !natives.empty()) &&
      capture("cd " + quote(p.work) + " && ZINC_MQJS_NATIVE=" + quote(natives) + " " + quote(mqjs) + " --memory-limit " + std::to_string(2 * kHeap + bc64.size()) + " -I sim.js " + quote(p.name + ".js"), log) != 0) {
    std::fprintf(stderr, "%szinc: %s fails under mquickjs on the computer (above); nothing was sent to the board\n", p.mapped(log).c_str(), zn::log::shortPath(bo.entry).c_str());
    return 1;
  }
  // the bytecode (32-bit, as the board's words) and the image the firmware reads: "ZNJS", the length, the bytes
  std::string bin;
  if (capture("cd " + quote(p.work) + " && " + quote(mqjs) + " -m32 -o " + quote(p.name + ".bin") + " " + quote(p.name + ".js"), log) != 0 || !readText(p.work + "/" + p.name + ".bin", bin)) {
    std::fprintf(stderr, "%szinc: mquickjs cannot compile %s\n", log.c_str(), zn::log::shortPath(bo.entry).c_str());
    return 1;
  }
  if (bin.size() + 8 > kJsSize / 2) { std::fprintf(stderr, "zinc: the program is %zu bytes of bytecode; the board runs %zu at most\n", bin.size(), kJsSize / 2 - 8); return 1; }
  p.net = es5.find("__host_wifi") != std::string::npos || es5.find("__host_espnow") != std::string::npos || es5.find("__host_ble") != std::string::npos;
  std::string image = "ZNJS";
  for (int k = 0; k < 4; ++k) image += static_cast<char>((bin.size() >> (8 * k)) & 0xff);
  p.img = p.work + "/" + p.name + ".img";
  if (!writeText(p.img, image + bin)) return 2;
  zn::log::step("bytecode", std::to_string(bin.size()) + " bytes, " + (p.natives.empty() || !natives.empty() ? "checked for " + std::to_string(frames) + " frames under mquickjs" : std::string("not run here")), zn::log::since(t0));
  return 0;
}

// the board's firmware (the network image for a program that uses the radio), or the emulator's (its panel on SPI: esp32sim's T-Display board)
std::string firmwareImage(const std::string& root, bool emulator, bool net, std::string& err) {
  const fs::path f = fs::path(root) / "firmware/esp32-mquickjs/prebuilt" /
                     (emulator ? "zinc-mquickjs-sim-flash.bin" : net ? "zinc-mquickjs-net-flash.bin" : "zinc-mquickjs-flash.bin");
  std::error_code ec;
  if (fs::exists(f, ec)) return f.string();
  err = "the firmware image is missing: " + f.string() + " (tools/build-esp32-core mquickjs builds it)";
  return "";
}

// The firmware with the native modules of `p` (main/zn_native.c), built with ESP-IDF 5.5.5 (installed into ZINC_HOME the first time, as
// tools/build-esp32-core does) in ZINC_HOME/esp32/firmware/<key>. The key is the configuration (the kind of image, the modules, the packages
// and settings they need); the files' contents (the firmware's sources, the modules') decide whether the image there is still right, and a
// change rebuilds it in the same directory, only what changed. The program's own changes never rebuild it. A few minutes the first time;
// "" with `err` when the build fails.
// the plugins' C: no warnings (vendored code), and -O2 where the rest of the firmware is -Os: LVGL's renderer and a codec are the hot loops
constexpr const char* kPluginFlags = "-w -O2";
std::string nativeFirmware(const std::string& root, const Program& p, bool emulator, bool net, std::string& err) {
  const fs::path fw = fs::path(root) / "firmware/esp32-mquickjs";
  std::error_code ec;
  if (!fs::exists(fw / "main/zn_native.c", ec)) { err = "a plugin's native code needs the firmware's sources, which this zinc does not have (" + fw.string() + ")"; return ""; }
  std::string key = fw.string() + (emulator ? " sim" : " board") + (net ? " net" : "") + "\n", contents;
  std::vector<std::string> files;
  for (const char* d : {"main", "components"})
    for (const auto& e : fs::recursive_directory_iterator(fw / d, ec)) if (e.is_regular_file()) files.push_back(e.path().string());
  for (const char* f : {"CMakeLists.txt", "partitions.csv"}) files.push_back((fw / f).string());
  for (const char* f : {"sdkconfig.defaults", "sdkconfig.net"}) key += zn::tc::sha256File((fw / f).string()) + "\n";   // read only into a new sdkconfig
  for (const auto& e : fs::directory_iterator(fs::path(root) / "third_party/mquickjs", ec)) if (e.is_regular_file()) files.push_back(e.path().string());
  for (const Native& n : p.natives) {
    key += n.module + " " + n.impl;
    contents += n.header;
    files.push_back(n.impl);
    files.insert(files.end(), n.sources.begin(), n.sources.end());
    for (const auto& e : fs::directory_iterator(n.dir, ec))   // a library's configuration beside plugin.json (zinc:lvgl's lv_conf.h)
      if (e.is_regular_file() && e.path().extension() == ".h") files.push_back(e.path().string());
    for (const std::string& d : n.defines) key += " -D" + d;
    for (const std::string& r : n.idf) key += " " + r;
    for (const auto& [pkg, ver] : n.registry) key += " " + pkg + "@" + ver;
    for (const std::string& c : n.sdkconfig) key += " " + c;
  }
  std::sort(files.begin(), files.end());
  contents += std::string(kPluginFlags) + "\n";
  for (const std::string& f : files) contents += f + " " + zn::tc::sha256File(f) + "\n";
  const fs::path dir = fs::path(zn::tc::home()) / "esp32/firmware" / zn::tc::sha256Hex(key).substr(0, 16);
  const std::string image = (dir / "flash.bin").string(), built = zn::tc::sha256Hex(contents);
  std::string last;
  if (fs::exists(image, ec) && readText(dir / "flash.key", last) && last == built) return image;
  fs::remove(image, ec);
  // the component main/CMakeLists.txt requires: the modules' sources, headers and defines, the ESP-IDF components and the registry packages
  // (idf_component.yml: plugin.json "idfComponents", Arduino's core as a component for example) they need, their zn_module_<Name>
  const fs::path comp = dir / "zn_plugins";
  fs::create_directories(comp, ec);
  std::string srcs, incs = " \"" + (fs::path(root) / "include").string() + "\" \"" + comp.string() + "\"", defs, reqs, deps, list, decls, settings;
  for (const Native& n : p.natives) {
    std::string lower = n.module;
    for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    writeText(comp / ("zinc_native_" + lower + "_abi.h"), n.header);
    srcs += " \"" + n.impl + "\"";
    for (const std::string& src : n.sources) srcs += " \"" + src + "\"";
    incs += " \"" + n.dir + "\" \"" + n.dir + "/native\"";
    for (const std::string& d : n.defines) defs += " \"" + d + "\"";
    for (const std::string& r : n.idf) reqs += " " + r;
    for (const auto& [pkg, ver] : n.registry) deps += "  " + pkg + ": \"" + ver + "\"\n";
    for (const std::string& c : n.sdkconfig) settings += c + "\n";
    decls += "const ZnModule *zn_module_" + n.module + "(void);\n";
    list += "zn_module_" + n.module + ", ";
  }
  writeText(comp / "zn_native_modules.c", "/* written by zinc (src/cli_mqjs.cpp): the native modules main/zn_native.c opens */\n#include \"zn/native.h\"\n" + decls +
                                              "const ZnModule *(*const zn_native_modules[])(void) = {" + list + "0};\n");
  writeText(comp / "CMakeLists.txt", "# written by zinc (src/cli_mqjs.cpp): the native code of the plugins a program imports\n"
                                     "idf_component_register(SRCS zn_native_modules.c" + srcs + "\n  INCLUDE_DIRS" + incs + (reqs.empty() ? "" : "\n  REQUIRES" + reqs) + ")\n" +
                                     (defs.empty() ? "" : "target_compile_definitions(${COMPONENT_LIB} PRIVATE" + defs + ")\n") +
                                     "target_compile_options(${COMPONENT_LIB} PRIVATE " + kPluginFlags + ")\n");
  fs::remove(comp / "idf_component.yml", ec);
  if (!deps.empty()) writeText(comp / "idf_component.yml", "dependencies:\n" + deps);
  writeText(dir / "sdkconfig.plugins", settings);   // after the firmware's own defaults, so a plugin's setting wins
  // the project, in the cache: ESP-IDF downloads the registry's packages into its directory (managed_components), never into zinc's own
  const fs::path project = dir / "project";
  fs::create_directories(project, ec);
  std::string partitions;
  if (!readText(fw / "partitions.csv", partitions) || !writeText(project / "partitions.csv", partitions)) { err = "cannot write the firmware's project in " + project.string(); return ""; }
  writeText(project / "CMakeLists.txt", "# written by zinc (src/cli_mqjs.cpp): the firmware of " + fw.string() + ", built here\ncmake_minimum_required(VERSION 3.16)\n"
                                        "include(\"" + (fw / "CMakeLists.txt").string() + "\")\nproject(${ZN_PROJECT})\n");
  // ESP-IDF, as tools/build-esp32-core installs it (about 1.5 GB, once)
  const std::string idf = zn::tc::home() + "/esp-idf", tools = zn::tc::home() + "/esp-tools", log = (dir / "build.log").string();
  std::string out;
  if (!fs::exists(idf + "/export.sh", ec)) {
    if (zn::tc::offline()) { err = "a plugin's native code needs ESP-IDF, which is not installed and cannot be while offline (ZINC_OFFLINE)"; return ""; }
    zn::log::step("esp-idf", "installing ESP-IDF 5.5.5 into " + idf + " (once: about 1.5 GB and several minutes)");
    if (capture("git clone --depth 1 -b v5.5.5 --recurse-submodules --shallow-submodules -j8 https://github.com/espressif/esp-idf " + quote(idf) + " && cd " + quote(idf) +
                " && IDF_TOOLS_PATH=" + quote(tools) + " ./install.sh esp32", out) != 0) {
      err = "ESP-IDF could not be installed into " + idf + ":\n" + out.substr(out.size() > 2000 ? out.size() - 2000 : 0);
      return "";
    }
  }
  const unsigned cores = std::max(1u, std::thread::hardware_concurrency() / 2);
  const auto t = std::chrono::steady_clock::now();
  zn::log::step("firmware", "building the firmware with " + std::to_string(p.natives.size()) + " native module(s) (ESP-IDF; minutes the first time, then cached)");
  const std::string cmd = "export IDF_TOOLS_PATH=" + quote(tools) + " && . " + quote(idf + "/export.sh") + " >/dev/null && cd " + quote(project.string()) +
                          // configured already: the build system alone, which configures again only when a CMakeLists.txt changed (idf.py with -D
                          // always does, and the registry's packages are solved again: half a minute)
                          " && export MAKEFLAGS=-l" + std::to_string(cores) + " && if [ -f " + quote((dir / "build/CMakeCache.txt").string()) + " ]; then nice -n 5 cmake --build " +
                          quote((dir / "build").string()) + " -j " + std::to_string(2 * cores) + "; else" +
                          " { command -v ccache >/dev/null && export IDF_CCACHE_ENABLE=1; gen=Ninja; command -v ninja >/dev/null || gen='Unix Makefiles';" +
                          " nice -n 5 idf.py -G \"$gen\" -B " + quote((dir / "build").string()) + " -DIDF_TARGET=esp32 -DSDKCONFIG=" + quote((dir / "sdkconfig").string()) +
                          " -DDEPENDENCIES_LOCK=" + quote((dir / "dependencies.lock").string()) + " -DZN_NATIVE_DIR=" + quote(dir.string()) +
                          " -DSDKCONFIG_DEFAULTS=" + quote((fw / "sdkconfig.defaults").string() + ";" + (net ? (fw / "sdkconfig.net").string() + ";" : "") + (dir / "sdkconfig.plugins").string()) +
                          (net ? " -DZN_NET=1" : "") + (emulator ? " -DZN_PANEL=spi" : "") + " build; }; fi" +
                          " && cd " + quote((dir / "build").string()) + " && esptool.py --chip esp32 merge_bin -o ../flash.bin @flash_args";
  if (capture("( " + cmd + " ) >" + quote(log) + " 2>&1", out) != 0 || !fs::exists(image, ec)) {
    std::string text;
    readText(log, text);
    err = text.substr(text.size() > 3000 ? text.size() - 3000 : 0) + "\nthe firmware with the native modules did not build (above; the whole log: " + log + ")";
    return "";
  }
  writeText(dir / "flash.key", built);
  zn::log::step("firmware", "built with the native modules: " + dir.string(), zn::log::since(t));
  return image;
}

// The image a program runs on: the prebuilt one, or the one built with its plugins' native modules
std::string imageFor(const std::string& root, const Program& p, bool emulator, bool net, std::string& err) {
  return p.natives.empty() ? firmwareImage(root, emulator, net, err) : nativeFirmware(root, p, emulator, net, err);
}

// What the firmware of a merged image prints first ("mqjs: firmware <name> <sha>", main/main.c): its esp_app_desc_t, 32 bytes into the app
std::string imageId(const std::string& image) {
  std::string bin;
  if (!readText(image, bin) || bin.size() < kAppOffset + 0x20 + 148) return "";
  const char* d = bin.data() + kAppOffset + 0x20;
  char sha[9];
  std::snprintf(sha, sizeof sha, "%02x%02x%02x%02x", static_cast<unsigned char>(d[144]), static_cast<unsigned char>(d[145]),
                static_cast<unsigned char>(d[146]), static_cast<unsigned char>(d[147]));
  return std::string(d + 48, strnlen(d + 48, 32)) + " " + sha;
}

// The boards seen on Wi-Fi (the network image prints its update token and its address on the UART): ZINC_HOME/esp32/<name>, "token ip"
fs::path boardFile(const std::string& name) { return fs::path(zn::tc::home()) / "esp32" / name; }

// The firmware's UART, line by line: its own lines (mqjs: ...) on stderr, the program's print and console.log on stdout, the positions mapped
// to the user's files; the ROM's boot log before the firmware starts is not shown. `rc` becomes 0 when the program ends, 1 when it fails (the
// rest of an error follows its first line within a moment: `failed` is when it began).
struct Uart {
  using clock = std::chrono::steady_clock;
  const Program& p;
  bool firmware = false;
  int rc = -1;
  clock::time_point failed = clock::time_point::max();
  std::string id, token;   // the firmware's "<name> <sha>"; the update token of the network image
  explicit Uart(const Program& q) : p(q) {}
  void take(const std::string& l) {
    if (l.rfind("mqjs: firmware ", 0) == 0) id = l.substr(15);
    else if (l.rfind("mqjs: update token ", 0) == 0) token = l.substr(19);
    else if (l.rfind("mqjs: wifi connected to ", 0) == 0 && !token.empty()) {   // "... as zinc-ab12.local (192.168.1.20)"
      const std::size_t as = l.find(" as "), dot = l.find(".local (", as), end = l.find(')', dot);
      std::error_code ec;
      if (as != std::string::npos && dot != std::string::npos && end != std::string::npos) {
        const std::string name = l.substr(as + 4, dot - as - 4);
        fs::create_directories(boardFile(name).parent_path(), ec);
        writeText(boardFile(name), token + " " + l.substr(dot + 8, end - dot - 8) + "\n");
        writeText(boardFile("last"), name + "\n");
      }
    }
    if (l.rfind("mqjs: ", 0) == 0) {
      firmware = true;
      std::fprintf(stderr, "%s\n", p.mapped(l).c_str());
      if (l.find("the program ended") != std::string::npos) rc = 0;
      // a failure; "no touch controller" is not one: a board without touch (the S022N) and the emulator go on
      else if (l.rfind("mqjs: Error", 0) == 0 || l.rfind("mqjs: Syntax error", 0) == 0 || (l.rfind("mqjs: no ", 0) == 0 && l.rfind("mqjs: no touch", 0) != 0)) failed = clock::now();
    } else if (firmware) {
      std::printf("%s\n", p.mapped(l).c_str());
      std::fflush(stdout);
    }
  }
};

int flashFirmware(const std::string& root, std::string port, bool net, const Program* p = nullptr) {
  std::string err, tool, log;
  const std::string image = p ? imageFor(root, *p, false, net, err) : firmwareImage(root, false, net, err);
  if (image.empty() || !zn::tc::ensureEsptool(tool, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  if (port.empty()) port = zn::dev::findSerialPort();
  if (port.empty()) { std::fprintf(stderr, "zinc: no ESP32 found on a serial port; plug it in or give --port <path>\n"); return 1; }
  const auto t = std::chrono::steady_clock::now();
  if (capture(quote(tool) + " --chip esp32 -p " + quote(port) + " -b 460800 write-flash 0x0 " + quote(image), log) != 0) {
    std::fprintf(stderr, "%szinc: esptool cannot write the firmware to %s (above)\n", log.c_str(), port.c_str());
    return 1;
  }
  zn::log::step("firmware", fs::path(image).filename().string() + " to " + port, zn::log::since(t));
  return 0;
}

// The program into the js partition (a second for a few KB), then the board's UART: the firmware's lines (mqjs: ...) on stderr, the program's
// print and console.log on stdout, until it ends (0), fails (1) or `runMs` have passed (0). The boot log of the ROM before the firmware is not shown.
int runOnBoard(const std::string& root, const Program& p, std::string port, int runMs) {
  using clock = std::chrono::steady_clock;
  std::string err, tool, log;
  if (!zn::tc::ensureEsptool(tool, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  if (port.empty()) port = zn::dev::findSerialPort();
  if (port.empty()) { std::fprintf(stderr, "zinc: no ESP32 found on a serial port; plug it in or give --port <path>\n"); return 1; }
  const auto t = clock::now();
  if (capture(quote(tool) + " --chip esp32 -p " + quote(port) + " -b 460800 write-flash " + kJsOffset + " " + quote(p.img), log) != 0) {
    std::fprintf(stderr, "%szinc: esptool cannot write the program to %s (above)\n", log.c_str(), port.c_str());
    return 1;
  }
  zn::log::step("flash", "the program to " + port + " at " + kJsOffset, zn::log::since(t));
  // the firmware the program needs: the network image for the radio, else either (the network image runs every program)
  // with native modules, only the image built for them
  const std::string small = imageId(imageFor(root, p, false, p.net, err)), net = p.natives.empty() ? imageId(firmwareImage(root, false, true, err)) : small;
  if (small.empty()) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  bool reflashed = false;
again:
  zn::dev::Link link;
  if (!zn::dev::openSerial(port, 115200, link, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  // esptool's reset ran the program before the port was open: reset again, now that its first lines are read (the USB-serial chip's RTS
  // drives EN and DTR drives GPIO0, as esptool's "hard reset": EN low with GPIO0 high, then EN high)
#ifndef _WIN32   // openSerial has no Windows port yet (dev/client.cpp): it failed above
  int dtr = TIOCM_DTR, rts = TIOCM_RTS;
  ioctl(link.in, TIOCMBIC, &dtr);
  ioctl(link.in, TIOCMBIS, &rts);
  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  ioctl(link.in, TIOCMBIC, &rts);
#endif
  const auto start = clock::now();
  Uart uart(p);
  std::string line;
  for (char buf[512]; uart.rc < 0;) {
    const ssize_t n = ::read(link.in, buf, sizeof buf);
    for (ssize_t i = 0; i < n; i++) {
      if (buf[i] == '\n') { uart.take(line); line.clear(); }
      else if (buf[i] != '\r') line += buf[i];
    }
    if (n <= 0) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    const auto now = clock::now();
    const long long ms = std::chrono::duration_cast<std::chrono::milliseconds>(now - start).count();
    // another firmware (or an older build of this one, or another program on the board): the right one is written once, then the board starts again
    const bool other = (uart.firmware && uart.id.empty()) || (!uart.firmware && ms > 4000) ||
                       (!uart.id.empty() && uart.id != net && (p.net || uart.id != small));
    if (other && !reflashed) {
      zn::dev::closeLink(link);
      std::fprintf(stderr, "zinc: the board runs %s; it gets %s (once)\n", uart.id.empty() ? "another firmware" : ("the firmware " + uart.id).c_str(),
                   p.net ? "the network firmware" : "the mquickjs firmware");
      if (flashFirmware(root, port, p.net, &p)) return 1;
      reflashed = true;
      goto again;
    }
    if (other) {
      std::fprintf(stderr, "zinc: the board does not answer as the mquickjs firmware does, even after it was written (%s)\n", uart.id.c_str());
      uart.rc = 1;
    } else if (uart.failed != clock::time_point::max() && now - uart.failed > std::chrono::milliseconds(500)) uart.rc = 1;
    else if (runMs > 0 && ms > runMs) uart.rc = 0;
  }
  zn::dev::closeLink(link);
  return uart.rc;
}

#ifdef _WIN32
// ponytail: esp32sim is started and stopped with POSIX calls (posix_spawn, kill, a socket); a Windows port is part of the cross-platform pass
int runOnEmulator(const std::string&, const Program&, int, const std::string&, bool, const std::string&) {
  std::fprintf(stderr, "zinc: the ESP32 emulator (--emulator) runs on macOS and Linux for now\n");
  return 2;
}
#else
// `argv` with its stdout on a pipe (`out`, the read end) and its stderr into the file `errFile`: its pid, -1 when it cannot start
pid_t spawnPiped(const std::vector<std::string>& argv, const std::string& errFile, int& out) {
  int fds[2];
  if (::pipe(fds) != 0) return -1;
  posix_spawn_file_actions_t fa;
  posix_spawn_file_actions_init(&fa);
  posix_spawn_file_actions_adddup2(&fa, fds[1], 1);
  posix_spawn_file_actions_addclose(&fa, fds[0]);
  posix_spawn_file_actions_addclose(&fa, fds[1]);
  posix_spawn_file_actions_addopen(&fa, 2, errFile.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
  std::vector<char*> args;
  for (const std::string& a : argv) args.push_back(const_cast<char*>(a.c_str()));
  args.push_back(nullptr);
  pid_t pid = -1;
  if (posix_spawnp(&pid, args[0], &fa, nullptr, args.data(), environ) != 0) pid = -1;
  posix_spawn_file_actions_destroy(&fa);
  ::close(fds[1]);
  if (pid < 0) ::close(fds[0]);
  else out = fds[0];
  return pid;
}

// ---- --emulator --live: esp32sim's board UI (its --web: a WebSocket on 127.0.0.1, the protocol of its own web page) carries the panel's
// frames out, [1, width, height (u16 LE), RGB565 LE pixels], and the touches in, {"t":"touch","x":X,"y":Y,"down":1|0}; its "stat" messages
// say how far the emulated clock is.
#ifndef MSG_NOSIGNAL
#define MSG_NOSIGNAL 0   // macOS: SO_NOSIGPIPE on the socket instead
#endif
struct Live {
  std::mutex mu;
  std::vector<uint16_t> px;   // the last frame received
  int w = 0, h = 0;
  uint64_t frames = 0;        // frames received
  double emulated = 0, speed = 0;   // the emulated seconds and the speed against real time, from the last "stat"
};

bool recvAll(int fd, void* to, std::size_t n) {
  for (char* b = static_cast<char*>(to); n > 0;) {
    const ssize_t k = ::recv(fd, b, n, 0);
    if (k <= 0) return false;
    b += k;
    n -= static_cast<std::size_t>(k);
  }
  return true;
}

// a WebSocket to esp32sim's board UI on `port`: the socket once the server answered 101, else -1
int wsConnect(int port) {
  const int fd = ::socket(AF_INET, SOCK_STREAM, 0);
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_port = htons(static_cast<uint16_t>(port));
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  const std::string req = "GET / HTTP/1.1\r\nHost: 127.0.0.1:" + std::to_string(port) + "\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                          "Sec-WebSocket-Key: emluYyBlc3AzMnNpbSBsaXZl\r\nSec-WebSocket-Version: 13\r\n\r\n";
  if (fd < 0 || ::connect(fd, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0 || ::send(fd, req.data(), req.size(), MSG_NOSIGNAL) != static_cast<ssize_t>(req.size())) {
    if (fd >= 0) ::close(fd);
    return -1;
  }
  std::string head;   // byte by byte: the first frame may follow the answer at once
  for (char c; head.size() < 4096 && (head.size() < 4 || head.compare(head.size() - 4, 4, "\r\n\r\n") != 0) && recvAll(fd, &c, 1);) head += c;
  if (head.compare(0, 12, "HTTP/1.1 101") != 0) { ::close(fd); return -1; }
  const int one = 1;
  setsockopt(fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
#ifdef SO_NOSIGPIPE
  setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
  return fd;
}

// one short text message (under 126 bytes) to the server, masked as a client's must be (RFC 6455 5.3)
void wsSend(int fd, const std::string& text) {
  static const char mask[4] = {0x5a, 0x69, 0x6e, 0x63};
  std::string f = {'\x81', static_cast<char>(0x80 | text.size())};
  f.append(mask, 4);
  for (std::size_t i = 0; i < text.size(); ++i) f += static_cast<char>(text[i] ^ mask[i & 3]);
  ::send(fd, f.data(), f.size(), MSG_NOSIGNAL);
}

// the server's messages into `live` until it closes
void wsRead(int fd, Live& live) {
  std::vector<unsigned char> d;
  for (unsigned char h[2]; recvAll(fd, h, 2);) {
    uint64_t n = h[1] & 0x7f;
    unsigned char e[8];
    if (n == 126) { if (!recvAll(fd, e, 2)) return; n = static_cast<uint64_t>(e[0]) << 8 | e[1]; }
    else if (n == 127) { if (!recvAll(fd, e, 8)) return; n = 0; for (unsigned char b : e) n = n << 8 | b; }
    if (n > (8u << 20)) return;
    d.resize(n);
    if (n > 0 && !recvAll(fd, d.data(), n)) return;
    const int op = h[0] & 0x0f;
    if (op == 8) return;
    if (op == 2 && n >= 5 && d[0] == 1) {
      const int w = d[1] | d[2] << 8, rows = d[3] | d[4] << 8;
      if (n < 5 + 2ull * w * rows) continue;
      std::lock_guard<std::mutex> g(live.mu);
      live.px.resize(static_cast<std::size_t>(w) * rows);
      for (std::size_t i = 0; i < live.px.size(); ++i) live.px[i] = static_cast<uint16_t>(d[5 + 2 * i] | d[6 + 2 * i] << 8);
      live.w = w;
      live.h = rows;
      ++live.frames;
    } else if (op == 1) {
      const std::string s(d.begin(), d.end());
      const std::size_t t = s.find("\"time\":"), v = s.find("\"speed\":");
      if (s.find("\"t\":\"stat\"") == std::string::npos || t == std::string::npos) continue;
      std::lock_guard<std::mutex> g(live.mu);
      live.emulated = std::atof(s.c_str() + t + 7);
      if (v != std::string::npos) live.speed = std::atof(s.c_str() + v + 8);   // null until it is measured: 0
    }
  }
}

#ifdef ZN_HOST_GFX
// what hal_present draws: the panel's pixels (0x00RRGGBB, w x h), scaled to the frame's physical pw x ph, nearest
struct Shown { const uint32_t* px = nullptr; int w = 0, h = 0, pw = 0, ph = 0; } gShown;
void shownRows(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int32_t y = y0; y < y1; ++y) {
    const uint32_t* s = gShown.px + static_cast<std::size_t>(y * gShown.h / gShown.ph) * gShown.w;
    uint32_t* d = rows + static_cast<std::size_t>(y - y0) * gShown.pw;
    for (int x = 0; x < gShown.pw; ++x) d[x] = s[x * gShown.w / gShown.pw];
  }
}

// The panel in the engine's own window (the HAL every zinc:gfx program draws through: ZINC_BACKGROUND, HiDPI, closing), each frame as it
// comes, and the mouse (or the first finger) as the CST820's finger. Until the window closes (true) or `ended` (the emulator stopped).
bool liveWindow(const std::string& title, int fd, Live& live, const std::atomic<bool>& ended, uint64_t& shown) {
  HalConfig cfg{240, 320, title.c_str(), 1};
  hal_init(&cfg);
  std::vector<uint32_t> rgb(240 * 320, 0);
  int w = 240, h = 320, lastX = -1, lastY = -1;
  uint64_t seen = 0;
  bool down = false, closed = false, fresh = true;   // a black panel at once: the window shows before the first frame
  HalInput in{};
  while (!ended) {
    hal_poll_input(&in);
    if (in.quit) { closed = true; break; }
    int lw = w, lh = h;
    hal_surface_size(&lw, &lh);
    const bool finger = in.ntouch > 0, d = finger || in.pdown != 0;
    const int x = std::clamp(static_cast<int>((finger ? in.touch[0].x : in.px) * w / std::max(lw, 1)), 0, w - 1);
    const int y = std::clamp(static_cast<int>((finger ? in.touch[0].y : in.py) * h / std::max(lh, 1)), 0, h - 1);
    if (d != down || (d && (x != lastX || y != lastY))) {
      wsSend(fd, "{\"t\":\"touch\",\"x\":" + std::to_string(x) + ",\"y\":" + std::to_string(y) + ",\"down\":" + (d ? "1" : "0") + "}");
      down = d;
      lastX = x;
      lastY = y;
    }
    {
      std::lock_guard<std::mutex> g(live.mu);
      if (live.frames != seen && live.w > 0) {
        seen = live.frames;
        w = live.w;
        h = live.h;
        rgb.resize(live.px.size());
        for (std::size_t i = 0; i < rgb.size(); ++i) {   // RGB565 to 0x00RRGGBB, the low bits filled from the high ones
          const uint32_t v = live.px[i], r = v >> 11 & 31, gr = v >> 5 & 63, b = v & 31;
          rgb[i] = (r << 3 | r >> 2) << 16 | (gr << 2 | gr >> 4) << 8 | (b << 3 | b >> 2);
        }
        fresh = true;
      }
    }
    if (!fresh) { std::this_thread::sleep_for(std::chrono::milliseconds(8)); continue; }
    fresh = false;
    const int k = std::max(1, static_cast<int>(hal_pixel_scale()));
    gShown = Shown{rgb.data(), w, h, lw * k, lh * k};
    HalFrame f{};
    f.w = gShown.pw;
    f.h = gShown.ph;
    f.x1 = f.w;
    f.y1 = f.h;
    f.render = shownRows;
    hal_present(&f);
    ++shown;
  }
  hal_shutdown();
  return closed;
}
#endif

// The same program in esp32sim (docs/reports/esp32sim.md), on its ESP32-2432S022C stand-in (the panel on SPI, the CST820 touch): the
// emulator's firmware and the program in its flash, the UART as on the board. `runMs` of emulated time (10 s by default) and the last frame as
// a PNG (ZINC_SHOT, else <name>.png beside the program's files); or `live`: a window shows the panel, paced to real time, the mouse touches
// it, until the window closes (or `runMs`).
int runOnEmulator(const std::string& root, const Program& p, int runMs, const std::string& script, bool live, const std::string& title) {
  std::string err, sim, rom;
  if (p.net) {
    std::fprintf(stderr, "zinc: esp32sim has no radio: a program with zinc:wifi, zinc:espnow or zinc:ble runs on the board (or its check alone: zinc export)\n");
    return 2;
  }
#ifndef ZN_HOST_GFX
  if (live) { std::fprintf(stderr, "zinc: this zinc has no window (built without the graphics host): --live cannot show the emulator\n"); return 2; }
#endif
  const std::string image = imageFor(root, p, true, false, err);
  if (image.empty() || !zn::tc::ensureEsp32sim(root, sim, rom, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  const char* shot = std::getenv("ZINC_SHOT");
  const std::string png = shot && *shot ? fs::absolute(shot).string() : p.work + "/" + p.name + ".png", log = p.work + "/emulator.log";
  const int ms = runMs > 0 ? runMs : live ? 0 : 10000;
  std::vector<std::string> argv = {sim, "--chip", "esp32", "--board", "esp32-2432s022-spi", "--boot", "rom", "--rom", rom, "--flash-image", image,
                                   "--flash-at", std::string(kJsOffset) + "=" + p.img, "--console", "uart0", "--no-dump"};
  if (ms > 0) {
    char seconds[32];
    std::snprintf(seconds, sizeof seconds, "%.3f", ms / 1000.0);
    argv.insert(argv.end(), {"--max-seconds", seconds});
  }
  if (live) argv.insert(argv.end(), {"--web", "0"});   // its board UI on a free port; it paces the run to real time
  else argv.insert(argv.end(), {"--gram-png", png});
  if (!script.empty()) argv.insert(argv.end(), {"--script", script});
  const auto t = std::chrono::steady_clock::now();
  // the UART on stdout, the emulator's own report on stderr (kept in emulator.log)
  int uartFd = -1;
  const pid_t pid = spawnPiped(argv, log, uartFd);
  if (pid < 0) { std::fprintf(stderr, "zinc: cannot start %s\n", sim.c_str()); return 1; }
  FILE* out = fdopen(uartFd, "r");
  Uart uart(p);
  std::atomic<bool> ended{false};
  auto readUart = [&] {
    char buf[4096];
    while (std::fgets(buf, sizeof buf, out)) {
      std::string l = buf;
      while (!l.empty() && (l.back() == '\n' || l.back() == '\r')) l.pop_back();
      uart.take(l);
    }
    ended = true;
  };
  bool closed = false;
  if (!live) readUart();
#ifdef ZN_HOST_GFX
  else {
    std::thread reader(readUart);
    int port = 0;
    for (int i = 0; i < 500 && !port && !ended; ++i) {   // esp32sim names its port before the first instruction
      std::string text;
      const std::size_t at = readText(log, text) ? text.find("board UI: http://127.0.0.1:") : std::string::npos;
      if (at != std::string::npos) port = std::atoi(text.c_str() + at + 27);
      else std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    const int fd = port > 0 ? wsConnect(port) : -1;
    Live view;
    uint64_t shown = 0;
    if (fd >= 0) {
      std::thread ws(wsRead, fd, std::ref(view));
      closed = liveWindow(title + " (ESP32 emulator)", fd, view, ended, shown);
      ::kill(pid, SIGTERM);
      ::shutdown(fd, SHUT_RDWR);
      ws.join();
      ::close(fd);
    } else {
      ::kill(pid, SIGTERM);
      std::fprintf(stderr, "zinc: the emulator's board UI did not answer (%s)\n", log.c_str());
    }
    reader.join();
    const double wall = std::chrono::duration<double>(std::chrono::steady_clock::now() - t).count();
    char line[160];
    std::snprintf(line, sizeof line, "%.1f s of an ESP32 in esp32sim in %.1f s, %llu frames shown (%.1f a second)", view.emulated, wall,
                  static_cast<unsigned long long>(shown), shown / std::max(wall, 0.001));
    zn::log::step("emulator", line);
  }
#endif
  std::fclose(out);
  int status = 0;
  ::waitpid(pid, &status, 0);
  if (!uart.firmware && !closed) {
    std::string text;
    readText(log, text);
    std::fprintf(stderr, "%szinc: the firmware did not start in the emulator (%s, exit %d)\n", text.c_str(), sim.c_str(), WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status));
    return 1;
  }
  if (!live) {
    zn::log::step("emulator", std::to_string(ms) + " ms of an ESP32 in esp32sim", zn::log::since(t));
    zn::log::step("frame", zn::log::shortPath(png));
  }
  return uart.failed != Uart::clock::time_point::max() ? 1 : 0;
}
#endif

// The same over Wi-Fi, to a board running the network image (main/mod_update.c): its firmware brought up to date first (POST /ota, the
// app of the merged image), then the program (POST /js); the board restarts and its console comes from GET /log until the program ends,
// fails or `runMs` have passed. `host` is a board's name (zinc-ab12, zinc-ab12.local), an address, or "" for the last board seen over USB.
int runOverWifi(const std::string& root, const Program& p, std::string host, int runMs) {
  using clock = std::chrono::steady_clock;
  std::string text, err, name = host;
  if (name.empty() && readText(boardFile("last"), text)) name = host = text.substr(0, text.find('\n'));
  if (name.size() > 6 && name.compare(name.size() - 6, 6, ".local") == 0) name.resize(name.size() - 6);
  std::istringstream rec(readText(boardFile(name), text) ? text : "");
  std::string token, ip;
  rec >> token >> ip;
  if (host.empty() || token.empty()) {
    std::fprintf(stderr, "zinc: no board known on Wi-Fi%s: run a program with zinc:wifi on it over USB once (zinc reads its update token and its "
                 "address from the UART), then --host <name>.local\n", host.empty() ? "" : (" as " + host).c_str());
    return 1;
  }
  if (host == name) host = ip;   // a bare name: the address it had
  const std::string base = "http://" + host, auth = " -H " + quote("X-Zinc-Token: " + token);
  auto info = [&](std::string& sha) {
    std::string out;
    sha.clear();
    if (capture("curl -s -m 3 " + quote(base + "/info"), out) != 0) return false;
    yyjson_doc* doc = yyjson_read(out.data(), out.size(), 0);
    yyjson_val* v = doc ? yyjson_obj_get(yyjson_doc_get_root(doc), "sha") : nullptr;
    if (v && yyjson_is_str(v)) sha = yyjson_get_str(v);
    yyjson_doc_free(doc);
    return !sha.empty();
  };
  auto post = [&](const std::string& path, const std::string& file, std::string& out) {
    return capture("curl -s -f -m 120 -X POST" + auth + " -H 'Content-Type: application/octet-stream' --data-binary @" + quote(file) + " " + quote(base + path), out) == 0;
  };
  auto wait = [&](const std::string& want) {   // the board back after its restart, running `want` ("" for any)
    std::string sha;
    for (int i = 0; i < 60; i++) {
      if (info(sha) && (want.empty() || sha == want)) return true;
      std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    return false;
  };
  std::string sha, out;
  const auto t = clock::now();
  if (!info(sha)) { std::fprintf(stderr, "zinc: no board answers at %s (on the same network? its screen or UART says its address)\n", base.c_str()); return 1; }
  const std::string image = imageFor(root, p, false, true, err), id = imageId(image);
  if (image.empty()) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  const std::string want = id.substr(id.find(' ') + 1);
  if (sha != want) {   // the network firmware of this zinc: its app, out of the merged image
    std::string bin;
    readText(image, bin);
    const std::string app = p.work + "/firmware-app.bin";
    writeText(app, bin.substr(kAppOffset));
    if (!post("/ota", app, out) || !wait(want)) { std::fprintf(stderr, "%s\nzinc: the firmware update over Wi-Fi failed; the board keeps its own (zinc run over USB writes it)\n", out.c_str()); return 1; }
    zn::log::step("firmware", "updated over Wi-Fi to " + id, zn::log::since(t));
  }
  const auto t1 = clock::now();
  if (!post("/js", p.img, out)) { std::fprintf(stderr, "%s\nzinc: the board refused the program (the token? zinc run over USB reads it again)\n", out.c_str()); return 1; }
  zn::log::step("send", "the program to " + base, zn::log::since(t1));
  if (!wait("")) { std::fprintf(stderr, "zinc: the board did not come back on the network after its restart\n"); return 1; }
  const auto start = clock::now();
  std::size_t from = 0;
  std::string pending;
  for (;;) {
    std::string body;
    const std::string hdr = p.work + "/log.hdr";
    if (capture("curl -s -m 3 -D " + quote(hdr) + auth + " " + quote(base + "/log?from=" + std::to_string(from)), body) == 0) {
      std::string h, state;
      readText(hdr, h);
      for (std::istringstream in(h); std::getline(in, text);) {
        if (text.rfind("X-Zinc-Log-End: ", 0) == 0) from = std::strtoul(text.c_str() + 16, nullptr, 10);
        if (text.rfind("X-Zinc-State: ", 0) == 0) state = text.substr(14, text.find_first_of("\r\n", 14) - 14);
      }
      pending += body;
      for (std::size_t nl; (nl = pending.find('\n')) != std::string::npos; pending.erase(0, nl + 1)) std::printf("%s\n", p.mapped(pending.substr(0, nl)).c_str());
      std::fflush(stdout);
      if (state == "ended") return 0;
      if (state == "failed") return 1;
    }
    if (runMs > 0 && clock::now() - start > std::chrono::milliseconds(runMs)) return 0;
    std::this_thread::sleep_for(std::chrono::milliseconds(300));
  }
}

int exportTo(const std::string& root, const Program& p, const fs::path& out) {
  std::string err;
  const std::string image = imageFor(root, p, false, p.net, err);
  if (image.empty()) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
  std::error_code ec;
  fs::create_directories(out, ec);
  fs::copy_file(image, out / "firmware.bin", fs::copy_options::overwrite_existing, ec);
  if (!ec) fs::copy_file(p.img, out / "app.img", fs::copy_options::overwrite_existing, ec);
  if (ec) { std::fprintf(stderr, "zinc export: cannot write %s: %s\n", out.string().c_str(), ec.message().c_str()); return 1; }
  writeText(out / "flash.sh", "#!/bin/sh\n# Flashes " + p.name + " onto an ESP32-2432S022: the mquickjs firmware at 0x0, the program at " + kJsOffset +
                                  ". Usage: ./flash.sh [port] (ESPTOOL overrides the esptool).\n"
                                  "cd \"$(dirname \"$0\")\" || exit 1\nESPTOOL=${ESPTOOL:-$(zinc toolchain esptool 2>/dev/null || command -v esptool || command -v esptool.py)}\n"
                                  "[ -n \"$ESPTOOL\" ] || { echo \"flash.sh: no esptool (zinc toolchain esptool fetches the pinned one, or pip install esptool)\"; exit 1; }\n"
                                  "exec \"$ESPTOOL\" --chip esp32 ${1:+-p \"$1\"} -b 460800 write-flash 0x0 firmware.bin " + kJsOffset + " app.img\n");
  fs::permissions(out / "flash.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  writeText(out / "README.txt", p.name + " (esp32, mquickjs) built with Zinc.\nFlash: ./flash.sh /dev/ttyUSB0. The program starts when the board boots; "
                                "its print and console.log arrive on the UART at 115200 baud.\nAnother program later: zinc run <app> --target esp32 --engine mquickjs writes only the program.\n");
  std::printf("%s\n", out.string().c_str());
  return 0;
}

}  // namespace

bool mquickjsWanted(const std::vector<std::string>& args) {
  if (args.size() < 3 || (args[1] != "run" && args[1] != "export" && args[1] != "flash" && args[1] != "check")) return false;
  bool esp32 = false;
  std::string dir = ".";
  for (std::size_t k = 2; k < args.size() && args[k] != "--"; ++k) {
    if (args[k] == "--engine" && k + 1 < args.size()) { if (args[k + 1] != "mquickjs") return false; return true; }
    if (args[k] == "--target" && k + 1 < args.size()) esp32 = args[++k] == "esp32";
    else if (args[k] == "--port" || args[k] == "-o" || args[k] == "--frames" || args[k] == "--run-ms" || args[k] == "--emulator-script" || args[k] == "--host") ++k;
    else if (args[k][0] != '-') dir = args[k];
  }
  // a project whose zinc.json says "targets": {"esp32": {"engine": "mquickjs"}}: --target esp32 needs no --engine
  std::string text;
  std::error_code ec;
  if (!esp32 || !fs::is_directory(dir, ec) || !readText(fs::path(dir) / "zinc.json", text)) return false;
  yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
  yyjson_val* e = doc ? yyjson_ptr_get(yyjson_doc_get_root(doc), "/targets/esp32/engine") : nullptr;
  const bool yes = e && yyjson_is_str(e) && std::string(yyjson_get_str(e)) == "mquickjs";
  yyjson_doc_free(doc);
  return yes;
}

int mquickjs(const std::vector<std::string>& args, const std::string& root, const std::string& cacheDir) {
  const std::string& cmd = args[1];
  std::string target, port, out, entry = ".";
  int frames = 300, runMs = 0;
  bool emulator = false, live = false, net = false, wifi = false;
  std::string script, host;
  for (std::size_t k = 2; k < args.size(); ++k) {
    const std::string& a = args[k];
    const bool more = k + 1 < args.size();
    if (a == "--engine" && more) ++k;
    else if (a == "--target" && more) target = args[++k];
    else if (a == "--port" && more) port = args[++k];
    else if (a == "-o" && more) out = args[++k];
    else if (a == "--frames" && more) frames = std::max(1, std::atoi(args[++k].c_str()));
    else if (a == "--run-ms" && more) runMs = std::atoi(args[++k].c_str());
    else if (a == "--emulator") emulator = true;
    else if (a == "--live") emulator = live = true;
    else if (a == "--net") net = true;
    else if (a == "--host" && more) { wifi = true; host = args[++k] == "last" ? "" : args[k]; }
    else if (a == "--emulator-script" && more) { emulator = true; script = fs::absolute(args[++k]).string(); }
    else if (a[0] != '-') entry = a;
    else { std::fprintf(stderr, "zinc: unknown option %s\nusage: zinc run|export|check <app> --target esp32 --engine mquickjs [--port P | --host <board>.local | --emulator [--live] [--emulator-script F]] [-o dir] [--frames N] [--run-ms N]; zinc flash --target esp32 --engine mquickjs [--net]\n", a.c_str()); return 2; }
  }
  if (target != "esp32") { std::fprintf(stderr, "zinc: --engine mquickjs runs on --target esp32 (the board's firmware, firmware/esp32-mquickjs)\n"); return 2; }
  if (cmd == "flash") return flashFirmware(root, port, net);
  // the entry: a file, or a project's (zinc.json "entry", else src/main.ts...)
  std::error_code ec;
  std::string file = entry;
  fs::path projectDir = fs::absolute(entry).parent_path();
  if (fs::is_directory(entry, ec)) {
    projectDir = fs::canonical(entry, ec);
    std::string manifest, perr;
    zn::frontend::Project proj;
    const bool have = readText(projectDir / "zinc.json", manifest) && zn::frontend::parseProject(manifest, proj, perr);
    file = zn::frontend::entryOf(projectDir.string(), have ? &proj : nullptr);
    if (file.empty()) { std::fprintf(stderr, "zinc: no program in %s (zinc.json \"entry\", src/main.ts or main.ts)\n", entry.c_str()); return 2; }
  }
  if (!fs::exists(file, ec)) { std::fprintf(stderr, "zinc: no such file: %s\n", file.c_str()); return 2; }
  Program p;
  if (const int rc = prepare(root, file, cacheDir, frames, p)) return rc;
  if (cmd == "check") return 0;   // checked under mquickjs and compiled; nothing built for or written to a board
  if (cmd == "run") return emulator ? runOnEmulator(root, p, runMs, script, live, projectDir.filename().string()) : wifi ? runOverWifi(root, p, host, runMs) : runOnBoard(root, p, port, runMs);
  return exportTo(root, p, out.empty() ? projectDir / "dist" / (projectDir.filename().string() + "-esp32") : fs::path(out));
}

}  // namespace zn::cli
