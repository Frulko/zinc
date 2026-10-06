#include "frontend/plugin_manifest.h"

#include <algorithm>
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
    yyjson_obj_foreach(t, i, n, k, v) out.targets.push_back(yyjson_get_str(k));
    out.targetsJson = dumped(t);
  }
  if (yyjson_val* o = yyjson_obj_get(root, "options")) out.optionsJson = dumped(o);
  static const std::set<std::string> known = {"name", "kind", "module", "entry", "description", "requires", "modules", "targets", "options"};
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

}  // namespace zn::frontend
