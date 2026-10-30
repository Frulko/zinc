#include "frontend/resolve.h"

#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>

#include "frontend/modules.h"
#include "frontend/plugin_manifest.h"
#include "yyjson.h"

namespace zn::frontend {

std::string dirOf(const std::string& p) {
  std::size_t s = p.find_last_of("/\\");
  return s == std::string::npos ? "" : p.substr(0, s);
}

std::string normalize(const std::string& p) {
  std::string plain;
  plain.reserve(p.size());
  for (char c : p) plain += c == '\\' ? '/' : c;
  const bool winDrive = plain.size() > 1 && (plain[0] >= 'a' && plain[0] <= 'z' || plain[0] >= 'A' && plain[0] <= 'Z') && plain[1] == ':';
  std::vector<std::string> parts;
  std::size_t i = winDrive ? 2 : 0;
  bool abs = !plain.empty() && plain[0] == '/';
  while (i <= plain.size()) {
    std::size_t j = plain.find('/', i);
    if (j == std::string::npos) j = plain.size();
    std::string seg = plain.substr(i, j - i);
    if (!seg.empty() && seg != "/") {
      if (seg == "..") { if (!parts.empty() && parts.back() != "..") parts.pop_back(); else if (!abs && !winDrive) parts.push_back(seg); }
      else if (seg != ".") parts.push_back(seg);
    }
    i = j + 1;
  }
  // the drive stays in place and takes a forward slash like every join after it (Windows accepts '/')
  std::string r = winDrive ? plain.substr(0, 2) : abs ? "/" : "";
  for (std::size_t k = 0; k < parts.size(); ++k) r += (r.empty() || r.back() == '/' ? "" : "/") + parts[k];
  return r;
}

namespace {
bool gFollowSuffixes = false;   // zinc lsp: followModuleSuffixes
bool endsWith(const std::string& s, const char* suffix) { std::size_t n = std::strlen(suffix); return s.size() >= n && s.compare(s.size() - n, n, suffix) == 0; }
}  // namespace

void followModuleSuffixes(bool on) { gFollowSuffixes = on; }

ModuleResolver::ModuleResolver()
    : read([](const std::string& path, std::string& out) {
        std::error_code ec;
        if (!std::filesystem::is_regular_file(path, ec)) return false;
        std::ifstream in(path, std::ios::binary);
        if (!in) return false;
        std::stringstream ss;
        ss << in.rdbuf();
        out = ss.str();
        return true;
      }),
      exists([](const std::string& path) { std::error_code ec; return std::filesystem::is_regular_file(path, ec); }),
      passOver([](const std::string& candidate, const std::string& from) { return candidate == from; }) {}

const ModuleResolver::TsEntry& ModuleResolver::tsconfigFor(const std::string& dir) {
  auto it = tsconfigs_.find(dir);
  if (it != tsconfigs_.end()) return it->second;
  TsEntry e;
  for (std::string d = dir;;) {
    std::string text;
    if (read(d.empty() ? "tsconfig.json" : d + "/tsconfig.json", text)) {
      std::string err;
      if (parseTsConfig(text, e.cfg, err)) { e.found = true; e.dir = d; }
      else std::fprintf(stderr, "zinc: %s/tsconfig.json: %s\n", d.c_str(), err.c_str());
      break;
    }
    std::size_t slash = d.find_last_of('/');
    if (d.empty() || slash == std::string::npos) { if (!d.empty()) { d.clear(); continue; } break; }
    d = d.substr(0, slash);
  }
  return tsconfigs_[dir] = std::move(e);
}

std::vector<std::string> ModuleResolver::suffixes(const std::string& dir) {
  if (gFollowSuffixes) { const TsEntry& ts = tsconfigFor(dir); if (!ts.cfg.moduleSuffixes.empty()) return ts.cfg.moduleSuffixes; }
  return platformSuffixes();
}

std::string ModuleResolver::file(const std::string& path, const std::string& from) {
  const std::vector<std::string> sfx = suffixes(dirOf(path));
  std::string found;
  auto at = [&](const std::string& c) { if (!exists(c)) return false; found = c; return true; };
  // Screen.android.ts, Screen.native.ts, Screen.ts, then the same with .tsx: Metro's order and TypeScript's moduleSuffixes, the extension outside the suffix
  auto suffixed = [&](const std::string& stem, const char* ext) {
    for (const std::string& s : sfx) if ((s.empty() || !passOver(stem + s + ext, from)) && at(stem + s + ext)) return true;
    return false;
  };
  std::string stem = path;
  for (const char* js : {".js", ".mjs"}) if (stem.size() > std::strlen(js) && endsWith(stem, js)) { stem.resize(stem.size() - std::strlen(js)); break; }
  if (at(path) || suffixed(path, ".ts") || suffixed(path, ".tsx") || suffixed(path + "/index", ".ts") || suffixed(path + "/index", ".tsx") ||
      at(path + ".js") || at(path + ".mjs") || at(path + "/index.js") || (stem != path && (suffixed(stem, ".ts") || suffixed(stem, ".tsx"))))
    return found;
  return "";
}

ModuleResolver::Bare ModuleResolver::bare(const std::string& spec, const std::string& from, bool packages) {
  Bare r;
  if (spec.empty()) return r;
  const std::string dir = dirOf(from);
  if (const TsEntry& ts = tsconfigFor(dir); ts.found) {
    std::string root = ts.dir;
    if (!ts.cfg.baseUrl.empty()) root = normalize(root + (root.empty() ? "" : "/") + ts.cfg.baseUrl);
    for (const std::string& t : mapSpecifier(ts.cfg, spec, r.paths)) {
      const std::string path = normalize(root + (root.empty() ? "" : "/") + t);
      if (!(r.file = file(path, from)).empty()) return r;
      r.tried += (r.tried.empty() ? "" : ", ") + path;
    }
  }
  const std::map<std::string, std::string>& pl = plugins(from);   // `three`, `three/addons/loaders/GLTFLoader.js`, `gsap`
  if (auto it = pl.find(spec); it != pl.end() && exists(it->second)) { r.file = it->second; return r; }
  // the compat packages the prototype maps on its own, for a project without a tsconfig.json paths entry (react and solid-js stay errors without one)
  if (std::string_view cm = compatModuleFile(spec); !cm.empty() && !stdRoot.empty())
    if (std::string path = normalize(stdRoot + "/" + std::string(cm)); exists(path)) { r.file = path; return r; }
  if (packages) r.package = !(r.file = package(dir, spec)).empty();
  return r;
}

// Reads the plugin.json files of `<dir>/*/`.
void ModuleResolver::readPluginsIn(const std::string& dirIn) {
  namespace fs = std::filesystem;
  const std::string dir = fs::path(dirIn).lexically_normal().string();   // "next/plugins" and "plugins" are one directory, so one module identity
  if (!pluginDirsRead_.insert(dir).second) return;
  std::error_code ec;
  for (const auto& entry : fs::directory_iterator(dir, ec)) {
    // a plugin linked into a project (image/player/plugins/shell -> ../../../plugins/shell) is read where it lives: its native code
    // includes its neighbours by relative path, and the repository's copy and the link are then one module
    std::error_code lec;
    const fs::path real = entry.is_symlink(lec) ? fs::canonical(entry.path(), lec) : fs::path();
    const fs::directory_entry e(real.empty() ? entry.path() : real, lec);
    std::string text;
    std::string manifest = (e.path() / "plugin.json").string();
    if (!read(manifest, text)) continue;
    PluginManifest pm;
    std::string err;
    std::vector<std::string> warnings;
    if (!parsePluginManifest(text, pm, err, warnings)) { std::fprintf(stderr, "zinc: %s: %s\n", manifest.c_str(), err.c_str()); continue; }
    for (const std::string& w : warnings) std::fprintf(stderr, "zinc: %s: %s\n", manifest.c_str(), w.c_str());
    if (pm.kind != "module") continue;
    if (!pm.module.empty() && !plugins_.count(pm.module)) { plugins_[pm.module] = (e.path() / pm.entry).lexically_normal().string(); needs_[plugins_[pm.module]] = {pm.name, pm.requires_}; }
    for (const auto& [alias, file] : pm.aliases) if (!plugins_.count(alias)) plugins_[alias] = (e.path() / file).lexically_normal().string();   // `modules`: the bare specifiers a plugin answers
  }
}

// The "pluginDirs" of a zinc.json on the way up, read before that project's plugins/ so they shadow it, as in the prototype's discover (ZN-354).
void ModuleResolver::readPluginDirsOf(const std::string& dir) {
  const std::string file = dir + "/zinc.json";
  std::string text;
  if (!pluginDirsRead_.insert(file).second || !read(file, text)) return;
  yyjson_doc* d = yyjson_read(text.c_str(), text.size(), 0);
  yyjson_val* dirs = d ? yyjson_obj_get(yyjson_doc_get_root(d), "pluginDirs") : nullptr;
  size_t i, n;
  yyjson_val* v;
  if (yyjson_is_arr(dirs)) yyjson_arr_foreach(dirs, i, n, v) if (yyjson_is_str(v)) readPluginsIn((std::filesystem::path(dir) / yyjson_get_str(v)).string());
  yyjson_doc_free(d);
}

const std::map<std::string, std::string>& ModuleResolver::plugins(const std::string& from) {
  namespace fs = std::filesystem;
  std::error_code ec;
  for (fs::path d = fs::absolute(from, ec).parent_path(); !d.empty() && d != d.root_path(); d = d.parent_path()) { readPluginDirsOf(d.string()); readPluginsIn((d / "plugins").string()); }   // absolute: `zinc run main.ts` has no parent to walk
  if (!stdRoot.empty()) readPluginsIn((fs::path(stdRoot).parent_path().parent_path() / "plugins").string());
  return plugins_;
}

const std::pair<std::string, std::vector<std::string>>* ModuleResolver::needs(const std::string& entry) const {
  auto it = needs_.find(entry);
  return it == needs_.end() ? nullptr : &it->second;
}

// `pkg/sub/path` as a file, else package.json "exports" (".": a string or the "import" / "module" / "default" condition), "module", "main",
// index.js. A CommonJS package is found but only the linker (zinc bundle) runs it.
std::string ModuleResolver::package(const std::string& dir, const std::string& spec) {
  if (spec.empty()) return "";
  const std::size_t cut = spec[0] == '@' ? spec.find('/', spec.find('/') + 1) : spec.find('/');
  const std::string pkg = spec.substr(0, cut), sub = cut == std::string::npos ? "" : spec.substr(cut + 1);
  std::string f;
  for (std::string d = dir; !d.empty() && f.empty(); d = dirOf(d)) {
    const std::string root = d + "/node_modules/" + pkg;
    std::error_code ec;
    if (!std::filesystem::is_directory(root, ec)) continue;
    std::string text;
    yyjson_doc* doc = read(root + "/package.json", text) ? yyjson_read(text.data(), text.size(), 0) : nullptr;
    yyjson_val* j = doc ? yyjson_doc_get_root(doc) : nullptr;
    yyjson_val* ex = j ? yyjson_obj_get(j, "exports") : nullptr;
    if (!sub.empty()) {   // pkg/sub/path: package.json "exports" ("./sub/path", or a "./*" pattern) first, else the file
      yyjson_val* hit = yyjson_is_obj(ex) ? yyjson_obj_get(ex, ("./" + sub).c_str()) : nullptr;
      std::string rep;
      size_t i, n; yyjson_val *k, *v;
      if (!hit && yyjson_is_obj(ex)) yyjson_obj_foreach(ex, i, n, k, v) {
        const std::string key = yyjson_get_str(k);
        const std::size_t star = key.find('*');
        const std::string want = "./" + sub;
        if (star == std::string::npos || want.size() < key.size() - 1 || want.compare(0, star, key, 0, star) != 0 || want.compare(want.size() - (key.size() - star - 1), std::string::npos, key, star + 1, std::string::npos) != 0) continue;
        hit = v;
        rep = want.substr(star, want.size() - (key.size() - 1));
        break;
      }
      for (int depth = 0; depth < 4 && yyjson_is_obj(hit); ++depth) {
        yyjson_val* c = nullptr;
        for (const char* kk : {"import", "module", "default"}) if ((c = yyjson_obj_get(hit, kk))) break;
        hit = c;
      }
      std::string target = yyjson_is_str(hit) ? yyjson_get_str(hit) : "";
      for (std::size_t at; !rep.empty() && (at = target.find('*')) != std::string::npos;) target.replace(at, 1, rep);
      if (!target.empty()) f = file(normalize(root + "/" + target), "");
      if (f.empty()) f = file(root + "/" + sub, "");
    } else {
      if (yyjson_is_obj(ex) && yyjson_obj_get(ex, ".")) ex = yyjson_obj_get(ex, ".");
      for (int depth = 0; depth < 3 && yyjson_is_obj(ex); ++depth) {   // nested conditions: {"import": {"default": "./x.mjs"}}
        yyjson_val* c = nullptr;
        for (const char* k : {"import", "module", "default"}) if ((c = yyjson_obj_get(ex, k))) break;
        ex = c;
      }
      std::string main = yyjson_is_str(ex) ? yyjson_get_str(ex) : "";
      for (const char* k : {"module", "main"}) if (main.empty() && j && yyjson_is_str(yyjson_obj_get(j, k))) main = yyjson_get_str(yyjson_obj_get(j, k));
      f = file(normalize(root + "/" + (main.empty() ? "index.js" : main)), "");
    }
    yyjson_doc_free(doc);
    if (f.empty()) return "";   // the nearest node_modules that has the package decides, as in Node
  }
  std::error_code ec;   // its real path: a package a pnpm workspace links in two places is one module, as in Node
  if (!f.empty()) if (std::filesystem::path real = std::filesystem::canonical(f, ec); !ec) f = real.string();
  return f;
}

}  // namespace zn::frontend
