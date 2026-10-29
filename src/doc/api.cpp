// zinc doc: the API of a source file (ZN-856). The frontend's lexer gives the tokens; the exported declarations are found at brace depth 0,
// their signatures are the source text up to the body, and their doc comments are the comment right above them (the lexer leaves comments in
// the gaps between tokens). No parser and no checker: a file the checker refuses, a .d.ts, a .tsx still document.
// ponytail: statement ends without semicolons use an ASI rule of thumb (a new line not after an operator); a parser-based extractor if it misreads.
#include "doc/internal.h"
#include "frontend/lexer.h"

#include <algorithm>
#include <cstring>
#include <set>

namespace zn::doc {
namespace {
using zn::frontend::Tok;
using zn::frontend::Token;

struct Scan {
  std::string_view s;
  std::vector<Token> t;
  bool ambient = false;

  std::string_view text(std::size_t i) const { return i < t.size() ? s.substr(t[i].start, t[i].end - t[i].start) : std::string_view(); }
  bool is(std::size_t i, std::string_view p) const { return i < t.size() && t[i].kind == Tok::Punct && text(i) == p; }
  bool word(std::size_t i, std::string_view w) const { return i < t.size() && (t[i].kind == Tok::Ident || t[i].kind == Tok::Keyword) && text(i) == w; }
  bool name(std::size_t i) const { return i < t.size() && (t[i].kind == Tok::Ident || t[i].kind == Tok::Keyword); }
  bool eof(std::size_t i) const { return i >= t.size() || t[i].kind == Tok::Eof; }
  bool newline(std::size_t a, std::size_t b) const {   // a line break between the end of token a and the start of token b
    return s.substr(t[a].end, t[b].start - t[a].end).find('\n') != std::string_view::npos;
  }
  int depthOf(std::size_t i) const {
    if (t[i].kind != Tok::Punct) return 0;
    const std::string_view p = text(i);
    if (p == "(" || p == "[" || p == "{") return 1;
    if (p == ")" || p == "]" || p == "}") return -1;
    return 0;
  }
  std::size_t match(std::size_t i) const {   // the index after the bracket that closes the one at i
    int d = 0;
    for (; !eof(i); i++) { d += depthOf(i); if (d == 0) return i + 1; }
    return i;
  }
  // the token after the generic parameters `<...>` at i (counting angle brackets; `=>` is one token)
  std::size_t skipAngles(std::size_t i) const {
    if (!is(i, "<")) return i;
    int d = 0;
    for (; !eof(i); i++) {
      if (is(i, "<")) d++;
      else if (is(i, ">")) { if (--d == 0) return i + 1; }
      else if (depthOf(i) > 0) { i = match(i) - 1; }
      else if (is(i, ";") || is(i, "}")) return i;
    }
    return i;
  }
  bool continues(std::size_t prev) const {   // a token after which a line goes on
    if (t[prev].kind != Tok::Punct) return word(prev, "extends") || word(prev, "implements") || word(prev, "keyof") || word(prev, "typeof");
    static const std::set<std::string_view> ops = {"=", "|", "&", ",", "(", "[", "{", ".", "?", ":", "=>", "+", "-", "*", "/", "&&", "||", "??", "<", "?.", "...", "!"};
    return ops.count(text(prev)) > 0;
  }
  bool startsContinued(std::size_t i) const {   // a token that continues the line before it
    if (t[i].kind != Tok::Punct) return word(i, "extends") || word(i, "implements") || word(i, "as") || word(i, "satisfies");
    static const std::set<std::string_view> ops = {"|", "&", ".", "?", ":", "=>", ")", "]", "?.", "&&", "||", "??", ">", "=", "+", "-", "*", "/"};
    return ops.count(text(i)) > 0;
  }
  bool stops(std::size_t i, std::string_view list) const {   // the token is one of the space-separated punctuation of `list`
    if (t[i].kind != Tok::Punct) return false;
    for (std::size_t p = 0; p < list.size();) {
      std::size_t e = list.find(' ', p);
      if (e == std::string_view::npos) e = list.size();
      if (list.substr(p, e - p) == text(i)) return true;
      p = e + 1;
    }
    return false;
  }
  // The end (exclusive token index) of the statement or member starting at i: a `;` (included), a `}` that closes the enclosing body, a stop
  // word, or a new line that does not go on (ASI). `stopAt`: punctuation that ends it at depth 0 (`=` for a field's type, `{` for a body).
  std::size_t end(std::size_t i, std::string_view stopAt = {}, bool comma = false) const {
    int d = 0;
    const std::size_t first = i;
    for (; !eof(i); i++) {
      if (d == 0) {
        if (i > first && newline(i - 1, i) && !continues(i - 1) && !startsContinued(i)) return i;
        if (is(i, ";")) return i + 1;
        if (comma && is(i, ",")) return i + 1;
        if (is(i, "}") || is(i, ")") || is(i, "]")) return i;
        if (i > first && stops(i, stopAt)) return i;
      }
      const int dd = depthOf(i);
      if (dd > 0) { i = match(i) - 1; continue; }
      d += dd;
    }
    return i;
  }
};

std::string trim(std::string_view v) {
  std::size_t a = 0, b = v.size();
  while (a < b && std::strchr(" \t\r\n", v[a])) a++;
  while (b > a && std::strchr(" \t\r\n", v[b - 1])) b--;
  return std::string(v.substr(a, b - a));
}

// A comment's text without its markers: /** */ blocks lose the leading `*` of each line, // lines their slashes.
std::string commentText(std::string_view c) {
  std::string out;
  if (c.substr(0, 2) == "/*") {
    c = c.substr(c.substr(0, 3) == "/**" ? 3 : 2);
    if (c.size() >= 2 && c.substr(c.size() - 2) == "*/") c = c.substr(0, c.size() - 2);
    std::size_t p = 0;
    while (p <= c.size()) {
      std::size_t nl = c.find('\n', p);
      if (nl == std::string_view::npos) nl = c.size();
      std::string_view line = c.substr(p, nl - p);
      std::size_t a = 0;
      while (a < line.size() && (line[a] == ' ' || line[a] == '\t')) a++;
      if (a < line.size() && line[a] == '*') { a++; if (a < line.size() && line[a] == ' ') a++; }
      else if (p == 0 && a < line.size()) {}   // text on the opening line
      out += line.substr(a);
      out += '\n';
      p = nl + 1;
    }
  } else {
    std::size_t p = 0;
    while (p < c.size()) {
      std::size_t nl = c.find('\n', p);
      if (nl == std::string_view::npos) nl = c.size();
      std::string_view line = c.substr(p, nl - p);
      std::size_t a = line.find("//");
      if (a != std::string_view::npos) { line = line.substr(a + 2); if (!line.empty() && line[0] == ' ') line = line.substr(1); }
      out += line;
      out += '\n';
      p = nl + 1;
    }
  }
  return trim(out);
}

// The doc comment right above the token at `at`: the last /** */ block of the gap before it with nothing but white space after it, else the
// // lines directly above (no blank line between them and the declaration; a comment ending the previous line of code is not one).
std::string docBefore(const Scan& sc, std::size_t at) {
  const std::uint32_t from = at == 0 ? 0 : sc.t[at - 1].end, to = sc.t[at].start;
  std::string_view gap = sc.s.substr(from, to - from);
  const std::size_t close = gap.rfind("*/");
  if (close != std::string_view::npos && trim(gap.substr(close + 2)).empty()) {
    const std::size_t open = gap.rfind("/*", close);
    if (open != std::string_view::npos && gap.substr(open, 3) == "/**") return commentText(gap.substr(open, close + 2 - open));
    return {};
  }
  // // lines: walk up from the line of the token
  if (at > 0) { const std::size_t nl = gap.find('\n'); if (nl == std::string_view::npos) return {}; gap = gap.substr(nl + 1); }
  std::vector<std::string_view> lines;
  std::size_t p = 0;
  while (p <= gap.size()) { std::size_t nl = gap.find('\n', p); if (nl == std::string_view::npos) nl = gap.size(); lines.push_back(gap.substr(p, nl - p)); p = nl + 1; }
  if (!lines.empty()) lines.pop_back();   // the indentation before the token
  std::size_t first = lines.size();
  while (first > 0) {
    const std::string l = trim(lines[first - 1]);
    if (l.size() < 2 || l.substr(0, 2) != "//" || (l.substr(0, 3) == "///" && l.find('<') != std::string::npos)) break;
    first--;
  }
  std::string c;
  for (std::size_t i = first; i < lines.size(); i++) { c += trim(lines[i]); c += '\n'; }
  return c.empty() ? std::string() : commentText(c);
}

// The source between two token indices, dedented to the indentation of its first line; members are written on one line.
std::string slice(const Scan& sc, std::size_t a, std::size_t b, bool oneLine) {
  if (b <= a) return {};
  const std::uint32_t from = sc.t[a].start, to = sc.t[b - 1].end;
  std::string_view v = sc.s.substr(from, to - from);
  std::string out;
  if (oneLine) {
    bool space = false;
    for (char c : v) {
      if (c == '\n' || c == '\r' || c == '\t' || c == ' ') { space = true; continue; }
      if (space && !out.empty() && out.back() != '(' && out.back() != '[' && c != ')' && c != ']' && c != ',') out += ' ';
      space = false;
      out += c;
    }
    return out;
  }
  std::uint32_t ls = from;
  while (ls > 0 && sc.s[ls - 1] != '\n') ls--;
  const std::size_t indent = from - ls;
  std::size_t p = 0;
  while (p < v.size()) {
    std::size_t nl = v.find('\n', p);
    if (nl == std::string_view::npos) nl = v.size();
    std::string_view line = v.substr(p, nl - p);
    if (p > 0) { std::size_t k = 0; while (k < indent && k < line.size() && (line[k] == ' ' || line[k] == '\t')) k++; line = line.substr(k); out += '\n'; }
    out += line;
    p = nl + 1;
  }
  return out;
}

bool hidden(std::string_view name) { return name.empty() || name[0] == '_' || name[0] == '#'; }

// The members of a class or interface body: the tokens between `open` (the `{`) and `close` (its `}`).
void members(const Scan& sc, std::size_t open, std::size_t close, Item& item) {
  static const std::set<std::string_view> mods = {"public", "private", "protected", "static", "readonly", "abstract", "async", "declare", "override", "get", "set", "accessor"};
  std::size_t k = open + 1;
  while (k < close) {
    if (sc.is(k, ";") || sc.is(k, ",")) { k++; continue; }
    const std::size_t start = k;
    bool priv = false, getter = false, setter = false, isStatic = false;
    while (k < close && sc.name(k) && mods.count(sc.text(k)) && !(sc.is(k + 1, "(") || sc.is(k + 1, ":") || sc.is(k + 1, "?") || sc.is(k + 1, "=") || sc.is(k + 1, ";") || sc.is(k + 1, "<") || sc.newline(k, k + 1))) {
      const std::string_view m = sc.text(k);
      priv |= m == "private" || m == "protected";
      getter |= m == "get";
      setter |= m == "set";
      isStatic |= m == "static";
      k++;
    }
    if (sc.is(k, "*")) k++;
    std::string name;
    bool call = false;
    if (sc.is(k, "[")) { name = std::string(sc.text(k + 1)); k = sc.match(k); }
    else if (sc.is(k, "(") || sc.is(k, "<")) call = true;
    else if (sc.word(k, "new") && (sc.is(k + 1, "(") || sc.is(k + 1, "<"))) { name = "new"; k++; call = true; }
    else { name = std::string(sc.text(k)); if (k < close) k++; }
    if (name.size() >= 2 && (name[0] == '\'' || name[0] == '"')) name = name.substr(1, name.size() - 2);
    if (sc.is(k, "?") || sc.is(k, "!")) k++;
    std::size_t sigEnd;
    Member m;
    if (sc.is(k, "(") || sc.is(k, "<")) {
      k = sc.skipAngles(k);
      k = sc.match(k);
      if (sc.is(k, ":")) k = sc.end(k + 1, "{");   // the return type, up to the body
      sigEnd = k;
      if (sc.is(k, "{")) k = sc.match(k);
      m.kind = getter ? "getter" : setter ? "setter" : name == "constructor" ? "constructor" : call ? "call" : "method";
    } else {
      if (sc.is(k, ":")) k = sc.end(k + 1, "=", true);
      sigEnd = k;
      while (sigEnd > start && (sc.is(sigEnd - 1, ";") || sc.is(sigEnd - 1, ","))) sigEnd--;
      if (sc.is(k, "=")) k = sc.end(k + 1, {}, true);
      m.kind = "property";
    }
    if (k <= start) k = start + 1;   // always move on
    while (sigEnd > start && (sc.is(sigEnd - 1, ";") || sc.is(sigEnd - 1, ","))) sigEnd--;
    if (priv || (hidden(name) && !call)) continue;
    m.name = isStatic ? "static " + name : name;
    m.sig = slice(sc, start, sigEnd, true);
    m.doc = docBefore(sc, start);
    if (setter && !item.members.empty() && item.members.back().kind == "getter" && item.members.back().name == m.name) continue;   // the getter documents the pair
    item.members.push_back(std::move(m));
  }
}

struct Extractor {
  Scan sc;
  std::vector<Module> out;

  // The declaration whose first token (after `export`, `default` and `declare`) is at j; `start` is the token the signature starts at.
  // Returns the index after it, or j when it is not a declaration.
  std::size_t decl(std::size_t start, std::size_t j, Module& m, const std::string& doc, bool isDefault) {
    while (sc.word(j, "declare") || sc.word(j, "abstract") || sc.word(j, "async") || (sc.word(j, "const") && sc.word(j + 1, "enum"))) j++;
    const std::string kw(sc.text(j));
    Item it;
    it.doc = doc;
    std::size_t k = j + 1;
    if (kw == "function") {
      if (sc.is(k, "*")) k++;
      it.kind = "function";
      it.name = sc.name(k) ? std::string(sc.text(k)) : "default";
      if (sc.name(k)) k++;
      k = sc.skipAngles(k);
      if (!sc.is(k, "(")) return j + 1;
      k = sc.match(k);
      if (sc.is(k, ":")) k = sc.end(k + 1, "{");
      std::size_t sigEnd = k;
      while (sigEnd > start && sc.is(sigEnd - 1, ";")) sigEnd--;
      it.sig = slice(sc, start, sigEnd, false);
      if (sc.is(k, "{")) k = sc.match(k);
      // overloads (a .d.ts lists one signature per line): one item with every signature
      if (!m.items.empty() && m.items.back().kind == "function" && m.items.back().name == it.name) {
        m.items.back().sig += "\n" + it.sig;
        if (m.items.back().doc.empty()) m.items.back().doc = it.doc;
        return k;
      }
    } else if (kw == "class" || kw == "interface") {
      it.kind = kw;
      it.name = sc.name(k) && !sc.word(k, "extends") && !sc.word(k, "implements") ? std::string(sc.text(k)) : "default";
      while (!sc.eof(k) && !sc.is(k, "{")) { if (sc.is(k, "<")) k = sc.skipAngles(k); else if (sc.depthOf(k) > 0) k = sc.match(k); else k++; }
      it.sig = slice(sc, start, k, true);
      const std::size_t close = sc.match(k) - 1;
      members(sc, k, close, it);
      k = close + 1;
    } else if (kw == "type") {
      it.kind = "type";
      it.name = std::string(sc.text(k));
      k = sc.end(k);
      std::size_t sigEnd = k;
      while (sigEnd > start && sc.is(sigEnd - 1, ";")) sigEnd--;
      it.sig = slice(sc, start, sigEnd, false);
    } else if (kw == "const" || kw == "let" || kw == "var") {
      it.kind = "const";
      if (!sc.name(k)) { k = sc.end(k); return k; }   // a destructuring export: nothing to name
      it.name = std::string(sc.text(k));
      const std::size_t stop = sc.end(k, "=");
      std::size_t e = sc.end(k);
      if (sc.is(stop, "=")) {
        // an arrow function: its parameters and return type; a short value: itself; anything else: the name and type alone
        std::size_t v = stop + 1, arrow = 0;
        if (sc.word(v, "async")) v++;
        if (sc.is(v, "(") || sc.is(v, "<")) { std::size_t a = sc.match(sc.skipAngles(v)); if (sc.is(a, ":")) a = sc.end(a + 1, "=>"); if (sc.is(a, "=>")) arrow = a + 1; }
        std::size_t sigEnd = e;
        while (sigEnd > stop && sc.is(sigEnd - 1, ";")) sigEnd--;
        if (arrow) it.sig = slice(sc, start, arrow, true) + " …";
        else if (sigEnd - stop <= 12 && !sc.newline(stop, sigEnd - 1)) it.sig = slice(sc, start, sigEnd, true);
        else it.sig = slice(sc, start, stop, true);
      } else {
        std::size_t sigEnd = e;
        while (sigEnd > start && sc.is(sigEnd - 1, ";")) sigEnd--;
        it.sig = slice(sc, start, sigEnd, true);
      }
      k = e;
    } else if (kw == "enum") {
      it.kind = "enum";
      it.name = std::string(sc.text(k));
      while (!sc.eof(k) && !sc.is(k, "{")) k++;
      k = sc.match(k);
      it.sig = slice(sc, start, k, false);
    } else if (kw == "namespace" || kw == "module") {
      it.kind = "namespace";
      it.name = std::string(sc.text(k));
      while (!sc.eof(k) && !sc.is(k, "{")) k++;
      it.sig = slice(sc, start, k, true);
      k = sc.match(k);
    } else if (isDefault) {   // `export default <expression>`
      return sc.end(j);
    } else {
      return j;
    }
    if (!hidden(it.name)) m.items.push_back(std::move(it));
    return std::max(k, j + 1);
  }

  // The declarations of tokens [from, to): top level, or the body of a `declare module`.
  void body(std::size_t from, std::size_t to, Module& m, bool bareDecls) {
    static const std::set<std::string_view> starts = {"function", "class", "interface", "type", "const", "let", "var", "enum", "namespace", "declare", "abstract"};
    for (std::size_t i = from; i < to && !sc.eof(i);) {
      if (sc.word(i, "declare") && (sc.word(i + 1, "module") || sc.word(i + 1, "global")) && (sc.t[i + 2].kind == Tok::String || sc.is(i + 2, "{"))) {
        const bool global = sc.word(i + 1, "global");
        const std::size_t open = global ? i + 2 : i + 3;
        if (!sc.is(open, "{")) { i = sc.end(i); continue; }
        const std::size_t close = sc.match(open) - 1;
        if (global) { body(open + 1, close, m, true); i = close + 1; continue; }
        Module sub;
        const std::string_view q = sc.text(i + 2);
        sub.name = std::string(q.substr(1, q.size() - 2));
        sub.file = m.file;
        sub.overview = docBefore(sc, i);
        body(open + 1, close, sub, true);
        out.push_back(std::move(sub));
        i = close + 1;
        continue;
      }
      if (sc.word(i, "export")) {
        std::size_t j = i + 1;
        const std::string doc = docBefore(sc, i);
        if (sc.is(j, "*") || sc.is(j, "{") || (sc.word(j, "type") && sc.is(j + 1, "{"))) {   // re-exports
          std::size_t e = sc.end(j);
          for (std::size_t k = j; k < e; k++)
            if (sc.word(k, "from") && sc.t[k + 1].kind == Tok::String && sc.is(j, "*")) {
              const std::string_view q = sc.text(k + 1);
              if (q.size() > 3 && q[1] == '.') m.reexports.emplace_back(q.substr(1, q.size() - 2));
            }
          i = std::max(e, j + 1);
          continue;
        }
        bool isDefault = false;
        if (sc.word(j, "default")) { isDefault = true; j++; }
        if (sc.is(j, "=")) { i = sc.end(j); continue; }   // export = x
        const std::size_t n = decl(j, j, m, doc, isDefault);
        i = n > j ? n : sc.end(j);
        continue;
      }
      if (bareDecls && sc.name(i) && starts.count(sc.text(i)) && (sc.name(i + 1) || sc.word(i, "declare"))) {
        const std::string doc = docBefore(sc, i);
        const std::size_t n = decl(i, i, m, doc, false);
        if (n > i) { i = n; continue; }
      }
      if (sc.word(i, "import")) { i = sc.end(i); continue; }
      const int d = sc.depthOf(i);
      i = d > 0 ? sc.match(i) : i + 1;
    }
  }
};

}  // namespace

std::vector<Module> extractApi(std::string_view src, const std::string& name, const std::string& file, bool jsx, bool ambient) {
  Extractor x;
  x.sc.s = src;
  x.sc.t = zn::frontend::lex(src, jsx);
  x.sc.ambient = ambient;
  Module m;
  m.name = name;
  m.file = file;
  // the file's leading comment (up to the first blank line after it) is the module's overview
  if (!x.sc.t.empty()) {
    std::string_view head = src.substr(0, x.sc.t[0].start);
    std::size_t p = 0;
    while (p < head.size() && std::strchr(" \t\r\n", head[p])) p++;
    head = head.substr(p);
    if (head.substr(0, 2) == "//") {
      std::size_t e = head.find("\n\n");
      std::string_view block = head.substr(0, e == std::string_view::npos ? head.size() : e);
      if (block.substr(0, 3) != "///") m.overview = commentText(block);
    } else if (head.substr(0, 2) == "/*") {
      const std::size_t e = head.find("*/");
      if (e != std::string_view::npos) m.overview = commentText(head.substr(0, e + 2));
    }
  }
  x.body(0, x.sc.t.size(), m, ambient);
  if (!m.overview.empty() && !m.items.empty() && m.items.front().doc == m.overview) m.overview.clear();   // the comment documents the first declaration
  std::vector<Module> mods;
  if (!m.items.empty() || !m.overview.empty() || x.out.empty()) mods.push_back(std::move(m));
  for (auto& s : x.out) mods.push_back(std::move(s));
  return mods;
}

std::string docMarkdown(std::string_view raw) {
  std::string body, params, returns, throws, see, examples, deprecated;
  std::string* cur = &body;
  bool inExample = false;
  std::size_t p = 0;
  while (p <= raw.size()) {
    std::size_t nl = raw.find('\n', p);
    if (nl == std::string_view::npos) nl = raw.size();
    std::string_view line = raw.substr(p, nl - p);
    p = nl + 1;
    std::string_view tl = line;
    while (!tl.empty() && (tl[0] == ' ' || tl[0] == '\t')) tl.remove_prefix(1);
    if (!tl.empty() && tl[0] == '@') {
      if (inExample) { examples += "```\n"; inExample = false; }
      std::size_t sp = tl.find_first_of(" \t");
      const std::string_view tag = tl.substr(1, sp == std::string_view::npos ? std::string_view::npos : sp - 1);
      std::string rest = sp == std::string_view::npos ? std::string() : trim(tl.substr(sp));
      if (tag == "param" || tag == "arg" || tag == "argument") {
        if (!rest.empty() && rest[0] == '{') { const std::size_t e = rest.find('}'); rest = e == std::string::npos ? rest : trim(rest.substr(e + 1)); }   // {type}
        const std::size_t e = rest.find_first_of(" \t");
        std::string pname = rest.substr(0, e), pdesc = e == std::string::npos ? "" : trim(rest.substr(e));
        if (pdesc.size() > 1 && pdesc[0] == '-' && pdesc[1] == ' ') pdesc = pdesc.substr(2);
        params += "- `" + pname + "`" + (pdesc.empty() ? "" : " — " + pdesc) + "\n";
        cur = &params;
      } else if (tag == "returns" || tag == "return") { returns += rest; cur = &returns; }
      else if (tag == "throws" || tag == "throw") { throws += rest; cur = &throws; }
      else if (tag == "see") { see += (see.empty() ? "" : ", ") + rest; cur = &see; }
      else if (tag == "deprecated") { deprecated = rest.empty() ? "Deprecated." : rest; cur = &deprecated; }
      else if (tag == "example") { examples += "```ts\n"; if (!rest.empty()) examples += rest + "\n"; inExample = true; cur = &examples; }
      else { body += std::string(line) + "\n"; cur = &body; }
      continue;
    }
    if (inExample && tl.substr(0, 3) == "```") { examples.erase(examples.size() - 6); inExample = false; examples += std::string(tl) + "\n"; cur = &examples; continue; }
    if (cur == &body || cur == &examples) *cur += std::string(line) + "\n";
    else if (!tl.empty()) { if (cur == &params && !params.empty() && params.back() == '\n') params.pop_back(); *cur += " " + std::string(tl) + (cur == &params ? "\n" : ""); }
  }
  if (inExample) examples += "```\n";
  std::string md;
  if (!deprecated.empty()) md += "> [!WARNING]\n> **Deprecated.** " + trim(deprecated) + "\n\n";
  md += trim(body) + "\n\n";
  if (!params.empty()) md += "**Parameters**\n\n" + params + "\n";
  if (!returns.empty()) md += "**Returns** " + trim(returns) + "\n\n";
  if (!throws.empty()) md += "**Throws** " + trim(throws) + "\n\n";
  if (!examples.empty()) md += "**Example**\n\n" + examples + "\n";
  if (!see.empty()) md += "**See** " + trim(see) + "\n\n";
  return trim(md);
}

}  // namespace zn::doc
