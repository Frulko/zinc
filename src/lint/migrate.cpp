// zinc migrate: versioned codemods on the engine's lexer (docs/reports/zinc-lint-migrate.md). A codemod finds sites in the token stream, so a
// string, a comment or the text of a JSX element is never rewritten; every replacement stays on its line, so a dry run is a diff of lines.
// The walk below follows JSX the way src/frontend/jsx.cpp parses it (an element starts at a `<` that does not follow an expression).
#include "lint/lint.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <map>
#include <set>
#include <sstream>

#include "frontend/jsx.h"
#include "frontend/lexer.h"

namespace fs = std::filesystem;
namespace fe = zn::frontend;

namespace zn::lint {
namespace {

// What the walk reports: a tag name (opening or closing), an attribute name with its value's token range, a token of plain code, and an
// opening tag once its attributes are read (`spread`: it has a {...props}).
struct AttrAt { std::size_t name, valueBegin, valueEnd; };
struct Visitor {
  std::function<void(std::size_t tok, bool closing)> tag;
  std::function<void(std::size_t tok, const std::string& tag, std::size_t valueBegin, std::size_t valueEnd)> attr;
  std::function<void(std::size_t tok)> code;
  std::function<void(std::size_t tagTok, const std::vector<AttrAt>& attrs, bool spread)> open;
};

struct Walk {
  std::string_view s;
  const std::vector<fe::Token>& t;
  const Visitor& v;

  std::string tx(std::size_t i) const { return std::string(s.substr(t[i].start, t[i].end - t[i].start)); }
  bool isP(std::size_t i, const char* p) const { return i < t.size() && t[i].kind == fe::Tok::Punct && tx(i) == p; }
  bool eof(std::size_t i) const { return i >= t.size() || t[i].kind == fe::Tok::Eof; }
  bool endsExpr(std::size_t i) const {   // jsx.cpp's rule: after one of these `<` compares
    switch (t[i].kind) {
      case fe::Tok::Ident: case fe::Tok::PrivateName: case fe::Tok::Number: case fe::Tok::BigInt: case fe::Tok::String: case fe::Tok::Regex:
      case fe::Tok::TemplateNoSub: case fe::Tok::TemplateTail: case fe::Tok::JsxText: return true;
      case fe::Tok::Keyword: { std::string x = tx(i); return x == "this" || x == "super" || x == "null" || x == "true" || x == "false"; }
      case fe::Tok::Punct: { std::string x = tx(i); return x == ")" || x == "]" || x == "}" || x == "++" || x == "--"; }
      default: return false;
    }
  }
  bool jsxStart(std::size_t i) const { return isP(i, "<") && !eof(i + 1) && (i == 0 || !endsExpr(i - 1)) && (t[i + 1].kind == fe::Tok::Ident || isP(i + 1, ">")); }
  std::size_t match(std::size_t i) const {   // the `}` closing the `{` at i (template braces live inside template tokens)
    int d = 0;
    for (std::size_t k = i; !eof(k); ++k) {
      if (isP(k, "{")) ++d;
      else if (isP(k, "}") && --d == 0) return k;
    }
    return t.size() - 1;
  }
  void code(std::size_t a, std::size_t b) {
    for (std::size_t i = a; i < b && !eof(i);) {
      if (jsxStart(i)) { i = elem(i); continue; }
      if (v.code) v.code(i);
      ++i;
    }
  }
  std::size_t braces(std::size_t i) { std::size_t k = match(i); code(i + 1, k); return k + 1; }
  std::size_t elem(std::size_t i) {   // t[i] is `<`; returns the index after the element
    std::size_t j = i + 1;
    std::string tag;
    if (!isP(j, ">")) {
      const std::size_t tagTok = j;
      std::vector<AttrAt> attrs;
      bool spread = false;
      tag = tx(j);
      if (v.tag) v.tag(j, false);
      for (++j;;) {
        if (eof(j)) return j;
        if ((isP(j, "/>") || isP(j, ">")) && v.open) v.open(tagTok, attrs, spread);
        if (isP(j, "/>")) return j + 1;
        if (isP(j, ">")) break;
        if (isP(j, "{")) { spread = true; j = braces(j); continue; }   // {...spread}
        if (t[j].kind == fe::Tok::Ident) {
          std::size_t name = j++, vb = j, ve = j;
          if (isP(j, "=")) {
            ++j;
            vb = j;
            j = isP(j, "{") ? braces(j) : j + 1;
            ve = j;
          }
          attrs.push_back({name, vb, ve});
          if (v.attr) v.attr(name, tag, vb, ve);
          continue;
        }
        ++j;
      }
    }
    for (++j;;) {   // the children, up to the closing tag
      if (eof(j)) return j;
      if (t[j].kind == fe::Tok::JsxText) { ++j; continue; }
      if (isP(j, "{")) { j = braces(j); continue; }
      if (isP(j, "</")) {
        ++j;
        if (!eof(j) && t[j].kind == fe::Tok::Ident) { if (v.tag) v.tag(j, true); ++j; }
        while (!eof(j) && !isP(j, ">")) ++j;
        return j + 1;
      }
      if (isP(j, "<")) { j = elem(j); continue; }
      ++j;
    }
  }
};

std::vector<Site> scanClassName(std::string_view src) {
  std::vector<Site> out;
  std::vector<fe::Token> t;
  auto text = [&](std::size_t i) { return std::string(src.substr(t[i].start, t[i].end - t[i].start)); };
  Visitor v;
  v.attr = [&](std::size_t i, const std::string& tag, std::size_t, std::size_t) {
    if (text(i) == "class") out.push_back({t[i].start, t[i].end, "className", "write className, not class, on <" + tag + ">"});
  };
  v.code = [&](std::size_t i) {   // the prop of a component: `class?: string`, `{ class: c }`, `props.class`
    if (t[i].kind != fe::Tok::Keyword || text(i) != "class") return;
    auto punct = [&](std::size_t k, const char* p) { return k < t.size() && t[k].kind == fe::Tok::Punct && text(k) == p; };
    bool access = i > 0 && (punct(i - 1, ".") || punct(i - 1, "?."));
    bool key = punct(i + 1, ":") || (punct(i + 1, "?") && punct(i + 2, ":"));
    if (access || key) out.push_back({t[i].start, t[i].end, "className", "the prop that takes the classes is className, not class"});
  };
  t = fe::lex(src, true);   // the visitor reads `t`: lex first, then walk the same tokens
  if (!fe::check(src, t).empty()) return {};
  Walk w{src, t, v};
  w.code(0, t.size());
  return out;
}

std::vector<Site> scanTags(std::string_view src) {
  std::vector<Site> out;
  std::vector<fe::Token> t = fe::lex(src, true);
  if (!fe::check(src, t).empty()) return {};
  const auto& tags = fe::jsxLowercaseTags();
  Visitor v;
  v.tag = [&](std::size_t i, bool closing) {
    std::string name(src.substr(t[i].start, t[i].end - t[i].start));
    if (name.empty() || !std::islower(static_cast<unsigned char>(name[0]))) return;
    auto it = tags.find(name);
    if (it != tags.end()) out.push_back({t[i].start, t[i].end, it->second, "<" + name + "> is not a component: write <" + it->second + ">"});
    else if (!closing) out.push_back({t[i].start, t[i].end, "", "<" + name + "> is not a component: components start with a capital letter; rename it by hand"});
  };
  Walk w{src, t, v};
  w.code(0, t.size());
  return out;
}

// ui-explicit-looks (D163, ZN-774.18). Until 0.7 the host Button drew a slate fill and padding, and Input and TextArea a dark slate field;
// the primitives now draw nothing a program did not ask for. The codemod writes the old look into a static className, family by family, in
// front of the program's own classes, so the program's classes still win as they did over the defaults. A family the program already sets
// on every side is left out; a variant (hover:, md:, dark:...) never sets the base look, so it does not count.
struct Families { bool fill = false, lightFill = false, textColor = false, textSize = false, borderW = false, borderC = false, radius = false; unsigned pad = 0; };   // pad: bits 1 top, 2 right, 4 bottom, 8 left; lightFill: a fill known to be light

bool starts(const std::string& s, const char* p) { return s.rfind(p, 0) == 0; }
// The same reading as applyToken in lib/std/ui.ts: an arbitrary value is a colour when it starts so, else a length.
bool colourValue(const std::string& v) { return starts(v, "[#") || starts(v, "[rgb") || starts(v, "[hsl") || starts(v, "[var("); }
bool lengthValue(const std::string& v) { return (!v.empty() && v.find_first_not_of("0123456789.") == std::string::npos) || (starts(v, "[") && !colourValue(v)); }
// A fill colour known to be light: white, a palette shade up to 300, or an arbitrary #rgb / #rrggbb of YIQ brightness 128 or more (an opacity
// suffix /50 is dropped). A theme token or a variable is not known.
bool lightColour(std::string v) {
  if (const auto slash = v.find('/'); slash != std::string::npos && v.find('[') == std::string::npos) v.erase(slash);
  if (v == "white") return true;
  if (starts(v, "[#") && v.back() == ']') {
    std::string h = v.substr(2, v.size() - 3);
    if (h.size() == 3) h = {h[0], h[0], h[1], h[1], h[2], h[2]};
    if (h.size() != 6 || h.find_first_not_of("0123456789abcdefABCDEF") != std::string::npos) return false;
    const long c = std::strtol(h.c_str(), nullptr, 16);
    return ((c >> 16) & 255) * 299 + ((c >> 8) & 255) * 587 + (c & 255) * 114 >= 128000;
  }
  const auto dash = v.rfind('-');
  if (dash == std::string::npos || dash + 1 >= v.size() || v.find_first_not_of("0123456789", dash + 1) != std::string::npos) return false;
  return std::atoi(v.c_str() + dash + 1) <= 300;
}
// A side or corner of `rounded-` (t, tl, b-lg...) or a side of `border-` (t, x-2, s...): it does not set every side.
bool sideKey(const std::string& v, const char* sides) {
  if (v.empty() || !std::strchr(sides, v[0])) return false;
  return v.size() == 1 || v[1] == '-';
}

void classify(const std::string& body, Families& f) {
  std::istringstream in(body);
  for (std::string tok; in >> tok;) {
    int depth = 0;
    bool variant = false;
    for (char c : tok) { depth += c == '[' ? 1 : c == ']' ? -1 : 0; if (c == ':' && depth == 0) variant = true; }
    if (variant || tok.find('\x01') != std::string::npos) continue;   // \x01: a template's interpolation, the class is not whole
    if (!tok.empty() && tok.front() == '!') tok.erase(0, 1);
    if (!tok.empty() && tok.back() == '!') tok.pop_back();
    static const std::pair<const char*, unsigned> kPad[] = {{"p-", 15}, {"px-", 10}, {"py-", 5}, {"pt-", 1}, {"pr-", 2}, {"pb-", 4}, {"pl-", 8}};
    for (auto [p, bits] : kPad) if (starts(tok, p)) f.pad |= bits;
    if (starts(tok, "bg-")) {
      static const char* kNotFill[] = {"none", "gradient-", "linear", "radial", "conic", "[url(", "auto", "cover", "contain", "size-", "position-", "repeat", "no-repeat", "clip-", "origin-", "blend-", "fixed", "local", "scroll"};
      const std::string v = tok.substr(3);
      bool fill = v.find("gradient(") == std::string::npos && v.find_first_not_of("topbmlefrighcn-") != std::string::npos;   // bg-top, bg-left-bottom, bg-center: a position
      for (const char* p : kNotFill) if (starts(v, p)) fill = false;
      f.fill = f.fill || fill;
      f.lightFill = f.lightFill || (fill && lightColour(v));
    } else if (starts(tok, "text-")) {
      static const std::set<std::string> kSizes = {"xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"};
      static const std::set<std::string> kOther = {"left", "right", "center", "justify", "start", "end", "wrap", "nowrap", "ellipsis", "clip", "balance", "pretty", "current", "inherit"};
      const std::string v = tok.substr(5);
      if (kSizes.count(v) || (starts(v, "[") && !colourValue(v))) f.textSize = true;
      else if (!kOther.count(v) && !starts(v, "shadow") && !starts(v, "opacity")) f.textColor = true;
    } else if (tok == "border") f.borderW = true;
    else if (starts(tok, "border-")) {
      static const std::set<std::string> kStyle = {"solid", "dashed", "dotted", "double", "none", "hidden", "collapse", "separate"};
      const std::string v = tok.substr(7);
      if (lengthValue(v)) f.borderW = true;
      else if (!sideKey(v, "trblxyse") && !kStyle.count(v) && !starts(v, "spacing")) f.borderC = true;
    } else if (tok == "rounded") f.radius = true;
    else if (starts(tok, "rounded-")) {
      const std::string v = tok.substr(8);
      const bool corner = v.size() >= 2 && std::strchr("tbse", v[0]) && std::strchr("lrse", v[1]) && (v.size() == 2 || v[2] == '-');   // tl, br-lg, ss
      if (!corner && !sideKey(v, "tblrse")) f.radius = true;
    }
  }
}

Families unite(Families a, const Families& b) {
  a.fill |= b.fill; a.lightFill |= b.lightFill; a.textColor |= b.textColor; a.textSize |= b.textSize; a.borderW |= b.borderW; a.borderC |= b.borderC; a.radius |= b.radius; a.pad |= b.pad;
  return a;
}
Families meet(Families a, const Families& b) {
  a.fill &= b.fill; a.lightFill &= b.lightFill; a.textColor &= b.textColor; a.textSize &= b.textSize; a.borderW &= b.borderW; a.borderC &= b.borderC; a.radius &= b.radius; a.pad &= b.pad;
  return a;
}

// The old look's classes a host Button or field lacks, given the families its classes always set.
std::string looksMissing(bool button, const Families& f) {
  std::string add;
  auto put = [&](bool has, const char* c) { if (!has) add += (add.empty() ? "" : " ") + std::string(c); };
  if (button) { put(f.fill, "bg-slate-700"); put((f.pad & 10) == 10, "px-2"); put((f.pad & 5) == 5, "py-1"); return add; }
  put(f.fill, "bg-slate-800"); put(f.borderW, "border"); put(f.borderC, "border-slate-600"); put(f.radius, "rounded-md"); put(f.textSize, "text-[14px]");
  put((f.pad & 10) == 10, "px-2"); put((f.pad & 5) == 5, "py-1.5");
  put(f.textColor || f.lightFill, "text-slate-100");   // a field with a light fill never wanted the light text (lesson 12's white on white)
  return add;
}

// A className expression read without running it: string literals, templates (their fixed parts), `a + b`, `c ? a : b`, parentheses and
// the constants of the file (`const FIELD = '...'`). The classes it always sets are the union over `+` and the intersection over `?:`;
// the old look goes in front of every string the expression can produce, so the program's own classes still come after it.
struct ClassExpr {
  std::string_view s;
  const std::vector<fe::Token>& t;
  bool button;
  std::vector<Site>& out;

  std::string tx(std::size_t i) const { return std::string(s.substr(t[i].start, t[i].end - t[i].start)); }
  bool isP(std::size_t i, const char* p) const { return i < t.size() && t[i].kind == fe::Tok::Punct && tx(i) == p; }
  int step(std::size_t i) const {   // brackets and template interpolations open and close a level
    if (t[i].kind == fe::Tok::TemplateHead) return 1;
    if (t[i].kind == fe::Tok::TemplateTail) return -1;
    if (t[i].kind != fe::Tok::Punct) return 0;
    const std::string x = tx(i);
    return x == "(" || x == "[" || x == "{" ? 1 : x == ")" || x == "]" || x == "}" ? -1 : 0;
  }
  std::size_t close(std::size_t b, std::size_t e) const {   // the token that brings the level opened at b back to 0
    int d = 0;
    for (std::size_t i = b; i < e; ++i) { d += step(i); if (d == 0) return i; }
    return e;
  }
  std::vector<std::size_t> top(std::size_t b, std::size_t e) const {   // the punctuators outside any bracket
    std::vector<std::size_t> o;
    int d = 0;
    for (std::size_t i = b; i < e; ++i) {
      const int st = step(i);
      if (d == 0 && st == 0 && t[i].kind == fe::Tok::Punct) o.push_back(i);
      d += st;
    }
    return o;
  }
  void unwrap(std::size_t& b, std::size_t& e) const { while (e > b + 1 && isP(b, "(") && close(b, e) == e - 1) { ++b; --e; } }
  // The text of a literal: a string, or a template whose interpolations are \x01 (a class that touches one is not read). `parts` gets the
  // interpolations that stand as whole classes (`a ${x} b`), which may be read in turn.
  bool literal(std::size_t b, std::size_t e, std::string& body, std::vector<std::pair<std::size_t, std::size_t>>& parts) const {
    parts.clear();
    if (e == b + 1 && (t[b].kind == fe::Tok::String || t[b].kind == fe::Tok::TemplateNoSub)) { body = tx(b).substr(1, t[b].end - t[b].start - 2); return true; }
    if (b >= e || t[b].kind != fe::Tok::TemplateHead || close(b, e) != e - 1) return false;
    body.clear();
    int d = 0;
    std::size_t from = 0;
    bool whole = false;
    auto space = [](char c) { return c == '`' || c == ' ' || c == '\t' || c == '\n' || c == '\r'; };
    for (std::size_t i = b; i < e; ++i) {
      const int st = step(i);
      if ((d == 0 && st > 0) || (d == 1 && (t[i].kind == fe::Tok::TemplateMiddle || st < 0))) {
        const std::string x = tx(i);   // `abc${, }abc${, }abc`
        if (d > 0) { body += '\x01'; if (whole && space(x[1])) parts.push_back({from, i}); }
        body += x.substr(1, x.size() - (st < 0 ? 1 : 2) - 1);
        from = i + 1;
        whole = st >= 0 && space(x[x.size() - 3]);
      }
      d += st;
    }
    return true;
  }
  // The families of a literal and of its whole-class interpolations that can be read.
  bool readLiteral(std::size_t b, std::size_t e, Families& f, int depth) const {
    std::string body;
    std::vector<std::pair<std::size_t, std::size_t>> parts;
    if (!literal(b, e, body, parts)) return false;
    classify(body, f);
    for (auto [x, y] : parts) { Families g; if (known(x, y, g, depth + 1)) f = unite(f, g); }
    return true;
  }
  bool ternary(std::size_t b, std::size_t e, std::size_t& q, std::size_t& c) const {
    const std::vector<std::size_t> tp = top(b, e);
    int n = 0;
    q = e;
    for (std::size_t k : tp) {
      const std::string x = tx(k);
      if (x == "?") { if (n++ == 0) q = k; }
      else if (x == ":" && n > 0 && --n == 0) { c = k; return true; }
    }
    return false;
  }
  bool chain(std::size_t b, std::size_t e, std::vector<std::pair<std::size_t, std::size_t>>& ops) const {   // a + b + c
    const std::vector<std::size_t> tp = top(b, e);
    if (tp.empty()) return false;
    for (std::size_t k : tp) if (tx(k) != "+") return false;
    std::size_t a = b;
    for (std::size_t k : tp) { ops.push_back({a, k}); a = k + 1; }
    ops.push_back({a, e});
    return true;
  }
  // `const NAME = <init>` (or let), once in the file: the initializer's tokens, up to a `;`, a `,` or the end of the line.
  bool constant(const std::string& name, std::size_t& ib, std::size_t& ie) const {
    int found = 0;
    for (std::size_t i = 0; i + 2 < t.size(); ++i) {
      if (t[i].kind != fe::Tok::Keyword || (tx(i) != "const" && tx(i) != "let") || t[i + 1].kind != fe::Tok::Ident || tx(i + 1) != name) continue;
      std::size_t j = i + 2;
      if (isP(j, ":") && j + 1 < t.size() && t[j + 1].kind == fe::Tok::Ident) j += 2;   // const NAME: string = ...
      if (!isP(j, "=")) continue;
      std::size_t k = ++j;
      int d = 0;
      for (; k < t.size() && t[k].kind != fe::Tok::Eof; ++k) {
        const int st = step(k);
        if (d + st < 0) break;
        if (d == 0 && (isP(k, ";") || isP(k, ","))) break;
        const bool newline = k > j && s.substr(t[k - 1].end, t[k].start - t[k - 1].end).find('\n') != std::string_view::npos;
        if (d == 0 && newline && !isP(k - 1, "+") && !isP(k - 1, "?") && !isP(k - 1, ":") && !isP(k, "+") && !isP(k, "?") && !isP(k, ":")) break;
        d += st;
      }
      ib = j; ie = k;
      ++found;
    }
    return found == 1 && ib < ie;
  }
  bool known(std::size_t b, std::size_t e, Families& f, int depth) const {   // the families every string of [b, e) sets; false: unknown
    unwrap(b, e);
    std::size_t q, c, ib, ie;
    std::vector<std::pair<std::size_t, std::size_t>> ops;
    if (depth > 6 || b >= e) return false;
    if (readLiteral(b, e, f, depth)) return true;
    if (ternary(b, e, q, c)) {
      Families x, y;
      if (!known(q + 1, c, x, depth + 1) || !known(c + 1, e, y, depth + 1)) return false;
      f = unite(f, meet(x, y));
      return true;
    }
    if (chain(b, e, ops)) {   // an unknown part adds classes nobody can read, but the known parts still set theirs
      bool any = false;
      for (auto [x, y] : ops) { Families g; if (known(x, y, g, depth + 1)) { f = unite(f, g); any = true; } }
      return any;
    }
    if (e == b + 1 && t[b].kind == fe::Tok::Ident && constant(tx(b), ib, ie)) return known(ib, ie, f, depth + 1);
    return false;
  }
  // Puts the missing look in front of every string [b, e) can produce, knowing that `in` is set by the rest; false when it cannot.
  bool fix(std::size_t b, std::size_t e, const Families& in, int depth) {
    unwrap(b, e);
    std::string body;
    std::size_t q, c;
    std::vector<std::pair<std::size_t, std::size_t>> ops, parts;
    if (depth > 6 || b >= e) return false;
    if (literal(b, e, body, parts)) {
      Families f = in;
      readLiteral(b, e, f, depth);
      const std::string add = looksMissing(button, f);
      if (!add.empty()) out.push_back({t[b].start + 1, t[b].start + 1, body.find_first_not_of(" \t\r\n") == std::string::npos ? add : add + " ", "default look"});
      return true;
    }
    if (ternary(b, e, q, c)) return fix(q + 1, c, in, depth + 1) && fix(c + 1, e, in, depth + 1);
    if (chain(b, e, ops)) {
      Families rest = in;
      for (std::size_t k = 1; k < ops.size(); ++k) known(ops[k].first, ops[k].second, rest, depth + 1);
      return fix(ops[0].first, ops[0].second, rest, depth + 1);
    }
    Families f = in;
    if (e == b + 1 && t[b].kind == fe::Tok::Ident && known(b, e, f, depth + 1)) {   // a constant: the look goes in front of it, here
      const std::string add = looksMissing(button, f);
      if (!add.empty()) out.push_back({t[b].start, t[b].start, "'" + add + " ' + ", "default look"});
      return true;
    }
    return false;
  }
};

std::vector<Site> scanLooks(std::string_view src) {
  std::vector<Site> out;
  std::vector<fe::Token> t = fe::lex(src, true);
  if (!fe::check(src, t).empty()) return {};
  const std::map<std::string, std::string> imports = fe::jsxImports(src, t);
  auto text = [&](std::size_t i) { return std::string(src.substr(t[i].start, t[i].end - t[i].start)); };
  Visitor v;
  v.open = [&](std::size_t tagTok, const std::vector<AttrAt>& attrs, bool spread) {
    const std::string tag = text(tagTok);
    const bool button = tag == "Button";
    if ((!button && tag != "Input" && tag != "TextArea") || !fe::jsxHostTag(tag, imports)) return;
    Families f;
    const AttrAt* cls = nullptr;
    for (const AttrAt& a : attrs) {
      const std::string name = text(a.name);
      if (name == "className") cls = &a;
      else if (name == "bg") {   // the numeric props <Button bg={0x...} color={0x...}>
        f.fill = true;
        if (a.valueEnd == a.valueBegin + 3 && text(a.valueBegin) == "{" && t[a.valueBegin + 1].kind == fe::Tok::Number) {
          const long c = std::strtol(text(a.valueBegin + 1).c_str(), nullptr, 0);
          f.lightFill = ((c >> 16) & 255) * 299 + ((c >> 8) & 255) * 587 + (c & 255) * 114 >= 128000;
        }
      }
      else if (name == "color") f.textColor = true;
    }
    std::vector<Site> sites;
    ClassExpr x{src, t, button, sites};
    bool ok = !spread || cls;
    if (ok && cls) {
      std::size_t b = cls->valueBegin, e = cls->valueEnd;
      if (e > b + 1 && x.isP(b, "{") && x.isP(e - 1, "}")) { ++b; --e; }
      ok = x.fix(b, e, f, 0);
    } else if (ok) {
      const std::string add = looksMissing(button, f);
      if (!add.empty()) sites.push_back({t[tagTok].end, t[tagTok].end, " className=\"" + add + "\"", "default look"});
    }
    if (!ok) {
      out.push_back({t[tagTok].start, t[tagTok].end, "", "<" + tag + "> takes a className zinc migrate cannot read: if it relied on the default look, add the classes of it it lacks: " + looksMissing(button, Families{})});
      return;
    }
    out.insert(out.end(), sites.begin(), sites.end());
  };
  Walk w{src, t, v};
  w.code(0, t.size());
  return out;
}

bool ends(const std::string& s, const char* suffix) { std::size_t n = std::char_traits<char>::length(suffix); return s.size() >= n && s.compare(s.size() - n, n, suffix) == 0; }

std::string readAll(const fs::path& p) { std::ifstream in(p, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }

// The .tsx, .jsx and .md files under `p` (a file is itself); build output, dependencies and links are not followed.
void files(const fs::path& p, std::vector<fs::path>& out) {
  std::error_code ec;
  if (!fs::is_directory(p, ec)) { out.push_back(p); return; }
  static const std::set<std::string> skip = {"node_modules", "build", "dist", ".git", "third_party", "vendor", ".zinc"};
  for (auto it = fs::recursive_directory_iterator(p, fs::directory_options::skip_permission_denied, ec); !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
    if (it->is_symlink(ec)) { if (it->is_directory(ec)) it.disable_recursion_pending(); continue; }
    if (it->is_directory(ec)) { if (skip.count(it->path().filename().string())) it.disable_recursion_pending(); continue; }
    const std::string n = it->path().string();
    if (ends(n, ".tsx") || ends(n, ".jsx") || ends(n, ".md")) out.push_back(it->path());
  }
}

std::pair<int, int> lineCol(std::string_view s, std::uint32_t at) { auto lc = fe::lineCol(s, at); return {static_cast<int>(lc.line), static_cast<int>(lc.col)}; }

// A unified diff of two texts with the same lines but some changed (codemods never add or remove a line break).
std::string diff(const std::string& path, const std::string& a, const std::string& b) {
  auto split = [](const std::string& s) { std::vector<std::string> l; std::size_t at = 0; for (std::size_t nl; (nl = s.find('\n', at)) != std::string::npos; at = nl + 1) l.push_back(s.substr(at, nl - at)); l.push_back(s.substr(at)); return l; };
  std::vector<std::string> la = split(a), lb = split(b);
  const bool abs = !path.empty() && path[0] == '/';
  std::string out = "--- " + std::string(abs ? "" : "a/") + path + "\n+++ " + (abs ? "" : "b/") + path + "\n";
  for (std::size_t i = 0; i < la.size() && i < lb.size();) {
    if (la[i] == lb[i]) { ++i; continue; }
    std::size_t j = i;
    while (j < la.size() && j < lb.size() && la[j] != lb[j]) ++j;
    out += "@@ -" + std::to_string(i + 1) + "," + std::to_string(j - i) + " +" + std::to_string(i + 1) + "," + std::to_string(j - i) + " @@\n";
    for (std::size_t k = i; k < j; ++k) out += "-" + la[k] + "\n";
    for (std::size_t k = i; k < j; ++k) out += "+" + lb[k] + "\n";
    i = j;
  }
  return out;
}

}  // namespace

const std::vector<Codemod>& codemods() {
  static const std::vector<Codemod> all = {
      {"jsx-classname", "0.0.1 (2026-10-16)", "Z0006", "`class` in JSX becomes `className`: the attribute, and the prop of components (declarations, `props.class`, keys, destructuring)", scanClassName, false},
      {"jsx-capitalised-tags", "0.0.1 (2026-10-16)", "Z0007", "lowercase JSX tags become the components: <view> <View>, <scroll> <ScrollView>, <textarea> <TextArea>, <div> <View>, <span> and <p> <Text>, <img> <Image>", scanTags, false},
      {"ui-explicit-looks", "0.7.0 (2026-10-22)", "-", "the default look of a host Button (slate fill, padding) and of Input and TextArea (dark slate field) written out as classes, for a program that relied on it; run only when named", scanLooks, true},
  };
  return all;
}

std::string rewrite(std::string_view src, const std::vector<Site>& sitesIn) {
  std::vector<Site> sites = sitesIn;
  std::sort(sites.begin(), sites.end(), [](const Site& a, const Site& b) { return a.start < b.start; });
  std::string out;
  std::uint32_t at = 0;
  for (const Site& s : sites) {
    if (s.replacement.empty() || s.start < at) continue;
    out.append(src.substr(at, s.start - at));
    out += s.replacement;
    at = s.end;
  }
  out.append(src.substr(at));
  return out;
}

std::vector<Site> scanFile(const Codemod& cm, const std::string& path, std::string_view text) {
  if (ends(path, ".tsx") || ends(path, ".jsx")) return cm.scan(text);
  if (!ends(path, ".md")) return {};
  // ponytail: fences only; `inline code` in prose is left alone (a person reads it, nothing compiles it)
  static const std::set<std::string> langs = {"tsx", "jsx", "ts", "typescript", "js", "javascript"};
  std::vector<Site> out;
  std::size_t pos = 0;
  auto lineEnd = [&](std::size_t p) { std::size_t e = text.find('\n', p); return e == std::string_view::npos ? text.size() : e; };
  while (pos < text.size()) {
    std::size_t e = lineEnd(pos), a = pos;
    while (a < e && (text[a] == ' ' || text[a] == '\t')) ++a;
    std::size_t f = a;
    while (f < e && (text[f] == '`' || text[f] == '~') && text[f] == text[a]) ++f;
    if (f - a < 3) { pos = e + 1; continue; }
    const std::string_view fence = text.substr(a, f - a);
    std::size_t l = f;
    while (l < e && (std::isalnum(static_cast<unsigned char>(text[l])) || text[l] == '-')) ++l;
    const std::string lang(text.substr(f, l - f));
    std::size_t body = e + 1, close = body;
    while (close < text.size()) {   // the closing fence: the same run of backticks or tildes alone on its line
      std::size_t ce = lineEnd(close), c = close;
      while (c < ce && (text[c] == ' ' || text[c] == '\t')) ++c;
      if (text.substr(c, fence.size()) == fence && text.substr(c + fence.size(), ce - c - fence.size()).find_first_not_of(" \t\r`~") == std::string_view::npos) break;
      close = ce + 1;
    }
    if (body < text.size() && langs.count(lang)) {
      for (Site s : cm.scan(text.substr(body, std::min(close, text.size()) - body))) { s.start += static_cast<std::uint32_t>(body); s.end += static_cast<std::uint32_t>(body); out.push_back(s); }
    }
    pos = lineEnd(std::min(close, text.size())) + 1;
  }
  return out;
}

std::vector<ClassUse> classNames(std::string_view src) {
  std::vector<ClassUse> out;
  std::vector<fe::Token> t = fe::lex(src, true);
  if (!fe::check(src, t).empty()) return out;
  Visitor v;
  v.attr = [&](std::size_t i, const std::string&, std::size_t vb, std::size_t ve) {
    if (src.substr(t[i].start, t[i].end - t[i].start) != "className") return;
    for (std::size_t k = vb; k < ve && k < t.size(); ++k) {   // the literal, or every string of the expression: cond ? 'a' : 'b'
      if (t[k].kind != fe::Tok::String && t[k].kind != fe::Tok::TemplateNoSub) continue;
      std::uint32_t a = t[k].start + 1, b = t[k].end - 1;
      while (a < b) {
        while (a < b && std::isspace(static_cast<unsigned char>(src[a]))) ++a;
        std::uint32_t c = a;
        while (c < b && !std::isspace(static_cast<unsigned char>(src[c]))) ++c;
        if (c > a) out.push_back({a, std::string(src.substr(a, c - a))});
        a = c;
      }
    }
  };
  Walk w{src, t, v};
  w.code(0, t.size());
  return out;
}

int migrate(const std::vector<std::string>& args) {
  const char* usage = "usage: zinc migrate [--list] [--dry-run|--apply] [<codemod>...] [paths]\n";
  bool list = false, write = false;
  std::vector<const Codemod*> chosen;
  std::vector<fs::path> roots;
  for (std::size_t i = 2; i < args.size(); ++i) {
    const std::string& a = args[i];
    if (a == "--list") list = true;
    else if (a == "--apply") write = true;
    else if (a == "--dry-run") write = false;
    else if (a.rfind("--", 0) == 0) { std::fprintf(stderr, "zinc migrate: unknown option %s\n%s", a.c_str(), usage); return 2; }
    else {
      const Codemod* cm = nullptr;
      for (const Codemod& c : codemods()) if (a == c.id) cm = &c;
      std::error_code ec;
      if (cm) chosen.push_back(cm);
      else if (fs::exists(a, ec)) roots.push_back(a);
      else { std::fprintf(stderr, "zinc migrate: %s is neither a file nor a codemod (zinc migrate --list)\n", a.c_str()); return 2; }
    }
  }
  if (list) {
    for (const Codemod& c : codemods()) std::printf("%-22s %-20s fixes %s  %s\n", c.id, c.since, c.code, c.summary);
    return 0;
  }
  if (chosen.empty()) for (const Codemod& c : codemods()) if (!c.byName) chosen.push_back(&c);
  if (roots.empty()) roots.push_back(".");
  std::vector<fs::path> all;
  for (const fs::path& r : roots) files(r, all);
  std::sort(all.begin(), all.end());
  int changed = 0, manual = 0;
  for (const fs::path& f : all) {
    const std::string name = f.lexically_normal().generic_string(), text = readAll(f);
    std::string cur = text;
    for (const Codemod* cm : chosen) {
      std::vector<Site> sites = scanFile(*cm, name, cur);
      for (const Site& s : sites) if (s.replacement.empty()) { auto [l, c] = lineCol(cur, s.start); std::fprintf(stderr, "%s:%d:%d: %s (%s)\n", name.c_str(), l, c, s.message.c_str(), cm->id); ++manual; }
      cur = rewrite(cur, sites);
    }
    if (cur == text) continue;
    ++changed;
    if (!write) { std::fputs(diff(name, text, cur).c_str(), stdout); continue; }
    std::ofstream o(f, std::ios::binary);
    o << cur;
    if (!o) { std::fprintf(stderr, "zinc migrate: cannot write %s\n", name.c_str()); return 1; }
    std::printf("%s\n", name.c_str());
  }
  if (!changed) std::fprintf(stderr, "zinc migrate: nothing to rewrite in %zu file%s\n", all.size(), all.size() == 1 ? "" : "s");
  else std::fprintf(stderr, write ? "zinc migrate: %d file%s rewritten\n" : "zinc migrate: %d file%s would change: zinc migrate --apply rewrites them\n", changed, changed == 1 ? "" : "s");
  if (manual) std::fprintf(stderr, "zinc migrate: %d place%s to fix by hand (above)\n", manual, manual == 1 ? "" : "s");
  return 0;
}

}  // namespace zn::lint
