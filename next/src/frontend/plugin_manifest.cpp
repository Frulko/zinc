#include "frontend/plugin_manifest.h"

#include <algorithm>
#include <charconv>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <set>
#include <sstream>

#include "yyjson.h"

namespace zn::frontend {
namespace {

bool str(yyjson_val* v, const char* key, std::string& dst, std::string& err) {
  yyjson_val* x = yyjson_obj_get(v, key);
  if (!x) return true;
  if (!yyjson_is_str(x)) { err = std::string("\"") + key + "\" must be a string"; return false; }
  dst = yyjson_get_str(x);
  return true;
}

std::vector<std::string> strings(yyjson_val* v) {
  std::vector<std::string> r;
  if (!yyjson_is_arr(v)) return r;
  size_t i, n;
  yyjson_val* e;
  yyjson_arr_foreach(v, i, n, e) if (yyjson_is_str(e)) r.push_back(yyjson_get_str(e));
  return r;
}

// The C++ token of a JSON value as the prototype wrote it: a string is quoted, a boolean is 1 or 0, a number is printed, an array joins with commas.
std::string cppToken(yyjson_val* v) {
  if (yyjson_is_str(v)) {
    std::string s = "\"";
    for (const char* p = yyjson_get_str(v); *p; ++p) {
      if (*p == '"' || *p == '\\') { s += '\\'; s += *p; }
      else if (*p == '\n') s += "\\n";
      else s += *p;
    }
    return s + "\"";
  }
  if (yyjson_is_bool(v)) return yyjson_get_bool(v) ? "1" : "0";
  if (yyjson_is_int(v)) return yyjson_is_uint(v) ? std::to_string(yyjson_get_uint(v)) : std::to_string(yyjson_get_sint(v));
  if (yyjson_is_real(v)) { char b[40]; auto r = std::to_chars(b, b + sizeof b, yyjson_get_real(v)); return std::string(b, r.ptr); }
  if (yyjson_is_arr(v)) { std::string s; size_t i, n; yyjson_val* e; yyjson_arr_foreach(v, i, n, e) s += (i ? "," : "") + cppToken(e); return s; }
  return "";
}

void optionsOf(yyjson_val* obj, std::vector<PluginOption>& into) {  // later values of the same key replace earlier ones, keeping the first position
  if (!yyjson_is_obj(obj)) return;
  size_t i, n;
  yyjson_val *k, *v;
  yyjson_obj_foreach(obj, i, n, k, v) {
    PluginOption o{yyjson_get_str(k), cppToken(v)};
    bool had = false;
    for (PluginOption& x : into) if (x.key == o.key) { x.cpp = o.cpp; had = true; }
    if (!had) into.push_back(o);
  }
}

std::string dumped(yyjson_val* v) {
  size_t len = 0;
  char* p = yyjson_val_write(v, YYJSON_WRITE_NOFLAG, &len);
  std::string s(p ? p : "", len);
  std::free(p);
  return s;
}

}  // namespace

bool parsePluginManifest(std::string_view text, PluginManifest& out, std::string& err, std::vector<std::string>& warnings) {
  yyjson_read_err re;
  yyjson_doc* doc = yyjson_read_opts(const_cast<char*>(text.data()), text.size(), YYJSON_READ_NOFLAG, nullptr, &re);
  if (!doc) { err = std::string("invalid JSON: ") + re.msg + " at byte " + std::to_string(re.pos); return false; }
  struct Free { yyjson_doc* d; ~Free() { yyjson_doc_free(d); } } guard{doc};
  yyjson_val* root = yyjson_doc_get_root(doc);
  if (!yyjson_is_obj(root)) { err = "the manifest must be a JSON object"; return false; }
  out = PluginManifest{};
  if (!str(root, "name", out.name, err) || !str(root, "kind", out.kind, err) || !str(root, "module", out.module, err) || !str(root, "entry", out.entry, err) || !str(root, "description", out.description, err)) return false;
  if (out.entry.empty()) out.entry = "index.ts";
  if (out.kind != "module" && out.kind != "display") { err = "\"kind\" must be \"module\" or \"display\""; return false; }
  if (yyjson_val* r = yyjson_obj_get(root, "requires")) {
    if (!yyjson_is_arr(r)) { err = "\"requires\" must be an array"; return false; }
    size_t i, n;
    yyjson_val* e;
    yyjson_arr_foreach(r, i, n, e) if (yyjson_is_str(e)) out.requires_.push_back(yyjson_get_str(e));
  }
  if (yyjson_val* m = yyjson_obj_get(root, "modules")) {
    if (!yyjson_is_obj(m)) { err = "\"modules\" must be an object"; return false; }
    size_t i, n;
    yyjson_val *k, *v;
    yyjson_obj_foreach(m, i, n, k, v) if (yyjson_is_str(v)) out.aliases[yyjson_get_str(k)] = yyjson_get_str(v);
  }
  if (yyjson_val* t = yyjson_obj_get(root, "targets")) {
    if (!yyjson_is_obj(t)) { err = "\"targets\" must be an object"; return false; }
    size_t i, n;
    yyjson_val *k, *v;
    yyjson_obj_foreach(t, i, n, k, v) {
      out.targets.push_back(yyjson_get_str(k));
      PluginTarget pt;
      if (yyjson_is_obj(v)) {
        size_t j, m;
        yyjson_val *tk, *tv;
        yyjson_obj_foreach(v, j, m, tk, tv) {
          std::string key = yyjson_get_str(tk);
          if (key == "sources") pt.sources = strings(tv);
          else if (key == "pkg") pt.pkg = strings(tv);
          else if (key == "frameworks") pt.frameworks = strings(tv);
          else if (key == "libs") pt.libs = strings(tv);
          else if (key == "linkFlags") pt.linkFlags = strings(tv);
          else if (key == "defines") pt.defines = strings(tv);
          else if (key == "flags") pt.flags = strings(tv);
          else if (key == "packages") pt.packages = strings(tv);
          else if (key == "idf") pt.idf = strings(tv);
          else if (key == "nodeFlags") pt.nodeFlags = strings(tv);
          else if (key == "idfComponents" && yyjson_is_obj(tv)) { size_t a, b; yyjson_val *ck, *cv; yyjson_obj_foreach(tv, a, b, ck, cv) if (yyjson_is_str(cv)) pt.idfComponents[yyjson_get_str(ck)] = yyjson_get_str(cv); }
          else warnings.push_back("unknown key \"" + std::string(yyjson_get_str(k)) + "." + key + "\"");
        }
      }
      out.targetSettings[yyjson_get_str(k)] = std::move(pt);
    }
    out.targetsJson = dumped(t);
  }
  if (yyjson_val* o = yyjson_obj_get(root, "options")) { out.optionsJson = dumped(o); optionsOf(o, out.options); }
  if (yyjson_val* x = yyjson_obj_get(root, "abi")) { if (!yyjson_is_int(x)) { err = "\"abi\" must be an integer"; return false; } out.abi = static_cast<int>(yyjson_get_int(x)); }
  if (yyjson_val* x = yyjson_obj_get(root, "native")) {
    if (!yyjson_is_obj(x)) { err = "\"native\" must be an object"; return false; }
    if (!str(x, "spec", out.nativeSpec, err) || !str(x, "name", out.nativeName, err)) return false;
    if (yyjson_val* im = yyjson_obj_get(x, "impl")) { size_t i2, n2; yyjson_val *ik, *iv; if (yyjson_is_obj(im)) yyjson_obj_foreach(im, i2, n2, ik, iv) if (yyjson_is_str(iv)) out.nativeImpl[yyjson_get_str(ik)] = yyjson_get_str(iv); }
  }
  if (!str(root, "sim", out.sim, err) || !str(root, "license", out.license, err) || !str(root, "link", out.link, err)) return false;
  if (yyjson_val* x = yyjson_obj_get(root, "deterministic")) out.deterministic = yyjson_get_bool(x);
  if (yyjson_val* x = yyjson_obj_get(root, "live")) out.live = yyjson_get_bool(x);
  if (yyjson_val* x = yyjson_obj_get(root, "threads")) out.threads = yyjson_get_bool(x);
  static const std::set<std::string> known = {"name", "kind", "module", "entry", "description", "requires", "modules", "targets", "options", "abi", "native", "sim", "deterministic", "live", "threads", "license", "link", "publisher", "permissions", "version"};   // publisher {name, publicKey}: a community plugin's key, pinned on first use (ZN-340.02)
  size_t i, n;
  yyjson_val *k, *v;
  yyjson_obj_foreach(root, i, n, k, v) if (!known.count(yyjson_get_str(k))) warnings.push_back(std::string("unknown key \"") + yyjson_get_str(k) + "\"");
  return true;
}

std::string describePlugins(const std::string& dir, std::vector<std::string>& problems) {
  std::vector<std::string> lines;
  std::error_code ec;
  for (const auto& e : std::filesystem::directory_iterator(dir, ec)) {
    std::string path = (e.path() / "plugin.json").string();
    std::ifstream in(path, std::ios::binary);
    if (!in) continue;
    std::stringstream ss;
    ss << in.rdbuf();
    PluginManifest pm;
    std::string err;
    std::vector<std::string> warnings;
    if (!parsePluginManifest(ss.str(), pm, err, warnings)) { problems.push_back(path + ": " + err); continue; }
    for (const std::string& w : warnings) problems.push_back(path + ": " + w);
    std::string targets;
    for (const std::string& t : pm.targets) targets += (targets.empty() ? "" : ",") + t;
    lines.push_back(pm.name + " " + pm.kind + " " + (pm.module.empty() ? "-" : pm.module) + " " + pm.entry + " " + (targets.empty() ? "-" : targets));
  }
  std::sort(lines.begin(), lines.end());
  std::string out;
  for (const std::string& l : lines) out += l + "\n";
  return out;
}


namespace {

bool readText(const std::string& path, std::string& out) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream ss;
  ss << in.rdbuf();
  out = ss.str();
  return true;
}

struct JsonFile {
  yyjson_doc* doc = nullptr;
  std::string text;
  yyjson_val* root() const { return doc ? yyjson_doc_get_root(doc) : nullptr; }
  bool open(const std::string& path) {
    if (!readText(path, text)) return false;
    doc = yyjson_read_opts(text.data(), text.size(), YYJSON_READ_NOFLAG, nullptr, nullptr);
    return doc != nullptr;
  }
  ~JsonFile() { yyjson_doc_free(doc); }
};

yyjson_val* member(yyjson_val* o, const char* a, const char* b = nullptr, const char* c = nullptr) {
  yyjson_val* v = yyjson_is_obj(o) ? yyjson_obj_get(o, a) : nullptr;
  if (v && b) v = yyjson_is_obj(v) ? yyjson_obj_get(v, b) : nullptr;
  if (v && c) v = yyjson_is_obj(v) ? yyjson_obj_get(v, c) : nullptr;
  return v;
}

}  // namespace

std::vector<FoundPlugin> discoverPlugins(const std::string& engineRoot, const std::string& projectDir, std::vector<std::string>& problems) {
  namespace fs = std::filesystem;
  std::vector<std::string> roots{engineRoot + "/plugins", projectDir + "/plugins"};
  if (JsonFile zj; zj.open(projectDir + "/zinc.json"))
    if (yyjson_val* dirs = member(zj.root(), "pluginDirs"); yyjson_is_arr(dirs)) {
      size_t i, n;
      yyjson_val* e;
      yyjson_arr_foreach(dirs, i, n, e) if (yyjson_is_str(e)) roots.push_back((fs::path(projectDir) / yyjson_get_str(e)).lexically_normal().string());
    }
  std::vector<FoundPlugin> out;
  std::set<std::string> warned;
  for (const std::string& root : roots) {
    std::error_code ec;
    std::vector<fs::path> dirs;
    for (const auto& e : fs::directory_iterator(root, ec)) dirs.push_back(e.path());
    std::sort(dirs.begin(), dirs.end());
    for (const fs::path& d : dirs) {
      std::string text, path = (d / "plugin.json").string();
      if (!readText(path, text)) continue;
      FoundPlugin fp;
      std::string err;
      std::vector<std::string> warnings;
      if (!parsePluginManifest(text, fp.manifest, err, warnings)) { problems.push_back(path + ": " + err); continue; }
      for (const std::string& w : warnings) if (warned.insert(path + w).second) problems.push_back(path + ": " + w);
      if (fp.manifest.name.empty()) fp.manifest.name = d.filename().string();
      fp.dir = d.string();
      bool shadowed = false;
      for (FoundPlugin& x : out) if (x.manifest.name == fp.manifest.name) { x = fp; shadowed = true; break; }   // keeps the earlier position, like a Map
      if (!shadowed) out.push_back(std::move(fp));
    }
  }
  return out;
}

std::string listPlugins(const std::vector<FoundPlugin>& plugins) {
  if (plugins.empty()) return "no plugins found\n";
  auto pad = [](std::string s, std::size_t w) { while (s.size() < w) s += ' '; return s; };
  std::string out = "plugin (import / display)  targets                             description\n";
  for (const FoundPlugin& f : plugins) {
    const PluginManifest& m = f.manifest;
    std::string what = !m.module.empty() ? m.module : "display: " + (m.name.rfind("display-", 0) == 0 ? m.name.substr(8) : m.name);
    std::string targets;
    for (const std::string& t : m.targets) targets += (targets.empty() ? "" : ",") + t;
    out += "  " + pad(what, 24) + " " + pad(targets, 34) + " " + m.description + "\n";
  }
  return out;
}

std::vector<PluginOption> pluginOptions(const FoundPlugin& p, const std::string& projectDir, const std::string& engineRoot, const std::string& target) {
  const std::string& name = p.manifest.name;
  std::vector<PluginOption> opts = p.manifest.options;
  JsonFile zj, board;
  zj.open(projectDir + "/zinc.json");
  yyjson_val* j = zj.root();
  yyjson_val* bv = nullptr;
  if (yyjson_val* b = member(j, "board"); b && yyjson_is_str(b) && board.open(engineRoot + "/boards/" + yyjson_get_str(b) + ".json")) bv = board.root();
  // zinc.json `plugins.<name>` over the board's, then `targets.<t>.plugins.<name>` (the board's `all`, the board's target, the project's target)
  for (yyjson_val* layer : {member(bv, "plugins", name.c_str()), member(j, "plugins", name.c_str()), member(bv, "all", "plugins", name.c_str()),
                            member(member(bv, "targets"), target.c_str(), "plugins", name.c_str()), member(member(j, "targets"), target.c_str(), "plugins", name.c_str())})
    if (layer) optionsOf(layer, opts);
  if (p.manifest.kind == "display") {   // the options of the `display` object when this plugin is the driver
    std::string driver;
    std::vector<yyjson_val*> layers;
    if (const char* e = std::getenv("ZINC_DISPLAY"); e && *e) driver = e;
    else {
      yyjson_val *ba = member(bv, "all", "display"), *bt = member(member(bv, "targets"), target.c_str(), "display"), *pt = member(member(j, "targets"), target.c_str(), "display");
      yyjson_val* top = member(j, "display");
      yyjson_val* eff = nullptr;
      for (yyjson_val* l : {ba, bt, pt}) {   // an object merges key by key into an earlier object, anything else replaces it
        if (!l) continue;
        if (yyjson_is_obj(l) && eff && yyjson_is_obj(eff)) layers.push_back(l); else { layers.assign(1, l); }
        eff = l;
      }
      if (!eff) { eff = top; if (top) layers.assign(1, top); }
      if (eff && yyjson_is_str(eff)) driver = yyjson_get_str(eff);
      else if (eff && yyjson_is_obj(eff)) for (yyjson_val* l : layers) if (yyjson_val* d = yyjson_obj_get(l, "driver"); d && yyjson_is_str(d)) driver = yyjson_get_str(d);
    }
    if (!driver.empty() && (name == driver || name == "display-" + driver) && !layers.empty()) {
      std::vector<PluginOption> d;
      for (yyjson_val* l : layers) optionsOf(l, d);
      for (const PluginOption& o : d) if (o.key != "driver") { bool had = false; for (PluginOption& x : opts) if (x.key == o.key) { x.cpp = o.cpp; had = true; } if (!had) opts.push_back(o); }
    }
  }
  return opts;
}

DisplaySelection selectDisplay(const std::string& projectDir, const std::string& engineRoot, const std::string& target) {
  DisplaySelection sel;
  JsonFile zj, board;
  zj.open(projectDir + "/zinc.json");
  yyjson_val* j = zj.root();
  yyjson_val* bv = nullptr;
  if (yyjson_val* b = member(j, "board"); b && yyjson_is_str(b) && board.open(engineRoot + "/boards/" + yyjson_get_str(b) + ".json")) bv = board.root();
  auto num = [&](const char* key) {   // the board's `all`, the board's target, the project's target: later wins
    int v = 0;
    for (yyjson_val* l : {member(bv, "all", key), member(member(bv, "targets"), target.c_str(), key), member(member(j, "targets"), target.c_str(), key)})
      if (l && yyjson_is_num(l)) v = static_cast<int>(yyjson_get_num(l));
    return v;
  };
  sel.width = num("width");
  sel.height = num("height");
  if (const char* e = std::getenv("ZINC_DISPLAY"); e && *e) { sel.driver = e; return sel; }
  yyjson_val* eff = nullptr;
  std::string driver;
  for (yyjson_val* l : {member(bv, "all", "display"), member(member(bv, "targets"), target.c_str(), "display"), member(member(j, "targets"), target.c_str(), "display")}) {
    if (!l) continue;
    eff = l;
    if (yyjson_is_str(l)) driver = yyjson_get_str(l);
    else if (yyjson_is_obj(l)) if (yyjson_val* d = yyjson_obj_get(l, "driver"); d && yyjson_is_str(d)) driver = yyjson_get_str(d);
  }
  if (!eff) if (yyjson_val* top = member(j, "display")) {
    if (yyjson_is_str(top)) driver = yyjson_get_str(top);
    else if (yyjson_is_obj(top)) if (yyjson_val* d = yyjson_obj_get(top, "driver"); d && yyjson_is_str(d)) driver = yyjson_get_str(d);
  }
  sel.driver = driver;
  return sel;
}

std::vector<std::string> pluginDefines(const FoundPlugin& p, const std::string& projectDir, const std::string& engineRoot, const std::string& target) {
  auto id = [](const std::string& s) { std::string r; for (char c : s) r += std::isalnum(static_cast<unsigned char>(c)) ? static_cast<char>(std::toupper(static_cast<unsigned char>(c))) : '_'; return r; };
  std::vector<std::string> out;
  for (const PluginOption& o : pluginOptions(p, projectDir, engineRoot, target)) out.push_back("ZP_" + id(p.manifest.name) + "_" + id(o.key) + "=" + o.cpp);
  out.push_back("ZP_" + id(p.manifest.name) + "=1");
  return out;
}

}  // namespace zn::frontend
