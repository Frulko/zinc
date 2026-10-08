#include "frontend/project.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <filesystem>

#include "yyjson.h"

namespace zn::frontend {
namespace {

bool strKey(yyjson_val* o, const char* key, std::string& dst, std::string& err) {
  yyjson_val* v = yyjson_obj_get(o, key);
  if (!v) return true;
  if (!yyjson_is_str(v)) { err = std::string("\"") + key + "\" must be a string"; return false; }
  dst = yyjson_get_str(v);
  return true;
}

// The 1-based line of the first `"value"` (or `"key"`) in the manifest text, for the diagnostics of the manifest rules.
int lineOf(const std::string& text, const std::string& needle) {
  std::size_t at = text.find("\"" + needle + "\"");
  if (at == std::string::npos) return 1;
  int line = 1;
  for (std::size_t i = 0; i < at; ++i) if (text[i] == '\n') ++line;
  return line;
}

bool reverseDns(const std::string& id) {   // com.example.notes: two or more dot-separated labels of letters, digits and hyphens, the first starting with a letter
  int labels = 0;
  std::size_t from = 0;
  while (from <= id.size()) {
    std::size_t dot = id.find('.', from);
    std::string label = id.substr(from, dot == std::string::npos ? std::string::npos : dot - from);
    if (label.empty() || (labels == 0 && !std::isalpha(static_cast<unsigned char>(label[0])))) return false;
    for (char c : label) if (!std::isalnum(static_cast<unsigned char>(c)) && c != '-') return false;
    ++labels;
    if (dot == std::string::npos) break;
    from = dot + 1;
  }
  return labels >= 2;
}

const std::vector<std::string>* gGranted = nullptr;
std::string gAppJson;

}  // namespace

const std::vector<std::string>& systemFeatures() {
  static const std::vector<std::string> f = {"notification", "menu", "tray", "dialog", "window", "shortcut", "instance", "deep-link", "autostart", "dock", "power", "clipboard", "opener"};
  return f;
}
void setSystemAppJson(const std::string& json) { gAppJson = json; }
std::string gScopesJson;
void setSystemScopesJson(const std::string& json) { gScopesJson = json; }
namespace { std::string gUiLayout = "classic"; }
void setUiLayout(const std::string& layout) { gUiLayout = layout.empty() ? "classic" : layout; }
const std::string& uiLayout() { return gUiLayout; }
bool resolveUiLayout(const Project& p, const std::map<std::string, std::string>& caps, const std::string& target, std::string& layout, std::string& err) {
  auto cap = [&](const char* k) { auto it = caps.find(k); return it == caps.end() ? std::string() : it->second; };
  layout = p.uiLayout.empty() ? (p.uiPreset == "react-native" ? "rn" : "auto") : p.uiLayout;
  if (layout == "auto") layout = cap("ui.layout").empty() ? "classic" : cap("ui.layout");
  if (layout == "rn" && cap("ui.rn") == "false") {
    const std::string why = cap("ui.why");
    err = "the rn layout (Yoga) is not available on " + target + (why.empty() ? "" : ": " + why) + "; use \"ui\": {\"layout\": \"classic\"} or \"auto\"";
    return false;
  }
  return true;
}
const std::string& systemScopesJson() { return gScopesJson; }
const std::string& systemAppJson() { return gAppJson; }
void setSystemPermissions(const std::vector<std::string>* granted) { gGranted = granted; }
const std::vector<std::string>* systemPermissions() { return gGranted; }
std::string systemFeatureOf(const std::string& spec) {
  if (spec.rfind("zinc:system/", 0) != 0) return "";
  std::string f = spec.substr(12);
  return f == "deeplink" ? "deep-link" : f;
}

std::vector<std::string> permissionsFor(const Project& p, const std::string& target) {
  std::vector<std::string> out = p.permissions;
  auto it = p.targetPermissions.find(target);
  if (it == p.targetPermissions.end()) return out;
  for (const std::string& e : it->second) {
    if (!e.empty() && e[0] == '-') { std::string id = e.substr(1); out.erase(std::remove(out.begin(), out.end(), id), out.end()); }
    else if (std::find(out.begin(), out.end(), e) == out.end()) out.push_back(e);
  }
  return out;
}

bool parseProject(const std::string& text, Project& out, std::string& err) {
  yyjson_read_err re;
  yyjson_doc* doc = yyjson_read_opts(const_cast<char*>(text.data()), text.size(), YYJSON_READ_ALLOW_COMMENTS | YYJSON_READ_ALLOW_TRAILING_COMMAS, nullptr, &re);
  if (!doc) { err = std::string("invalid JSON: ") + re.msg + " at byte " + std::to_string(re.pos); return false; }
  struct Free { yyjson_doc* d; ~Free() { yyjson_doc_free(d); } } guard{doc};
  yyjson_val* root = yyjson_doc_get_root(doc);
  if (!yyjson_is_obj(root)) { err = "the manifest must be a JSON object"; return false; }
  std::string main;
  if (!strKey(root, "name", out.name, err) || !strKey(root, "entry", out.entry, err) || !strKey(root, "main", main, err)) return false;
  if (out.entry.empty()) out.entry = main;
  if (yyjson_val* pr = yyjson_obj_get(root, "profile")) {
    if (!yyjson_is_str(pr)) { err = "\"profile\" must be a string"; return false; }
    out.profile = yyjson_get_str(pr);
  }
  if (yyjson_val* x = yyjson_obj_get(root, "keyboard"); x && yyjson_is_str(x)) out.keyboard = yyjson_get_str(x);
  if (yyjson_val* x = yyjson_obj_get(root, "webgl"); x && yyjson_is_bool(x)) out.webgl = yyjson_get_bool(x);
  if (yyjson_val* x = yyjson_obj_get(root, "scheme"); x && yyjson_is_str(x)) out.scheme = yyjson_get_str(x);
  if (yyjson_val* x = yyjson_obj_get(root, "text"); x && yyjson_is_str(x)) {
    out.text = yyjson_get_str(x);
    if (out.text != "shaped" && out.text != "simple") out.warnings.push_back("\"text\" must be \"shaped\" or \"simple\"");
  }
  if (yyjson_val* u = yyjson_obj_get(root, "ui")) {   // ZN-285
    if (!yyjson_is_obj(u)) { err = "\"ui\" must be an object"; out.fatal = true; return false; }
    if (yyjson_val* l = yyjson_obj_get(u, "layout")) {
      out.uiLayout = yyjson_is_str(l) ? yyjson_get_str(l) : "";
      if (out.uiLayout != "classic" && out.uiLayout != "rn" && out.uiLayout != "auto") { err = "\"ui.layout\" must be \"classic\", \"rn\" or \"auto\""; out.fatal = true; return false; }
    }
    if (yyjson_val* pr = yyjson_obj_get(u, "preset")) {
      out.uiPreset = yyjson_is_str(pr) ? yyjson_get_str(pr) : "";
      if (out.uiPreset != "react-native") { err = "\"ui.preset\" must be \"react-native\""; out.fatal = true; return false; }
    }
  }
  if (yyjson_val* r = yyjson_obj_get(root, "requires")) {
    if (!yyjson_is_arr(r)) { err = "\"requires\" must be an array"; return false; }
    size_t i, n;
    yyjson_val* e;
    yyjson_arr_foreach(r, i, n, e) if (yyjson_is_str(e)) out.requires_.push_back(yyjson_get_str(e));
  }
  if (yyjson_val* t = yyjson_obj_get(root, "targets")) {
    if (!yyjson_is_obj(t)) { err = "\"targets\" must be an object"; return false; }
    size_t i, n;
    yyjson_val *k, *v;
    yyjson_obj_foreach(t, i, n, k, v) {
      if (!yyjson_is_obj(v)) { err = std::string("target \"") + yyjson_get_str(k) + "\" must be an object"; return false; }
      TargetOptions o;
      auto num = [&](const char* key) -> yyjson_val* { yyjson_val* x = yyjson_obj_get(v, key); return x && yyjson_is_num(x) ? x : nullptr; };
      auto flag = [&](const char* key, bool& dst) { yyjson_val* x = yyjson_obj_get(v, key); if (x && yyjson_is_bool(x)) dst = yyjson_get_bool(x); };
      if (yyjson_val* x = num("width")) o.width = static_cast<int>(yyjson_get_num(x));
      if (yyjson_val* x = num("height")) o.height = static_cast<int>(yyjson_get_num(x));
      if (yyjson_val* x = num("zoom")) o.zoom = yyjson_get_num(x);
      if (yyjson_val* x = num("heap")) o.heap = static_cast<long>(yyjson_get_num(x));
      flag("fullscreen", o.fullscreen); flag("kiosk", o.kiosk); flag("growDrawCommands", o.growDrawCommands);
      if (yyjson_val* x = yyjson_obj_get(v, "resize"); x && yyjson_is_str(x)) o.resize = yyjson_get_str(x);
      if (yyjson_val* x = yyjson_obj_get(v, "display")) {
        if (yyjson_is_str(x)) o.display = yyjson_get_str(x);
        else if (yyjson_is_obj(x)) if (yyjson_val* d = yyjson_obj_get(x, "driver"); d && yyjson_is_str(d)) o.display = yyjson_get_str(d);
      }
      out.targets[yyjson_get_str(k)] = o;
    }
  }
  auto fatal = [&](int line, const std::string& msg) { out.fatal = true; err = "line " + std::to_string(line) + ": " + msg; return false; };
  auto permissionList = [&](yyjson_val* arr, std::vector<std::string>& dst, const char* where) -> bool {
    if (!yyjson_is_arr(arr)) return fatal(1, std::string("\"") + where + "\" must be an array of permission ids");
    size_t i, n; yyjson_val* e;
    yyjson_arr_foreach(arr, i, n, e) {
      if (!yyjson_is_str(e)) return fatal(1, std::string("\"") + where + "\" holds a non-string entry");
      std::string id = yyjson_get_str(e), base = id.size() && id[0] == '-' ? id.substr(1) : id;
      std::string feature = base.substr(0, base.find(':'));
      if (std::find(systemFeatures().begin(), systemFeatures().end(), feature) == systemFeatures().end()) {
        std::string all; for (const std::string& f : systemFeatures()) all += (all.empty() ? "" : ", ") + f;
        return fatal(lineOf(text, id), "unknown permission '" + id + "' (known features: " + all + ")");
      }
      dst.push_back(id);
    }
    return true;
  };
  if (yyjson_val* a = yyjson_obj_get(root, "app")) {
    if (!yyjson_is_obj(a)) return fatal(lineOf(text, "app"), "\"app\" must be an object");
    AppInfo& app = out.app;
    app.present = true;
    { char* js = yyjson_val_write(a, 0, nullptr); if (js) { app.json = js; std::free(js); } }
    auto str = [&](const char* key, std::string& dst) -> bool { yyjson_val* x = yyjson_obj_get(a, key); if (!x) return true; if (!yyjson_is_str(x)) return fatal(lineOf(text, key), std::string("app.") + key + " must be a string"); dst = yyjson_get_str(x); return true; };
    if (!str("id", app.id) || !str("name", app.name) || !str("version", app.version) || !str("icon", app.icon) || !str("copyright", app.copyright) || !str("category", app.category)) return false;
    if (app.id.empty()) return fatal(lineOf(text, "app"), "app.id is required (a reverse-DNS id such as com.example.notes)");
    if (!reverseDns(app.id)) return fatal(lineOf(text, app.id), "app.id '" + app.id + "' is not a reverse-DNS id (letters, digits and hyphens in two or more dot-separated labels, like com.example.notes)");
    if (yyjson_val* d = yyjson_obj_get(a, "dock")) { if (!yyjson_is_bool(d)) return fatal(lineOf(text, "dock"), "app.dock must be true or false"); app.dock = yyjson_get_bool(d); }
    for (const char* key : {"urlSchemes", "fileTypes"}) {
      yyjson_val* x = yyjson_obj_get(a, key);
      if (!x) continue;
      if (!yyjson_is_arr(x)) return fatal(lineOf(text, key), std::string("app.") + key + " must be an array of strings");
      size_t i, n; yyjson_val* e;
      yyjson_arr_foreach(x, i, n, e) if (yyjson_is_str(e)) (std::strcmp(key, "urlSchemes") == 0 ? app.urlSchemes : app.fileTypes).push_back(yyjson_get_str(e));
    }
    if (yyjson_val* w = yyjson_obj_get(a, "window")) { if (!yyjson_is_obj(w)) return fatal(lineOf(text, "window"), "app.window must be an object"); char* js = yyjson_val_write(w, 0, nullptr); if (js) { app.window = js; std::free(js); } }
  }
  if (yyjson_val* pm = yyjson_obj_get(root, "permissions")) if (!permissionList(pm, out.permissions, "permissions")) return false;
  if (yyjson_val* sc = yyjson_obj_get(root, "scopes")) {
    if (!yyjson_is_obj(sc)) return fatal(lineOf(text, "scopes"), "\"scopes\" must be an object");
    char* js = yyjson_val_write(sc, 0, nullptr); if (js) { out.scopes = js; std::free(js); }
  }
  if (yyjson_val* t = yyjson_obj_get(root, "targets")) {
    size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(t, i, n, k, v) if (yyjson_val* pm = yyjson_obj_get(v, "permissions")) if (!permissionList(pm, out.targetPermissions[yyjson_get_str(k)], "targets.<name>.permissions")) return false;
  }
  static const char* known[] = {"app", "permissions", "scopes", "name", "entry", "main", "assets", "version", "id", "icon", "crash", "display", "plugins", "pluginDirs", "targets", "board", "requires", "text", "scheme", "webgl", "keyboard", "bench", "description", "profile", "ui", "icons"};
  size_t i, n;
  yyjson_val *k, *v;
  yyjson_obj_foreach(root, i, n, k, v) {
    bool ok = false;
    for (const char* key : known) if (!std::strcmp(yyjson_get_str(k), key)) ok = true;
    if (!ok) out.warnings.push_back(std::string("unknown key \"") + yyjson_get_str(k) + "\"");
  }
  return true;
}

std::string findProjectFile(const std::string& path) {
  namespace fs = std::filesystem;
  std::error_code ec;
  fs::path p = fs::absolute(path, ec).lexically_normal();
  if (!fs::is_directory(p, ec)) p = p.parent_path();
  for (; !p.empty(); p = p.parent_path()) {
    fs::path f = p / "zinc.json";
    if (fs::is_regular_file(f, ec)) return f.string();
    if (p == p.root_path()) break;
  }
  return "";
}

std::string entryOf(const std::string& dir, const Project* project) {
  namespace fs = std::filesystem;
  std::error_code ec;
  std::vector<std::string> candidates;
  if (project && !project->entry.empty()) candidates.push_back(project->entry);
  for (const char* c : {"src/main.ts", "src/main.tsx", "main.ts", "main.tsx"}) candidates.push_back(c);
  for (const std::string& c : candidates) {
    fs::path f = fs::path(dir) / c;
    if (fs::is_regular_file(f, ec)) return f.string();
  }
  return "";
}

}  // namespace zn::frontend
