#include "frontend/capabilities.h"

#include <cctype>
#include <cstdlib>
#include <fstream>
#include <sstream>

#include "yyjson.h"

namespace zn::frontend {
namespace {

bool available(const std::string& v) {
  if (v == "true" || v == "plugin" || v == "optional") return true;
  if (v.empty() || v == "false") return false;
  char* end = nullptr;
  double d = std::strtod(v.c_str(), &end);
  return end && *end == 0 && d > 0;
}

// gpu and tier are ladders, not numbers: `requires gpu>=gles3`, `tier>=T2` (docs/reports/ui-rendering-architecture.md 4.13). -1: not a ladder value.
int ladder(const std::string& name, const std::string& v) {
  if (name == "tier") return v.size() == 2 && v[0] == 'T' && v[1] >= '0' && v[1] <= '4' ? v[1] - '0' : -1;
  if (name != "gpu") return -1;
  if (v == "none" || v == "false" || v.empty()) return 0;
  if (v == "gles2" || v == "webgl1") return 1;
  if (v == "gles3" || v == "webgl2") return 2;
  if (v == "metal" || v == "vulkan" || v == "d3d") return 3;
  return -1;
}

bool availableNamed(const std::string& name, const std::string& v) { return name == "gpu" ? ladder(name, v) > 0 : available(v); }

double bytes(const std::string& v) {
  std::size_t i = 0;
  while (i < v.size() && (std::isdigit(static_cast<unsigned char>(v[i])) || v[i] == '.')) ++i;
  double n = std::strtod(v.substr(0, i).c_str(), nullptr);
  std::string unit = v.substr(i);
  for (char& c : unit) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  if (!unit.empty() && unit[0] == 'K') return n * 1024;
  if (!unit.empty() && unit[0] == 'M') return n * (1 << 20);
  if (!unit.empty() && unit[0] == 'G') return n * (1 << 30);
  return n;
}

std::string trim(const std::string& s) {
  std::size_t a = 0, b = s.size();
  while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
  while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
  return s.substr(a, b - a);
}

}  // namespace

Caps capsFor(const Profile& p, const std::string& engineRoot) { return capsFromFile(p, engineRoot + "/../targets/capabilities.json"); }

Caps capsFromFile(const Profile& p, const std::string& capabilitiesJson) {
  Caps caps;
  std::ifstream in(capabilitiesJson);
  std::stringstream ss;
  ss << in.rdbuf();
  std::string text = ss.str();
  if (yyjson_doc* doc = yyjson_read(text.c_str(), text.size(), 0)) {
    if (yyjson_val* mine = yyjson_obj_get(yyjson_doc_get_root(doc), p.name); yyjson_is_obj(mine)) {
      yyjson_obj_iter it = yyjson_obj_iter_with(mine);
      yyjson_val* key;
      while ((key = yyjson_obj_iter_next(&it))) {
        yyjson_val* v = yyjson_obj_iter_get_val(key);
        auto text = [](yyjson_val* x) { return std::string(yyjson_is_bool(x) ? (yyjson_get_bool(x) ? "true" : "false") : yyjson_is_str(x) ? yyjson_get_str(x) : yyjson_is_num(x) ? std::to_string(yyjson_get_num(x)) : ""); };
        if (yyjson_is_obj(v)) {   // a group ("ui": {"layout": ...}) reads as "ui.layout"
          yyjson_obj_iter in = yyjson_obj_iter_with(v);
          while (yyjson_val* k2 = yyjson_obj_iter_next(&in)) caps[std::string(yyjson_get_str(key)) + "." + yyjson_get_str(k2)] = text(yyjson_obj_iter_get_val(k2));
          continue;
        }
        caps[yyjson_get_str(key)] = text(v);
      }
    }
    yyjson_doc_free(doc);
  }
  caps["heap"] = std::to_string(p.heapBytes);
  caps["numbers"] = p.number == Num::f64 ? "f64" : p.number == Num::f32 ? "f32" : p.number == Num::fx12 ? "fx12" : "fx16";
  caps["fpu"] = p.noFpu ? "false" : "true";
  caps["width"] = std::to_string(p.width);
  caps["height"] = std::to_string(p.height);
  return caps;
}

bool satisfied(const std::string& reqIn, const Caps& caps) {
  std::string r = trim(reqIn);
  if (r.find('|') != std::string::npos) {
    std::size_t from = 0;
    while (true) {
      std::size_t bar = r.find('|', from);
      if (satisfied(r.substr(from, bar == std::string::npos ? std::string::npos : bar - from), caps)) return true;
      if (bar == std::string::npos) return false;
      from = bar + 1;
    }
  }
  auto get = [&](const std::string& k) { auto it = caps.find(k); return it == caps.end() ? std::string() : it->second; };
  if (!r.empty() && r[0] == '!') return !availableNamed(r.substr(1), get(r.substr(1)));
  std::size_t i = 0;
  while (i < r.size() && (std::isalnum(static_cast<unsigned char>(r[i])) || r[i] == '_')) ++i;
  std::string name = r.substr(0, i);
  std::size_t j = i;
  while (j < r.size() && std::isspace(static_cast<unsigned char>(r[j]))) ++j;
  std::string op;
  if (j < r.size() && (r[j] == '>' || r[j] == '<' || r[j] == '=')) {
    op += r[j++];
    if (j < r.size() && r[j] == '=') op += r[j++];
  }
  if (op.empty()) return availableNamed(r, get(r));
  std::string want = trim(r.substr(j)), have = get(name);
  if (int h = ladder(name, have), w = ladder(name, want); h >= 0 && w >= 0 && op != "=") return op == ">=" ? h >= w : op == "<=" ? h <= w : op == ">" ? h > w : h < w;
  char* end = nullptr;
  double hv = std::strtod(have.c_str(), &end);
  if (!have.empty() && end && *end == 0) {
    double w = bytes(want);
    return op == ">=" ? hv >= w : op == "<=" ? hv <= w : op == ">" ? hv > w : op == "<" ? hv < w : hv == w;
  }
  return have == want;
}

std::string explain(const std::vector<std::string>& requires_, const Caps& caps, const std::string& profile) {
  std::string out;
  for (const std::string& r : requires_) {
    if (satisfied(r, caps)) continue;
    std::size_t i = r.empty() || r[0] != '!' ? 0 : 1, j = i;
    while (j < r.size() && (std::isalnum(static_cast<unsigned char>(r[j])) || r[j] == '_')) ++j;
    std::string name = r.substr(i, j - i);
    auto it = caps.find(name);
    std::string shown = it == caps.end() ? "no" : it->second;
    if (name == "heap" && it != caps.end()) { double n = std::strtod(it->second.c_str(), nullptr); shown = n >= (1 << 20) ? std::to_string(static_cast<long>(n / (1 << 20) + 0.5)) + "M" : std::to_string(static_cast<long>(n / 1024 + 0.5)) + "K"; }
    out += (out.empty() ? "" : ", ") + r + " (" + profile + " has " + name + " " + shown + ")";
  }
  return out;
}

}  // namespace zn::frontend
