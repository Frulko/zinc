#include "frontend/check.h"

#include <algorithm>
#include <functional>
#include <map>
#include <memory>
#include <unordered_map>

#include "frontend/lexer.h"
#include "zn/runtime.h"

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

struct Checker {
  Ast& a;
  Checked out;
  using Scope = std::unordered_map<std::string_view, std::uint32_t>;
  // Scopes are shared so a snapshot (a generic declaration's) sees names declared in its scope later.
  std::vector<std::shared_ptr<Scope>> scopes;
  std::vector<std::function<void()>>* defer = nullptr;
  TypeId curRet = kNoType;      // return type of the enclosing function
  std::uint32_t curClass = kNone;  // ObjInfo index of the enclosing class
  std::uint32_t curCtor = kNone;   // class whose constructor body is being checked
  bool curStatic = false;          // inside a static method or static initializer
  std::vector<std::uint32_t> fnStack;  // enclosing function, method and lambda nodes, innermost last
  std::uint32_t calleeNode = kNone;    // the callee being evaluated, so a bare function name can be told from a call
  bool atTop = false, declAsGlobal = false;
  std::uint32_t nullishLeft = kNone;  // the left operand of the `??` being checked
  TypeId newExpected = kNoType;       // the type a `new Map()` or `new Set()` is expected to have
  static constexpr TypeId kInferRet = 0xFFFFFFFEu;  // the return type of a lambda is being inferred
  TypeId inferredRet = kNoType;
  bool immediate = true;           // straight-line code that runs when reached (not inside a function, method or instance initializer)
  const std::vector<std::uint32_t>* ctorStmts = nullptr;  // top-level statements of the constructor being checked
  std::vector<std::string> ctorPending;                   // own fields without initializer, not yet assigned in the constructor
  bool pendingExempt = false;                              // evaluating the target of `this.f = ...`
  int loops = 0, switches = 0;

  explicit Checker(Ast& ast) : a(ast) {
    out.nodeType.assign(a.nodes.size(), kNoType);
    out.nodeSym.assign(a.nodes.size(), kNone);
    for (TK k : {TK::Error, TK::Any, TK::Bool, TK::Str, TK::Void, TK::Null}) { Type t; t.k = k; out.types.push_back(t); }
  }

  // ---- diagnostics
  void diag(const char* code, std::uint32_t node, std::string detail = "") {
    out.diags.push_back({code, a.nodes[node].start, std::move(detail), a.nodes[node].file});
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
  TypeId mapOf(TypeId k, TypeId v) { Type t; t.k = TK::Map; t.params = {k}; t.elem = v; return intern(t); }
  TypeId setOf(TypeId e) { Type t; t.k = TK::Set; t.elem = e; return intern(t); }
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

  // ---- classes and interfaces
  static constexpr std::uint32_t kNoObj = 0xFFFFFFFFu;
  bool isSubclass(std::uint32_t a, std::uint32_t b) const { return frontend::isSubclass(out, a, b); }
  const Member* lookupMember(std::uint32_t obj, std::string_view nm, bool wantStatic) const { return frontend::lookupMember(out, obj, nm, wantStatic); }
  bool objAssignable(std::uint32_t a, std::uint32_t b) const { return frontend::objAssignable(out, a, b); }
  // A class is not available before its declaration runs (TypeScript: used before its declaration).
  bool usedBeforeDeclaration(std::uint32_t sym, std::uint32_t useNode) const {
    return immediate && out.syms[sym].decl != kNone && n(useNode).file == n(out.syms[sym].decl).file && n(useNode).start < n(out.syms[sym].decl).start;
  }
  bool ctorAccessible(const ObjInfo& o, std::uint32_t objIdx) const {
    if (o.ctorAccess == 0) return true;
    if (curClass == kNoObj) return false;
    return o.ctorAccess == 2 ? curClass == objIdx : isSubclass(curClass, objIdx);
  }
  bool accessible(const Member& m) const {
    if (m.access == 0 || m.owner == kNoObj) return true;
    if (curClass == kNoObj) return false;
    return m.access == 2 ? curClass == m.owner : isSubclass(curClass, m.owner);
  }

  bool assignable(TypeId from, TypeId to, std::uint32_t node) {
    if (from == to || bad(from) || bad(to) || ty(to).k == TK::Any) return true;
    if (ty(from).k == TK::Union) { for (TypeId m : ty(from).params) if (!assignable(m, to, kNone)) return false; return true; }
    if (ty(to).k == TK::Union) { for (TypeId m : ty(to).params) if (assignable(from, m, node)) return true; return false; }
    if (ty(from).k == TK::Param) { TypeId c = out.tparams[ty(from).obj].constraint; return c != kNoType && assignable(c, to, node); }
    const Type &f = ty(from), &t = ty(to);
    if (f.k == TK::Num && t.k == TK::Num) {
      if (t.obj != 0) return f.obj == t.obj;  // an enum takes only its own members (TypeScript rejects other literals too)
      if (node != kNone && isNumLit(a, node)) return isIntLit(a, node) || isFloat(t.num);  // literals adapt to the target kind
      return widens(f.num, t.num) || (isInt(f.num) && isInt(t.num));  // machine integers convert among themselves (wrapping), like the number type they alias
    }
    if (f.k == TK::Object && t.k == TK::Object) return objAssignable(f.obj, t.obj);
    return false;
  }
  bool require(TypeId from, TypeId to, std::uint32_t node) {
    if (assignable(from, to, node)) return true;
    diag(kZNotAssignable, node, "'" + name(from) + "' to '" + name(to) + "'");
    return false;
  }

  // ---- scopes
  void push() { scopes.push_back(std::make_shared<Scope>()); }
  void pop() { scopes.pop_back(); }
  std::uint32_t declare(SymKind k, std::string_view nm, TypeId t, std::uint32_t decl, bool isConst, std::uint32_t at) {
    if (scopes.back()->count(nm)) { diag(kZDuplicateDeclaration, at, "'" + std::string(nm) + "'"); return (*scopes.back())[nm]; }
    out.syms.push_back({k, nm, t, decl, isConst});
    auto id = static_cast<std::uint32_t>(out.syms.size() - 1);
    if (k == SymKind::Var || k == SymKind::Param) {
      out.syms[id].ownerFn = fnStack.empty() ? kNone : fnStack.back();
      out.syms[id].isGlobal = k == SymKind::Var && declAsGlobal;
    }
    (*scopes.back())[nm] = id;
    return id;
  }
  std::uint32_t lookup(std::string_view nm) const {
    for (auto it = scopes.rbegin(); it != scopes.rend(); ++it) { auto f = (*it)->find(nm); if (f != (*it)->end()) return f->second; }
    return kNone;
  }

  void builtins() {
    push();
    auto mathFn = [&](const char* nm, int argc, ObjInfo& o) {
      o.members.push_back({nm, func(std::vector<TypeId>(static_cast<std::size_t>(argc), num(Num::f64)), num(Num::f64), static_cast<std::uint32_t>(argc)), true, true});
    };
    ObjInfo math;
    math.name = "Math";
    math.members.push_back({"PI", num(Num::f64), true, false});
    math.members.push_back({"E", num(Num::f64), true, false});
    for (const char* f : {"sqrt", "abs", "floor", "ceil", "round", "trunc", "sin", "cos", "tan", "atan", "exp", "log"}) mathFn(f, 1, math);
    for (const char* f : {"pow", "atan2", "min", "max"}) mathFn(f, 2, math);
    out.objs.push_back(math);
    declare(SymKind::Builtin, "Math", objType(static_cast<std::uint32_t>(out.objs.size() - 1)), kNone, true, 0);
    ObjInfo con;
    con.name = "console";
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
        else if (x.text == "Map" && x.kids.size() == 2 && lookup(x.text) == kNone) { TypeId k0 = annotation(x.kids[0]), v0 = annotation(x.kids[1]); r = mapOf(k0, v0); }
        else if (x.text == "Set" && x.kids.size() == 1 && lookup(x.text) == kNone) r = setOf(annotation(x.kids[0]));
        else {
          std::uint32_t s = lookup(x.text);
          if (s == kNone) diag(kZCannotFindName, t, "'" + std::string(x.text) + "'");
          else if (out.syms[s].kind == SymKind::Enum && x.kids.empty()) r = out.syms[s].type;
          else if (out.syms[s].kind == SymKind::TypeAlias && x.kids.empty()) r = out.syms[s].type != kNoType ? out.syms[s].type : resolveAlias(s);
          else if (out.syms[s].kind == SymKind::GenericAlias) {
            std::vector<TypeId> args;
            for (std::uint32_t k : x.kids) args.push_back(annotation(k));
            if (args.size() == generics[s].tp.size()) r = instantiateAlias(s, args, t);
            else diag(kZCannotInfer, t, "'" + std::string(x.text) + "' needs " + std::to_string(generics[s].tp.size()) + " type argument(s)");
          }
          else if (out.syms[s].kind == SymKind::Class && x.kids.empty()) r = out.syms[s].type;
          else if (out.syms[s].kind == SymKind::GenericClass) {
            std::vector<TypeId> args;
            for (std::uint32_t k : x.kids) args.push_back(annotation(k));
            std::uint32_t inst = args.size() == generics[s].tp.size() ? instantiateClass(s, args, t) : kNone;
            if (inst != kNone) r = out.syms[inst].type;
            else if (args.size() != generics[s].tp.size()) diag(kZCannotInfer, t, "'" + std::string(x.text) + "' needs " + std::to_string(generics[s].tp.size()) + " type argument(s)");
          } else if (!x.kids.empty()) diag(kZNotAssignable, t, "'" + std::string(x.text) + "' is not generic");
          else diag(kZCannotFindName, t, "'" + std::string(x.text) + "' is not a type");
        }
        break;
      }
      case N::TypeArray: r = arrayOf(annotation(x.kids[0])); break;
      case N::TypeFunc: {  // (a: A, b: B) => R
        std::vector<TypeId> ps;
        for (std::size_t k = 1; k < x.kids.size(); ++k) {
          std::uint32_t pn = x.kids[k];
          if (n(pn).kids[0] == kNone) { diag(kZCannotInfer, pn, "parameter '" + std::string(n(pn).text) + "' of a function type"); ps.push_back(tError); }
          else ps.push_back(annotation(n(pn).kids[0]));
        }
        TypeId rt = annotation(x.kids[0]);
        r = func(ps, rt, static_cast<std::uint32_t>(ps.size()));
        break;
      }
      case N::TypeUnion: { std::vector<TypeId> ms; for (std::uint32_t k : std::vector<std::uint32_t>(x.kids)) ms.push_back(annotation(k)); r = unionOf(ms); break; }
      case N::TypeTuple: { std::vector<TypeId> es; for (std::uint32_t k : std::vector<std::uint32_t>(x.kids)) es.push_back(annotation(k)); r = tupleOf(es); break; }
      default: diag(kZUnsupported, t, "this type syntax"); break;
    }
    out.nodeType[t] = r;
    return r;
  }

  // ---- members
  const Member* findMember(TypeId t, std::string_view nm) {
    if (ty(t).k != TK::Object) return nullptr;
    return lookupMember(ty(t).obj, nm, false);
  }
  // The type a letter of the runtime table (zn/runtime.h) stands for, given the receiver's type.
  TypeId rtLetter(char l, TypeId recv) {
    const Type r = ty(recv);
    switch (l) {
      case 's': return tStr;
      case 'i': case 'j': return num(Num::i32);
      case 'b': return tBool;
      case 'd': return num(Num::f64);
      case 'n': return tVoid;
      case 'a': case 'm': case 't': return recv;
      case 'e': case 'v': return r.elem;
      case 'k': return r.params[0];
      case 'A': case 'V': return arrayOf(r.elem);
      case 'K': return arrayOf(r.params[0]);
      case 'S': return arrayOf(tStr);
      case 'c': return func({r.elem, r.elem}, num(Num::f64), 2);
      default: return kNoType;
    }
  }
  // Builtin members of primitives, arrays, strings, Map and Set; the result's Member lives in `scratch`.
  bool primMember(TypeId t, std::string_view nm, Member& scratch) {
    const Type x = ty(t);
    if (x.k == TK::Array && nm == "length") { scratch = {"length", num(Num::i32), false, false}; return true; }
    if (x.k == TK::Array && nm == "push") { scratch = {"push", func({x.elem}, num(Num::i32), 1), true, true}; return true; }
    if (x.k == TK::Array && nm == "pop") { scratch = {"pop", func({}, x.elem, 0), true, true}; return true; }
    if (x.k == TK::Num && nm == "toFixed") { scratch = {"toFixed", func({num(Num::i32)}, tStr, 0), true, true}; return true; }
    if (x.k == TK::Num && nm == "toString") { scratch = {"toString", func({}, tStr, 0), true, true}; return true; }
    const char* owner = x.k == TK::Str ? "string" : x.k == TK::Array ? "Array" : x.k == TK::Map ? "Map" : x.k == TK::Set ? "Set" : nullptr;
    if (!owner) return false;
    for (const RtInfo& r : kRtInfo) {
      if ((r.flags & 2) || !rtOwnedBy(r, owner) || nm != rtMember(r)) continue;
      if (x.k == TK::Array && r.id == Rt::ArrJoin && x.elem != tStr) return false;  // join is for string arrays
      TypeId ret = rtLetter(rtRet(r), t);
      if (r.flags & 1) { scratch = {std::string(nm), ret, true, false}; return true; }
      std::vector<TypeId> ps;
      for (unsigned k = 1; k < rtParamCount(r); ++k) ps.push_back(rtLetter(rtParam(r, k), t));
      scratch = {std::string(nm), func(ps, ret, rtMinUserParams(r)), true, true};
      return true;
    }
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

  bool comparable(TypeId l, TypeId r) {
    if (l == r || (isNum(l) && isNum(r)) || bad(l) || bad(r) || l == tNull || r == tNull) return true;  // anything may be compared with null
    if (ty(l).k == TK::Union) { for (TypeId m : ty(l).params) if (comparable(m, r)) return true; return false; }
    if (ty(r).k == TK::Union) { for (TypeId m : ty(r).params) if (comparable(l, m)) return true; return false; }
    return ty(l).k == TK::Object && ty(r).k == TK::Object && (objAssignable(ty(l).obj, ty(r).obj) || objAssignable(ty(r).obj, ty(l).obj));
  }

  TypeId binaryExpr(std::uint32_t i, const Node& x) {
    const std::string op(x.text);
    std::uint32_t le = x.kids[0], re = x.kids[1];
    if (op == ",") { expr(le); return expr(re); }
    if (op == "in") { diag(kZUnsupported, i, "operator '" + op + "'"); return tError; }
    if (op == "??") {
      nullishLeft = le;
      TypeId l0 = expr(le);
      nullishLeft = kNone;
      TypeId base = l0;
      if (!bad(l0) && !isMapGet(le)) {
        if (!hasNull(l0)) { diag(kZBadOperand, i, "'?" "?' on '" + name(l0) + "', which cannot be null"); expr(re); return tError; }
        base = withoutNull(l0);
        if (base == kNoType) base = tError;
      }
      TypeId r0 = expr(re, bad(base) ? kNoType : base);
      if (bad(base) || bad(r0)) return tError;
      require(r0, base, re);
      return base;
    }
    if (op == "instanceof") {
      TypeId lt = expr(le);
      const Node& rn = n(re);
      std::uint32_t rs = rn.kind == N::Ident ? lookup(rn.text) : kNone;
      if (rs == kNone || out.syms[rs].kind != SymKind::Class || out.objs[ty(out.syms[rs].type).obj].isInterface) {
        diag(kZBadOperand, re, "the right-hand side of 'instanceof' must be a class");
        return tBool;
      }
      out.nodeSym[re] = rs;
      out.nodeType[re] = out.syms[rs].type;
      if (usedBeforeDeclaration(rs, re)) diag(kZCannotFindName, re, "class '" + std::string(rn.text) + "' used before its declaration");
      for (TypeId m : unionMembers(lt)) if (!bad(m) && m != tNull && ty(m).k != TK::Object) { diag(kZBadOperand, le, "'instanceof' on '" + name(lt) + "'"); break; }
      return tBool;
    }
    TypeId l = expr(le), r;
    if (op == "&&" || op == "||") {  // the right operand is evaluated under what the left one established
      std::vector<Fact> fs;
      factsOf(le, op == "&&", fs);
      std::size_t mark = narrowing.size();
      pushFacts(fs);
      r = expr(re);
      narrowing.resize(mark);
    } else r = expr(re);
    bool eqOp = op == "==" || op == "!=" || op == "===" || op == "!==";
    if (!eqOp) { l = appOrDiag(l, le); r = appOrDiag(r, re); }
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
      const Member* m = nullptr;
      const Node& on = n(x.kids[0]);
      if (on.kind == N::Ident && out.nodeSym[x.kids[0]] != kNone && out.syms[out.nodeSym[x.kids[0]]].kind == SymKind::Class) m = lookupMember(ty(out.syms[out.nodeSym[x.kids[0]]].type).obj, x.text, true);
      else m = findMember(ot, x.text);
      if (!m && primMember(ot, x.text, scratch)) m = &scratch;
      if (m && m->readonly && !m->method && curCtor != kNoObj && m->owner == curCtor && on.kind == N::This) return true;  // readonly fields are assignable in their constructor
      if (m && (m->readonly || m->method)) { diag(kZAssignToConst, t, "'" + std::string(x.text) + "'"); return false; }
      return true;
    }
    return x.kind == N::Index;
  }

  // `m.get(k)` on a Map: a value that may be missing (`undefined` in TypeScript), so it is only usable as the left of `??`.
  bool isMapGet(std::uint32_t node) const {
    const Node& c = n(node);
    if (c.kind != N::Call || n(c.kids[0]).kind != N::Member || n(c.kids[0]).text != "get") return false;
    TypeId rt = out.nodeType[n(c.kids[0]).kids[0]];
    return rt != kNoType && ty(rt).k == TK::Map;
  }
  TypeId newCollection(std::uint32_t i, const Node& c, const std::vector<std::uint32_t>& argNodes) {
    bool isMap = c.text == "Map";
    TypeId want = newExpected;
    newExpected = kNoType;
    TypeId t = tError;
    auto ex = a.targs.find(i);
    if (ex != a.targs.end()) {
      std::vector<TypeId> args;
      for (std::uint32_t k : std::vector<std::uint32_t>(ex->second)) args.push_back(annotation(k));
      if (args.size() != (isMap ? 2u : 1u)) { diag(kZWrongArgCount, i, "expected " + std::string(isMap ? "2" : "1") + " type argument(s), got " + std::to_string(args.size())); return tError; }
      t = isMap ? mapOf(args[0], args[1]) : setOf(args[0]);
    } else if (want != kNoType && ty(want).k == (isMap ? TK::Map : TK::Set)) t = want;
    else { diag(kZCannotInfer, i, "the type arguments of '" + std::string(c.text) + "'"); return tError; }
    for (std::uint32_t an : argNodes) expr(an);
    if (!argNodes.empty()) diag(kZUnsupported, i, "constructor arguments of '" + std::string(c.text) + "'");
    for (TypeId e : isMap ? std::vector<TypeId>{ty(t).params[0], ty(t).elem} : std::vector<TypeId>{ty(t).elem}) if (bad(e)) return tError;
    return t;
  }

  TypeId callExpr(std::uint32_t i, const Node& x, bool isNew) {
    std::uint32_t callee = x.kids[0];
    TypeId ft = kNoType;
    TypeId result = tError;
    bool preEvaluated = false;  // generic calls evaluate their arguments first to infer type arguments
    const std::vector<std::uint32_t> argNodes(x.kids.begin() + 1, x.kids.end());
    if (isNew) {
      const Node& c = n(callee);
      std::uint32_t s = c.kind == N::Ident ? lookup(c.text) : kNone;
      if (s != kNone && out.syms[s].kind == SymKind::GenericClass) {
        for (std::uint32_t an : argNodes) expr(an);
        preEvaluated = true;
        GenericDecl& g = generics[s];
        ensureSelf(g);
        std::uint32_t ts = instantiateClass(s, g.selfParams, callee);
        if (ts == kNone) return tError;
        TypeId ctorT = out.objs[ty(out.syms[ts].type).obj].ctor;
        if (ctorT == kNoType) ctorT = func({}, tVoid, 0);
        std::vector<TypeId> targs = typeArgsFor(s, i, argNodes, ctorT);
        if (targs.empty()) return tError;
        std::uint32_t inst = instantiateClass(s, targs, callee);
        if (inst == kNone) return tError;
        s = inst;
      }
      if (c.kind == N::Ident && s == kNone && (c.text == "Map" || c.text == "Set")) return newCollection(i, c, argNodes);
      if (s == kNone || out.syms[s].kind != SymKind::Class) {
        if (c.kind == N::Ident && s == kNone) diag(kZCannotFindName, callee, "'" + std::string(c.text) + "'");
        else diag(kZNotCallable, callee, "only classes can be used with new");
        for (std::size_t k = 1; k < x.kids.size(); ++k) expr(x.kids[k]);
        return tError;
      }
      out.nodeSym[callee] = s;
      result = out.syms[s].type;
      const ObjInfo& oi = out.objs[ty(result).obj];
      if (oi.isInterface) { diag(kZNotCallable, callee, "an interface cannot be instantiated"); for (std::size_t k = 1; k < x.kids.size(); ++k) expr(x.kids[k]); return tError; }
      if (oi.isAbstract) diag(kZAbstractViolation, callee, "cannot instantiate abstract class '" + oi.name + "'");
      if (usedBeforeDeclaration(s, callee)) diag(kZCannotFindName, callee, "class '" + oi.name + "' used before its declaration");
      if (!ctorAccessible(oi, ty(result).obj)) diag(kZNotAccessible, callee, "the constructor of '" + oi.name + "'");
      ft = oi.ctor;
      if (ft == kNoType) ft = func({}, tVoid, 0);
    } else if (n(callee).kind == N::Super) {
      std::uint32_t par = curClass != kNoObj ? out.objs[curClass].parent : kNoObj;
      if (par == kNoObj || curCtor != curClass) {
        diag(kZBadSuperCall, i, par == kNoObj ? "'super' in a class that does not extend" : "'super()' outside a constructor");
        for (std::size_t k = 1; k < x.kids.size(); ++k) expr(x.kids[k]);
        return tError;
      }
      out.nodeType[callee] = objType(par);
      ft = out.objs[par].ctor;
      if (ft == kNoType) ft = func({}, tVoid, 0);
      result = tVoid;
    } else {
      TypeId ct;
      const Node& cn = n(callee);
      std::uint32_t gs = cn.kind == N::Ident ? lookup(cn.text) : kNone;
      if (gs != kNone && out.syms[gs].kind == SymKind::GenericFunc) {
        for (std::uint32_t an : argNodes) expr(an);
        preEvaluated = true;
        GenericDecl& g = generics[gs];
        ensureSelf(g);
        std::uint32_t ts = instantiateFunc(gs, g.selfParams, callee);
        if (ts == kNone) return tError;
        std::vector<TypeId> targs = typeArgsFor(gs, i, argNodes, out.syms[ts].type);
        if (targs.empty()) return tError;
        std::uint32_t inst = instantiateFunc(gs, targs, callee);
        if (inst == kNone) return tError;
        out.nodeSym[callee] = inst;
        ct = out.syms[inst].type;
        out.nodeType[callee] = ct;
      } else { calleeNode = callee; ct = expr(callee); calleeNode = kNone; }
      if (bad(ct)) { for (std::size_t k = 1; k < x.kids.size(); ++k) if (!preEvaluated) expr(x.kids[k]); return tError; }
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
      TypeId at = preEvaluated ? out.nodeType[arg] : expr(arg, expected);
      if (expected != kNoType) require(at, expected, arg);
    }
    if (!isNew && n(callee).kind == N::Member && n(callee).text == "get" && i != nullishLeft) {  // Map.get has no `undefined` to test: it is only usable under `??`
      TypeId rt = out.nodeType[n(callee).kids[0]];
      if (rt != kNoType && ty(rt).k == TK::Map) diag(kZUnsupported, i, "Map.get outside '?" "?' (use has() to test for a key)");
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
        if (curClass == kNone || curStatic) { diag(kZNotAllowedHere, i, "'this'"); return tError; }
        for (std::size_t k = fnStack.size(); k-- > 0;) {  // arrow functions capture the `this` of the code around them
          if (n(fnStack[k]).kind != N::FuncExpr) break;
          if (!(n(fnStack[k]).flags & frontend::kFlagArrow)) { diag(kZNotAllowedHere, i, "'this' in a function expression (use an arrow function)"); return tError; }
          out.lambdaUsesThis.push_back(fnStack[k]);
        }
        return objType(curClass);
      case N::Super: diag(kZBadSuperCall, i, "'super' must be called or used with a property access"); return tError;
      case N::Ident: {
        std::uint32_t s = lookup(x.text);
        if (s == kNone) { diag(kZCannotFindName, i, "'" + std::string(x.text) + "'"); return tError; }
        out.nodeSym[i] = s;
        if (out.syms[s].kind == SymKind::Class || out.syms[s].kind == SymKind::GenericClass) { diag(kZNotAllowedHere, i, "class '" + std::string(x.text) + "' used as a value"); return tError; }
        if (out.syms[s].kind == SymKind::GenericFunc) { diag(kZNotAllowedHere, i, "generic function '" + std::string(x.text) + "' must be called"); return tError; }
        if (out.syms[s].kind == SymKind::Enum) { diag(kZNotAllowedHere, i, "enum '" + std::string(x.text) + "' used as a value"); return tError; }
        if (out.syms[s].kind == SymKind::TypeAlias) { diag(kZNotAllowedHere, i, "type parameter '" + std::string(x.text) + "' used as a value"); return tError; }
        if (trackable(s) && !out.syms[s].isGlobal && !fnStack.empty() && out.syms[s].ownerFn != fnStack.back()) {
          out.syms[s].captured = true;  // used inside a lambda or nested function that does not declare it
          for (std::size_t k = fnStack.size(); k-- > 0 && fnStack[k] != out.syms[s].ownerFn;) {
            auto& cs = out.captures[fnStack[k]];
            if (std::find(cs.begin(), cs.end(), s) == cs.end()) cs.push_back(s);
          }
        }
        if (out.syms[s].kind == SymKind::Func && i != calleeNode) out.funcValueUses.push_back(i);
        return trackable(s) ? currentType(s) : out.syms[s].type;
      }
      case N::FuncExpr: return funcExpr(i, expected);
      case N::Array: {
        if (expected != kNoType && isTupleType(expected)) {  // a tuple literal: each element against its position
          const ObjInfo& to = out.objs[ty(expected).obj];
          if (x.kids.size() != to.members.size()) { diag(kZNotAssignable, i, "a literal of " + std::to_string(x.kids.size()) + " element(s) to '" + to.name + "'"); for (std::uint32_t e : x.kids) expr(e); return expected; }
          for (std::size_t k = 0; k < x.kids.size(); ++k) {
            if (n(x.kids[k]).kind == N::Spread) { diag(kZUnsupported, x.kids[k], "spread in tuple literals"); continue; }
            TypeId et = to.members[k].type;
            require(expr(x.kids[k], et), et, x.kids[k]);
          }
          return expected;
        }
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
        if (op != "typeof" && op != "void" && op != "delete") t = appOrDiag(t, x.kids[0]);
        if (bad(t)) return op == "!" ? tBool : tError;
        if (op == "!") { if (t != tBool) diag(kZNotAssignable, x.kids[0], "'" + name(t) + "' to 'boolean'"); return tBool; }
        if (op == "typeof") return tStr;
        if (op == "void") return tVoid;
        if (op == "delete") { diag(kZUnsupported, i, "'delete'"); return tError; }
        if (!isNum(t)) { diag(kZBadOperand, i, "'" + op + "' on '" + name(t) + "'"); return tError; }
        return op == "~" ? num(Num::i32) : t;
      }
      case N::UpdatePre: case N::UpdatePost: {
        TypeId t0 = expr(x.kids[0]);
        if (n(x.kids[0]).kind == N::Ident && out.nodeSym[x.kids[0]] != kNone && trackable(out.nodeSym[x.kids[0]])) out.syms[out.nodeSym[x.kids[0]]].reassigned = true;
        TypeId t = appOrDiag(t0, x.kids[0]);
        if (bad(t)) return tError;
        if (!isNum(t)) { diag(kZBadOperand, i, "'" + std::string(x.text) + "' on '" + name(t) + "'"); return tError; }
        lvalue(x.kids[0]);
        return t0;
      }
      case N::Assign: {
        std::uint32_t target = x.kids[0], value = x.kids[1];
        if (n(target).kind == N::ArrayPattern) {  // [a, b] = value
          if (x.text != "=") { diag(kZBadAssignTarget, target, ""); return tError; }
          std::vector<TypeId> hint;  // the targets' own types shape a literal on the right
          bool known = true;
          for (std::uint32_t e : std::vector<std::uint32_t>(n(target).kids)) {
            N ek = n(e).kind;
            if (ek == N::Ident || ek == N::Member || ek == N::Index) { TypeId tt = expr(e); hint.push_back(tt); }
            else known = false;
          }
          TypeId vt = expr(value, known ? tupleOf(hint) : kNoType);
          bindPattern(target, vt, false, false);
          return vt;
        }
        pendingExempt = x.text == "=";  // the target of a plain assignment is written, not read
        TypeId tt = expr(target);
        pendingExempt = false;
        std::uint32_t tsym = n(target).kind == N::Ident ? out.nodeSym[target] : kNone;
        if (tsym != kNone && trackable(tsym)) { tt = out.syms[tsym].type; out.nodeType[target] = tt; out.syms[tsym].reassigned = true; }  // an assignment is checked against the declared type
        bool ok = lvalue(target);
        const std::string op(x.text);
        if (op == "=") {
          TypeId vt = expr(value, tt);
          if (ok) require(vt, tt, value);
          if (tsym != kNone && trackable(tsym) && ty(tt).k == TK::Union && !bad(vt) && assignable(vt, tt, kNone)) narrowing.push_back({tsym, vt});  // known after the assignment
          return tt;
        }
        TypeId vt = expr(value);
        if (bad(tt) || bad(vt)) return tt;
        std::string bop = op.substr(0, op.size() - 1);
        if (bop == "&&" || bop == "||" || bop == "?\?") { diag(kZUnsupported, i, "operator '" + op + "'"); return tt; }
        if (bop == "+" && tt == tStr && (vt == tStr || isNum(vt) || vt == tBool)) return tt;
        if (!isNum(tt) || !isNum(vt)) { diag(kZBadOperand, i, "'" + op + "' on '" + name(tt) + "' and '" + name(vt) + "'"); return tt; }
        Num r = (bop == "&" || bop == "|" || bop == "^" || bop == "<<" || bop == ">>") ? Num::i32 : bop == ">>>" ? Num::u32 : arith(bop, target, ty(tt).num, value, ty(vt).num);
        if (!widens(r, ty(tt).num) && !(isInt(r) && isInt(ty(tt).num))) diag(kZNotAssignable, i, "'" + std::string(numName(r)) + "' to '" + name(tt) + "'");
        return tt;
      }
      case N::Cond: {
        TypeId c = expr(x.kids[0]);
        if (!bad(c) && c != tBool) diag(kZNotAssignable, x.kids[0], "'" + name(c) + "' to 'boolean'");
        std::vector<Fact> ft, ff;
        factsOf(x.kids[0], true, ft); factsOf(x.kids[0], false, ff);
        std::size_t mark = narrowing.size();
        pushFacts(ft);
        TypeId p = expr(x.kids[1], expected);
        narrowing.resize(mark);
        pushFacts(ff);
        TypeId q = expr(x.kids[2], expected);
        narrowing.resize(mark);
        if (bad(p)) return q;
        if (bad(q)) return p;
        if (expected != kNoType && ty(expected).k != TK::Any && assignable(p, expected, x.kids[1]) && assignable(q, expected, x.kids[2])) return expected;  // both branches fit the type asked for (c ? 1 : 0 into an i32)
        if (assignable(q, p, x.kids[2])) return p;
        if (assignable(p, q, x.kids[1])) return q;
        diag(kZNotAssignable, x.kids[2], "'" + name(q) + "' to '" + name(p) + "'");
        return p;
      }
      case N::Call: return callExpr(i, x, false);
      case N::New: newExpected = expected; return callExpr(i, x, true);
      case N::Member: {
        if (x.text.size() && x.text[0] == '?') { diag(kZUnsupported, i, "optional chaining"); return tError; }
        const Node& on = n(x.kids[0]);
        if (on.kind == N::Super) {  // super.method(...)
          std::uint32_t par = curClass != kNoObj ? out.objs[curClass].parent : kNoObj;
          if (par == kNoObj) { diag(kZBadSuperCall, i, "'super' in a class that does not extend"); return tError; }
          out.nodeType[x.kids[0]] = objType(par);
          const Member* m = lookupMember(par, x.text, false);
          if (!m || !m->method) { diag(kZNoSuchProperty, i, "'" + std::string(x.text) + "' on the base class"); return tError; }
          if (m->isAbstract) { diag(kZAbstractViolation, i, "abstract method '" + std::string(x.text) + "' cannot be called through super"); return tError; }
          if (!accessible(*m)) diag(kZNotAccessible, i, "'" + std::string(x.text) + "'");
          return m->type;
        }
        if (on.kind == N::Ident) {  // Enum.Member, Class.staticMember
          std::uint32_t es = lookup(on.text);
          if (es != kNone && out.syms[es].kind == SymKind::Enum) {
            out.nodeSym[x.kids[0]] = es;
            for (auto& [nm, v] : out.enumMembers[es]) if (nm == x.text) return out.syms[es].type;
            diag(kZNoSuchProperty, i, "'" + std::string(x.text) + "' on enum '" + std::string(on.text) + "'");
            return tError;
          }
          std::uint32_t cs = lookup(on.text);
          if (cs != kNone && out.syms[cs].kind == SymKind::Class && !out.objs[ty(out.syms[cs].type).obj].isInterface) {
            out.nodeSym[x.kids[0]] = cs;
            if (usedBeforeDeclaration(cs, x.kids[0])) diag(kZCannotFindName, x.kids[0], "class '" + std::string(on.text) + "' used before its declaration");
            const Member* m = lookupMember(ty(out.syms[cs].type).obj, x.text, true);
            if (!m) { diag(kZNoSuchProperty, i, "static '" + std::string(x.text) + "' on '" + std::string(on.text) + "'"); return tError; }
            if (!accessible(*m)) diag(kZNotAccessible, i, "'" + std::string(x.text) + "'");
            return m->type;
          }
        }
        TypeId ot = expr(x.kids[0]);
        if (bad(ot)) return tError;
        ot = appOrDiag(ot, x.kids[0]);
        if (bad(ot)) return tError;
        if (on.kind == N::This && ctorStmts && !pendingExempt && std::find(ctorPending.begin(), ctorPending.end(), std::string(x.text)) != ctorPending.end())
          diag(kZUninitializedField, i, "'" + std::string(x.text) + "' is read before it is assigned");
        Member scratch;
        const Member* m = findMember(ot, x.text);
        if (!m && primMember(ot, x.text, scratch)) m = &scratch;
        if (!m) { diag(kZNoSuchProperty, i, "'" + std::string(x.text) + "' on '" + name(ot) + "'"); return tError; }
        if (!accessible(*m)) diag(kZNotAccessible, i, "'" + std::string(x.text) + "'");
        return m->getter ? ty(m->type).elem : m->type;
      }
      case N::Index: {
        TypeId ot = expr(x.kids[0]), it = expr(x.kids[1]);
        ot = appOrDiag(ot, x.kids[0]); it = appOrDiag(it, x.kids[1]);
        if (bad(ot) || bad(it)) return tError;
        if (isTupleType(ot)) {  // t[0]: the index must be a constant inside the tuple
          const Node& ix = n(x.kids[1]);
          const ObjInfo& to = out.objs[ty(ot).obj];
          if (ix.kind != N::Number || !isIntLit(a, x.kids[1])) { diag(kZNotIndexable, x.kids[1], "a tuple is indexed with a constant"); return tError; }
          std::size_t k = static_cast<std::size_t>(std::strtoull(std::string(ix.text).c_str(), nullptr, 10));
          if (k >= to.members.size()) { diag(kZNotAssignable, x.kids[1], "index " + std::to_string(k) + " of '" + to.name + "'"); return tError; }
          return to.members[k].type;
        }
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
    if (x.kind == N::For || x.kind == N::ForOf || x.kind == N::ForIn || x.kind == N::While || x.kind == N::DoWhile || x.kind == N::Switch || x.kind == N::Function || x.kind == N::Class) return false;
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
      case N::Switch: {  // a default, no break out of the switch, and the last clause (which every other one falls into) ends the function
        bool hasDefault = false;
        for (std::size_t k = 1; k < x.kids.size(); ++k) {
          const Node& cl = n(x.kids[k]);
          if (cl.kids[0] == kNone) hasDefault = true;
          for (std::size_t j = 1; j < cl.kids.size(); ++j) if (hasBreak(a, cl.kids[j])) return false;
        }
        if (!hasDefault || x.kids.size() < 2) return false;
        const Node& last = n(x.kids.back());
        for (std::size_t j = 1; j < last.kids.size(); ++j) if (terminates(last.kids[j])) return true;
        return false;
      }
      default: return false;
    }
  }

  TypeId condition(std::uint32_t e) {
    TypeId t = expr(e);
    if (!bad(t) && t != tBool) diag(kZNotAssignable, e, "'" + name(t) + "' to 'boolean'");
    return t;
  }

  // ---- destructuring: declare (or assign) the targets of a pattern from a value of type `vt`
  void declareErrorTargets(std::uint32_t pat, bool isDecl, bool isConst) {
    const Node& p = n(pat);
    for (std::uint32_t k : std::vector<std::uint32_t>(p.kids)) {
      std::uint32_t e = k;
      if (n(e).kind == N::PatProp || n(e).kind == N::Spread) e = n(e).kids[0];
      if (n(e).kind == N::ArrayPattern || n(e).kind == N::ObjectPattern) declareErrorTargets(e, isDecl, isConst);
      else if (n(e).kind == N::Ident && isDecl) out.nodeSym[e] = declare(SymKind::Var, n(e).text, tError, e, isConst, e);
    }
  }
  // An array literal that is destructured right away is a tuple (its nested literals too, following the pattern).
  TypeId literalAsTuple(std::uint32_t lit, std::uint32_t pat) {
    std::vector<TypeId> es;
    const std::vector<std::uint32_t> elems = n(lit).kids, pats = n(pat).kids;
    for (std::size_t k = 0; k < elems.size(); ++k) {
      std::uint32_t e = elems[k];
      if (n(e).kind == N::Spread) { diag(kZUnsupported, e, "spread elements"); es.push_back(tError); continue; }
      if (n(e).kind == N::Array && k < pats.size() && n(pats[k]).kind == N::ArrayPattern) es.push_back(literalAsTuple(e, pats[k]));
      else es.push_back(expr(e));
    }
    TypeId t = tupleOf(es);
    out.nodeType[lit] = t;
    return t;
  }
  void bindTarget(std::uint32_t target, TypeId t, bool isDecl, bool isConst) {
    const Node& x = n(target);
    out.nodeType[target] = t;
    if (x.kind == N::ArrayPattern || x.kind == N::ObjectPattern) { bindPattern(target, t, isDecl, isConst); return; }
    if (x.kind == N::Ident && isDecl) { out.nodeSym[target] = declare(SymKind::Var, x.text, t, target, isConst, target); return; }
    TypeId tt = expr(target);  // assignment to an existing variable, member or element
    if (x.kind == N::Ident && out.nodeSym[target] != kNone && trackable(out.nodeSym[target])) out.syms[out.nodeSym[target]].reassigned = true;
    lvalue(target);
    require(t, tt, target);
  }
  void bindPattern(std::uint32_t pat, TypeId vt, bool isDecl, bool isConst) {
    const Node& p = n(pat);
    out.nodeType[pat] = vt;
    if (bad(vt)) { declareErrorTargets(pat, isDecl, isConst); return; }
    TypeId va = appOrDiag(vt, pat);
    if (bad(va)) { declareErrorTargets(pat, isDecl, isConst); return; }
    if (p.kind == N::ArrayPattern) {
      bool tup = isTupleType(va), arr = ty(va).k == TK::Array;
      if (!tup && !arr) { diag(kZNotIndexable, pat, "'" + name(vt) + "' cannot be destructured as an array"); declareErrorTargets(pat, isDecl, isConst); return; }
      const std::vector<std::uint32_t> elems = p.kids;
      for (std::size_t k = 0; k < elems.size(); ++k) {
        std::uint32_t e = elems[k];
        if (n(e).kind == N::Empty) continue;
        if (n(e).kind == N::Spread) {
          if (tup) { diag(kZUnsupported, e, "rest elements of a tuple"); declareErrorTargets(pat, isDecl, isConst); continue; }
          bindTarget(n(e).kids[0], va, isDecl, isConst);  // the rest of an array is an array
          continue;
        }
        if (tup && k >= out.objs[ty(va).obj].members.size()) {
          diag(kZNotAssignable, e, "'" + name(va) + "' has no element " + std::to_string(k));
          std::vector<std::uint32_t> one{e};
          bindTarget(e, tError, isDecl, isConst);
          continue;
        }
        bindTarget(e, tup ? out.objs[ty(va).obj].members[k].type : ty(va).elem, isDecl, isConst);
      }
      return;
    }
    // object pattern: the properties of a class or interface instance
    if (ty(va).k != TK::Object || isTupleType(va)) { diag(kZNotIndexable, pat, "'" + name(vt) + "' cannot be destructured as an object"); declareErrorTargets(pat, isDecl, isConst); return; }
    for (std::uint32_t pp : std::vector<std::uint32_t>(p.kids)) {
      const Node& pn = n(pp);
      const Member* m = findMember(va, pn.text);
      TypeId et = tError;
      if (!m || m->method) diag(kZNoSuchProperty, pp, "'" + std::string(pn.text) + "' on '" + name(va) + "'");
      else { if (!accessible(*m)) diag(kZNotAccessible, pp, "'" + std::string(pn.text) + "'"); et = m->type; }
      out.nodeType[pp] = et;
      bindTarget(pn.kids[0], et, isDecl, isConst);
    }
  }

  void varDecl(std::uint32_t d, bool isConst) {
    const Node& x = n(d);
    std::uint32_t ann = x.kids[0], init = x.kids[1];
    if (x.kids.size() > 2 && x.kids[2] != kNone) {  // const [a, b] = ... / const {x, y} = ...
      std::uint32_t pat = x.kids[2];
      TypeId t = tError;
      if (init == kNone) diag(kZUnsupported, d, "destructuring declarations without an initializer");
      else if (ann != kNone) { t = annotation(ann); require(expr(init, t), t, init); }
      else if (n(init).kind == N::Array && n(pat).kind == N::ArrayPattern) t = literalAsTuple(init, pat);  // a literal destructured at once is a tuple
      else t = expr(init);
      out.nodeType[d] = t;
      bindPattern(pat, t, true, isConst);
      return;
    }
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
    if (ann != kNone && init != kNone && ty(t).k == TK::Union) {
      TypeId vt = out.nodeType[init];
      if (vt != kNoType && !bad(vt) && assignable(vt, t, kNone)) narrowing.push_back({out.nodeSym[d], vt});
    }
  }

  void statement(std::uint32_t s) {
    const Node& x = n(s);
    bool top = atTop;  // a statement directly in the program's top-level list
    atTop = false;
    switch (x.kind) {
      case N::Empty: break;
      case N::Block: { std::size_t mark = narrowing.size(); push(); stmtList(x.kids); pop(); narrowing.resize(mark); break; }
      case N::VarDecl: declAsGlobal = top; for (std::uint32_t d : x.kids) varDecl(d, x.text == "const"); declAsGlobal = false; break;
      case N::ExprStmt: expr(x.kids[0]); break;
      case N::If: {
        condition(x.kids[0]);
        std::vector<Fact> ft, ff;
        factsOf(x.kids[0], true, ft);
        factsOf(x.kids[0], false, ff);
        std::size_t mark = narrowing.size();
        pushFacts(ft);
        statement(x.kids[1]);
        narrowing.resize(mark);
        if (x.kids[2] != kNone) { pushFacts(ff); statement(x.kids[2]); narrowing.resize(mark); }
        bool thenExits = exitsAbruptly(x.kids[1]), elseExits = x.kids[2] != kNone && exitsAbruptly(x.kids[2]);
        if (thenExits && !elseExits) pushFacts(ff);       // `if (x === null) return;` leaves x non-null afterwards
        else if (elseExits && !thenExits) pushFacts(ft);
        break;
      }
      case N::While: {
        resetAssigned(s);
        condition(x.kids[0]);
        std::vector<Fact> ft, ff;
        factsOf(x.kids[0], true, ft);
        factsOf(x.kids[0], false, ff);
        std::size_t mark = narrowing.size();
        pushFacts(ft);
        ++loops; statement(x.kids[1]); --loops;
        narrowing.resize(mark);
        if (!hasBreak(a, x.kids[1])) pushFacts(ff);        // the loop only ends when the condition fails
        break;
      }
      case N::DoWhile: {
        resetAssigned(s);
        ++loops; statement(x.kids[0]); --loops;
        condition(x.kids[1]);
        break;
      }
      case N::For: {
        push();
        resetAssigned(s);
        if (x.kids[0] != kNone) { if (n(x.kids[0]).kind == N::VarDecl) statement(x.kids[0]); else expr(x.kids[0]); }
        std::size_t mark = narrowing.size();
        if (x.kids[1] != kNone) {
          condition(x.kids[1]);
          std::vector<Fact> ft;
          factsOf(x.kids[1], true, ft);
          pushFacts(ft);
        }
        if (x.kids[2] != kNone) expr(x.kids[2]);
        ++loops; statement(x.kids[3]); --loops;
        narrowing.resize(mark);
        pop();
        break;
      }
      case N::ForOf: case N::ForIn: {
        if (x.kind == N::ForIn) { diag(kZUnsupported, s, "for...in"); break; }
        resetAssigned(s);
        TypeId it = expr(x.kids[1]);
        TypeId el = tError;
        if (!bad(it)) { if (ty(it).k == TK::Array) el = ty(it).elem; else diag(kZNotIndexable, x.kids[1], "'" + name(it) + "'"); }
        push();
        const Node& d = n(x.kids[0]);
        out.nodeType[x.kids[0]] = el;
        if (d.kids.size() > 2 && d.kids[2] != kNone) bindPattern(d.kids[2], el, true, x.text == "const");
        else out.nodeSym[x.kids[0]] = declare(SymKind::Var, d.text, el, x.kids[0], x.text == "const", x.kids[0]);
        ++loops; statement(x.kids[2]); --loops;
        pop();
        break;
      }
      case N::Return: {
        if (curRet == kNoType) { diag(kZNotAllowedHere, s, "'return' outside a function"); break; }
        if (curRet == kInferRet) {  // a lambda without a return type: the first return decides, the others must fit
          if (x.kids[0] == kNone) { if (inferredRet == kNoType) inferredRet = tVoid; break; }
          TypeId rt = expr(x.kids[0]);
          if (inferredRet == kNoType) inferredRet = rt; else require(rt, inferredRet, x.kids[0]);
          break;
        }
        if (x.kids[0] == kNone) { if (curRet != tVoid && !bad(curRet) && ty(curRet).k != TK::Any) diag(kZNotAssignable, s, "'void' to '" + name(curRet) + "'"); break; }
        TypeId t = expr(x.kids[0], curRet);
        require(t, curRet, x.kids[0]);
        break;
      }
      case N::Break: case N::Continue:
        if (loops == 0 && (x.kind == N::Continue || switches == 0)) diag(kZNotAllowedHere, s, x.kind == N::Break ? "'break' outside a loop or switch" : "'continue' outside a loop");
        break;
      case N::Function: case N::Class: case N::Interface: case N::TypeAlias: case N::Enum: break;  // hoisted by stmtList
      case N::Switch: {
        TypeId dt = appOrDiag(expr(x.kids[0]), x.kids[0]);
        if (!bad(dt) && !isNum(dt) && dt != tStr && dt != tBool) diag(kZBadOperand, x.kids[0], "'switch' on '" + name(dt) + "'");
        std::size_t mark = narrowing.size();
        int savedLoops = loops;
        ++switches;
        push();
        bool seenDefault = false;
        for (std::size_t k = 1; k < x.kids.size(); ++k) {
          const Node& cl = n(x.kids[k]);
          if (cl.kids[0] == kNone) { if (seenDefault) diag(kZDuplicateDeclaration, x.kids[k], "'default' clause"); seenDefault = true; }
          else {
            TypeId tt = appOrDiag(expr(cl.kids[0], dt), cl.kids[0]);
            if (!bad(tt) && !bad(dt) && !comparable(dt, tt)) diag(kZBadOperand, cl.kids[0], "case of '" + name(tt) + "' in a switch on '" + name(dt) + "'");
          }
          std::vector<std::uint32_t> body(cl.kids.begin() + 1, cl.kids.end());
          stmtList(body);
        }
        pop();
        --switches;
        loops = savedLoops;
        narrowing.resize(mark);
        break;
      }
      default: diag(kZUnsupported, s, "this statement"); break;
    }
  }

  // ---- functions and classes
  TypeId signature(std::uint32_t fid, std::size_t firstParam, bool isCtor, std::vector<std::uint32_t>& params) {
    const Node& f = n(fid);
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
      else if (f.kids[1] == kNone) { diag(kZCannotInfer, fid, "return type of '" + std::string(f.text) + "'"); ret = tError; }
      else if (hasValueReturn(a, f.kids[1])) { diag(kZCannotInfer, f.kids[1], "return type of '" + std::string(f.text) + "'"); ret = tError; }
    }
    return func(std::move(ps), ret, minArgs);
  }

  void checkBody(std::uint32_t fn, TypeId sig, const std::vector<std::uint32_t>& params, bool isCtor) {
    const Node& f = n(fn);
    if (f.kids[1] == kNone) return;
    Type ft = ty(sig);
    fnStack.push_back(fn);
    auto savedNarrowing = std::move(narrowing);
    narrowing.clear();
    TypeId savedRet = curRet; int savedLoops = loops; bool savedImmediate = immediate;
    curRet = isCtor ? tVoid : ft.elem; loops = 0; immediate = false;
    push();
    for (std::size_t k = 0; k < params.size(); ++k) {
      const Node& p = n(params[k]);
      if (p.kids[1] != kNone) require(expr(p.kids[1], ft.params[k]), ft.params[k], p.kids[1]);
      if (p.kids.size() > 2 && p.kids[2] != kNone) bindPattern(p.kids[2], ft.params[k], true, false);
      else out.nodeSym[params[k]] = declare(SymKind::Param, p.text, ft.params[k], params[k], false, params[k]);
    }
    stmtList(n(f.kids[1]).kids);
    pop();
    if (!isCtor && curRet != tVoid && !bad(curRet) && ty(curRet).k != TK::Any && !terminates(f.kids[1])) diag(kZMissingReturn, fn, "'" + std::string(f.text) + "'");
    curRet = savedRet; loops = savedLoops; immediate = savedImmediate;
    narrowing = std::move(savedNarrowing);
    fnStack.pop_back();
  }

  // ---- unions: members flattened, deduplicated and sorted so equal unions share one type id
  TypeId unionOf(std::vector<TypeId> ms) {
    std::vector<TypeId> flat;
    for (TypeId m : ms) {
      if (bad(m)) return tError;
      if (ty(m).k == TK::Union) for (TypeId k : ty(m).params) flat.push_back(k); else flat.push_back(m);
    }
    std::sort(flat.begin(), flat.end());
    flat.erase(std::unique(flat.begin(), flat.end()), flat.end());
    if (flat.size() == 1) return flat[0];
    Type t; t.k = TK::Union; t.params = std::move(flat);
    return intern(t);
  }
  bool hasNull(TypeId t) const { if (t == tNull) return true; if (ty(t).k != TK::Union) return false; for (TypeId m : ty(t).params) if (m == tNull) return true; return false; }
  // The members of t, or t itself.
  std::vector<TypeId> unionMembers(TypeId t) const { return ty(t).k == TK::Union ? ty(t).params : std::vector<TypeId>{t}; }
  // t without null; kNoType when nothing is left
  TypeId withoutNull(TypeId t) {
    std::vector<TypeId> r;
    for (TypeId m : unionMembers(t)) if (m != tNull) r.push_back(m);
    return r.empty() ? kNoType : unionOf(r);
  }

  // ---- narrowing: flow-sensitive types of local variables and parameters (innermost fact last)
  using Fact = std::pair<std::uint32_t, TypeId>;
  std::vector<Fact> narrowing;
  bool trackable(std::uint32_t sym) const { return out.syms[sym].kind == SymKind::Var || out.syms[sym].kind == SymKind::Param; }
  TypeId currentType(std::uint32_t sym, const std::vector<Fact>* extra = nullptr) const {
    if (extra) for (auto it = extra->rbegin(); it != extra->rend(); ++it) if (it->first == sym) return it->second;
    for (auto it = narrowing.rbegin(); it != narrowing.rend(); ++it) if (it->first == sym) return it->second;
    return out.syms[sym].type;
  }
  void pushFacts(const std::vector<Fact>& fs) { for (const Fact& f : fs) narrowing.push_back(f); }
  // What a successful (truthy) or failed instanceof test leaves of `cur` for class type C.
  TypeId narrowByInstanceOf(TypeId cur, TypeId cls, bool truthy) {
    std::vector<TypeId> keep;
    for (TypeId m : unionMembers(cur)) {
      if (m == tNull || ty(m).k != TK::Object) { if (!truthy) keep.push_back(m); continue; }
      bool sub = objAssignable(ty(m).obj, ty(cls).obj), sup = objAssignable(ty(cls).obj, ty(m).obj);
      if (truthy) { if (sub) keep.push_back(m); else if (sup) keep.push_back(cls); }
      else if (!sub) keep.push_back(m);
    }
    return keep.empty() ? kNoType : unionOf(keep);
  }
  void factsOf(std::uint32_t cond, bool truthy, std::vector<Fact>& fs) {
    const Node& c = n(cond);
    if (c.kind == N::Unary && c.text == "!") { factsOf(c.kids[0], !truthy, fs); return; }
    if (c.kind != N::Binary) return;
    if (c.text == "&&") { if (truthy) { factsOf(c.kids[0], true, fs); factsOf(c.kids[1], true, fs); } return; }
    if (c.text == "||") { if (!truthy) { factsOf(c.kids[0], false, fs); factsOf(c.kids[1], false, fs); } return; }
    bool eq = c.text == "==" || c.text == "===", ne = c.text == "!=" || c.text == "!==";
    if (eq || ne) {
      auto isNullLit = [&](std::uint32_t k) { return n(k).kind == N::Literal && n(k).text == "null"; };
      std::uint32_t idn = isNullLit(c.kids[1]) && n(c.kids[0]).kind == N::Ident ? c.kids[0] : isNullLit(c.kids[0]) && n(c.kids[1]).kind == N::Ident ? c.kids[1] : kNone;
      if (idn == kNone || out.nodeSym[idn] == kNone || !trackable(out.nodeSym[idn])) return;
      std::uint32_t sy = out.nodeSym[idn];
      TypeId cur = currentType(sy, &fs);
      if (eq == truthy) { if (hasNull(cur)) fs.push_back({sy, tNull}); }
      else { TypeId nn = withoutNull(cur); if (nn != kNoType && nn != cur) fs.push_back({sy, nn}); }
      return;
    }
    if (c.text == "instanceof" && n(c.kids[0]).kind == N::Ident && out.nodeSym[c.kids[0]] != kNone && trackable(out.nodeSym[c.kids[0]]) && out.nodeSym[c.kids[1]] != kNone) {
      std::uint32_t sy = out.nodeSym[c.kids[0]];
      TypeId nt = narrowByInstanceOf(currentType(sy, &fs), out.syms[out.nodeSym[c.kids[1]]].type, truthy);
      if (nt != kNoType) fs.push_back({sy, nt});
    }
  }
  bool exitsAbruptly(std::uint32_t st) const {
    if (st == kNone) return false;
    const Node& x = n(st);
    switch (x.kind) {
      case N::Return: case N::Break: case N::Continue: return true;
      case N::Block: for (std::uint32_t k : x.kids) if (exitsAbruptly(k)) return true; return false;
      case N::If: return x.kids[2] != kNone && exitsAbruptly(x.kids[1]) && exitsAbruptly(x.kids[2]);
      default: return false;
    }
  }
  // Names assigned anywhere inside a loop invalidate what was known about them before it.
  void collectAssigned(std::uint32_t i, std::vector<std::string_view>& names) const {
    if (i == kNone) return;
    const Node& x = n(i);
    auto target = [&](auto&& self, std::uint32_t t) -> void {
      const Node& tn = n(t);
      if (tn.kind == N::Ident) names.push_back(tn.text);
      else if (tn.kind == N::ArrayPattern) for (std::uint32_t k : tn.kids) self(self, k);
    };
    if (x.kind == N::Assign) target(target, x.kids[0]);
    else if (x.kind == N::UpdatePre || x.kind == N::UpdatePost) target(target, x.kids[0]);
    for (std::uint32_t k : x.kids) collectAssigned(k, names);
  }
  void resetAssigned(std::uint32_t loopNode) {
    std::vector<std::string_view> names;
    collectAssigned(loopNode, names);
    for (std::string_view nm : names) {
      std::uint32_t sy = lookup(nm);
      if (sy != kNone && trackable(sy) && ty(out.syms[sy].type).k == TK::Union) narrowing.push_back({sy, out.syms[sy].type});
    }
  }

  // ---- lambdas: checked where they appear, so they see the variables around them
  TypeId funcExpr(std::uint32_t i, TypeId expected) {
    const Node& x = n(i);
    Type et;
    bool haveExpected = expected != kNoType && ty(expected).k == TK::Func;
    if (haveExpected) et = ty(expected);
    std::size_t np = x.kids.size() - 2;
    std::vector<TypeId> ps;
    for (std::size_t k = 0; k < np; ++k) {
      std::uint32_t p = x.kids[2 + k];
      const Node& pn = n(p);
      TypeId t = tError;
      if (pn.kids[1] != kNone) diag(kZUnsupported, p, "default values for lambda parameters");
      else if (pn.kids[0] != kNone) t = annotation(pn.kids[0]);
      else if (haveExpected && k < et.params.size()) t = et.params[k];
      else diag(kZCannotInfer, p, "parameter '" + std::string(pn.text) + "' of a function expression");
      out.nodeType[p] = t;
      ps.push_back(t);
    }
    TypeId ret = x.kids[0] != kNone ? annotation(x.kids[0]) : haveExpected ? et.elem : kNoType;
    if (haveExpected && et.params.size() != np && x.kids[0] == kNone) { /* the arity is checked by the caller's assignability */ }
    // check the body in the scope where the lambda appears
    TypeId savedRet = curRet, savedInferred = inferredRet;
    int savedLoops = loops;
    bool savedImmediate = immediate;
    auto savedNarrowing = std::move(narrowing);
    narrowing.clear();
    curRet = ret == kNoType ? kInferRet : ret;
    inferredRet = kNoType;
    loops = 0;
    immediate = false;
    fnStack.push_back(i);
    push();
    for (std::size_t k = 0; k < np; ++k) {
      std::uint32_t p = x.kids[2 + k];
      if (n(p).kids.size() > 2 && n(p).kids[2] != kNone) bindPattern(n(p).kids[2], ps[k], true, false);
      else out.nodeSym[p] = declare(SymKind::Param, n(p).text, ps[k], p, false, p);
    }
    stmtList(n(x.kids[1]).kids);
    pop();
    fnStack.pop_back();
    if (ret == kNoType) ret = inferredRet != kNoType ? inferredRet : tVoid;
    if (ret != tVoid && !bad(ret) && ty(ret).k != TK::Any && !terminates(x.kids[1])) diag(kZMissingReturn, i, "function expression");
    curRet = savedRet; inferredRet = savedInferred; loops = savedLoops; immediate = savedImmediate;
    narrowing = std::move(savedNarrowing);
    TypeId ft = func(ps, ret, static_cast<std::uint32_t>(np));
    out.nodeType[i] = ft;
    return ft;
  }

  // ---- tuples: an anonymous class per distinct element list, fields named 0, 1, ...
  std::map<std::vector<TypeId>, std::uint32_t> tupleObjs;
  TypeId tupleOf(const std::vector<TypeId>& elems) {
    auto it = tupleObjs.find(elems);
    if (it != tupleObjs.end()) return objType(it->second);
    ObjInfo info;
    info.isClass = true; info.isTuple = true;
    info.name = "[";
    for (std::size_t i = 0; i < elems.size(); ++i) info.name += (i ? ", " : "") + name(elems[i]);
    info.name += "]";
    bool tmpl = false;
    for (TypeId e : elems) tmpl = tmpl || hasParam(e);
    info.isTemplate = tmpl;
    auto oi = static_cast<std::uint32_t>(out.objs.size());
    for (std::size_t i = 0; i < elems.size(); ++i) { Member m; m.name = std::to_string(i); m.type = elems[i]; m.owner = oi; info.members.push_back(std::move(m)); }
    out.objs.push_back(std::move(info));
    tupleObjs[elems] = oi;
    return objType(oi);
  }
  bool isTupleType(TypeId t) const { return ty(t).k == TK::Object && out.objs[ty(t).obj].isTuple; }

  // ---- generics: templates are checked once over opaque type parameters, then instantiated by cloning their nodes
  struct GenericDecl {
    std::uint32_t node = kNone;
    std::vector<std::uint32_t> tp;                      // TypeParam nodes
    std::vector<std::shared_ptr<Scope>> scopes;         // scope chain at the declaration
    std::vector<TypeId> selfParams;                     // the template's own Param types
    std::map<std::vector<TypeId>, std::uint32_t> inst;  // type arguments -> instance symbol
    std::map<std::vector<TypeId>, TypeId> aliasInst;    // type arguments -> type, for aliases
    bool isFunc = false;
  };
  std::unordered_map<std::uint32_t, GenericDecl> generics;  // by symbol
  int instDepth = 0;
  std::unordered_map<std::uint32_t, std::function<void()>> pendingBuild;  // class member collection not yet done, by object

  struct Ctx {
    std::vector<std::shared_ptr<Scope>> scopes;
    TypeId curRet; std::uint32_t curClass, curCtor; bool curStatic, immediate, pendingExempt; int loops;
    const std::vector<std::uint32_t>* ctorStmts; std::vector<std::string> ctorPending;
    std::vector<std::pair<std::uint32_t, TypeId>> narrowing;
    std::vector<std::uint32_t> fnStack;
  };
  Ctx saveCtx() const { return {scopes, curRet, curClass, curCtor, curStatic, immediate, pendingExempt, loops, ctorStmts, ctorPending, narrowing, fnStack}; }
  void restoreCtx(const Ctx& c) {
    scopes = c.scopes; curRet = c.curRet; curClass = c.curClass; curCtor = c.curCtor; curStatic = c.curStatic; immediate = c.immediate;
    pendingExempt = c.pendingExempt; loops = c.loops; ctorStmts = c.ctorStmts; ctorPending = c.ctorPending; narrowing = c.narrowing; fnStack = c.fnStack;
  }
  void ensureBuilt(std::uint32_t obj) {
    auto it = pendingBuild.find(obj);
    if (it == pendingBuild.end()) return;
    auto f = std::move(it->second);
    pendingBuild.erase(it);
    f();
  }

  TypeId paramType(std::uint32_t idx) { Type t; t.k = TK::Param; t.obj = idx; return intern(t); }
  bool hasParam(TypeId t) const {
    const Type& x = ty(t);
    switch (x.k) {
      case TK::Param: return true;
      case TK::Array: case TK::Set: return hasParam(x.elem);
      case TK::Map: return hasParam(x.elem) || hasParam(x.params[0]);
      case TK::Func: { if (hasParam(x.elem)) return true; for (TypeId p : x.params) if (hasParam(p)) return true; return false; }
      case TK::Object: { for (TypeId p : out.objs[x.obj].typeArgs) if (hasParam(p)) return true; return false; }
      default: return false;
    }
  }
  bool anyParam(const std::vector<TypeId>& v) const { for (TypeId t : v) if (hasParam(t)) return true; return false; }
  // The type whose members and operators apply: a type parameter acts as its constraint.
  TypeId app(TypeId t) const {
    for (int k = 0; k < 16 && ty(t).k == TK::Param; ++k) {
      TypeId c = out.tparams[ty(t).obj].constraint;
      if (c == kNoType) return tError;
      t = c;
    }
    return t;
  }

  // `app`, reporting an operation on an unconstrained type parameter.
  TypeId appOrDiag(TypeId t, std::uint32_t node) {
    if (ty(t).k == TK::Union) { diag(kZBadOperand, node, "'" + name(t) + "' must be narrowed first" + (hasNull(t) ? " (it may be null)" : "")); return tError; }
    if (ty(t).k != TK::Param) return t;
    TypeId r = app(t);
    if (bad(r)) diag(kZBadOperand, node, "type parameter '" + name(t) + "' has no constraint that allows this");
    return r;
  }

  std::uint32_t cloneNode(std::uint32_t id, bool dropTParams) {
    if (id == kNone) return kNone;
    Node copy = a.nodes[id];
    for (auto& k : copy.kids) k = cloneNode(k, false);
    a.nodes.push_back(copy);
    auto nid = static_cast<std::uint32_t>(a.nodes.size() - 1);
    out.nodeType.push_back(kNoType);
    out.nodeSym.push_back(kNone);
    if (!dropTParams) {
      auto it = a.tparams.find(id);
      if (it != a.tparams.end()) { auto src = it->second; std::vector<std::uint32_t> v; for (std::uint32_t t : src) v.push_back(cloneNode(t, false)); a.tparams[nid] = std::move(v); }
    }
    auto ta = a.targs.find(id);
    if (ta != a.targs.end()) { auto src = ta->second; std::vector<std::uint32_t> v; for (std::uint32_t t : src) v.push_back(cloneNode(t, false)); a.targs[nid] = std::move(v); }
    return nid;
  }

  template <class F> void withAliasScope(const GenericDecl& g, const std::vector<TypeId>& args, F&& fn) {
    Ctx saved = saveCtx();
    scopes = g.scopes;
    push();
    for (std::size_t i = 0; i < g.tp.size(); ++i) declare(SymKind::TypeAlias, n(g.tp[i]).text, args[i], g.tp[i], true, g.tp[i]);
    fn();
    restoreCtx(saved);
  }

  // ---- type aliases: resolved on first use, in the scope they were declared in
  std::vector<std::uint32_t> aliasResolving;
  TypeId resolveAlias(std::uint32_t sym) {
    if (out.syms[sym].type != kNoType) return out.syms[sym].type;
    if (std::find(aliasResolving.begin(), aliasResolving.end(), sym) != aliasResolving.end()) { diag(kZCannotInfer, out.syms[sym].decl, "type alias '" + std::string(out.syms[sym].name) + "' refers to itself"); return out.syms[sym].type = tError; }
    aliasResolving.push_back(sym);
    TypeId t = tError;
    GenericDecl& g = generics[sym];
    withAliasScope(g, {}, [&]() { t = annotation(n(g.node).kids[0]); });
    aliasResolving.pop_back();
    return out.syms[sym].type = t;
  }
  TypeId instantiateAlias(std::uint32_t sym, const std::vector<TypeId>& args, std::uint32_t at) {
    GenericDecl& g = generics[sym];
    auto hit = g.aliasInst.find(args);
    if (hit != g.aliasInst.end()) return hit->second;
    if (instDepth >= 64) { diag(kZCannotInfer, at, "generic type alias is nested too deeply"); return tError; }
    ++instDepth;
    ensureSelf(g);
    TypeId t = tError;
    if (anyParam(args) || checkConstraints(g, args, at)) withAliasScope(g, args, [&]() { t = annotation(n(g.node).kids[0]); });
    g.aliasInst[args] = t;
    --instDepth;
    return t;
  }

  void ensureSelf(GenericDecl& g) {
    if (!g.selfParams.empty() || g.tp.empty()) return;
    std::vector<std::uint32_t> idx;
    for (std::uint32_t tpn : g.tp) {
      out.tparams.push_back({std::string(n(tpn).text), kNoType});
      idx.push_back(static_cast<std::uint32_t>(out.tparams.size() - 1));
      g.selfParams.push_back(paramType(idx.back()));
    }
    withAliasScope(g, g.selfParams, [&]() {
      for (std::size_t i = 0; i < g.tp.size(); ++i)
        if (n(g.tp[i]).kids[0] != kNone) out.tparams[idx[i]].constraint = annotation(n(g.tp[i]).kids[0]);
    });
  }

  std::string argsText(const std::vector<TypeId>& args) const {
    std::string s = "<";
    for (std::size_t i = 0; i < args.size(); ++i) s += (i ? ", " : "") + name(args[i]);
    return s + ">";
  }

  bool checkConstraints(GenericDecl& g, const std::vector<TypeId>& args, std::uint32_t at) {
    bool ok = true;
    withAliasScope(g, args, [&]() {
      for (std::size_t i = 0; i < g.tp.size(); ++i) {
        if (n(g.tp[i]).kids[0] == kNone) continue;
        TypeId c = annotation(n(g.tp[i]).kids[0]);
        if (!assignable(args[i], c, kNone)) { diag(kZNotAssignable, at, "type argument '" + name(args[i]) + "' does not satisfy '" + name(c) + "'"); ok = false; }
      }
    });
    return ok;
  }

  // The instance symbol of generic function `gsym` for these type arguments (kNone on failure).
  std::uint32_t instantiateFunc(std::uint32_t gsym, const std::vector<TypeId>& args, std::uint32_t at) {
    GenericDecl& g = generics[gsym];
    auto hit = g.inst.find(args);
    if (hit != g.inst.end()) return hit->second;
    if (instDepth >= 64) { diag(kZCannotInfer, at, "generic instantiation is nested too deeply"); return kNone; }
    ++instDepth;
    ensureSelf(g);
    if (!anyParam(args) && !checkConstraints(g, args, at)) { --instDepth; return kNone; }
    std::uint32_t symId = kNone;
    withAliasScope(g, args, [&]() {
      std::uint32_t clone = cloneNode(g.node, true);
      std::vector<std::uint32_t> ps;
      TypeId sig = signature(clone, 2, false, ps);
      out.nodeType[clone] = sig;
      out.syms.push_back({SymKind::Func, n(g.node).text, sig, clone, true});
      symId = static_cast<std::uint32_t>(out.syms.size() - 1);
      out.nodeSym[clone] = symId;
      g.inst[args] = symId;
      if (!anyParam(args)) { out.instances.push_back(clone); out.nodeNames[clone] = std::string(n(g.node).text) + argsText(args); }
      auto snap = scopes;  // includes the alias scope
      defer->push_back([this, clone, sig, ps, snap]() {
        Ctx sv = saveCtx();
        scopes = snap; curClass = kNoObj; curCtor = kNoObj; curStatic = false;
        checkBody(clone, sig, ps, false);
        restoreCtx(sv);
      });
    });
    --instDepth;
    return symId;
  }

  // Links a class to its base class and an interface to the interfaces it extends (generic bases are instantiated).
  void resolveHeritage(std::uint32_t s, std::uint32_t oi) {
    const Node& cn = n(s);
    auto resolve = [&](std::uint32_t refNode, bool wantInterface) -> std::uint32_t {
      const Node& rn = n(refNode);
      std::uint32_t sy = lookup(rn.text);
      if (sy == kNone) { diag(kZCannotFindName, refNode, "'" + std::string(rn.text) + "'"); return kNoObj; }
      std::uint32_t o = kNoObj;
      if (out.syms[sy].kind == SymKind::GenericClass) {
        std::vector<TypeId> args;
        for (std::uint32_t k : rn.kids) args.push_back(annotation(k));
        if (args.size() != generics[sy].tp.size()) { diag(kZCannotInfer, refNode, "'" + std::string(rn.text) + "' needs " + std::to_string(generics[sy].tp.size()) + " type argument(s)"); return kNoObj; }
        std::uint32_t inst = instantiateClass(sy, args, refNode);
        if (inst == kNone) return kNoObj;
        o = ty(out.syms[inst].type).obj;
      } else if (out.syms[sy].kind == SymKind::Class && rn.kids.empty()) {
        o = ty(out.syms[sy].type).obj;
      } else { diag(kZInvalidHierarchy, refNode, "'" + std::string(rn.text) + "' is not " + (wantInterface ? "an interface" : "a class")); return kNoObj; }
      if (out.objs[o].isInterface != wantInterface) { diag(kZInvalidHierarchy, refNode, "'" + std::string(rn.text) + "' is not " + (wantInterface ? "an interface" : "a class")); return kNoObj; }
      return o;
    };
    if (cn.kind == N::Class && cn.kids[0] != kNone) {
      out.objs[oi].parent = resolve(cn.kids[0], false);
      std::uint32_t po = out.objs[oi].parent;
      if (po != kNoObj && out.objs[po].genericSym == kNoObj) {
        std::uint32_t ps = lookup(n(cn.kids[0]).text);
        if (ps != kNone && out.syms[ps].decl != kNone && n(out.syms[ps].decl).file == cn.file && n(out.syms[ps].decl).start > cn.start) diag(kZCannotFindName, cn.kids[0], "class '" + out.objs[po].name + "' used before its declaration");
      }
    }
    if (cn.kind == N::Interface && cn.kids[0] != kNone)
      for (std::uint32_t r : std::vector<std::uint32_t>(n(cn.kids[0]).kids)) { std::uint32_t io = resolve(r, true); if (io != kNoObj) out.objs[oi].ifaces.push_back(io); }
  }

  // The class symbol of generic class or interface `gsym` for these type arguments (kNone on failure).
  std::uint32_t instantiateClass(std::uint32_t gsym, const std::vector<TypeId>& args, std::uint32_t at) {
    GenericDecl& g = generics[gsym];
    auto hit = g.inst.find(args);
    if (hit != g.inst.end()) return hit->second;
    if (instDepth >= 64) { diag(kZCannotInfer, at, "generic instantiation is nested too deeply"); return kNone; }
    ++instDepth;
    ensureSelf(g);
    if (!anyParam(args) && !checkConstraints(g, args, at)) { --instDepth; return kNone; }
    std::uint32_t symId = kNone;
    withAliasScope(g, args, [&]() {
      const Node& tn = n(g.node);
      ObjInfo info;
      info.name = std::string(tn.text) + argsText(args);
      info.isClass = tn.kind == N::Class;
      info.isInterface = tn.kind == N::Interface;
      info.isAbstract = (tn.flags & frontend::kFlagAbstract) != 0;
      info.genericSym = gsym; info.typeArgs = args; info.isTemplate = anyParam(args);
      out.objs.push_back(info);
      auto oi = static_cast<std::uint32_t>(out.objs.size() - 1);
      TypeId t = objType(oi);
      std::uint32_t clone = cloneNode(g.node, true);
      out.nodeType[clone] = t;
      out.syms.push_back({SymKind::Class, tn.text, t, clone, true});
      symId = static_cast<std::uint32_t>(out.syms.size() - 1);
      out.nodeSym[clone] = symId;
      g.inst[args] = symId;
      resolveHeritage(clone, oi);
      ensureBuilt(out.objs[oi].parent);
      for (std::uint32_t pi : out.objs[oi].ifaces) ensureBuilt(pi);
      classMembers(clone, oi);
      if (!anyParam(args)) out.instances.push_back(clone);
    });
    --instDepth;
    return symId;
  }

  // ---- inference: bind the template's own type parameters from the argument types
  bool unify(const GenericDecl& g, TypeId p, TypeId arg, std::vector<TypeId>& bound, std::uint32_t argNode) {
    const Type& pt = ty(p);
    if (pt.k == TK::Param) {
      for (std::size_t i = 0; i < g.selfParams.size(); ++i) {
        if (g.selfParams[i] != p) continue;
        if (bound[i] == kNoType) { bound[i] = arg; return true; }
        if (bound[i] == arg) return true;
        if (assignable(arg, bound[i], argNode)) return true;
        if (assignable(bound[i], arg, kNone)) { bound[i] = arg; return true; }
        diag(kZNotAssignable, argNode, "'" + name(arg) + "' to '" + name(bound[i]) + "' for type parameter '" + out.tparams[pt.obj].name + "'");
        return false;
      }
      return true;  // a type parameter of an enclosing template: no binding, the argument check decides
    }
    const Type& at = ty(arg);
    if (pt.k == TK::Array && at.k == TK::Array) return unify(g, pt.elem, at.elem, bound, argNode);
    if (pt.k == TK::Func && at.k == TK::Func && pt.params.size() == at.params.size()) {
      for (std::size_t i = 0; i < pt.params.size(); ++i) if (!unify(g, pt.params[i], at.params[i], bound, argNode)) return false;
      return unify(g, pt.elem, at.elem, bound, argNode);
    }
    if (pt.k == TK::Object && at.k == TK::Object) {
      const ObjInfo &po = out.objs[pt.obj], &ao = out.objs[at.obj];
      if (po.genericSym != kNoObj && po.genericSym == ao.genericSym && po.typeArgs.size() == ao.typeArgs.size()) {
        for (std::size_t i = 0; i < po.typeArgs.size(); ++i) if (!unify(g, po.typeArgs[i], ao.typeArgs[i], bound, argNode)) return false;
      }
    }
    return true;
  }

  // Type arguments of a call or new: explicit ones, else inferred from the already evaluated argument types. Empty on failure.
  std::vector<TypeId> typeArgsFor(std::uint32_t gsym, std::uint32_t callNode, const std::vector<std::uint32_t>& argNodes, TypeId templateFunc) {
    GenericDecl& g = generics[gsym];
    ensureSelf(g);
    auto ex = a.targs.find(callNode);
    if (ex != a.targs.end()) {
      std::vector<TypeId> args;
      for (std::uint32_t t : std::vector<std::uint32_t>(ex->second)) args.push_back(annotation(t));
      if (args.size() != g.tp.size()) { diag(kZWrongArgCount, callNode, "expected " + std::to_string(g.tp.size()) + " type argument(s), got " + std::to_string(args.size())); return {}; }
      return args;
    }
    std::vector<TypeId> bound(g.tp.size(), kNoType);
    const Type f = ty(templateFunc);
    for (std::size_t k = 0; k < argNodes.size() && k < f.params.size(); ++k)
      if (!unify(g, f.params[k], out.nodeType[argNodes[k]], bound, argNodes[k])) return {};
    for (std::size_t i = 0; i < bound.size(); ++i)
      if (bound[i] == kNoType) { diag(kZCannotInfer, callNode, "type argument '" + out.tparams[ty(g.selfParams[i]).obj].name + "'"); return {}; }
    return bound;
  }

  // Members of a class or interface node, in order.
  std::vector<std::uint32_t> membersOf(std::uint32_t node) const {
    const Node& c = n(node);
    std::size_t from = c.kind == N::Class ? kClassMembersFrom : 1;
    return std::vector<std::uint32_t>(c.kids.begin() + static_cast<std::ptrdiff_t>(from), c.kids.end());
  }

  static std::uint8_t accessOf(std::uint32_t fl) { return (fl & frontend::kFlagPrivate) ? 2 : (fl & frontend::kFlagProtected) ? 1 : 0; }

  void classMembers(std::uint32_t cls, std::uint32_t objIdx) {
    const Node& c = n(cls);
    bool isIface = c.kind == N::Interface;
    TypeId self = objType(objIdx);
    std::uint32_t par = out.objs[objIdx].parent;
    std::vector<std::pair<std::uint32_t, TypeId>> methods;  // node, signature
    std::vector<std::vector<std::uint32_t>> methodParams;
    std::uint32_t ctorNode = kNone;
    std::vector<std::uint32_t> mems = membersOf(cls);
    if (isIface) {  // an interface carries the methods of the interfaces it extends
      for (std::uint32_t pi : out.objs[objIdx].ifaces)
        for (const Member& pm : out.objs[pi].members) out.objs[objIdx].members.push_back(pm);
    }
    for (std::uint32_t m : mems) {
      const Node& mn = n(m);
      std::uint32_t fl = mn.flags;
      bool isCtor = mn.kind == N::Method && mn.text == "constructor";
      bool dup = false;
      if (!isCtor) for (const Member& e : out.objs[objIdx].members) if (e.owner == objIdx && e.name == mn.text && e.isStatic == ((fl & frontend::kFlagStatic) != 0)) dup = true;
      if (dup || (isCtor && ctorNode != kNone)) { diag(kZDuplicateDeclaration, m, "'" + std::string(mn.text) + "'"); continue; }
      if (isIface && mn.kind == N::Field) { diag(kZUnsupported, m, "interface properties"); continue; }
      if (isIface && isCtor) { diag(kZUnsupported, m, "constructors in interfaces"); continue; }
      if ((fl & frontend::kFlagAbstract) && !isIface && !(out.objs[objIdx].isAbstract)) diag(kZAbstractViolation, m, "abstract member '" + std::string(mn.text) + "' in a concrete class");
      Member mem;
      mem.name = std::string(mn.text); mem.owner = objIdx; mem.access = accessOf(fl); mem.isStatic = (fl & frontend::kFlagStatic) != 0;
      if (mn.kind == N::Field) {
        TypeId t = tError;
        if (mn.kids[0] != kNone) t = annotation(mn.kids[0]);
        else if (mn.kids[1] != kNone) {
          const Node& in = n(mn.kids[1]);
          t = in.kind == N::Number ? num(Num::f64) : in.kind == N::String ? tStr : (in.kind == N::Literal && in.text != "null") ? tBool : tError;
          if (t == tError) diag(kZCannotInfer, m, "field '" + std::string(mn.text) + "'");
        } else diag(kZCannotInfer, m, "field '" + std::string(mn.text) + "'");
        out.nodeType[m] = t;
        mem.type = t; mem.readonly = (fl & frontend::kFlagReadonly) != 0;
      } else {
        std::vector<std::uint32_t> ps;
        TypeId sig = signature(m, 2, isCtor, ps);
        out.nodeType[m] = sig;
        if (isCtor) { out.objs[objIdx].ctor = func(ty(sig).params, self, ty(sig).minArgs); out.objs[objIdx].ctorAccess = accessOf(fl); ctorNode = m; }
        mem.type = sig; mem.method = true; mem.readonly = true; mem.isAbstract = isIface || (fl & frontend::kFlagAbstract);
        mem.getter = (fl & frontend::kFlagGetter) != 0;
        if (mem.getter && (isIface || mem.isStatic)) diag(kZUnsupported, m, isIface ? "accessors in interfaces" : "static accessors");
        methods.push_back({m, sig});
        methodParams.push_back(std::move(ps));
        if (mn.kids[1] == kNone && !isIface && !(fl & frontend::kFlagAbstract) && !isCtor) diag(kZAbstractViolation, m, "method '" + std::string(mn.text) + "' has no body");
        if (isCtor) continue;
      }
      // an override must keep the base member's kind and type
      if (!mem.isStatic && par != kNoObj) {
        const Member* pm = lookupMember(par, mem.name, false);
        if (pm && (!mem.method || !pm->method || pm->type != mem.type || pm->access == 2 || pm->getter != mem.getter)) diag(kZInvalidHierarchy, m, "'" + mem.name + "' does not match the base class member");
        else if (!pm && (fl & frontend::kFlagOverride)) diag(kZInvalidHierarchy, m, "'" + mem.name + "' overrides nothing");
      } else if (!par && (fl & frontend::kFlagOverride)) diag(kZInvalidHierarchy, m, "'" + mem.name + "' overrides nothing");
      out.objs[objIdx].members.push_back(std::move(mem));
    }
    if (!isIface && par != kNoObj && out.objs[par].ctorAccess == 2) diag(kZNotAccessible, cls, "cannot extend '" + out.objs[par].name + "': its constructor is private");
    if (!isIface) {
      // a derived class without a constructor takes its base class's parameters
      if (ctorNode == kNone && par != kNoObj && out.objs[par].ctor != kNoType) out.objs[objIdx].ctor = func(ty(out.objs[par].ctor).params, self, ty(out.objs[par].ctor).minArgs);
      // `implements I`: every member of I must be present with the same type
      if (c.kids[1] != kNone)
        for (std::uint32_t r : std::vector<std::uint32_t>(n(c.kids[1]).kids)) {
          TypeId it = annotation(r);
          if (bad(it)) continue;
          if (ty(it).k != TK::Object || !out.objs[ty(it).obj].isInterface) { diag(kZInvalidHierarchy, r, "'implements' needs an interface"); continue; }
          std::uint32_t io = ty(it).obj;
          for (const Member& im : out.objs[io].members) {
            const Member* m = lookupMember(objIdx, im.name, false);
            if (!m || !m->method || m->type != im.type || m->access != 0) diag(kZMissingInterfaceMember, r, "'" + im.name + "' of '" + out.objs[io].name + "'");
          }
        }
      // a concrete class must implement every abstract member in its chain
      if (!out.objs[objIdx].isAbstract)
        for (std::uint32_t o = objIdx; o != kNoObj; o = out.objs[o].parent)
          for (const Member& am : out.objs[o].members) {
            if (!am.isAbstract || am.isStatic) continue;
            const Member* impl = lookupMember(objIdx, am.name, false);
            if (!impl || impl->isAbstract) { diag(kZAbstractViolation, cls, "abstract '" + am.name + "' is not implemented"); break; }
          }
      // a derived class constructor must start with super(...)
      if (par != kNoObj && ctorNode != kNone && n(ctorNode).kids[1] != kNone) {
        const auto& body = n(n(ctorNode).kids[1]).kids;
        bool ok = !body.empty() && n(body[0]).kind == N::ExprStmt && n(n(body[0]).kids[0]).kind == N::Call && n(n(n(body[0]).kids[0]).kids[0]).kind == N::Super;
        if (!ok) diag(kZBadSuperCall, ctorNode, "a derived class constructor must start with super(...)");
      }
      // strictPropertyInitialization: an instance field without initializer must be assigned at the top level of the constructor
      for (std::uint32_t m : mems) {
        const Node& mn = n(m);
        if (mn.kind != N::Field || mn.kids[1] != kNone || (mn.flags & frontend::kFlagStatic)) continue;
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
    }
    auto snapScopes = scopes;
    defer->push_back([this, objIdx, methods, methodParams, mems, snapScopes]() {
      Ctx savedCtx = saveCtx();
      scopes = snapScopes;
      std::uint32_t saved = curClass;
      bool savedStatic = curStatic, savedImmediate = immediate;
      curClass = objIdx;
      for (std::uint32_t m : mems) {
        const Node& mn = n(m);
        if (mn.kind == N::Field && mn.kids[1] != kNone && out.nodeType[m] != kNoType) {
          curStatic = (mn.flags & frontend::kFlagStatic) != 0;
          immediate = curStatic;  // static initialisers run where the class is declared, instance ones at construction
          require(expr(mn.kids[1], out.nodeType[m]), out.nodeType[m], mn.kids[1]);
        }
      }
      immediate = savedImmediate;
      for (std::size_t k = 0; k < methods.size(); ++k) {
        const Node& mn = n(methods[k].first);
        bool isCtor = mn.text == "constructor";
        curStatic = (mn.flags & frontend::kFlagStatic) != 0;
        std::uint32_t savedCtor = curCtor;
        const std::vector<std::uint32_t>* savedStmts = ctorStmts;
        std::vector<std::string> savedPending = ctorPending;
        if (isCtor) {
          curCtor = objIdx;
          ctorPending.clear();
          for (std::uint32_t m : mems) {
            const Node& fn = n(m);
            if (fn.kind == N::Field && fn.kids[1] == kNone && !(fn.flags & frontend::kFlagStatic)) ctorPending.push_back(std::string(fn.text));
          }
          ctorStmts = n(methods[k].first).kids[1] != kNone ? &n(n(methods[k].first).kids[1]).kids : nullptr;
        }
        checkBody(methods[k].first, methods[k].second, methodParams[k], isCtor);
        curCtor = savedCtor; ctorStmts = savedStmts; ctorPending = savedPending;
      }
      curClass = saved;
      curStatic = savedStatic;
      restoreCtx(savedCtx);
    });
  }

  void stmtList(const std::vector<std::uint32_t>& stmts) {
    std::vector<std::function<void()>> mine;
    auto* saved = defer;
    defer = &mine;
    // hoist classes and interfaces first (functions may mention them), then functions
    std::vector<std::pair<std::uint32_t, std::uint32_t>> classes;
    std::vector<std::uint32_t> genericSyms, aliasSyms;
    for (std::uint32_t s : stmts) {  // numeric enums: the type is i32, the members are constants
      if (n(s).kind != N::Enum) continue;
      out.enumNames.push_back(std::string(n(s).text));
      Type et; et.k = TK::Num; et.num = Num::i32; et.obj = static_cast<std::uint32_t>(out.enumNames.size());
      std::uint32_t es = declare(SymKind::Enum, n(s).text, intern(et), s, true, s);
      out.nodeSym[s] = es;
      std::int64_t next = 0;
      auto& members = out.enumMembers[es];
      for (std::uint32_t mi : n(s).kids) {
        const Node& mn = n(mi);
        if (mn.kids[0] != kNone) {
          const Node* v = &n(mn.kids[0]);
          bool neg = v->kind == N::Unary && v->text == "-";
          if (neg) v = &n(v->kids[0]);
          if (v->kind != N::Number || !isIntLit(a, mn.kids[0])) { diag(kZUnsupported, mi, "computed enum members"); continue; }
          next = std::strtoll(std::string(v->text).c_str(), nullptr, 0);
          if (neg) next = -next;
        }
        for (auto& e : members) if (e.first == mn.text) diag(kZDuplicateDeclaration, mi, "'" + std::string(mn.text) + "'");
        members.push_back({std::string(mn.text), next});
        ++next;
      }
    }
    for (std::uint32_t s : stmts) {  // type aliases: declared now, resolved on first use
      if (n(s).kind != N::TypeAlias) continue;
      auto tp = a.tparams.find(s);
      std::uint32_t as = declare(tp == a.tparams.end() ? SymKind::TypeAlias : SymKind::GenericAlias, n(s).text, kNoType, s, true, s);
      GenericDecl g;
      g.node = s; g.scopes = scopes;
      if (tp != a.tparams.end()) g.tp = tp->second;
      generics[as] = std::move(g);
      out.nodeSym[s] = as;
      aliasSyms.push_back(as);
    }
    for (std::uint32_t s : stmts) {
      N k = n(s).kind;
      if (k != N::Class && k != N::Interface && k != N::Function) continue;
      auto tp = a.tparams.find(s);
      if (tp == a.tparams.end()) continue;
      std::uint32_t gs = declare(k == N::Function ? SymKind::GenericFunc : SymKind::GenericClass, n(s).text, kNoType, s, true, s);
      out.nodeSym[s] = gs;
      GenericDecl g;
      g.node = s; g.tp = tp->second; g.scopes = scopes; g.isFunc = k == N::Function;
      generics[gs] = std::move(g);
      genericSyms.push_back(gs);
    }
    for (std::uint32_t s : stmts) {
      if (n(s).kind != N::Class && n(s).kind != N::Interface) continue;
      if (a.tparams.count(s)) continue;
      ObjInfo info;
      info.name = std::string(n(s).text);
      info.isClass = n(s).kind == N::Class;
      info.isInterface = n(s).kind == N::Interface;
      info.isAbstract = (n(s).flags & frontend::kFlagAbstract) != 0;
      out.objs.push_back(info);
      auto oi = static_cast<std::uint32_t>(out.objs.size() - 1);
      TypeId t = objType(oi);
      out.nodeType[s] = t;
      out.nodeSym[s] = declare(SymKind::Class, n(s).text, t, s, true, s);
      classes.push_back({s, oi});
    }
    for (auto [s, oi] : classes) resolveHeritage(s, oi);
    for (auto [s, oi] : classes) {  // a hierarchy that loops back on itself
      std::uint32_t k = 0;
      for (std::uint32_t o = out.objs[oi].parent; o != kNoObj; o = out.objs[o].parent)
        if (o == oi || ++k > out.objs.size()) { diag(kZInvalidHierarchy, s, "circular inheritance"); out.objs[oi].parent = kNoObj; break; }
    }
    for (auto [s, oi] : classes) {
      pendingBuild[oi] = [this, s, oi]() {
        ensureBuilt(out.objs[oi].parent);
        for (std::uint32_t pi : out.objs[oi].ifaces) ensureBuilt(pi);
        classMembers(s, oi);
      };
    }
    for (auto [s, oi] : classes) ensureBuilt(oi);
    for (std::uint32_t s : stmts) {
      if (n(s).kind != N::Function || a.tparams.count(s)) continue;
      std::vector<std::uint32_t> ps;
      TypeId sig = signature(s, 2, false, ps);
      out.nodeType[s] = sig;
      out.nodeSym[s] = declare(SymKind::Func, n(s).text, sig, s, true, s);
      if (n(s).kids[1] == kNone) { diag(kZUnsupported, s, "function declarations without a body"); continue; }
      defer->push_back([this, s, sig, ps]() { checkBody(s, sig, ps, false); });
    }
    for (std::uint32_t as : aliasSyms) if (out.syms[as].kind == SymKind::TypeAlias) resolveAlias(as);  // report errors even in unused aliases
    for (std::uint32_t gs : genericSyms) {  // check every template once, over its own type parameters
      GenericDecl& g = generics[gs];
      ensureSelf(g);
      if (g.isFunc) instantiateFunc(gs, g.selfParams, g.node); else instantiateClass(gs, g.selfParams, g.node);
    }
    bool rootList = &stmts == topList;
    for (std::uint32_t s : stmts) {
      atTop = rootList;
      statement(s);
      if (&stmts == ctorStmts && n(s).kind == N::ExprStmt) {  // `this.f = ...` at the top level of a constructor assigns f
        const Node& as = n(n(s).kids[0]);
        if (as.kind == N::Assign && as.text == "=" && n(as.kids[0]).kind == N::Member && n(n(as.kids[0]).kids[0]).kind == N::This) {
          auto it = std::find(ctorPending.begin(), ctorPending.end(), std::string(n(as.kids[0]).text));
          if (it != ctorPending.end()) ctorPending.erase(it);
        }
      }
    }
    for (std::size_t di = 0; di < mine.size(); ++di) { auto f = mine[di]; f(); }  // closures may add more closures
    defer = saved;
  }

  const std::vector<std::uint32_t>* topList = nullptr;  // the statement list of the module being checked
  std::vector<std::map<std::string_view, std::uint32_t>> exportsOf;  // per module: exported name -> symbol

  void run() {
    builtins();
    if (a.modules.empty()) {  // one parsed file
      push();
      topList = &n(a.root).kids;
      stmtList(*topList);
      pop();
      pop();
      return;
    }
    exportsOf.resize(a.modules.size());
    for (std::uint32_t mi = 0; mi < a.modules.size(); ++mi) {  // initialisation order: a module after the modules it imports
      const ModuleInfo& mod = a.modules[mi];
      push();
      for (const ModuleImport& im : mod.imports) {
        auto it = exportsOf[im.from].find(im.name);
        if (it == exportsOf[im.from].end()) { diag(kZCannotFindName, im.node, "'" + std::string(im.name) + "' is not exported by '" + a.modules[im.from].path + "'"); continue; }
        if (scopes.back()->count(im.local)) { diag(kZDuplicateDeclaration, im.node, "'" + std::string(im.local) + "'"); continue; }
        (*scopes.back())[im.local] = it->second;
      }
      topList = &mod.stmts;
      stmtList(mod.stmts);
      auto& mine = exportsOf[mi];
      auto add = [&](std::string_view nm, std::uint32_t sym, std::uint32_t node) {
        if (!mine.emplace(nm, sym).second) diag(kZDuplicateDeclaration, node, "export '" + std::string(nm) + "'");
      };
      for (const ModuleExport& e : mod.exports) {
        if (e.all) { for (auto& [nm, sym] : exportsOf[e.from]) mine.emplace(nm, sym); continue; }
        std::uint32_t sym = kNone;
        if (e.from == kNone) { auto f = scopes.back()->find(e.local); if (f != scopes.back()->end()) sym = f->second; }
        else { auto f = exportsOf[e.from].find(e.local); if (f != exportsOf[e.from].end()) sym = f->second; }
        if (sym == kNone) { diag(kZCannotFindName, e.node, "'" + std::string(e.local) + "' " + (e.from == kNone ? "is not declared in this module" : "is not exported by '" + a.modules[e.from].path + "'")); continue; }
        add(e.name, sym, e.node);
      }
      pop();
    }
    pop();
  }
};

}  // namespace

bool isSubclass(const Checked& c, std::uint32_t a, std::uint32_t b) {
  for (std::uint32_t k = 0; a != 0xFFFFFFFFu && k < 1000; a = c.objs[a].parent, ++k) if (a == b) return true;
  return false;
}

// A member found through the class chain: instance members, or static ones when wantStatic.
const Member* lookupMember(const Checked& c, std::uint32_t obj, std::string_view name, bool wantStatic) {
  for (std::uint32_t o = obj, k = 0; o != 0xFFFFFFFFu && k < 1000; o = c.objs[o].parent, ++k)
    for (const Member& m : c.objs[o].members) if (m.name == name && m.isStatic == wantStatic) return &m;
  return nullptr;
}

// Structural check against an interface: every method of the interface, with the same type, is public on `obj`.
static bool structuralMatch(const Checked& c, std::uint32_t obj, std::uint32_t iface) {
  for (const Member& im : c.objs[iface].members) {
    if (im.isStatic) continue;
    const Member* m = lookupMember(c, obj, im.name, false);
    if (!m || !m->method || m->type != im.type || m->access != 0) return false;
  }
  return true;
}

bool objAssignable(const Checked& c, std::uint32_t a, std::uint32_t b) {
  if (a == b) return true;
  if (c.objs[b].isInterface) return structuralMatch(c, a, b);
  if (c.objs[a].isInterface) return false;
  return isSubclass(c, a, b);
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

Checked check(Ast& ast) {
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
    case TK::Num: return x.obj ? c.enumNames[x.obj - 1] : numName(x.num);
    case TK::Bool: return "boolean";
    case TK::Str: return "string";
    case TK::Void: return "void";
    case TK::Null: return "null";
    case TK::Array: return typeName(c, x.elem) + "[]";
    case TK::Map: return "Map<" + typeName(c, x.params[0]) + ", " + typeName(c, x.elem) + ">";
    case TK::Set: return "Set<" + typeName(c, x.elem) + ">";
    case TK::Object: return c.objs[x.obj].name;
    case TK::Param: return c.tparams[x.obj].name;
    case TK::Union: { std::string u; for (std::size_t i = 0; i < x.params.size(); ++i) u += (i ? " | " : "") + typeName(c, x.params[i]); return u; }
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
