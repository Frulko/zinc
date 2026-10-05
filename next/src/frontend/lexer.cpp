#include "frontend/lexer.h"

#include <algorithm>
#include <cctype>
#include <cstring>

namespace zn::frontend {
namespace {

bool isIdStart(unsigned char c) { return std::isalpha(c) || c == '_' || c == '$' || c >= 0x80; }
bool isIdPart(unsigned char c) { return isIdStart(c) || std::isdigit(c); }

constexpr std::string_view kKeywords[] = {
    "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete", "do", "else", "enum",
    "export", "extends", "false", "finally", "for", "function", "if", "import", "in", "instanceof", "new", "null",
    "return", "super", "switch", "this", "throw", "true", "try", "typeof", "var", "void", "while", "with"};

bool isKeyword(std::string_view s) { return std::find(std::begin(kKeywords), std::end(kKeywords), s) != std::end(kKeywords); }

// Longest first. No `>`-led operators except `=>`: see Tok::Punct.
constexpr std::string_view kPuncts[] = {
    "...", "===", "!==", "**=", "<<=", "&&=", "||=", "?\?=", "=>", "==", "!=", "<=", "&&", "||", "??", "?.", "++", "--",
    "+=",  "-=",  "*=",  "/=",  "%=",  "&=",  "|=",  "^=",  "<<", "**"};

struct Scanner {
  std::string_view s{};
  bool jsx = false;
  std::uint32_t pos = 0;
  std::vector<Token> out;

  enum class Mode { Normal, JsxTag, JsxChildren } mode = Mode::Normal;
  struct Frame { char kind; int savedDepth; };  // 't' template ${, 'b' brace, 'c' jsx child {, 'a' jsx attribute {
  std::vector<Frame> frames;
  int depth = 0;           // open JSX elements in the current expression context
  bool tagClosing = false; // inside </...>

  char at(std::uint32_t i) const { return i < s.size() ? s[i] : '\0'; }
  void emit(Tok k, std::uint32_t start) { out.push_back({k, start, pos}); }

  // Whitespace and comments. Returns false on an unterminated block comment (consumed to EOF).
  static bool skipTrivia(std::string_view s, std::uint32_t& p) {
    for (;;) {
      if (p >= s.size()) return true;
      unsigned char c = s[p];
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f') { ++p; continue; }
      if (c == '/' && p + 1 < s.size() && s[p + 1] == '/') {
        while (p < s.size() && s[p] != '\n') ++p;
        continue;
      }
      if (c == '/' && p + 1 < s.size() && s[p + 1] == '*') {
        auto e = s.find("*/", p + 2);
        if (e == std::string_view::npos) { p = static_cast<std::uint32_t>(s.size()); return false; }
        p = static_cast<std::uint32_t>(e + 2);
        continue;
      }
      // non-breaking space and BOM (UTF-8)
      if (c == 0xC2 && p + 1 < s.size() && (unsigned char)s[p + 1] == 0xA0) { p += 2; continue; }
      if (c == 0xEF && p + 2 < s.size() && (unsigned char)s[p + 1] == 0xBB && (unsigned char)s[p + 2] == 0xBF) { p += 3; continue; }
      return true;
    }
  }

  // True when the previous token ends an expression, so `/` divides and `<` compares.
  bool prevEndsExpr() const {
    if (out.empty()) return false;
    const Token& t = out.back();
    std::string_view x = s.substr(t.start, t.end - t.start);
    switch (t.kind) {
      case Tok::Ident: case Tok::PrivateName: case Tok::Number: case Tok::BigInt: case Tok::String: case Tok::Regex:
      case Tok::TemplateNoSub: case Tok::TemplateTail: case Tok::JsxText:
        return true;
      case Tok::Keyword: return x == "this" || x == "super" || x == "null" || x == "true" || x == "false";
      case Tok::Punct: return x == ")" || x == "]" || x == "}" || x == "++" || x == "--";
      default: return false;
    }
  }

  void number() {
    std::uint32_t st = pos;
    bool big = false;
    if (at(pos) == '0' && std::strchr("xXbBoO", at(pos + 1)) && at(pos + 1)) {
      pos += 2;
      while (std::isalnum((unsigned char)at(pos)) || at(pos) == '_') {
        if (at(pos) == 'n') { big = true; ++pos; break; }
        ++pos;
      }
    } else {
      while (std::isdigit((unsigned char)at(pos)) || at(pos) == '_') ++pos;
      if (at(pos) == 'n') { big = true; ++pos; }
      else {
        if (at(pos) == '.') { ++pos; while (std::isdigit((unsigned char)at(pos)) || at(pos) == '_') ++pos; }
        if ((at(pos) == 'e' || at(pos) == 'E') &&
            (std::isdigit((unsigned char)at(pos + 1)) || ((at(pos + 1) == '+' || at(pos + 1) == '-') && std::isdigit((unsigned char)at(pos + 2))))) {
          pos += 2;
          while (std::isdigit((unsigned char)at(pos)) || at(pos) == '_') ++pos;
        }
      }
    }
    emit(big ? Tok::BigInt : Tok::Number, st);
  }

  void string(char q) {
    std::uint32_t st = pos++;
    for (;;) {
      char c = at(pos);
      if (pos >= s.size() || c == '\n') { emit(Tok::Error, st); return; }
      ++pos;
      if (c == '\\') { if (pos < s.size()) ++pos; }
      else if (c == q) break;
    }
    emit(Tok::String, st);
  }

  // From just after the opening backtick or `}`; `st` is where the token began.
  void templatePart(std::uint32_t st, bool first) {
    for (;;) {
      if (pos >= s.size()) { emit(Tok::Error, st); return; }
      char c = s[pos++];
      if (c == '\\') { if (pos < s.size()) ++pos; }
      else if (c == '`') { emit(first ? Tok::TemplateNoSub : Tok::TemplateTail, st); return; }
      else if (c == '$' && at(pos) == '{') {
        ++pos;
        emit(first ? Tok::TemplateHead : Tok::TemplateMiddle, st);
        frames.push_back({'t', 0});
        return;
      }
    }
  }

  void regex() {
    std::uint32_t st = pos++;
    bool cls = false;
    for (;;) {
      char c = at(pos);
      if (pos >= s.size() || c == '\n') { emit(Tok::Error, st); return; }
      ++pos;
      if (c == '\\') { if (pos < s.size()) ++pos; }
      else if (c == '[') cls = true;
      else if (c == ']') cls = false;
      else if (c == '/' && !cls) break;
    }
    while (isIdPart(at(pos))) ++pos;
    emit(Tok::Regex, st);
  }

  void punct() {
    std::uint32_t st = pos;
    for (auto p : kPuncts) {
      if (s.substr(pos, p.size()) == p && !(p == "?." && std::isdigit((unsigned char)at(pos + 2)))) { pos += p.size(); emit(Tok::Punct, st); return; }
    }
    if (std::strchr("{}()[];,<>+-*/%&|^!~?:=.@#", at(pos)) && at(pos)) { ++pos; emit(Tok::Punct, st); return; }
    ++pos;
    emit(Tok::Error, st);
  }

  void closeBrace() {
    std::uint32_t st = pos;
    Frame f = frames.empty() ? Frame{'b', 0} : frames.back();
    if (!frames.empty()) frames.pop_back();
    ++pos;
    if (f.kind == 't') { templatePart(st, false); return; }
    emit(Tok::Punct, st);
    if (f.kind == 'c') { depth = f.savedDepth; mode = Mode::JsxChildren; }
    else if (f.kind == 'a') { depth = f.savedDepth; mode = Mode::JsxTag; }
  }

  void openBrace(char kind) {
    std::uint32_t st = pos++;
    emit(Tok::Punct, st);
    frames.push_back({kind, depth});
    if (kind != 'b') { depth = 0; mode = Mode::Normal; }
  }

  void normal() {
    unsigned char c = s[pos];
    std::uint32_t st = pos;
    if (isIdStart(c) || c == '\\') {
      while (isIdPart(at(pos)) || at(pos) == '\\') ++pos;
      emit(isKeyword(s.substr(st, pos - st)) ? Tok::Keyword : Tok::Ident, st);
    } else if (c == '#' && isIdStart(at(pos + 1))) {
      ++pos;
      while (isIdPart(at(pos))) ++pos;
      emit(Tok::PrivateName, st);
    } else if (std::isdigit(c) || (c == '.' && std::isdigit((unsigned char)at(pos + 1)))) number();
    else if (c == '"' || c == '\'') string(c);
    else if (c == '`') { ++pos; templatePart(st, true); }
    else if (c == '/' && !prevEndsExpr()) regex();
    else if (c == '{') openBrace(mode == Mode::JsxTag ? 'a' : 'b');
    else if (c == '}') closeBrace();
    else if (jsx && c == '<' && !prevEndsExpr() && (isIdStart((unsigned char)at(pos + 1)) || at(pos + 1) == '>' || at(pos + 1) == '/')) {
      ++pos;
      tagClosing = at(pos) == '/';
      if (tagClosing) ++pos;
      emit(Tok::Punct, st);
      mode = Mode::JsxTag;
    } else punct();
  }

  void jsxTag() {
    unsigned char c = s[pos];
    std::uint32_t st = pos;
    if (c == '{') { openBrace('a'); return; }
    if (c == '>' ) {
      ++pos;
      emit(Tok::Punct, st);
      if (tagClosing) --depth; else ++depth;
      tagClosing = false;
      mode = depth > 0 ? Mode::JsxChildren : Mode::Normal;
    } else if (c == '/' && at(pos + 1) == '>') {
      pos += 2;
      emit(Tok::Punct, st);
      mode = depth > 0 ? Mode::JsxChildren : Mode::Normal;
    } else if (c == '"' || c == '\'') {  // attribute strings: no escapes, may span lines
      ++pos;
      while (pos < s.size() && s[pos] != static_cast<char>(c)) ++pos;
      if (pos >= s.size()) { emit(Tok::Error, st); return; }
      ++pos;
      emit(Tok::String, st);
    } else if (isIdStart(c)) {  // names may contain - : .
      while (isIdPart(at(pos)) || at(pos) == '-' || at(pos) == ':' || at(pos) == '.') ++pos;
      emit(Tok::Ident, st);
    } else if (c == '=') { ++pos; emit(Tok::Punct, st); }
    else punct();
  }

  void jsxChildren() {
    std::uint32_t st = pos;
    while (pos < s.size() && s[pos] != '<' && s[pos] != '{') ++pos;
    if (pos > st) { emit(Tok::JsxText, st); return; }
    if (s[pos] == '{') { openBrace('c'); return; }
    ++pos;  // '<'
    tagClosing = at(pos) == '/';
    if (tagClosing) ++pos;
    emit(Tok::Punct, st);
    mode = Mode::JsxTag;
  }

  void run() {
    if (s.substr(0, 2) == "#!") { while (pos < s.size() && s[pos] != '\n') ++pos; }
    for (;;) {
      if (mode != Mode::JsxChildren) {
        std::uint32_t st = pos;
        if (!skipTrivia(s, pos)) { emit(Tok::Error, st); }
      }
      if (pos >= s.size()) break;
      switch (mode) {
        case Mode::Normal: normal(); break;
        case Mode::JsxTag: jsxTag(); break;
        case Mode::JsxChildren: jsxChildren(); break;
      }
    }
    out.push_back({Tok::Eof, pos, pos});
  }
};

const char* kindName(Tok k) {
  static const char* names[] = {"Eof", "Error", "Ident", "PrivateName", "Keyword", "Number", "BigInt", "String",
                                "Regex", "Punct", "TemplateNoSub", "TemplateHead", "TemplateMiddle", "TemplateTail", "JsxText"};
  return names[static_cast<int>(k)];
}

}  // namespace

std::vector<Token> lex(std::string_view src, bool jsx) {
  Scanner sc;
  sc.s = src;
  sc.jsx = jsx;
  sc.run();
  return std::move(sc.out);
}

LineCol lineCol(std::string_view src, std::uint32_t offset) {
  LineCol r{1, 1};
  for (std::uint32_t i = 0; i < offset && i < src.size(); ++i) {
    if (src[i] == '\n') { ++r.line; r.col = 1; } else ++r.col;
  }
  return r;
}

std::string check(std::string_view src, const std::vector<Token>& toks) {
  std::uint32_t prevEnd = 0;
  for (const Token& t : toks) {
    LineCol lc = lineCol(src, t.start);
    std::string where = std::to_string(lc.line) + ":" + std::to_string(lc.col);
    if (t.kind == Tok::Error) return where + ": error token";
    if (t.start < prevEnd || t.end < t.start || t.end > src.size()) return where + ": token out of order or range";
    std::uint32_t p = prevEnd;
    // text inside JSX children is a token, so every gap must be pure trivia
    if (!Scanner::skipTrivia(src.substr(0, t.start), p) || p != t.start) return where + ": gap before token is not trivia";
    prevEnd = t.end;
  }
  if (toks.empty() || toks.back().kind != Tok::Eof || toks.back().end != src.size()) return "missing Eof at end of source";
  return "";
}

std::string dump(std::string_view src, const std::vector<Token>& toks) {
  std::string out;
  for (const Token& t : toks) {
    LineCol lc = lineCol(src, t.start);
    out += std::to_string(lc.line) + ":" + std::to_string(lc.col) + " " + kindName(t.kind) + " ";
    std::string_view x = src.substr(t.start, t.end - t.start);
    for (std::size_t i = 0; i < x.size() && i < 60; ++i) {
      char c = x[i];
      out += c == '\n' ? std::string("\\n") : c == '\r' ? std::string("\\r") : c == '\t' ? std::string("\\t") : std::string(1, c);
    }
    if (x.size() > 60) out += "...";
    out += '\n';
  }
  return out;
}

}  // namespace zn::frontend
