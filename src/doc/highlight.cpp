// zinc doc: code highlighting at build time (ZN-856), so a page needs no script to show its code. TypeScript, TSX and JavaScript use the
// frontend's lexer: the reader sees the tokens the engine reads. Shell, JSON and C-like code use a small scanner with a keyword table.
// Classes: k keyword, t type, f function, s string, n number, c comment, p property (JSON key), v variable or flag, pr prompt (not copied).
#include "doc/internal.h"
#include "frontend/lexer.h"

#include <algorithm>
#include <cctype>
#include <set>

namespace zn::doc {
namespace {
using zn::frontend::Tok;

void span(std::string& out, const char* cls, std::string_view text) {
  if (text.empty()) return;
  out += "<span class=\"";
  out += cls;
  out += "\">";
  out += escapeHtml(text);
  out += "</span>";
}

// White space and comments between two tokens: the comments in their colour.
void gap(std::string& out, std::string_view g) {
  std::size_t p = 0;
  while (p < g.size()) {
    const std::size_t a = g.find('/', p);
    if (a == std::string_view::npos || a + 1 >= g.size() || (g[a + 1] != '/' && g[a + 1] != '*')) {
      if (a == std::string_view::npos) { out += escapeHtml(g.substr(p)); return; }
      out += escapeHtml(g.substr(p, a + 1 - p));
      p = a + 1;
      continue;
    }
    out += escapeHtml(g.substr(p, a - p));
    std::size_t e = g[a + 1] == '/' ? g.find('\n', a) : g.find("*/", a + 2);
    e = e == std::string_view::npos ? g.size() : g[a + 1] == '/' ? e : e + 2;
    span(out, "c", g.substr(a, e - a));
    p = e;
  }
}

std::string ts(std::string_view code, bool jsx, const std::function<std::string(std::string_view)>& typeLink) {
  static const std::set<std::string_view> ctx = {"type", "interface", "from", "of", "as", "async", "await", "readonly", "declare", "abstract",
                                                  "implements", "namespace", "module", "keyof", "infer", "is", "get", "set", "satisfies", "let", "static",
                                                  "public", "private", "protected", "override", "accessor", "unique", "asserts", "global"};
  static const std::set<std::string_view> prims = {"string", "number", "boolean", "void", "any", "unknown", "never", "object", "bigint", "symbol",
                                                    "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "f32", "f64", "isize", "usize", "fx12", "fx16", "undefined"};
  const auto toks = zn::frontend::lex(code, jsx);
  std::string out;
  std::uint32_t at = 0;
  for (std::size_t i = 0; i < toks.size(); i++) {
    const auto& t = toks[i];
    if (t.kind == Tok::Eof) break;
    if (t.start < at) continue;
    gap(out, code.substr(at, t.start - at));
    const std::string_view x = code.substr(t.start, t.end - t.start);
    at = t.end;
    const bool afterDot = i > 0 && toks[i - 1].kind == Tok::Punct && (code.substr(toks[i - 1].start, 1) == "." || code.substr(toks[i - 1].start, 2) == "?.");
    const bool call = i + 1 < toks.size() && toks[i + 1].kind == Tok::Punct && code.substr(toks[i + 1].start, 1) == "(";
    switch (t.kind) {
      case Tok::Keyword: span(out, x == "true" || x == "false" || x == "null" || x == "this" ? "n" : "k", x); break;
      case Tok::Ident:
        if (afterDot) { if (call) span(out, "f", x); else out += escapeHtml(x); }
        else if (ctx.count(x) && !call) span(out, "k", x);
        else if (prims.count(x)) span(out, "t", x);
        else if (!x.empty() && std::isupper(static_cast<unsigned char>(x[0]))) {
          const std::string href = typeLink ? typeLink(x) : std::string();
          if (!href.empty()) { out += "<a class=\"t\" href=\"" + escapeHtml(href) + "\">" + escapeHtml(x) + "</a>"; }
          else span(out, "t", x);
        } else if (call) span(out, "f", x);
        else out += escapeHtml(x);
        break;
      case Tok::Number: case Tok::BigInt: span(out, "n", x); break;
      case Tok::String: case Tok::Regex: case Tok::TemplateNoSub: case Tok::TemplateHead: case Tok::TemplateMiddle: case Tok::TemplateTail: span(out, "s", x); break;
      case Tok::Error: out += escapeHtml(code.substr(t.start)); return out;   // something the lexer cannot read: the rest as it is
      default: out += escapeHtml(x);
    }
  }
  gap(out, code.substr(at));
  return out;
}

bool isWordChar(char c) { return std::isalnum(static_cast<unsigned char>(c)) || c == '_'; }

std::string shell(std::string_view code) {
  std::string out;
  std::size_t p = 0;
  while (p < code.size()) {
    std::size_t nl = code.find('\n', p);
    if (nl == std::string_view::npos) nl = code.size();
    std::string_view line = code.substr(p, nl - p);
    std::size_t i = 0;
    bool cmd = true;
    if (line.substr(0, 2) == "$ " || line.substr(0, 2) == "> " || line.substr(0, 2) == "% ") { span(out, "pr", line.substr(0, 2)); i = 2; }
    else if (line.size() > 0 && line[0] != '#' && p > 0 && code[p - 2] != '\\' && code.substr(0, 2) == "$ ") { out += escapeHtml(line); out += '\n'; p = nl + 1; continue; }   // output under a prompt
    while (i < line.size()) {
      const char c = line[i];
      if (c == '#' && (i == 0 || line[i - 1] == ' ')) { span(out, "c", line.substr(i)); break; }
      if (c == '\'' || c == '"') {
        std::size_t e = line.find(c, i + 1);
        e = e == std::string_view::npos ? line.size() : e + 1;
        span(out, "s", line.substr(i, e - i));
        i = e;
        continue;
      }
      if (c == '$' && i + 1 < line.size() && (isWordChar(line[i + 1]) || line[i + 1] == '{')) {
        std::size_t e = i + 1;
        if (line[e] == '{') { e = line.find('}', e); e = e == std::string_view::npos ? line.size() : e + 1; }
        else while (e < line.size() && isWordChar(line[e])) e++;
        span(out, "v", line.substr(i, e - i));
        i = e;
        continue;
      }
      if (c == ' ' || c == '\t') { out += c; i++; continue; }
      if (c == '|' || c == ';' || c == '&') { out += escapeHtml(std::string_view(&line[i], 1)); i++; cmd = true; continue; }
      std::size_t e = i;
      while (e < line.size() && line[e] != ' ' && line[e] != '\t' && line[e] != '|' && line[e] != ';' && line[e] != '"' && line[e] != '\'') e++;
      const std::string_view w = line.substr(i, e - i);
      const bool assign = w.find('=') != std::string_view::npos && w[0] != '-';
      if (cmd && !assign) { span(out, "f", w); cmd = false; }
      else if (w[0] == '-') span(out, "v", w);
      else out += escapeHtml(w);
      i = e;
    }
    if (nl < code.size()) out += '\n';
    p = nl + 1;
  }
  return out;
}

// JSON and C-like code: strings, numbers, comments, a keyword table.
std::string table(std::string_view code, bool json) {
  static const std::set<std::string_view> ckw = {"if", "else", "for", "while", "do", "return", "break", "continue", "switch", "case", "default", "struct",
                                                 "class", "enum", "union", "typedef", "const", "static", "extern", "inline", "void", "int", "char", "float",
                                                 "double", "long", "short", "unsigned", "signed", "bool", "auto", "namespace", "using", "template", "typename",
                                                 "public", "private", "protected", "virtual", "override", "true", "false", "nullptr", "NULL", "new", "delete",
                                                 "sizeof", "constexpr", "uint8_t", "uint16_t", "uint32_t", "uint64_t", "int32_t", "int64_t", "size_t", "goto",
                                                 "uniform", "attribute", "varying", "in", "out", "precision", "highp", "mediump", "lowp", "vec2", "vec3", "vec4", "mat4"};
  std::string out;
  std::size_t i = 0;
  bool lineStart = true;
  while (i < code.size()) {
    const char c = code[i];
    if (!json && c == '#' && lineStart) { std::size_t e = code.find('\n', i); e = e == std::string_view::npos ? code.size() : e; span(out, "k", code.substr(i, e - i)); i = e; continue; }
    if (c == '/' && i + 1 < code.size() && (code[i + 1] == '/' || code[i + 1] == '*')) {
      std::size_t e = code[i + 1] == '/' ? code.find('\n', i) : code.find("*/", i + 2);
      e = e == std::string_view::npos ? code.size() : code[i + 1] == '/' ? e : e + 2;
      span(out, "c", code.substr(i, e - i));
      i = e;
      continue;
    }
    if (c == '"' || (!json && c == '\'')) {
      std::size_t e = i + 1;
      while (e < code.size() && code[e] != c && code[e] != '\n') e += code[e] == '\\' ? 2 : 1;
      e = std::min(code.size(), e + 1);
      std::size_t k = e;
      while (k < code.size() && (code[k] == ' ' || code[k] == '\t')) k++;
      span(out, json && k < code.size() && code[k] == ':' ? "p" : "s", code.substr(i, e - i));
      i = e;
      lineStart = false;
      continue;
    }
    if (std::isdigit(static_cast<unsigned char>(c)) || (c == '-' && json && i + 1 < code.size() && std::isdigit(static_cast<unsigned char>(code[i + 1])))) {
      std::size_t e = i + 1;
      while (e < code.size() && (isWordChar(code[e]) || code[e] == '.')) e++;
      span(out, "n", code.substr(i, e - i));
      i = e;
      lineStart = false;
      continue;
    }
    if (isWordChar(c)) {
      std::size_t e = i;
      while (e < code.size() && isWordChar(code[e])) e++;
      const std::string_view w = code.substr(i, e - i);
      std::size_t k = e;
      while (k < code.size() && code[k] == ' ') k++;
      if (json ? (w == "true" || w == "false" || w == "null") : ckw.count(w) > 0) span(out, json ? "n" : "k", w);
      else if (!json && k < code.size() && code[k] == '(') span(out, "f", w);
      else if (!json && std::isupper(static_cast<unsigned char>(w[0]))) span(out, "t", w);
      else out += escapeHtml(w);
      i = e;
      lineStart = false;
      continue;
    }
    if (c == '\n') lineStart = true;
    else if (c != ' ' && c != '\t') lineStart = false;
    out += escapeHtml(code.substr(i, 1));
    i++;
  }
  return out;
}

}  // namespace

std::string escapeHtml(std::string_view s) {
  std::string out;
  out.reserve(s.size());
  for (char c : s) {
    switch (c) {
      case '&': out += "&amp;"; break;
      case '<': out += "&lt;"; break;
      case '>': out += "&gt;"; break;
      case '"': out += "&quot;"; break;
      default: out += c;
    }
  }
  return out;
}

std::string highlight(std::string_view code, std::string_view lang, const std::function<std::string(std::string_view)>& typeLink) {
  static const std::set<std::string_view> tsl = {"ts", "typescript", "js", "javascript", "mjs", "cjs", "zinc"};
  static const std::set<std::string_view> tsxl = {"tsx", "jsx"};
  static const std::set<std::string_view> shl = {"sh", "bash", "shell", "console", "zsh", "terminal", "shellsession", "fish", "powershell", "ps1"};
  static const std::set<std::string_view> jsonl = {"json", "jsonc", "json5"};
  static const std::set<std::string_view> cl = {"c", "cpp", "c++", "cc", "h", "hpp", "objc", "objective-c", "glsl", "java", "kotlin", "swift", "rust", "go", "cmake"};
  if (tsl.count(lang)) return ts(code, false, typeLink);
  if (tsxl.count(lang)) return ts(code, true, typeLink);
  if (shl.count(lang)) return shell(code);
  if (jsonl.count(lang)) return table(code, true);
  if (cl.count(lang)) return table(code, false);
  return escapeHtml(code);
}

}  // namespace zn::doc
