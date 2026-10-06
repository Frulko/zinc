#include "qjs/strip.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <vector>

#include "frontend/parser.h"

namespace zn::qjs {
namespace {
using namespace zn::frontend;

struct Edit { std::uint32_t from, to; std::string text; };  // text empty: blank the range (newlines kept)

struct Stripper {
  std::string_view s;
  const Ast& a;
  std::vector<Edit> edits;
  std::string err;
  std::uint32_t errPos = 0;

  Stripper(std::string_view src, const Ast& ast) : s(src), a(ast) {}

  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  void blank(std::uint32_t from, std::uint32_t to) { if (from < to && to <= s.size()) edits.push_back({from, to, ""}); }
  void fail(std::uint32_t pos, std::string msg) { if (err.empty()) { err = std::move(msg); errPos = pos; } }
  bool space(std::uint32_t i) const { return i < s.size() && std::isspace(static_cast<unsigned char>(s[i])); }

  // `: T` after a name: the colon (and a `?` or `!` before it) up to the end of the type, with the parentheses around the type
  void annotation(std::uint32_t type) {
    if (type == kNone) return;
    const Node& t = n(type);
    std::uint32_t from = t.start;
    int parens = 0;
    while (from > 0 && (space(from - 1) || s[from - 1] == '(')) { if (s[from - 1] == '(') parens++; from--; }
    if (from == 0 || s[from - 1] != ':') return;  // not an annotation we recognise (a synthetic type): leave it
    from--;
    std::uint32_t q = from;
    while (q > 0 && space(q - 1)) q--;
    if (q > 0 && (s[q - 1] == '?' || s[q - 1] == '!')) from = q - 1;
    std::uint32_t to = t.end;
    while (parens > 0) { while (space(to)) to++; if (to < s.size() && s[to] == ')') { to++; parens--; } else break; }
    blank(from, to);
  }

  // `<...>` that starts at or after `from` (only whitespace between): erased to its matching `>`
  void angles(std::uint32_t from) {
    while (from < s.size() && space(from)) from++;
    if (from >= s.size() || s[from] != '<') return;
    int depth = 0;
    for (std::uint32_t i = from; i < s.size(); ++i) {
      if (s[i] == '<') depth++;
      else if (s[i] == '>' && --depth == 0) { blank(from, i + 1); return; }
    }
  }
  // the angle brackets that hold the nodes `list` (type parameters or arguments): the `<` just before the first, up to the `>` after the last
  void bracketed(const std::vector<std::uint32_t>& list) {
    if (list.empty()) return;
    std::uint32_t first = n(list.front()).start;
    while (first > 0 && (space(first - 1) || s[first - 1] == '<')) { first--; if (s[first] == '<') break; }
    if (first < s.size() && s[first] == '<') angles(first);
  }

  // modifiers before a member's name: public private protected readonly abstract override declare
  void modifiers(std::uint32_t at) {
    for (;;) {
      while (space(at)) at++;
      std::uint32_t e = at;
      while (e < s.size() && (std::isalnum(static_cast<unsigned char>(s[e])) || s[e] == '_' || s[e] == '$')) e++;
      std::string_view w = s.substr(at, e - at);
      if (w != "public" && w != "private" && w != "protected" && w != "readonly" && w != "abstract" && w != "override" && w != "declare") return;
      std::uint32_t nx = e;
      while (space(nx)) nx++;
      if (nx >= s.size() || std::string_view("(:=;?<}!,)").find(s[nx]) != std::string_view::npos) return;  // a member that is called like a modifier
      blank(at, e);
      at = e;
    }
  }

  // `constructor(private x: i32)`: the assignments `this.x = x;` go first in the body, after the `super(...)` call of a derived class
  void paramProperties(const Node& ctor) {
    std::string text;
    for (std::size_t k = 2; k < ctor.kids.size(); ++k) {
      const Node& p = n(ctor.kids[k]);
      if (p.flags & (kFlagPublic | kFlagPrivate | kFlagProtected | kFlagReadonly)) text += " this." + std::string(p.text) + " = " + std::string(p.text) + ";";
    }
    if (text.empty() || ctor.kids[1] == kNone) return;
    const Node& body = n(ctor.kids[1]);
    std::uint32_t at = body.start + 1;
    for (std::uint32_t k : body.kids) {
      const Node& st = n(k);
      if (st.flags & kFlagSynthetic) continue;
      if (st.kind == N::ExprStmt && !st.kids.empty() && n(st.kids[0]).kind == N::Call && n(n(st.kids[0]).kids[0]).kind == N::Super) at = st.end;
      break;
    }
    edits.push_back({at, at, text});
  }

  void enumDecl(const Node& x) {
    std::string name(x.text);
    std::string r = "var " + name + "; (function (" + name + ") { ";
    std::string prev;
    for (std::uint32_t k : x.kids) {
      const Node& m = n(k);
      std::string mn(m.text), value;
      if (!m.kids.empty() && m.kids[0] != kNone) value = std::string(s.substr(n(m.kids[0]).start, n(m.kids[0]).end - n(m.kids[0]).start));
      else value = prev.empty() ? "0" : prev + " + 1";
      std::string q = "\"" + mn + "\"";
      r += name + "[" + name + "[" + q + "] = " + value + "] = " + q + "; ";
      prev = name + "[" + q + "]";
    }
    r += "})(" + name + " || (" + name + " = {}));";
    edits.push_back({x.start, x.end, r});
  }

  void run() {
    for (std::uint32_t i = 0; i < a.nodes.size() && err.empty(); ++i) {
      const Node& x = n(i);
      if (x.flags & kFlagSynthetic) continue;
      switch (x.kind) {
        case N::Declarator: annotation(x.kids[0]); break;
        case N::Param:
          if (x.flags & (kFlagPublic | kFlagPrivate | kFlagProtected | kFlagReadonly)) modifiers(x.start);
          annotation(x.kids[0]);
          break;
        case N::Function: case N::FuncExpr: annotation(x.kids[0]); break;
        case N::Method:
          if ((x.flags & kFlagAbstract) && x.kids[1] == kNone) { blank(x.start, x.end); break; }
          annotation(x.kids[0]);
          modifiers(x.start);
          if (x.text == "constructor") paramProperties(x);
          break;
        case N::Field: annotation(x.kids[0]); modifiers(x.start); break;
        case N::Class: {
          modifiers(x.start);
          if (x.kids[0] != kNone) { const Node& e = n(x.kids[0]); if (!e.kids.empty()) angles(e.start + e.text.size()); }
          if (x.kids[1] != kNone) {  // `implements A, B`: from the keyword to the end of the list
            const Node& h = n(x.kids[1]);
            std::uint32_t k = h.start;
            while (k >= 10 && s.substr(k - 10, 10) != "implements") k--;
            if (k >= 10) blank(k - 10, h.end);
          }
          break;
        }
        case N::Interface: case N::TypeAlias: blank(x.start, x.end); break;
        case N::Export: if (!x.kids.empty() && x.kids[0] != kNone && (n(x.kids[0]).kind == N::Interface || n(x.kids[0]).kind == N::TypeAlias)) blank(x.start, x.end); break;
        case N::As: {
          std::uint32_t k = n(x.kids[0]).end;
          while (k + 2 <= x.end && !(s.substr(k, 2) == "as" && (k == 0 || !std::isalnum(static_cast<unsigned char>(s[k - 1]))) && space(k + 2))) k++;
          blank(k, x.end);
          break;
        }
        case N::Enum: enumDecl(x); break;
        default: break;
      }
    }
    for (auto& [id, list] : a.tparams) bracketed(list);
    for (auto& [id, list] : a.targs) bracketed(list);
  }
};

}  // namespace

bool stripTypes(std::string_view src, const std::string& file, std::string& out, std::string& err) {
  auto lineCol = [&](std::uint32_t pos) {
    std::uint32_t line = 1, col = 1;
    for (std::uint32_t i = 0; i < pos && i < src.size(); ++i) { if (src[i] == '\n') { line++; col = 1; } else col++; }
    return file + ":" + std::to_string(line) + ":" + std::to_string(col);
  };
  ParseResult pr = parse(src);
  if (!pr.diags.empty()) { err = lineCol(pr.diags[0].pos) + ": " + pr.diags[0].detail; return false; }
  Stripper st(src, pr.ast);
  st.run();
  if (!st.err.empty()) { err = lineCol(st.errPos) + ": " + st.err; return false; }
  std::sort(st.edits.begin(), st.edits.end(), [](const Edit& x, const Edit& y) { return x.from != y.from ? x.from < y.from : x.to > y.to; });
  out.clear();
  std::uint32_t at = 0;
  for (const Edit& e : st.edits) {
    if (e.from < at) {  // inside an earlier edit: its range is already gone (a nested type erased with its parent)
      if (e.to <= at) continue;
    }
    std::uint32_t from = std::max(e.from, at);
    out.append(src.substr(at, from - at));
    std::string_view gone = src.substr(from, e.to - from);
    if (e.text.empty()) { for (char c : gone) out += c == '\n' ? '\n' : ' '; }
    else {
      out += e.text;
      for (char c : gone) if (c == '\n') out += '\n';  // the lines stay where they were
    }
    at = e.to;
  }
  out.append(src.substr(at));
  return true;
}

}  // namespace zn::qjs
