#include "frontend/tsconfig.h"

#include "yyjson.h"

namespace zn::frontend {

bool parseTsConfig(std::string_view text, TsConfig& out, std::string& err) {
  yyjson_read_err re;
  yyjson_doc* doc = yyjson_read_opts(const_cast<char*>(text.data()), text.size(), YYJSON_READ_ALLOW_COMMENTS | YYJSON_READ_ALLOW_TRAILING_COMMAS, nullptr, &re);
  if (!doc) { err = std::string("invalid JSON: ") + re.msg + " at byte " + std::to_string(re.pos); return false; }
  struct Free { yyjson_doc* d; ~Free() { yyjson_doc_free(d); } } guard{doc};
  out = TsConfig{};
  yyjson_val* root = yyjson_doc_get_root(doc);
  yyjson_val* opts = yyjson_is_obj(root) ? yyjson_obj_get(root, "compilerOptions") : nullptr;
  if (!yyjson_is_obj(opts)) return true;
  if (yyjson_val* b = yyjson_obj_get(opts, "baseUrl"); yyjson_is_str(b)) out.baseUrl = yyjson_get_str(b);
  yyjson_val* paths = yyjson_obj_get(opts, "paths");
  if (!yyjson_is_obj(paths)) return true;
  size_t i, n;
  yyjson_val *k, *v;
  yyjson_obj_foreach(paths, i, n, k, v) {
    std::vector<std::string> targets;
    size_t j, m;
    yyjson_val* t;
    if (yyjson_is_arr(v)) yyjson_arr_foreach(v, j, m, t) if (yyjson_is_str(t)) targets.push_back(yyjson_get_str(t));
    out.paths.push_back({yyjson_get_str(k), std::move(targets)});
  }
  return true;
}

std::vector<std::string> mapSpecifier(const TsConfig& c, std::string_view spec, std::string& matched) {
  const std::pair<std::string, std::vector<std::string>>* best = nullptr;
  std::string star;
  std::size_t bestLen = 0;
  for (const auto& p : c.paths) {
    const std::string& pat = p.first;
    std::size_t at = pat.find('*');
    if (at == std::string::npos) {
      if (pat == spec) { best = &p; star.clear(); bestLen = pat.size() + 1; break; }  // an exact pattern beats any wildcard
      continue;
    }
    std::string_view pre(pat.data(), at), post(pat.data() + at + 1, pat.size() - at - 1);
    if (spec.size() < pre.size() + post.size() || spec.substr(0, pre.size()) != pre || spec.substr(spec.size() - post.size()) != post) continue;
    if (pre.size() >= bestLen) { best = &p; bestLen = pre.size(); star = std::string(spec.substr(pre.size(), spec.size() - pre.size() - post.size())); }
  }
  if (!best) return {};
  matched = best->first;
  std::vector<std::string> out;
  for (const std::string& t : best->second) {
    std::string r = t;
    if (std::size_t at = r.find('*'); at != std::string::npos) r.replace(at, 1, star);
    out.push_back(std::move(r));
  }
  return out;
}

}  // namespace zn::frontend
