#include "sim/board.h"

#include <set>

#include "yyjson.h"

namespace zn::sim {
namespace {
std::string compact(yyjson_val* v) {
  if (!v) return "";
  size_t len = 0;
  char* s = yyjson_val_write(v, YYJSON_WRITE_NOFLAG, &len);
  std::string r(s ? s : "", len);
  std::free(s);
  return r;
}
std::string str(yyjson_val* v) { return v && yyjson_is_str(v) ? yyjson_get_str(v) : ""; }
std::string indent(const std::string& json, const std::string& pad) {   // re-indent a compact JSON value to a nested position (pretty-printed by yyjson)
  yyjson_doc* d = yyjson_read(json.data(), json.size(), 0);
  if (!d) return json;
  size_t len = 0;
  char* s = yyjson_write(d, YYJSON_WRITE_PRETTY_TWO_SPACES, &len);
  std::string out;
  for (size_t i = 0; i < len; ++i) { out += s[i]; if (s[i] == '\n' && i + 1 < len) out += pad; }
  std::free(s);
  yyjson_doc_free(d);
  return out;
}
}  // namespace

bool parseBoard(const std::string& text, Board& out, std::string& err) {
  yyjson_doc* doc = yyjson_read(text.data(), text.size(), 0);
  if (!doc) { err = "board.json is not valid JSON"; return false; }
  yyjson_val* root = yyjson_doc_get_root(doc);
  if (!yyjson_is_obj(root)) { err = "board.json must be an object"; yyjson_doc_free(doc); return false; }
  out = Board{};
  size_t i, n;
  yyjson_val *k, *v;
  std::string extra;
  yyjson_obj_foreach(root, i, n, k, v) {
    std::string key = yyjson_get_str(k);
    if (key == "version") out.version = yyjson_is_int(v) ? static_cast<int>(yyjson_get_int(v)) : 1;
    else if (key == "author") out.author = str(v);
    else if (key == "editor") out.editor = str(v);
    else if (key == "zinc") out.zinc = compact(v);
    else if (key == "parts") {
      if (!yyjson_is_arr(v)) { err = "\"parts\" must be an array"; yyjson_doc_free(doc); return false; }
      size_t j, m; yyjson_val* p;
      yyjson_arr_foreach(v, j, m, p) {
        if (!yyjson_is_obj(p)) { err = "a part must be an object"; yyjson_doc_free(doc); return false; }
        BoardPart bp;
        size_t a, b; yyjson_val *pk, *pv;
        yyjson_obj_foreach(p, a, b, pk, pv) {
          std::string name = yyjson_get_str(pk);
          if (name == "id") bp.id = str(pv);
          else if (name == "type") bp.type = str(pv);
          else if (name == "left" && yyjson_is_num(pv)) { bp.left = yyjson_get_num(pv); bp.hasLeft = true; }
          else if (name == "top" && yyjson_is_num(pv)) { bp.top = yyjson_get_num(pv); bp.hasTop = true; }
          else if (name == "rotate" && yyjson_is_num(pv)) { bp.rotate = yyjson_get_num(pv); bp.hasRotate = true; }
          else if (name == "attrs") bp.attrs = compact(pv);
          else bp.extra += (bp.extra.empty() ? "" : ",") + std::string("\"") + name + "\":" + compact(pv);
        }
        if (bp.id.empty() || bp.type.empty()) { err = "a part needs an id and a type"; yyjson_doc_free(doc); return false; }
        out.parts.push_back(std::move(bp));
      }
    } else if (key == "connections") {
      if (!yyjson_is_arr(v)) { err = "\"connections\" must be an array"; yyjson_doc_free(doc); return false; }
      size_t j, m; yyjson_val* c;
      yyjson_arr_foreach(v, j, m, c) {
        if (!yyjson_is_arr(c) || yyjson_arr_size(c) < 2) { err = "a connection is [\"a:PIN\", \"b:PIN\", \"color\", [routing]]"; yyjson_doc_free(doc); return false; }
        BoardConnection bc;
        bc.from = str(yyjson_arr_get(c, 0)); bc.to = str(yyjson_arr_get(c, 1));
        if (yyjson_arr_size(c) > 2) bc.color = str(yyjson_arr_get(c, 2));
        if (yyjson_arr_size(c) > 3) bc.routing = compact(yyjson_arr_get(c, 3));
        out.connections.push_back(std::move(bc));
      }
    } else extra += (extra.empty() ? "" : ",") + std::string("\"") + key + "\":" + compact(v);
  }
  out.extra = extra;
  yyjson_doc_free(doc);
  return true;
}

std::string saveBoard(const Board& b) {
  auto q = [](const std::string& s) { yyjson_mut_doc* d = yyjson_mut_doc_new(nullptr); yyjson_mut_val* v = yyjson_mut_strcpy(d, s.c_str()); size_t len = 0; char* w = yyjson_mut_val_write(v, 0, &len); std::string r(w, len); std::free(w); yyjson_mut_doc_free(d); return r; };
  auto num = [](double x) { char buf[64]; if (x == static_cast<long long>(x)) std::snprintf(buf, sizeof buf, "%lld", static_cast<long long>(x)); else std::snprintf(buf, sizeof buf, "%g", x); return std::string(buf); };
  std::string o = "{\n  \"version\": " + std::to_string(b.version) + ",\n  \"author\": " + q(b.author) + ",\n  \"editor\": " + q(b.editor);
  if (!b.zinc.empty()) o += ",\n  \"zinc\": " + indent(b.zinc, "  ");
  o += ",\n  \"parts\": [";
  for (size_t i = 0; i < b.parts.size(); ++i) {
    const BoardPart& p = b.parts[i];
    o += std::string(i ? ",\n    " : "\n    ") + "{ \"id\": " + q(p.id) + ", \"type\": " + q(p.type);
    if (p.hasLeft) o += ", \"left\": " + num(p.left);
    if (p.hasTop) o += ", \"top\": " + num(p.top);
    if (p.hasRotate) o += ", \"rotate\": " + num(p.rotate);
    if (p.attrs != "{}") o += ", \"attrs\": " + p.attrs;
    if (!p.extra.empty()) o += ", " + p.extra;
    o += " }";
  }
  o += b.parts.empty() ? "]" : "\n  ]";
  o += ",\n  \"connections\": [";
  for (size_t i = 0; i < b.connections.size(); ++i) {
    const BoardConnection& c = b.connections[i];
    o += std::string(i ? ",\n    " : "\n    ") + "[ " + q(c.from) + ", " + q(c.to) + ", " + q(c.color) + ", " + c.routing + " ]";
  }
  o += b.connections.empty() ? "]" : "\n  ]";
  if (!b.extra.empty()) o += ",\n  " + b.extra;
  return o + "\n}\n";
}

std::vector<BoardDiag> validateBoard(const Board& b, const TypeKnown& known) {
  std::vector<BoardDiag> d;
  std::set<std::string> ids;
  for (const BoardPart& p : b.parts) {
    if (!ids.insert(p.id).second) d.push_back({p.id, "duplicate part id '" + p.id + "'"});
    if (!known(p.type)) d.push_back({p.id, "unknown part type '" + p.type + "'"});
  }
  auto endpoint = [&](const std::string& e, const std::string& what) {
    std::size_t c = e.find(':');
    if (c == std::string::npos || c == 0 || c + 1 == e.size()) { d.push_back({e, what + " '" + e + "' is not part:PIN"}); return; }
    if (!ids.count(e.substr(0, c))) d.push_back({e, what + " '" + e + "' names no part"});
  };
  for (const BoardConnection& c : b.connections) { endpoint(c.from, "connection end"); endpoint(c.to, "connection end"); }
  return d;
}

}  // namespace zn::sim
