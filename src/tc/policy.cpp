#include "tc/policy.h"

#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

#include "tc/tc.h"
#include "yyjson.h"

namespace fs = std::filesystem;

namespace zn::tc {
namespace {

Policy gPolicy;
bool gLoaded = false;

std::vector<std::string> strs(yyjson_val* a) { std::vector<std::string> r; size_t i, n; yyjson_val* e; yyjson_arr_foreach(a, i, n, e) if (yyjson_is_str(e)) r.push_back(yyjson_get_str(e)); return r; }

// One layer: `o` is a policy object; every key it sets may only tighten `p`.
void layer(Policy& p, yyjson_val* o, const std::string& where) {
  if (!yyjson_is_obj(o)) return;
  if (yyjson_val* v = yyjson_obj_get(o, "tiers"); yyjson_is_arr(v)) {
    std::vector<std::string> keep;
    const std::vector<std::string> asked = strs(v);
    for (const std::string& t : p.tiers) if (std::find(asked.begin(), asked.end(), t) != asked.end()) keep.push_back(t);   // never one the layers above refused
    if (keep != p.tiers) { p.tiers = keep; p.from["tiers"] = where; }   // the layer that narrowed it is where it comes from
  }
  if (yyjson_val* v = yyjson_obj_get(o, "prebuilt"); yyjson_is_bool(v) && p.prebuilt && !yyjson_get_bool(v)) { p.prebuilt = false; p.from["prebuilt"] = where; }
  if (yyjson_val* v = yyjson_obj_get(o, "rebuilds"); yyjson_is_int(v) && yyjson_get_sint(v) > p.rebuilds) { p.rebuilds = static_cast<long>(yyjson_get_sint(v)); p.from["rebuilds"] = where; }
  if (yyjson_val* v = yyjson_obj_get(o, "transparency"); yyjson_is_str(v) && std::string(yyjson_get_str(v)) == "required") { p.transparency = "required"; p.from["transparency"] = where; }
  if (yyjson_val* v = yyjson_obj_get(o, "mirrors"); yyjson_is_arr(v)) {
    std::vector<std::string> m = strs(v);
    if (!p.mirrors.empty()) { std::vector<std::string> keep; for (const std::string& x : m) if (std::find(p.mirrors.begin(), p.mirrors.end(), x) != p.mirrors.end()) keep.push_back(x); m = keep; }
    if (m != p.mirrors) { p.mirrors = m; p.from["mirrors"] = where; }
  }
}

void layerFile(Policy& p, const fs::path& f, const std::string& kind, const char* key = nullptr) {
  std::ifstream in(f);
  if (!in) return;
  std::stringstream ss; ss << in.rdbuf();
  yyjson_doc* d = yyjson_read(ss.str().data(), ss.str().size(), 0);
  yyjson_val* r = yyjson_doc_get_root(d);
  layer(p, key ? yyjson_obj_get(r, key) : r, kind + " " + f.string());
  yyjson_doc_free(d);
}

}  // namespace

bool Policy::accepts(const std::string& tier) const { return std::find(tiers.begin(), tiers.end(), tier) != tiers.end(); }

const Policy& loadPolicy(const std::string& projectDir) {
  Policy p;
  for (const char* k : {"tiers", "prebuilt", "rebuilds", "transparency", "mirrors"}) p.from[k] = "default";
  const char* sys = std::getenv("ZINC_SYSTEM_POLICY");
  layerFile(p, sys && *sys ? fs::path(sys) : fs::path("/etc/zinc/policy.json"), "system");
  layerFile(p, fs::path(home()) / "policy.json", "user");
  if (const char* v = std::getenv("ZINC_PREBUILT"); v && std::string(v) == "0" && p.prebuilt) { p.prebuilt = false; p.from["prebuilt"] = "environment ZINC_PREBUILT"; }
  if (const char* v = std::getenv("ZINC_REBUILDS_MIN"); v && std::atol(v) > p.rebuilds) { p.rebuilds = std::atol(v); p.from["rebuilds"] = "environment ZINC_REBUILDS_MIN"; }
  if (!projectDir.empty()) layerFile(p, fs::path(projectDir) / "zinc.json", "project", "policy");
  gPolicy = p;
  gLoaded = true;
  return gPolicy;
}

const Policy& currentPolicy() { return gLoaded ? gPolicy : loadPolicy(""); }

std::string describePolicy(const Policy& p) {
  std::string tiers, mirrors;
  for (const std::string& t : p.tiers) tiers += (tiers.empty() ? "" : ", ") + t;
  for (const std::string& m : p.mirrors) mirrors += (mirrors.empty() ? "" : ", ") + m;
  auto line = [&](const char* k, const std::string& v) { return std::string("  ") + k + std::string(14 - std::string(k).size(), ' ') + v + "  (" + p.from.at(k) + ")\n"; };
  return line("tiers", tiers.empty() ? "none" : tiers) + line("prebuilt", p.prebuilt ? "allowed" : "source only") + line("rebuilds", std::to_string(p.rebuilds)) +
         line("transparency", p.transparency) + line("mirrors", mirrors.empty() ? "any (ZINC_MIRRORS)" : mirrors);
}

}  // namespace zn::tc
