// zinc export --target web and zinc dev --target web (docs/targets/web.md, docs/reports/zinc-web-export.md).
// The program is the JavaScript `zinc bundle --profile web` writes (the QuickJS bundler's transform: TypeScript, TSX and the React Native imports lowered,
// esbuild only to link and minify) and it runs on the page's own engine; targets/web/runtime.js answers the host rows (`__host_*`) with the canvas (or
// the DOM), the input, storage and the frame loop, and each plugin's `web` entry in plugin.json brings the browser backend of its native side.
#include "cli_web.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <random>
#include <regex>
#include <set>
#include <sstream>
#include <thread>

#ifndef _WIN32
#include <sys/wait.h>
#endif

#include "cli_core.h"
#include "cli_pm.h"
#include "cli_web_deps.h"
#include "frontend/profile.h"
#include "frontend/project.h"
#include "platform/platform.h"
#include "res/codec.h"
#include "platform/socket.h"
#include "tc/tc.h"
#include "yyjson.h"
#include "zn/log.h"
#include "zpk/zpk.h"

namespace fs = std::filesystem;

namespace zn::cli {
namespace {

std::string q(const std::string& s) { std::string r = "'"; for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; } return r + "'"; }
std::string readAll(const fs::path& p) { std::ifstream in(p, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
bool writeAll(const fs::path& p, const std::string& s) {
  std::error_code ec;
  if (fs::is_regular_file(p, ec) && readAll(p) == s) return true;   // unchanged: the file keeps its time, so a watcher (Vite on the prepared folder) sees nothing
  fs::create_directories(p.parent_path(), ec);
  std::ofstream out(p, std::ios::binary);
  out << s;
  return static_cast<bool>(out);
}
std::string jstr(const std::string& s) {
  std::string r = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { r += '\\'; r += static_cast<char>(c); }
    else if (c == '\n') r += "\\n";
    else if (c == '<') r += "\\u003c";   // never a </script> inside the page
    else if (c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); r += b; }
    else r += static_cast<char>(c);
  }
  return r + "\"";
}
std::string hash10(const std::string& bytes) { return zn::tc::sha256Hex(bytes).substr(0, 10); }
std::string selfExe() { std::string e = zn::tc::executablePath(); return e.empty() ? "zinc" : e; }
std::string lower(std::string s) { for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c))); return s; }
bool endsWith(const std::string& s, const std::string& x) { return s.size() >= x.size() && s.compare(s.size() - x.size(), x.size(), x) == 0; }
std::string humanKb(std::size_t n) { char b[32]; std::snprintf(b, sizeof b, "%.1f KB", static_cast<double>(n) / 1024.0); return b; }

// ---- json
struct Json {
  yyjson_doc* doc = nullptr;
  yyjson_val* root = nullptr;
  explicit Json(const std::string& text) { doc = yyjson_read(text.data(), text.size(), 0); root = doc ? yyjson_doc_get_root(doc) : nullptr; }
  ~Json() { yyjson_doc_free(doc); }
  Json(const Json&) = delete;
  Json& operator=(const Json&) = delete;
};
std::string str(yyjson_val* o, const char* k, const std::string& dflt = "") { yyjson_val* v = o ? yyjson_obj_get(o, k) : nullptr; return yyjson_is_str(v) ? yyjson_get_str(v) : dflt; }
bool flag(yyjson_val* o, const char* k, bool dflt) { yyjson_val* v = o ? yyjson_obj_get(o, k) : nullptr; return yyjson_is_bool(v) ? yyjson_get_bool(v) : dflt; }

// ---- the project's settings: zinc.json "web"
struct Cfg {
  std::string render = "canvas", browsers, title, description, theme = "#111111", bg = "#ffffff", lang = "en", dir, scroll = "app", icon, id;   // dir: "ltr" or "rtl" for <html dir>; scroll: "app" (the page is fixed to the window, containers scroll) or "page" (the page scrolls, DOM render)
  bool pwa = true, strict = false, rnLayout = false;
  int w = 0, h = 0;   // a fixed surface (web.width, web.height); 0: the page's size
  std::vector<std::string> pluginDirs;
};
std::string kBaseline = "chrome >= 111, edge >= 111, firefox >= 115, safari >= 16.4";
Cfg readCfg(const WebArgs& a) {
  Cfg c;
  c.title = a.name;
  Json j(readAll(fs::path(a.dir) / "zinc.json"));
  if (j.root) {
    yyjson_val* w = yyjson_obj_get(yyjson_obj_get(j.root, "targets"), "web");   // zinc.json targets.web (the key "web" turns on the QuickJS web environment of ZN-568)
    if (yyjson_val* u = yyjson_obj_get(j.root, "ui")) c.rnLayout = str(u, "layout") == "rn";
    if (yyjson_is_obj(w)) {
      c.render = str(w, "render", c.render);
      c.browsers = str(w, "browsers");
      c.title = str(w, "title", c.title);
      c.description = str(w, "description");
      c.theme = str(w, "themeColor", c.theme);
      c.bg = str(w, "backgroundColor", c.bg);
      c.lang = str(w, "lang", c.lang);
      c.dir = str(w, "dir");
      c.scroll = str(w, "scroll", c.scroll);
      c.icon = str(w, "icon");
      c.pwa = flag(w, "pwa", true);
      c.strict = flag(w, "strict", false);
      if (yyjson_val* v = yyjson_obj_get(w, "width")) c.w = static_cast<int>(yyjson_get_num(v));
      if (yyjson_val* v = yyjson_obj_get(w, "height")) c.h = static_cast<int>(yyjson_get_num(v));
    }
    yyjson_val* app = yyjson_obj_get(j.root, "app");
    if (c.icon.empty()) c.icon = str(app, "icon");
    c.id = str(app, "id");
    yyjson_val* pd = yyjson_obj_get(j.root, "pluginDirs");
    size_t i, n;
    yyjson_val* v;
    if (yyjson_is_arr(pd)) yyjson_arr_foreach(pd, i, n, v) if (yyjson_is_str(v)) c.pluginDirs.push_back(yyjson_get_str(v));
  }
  return c;
}

// ---- browsers: "chrome >= 111, firefox 115" against the feature table of browsers.json
struct Want { std::string browser; double version; };
double vnum(const std::string& s) {   // "16.4.1" -> 16.4: the first two components, as a decimal
  int major = 0, minor = 0;
  std::sscanf(s.c_str(), "%d.%d", &major, &minor);
  return major + minor / 100.0;   // 16.4 -> 16.04, 16.10 -> 16.10: ordered, never mixed up with 16.4
}
double tableNum(double v) { const int major = static_cast<int>(v); return major + (v - major) * 10.0 / 100.0; }   // 16.4 in the table (tenths) -> 16.04
std::vector<Want> parseBrowsers(std::string spec) {
  if (spec.empty() || spec == "defaults") spec = kBaseline;
  std::vector<Want> out;
  std::stringstream ss(spec);
  std::string part;
  while (std::getline(ss, part, ',')) {
    std::stringstream ps(part);
    std::string name, tok, version;
    ps >> name;
    while (ps >> tok) if (tok != ">=" && tok != ">" && tok != "=") version = tok;
    name = lower(name);
    if (name == "ios" || name == "ios_saf" || name == "safari_ios") name = "safari";
    else if (name == "chromium" || name == "opera" || name == "samsung" || name == "android" || name == "brave") name = "chrome";
    else if (name == "ff") name = "firefox";
    if (name.empty() || (name != "chrome" && name != "edge" && name != "firefox" && name != "safari")) continue;
    out.push_back({name, version.empty() ? 0 : vnum(version)});
  }
  return out;
}
}  // namespace

// One line per feature the browsers cannot give, "" when all of them can.
std::string webCheckReport(const std::string& browsersJson, const std::string& browsers, const std::vector<std::string>& features, const std::string& who) {
  Json j(browsersJson);
  if (!j.root) return "";
  yyjson_val* table = yyjson_obj_get(j.root, "features");
  const std::vector<Want> want = parseBrowsers(browsers);
  std::string out;
  for (const std::string& f : features) {
    yyjson_val* row = yyjson_obj_get(table, f.c_str());
    if (!row) continue;
    std::string bad;
    for (const Want& w : want) {
      yyjson_val* v = yyjson_obj_get(row, w.browser.c_str());
      if (!v) continue;
      if (yyjson_is_null(v)) { bad += (bad.empty() ? "" : ", ") + w.browser + " (never shipped)"; continue; }
      if (w.version < tableNum(yyjson_get_num(v))) { char b[48]; std::snprintf(b, sizeof b, "%g", yyjson_get_num(v)); bad += (bad.empty() ? "" : ", ") + w.browser + " before " + b; }
    }
    if (bad.empty()) continue;
    out += "warning W0601: " + f + (who.empty() ? "" : " (" + who + ")") + " is not available in " + bad;
    const std::string note = str(row, "note");
    if (!note.empty()) out += "; " + note;
    out += "\n";
  }
  return out;
}

std::string webExplain(const std::string& code) {
  struct E { const char *code, *title, *why, *fix, *example; };
  static const E table[] = {
    {"W0601", "A browser of the target set lacks a feature the app uses",
     "`zinc export --target web` knows what each plugin and each part of the web host needs from the browser (WebUSB, getUserMedia, Web Audio, WebRTC, import maps...) and when each browser shipped it "
     "(targets/web/browsers.json). A browser of zinc.json targets.web.browsers (or --browsers) that is older than that, or never shipped it, runs the app but not that part: the call throws "
     "ZnUnsupported at run time instead of crashing.",
     "Raise the minimum version in targets.web.browsers, drop the browser from it, or guard the call with supports() of zinc:browser and catch ZnUnsupported to offer another way. --werror turns the warning into a failed export.",
     "// zinc.json: { \"targets\": { \"web\": { \"browsers\": \"chrome >= 111, firefox >= 115\" } } }\nimport 'zinc:fakeusb';   // W0601: webusb is not in firefox"},
    {"W0602", "The program uses a native side that has no browser backend",
     "A plugin brings its browser version with a \"web\" entry of its plugin.json: either \"entry\" (a module written for the page) or \"native\" and \"impl\" (the functions of its native spec, in JavaScript). "
     "A native side with neither still loads, and each call of it throws ZnUnsupported in an export; under zinc dev --target web the dev bridge runs it on your machine.",
     "Use a plugin that has a web entry, add one (docs/targets/web.md, \"Plugins\"), or keep the calls behind supports() of zinc:browser.",
     "import { Process } from 'zinc:process';   // W0602: the native side 'Process' has no browser backend"},
    {"W0603", "The program calls a native service the web target does not have",
     "The bundle calls a host service with no equivalent on a page: raw sockets and TLS, processes and signals, the native layout engine (Yoga), asset packs, the native event loop. "
     "The call throws ZnUnsupported at run time.",
     "Use fetch or WebSocket instead of sockets, keep process and signal code behind a platform check, or use the classic layout (zinc.json ui.layout).",
     "import { spawn } from 'zinc:process';   // W0603: processes and signals"},
    {"W0604", "A video of the app uses a codec some browsers of the target set cannot play",
     "A video asset is played by the browser's own <video> element, so it plays where the browser has the codec: H.264 in MP4 everywhere, VP9 and AV1 in WebM or MP4 in current browsers, "
     "H.265/HEVC only where the machine's decoder does (Safari, Chrome and Edge on supported hardware, Firefox from 134 on hardware that decodes it), AV1 in Safari only on hardware that decodes it. "
     "Containers no browser plays (AVI, MPEG-PS) are reported too. The export reads the codec from the file and compares it with targets/web/browsers.json for the browsers of targets.web.browsers. "
     "A file the browser cannot decode shows a message with a link to download it (player.error says why); nothing crashes.",
     "Encode the video again for the web (ffmpeg -i in.mov -c:v libx264 -pix_fmt yuv420p -movflags +faststart out.mp4, or -c:v libvpx-vp9 out.webm), ship both (a second Player entry, or the one the browser can play: canPlay() of zinc:video), "
     "or drop the browser from targets.web.browsers. --werror turns the warning into a failed export.",
     "player.add('trailer.mp4');   // W0604: clip.mp4 is H.265: not in firefox before 134"},
    {"W0605", "A package of node_modules could not be pre-bundled for the dev server",
     "`zinc dev --target web` bundles the packages the program imports once with esbuild (the way Vite pre-bundles dependencies) and serves them as ES modules; `zinc export --target web` links them into the app. "
     "esbuild refused one: it needs a Node.js built-in (fs, path, net...) a page does not have, it is not installed in node_modules, or a name the program imports from it is not exported.",
     "Run `zinc install` (or `zinc add npm:<package>`) when the package is missing; for a Node built-in use a browser build of the package (its `browser` field or `exports`), or another package. "
     "A package that needs a server (fs, net, child_process) has no place on a page: look for its browser build or use fetch and WebSocket.",
     "import { readFileSync } from 'some-node-only-package';   // W0605: Could not resolve \"fs\""},
  };
  for (const E& e : table)
    if (code == e.code) return std::string(e.code) + ": " + e.title + "\n\nWhy: " + e.why + "\nFix: " + e.fix + "\n\nExample:\n" + e.example + "\n";
  return "";
}

namespace {

// ---- plugins with a browser backend
struct WebPlugin { std::string name, dir, native, impl, module, entry; std::vector<std::string> needs, wasmSources, wasmFlags, wasmExports; std::string wasmName; std::vector<std::pair<std::string, std::string>> scripts; };   // scripts: libraries the plugin loads when it first needs them (name, file): Z.loadScript(name)   // native + impl: a browser backend of the native side; entry: the plugin's module written for the browser
std::vector<WebPlugin> findPlugins(const WebArgs& a, const Cfg& c) {
  std::vector<fs::path> roots = {fs::path(a.engineRoot) / "plugins", fs::path(a.dir) / "plugins"};
  for (const std::string& d : c.pluginDirs) roots.push_back(fs::path(a.dir) / d);
  std::vector<WebPlugin> out;
  std::error_code ec;
  for (const fs::path& r : roots) {
    if (!fs::is_directory(r, ec)) continue;
    for (const auto& e : fs::directory_iterator(r, ec)) {
      const fs::path pj = e.path() / "plugin.json";
      if (!fs::exists(pj, ec)) continue;
      Json j(readAll(pj));
      if (!j.root) continue;
      WebPlugin p;
      p.name = str(j.root, "name", e.path().filename().string());
      p.dir = e.path().string();
      yyjson_val* w = yyjson_obj_get(j.root, "web");
      if (yyjson_is_obj(w)) {
        p.native = str(w, "native");
        p.impl = str(w, "impl");
        p.entry = str(w, "entry");
        p.module = str(j.root, "module");
        yyjson_val* nd = yyjson_obj_get(w, "needs");
        size_t i, n;
        yyjson_val* v;
        if (yyjson_is_arr(nd)) yyjson_arr_foreach(nd, i, n, v) if (yyjson_is_str(v)) p.needs.push_back(yyjson_get_str(v));
        if (yyjson_val* sc = yyjson_obj_get(w, "scripts"); yyjson_is_obj(sc)) {   // {"name": "web/vendor/lib.js"}: published beside the app, loaded by the plugin on first use
          size_t si, sn;
          yyjson_val *sk, *sv;
          yyjson_obj_foreach(sc, si, sn, sk, sv) {   // "file", or {"file": ..., "render": "dom"|"canvas"}: only for that render mode
            if (yyjson_is_str(sv)) p.scripts.push_back({yyjson_get_str(sk), yyjson_get_str(sv)});
            else if (yyjson_is_obj(sv)) p.scripts.push_back({yyjson_get_str(sk), str(sv, "file") + (str(sv, "render").empty() ? "" : "|" + str(sv, "render"))});
          }
        }
        if (yyjson_val* wa = yyjson_obj_get(w, "wasm"); yyjson_is_obj(wa)) {   // native code compiled to WebAssembly: name, sources, flags, exports
          p.wasmName = str(wa, "name", p.name);
          for (const char* k : {"sources", "flags", "exports"}) {
            std::vector<std::string>& to = k[0] == 's' ? p.wasmSources : k[0] == 'f' ? p.wasmFlags : p.wasmExports;
            yyjson_val* arr = yyjson_obj_get(wa, k);
            if (yyjson_is_arr(arr)) yyjson_arr_foreach(arr, i, n, v) if (yyjson_is_str(v)) to.push_back(yyjson_get_str(v));
          }
        }
      }
      out.push_back(p);
    }
  }
  return out;
}

// ---- what the program uses: the staged (unminified) modules
struct Scan {
  std::set<std::string> rows, natives, modules;   // __host_<row>; requireNative('<Name>'); the files and zinc: modules of the program (stage.json)
  std::string text;
};
Scan scanStage(const fs::path& stage) {
  Scan s;
  std::error_code ec;
  {
    Json j(readAll(stage / "stage.json"));
    yyjson_val* arr = j.root ? yyjson_obj_get(j.root, "modules") : nullptr;
    size_t i, n;
    yyjson_val* v;
    if (yyjson_is_arr(arr)) yyjson_arr_foreach(arr, i, n, v) s.modules.insert(str(v, "name"));
  }
  static const std::regex row("__host_([A-Za-z0-9]+)"), nat("requireNative\\d*\\s*\\(\\s*[\"']([A-Za-z0-9_]+)[\"']");   // (the type arguments are blanks after stripping: requireNative      ('Name'))
  for (auto it = fs::recursive_directory_iterator(stage, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (!it->is_regular_file() || it->path().extension() != ".js") continue;
    const std::string t = readAll(it->path());
    for (auto m = std::sregex_iterator(t.begin(), t.end(), row); m != std::sregex_iterator(); ++m) s.rows.insert((*m)[1]);
    for (auto m = std::sregex_iterator(t.begin(), t.end(), nat); m != std::sregex_iterator(); ++m) s.natives.insert((*m)[1]);
  }
  return s;
}
// the rows targets/web/runtime.js answers: its `rows` table, names with the prefixes of the host rows
std::set<std::string> implementedRows(const std::string& runtime) {
  std::set<std::string> out;
  const std::size_t a = runtime.find("const rows = {"), b = runtime.find("const frameSignals");
  if (a == std::string::npos || b == std::string::npos) return out;
  const std::string t = runtime.substr(a, b - a);
  static const std::regex name("\\b((?:gfx|sys|fs|assets|storage)[A-Z][A-Za-z0-9]*):");
  for (auto m = std::sregex_iterator(t.begin(), t.end(), name); m != std::sregex_iterator(); ++m) out.insert((*m)[1]);
  return out;
}
// targets/web/rows-*.js: host rows answered by their own file (zinc:gl, runtime shaders), loaded into native.js only when the program calls one of them
struct RowFile { std::string text; std::set<std::string> names; };
std::vector<RowFile> rowFiles(const std::string& dir) {
  std::vector<RowFile> out;
  std::error_code ec;
  std::vector<fs::path> paths;
  for (const auto& e : fs::directory_iterator(dir, ec)) { const std::string n = e.path().filename().string(); if (n.rfind("rows-", 0) == 0 && e.path().extension() == ".js") paths.push_back(e.path()); }
  std::sort(paths.begin(), paths.end());
  static const std::regex key("\n  ([a-z][A-Za-z0-9]*): ");
  for (const fs::path& p : paths) {
    RowFile f; f.text = readAll(p);
    for (auto m = std::sregex_iterator(f.text.begin(), f.text.end(), key); m != std::sregex_iterator(); ++m) f.names.insert((*m)[1]);
    out.push_back(std::move(f));
  }
  return out;
}
// what a missing row stands for, for the report
std::string rowWhy(const std::string& r) {
  auto starts = [&](const char* p) { return r.rfind(p, 0) == 0; };
  if (starts("sock") || starts("net") || starts("http") || starts("tls") || starts("mqtt") || starts("osc") || starts("dns") || starts("crypto")) return "raw sockets, TLS or crypto services (use fetch, WebSocket or crypto.subtle)";
  if (starts("proc") || starts("sig") || starts("stdin")) return "processes and signals";
  if (starts("layout")) return "the React Native layout engine (Yoga): use the classic layout in the browser";
  if (starts("ev") || starts("loop")) return "the native event loop";
  if (starts("assets")) return "asset groups and packs";
  return "a native service";
}

// The codec and the container of a video file, read from its bytes (the head and the tail: an MP4 may keep its index at the end): "hevc", "av1", "vp9", "vp8", "h264" or "".
std::string sniffVideoCodec(const fs::path& f) {
  std::ifstream in(f, std::ios::binary);
  if (!in) return "";
  std::error_code ec;
  const std::size_t size = static_cast<std::size_t>(fs::file_size(f, ec)), part = 6u << 20;
  std::string b(std::min(size, part), '\0');
  in.read(&b[0], static_cast<std::streamsize>(b.size()));
  if (size > part) { std::string t(std::min(size - part, part), '\0'); in.seekg(static_cast<std::streamoff>(size - t.size())); in.read(&t[0], static_cast<std::streamsize>(t.size())); b += t; }
  auto has = [&](const char* k) { return b.find(k) != std::string::npos; };
  if (has("hvc1") || has("hev1") || has("V_MPEGH/ISO/HEVC")) return "hevc";
  if (has("av01") || has("V_AV1")) return "av1";
  if (has("vp09") || has("V_VP9")) return "vp9";
  if (has("V_VP8") || has("vp08")) return "vp8";
  if (has("avc1") || has("avc3") || has("V_MPEG4/ISO/AVC")) return "h264";
  return "";
}
std::vector<std::pair<std::string, std::string>> videoAssets(const WebArgs& a);

// W0604: each video asset against the browsers of the target set
std::string videoReport(const WebArgs& a, const std::string& browsersJson, const std::string& browsers) {
  std::string out;
  for (const auto& [name, file] : videoAssets(a)) {
    const std::string ext = lower(fs::path(name).extension().string());
    if (ext == ".avi" || ext == ".mpg" || ext == ".ts") { out += "warning W0604: " + name + " is in a container no browser plays (" + ext.substr(1) + "): convert it to MP4 (H.264) or WebM (VP9); the page shows a download link instead\n"; continue; }
    const std::string codec = sniffVideoCodec(file);
    const char* feat = codec == "hevc" ? "codecHEVC" : codec == "av1" ? "codecAV1" : codec == "vp9" ? "codecVP9" : "";
    std::string r = feat[0] ? webCheckReport(browsersJson, browsers, {feat}, "video " + name) : "";
    if (ext == ".webm" || codec == "vp9" || codec == "vp8") r += webCheckReport(browsersJson, browsers, {"containerWebM"}, "video " + name);
    for (std::size_t at; (at = r.find("W0601")) != std::string::npos;) r.replace(at, 5, "W0604");
    out += r;
  }
  return out;
}

int run(const std::string& cmd) {
  const int rc = std::system(cmd.c_str());
#ifdef _WIN32
  return rc;
#else
  return rc == -1 ? 1 : (WIFEXITED(rc) ? WEXITSTATUS(rc) : 1);
#endif
}

// ---- the files every export (and the dev server) shares
std::string runtimeDir(const WebArgs& a) { return (fs::path(a.engineRoot) / "targets" / "web").string(); }

// native.js: the module `zinc:native` resolves to in the page, and the browser backends of the plugins the program uses
std::string nativeJs(const std::vector<WebPlugin>& used, const std::vector<std::string>& rowJs = {}) {
  std::string js =
      "const Z = globalThis.__zincWeb;\n"
      "export const NativeModule = undefined;\n"
      "export function requireNative(name) {\n"
      "  return new Proxy({}, { get(t, k) {\n"
      "    if (typeof k !== 'string') return undefined;\n"
      "    if (k in t) return t[k];\n"
      "    const e = Z.nativeOf(name), f = e && e.impl[k];\n"
      "    if (!e && Z.bridge && Z.bridge.has(name)) return t[k] = (...a) => Z.bridge.call(name, k, a);   // zinc dev: the native side on this machine\n"
      "    return t[k] = typeof f === 'function' ? f.bind(e.impl) : () => { throw new Z.ZnUnsupported('plugin ' + name + '.' + k, e ? 'its browser backend does not have it' : 'the plugin has no browser backend (docs/targets/web.md, \"The dev bridge\")'); };\n"
      "  } });\n"
      "}\n";
  for (const std::string& r : rowJs) js += "// ---- host rows\n(() => {\n" + r + "\n})();\n";
  for (const WebPlugin& p : used) if (!p.impl.empty()) js += "// ---- plugin " + p.name + "\n(() => {\n" + readAll(fs::path(p.dir) / p.impl) + "\n})();\n";
  return js;
}

// A plugin's native code as one WebAssembly module (zig cc -target wasm32-wasi, a reactor): built once and kept by the hash of its sources, flags and exports.
// Returns the path of the .wasm, "" with `err` set when the pinned zig or the build fails.
std::string buildWasm(const WebPlugin& p, std::string& err) {
  std::string zig;
  if (!zn::tc::ensureZig(zig, err)) return "";
  std::string key = zig + "\n";
  for (const std::string& f : p.wasmFlags) key += f + "\n";
  for (const std::string& f : p.wasmExports) key += f + "\n";
  for (const std::string& s : p.wasmSources) key += s + zn::tc::sha256File((fs::path(p.dir) / s).string()) + "\n";
  const fs::path dir = fs::path(zn::tc::home()) / "cache" / "web-wasm" / hash10(key), out = dir / (p.wasmName + ".wasm");
  std::error_code ec;
  if (fs::exists(out, ec)) return out.string();
  fs::create_directories(dir, ec);
  std::string cmd = q(zig) + " cc -target wasm32-wasi -w -mexec-model=reactor -Wl,--no-entry -Wl,--strip-all";
  for (const std::string& f : p.wasmFlags) cmd += " " + q(f);
  for (const std::string& e : p.wasmExports) cmd += " -Wl,--export=" + e;
  for (const std::string& s : p.wasmSources) cmd += " " + q((fs::path(p.dir) / s).string());
  cmd += " -o " + q(out.string());
  const std::string logf = (dir / "build.log").string();
  if (run("cd " + q(p.dir) + " && " + cmd + " > " + q(logf) + " 2>&1") != 0) { err = "the WebAssembly build of plugin " + p.name + " failed:\n" + readAll(logf); fs::remove(out, ec); return ""; }
  return out.string();
}

struct Common {
  Cfg cfg;
  std::vector<WebPlugin> used;
  std::vector<std::string> needs, unsupported;   // features of browsers.json; rows without an answer
  std::string report;                            // the warnings, one per line
  std::string browsersJson, runtime;
  std::vector<std::pair<std::string, std::string>> wasmOut;   // the native code of plugins built for the page: module name, url
  std::vector<std::pair<std::string, std::string>> scriptOut;   // the libraries plugins load on first use: name, url
  std::vector<std::string> rowJs;   // the rows-*.js files the program needs (loaded into native.js)
};
// `bundle`: the minified bundle, whose reachable code names the host rows the program really calls ("" in dev: the staged modules hold unused code too, so every row they name gets a stub and nothing is reported)
Common analyse(const WebArgs& a, const fs::path& stage, const std::string& bundle = "") {
  Common c;
  c.cfg = readCfg(a);
  if (!a.render.empty()) c.cfg.render = a.render;
  c.browsersJson = readAll(fs::path(runtimeDir(a)) / "browsers.json");
  c.runtime = readAll(fs::path(runtimeDir(a)) / "runtime.js");
  const Scan sc = scanStage(stage);
  const std::vector<WebPlugin> all = findPlugins(a, c.cfg);
  std::set<std::string> claimed;
  for (const WebPlugin& p : all) {
    const std::string under = fs::path(p.dir).lexically_normal().string() + "/";   // a module of this plugin is in the program (stage.json names the files)
    bool inside = false;
    for (const std::string& m : sc.modules) if (m.rfind(under, 0) == 0) { inside = true; break; }
    const bool viaNative = !p.native.empty() && !p.impl.empty() && sc.natives.count(p.native), viaEntry = !p.entry.empty() && inside;
    if (!viaNative && !viaEntry) continue;
    c.used.push_back(p);
    if (viaNative) claimed.insert(p.native);
  }
  std::set<std::string> needs;
  {
    Json j(c.browsersJson);
    yyjson_val* core = j.root ? yyjson_obj_get(j.root, "core") : nullptr;
    size_t i, n;
    yyjson_val* v;
    if (yyjson_is_arr(core)) yyjson_arr_foreach(core, i, n, v) if (yyjson_is_str(v)) needs.insert(yyjson_get_str(v));
    if (c.cfg.render == "dom") { needs.erase("canvas2d"); needs.erase("roundRect"); }
  }
  const std::string browsers = !a.browsers.empty() ? a.browsers : c.cfg.browsers;
  std::string warnings = webCheckReport(c.browsersJson, browsers, std::vector<std::string>(needs.begin(), needs.end()), "the web host");
  for (const WebPlugin& p : c.used) warnings += webCheckReport(c.browsersJson, browsers, p.needs, "plugin " + p.name);
  for (const std::string& nm : sc.natives) if (!claimed.count(nm)) warnings += "warning W0602: the native side '" + nm + "' has no browser backend (a plugin's web entry): its calls throw ZnUnsupported (docs/targets/web.md, \"The dev bridge\")\n";
  std::set<std::string> have = implementedRows(c.runtime);
  const std::vector<RowFile> rf = rowFiles(runtimeDir(a));
  for (const RowFile& f : rf) have.insert(f.names.begin(), f.names.end());
  std::set<std::string> why;
  std::set<std::string> rows = sc.rows;
  if (!bundle.empty()) { rows.clear(); static const std::regex rr("__host_([A-Za-z0-9]+)"); for (auto m = std::sregex_iterator(bundle.begin(), bundle.end(), rr); m != std::sregex_iterator(); ++m) rows.insert((*m)[1]); }
  for (const RowFile& f : rf) { bool uses = false; for (const std::string& n : f.names) if (rows.count(n)) { uses = true; break; } if (uses) c.rowJs.push_back(f.text); }
  if (rows.count("glCreate")) warnings += webCheckReport(c.browsersJson, browsers, {"webgl2"}, "zinc:gl");   // a WebGL 1 program runs on a WebGL 1 context, but most programs of the web target want WebGL 2
  for (const std::string& r : rows) {
    if (have.count(r)) continue;
    c.unsupported.push_back(r);
    if (r.rfind("layout", 0) != 0 || c.cfg.rnLayout) why.insert(rowWhy(r));   // the layout rows are in zinc:ui whatever the layout: reported only when zinc.json asks for rn
  }
  if (!bundle.empty()) for (const std::string& w : why) warnings += "warning W0603: the program calls " + w + ": it throws ZnUnsupported in the browser\n";
  for (const WebPlugin& p : c.used) for (const std::string& n : p.needs) needs.insert(n);
  c.needs.assign(needs.begin(), needs.end());
  c.report = warnings;
  return c;
}

std::string minify(const std::string& esbuild, const std::string& in, const std::string& out) {
  const std::string cmd = q(esbuild) + " " + q(in) + " --minify --format=esm --target=es2022 --legal-comments=none --log-level=error --outfile=" + q(out);
  return run(cmd) == 0 ? "" : "esbuild failed on " + in;
}
std::string mime(const std::string& path) {
  const std::string e = lower(fs::path(path).extension().string());
  static const std::map<std::string, std::string> m = {{".html", "text/html; charset=utf-8"}, {".js", "text/javascript; charset=utf-8"}, {".mjs", "text/javascript; charset=utf-8"}, {".json", "application/json"},
    {".css", "text/css"}, {".png", "image/png"}, {".jpg", "image/jpeg"}, {".jpeg", "image/jpeg"}, {".webp", "image/webp"}, {".gif", "image/gif"}, {".svg", "image/svg+xml"}, {".wasm", "application/wasm"},
    {".webmanifest", "application/manifest+json"}, {".ttf", "font/ttf"}, {".otf", "font/otf"}, {".woff", "font/woff"}, {".woff2", "font/woff2"}, {".mp3", "audio/mpeg"}, {".ogg", "audio/ogg"},
    {".wav", "audio/wav"}, {".m4a", "audio/mp4"}, {".mp4", "video/mp4"}, {".m4v", "video/mp4"}, {".webm", "video/webm"}, {".ogv", "video/ogg"}, {".mov", "video/quicktime"}, {".map", "application/json"}, {".txt", "text/plain; charset=utf-8"}, {".bin", "application/octet-stream"}};
  auto it = m.find(e);
  return it == m.end() ? "application/octet-stream" : it->second;
}

struct Asset { std::string name, file, url; std::size_t size = 0; bool image = false, stream = false; std::string font; };   // stream: a video, fetched by its <video> element from its url, not before the app starts
// zinc.json's "assets": "dir" (n3ds-platformer reads platformer's), `assets` without one; the page names each file "assets/<path in it>"
fs::path assetsRoot(const std::string& dir) {
  zn::frontend::Project p;
  std::string err;
  const std::string pf = zn::frontend::findProjectFile(dir);
  if (!pf.empty()) zn::frontend::parseProject(readAll(pf), p, err);
  return (fs::path(dir) / p.assets.dir).lexically_normal();
}
std::vector<Asset> listAssets(const std::string& dir) {
  std::vector<Asset> out;
  const fs::path root = assetsRoot(dir);
  std::error_code ec;
  if (!fs::is_directory(root, ec)) return out;
  static const std::set<std::string> images = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"}, fonts = {".ttf", ".otf", ".woff", ".woff2"}, videos = {".mp4", ".m4v", ".mov", ".webm", ".ogv", ".mkv", ".avi", ".ts"};
  std::vector<fs::path> files;
  for (auto it = fs::recursive_directory_iterator(root, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) if (it->is_regular_file()) files.push_back(it->path());
  std::sort(files.begin(), files.end());
  for (const fs::path& f : files) {
    Asset a;
    a.name = "assets/" + f.lexically_relative(root).generic_string();   // lexically: a symlinked asset keeps its own name
    a.file = f.string();
    a.size = static_cast<std::size_t>(fs::file_size(f, ec));
    const std::string e = lower(f.extension().string());
    a.image = images.count(e) > 0;
    a.stream = videos.count(e) > 0;
    if (fonts.count(e)) a.font = f.stem().string();
    out.push_back(a);
  }
  return out;
}
// zinc:i18n reads the engine's catalogs (i18n/<lang>/<area>.json): a program that imports it gets them as files of the page, under the same names
std::vector<Asset> catalogAssets(const WebArgs& a, const fs::path& stage) {
  std::vector<Asset> out;
  if (readAll(stage / "stage.json").find("\"name\":\"zinc:i18n\"") == std::string::npos) return out;
  const fs::path root = fs::path(a.engineRoot) / "i18n";
  std::error_code ec;
  for (auto it = fs::recursive_directory_iterator(root, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (!it->is_regular_file() || it->path().extension() != ".json") continue;
    Asset as;
    as.name = "i18n/" + it->path().lexically_relative(root).generic_string();
    as.file = it->path().string();
    as.size = static_cast<std::size_t>(fs::file_size(it->path(), ec));
    out.push_back(as);
  }
  std::sort(out.begin(), out.end(), [](const Asset& x, const Asset& y) { return x.name < y.name; });
  return out;
}

// The asset build of a project whose zinc.json has asset rules or groups (sprite atlases, tilemaps: what zinc run builds into build/assets/<target>), made for the
// web target and its packs unpacked into `out`: the page reads each entry by its name, as zinc:assets does from a pack. Nothing for a project without rules.
std::vector<Asset> builtAssets(const std::string& dir, const fs::path& out, std::string& err) {
  std::vector<Asset> r;
  const std::string pf = zn::frontend::findProjectFile(dir);
  zn::frontend::Project p;
  if (pf.empty() || !zn::frontend::parseProject(readAll(pf), p, err) || !p.assets.packed()) { err.clear(); return r; }
  if (!buildAssets(dir, "web", false, err)) return r;
  static const std::set<std::string> images = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"}, videos = {".mp4", ".m4v", ".mov", ".webm", ".ogv"};
  std::error_code ec;
  for (const auto& f : fs::directory_iterator(fs::path(dir) / "build" / "assets" / "web", ec)) {
    if (f.path().extension() != ".zpk") continue;
    const std::string data = readAll(f.path());
    zn::zpk::Reader pack;
    if (!pack.open(data.data(), data.size(), err)) { err = f.path().string() + ": " + err; return r; }
    for (std::size_t i = 0; i < pack.count(); ++i) {
      const zn::zpk::Entry e = pack.entry(i);
      if (fs::exists(fs::path(dir) / p.assets.dir / std::string(e.name), ec)) continue;   // the source itself is an asset of the page already
      std::string bytes;
      if (!pack.read(i, bytes, err)) { err = f.path().string() + ": " + err; return r; }
      bool image = false;
      if (bytes.size() > 16 && bytes.compare(0, 4, "ZIM1") == 0 && bytes[4] == 1) {   // a cooked rgba8 picture (include/zn/zim.h): a PNG the browser decodes
        auto* p = reinterpret_cast<const std::uint8_t*>(bytes.data());
        const int w = static_cast<int>(p[8] | p[9] << 8 | p[10] << 16 | static_cast<std::uint32_t>(p[11]) << 24), h = static_cast<int>(p[12] | p[13] << 8 | p[14] << 16 | static_cast<std::uint32_t>(p[15]) << 24);
        if (w > 0 && h > 0 && bytes.size() >= 16 + static_cast<std::size_t>(w) * h * 4) {
          std::vector<std::uint8_t> px(p + 16, p + 16 + static_cast<std::size_t>(w) * h * 4);
          if ((p[6] | p[7] << 8) & 1)   // premultiplied: a canvas takes straight alpha
            for (std::size_t k = 0; k < px.size(); k += 4) if (px[k + 3] && px[k + 3] < 255) for (int c = 0; c < 3; ++c) px[k + c] = static_cast<std::uint8_t>(std::min(255, px[k + c] * 255 / px[k + 3]));
          const std::vector<std::uint8_t> png = zn::res::encodePng(px.data(), w, h, 4);
          bytes.assign(png.begin(), png.end());
          image = true;
        }
      }
      Asset a;
      a.name = std::string(e.name);
      a.file = (out / a.name).string();
      fs::create_directories(fs::path(a.file).parent_path(), ec);
      writeAll(a.file, bytes);
      a.size = bytes.size();
      const std::string x = lower(fs::path(a.name).extension().string());
      a.image = image || images.count(x) > 0;
      a.stream = videos.count(x) > 0;
      r.push_back(a);
    }
  }
  return r;
}

// zinc dev: the media files a program reads by their path in the project, outside assets/ (examples/hero's media/bbb.mp4), served at /__project/ with byte ranges
std::vector<Asset> projectMedia(const std::string& dir) {
  std::vector<Asset> out;
  static const std::set<std::string> media = {".mp4", ".m4v", ".mov", ".webm", ".ogv", ".mp3", ".m4a", ".ogg", ".wav", ".flac"};
  std::error_code ec;
  for (auto it = fs::recursive_directory_iterator(dir, fs::directory_options::skip_permission_denied, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
    const std::string n = it->path().filename().string();
    if (it->is_directory() && (n == "assets" || n == "build" || n == "dist" || n == "node_modules" || n[0] == '.')) { it.disable_recursion_pending(); continue; }
    if (!it->is_regular_file() || !media.count(lower(it->path().extension().string()))) continue;
    Asset a;
    a.name = it->path().lexically_relative(dir).generic_string();
    a.file = it->path().string();
    a.url = "./__project/" + a.name;
    a.size = static_cast<std::size_t>(fs::file_size(it->path(), ec));
    a.stream = true;
    out.push_back(a);
  }
  return out;
}

std::vector<std::pair<std::string, std::string>> videoAssets(const WebArgs& a) {
  std::vector<std::pair<std::string, std::string>> v;
  for (const Asset& as : listAssets(a.dir)) if (as.stream) v.push_back({as.name, as.file});
  return v;
}

std::string pageFor(const Cfg& c, const std::string& config, const std::string& preloads, bool dev, bool pwa, bool hasIcon, const std::string& iconUrl, const std::string& nativeUrl) {
  std::string h = "<!doctype html>\n<html lang=\"" + c.lang + "\"" + (c.dir.empty() ? "" : " dir=\"" + c.dir + "\"") + ">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n";
  if (c.render == "dom") h += "<meta name=\"color-scheme\" content=\"light dark\">\n";   // form controls and scrollbars follow the scheme the app is in (the page sets colorScheme as zinc:ui's scheme changes)
  auto esc = [](const std::string& s) { std::string r; for (char ch : s) { if (ch == '<') r += "&lt;"; else if (ch == '&') r += "&amp;"; else if (ch == '"') r += "&quot;"; else r += ch; } return r; };
  h += "<title>" + esc(c.title) + "</title>\n";
  if (!c.description.empty()) h += "<meta name=\"description\" content=\"" + esc(c.description) + "\">\n";
  h += "<meta name=\"theme-color\" content=\"" + esc(c.theme) + "\">\n";
  if (hasIcon) h += "<link rel=\"icon\" href=\"" + iconUrl + "\">\n<link rel=\"apple-touch-icon\" href=\"" + iconUrl + "\">\n";
  else h += "<link rel=\"icon\" href=\"data:,\">\n";   // no icon configured: an empty one, so the browser does not ask for /favicon.ico (a 404 in every console)
  if (pwa) h += "<link rel=\"manifest\" href=\"manifest.webmanifest\">\n<meta name=\"mobile-web-app-capable\" content=\"yes\">\n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n";
  h += preloads;
  h += "<style>html,body{margin:0;height:100%;background:" + esc(c.bg) + ";overscroll-behavior:none}#zinc-root{position:fixed;inset:0;overflow:hidden;outline:none}"
       "#zinc-splash{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font:16px system-ui,sans-serif;color:#888;pointer-events:none}"
       "#zinc-progress{width:min(240px,50vw);height:4px;accent-color:" + esc(c.theme) + "}</style>\n";
  h += "<script type=\"importmap\">{\"imports\":{\"zinc:native\":\"" + nativeUrl + "\"}}</script>\n</head>\n<body>\n";
  h += "<div id=\"zinc-root\" tabindex=\"-1\"></div>\n<div id=\"zinc-splash\"><progress id=\"zinc-progress\" max=\"100\" value=\"0\" aria-label=\"loading\"></progress></div>\n";
  h += "<script>if(location.protocol==='file:'){var z=document.getElementById('zinc-splash');z.style.cssText+=';pointer-events:auto;text-align:center;padding:24px;color:#444';z.textContent='This app cannot start from a file: browsers refuse ES modules there. Run python3 serve.py in this folder (or any static web server) and open the address it prints.'}</script>\n";
  h += "<noscript>This app needs JavaScript.</noscript>\n<script nomodule>document.body.textContent='This browser is too old for this app (it needs ES modules and import maps).'</script>\n";
  h += "<script id=\"zinc-config\" type=\"application/json\">" + config + "</script>\n";
  (void)dev;
  return h;
}

// the config the runtime reads
std::string configJson(const WebArgs& a, const Cfg& c, const Common& cm, const std::vector<Asset>& assets, const std::string& entry, bool dev, const std::string& domModule, const std::string& hmrModule) {
  std::string j = "{\"name\":" + jstr(a.name) + ",\"id\":" + jstr(c.id.empty() ? a.name : c.id) + ",\"title\":" + jstr(c.title) + ",\"version\":" + jstr(a.version) + ",\"render\":" + jstr(c.render) + ",\"scroll\":" + jstr(c.scroll) + ",\"entry\":" + jstr(entry);
  if (c.w > 0 && c.h > 0) j += ",\"fixed\":[" + std::to_string(c.w) + "," + std::to_string(c.h) + "]";
  if (dev) j += ",\"dev\":true,\"hmrModule\":" + jstr(hmrModule);
  if (!domModule.empty()) j += ",\"domModule\":" + jstr(domModule);
  for (const WebPlugin& p : cm.used) if (p.name == "browser") {   // zinc:browser answers shippedBy() from the table
    Json t(cm.browsersJson);
    if (t.root) if (yyjson_val* f = yyjson_obj_get(t.root, "features")) {
      char* txt = yyjson_val_write(f, 0, nullptr);
      if (txt) { j += ",\"browsers\":{\"features\":" + std::string(txt) + "}"; std::free(txt); }
    }
  }
  if (!cm.rowJs.empty()) j += ",\"rows\":true";
  j += ",\"unsupported\":[";
  for (std::size_t i = 0; i < cm.unsupported.size(); ++i) j += (i ? "," : "") + jstr(cm.unsupported[i]);
  j += "],\"wasm\":[";
  for (std::size_t i = 0; i < cm.wasmOut.size(); ++i) j += std::string(i ? "," : "") + "{\"name\":" + jstr(cm.wasmOut[i].first) + ",\"url\":" + jstr(cm.wasmOut[i].second) + "}";
  j += "],\"scripts\":{";
  for (std::size_t i = 0; i < cm.scriptOut.size(); ++i) j += std::string(i ? "," : "") + jstr(cm.scriptOut[i].first) + ":" + jstr(cm.scriptOut[i].second);
  j += "},\"fonts\":[";
  bool first = true;
  for (const Asset& as : assets) if (!as.font.empty()) { j += (first ? "" : ",") + jstr(as.font); first = false; }
  j += "],\"assets\":[";
  for (std::size_t i = 0; i < assets.size(); ++i) {
    const Asset& as = assets[i];
    j += std::string(i ? "," : "") + "{\"name\":" + jstr(as.name) + ",\"url\":" + jstr(as.url) + ",\"size\":" + std::to_string(as.size) + (as.image ? ",\"image\":true" : "") + (as.stream ? ",\"stream\":true" : "") + (as.font.empty() ? "" : ",\"font\":" + jstr(as.font)) + "}";
  }
  return j + "]}";
}

// ---- --prerender: the first screen of a DOM-mode app as HTML in index.html
std::string findChromeBinary() {
  if (const char* e = std::getenv("CHROME")) { std::error_code ec; if (fs::exists(e, ec)) return e; }
  for (const char* c : {"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"}) {
    std::error_code ec;
    if (fs::exists(c, ec)) return c;
  }
  return "";
}
// where the element that opens at `open` ends, counting <div> and </div> (the text and the attributes of a serialised DOM never hold a raw '<')
std::size_t divEnd(const std::string& h, std::size_t open) {
  int depth = 0;
  for (std::size_t i = open; i < h.size();) {
    const std::size_t lt = h.find('<', i);
    if (lt == std::string::npos) break;
    if (h.compare(lt, 4, "<div") == 0 && lt + 4 < h.size() && (h[lt + 4] == ' ' || h[lt + 4] == '>')) ++depth;
    else if (h.compare(lt, 6, "</div>") == 0 && --depth == 0) return lt + 6;
    i = lt + 1;
  }
  return std::string::npos;
}
// Opens the exported folder in headless Chrome, takes the elements and the style sheet the app made for its first screen (the page runs in capture mode: ?zn-capture, which marks the
// elements with the number of their node and writes the rules into the <style>), and puts them into index.html. The runtime adopts those elements instead of building them again.
bool prerenderSite(const fs::path& outDir, std::string& err) {
  const std::string chrome = findChromeBinary();
  if (chrome.empty()) { err = "no Chrome or Chromium found (set CHROME to its path): the page is exported without a prerendered first screen"; return false; }
  const int port = 20000 + static_cast<int>(std::chrono::steady_clock::now().time_since_epoch().count() % 20000);
  const fs::path prof = outDir.parent_path() / ".zinc-prerender", dump = prof / "dump.html";
  std::error_code ec;
  fs::remove_all(prof, ec);
  fs::create_directories(prof, ec);
  const std::string url = "http://127.0.0.1:" + std::to_string(port) + "/?zn-capture";
  run("cd " + q(outDir.string()) + " && { python3 serve.py " + std::to_string(port) + " >/dev/null 2>&1 & srv=$!; sleep 1; " + q(chrome) + " --headless=new --disable-gpu --no-first-run --disable-extensions --user-data-dir=" + q((prof / "profile").string()) +
      " --window-size=1280,800 --virtual-time-budget=6000 --dump-dom " + q(url) + " > " + q(dump.string()) + " 2>/dev/null; kill $srv 2>/dev/null; }");
  const std::string d = readAll(dump);
  fs::remove_all(prof, ec);
  const std::size_t r0 = d.find("<div id=\"zinc-root\"");
  if (r0 == std::string::npos) { err = "Chrome did not return the page"; return false; }
  const std::size_t r1 = divEnd(d, r0);
  if (r1 == std::string::npos) { err = "the page's elements could not be read"; return false; }
  std::string root = d.substr(r0, r1 - r0);
  if (root.find("data-z=") == std::string::npos) { err = "the app drew nothing in six seconds: nothing to prerender"; return false; }
  root.insert(std::string("<div id=\"zinc-root\"").size(), " data-prerendered");
  std::string css;
  const std::size_t s0 = d.find("<style id=\"zinc-css\">");
  if (s0 != std::string::npos) { const std::size_t s1 = d.find("</style>", s0); if (s1 != std::string::npos) css = d.substr(s0 + std::string("<style id=\"zinc-css\">").size(), s1 - s0 - std::string("<style id=\"zinc-css\">").size()); }
  std::string page = readAll(outDir / "index.html");
  const std::size_t p0 = page.find("<div id=\"zinc-root\"");
  if (p0 == std::string::npos) { err = "index.html has no #zinc-root"; return false; }
  const std::size_t p1 = divEnd(page, p0);
  if (p1 == std::string::npos) { err = "index.html is not as expected"; return false; }
  page = page.substr(0, p0) + root + page.substr(p1);
  const std::size_t h0 = page.find("<script type=\"importmap\">");
  if (!css.empty() && h0 != std::string::npos) page.insert(h0, "<style id=\"zinc-css-pre\">" + css + "</style>\n");
  writeAll(outDir / "index.html", page);
  for (const char* ext : {".gz", ".br"}) fs::remove(outDir / (std::string("index.html") + ext), ec);
  const std::string f = q((outDir / "index.html").string());
  if (run("command -v gzip >/dev/null 2>&1") == 0) run("gzip -9 -c " + f + " > " + f.substr(0, f.size() - 1) + ".gz'");
  if (run("command -v brotli >/dev/null 2>&1") == 0) run("brotli -q 11 -c " + f + " > " + f.substr(0, f.size() - 1) + ".br'");
  return true;
}

// ====================================================================== export
int exportSite(const WebArgs& a, const std::string& tmpName) {
  std::string err;
  const fs::path tmp = fs::path(a.dir) / "build" / tmpName;
  std::error_code ec;
  fs::remove_all(tmp, ec);
  fs::create_directories(tmp, ec);
  // 1. what the program uses, from the staged modules (unminified)
  if (run("ZINC_BACKGROUND=1 " + q(selfExe()) + " --profile web " + (zn::frontend::force() ? "--force " : "") + "bundle " + q(a.dir) + " --stage " + q((tmp / "stage").string()) + " > " + q((tmp / "stage.log").string()) + " 2>&1") == 3) {
    // a package of node_modules: the scan reads the bundle instead (its names are minified there, so the plugin report is thinner)
    fs::create_directories(tmp / "stage", ec);
  }
  // 2. the bundle: its reachable code names the host rows the program calls
  const std::string appJs = (tmp / "app.js").string();
  if (run("ZINC_BACKGROUND=1 " + q(selfExe()) + " --profile web " + (zn::frontend::force() ? "--force " : "") + "bundle " + q(a.dir) + " --minify" + (a.sourcemap ? " --sourcemap" : "") + " -o " + q(appJs)) != 0) { std::fprintf(stderr, "zinc export: the bundle failed\n"); return 1; }
  Common cm = analyse(a, tmp / "stage", readAll(appJs));
  cm.report += videoReport(a, cm.browsersJson, !a.browsers.empty() ? a.browsers : cm.cfg.browsers);
  std::fputs(cm.report.c_str(), stderr);
  std::set<std::string> warned;
  const bool warns = !cm.report.empty();
  if (a.check) {
    std::printf("web: %s render, browsers %s, %zu plugin backend(s)%s\n", cm.cfg.render.c_str(), (!a.browsers.empty() ? a.browsers : !cm.cfg.browsers.empty() ? cm.cfg.browsers : kBaseline).c_str(), cm.used.size(), warns ? "" : ", nothing to warn about");
    return warns && (a.strict || cm.cfg.strict) ? 1 : 0;
  }
  if (warns && (a.strict || cm.cfg.strict)) { std::fprintf(stderr, "zinc export: --werror: the warnings above fail the export\n"); return 1; }
  std::string esbuild;
  if (!zn::tc::ensureEsbuild(esbuild, err)) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
  // 3. the runtime, the native glue and (DOM mode) the DOM painter, minified
  fs::create_directories(tmp / "rt", ec);
  writeAll(tmp / "rt" / "native.js", nativeJs(cm.used, cm.rowJs));
  for (const char* f : {"runtime.js", "dom.js"}) fs::copy_file(fs::path(runtimeDir(a)) / f, tmp / "rt" / f, fs::copy_options::overwrite_existing, ec);
  std::map<std::string, std::string> out;   // published name -> bytes
  auto publish = [&](const std::string& base, const std::string& ext, const std::string& bytes) {
    const std::string name = base + "." + hash10(bytes) + ext;
    out[name] = bytes;
    return name;
  };
  for (const WebPlugin& p : cm.used) {   // native code of a plugin, built for the page
    if (p.wasmSources.empty()) continue;
    const std::string built = buildWasm(p, err);
    if (built.empty()) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
    cm.wasmOut.push_back({p.wasmName, publish(p.wasmName, ".wasm", readAll(built))});
  }
  for (const WebPlugin& p : cm.used) for (const auto& [name, spec] : p.scripts) {
    const std::size_t bar = spec.find('|');
    if (bar != std::string::npos && spec.substr(bar + 1) != cm.cfg.render) continue;
    cm.scriptOut.push_back({name, publish(name, ".js", readAll(fs::path(p.dir) / spec.substr(0, bar)))});
  }
  const std::string appName = publish("app", ".js", readAll(appJs));
  if (a.sourcemap && fs::exists(appJs + ".map")) out[appName + ".map"] = readAll(appJs + ".map");
  const bool dom = cm.cfg.render == "dom";
  std::string runtimeName, domName, nativeName;
  for (const char* f : {"native.js", "runtime.js", "dom.js"}) {
    if (!dom && std::strcmp(f, "dom.js") == 0) continue;
    const std::string mini = (tmp / "rt" / (std::string("min-") + f)).string();
    if (const std::string e = minify(esbuild, (tmp / "rt" / f).string(), mini); !e.empty()) { std::fprintf(stderr, "zinc export: %s\n", e.c_str()); return 1; }
    const std::string base = std::string(f).substr(0, std::strlen(f) - 3);
    const std::string n = publish(base == "runtime" ? "zinc" : base, ".js", readAll(mini));
    (base == "runtime" ? runtimeName : base == "dom" ? domName : nativeName) = n;
  }
  // 4. the assets, named by their content (and what the asset build made of them: atlases, tilemaps)
  std::vector<Asset> assets = listAssets(a.dir);
  for (Asset& as : catalogAssets(a, tmp / "stage")) assets.push_back(as);
  {
    std::string berr;
    for (Asset& as : builtAssets(a.dir, tmp / "built", berr)) assets.push_back(as);
    if (!berr.empty()) { std::fprintf(stderr, "zinc export: the asset build: %s\n", berr.c_str()); return 1; }
  }
  std::size_t assetBytes = 0;
  for (Asset& as : assets) {
    const std::string bytes = readAll(as.file);
    const fs::path p(as.name);
    const std::string rel = (p.parent_path() / p.stem()).generic_string(), ext = p.extension().string();
    as.url = publish(rel, ext, bytes);
    assetBytes += bytes.size();
  }
  if (assetBytes > (40u << 20)) std::fprintf(stderr, "warning: the assets are %s; the web profile budgets 40 MB of download (they are all fetched before the app starts)\n", humanKb(assetBytes).c_str());
  // 5. the icon, the manifest, the service worker
  std::string iconUrl, iconSizes;
  if (!cm.cfg.icon.empty() && fs::exists(fs::path(a.dir) / cm.cfg.icon, ec)) {
    const std::string bytes = readAll(fs::path(a.dir) / cm.cfg.icon);
    iconUrl = publish("icon", fs::path(cm.cfg.icon).extension().string(), bytes);
    if (bytes.size() > 24 && bytes.compare(1, 3, "PNG") == 0) {
      auto be = [&](int o) { return (static_cast<unsigned char>(bytes[o]) << 24) | (static_cast<unsigned char>(bytes[o + 1]) << 16) | (static_cast<unsigned char>(bytes[o + 2]) << 8) | static_cast<unsigned char>(bytes[o + 3]); };
      iconSizes = std::to_string(be(16)) + "x" + std::to_string(be(20));
    }
  }
  const std::string entryUrl = "./" + appName;
  std::string preloads = "<link rel=\"modulepreload\" href=\"" + runtimeName + "\">\n<link rel=\"modulepreload\" href=\"" + appName + "\">\n<link rel=\"modulepreload\" href=\"" + nativeName + "\">\n";
  if (dom) preloads += "<link rel=\"modulepreload\" href=\"" + domName + "\">\n";
  std::string page = pageFor(cm.cfg, configJson(a, cm.cfg, cm, assets, entryUrl, false, dom ? "./" + domName : "", ""), preloads, false, cm.cfg.pwa && !a.noPwa, !iconUrl.empty(), iconUrl, "./" + nativeName);
  const bool pwa = cm.cfg.pwa && !a.noPwa;
  const bool isolate = std::find(cm.needs.begin(), cm.needs.end(), "crossOriginIsolated") != cm.needs.end();
  page += "<script type=\"module\" src=\"" + runtimeName + "\"></script>\n";
  if (pwa) page += "<script>if('serviceWorker' in navigator&&isSecureContext)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))</script>\n";
  page += "</body>\n</html>\n";
  out["index.html"] = page;
  if (pwa) {
    std::string man = "{\"name\":" + jstr(cm.cfg.title) + ",\"short_name\":" + jstr(cm.cfg.title.substr(0, 12)) + ",\"start_url\":\".\",\"scope\":\".\",\"display\":\"standalone\",\"background_color\":" + jstr(cm.cfg.bg) + ",\"theme_color\":" + jstr(cm.cfg.theme);
    if (!iconUrl.empty()) man += ",\"icons\":[{\"src\":" + jstr(iconUrl) + ",\"sizes\":" + jstr(iconSizes.empty() ? "512x512" : iconSizes) + ",\"type\":" + jstr(mime(iconUrl)) + ",\"purpose\":\"any\"}]";
    out["manifest.webmanifest"] = man + "}\n";
    std::string files = "[\"./\"";
    for (const auto& [n, b] : out) if (!endsWith(n, ".map")) files += "," + jstr(n);
    files += "]";
    std::string sw = "// Generated by zinc export --target web: the app works offline after the first visit. Hashed files are cached for good; the page is fetched fresh when online.\n"
                     "const V = " + jstr("zinc-" + hash10(files)) + ", FILES = " + files + ", ISOLATE = " + (isolate ? "true" : "false") + ";\n"
                     "self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });\n"
                     "self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });\n"
                     "const iso = (r) => { if (!ISOLATE || !r || r.status === 0) return r; const h = new Headers(r.headers); h.set('Cross-Origin-Opener-Policy', 'same-origin'); h.set('Cross-Origin-Embedder-Policy', 'require-corp'); return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h }); };\n"
                     "self.addEventListener('fetch', (e) => {\n"
                     "  const req = e.request;\n"
                     "  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;\n"
                     "  if (req.mode === 'navigate') { e.respondWith(fetch(req).then(iso).catch(() => caches.match('./').then(iso))); return; }\n"
                     "  e.respondWith(caches.match(req).then((r) => r || fetch(req)).then(iso));\n"
                     "});\n";
    out["sw.js"] = sw;
  }
  std::string headers = "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n";
  if (isolate) headers += "  Cross-Origin-Opener-Policy: same-origin\n  Cross-Origin-Embedder-Policy: require-corp\n";
  headers += "\n/index.html\n  Cache-Control: no-cache\n\n/sw.js\n  Cache-Control: no-cache\n\n/*.js\n  Cache-Control: public, max-age=31536000, immutable\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n";
  out["_headers"] = headers;
  out["serve.py"] = R"PY(#!/usr/bin/env python3
# Serves this folder on http://127.0.0.1:8000, preferring the precompressed .br and .gz files and answering Range requests (a <video> needs them to seek).
# Any static host works the same; this is only for a look.
import http.server, os, sys
class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map, **{'.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.webm': 'video/webm', '.mp4': 'video/mp4'})
    left = None
    def send_head(self):
        p = self.translate_path(self.path)
        enc = self.headers.get('Accept-Encoding', '')
        rng = self.headers.get('Range', '')
        self.left = None
        if rng.startswith('bytes=') and os.path.isfile(p):
            size = os.path.getsize(p)
            a, _, b = rng[6:].partition('-')
            start = int(a) if a else max(0, size - int(b or 0))
            end = min(int(b), size - 1) if a and b else size - 1
            if start >= size:
                self.send_error(416); return None
            f = open(p, 'rb'); f.seek(start); self.send_response(206)
            self.send_header('Content-Type', self.guess_type(p)); self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
            self.send_header('Content-Length', str(end - start + 1)); self.send_header('Accept-Ranges', 'bytes'); self.end_headers()
            self.left = end - start + 1
            return f
        for ext, name in (('.br', 'br'), ('.gz', 'gzip')):
            if name in enc and os.path.isfile(p + ext) and os.path.isfile(p):
                f = open(p + ext, 'rb'); self.send_response(200)
                self.send_header('Content-Type', self.guess_type(p)); self.send_header('Content-Encoding', name)
                self.send_header('Content-Length', str(os.fstat(f.fileno()).st_size)); self.end_headers(); return f
        return super().send_head()
    def copyfile(self, src, out):
        if self.left is None: return super().copyfile(src, out)
        out.write(src.read(self.left))
os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 0
for p in ([port] if port else range(8000, 8100)):   # 8000, or the next free port (zinc dev may hold 8000)
    try: srv = http.server.ThreadingHTTPServer(('127.0.0.1', p), H); break
    except OSError:
        if port: raise
print('serving %s on http://127.0.0.1:%d/ (Ctrl-C stops)' % (os.getcwd(), srv.server_address[1]), flush=True)
try: srv.serve_forever()
except KeyboardInterrupt: pass
)PY";
  // 6. write, then the precompressed copies
  fs::path outDir = a.out.empty() ? fs::path(a.dir) / "dist" / (a.name + "-web") : fs::path(a.out);
  fs::remove_all(outDir, ec);
  std::size_t total = 0, gz = 0, br = 0;
  const bool haveGzip = run("command -v gzip >/dev/null 2>&1") == 0, haveBrotli = run("command -v brotli >/dev/null 2>&1") == 0;
  static const std::set<std::string> squeeze = {".js", ".json", ".html", ".css", ".svg", ".txt", ".webmanifest", ".bin", ".wasm", ".ttf", ".otf", ".map"};
  std::vector<std::string> compressed;
  for (const auto& [n, b] : out) {
    if (!writeAll(outDir / n, b)) { std::fprintf(stderr, "zinc export: cannot write %s\n", n.c_str()); return 1; }
    total += b.size();
    if (n == "serve.py") fs::permissions(outDir / n, fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
    if (b.size() < 1000 || !squeeze.count(lower(fs::path(n).extension().string()))) continue;
    const std::string f = q((outDir / n).string());
    if (haveGzip && run("gzip -9 -c " + f + " > " + f.substr(0, f.size() - 1) + ".gz'") == 0) { if (endsWith(n, ".js") && n != "sw.js") gz += fs::file_size(outDir / (n + ".gz"), ec); compressed.push_back(n); }
    if (haveBrotli && run("brotli -q 11 -c " + f + " > " + f.substr(0, f.size() - 1) + ".br'") == 0) { if (endsWith(n, ".js") && n != "sw.js") br += fs::file_size(outDir / (n + ".br"), ec); }
  }
  std::size_t js = 0;
  for (const auto& [n, b] : out) if (endsWith(n, ".js") && n != "sw.js") js += b.size();
  writeAll(outDir / "README.txt", a.name + " " + a.version + " (web) built with Zinc.\nA static site: copy this folder to any static host (GitHub Pages, Netlify, S3, nginx...). index.html and sw.js must not be cached for long; the hashed files may be (_headers has it for Netlify and Cloudflare Pages).\n"
            "./serve.py serves it locally. " + (isolate ? "This app needs cross-origin isolation: _headers sets COOP and COEP, and sw.js adds them on hosts that cannot.\n" : "No COOP/COEP headers are needed.\n"));
  if (a.prerender) {
    if (cm.cfg.render != "dom") std::fprintf(stderr, "warning: --prerender is for --render dom: the canvas has no elements to prerender\n");
    else { std::string perr; if (!prerenderSite(outDir, perr)) std::fprintf(stderr, "warning: --prerender: %s\n", perr.c_str()); else std::printf("web: the first screen is in index.html (prerendered at 1280x800)\n"); }
  }
  std::printf("web: %s render, %zu file(s), %s (javascript %s, gzip %s%s)%s\n", cm.cfg.render.c_str(), out.size(), humanKb(total).c_str(), humanKb(js).c_str(), gz ? humanKb(gz).c_str() : "-",
              br ? (", brotli " + humanKb(br)).c_str() : "", pwa ? ", offline cache" : "");
  std::fflush(stdout); zn::log::step("next", zn::log::shortPath((fs::absolute(outDir) / "serve.py").string()) + ", then open the address it prints; or copy the folder to a static host");
  std::printf("%s\n", outDir.string().c_str());
  return 0;
}

// ====================================================================== dev server
std::atomic<bool> gStop{false};
void onSignal(int) { gStop = true; }

std::string sha1b64(const std::string& in) {   // Sec-WebSocket-Accept: base64(SHA-1(key + GUID))
  const std::string msg = in + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  std::uint32_t h[5] = {0x67452301u, 0xEFCDAB89u, 0x98BADCFEu, 0x10325476u, 0xC3D2E1F0u};
  std::string m = msg;
  const std::uint64_t bits = static_cast<std::uint64_t>(msg.size()) * 8;
  m += static_cast<char>(0x80);
  while (m.size() % 64 != 56) m += static_cast<char>(0);
  for (int i = 7; i >= 0; --i) m += static_cast<char>((bits >> (i * 8)) & 0xff);
  auto rol = [](std::uint32_t v, int s) { return (v << s) | (v >> (32 - s)); };
  for (std::size_t o = 0; o < m.size(); o += 64) {
    std::uint32_t w[80];
    for (int i = 0; i < 16; ++i) w[i] = (static_cast<std::uint32_t>(static_cast<unsigned char>(m[o + i * 4])) << 24) | (static_cast<std::uint32_t>(static_cast<unsigned char>(m[o + i * 4 + 1])) << 16) | (static_cast<std::uint32_t>(static_cast<unsigned char>(m[o + i * 4 + 2])) << 8) | static_cast<unsigned char>(m[o + i * 4 + 3]);
    for (int i = 16; i < 80; ++i) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    std::uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
    for (int i = 0; i < 80; ++i) {
      std::uint32_t f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999u; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1u; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDCu; }
      else { f = b ^ c ^ d; k = 0xCA62C1D6u; }
      const std::uint32_t t = rol(a, 5) + f + e + k + w[i];
      e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
  }
  unsigned char d[20];
  for (int i = 0; i < 5; ++i) for (int j = 0; j < 4; ++j) d[i * 4 + j] = static_cast<unsigned char>(h[i] >> (24 - j * 8));
  static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  for (int i = 0; i < 20; i += 3) {
    const std::uint32_t v = (d[i] << 16) | ((i + 1 < 20 ? d[i + 1] : 0) << 8) | (i + 2 < 20 ? d[i + 2] : 0);
    out += t[(v >> 18) & 63]; out += t[(v >> 12) & 63]; out += i + 1 < 20 ? t[(v >> 6) & 63] : '='; out += i + 2 < 20 ? t[v & 63] : '=';
  }
  return out;
}
std::string wsFrame(const std::string& payload) {
  std::string f(1, static_cast<char>(0x81));
  if (payload.size() < 126) f += static_cast<char>(payload.size());
  else if (payload.size() < 65536) { f += static_cast<char>(126); f += static_cast<char>(payload.size() >> 8); f += static_cast<char>(payload.size() & 255); }
  else { f += static_cast<char>(127); for (int i = 7; i >= 0; --i) f += static_cast<char>((static_cast<std::uint64_t>(payload.size()) >> (i * 8)) & 255); }
  return f + payload;
}
bool sendAll(int fd, const std::string& s) {
  for (std::size_t at = 0; at < s.size();) {
    const long n = zn::plat::sockWrite(fd, s.data() + at, s.size() - at);
    if (n < 0 && errno == EINTR) continue;
    if (n <= 0) return false;
    at += static_cast<std::size_t>(n);
  }
  return true;
}
std::string urlDecode(const std::string& s) {
  std::string r;
  for (std::size_t i = 0; i < s.size(); ++i) {
    if (s[i] == '%' && i + 2 < s.size() && std::isxdigit(static_cast<unsigned char>(s[i + 1])) && std::isxdigit(static_cast<unsigned char>(s[i + 2]))) { r += static_cast<char>(std::stoi(s.substr(i + 1, 2), nullptr, 16)); i += 2; }
    else r += s[i];
  }
  return r;
}

struct DevModule { std::string name; std::vector<std::string> deps; bool user = false; bool refreshable = true; };
struct Dev {
  WebArgs a;
  Common cm;
  fs::path root, stage, site;
  std::mutex m;                                   // the stage and its tables
  std::map<std::string, DevModule> mods;          // staged file -> its record (stage.json)
  std::map<std::string, std::string> hashes;      // staged file -> hash of its text
  std::map<std::string, int> versions;            // staged file -> times it changed since the page loaded
  std::string entry;
  std::mutex wsm;
  std::vector<int> sockets;
  std::map<std::string, std::string> cache;       // "file?v" -> served text
  std::string lastError;
  std::string reloadWhy;                          // why the last restage cannot swap modules in place (restage), for the one line of the save
  std::string depsDir, depsKey;                   // the pre-bundled packages of node_modules (cli_web_deps.h), served at /__deps/
  std::mutex bm;                                  // the bridge's process: a page load restarts it (connection), the watch loop checks it (serve)
  int port = 0;                                   // the port the dev server listens on (serve)
  zn::plat::Pid bridge = -1;                      // the dev bridge (startBridge), -1 when the page needs none or it ended
  int bridgePort = 0;
  bool pageSeen = false;                          // the first page connected (said once)
  bool bridgeUsed = false;                        // a page was served since it started: the next page gets a new one
  std::string bridgeJson;                         // its address and token for the page's config: {"url":...,"token":...}
  std::vector<std::string> bridged;               // the native sides it answers
};

// the module as the page gets it: its imports carry the version of what changed, `import.meta.hot` is its record, and the functions a user module
// exports are forwarded to their latest definition, so the modules that imported the old ones call the new ones (Fast Refresh)
std::string serveModule(Dev& d, const std::string& file, int version) {
  const std::string key = file + "?" + std::to_string(version);
  if (auto it = d.cache.find(key); it != d.cache.end()) return it->second;
  std::string t = readAll(d.stage / file);
  const DevModule* mod = d.mods.count(file) ? &d.mods[file] : nullptr;
  // imports: "./x.js" -> "./x.js?v=N" when x changed
  static const std::regex imp("((?:from\\s*|import\\s*\\(?\\s*)\")(\\.{1,2}/[^\"]+)\"");
  std::string out;
  std::size_t last = 0;
  const fs::path dir = fs::path(file).parent_path();
  for (auto m = std::sregex_iterator(t.begin(), t.end(), imp); m != std::sregex_iterator(); ++m) {
    const std::string target = (dir / (*m)[2].str()).lexically_normal().generic_string();
    auto v = d.versions.find(target);
    out += t.substr(last, static_cast<std::size_t>(m->position()) - last) + (*m)[1].str() + (*m)[2].str() + (v != d.versions.end() && v->second > 0 ? "?v=" + std::to_string(v->second) : "") + "\"";
    last = static_cast<std::size_t>(m->position() + m->length());
  }
  out += t.substr(last);
  std::string tail;
  if (mod && mod->user) {
    std::set<std::string> names;
    static const std::regex ex("(?:^|\\n)export\\s+(?:async\\s+)?function\\*?\\s+([A-Za-z_$][\\w$]*)|(?:^|\\n)export\\s+(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:async\\s*)?(?:function|\\(|[A-Za-z_$][\\w$]*\\s*=>)");
    for (auto m = std::sregex_iterator(out.begin(), out.end(), ex); m != std::sregex_iterator(); ++m) names.insert((*m)[1].matched ? (*m)[1].str() : (*m)[2].str());
    static const std::regex cst("(\\nexport\\s+)const(\\s+)");
    out = std::regex_replace(out, cst, "$1let$2");
    // ponytail: a regex over the text, so `export function` inside a string or a template (ui/forms' script editor) matches too: the typeof guard skips a name the
    // module never declared; a scanner that skips strings and comments if a real collision shows up
    for (const std::string& n : names) tail += "if (typeof " + n + " === 'function') " + n + " = globalThis.__zincRefresh(" + jstr(file) + ", " + jstr(n) + ", " + n + ");\n";
  }
  {   // `import * as ns from 'pkg'`: the pre-bundled package's namespace, whatever it is (a CommonJS package has no static names; esbuild's interop object has them all)
    static const std::regex nsImport("import\\s*\\*\\s*as\\s+([A-Za-z_$][\\w$]*)\\s+from\\s*(\"/__deps/[^\"]+\")");
    out = std::regex_replace(out, nsImport, "import { __zincNs as $1 } from $2");
  }
  out = "import.meta.hot = globalThis.__zincHot(" + jstr(file) + ");\n" + out + "\n" + tail;
  if (d.cache.size() > 4000) d.cache.clear();
  return d.cache[key] = out;
}

// a module may be swapped alone when everything it exports is a function (forwarded to its newest definition) and it exports no state
bool refreshableModule(const std::string& text) {
  static const std::regex stateExport("(?:^|\\n)export\\s+(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*(?!\\s*(?:async\\s*)?(?:function|\\(|[A-Za-z_$][\\w$]*\\s*=>))"), cls("(?:^|\\n)export\\s+(?:default\\s+)?class\\s"), def("(?:^|\\n)export\\s+default\\s+(?!function)");
  return !std::regex_search(text, stateExport) && !std::regex_search(text, cls) && !std::regex_search(text, def);
}

struct Snapshot { std::map<std::string, std::pair<std::int64_t, std::uintmax_t>> f; bool operator==(const Snapshot& o) const { return f == o.f; } };
Snapshot snapshotOf(const fs::path& dir) {
  Snapshot s;
  std::error_code ec;
  if (const std::string lock = lockfileOf(dir.string()); !lock.empty())   // a workspace keeps its lockfile above the project: an install there reloads the page
    s.f[lock] = {static_cast<std::int64_t>(fs::last_write_time(lock, ec).time_since_epoch().count()), fs::file_size(lock, ec)};
  for (auto it = fs::recursive_directory_iterator(dir, fs::directory_options::skip_permission_denied, ec); it != fs::recursive_directory_iterator(); it.increment(ec)) {
    const std::string n = it->path().filename().string();
    if (it->is_directory() && (n == "build" || n == "dist" || n == "node_modules" || n == ".git" || n[0] == '.')) { it.disable_recursion_pending(); continue; }
    if (!it->is_regular_file()) continue;
    s.f[it->path().string()] = {static_cast<std::int64_t>(fs::last_write_time(*it, ec).time_since_epoch().count()), fs::file_size(*it, ec)};
  }
  return s;
}

void broadcast(Dev& d, const std::string& json) {
  std::lock_guard<std::mutex> lock(d.wsm);
  const std::string f = wsFrame(json);
  d.sockets.erase(std::remove_if(d.sockets.begin(), d.sockets.end(), [&](int fd) { if (sendAll(fd, f)) return false; zn::plat::sockClose(fd); return true; }), d.sockets.end());
}

// builds the stage; the files that changed since the last build and whether they can be swapped one by one
// zinc.json "requires" is not checked here (--force) unless --lan: the dev bridge gives the page this machine's file system, processes and native sides.
bool restage(Dev& d, std::string& log, std::vector<std::string>& changed, bool& refreshable, bool first) {
  std::lock_guard<std::mutex> lock(d.m);
  const fs::path logFile = d.root / "stage.log";
  const int rc = run(std::string(d.a.build ? "" : "ZINC_WEB_HOT=1 ") + "ZINC_BACKGROUND=1 " + q(selfExe()) + " --profile web " + (zn::frontend::force() || !d.a.lan ? "--force " : "") + "bundle " + q(d.a.dir) + " --stage " + q(d.stage.string()) + (d.a.prepare.empty() ? "" : " --keep-packages") + " > " + q(logFile.string()) + " 2>&1");
  log = readAll(logFile);
  if (rc != 0) return false;
  Json j(readAll(d.stage / "stage.json"));
  if (!j.root) { log = "stage.json is missing"; return false; }
  std::map<std::string, DevModule> next;
  d.entry = str(j.root, "entry");
  yyjson_val* arr = yyjson_obj_get(j.root, "modules");
  size_t i, n;
  yyjson_val* v;
  yyjson_arr_foreach(arr, i, n, v) {
    DevModule m;
    const std::string file = str(v, "file");
    m.name = str(v, "name");
    m.user = m.name.rfind("/", 0) == 0 && m.name.find("/lib/std/") == std::string::npos && m.name.find("/node_modules/") == std::string::npos;
    size_t k, kn;
    yyjson_val* dv;
    yyjson_arr_foreach(yyjson_obj_get(v, "deps"), k, kn, dv) m.deps.push_back(yyjson_get_str(dv));
    next[file] = m;
  }
  changed.clear();
  refreshable = !first;
  d.reloadWhy.clear();
  for (auto& [file, m] : next) {
    const std::string text = readAll(d.stage / file), h = zn::tc::sha256Hex(text);
    m.refreshable = refreshableModule(text);
    auto old = d.hashes.find(file);
    if (!first && (old == d.hashes.end() || old->second != h)) {
      changed.push_back(file);
      d.versions[file]++;
      if (!m.user || !m.refreshable || file == d.entry || old == d.hashes.end()) {
        refreshable = false;
        if (d.reloadWhy.empty()) {
          const std::string nm = m.user ? fs::path(m.name).lexically_relative(d.a.dir).generic_string() : m.name;
          d.reloadWhy = !m.user ? "a package changed (" + nm + ")" : file == d.entry ? nm + " is the entry" : old == d.hashes.end() ? nm + " is new" : nm + " exports state";
        }
      }
    }
    d.hashes[file] = h;
  }
  d.mods = next;
  d.cache.clear();
  if (d.a.prepare.empty()) {   // the packages of node_modules: pre-bundled once, again only when the lockfile, a package or the set of imports changes (a bundler that prepares the files has its own way)
    const DepsResult dr = prebundleDeps(d.a.dir, readAll(d.stage / "stage.json"));
    if (!dr.error.empty()) { log = dr.error; return false; }
    if (dr.built) std::fprintf(stderr, "zinc dev: packages of node_modules pre-bundled into %s\n", fs::path(dr.dir).lexically_relative(d.a.dir).string().c_str());
    if (!first && dr.key != d.depsKey) { changed.push_back("(packages)"); refreshable = false; if (d.reloadWhy.empty()) d.reloadWhy = "the packages or the lockfile changed"; }
    d.depsDir = dr.dir;
    d.depsKey = dr.key;
  }
  return true;
}

// The dev bridge (targets/web/bridge-host.mjs, docs/targets/web.md): the native sides the page has no browser backend for run on this machine,
// on QuickJS with the plugins' real native code, and the page calls them over loopback with a token. zinc dev only: an export never gets one.
// ponytail: the set of native sides is read once at start; a save that adds a plugin needs zinc dev restarted.
// Starts build/.zinc-web-dev/bridge-host.mjs and waits until it listens on d.bridgePort; false (and nothing running) when it did not.
bool spawnBridge(Dev& d) {
  zn::plat::SpawnOptions o;
  o.newGroup = true;
  o.cwd = d.a.dir;
  o.env = {{"ZINC_BACKGROUND", "1"}, {"ZINC_STEPS", "0"}};
  d.bridge = zn::plat::spawn({selfExe(), "run", (d.root / "bridge-host.mjs").string()}, o);
  for (int k = 0; k < 750 && d.bridge > 0; ++k) {   // up to 15 s: a plugin's native library may be built on first use
    int code = 0;
    if (zn::plat::wait(d.bridge, code, false)) { d.bridge = -1; break; }
    const int s = static_cast<int>(::socket(AF_INET, SOCK_STREAM, 0));
    sockaddr_in a{};
    a.sin_family = AF_INET;
    a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    a.sin_port = htons(static_cast<std::uint16_t>(d.bridgePort));
    const bool up = ::connect(s, reinterpret_cast<sockaddr*>(&a), sizeof a) == 0;
    zn::plat::sockClose(s);
    if (up) return true;
    std::this_thread::sleep_for(std::chrono::milliseconds(20));
  }
  if (d.bridge > 0) zn::plat::stop(d.bridge);
  d.bridge = -1;
  return false;
}

void startBridge(Dev& d) {
  std::set<std::string> claimed;
  for (const WebPlugin& p : d.cm.used) if (!p.native.empty() && !p.impl.empty()) claimed.insert(p.native);
  std::map<std::string, std::string> specs;   // native side -> the spec module that requires it (export default requireNative...)
  static const std::regex nat("requireNative\\d*\\s*\\(\\s*[\"']([A-Za-z0-9_]+)[\"']");
  for (const auto& [file, m] : d.mods) {
    const std::string t = readAll(d.stage / file);
    for (auto it = std::sregex_iterator(t.begin(), t.end(), nat); it != std::sregex_iterator(); ++it) if (!claimed.count((*it)[1])) specs[(*it)[1]] = m.name;
  }
  for (auto it = specs.begin(); it != specs.end();) {   // plugin.json "web": {"bridge": false}: a side that draws (three) would draw on this machine, not in the page
    Json pj(readAll(fs::path(it->second).parent_path().parent_path() / "plugin.json"));
    yyjson_val* w = pj.root ? yyjson_obj_get(pj.root, "web") : nullptr;
    yyjson_val* b = w ? yyjson_obj_get(w, "bridge") : nullptr;
    if (yyjson_is_bool(b) && !yyjson_get_bool(b)) it = specs.erase(it); else ++it;
  }
  bool rows = !d.cm.unsupported.empty();   // the host rows the page lacks (processes, sockets...) and the file system: this machine's, as under zinc run
  for (const auto& [file, m] : d.mods) if (!rows && readAll(d.stage / file).find("__host_fs") != std::string::npos) rows = true;
  if (specs.empty() && !rows) return;
  std::string names;
  for (const auto& [n, f] : specs) { names += (names.empty() ? "" : ", ") + n; d.bridged.push_back(n); }
  if (rows) names += std::string(names.empty() ? "" : ", ") + "the file system and the host services the page lacks";
  if (d.a.lan) { std::fprintf(stderr, "zinc dev: --lan: the native sides %s have no dev bridge (it serves this machine only); their calls throw ZnUnsupported\n", names.c_str()); return; }
  int port = 0;
  {
    const int s = static_cast<int>(::socket(AF_INET, SOCK_STREAM, 0));
    sockaddr_in a{};
    a.sin_family = AF_INET;
    a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    socklen_t len = sizeof a;
    if (::bind(s, reinterpret_cast<sockaddr*>(&a), sizeof a) == 0 && ::getsockname(s, reinterpret_cast<sockaddr*>(&a), &len) == 0) port = ntohs(a.sin_port);
    zn::plat::sockClose(s);
  }
  std::random_device rd;
  const std::string token = zn::tc::sha256Hex(std::to_string(rd()) + std::to_string(rd()) + std::to_string(rd()) + std::to_string(rd())).substr(0, 32);
  std::string js = "// written by zinc dev --target web: the dev bridge of this project (targets/web/bridge-host.mjs)\n", mods;
  int i = 0;
  for (const auto& [n, f] : specs) { js += "import M" + std::to_string(i) + " from " + jstr(f) + ";\n"; mods += (mods.empty() ? "" : ", ") + jstr(n) + ": M" + std::to_string(i); ++i; }
  js += "const mods = { " + mods + " }, PORT = " + std::to_string(port) + ", TOKEN = " + jstr(token) + ";\n" + readAll(fs::path(runtimeDir(d.a)) / "bridge-host.mjs");
  writeAll(d.root / "bridge-host.mjs", js);
  d.bridgePort = port;
  if (!spawnBridge(d)) {
    std::fprintf(stderr, "zinc dev: the dev bridge (%s) did not start (its output is above); their calls throw ZnUnsupported\n", names.c_str());
    return;
  }
  std::string list;
  for (const std::string& n : d.bridged) list += (list.empty() ? "" : ",") + jstr(n);
  d.bridgeJson = "{\"url\":" + jstr("http://127.0.0.1:" + std::to_string(port)) + ",\"token\":" + jstr(token) + ",\"natives\":[" + list + "],\"rows\":" + (rows ? "true" : "false") + "}";
  std::fprintf(stderr, "zinc dev: %s run on this machine through the dev bridge (zinc dev only: an export has no bridge)\n", names.c_str());
}

// A page load gets a new bridge (the same port and token): what the page before it left there (its servers, sockets, children, callbacks whose
// numbers the new page gives again) ends with that process, as a new `zinc run` starts clean. A bridge that ended by itself starts again too.
void renewBridge(Dev& d) {
  std::lock_guard<std::mutex> hold(d.bm);
  if (d.bridgeJson.empty()) return;
  if (d.bridge > 0 && !d.bridgeUsed) { d.bridgeUsed = true; return; }
  if (d.bridge > 0) zn::plat::stop(d.bridge);
  d.bridge = -1;
  if (!spawnBridge(d)) std::fprintf(stderr, "zinc dev: the dev bridge did not start again (its output is above); its calls fail until the next page load\n");
  d.bridgeUsed = true;
}

// The watch loop's check: a bridge that ended while a page used it is said once, with how it ended (its own output, if any, is above)
void checkBridge(Dev& d) {
  std::lock_guard<std::mutex> hold(d.bm);
  int code = 0;
  if (d.bridge <= 0 || !zn::plat::wait(d.bridge, code, false)) return;
  d.bridge = -1;
  std::fprintf(stderr, "zinc dev: the dev bridge ended (%s): the page's native calls fail; reload the page to start it again\n",
               code < 0 ? "killed by a signal" : ("exit code " + std::to_string(code)).c_str());
}

void connection(Dev* d, int fd) {
  std::string req;
  char buf[4096];
  while (req.find("\r\n\r\n") == std::string::npos) {
    const long n = zn::plat::sockRead(fd, buf, sizeof buf);
    if (n <= 0) { zn::plat::sockClose(fd); return; }
    req.append(buf, static_cast<std::size_t>(n));
    if (req.size() > 65536) { zn::plat::sockClose(fd); return; }
  }
  std::istringstream rs(req);
  std::string method, target, ver;
  rs >> method >> target >> ver;
  std::string path = target, query;
  if (const std::size_t qm = target.find('?'); qm != std::string::npos) { path = target.substr(0, qm); query = target.substr(qm + 1); }
  path = urlDecode(path);
  auto header = [&](const std::string& name) {
    const std::string lw = lower(req), key = "\r\n" + lower(name) + ":";
    const std::size_t at = lw.find(key);
    if (at == std::string::npos) return std::string();
    std::size_t b = at + key.size(), e = req.find("\r\n", b);
    while (b < e && req[b] == ' ') ++b;
    return req.substr(b, e - b);
  };
  auto reply = [&](int code, const std::string& type, const std::string& body) {
    const char* text = code == 200 ? "OK" : code == 404 ? "Not Found" : "Bad Request";
    sendAll(fd, "HTTP/1.1 " + std::to_string(code) + " " + text + "\r\nContent-Type: " + type + "\r\nContent-Length: " + std::to_string(body.size()) + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n" + body);
    zn::plat::sockClose(fd);
  };
  // on loopback, a request must name this server as the browser reached it: a DNS rebinding page (its own domain resolved to 127.0.0.1) would
  // otherwise read the bridge's token from the page and the project's files; and the reload socket answers this page only, as a WebSocket
  // has no same-origin rule of its own
  if (!d->a.lan) {
    const std::string host = lower(header("Host")), origin = lower(header("Origin")), p = ":" + std::to_string(d->port);
    const bool hostOk = host == "127.0.0.1" + p || host == "localhost" + p || host == "[::1]" + p;
    if (!hostOk || (!origin.empty() && origin != "http://" + host)) {
      sendAll(fd, "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: 34\r\nConnection: close\r\n\r\nzinc dev serves this machine only\n");
      zn::plat::sockClose(fd);
      return;
    }
  }
  if (path == "/__zinc/ws" && lower(header("Upgrade")) == "websocket") {
    sendAll(fd, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + sha1b64(header("Sec-WebSocket-Key")) + "\r\n\r\n");
    std::string graph;
    {
      std::lock_guard<std::mutex> lock(d->m);
      graph = "{\"type\":\"hello\",\"error\":" + jstr(d->lastError) + "}";
    }
    { std::lock_guard<std::mutex> lock(d->wsm); sendAll(fd, wsFrame(graph)); d->sockets.push_back(fd); if (!d->pageSeen) { d->pageSeen = true; std::fprintf(stderr, "zinc dev: the page is open; saves show there (Ctrl-C stops)\n"); } }
    for (;;) {   // the page says nothing we need; read until it goes (a close frame, or the socket)
      char b[512];
      const long n = zn::plat::sockRead(fd, b, sizeof b);
      if (n <= 0 || (static_cast<unsigned char>(b[0]) & 0x0f) == 8) break;
    }
    std::lock_guard<std::mutex> lock(d->wsm);
    d->sockets.erase(std::remove(d->sockets.begin(), d->sockets.end(), fd), d->sockets.end());
    zn::plat::sockClose(fd);
    return;
  }
  if (method != "GET" && method != "HEAD") { reply(400, "text/plain", "bad request"); return; }
  if (path.find("..") != std::string::npos) { reply(400, "text/plain", "bad path"); return; }
  if (path == "/") path = "/index.html";
  if (path == "/index.html") renewBridge(*d);
  if (path.rfind("/stage/", 0) == 0) {
    const std::string file = path.substr(7);
    std::lock_guard<std::mutex> lock(d->m);
    if (!d->mods.count(file) && file != "stage.json") { reply(404, "text/plain", "no such module"); return; }
    if (file == "stage.json") { reply(200, "application/json", readAll(d->stage / file)); return; }
    int v = 0;
    if (query.rfind("v=", 0) == 0) v = std::atoi(query.c_str() + 2);
    reply(200, "text/javascript; charset=utf-8", serveModule(*d, file, v));
    return;
  }
  fs::path f;
  if (path.rfind("/__deps/", 0) == 0) {
    std::string dir;
    { std::lock_guard<std::mutex> lock(d->m); dir = d->depsDir; }
    if (dir.empty()) { reply(404, "text/plain", "no packages"); return; }
    f = fs::path(dir) / path.substr(8);
  } else if (path.rfind("/assets/", 0) == 0) f = assetsRoot(d->a.dir) / path.substr(8);
  else if (path.rfind("/__project/", 0) == 0 && !d->a.lan) f = fs::path(d->a.dir) / path.substr(11);
  else if (path.rfind("/i18n/", 0) == 0 && path.find("..") == std::string::npos) f = fs::path(d->a.engineRoot) / path.substr(1);   // zinc:i18n's catalogs (catalogAssets)
  else f = d->site / path.substr(1);
  std::error_code ec;
  if (!fs::is_regular_file(f, ec)) { reply(404, "text/plain", "not found: " + path); return; }
  const std::string body = readAll(f), range = header("Range");
  std::size_t from = 0, to = body.empty() ? 0 : body.size() - 1;
  if (range.rfind("bytes=", 0) == 0 && !body.empty()) {   // one range, as a <video> element asks to seek: bytes=a-, bytes=a-b, bytes=-n
    const std::string r = range.substr(6);
    const std::size_t dash = r.find('-');
    if (dash != std::string::npos) {
      const std::string a = r.substr(0, dash), b = r.substr(dash + 1);
      if (a.empty() && !b.empty()) from = body.size() - std::min<std::size_t>(body.size(), std::strtoull(b.c_str(), nullptr, 10));
      else { from = std::strtoull(a.c_str(), nullptr, 10); if (!b.empty()) to = std::min<std::size_t>(to, std::strtoull(b.c_str(), nullptr, 10)); }
    }
    if (from > to) { sendAll(fd, "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + std::to_string(body.size()) + "\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"); zn::plat::sockClose(fd); return; }
    sendAll(fd, "HTTP/1.1 206 Partial Content\r\nContent-Type: " + mime(f.string()) + "\r\nContent-Range: bytes " + std::to_string(from) + "-" + std::to_string(to) + "/" + std::to_string(body.size()) +
                "\r\nAccept-Ranges: bytes\r\nContent-Length: " + std::to_string(to - from + 1) + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n" + body.substr(from, to - from + 1));
    zn::plat::sockClose(fd);
    return;
  }
  sendAll(fd, "HTTP/1.1 200 OK\r\nContent-Type: " + mime(f.string()) + "\r\nAccept-Ranges: bytes\r\nContent-Length: " + std::to_string(body.size()) + "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n" + body);
  zn::plat::sockClose(fd);
}

// the bridge is started again from a connection's thread: without this it would inherit the server's socket and that connection's
void keepFromChildren(int fd) {
#ifndef _WIN32
  ::fcntl(fd, F_SETFD, FD_CLOEXEC);
#else
  (void)fd;
#endif
}

int serve(Dev& d, int port, bool lan) {
  const int lfd = ::socket(AF_INET, SOCK_STREAM, 0);
  keepFromChildren(lfd);
  const int one = 1;
  setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&one), sizeof one);   // Winsock takes const char*
  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(lan ? INADDR_ANY : INADDR_LOOPBACK);
  int bound = 0;
  for (int k = 0; k < 20 && !bound; ++k) {
    addr.sin_port = htons(static_cast<std::uint16_t>(port + k));
    if (::bind(lfd, reinterpret_cast<sockaddr*>(&addr), sizeof addr) == 0) bound = port + k;
  }
  if (!bound || ::listen(lfd, 16) != 0) { std::fprintf(stderr, "zinc dev: cannot listen on port %d\n", port); return 1; }
  d.port = bound;
  std::fprintf(stderr, "zinc dev: %s on http://%s:%d/ (%s render; saves reload the page, or swap modules in place where they can)\n", d.a.name.c_str(), lan ? "0.0.0.0" : "127.0.0.1", bound, d.cm.cfg.render.c_str());
  std::thread([&d, lfd] {
    for (;;) {
      const int c = static_cast<int>(::accept(lfd, nullptr, nullptr));
      if (c < 0) { if (gStop) return; continue; }
      keepFromChildren(c);
      const timeval wait{5, 0};
      setsockopt(c, SOL_SOCKET, SO_SNDTIMEO, reinterpret_cast<const char*>(&wait), sizeof wait);   // Winsock takes const char*
      std::thread(connection, &d, c).detach();
    }
  }).detach();
  Snapshot seen = snapshotOf(d.a.dir);
  while (!gStop) {
    std::this_thread::sleep_for(std::chrono::milliseconds(120));
    checkBridge(d);
    Snapshot now = snapshotOf(d.a.dir);
    if (now == seen) continue;
    std::this_thread::sleep_for(std::chrono::milliseconds(40));   // an editor writes in steps
    now = snapshotOf(d.a.dir);
    std::set<std::string> files;
    for (const auto& [f, st] : now.f) if (!seen.f.count(f) || seen.f[f] != st) files.insert(f);
    for (const auto& [f, st] : seen.f) if (!now.f.count(f)) files.insert(f);
    seen = now;
    const auto t0 = std::chrono::steady_clock::now();
    bool codeOnly = true;
    for (const std::string& f : files) { const std::string e = fs::path(f).extension().string(); if (e != ".ts" && e != ".tsx" && e != ".js" && e != ".jsx" && e != ".mts" && e != ".mjs") codeOnly = false; }
    std::string log;
    std::vector<std::string> changed;
    bool refreshable = false;
    std::string saved;   // the files of this save, as the person named them
    for (const std::string& f : files) { if (saved.size() > 60) { saved += ", ..."; break; } saved += (saved.empty() ? "" : ", ") + fs::path(f).lexically_relative(d.a.dir).generic_string(); }
    const bool ok = restage(d, log, changed, refreshable, false);
    const long ms = static_cast<long>(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count());
    if (!ok) {
      d.lastError = log;
      std::fprintf(stderr, "zinc dev: %s saved: compile error (%ld ms)\n%s", saved.c_str(), ms, log.c_str());
      broadcast(d, "{\"type\":\"error\",\"message\":" + jstr(log) + "}");
      continue;
    }
    const bool wasBroken = !d.lastError.empty();
    d.lastError.clear();
    if (codeOnly && changed.empty() && !wasBroken) { std::fprintf(stderr, "zinc dev: %s saved, nothing in the program changed (%ld ms)\n", saved.c_str(), ms); continue; }
    if (!codeOnly || changed.empty() || !refreshable) {
      const std::string why = !codeOnly ? "not a module" : changed.empty() ? "the error is fixed" : !d.reloadWhy.empty() ? d.reloadWhy : "the module cannot be swapped in place";
      std::fprintf(stderr, "zinc dev: %s saved: reloading the page, %s (%ld ms)\n", saved.c_str(), why.c_str(), ms);
      broadcast(d, "{\"type\":\"reload\"}");
      continue;
    }
    std::string list;
    {
      std::lock_guard<std::mutex> lock(d.m);
      for (const std::string& f : changed) list += (list.empty() ? "" : ",") + std::string("{\"file\":") + jstr(f) + ",\"v\":" + std::to_string(d.versions[f]) + "}";
    }
    std::fprintf(stderr, "zinc dev: %s saved: %zu module(s) swapped in place (%ld ms)\n", saved.c_str(), changed.size(), ms);
    broadcast(d, "{\"type\":\"update\",\"changed\":[" + list + "]}");
  }
  zn::plat::sockClose(lfd);
  return 0;
}

}  // namespace

int exportWeb(const WebArgs& a) { return exportSite(a, "web-export"); }

int devWeb(const WebArgs& a) {
  std::signal(SIGINT, onSignal);
  std::signal(SIGTERM, onSignal);
#ifdef SIGPIPE
  std::signal(SIGPIPE, SIG_IGN);
#endif
  if (!a.lan && a.prepare.empty()) setenv("ZINC_WEB_DEV", "1", 1);   // the bundle keeps the native entry of a plugin that asks for the bridge ("web": {"dev": "native"})
  Dev d;
  d.a = a;
  d.root = a.prepare.empty() ? fs::path(a.dir) / "build" / ".zinc-web-dev" : fs::absolute(a.prepare);
  d.stage = d.root / "stage";
  d.site = d.root / "site";
  std::error_code ec;
  fs::create_directories(d.site, ec);
  std::string log;
  std::vector<std::string> changed;
  bool refreshable = false;
  if (!restage(d, log, changed, refreshable, true)) { std::fprintf(stderr, "zinc dev: %s", log.c_str()); d.lastError = log; if (!a.prepare.empty()) return 1; }
  d.cm = analyse(a, d.stage);
  if (a.prepare.empty()) startBridge(d);
  if (!d.bridgeJson.empty()) {   // the W0602 lines of the sides the bridge answers would say the opposite of what happens
    std::string kept, line;
    std::istringstream rs(d.cm.report);
    while (std::getline(rs, line)) {
      bool bridged = false;
      for (const std::string& n : d.bridged) if (line.find("warning W0602: the native side '" + n + "'") != std::string::npos) bridged = true;
      if (!bridged) kept += line + "\n";
    }
    d.cm.report = kept;
  }
  std::fputs(d.cm.report.c_str(), stderr);
  // the page and the runtime files, as they are (no hashes, no minify: the browser's devtools read them)
  const bool dom = d.cm.cfg.render == "dom";
  for (const char* f : {"runtime.js", "dom.js", "hmr.js"}) writeAll(d.site / f, readAll(fs::path(runtimeDir(a)) / f));
  writeAll(d.site / "native.js", nativeJs(d.cm.used, d.cm.rowJs));
  for (const WebPlugin& p : d.cm.used) {
    if (p.wasmSources.empty()) continue;
    std::string werr;
    const std::string built = buildWasm(p, werr);
    if (built.empty()) { std::fprintf(stderr, "zinc dev: %s\n", werr.c_str()); continue; }
    writeAll(d.site / (p.wasmName + ".wasm"), readAll(built));
    d.cm.wasmOut.push_back({p.wasmName, p.wasmName + ".wasm"});
  }
  for (const WebPlugin& p : d.cm.used) for (const auto& [name, spec] : p.scripts) {
    const std::size_t bar = spec.find('|');
    if (bar != std::string::npos && spec.substr(bar + 1) != d.cm.cfg.render) continue;
    fs::copy_file(fs::path(p.dir) / spec.substr(0, bar), d.site / (name + ".js"), fs::copy_options::overwrite_existing, ec);
    d.cm.scriptOut.push_back({name, name + ".js"});
  }
  std::vector<Asset> assets = listAssets(a.dir);
  for (Asset& as : catalogAssets(a, d.stage)) assets.push_back(as);
  for (Asset& as : assets) as.url = as.name;
  if (!a.lan) for (Asset& as : projectMedia(a.dir)) assets.push_back(as);
  {
    std::string berr;
    for (Asset& as : builtAssets(a.dir, d.site / "built", berr)) { as.url = "built/" + as.name; assets.push_back(as); }
    if (!berr.empty()) std::fprintf(stderr, "zinc dev: the asset build: %s\n", berr.c_str());
  }
  std::string cfg = configJson(a, d.cm.cfg, d.cm, assets, "./stage/" + d.entry, a.prepare.empty(), dom ? "./dom.js" : "", "./hmr.js");
  if (!d.bridgeJson.empty() && !cfg.empty() && cfg.back() == '}') cfg.insert(cfg.size() - 1, ",\"bridge\":" + d.bridgeJson);
  std::string page = pageFor(d.cm.cfg, cfg, "", true, false, false, "", "./native.js");
  page += "<script type=\"module\" src=\"./runtime.js\"></script>\n</body>\n</html>\n";
  writeAll(d.site / "index.html", page);
  if (!a.prepare.empty()) return 0;
  const int rc = serve(d, a.port, a.lan);
  std::lock_guard<std::mutex> hold(d.bm);
  if (d.bridge > 0) zn::plat::stop(d.bridge);
  return rc;
}

}  // namespace zn::cli
