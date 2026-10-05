#include "frontend/parser.h"

#include <cstring>

#include "frontend/lexer.h"

namespace zn::frontend {
namespace {

struct Stop {};  // thrown after recording the first diagnostic

struct Parser {
  std::string_view s;
  std::vector<Token> t;
  std::size_t i = 0;
  ParseResult r;

  // ---- tokens
  const Token& cur() const { return t[i]; }
  const Token& at(std::size_t k) const { return t[std::min(i + k, t.size() - 1)]; }
  std::string_view txt(const Token& k) const { return s.substr(k.start, k.end - k.start); }
  std::string_view txt() const { return txt(cur()); }
  bool isP(std::string_view p, std::size_t k = 0) const { return at(k).kind == Tok::Punct && txt(at(k)) == p; }
  bool isKw(std::string_view w) const { return cur().kind == Tok::Keyword && txt() == w; }
  bool isId(std::string_view w, std::size_t k = 0) const { return at(k).kind == Tok::Ident && txt(at(k)) == w; }
  bool eof() const { return cur().kind == Tok::Eof; }
  bool newlineBefore() const {
    return i > 0 && s.substr(t[i - 1].end, cur().start - t[i - 1].end).find('\n') != std::string_view::npos;
  }

  [[noreturn]] void fail(const char* code, std::uint32_t pos, std::string msg) {
    r.diags.push_back({code, pos, std::move(msg)});
    throw Stop{};
  }
  [[noreturn]] void unexpected() {
    if (cur().kind == Tok::Error) fail(kZBadLiteral, cur().start, "invalid or unterminated token");
    fail(kZUnexpectedToken, cur().start, eof() ? "unexpected end of input" : "unexpected '" + std::string(txt()) + "'");
  }
  [[noreturn]] void unsupported(const char* what) { fail(kZUnsupported, cur().start, std::string(what) + " is not supported yet"); }

  void expectP(std::string_view p) {
    if (!isP(p)) fail(kZExpected, cur().start, "expected '" + std::string(p) + "'");
    ++i;
  }
  bool eatP(std::string_view p) { if (isP(p)) { ++i; return true; } return false; }
  void semi() {
    if (eatP(";")) return;
    if (isP("}") || eof() || newlineBefore()) return;
    fail(kZExpected, cur().start, "expected ';'");
  }

  // ---- nodes
  std::uint32_t mk(N k, std::uint32_t start, std::uint32_t end, std::string_view text = {}, std::vector<std::uint32_t> kids = {}) {
    r.ast.nodes.push_back({k, start, end, text, std::move(kids)});
    return static_cast<std::uint32_t>(r.ast.nodes.size() - 1);
  }
  std::uint32_t prevEnd() const { return t[i - 1].end; }
  std::uint32_t startOf(std::uint32_t n) const { return r.ast.nodes[n].start; }
  std::uint32_t endOf(std::uint32_t n) const { return r.ast.nodes[n].end; }

  // ---- types
  std::size_t matchingParen(std::size_t k) const {  // index of the `)` matching the `(` at i+k
    int d = 0;
    for (std::size_t j = i + k; j < t.size(); ++j) {
      if (t[j].kind == Tok::Punct) {
        if (txt(t[j]) == "(") ++d;
        else if (txt(t[j]) == ")" && --d == 0) return j;
      }
    }
    return t.size() - 1;
  }

  std::uint32_t param(bool inType) {
    std::uint32_t st = cur().start;
    bool rest = eatP("...");
    if ((isId("public") || isId("private") || isId("protected") || isId("readonly")) && at(1).kind == Tok::Ident)
      unsupported("parameter properties");
    if (cur().kind != Tok::Ident && !(inType && cur().kind == Tok::Keyword && isKw("this"))) {
      if (isP("{") || isP("[")) unsupported("destructuring parameters");
      unexpected();
    }
    std::string_view name = txt();
    if (rest) name = s.substr(st, cur().end - st);
    ++i;
    if (eatP("?")) {}
    std::uint32_t ty = kNone, def = kNone;
    if (eatP(":")) ty = type();
    if (!inType && eatP("=")) def = assignment();
    return mk(N::Param, st, prevEnd(), name, {ty, def});
  }

  std::vector<std::uint32_t> params(bool inType) {
    std::vector<std::uint32_t> ps;
    expectP("(");
    while (!isP(")")) {
      ps.push_back(param(inType));
      if (!eatP(",")) break;
    }
    expectP(")");
    return ps;
  }

  std::uint32_t type() {
    std::uint32_t st = cur().start;
    eatP("|");
    std::uint32_t first = typePostfix();
    if (!isP("|")) return first;
    std::vector<std::uint32_t> ms{first};
    while (eatP("|")) ms.push_back(typePostfix());
    return mk(N::TypeUnion, st, prevEnd(), {}, std::move(ms));
  }

  std::uint32_t typePostfix() {
    std::uint32_t st = cur().start;
    std::uint32_t ty = typePrimary();
    while (isP("[") && isP("]", 1)) { i += 2; ty = mk(N::TypeArray, st, prevEnd(), {}, {ty}); }
    return ty;
  }

  std::uint32_t typePrimary() {
    std::uint32_t st = cur().start;
    Tok k = cur().kind;
    if (k == Tok::Ident || isKw("void") || isKw("null") || isKw("this")) {
      ++i;
      while (isP(".") && at(1).kind == Tok::Ident) i += 2;
      std::string_view name = s.substr(st, prevEnd() - st);
      std::vector<std::uint32_t> args;
      if (isP("<")) {
        ++i;
        while (!isP(">")) { args.push_back(type()); if (!eatP(",")) break; }
        expectP(">");
      }
      return mk(N::TypeRef, st, prevEnd(), name, std::move(args));
    }
    if (k == Tok::Number || k == Tok::String || isKw("true") || isKw("false")) { ++i; return mk(N::TypeLit, st, prevEnd(), s.substr(st, prevEnd() - st)); }
    if (isP("(")) {
      std::size_t close = matchingParen(0);
      if (close + 1 < t.size() && t[close + 1].kind == Tok::Punct && txt(t[close + 1]) == "=>") {
        auto ps = params(true);
        expectP("=>");
        std::uint32_t ret = type();
        std::vector<std::uint32_t> kids{ret};
        kids.insert(kids.end(), ps.begin(), ps.end());
        return mk(N::TypeFunc, st, prevEnd(), {}, std::move(kids));
      }
      ++i;
      std::uint32_t inner = type();
      expectP(")");
      return inner;
    }
    if (isP("[")) {
      ++i;
      std::vector<std::uint32_t> es;
      while (!isP("]")) { es.push_back(type()); if (!eatP(",")) break; }
      expectP("]");
      return mk(N::TypeTuple, st, prevEnd(), {}, std::move(es));
    }
    if (isP("{")) unsupported("object types");
    unexpected();
  }

  // ---- expressions
  struct Op { std::string_view text; std::size_t ntoks; };

  // `>` is a single token from the lexer; glue adjacent `>`, `>`, `>`, `=` into >>, >>>, >=, >>=, >>>=.
  Op operatorAt() const {
    const Token& k = cur();
    if (k.kind == Tok::Keyword && (txt() == "instanceof" || txt() == "in")) return {txt(), 1};
    if (k.kind != Tok::Punct) return {{}, 0};
    if (txt() != ">") return {txt(), 1};
    std::size_t n = 1;
    while (n < 3 && at(n).kind == Tok::Punct && txt(at(n)) == ">" && at(n).start == at(n - 1).end) ++n;
    if (at(n).kind == Tok::Punct && txt(at(n)) == "=" && at(n).start == at(n - 1).end) ++n;
    return {s.substr(k.start, at(n - 1).end - k.start), n};
  }

  static int precedence(std::string_view o) {
    if (o == "??") return 1;
    if (o == "||") return 2;
    if (o == "&&") return 3;
    if (o == "|") return 4;
    if (o == "^") return 5;
    if (o == "&") return 6;
    if (o == "==" || o == "!=" || o == "===" || o == "!==") return 7;
    if (o == "<" || o == ">" || o == "<=" || o == ">=" || o == "instanceof" || o == "in") return 8;
    if (o == "<<" || o == ">>" || o == ">>>") return 9;
    if (o == "+" || o == "-") return 10;
    if (o == "*" || o == "/" || o == "%") return 11;
    if (o == "**") return 12;
    return 0;
  }
  static bool isAssignOp(std::string_view o) {
    static const char* ops[] = {"=", "+=", "-=", "*=", "/=", "%=", "**=", "<<=", ">>=", ">>>=", "&=", "|=", "^=", "&&=", "||=", "?\?="};
    for (auto p : ops) if (o == p) return true;
    return false;
  }

  std::uint32_t expression() {
    std::uint32_t e = assignment();
    while (isP(",")) {
      ++i;
      std::uint32_t rhs = assignment();
      e = mk(N::Binary, startOf(e), endOf(rhs), ",", {e, rhs});
    }
    return e;
  }

  std::uint32_t assignment() {
    std::uint32_t lhs = conditional();
    Op op = operatorAt();
    if (op.ntoks && isAssignOp(op.text)) {
      N k = r.ast.nodes[lhs].kind;
      if (k != N::Ident && k != N::Member && k != N::Index) fail(kZBadAssignTarget, startOf(lhs), "invalid assignment target");
      i += op.ntoks;
      std::uint32_t rhs = assignment();
      return mk(N::Assign, startOf(lhs), endOf(rhs), op.text, {lhs, rhs});
    }
    return lhs;
  }

  std::uint32_t conditional() {
    std::uint32_t c = binary(1);
    if (!isP("?")) return c;
    ++i;
    std::uint32_t a = assignment();
    expectP(":");
    std::uint32_t b = assignment();
    return mk(N::Cond, startOf(c), endOf(b), {}, {c, a, b});
  }

  std::uint32_t binary(int minPrec) {
    std::uint32_t lhs = unary();
    for (;;) {
      Op op = operatorAt();
      int p = op.ntoks ? precedence(op.text) : 0;
      if (p == 0 || p < minPrec) return lhs;
      i += op.ntoks;
      std::uint32_t rhs = binary(op.text == "**" ? p : p + 1);
      lhs = mk(N::Binary, startOf(lhs), endOf(rhs), op.text, {lhs, rhs});
    }
  }

  std::uint32_t unary() {
    std::uint32_t st = cur().start;
    if (cur().kind == Tok::Punct && (isP("!") || isP("~") || isP("+") || isP("-"))) {
      std::string_view op = txt(); ++i;
      std::uint32_t e = unary();
      return mk(N::Unary, st, endOf(e), op, {e});
    }
    if (isP("++") || isP("--")) {
      std::string_view op = txt(); ++i;
      std::uint32_t e = unary();
      return mk(N::UpdatePre, st, endOf(e), op, {e});
    }
    if (isKw("typeof") || isKw("void") || isKw("delete")) {
      std::string_view op = txt(); ++i;
      std::uint32_t e = unary();
      return mk(N::Unary, st, endOf(e), op, {e});
    }
    return postfix();
  }

  std::vector<std::uint32_t> arguments() {
    std::vector<std::uint32_t> as;
    expectP("(");
    while (!isP(")")) {
      if (isP("...")) {
        std::uint32_t st = cur().start; ++i;
        std::uint32_t e = assignment();
        as.push_back(mk(N::Spread, st, endOf(e), {}, {e}));
      } else as.push_back(assignment());
      if (!eatP(",")) break;
    }
    expectP(")");
    return as;
  }

  std::uint32_t postfix() {
    std::uint32_t e = isKw("new") ? newExpr() : primary();
    for (;;) {
      if (isP(".") || isP("?.")) {
        bool opt = isP("?.");
        if (opt && (isP("[", 1) || isP("(", 1))) {
          ++i;
          if (isP("[")) { ++i; std::uint32_t ix = expression(); expectP("]"); e = mk(N::Index, startOf(e), prevEnd(), {}, {e, ix}); }
          else { auto as = arguments(); as.insert(as.begin(), e); e = mk(N::Call, startOf(e), prevEnd(), {}, std::move(as)); }
          continue;
        }
        std::uint32_t opStart = cur().start;
        ++i;
        if (cur().kind != Tok::Ident && cur().kind != Tok::Keyword && cur().kind != Tok::PrivateName) unexpected();
        std::string_view name = opt ? s.substr(opStart, cur().end - opStart) : txt();
        if (opt) { /* text keeps the "?." prefix so the checker can tell */ }
        ++i;
        e = mk(N::Member, startOf(e), prevEnd(), name, {e});
      } else if (isP("[")) {
        ++i;
        std::uint32_t ix = expression();
        expectP("]");
        e = mk(N::Index, startOf(e), prevEnd(), {}, {e, ix});
      } else if (isP("(")) {
        auto as = arguments();
        as.insert(as.begin(), e);
        e = mk(N::Call, startOf(e), prevEnd(), {}, std::move(as));
      } else if ((isP("++") || isP("--")) && !newlineBefore()) {
        std::string_view op = txt(); ++i;
        e = mk(N::UpdatePost, startOf(e), prevEnd(), op, {e});
      } else if (isP("!") && !newlineBefore()) {
        unsupported("non-null assertions");
      } else if (cur().kind == Tok::TemplateNoSub || cur().kind == Tok::TemplateHead) {
        unsupported("tagged templates");
      } else return e;
    }
  }

  std::uint32_t newExpr() {
    std::uint32_t st = cur().start;
    ++i;  // new
    std::uint32_t callee = isKw("new") ? newExpr() : primary();
    while (isP(".") && (at(1).kind == Tok::Ident || at(1).kind == Tok::Keyword)) {
      ++i;
      std::string_view name = txt(); ++i;
      callee = mk(N::Member, startOf(callee), prevEnd(), name, {callee});
    }
    if (isP("<")) unsupported("explicit type arguments");
    std::vector<std::uint32_t> kids{callee};
    if (isP("(")) { auto as = arguments(); kids.insert(kids.end(), as.begin(), as.end()); }
    return mk(N::New, st, prevEnd(), {}, std::move(kids));
  }

  std::uint32_t primary() {
    const Token& k = cur();
    std::uint32_t st = k.start;
    switch (k.kind) {
      case Tok::Number: ++i; return mk(N::Number, st, prevEnd(), txt(t[i - 1]));
      case Tok::BigInt: ++i; return mk(N::BigInt, st, prevEnd(), txt(t[i - 1]));
      case Tok::String: ++i; return mk(N::String, st, prevEnd(), txt(t[i - 1]));
      case Tok::Ident:
        if (isId("async") && at(1).kind == Tok::Keyword && txt(at(1)) == "function") unsupported("async functions");
        ++i;
        if (isP("=>")) unsupported("arrow functions");
        return mk(N::Ident, st, prevEnd(), txt(t[i - 1]));
      case Tok::TemplateNoSub: ++i; return mk(N::Template, st, prevEnd());
      case Tok::TemplateHead: {
        ++i;
        std::vector<std::uint32_t> parts{expression()};
        while (cur().kind == Tok::TemplateMiddle) { ++i; parts.push_back(expression()); }
        if (cur().kind != Tok::TemplateTail) unexpected();
        ++i;
        return mk(N::Template, st, prevEnd(), {}, std::move(parts));
      }
      case Tok::Keyword:
        if (isKw("this")) { ++i; return mk(N::This, st, prevEnd()); }
        if (isKw("true") || isKw("false") || isKw("null")) { ++i; return mk(N::Literal, st, prevEnd(), txt(t[i - 1])); }
        if (isKw("function") || isKw("class")) unsupported("function and class expressions");
        unexpected();
      case Tok::Punct:
        if (isP("(")) {
          std::size_t after = std::min(matchingParen(0) + 1, t.size() - 1);
          if (t[after].kind == Tok::Punct && txt(t[after]) == "=>") unsupported("arrow functions");
          ++i;
          std::uint32_t e = expression();
          expectP(")");
          return e;
        }
        if (isP("[")) {
          ++i;
          std::vector<std::uint32_t> es;
          while (!isP("]")) {
            if (isP("...")) {
              std::uint32_t ss = cur().start; ++i;
              std::uint32_t e = assignment();
              es.push_back(mk(N::Spread, ss, endOf(e), {}, {e}));
            } else es.push_back(assignment());
            if (!eatP(",")) break;
          }
          expectP("]");
          return mk(N::Array, st, prevEnd(), {}, std::move(es));
        }
        if (isP("{")) unsupported("object literals");
        unexpected();
      default: unexpected();
    }
  }

  // ---- statements
  std::uint32_t block() {
    std::uint32_t st = cur().start;
    expectP("{");
    std::vector<std::uint32_t> ss;
    while (!isP("}")) { if (eof()) unexpected(); ss.push_back(statement()); }
    ++i;
    return mk(N::Block, st, prevEnd(), {}, std::move(ss));
  }

  bool atLetDecl() const { return isId("let") && (at(1).kind == Tok::Ident || isP("[", 1) || isP("{", 1)); }
  bool atVarDecl() const { return isKw("const") || isKw("var") || atLetDecl(); }

  std::uint32_t declarator() {
    std::uint32_t st = cur().start;
    if (cur().kind != Tok::Ident) { if (isP("[") || isP("{")) unsupported("destructuring"); unexpected(); }
    std::string_view name = txt(); ++i;
    std::uint32_t ty = kNone, init = kNone;
    if (eatP(":")) ty = type();
    if (eatP("=")) init = assignment();
    return mk(N::Declarator, st, prevEnd(), name, {ty, init});
  }

  std::uint32_t varDecl(bool needSemi) {
    std::uint32_t st = cur().start;
    std::string_view kind = txt(); ++i;
    std::vector<std::uint32_t> ds{declarator()};
    while (eatP(",")) ds.push_back(declarator());
    if (needSemi) semi();
    return mk(N::VarDecl, st, prevEnd(), kind, std::move(ds));
  }

  std::uint32_t function() {
    std::uint32_t st = cur().start;
    ++i;  // function
    if (isP("*")) unsupported("generators");
    if (cur().kind != Tok::Ident) unexpected();
    std::string_view name = txt(); ++i;
    if (isP("<")) unsupported("generics");
    auto ps = params(false);
    std::uint32_t ret = kNone;
    if (eatP(":")) ret = type();
    std::uint32_t body = isP("{") ? block() : (semi(), kNone);
    std::vector<std::uint32_t> kids{ret, body};
    kids.insert(kids.end(), ps.begin(), ps.end());
    return mk(N::Function, st, prevEnd(), name, std::move(kids));
  }

  std::uint32_t classDecl() {
    std::uint32_t st = cur().start;
    ++i;  // class
    if (cur().kind != Tok::Ident) unexpected();
    std::string_view name = txt(); ++i;
    if (isP("<")) unsupported("generics");
    if (isKw("extends") || isId("implements")) unsupported("inheritance");
    expectP("{");
    std::vector<std::uint32_t> members;
    while (!isP("}")) {
      if (eof()) unexpected();
      if (eatP(";")) continue;
      std::uint32_t ms = cur().start;
      if (isId("public") || isId("private") || isId("protected") || isId("static") || isId("readonly") || isId("declare") ||
          isId("override") || isId("abstract") || isId("get") || isId("set") || isId("async") || isP("*") || isP("["))
        if (!(isP(":", 1) || isP("=", 1) || isP("(", 1) || isP(";", 1)))
          unsupported("member modifiers, accessors and computed names");
      if (cur().kind != Tok::Ident && cur().kind != Tok::Keyword && cur().kind != Tok::String) unexpected();
      std::string_view mname = txt(); ++i;
      if (isP("(") || isP("<")) {
        if (isP("<")) unsupported("generics");
        auto ps = params(false);
        std::uint32_t ret = kNone;
        if (eatP(":")) ret = type();
        std::uint32_t body = block();
        std::vector<std::uint32_t> kids{ret, body};
        kids.insert(kids.end(), ps.begin(), ps.end());
        members.push_back(mk(N::Method, ms, prevEnd(), mname, std::move(kids)));
      } else {
        eatP("?");
        std::uint32_t ty = kNone, init = kNone;
        if (eatP(":")) ty = type();
        if (eatP("=")) init = assignment();
        semi();
        members.push_back(mk(N::Field, ms, prevEnd(), mname, {ty, init}));
      }
    }
    ++i;
    return mk(N::Class, st, prevEnd(), name, std::move(members));
  }

  std::uint32_t forStmt() {
    std::uint32_t st = cur().start;
    ++i;  // for
    if (isId("await")) unsupported("for await");
    expectP("(");
    if (atVarDecl() && at(1).kind == Tok::Ident && (isId("of", 2) || (at(2).kind == Tok::Keyword && txt(at(2)) == "in"))) {
      std::string_view kind = txt(); ++i;
      std::uint32_t ds = cur().start;
      std::string_view name = txt(); ++i;
      std::uint32_t d = mk(N::Declarator, ds, prevEnd(), name, {kNone, kNone});
      bool isOf = isId("of");
      ++i;
      std::uint32_t it = isOf ? assignment() : expression();
      expectP(")");
      std::uint32_t body = statement();
      return mk(isOf ? N::ForOf : N::ForIn, st, prevEnd(), kind, {d, it, body});
    }
    std::uint32_t init = kNone, test = kNone, update = kNone;
    if (!isP(";")) init = atVarDecl() ? varDecl(false) : expression();
    expectP(";");
    if (!isP(";")) test = expression();
    expectP(";");
    if (!isP(")")) update = expression();
    expectP(")");
    std::uint32_t body = statement();
    return mk(N::For, st, prevEnd(), {}, {init, test, update, body});
  }

  std::uint32_t statement() {
    std::uint32_t st = cur().start;
    if (isP("{")) return block();
    if (isP(";")) { ++i; return mk(N::Empty, st, prevEnd()); }
    if (atVarDecl()) return varDecl(true);
    if (isKw("function")) return function();
    if (isKw("class")) return classDecl();
    if (isKw("if")) {
      ++i; expectP("(");
      std::uint32_t test = expression();
      expectP(")");
      std::uint32_t th = statement(), el = kNone;
      if (isKw("else")) { ++i; el = statement(); }
      return mk(N::If, st, prevEnd(), {}, {test, th, el});
    }
    if (isKw("for")) return forStmt();
    if (isKw("while")) {
      ++i; expectP("(");
      std::uint32_t test = expression();
      expectP(")");
      std::uint32_t body = statement();
      return mk(N::While, st, prevEnd(), {}, {test, body});
    }
    if (isKw("do")) {
      ++i;
      std::uint32_t body = statement();
      if (!isKw("while")) fail(kZExpected, cur().start, "expected 'while'");
      ++i; expectP("(");
      std::uint32_t test = expression();
      expectP(")");
      eatP(";");
      return mk(N::DoWhile, st, prevEnd(), {}, {body, test});
    }
    if (isKw("return")) {
      ++i;
      std::uint32_t e = (isP(";") || isP("}") || eof() || newlineBefore()) ? kNone : expression();
      semi();
      return mk(N::Return, st, prevEnd(), {}, {e});
    }
    if (isKw("break") || isKw("continue")) {
      bool brk = isKw("break");
      ++i;
      if (cur().kind == Tok::Ident && !newlineBefore()) unsupported("labels");
      semi();
      return mk(brk ? N::Break : N::Continue, st, prevEnd());
    }
    if (isKw("import") || isKw("export")) unsupported("modules");
    if (isKw("switch") || isKw("try") || isKw("throw")) unsupported("switch, try and throw");
    if (isId("type") && at(1).kind == Tok::Ident) unsupported("type aliases");
    if (isId("interface")) unsupported("interfaces");
    if (isKw("enum")) unsupported("enums");
    std::uint32_t e = expression();
    semi();
    return mk(N::ExprStmt, st, prevEnd(), {}, {e});
  }

  void run() {
    std::uint32_t st = cur().start;
    std::vector<std::uint32_t> ss;
    while (!eof()) ss.push_back(statement());
    r.ast.root = mk(N::Program, st, cur().end, {}, std::move(ss));
  }
};

const char* kindName(N k) {
  static const char* names[] = {"Program", "Block", "Empty", "VarDecl", "Declarator", "Function", "Param", "Class",
      "Field", "Method", "If", "For", "ForOf", "ForIn", "While", "DoWhile", "Return", "Break", "Continue", "ExprStmt",
      "Ident", "Number", "BigInt", "String", "Template", "Literal", "This", "Array", "Spread", "Binary", "Unary",
      "UpdatePre", "UpdatePost", "Assign", "Cond", "Call", "New", "Member", "Index", "TypeRef", "TypeArray",
      "TypeUnion", "TypeFunc", "TypeTuple", "TypeLit"};
  return names[static_cast<int>(k)];
}

void dumpNode(const Ast& a, std::uint32_t n, int depth, std::string& out) {
  out.append(static_cast<std::size_t>(depth) * 2, ' ');
  if (n == kNone) { out += "_\n"; return; }
  const Node& x = a.nodes[n];
  out += kindName(x.kind);
  if (!x.text.empty()) { out += ' '; out += x.text; }
  out += '\n';
  for (std::uint32_t k : x.kids) dumpNode(a, k, depth + 1, out);
}

}  // namespace

ParseResult parse(std::string_view src) {
  Parser p;
  p.s = src;
  p.t = lex(src, false);
  try { p.run(); } catch (const Stop&) { p.r.ast.root = kNone; }
  return std::move(p.r);
}

std::string validate(const Ast& ast) {
  for (std::size_t n = 0; n < ast.nodes.size(); ++n) {
    const Node& x = ast.nodes[n];
    for (std::uint32_t k : x.kids) {
      if (k == kNone) continue;
      if (k >= ast.nodes.size()) return "node " + std::to_string(n) + ": kid index out of range";
      const Node& c = ast.nodes[k];
      if (c.start < x.start || c.end > x.end) return std::string(kindName(x.kind)) + " at " + std::to_string(x.start) + ": child " + kindName(c.kind) + " outside its span";
    }
  }
  return "";
}

std::string dump(const Ast& ast) {
  std::string out;
  if (ast.root != kNone) dumpNode(ast, ast.root, 0, out);
  return out;
}

}  // namespace zn::frontend
