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
  bool inAsync = false, inGenerator = false;  // `await` and `yield` are operators only inside such functions (and `await` at the top of a module)
  int fnDepth = 0;
  template <class F> std::uint32_t withFn(bool async, bool gen, F&& body) {
    bool sa = inAsync, sg = inGenerator;
    inAsync = async; inGenerator = gen;
    ++fnDepth;
    struct Restore { Parser& p; bool a, g; ~Restore() { p.inAsync = a; p.inGenerator = g; --p.fnDepth; } } restore{*this, sa, sg};
    return body();
  }
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

  bool newlineAt(std::size_t k) const {  // a line break before token i+k
    return i + k > 0 && i + k < t.size() && s.substr(t[i + k - 1].end, t[i + k].start - t[i + k - 1].end).find('\n') != std::string_view::npos;
  }

  [[noreturn]] void fail(const char* code, std::uint32_t pos, std::string msg) {
    r.diags.push_back({code, pos, std::move(msg)});
    throw Stop{};
  }
  [[noreturn]] void unexpected() {
    if (cur().kind == Tok::Error) fail(kZBadLiteral, cur().start, "");
    fail(kZUnexpectedToken, cur().start, eof() ? "end of input" : "'" + std::string(txt()) + "'");
  }
  [[noreturn]] void unsupported(const char* what) { fail(kZUnsupported, cur().start, what); }

  void expectP(std::string_view p) {
    if (!isP(p)) fail(kZExpected, cur().start, "'" + std::string(p) + "'");
    ++i;
  }
  bool eatP(std::string_view p) { if (isP(p)) { ++i; return true; } return false; }
  void semi() {
    if (eatP(";")) return;
    if (isP("}") || eof() || newlineBefore()) return;
    fail(kZExpected, cur().start, "';'");
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

  // ---- binding patterns: [a, [b, c], d = 1, ...rest] (a default is an Assign node [target, value]) and {a, b: x, c: [d, e]}
  std::uint32_t bindingTarget() {
    std::uint32_t st = cur().start;
    if (isP("[")) return arrayPattern();
    if (isP("{")) return objectPattern();
    if (cur().kind != Tok::Ident) unexpected();
    std::string_view name = txt(); ++i;
    return mk(N::Ident, st, prevEnd(), name);
  }
  std::uint32_t arrayPattern() {
    std::uint32_t st = cur().start;
    ++i;  // [
    std::vector<std::uint32_t> elems;
    while (!isP("]")) {
      std::uint32_t es = cur().start;
      if (isP(",")) { elems.push_back(mk(N::Empty, es, es)); ++i; continue; }  // a hole
      if (eatP("...")) { std::uint32_t t = bindingTarget(); elems.push_back(mk(N::Spread, es, prevEnd(), {}, {t})); }
      else {
        std::uint32_t t = bindingTarget();
        if (eatP("=")) { std::uint32_t def = assignment(); t = mk(N::Assign, es, prevEnd(), "=", {t, def}); }  // `[a = 1]`: used when the element is missing or undefined
        elems.push_back(t);
      }
      if (!eatP(",")) break;
    }
    expectP("]");
    return mk(N::ArrayPattern, st, prevEnd(), {}, std::move(elems));
  }
  std::uint32_t objectPattern() {
    std::uint32_t st = cur().start;
    ++i;  // {
    std::vector<std::uint32_t> props;
    while (!isP("}")) {
      std::uint32_t ps = cur().start;
      if (isP("...")) {   // `{ a, ...rest }`: the checker reports it (not typed yet)
        ++i;
        std::uint32_t t = bindingTarget();
        props.push_back(mk(N::Spread, ps, prevEnd(), {}, {t}));
        break;
      }
      if (cur().kind != Tok::Ident && cur().kind != Tok::Keyword) unexpected();
      std::string_view key = txt();
      std::uint32_t target;
      if (at(1).kind == Tok::Punct && txt(at(1)) == ":") { i += 2; target = bindingTarget(); }
      else { std::uint32_t is = cur().start; ++i; target = mk(N::Ident, is, prevEnd(), key); }  // shorthand {a}
      std::uint32_t def = kNone;
      if (eatP("=")) def = assignment();   // {z = 5}: used when the property is missing (ZN-155)
      props.push_back(mk(N::PatProp, ps, prevEnd(), key, def == kNone ? std::vector<std::uint32_t>{target} : std::vector<std::uint32_t>{target, def}));
      if (!eatP(",")) break;
    }
    expectP("}");
    return mk(N::ObjectPattern, st, prevEnd(), {}, std::move(props));
  }
  // An array literal on the left of `=` becomes an assignment pattern (targets may be members and elements).
  void toAssignPattern(std::uint32_t id) {
    Node& nd = r.ast.nodes[id];
    if (nd.kind == N::Array) {
      nd.kind = N::ArrayPattern;
      for (std::uint32_t k : std::vector<std::uint32_t>(nd.kids)) {
        N kk = r.ast.nodes[k].kind;
        if (kk == N::Array) toAssignPattern(k);
        else if (kk == N::Spread) { toAssignPattern(r.ast.nodes[k].kids[0]); }
        else if (kk == N::Assign && r.ast.nodes[k].text == "=") toAssignPattern(r.ast.nodes[k].kids[0]);  // `[a = 1] = xs`: a target with its default
        else if (kk != N::Ident && kk != N::Member && kk != N::Index && kk != N::Empty) fail(kZBadAssignTarget, r.ast.nodes[k].start, "");
      }
    } else if (nd.kind != N::Ident && nd.kind != N::Member && nd.kind != N::Index) fail(kZBadAssignTarget, nd.start, "");
  }

  std::uint32_t param(bool inType) {
    std::uint32_t st = cur().start;
    bool rest = eatP("...");
    std::uint32_t pflags = 0;  // parameter properties: constructor(private x: i32)
    while ((isId("public") || isId("private") || isId("protected") || isId("readonly")) && at(1).kind == Tok::Ident) {
      pflags |= isId("public") ? kFlagPublic : isId("private") ? kFlagPrivate : isId("protected") ? kFlagProtected : kFlagReadonly;
      ++i;
    }
    if (!inType && !rest && (isP("{") || isP("["))) {  // destructured parameter
      std::uint32_t pat = bindingTarget();
      std::uint32_t ty2 = kNone;
      if (eatP(":")) ty2 = type();
      std::uint32_t def = eatP("=") ? assignment() : kNone;   // `{ a }: T = {...}`: the checker reports it (not lowered yet)
      return mk(N::Param, st, prevEnd(), {}, {ty2, def, pat});
    }
    if (cur().kind != Tok::Ident && !(inType && cur().kind == Tok::Keyword && isKw("this"))) unexpected();
    std::string_view name = txt();
    ++i;
    bool optional = eatP("?");
    std::uint32_t ty = kNone, def = kNone;
    if (eatP(":")) ty = type();
    if (!inType && eatP("=")) {
      def = assignment();
      if (ty == kNone) {  // `b = 2`, `name = 'q'`, `on = false`: the type of a literal default
        const Node& dn = r.ast.nodes[def];
        const char* lit = dn.kind == N::Number ? "number" : dn.kind == N::String ? "string" : (dn.kind == N::Literal && (dn.text == "true" || dn.text == "false")) ? "boolean" : nullptr;
        if (lit) ty = mk(N::TypeRef, dn.start, dn.end, lit, {});
      }
    }
    if (optional && ty != kNone) {  // `x?: T` is `x: T | null = null`
      std::uint32_t nul = mk(N::TypeRef, startOf(ty), prevEnd(), "null");
      r.ast.nodes[nul].flags |= kFlagUndefined;  // `x?: T` is `T | undefined`
      ty = mk(N::TypeUnion, startOf(ty), prevEnd(), {}, {ty, nul});  // spans the written type, so a type stripper finds its colon
      if (!inType && def == kNone) def = mk(N::Literal, st, prevEnd(), "null");
    }
    std::uint32_t id = mk(N::Param, st, prevEnd(), name, {ty, def});
    r.ast.nodes[id].flags = pflags | (optional ? kFlagOptional : 0) | (rest ? kFlagRest : 0);  // `x?: T`: left out is null (a function type counts its required parameters from it)
    return id;
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

  // TypeScript's type grammar, whole: what the checker does not type yet is a TypeOther node it reports, so that the QuickJS engine can erase
  // any type a library writes (`T & U`, `T extends U ? A : B`, `{ [K in keyof T]: V }`, `T['k']`, `[a: A, ...B]`, `` `#${string}` ``)
  std::uint32_t other(std::uint32_t st, const char* what, std::vector<std::uint32_t> kids = {}) { return mk(N::TypeOther, st, prevEnd(), what, std::move(kids)); }
  bool noConditional = false;  // in the `extends` clause of a conditional type, `extends` is not another conditional (TypeScript's rule)

  std::uint32_t type() {
    std::uint32_t st = cur().start;
    if (isId("asserts") && (at(1).kind == Tok::Ident || at(1).kind == Tok::Keyword) && !newlineAt(1)) {   // `asserts x` and `asserts x is T`: a function that returns or throws
      i += 2;
      if (isId("is")) { ++i; type(); }
      return mk(N::TypeRef, st, prevEnd(), "void", {});
    }
    if ((cur().kind == Tok::Ident || isKw("this")) && isId("is", 1) && !newlineAt(1)) {  // a type predicate `x is T` is a boolean (its narrowing is not tracked)
      i += 2;
      type();
      return mk(N::TypeRef, st, prevEnd(), "boolean", {});
    }
    if (isP("<")) {   // `<T>(x: T) => T`: a generic function type
      typeParams();
      if (!isP("(")) unexpected();
      std::uint32_t f = typePrimary();
      return other(st, "generic function", {f});
    }
    if (isKw("new") || (isId("abstract") && at(1).kind == Tok::Keyword && txt(at(1)) == "new")) {   // `new (x: X) => T`: a constructor type
      if (isId("abstract")) ++i;
      ++i;
      if (isP("<")) typeParams();
      auto ps = params(true);
      expectP("=>");
      std::uint32_t ret = type();
      std::vector<std::uint32_t> kids{ret};
      kids.insert(kids.end(), ps.begin(), ps.end());
      return other(st, "constructor", std::move(kids));
    }
    std::uint32_t u = unionType();
    if (!noConditional && isKw("extends") && !newlineBefore()) {   // `T extends U ? A : B`
      ++i;
      bool saved = noConditional;
      noConditional = true;
      std::uint32_t ext = unionType();
      noConditional = saved;
      expectP("?");
      std::uint32_t yes = type();
      expectP(":");
      std::uint32_t no = type();
      return other(st, "conditional", {u, ext, yes, no});
    }
    return u;
  }

  std::uint32_t unionType() {
    std::uint32_t st = cur().start;
    eatP("|");
    std::uint32_t first = intersectionType();
    if (!isP("|")) return first;
    std::vector<std::uint32_t> ms{first};
    while (eatP("|")) ms.push_back(intersectionType());
    return mk(N::TypeUnion, st, prevEnd(), {}, std::move(ms));
  }

  std::uint32_t intersectionType() {
    std::uint32_t st = cur().start;
    eatP("&");
    std::uint32_t first = typeOperator();
    if (!isP("&")) return first;
    std::vector<std::uint32_t> ms{first};
    while (eatP("&")) ms.push_back(typeOperator());
    return other(st, "intersection", std::move(ms));
  }

  std::uint32_t typeOperator() {
    std::uint32_t st = cur().start;
    const bool operand = at(1).kind != Tok::Punct || isP("(", 1) || isP("{", 1) || isP("[", 1) || isP("-", 1);
    if (isId("keyof") && operand) {  // `keyof T`: string literal types are plain strings, so it is a string
      ++i;
      typeOperator();
      return mk(N::TypeRef, st, prevEnd(), "string", {});
    }
    if (isId("readonly") && operand) {   // `readonly T[]`, `readonly [A, B]`: the same type here (ZN-155), its span from `readonly` (a stripper erases it all)
      ++i;
      std::uint32_t ty = typeOperator();
      r.ast.nodes[ty].start = st;
      return ty;
    }
    if (isId("unique") && isId("symbol", 1)) { i += 2; return other(st, "unique symbol"); }
    if (isId("infer") && at(1).kind == Tok::Ident) {   // `infer U` (and `infer U extends C`) in a conditional type
      i += 2;
      std::vector<std::uint32_t> kids;
      if (isKw("extends") && noConditional) { ++i; kids.push_back(unionType()); }
      return other(st, "infer", std::move(kids));
    }
    return typePostfix();
  }

  std::uint32_t typePostfix() {
    std::uint32_t st = cur().start;
    std::uint32_t ty = typePrimary();
    for (;;) {
      if (isP("[") && isP("]", 1)) { i += 2; ty = mk(N::TypeArray, st, prevEnd(), {}, {ty}); continue; }
      if (isP("[") && !newlineBefore()) {   // `T['type']`, `T[number]`, `T[keyof T]`: an indexed access type
        ++i;
        std::uint32_t ix = type();
        expectP("]");
        ty = other(st, "indexed access", {ty, ix});
        continue;
      }
      return ty;
    }
  }

  // `(x: X): R` after a member's name or a `new`: a function type (`what`: the signature it stands for, a TypeOther around it)
  std::uint32_t signature(std::uint32_t fs, const char* what) {
    std::vector<std::uint32_t> tps;
    if (isP("<")) tps = typeParams();
    std::uint32_t ps0 = cur().start;
    auto ps = params(true);
    std::uint32_t ret = eatP(":") ? type() : mk(N::TypeRef, prevEnd(), prevEnd(), "void", {});
    std::vector<std::uint32_t> kids{ret};
    kids.insert(kids.end(), ps.begin(), ps.end());
    std::uint32_t f = mk(N::TypeFunc, ps0, prevEnd(), {}, std::move(kids));
    if (what) f = other(fs, what, {f});
    else if (!tps.empty()) f = other(ps0, "generic function", {f});
    return f;
  }
  // A call signature `(x): R`, a construct signature `new (x): R` or an index signature `[key: K]: V` of an object type or an interface:
  // a Field with no name whose type is a TypeOther; kNone when the member is not one of them
  std::uint32_t unnamedMember() {
    std::uint32_t fs = cur().start, f = kNone;
    if (isP("(") || isP("<")) f = signature(fs, "call signature");
    else if (isKw("new") && (isP("(", 1) || isP("<", 1))) { ++i; f = signature(fs, "construct signature"); }
    else if (isP("[") && at(1).kind == Tok::Ident && isP(":", 2)) {
      i += 3;
      std::uint32_t kt = type();
      expectP("]");
      eatP("?");
      expectP(":");
      std::uint32_t vt = type();
      f = other(fs, "index signature", {kt, vt});
    } else return kNone;
    return mk(N::Field, fs, prevEnd(), {}, {f, kNone});
  }

  // `{ ... }` of an object type: properties, methods, call and construct signatures, index signatures; or a mapped type `{ [K in T]: V }`
  std::uint32_t objectType() {
    std::uint32_t st = cur().start;
    ++i;  // {
    {
      std::size_t k = 0;
      if (isP("+") || isP("-")) ++k;
      if (isId("readonly", k)) ++k;
      if (isP("[", k) && at(k + 1).kind == Tok::Ident && at(k + 2).kind == Tok::Keyword && txt(at(k + 2)) == "in") {
        i += k + 2;
        ++i;  // in
        std::vector<std::uint32_t> kids{type()};
        if (isId("as")) { ++i; kids.push_back(type()); }
        expectP("]");
        if (isP("+") || isP("-")) ++i;
        eatP("?");
        if (eatP(":")) kids.push_back(type());
        eatP(";") || eatP(",");
        expectP("}");
        return other(st, "mapped", std::move(kids));
      }
    }
    std::vector<std::uint32_t> fields;
    while (!isP("}")) {
      if (eof()) unexpected();
      if (eatP(";") || eatP(",")) continue;
      std::uint32_t fs = cur().start;
      if (std::uint32_t f = unnamedMember(); f != kNone) { fields.push_back(f); continue; }
      std::uint32_t fl = isId("readonly") && !isP(":", 1) && !isP("?", 1) && !isP("(", 1) ? (++i, kFlagReadonly) : 0;
      if (std::uint32_t f = unnamedMember(); f != kNone) { fields.push_back(f); continue; }   // `readonly [key: string]: V`
      if ((isId("get") || isId("set")) && (at(1).kind == Tok::Ident || at(1).kind == Tok::Keyword || at(1).kind == Tok::String) && isP("(", 2)) ++i;   // `get x(): T`: read like a property
      std::string_view fname;
      memberName(fname);
      bool opt = eatP("?");
      std::uint32_t ft = kNone;
      if (isP("(") || isP("<")) ft = signature(fs, nullptr);   // `name(x: X): R`: a property holding a function
      else { expectP(":"); ft = type(); }
      if (opt) {
        std::uint32_t nul = mk(N::TypeRef, startOf(ft), endOf(ft), "null", {});
        r.ast.nodes[nul].flags |= kFlagUndefined;  // `b?: U` is `U | undefined`
        ft = mk(N::TypeUnion, startOf(ft), endOf(ft), {}, {ft, nul});
        fl |= kFlagOptional;
      }
      std::uint32_t fid = mk(N::Field, fs, prevEnd(), fname, {ft, kNone});
      r.ast.nodes[fid].flags = fl;
      fields.push_back(fid);
    }
    expectP("}");
    return mk(N::TypeObject, st, prevEnd(), {}, std::move(fields));
  }

  // `[A, B]`, `[x: A, y?: B]`, `[A, ...B[]]`: the labels go, an optional element is `T | undefined`, a rest element is not typed yet
  std::uint32_t tupleType() {
    std::uint32_t st = cur().start;
    ++i;  // [
    std::vector<std::uint32_t> es;
    while (!isP("]")) {
      std::uint32_t es0 = cur().start;
      bool rest = eatP("...");
      bool opt = false;
      if (at(0).kind == Tok::Ident && (isP(":", 1) || (isP("?", 1) && isP(":", 2)))) { ++i; opt = eatP("?"); ++i; }   // a label
      std::uint32_t e = type();
      opt = eatP("?") || opt;
      if (rest) e = other(es0, "rest element", {e});
      else if (opt) {
        std::uint32_t nul = mk(N::TypeRef, startOf(e), endOf(e), "null", {});
        r.ast.nodes[nul].flags |= kFlagUndefined;
        e = mk(N::TypeUnion, es0, prevEnd(), {}, {e, nul});
      }
      es.push_back(e);
      if (!eatP(",")) break;
    }
    expectP("]");
    return mk(N::TypeTuple, st, prevEnd(), {}, std::move(es));
  }

  std::uint32_t typePrimary() {
    std::uint32_t st = cur().start;
    Tok k = cur().kind;
    if (isKw("typeof") && (at(1).kind == Tok::Ident || at(1).kind == Tok::Keyword)) {   // `typeof x`, `typeof a.b`: the type of the value (ZN-155)
      ++i;
      std::uint32_t ns = cur().start;
      ++i;
      while (isP(".") && (at(1).kind == Tok::Ident || at(1).kind == Tok::Keyword)) i += 2;
      std::uint32_t id = mk(N::TypeRef, st, prevEnd(), s.substr(ns, prevEnd() - ns), {});
      r.ast.nodes[id].flags |= kFlagTypeQuery;
      if (isP("<") && !newlineBefore()) { typeArgs(); return other(st, "instantiation expression", {id}); }
      return id;
    }
    if (isKw("import") && isP("(", 1)) {   // `import('./m').T`
      i += 2;
      if (cur().kind != Tok::String) unexpected();
      ++i;
      expectP(")");
      while (isP(".") && at(1).kind == Tok::Ident) i += 2;
      if (isP("<")) typeArgs();
      return other(st, "import");
    }
    if (k == Tok::Ident || isKw("void") || isKw("null") || isKw("this")) {
      ++i;
      while (isP(".") && at(1).kind == Tok::Ident) i += 2;
      std::string_view name = s.substr(st, prevEnd() - st);
      std::vector<std::uint32_t> args;
      if (isP("<") && !newlineBefore()) {
        ++i;
        while (!isP(">")) { args.push_back(type()); if (!eatP(",")) break; }
        expectP(">");
      }
      return mk(N::TypeRef, st, prevEnd(), name, std::move(args));
    }
    if (k == Tok::Number || k == Tok::BigInt || k == Tok::String || isKw("true") || isKw("false")) { ++i; return mk(N::TypeLit, st, prevEnd(), s.substr(st, prevEnd() - st)); }
    if (isP("-") && (at(1).kind == Tok::Number || at(1).kind == Tok::BigInt)) { i += 2; return mk(N::TypeLit, st, prevEnd(), s.substr(st, prevEnd() - st)); }   // `-1`
    if (k == Tok::TemplateNoSub || k == Tok::TemplateHead) {   // `` `#${string}` ``: a string here (literal types are plain strings)
      ++i;
      if (k == Tok::TemplateHead) {
        for (;;) {
          type();
          if (cur().kind == Tok::TemplateMiddle) { ++i; continue; }
          if (cur().kind != Tok::TemplateTail) unexpected();
          ++i;
          break;
        }
      }
      return mk(N::TypeRef, st, prevEnd(), "string", {});
    }
    if (isP("(")) {
      std::size_t close = matchingParen(0);
      // `(() => T) =>`: a parenthesized type before an arrow is not a parameter list (parameters never start with `(`)
      bool paramList = !isP("(", 1) && !(at(1).kind == Tok::Ident && at(2).kind == Tok::Punct && !(isP(":", 2) || isP(",", 2) || isP("?", 2) || isP(")", 2) || isP("=", 2)));
      if (paramList && close + 1 < t.size() && t[close + 1].kind == Tok::Punct && txt(t[close + 1]) == "=>") {
        auto ps = params(true);
        expectP("=>");
        std::uint32_t ret = type();
        std::vector<std::uint32_t> kids{ret};
        kids.insert(kids.end(), ps.begin(), ps.end());
        return mk(N::TypeFunc, st, prevEnd(), {}, std::move(kids));
      }
      ++i;
      bool saved = noConditional;
      noConditional = false;
      std::uint32_t inner = type();
      noConditional = saved;
      expectP(")");
      return inner;
    }
    if (isP("[")) return tupleType();
    if (isP("{")) return objectType();
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
    if (inGenerator && isId("yield")) {
      std::uint32_t st = cur().start;
      ++i;
      bool delegate = isP("*") && !newlineBefore();  // `yield* other()`: every value of the other generator
      if (delegate) ++i;
      std::uint32_t e = (isP(";") || isP(")") || isP("}") || isP("]") || isP(",") || eof() || newlineBefore()) ? kNone : assignment();
      return mk(N::Yield, st, prevEnd(), delegate ? "*" : "", {e});
    }
    std::uint32_t lhs = conditional();
    Op op = operatorAt();
    if (op.ntoks && isAssignOp(op.text)) {
      N k = r.ast.nodes[lhs].kind;
      if (k == N::Array && op.text == "=") toAssignPattern(lhs);
      else if (k != N::Ident && k != N::Member && k != N::Index) fail(kZBadAssignTarget, startOf(lhs), "");
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
      if ((isId("as") || isId("satisfies")) && !newlineBefore() && minPrec <= 8) {  // a type assertion binds like a relational operator
        std::string_view word = txt();
        ++i;
        std::uint32_t ty;
        if (word == "as" && isKw("const")) { std::uint32_t cs = cur().start; ++i; ty = mk(N::TypeRef, cs, prevEnd(), "const", {}); }  // `as const` is erased
        else ty = type();
        lhs = mk(N::As, startOf(lhs), prevEnd(), word, {lhs, ty});  // text: "as" or "satisfies"
        continue;
      }
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
    const bool moduleAwait = !inAsync && fnDepth == 0 && isId("await") && (at(1).kind != Tok::Punct || isP("(", 1) || isP("[", 1) || isP("!", 1) || isP("-", 1));
    if ((inAsync && isId("await")) || moduleAwait) {
      ++i;
      std::uint32_t e = unary();
      std::uint32_t aw = mk(N::Await, st, endOf(e), {}, {e});
      if (moduleAwait) r.ast.nodes[aw].flags |= kFlagModuleLevel;   // the QuickJS engine runs it; the typed engines report it (desugar.cpp)
      return aw;
    }
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
    std::vector<std::uint32_t> pendingTargs;  // explicit type arguments of the call being built: f<T>(x)
    for (;;) {
      if (isP("<") && (r.ast.nodes[e].kind == N::Ident || r.ast.nodes[e].kind == N::Member)) {
        std::size_t save = i, diagCount = r.diags.size();
        bool ok = false;
        try {
          auto targs = typeArgs();
          if (isP("(")) { pendingTargs = std::move(targs); ok = true; }
        } catch (const Stop&) { r.diags.resize(diagCount); }
        if (!ok) { i = save; return e; }  // an ordinary comparison
      }
      if (isP(".") || isP("?.")) {
        bool opt = isP("?.");
        if (opt && (isP("[", 1) || isP("(", 1))) {
          ++i;
          if (isP("[")) { ++i; std::uint32_t ix = expression(); expectP("]"); e = mk(N::Index, startOf(e), prevEnd(), {}, {e, ix}); }
          else { auto as = arguments(); as.insert(as.begin(), e); e = mk(N::Call, startOf(e), prevEnd(), {}, std::move(as)); r.ast.nodes[e].flags |= kFlagOptional; }  // `f?.(x)`
          continue;
        }
        std::uint32_t opStart = cur().start;
        ++i;
        if (cur().kind != Tok::Ident && cur().kind != Tok::Keyword && cur().kind != Tok::PrivateName) unexpected();
        (void)opStart;
        std::string_view name = txt();
        ++i;
        e = mk(N::Member, startOf(e), prevEnd(), name, {e});
        if (opt) r.ast.nodes[e].flags |= kFlagOptional;  // `a?.b`
      } else if (isP("[")) {
        ++i;
        std::uint32_t ix = expression();
        expectP("]");
        e = mk(N::Index, startOf(e), prevEnd(), {}, {e, ix});
      } else if (isP("(")) {
        auto as = arguments();
        as.insert(as.begin(), e);
        e = mk(N::Call, startOf(e), prevEnd(), {}, std::move(as));
        if (!pendingTargs.empty()) { r.ast.targs[e] = std::move(pendingTargs); pendingTargs.clear(); }
      } else if ((isP("++") || isP("--")) && !newlineBefore()) {
        std::string_view op = txt(); ++i;
        e = mk(N::UpdatePost, startOf(e), prevEnd(), op, {e});
      } else if (isP("!") && !newlineBefore()) {
        ++i;
        e = mk(N::NonNull, startOf(e), prevEnd(), {}, {e});
      } else if (cur().kind == Tok::TemplateNoSub || cur().kind == Tok::TemplateHead) {
        e = taggedTemplate(e);
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
    std::vector<std::uint32_t> targs;
    if (isP("<")) targs = typeArgs();
    std::vector<std::uint32_t> kids{callee};
    if (isP("(")) { auto as = arguments(); kids.insert(kids.end(), as.begin(), as.end()); }
    std::uint32_t nid = mk(N::New, st, prevEnd(), {}, std::move(kids));
    if (!targs.empty()) r.ast.targs[nid] = std::move(targs);
    return nid;
  }

  // Raw text of a template piece without its delimiters (`, ${ and }), as a String node.
  std::uint32_t quasi(const Token& k, std::uint32_t lead, std::uint32_t trail) {
    return mk(N::String, k.start + lead, k.end - trail, s.substr(k.start + lead, k.end - k.start - lead - trail));
  }

  // tag`a${x}b` is the call tag(['a', 'b'], x): the array holds the cooked strings (a TemplateStringsArray is a string[] here).
  // String.raw`a\n${x}` is the template itself with every backslash doubled, so cooking gives back the text as written.
  std::uint32_t taggedTemplate(std::uint32_t tag) {
    std::uint32_t tpl = primary();
    const std::vector<std::uint32_t> parts = r.ast.nodes[tpl].kids;
    const Node& tg = r.ast.nodes[tag];
    if (tg.kind == N::Member && tg.text == "raw" && r.ast.nodes[tg.kids[0]].kind == N::Ident && r.ast.nodes[tg.kids[0]].text == "String") {
      static std::deque<std::string> rawTexts;  // process-wide like setterNames: the nodes of merged modules view them
      for (std::size_t k = 0; k < parts.size(); k += 2) {
        std::string raw;
        for (char c : r.ast.nodes[parts[k]].text) { raw += c; if (c == '\\') raw += c; }
        rawTexts.push_back(std::move(raw));
        r.ast.nodes[parts[k]].text = rawTexts.back();
      }
      r.ast.nodes[tpl].start = startOf(tag);  // the template takes the place of the whole tagged expression
      return tpl;
    }
    std::vector<std::uint32_t> strs, args{tag};
    for (std::size_t k = 0; k < parts.size(); k += 2) strs.push_back(mk(N::Template, startOf(parts[k]), endOf(parts[k]), {}, {parts[k]}));
    args.push_back(mk(N::Array, r.ast.nodes[tpl].start, endOf(tpl), {}, std::move(strs)));
    for (std::size_t k = 1; k < parts.size(); k += 2) args.push_back(parts[k]);
    return mk(N::Call, startOf(tag), endOf(tpl), {}, std::move(args));
  }

  // ---- function expressions
  // The body after `=>`: a block, or an expression wrapped in a block that returns it.
  std::uint32_t arrowBody() {
    if (isP("{")) return block();
    std::uint32_t e = assignment();
    std::uint32_t ret = mk(N::Return, startOf(e), endOf(e), {}, {e});
    return mk(N::Block, startOf(e), endOf(e), {}, {ret});
  }
  std::uint32_t funcExpr(std::uint32_t st, std::vector<std::uint32_t> ps, std::uint32_t ret, std::uint32_t body, bool arrow) {
    std::vector<std::uint32_t> kids{ret, body};
    kids.insert(kids.end(), ps.begin(), ps.end());
    std::uint32_t id = mk(N::FuncExpr, st, prevEnd(), {}, std::move(kids));
    if (arrow) r.ast.nodes[id].flags = kFlagArrow;
    return id;
  }
  // At `(`: is this the parameter list of an arrow function?
  bool arrowAhead() {
    std::size_t close = matchingParen(0);
    if (close + 1 >= t.size()) return false;
    const Token& nx = t[close + 1];
    if (nx.kind != Tok::Punct) return false;
    if (txt(nx) == "=>") return true;
    if (txt(nx) != ":") return false;
    std::size_t save = i, diagCount = r.diags.size();  // `(x): R =>`: try to read the return type
    bool ok = false;
    try { i = close + 2; type(); ok = isP("=>"); } catch (const Stop&) { r.diags.resize(diagCount); }
    i = save;
    return ok;
  }
  // function (a: T): R { ... }, from the `function` keyword; a name is allowed and ignored
  std::uint32_t functionExpr(std::uint32_t st, bool async) {
    ++i;
    bool gen = eatP("*");
    std::string_view fname;
    if (cur().kind == Tok::Ident) { fname = txt(); ++i; }  // a named function expression: the name is bound inside its own body
    auto ps = params(false);
    std::uint32_t ret = kNone;
    if (eatP(":")) ret = type();
    std::uint32_t body = withFn(async, gen, [&] { return block(); });
    std::uint32_t id = funcExpr(st, std::move(ps), ret, body, false);
    r.ast.nodes[id].text = fname;
    r.ast.nodes[id].flags |= (async ? kFlagAsync : 0) | (gen ? kFlagGenerator : 0);
    return id;
  }
  // At `<`: `<T>(x: T): T => x`, an arrow function with type parameters (the checker reports them); kNone, nothing read, when it is not one
  std::uint32_t genericArrow(bool async, std::uint32_t st) {
    if (!(at(1).kind == Tok::Ident || (at(1).kind == Tok::Keyword && txt(at(1)) == "const"))) return kNone;
    std::size_t save = i, diagCount = r.diags.size();
    std::vector<std::uint32_t> tps;
    bool ok = false;
    try { tps = typeParams(); ok = isP("(") && arrowAhead(); } catch (const Stop&) { r.diags.resize(diagCount); }
    if (!ok) { i = save; return kNone; }
    std::uint32_t fn = arrowFunction(async, st);
    r.ast.tparams[fn] = std::move(tps);
    return fn;
  }
  std::uint32_t arrowFunction(bool async = false, std::uint32_t st0 = kNone) {
    std::uint32_t st = st0 != kNone ? st0 : cur().start;
    auto ps = params(false);
    std::uint32_t ret = kNone;
    if (eatP(":")) ret = type();
    expectP("=>");
    std::uint32_t body = withFn(async, false, [&] { return arrowBody(); });
    std::uint32_t id = funcExpr(st, std::move(ps), ret, body, true);
    if (async) r.ast.nodes[id].flags |= kFlagAsync;
    return id;
  }

  std::uint32_t primary() {
    const Token& k = cur();
    std::uint32_t st = k.start;
    switch (k.kind) {
      case Tok::Number: ++i; return mk(N::Number, st, prevEnd(), txt(t[i - 1]));
      case Tok::BigInt: ++i; return mk(N::BigInt, st, prevEnd(), txt(t[i - 1]));
      case Tok::String: ++i; return mk(N::String, st, prevEnd(), txt(t[i - 1]));
      case Tok::Regex: ++i; return mk(N::Regex, st, prevEnd(), txt(t[i - 1]));
      case Tok::Ident:
        if (isId("async") && !newlineAt(1)) {
          if (at(1).kind == Tok::Keyword && txt(at(1)) == "function") {  // async function (...) { ... }
            ++i;
            return functionExpr(st, true);
          }
          if (isP("(", 1)) { ++i; if (arrowAhead()) return arrowFunction(true, st); --i; }
          else if (isP("<", 1)) { ++i; if (std::uint32_t g = genericArrow(true, st); g != kNone) return g; --i; }   // async <T>(x: T) => ...
          else if (at(1).kind == Tok::Ident && isP("=>", 2)) {  // async x => ...
            i += 2;
            std::string_view pname = txt(t[i - 1]);
            std::uint32_t p = mk(N::Param, t[i - 1].start, t[i - 1].end, pname, {kNone, kNone});
            ++i;
            std::uint32_t body = withFn(true, false, [&] { return arrowBody(); });
            std::uint32_t id = funcExpr(st, {p}, kNone, body, true);
            r.ast.nodes[id].flags |= kFlagAsync;
            return id;
          }
        }
        ++i;
        if (isP("=>")) {  // x => ...
          std::string_view pname = txt(t[i - 1]);
          std::uint32_t p = mk(N::Param, st, prevEnd(), pname, {kNone, kNone});
          ++i;
          std::uint32_t body = withFn(false, false, [&] { return arrowBody(); });
          return funcExpr(st, {p}, kNone, body, true);
        }
        return mk(N::Ident, st, prevEnd(), txt(t[i - 1]));
      case Tok::TemplateNoSub: {
        std::uint32_t q = quasi(k, 1, 1);
        ++i;
        return mk(N::Template, st, prevEnd(), {}, {q});
      }
      case Tok::TemplateHead: {
        std::vector<std::uint32_t> parts{quasi(k, 1, 2)};
        ++i;
        parts.push_back(expression());
        while (cur().kind == Tok::TemplateMiddle) {
          parts.push_back(quasi(cur(), 1, 2));
          ++i;
          parts.push_back(expression());
        }
        if (cur().kind != Tok::TemplateTail) unexpected();
        parts.push_back(quasi(cur(), 1, 1));
        ++i;
        return mk(N::Template, st, prevEnd(), {}, std::move(parts));
      }
      case Tok::Keyword:
        if (isKw("import") && isP(".", 1) && isId("meta", 2) && isP(".", 3) && at(4).kind == Tok::Ident) {  // import.meta.url, .dirname, .filename: the loader turns the marker into the module's string; .hot: see hotMeta in modules.cpp
          std::string_view prop = txt(at(4));
          if (prop != "url" && prop != "dirname" && prop != "filename" && prop != "hot") unsupported("import.meta members other than url, dirname, filename and hot");
          i += 5;
          return mk(N::Ident, st, prevEnd(), prop == "url" ? "__meta_url" : prop == "dirname" ? "__meta_dirname" : prop == "hot" ? "__meta_hot" : "__meta_filename");
        }
        if (isKw("import") && isP("(", 1)) fail(kZDynamicImport, st, "");
        if (isKw("this")) { ++i; return mk(N::This, st, prevEnd()); }
        if (isKw("super")) { ++i; return mk(N::Super, st, prevEnd()); }
        if (isKw("true") || isKw("false") || isKw("null")) { ++i; return mk(N::Literal, st, prevEnd(), txt(t[i - 1])); }
        if (isKw("function")) return functionExpr(st, false);
        if (isKw("class")) unsupported("class expressions");
        unexpected();
      case Tok::Punct:
        if (isP("<")) { if (std::uint32_t g = genericArrow(false, st); g != kNone) return g; }
        if (isP("(")) {
          if (arrowAhead()) return arrowFunction();
          ++i;
          std::uint32_t e = expression();
          expectP(")");
          return e;
        }
        if (isP("[")) {
          ++i;
          std::vector<std::uint32_t> es;
          while (!isP("]")) {
            if (isP(",")) { es.push_back(mk(N::Empty, cur().start, cur().start)); ++i; continue; }   // a hole: the checker reports it, unless the array is an assignment pattern
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
        if (isP("{")) return objectLiteral();
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
  bool atVarDecl() const { return isKw("const") || isKw("var") || atLetDecl() || (isId("using") && at(1).kind == Tok::Ident && !newlineAt(1)); }

  std::uint32_t declarator() {
    std::uint32_t st = cur().start;
    if (isP("[") || isP("{")) {  // destructuring declaration
      std::uint32_t pat = bindingTarget();
      std::uint32_t ty2 = kNone, init2 = kNone;
      if (eatP(":")) ty2 = type();
      if (eatP("=")) init2 = assignment();
      return mk(N::Declarator, st, prevEnd(), {}, {ty2, init2, pat});
    }
    if (cur().kind != Tok::Ident) unexpected();
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

  // `<T, U extends Foo>` at a declaration
  std::vector<std::uint32_t> typeParams() {
    ++i;  // <
    std::vector<std::uint32_t> ps;
    while (!isP(">")) {
      std::uint32_t st = cur().start;
      while ((isKw("const") || isKw("in") || isId("out")) && at(1).kind == Tok::Ident) ++i;   // `<const T>`, `<in out T>`: variance and const modifiers
      if (cur().kind != Tok::Ident) unexpected();
      std::string_view name = txt(); ++i;
      std::uint32_t cons = kNone;
      if (isKw("extends")) { ++i; cons = type(); }
      std::uint32_t def = eatP("=") ? type() : kNone;  // `T = number`: used when the argument is left out
      ps.push_back(mk(N::TypeParam, st, prevEnd(), name, {cons, def}));
      if (!eatP(",")) break;
    }
    expectP(">");
    return ps;
  }
  // `<A, B>` at a use: the explicit type arguments of a call or new
  std::vector<std::uint32_t> typeArgs() {
    ++i;  // <
    std::vector<std::uint32_t> as;
    while (!isP(">")) { as.push_back(type()); if (!eatP(",")) break; }
    expectP(">");
    return as;
  }

  std::uint32_t function(bool async = false, std::uint32_t st0 = kNone) {
    std::uint32_t st = st0 != kNone ? st0 : cur().start;
    ++i;  // function
    bool gen = eatP("*");
    if (cur().kind != Tok::Ident) unexpected();
    std::string_view name = txt(); ++i;
    std::vector<std::uint32_t> tps;
    if (isP("<")) tps = typeParams();
    auto ps = params(false);
    std::uint32_t ret = kNone;
    if (eatP(":")) ret = type();
    std::uint32_t body = isP("{") ? withFn(async, gen, [&] { return block(); }) : (semi(), kNone);
    std::vector<std::uint32_t> kids{ret, body};
    kids.insert(kids.end(), ps.begin(), ps.end());
    std::uint32_t fid = mk(N::Function, st, prevEnd(), name, std::move(kids));
    r.ast.nodes[fid].flags |= (async ? kFlagAsync : 0) | (gen ? kFlagGenerator : 0);
    if (!tps.empty()) r.ast.tparams[fid] = std::move(tps);
    return fid;
  }

  // Modifiers before a member name; a word is a modifier only when a member name follows it.
  std::uint32_t modifiers() {
    std::uint32_t fl = 0;
    for (;;) {
      std::uint32_t f = isId("public") ? kFlagPublic : isId("private") ? kFlagPrivate : isId("protected") ? kFlagProtected
                      : isId("static") ? kFlagStatic : isId("readonly") ? kFlagReadonly : isId("abstract") ? kFlagAbstract
                      : isId("override") ? kFlagOverride : isId("accessor") ? kFlagSynthetic : 0;  // `accessor x` is a plain field (the flag is dropped below)
      if (f == kFlagSynthetic) { if (at(1).kind == Tok::Ident || at(1).kind == Tok::PrivateName) { ++i; continue; } return fl; }
      if (!f || isP(":", 1) || isP("=", 1) || isP("(", 1) || isP(";", 1) || isP("?", 1) || isP("}", 1)) return fl;
      fl |= f;
      ++i;
    }
  }

  std::uint32_t heritage() {  // a comma separated list of type references
    std::uint32_t st = cur().start;
    std::vector<std::uint32_t> refs;
    do {
      std::uint32_t t = typePrimary();
      if (r.ast.nodes[t].kind != N::TypeRef) unexpected();
      refs.push_back(t);
    } while (eatP(","));
    return mk(N::Heritage, st, prevEnd(), {}, std::move(refs));
  }

  // Parameter properties become fields plus `this.x = x;` at the top of the constructor body (after a leading super call).
  void desugarParamProperties(std::uint32_t ctor, std::vector<std::uint32_t>& members) {
    // copy what the loop needs: mk() grows the node vector and would invalidate references into it
    const std::vector<std::uint32_t> ctorKids = r.ast.nodes[ctor].kids;
    std::uint32_t body = ctorKids[1];
    if (body == kNone) return;
    std::vector<std::uint32_t> assigns;
    std::ptrdiff_t nField = 0;  // parameter properties come before the declared fields, as in the TypeScript-to-JavaScript transform
    for (std::size_t k = 2; k < ctorKids.size(); ++k) {
      const Node pn = r.ast.nodes[ctorKids[k]];
      if (!(pn.flags & (kFlagPublic | kFlagPrivate | kFlagProtected | kFlagReadonly))) continue;
      std::uint32_t field = mk(N::Field, pn.start, pn.end, pn.text, {pn.kids[0], kNone});
      r.ast.nodes[field].flags = pn.flags;
      members.insert(members.begin() + nField++, field);
      std::uint32_t bs = r.ast.nodes[body].start;  // synthesized nodes sit on the body's opening brace
      std::uint32_t th = mk(N::This, bs, bs + 1);
      std::uint32_t mem = mk(N::Member, bs, bs + 1, pn.text, {th});
      std::uint32_t id = mk(N::Ident, bs, bs + 1, pn.text);
      std::uint32_t as = mk(N::Assign, bs, bs + 1, "=", {mem, id});
      std::uint32_t es = mk(N::ExprStmt, bs, bs + 1, {}, {as});
      r.ast.nodes[es].flags = kFlagSynthetic;
      assigns.push_back(es);
    }
    if (assigns.empty()) return;
    auto& stmts = r.ast.nodes[body].kids;
    std::size_t at = 0;
    for (std::size_t k = 0; k < stmts.size(); ++k) {   // after the `super(...)` statement, wherever it is (code may come before it)
      const Node& st = r.ast.nodes[stmts[k]];
      if (st.kind == N::ExprStmt && r.ast.nodes[st.kids[0]].kind == N::Call && r.ast.nodes[r.ast.nodes[st.kids[0]].kids[0]].kind == N::Super) { at = k + 1; break; }
    }
    stmts.insert(stmts.begin() + static_cast<std::ptrdiff_t>(at), assigns.begin(), assigns.end());
  }

  void memberName(std::string_view& name) {
    if (isId("set") || isId("async") || isId("declare") || isP("[")) {
      if (!(isP(":", 1) || isP("=", 1) || isP("(", 1) || isP(";", 1))) unsupported("setters, async and computed member names");
    }
    if (cur().kind != Tok::Ident && cur().kind != Tok::Keyword && cur().kind != Tok::String && cur().kind != Tok::Number && cur().kind != Tok::PrivateName) unexpected();
    name = txt();
    ++i;
  }

  std::uint32_t classDecl(std::uint32_t classFlags) {
    std::uint32_t st = cur().start;
    ++i;  // class
    if (cur().kind != Tok::Ident) unexpected();
    std::string_view name = txt(); ++i;
    std::vector<std::uint32_t> tps;
    if (isP("<")) tps = typeParams();
    std::uint32_t ext = kNone, impl = kNone;
    if (isKw("extends")) {
      ++i;
      ext = typePrimary();
      if (r.ast.nodes[ext].kind != N::TypeRef) unexpected();
    }
    if (isId("implements")) { ++i; impl = heritage(); }
    expectP("{");
    std::vector<std::uint32_t> kids{ext, impl};
    std::vector<std::uint32_t> members;
    std::uint32_t ctor = kNone;
    while (!isP("}")) {
      if (eof()) unexpected();
      if (eatP(";")) continue;
      skipDecorators();
      std::uint32_t ms = cur().start;
      if (isId("static") && isP("{", 1)) {  // `static { ... }`: a static field whose initializer runs the block once, at class definition
        static std::deque<std::string> blockNames;  // see setterNames below
        blockNames.push_back("__static_block_" + std::to_string(blockNames.size()));
        i += 1;
        std::uint32_t body = block();
        std::uint32_t zero = mk(N::Number, ms, prevEnd(), "0");
        std::uint32_t ret = mk(N::Return, ms, prevEnd(), {}, {zero});
        r.ast.nodes[body].kids.push_back(ret);
        std::uint32_t fn = funcExpr(ms, {}, kNone, body, true);
        std::uint32_t call = mk(N::Call, ms, prevEnd(), {}, {fn});
        std::uint32_t id = mk(N::Field, ms, prevEnd(), blockNames.back(), {kNone, call});
        r.ast.nodes[id].flags = kFlagStatic | kFlagSynthetic;
        members.push_back(id);
        continue;
      }
      std::uint32_t fl = modifiers();
      std::string_view mname;
      if (isP("[") && isId("Symbol", 1) && isP(".", 2) && (isId("dispose", 3) || isId("iterator", 3)) && isP("]", 4)) {  // [Symbol.dispose]() and [Symbol.iterator]()
        mname = s.substr(cur().start, at(4).end - cur().start);
        i += 5;
      } else {
      if (isId("async") && !(isP(":", 1) || isP("=", 1) || isP("(", 1) || isP(";", 1) || isP("?", 1))) { ++i; fl |= kFlagAsync; }  // `async name(...)`
      if (isP("*")) { ++i; fl |= kFlagGenerator; }  // `*name(...)`: a generator method
      if (isId("get") && !(isP(":", 1) || isP("=", 1) || isP("(", 1) || isP(";", 1))) { ++i; fl |= kFlagGetter; }
      if (isId("set") && at(1).kind == Tok::Ident && isP("(", 2)) {  // `set name(v: T) { ... }`: a method called __set_name; `obj.name = v` calls it
        ++i;
        static std::deque<std::string> setterNames;  // process-wide: nodes of merged modules view these names, so they must outlive this parse
        setterNames.push_back("__set_" + std::string(txt()));
        mname = setterNames.back();
        ++i;
      } else memberName(mname);
      }
      if (isP("(") || isP("<")) {
        std::vector<std::uint32_t> mtps;
        if (isP("<")) mtps = typeParams();   // an instance method's: the checker reports them (only static ones are typed)
        auto ps = params(false);
        if ((fl & kFlagGetter) && !ps.empty()) unsupported("getters with parameters");
        std::uint32_t ret = kNone;
        if (eatP(":")) ret = type();
        std::uint32_t body = kNone;
        if (isP("{")) body = withFn((fl & kFlagAsync) != 0, (fl & kFlagGenerator) != 0, [&] { return block(); });  // `await` is an operator in an async method's body
        else if (fl & kFlagAbstract) semi();
        else fail(kZExpected, cur().start, "'{'");
        std::vector<std::uint32_t> mk_{ret, body};
        mk_.insert(mk_.end(), ps.begin(), ps.end());
        std::uint32_t id = mk(N::Method, ms, prevEnd(), mname, std::move(mk_));
        r.ast.nodes[id].flags = fl;
        if (!mtps.empty()) r.ast.tparams[id] = std::move(mtps);
        members.push_back(id);
        if (mname == "constructor") ctor = id;
      } else {
        bool definite = !eatP("?") && eatP("!");  // `x!: T`: definitely assigned later
        std::uint32_t ty = kNone, init = kNone;
        if (eatP(":")) ty = type();
        if (eatP("=")) init = assignment();
        semi();
        std::uint32_t id = mk(N::Field, ms, prevEnd(), mname, {ty, init});
        r.ast.nodes[id].flags = fl | (definite ? kFlagDefinite : 0);
        members.push_back(id);
      }
    }
    ++i;
    if (ctor != kNone) desugarParamProperties(ctor, members);
    kids.insert(kids.end(), members.begin(), members.end());
    std::uint32_t id = mk(N::Class, st, prevEnd(), name, std::move(kids));
    r.ast.nodes[id].flags = classFlags;
    if (!tps.empty()) r.ast.tparams[id] = std::move(tps);
    return id;
  }

  std::uint32_t interfaceDecl() {
    std::uint32_t st = cur().start;
    ++i;  // interface
    if (cur().kind != Tok::Ident) unexpected();
    std::string_view name = txt(); ++i;
    std::vector<std::uint32_t> tps;
    if (isP("<")) tps = typeParams();
    std::uint32_t ext = kNone;
    if (isKw("extends")) { ++i; ext = heritage(); }
    expectP("{");
    std::vector<std::uint32_t> kids{ext};
    while (!isP("}")) {
      if (eof()) unexpected();
      if (eatP(";") || eatP(",")) continue;
      std::uint32_t ms = cur().start;
      if (std::uint32_t f = unnamedMember(); f != kNone) { kids.push_back(f); continue; }   // the checker reports them
      std::uint32_t fl = modifiers();
      if (std::uint32_t f = unnamedMember(); f != kNone) { kids.push_back(f); continue; }   // `readonly [key: string]: V`
      if ((isId("get") || isId("set")) && (at(1).kind == Tok::Ident || at(1).kind == Tok::Keyword || at(1).kind == Tok::String) && isP("(", 2)) ++i;   // `get x(): T`
      std::string_view mname;
      memberName(mname);
      bool optional = !isP("(") && eatP("?");  // `name?: T` is a property of type `T | null` that object literals may leave out
      if (isP("(") || isP("<")) {
        std::vector<std::uint32_t> mtps;
        if (isP("<")) mtps = typeParams();   // the checker reports generic methods of an interface
        auto ps = params(false);
        std::uint32_t ret = kNone;
        if (eatP(":")) ret = type();
        if (!eatP(";")) eatP(",");
        std::vector<std::uint32_t> mk_{ret, kNone};
        mk_.insert(mk_.end(), ps.begin(), ps.end());
        std::uint32_t id = mk(N::Method, ms, prevEnd(), mname, std::move(mk_));
        r.ast.nodes[id].flags = fl;
        if (!mtps.empty()) r.ast.tparams[id] = std::move(mtps);
        kids.push_back(id);
      } else {
        std::uint32_t ty = kNone;
        if (eatP(":")) ty = type();
        if (optional && ty != kNone) {
          std::uint32_t nul = mk(N::TypeRef, startOf(ty), endOf(ty), "null", {});
          r.ast.nodes[nul].flags |= kFlagUndefined;
          ty = mk(N::TypeUnion, startOf(ty), endOf(ty), {}, {ty, nul});
          fl |= kFlagOptional;
        }
        if (!eatP(";")) eatP(",");
        std::uint32_t id = mk(N::Field, ms, prevEnd(), mname, {ty, kNone});
        r.ast.nodes[id].flags = fl;
        kids.push_back(id);
      }
    }
    ++i;
    std::uint32_t id = mk(N::Interface, st, prevEnd(), name, std::move(kids));
    if (!tps.empty()) r.ast.tparams[id] = std::move(tps);
    return id;
  }

  std::uint32_t forStmt() {
    std::uint32_t st = cur().start;
    ++i;  // for
    if (isId("await")) unsupported("for await");
    expectP("(");
    // `for (const x of ...)` and `for (const [a, b] of ...)`: find where the binding ends
    std::size_t afterBinding = 0;
    if (atVarDecl()) {
      if (at(1).kind == Tok::Ident) afterBinding = 2;
      else if (isP("[", 1) || isP("{", 1)) {
        int depth = 0;
        std::size_t k = 1;
        for (; i + k < t.size(); ++k) {
          const Token& tk = t[i + k];
          if (tk.kind == Tok::Punct) { std::string_view p = txt(tk); if (p == "[" || p == "{") ++depth; else if (p == "]" || p == "}") { if (--depth == 0) { ++k; break; } } }
        }
        afterBinding = k;
      }
    }
    if (afterBinding && (isId("of", afterBinding) || (at(afterBinding).kind == Tok::Keyword && txt(at(afterBinding)) == "in"))) {
      std::string_view kind = txt(); ++i;
      std::uint32_t ds = cur().start;
      std::uint32_t d;
      if (isP("[") || isP("{")) { std::uint32_t pat = bindingTarget(); d = mk(N::Declarator, ds, prevEnd(), {}, {kNone, kNone, pat}); }
      else { std::string_view name = txt(); ++i; d = mk(N::Declarator, ds, prevEnd(), name, {kNone, kNone}); }
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

  bool topLevel = false;  // the statement being parsed is directly in the program

  std::uint32_t objectLiteral() {
    std::uint32_t st = cur().start;
    ++i;
    std::vector<std::uint32_t> props;
    while (!isP("}")) {
      if (isP("...")) {  // `{ ...other, x: 1 }`
        std::uint32_t ss = cur().start;
        ++i;
        std::uint32_t e = assignment();
        props.push_back(mk(N::Spread, ss, prevEnd(), {}, {e}));
        if (!eatP(",")) break;
        continue;
      }
      if (isP("[")) {  // a computed key: { [name]: value }, only meaningful for a Dyn object
        std::uint32_t ps0 = cur().start;
        ++i;
        std::uint32_t key = assignment();
        expectP("]");
        expectP(":");
        std::uint32_t value = assignment();
        props.push_back(mk(N::Prop, ps0, prevEnd(), {}, {value, key}));
        if (!eatP(",")) break;
        continue;
      }
      if ((isId("get") || isId("set")) && (at(1).kind == Tok::Ident || at(1).kind == Tok::Keyword) && isP("(", 2)) {  // `get name() { ... }`, `set name(v) { ... }`
        const bool getter = isId("get");
        std::uint32_t ps0 = cur().start;
        ++i;
        std::string_view key = txt();
        ++i;
        auto mps = params(false);
        std::uint32_t ret = kNone;
        if (eatP(":")) ret = type();
        std::uint32_t body = withFn(false, false, [&] { return block(); });
        std::uint32_t value = funcExpr(ps0, mps, ret, body, false);
        std::uint32_t prop = mk(N::Prop, ps0, prevEnd(), key, {value});
        r.ast.nodes[prop].flags = getter ? kFlagGetter : kFlagSetter;
        props.push_back(prop);
        if (!eatP(",")) break;
        continue;
      }
      if (cur().kind != Tok::Ident && cur().kind != Tok::Keyword && cur().kind != Tok::String && cur().kind != Tok::Number) unexpected();
      std::uint32_t ps = cur().start, pe = cur().end;
      std::string_view key = txt();
      bool str = cur().kind == Tok::String;
      if (cur().kind == Tok::Number && !isP(":", 1)) unexpected();   // `{ 1: 'a' }`: a number key holds a value
      if (str) key = key.substr(1, key.size() - 2);
      ++i;
      std::uint32_t value;
      if (eatP(":")) value = assignment();
      else if (!str && (isP(",") || isP("}"))) value = mk(N::Ident, ps, pe, key);  // shorthand `{ x }`
      else if (isP("(") && !str) {  // a method: `{ f(x: i32): i32 { ... } }`, a function expression (use arrow functions to capture `this`)
        auto mps = params(false);
        std::uint32_t ret = kNone;
        if (eatP(":")) ret = type();
        std::uint32_t body = withFn(false, false, [&] { return block(); });
        value = funcExpr(ps, mps, ret, body, false);
      } else unsupported("string-named methods in object literals");
      props.push_back(mk(N::Prop, ps, prevEnd(), key, {value}));
      if (!eatP(",")) break;
    }
    expectP("}");
    return mk(N::ObjectLit, st, prevEnd(), {}, std::move(props));
  }

  std::uint32_t switchStmt() {
    std::uint32_t st = cur().start;
    ++i;
    expectP("(");
    std::uint32_t disc = expression();
    expectP(")");
    expectP("{");
    std::vector<std::uint32_t> kids{disc};
    while (!isP("}")) {
      std::uint32_t cs = cur().start, test = kNone;
      if (isKw("case")) { ++i; test = expression(); }
      else if (isKw("default")) ++i;
      else unexpected();
      expectP(":");
      std::vector<std::uint32_t> body{test};
      while (!isP("}") && !isKw("case") && !isKw("default")) { if (eof()) unexpected(); body.push_back(statement()); }
      kids.push_back(mk(N::Case, cs, prevEnd(), {}, std::move(body)));
    }
    ++i;
    return mk(N::Switch, st, prevEnd(), {}, std::move(kids));
  }

  std::uint32_t enumDecl() {
    std::uint32_t st = cur().start;
    ++i;
    if (cur().kind != Tok::Ident) unexpected();
    std::string_view name = txt();
    ++i;
    expectP("{");
    std::vector<std::uint32_t> ms;
    while (!isP("}")) {
      if (cur().kind != Tok::Ident && cur().kind != Tok::String) unexpected();
      std::uint32_t s0 = cur().start;
      std::string_view mn = txt();
      if (cur().kind == Tok::String) mn = mn.substr(1, mn.size() - 2);   // `'≤' = '≤'`: a member named by a string
      ++i;
      std::uint32_t init = eatP("=") ? assignment() : kNone;
      ms.push_back(mk(N::EnumMember, s0, prevEnd(), mn, {init}));
      if (!eatP(",")) break;
    }
    expectP("}");
    return mk(N::Enum, st, prevEnd(), name, std::move(ms));
  }

  std::string_view sourceString() {
    if (cur().kind != Tok::String) fail(kZExpected, cur().start, "a module path string");
    std::string_view p = txt();
    ++i;
    return p;
  }
  // `import './x'`, `import { a, b as c } from './x'`
  std::uint32_t importDecl() {
    std::uint32_t st = cur().start;
    ++i;
    if (isId("type") && (isP("{", 1) || isP("*", 1) || (at(1).kind == Tok::Ident && !isId("from", 1)))) ++i;   // `import type ...`: types import like values
    if (cur().kind == Tok::String) { std::string_view src = sourceString(); semi(); return mk(N::Import, st, prevEnd(), src); }
    if (isP("*")) {  // `import * as ns from './x'`: one spec named "*"; the loader rewrites `ns.name` into a named import
      std::uint32_t s0 = cur().start;
      ++i;
      if (!isId("as")) fail(kZExpected, cur().start, "'as'");
      ++i;
      if (cur().kind != Tok::Ident) unexpected();
      std::uint32_t id = mk(N::Ident, cur().start, cur().end, txt());
      ++i;
      std::uint32_t spec = mk(N::ImportSpec, s0, prevEnd(), "*", {id});
      if (!isId("from")) fail(kZExpected, cur().start, "'from'");
      ++i;
      std::string_view src = sourceString();
      semi();
      return mk(N::Import, st, prevEnd(), src, {spec});
    }
    std::vector<std::uint32_t> specs;
    if (cur().kind == Tok::Ident) {  // `import X from './m'` (also `import X, { a, b } from './m'`): the default export, named "default"
      std::uint32_t s0 = cur().start;
      std::uint32_t id = mk(N::Ident, cur().start, cur().end, txt());
      ++i;
      specs.push_back(mk(N::ImportSpec, s0, prevEnd(), "default", {id}));
      if (!eatP(",")) {
        if (!isId("from")) fail(kZExpected, cur().start, "'from'");
        ++i;
        std::string_view src = sourceString();
        semi();
        return mk(N::Import, st, prevEnd(), src, std::move(specs));
      }
    }
    expectP("{");
    while (!isP("}")) {
      if (isId("type") && at(1).kind == Tok::Ident && !isId("as", 1)) ++i;  // `import { a, type B }`: the specifier is type-only; types import like values
      if (cur().kind != Tok::Ident) unexpected();
      std::uint32_t s0 = cur().start, ls = s0, le = cur().end;
      std::string_view name = txt(), local = name;
      ++i;
      if (isId("as")) { ++i; if (cur().kind != Tok::Ident) unexpected(); ls = cur().start; le = cur().end; local = txt(); ++i; }
      std::uint32_t id = mk(N::Ident, ls, le, local);
      specs.push_back(mk(N::ImportSpec, s0, prevEnd(), name, {id}));
      if (!eatP(",")) break;
    }
    expectP("}");
    if (!isId("from")) fail(kZExpected, cur().start, "'from'");
    ++i;
    std::string_view src = sourceString();
    semi();
    return mk(N::Import, st, prevEnd(), src, std::move(specs));
  }
  // `export <declaration>`, `export { a, b as c } [from './x']`, `export * from './x'`
  std::uint32_t exportDecl() {
    std::uint32_t st = cur().start;
    ++i;
    if (isKw("default")) {  // `export default <declaration>` or `export default <expression>;` (a module-level const named __default)
      ++i;
      std::uint32_t d;
      if (isKw("function") || isKw("class") || (isId("async") && at(1).kind == Tok::Keyword && txt(at(1)) == "function") || (isId("abstract") && at(1).kind == Tok::Keyword && txt(at(1)) == "class")) d = statement();
      else {
        std::uint32_t es = cur().start;
        std::uint32_t e = assignment();
        semi();
        std::uint32_t decl = mk(N::Declarator, es, prevEnd(), "__default", {kNone, e});
        d = mk(N::VarDecl, es, prevEnd(), "const", {decl});
      }
      std::uint32_t ex = mk(N::Export, st, prevEnd(), {}, {d});
      r.ast.nodes[ex].flags = kFlagDefault;
      return ex;
    }
    const bool typeOnly = isId("type") && (isP("{", 1) || isP("*", 1));   // `export type { A } from './a'`: re-exports types only
    if (typeOnly) ++i;
    if (isP("*")) {
      ++i;
      if (isId("as")) unsupported("namespace re-exports");
      if (!isId("from")) fail(kZExpected, cur().start, "'from'");
      ++i;
      std::string_view src = sourceString();
      semi();
      return mk(N::ExportAll, st, prevEnd(), src);
    }
    if (isP("{")) {
      ++i;
      std::vector<std::uint32_t> specs;
      while (!isP("}")) {
        if (isId("type") && at(1).kind == Tok::Ident && !isId("as", 1)) ++i;  // `export { type B }`
        if (cur().kind != Tok::Ident) unexpected();
        std::uint32_t s0 = cur().start, es = s0, ee = cur().end;
        std::string_view name = txt(), exported = name;
        ++i;
        if (isId("as")) { ++i; if (cur().kind != Tok::Ident) unexpected(); es = cur().start; ee = cur().end; exported = txt(); ++i; }
        std::uint32_t id = mk(N::Ident, es, ee, exported);
        specs.push_back(mk(N::ExportSpec, s0, prevEnd(), name, {id}));
        if (!eatP(",")) break;
      }
      expectP("}");
      std::string_view src;
      if (isId("from")) { ++i; src = sourceString(); }
      semi();
      std::uint32_t el = mk(N::ExportList, st, prevEnd(), src, std::move(specs));
      if (typeOnly) r.ast.nodes[el].flags |= kFlagTypeOnly;
      return el;
    }
    std::uint32_t d = statement();
    N dk = r.ast.nodes[d].kind;
    if (dk != N::Function && dk != N::Class && dk != N::Interface && dk != N::TypeAlias && dk != N::VarDecl && dk != N::Enum) fail(kZUnexpectedToken, st, "export of this statement");
    return mk(N::Export, st, prevEnd(), {}, {d});
  }

  // `@name` and `@name(args)` before a declaration: accepted and ignored (@weak, @pooled(n) change memory behaviour only)
  void skipDecorators() {
    while (isP("@")) {
      ++i;
      if (cur().kind != Tok::Ident) unexpected();
      ++i;
      while (isP(".") && at(1).kind == Tok::Ident) i += 2;
      if (isP("(")) {
        int depth = 0;
        do { if (isP("(")) ++depth; else if (isP(")")) --depth; if (eof()) unexpected(); ++i; } while (depth > 0);
      }
    }
  }

  std::uint32_t statement() {
    bool top = topLevel;
    topLevel = false;
    skipDecorators();
    std::uint32_t st = cur().start;
    if (isKw("import") && !(isP("(", 1) || isP(".", 1))) { if (!top) unsupported("imports below the top level"); return importDecl(); }
    if (isKw("export")) { if (!top) unsupported("exports below the top level"); return exportDecl(); }
    if (isKw("with")) fail(kZWithForbidden, cur().start, "");
    if (cur().kind == Tok::Ident && isP(":", 1)) {  // `label: statement`, the target of `break label` and `continue label`
      std::string_view label = txt();
      i += 2;
      std::uint32_t body = statement();
      return mk(N::Labeled, st, prevEnd(), label, {body});
    }
    if (isP("{")) return block();
    if (isP(";")) { ++i; return mk(N::Empty, st, prevEnd()); }
    if (isId("declare") && !newlineAt(1) && (at(1).kind == Tok::Keyword || at(1).kind == Tok::Ident) && !isP("=", 1)) {  // `declare const x: T`: ambient, ignored
      ++i;
      statement();
      return mk(N::Empty, st, prevEnd(), "declare");
    }
    if (isKw("const") && at(1).kind == Tok::Keyword && txt(at(1)) == "enum") { ++i; std::uint32_t id = enumDecl(); r.ast.nodes[id].start = st; return id; }  // a const enum is an enum
    if (atVarDecl()) return varDecl(true);
    if (isKw("function")) return function();
    if (isId("async") && at(1).kind == Tok::Keyword && txt(at(1)) == "function" && !newlineAt(1)) { ++i; return function(true, st); }
    if (isKw("class")) return classDecl(0);
    if (isId("abstract") && at(1).kind == Tok::Keyword && txt(at(1)) == "class") { ++i; std::uint32_t id = classDecl(kFlagAbstract); r.ast.nodes[id].start = st; return id; }
    if (isId("interface") && at(1).kind == Tok::Ident) return interfaceDecl();
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
      if (!isKw("while")) fail(kZExpected, cur().start, "'while'");
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
      std::string_view label;
      if (cur().kind == Tok::Ident && !newlineBefore()) { label = txt(); ++i; }
      semi();
      return mk(brk ? N::Break : N::Continue, st, prevEnd(), label);
    }
    if (isKw("switch")) return switchStmt();
    if (isKw("throw")) {
      ++i;
      if (newlineBefore()) fail(kZExpected, cur().start, "an expression after 'throw' on the same line");
      std::uint32_t e = expression();
      semi();
      return mk(N::Throw, st, prevEnd(), {}, {e});
    }
    if (isKw("try")) {
      ++i;
      std::uint32_t body = block(), param = kNone, handler = kNone, fin = kNone;
      if (isKw("catch")) {
        ++i;
        if (eatP("(")) {
          if (cur().kind != Tok::Ident) unexpected();
          param = mk(N::Ident, cur().start, cur().end, txt());
          ++i;
          if (eatP(":")) type();  // the variable is an Error whatever is written
          expectP(")");
        }
        handler = block();
      }
      if (isKw("finally")) { ++i; fin = block(); }
      if (handler == kNone && fin == kNone) fail(kZExpected, cur().start, "'catch' or 'finally'");
      return mk(N::Try, st, prevEnd(), {}, {body, param, handler, fin});
    }
    if (isId("type") && at(1).kind == Tok::Ident) {  // type Name<T> = Type;
      ++i;
      std::string_view name = txt(); ++i;
      std::vector<std::uint32_t> tps;
      if (isP("<")) tps = typeParams();
      expectP("=");
      std::uint32_t ty = type();
      semi();
      std::uint32_t id = mk(N::TypeAlias, st, prevEnd(), name, {ty});
      if (!tps.empty()) r.ast.tparams[id] = std::move(tps);
      return id;
    }
    if (isKw("enum")) return enumDecl();
    std::uint32_t e = expression();
    semi();
    return mk(N::ExprStmt, st, prevEnd(), {}, {e});
  }

  void run() {
    std::uint32_t st = cur().start;
    std::vector<std::uint32_t> ss;
    while (!eof()) { topLevel = true; ss.push_back(statement()); }
    r.ast.root = mk(N::Program, st, cur().end, {}, std::move(ss));
  }
};

const char* kindName(N k) {
  static const char* names[] = {"Program", "Block", "Empty", "VarDecl", "Declarator", "Function", "Param", "Class",
      "Interface", "Heritage", "Field", "Method", "If", "For", "ForOf", "ForIn", "While", "DoWhile", "Return", "Break", "Continue", "ExprStmt",
      "Ident", "Number", "BigInt", "String", "Template", "Literal", "This", "Super", "Array", "Spread", "Binary", "Unary",
      "UpdatePre", "UpdatePost", "Assign", "Cond", "Call", "New", "Member", "Index", "TypeRef", "TypeArray",
      "TypeUnion", "TypeFunc", "TypeTuple", "TypeLit", "TypeParam", "ArrayPattern", "ObjectPattern", "PatProp", "TypeAlias", "FuncExpr",
      "Import", "ImportSpec", "Export", "ExportList", "ExportSpec", "ExportAll", "Switch", "Case", "Enum", "EnumMember", "ObjectLit", "Prop", "As", "Try", "Throw", "Await", "Yield", "TypeObject", "NonNull", "Regex", "Labeled", "TypeOther"};
  return names[static_cast<int>(k)];
}

void dumpNode(const Ast& a, std::uint32_t n, int depth, std::string& out) {
  out.append(static_cast<std::size_t>(depth) * 2, ' ');
  if (n == kNone) { out += "_\n"; return; }
  const Node& x = a.nodes[n];
  out += kindName(x.kind);
  if (!x.text.empty()) { out += ' '; out += x.text; }
  if (x.flags) {
    static const char* fn[] = {"abstract", "static", "readonly", "private", "protected", "public", "override", "synthetic", "arrow", "getter", "async", "generator"};
    out += " [";
    bool first = true;
    for (int b = 0; b < 12; ++b) if (x.flags & (1u << b)) { out += (first ? "" : " "); out += fn[b]; first = false; }
    out += "]";
  }
  out += '\n';
  auto tp = a.tparams.find(n);
  if (tp != a.tparams.end()) {
    out.append(static_cast<std::size_t>(depth + 1) * 2, ' '); out += "TypeParams\n";
    for (std::uint32_t k : tp->second) dumpNode(a, k, depth + 2, out);
  }
  auto ta = a.targs.find(n);
  if (ta != a.targs.end()) {
    out.append(static_cast<std::size_t>(depth + 1) * 2, ' '); out += "TypeArgs\n";
    for (std::uint32_t k : ta->second) dumpNode(a, k, depth + 2, out);
  }
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
