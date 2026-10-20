// zinc migrate: versioned codemods on the engine's lexer (docs/reports/zinc-lint-migrate.md). A codemod finds sites in the token stream, so a
// string, a comment or the text of a JSX element is never rewritten; every replacement stays on its line, so a dry run is a diff of lines.
// The walk below follows JSX the way src/frontend/jsx.cpp parses it (an element starts at a `<` that does not follow an expression).
#include "lint/lint.h"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <set>
#include <sstream>

#include "frontend/jsx.h"
#include "frontend/lexer.h"

namespace fs = std::filesystem;
namespace fe = zn::frontend;

namespace zn::lint {
namespace {

// What the walk reports: a tag name (opening or closing), an attribute name with its value's token range, a token of plain code.
struct Visitor {
  std::function<void(std::size_t tok, bool closing)> tag;
  std::function<void(std::size_t tok, const std::string& tag, std::size_t valueBegin, std::size_t valueEnd)> attr;
  std::function<void(std::size_t tok)> code;
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
      tag = tx(j);
      if (v.tag) v.tag(j, false);
      for (++j;;) {
        if (eof(j)) return j;
        if (isP(j, "/>")) return j + 1;
        if (isP(j, ">")) break;
        if (isP(j, "{")) { j = braces(j); continue; }   // {...spread}
        if (t[j].kind == fe::Tok::Ident) {
          std::size_t name = j++, vb = j, ve = j;
          if (isP(j, "=")) {
            ++j;
            vb = j;
            j = isP(j, "{") ? braces(j) : j + 1;
            ve = j;
          }
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
      {"jsx-classname", "0.0.1 (2026-10-16)", "Z0006", "`class` in JSX becomes `className`: the attribute, and the prop of components (declarations, `props.class`, keys, destructuring)", scanClassName},
      {"jsx-capitalised-tags", "0.0.1 (2026-10-16)", "Z0007", "lowercase JSX tags become the components: <view> <View>, <scroll> <ScrollView>, <textarea> <TextArea>, <div> <View>, <span> and <p> <Text>, <img> <Image>", scanTags},
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
  if (chosen.empty()) for (const Codemod& c : codemods()) chosen.push_back(&c);
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
