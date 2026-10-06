// JSX lowering (ZN-028), a port of compiler/src/jsx.ts: a .tsx source is rewritten to plain calls on the zinc:ui/solid (or
// zinc:ui/react) helpers before it is parsed. Solid mode: dynamic expressions become fine-grained effects; React mode: a
// component re-renders as a whole. The pass works on the token stream (the lexer tracks JSX nesting) and substitutes source
// text, keeping line breaks so diagnostics keep their line numbers.
// Not ported yet: the `style` attribute, <VirtualList>, class components in React mode, class-name and hook-rule checks.
#include "frontend/jsx.h"

#include <cctype>
#include <map>
#include <memory>
#include <set>

#include "frontend/lexer.h"

namespace zn::frontend {
namespace {

const std::map<std::string, int> kTags = {{"view", 0}, {"text", 1}, {"button", 2}, {"image", 3}, {"scroll", 4}, {"canvas", 5}, {"input", 7}, {"textarea", 8},
                                          {"View", 0}, {"Text", 1}, {"Button", 2}, {"Image", 3}, {"ScrollView", 4}, {"Canvas", 5}, {"Input", 7}, {"TextArea", 8}};
const std::set<std::string> kNumAttrs = {"width", "height", "grow", "gap", "bg", "color", "scale", "hidden", "x", "y", "opacity", "translateX", "translateY", "rows", "tabIndex", "dragThreshold"};
const std::map<std::string, int> kPointerAttrs = {{"onPointerDown", 0}, {"onPointerMove", 1}, {"onPointerUp", 2}, {"onDoubleClick", 3}, {"onContextMenu", 4}, {"onWheel", 5}, {"onPointerEnter", 6},
                                                  {"onPointerLeave", 7}, {"onTap", 8}, {"onLongPress", 9}, {"onDrag", 10}, {"onPinch", 11}, {"onPointerCancel", 12}};
const std::set<std::string> kFlagAttrs = {"password", "readOnly", "lineNumbers", "wrap", "keepFocus", "disabled"};
const std::map<std::string, int> kInputModes = {{"text", 0}, {"numeric", 1}, {"decimal", 2}, {"tel", 3}, {"email", 4}, {"url", 5}, {"search", 6}};
const std::map<std::string, int> kDragAxes = {{"x", 1}, {"y", 2}, {"both", 3}};

struct Elem;
struct Attr {
  std::string name;
  int kind = 0;  // 0 no value (true), 1 string literal, 2 expression
  std::string lit;
  std::size_t eb = 0, ee = 0;  // token range of the expression, inside the braces
  std::size_t tok = 0;
};
struct Child {
  int kind = 0;  // 0 text, 1 expression, 2 element
  std::string text;
  std::size_t eb = 0, ee = 0;
  std::shared_ptr<Elem> el;
  std::size_t tok = 0;
};
struct Elem {
  bool frag = false, selfClosing = false;
  std::string tag;
  std::vector<Attr> attrs;
  std::vector<Child> kids;
  std::size_t begin = 0, end = 0;  // token range
};

struct Failure { std::uint32_t pos; std::string msg; };

std::string quote(const std::string& s) {
  std::string r = "\"";
  for (char c : s) {
    if (c == '"' || c == '\\') { r += '\\'; r += c; }
    else if (c == '\n') r += "\\n";
    else r += c;
  }
  return r + "\"";
}

std::string trim(const std::string& s) {
  std::size_t a = 0, b = s.size();
  while (a < b && std::isspace(static_cast<unsigned char>(s[a]))) ++a;
  while (b > a && std::isspace(static_cast<unsigned char>(s[b - 1]))) --b;
  return s.substr(a, b - a);
}

// JSX whitespace: text spanning lines is trimmed per line; inline text keeps its spaces (collapsed).
std::string jsxText(const std::string& t) {
  if (t.find('\n') != std::string::npos) {
    std::string out;
    std::size_t at = 0;
    while (at <= t.size()) {
      std::size_t nl = t.find('\n', at);
      std::string line = trim(t.substr(at, nl == std::string::npos ? std::string::npos : nl - at));
      if (!line.empty()) out += (out.empty() ? "" : " ") + line;
      if (nl == std::string::npos) break;
      at = nl + 1;
    }
    return out;
  }
  std::string out;
  bool space = false;
  for (char c : t) {
    if (std::isspace(static_cast<unsigned char>(c))) { if (!space) out += ' '; space = true; }
    else { out += c; space = false; }
  }
  return out;
}

struct Lowering {
  std::string_view s;
  std::vector<Token> t;
  bool react = false;
  int counter = 0;
  std::map<std::string, std::string> imported;
  std::string lib;

  std::string tx(std::size_t i) const { return std::string(s.substr(t[i].start, t[i].end - t[i].start)); }
  bool isP(std::size_t i, const char* p) const { return i < t.size() && t[i].kind == Tok::Punct && tx(i) == p; }
  bool isK(std::size_t i, const char* p) const { return i < t.size() && t[i].kind == Tok::Keyword && tx(i) == p; }
  [[noreturn]] void fail(std::size_t i, const std::string& msg) const { throw Failure{t[i < t.size() ? i : t.size() - 1].start, msg}; }

  bool endsExpr(std::size_t i) const {
    switch (t[i].kind) {
      case Tok::Ident: case Tok::PrivateName: case Tok::Number: case Tok::BigInt: case Tok::String: case Tok::Regex:
      case Tok::TemplateNoSub: case Tok::TemplateTail: case Tok::JsxText: return true;
      case Tok::Keyword: { std::string x = tx(i); return x == "this" || x == "super" || x == "null" || x == "true" || x == "false"; }
      case Tok::Punct: { std::string x = tx(i); return x == ")" || x == "]" || x == "}" || x == "++" || x == "--"; }
      default: return false;
    }
  }
  bool jsxStart(std::size_t i) const {
    if (!isP(i, "<") || i + 1 >= t.size()) return false;
    if (i > 0 && endsExpr(i - 1)) return false;
    return t[i + 1].kind == Tok::Ident || isP(i + 1, ">");
  }
  // index of the `}` / `)` / `]` closing the bracket at `i`
  std::size_t match(std::size_t i) const {
    int d = 0;
    for (std::size_t k = i; k < t.size(); ++k) {
      if (t[k].kind != Tok::Punct) continue;
      std::string x = tx(k);
      if (x == "{" || x == "(" || x == "[") ++d;
      else if (x == "}" || x == ")" || x == "]") { if (--d == 0) return k; }
    }
    fail(i, "unbalanced bracket in JSX");
  }

  // ---- parsing of one element starting at token `i` (the `<`)
  std::shared_ptr<Elem> parseElem(std::size_t i) {
    auto e = std::make_shared<Elem>();
    e->begin = i;
    ++i;
    if (isP(i, ">")) { e->frag = true; ++i; }
    else {
      e->tag = tx(i); ++i;
      for (;;) {
        if (isP(i, "/>")) { e->selfClosing = true; ++i; e->end = i; return e; }
        if (isP(i, ">")) { ++i; break; }
        if (isP(i, "{")) fail(i, "spread attributes are not supported");
        if (t[i].kind != Tok::Ident) fail(i, "unexpected token in a JSX tag");
        Attr a;
        a.name = tx(i); a.tok = i; ++i;
        if (isP(i, "=")) {
          ++i;
          if (t[i].kind == Tok::String) { a.kind = 1; std::string q = tx(i); a.lit = q.substr(1, q.size() - 2); ++i; }
          else if (isP(i, "{")) { std::size_t m = match(i); a.kind = 2; a.eb = i + 1; a.ee = m; i = m + 1; }
          else fail(i, "unsupported JSX attribute value");
        }
        e->attrs.push_back(std::move(a));
      }
    }
    for (;;) {
      if (i >= t.size()) fail(e->begin, "unclosed JSX element");
      if (t[i].kind == Tok::JsxText) { Child c; c.kind = 0; c.text = tx(i); c.tok = i; e->kids.push_back(std::move(c)); ++i; }
      else if (isP(i, "{")) { std::size_t m = match(i); Child c; c.kind = 1; c.eb = i + 1; c.ee = m; c.tok = i; e->kids.push_back(std::move(c)); i = m + 1; }
      else if (isP(i, "</")) {
        ++i;
        if (!e->frag) ++i;  // the closing tag's name
        if (!isP(i, ">")) fail(i, "malformed closing JSX tag");
        ++i;
        e->end = i;
        return e;
      } else if (isP(i, "<")) { Child c; c.kind = 2; c.tok = i; c.el = parseElem(i); i = c.el->end; e->kids.push_back(std::move(c)); }
      else fail(i, "unexpected token in JSX children");
    }
  }

  // ---- source text of a token range with its JSX lowered
  std::string rw(std::size_t a, std::size_t b) {
    if (a >= b) return "";
    std::string out;
    std::size_t pos = t[a].start;
    for (std::size_t i = a; i < b; ++i) {
      if (jsxStart(i)) {
        auto e = parseElem(i);
        out += std::string(s.substr(pos, t[i].start - pos)) + lower(*e);
        pos = t[e->end - 1].end;
        i = e->end - 1;
      }
    }
    return out + std::string(s.substr(pos, t[b - 1].end - pos));
  }

  std::string lower(const Elem& e) {
    std::vector<std::string> lines;
    std::string v = element(e, lines);
    std::string body;
    for (auto& l : lines) body += l + " ";
    std::string code = "((): i32 => { " + body + "return " + v + "; })()";
    int want = 0, have = 0;
    for (std::size_t k = t[e.begin].start; k < t[e.end - 1].end; ++k) want += s[k] == '\n';
    for (char c : code) have += c == '\n';
    return code + std::string(want > have ? want - have : 0, '\n');
  }

  std::string valueOf(const Attr& a) { return a.kind == 1 ? quote(a.lit) : a.kind == 2 ? rw(a.eb, a.ee) : "true"; }
  static std::string num(int n) { return std::to_string(n); }

  // `x` stripped of enclosing parentheses: the token range of the inner expression
  void strip(std::size_t& a, std::size_t& b) const {
    while (b > a + 1 && isP(a, "(") && match(a) == b - 1) { ++a; --b; }
  }
  bool jsxOnly(std::size_t a, std::size_t b) {
    strip(a, b);
    if (a >= b || !jsxStart(a)) return false;
    return parseElem(a)->end == b;
  }
  bool isNull(std::size_t a, std::size_t b) const { strip(a, b); return b == a + 1 && isK(a, "null"); }

  // top-level scan of [a, b): calls f(i, text) for every token outside brackets and JSX elements
  template <class F> void scan(std::size_t a, std::size_t b, F f) {
    for (std::size_t i = a; i < b; ++i) {
      if (jsxStart(i)) { i = parseElem(i)->end - 1; continue; }
      if (t[i].kind == Tok::Punct) {
        std::string x = tx(i);
        if (x == "(" || x == "[" || x == "{") { i = match(i); continue; }
        f(i, x);
      }
    }
  }

  struct Cond { std::size_t cb, ce; std::string yes, no; bool hasNo = false, negate = false; };
  bool conditional(std::size_t a, std::size_t b, Cond& out) {
    std::size_t q = 0, colon = 0, lastAnd = 0;
    bool hasQ = false, hasAnd = false, other = false;
    int depth = 0;
    scan(a, b, [&](std::size_t i, const std::string& x) {
      if (x == "?") { if (!hasQ) { hasQ = true; q = i; } ++depth; }
      else if (x == ":" && hasQ && depth > 0) { if (--depth == 0 && !colon) colon = i; }
      else if (x == "&&") { hasAnd = true; lastAnd = i; }
      else if (x == "||" || x == "??") other = true;
    });
    if (hasQ && colon) {
      auto branch = [&](std::size_t x0, std::size_t x1, std::string& dst) { if (!jsxOnly(x0, x1)) return false; std::size_t y0 = x0, y1 = x1; strip(y0, y1); dst = lower(*parseElem(y0)); return true; };
      std::string yes, no;
      bool yj = branch(q + 1, colon, yes), nj = branch(colon + 1, b, no);
      if (yj && (nj || isNull(colon + 1, b))) { out = {a, q, yes, no, nj, false}; return true; }
      if (nj && isNull(q + 1, colon)) { out = {a, q, no, "", false, true}; return true; }
      return false;
    }
    if (!hasQ && hasAnd && !other && jsxOnly(lastAnd + 1, b)) {
      std::size_t y0 = lastAnd + 1, y1 = b;
      strip(y0, y1);
      out = {a, lastAnd, lower(*parseElem(y0)), "", false, false};
      return true;
    }
    return false;
  }

  // `callee(args)` over [a, b): the open paren, or 0
  std::size_t callParen(std::size_t a, std::size_t b) {
    if (b <= a + 2 || !isP(b - 1, ")")) return 0;
    std::size_t open = b - 1;
    int d = 0;
    for (std::size_t k = b; k-- > a;) {
      if (t[k].kind != Tok::Punct) continue;
      std::string x = tx(k);
      if (x == ")" || x == "]" || x == "}") ++d;
      else if (x == "(" || x == "[" || x == "{") { if (--d == 0) { open = k; break; } }
    }
    return open > a ? open : 0;
  }
  std::string calleeText(std::size_t a, std::size_t open) const { std::string r; for (std::size_t k = a; k < open; ++k) r += tx(k); return r; }
  static bool childrenCall(const std::string& callee) {
    std::size_t dot = callee.rfind('.');
    std::string last = dot == std::string::npos ? callee : callee.substr(dot + 1);
    if (last == "children") return true;
    return last.size() > 6 && last.compare(0, 6, "render") == 0 && std::isupper(static_cast<unsigned char>(last[6]));
  }
  // an arrow function over [a, b) that returns JSX
  bool returnsJsx(std::size_t a, std::size_t b) {
    std::size_t arrow = 0;
    scan(a, b, [&](std::size_t i, const std::string& x) { if (x == "=>" && !arrow) arrow = i; });
    if (!arrow) return false;
    std::size_t x0 = arrow + 1, x1 = b;
    if (isP(x0, "{")) {
      for (std::size_t k = x0; k < x1; ++k) {
        if (!isK(k, "return")) continue;
        std::size_t r0 = k + 1;
        while (isP(r0, "(")) ++r0;
        if (jsxStart(r0)) return true;
      }
      return false;
    }
    return jsxOnly(x0, x1);
  }

  std::string element(const Elem& e, std::vector<std::string>& out) {
    std::string v = "__n" + std::to_string(counter++);
    if (e.frag) {
      out.push_back("const " + v + ": i32 = _el(6);");
      children(v, e.kids, out);
      return v;
    }
    const std::string& tag = e.tag;
    bool upper = std::isupper(static_cast<unsigned char>(tag[0]));
    if (upper) {
      auto it = imported.find(tag);
      bool hostImport = it == imported.end() || ((it->second.find("components") != std::string::npos || it->second.find("zinc:ui") != std::string::npos) && it->second.rfind("zinc:ui/kit", 0) != 0);
      if (!(kTags.count(tag) && hostImport)) return component(e, out);
    }
    auto tagIt = kTags.find(tag);
    if (tagIt == kTags.end()) fail(e.begin + 1, "unknown host component <" + tag + "> (view, text, button, image, scroll, canvas, input, textarea)");
    int tagNo = tagIt->second;
    out.push_back("const " + v + ": i32 = _el(" + num(tagNo) + ");");
    for (const Attr& a : e.attrs) {
      std::string name = a.name == "className" ? "class" : a.name;
      std::string expr = a.kind == 2 ? valueOf(a) : "true";
      bool lit = a.kind == 1;
      auto push = [&](const std::string& l) { out.push_back(l); };
      if (name == "class") {
        if (lit) push("_class(" + v + ", " + quote(a.lit) + ");");
        else push(react ? "_class(" + v + ", " + expr + ");" : "_dynClass(" + v + ", () => (" + expr + "));");
      } else if (name == "onClick" || name == "onPress") push("_on(" + v + ", " + expr + ");");
      else if (name == "style") fail(a.tok, "the style attribute is not supported yet");
      else if (name == "src") push(lit ? "_img(" + v + ", " + quote(a.lit) + ");" : react ? "_img(" + v + ", " + expr + ");" : "_dynImg(" + v + ", () => (" + expr + "));");
      else if (name == "ref") push("_ref(" + v + ", " + expr + ");");
      else if (name == "focusable") push("_focusable(" + v + ");");
      else if (name == "debugName") {}
      else if (name == "onDraw") push("_draw(" + v + ", " + expr + ");");
      else if (kPointerAttrs.count(name)) push("_ptr(" + v + ", " + num(kPointerAttrs.at(name)) + ", " + expr + ");");
      else if (name == "onKeyDown") push("_key(" + v + ", " + expr + ");");
      else if (name == "dragAxis" && lit && kDragAxes.count(a.lit)) push("_num(" + v + ", 'dragAxis', " + num(kDragAxes.at(a.lit)) + ");");
      else if (name == "grab" && lit && (a.lit == "keep" || a.lit == "keep-x" || a.lit == "auto")) push("_num(" + v + ", 'grab', " + num(a.lit == "keep" ? 1 : a.lit == "keep-x" ? 2 : 0) + ");");
      else if (name == "keyContext") push("_ctx(" + v + ", " + (lit ? quote(a.lit) : expr) + ");");
      else if (name == "onInput" || name == "onChange") push("_onText(" + v + ", " + (name == "onChange" && !react ? "true" : "false") + ", " + expr + ");");
      else if (name == "value" || name == "placeholder") {
        if (lit) push("_str(" + v + ", '" + name + "', " + quote(a.lit) + ");");
        else push(react ? "_str(" + v + ", '" + name + "', " + expr + ");" : "_dynStr(" + v + ", '" + name + "', () => (" + expr + "));");
      } else if (name == "highlight") push("_hl(" + v + ", " + expr + ");");
      else if (name == "type" && lit && a.lit == "password") push("_num(" + v + ", 'password', 1);");
      else if (name == "type" && lit && a.lit == "text") {}
      else if (name == "inputMode" && lit && kInputModes.count(a.lit)) push("_num(" + v + ", 'inputMode', " + num(kInputModes.at(a.lit)) + ");");
      else if (kFlagAttrs.count(name)) {
        if (lit || a.kind == 0 || expr == "true" || expr == "false") push("_num(" + v + ", '" + name + "', " + (lit || expr == "true" || a.kind == 0 ? "1" : "0") + ");");
        else push(react ? "_num(" + v + ", '" + name + "', (" + expr + ") ? 1 : 0);" : "_dynNum(" + v + ", '" + name + "', () => ((" + expr + ") ? 1 : 0));");
      } else if (kNumAttrs.count(name)) {
        bool plain = !expr.empty() && expr.find_first_not_of("-0123456789.") == std::string::npos;
        if (lit) push("_num(" + v + ", '" + name + "', " + a.lit + ");");
        else if (react || plain) push("_num(" + v + ", '" + name + "', " + expr + ");");
        else push("_dynNum(" + v + ", '" + name + "', () => (" + expr + "));");
      } else if (name == "key") {}
      else fail(a.tok, "unknown attribute '" + name + "' on <" + tag + ">");
    }
    bool hasKids = false;
    for (const Child& c : e.kids) if (!(c.kind == 0 && trim(c.text).empty())) hasKids = true;
    if (tagNo >= 7 && hasKids) fail(e.begin, "<" + tag + "> takes its text from value={...}, not from children");
    if (tagNo == 1) textContent(v, e.kids, out);
    else children(v, e.kids, out);
    return v;
  }

  void textContent(const std::string& v, const std::vector<Child>& kids, std::vector<std::string>& out) {
    std::string tpl;
    bool dynamic = false;
    for (const Child& c : kids) {
      if (c.kind == 0) {
        for (char ch : jsxText(c.text)) { if (ch == '`' || ch == '\\' || ch == '$') tpl += '\\'; tpl += ch; }
      } else if (c.kind == 1 && c.ee > c.eb) { tpl += "${" + rw(c.eb, c.ee) + "}"; dynamic = true; }
      else if (c.kind == 1) {}
      else fail(c.tok, "<text> can only contain text and {expressions}");
    }
    if (tpl.empty()) return;
    out.push_back(dynamic && !react ? "_dynTextOf(" + v + ", () => `" + tpl + "`);" : "_textOf(" + v + ", `" + tpl + "`);");
  }

  void children(const std::string& parent, const std::vector<Child>& kids, std::vector<std::string>& out) {
    for (const Child& c : kids) {
      if (c.kind == 0) {
        std::string tt = trim(jsxText(c.text));
        if (!tt.empty()) out.push_back("_text(" + parent + ", " + quote(tt) + ");");
      } else if (c.kind == 1) {
        if (c.ee <= c.eb) continue;
        std::size_t a = c.eb, b = c.ee;
        if (jsxStart(a) && parseElem(a)->end == b) { auto el = parseElem(a); std::string cv = element(*el, out); out.push_back("_append(" + parent + ", " + cv + ");"); continue; }
        std::size_t open = callParen(a, b);
        std::string callee = open ? calleeText(a, open) : "";
        if (open && childrenCall(callee)) { out.push_back("_append(" + parent + ", " + rw(a, b) + ");"); continue; }
        if (open && callee.size() > 4 && callee.compare(callee.size() - 4, 4, ".map") == 0 && returnsJsx(open + 1, b - 1)) {
          bool oneArg = true;
          scan(open + 1, b - 1, [&](std::size_t, const std::string& x) { if (x == ",") oneArg = false; });
          if (oneArg) {
            std::string list = rw(a, open - 2), fn = rw(open + 1, b - 1);
            if (react) out.push_back("for (const __c of " + rw(a, b) + ") _append(" + parent + ", __c);");
            else out.push_back("_for(" + parent + ", () => (" + list + "), " + fn + ");");
            continue;
          }
        }
        Cond cj;
        if (conditional(a, b, cj)) {
          std::string cond = rw(cj.cb, cj.ce);
          if (cj.negate) cond = "!(" + cond + ")";
          if (react) out.push_back("_append(" + parent + ", (" + cond + ") ? " + cj.yes + " : " + (cj.hasNo ? cj.no : "_el(6)") + ");");
          else out.push_back("_show(" + parent + ", () => (" + cond + "), () => " + cj.yes + ", " + (cj.hasNo ? "() => " + cj.no : "null") + ");");
        } else {
          std::string e = rw(a, b);
          out.push_back(react ? "_text(" + parent + ", `${" + e + "}`);" : "_dynText(" + parent + ", () => `${" + e + "}`);");
        }
      } else {
        std::string cv = element(*c.el, out);
        out.push_back("_append(" + parent + ", " + cv + ");");
      }
    }
  }

  std::string component(const Elem& e, std::vector<std::string>& out) {
    const std::string& tag = e.tag;
    std::string v = "__n" + std::to_string(counter++);
    std::vector<std::pair<std::string, const Attr*>> attrs;
    for (const Attr& a : e.attrs) attrs.push_back({a.name, &a});
    auto find = [&](const char* n) -> const Attr* { for (auto& p : attrs) if (p.first == n) return p.second; return nullptr; };
    std::vector<const Child*> kids;
    for (const Child& c : e.kids) if (!(c.kind == 0 && trim(c.text).empty())) kids.push_back(&c);
    auto childNode = [&](const Child* c) -> std::string {
      if (!c) return "_el(6)";
      if (c->kind == 1 && c->ee > c->eb) {
        if (jsxStart(c->eb) && parseElem(c->eb)->end == c->ee) return lower(*parseElem(c->eb));
        return rw(c->eb, c->ee);
      }
      return lower(*c->el);
    };
    if (tag == "VirtualList") fail(e.begin, "<VirtualList> is not supported yet");
    out.push_back("const " + v + ": i32 = _el(6);");
    if (tag == "Show" && !react) {
      const Attr* when = find("when");
      if (!when) fail(e.begin, "<Show> needs when");
      const Attr* fb = find("fallback");
      out.push_back("_show(" + v + ", () => (" + valueOf(*when) + "), () => " + childNode(kids.empty() ? nullptr : kids[0]) + ", " + (fb ? "() => " + valueOf(*fb) : "null") + ");");
    } else if (tag == "For" && !react) {
      const Child* c = kids.empty() ? nullptr : kids[0];
      const Attr* each = find("each");
      if (!c || c->kind != 1 || c->ee <= c->eb || !each) fail(e.begin, "<For> expects each and a function child: {(item, i) => <...>}");
      out.push_back("_for(" + v + ", () => (" + valueOf(*each) + "), " + rw(c->eb, c->ee) + ");");
    } else {
      std::vector<std::string> props;
      const Attr* key = find("key");
      for (auto& p : attrs) if (p.first != "key") props.push_back(p.first + ": " + valueOf(*p.second));
      auto nodeValued = [&](const Child* k) {
        if (k->kind != 1 || k->ee <= k->eb) return true;
        if (jsxStart(k->eb) && parseElem(k->eb)->end == k->ee) return true;
        std::size_t open = callParen(k->eb, k->ee);
        return open && childrenCall(calleeText(k->eb, open));
      };
      if (kids.size() > 1 || (kids.size() == 1 && (kids[0]->kind == 0 || !nodeValued(kids[0])))) {
        std::vector<std::string> lines;
        std::string f = "__n" + std::to_string(counter++);
        lines.push_back("const " + f + ": i32 = _el(6);");
        std::vector<Child> copy;
        for (const Child* k : kids) copy.push_back(*k);
        children(f, copy, lines);
        std::string body;
        for (auto& l : lines) body += l + " ";
        props.push_back("children: () => ((): i32 => { " + body + "return " + f + "; })()");
      } else if (kids.size() == 1) props.push_back("children: () => " + childNode(kids[0]));
      std::string args;
      for (std::size_t k = 0; k < props.size(); ++k) args += (k ? ", " : "") + props[k];
      std::string call = tag + "(" + (props.empty() ? "" : "{ " + args + " }") + ")";
      std::string keyArg = key ? "'' + (" + valueOf(*key) + ")" : "''";
      out.push_back(react ? "_rc(" + v + ", () => " + call + ", " + quote(tag) + ", " + keyArg + ");" : "_append(" + v + ", " + call + ");");
    }
    return v;
  }
};

}  // namespace

std::string lowerJsx(std::string_view src, std::vector<Diag>& diags, std::uint32_t file) {
  std::size_t lt = src.find('<');
  bool maybe = false;
  for (; lt != std::string_view::npos && lt + 1 < src.size(); lt = src.find('<', lt + 1))
    if (std::isalpha(static_cast<unsigned char>(src[lt + 1])) || src[lt + 1] == '>') { maybe = true; break; }
  if (!maybe) return std::string(src);
  Lowering L;
  L.s = src;
  L.t = lex(src, true);
  try {
    // imports: names to modules (a kit component's explicit import wins over the host tag of the same name); the model
    for (std::size_t i = 0; i < L.t.size(); ++i) {
      if (!L.isK(i, "import")) continue;
      std::size_t k = i + 1;
      std::vector<std::string> names;
      while (k < L.t.size() && !L.isK(k, "from") && !(L.t[k].kind == Tok::Ident && L.tx(k) == "from") && L.t[k].kind != Tok::String) {
        if (L.t[k].kind == Tok::Ident) { names.push_back(L.tx(k)); if (L.isK(k + 1, "as") || (L.t[k + 1].kind == Tok::Ident && L.tx(k + 1) == "as")) { names.pop_back(); k += 2; if (L.t[k].kind == Tok::Ident) names.push_back(L.tx(k)); } }
        ++k;
      }
      if (k < L.t.size() && L.t[k].kind != Tok::String) ++k;
      if (k < L.t.size() && L.t[k].kind == Tok::String) {
        std::string spec = L.tx(k);
        spec = spec.substr(1, spec.size() - 2);
        for (auto& n : names) L.imported[n] = spec;
        if (spec == "zinc:ui/react" || spec == "react" || spec == "inferno") L.react = true;
      }
    }
    std::size_t pr = src.find("@jsxHelpers");
    L.lib = L.react ? "zinc:ui/react" : "zinc:ui/solid";
    if (pr != std::string_view::npos) {
      std::size_t a = pr + 11;
      while (a < src.size() && std::isspace(static_cast<unsigned char>(src[a]))) ++a;
      std::size_t b = a;
      while (b < src.size() && !std::isspace(static_cast<unsigned char>(src[b]))) ++b;
      L.lib = std::string(src.substr(a, b - a));
    }
    // replace the top-level JSX elements
    std::string out;
    std::size_t pos = 0;
    for (std::size_t i = 0; i < L.t.size(); ++i) {
      if (!L.jsxStart(i)) continue;
      auto e = L.parseElem(i);
      out += std::string(src.substr(pos, L.t[i].start - pos)) + L.lower(*e);
      pos = L.t[e->end - 1].end;
      i = e->end - 1;
    }
    out += std::string(src.substr(pos));
    const char* input = "_styles, _ptr, _key, _onText, _str, _hl, _ctx";
    std::string helpers = L.react ? std::string("_el, _text, _textOf, _append, _class, _on, _draw, _num, _img, _ref, _focusable, _rc, _cc, _virtual, ") + input
                                  : std::string("_dynStyles, _el, _text, _textOf, _dynTextOf, _append, _class, _on, _draw, _num, _dynText, _dynClass, _dynNum, _show, _for, _img, _dynImg, _ref, _focusable, _virtual, _dynStr, ") + input;
    return "import { " + helpers + " } from '" + L.lib + "'; " + out;
  } catch (const Failure& f) {
    diags.push_back({"Z0005", f.pos, "JSX: " + f.msg, file});
    return std::string(src);
  }
}

}  // namespace zn::frontend
