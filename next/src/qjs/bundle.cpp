// The QuickJS bundler (docs/reports/zinc-quickjs-bundler.md): `zinc bundle` turns a program (TS, TSX, JS, its zinc: modules, its plugins and its
// packages) into one JavaScript file for QuickJS-ng. Four stages:
//   collect    the module graph, walked by QuickJS itself with the loader `zinc run --engine quickjs` uses (qjs.cpp), each module through the
//              transform stage (strip.cpp: React Native imports, StyleSheet, JSX lowering with Z0005-Z0007, type stripping)
//   lint       quickjsLint on the project's own modules: what QuickJS-ng 0.17 does not have (Q0001)
//   link       the transformed modules staged under a scratch directory with their imports pointing at each other, then the pinned esbuild
//              (src/tc) bundles, tree-shakes, folds the defines, minifies and writes the source map; zinc:native stays an import the host answers
//   emit       optional QuickJS bytecode (.qbc) that `zinc run` loads without parsing
// The source map's sources are rewritten from the staged copies to the files the user wrote; `zinc run` maps the stack traces through it.
#include "qjs/qjs.h"

#include <cctype>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <filesystem>
#include <fstream>
#include <map>
#include <regex>
#include <set>
#include <sstream>
#include <thread>

#include "frontend/modules.h"
#include "yyjson.h"
#include "zn/log.h"

namespace fs = std::filesystem;

namespace zn::qjs {
namespace {

bool readText(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  out = ss.str();
  return true;
}
bool writeText(const std::string& path, const std::string& text) {
  std::error_code ec;
  fs::create_directories(fs::path(path).parent_path(), ec);
  std::ofstream out(path, std::ios::binary);
  out << text;
  return static_cast<bool>(out);
}
bool endsWith(const std::string& s, const char* x) { const std::size_t n = std::strlen(x); return s.size() >= n && s.compare(s.size() - n, n, x) == 0; }
std::string quote(const std::string& s) { std::string r = "'"; for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; } return r + "'"; }
std::string jsonString(const std::string& s) {
  std::string r = "\"";
  for (char c : s) { if (c == '"' || c == '\\') r += '\\'; if (c == '\n') { r += "\\n"; continue; } r += c; }
  return r + "\"";
}
bool isIdChar(char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '$'; }

// "line:col" of a byte offset, both from 1
std::string lineCol(const std::string& s, std::size_t pos) {
  int line = 1, col = 1;
  for (std::size_t i = 0; i < pos && i < s.size(); ++i) { if (s[i] == '\n') { line++; col = 1; } else col++; }
  return std::to_string(line) + ":" + std::to_string(col);
}

// Calls `f(start, end)` for each identifier outside comments, strings and template texts (a regular expression literal is read as code:
// a name inside one can be reported, nothing worse).
template <class F> void eachIdentifier(const std::string& s, F f) {
  for (std::size_t i = 0; i < s.size();) {
    const char c = s[i];
    if (c == '/' && i + 1 < s.size() && s[i + 1] == '/') { while (i < s.size() && s[i] != '\n') i++; continue; }
    if (c == '/' && i + 1 < s.size() && s[i + 1] == '*') { const std::size_t e = s.find("*/", i + 2); i = e == std::string::npos ? s.size() : e + 2; continue; }
    if (c == '"' || c == '\'' || c == '`') {
      for (++i; i < s.size() && s[i] != c; ++i) if (s[i] == '\\') ++i;
      ++i;
      continue;
    }
    if (isIdChar(c) && !std::isdigit(static_cast<unsigned char>(c))) {
      std::size_t e = i;
      while (e < s.size() && isIdChar(s[e])) e++;
      f(i, e);
      i = e;
      continue;
    }
    ++i;
  }
}

}  // namespace

std::string capsJson(const std::string& capsFile) {
  std::stringstream in(zn::frontend::platformModule(capsFile));
  std::string line, out;
  while (std::getline(in, line)) {   // export const NAME: type = value;
    if (line.rfind("export const ", 0) != 0) continue;
    const std::size_t colon = line.find(':'), eq = line.find(" = ");
    if (colon == std::string::npos || eq == std::string::npos) continue;
    std::string value = line.substr(eq + 3);
    while (!value.empty() && (value.back() == ';' || value.back() == ' ')) value.pop_back();
    out += (out.empty() ? "{" : ",") + jsonString(line.substr(13, colon - 13)) + ":" + value;
  }
  return out.empty() ? "{}" : out + "}";
}

namespace {
std::string capsField(const std::string& json, const char* key) {
  const std::string k = std::string("\"") + key + "\":\"";
  const std::size_t at = json.find(k);
  if (at == std::string::npos) return "";
  const std::size_t b = at + k.size(), e = json.find('"', b);
  return json.substr(b, e - b);
}

// Base64 VLQ of source maps: the segments of one generated line
int vlq(const std::string& m, std::size_t& i) {
  static const std::string kB64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  int result = 0, shift = 0;
  while (i < m.size()) {
    const std::size_t d = kB64.find(m[i++]);
    if (d == std::string::npos) break;
    result += static_cast<int>(d & 31) << shift;
    if (!(d & 32)) break;
    shift += 5;
  }
  return result & 1 ? -(result >> 1) : result >> 1;
}

}  // namespace

std::vector<std::string> quickjsLint(const std::string& js, const std::string& file) {
  std::vector<std::string> out;
  auto warn = [&](std::size_t at, const std::string& what) { out.push_back(zn::log::shortPath(file) + ":" + lineCol(js, at) + ": warning Q0001: " + what); };
  eachIdentifier(js, [&](std::size_t b, std::size_t e) {
    std::size_t p = b;
    while (p > 0 && std::isspace(static_cast<unsigned char>(js[p - 1]))) p--;
    if (p > 0 && (js[p - 1] == '.' || (p > 1 && js[p - 1] == '?' && js[p - 2] == '.'))) return;   // a property, not a global
    std::size_t q = e;
    while (q < js.size() && std::isspace(static_cast<unsigned char>(js[q]))) q++;
    if (q < js.size() && js[q] == ':' && (q + 1 >= js.size() || js[q + 1] != ':')) return;   // a key of an object literal (or a label)
    const std::string id = js.substr(b, e - b);
    std::string member;
    if (e + 1 < js.size() && js[e] == '.') { std::size_t m = e + 1; while (m < js.size() && isIdChar(js[m])) m++; member = js.substr(e + 1, m - e - 1); }
    if (id == "Temporal") warn(b, "Temporal is not in QuickJS-ng 0.17: use Date, or bundle a Temporal polyfill package");
    else if (id == "WebAssembly") warn(b, "WebAssembly is not in QuickJS-ng: the wasm plugin (zinc:wasm) runs modules on the typed engine");
    else if (id == "Intl" && !member.empty() && member != "Segmenter") warn(b, "Intl." + member + " is not in QuickJS-ng (no Intl; Zinc adds Intl.Segmenter only): format by hand or bundle a polyfill");
    else if (id == "Atomics" && member == "waitAsync") warn(b, "Atomics.waitAsync is not in QuickJS-ng 0.17");
  });
  return out;
}

std::string webResolveFlags(bool production) {
  return std::string(" --platform=browser --target=es2023 --define:process.env.NODE_ENV=") + quote(production ? "\"production\"" : "\"development\"") + " --define:global=globalThis";
}

std::string mapStack(const std::string& stack, const std::string& file, const std::string& mapJson) {
  yyjson_doc* doc = yyjson_read(mapJson.data(), mapJson.size(), 0);
  if (!doc) return stack;
  yyjson_val* root = yyjson_doc_get_root(doc);
  std::vector<std::string> sources;
  size_t i, n;
  yyjson_val* v;
  yyjson_arr_foreach(yyjson_obj_get(root, "sources"), i, n, v) sources.push_back(yyjson_is_str(v) ? yyjson_get_str(v) : "?");
  const std::string m = yyjson_is_str(yyjson_obj_get(root, "mappings")) ? yyjson_get_str(yyjson_obj_get(root, "mappings")) : "";
  yyjson_doc_free(doc);
  struct Seg { int col, src, line, scol; };
  std::vector<std::vector<Seg>> lines(1);
  int src = 0, line = 0, scol = 0;
  for (std::size_t k = 0; k < m.size();) {
    if (m[k] == ';') { lines.emplace_back(); k++; continue; }
    if (m[k] == ',') { k++; continue; }
    int col = vlq(m, k) + (lines.back().empty() ? 0 : lines.back().back().col);
    if (k < m.size() && m[k] != ',' && m[k] != ';') { src += vlq(m, k); line += vlq(m, k); scol += vlq(m, k); if (k < m.size() && m[k] != ',' && m[k] != ';') vlq(m, k); }
    lines.back().push_back({col, src, line, scol});
  }
  const std::string dir = fs::path(file).parent_path().string();
  std::string out;
  const std::string key = file + ":";
  std::size_t at = 0;
  for (std::size_t f; (f = stack.find(key, at)) != std::string::npos;) {
    std::size_t p = f + key.size();
    int ln = 0, cl = 0;
    const std::size_t lb = p;
    while (p < stack.size() && std::isdigit(static_cast<unsigned char>(stack[p]))) ln = ln * 10 + (stack[p++] - '0');
    if (p == lb || p >= stack.size() || stack[p] != ':') { out += stack.substr(at, p - at); at = p; continue; }
    p++;
    while (p < stack.size() && std::isdigit(static_cast<unsigned char>(stack[p]))) cl = cl * 10 + (stack[p++] - '0');
    const Seg* best = nullptr;
    if (ln >= 1 && static_cast<std::size_t>(ln) <= lines.size()) for (const Seg& s : lines[ln - 1]) if (s.col <= cl - 1) best = &s;
    out += stack.substr(at, f - at);
    if (best && best->src >= 0 && static_cast<std::size_t>(best->src) < sources.size()) {
      const std::string& s = sources[best->src];
      const std::string path = s.rfind("zinc:", 0) == 0 || s[0] == '/' ? s : (fs::path(dir) / s).lexically_normal().string();
      out += path + ":" + std::to_string(best->line + 1) + ":" + std::to_string(best->scol + 1);
    } else out += stack.substr(f, p - f);
    at = p;
  }
  return out + stack.substr(at);
}

namespace {

// The staged copy of a module: zinc:ui -> <stage>/zinc/ui.js, /a/b/main.tsx -> <stage>/a/b/main.tsx.js; a package of node_modules is read where it is.
std::string stagedPath(const std::string& stage, const Collected& c) {
  if (c.name.rfind("zinc:", 0) == 0) { std::string n = c.name.substr(5); for (char& ch : n) if (ch == ':') ch = '_'; return stage + "/zinc/" + n + ".js"; }
  if (c.bare) return c.name;
  return stage + c.name + (endsWith(c.name, ".js") || endsWith(c.name, ".mjs") ? "" : ".js");
}
// The module a staged path stands for (the source map's `sources`): the inverse of stagedPath
std::string originalOf(const std::string& stage, const std::string& path) {
  if (path.rfind(stage + "/", 0) != 0) return path;
  std::string rest = path.substr(stage.size());
  if (rest.rfind("/zinc/", 0) == 0) return "zinc:" + rest.substr(6, rest.size() - 9);
  std::error_code ec;
  if (endsWith(rest, ".js") && !fs::exists(rest, ec)) rest.resize(rest.size() - 3);
  return rest;
}

// The module text with each import specifier that `deps` resolved replaced by the staged file of its module (`from 'x'`, `import 'x'`,
// `import('x')`, `export ... from 'x'`)
std::string relink(const std::string& js, const std::map<std::string, std::string>& to) {
  std::string out;
  std::size_t at = 0;
  auto keyword = [&](std::size_t p, const char* w) {   // `w` ends at p, as a whole word
    const std::size_t n = std::strlen(w);
    return p >= n && js.compare(p - n, n, w) == 0 && (p == n || !isIdChar(js[p - n - 1]));
  };
  for (std::size_t i = 0; i < js.size(); ++i) {
    const char q = js[i];
    if (q == '/' && i + 1 < js.size() && js[i + 1] == '/') { while (i < js.size() && js[i] != '\n') i++; continue; }
    if (q == '/' && i + 1 < js.size() && js[i + 1] == '*') { const std::size_t e = js.find("*/", i + 2); if (e == std::string::npos) break; i = e + 1; continue; }
    if (q != '\'' && q != '"' && q != '`') continue;
    std::size_t e = i + 1;
    while (e < js.size() && js[e] != q) e += js[e] == '\\' ? 2 : 1;
    if (e >= js.size()) break;
    std::size_t p = i;
    while (p > 0 && (std::isspace(static_cast<unsigned char>(js[p - 1])) || js[p - 1] == '(')) p--;
    if (q != '`' && (keyword(p, "from") || keyword(p, "import"))) {
      auto it = to.find(js.substr(i + 1, e - i - 1));
      if (it != to.end()) { out += js.substr(at, i - at) + jsonString(it->second); at = e + 1; }
    }
    i = e;
  }
  return out + js.substr(at);
}

// What a staged module imports from one package: `import d, {a as b} from 'x'` -> default + a; `import * as n` / `export * from` / `import('x')` -> all.
struct PkgUse { std::set<std::string> names; bool def = false, all = false; };
void scanPackageUse(const std::string& js, const std::string& spec, PkgUse& u) {
  std::string e;
  for (char ch : spec) { if (std::strchr("\\^$.|?*+()[]{}/", ch)) e += '\\'; e += ch; }
  const std::regex from("(?:import|export)\\s*([^'\";]*?)\\s*from\\s*['\"]" + e + "['\"]"), dyn("import\\s*\\(\\s*['\"]" + e + "['\"]");
  for (auto m = std::sregex_iterator(js.begin(), js.end(), from); m != std::sregex_iterator(); ++m) {
    const std::string clause = (*m)[1].str();
    if (clause.find('*') != std::string::npos) u.all = true;
    const std::size_t ob = clause.find('{'), cb = clause.find('}');
    const std::string head = clause.substr(0, ob), list = ob == std::string::npos ? "" : clause.substr(ob + 1, cb == std::string::npos ? std::string::npos : cb - ob - 1);
    if (head.find_first_not_of(" \t\r\n,") != std::string::npos && head.find('*') == std::string::npos) u.def = true;
    std::stringstream ss(list);
    for (std::string item; std::getline(ss, item, ',');) {
      std::stringstream is(item);
      std::string name;
      is >> name;
      if (name == "default") u.def = true;
      else if (!name.empty()) u.names.insert(name);
    }
  }
  if (std::regex_search(js, dyn)) u.all = true;
}

// zinc dev --target web: the module graph as the browser loads it, one ES module per file with relative imports and stage.json
// ({"entry": file, "modules": [{"file", "name", "deps": [file...]}], "packages": [{"spec", "id", "names", "default", "all"}]}), so a save re-serves one file
// instead of linking the program again. A package of node_modules is not a module of the graph: the staged imports of it point at /__deps/<id>.js
// and the dev server pre-bundles the packages once with esbuild (src/cli_web_deps.cpp), what Vite's dependency pre-bundling does.
int stageForBrowser(const BundleOptions& o, const std::vector<Collected>& mods) {
  const std::string stage = fs::path(o.stageDir).lexically_normal().string();
  std::error_code ec;
  fs::remove_all(stage, ec);
  std::map<std::string, std::size_t> at;
  for (std::size_t i = 0; i < mods.size(); ++i) at[mods[i].name] = i;
  auto rel = [&](const Collected& c) { return stagedPath("", c).substr(1); };
  std::map<std::string, PkgUse> packages;   // the specifier esbuild resolves (the package's name, or the file a relative import reached)
  auto packageId = [](const std::string& key) {
    std::string id;
    for (char ch : key) id += std::isalnum(static_cast<unsigned char>(ch)) ? ch : '_';
    return id.substr(id.size() > 60 ? id.size() - 60 : 0) + "-" + std::to_string(std::hash<std::string>{}(key) % 100000);
  };
  std::string json = "{\"entry\":" + jsonString(rel(mods[0])) + ",\"modules\":[";
  bool first = true;
  for (const Collected& c : mods) {
    if (c.host || c.bare) continue;
    const fs::path self = fs::path(rel(c)).parent_path();
    std::map<std::string, std::string> to;
    std::string deps;
    for (const auto& [spec, resolved] : c.deps) {
      auto it = at.find(resolved);
      if (it == at.end() || mods[it->second].host) continue;
      if (mods[it->second].bare) {
        const std::string key = spec[0] == '.' || spec[0] == '/' ? resolved : spec;
        scanPackageUse(c.js, spec, packages[key]);
        to[spec] = "/__deps/" + packageId(key) + ".js";
        continue;
      }
      std::string target = fs::path(rel(mods[it->second])).lexically_relative(self.empty() ? fs::path(".") : self).generic_string();
      if (target.rfind("../", 0) != 0) target = "./" + target;
      to[spec] = target;
      deps += (deps.empty() ? "" : ",") + jsonString(rel(mods[it->second]));
    }
    if (!writeText(stage + "/" + rel(c), relink(c.js, to))) { std::fprintf(stderr, "zinc dev: cannot write %s\n", rel(c).c_str()); return 2; }
    json += std::string(first ? "" : ",") + "{\"file\":" + jsonString(rel(c)) + ",\"name\":" + jsonString(c.name) + ",\"deps\":[" + deps + "]}";
    first = false;
  }
  json += "],\"packages\":[";
  first = true;
  for (const auto& [key, u] : packages) {
    json += std::string(first ? "" : ",") + "{\"spec\":" + jsonString(key) + ",\"id\":" + jsonString(packageId(key)) + ",\"default\":" + (u.def ? "true" : "false") + ",\"all\":" + (u.all ? "true" : "false") + ",\"names\":[";
    bool f2 = true;
    for (const std::string& n : u.names) { json += std::string(f2 ? "" : ",") + jsonString(n); f2 = false; }
    json += "]}";
    first = false;
  }
  json += "]}";
  return writeText(stage + "/stage.json", json) ? 0 : 2;
}

int bundleOnce(const BundleOptions& o, std::vector<std::string>& watched) {
  const auto t0 = std::chrono::steady_clock::now();
  std::vector<Collected> mods;
  std::string err;
  if (!collect(o.entry, o.stdRoot, o.cacheDir, mods, err)) { std::fprintf(stderr, "%s\n", err.c_str()); return 1; }
  watched.clear();
  std::map<std::string, std::size_t> at;
  for (std::size_t i = 0; i < mods.size(); ++i) { at[mods[i].name] = i; if (mods[i].name[0] == '/' && !mods[i].bare) watched.push_back(mods[i].name); }
  // lint: the project's own modules (the engine's lib/std and the packages are not the user's to fix)
  const std::string libRoot = fs::path(o.stdRoot).parent_path().lexically_normal().string();
  std::size_t warnings = 0;
  for (const Collected& c : mods) {
    if (c.bare || c.host || c.name.rfind("zinc:", 0) == 0 || c.name.rfind(libRoot + "/", 0) == 0) continue;
    for (const std::string& w : quickjsLint(c.js, c.name)) { std::fprintf(stderr, "%s\n", w.c_str()); warnings++; }
  }
  if (o.check) {
    std::printf("%zu modules, %zu warning(s) for QuickJS\n", mods.size(), warnings);
    return warnings ? 1 : 0;
  }
  if (!o.stageDir.empty()) return stageForBrowser(o, mods);
  // stage
  const std::string stage = fs::path(o.work).lexically_normal().string() + "/stage";
  std::error_code ec;
  fs::remove_all(stage, ec);
  std::string hashInput;
  for (const Collected& c : mods) {
    if (c.bare || c.host) continue;
    std::map<std::string, std::string> to;
    for (const auto& [spec, resolved] : c.deps) {
      auto it = at.find(resolved);
      if (it == at.end() || mods[it->second].host || (mods[it->second].bare && spec[0] != '.' && spec[0] != '/')) continue;   // zinc:native; a package name stays for esbuild, the one resolver of every link (the loader's own guess ignored exports conditions and the browser field)
      to[spec] = stagedPath(stage, mods[it->second]);
    }
    const std::string text = relink(c.js, to);
    if (!writeText(stagedPath(stage, c), text)) { std::fprintf(stderr, "zinc bundle: cannot write %s\n", stagedPath(stage, c).c_str()); return 2; }
    hashInput += c.name + '\n' + text + '\n';
  }
  // link
  const std::string caps = capsJson(o.capsFile);
  const bool web = capsField(caps, "TARGET") == "web";   // --profile web: the browser's resolution, shared with zinc dev (webResolveFlags)
  std::string nodePath;
  for (fs::path d = fs::path(o.entry).parent_path(); !d.empty(); d = d.parent_path()) {
#ifdef _WIN32
    const char* sep = ";";
#else
    const char* sep = ":";
#endif
    if (fs::is_directory(d / "node_modules", ec)) nodePath += (nodePath.empty() ? "" : sep) + (d / "node_modules").string();
    if (d == d.root_path()) break;
  }
  std::string cmd = (nodePath.empty() ? "" : "NODE_PATH=" + quote(nodePath) + " ") + quote(o.esbuild) + " " + quote(stagedPath(stage, mods[0])) +
      " --bundle --format=esm" + (web ? webResolveFlags(o.minify) : std::string(" --platform=neutral --target=es2023 --main-fields=module,main") + " --define:process.env.NODE_ENV=" + quote(o.minify ? "\"production\"" : "\"development\"")) + " --charset=utf8 --legal-comments=none --log-level=warning --color=false"
      " --external:zinc:native --outfile=" + quote(o.out) +
      " --banner:js=" + quote("// zinc-bundle-entry: " + fs::path(o.entry).lexically_relative(fs::path(o.out).parent_path()).generic_string()) +   // zinc run bakes the fonts from its files
      " --define:__ZINC_ENGINE__=" + quote("\"quickjs\"") + " --define:__ZINC_TARGET__=" + quote("\"" + capsField(caps, "TARGET") + "\"") +
      " --define:__ZINC_PROFILE__=" + quote("\"" + capsField(caps, "PROFILE") + "\"") + " --define:__ZINC_CAPS__=" + quote(caps) +
      (o.minify ? " --minify --keep-names" : "") + (o.sourcemap ? " --sourcemap --sources-content=false" : "");
  // the content-hash cache: the same staged modules and the same command give the same bundle, so esbuild does not run again
  const std::string key = std::to_string(std::hash<std::string>{}(hashInput + cmd)), keyFile = o.work + "/last-bundle";
  std::string lastKey;
  const bool cached = readText(keyFile, lastKey) && lastKey == key + " " + o.out && fs::exists(o.out, ec);
  if (!cached) {
    fs::create_directories(fs::path(o.out).parent_path(), ec);
    FILE* p = popen((cmd + " 2>&1").c_str(), "r");
    if (!p) { std::fprintf(stderr, "zinc bundle: cannot start esbuild\n"); return 2; }
    std::string log;
    char buf[4096];
    for (std::size_t got; (got = std::fread(buf, 1, sizeof buf, p)) > 0;) log.append(buf, got);
    const int rc = pclose(p);
    for (std::size_t s; (s = log.find(stage)) != std::string::npos;) {   // the staged paths in esbuild's messages, back to the user's files
      std::size_t e = s;
      while (e < log.size() && !std::isspace(static_cast<unsigned char>(log[e])) && log[e] != ':' && log[e] != '"') e++;
      log.replace(s, e - s, originalOf(stage, log.substr(s, e - s)));
    }
    std::fputs(log.c_str(), stderr);
    if (rc != 0) { std::fprintf(stderr, "zinc bundle: esbuild failed\n"); return 1; }
    if (o.sourcemap) {   // the map's sources: the files the user wrote, relative to the bundle (esbuild names the staged copies)
      std::string map;
      if (readText(o.out + ".map", map)) {
        yyjson_doc* d = yyjson_read(map.data(), map.size(), 0);
        yyjson_mut_doc* md = d ? yyjson_doc_mut_copy(d, nullptr) : nullptr;
        yyjson_doc_free(d);
        yyjson_mut_val* srcs = md ? yyjson_mut_obj_get(yyjson_mut_doc_get_root(md), "sources") : nullptr;
        const fs::path outDir = fs::absolute(o.out, ec).parent_path();
        std::deque<std::string> keep;   // the new strings, alive until the map is written
        size_t i, n;
        yyjson_mut_val* v;
        if (srcs) yyjson_mut_arr_foreach(srcs, i, n, v) {
          const std::string staged = (outDir / yyjson_mut_get_str(v)).lexically_normal().string(), orig = originalOf(stage, staged);
          const std::string rel = orig.rfind("zinc:", 0) == 0 ? orig : fs::path(orig).lexically_relative(outDir).string();
          keep.push_back(rel);
          yyjson_mut_set_strn(v, keep.back().data(), keep.back().size());
        }
        size_t len = 0;
        char* text = md ? yyjson_mut_write(md, 0, &len) : nullptr;
        if (text) { writeText(o.out + ".map", std::string(text, len)); std::free(text); }
        yyjson_mut_doc_free(md);
      }
    }
    writeText(keyFile, key + " " + o.out);
  }
  std::string bundled;
  readText(o.out, bundled);
  std::string line = "zinc bundle: " + zn::log::shortPath(o.out) + " " + std::to_string((bundled.size() + 512) / 1024) + " KB, " + std::to_string(mods.size()) + " modules" +
                     (cached ? " (unchanged)" : "");
  if (o.bytecode) {   // emit: QuickJS bytecode beside it, for a start without parsing
    std::string bytes;
    const std::string qbc = (endsWith(o.out, ".js") ? o.out.substr(0, o.out.size() - 3) : o.out) + ".qbc";
    if (!compileBytecode(bundled, fs::absolute(o.out, ec).lexically_normal().string(), bytes, err)) { std::fprintf(stderr, "zinc bundle: %s\n", err.c_str()); return 1; }
    writeText(qbc, bytes);
    line += ", " + zn::log::shortPath(qbc) + " " + std::to_string((bytes.size() + 512) / 1024) + " KB";
  }
  if (warnings) line += ", " + std::to_string(warnings) + " warning(s)";
  if (!o.quiet) std::fprintf(stderr, "%s, %lld ms\n", line.c_str(), static_cast<long long>(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count()));
  return 0;
}

}  // namespace

int bundle(const BundleOptions& o) {
  std::vector<std::string> watched;
  int rc = bundleOnce(o, watched);
  if (!o.watch) return rc;
  // --watch: the files of the graph, polled; a change bundles again (the transform is per module, esbuild runs again: tens of milliseconds)
  auto stamps = [&] {
    std::vector<fs::file_time_type> t;
    std::error_code ec;
    for (const std::string& f : watched) t.push_back(fs::last_write_time(f, ec));
    return t;
  };
  std::fprintf(stderr, "zinc bundle: watching %zu files (Ctrl-C stops)\n", watched.size());
  for (auto last = stamps();;) {
    std::this_thread::sleep_for(std::chrono::milliseconds(250));
    if (auto now = stamps(); now != last) {
      bundleOnce(o, watched);
      last = stamps();
    }
  }
}

}  // namespace zn::qjs
