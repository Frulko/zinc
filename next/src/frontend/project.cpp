#include "frontend/project.h"

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

}  // namespace

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
  static const char* known[] = {"name", "entry", "main", "assets", "version", "id", "icon", "crash", "display", "plugins", "pluginDirs", "targets", "board", "requires", "bench", "description", "profile"};
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
