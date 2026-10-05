#include "frontend/check.h"

#include <functional>
#include <unordered_map>

#include "frontend/lexer.h"

namespace zn::frontend {
namespace {

constexpr TypeId tError = 0, tAny = 1, tBool = 2, tStr = 3, tVoid = 4, tNull = 5;

bool isInt(Num m) { return m != Num::f64 && m != Num::f32 && m != Num::fx12 && m != Num::fx16; }
bool isFx(Num m) { return m == Num::fx12 || m == Num::fx16; }
bool isFloat(Num m) { return m == Num::f64 || m == Num::f32 || isFx(m); }

const char* numName(Num m) {
  static const char* n[] = {"f64", "f32", "fx12", "fx16", "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "isize", "usize"};
  return n[static_cast<int>(m)];
}

bool numFromName(std::string_view s, Num& out) {
  static const std::pair<const char*, Num> t[] = {{"number", Num::f64}, {"f64", Num::f64}, {"f32", Num::f32}, {"fx12", Num::fx12},
      {"fx16", Num::fx16}, {"i8", Num::i8}, {"i16", Num::i16}, {"i32", Num::i32}, {"i64", Num::i64}, {"u8", Num::u8},
      {"u16", Num::u16}, {"u32", Num::u32}, {"u64", Num::u64}, {"isize", Num::isize}, {"usize", Num::usize}};
  for (auto& [n, m] : t) if (s == n) { out = m; return true; }
  return false;
}

// Lossless implicit conversions between machine kinds.
bool widens(Num from, Num to) {
  if (from == to) return true;
  auto in = [&](std::initializer_list<Num> l) { for (Num x : l) if (x == from) return true; return false; };
  switch (to) {
    case Num::f64: return in({Num::f32, Num::i8, Num::i16, Num::i32, Num::u8, Num::u16, Num::u32});
    case Num::f32: return in({Num::i8, Num::i16, Num::u8, Num::u16});
    case Num::i64: return in({Num::i8, Num::i16, Num::i32, Num::u8, Num::u16, Num::u32});
    case Num::isize: return in({Num::i8, Num::i16, Num::i32, Num::u8, Num::u16});
    case Num::u64: return in({Num::u8, Num::u16, Num::u32});
    case Num::usize: return in({Num::u8, Num::u16});
    case Num::i32: return in({Num::i8, Num::i16, Num::u8, Num::u16});
    case Num::u32: return in({Num::u8, Num::u16});
    case Num::i16: return in({Num::i8, Num::u8});
    case Num::u16: return in({Num::u8});
    default: return false;
  }
}

struct Checker {
  const Ast& a;
  Checked out;
  std::vector<std::unordered_map<std::string_view, std::uint32_t>> scopes;
  std::vector<std::function<void()>>* defer = nullptr;
  TypeId curRet = kNoType;      // return type of the enclosing function
  std::uint32_t curClass = kNone;  // ObjInfo index of the enclosing class
  int loops = 0;

  explicit Checker(const Ast& ast) : a(ast) {
    out.nodeType.assign(a.nodes.size(), kNoType);
    out.nodeSym.assign(a.nodes.size(), kNone);
    for (TK k : {TK::Error, TK::Any, TK::Bool, TK::Str, TK::Void, TK::Null}) { Type t; t.k = k; out.types.push_back(t); }
  }

  // ---- diagnostics
  void diag(const char* code, std::uint32_t node, std::string detail = "") {
    out.diags.push_back({code, a.nodes[node].start, std::move(detail)});
  }
  const Node& n(std::uint32_t i) const { return a.nodes[i]; }

  // ---- types
  TypeId intern(const Type& t) {
    for (TypeId i = 0; i < out.types.size(); ++i) {
      const Type& u = out.types[i];
      if (u.k == t.k && u.num == t.num && u.elem == t.elem && u.params == t.params && u.minArgs == t.minArgs && u.variadic == t.variadic && u.obj == t.obj) return i;
    }
    out.types.push_back(t);
    return static_cast<TypeId>(out.types.size() - 1);
  }
  TypeId num(Num m) { Type t; t.k = TK::Num; t.num = m; return intern(t); }
  TypeId arrayOf(TypeId e) { Type t; t.k = TK::Array; t.elem = e; return intern(t); }
  TypeId func(std::vector<TypeId> ps, TypeId ret, std::uint32_t minArgs, bool variadic = false) {
    Type t; t.k = TK::Func; t.elem = ret; t.params = std::move(ps); t.minArgs = minArgs; t.variadic = variadic; return intern(t);
  }
  TypeId objType(std::uint32_t o) { Type t; t.k = TK::Object; t.obj = o; return intern(t); }
  const Type& ty(TypeId t) const { return out.types[t]; }
  bool isNum(TypeId t) const { return ty(t).k == TK::Num; }
  bool bad(TypeId t) const { return ty(t).k == TK::Error; }
  std::string name(TypeId t) const { return typeName(out, t); }

  static bool isIntLit(const Ast& ast, std::uint32_t i) {
    const Node& x = ast.nodes[i];
    if (x.kind == N::Number) {
      if (x.text.size() > 1 && x.text[0] == '0' && (x.text[1] == 'x' || x.text[1] == 'X' || x.text[1] == 'b' || x.text[1] == 'B' || x.text[1] == 'o' || x.text[1] == 'O')) return true;
      return x.text.find_first_of(".eE") == std::string_view::npos;
    }
    if (x.kind == N::Unary && (x.text == "-" || x.text == "+")) return isIntLit(ast, x.kids[0]);
    return false;
  }
  static bool isNumLit(const Ast& ast, std::uint32_t i) {
    const Node& x = ast.nodes[i];
    return x.kind == N::Number || (x.kind == N::Unary && (x.text == "-" || x.text == "+") && isNumLit(ast, x.kids[0]));
  }

  bool assignable(TypeId from, TypeId to, std::uint32_t node) {
    if (from == to || bad(from) || bad(to) || ty(to).k == TK::Any) return true;
    const Type &f = ty(from), &t = ty(to);
    if (f.k == TK::Num && t.k == TK::Num) {
      if (node != kNone && isNumLit(a, node)) return isIntLit(a, node) || isFloat(t.num);  // literals adapt to the target kind
      return widens(f.num, t.num);
    }
    return false;
  }
  bool require(TypeId from, TypeId to, std::uint32_t node) {
    if (assignable(from, to, node)) return true;
    diag(kZNotAssignable, node, "'" + name(from) + "' to '" + name(to) + "'");
    return false;
  }

  // ---- scopes
  void push() { scopes.emplace_back(); }
  void pop() { scopes.pop_back(); }
  std::uint32_t declare(SymKind k, std::string_view nm, TypeId t, std::uint32_t decl, bool isConst, std::uint32_t at) {
    if (scopes.back().count(nm)) { diag(kZDuplicateDeclaration, at, "'" + std::string(nm) + "'"); return scopes.back()[nm]; }
    out.syms.push_back({k, nm, t, decl, isConst});
    auto id = static_cast<std::uint32_t>(out.syms.size() - 1);
    scopes.back()[nm] = id;
    return id;
  }
  std::uint32_t lookup(std::string_view nm) const {
    for (auto it = scopes.rbegin(); it != scopes.rend(); ++it) { auto f = it->find(nm); if (f != it->end()) return f->second; }
    return kNone;
  }

  void builtins() {
    push();
    auto mathFn = [&](const char* nm, int argc, ObjInfo& o) {
      o.members.push_back({nm, func(std::vector<TypeId>(static_cast<std::size_t>(argc), num(Num::f64)), num(Num::f64), static_cast<std::uint32_t>(argc)), true, true});
    };
    ObjInfo math{"Math", {}, kNone, false};
    math.members.push_back({"PI", num(Num::f64), true, false});
    math.members.push_back({"E", num(Num::f64), true, false});
    for (const char* f : {"sqrt", "abs", "floor", "ceil", "round", "trunc", "sin", "cos", "tan", "atan", "exp", "log"}) mathFn(f, 1, math);
    for (const char* f : {"pow", "atan2", "min", "max"}) mathFn(f, 2, math);
    out.objs.push_back(math);
    declare(SymKind::Builtin, "Math", objType(static_cast<std::uint32_t>(out.objs.size() - 1)), kNone, true, 0);
    ObjInfo con{"console", {}, kNone, false};
    con.members.push_back({"log", func({tAny}, tVoid, 0, true), true, true});
    out.objs.push_back(con);
    declare(SymKind::Builtin, "console", objType(static_cast<std::uint32_t>(out.objs.size() - 1)), kNone, true, 0);
    declare(SymKind::Builtin, "NaN", num(Num::f64), kNone, true, 0);
    declare(SymKind::Builtin, "Infinity", num(Num::f64), kNone, true, 0);
  }

  // ---- type annotations
  TypeId annotation(std::uint32_t t) {
    const Node& x = n(t);
    TypeId r = tError;
    switch (x.kind) {
      case N::TypeRef: {
        Num m;
        if (x.kids.empty() && numFromName(x.text, m)) r = num(m);
        else if (x.kids.empty() && x.text == "boolean") r = tBool;
        else if (x.kids.empty() && x.text == "string") r = tStr;
        else if (x.kids.empty() && x.text == "void") r = tVoid;
        else if (x.kids.empty() && x.text == "null") r = tNull;
        else if (x.text == "Array" && x.kids.size() == 1) r = arrayOf(annotation(x.kids[0]));
        else {
          std::uint32_t s = x.kids.empty() ? lookup(x.text) : kNone;
          if (s != kNone && out.syms[s].kind == SymKind::Class) r = out.syms[s].type;
          else diag(kZCannotFindName, t, "'" + std::string(x.text) + "'");
        }
        break;
      }
      case N::TypeArray: r = arrayOf(annotation(x.kids[0])); break;
      default: diag(kZUnsupported, t, "this type syntax"); break;
    }
    out.nodeType[t] = r;
    return r;
  }

  // ---- members
  const Member* findMember(TypeId t, std::string_view nm) {
    if (ty(t).k != TK::Object) return nullptr;
    for (const Member& m : out.objs[ty(t).obj].members) if (m.name == nm) return &m;
    return nullptr;
  }
  // Builtin members of primitives and arrays; the result's Member lives in `scratch`.
  bool primMember(TypeId t, std::string_view nm, Member& scratch) {
    const Type& x = ty(t);
    if (x.k == TK::Array && nm == "length") { scratch = {"length", num(Num::i32), false, false}; return true; }
    if (x.k == TK::Array && nm == "push") { scratch = {"push", func({x.elem}, num(Num::i32), 1), true, true}; return true; }
    if (x.k == TK::Array && nm == "pop") { scratch = {"pop", func({}, x.elem, 0), true, true}; return true; }
    if (x.k == TK::Str && nm == "length") { scratch = {"length", num(Num::i32), true, false}; return true; }
    if (x.k == TK::Num && nm == "toFixed") { scratch = {"toFixed", func({num(Num::i32)}, tStr, 0), true, true}; return true; }
    return false;
  }

  // ---- expressions
  TypeId expr(std::uint32_t i, TypeId expected = kNoType) {
    TypeId t = expr0(i, expected);
    out.nodeType[i] = t;
    return t;
  }

  // Arithmetic result kind, ported from compiler/src/sema.ts `arith` (LNG-05), number type = f64.
  Num arith(const std::string& op, std::uint32_t le, Num lm, std::uint32_t re, Num rm) {
    bool llit = isIntLit(a, le), rlit = isIntLit(a, re);
    Num x = (llit && (isInt(rm) || isFx(rm))) ? rm : lm;
    Num y = (rlit && (isInt(lm) || isFx(lm))) ? lm : rm;
    if (op == "/" || op == "**") {
      if (x == Num::f64 || y == Num::f64) return Num::f64;
      if (x == Num::f32 || y == Num::f32) return Num::f32;
      if (isFx(x)) return x;
      if (isFx(y)) return y;
      return Num::f64;
    }
    if (x == Num::f64 || y == Num::f64) return Num::f64;
    if (x == Num::f32 || y == Num::f32) return Num::f32;
    if (isFx(x) || isFx(y)) return isFx(x) ? x : y;
    auto wide = [](Num m) { return (m == Num::i8 || m == Num::i16 || m == Num::u8 || m == Num::u16) ? Num::i32 : m == Num::isize ? Num::i64 : m == Num::usize ? Num::u64 : m; };
    Num wx = wide(x), wy = wide(y);
    if (wx == wy) return wx;
    if (wx == Num::i64 || wy == Num::i64) return Num::i64;
    return Num::f64;
  }

  bool comparable(TypeId l, TypeId r) { return l == r || (isNum(l) && isNum(r)) || bad(l) || bad(r); }

  TypeId binaryExpr(std::uint32_t i, const Node& x) {
    const std::string op(x.text);
    std::uint32_t le = x.kids[0], re = x.kids[1];
    if (op == ",") { expr(le); return expr(re); }
    if (op == "in" || op == "instanceof" || op == "??") { diag(kZUnsupported, i, "operator '" + op + "'"); return tError; }
    TypeId l = expr(le), r = expr(re);
    if (bad(l) || bad(r)) return (op == "&&" || op == "||" || op == "==" || op == "!=" || op == "===" || op == "!==" || op == "<" || op == ">" || op == "<=" || op == ">=") ? tBool : tError;
    auto fail = [&]() { diag(kZBadOperand, i, "'" + op + "' on '" + name(l) + "' and '" + name(r) + "'"); return tError; };
    if (op == "&&" || op == "||") return (l == tBool && r == tBool) ? tBool : (diag(kZNotAssignable, l == tBool ? re : le, "'" + name(l == tBool ? r : l) + "' to 'boolean'"), tBool);
    if (op == "==" || op == "!=" || op == "===" || op == "!==") return comparable(l, r) ? tBool : (fail(), tBool);
    if (op == "<" || op == ">" || op == "<=" || op == ">=") return ((isNum(l) && isNum(r)) || (l == tStr && r == tStr)) ? tBool : (fail(), tBool);
    if (op == "+" && (l == tStr || r == tStr)) return ((l == tStr || isNum(l) || l == tBool) && (r == tStr || isNum(r) || r == tBool)) ? tStr : fail();
    if (!isNum(l) || !isNum(r)) return fail();
    if (op == "&" || op == "|" || op == "^" || op == "<<" || op == ">>") return num(Num::i32);
    if (op == ">>>") return num(Num::u32);
    return num(arith(op, le, ty(l).num, re, ty(r).num));
  }

  bool lvalue(std::uint32_t t) {
    const Node& x = n(t);
    if (x.kind == N::Ident) {
      std::uint32_t s = out.nodeSym[t];
      if (s != kNone && (out.syms[s].isConst || out.syms[s].kind == SymKind::Func || out.syms[s].kind == SymKind::Class || out.syms[s].kind == SymKind::Builtin)) { diag(kZAssignToConst, t, "'" + std::string(x.text) + "'"); return false; }
      return true;
    }
    if (x.kind == N::Member) {
      TypeId ot = out.nodeType[x.kids[0]];
      Member scratch;
      const Member* m = findMember(ot, x.text);
      if (!m && primMember(ot, x.text, scratch)) m = &scratch;
      if (m && (m->readonly || m->method)) { diag(kZAssignToConst, t, "'" + std::string(x.text) + "'"); return false; }
      return true;
    }
    return x.kind == N::Index;
  }

  TypeId callExpr(std::uint32_t i, const Node& x, bool isNew) {
    std::uint32_t callee = x.kids[0];
    TypeId ft = kNoType;
    TypeId result = tError;
    if (isNew) {
      const Node& c = n(callee);
      std::uint32_t s = c.kind == N::Ident ? lookup(c.text) : kNone;
      if (s == kNone || out.syms[s].kind != SymKind::Class) {
        if (c.kind == N::Ident && s == kNone) diag(kZCannotFindName, callee, "'" + std::string(c.text) + "'");
        else diag(kZNotCallable, callee, "only classes can be used with new");
        for (std::size_t k = 1; k < x.kids.size(); ++k) expr(x.kids[k]);
        return tError;
      }
      out.nodeSym[callee] = s;
      result = out.syms[s].type;
      ft = out.objs[ty(result).obj].ctor;
      if (ft == kNoType) ft = func({}, tVoid, 0);
    } else {
      TypeId ct = expr(callee);
      if (bad(ct)) { for (std::size_t k = 1; k < x.kids.size(); ++k) expr(x.kids[k]); return tError; }
      if (ty(ct).k != TK::Func) {
        diag(kZNotCallable, callee, "'" + name(ct) + "'");
        for (std::size_t k = 1; k < x.kids.size(); ++k) expr(x.kids[k]);
        return tError;
      }
      ft = ct;
      result = ty(ft).elem;
    }
    const Type f = ty(ft);  // copy: expr() below may grow `types`
    std::size_t argc = x.kids.size() - 1;
    if (argc < f.minArgs || (!f.variadic && argc > f.params.size())) {
      diag(kZWrongArgCount, i, "expected " + std::to_string(f.minArgs) + (f.minArgs == f.params.size() ? "" : "-" + std::to_string(f.params.size())) + ", got " + std::to_string(argc));
    }
    for (std::size_t k = 0; k < argc; ++k) {
      std::uint32_t arg = x.kids[k + 1];
      if (n(arg).kind == N::Spread) { diag(kZUnsupported, arg, "spread arguments"); continue; }
      TypeId expected = k < f.params.size() ? f.params[k] : (f.variadic && !f.params.empty() ? f.params.back() : kNoType);
      TypeId at = expr(arg, expected);
      if (expected != kNoType) require(at, expected, arg);
    }
    return result;
  }

  TypeId expr0(std::uint32_t i, TypeId expected) {
    const Node& x = n(i);
    switch (x.kind) {
      case N::Number: return num(Num::f64);
      case N::BigInt: diag(kZUnsupported, i, "bigint"); return tError;
      case N::String: return tStr;
      case N::Template: for (std::uint32_t k : x.kids) expr(k); return tStr;
      case N::Literal: return x.text == "null" ? tNull : tBool;
      case N::This:
        if (curClass == kNone) { diag(kZNotAllowedHere, i, "'this'"); return tError; }
        return objType(curClass);
      case N::Ident: {
        std::uint32_t s = lookup(x.text);
        if (s == kNone) { diag(kZCannotFindName, i, "'" + std::string(x.text) + "'"); return tError; }
        out.nodeSym[i] = s;
        if (out.syms[s].kind == SymKind::Class) { diag(kZNotAllowedHere, i, "class '" + std::string(x.text) + "' used as a value"); return tError; }
        return out.syms[s].type;
      }
      case N::Array: {
        TypeId el = (expected != kNoType && ty(expected).k == TK::Array) ? ty(expected).elem : kNoType;
        if (x.kids.empty()) {
          if (el == kNoType) { diag(kZCannotInfer, i, "empty array literal"); return tError; }
          return arrayOf(el);
        }
        TypeId first = tError;
        for (std::size_t k = 0; k < x.kids.size(); ++k) {
          std::uint32_t e = x.kids[k];
          if (n(e).kind == N::Spread) { diag(kZUnsupported, e, "spread elements"); continue; }
          TypeId t = expr(e, el);
          if (el != kNoType) require(t, el, e);
          else if (k == 0) first = t;
          else if (!assignable(t, first, e)) { diag(kZNotAssignable, e, "'" + name(t) + "' to '" + name(first) + "'"); }
        }
        return arrayOf(el != kNoType ? el : first);
      }
      case N::Binary: return binaryExpr(i, x);
      case N::Unary: {
        const std::string op(x.text);
        TypeId t = expr(x.kids[0]);
        if (bad(t)) return op == "!" ? tBool : tError;
        if (op == "!") { if (t != tBool) diag(kZNotAssignable, x.kids[0], "'" + name(t) + "' to 'boolean'"); return tBool; }
        if (op == "typeof") return tStr;
        if (op == "void") return tVoid;
        if (op == "delete") { diag(kZUnsupported, i, "'delete'"); return tError; }
        if (!isNum(t)) { diag(kZBadOperand, i, "'" + op + "' on '" + name(t) + "'"); return tError; }
        return op == "~" ? num(Num::i32) : t;
      }
      case N::UpdatePre: case N::UpdatePost: {
        TypeId t = expr(x.kids[0]);
        if (bad(t)) return tError;
        if (!isNum(t)) { diag(kZBadOperand, i, "'" + std::string(x.text) + "' on '" + name(t) + "'"); return tError; }
        lvalue(x.kids[0]);
        return t;
      }
      case N::Assign: {
        std::uint32_t target = x.kids[0], value = x.kids[1];
        TypeId tt = expr(target);
        bool ok = lvalue(target);
        const std::string op(x.text);
        if (op == "=") {
          TypeId vt = expr(value, tt);
          if (ok) require(vt, tt, value);
          return tt;
        }
        TypeId vt = expr(value);
        if (bad(tt) || bad(vt)) return tt;
        std::string bop = op.substr(0, op.size() - 1);
        if (bop == "&&" || bop == "||" || bop == "?\?") { diag(kZUnsupported, i, "operator '" + op + "'"); return tt; }
        if (bop == "+" && tt == tStr && (vt == tStr || isNum(vt) || vt == tBool)) return tt;
        if (!isNum(tt) || !isNum(vt)) { diag(kZBadOperand, i, "'" + op + "' on '" + name(tt) + "' and '" + name(vt) + "'"); return tt; }
        Num r = (bop == "&" || bop == "|" || bop == "^" || bop == "<<" || bop == ">>") ? Num::i32 : bop == ">>>" ? Num::u32 : arith(bop, target, ty(tt).num, value, ty(vt).num);
        if (!widens(r, ty(tt).num)) diag(kZNotAssignable, i, "'" + std::string(numName(r)) + "' to '" + name(tt) + "'");
        return tt;
      }
      case N::Cond: {
        TypeId c = expr(x.kids[0]);
        if (!bad(c) && c != tBool) diag(kZNotAssignable, x.kids[0], "'" + name(c) + "' to 'boolean'");
        TypeId p = expr(x.kids[1], expected), q = expr(x.kids[2], expected);
        if (bad(p)) return q;
        if (bad(q)) return p;
        if (assignable(q, p, x.kids[2])) return p;
        if (assignable(p, q, x.kids[1])) return q;
        diag(kZNotAssignable, x.kids[2], "'" + name(q) + "' to '" + name(p) + "'");
        return p;
      }
      case N::Call: return callExpr(i, x, false);
      case N::New: return callExpr(i, x, true);
      case N::Member: {
        if (x.text.size() && x.text[0] == '?') { diag(kZUnsupported, i, "optional chaining"); return tError; }
        TypeId ot = expr(x.kids[0]);
        if (bad(ot)) return tError;
        Member scratch;
        const Member* m = findMember(ot, x.text);
        if (!m && primMember(ot, x.text, scratch)) m = &scratch;
        if (!m) { diag(kZNoSuchProperty, i, "'" + std::string(x.text) + "' on '" + name(ot) + "'"); return tError; }
        return m->type;
      }
      case N::Index: {
        TypeId ot = expr(x.kids[0]), it = expr(x.kids[1]);
        if (bad(ot) || bad(it)) return tError;
        if (ty(ot).k != TK::Array) { diag(kZNotIndexable, i, "'" + name(ot) + "'"); return tError; }
        if (!isNum(it)) { diag(kZNotAssignable, x.kids[1], "'" + name(it) + "' to 'number'"); return tError; }
        return ty(ot).elem;
      }
      default: diag(kZUnsupported, i, "this expression"); return tError;
    }
  }

  // ---- statements
  static bool hasValueReturn(const Ast& ast, std::uint32_t s) {
    if (s == kNone) return false;
    const Node& x = ast.nodes[s];
    if (x.kind == N::Function || x.kind == N::Class) return false;
    if (x.kind == N::Return) return x.kids[0] != kNone;
    for (std::uint32_t k : x.kids) if (k != kNone && hasValueReturn(ast, k)) return true;
    return false;
  }
  static bool hasBreak(const Ast& ast, std::uint32_t s) {  // a `break` that targets the loop whose body is s
    if (s == kNone) return false;
    const Node& x = ast.nodes[s];
    if (x.kind == N::Break) return true;
    if (x.kind == N::For || x.kind == N::ForOf || x.kind == N::ForIn || x.kind == N::While || x.kind == N::DoWhile || x.kind == N::Function || x.kind == N::Class) return false;
    for (std::uint32_t k : x.kids) if (hasBreak(ast, k)) return true;
    return false;
  }
  bool endless(std::uint32_t test) const { return test == kNone || (n(test).kind == N::Literal && n(test).text == "true"); }
  bool terminates(std::uint32_t s) const {
    if (s == kNone) return false;
    const Node& x = n(s);
    switch (x.kind) {
      case N::Return: return true;
      case N::Block: for (std::uint32_t k : x.kids) if (terminates(k)) return true; return false;
      case N::If: return x.kids[2] != kNone && terminates(x.kids[1]) && terminates(x.kids[2]);
      case N::While: return endless(x.kids[0]) && !hasBreak(a, x.kids[1]);
      case N::DoWhile: return endless(x.kids[1]) && !hasBreak(a, x.kids[0]);
      case N::For: return endless(x.kids[1]) && !hasBreak(a, x.kids[3]);
      default: return false;
    }
  }

  TypeId condition(std::uint32_t e) {
    TypeId t = expr(e);
    if (!bad(t) && t != tBool) diag(kZNotAssignable, e, "'" + name(t) + "' to 'boolean'");
    return t;
  }

  void varDecl(std::uint32_t d, bool isConst) {
    const Node& x = n(d);
    std::uint32_t ann = x.kids[0], init = x.kids[1];
    TypeId t = tError;
    if (init == kNone) diag(kZUnsupported, d, "declarations without an initializer");
    if (ann != kNone) {
      t = annotation(ann);
      if (init != kNone) require(expr(init, t), t, init);
    } else if (init != kNone) {
      t = expr(init);
      if (t == tNull || t == tVoid) { diag(kZCannotInfer, d, "'" + std::string(x.text) + "'"); t = tError; }
    }
    out.nodeType[d] = t;
    out.nodeSym[d] = declare(SymKind::Var, x.text, t, d, isConst, d);
  }

  void statement(std::uint32_t s) {
    const Node& x = n(s);
    switch (x.kind) {
      case N::Empty: break;
      case N::Block: push(); stmtList(x.kids); pop(); break;
      case N::VarDecl: for (std::uint32_t d : x.kids) varDecl(d, x.text == "const"); break;
      case N::ExprStmt: expr(x.kids[0]); break;
      case N::If:
        condition(x.kids[0]);
        statement(x.kids[1]);
        if (x.kids[2] != kNone) statement(x.kids[2]);
        break;
      case N::While: condition(x.kids[0]); ++loops; statement(x.kids[1]); --loops; break;
      case N::DoWhile: ++loops; statement(x.kids[0]); --loops; condition(x.kids[1]); break;
      case N::For: {
        push();
        if (x.kids[0] != kNone) { if (n(x.kids[0]).kind == N::VarDecl) statement(x.kids[0]); else expr(x.kids[0]); }
        if (x.kids[1] != kNone) condition(x.kids[1]);
        if (x.kids[2] != kNone) expr(x.kids[2]);
        ++loops; statement(x.kids[3]); --loops;
        pop();
        break;
      }
      case N::ForOf: case N::ForIn: {
        if (x.kind == N::ForIn) { diag(kZUnsupported, s, "for...in"); break; }
        TypeId it = expr(x.kids[1]);
        TypeId el = tError;
        if (!bad(it)) { if (ty(it).k == TK::Array) el = ty(it).elem; else diag(kZNotIndexable, x.kids[1], "'" + name(it) + "'"); }
        push();
        const Node& d = n(x.kids[0]);
        out.nodeType[x.kids[0]] = el;
        out.nodeSym[x.kids[0]] = declare(SymKind::Var, d.text, el, x.kids[0], x.text == "const", x.kids[0]);
        ++loops; statement(x.kids[2]); --loops;
        pop();
        break;
      }
      case N::Return: {
        if (curRet == kNoType) { diag(kZNotAllowedHere, s, "'return' outside a function"); break; }
        if (x.kids[0] == kNone) { if (curRet != tVoid && !bad(curRet) && ty(curRet).k != TK::Any) diag(kZNotAssignable, s, "'void' to '" + name(curRet) + "'"); break; }
        TypeId t = expr(x.kids[0], curRet);
        require(t, curRet, x.kids[0]);
        break;
      }
      case N::Break: case N::Continue:
        if (loops == 0) diag(kZNotAllowedHere, s, x.kind == N::Break ? "'break' outside a loop" : "'continue' outside a loop");
        break;
      case N::Function: case N::Class: break;  // hoisted by stmtList
      default: diag(kZUnsupported, s, "this statement"); break;
    }
  }

  // ---- functions and classes
  TypeId signature(const Node& f, std::size_t firstParam, bool isCtor, std::vector<std::uint32_t>& params) {
    std::vector<TypeId> ps;
    std::uint32_t minArgs = 0;
    bool optional = false;
    for (std::size_t k = firstParam; k < f.kids.size(); ++k) {
      std::uint32_t p = f.kids[k];
      const Node& pn = n(p);
      params.push_back(p);
      TypeId t = tError;
      if (pn.text.size() > 3 && pn.text.substr(0, 3) == "...") diag(kZUnsupported, p, "rest parameters");
      else if (pn.kids[0] == kNone) diag(kZCannotInfer, p, "parameter '" + std::string(pn.text) + "'");
      else t = annotation(pn.kids[0]);
      out.nodeType[p] = t;
      ps.push_back(t);
      if (pn.kids[1] != kNone) optional = true;
      if (!optional) minArgs = static_cast<std::uint32_t>(ps.size());
    }
    TypeId ret = tVoid;
    if (!isCtor) {
      if (f.kids[0] != kNone) ret = annotation(f.kids[0]);
      else if (f.kids[1] != kNone && hasValueReturn(a, f.kids[1])) { diag(kZCannotInfer, f.kids[1], "return type of '" + std::string(f.text) + "'"); ret = tError; }
    }
    return func(std::move(ps), ret, minArgs);
  }

  void checkBody(std::uint32_t fn, TypeId sig, const std::vector<std::uint32_t>& params, bool isCtor) {
    const Node& f = n(fn);
    if (f.kids[1] == kNone) return;
    Type ft = ty(sig);
    TypeId savedRet = curRet; int savedLoops = loops;
    curRet = isCtor ? tVoid : ft.elem; loops = 0;
    push();
    for (std::size_t k = 0; k < params.size(); ++k) {
      const Node& p = n(params[k]);
      if (p.kids[1] != kNone) require(expr(p.kids[1], ft.params[k]), ft.params[k], p.kids[1]);
      out.nodeSym[params[k]] = declare(SymKind::Param, p.text, ft.params[k], params[k], false, params[k]);
    }
    stmtList(n(f.kids[1]).kids);
    pop();
    if (!isCtor && curRet != tVoid && !bad(curRet) && ty(curRet).k != TK::Any && !terminates(f.kids[1])) diag(kZMissingReturn, fn, "'" + std::string(f.text) + "'");
    curRet = savedRet; loops = savedLoops;
  }

  void classMembers(std::uint32_t cls, std::uint32_t objIdx) {
    const Node& c = n(cls);
    TypeId self = objType(objIdx);
    std::vector<std::pair<std::uint32_t, TypeId>> methods;  // node, signature
    std::vector<std::vector<std::uint32_t>> methodParams;
    std::uint32_t ctorNode = kNone;
    for (std::uint32_t m : c.kids) {
      const Node& mn = n(m);
      bool dup = false;
      for (const Member& e : out.objs[objIdx].members) if (e.name == mn.text) dup = true;
      if (dup || (mn.kind == N::Method && mn.text == "constructor" && ctorNode != kNone)) { diag(kZDuplicateDeclaration, m, "'" + std::string(mn.text) + "'"); continue; }
      if (mn.kind == N::Field) {
        TypeId t = tError;
        if (mn.kids[0] != kNone) t = annotation(mn.kids[0]);
        else if (mn.kids[1] != kNone) {
          const Node& in = n(mn.kids[1]);
          t = in.kind == N::Number ? num(Num::f64) : in.kind == N::String ? tStr : (in.kind == N::Literal && in.text != "null") ? tBool : tError;
          if (t == tError) diag(kZCannotInfer, m, "field '" + std::string(mn.text) + "'");
        } else diag(kZCannotInfer, m, "field '" + std::string(mn.text) + "'");
        out.nodeType[m] = t;
        out.objs[objIdx].members.push_back({std::string(mn.text), t, false, false});
      } else {
        std::vector<std::uint32_t> ps;
        bool isCtor = mn.text == "constructor";
        TypeId sig = signature(mn, 2, isCtor, ps);
        out.nodeType[m] = sig;
        if (isCtor) { out.objs[objIdx].ctor = func(ty(sig).params, self, ty(sig).minArgs); ctorNode = m; }
        else out.objs[objIdx].members.push_back({std::string(mn.text), sig, true, true});
        methods.push_back({m, sig});
        methodParams.push_back(std::move(ps));
      }
    }
    // strictPropertyInitialization: a field without initializer must be assigned at the top level of the constructor
    for (std::uint32_t m : c.kids) {
      const Node& mn = n(m);
      if (mn.kind != N::Field || mn.kids[1] != kNone) continue;
      bool assigned = false;
      if (ctorNode != kNone && n(ctorNode).kids[1] != kNone)
        for (std::uint32_t st : n(n(ctorNode).kids[1]).kids) {
          const Node& sn = n(st);
          if (sn.kind != N::ExprStmt) continue;
          const Node& as = n(sn.kids[0]);
          if (as.kind == N::Assign && as.text == "=" && n(as.kids[0]).kind == N::Member && n(as.kids[0]).text == mn.text && n(n(as.kids[0]).kids[0]).kind == N::This) assigned = true;
        }
      if (!assigned) diag(kZUninitializedField, m, "'" + std::string(mn.text) + "'");
    }
    defer->push_back([this, cls, objIdx, methods, methodParams]() {
      std::uint32_t saved = curClass;
      curClass = objIdx;
      for (std::uint32_t m : n(cls).kids) {
        const Node& mn = n(m);
        if (mn.kind == N::Field && mn.kids[1] != kNone && out.nodeType[m] != kNoType) require(expr(mn.kids[1], out.nodeType[m]), out.nodeType[m], mn.kids[1]);
      }
      for (std::size_t k = 0; k < methods.size(); ++k) checkBody(methods[k].first, methods[k].second, methodParams[k], n(methods[k].first).text == "constructor");
      curClass = saved;
    });
  }

  void stmtList(const std::vector<std::uint32_t>& stmts) {
    std::vector<std::function<void()>> mine;
    auto* saved = defer;
    defer = &mine;
    // hoist classes first (functions may mention them), then functions
    std::vector<std::pair<std::uint32_t, std::uint32_t>> classes;
    for (std::uint32_t s : stmts) {
      if (n(s).kind != N::Class) continue;
      out.objs.push_back({std::string(n(s).text), {}, kNone, true});
      auto oi = static_cast<std::uint32_t>(out.objs.size() - 1);
      TypeId t = objType(oi);
      out.nodeType[s] = t;
      out.nodeSym[s] = declare(SymKind::Class, n(s).text, t, s, true, s);
      classes.push_back({s, oi});
    }
    for (auto [s, oi] : classes) classMembers(s, oi);
    for (std::uint32_t s : stmts) {
      if (n(s).kind != N::Function) continue;
      std::vector<std::uint32_t> ps;
      TypeId sig = signature(n(s), 2, false, ps);
      out.nodeType[s] = sig;
      out.nodeSym[s] = declare(SymKind::Func, n(s).text, sig, s, true, s);
      if (n(s).kids[1] == kNone) { diag(kZUnsupported, s, "function declarations without a body"); continue; }
      defer->push_back([this, s, sig, ps]() { checkBody(s, sig, ps, false); });
    }
    for (std::uint32_t s : stmts) statement(s);
    for (auto& f : mine) f();
    defer = saved;
  }

  void run() {
    builtins();
    push();
    stmtList(n(a.root).kids);
    pop();
    pop();
  }
};

}  // namespace

Checked check(const Ast& ast) {
  Checker c(ast);
  if (ast.root != kNone) c.run();
  return std::move(c.out);
}

std::string typeName(const Checked& c, TypeId t) {
  if (t == kNoType) return "?";
  const Type& x = c.types[t];
  switch (x.k) {
    case TK::Error: return "error";
    case TK::Any: return "any";
    case TK::Num: return numName(x.num);
    case TK::Bool: return "boolean";
    case TK::Str: return "string";
    case TK::Void: return "void";
    case TK::Null: return "null";
    case TK::Array: return typeName(c, x.elem) + "[]";
    case TK::Object: return c.objs[x.obj].name;
    case TK::Func: {
      std::string s = "(";
      for (std::size_t i = 0; i < x.params.size(); ++i) s += (i ? ", " : "") + typeName(c, x.params[i]);
      return s + (x.variadic ? "...) => " : ") => ") + typeName(c, x.elem);
    }
  }
  return "?";
}

std::string dumpTypes(const Checked& c, const Ast& ast, std::string_view src) {
  static const char* kinds[] = {"Function", "Method", "Param", "Declarator", "Field"};
  std::string out;
  for (std::size_t i = 0; i < ast.nodes.size(); ++i) {
    const Node& x = ast.nodes[i];
    const char* k = x.kind == N::Function ? kinds[0] : x.kind == N::Method ? kinds[1] : x.kind == N::Param ? kinds[2] : x.kind == N::Declarator ? kinds[3] : x.kind == N::Field ? kinds[4] : nullptr;
    if (!k || c.nodeType[i] == kNoType) continue;
    LineCol lc = lineCol(src, x.start);
    out += std::to_string(lc.line) + ":" + std::to_string(lc.col) + " " + k + " " + std::string(x.text) + ": " + typeName(c, c.nodeType[i]) + "\n";
  }
  return out;
}

}  // namespace zn::frontend
