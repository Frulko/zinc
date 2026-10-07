#include "frontend/check.h"

#include <algorithm>
#include <functional>
#include <map>
#include <memory>
#include <set>
#include <unordered_map>

#include "frontend/dyn.h"
#include "frontend/inspect.h"
#include "frontend/snippet.h"
#include "frontend/lexer.h"
#include "frontend/parser.h"
#include "zn/runtime.h"

namespace zn::frontend {
namespace {

constexpr TypeId tError = 0, tAny = 1, tBool = 2, tStr = 3, tVoid = 4, tNull = 5, tDyn = 6;  // tAny: console.log's "anything"; tDyn: the `any` of programs

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
  struct Forward { std::uint32_t sym; TypeId type; };
  std::unordered_map<std::uint32_t, Forward> forwardVars;  // top-level declarators with a type annotation, declared before the statements run through
  std::string_view selfName;                    // the variable whose initializer is being checked, when a lambda in it mentions it
  std::size_t selfDepth = 0;                    // fnStack depth of that initializer
  std::vector<std::pair<std::uint32_t, TypeId>> selfDeferred;  // lambdas whose body waits for the variable (node, expected type)
  bool mentionsInFunction(std::uint32_t i, std::string_view nm, bool inFn = false) const {
    const Node& x = n(i);
    if (x.kind == N::Ident && inFn && x.text == nm) return true;
    bool f = inFn || x.kind == N::Function || x.kind == N::FuncExpr || x.kind == N::Method;
    for (std::uint32_t k : x.kids) if (k != kNone && mentionsInFunction(k, nm, f)) return true;
    return false;
  }
  bool mentionsIdent(std::uint32_t i, std::string_view nm) const {
    const Node& x = n(i);
    if (x.kind == N::Ident && x.text == nm) return true;
    for (std::uint32_t k : x.kids) if (k != kNone && mentionsIdent(k, nm)) return true;
    return false;
  }
  bool mentionsInLambda(std::uint32_t i, std::string_view nm, bool inLambda = false) const {
    const Node& x = n(i);
    if (x.kind == N::Ident && inLambda && x.text == nm) return true;
    bool lam = inLambda || x.kind == N::FuncExpr;
    for (std::uint32_t k : x.kids) if (k != kNone && mentionsInLambda(k, nm, lam)) return true;
    return false;
  }
  bool inspectMode = false;           // checking a generated console.log formatter
  std::uint32_t nullishLeft = kNone;  // the left operand of the `??` being checked
  std::uint32_t exprStmtOf = kNone;   // the expression of the expression statement being checked
  std::uint32_t logArg = kNone;       // the console.log argument being checked
  std::uint32_t asOperand = kNone;    // the operand of the `as` being checked: `m.get(k) as T` states that the key is there
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
    for (TK k : {TK::Error, TK::Any, TK::Bool, TK::Str, TK::Void, TK::Null, TK::Any}) { Type t; t.k = k; out.types.push_back(t); }
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
      if (u.k == t.k && u.num == t.num && u.elem == t.elem && u.params == t.params && u.minArgs == t.minArgs && u.variadic == t.variadic && u.undef == t.undef && u.obj == t.obj) return i;
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
  // ---- Dyn (`any` is tDyn, `unknown` is the class Dyn of the prelude; both are references to the classes of dyn.cpp)
  bool generating = false;       // declaring generated code: its `any` is not the program's
  bool inPrelude = false;        // checking the prelude: `any` there is the class Dyn itself
  bool rawDyn() const { return inspectMode || inPrelude; }
  std::uint32_t dynObj = kNone;  // the ObjInfo of class Dyn, once the prelude has been checked
  std::uint32_t dynObjOf() { if (dynObj == kNone) { std::uint32_t s = lookup("Dyn"); if (s != kNone && out.syms[s].kind == SymKind::Class) dynObj = ty(out.syms[s].type).obj; } return dynObj; }
  bool isDynFamily(TypeId t) { if (t == kNoType || ty(t).k != TK::Object || dynObjOf() == kNone) return false; for (std::uint32_t o = ty(t).obj; o != kNoObj; o = out.objs[o].parent) if (o == dynObj) return true; return false; }
  bool isDyn(TypeId t) { return t == tDyn || (t != kNoType && ty(t).k == TK::Object && dynObjOf() != kNone && ty(t).obj == dynObj); }  // any or unknown
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
    if (inspectMode) return true;  // generated formatters print private fields too
    if (m.access == 0 || m.owner == kNoObj) return true;
    if (curClass == kNoObj) return false;
    return m.access == 2 ? curClass == m.owner : isSubclass(curClass, m.owner);
  }

  bool assignable(TypeId from, TypeId to, std::uint32_t node) {
    if (from == to || bad(from) || bad(to) || ty(to).k == TK::Any) return true;
    if (from == tDyn) return to != tVoid;                      // `any` converts to everything (checked when it runs)
    if (isDyn(to)) return from != tVoid && from != tNull ? true : from == tNull;  // `unknown` takes everything
    if (ty(from).k == TK::Union) { for (TypeId m : ty(from).params) if (!assignable(m, to, kNone)) return false; return true; }
    if (ty(to).k == TK::Union) { for (TypeId m : ty(to).params) if (assignable(from, m, node)) return true; return false; }
    if (ty(from).k == TK::Param) { TypeId c = out.tparams[ty(from).obj].constraint; return c != kNoType && assignable(c, to, node); }
    const Type &f = ty(from), &t = ty(to);
    if (f.k == TK::Num && t.k == TK::Num) {
      if (t.obj != 0) return f.obj == t.obj || (f.obj == 0 && !(node != kNone && isNumLit(a, node)));  // an enum takes its own members and, like TypeScript, any number that is not a literal
      if (node != kNone && isNumLit(a, node)) return isIntLit(a, node) || isFloat(t.num);  // literals adapt to the target kind
      return widens(f.num, t.num) || (!isFx(f.num) && !isFx(t.num));  // machine numbers convert among themselves (truncating), like the number type they alias
    }
    if (f.k == TK::Object && t.k == TK::Object) return objAssignable(f.obj, t.obj);
    return false;
  }
  // `(i32, string) => void` where `(f64, string) => void` is expected: TypeScript has one number type, so a callback may take any machine
  // number kind. The value is wrapped in a function that converts the arguments (and the result) between the kinds.
  bool thunkable(TypeId from, TypeId to) const {
    if (bad(from) || bad(to) || ty(from).k != TK::Func || ty(to).k != TK::Func || hasParam(from) || hasParam(to)) return false;
    const Type &f = ty(from), &t = ty(to);
    if (f.params.size() != t.params.size() || f.variadic != t.variadic) return false;
    bool differs = false;
    auto kinds = [&](TypeId x, TypeId y) { if (x == y) return true; if (ty(x).k == TK::Num && ty(y).k == TK::Num && ty(x).obj == 0 && ty(y).obj == 0) { differs = true; return true; } return false; };
    for (std::size_t k = 0; k < f.params.size(); ++k) if (!kinds(t.params[k], f.params[k])) return false;
    if (!(f.elem == t.elem || kinds(f.elem, t.elem))) return false;
    return differs;
  }
  bool require(TypeId from, TypeId to, std::uint32_t node) {
    if (assignable(from, to, node)) { if (node != kNone) convertDyn(from, to, node); return true; }
    if (node != kNone && !bad(from) && !bad(to) && name(from) == "NeverPromise" && promiseKind(to) == 1 && ty(to).k == TK::Object) {  // Promise.reject(e) without a type: a promise that only rejects fits any Promise<T>
      const ObjInfo& po = out.objs[ty(to).obj];
      if (po.typeArgs.size() != 1) { diag(kZNotAssignable, node, "'" + name(from) + "' to '" + name(to) + "'"); return false; }
      TypeId elemT = po.typeArgs[0];
      std::string X = inspectAliasName(to), T = inspectAliasName(elemT);
      std::uint32_t sym = helper("neverPromise," + std::to_string(to), "function $F(p: NeverPromise): " + X + " {\n  const r = __newPromise<" + T + ">();\n  p.handled = true;\n  const e = p.error;\n  if (e !== null) r.rejectWith(e);\n  return r;\n}\n", {from, to, elemT}, node);
      wrapNode(node, sym);
      return true;
    }
    if (node != kNone && thunkable(from, to)) {
      const Type f = ty(from), t = ty(to);
      std::string ps, call;
      std::vector<TypeId> aliases{from, to};
      for (std::size_t k = 0; k < t.params.size(); ++k) {
        ps += (k ? ", p" : "p") + std::to_string(k) + ": " + inspectAliasName(t.params[k]);
        call += (k ? ", p" : "p") + std::to_string(k) + (t.params[k] == f.params[k] ? "" : " as " + inspectAliasName(f.params[k]));
        aliases.push_back(t.params[k]); aliases.push_back(f.params[k]);
      }
      std::string R = inspectAliasName(t.elem);
      std::string body = t.elem == tVoid ? "f(" + call + ")" : f.elem == t.elem ? "f(" + call + ")" : "f(" + call + ") as " + R;
      aliases.push_back(t.elem);
      std::uint32_t sym = helper("thunk," + std::to_string(from) + "," + std::to_string(to), "function $F(f: " + inspectAliasName(from) + "): " + inspectAliasName(to) + " {\n  return (" + ps + "): " + R + " => " + body + ";\n}\n", aliases, node);
      wrapNode(node, sym);
      return true;
    }
    diag(kZNotAssignable, node, "'" + name(from) + "' to '" + name(to) + "'");
    return false;
  }

  // ---- scopes
  void push() { scopes.push_back(std::make_shared<Scope>()); }
  void pop() { scopes.pop_back(); }
  std::deque<std::string> hostNames;
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
    for (const char* f : {"sqrt", "abs", "floor", "ceil", "round", "trunc", "sin", "cos", "tan", "exp", "log", "cbrt", "log2", "log10", "log1p", "expm1", "asin", "acos", "sinh", "cosh", "tanh", "sign", "fround", "clz32"}) mathFn(f, 1, math);
    for (const char* f : {"pow", "atan2", "min", "max", "hypot"}) mathFn(f, 2, math);
    math.members.push_back({"imul", func({num(Num::i32), num(Num::i32)}, num(Num::i32), 2), true, true});
    out.objs.push_back(math);
    declare(SymKind::Builtin, "Math", objType(static_cast<std::uint32_t>(out.objs.size() - 1)), kNone, true, 0);
    ObjInfo con;
    con.name = "console";
    con.members.push_back({"log", func({tAny}, tVoid, 0, true), true, true});
    out.objs.push_back(con);
    declare(SymKind::Builtin, "console", objType(static_cast<std::uint32_t>(out.objs.size() - 1)), kNone, true, 0);
    ObjInfo str;
    str.name = "String";
    str.members.push_back({"fromCharCode", func({num(Num::i32)}, tStr, 1), true, true});
    out.objs.push_back(str);
    declare(SymKind::Builtin, "String", objType(static_cast<std::uint32_t>(out.objs.size() - 1)), kNone, true, 0);
    ObjInfo numObj;
    numObj.name = "Number";
    numObj.members.push_back({"isNaN", func({num(Num::f64)}, tBool, 1), true, true});
    numObj.members.push_back({"isFinite", func({num(Num::f64)}, tBool, 1), true, true});
    out.objs.push_back(numObj);
    declare(SymKind::Builtin, "Number", objType(static_cast<std::uint32_t>(out.objs.size() - 1)), kNone, true, 0);
    declare(SymKind::Builtin, "__identity", func({tAny}, num(Num::i64), 1), kNone, true, 0);  // for generated code: the identity of a reference
    declare(SymKind::Builtin, "__classname", func({tAny}, tStr, 1), kNone, true, 0);       // the class name of an object, for [Function: name]
    declare(SymKind::Builtin, "parseInt", func({tStr, num(Num::i32)}, num(Num::f64), 1), kNone, true, 0);
    declare(SymKind::Builtin, "parseFloat", func({tStr}, num(Num::f64), 1), kNone, true, 0);
    declare(SymKind::Builtin, "__dynGetFast", func({tDyn, tDyn, tStr}, tDyn, 3), kNone, true, 0);  // Dyn property read in the runtime; 0 when not handled
    declare(SymKind::Builtin, "__dynAddFast", func({tDyn, tDyn}, tDyn, 2), kNone, true, 0);       // Dyn number + number in the runtime; 0 when not handled
    declare(SymKind::Builtin, "__jsonNative", func({tStr, tDyn}, tDyn, 2), kNone, true, 0);  // JSON.parse in the runtime, for the Dyn prelude
    declare(SymKind::Builtin, "__toNumber", func({tStr}, num(Num::f64), 1), kNone, true, 0);  // Number(string), for generated code
    for (const char* nm : {"Boolean", "JSON", "Array"}) {  // namespaces whose calls the checker rewrites
      ObjInfo o;
      o.name = nm;
      out.objs.push_back(o);
      declare(SymKind::Builtin, nm, objType(static_cast<std::uint32_t>(out.objs.size() - 1)), kNone, true, 0);
    }
    for (const RtInfo& r : kRtInfo) {  // the host's functions (runtime.h, owner "host"): __host_<member>, called by the wrappers of the host modules
      if (!rtOwnedBy(r, "host")) continue;
      std::vector<TypeId> ps;
      for (unsigned k = 0; k < rtParamCount(r); ++k) ps.push_back(rtLetter(rtParam(r, k), kNoType));
      hostNames.push_back("__host_" + std::string(rtMember(r)));  // symbols keep a view of their name
      declare(SymKind::Builtin, hostNames.back(), func(ps, rtLetter(rtRet(r), kNoType), rtParamCount(r)), kNone, true, 0);
    }
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
        else if (x.kids.empty() && x.text == "never" && lookup("never") == kNone) r = tNull;  // no value has it: a position of type never holds null (T = never as a default says "unused")
        else if (x.kids.empty() && x.text == "string") r = tStr;
        else if (x.kids.empty() && x.text == "void") r = tVoid;
        else if (x.kids.empty() && x.text == "null") r = tNull;
        else if (x.kids.empty() && x.text == "any" && lookup("any") == kNone) { r = tDyn; if (a.strict && !rawDyn() && !inPrelude && !generating) diag(kZDynInStrict, t, "`any`"); }
        else if (x.kids.empty() && x.text == "unknown" && lookup("unknown") == kNone && dynObjOf() != kNone) r = objType(dynObj);
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
            if (args.size() < generics[s].tp.size()) fillTypeDefaults(generics[s], args);
            if (args.size() == generics[s].tp.size()) r = instantiateAlias(s, args, t);
            else diag(kZCannotInfer, t, "'" + std::string(x.text) + "' needs " + std::to_string(generics[s].tp.size()) + " type argument(s)");
          }
          else if (out.syms[s].kind == SymKind::Class && x.kids.empty()) r = out.syms[s].type;
          else if (out.syms[s].kind == SymKind::GenericClass) {
            std::vector<TypeId> args;
            for (std::uint32_t k : x.kids) args.push_back(annotation(k));
            if (args.size() < generics[s].tp.size()) fillTypeDefaults(generics[s], args);
            std::uint32_t inst = args.size() == generics[s].tp.size() ? instantiateClass(s, args, t) : kNone;
            if (inst != kNone) r = out.syms[inst].type;
            else if (args.size() != generics[s].tp.size()) diag(kZCannotInfer, t, "'" + std::string(x.text) + "' needs " + std::to_string(generics[s].tp.size()) + " type argument(s)");
          } else if (!x.kids.empty()) diag(kZNotAssignable, t, "'" + std::string(x.text) + "' is not generic");
          else diag(kZCannotFindName, t, "'" + std::string(x.text) + "' is not a type");
        }
        break;
      }
      case N::TypeArray: r = arrayOf(annotation(x.kids[0])); break;
      case N::TypeLit: {  // 'a' is a string, 1 a number, true a boolean (a property declared with one remembers the value, see TypeObject)
        char ch = x.text.empty() ? ' ' : x.text[0];
        r = (ch == '\'' || ch == '"') ? tStr : (x.text == "true" || x.text == "false") ? tBool : num(Num::f64);
        break;
      }
      case N::TypeObject: {  // { a: A; b?: B }: an anonymous record
        std::vector<std::pair<std::string, TypeId>> shape;
        std::vector<std::string> lits;
        bool failed = false;
        for (std::uint32_t f : std::vector<std::uint32_t>(x.kids)) {
          const Node& fn = n(f);
          TypeId ft = annotation(fn.kids[0]);
          if (bad(ft)) failed = true;
          std::string lit;
          if (n(fn.kids[0]).kind == N::TypeLit && (n(fn.kids[0]).text[0] == '\'' || n(fn.kids[0]).text[0] == '"')) lit = std::string(n(fn.kids[0]).text.substr(1, n(fn.kids[0]).text.size() - 2));
          shape.push_back({std::string(fn.text), ft});
          lits.push_back((fn.flags & frontend::kFlagOptional) ? std::string("\x01") : lit);
        }
        r = failed ? tError : recordOf(shape, lits);
        break;
      }
      case N::TypeFunc: {  // (a: A, b: B) => R
        std::vector<TypeId> ps;
        for (std::size_t k = 1; k < x.kids.size(); ++k) {
          std::uint32_t pn = x.kids[k];
          if (n(pn).kids[0] == kNone) { diag(kZCannotInfer, pn, "parameter '" + std::string(n(pn).text) + "' of a function type"); ps.push_back(tError); }
          else ps.push_back(annotation(n(pn).kids[0]));
        }
        TypeId rt = annotation(x.kids[0]);
        std::size_t required = 0;  // the parameters up to the last one that is not optional
        for (std::size_t k = 1; k < x.kids.size(); ++k) if (!(n(x.kids[k]).flags & frontend::kFlagOptional)) required = k;
        r = func(ps, rt, static_cast<std::uint32_t>(required));
        break;
      }
      case N::TypeUnion: {
        std::vector<TypeId> ms;
        bool undef = false;
        for (std::uint32_t k : std::vector<std::uint32_t>(x.kids)) { ms.push_back(annotation(k)); undef = undef || (n(k).kind == N::TypeRef && (n(k).flags & frontend::kFlagUndefined)); }
        r = unionOf(ms, undef);
        break; }
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
    const Type r = recv == kNoType ? Type{} : ty(recv);
    switch (l) {
      case 's': return tStr;
      case 'i': case 'j': case 'z': return num(Num::i32);
      case 'u': return num(Num::u32);
      case 'D': return arrayOf(num(Num::f64));
      case 'B': return arrayOf(num(Num::u8));
      case 'w': case 'y': return tStr;
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
  std::set<std::uint32_t> rewritten;  // calls already turned into calls of generated functions: checking them again gives the same type
  TypeId expr(std::uint32_t i, TypeId expected = kNoType) {
    if (rewritten.count(i)) return out.nodeType[i];
    TypeId t = expr0(i, expected);
    if (t == kNoType) {  // a symbol whose declaration failed has no type: the error was reported there; if none was, say so rather than crash
      if (out.diags.empty()) diag(kZCannotInfer, i, "the type of this expression");
      t = tError;
    }
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

  // A value `'x' + v` and `${v}` can turn into text: numbers, booleans, strings, and objects with `toString(): string`.
  bool stringifiable(TypeId t) {
    if (t == tStr || isNum(t) || t == tBool) return true;
    if (ty(t).k != TK::Object) return false;
    const Member* m = lookupMember(ty(t).obj, "toString", false);
    if (!m) m = lookupMember(ty(t).obj, "__errorString", false);  // an Error converts to "Name: message"
    return m && m->method && ty(m->type).params.empty() && ty(m->type).elem == tStr;
  }
  std::uint32_t errorObj() {  // the built-in Error class
    std::uint32_t s = lookup("Error");
    return (s != kNone && out.syms[s].kind == SymKind::Class) ? ty(out.syms[s].type).obj : kNoObj;
  }

  bool comparable(TypeId l, TypeId r) {
    if (l == r || (isNum(l) && isNum(r)) || bad(l) || bad(r) || l == tNull || r == tNull) return true;  // anything may be compared with null
    if (ty(l).k == TK::Union) { for (TypeId m : ty(l).params) if (comparable(m, r)) return true; return false; }
    if (ty(r).k == TK::Union) { for (TypeId m : ty(r).params) if (comparable(l, m)) return true; return false; }
    return ty(l).k == TK::Object && ty(r).k == TK::Object && (objAssignable(ty(l).obj, ty(r).obj) || objAssignable(ty(r).obj, ty(l).obj));
  }

  TypeId binaryExpr(std::uint32_t i, const Node& x, TypeId expected0 = kNoType) {
    const std::string op(x.text);
    std::uint32_t le = x.kids[0], re = x.kids[1];
    if (op == ",") { expr(le); return expr(re); }
    if (op == "in") {
      TypeId rt0 = expr(re);
      if (!rawDyn() && isDyn(rt0) && replaceWith(i, "__dynIn(__H0, __H1)", {{le}, {re}})) return expr0(i, expected0);
      diag(kZUnsupported, i, "operator 'in' on a value that is not an `any`");
      return tError;
    }
    if ((op == "===" || op == "!==" || op == "==" || op == "!=") && !rawDyn() && lookup("__undef") != kNone) {  // in a file with Dyn values `undefined` is one: against a plain nullable it is just null
      for (int side = 0; side < 2; ++side) {
        std::uint32_t u = side ? re : le, o = side ? le : re;
        if (n(u).kind != N::Ident || n(u).text != "undefined" || lookup("undefined") != kNone || !pureCallee(o)) continue;
        TypeId ot = expr(o);
        if (!bad(ot) && !isDyn(ot) && hasNull(ot)) { a.nodes[u].kind = N::Literal; a.nodes[u].text = "null"; }
        break;
      }
    }
    if (op == "??") {
      nullishLeft = le;
      TypeId l0 = expr(le);
      nullishLeft = kNone;
      if (!rawDyn() && isDyn(l0) && replaceWith(i, "__dynNullish(__H0, (): any => __H1)", {{le}, {re}})) return expr0(i, expected0);
      TypeId base = l0;
      if (!bad(l0) && !isMapGet(le)) {
        if (!hasNull(l0) && pathSymOf(le) != kNone && hasNull(out.syms[pathSymOf(le)].type)) { expr(re); return l0; }  // a property known not to be null here
        if (!hasNull(l0)) { diag(kZBadOperand, i, "'?" "?' on '" + name(l0) + "', which cannot be null"); expr(re); return tError; }
        if (l0 == tNull) return expr(re, expected0);  // known to be null: the right operand is the result
        base = withoutNull(l0);
        if (base == kNoType) base = tError;
      }
      TypeId r0 = expr(re, bad(base) ? kNoType : base);
      if (bad(base) || bad(r0)) return tError;
      if (r0 == tNull) return l0;  // `a ?? null` is still nullable
      if (!assignable(r0, base, kNone) && assignable(base, r0, kNone)) return r0;  // `a ?? b` where b is the wider type
      if (!assignable(r0, base, kNone) && ty(base).k == TK::Object && ty(r0).k == TK::Object) return unionOf({base, r0});  // two classes: their union
      require(r0, base, re);
      return base;
    }
    if (op == "instanceof") {
      TypeId lt = expr(le);
      const Node& rn = n(re);
      std::uint32_t rs = rn.kind == N::Ident ? lookup(rn.text) : kNone;
      if (rs == kNone || out.syms[rs].kind != SymKind::Class || out.objs[ty(out.syms[rs].type).obj].isInterface || (out.objs[ty(out.syms[rs].type).obj].isRecord && !inspectMode)) {
        diag(kZBadOperand, re, "the right-hand side of 'instanceof' must be a class");
        return tBool;
      }
      out.nodeSym[re] = rs;
      out.nodeType[re] = out.syms[rs].type;
      if (usedBeforeDeclaration(rs, re)) diag(kZCannotFindName, re, "class '" + std::string(rn.text) + "' used before its declaration");
      if (isDyn(lt)) {  // a Dyn holds a typed object as a view: the view knows the classes it answers to
        TypeId ct = out.syms[rs].type;
        if (!rawDyn() && !isDynFamily(ct) && replaceWith(i, "__dynIsTag(__H0, " + std::to_string(ct) + ")", {{le}})) return expr0(i, kNoType);
        return tBool;
      }
      for (TypeId m : unionMembers(lt)) if (!bad(m) && m != tNull && ty(m).k != TK::Object) { diag(kZBadOperand, le, "'instanceof' on '" + name(lt) + "'"); break; }
      return tBool;
    }
    TypeId l = expr(le), r;
    if (op == "&&" || op == "||") {  // the right operand is evaluated under what the left one established
      if (!bad(l)) l = truthiness(le, l);  // `a && b` on a nullable reference tests it
      std::vector<Fact> fs;
      factsOf(le, op == "&&", fs);
      std::size_t mark = narrowing.size();
      pushFacts(fs);
      r = expr(re);
      if (!bad(r)) r = truthiness(re, r);
      narrowing.resize(mark);
    } else r = expr(re);
    if (!rawDyn() && (isDyn(l) || isDyn(r)) && !bad(l) && !bad(r)) {  // an operand is any or unknown: the operation is a call of the Dyn helper
      auto isLit = [&](std::uint32_t k, const char* text) { return n(k).kind == N::Literal && n(k).text == text; };
      auto isUndef = [&](std::uint32_t k) { return n(k).kind == N::Ident && n(k).text == "__undef"; };
      bool strictOp = op == "===" || op == "!==", eqOp2 = strictOp || op == "==" || op == "!=";
      bool neg = op == "!=" || op == "!==";
      std::string call;
      std::vector<std::vector<std::uint32_t>> holes;
      if (eqOp2 && (isLit(re, "null") || isLit(le, "null") || isUndef(re) || isUndef(le))) {  // x === null, x === undefined, x == null
        std::uint32_t other = (isLit(re, "null") || isUndef(re)) ? le : re, lit = other == le ? re : le;
        const char* fn = !strictOp ? "__dynIsNullish" : isLit(lit, "null") ? "__dynIsNull" : "__dynIsUndef";
        call = std::string(neg ? "!" : "") + fn + "(__H0)";
        holes = {{other}};
      } else {
        static const std::pair<const char*, const char*> kOps[] = {{"+", "__dynAdd"}, {"-", "__dynSub"}, {"*", "__dynMul"}, {"/", "__dynDiv"}, {"%", "__dynMod"}, {"**", "__dynPow"},
                                                                  {"<", "__dynLt"}, {"<=", "__dynLe"}, {">", "__dynGt"}, {">=", "__dynGe"}, {"==", "__dynEq"}, {"!=", "__dynEq"},
                                                                  {"===", "__dynSeq"}, {"!==", "__dynSeq"}};
        for (auto [o, fn] : kOps) if (op == o) call = std::string(neg ? "!" : "") + fn + "(__H0, __H1)";
        if (op == "&&") call = "__dynAnd(__H0, (): any => __H1)";
        if (op == "||") call = "__dynOr(__H0, (): any => __H1)";
        holes = {{le}, {re}};
      }
      if (call.empty()) { diag(kZUnsupported, i, "operator '" + op + "' on a Dyn"); return tError; }
      if (replaceWith(i, call, holes)) return expr0(i, expected0);
    }
    bool eqOp = op == "==" || op == "!=" || op == "===" || op == "!==";
    if (!eqOp) { l = appOrDiag(l, le); r = appOrDiag(r, re); }
    if (bad(l) || bad(r)) return (op == "&&" || op == "||" || op == "==" || op == "!=" || op == "===" || op == "!==" || op == "<" || op == ">" || op == "<=" || op == ">=") ? tBool : tError;
    auto fail = [&]() { diag(kZBadOperand, i, "'" + op + "' on '" + name(l) + "' and '" + name(r) + "'"); return tError; };
    if ((op == "&&" || op == "||") && (n(le).kind == N::String || n(le).kind == N::Number || n(le).kind == N::Template)) { diag(kZBadOperand, le, "the left operand of '" + op + "' is a literal, always truthy or always falsy"); return tError; }
    if ((op == "&&" || op == "||") && l != tBool && (l == tStr || isNum(l))) return require(r, l, re) ? l : tError;  // `a || b` yields a value: the first truthy operand
    if (op == "&&" || op == "||") return (l == tBool && r == tBool) ? tBool : (diag(kZNotAssignable, l == tBool ? re : le, "'" + name(l == tBool ? r : l) + "' to 'boolean'"), tBool);
    if ((op == "===" || op == "!==" || op == "==" || op == "!=") && l == tNull && r == tNull && pureCallee(le) && replaceWith(i, (op == "===" || op == "==") ? "true" : "false", {})) return expr0(i, expected0);  // null against null (a position of type never)
    if (op == "==" || op == "!=" || op == "===" || op == "!==") return comparable(l, r) ? tBool : (fail(), tBool);
    if (op == "<" || op == ">" || op == "<=" || op == ">=") return ((isNum(l) && isNum(r)) || (l == tStr && r == tStr)) ? tBool : (fail(), tBool);
    if (op == "+" && (l == tStr || r == tStr)) return (stringifiable(l) && stringifiable(r)) ? tStr : fail();
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

  // ---- console.log of arrays, objects, Map and Set: the argument becomes a call of a formatter generated as Zinc source
  std::shared_ptr<Scope> genScope;               // names of generated code: aliases, classes and formatters
  std::map<TypeId, std::uint32_t> logSym;        // __log<t> symbol by type
  std::set<TypeId> fmtDeclared;                  // types whose __fmt<t> exists
  bool preludeDone = false;

  std::uint32_t newNode(N kind, std::string_view text, std::vector<std::uint32_t> kids, std::uint32_t at) {
    a.nodes.push_back({kind, n(at).start, n(at).end, text, std::move(kids), 0, n(at).file});
    out.nodeType.push_back(kNoType);
    out.nodeSym.push_back(kNone);
    return static_cast<std::uint32_t>(a.nodes.size() - 1);
  }
  std::string_view keep(std::string s) { return a.generated.emplace_back(std::move(s)); }

  // Parses generated source and merges its nodes into the program; returns its top-level statements.
  std::vector<std::uint32_t> mergeSource(const std::string& text, std::uint32_t at) {
    a.generated.push_back(text);
    ParseResult pr = parse(a.generated.back());
    if (pr.ast.root == kNone || !pr.diags.empty()) { diag(kZUnsupported, at, "internal error: a generated formatter does not parse: " + (pr.diags.empty() ? std::string("?") : pr.diags[0].detail)); return {}; }
    auto off = static_cast<std::uint32_t>(a.nodes.size());
    for (Node& nd : pr.ast.nodes) {
      for (std::uint32_t& k : nd.kids) if (k != kNone) k += off;
      nd.file = n(at).file;
      a.nodes.push_back(std::move(nd));
    }
    for (auto& [k, v] : pr.ast.tparams) { auto& d = a.tparams[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }  // generic declarations and explicit type arguments
    for (auto& [k, v] : pr.ast.targs) { auto& d = a.targs[k + off]; for (std::uint32_t x : v) d.push_back(x + off); }
    out.nodeType.resize(a.nodes.size(), kNoType);
    out.nodeSym.resize(a.nodes.size(), kNone);
    return a.nodes[pr.ast.root + off].kids;
  }

  // Alias names `__T<id>` for generated code, declared once in genScope.
  std::set<TypeId> aliased;
  void addAliases(const std::vector<TypeId>& types) {
    for (TypeId u : types) {
      if (!aliased.insert(u).second) continue;
      out.syms.push_back({SymKind::TypeAlias, keep(inspectAliasName(u)), u, kNone, true});
      (*genScope)[out.syms.back().name] = static_cast<std::uint32_t>(out.syms.size() - 1);
    }
  }
  // Parses generated functions, declares them in genScope and queues their bodies (checked with access checks off).
  void declareSource(const std::string& text, std::uint32_t at) {
    struct Gen { bool& f; Gen(bool& x) : f(x) { f = true; } ~Gen() { f = false; } } gen(generating);
    if (std::getenv("ZN_DUMP_GEN")) std::fputs(text.c_str(), stderr);
    for (std::uint32_t s : mergeSource(text, at)) {  // declare every function first: their bodies refer to each other
      std::vector<std::uint32_t> ps;
      TypeId sig = signature(s, 2, false, ps);
      out.nodeType[s] = sig;
      out.nodeSym[s] = declare(SymKind::Func, n(s).text, sig, s, true, s);
      out.instances.push_back(s);
      out.nodeNames[s] = std::string(n(s).text);
      auto snap = scopes;
      defer->push_back([this, s, sig, ps, snap]() {
        Ctx sv2 = saveCtx();
        bool savedMode = inspectMode;
        scopes = snap; curClass = kNoObj; curCtor = kNoObj; curStatic = false; inspectMode = true;
        checkBody(s, sig, ps, false);
        inspectMode = savedMode;
        restoreCtx(sv2);
      });
    }
  }
  void enterGenerated() {
    if (!genScope) genScope = std::make_shared<Scope>();
    scopes = {scopes.front(), genScope};
    curClass = kNoObj; curCtor = kNoObj; curStatic = false;
  }
  // A call node of a generated function (`sym`) with the given argument nodes; its type is the function's return type.
  std::uint32_t callGenerated(std::uint32_t sym, std::vector<std::uint32_t> args, std::uint32_t at) {
    std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, at);
    out.nodeSym[id] = sym;
    out.nodeType[id] = out.syms[sym].type;
    args.insert(args.begin(), id);
    std::uint32_t call = newNode(N::Call, {}, std::move(args), at);
    out.nodeType[call] = ty(out.syms[sym].type).elem;
    return call;
  }
  // A helper function generated once per `key`: `body` is its source with the name `__g<n>` substituted for `$F`.
  std::map<std::string, std::uint32_t> genFuncs;
  int genCounter = 0;
  std::uint32_t helper(const std::string& key, std::string text, const std::vector<TypeId>& aliases, std::uint32_t at) {
    auto hit = genFuncs.find(key);
    if (hit != genFuncs.end()) return hit->second;
    std::string fname = "__g" + std::to_string(genCounter++);
    for (std::size_t p; (p = text.find("$F")) != std::string::npos;) text.replace(p, 2, fname);
    Ctx sv = saveCtx();
    enterGenerated();
    addAliases(aliases);
    declareSource(text, at);
    std::uint32_t sym = (*genScope)[keep(fname)];
    restoreCtx(sv);
    return genFuncs[key] = sym;
  }

  // The symbol of __log<t>, generating (and declaring) the formatters of t and of every type it prints.
  std::uint32_t inspectLog(TypeId t, std::uint32_t at) {
    auto hit = logSym.find(t);
    if (hit != logSym.end()) return hit->second;
    Ctx sv = saveCtx();
    enterGenerated();
    std::string text;
    if (!preludeDone) { preludeDone = true; text = inspectPrelude(); }
    std::vector<TypeId> todo{t}, closure;
    std::set<TypeId> classTypes;
    while (!todo.empty()) {
      TypeId u = todo.back();
      todo.pop_back();
      if (fmtDeclared.count(u) || std::find(closure.begin(), closure.end(), u) != closure.end()) continue;
      closure.push_back(u);
      std::vector<TypeId> deps, classes;
      text += inspectFunction(out, u, false, deps, classes);
      for (TypeId d : deps) todo.push_back(d);
      for (TypeId cl : classes) classTypes.insert(cl);
    }
    bool strMember = false;  // `string | null` at the top level prints the string itself, like a string
    if (ty(t).k == TK::Union) for (TypeId m : ty(t).params) if (ty(m).k == TK::Str) strMember = true;
    if (isDyn(t)) text += "function " + inspectLogName(t) + "(v: " + inspectAliasName(t) + "): string {\n  return __logDyn(v);\n}\n";
    else if (strMember) text += "function " + inspectLogName(t) + "(v: " + inspectAliasName(t) + "): string {\n  return v === null ? '" + std::string(ty(t).undef ? "undefined" : "null") + "' : v;\n}\n";
    else text += "function " + inspectLogName(t) + "(v: " + inspectAliasName(t) + "): string {\n  return " + inspectFmtName(t) + "(v, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0);\n}\n";
    addAliases(closure);
    for (TypeId u : closure) fmtDeclared.insert(u);
    for (TypeId cl : classTypes) {  // instanceof needs the class itself in scope
      bool found = false;
      for (std::uint32_t s = 0; s < out.syms.size() && !found; ++s)
        if (out.syms[s].kind == SymKind::Class && out.syms[s].type == cl) { (*genScope)[keep(inspectClassName(cl))] = s; found = true; }
      if (!found) {  // an anonymous record has no symbol: make one for the generated code
        out.syms.push_back({SymKind::Class, keep(inspectClassName(cl)), cl, kNone, true});
        (*genScope)[out.syms.back().name] = static_cast<std::uint32_t>(out.syms.size() - 1);
      }
    }
    declareSource(text, at);
    std::uint32_t sym = (*genScope)[keep(inspectLogName(t))];
    restoreCtx(sv);
    logSym[t] = sym;
    return sym;
  }
  // The symbol of __js<t>, the generated serialiser JSON.stringify calls for a value of type t.
  std::map<TypeId, std::uint32_t> jsonSyms;
  std::set<TypeId> jsonDeclared;
  bool jsonPreludeDone = false;
  std::uint32_t jsonSym(TypeId t, std::uint32_t at) {
    auto hit = jsonSyms.find(t);
    if (hit != jsonSyms.end()) return hit->second;
    Ctx sv = saveCtx();
    enterGenerated();
    std::string text;
    if (!jsonPreludeDone) { jsonPreludeDone = true; text = jsonPrelude(); }
    std::vector<TypeId> todo{t}, closure;
    std::set<TypeId> classTypes;
    while (!todo.empty()) {
      TypeId u = todo.back();
      todo.pop_back();
      if (jsonDeclared.count(u) || std::find(closure.begin(), closure.end(), u) != closure.end()) continue;
      closure.push_back(u);
      std::vector<TypeId> deps, classes;
      text += jsonFunction(out, u, deps, classes);
      for (TypeId d : deps) todo.push_back(d);
      for (TypeId cl : classes) classTypes.insert(cl);
    }
    addAliases(closure);
    for (TypeId u : closure) jsonDeclared.insert(u);
    for (TypeId cl : classTypes)
      for (std::uint32_t s = 0; s < out.syms.size(); ++s)
        if (out.syms[s].kind == SymKind::Class && out.syms[s].type == cl) { (*genScope)[keep(inspectClassName(cl))] = s; break; }
    declareSource(text, at);
    std::uint32_t sym = (*genScope)[keep(jsonName(t))];
    restoreCtx(sv);
    jsonSyms[t] = sym;
    return sym;
  }
  // ---- Dyn conversions: __dynTo<t> (a typed value into a Dyn) and __dynFrom<t> (a checked conversion back), generated per type
  std::map<std::pair<TypeId, bool>, std::uint32_t> dynSyms;
  std::set<std::pair<TypeId, bool>> dynDeclared;
  std::uint32_t dynSym(TypeId t, bool to, std::uint32_t at) {
    auto hit = dynSyms.find({t, to});
    if (hit != dynSyms.end()) return hit->second;
    std::string text;
    std::vector<std::pair<TypeId, bool>> todo{{t, to}}, closure;
    std::vector<TypeId> formatters;
    while (!todo.empty()) {
      auto u = todo.back();
      todo.pop_back();
      if (dynDeclared.count(u) || std::find(closure.begin(), closure.end(), u) != closure.end()) continue;
      closure.push_back(u);
      std::vector<std::pair<TypeId, bool>> deps;
      text += dynConverter(out, u.first, u.second, deps, formatters);
      for (auto& d : deps) todo.push_back(d);
    }
    std::vector<TypeId> alias;
    for (auto& u : closure) alias.push_back(u.first);
    for (TypeId f : formatters) { inspectLog(f, at); jsonSym(f, at); }  // the view of an object prints and serialises through its own generated functions
    Ctx sv = saveCtx();
    enterGenerated();
    addAliases(alias);
    for (auto& u : closure) dynDeclared.insert(u);
    declareSource(text, at);
    std::uint32_t sym = (*genScope)[keep(to ? dynToName(t) : dynFromName(t))];
    restoreCtx(sv);
    for (auto& u : closure) dynSyms[u] = (*genScope)[keep(u.second ? dynToName(u.first) : dynFromName(u.first))];
    return sym;
  }
  // The node `node` becomes a call of `sym` on a copy of what it was.
  void wrapNode(std::uint32_t node, std::uint32_t sym) {
    a.nodes.push_back(a.nodes[node]);
    out.nodeType.push_back(out.nodeType[node]);
    out.nodeSym.push_back(out.nodeSym[node]);
    auto copy = static_cast<std::uint32_t>(a.nodes.size() - 1);
    if (auto ta = a.targs.find(node); ta != a.targs.end()) { a.targs[copy] = ta->second; a.targs.erase(node); }
    if (rewritten.count(node)) rewritten.insert(copy);
    std::uint32_t call = callGenerated(sym, {copy}, node);
    a.nodes[node] = a.nodes[call];
    out.nodeType[node] = out.nodeType[call];
    out.nodeSym[node] = kNone;
    rewritten.insert(node);
  }
  // A value that meets a Dyn (or a Dyn that meets a typed target) at `node`: wrap it in the conversion.
  void convertDyn(TypeId from, TypeId to, std::uint32_t node) {
    if (bad(from) || bad(to) || to == tAny || dynObjOf() == kNone) return;  // (tAny, console.log's anything, takes a Dyn as it is)
    if (isDyn(to) && !isDyn(from) && !isDynFamily(from)) {
      if (from == tNull) { a.nodes[node].kind = N::Ident; a.nodes[node].text = "__null"; a.nodes[node].kids.clear(); out.nodeSym[node] = lookup("__null"); out.nodeType[node] = tDyn; return; }
      if (!dynConvertible(out, from) || hasParam(from)) { diag(kZUnsupported, node, "conversion of '" + name(from) + "' to Dyn"); return; }
      if (n(node).kind == N::FuncExpr) { diag(kZUnsupported, node, "a function as an `any` value"); return; }
      wrapNode(node, dynSym(from, true, node));
      out.nodeType[node] = tDyn;
    } else if (isDyn(from) && !isDyn(to) && !isDynFamily(to)) {
      if (!dynConvertible(out, to) || hasParam(to)) { diag(kZUnsupported, node, "conversion of Dyn to '" + name(to) + "'"); return; }
      wrapNode(node, dynSym(to, false, node));
      out.nodeType[node] = to;
    }
  }

  // A console.log argument that is not a number, boolean or string is printed through a generated formatter.
  bool needsInspect(TypeId t) const {
    TK k = ty(t).k;
    return (k == TK::Array || k == TK::Map || k == TK::Set || k == TK::Object || k == TK::Union || k == TK::Func || t == tDyn) && !hasParam(t) && inspectable(out, t);
  }

  static bool isHofName(std::string_view m) {
    for (std::string_view h : {"map", "filter", "some", "every", "forEach", "reduce", "reduceRight", "concat", "findIndex", "find", "findLast", "findLastIndex", "at", "indexOf", "lastIndexOf", "includes", "fill", "join", "splice", "shift", "unshift"}) if (m == h) return true;
    return false;
  }
  // arr.map(f) and friends: the call becomes a call of a helper generated in Zinc for this element and callback type.
  // Array methods written in Zinc: callbacks may take (element, index) (reduce: accumulator, element, index), and the search
  // methods take their optional index arguments. Each call becomes a call of a generated function, one per element type.
  TypeId arrayHof(std::uint32_t i, std::string_view method) {
    if (hasParam(out.nodeType[n(n(i).kids[0]).kids[0]])) return tError;  // a generic template's own check: only its instances are lowered, and they are checked again with the real types
    std::uint32_t before = n(i).kids[0];
    TypeId r = arrayHof0(i, method);
    if (n(i).kids[0] != before) { rewritten.insert(i); out.nodeType[i] = r; }
    return r;
  }
  // m.forEach((value, key) => ...): a helper written in Zinc over the keys; the callback may take just the value
  // arr.entries(), arr.keys(), arr.values(), map.entries(), set.entries(), set.keys(): the iterator of JavaScript is an array here (for-of, spread and Array.from take arrays).
  // False when the receiver has the method natively (map.keys(), map.values(), set.values()) or is not one of these types.
  bool iteratorMethod(std::uint32_t i, std::string_view m) {
    std::uint32_t recvNode = n(n(i).kids[0]).kids[0];
    TypeId rt = expr(recvNode);
    if (bad(rt) || hasParam(rt)) return false;
    TK k = ty(rt).k;
    if (k != TK::Array && k != TK::Map && k != TK::Set) return false;
    if ((k == TK::Map && m != "entries") || (k == TK::Set && m == "values")) return false;
    TypeId K = k == TK::Map ? ty(rt).params[0] : num(Num::f64), V = ty(rt).elem;
    std::string R, body;
    std::vector<TypeId> aliases{rt};
    auto arrOf = [&](TypeId e) { TypeId t = arrayOf(e); aliases.push_back(t); return std::make_pair(t, inspectAliasName(t)); };
    TypeId result;
    if (k == TK::Array) {
      if (m == "entries") { TypeId tup = tupleOf({num(Num::f64), V}); aliases.push_back(tup); auto [t, nm] = arrOf(tup); result = t; R = nm; body = "  const r: " + R + " = [];\n  for (let i: i32 = 0; i < a.length; i++) r.push([i, a[i]]);\n  return r;\n"; }
      else if (m == "keys") { auto [t, nm] = arrOf(num(Num::f64)); result = t; R = nm; body = "  const r: " + R + " = [];\n  for (let i: i32 = 0; i < a.length; i++) r.push(i);\n  return r;\n"; }
      else { result = rt; R = inspectAliasName(rt); body = "  return a.slice();\n"; }
    } else if (k == TK::Map) {
      TypeId tup = tupleOf({K, V}); aliases.push_back(tup);
      auto [t, nm] = arrOf(tup); result = t; R = nm;
      body = "  const ks = a.keys();\n  const vs = a.values();\n  const r: " + R + " = [];\n  for (let i: i32 = 0; i < ks.length; i++) r.push([ks[i], vs[i]]);\n  return r;\n";
    } else {  // Set
      if (m == "entries") { TypeId tup = tupleOf({V, V}); aliases.push_back(tup); auto [t, nm] = arrOf(tup); result = t; R = nm; body = "  const vs = a.values();\n  const r: " + R + " = [];\n  for (const v of vs) r.push([v, v]);\n  return r;\n"; }
      else { auto [t, nm] = arrOf(V); result = t; R = nm; body = "  return a.values();\n"; }
    }
    aliases.push_back(result);
    std::uint32_t sym = helper(std::string("iterm,") + std::string(m) + "," + std::to_string(rt), "function $F(a: " + inspectAliasName(rt) + "): " + R + " {\n" + body + "}\n", aliases, i);
    std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
    out.nodeSym[id] = sym;
    out.nodeType[id] = out.syms[sym].type;
    a.nodes[i].kids = {id, recvNode};
    rewritten.insert(i);
    out.nodeType[i] = result;
    return true;
  }
  TypeId mapForEach(std::uint32_t i) {
    const std::vector<std::uint32_t> kids = n(i).kids;
    std::uint32_t recvNode = n(kids[0]).kids[0];
    TypeId mt = out.nodeType[recvNode];
    bool isSet = ty(mt).k == TK::Set;  // Set.forEach passes the element as value and as key
    TypeId K = isSet ? ty(mt).elem : ty(mt).params[0], V = ty(mt).elem;
    if (hasParam(mt)) return tError;  // a generic template's own check (see arrayHof)
    if (kids.size() != 2) { diag(kZWrongArgCount, i, "expected 1, got " + std::to_string(kids.size() - 1)); for (std::size_t k = 1; k < kids.size(); ++k) expr(kids[k]); return tError; }
    padCallbacks = false;
    TypeId lt = expr(kids[1], func({V, K}, tVoid, 1));
    padCallbacks = true;
    if (bad(lt)) return tError;
    if (ty(lt).k != TK::Func || ty(lt).params.empty() || ty(lt).params.size() > 2) { diag(kZNotAssignable, kids[1], "a function of 1-2 parameter(s) for 'forEach'"); return tError; }
    std::vector<TypeId> aliases{mt, lt, K, V};
    std::string val = isSet ? "k" : "m.get(k) as " + inspectAliasName(V);
    std::string call = ty(lt).params.size() == 1 ? "f(" + val + ")" : "f(" + val + ", k)";
    std::string key = "mapForEach," + std::to_string(mt) + "," + std::to_string(lt);
    std::uint32_t sym = helper(key, "function $F(m: " + inspectAliasName(mt) + ", f: " + inspectAliasName(lt) + "): void {\n  for (const k of m." + std::string(isSet ? "values" : "keys") + "()) " + call + ";\n}\n", aliases, i);
    std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
    out.nodeSym[id] = sym;
    out.nodeType[id] = out.syms[sym].type;
    a.nodes[i].kids = {id, recvNode, kids[1]};
    rewritten.insert(i);
    out.nodeType[i] = tVoid;
    return tVoid;
  }
  TypeId arrayHof0(std::uint32_t i, std::string_view method) {
    const std::vector<std::uint32_t> kids = n(i).kids;
    std::uint32_t recvNode = n(kids[0]).kids[0];
    TypeId at = out.nodeType[recvNode];
    TypeId E = ty(at).elem;
    std::vector<std::uint32_t> args(kids.begin() + 1, kids.end());
    std::string m(method);
    if (m == "join") {  // elements other than strings are converted like template literals
      if (args.size() > 1) { diag(kZWrongArgCount, i, "expected 0-1, got " + std::to_string(args.size())); for (std::uint32_t arg : args) expr(arg); return tError; }
      if (args.empty()) { std::uint32_t sep = newNode(N::String, "\",\"", {}, i); out.nodeType[sep] = tStr; args.push_back(sep); }
      else if (!require(expr(args[0], tStr), tStr, args[0])) return tError;
      std::string key = "join," + std::to_string(at);
      std::uint32_t sym = helper(key, "function $F(a: " + inspectAliasName(at) + ", sep: string): string {\n  let r = '';\n  for (let k: i32 = 0; k < a.length; k++) {\n    if (k > 0) r += sep;\n    r += " + std::string(isDyn(E) ? "__dynJoin(a[k])" : hasNull(E) ? "(a[k] === null ? '' : `${a[k]}`)" : "`${a[k]}`") + ";\n  }\n  return r;\n}\n", {at}, i);
      std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
      out.nodeSym[id] = sym;
      out.nodeType[id] = out.syms[sym].type;
      a.nodes[i].kids = {id, recvNode, args[0]};
      return tStr;
    }
    if (m == "shift" || m == "unshift" || m == "splice") {  // the mutators that move elements: written in Zinc over push, pop and indexing
      std::string A = inspectAliasName(at), Es = inspectAliasName(E), body, sig;
      std::vector<TypeId> aliases{at, E};
      TypeId i32 = num(Num::i32), result;
      std::size_t lo = m == "shift" ? 0 : 1, hi = m == "shift" ? 0 : m == "unshift" ? 1 : 2;
      if (args.size() < lo || args.size() > hi) { diag(kZWrongArgCount, i, "expected " + std::to_string(lo) + (hi != lo ? "-" + std::to_string(hi) : "") + ", got " + std::to_string(args.size())); for (std::uint32_t arg : args) expr(arg); return tError; }
      if (m == "shift") {
        TK ek = isDyn(E) ? TK::Any : ty(E).k;
        bool refLike = E == tStr || ek == TK::Array || ek == TK::Map || ek == TK::Set || ek == TK::Object || ek == TK::Func;
        result = E;  // an empty array gives null (the default of the element type for numbers and booleans): like the library code written for TypeScript without strict nulls, the type stays E
        std::string R = Es;
        if (refLike) { TypeId nullable = unionOf({E, tNull}, true); aliases.push_back(nullable); R = inspectAliasName(nullable); }  // the helper may return null; the representation of a nullable reference is the reference
        std::string none = refLike ? "null" : E == tBool ? "false" : "0";
        sig = "(a: " + A + "): " + R;
        body = "  if (a.length === 0) return " + none + ";\n  const f = a[0];\n  for (let k: i32 = 1; k < a.length; k++) a[k - 1] = a[k];\n  a.pop();\n  return f;\n";
      } else if (m == "unshift") {
        TypeId xt = expr(args[0], E);
        if (bad(xt) || !require(xt, E, args[0])) return tError;
        result = i32;
        sig = "(a: " + A + ", x: " + Es + "): i32";
        body = "  a.push(x);\n  for (let k: i32 = a.length - 1; k > 0; k--) a[k] = a[k - 1];\n  a[0] = x;\n  return a.length;\n";
      } else {
        for (std::size_t k = 0; k < args.size(); ++k) { TypeId t = expr(args[k]); if (!bad(t) && !isNum(t)) diag(kZNotAssignable, args[k], "'" + name(t) + "' to 'number'"); }
        if (args.size() < 2) { std::uint32_t id = newNode(N::Number, "2147483647", {}, i); out.nodeType[id] = i32; args.push_back(id); }
        result = at;
        sig = "(a: " + A + ", start: i32, count: i32): " + A;
        body = "  const n: i32 = a.length;\n  let s: i32 = start < 0 ? n + start : start;\n  if (s < 0) s = 0;\n  if (s > n) s = n;\n  let c: i32 = count;\n  if (c > n - s) c = n - s;\n  if (c < 0) c = 0;\n  const r: " + A + " = [];\n  for (let k: i32 = 0; k < c; k++) r.push(a[s + k]);\n  for (let k: i32 = s; k + c < n; k++) a[k] = a[k + c];\n  for (let k: i32 = 0; k < c; k++) a.pop();\n  return r;\n";
      }
      std::string key = m + "," + std::to_string(at);
      std::uint32_t sym = helper(key, "function $F" + sig + " {\n" + body + "}\n", aliases, i);
      std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
      out.nodeSym[id] = sym;
      out.nodeType[id] = out.syms[sym].type;
      std::vector<std::uint32_t> nk{id, recvNode};
      nk.insert(nk.end(), args.begin(), args.end());
      a.nodes[i].kids = std::move(nk);
      return result;
    }
    if (m == "at") {  // a negative index counts from the end; out of range is undefined, so like 'find' the result is only usable in '??' and console.log
      if (args.size() != 1) { diag(kZWrongArgCount, i, "expected 1, got " + std::to_string(args.size())); for (std::uint32_t arg : args) expr(arg); return tError; }
      TypeId it = expr(args[0]);
      if (!bad(it) && !isNum(it)) { diag(kZNotAssignable, args[0], "'" + name(it) + "' to 'number'"); return tError; }
      bool prim = ty(E).k == TK::Num || E == tBool || E == tStr;
      std::string sig, body;
      TypeId result;
      if (prim) {  // a nullable number does not exist yet: in console.log the result is its text, 'undefined' when missing
        if (i != logArg) {
          result = unionOf({E, tNull}, true);
          sig = "(a: " + inspectAliasName(at) + ", i: i32): " + inspectAliasName(result);
          body = "  const k: i32 = i < 0 ? a.length + i : i;\n  if (k < 0 || k >= a.length) return null;\n  return a[k];\n";
        } else {
        result = tStr;
        sig = "(a: " + inspectAliasName(at) + ", i: i32): string";
        body = "  const k: i32 = i < 0 ? a.length + i : i;\n  if (k < 0 || k >= a.length) return 'undefined';\n  return `${a[k]}`;\n";
        }
      } else {
        result = unionOf({E, tNull}, true);
        sig = "(a: " + inspectAliasName(at) + ", i: i32): " + inspectAliasName(result);
        body = "  const k: i32 = i < 0 ? a.length + i : i;\n  if (k < 0 || k >= a.length) return null;\n  return a[k];\n";
      }
      std::uint32_t sym = helper("at," + std::to_string(at) + (result == tStr ? ",text" : ""), "function $F" + sig + " {\n" + body + "}\n", {at, result}, i);
      std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
      out.nodeSym[id] = sym;
      out.nodeType[id] = out.syms[sym].type;
      a.nodes[i].kids = {id, recvNode, args[0]};
      return result;
    }
    bool search = m == "indexOf" || m == "lastIndexOf" || m == "includes" || m == "fill";
    bool fold = m == "reduce" || m == "reduceRight";
    std::size_t lo = fold ? 2 : 1, hi = fold ? 2 : m == "fill" ? 3 : search ? 2 : 1;
    if (args.size() < lo || args.size() > hi) { diag(kZWrongArgCount, i, "expected " + std::to_string(lo) + (hi != lo ? "-" + std::to_string(hi) : "") + ", got " + std::to_string(args.size())); for (std::uint32_t arg : args) expr(arg); return tError; }
    std::string A = inspectAliasName(at);
    TypeId i32 = num(Num::i32);
    TypeId result = tError;
    std::string body, sig;
    std::vector<TypeId> aliases{at};
    std::string key = m;
    // the function value of a callback, checked against (ps...) with at most as many parameters; `arity` is what it takes
    std::size_t arity = 1;
    auto callback = [&](TypeId expectRet, std::vector<TypeId> ps) -> TypeId {
      std::uint32_t arg = args[fold ? 0 : 0];
      padCallbacks = false;
      TypeId lt = expr(arg, func(ps, expectRet, 1));
      padCallbacks = true;
      if (bad(lt)) return tError;
      if (ty(lt).k != TK::Func || ty(lt).params.empty() || ty(lt).params.size() > ps.size()) { diag(kZNotAssignable, arg, "a function of 1-" + std::to_string(ps.size()) + " parameter(s) for '" + m + "'"); return tError; }
      for (std::size_t k = 0; k < ty(lt).params.size(); ++k) if (!assignable(ps[k], ty(lt).params[k], kNone)) { diag(kZNotAssignable, arg, "callback parameter '" + name(ps[k]) + "' to '" + name(ty(lt).params[k]) + "'"); return tError; }
      arity = ty(lt).params.size();
      aliases.push_back(lt);
      return lt;
    };
    auto pad = [&](const char* text) {
      std::uint32_t id = newNode(N::Number, text, {}, i);
      out.nodeType[id] = i32;
      args.push_back(id);
    };
    auto indexArg = [&](std::size_t k) {
      TypeId t = expr(args[k]);
      if (!bad(t) && !isNum(t)) diag(kZNotAssignable, args[k], "'" + name(t) + "' to 'number'");
    };
    bool floatElem = ty(E).k == TK::Num && (ty(E).num == Num::f64 || ty(E).num == Num::f32);
    if (search) {
      TypeId xt = m == "fill" ? expr(args[0], E) : expr(args[0], E);
      if (!bad(xt) && !require(xt, E, args[0])) return tError;
      for (std::size_t k = 1; k < args.size(); ++k) indexArg(k);
      std::string Es = inspectAliasName(E);
      aliases.push_back(E);
      std::string eq = isDyn(E) ? "__dynSeq(a[k], x)" : "a[k] === x";
      if (m == "includes" && floatElem) eq = "(a[k] === x || (a[k] !== a[k] && x !== x))";
      if (m == "indexOf" || m == "includes") {
        if (args.size() < 2) pad("0");
        result = m == "indexOf" ? i32 : tBool;
        sig = "(a: " + A + ", x: " + Es + ", from: i32): " + (m == "indexOf" ? "i32" : "boolean");
        body = "  let s: i32 = from < 0 ? a.length + from : from;\n  if (s < 0) s = 0;\n  for (let k: i32 = s; k < a.length; k++) if (" + eq + ") return " + (m == "indexOf" ? "k" : "true") + ";\n  return " + (m == "indexOf" ? "-1" : "false") + ";\n";
      } else if (m == "lastIndexOf") {
        if (args.size() < 2) pad("2147483647");
        result = i32;
        sig = "(a: " + A + ", x: " + Es + ", from: i32): i32";
        body = "  let s: i32 = from < 0 ? a.length + from : from;\n  if (s > a.length - 1) s = a.length - 1;\n  for (let k: i32 = s; k >= 0; k--) if (" + eq + ") return k;\n  return -1;\n";
      } else {  // fill
        if (args.size() < 2) pad("0");
        if (args.size() < 3) pad("2147483647");
        result = at;
        sig = "(a: " + A + ", x: " + Es + ", start: i32, end: i32): " + A;
        body = "  let s: i32 = start < 0 ? a.length + start : start;\n  if (s < 0) s = 0;\n  let e: i32 = end < 0 ? a.length + end : end;\n  if (e > a.length) e = a.length;\n  for (let k: i32 = s; k < e; k++) a[k] = x;\n  return a;\n";
      }
    } else if (fold) {
      TypeId want = kNoType;  // an empty array literal takes the type its callback annotates for the accumulator
      if (n(args[1]).kind == N::Array && n(args[1]).kids.empty() && n(args[0]).kind == N::FuncExpr && n(args[0]).kids.size() > 2 && n(n(args[0]).kids[2]).kids[0] != kNone) want = annotation(n(n(args[0]).kids[2]).kids[0]);
      TypeId ut = expr(args[1], want);
      if (bad(ut)) { expr(args[0]); return tError; }
      TypeId lt = callback(ut, {ut, E, i32});
      if (bad(lt)) return tError;
      if (!assignable(ty(lt).elem, ut, kNone)) { diag(kZNotAssignable, args[0], "'" + name(ty(lt).elem) + "' to '" + name(ut) + "'"); return tError; }
      aliases.push_back(ut);
      std::string U = inspectAliasName(ut);
      std::string call = arity == 2 ? "f(acc, a[k])" : "f(acc, a[k], k)";
      sig = "(a: " + A + ", f: " + inspectAliasName(ty(lt).k == TK::Func ? lt : lt) + ", init: " + U + "): " + U;
      body = "  let acc: " + U + " = init;\n  " + (m == "reduce" ? "for (let k: i32 = 0; k < a.length; k++)" : "for (let k: i32 = a.length - 1; k >= 0; k--)") + " acc = " + call + ";\n  return acc;\n";
      result = ut;
      key += "," + std::to_string(arity);
    } else if (m == "concat") {
      TypeId bt = expr(args[0], at);
      if (bad(bt) || !require(bt, at, args[0])) return tError;
      sig = "(a: " + A + ", b: " + A + "): " + A;
      body = "  const r: " + A + " = [];\n  for (const e of a) r.push(e);\n  for (const e of b) r.push(e);\n  return r;\n";
      result = at;
    } else {
      bool boolRet = m == "filter" || m == "some" || m == "every" || m == "findIndex" || m == "find" || m == "findLast" || m == "findLastIndex";
      TypeId lt = callback(boolRet ? tBool : kNoType, {E, i32});
      if (bad(lt)) return tError;
      TypeId U = ty(lt).elem;
      if (boolRet && U != tBool) { diag(kZNotAssignable, args[0], "'" + name(U) + "' to 'boolean'"); return tError; }
      std::string F = inspectAliasName(lt);
      std::string call = arity == 1 ? "f(a[k])" : "f(a[k], k)";
      std::string fwd = "for (let k: i32 = 0; k < a.length; k++)", bwd = "for (let k: i32 = a.length - 1; k >= 0; k--)";
      key += "," + std::to_string(arity);
      if (m == "map") {
        if (U == tVoid || bad(U)) { diag(kZCannotInfer, args[0], "the result type of 'map'"); return tError; }
        result = arrayOf(U);
        aliases.push_back(result);
        std::string R = inspectAliasName(result);
        sig = "(a: " + A + ", f: " + F + "): " + R;
        body = "  const r: " + R + " = [];\n  " + fwd + " r.push(" + call + ");\n  return r;\n";
      } else if (m == "filter") {
        result = at;
        sig = "(a: " + A + ", f: " + F + "): " + A;
        body = "  const r: " + A + " = [];\n  " + fwd + " if (" + call + ") r.push(a[k]);\n  return r;\n";
      } else if (m == "some" || m == "every") {
        result = tBool;
        sig = "(a: " + A + ", f: " + F + "): boolean";
        body = m == "some" ? "  " + fwd + " if (" + call + ") return true;\n  return false;\n" : "  " + fwd + " if (!" + call + ") return false;\n  return true;\n";
      } else if (m == "findIndex" || m == "findLastIndex") {
        result = i32;
        sig = "(a: " + A + ", f: " + F + "): i32";
        body = "  " + (m == "findIndex" ? fwd : bwd) + " if (" + call + ") return k;\n  return -1;\n";
      } else if (m == "find" || m == "findLast") {
        bool prim = ty(E).k == TK::Num || E == tBool || E == tStr;
        if (prim && i == logArg) {  // a nullable number does not exist yet: in console.log the result is its text, 'undefined' when missing
          result = tStr;
          key += ",text";
          sig = "(a: " + A + ", f: " + F + "): string";
          body = "  " + (m == "find" ? fwd : bwd) + " if (" + call + ") return `${a[k]}`;\n  return 'undefined';\n";
        } else {
          result = unionOf({E, tNull}, true);
          aliases.push_back(result);
          sig = "(a: " + A + ", f: " + F + "): " + inspectAliasName(result);
          body = "  " + (m == "find" ? fwd : bwd) + " if (" + call + ") return a[k];\n  return null;\n";
        }
      } else {  // forEach
        result = tVoid;
        sig = "(a: " + A + ", f: " + F + "): void";
        body = "  " + fwd + " " + call + ";\n";
      }
    }
    for (TypeId t : aliases) key += "," + std::to_string(t);
    std::uint32_t sym = helper(key, "function $F" + sig + " {\n" + body + "}\n", aliases, i);
    std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
    out.nodeSym[id] = sym;
    out.nodeType[id] = out.syms[sym].type;
    std::vector<std::uint32_t> nk{id, recvNode};
    nk.insert(nk.end(), args.begin(), args.end());
    a.nodes[i].kids = std::move(nk);
    return result;
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

  // 0: not a promise, 1: Promise<T>, 2: Promise<void>
  int promiseKind(TypeId t) {
    if (bad(t) || ty(t).k != TK::Object) return 0;
    std::string nm = name(t);
    return nm == "PromiseV" ? 2 : nm.rfind("Promise<", 0) == 0 ? 1 : 0;
  }

  // Replaces node `i` by the expression `text`, parsed with `holes` spliced in; false if it does not parse.
  bool replaceWith(std::uint32_t i, const std::string& text, const std::vector<std::vector<std::uint32_t>>& holes) {
    if (text == "__H0") { a.nodes[i] = a.nodes[holes[0][0]]; return true; }  // the argument itself (a lone hole would read as a statement hole)
    auto r = snippet(a, text + ";", holes, i);
    out.nodeType.resize(a.nodes.size(), kNoType);
    out.nodeSym.resize(a.nodes.size(), kNone);
    if (r.empty() || n(r[0]).kind != N::ExprStmt) return false;
    std::uint32_t e = n(r[0]).kids[0];
    a.nodes[i] = a.nodes[e];
    return true;
  }
  bool isBuiltin(std::uint32_t node, std::string_view nm) {
    const Node& x = n(node);
    if (x.kind != N::Ident || x.text != nm) return false;
    std::uint32_t s = lookup(x.text);
    return s != kNone && out.syms[s].kind == SymKind::Builtin;
  }
  // Number(x), String(x), Boolean(x), the Number statics and Math.min / Math.max with any number of arguments: rewritten
  // into expressions and generated helpers. Returns kNoType when the call is none of these.
  TypeId libraryCall(std::uint32_t i) {
    const std::vector<std::uint32_t> kids = n(i).kids;
    std::vector<std::uint32_t> args(kids.begin() + 1, kids.end());
    const Node& cn = n(kids[0]);
    auto rewrite = [&](const std::string& text, std::vector<std::vector<std::uint32_t>> holes) -> TypeId {
      if (!replaceWith(i, text, holes)) { diag(kZUnsupported, i, "internal error: library rewrite did not parse"); return tError; }
      return expr0(i, kNoType);
    };
    if (cn.kind == N::Ident && (cn.text == "Number" || cn.text == "String" || cn.text == "Boolean") && isBuiltin(kids[0], cn.text)) {
      if (args.size() > 1) { diag(kZWrongArgCount, i, "expected 0-1, got " + std::to_string(args.size())); for (std::uint32_t arg : args) expr(arg); return tError; }
      std::string nm(cn.text);
      if (args.empty()) return rewrite(nm == "String" ? "''" : nm == "Number" ? "0" : "false", {});
      TypeId at = expr(args[0]);
      if (bad(at)) return tError;
      const Type t = ty(at);
      bool num_ = t.k == TK::Num, str = t.k == TK::Str, bl = at == tBool, arr = t.k == TK::Array;
      if (nm == "String") {
        if (str) return rewrite("__H0", {{args[0]}});
        if (num_ || bl) return rewrite("`${__H0}`", {{args[0]}});
        if (arr) return rewrite("__H0.join(',')", {{args[0]}});
        if (at == tNull) return rewrite((n(args[0]).flags & kFlagUndefined) ? "'undefined'" : "'null'", {});
        if (t.k == TK::Union && hasNull(at)) return rewrite("`${__H0}`", {{args[0]}});  // a nullable number, boolean or string: its text, or null / undefined
      } else if (nm == "Number") {
        if (str) return rewrite("__toNumber(__H0)", {{args[0]}});
        if (num_) return rewrite("__H0", {{args[0]}});
        if (bl) return rewrite("(__H0 ? 1 : 0)", {{args[0]}});
      } else {
        if (str) return rewrite("(__H0.length > 0)", {{args[0]}});
        if (bl) return rewrite("__H0", {{args[0]}});
        if (num_) {
          std::string A = inspectAliasName(at);
          std::uint32_t sym = helper("truthy," + std::to_string(at), "function $F(x: " + A + "): boolean { return x !== 0 && x === x; }\n", {at}, i);
          std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
          out.nodeSym[id] = sym;
          out.nodeType[id] = out.syms[sym].type;
          a.nodes[i].kids = {id, args[0]};
          rewritten.insert(i);
          out.nodeType[i] = tBool;
          return tBool;
        }
      }
      diag(kZUnsupported, i, nm + "() of '" + name(at) + "'");
      return tError;
    }
    if (cn.kind == N::Ident && (cn.text == "isNaN" || cn.text == "isFinite") && args.size() == 1 && lookup(cn.text) == kNone) {  // the globals: for a number they are Number.isNaN and Number.isFinite
      TypeId at = expr(args[0]);
      if (!bad(at) && isNum(at)) return rewrite(cn.text == "isNaN" ? "Number.isNaN(__H0)" : "Number.isFinite(__H0)", {{args[0]}});
    }
    if (cn.kind == N::Member && n(cn.kids[0]).kind == N::Ident) {
      std::string_view on = n(cn.kids[0]).text, m = cn.text;
      if (on == "Number" && isBuiltin(cn.kids[0], "Number")) {
        if (m == "parseFloat" && args.size() == 1) return rewrite("parseFloat(__H0)", {{args[0]}});
        if (m == "parseInt" && (args.size() == 1 || args.size() == 2)) return rewrite(args.size() == 1 ? "parseInt(__H0)" : "parseInt(__H0, __H1)", args.size() == 1 ? std::vector<std::vector<std::uint32_t>>{{args[0]}} : std::vector<std::vector<std::uint32_t>>{{args[0]}, {args[1]}});
        if ((m == "isSafeInteger" || m == "isInteger") && args.size() == 1) {
          std::uint32_t sym = helper(std::string(m), std::string("function $F(x: f64): boolean { return x === Math.floor(x) && x - x === 0") + (m == "isSafeInteger" ? " && Math.abs(x) <= 9007199254740991" : "") + "; }\n", {}, i);
          std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
          out.nodeSym[id] = sym;
          out.nodeType[id] = out.syms[sym].type;
          a.nodes[i].kids = {id, args[0]};
          expr(args[0]);
          rewritten.insert(i);
          out.nodeType[i] = tBool;
          return tBool;
        }
      }
      if (on == "JSON" && isBuiltin(cn.kids[0], "JSON") && m == "stringify") {
        if (args.size() != 1) { diag(kZUnsupported, i, "JSON.stringify with a replacer or an indent"); for (std::uint32_t arg : args) expr(arg); return tError; }
        TypeId at = expr(args[0]);
        if (bad(at)) return tError;
        if (at == tNull) return rewrite("'null'", {});
        if (!jsonable(out, at) || hasParam(at)) { diag(kZUnsupported, args[0], "JSON.stringify of '" + name(at) + "'"); return tError; }
        std::uint32_t sym = jsonSym(at, i);
        std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
        out.nodeSym[id] = sym;
        out.nodeType[id] = out.syms[sym].type;
        a.nodes[i].kids = {id, args[0]};
        rewritten.insert(i);
        out.nodeType[i] = tStr;
        return tStr;
      }
      if (on == "JSON" && isBuiltin(cn.kids[0], "JSON") && m == "parse" && args.size() == 1) {  // parse validates the text; its value needs Dyn
        if (!require(expr(args[0], tStr), tStr, args[0])) return tError;
        if (a.strict && !rawDyn()) diag(kZDynInStrict, i, "the result of JSON.parse is `any`");
        return rewrite("__jsonParse(__H0)", {{args[0]}});
      }
      if (on == "Array" && isBuiltin(cn.kids[0], "Array") && m == "isArray" && args.size() == 1) {  // Array.isArray(x)
        TypeId at = expr(args[0]);
        if (bad(at)) return tError;
        if (isDyn(at)) return rewrite("__dynIsArray(__H0)", {{args[0]}});
        return rewrite(ty(at).k == TK::Array ? "true" : "false", {});
      }
      if (on == "Math" && isBuiltin(cn.kids[0], "Math") && m == "random" && args.empty()) return rewrite("__mathRandom()", {});
      if (on == "Math" && isBuiltin(cn.kids[0], "Math") && m == "seed" && args.size() == 1) return rewrite("__mathSeed(__H0)", {{args[0]}});
      if (on == "Math" && isBuiltin(cn.kids[0], "Math") && (m == "min" || m == "max") && args.size() != 2) {
        std::string nm(m);
        if (args.empty()) return rewrite(nm == "min" ? "Infinity" : "-Infinity", {});
        if (args.size() == 1) return rewrite("Math." + nm + "(__H0, __H0)", {{args[0]}});
        std::string text = "__H0";
        std::vector<std::vector<std::uint32_t>> holes{{args[0]}};
        for (std::size_t k = 1; k < args.size(); ++k) { text = "Math." + nm + "(" + text + ", __H" + std::to_string(k) + ")"; holes.push_back({args[k]}); }
        return rewrite(text, holes);
      }
    }
    return kNoType;
  }

  // f?.(args) with f of type `(...) => R | null`: the call when f is there, null (or nothing, for R void) when it is not
  bool pureCallee(std::uint32_t c) const {
    const Node& x = n(c);
    return x.kind == N::Ident || x.kind == N::This || (x.kind == N::Member && !(x.flags & kFlagOptional) && pureCallee(x.kids[0])) || (x.kind == N::Member && pureCallee(x.kids[0]));
  }
  bool optionalCall(std::uint32_t i, TypeId expected, TypeId& result) {
    std::uint32_t callee = n(i).kids[0];
    TypeId ct = expr(callee);
    if (bad(ct) || !hasNull(ct)) return false;
    TypeId ft = withoutNull(ct);
    if (ft == kNoType || ty(ft).k != TK::Func) return false;
    if (!pureCallee(callee)) { diag(kZUnsupported, i, "an optional call of a callee that is not a plain name or property path"); result = tError; return true; }
    bool isVoid = ty(ft).elem == tVoid;
    std::vector<std::vector<std::uint32_t>> holes{{callee}, {cloneNode(callee, false)}};
    std::string args;
    for (std::size_t k = 1; k < n(i).kids.size(); ++k) { holes.push_back({n(i).kids[k]}); args += (k > 1 ? ", " : "") + std::string("__H") + std::to_string(k + 1); }
    std::string text = isVoid ? "(() => { if (__H0 !== null) __H1(" + args + "); })()" : "(__H0 !== null ? __H1(" + args + ") : null)";
    if (!replaceWith(i, text, holes)) { result = tError; return true; }
    result = expr0(i, expected);
    return true;
  }
  TypeId callExpected = kNoType, genericExpected = kNoType;  // the type the call's value is wanted as, for type arguments the arguments do not give
  TypeId callExpr(std::uint32_t i, const Node& x, bool isNew) {
    TypeId myExpected = callExpected;
    callExpected = kNoType;
    if (!isNew && (x.flags & kFlagOptional) && !n(i).kids.empty()) {
      TypeId r;
      if (optionalCall(i, kNoType, r)) return r;
    }
    auto optionalArgMethod = [&](const Node& cal) {  // the library methods whose trailing arguments may be written `undefined`
      if (cal.kind != N::Member) return false;
      for (std::string_view m : {"padEnd", "padStart", "slice", "substring", "indexOf", "lastIndexOf", "includes", "startsWith", "endsWith", "split", "join", "fill", "toFixed"}) if (cal.text == m) return true;
      return false;
    };
    while (!isNew && x.kids.size() > 1 && n(x.kids.back()).kind == N::Ident && n(x.kids.back()).text == "undefined" && lookup("undefined") == kNone && optionalArgMethod(n(x.kids[0]))) a.nodes[i].kids.pop_back();  // a trailing `undefined` is an omitted argument
    if (!isNew) { TypeId lc = libraryCall(i); if (lc != kNoType) return lc; }
    if (!isNew && n(x.kids[0]).kind == N::Member && n(x.kids[0]).text == "from" && n(n(x.kids[0]).kids[0]).kind == N::Ident && n(n(x.kids[0]).kids[0]).text == "Array" && (lookup("Array") == kNone || out.syms[lookup("Array")].kind == SymKind::Builtin) && (x.kids.size() == 2 || x.kids.size() == 3)) {
      // Array.from(iterable[, f]) is [...iterable][.map(f)]; Array.from({ length: n }, f) fills n elements with f(0, i)
      std::uint32_t src = x.kids[1];
      if (n(src).kind == N::ObjectLit && n(src).kids.size() == 1 && n(n(src).kids[0]).text == "length" && x.kids.size() == 3) {
        if (replaceWith(i, "__arrayFromLength(__H0, __H1)", {{n(n(src).kids[0]).kids[0]}, {x.kids[2]}})) return expr0(i, myExpected);
      } else if (x.kids.size() == 2 ? replaceWith(i, "[...__H0]", {{src}}) : replaceWith(i, "[...__H0].map(__H1)", {{src}, {x.kids[2]}})) return expr0(i, myExpected);
    }
    if (!isNew && n(x.kids[0]).kind == N::Member && (n(x.kids[0]).text == "then" || n(x.kids[0]).text == "catch" || n(x.kids[0]).text == "finally") && n(n(x.kids[0]).kids[0]).kind != N::Super) {
      // promise.then(f) and promise.catch(f) are calls of the prelude's helpers with the promise as first argument
      std::uint32_t obj = n(x.kids[0]).kids[0];
      int pk = promiseKind(expr(obj));
      if (pk != 0) {
        bool then = n(x.kids[0]).text == "then";
        bool fin = n(x.kids[0]).text == "finally";
        a.nodes[i].kids[0] = newNode(N::Ident, fin ? (pk == 2 ? "__finallyV" : "__finally") : then ? (pk == 2 ? "__thenFromV" : "__then") : (pk == 2 ? "__catchV" : "__catch"), {}, x.kids[0]);
        a.nodes[i].kids.insert(a.nodes[i].kids.begin() + 1, obj);
      }
    }
    std::uint32_t callee = x.kids[0];
    TypeId ft = kNoType;
    TypeId result = tError;
    bool preEvaluated = false;  // generic calls evaluate their arguments first to infer type arguments
    const std::vector<std::uint32_t> argNodes(x.kids.begin() + 1, x.kids.end());
    if (isNew) {
      const Node& c = n(callee);
      std::uint32_t s = c.kind == N::Ident ? lookup(c.text) : kNone;
      if (s != kNone && out.syms[s].kind == SymKind::GenericClass && a.targs.count(i)) {  // explicit type arguments: the arguments are checked against the parameter types
        std::vector<TypeId> targs;
        for (std::uint32_t t : std::vector<std::uint32_t>(a.targs[i])) targs.push_back(annotation(t));
        if (targs.size() < generics[s].tp.size()) fillTypeDefaults(generics[s], targs);
        if (targs.size() != generics[s].tp.size()) { diag(kZWrongArgCount, i, "expected " + std::to_string(generics[s].tp.size()) + " type argument(s), got " + std::to_string(targs.size())); for (std::uint32_t an : argNodes) expr(an); return tError; }
        std::uint32_t inst = instantiateClass(s, targs, callee);
        if (inst == kNone) { for (std::uint32_t an : argNodes) expr(an); return tError; }
        s = inst;
        ensureBuilt(ty(out.syms[inst].type).obj);  // its constructor type is needed to check the arguments
      } else if (s != kNone && out.syms[s].kind == SymKind::GenericClass) {
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
      if (oi.isInterface || oi.isRecord) { diag(kZNotCallable, callee, "an interface cannot be instantiated"); for (std::size_t k = 1; k < x.kids.size(); ++k) expr(x.kids[k]); return tError; }
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
      if (n(callee).kind == N::Member && n(n(callee).kids[0]).kind == N::Ident) {  // Class.method<T>(...): the generic function `Class.method`
        std::uint32_t cs = lookup(n(n(callee).kids[0]).text);
        if (cs != kNone && out.syms[cs].kind == SymKind::Class) {
          std::uint32_t gs2 = lookup(keep(std::string(n(n(callee).kids[0]).text) + "." + std::string(n(callee).text)));
          if (gs2 != kNone && out.syms[gs2].kind == SymKind::GenericFunc) { a.nodes[callee].kind = N::Ident; a.nodes[callee].text = out.syms[gs2].name; a.nodes[callee].kids.clear(); }
        }
      }
      const Node& cn = n(callee);
      if (cn.kind == N::Ident && cn.text == "__await" && !argNodes.empty() && promiseKind(expr(argNodes[0])) == 2) a.nodes[callee].text = "__awaitV";
      if (cn.kind == N::Ident && cn.text == "__rejectedP" && !a.targs.count(i) && (myExpected == kNoType || bad(myExpected) || promiseKind(myExpected) != 1)) a.nodes[callee].text = "__rejectedN";  // Promise.reject(e) with no type to give it: a promise that only rejects, which fits any Promise<T>
      std::uint32_t gs = cn.kind == N::Ident ? lookup(cn.text) : kNone;
      if (gs != kNone && out.syms[gs].kind == SymKind::GenericFunc) {
        if (cn.text == "__resolved" && argNodes.size() == 1 && !a.targs.count(i)) {  // Promise.resolve(p) is p itself
          TypeId at0 = expr(argNodes[0]);
          if (!bad(at0) && promiseKind(at0) == 1 && replaceWith(i, "__H0", {{argNodes[0]}})) return expr0(i, kNoType);
        }
        if (!a.targs.count(i))  // with explicit type arguments the arguments are checked against the parameter types instead (an array literal takes the element kind of `T`)
        for (std::uint32_t an : argNodes) if (n(an).kind != N::FuncExpr && !(n(an).kind == N::Array && n(an).kids.empty())) expr(an);  // function expressions and empty array literals wait for the type arguments the others give
        preEvaluated = true;
        GenericDecl& g = generics[gs];
        ensureSelf(g);
        std::uint32_t ts = instantiateFunc(gs, g.selfParams, callee);
        if (ts == kNone) return tError;
        genericExpected = myExpected;
        std::vector<TypeId> targs = typeArgsFor(gs, i, argNodes, out.syms[ts].type);
        genericExpected = kNoType;
        if (targs.empty()) return tError;
        if ((cn.text == "__then" || cn.text == "__thenFromV") && targs.back() == tVoid) {  // the callback returns nothing: the helpers of a Promise<void> result
          targs.pop_back();
          a.nodes[callee].text = cn.text == "__then" ? "__thenV" : "__thenVV";
          gs = lookup(cn.text);
        }
        std::uint32_t inst = out.syms[gs].kind == SymKind::GenericFunc ? instantiateFunc(gs, targs, callee) : gs;
        if (inst == kNone) return tError;
        out.nodeSym[callee] = inst;
        ct = out.syms[inst].type;
        out.nodeType[callee] = ct;
      } else if (cn.kind == N::Member && n(i).kids.size() == 1 && (cn.text == "entries" || cn.text == "keys" || cn.text == "values") && n(cn.kids[0]).kind != N::Super && iteratorMethod(i, cn.text)) {
        return out.nodeType[i];
      } else if (cn.kind == N::Member && cn.text == "forEach" && n(cn.kids[0]).kind != N::Super && (ty(expr(cn.kids[0])).k == TK::Map || ty(out.nodeType[cn.kids[0]]).k == TK::Set)) {
        return mapForEach(i);
      } else if (cn.kind == N::Member && isHofName(cn.text) && n(cn.kids[0]).kind != N::Super && ty(expr(cn.kids[0])).k == TK::Array && !(cn.text == "join" && ty(ty(out.nodeType[cn.kids[0]]).elem).k == TK::Str)) {  // string arrays join through the runtime
        return arrayHof(i, cn.text);
      } else { calleeNode = callee; ct = expr(callee); calleeNode = kNone; }
      if (bad(ct)) { for (std::size_t k = 1; k < x.kids.size(); ++k) if (!preEvaluated) expr(x.kids[k]); return tError; }
      if (ty(ct).k != TK::Func) {
        diag(kZNotCallable, callee, "'" + name(ct) + "'");
        for (std::size_t k = 1; k < x.kids.size(); ++k) expr(x.kids[k]);
        return tError;
      }
      ft = ct;
      result = ty(ft).elem;
      if (n(callee).kind == N::Member && (n(callee).flags & kFlagOptional) && result != tVoid && !bad(result)) result = unionOf({result, tNull}, true);  // a?.f(): the result, or undefined
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
      if (!isNew && n(callee).kind == N::Member && n(callee).text == "log") logArg = arg;
      TypeId at = preEvaluated ? out.nodeType[arg] : expr(arg, expected);
      if (!isNew && !preEvaluated && n(callee).kind == N::Member && n(callee).text == "log" && at == tNull && replaceWith(arg, ((n(arg).flags & kFlagUndefined) || (n(arg).kind == N::Ident && out.nodeSym[arg] != kNone && ty(out.syms[out.nodeSym[arg]].type).undef)) ? "'undefined'" : "'null'", {})) at = expr(arg);  // a value known to be null (or undefined)
      if (!isNew && !preEvaluated && n(callee).kind == N::Member && n(callee).text == "log" && n(n(callee).kids[0]).kind == N::Ident && out.nodeSym[n(callee).kids[0]] != kNone &&
          out.syms[out.nodeSym[n(callee).kids[0]]].kind == SymKind::Builtin && !bad(at) && needsInspect(at)) {
        std::uint32_t call = callGenerated(inspectLog(at, arg), {arg}, arg);
        a.nodes[i].kids[k + 1] = call;
        at = tStr;
      }
      if (expected != kNoType) require(at, expected, arg);
    }
    if (!isNew && n(callee).kind == N::Member && n(callee).text == "get" && i != nullishLeft) {  // Map.get has no `undefined` to test: it is only usable under `??`
      TypeId rt = out.nodeType[n(callee).kids[0]];
      if (rt != kNoType && ty(rt).k == TK::Map) {
        TypeId v = result;
        TK vk = v == kNoType || bad(v) ? TK::Any : ty(v).k;
        bool refLike = v == tStr || vk == TK::Array || vk == TK::Map || vk == TK::Set || vk == TK::Object || vk == TK::Func;
        if (refLike) result = unionOf({v, tNull}, true);        // a missing key reads as undefined
        else if (i != asOperand) {  // a number or boolean: `V | null` through a generated lookup (a scalar slot cannot hold null itself)
          TypeId R = unionOf({v, tNull}, true);
          std::string M = inspectAliasName(rt), K = inspectAliasName(ty(rt).params[0]), V = inspectAliasName(v), RS = inspectAliasName(R);
          std::uint32_t sym = helper("mapGetN," + std::to_string(rt), "function $F(m: " + M + ", k: " + K + "): " + RS + " {\n  if (m.has(k)) return m.get(k) as " + V + ";\n  return null;\n}\n", {rt, ty(rt).params[0], v, R}, i);
          std::uint32_t id = newNode(N::Ident, out.syms[sym].name, {}, i);
          out.nodeSym[id] = sym;
          out.nodeType[id] = out.syms[sym].type;
          std::uint32_t recv = n(callee).kids[0], key = n(i).kids[1];
          a.nodes[i].kids = {id, recv, key};
          rewritten.insert(i);
          out.nodeType[i] = R;
          result = R;
        }
      }
    }
    if (!isNew && n(callee).kind == N::Member && !(n(callee).flags & kFlagOptional)) resetBelow(pathKey(n(callee).kids[0]));  // `p.m()` may write p's fields: what was known below p is forgotten
    return result;
  }

  TypeId expr0(std::uint32_t i, TypeId expected) {
    const Node& x = n(i);
    switch (x.kind) {
      case N::Number: return num(Num::f64);
      case N::BigInt: diag(kZUnsupported, i, "bigint"); return tError;
      case N::String: return tStr;
      case N::Template:
        for (std::size_t ki = 0; ki < n(i).kids.size(); ++ki) {
          std::uint32_t k = n(i).kids[ki];
          TypeId pt = expr(k);
          if (!bad(pt) && ty(pt).k == TK::Func) diag(kZNotAssignable, k, "'" + name(pt) + "' to 'string' (call the function)");
          if (pt == tNull && n(k).kind == N::Literal) { a.nodes[k].kind = N::String; a.nodes[k].text = (n(k).flags & kFlagUndefined) ? "'undefined'" : "'null'"; out.nodeType[k] = tStr; continue; }  // ${null}, ${undefined}
          if (!bad(pt) && ty(pt).k == TK::Union && hasNull(pt)) {  // `${x}` of a nullable number or boolean prints null or the value
            TypeId base = withoutNull(pt);
            if (base != kNoType && (ty(base).k == TK::Num || base == tBool || base == tStr)) {
              std::uint32_t h = helper("fmtNullable:" + std::to_string(pt), "function $F(v: " + inspectAliasName(pt) + "): string { return v === null ? '" + std::string(ty(pt).undef ? "undefined" : "null") + "' : '' + v; }", {pt}, k);
              a.nodes[i].kids[ki] = callGenerated(h, {k}, k);
            }
          }
        }
        return tStr;
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
        if (s == kNone && x.text == "undefined" && lookup("__undef") != kNone) { a.nodes[i].text = "__undef"; return expr0(i, expected); }  // the Dyn undefined
        if (s == kNone || (out.syms[s].forward && out.syms[s].ownerFn == (fnStack.empty() ? kNone : fnStack.back()))) { diag(kZCannotFindName, i, "'" + std::string(x.text) + "'"); return tError; }  // a forward variable is only visible to other functions
        out.nodeSym[i] = s;
        if (out.syms[s].kind == SymKind::Func) {  // a function whose return type is still to be found
          if (inferring.count(s)) { diag(kZCannotInfer, i, "return type of '" + std::string(x.text) + "' (it needs itself: annotate it)"); return tError; }
          resolvePending(s);
        }
        if (out.syms[s].kind == SymKind::Class || out.syms[s].kind == SymKind::GenericClass) { diag(kZNotAllowedHere, i, "class '" + std::string(x.text) + "' used as a value"); return tError; }
        if (out.syms[s].kind == SymKind::GenericFunc) { diag(kZNotAllowedHere, i, "generic function '" + std::string(x.text) + "' must be called"); return tError; }
        if (out.syms[s].kind == SymKind::Enum) { diag(kZNotAllowedHere, i, "enum '" + std::string(x.text) + "' used as a value"); return tError; }
        if (out.syms[s].kind == SymKind::TypeAlias) { diag(kZNotAllowedHere, i, "type parameter '" + std::string(x.text) + "' used as a value"); return tError; }
        bool nestedFunc = out.syms[s].kind == SymKind::Func && out.syms[s].ownerFn != kNone;
        if ((trackable(s) || nestedFunc) && !out.syms[s].isGlobal && !fnStack.empty() && out.syms[s].ownerFn != fnStack.back()) {
          out.syms[s].captured = true;  // used inside a lambda or nested function that does not declare it
          for (std::size_t k = fnStack.size(); k-- > 0 && fnStack[k] != out.syms[s].ownerFn;) {
            auto& cs = out.captures[fnStack[k]];
            if (std::find(cs.begin(), cs.end(), s) == cs.end()) cs.push_back(s);
          }
        }
        if (out.syms[s].kind == SymKind::Func && i != calleeNode) out.funcValueUses.push_back(i);
        if (trackable(s)) {
          TypeId cur = currentType(s);
          if (isDyn(out.syms[s].type) && cur != out.syms[s].type && !isDyn(cur) && !isDynFamily(cur) && !pendingExempt && !rawDyn()) convertDyn(out.syms[s].type, cur, i);  // narrowed by typeof or instanceof: the typed value
          return cur;
        }
        return out.syms[s].type;
      }
      case N::FuncExpr: return funcExpr(i, expected);
      case N::ObjectLit: return objectLit(i, x, expected);
      case N::As: {  // e as T: T must be comparable with the type of e
        if (n(x.kids[1]).kind == N::TypeRef && n(x.kids[1]).text == "const") return expr(x.kids[0], expected);  // `as const` only narrows literals: erased
        if (x.text == "satisfies") {  // e satisfies T: e must be assignable to T and keeps its own type
          TypeId target = annotation(x.kids[1]);
          TypeId vt = expr(x.kids[0], bad(target) ? kNoType : target);
          if (!bad(target) && !bad(vt)) require(vt, target, x.kids[0]);
          return vt;
        }
        TypeId target = annotation(x.kids[1]);
        if (bad(target)) { expr(x.kids[0]); return tError; }
        std::uint32_t savedAs = asOperand;
        asOperand = x.kids[0];
        TypeId vt = expr(x.kids[0], target);
        asOperand = savedAs;
        if (!bad(vt) && !rawDyn() && ((isDyn(vt) && !isDyn(target) && !isDynFamily(target)) || (isDyn(target) && !isDyn(vt) && !isDynFamily(vt)))) {  // a checked conversion from or to a Dyn
          std::uint32_t operand = x.kids[0];
          convertDyn(vt, target, operand);
          a.nodes[i] = a.nodes[operand];
          out.nodeType[i] = target;
          rewritten.insert(i);
          return target;
        }
        if (!bad(vt) && !assignable(vt, target, kNone) && !assignable(target, vt, kNone)) diag(kZNotAssignable, i, "conversion of '" + name(vt) + "' to '" + name(target) + "'");
        return target;
      }
      case N::NonNull: {
        TypeId vt = expr(x.kids[0]);
        if (bad(vt)) return tError;
        TypeId nn = withoutNull(vt);
        if (nn == kNoType || nn == tNull) { diag(kZNotAssignable, i, "'" + name(vt) + "' to a non-null type"); return tError; }
        return nn;
      }
      case N::Array: {
        if (expected != kNoType && ty(expected).k == TK::Union) {  // `T[] | null`: the literal is the array
          TypeId only = kNoType;
          int arrays = 0;
          for (TypeId mt : unionMembers(expected)) if (ty(mt).k == TK::Array) { only = mt; ++arrays; }
          if (arrays == 1) {
            TypeId t = expr0(i, only);
            return t;
          }
        }
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
        bool spread = false;
        for (std::uint32_t e : x.kids) spread = spread || n(e).kind == N::Spread;
        if (spread) {  // [...a, 1, ...b]: the pieces concatenated in order (a literal run between spreads is an array literal of its own)
          std::vector<std::vector<std::uint32_t>> holes;
          std::vector<std::uint32_t> run;
          auto flush = [&]() { if (!run.empty()) { holes.push_back({newNode(N::Array, {}, run, i)}); run.clear(); } };
          for (std::uint32_t e : std::vector<std::uint32_t>(x.kids)) {
            if (n(e).kind == N::Spread) {
              std::uint32_t op = n(e).kids[0];
              TypeId st = expr(op);  // the other iterables spread as the arrays their iterators are here
              if (!bad(st) && ty(st).k == TK::Object && name(st).rfind("Generator<", 0) == 0) replaceWith(op, "__genToArray(__H0)", {{cloneNode(op, false)}});
              else if (!bad(st) && ty(st).k == TK::Set) replaceWith(op, "__H0.values()", {{cloneNode(op, false)}});
              else if (!bad(st) && ty(st).k == TK::Map) replaceWith(op, "__H0.entries()", {{cloneNode(op, false)}});
              else if (!bad(st) && st == tStr) replaceWith(op, "__H0.split('')", {{cloneNode(op, false)}});
              flush(); holes.push_back({op});
            } else run.push_back(e);
          }
          flush();
          std::string text = holes.size() == 1 ? "__H0.slice()" : "__H0";
          for (std::size_t k = 1; k < holes.size(); ++k) text += ".concat(__H" + std::to_string(k) + ")";
          if (expected != kNoType && ty(expected).k == TK::Array) spreadHint = {holes[0][0], ty(expected).elem};  // a leading literal run takes the element type expected
          if (replaceWith(i, text, holes)) return expr0(i, expected);
        }
        TypeId el = (expected != kNoType && ty(expected).k == TK::Array) ? ty(expected).elem : isDyn(expected) ? tDyn : kNoType;  // [1, 'a'] where an any is expected: any elements
        if (el == kNoType && spreadHint.first == i) el = spreadHint.second;
        if (x.kids.empty()) {
          if (el == kNoType) { diag(kZCannotInfer, i, "empty array literal"); return tError; }
          return arrayOf(el);
        }
        TypeId first = kNoType;
        bool sawNull = false;  // [1, null]: the elements are `number | null`
        for (std::size_t k = 0; k < x.kids.size(); ++k) {
          std::uint32_t e = x.kids[k];
          if (n(e).kind == N::Spread) { diag(kZUnsupported, e, "spread elements"); continue; }
          TypeId t = expr(e, el);
          if (el != kNoType) require(t, el, e);
          else if (t == tNull) sawNull = true;
          else if (first == kNoType) first = t;
          else if (!assignable(t, first, e)) { diag(kZNotAssignable, e, "'" + name(t) + "' to '" + name(first) + "'"); }
        }
        if (el != kNoType) return arrayOf(el);
        if (first == kNoType) { diag(kZCannotInfer, i, "array of only null"); return tError; }
        return arrayOf(sawNull && !bad(first) ? unionOf({first, tNull}) : first);
      }
      case N::Binary: return binaryExpr(i, x, expected);
      case N::Unary: {
        const std::string op(x.text);
        TypeId t = expr(x.kids[0]);
        if (!rawDyn() && isDyn(t) && (op == "!" || op == "-" || op == "+")) {
          const char* call = op == "!" ? "!__dynTruthy(__H0)" : op == "-" ? "__dynNeg(__H0)" : "__dynPos(__H0)";
          if (replaceWith(i, call, {{x.kids[0]}})) return expr0(i, expected);
        }
        if (op == "!" && !bad(t)) t = truthiness(x.kids[0], t);  // `!p` on a nullable: not present (or falsy)
        if (op != "typeof" && op != "void" && op != "delete") t = appOrDiag(t, x.kids[0]);
        if (bad(t)) return op == "!" ? tBool : tError;
        if (op == "!") { if (t != tBool) diag(kZNotAssignable, x.kids[0], "'" + name(t) + "' to 'boolean'"); return tBool; }
        if (op == "typeof") {
          if (rawDyn()) return tStr;
          std::string lit;
          if (isDyn(t)) { if (replaceWith(i, "__dynTypeof(__H0)", {{x.kids[0]}})) return expr0(i, expected); return tStr; }
          if (ty(t).k == TK::Union && hasNull(t)) {  // T | null: undefined or null when absent, else the typeof of the rest (a generated test: the operand may be a call)
            TypeId inner = withoutNull(t);
            std::string it = inner == tStr ? "'string'" : (inner != kNoType && isNum(inner)) ? "'number'" : inner == tBool ? "'boolean'" : "'object'";
            std::uint32_t sym = helper("typeofN," + std::to_string(t), "function $F(v: " + inspectAliasName(t) + "): string {\n  return v === null ? " + std::string(ty(t).undef ? "'undefined'" : "'object'") + " : " + it + ";\n}\n", {t}, i);
            wrapNode(x.kids[0], sym);
            std::uint32_t callNode = x.kids[0];
            a.nodes[i] = a.nodes[callNode];
            out.nodeType[i] = tStr;
            rewritten.insert(i);
            return tStr;
          }
          if (t == tStr) lit = "'string'"; else if (isNum(t)) lit = "'number'"; else if (t == tBool) lit = "'boolean'"; else if (ty(t).k == TK::Func) lit = "'function'"; else if (t == tVoid) lit = "'undefined'"; else lit = "'object'";
          if (replaceWith(i, lit, {})) return expr0(i, expected);
          return tStr;
        }
        if (op == "void") return tVoid;
        if (op == "delete") { diag(kZUnsupported, i, "'delete'"); return tError; }
        if ((op == "+" || op == "-") && (t == tStr || t == tBool)) {  // string and boolean operands convert like Number(x)
          std::string conv = t == tStr ? "__toNumber(__H0)" : "(__H0 ? 1 : 0)";
          if (replaceWith(i, op == "-" ? "-" + conv : conv, {{x.kids[0]}})) return expr0(i, expected);
        }
        if (!isNum(t)) { diag(kZBadOperand, i, "'" + op + "' on '" + name(t) + "'"); return tError; }
        return op == "~" ? num(Num::i32) : t;
      }
      case N::UpdatePre: case N::UpdatePost: {
        if ((n(x.kids[0]).kind == N::Member || n(x.kids[0]).kind == N::Index) && rewriteDynStore(i, x.kids[0], x.text == "++" ? "+" : "-", kNone, false)) return expr0(i, expected);
        if (n(x.kids[0]).kind == N::Ident && !rawDyn()) {
          std::uint32_t sy = lookup(n(x.kids[0]).text);
          if (sy != kNone && trackable(sy) && isDyn(out.syms[sy].type) && replaceWith(i, std::string("__H0 = __H1 ") + (x.text == "++" ? "+" : "-") + " 1", {{x.kids[0]}, {cloneNode(x.kids[0], false)}})) return expr0(i, expected);
        }
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
        if (n(target).kind == N::Member || n(target).kind == N::Index) {
          std::string bop = x.text == "=" ? "" : std::string(x.text.substr(0, x.text.size() - 1));
          if (rewriteDynStore(i, target, bop, value, false)) return expr0(i, expected);
        }
        if (n(target).kind == N::Member && x.text == "=" && !(n(target).flags & kFlagOptional)) {  // obj.name = v where the class has `set name(v)`: a call of the setter
          std::uint32_t objNode = n(target).kids[0];
          std::uint32_t objSym = n(objNode).kind == N::Ident ? lookup(n(objNode).text) : kNone;
          bool classRef = objSym != kNone && (out.syms[objSym].kind == SymKind::Class || out.syms[objSym].kind == SymKind::GenericClass || out.syms[objSym].kind == SymKind::Enum);  // C.n = v: a static field, not a setter
          TypeId ot = classRef ? kNoType : n(objNode).kind == N::This ? (curClass == kNone ? kNoType : objType(curClass)) : expr(objNode);
          if (ot != kNoType && !bad(ot) && ty(ot).k == TK::Object) {
            const Member* setter = lookupMember(ty(ot).obj, "__set_" + std::string(n(target).text), false);
            const Member* plain = lookupMember(ty(ot).obj, n(target).text, false);
            if (setter && !(plain && !plain->method && !plain->getter)) {
              if (!pureCallee(objNode)) { diag(kZUnsupported, i, "a property with a setter assigned through a computed object"); return tError; }
              std::vector<std::vector<std::uint32_t>> holes{{cloneNode(objNode, false)}, {value}};
              if (!replaceWith(i, "__H0.__set_" + std::string(n(target).text) + "(__H1)", holes)) return tError;
              return expr0(i, expected);
            }
          }
        }
        if (n(target).kind == N::Member && x.text == "=" && n(target).text == "length" && !(n(target).flags & kFlagOptional)) {  // arr.length = n: a call that truncates
          std::uint32_t objNode = n(target).kids[0];
          if (pureCallee(objNode)) {
            TypeId ot = expr(objNode);
            if (!bad(ot) && ty(ot).k == TK::Array) {
              std::vector<std::vector<std::uint32_t>> holes{{cloneNode(objNode, false)}, {value}};
              if (!replaceWith(i, "__H0.__setLength(__H1)", holes)) return tError;
              return expr0(i, expected);
            }
          }
        }
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
        if (n(target).kind == N::Ident && tsym != kNone && trackable(tsym)) resetPaths(tsym);  // `node = other`: nothing is known of node.left any more
        if (op == "=") {
          TypeId vt = expr(value, tt);
          if (ok) require(vt, tt, value);
          if (tsym != kNone && trackable(tsym) && ty(tt).k == TK::Union && !bad(vt) && assignable(vt, tt, kNone)) narrowing.push_back({tsym, vt});  // known after the assignment
          if (n(target).kind == N::Member || n(target).kind == N::Index) {
            resetBelow(pathKey(target));  // what was known of the fields and elements of the old value
            if (!bad(vt) && assignable(vt, tt, kNone) && ty(tt).k == TK::Union) {  // node.left = x: what x was is known
              std::uint32_t ps = pathSymFor2(target, tt);
              if (ps != kNone) narrowing.push_back({ps, vt});
            }
          }
          return tt;
        }
        TypeId vt = expr(value);
        if (bad(tt) || bad(vt)) return tt;
        std::string bop = op.substr(0, op.size() - 1);
        if (!rawDyn() && isDyn(vt) && isNum(tt) && bop == "+" && replaceWith(i, "__H0 = __dynAddNum(__H1, __H2)", {{target}, {cloneNode(target, false)}, {value}})) return expr0(i, expected);  // total += d
        if (!rawDyn() && (isDyn(vt) || isDyn(tt)) && bop != "&&" && bop != "||" && bop != "?\?" && replaceWith(i, "__H0 = __H1 " + bop + " __H2", {{target}, {cloneNode(target, false)}, {value}})) return expr0(i, expected);
        if (bop == "&&" || bop == "||" || bop == "?\?") {  // a ||= b is a = a || b
          if (replaceWith(i, "__H0 = __H1 " + bop + " __H2", {{target}, {cloneNode(target, false)}, {value}})) return expr0(i, expected);
          return tt;
        }
        if (bop == "+" && tt == tStr && stringifiable(vt)) return tt;
        if (!isNum(tt) || !isNum(vt)) { diag(kZBadOperand, i, "'" + op + "' on '" + name(tt) + "' and '" + name(vt) + "'"); return tt; }
        Num r = (bop == "&" || bop == "|" || bop == "^" || bop == "<<" || bop == ">>") ? Num::i32 : bop == ">>>" ? Num::u32 : arith(bop, target, ty(tt).num, value, ty(vt).num);
        if (!widens(r, ty(tt).num) && (isFx(r) || isFx(ty(tt).num))) diag(kZNotAssignable, i, "'" + std::string(numName(r)) + "' to '" + name(tt) + "'");
        return tt;
      }
      case N::Cond: {
        TypeId c = truthiness(x.kids[0], expr(x.kids[0]));
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
        if (q == tNull && p != tNull && !isDyn(p)) return unionOf({p, tNull});  // c ? x : null
        if (p == tNull && q != tNull && !isDyn(q)) return unionOf({q, tNull});
        if (assignable(q, p, x.kids[2])) return p;
        if (assignable(p, q, x.kids[1])) return q;
        if (name(p) == "NeverPromise" && promiseKind(q) == 1) { require(p, q, x.kids[1]); return q; }  // a branch that only rejects takes the other branch's promise type
        require(q, p, x.kids[2]);  // conversions (a thunk, a promise that only rejects) or the error
        return p;
      }
      case N::Call: callExpected = expected; return callExpr(i, x, false);
      case N::New: newExpected = expected; return callExpr(i, x, true);
      case N::Member: {
        const bool opt = (x.flags & kFlagOptional) != 0;  // a?.b: null when a is null
        if (isBuiltin(x.kids[0], "Number")) {  // the constants of Number
          static const std::pair<const char*, const char*> kConsts[] = {{"MAX_VALUE", "1.7976931348623157e308"}, {"MIN_VALUE", "5e-324"}, {"POSITIVE_INFINITY", "Infinity"}, {"NEGATIVE_INFINITY", "-Infinity"},
                                                                        {"NaN", "NaN"}, {"MAX_SAFE_INTEGER", "9007199254740991"}, {"MIN_SAFE_INTEGER", "-9007199254740991"}, {"EPSILON", "2.220446049250313e-16"}};
          for (auto [nm, lit] : kConsts) if (x.text == nm && replaceWith(i, lit, {})) return expr0(i, expected);
        }
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
        bool exemptHere = pendingExempt;
        pendingExempt = false;  // only the property being written is exempt, not the object it is read from
        TypeId ot = expr(x.kids[0]);
        pendingExempt = exemptHere;
        if (bad(ot)) return tError;
        if (ot == tDyn) {  // a property of an `any`; inside the prelude and generated code `any` is the class Dyn
          if (rawDyn() && dynObjOf() != kNone) ot = objType(dynObj);
          else if (!opt && replaceWith(i, "__dynGet(__H0, '" + std::string(x.text) + "')", {{x.kids[0]}})) return expr0(i, expected);
          else { diag(kZUnsupported, i, "'?.' on an `any`"); return tError; }
        }
        if (opt && !hasNull(ot)) a.nodes[i].flags &= ~kFlagOptional;  // on a value that cannot be null `?.` is plain `.`
        if (opt && hasNull(ot)) {
          ot = withoutNull(ot);
          if (ot == kNoType || ty(ot).k == TK::Union || ty(ot).k == TK::Num || ty(ot).k == TK::Bool) { diag(kZUnsupported, i, "'?.' on a value that is not a single object, string, array, Map or Set"); return tError; }
          out.nodeType[x.kids[0]] = ot;  // the receiver as the access sees it: not null
        }
        if (ty(ot).k == TK::Union && !hasNull(ot)) {  // a field every member of a union of objects has, with the same type
          TypeId common = kNoType;
          bool all = true;
          for (TypeId mt : ty(ot).params) {
            const Member* mm = ty(mt).k == TK::Object ? findMember(mt, x.text) : nullptr;
            if (!mm || mm->method || (common != kNoType && common != mm->type)) { all = false; break; }
            common = mm->type;
          }
          if (all && common != kNoType) return common;
        }
        ot = appOrDiag(ot, x.kids[0]);
        if (bad(ot)) return tError;
        if (on.kind == N::This && ctorStmts && !pendingExempt && std::find(ctorPending.begin(), ctorPending.end(), std::string(x.text)) != ctorPending.end())
          diag(kZUninitializedField, i, "'" + std::string(x.text) + "' is read before it is assigned");
        Member scratch;
        const Member* m = findMember(ot, x.text);
        if (!m && primMember(ot, x.text, scratch)) m = &scratch;
        if (!m) { diag(kZNoSuchProperty, i, "'" + std::string(x.text) + "' on '" + name(ot) + "'"); return tError; }
        if (!accessible(*m)) diag(kZNotAccessible, i, "'" + std::string(x.text) + "'");
        TypeId mt = m->getter ? ty(m->type).elem : m->type;
        if ((n(i).flags & kFlagOptional) && calleeNode != i && mt != tVoid) return unionOf({mt, tNull}, true);  // a?.b is b, or undefined
        if (!m->getter && !m->method && ty(mt).k == TK::Union && !pendingExempt) {
          std::uint32_t ps = pathSymFor2(i, mt);
          if (ps != kNone) return currentType(ps);  // narrowed by an earlier test of this property
        }
        return mt;
      }
      case N::Index: {
        TypeId ot = expr(x.kids[0]), it = expr(x.kids[1]);
        if (!rawDyn() && isDyn(ot) && !bad(it)) {
          const char* fn = it == tStr ? "__dynGet" : isNum(it) ? "__dynGetN" : "__dynGetD";
          if (replaceWith(i, std::string(fn) + "(__H0, __H1)", {{x.kids[0]}, {x.kids[1]}})) return expr0(i, expected);
        }
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
        if (ty(ty(ot).elem).k == TK::Union && !pendingExempt) {
          std::uint32_t ps = pathSymFor2(i, ty(ot).elem);
          if (ps != kNone) return currentType(ps);  // `a[i]` tested a moment ago
        }
        return ty(ot).elem;
      }
      default: diag(kZUnsupported, i, "this expression (node kind " + std::to_string(static_cast<int>(x.kind)) + ")"); return tError;
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
  std::pair<std::uint32_t, TypeId> spreadHint{kNone, kNoType};  // the leading literal of a spread array and the element type it should have
  std::set<std::uint32_t> exhaustiveSwitch;  // switches whose cases cover every member of a union of records
  bool terminates(std::uint32_t s) const {
    if (s == kNone) return false;
    const Node& x = n(s);
    switch (x.kind) {
      case N::Return: case N::Throw: return true;
      case N::Try: return (terminates(x.kids[0]) && (x.kids[2] == kNone || terminates(x.kids[2]))) || (x.kids[3] != kNone && terminates(x.kids[3]));
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
        if ((!hasDefault && !exhaustiveSwitch.count(s)) || x.kids.size() < 2) return false;
        const Node& last = n(x.kids.back());
        for (std::size_t j = 1; j < last.kids.size(); ++j) if (terminates(last.kids[j])) return true;
        return false;
      }
      default: return false;
    }
  }

  // `if (x)` on a value that may be null (an object, array, function or string): true when it is there (and not the empty string); written as
  // the comparison it stands for, which the narrowing already understands. Only for names and property paths (they are read twice).
  TypeId truthiness(std::uint32_t e, TypeId t) {
    if (bad(t) || t == tBool || !hasNull(t)) return t;
    TypeId inner = withoutNull(t);
    if (inner == kNoType || bad(inner)) return t;
    TK k = ty(inner).k;
    bool str = inner == tStr;
    if (!pureCallee(e) && !(inner == tBool || k == TK::Num)) return t;
    if (inner == tBool || k == TK::Num) {  // a nullable boolean or number: present and true, or present and not 0 or NaN (a generated test: the operand may be a call)
      std::uint32_t sym = helper("truthy," + std::to_string(t), "function $F(v: " + inspectAliasName(t) + "): boolean {\n  return " + (inner == tBool ? "v === true" : "v !== null && v !== 0 && v === v") + ";\n}\n", {t}, e);
      std::uint32_t orig = static_cast<std::uint32_t>(a.nodes.size());  // the operand moves to a node of its own, the call takes its place
      a.nodes.push_back(a.nodes[e]);
      out.nodeType.push_back(out.nodeType[e]);
      out.nodeSym.push_back(out.nodeSym[e]);
      auto ta = a.targs.find(e);
      if (ta != a.targs.end()) { auto v = ta->second; a.targs.erase(e); a.targs[orig] = std::move(v); }
      std::uint32_t call = callGenerated(sym, {orig}, e);
      a.nodes[e] = a.nodes[call];
      rewritten.insert(e);
      out.nodeType[e] = tBool;
      return tBool;
    }
    if (!(str || k == TK::Object || k == TK::Array || k == TK::Map || k == TK::Set || k == TK::Func)) return t;
    std::vector<std::vector<std::uint32_t>> holes{{cloneNode(e, false)}};  // the node itself is replaced: its copies go into the comparison
    if (str) holes.push_back({cloneNode(e, false)});
    if (!replaceWith(e, str ? "(__H0 !== null && __H1 !== '')" : "(__H0 !== null)", holes)) return t;
    return expr(e);
  }
  TypeId condition(std::uint32_t e) {
    TypeId t = truthiness(e, expr(e));
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

  // The type of a lambda whose parameters and return type are all annotated, else kNoType.
  TypeId annotatedFuncType(std::uint32_t fe) {
    const Node& f = n(fe);
    if (f.kids[0] == kNone || (f.flags & (kFlagAsync | kFlagGenerator))) return kNoType;
    std::vector<TypeId> ps;
    for (std::size_t k = 2; k < f.kids.size(); ++k) {
      const Node& p = n(f.kids[k]);
      if (p.kids[0] == kNone || p.kids[1] != kNone || (p.kids.size() > 2 && p.kids[2] != kNone)) return kNoType;
      TypeId t = annotation(p.kids[0]);
      if (bad(t)) return kNoType;
      ps.push_back(t);
    }
    TypeId ret = annotation(f.kids[0]);
    if (bad(ret)) return kNoType;
    return func(ps, ret, static_cast<std::uint32_t>(ps.size()));
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
    auto fw = forwardVars.find(d);
    auto bindVar = [&](TypeId vt) {  // the symbol of this declarator: the one declared ahead, or a new one
      if (fw != forwardVars.end()) { out.nodeSym[d] = fw->second.sym; out.syms[fw->second.sym].forward = false; out.syms[fw->second.sym].type = vt; }
      else out.nodeSym[d] = declare(SymKind::Var, x.text, vt, d, isConst, d);
      return out.nodeSym[d];
    };
    if (init == kNone && (ann == kNone || isConst)) diag(kZUnsupported, d, "declarations without an initializer");
    if (ann != kNone) {
      t = fw != forwardVars.end() ? fw->second.type : annotation(ann);
      if (init == kNone && !bad(t) && !isConst) {  // `let x: T;`: assigned before it is read (flow analysis is not done): start from the default of T
        TK k = ty(t).k;
        const char* text = t == tBool ? "false" : t == tStr ? "''" : k == TK::Num ? "0" : k == TK::Array ? "[]" : hasNull(t) ? "null" : nullptr;
        if (!text) diag(kZUnsupported, d, "a declaration without an initializer of type '" + name(t) + "'");
        else {
          auto st = snippet(a, std::string(text) + ";", {}, d);
          out.nodeType.resize(a.nodes.size(), kNoType);
          out.nodeSym.resize(a.nodes.size(), kNone);
          if (!st.empty() && n(st[0]).kind == N::ExprStmt) {
            a.nodes[d].kids[1] = n(st[0]).kids[0]; init = a.nodes[d].kids[1];
            if (ty(t).k == TK::Union && ty(t).undef && n(init).kind == N::Literal) a.nodes[init].flags |= kFlagUndefined;  // `let v: T | undefined;` starts undefined
          }
        }
      }
      if (init != kNone && !bad(t) && ty(t).k == TK::Func && n(init).kind == N::FuncExpr) {  // `const f: T = () => { f() }`: the function sees its own name
        out.nodeType[d] = t;
        bindVar(t);
        out.syms[out.nodeSym[d]].reassigned = true;  // its closure is stored after it is created: a captured one lives in a shared cell
        require(expr(init, t), t, init);
        return;
      }
      if (init != kNone && !bad(t) && mentionsInLambda(init, x.text)) {  // `const id: T = f(() => { use(id) })`: the closure runs after the declaration
        out.nodeType[d] = t;
        bindVar(t);
        out.syms[out.nodeSym[d]].reassigned = true;
        require(expr(init, t), t, init);
        return;
      }
      if (init != kNone) require(expr(init, t), t, init);
    } else if (init != kNone) {
      TypeId self = n(init).kind == N::FuncExpr && mentionsIdent(n(init).kids[1], x.text) ? annotatedFuncType(init) : kNoType;
      if (self != kNoType) {  // a fully annotated lambda: its type is known before its body, so the body may use the variable
        out.nodeType[d] = self;
        bindVar(self);
        out.syms[out.nodeSym[d]].reassigned = true;
        expr(init, self);
        return;
      }
      bool selfRef = mentionsInLambda(init, x.text);  // `const id = f(() => { use(id) })`: the lambdas wait until the variable has its type
      std::string_view savedName = selfName;
      std::size_t savedDepth = selfDepth;
      auto savedDeferred = std::move(selfDeferred);
      selfDeferred.clear();
      if (selfRef) { selfName = x.text; selfDepth = fnStack.size(); }
      t = expr(init);
      std::vector<std::pair<std::uint32_t, TypeId>> waiting = std::move(selfDeferred);
      selfName = savedName; selfDepth = savedDepth; selfDeferred = std::move(savedDeferred);
      if (t == tNull || t == tVoid) { diag(kZCannotInfer, d, "'" + std::string(x.text) + "'"); t = tError; }
      out.nodeType[d] = t;
      bindVar(t);
      if (!waiting.empty()) {
        out.syms[out.nodeSym[d]].reassigned = true;
        for (auto& [fe, ex] : waiting) funcExpr(fe, ex);
      }
      return;
    }
    out.nodeType[d] = t;
    bindVar(t);
    if (ann != kNone && init != kNone && ty(t).k == TK::Union) {
      TypeId vt = out.nodeType[init];
      if (vt != kNoType && !bad(vt) && vt != tNull && assignable(vt, t, kNone)) narrowing.push_back({out.nodeSym[d], vt});  // not to null: a later branch may store a value, and the join forgets nothing
    }
  }

  void statement(std::uint32_t s) {
    const Node& x = n(s);
    bool top = atTop;  // a statement directly in the program's top-level list
    atTop = false;
    switch (x.kind) {
      case N::Empty: break;
      case N::Block: push(); stmtList(x.kids); pop(); break;  // what the block learned about outer variables holds after it, as in TypeScript's flow analysis
      case N::VarDecl:
        declAsGlobal = top;
        for (std::uint32_t d : x.kids) {
          varDecl(d, x.text == "const" || x.text == "using");
          if (x.text == "using" && n(d).kids.size() > 1 && out.nodeSym[d] != kNone) {  // the value must know how to dispose itself
            TypeId vt = out.syms[out.nodeSym[d]].type;
            const Member* dm = (!bad(vt) && ty(vt).k == TK::Object) ? lookupMember(ty(vt).obj, "[Symbol.dispose]", false) : nullptr;
            if (!bad(vt) && (!dm || !dm->method || !ty(dm->type).params.empty())) diag(kZNotAssignable, d, "'" + name(vt) + "' has no [Symbol.dispose]() to use with 'using'");
          }
        }
        declAsGlobal = false;
        break;
      case N::Throw: {
        TypeId t = expr(x.kids[0]);
        std::uint32_t eo = errorObj();
        if (eo == kNoObj) { diag(kZCannotFindName, s, "'Error'"); break; }
        if (!bad(t) && (ty(t).k != TK::Object || !isSubclass(ty(t).obj, eo))) diag(kZNotAssignable, x.kids[0], "'" + name(t) + "' to 'Error'");
        break;
      }
      case N::Try: {
        std::size_t mark = narrowing.size();
        markCells(x.kids[0]);
        if (x.kids[2] != kNone && x.kids[3] != kNone) markCells(x.kids[2]);
        statement(x.kids[0]);
        narrowing.resize(mark);
        if (x.kids[2] != kNone) {
          push();
          if (x.kids[1] != kNone) {
            std::uint32_t eo = errorObj();
            TypeId et = eo == kNoObj ? tError : objType(eo);
            if (eo == kNoObj) diag(kZCannotFindName, s, "'Error'");
            out.nodeType[x.kids[1]] = et;
            out.nodeSym[x.kids[1]] = declare(SymKind::Var, n(x.kids[1]).text, et, x.kids[1], false, x.kids[1]);
          }
          statement(x.kids[2]);
          pop();
          narrowing.resize(mark);
        }
        if (x.kids[3] != kNone) { statement(x.kids[3]); narrowing.resize(mark); }
        break;
      }
      case N::ExprStmt: exprStmtOf = x.kids[0]; expr(x.kids[0]); break;
      case N::If: {
        condition(x.kids[0]);
        std::vector<Fact> ft, ff;
        factsOf(x.kids[0], true, ft);
        factsOf(x.kids[0], false, ff);
        std::size_t mark = narrowing.size();
        // what the branches make of the variables the condition is about, joined afterwards (`if (x === null) x = make();`)
        auto typeNow = [&](std::uint32_t sy) { for (std::size_t k = narrowing.size(); k-- > 0;) if (narrowing[k].first == sy) return narrowing[k].second; return out.syms[sy].type; };
        std::vector<std::uint32_t> watched;
        for (const Fact& f : ft) watched.push_back(f.first);
        for (const Fact& f : ff) watched.push_back(f.first);
        std::vector<TypeId> thenEnd, elseEnd;
        pushFacts(ft);
        statement(x.kids[1]);
        for (std::uint32_t sy : watched) thenEnd.push_back(typeNow(sy));
        narrowing.resize(mark);
        pushFacts(ff);
        if (x.kids[2] != kNone) statement(x.kids[2]);
        for (std::uint32_t sy : watched) elseEnd.push_back(typeNow(sy));
        narrowing.resize(mark);
        bool thenExits = exitsAbruptly(x.kids[1]), elseExits = x.kids[2] != kNone && exitsAbruptly(x.kids[2]);
        if (thenExits && !elseExits) pushFacts(ff);       // `if (x === null) return;` leaves x non-null afterwards
        else if (elseExits && !thenExits) pushFacts(ft);
        else if (!thenExits && !elseExits)
          for (std::size_t k = 0; k < watched.size(); ++k) {
            TypeId j = thenEnd[k] == elseEnd[k] ? thenEnd[k] : unionOf({thenEnd[k], elseEnd[k]});
            if (j != out.syms[watched[k]].type && j != kNoType && !bad(j)) narrowing.push_back({watched[k], j});
          }
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
        if (!rawDyn() && isDyn(it) && replaceWith(x.kids[1], "__dynIter(__H0)", {{cloneNode(x.kids[1], false)}})) it = expr0(x.kids[1], kNoType);  // iterate the elements of an array held by a Dyn
        if (!bad(it) && (ty(it).k == TK::Map || ty(it).k == TK::Set || ty(it).k == TK::Str)) {  // iterate a generated array of the entries, values or characters
          const Type itt = ty(it);
          TypeId arr = itt.k == TK::Map ? arrayOf(tupleOf({itt.params[0], itt.elem})) : itt.k == TK::Set ? arrayOf(itt.elem) : arrayOf(tStr);
          std::string text = "function $F(m: " + inspectAliasName(it) + "): " + inspectAliasName(arr) + " {\n";
          if (itt.k == TK::Map) text += "  const ks = m.keys();\n  const vs = m.values();\n  const r: " + inspectAliasName(arr) + " = [];\n  for (let i: i32 = 0; i < ks.length; i++) r.push([ks[i], vs[i]]);\n  return r;\n";
          else text += itt.k == TK::Set ? "  return m.values();\n" : "  return m.split('');\n";
          text += "}\n";
          std::uint32_t call = callGenerated(helper("iter" + std::to_string(it), text, {it, arr}, s), {x.kids[1]}, s);
          a.nodes[s].kids[1] = call;
          it = out.nodeType[call];
        }
        if (!bad(it) && ty(it).k == TK::Object && name(it).rfind("Generator<", 0) != 0 && lookupMember(ty(it).obj, "[Symbol.iterator]", false)) {  // an object with [Symbol.iterator](): iterate what it returns
          std::uint32_t mem = newNode(N::Member, "[Symbol.iterator]", {x.kids[1]}, s);
          std::uint32_t call = newNode(N::Call, {}, {mem}, s);
          a.nodes[s].kids[1] = call;
          it = expr(call);
        }
        if (!bad(it) && ty(it).k == TK::Object && name(it).rfind("Generator<", 0) == 0) {  // pull values lazily: while (g.next()) { const x = g.value[0]; ... }
          std::string g = "__g" + std::to_string(s);
          const Node& d0 = n(x.kids[0]);
          auto r = snippet(a, "{ const " + g + " = __H0; while (" + g + ".step()) { " + std::string(x.text) + " " + std::string(d0.text) + " = " + g + ".value[0]; __H1; } " + g + ".close(); }", {{x.kids[1]}, {x.kids[2]}}, s);
          out.nodeType.resize(a.nodes.size(), kNoType);
          out.nodeSym.resize(a.nodes.size(), kNone);
          if (r.empty()) break;
          a.nodes[s].kind = N::Block;
          a.nodes[s].kids = n(r[0]).kids;
          statement(s);
          break;
        }
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
          if (inferredRet == kNoType) inferredRet = rt;
          else if (!bad(rt) && !bad(inferredRet) && !assignable(rt, inferredRet, x.kids[0]) && (rt == tNull || inferredRet == tNull || (ty(rt).k == TK::Object && ty(inferredRet).k == TK::Object) || ty(inferredRet).k == TK::Union)) inferredRet = unionOf({inferredRet, rt});  // null and an object, or several objects: their union
          else require(rt, inferredRet, x.kids[0]);
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
        // switch (s.kind) over a union of records with literal `kind`s: each case sees the members it selects
        std::uint32_t discSym = kNone;
        std::string_view discField;
        if (n(x.kids[0]).kind == N::Member && n(n(x.kids[0]).kids[0]).kind == N::Ident && out.nodeSym[n(x.kids[0]).kids[0]] != kNone && trackable(out.nodeSym[n(x.kids[0]).kids[0]])) {
          discSym = out.nodeSym[n(x.kids[0]).kids[0]];
          discField = n(x.kids[0]).text;
        }
        TypeId discCur = discSym != kNone ? currentType(discSym) : kNoType;
        std::vector<std::string> pendingLits, allLits;
        auto membersFor = [&](const std::vector<std::string>& lits) {
          std::vector<TypeId> ms;
          for (const std::string& lit : lits) { TypeId nt = narrowByLiteral(discCur, discField, lit, true); if (nt != kNoType) for (TypeId m : unionMembers(nt)) if (std::find(ms.begin(), ms.end(), m) == ms.end()) ms.push_back(m); }
          return ms;
        };
        bool discUnion = discCur != kNoType && ty(discCur).k == TK::Union;
        for (std::size_t k = 1; k < x.kids.size(); ++k) {
          const Node& cl = n(x.kids[k]);
          if (cl.kids[0] == kNone) { if (seenDefault) diag(kZDuplicateDeclaration, x.kids[k], "'default' clause"); seenDefault = true; }
          else {
            TypeId tt = appOrDiag(expr(cl.kids[0], dt), cl.kids[0]);
            if (!bad(tt) && !bad(dt) && !comparable(dt, tt)) diag(kZBadOperand, cl.kids[0], "case of '" + name(tt) + "' in a switch on '" + name(dt) + "'");
            if (n(cl.kids[0]).kind == N::String) { std::string lit(n(cl.kids[0]).text.substr(1, n(cl.kids[0]).text.size() - 2)); pendingLits.push_back(lit); allLits.push_back(lit); }
          }
          std::vector<std::uint32_t> body(cl.kids.begin() + 1, cl.kids.end());
          std::size_t cm = narrowing.size();
          if (discUnion && !body.empty()) {
            std::vector<TypeId> ms;
            if (cl.kids[0] == kNone) { std::vector<TypeId> covered = membersFor(allLits); for (TypeId m : unionMembers(discCur)) if (std::find(covered.begin(), covered.end(), m) == covered.end()) ms.push_back(m); }
            else ms = membersFor(pendingLits);
            if (!ms.empty() && ms.size() < unionMembers(discCur).size()) narrowing.push_back({discSym, unionOf(ms)});
          }
          stmtList(body);
          narrowing.resize(cm);
          if (!body.empty()) pendingLits.clear();
        }
        if (discUnion && !seenDefault && membersFor(allLits).size() == unionMembers(discCur).size()) exhaustiveSwitch.insert(s);
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
      else if (hasValueReturn(a, f.kids[1])) { if (inferReturns) sigNeedsInfer = true; else { diag(kZCannotInfer, f.kids[1], "return type of '" + std::string(f.text) + "'"); ret = tError; } }
    }
    return func(std::move(ps), ret, minArgs);
  }
  // Functions without a return annotation: the type comes from their returns, found by checking the body when the type is first needed
  // (a call, a reference) or at the end of the list; a function that needs its own type to find its type must be annotated.
  bool inferReturns = false, sigNeedsInfer = false;
  std::set<std::uint32_t> inferring;
  // The result of the inference for symbol s (kNoType when it was not pending); tError when the function needs itself.
  TypeId resolvePending(std::uint32_t s) {
    auto it = pendingFns.find(s);
    if (it == pendingFns.end()) return kNoType;
    PendingFn pf = std::move(it->second);
    pendingFns.erase(it);
    inferring.insert(s);
    Ctx saved = saveCtx();
    restoreCtx(pf.ctx);
    TypeId savedInferred = inferredRet;
    inferredRet = kNoType;
    TypeId sigNow = out.syms[s].type;
    checkBody(pf.node, sigNow, pf.params, false, true);
    TypeId ret = inferredRet != kNoType ? inferredRet : tVoid;
    inferredRet = savedInferred;
    restoreCtx(saved);
    inferring.erase(s);
    if (ret == tNull) ret = tError;
    TypeId sig = func(pf.paramTypes, ret, pf.minArgs);
    out.syms[s].type = sig;
    out.nodeType[pf.node] = sig;
    return sig;
  }

  void checkBody(std::uint32_t fn, TypeId sig, const std::vector<std::uint32_t>& params, bool isCtor, bool infer = false) {
    const Node& f = n(fn);
    if (f.kids[1] == kNone) return;
    Type ft = ty(sig);
    fnStack.push_back(fn);
    auto savedNarrowing = std::move(narrowing);
    narrowing.clear();
    TypeId savedRet = curRet; int savedLoops = loops; bool savedImmediate = immediate;
    curRet = isCtor ? tVoid : infer ? kInferRet : ft.elem; loops = 0; immediate = false;
    push();
    for (std::size_t k = 0; k < params.size(); ++k) {
      const Node& p = n(params[k]);
      if (p.kids[1] != kNone) require(expr(p.kids[1], ft.params[k]), ft.params[k], p.kids[1]);
      if (p.kids.size() > 2 && p.kids[2] != kNone) bindPattern(p.kids[2], ft.params[k], true, false);
      else out.nodeSym[params[k]] = declare(SymKind::Param, p.text, ft.params[k], params[k], false, params[k]);
    }
    stmtList(n(f.kids[1]).kids);
    pop();
    if (!isCtor && !infer && curRet != tVoid && !bad(curRet) && ty(curRet).k != TK::Any && !terminates(f.kids[1])) diag(kZMissingReturn, fn, "'" + std::string(f.text) + "'");
    curRet = savedRet; loops = savedLoops; immediate = savedImmediate;
    narrowing = std::move(savedNarrowing);
    fnStack.pop_back();
  }

  // ---- unions: members flattened, deduplicated and sorted so equal unions share one type id
  // `undef`: the absent value of this union is `undefined` (an optional field, a Map.get, a `T | undefined` annotation). It is the same representation as
  // null, only printed differently; a union that mixes a plain null in is a null one.
  TypeId unionOf(std::vector<TypeId> ms, bool undef = false) {
    std::vector<TypeId> flat;
    bool anyUndef = undef, plainNull = false;
    for (TypeId m : ms) {
      if (bad(m)) return tError;
      if (ty(m).k == TK::Union) { anyUndef = anyUndef || ty(m).undef; for (TypeId k : ty(m).params) flat.push_back(k); }
      else { if (m == tNull) plainNull = true; flat.push_back(m); }
    }
    std::sort(flat.begin(), flat.end());
    flat.erase(std::unique(flat.begin(), flat.end()), flat.end());
    if (flat.size() == 1) return flat[0];
    Type t; t.k = TK::Union; t.params = std::move(flat);
    t.undef = anyUndef && !(plainNull && !undef) && std::find(t.params.begin(), t.params.end(), tNull) != t.params.end();
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
  // Narrowing of property paths (`this.head`, `n.next.next`, `a[i]`): a path of locals, `this`, fields and constant or local indexes gets a
  // symbol of its own, so the facts of a test of it are kept like those of a variable. A write to a local, a field or an element, and a
  // call of a method on a path, forget what was known below it (the rule: only the object whose method runs, or a path through it, may change).
  std::map<std::string, std::uint32_t> pathSyms;
  std::map<std::string, std::vector<std::uint32_t>> pathRoots;  // the locals a path depends on (its base and the locals that index it)
  std::uint32_t identSym(std::uint32_t id) const { return out.nodeSym[id] != kNone ? out.nodeSym[id] : lookup(n(id).text); }
  // The key of a path node, or "" when it is not one. `roots` collects the locals the path depends on.
  std::string pathKey(std::uint32_t node, std::vector<std::uint32_t>* roots = nullptr) const {
    const Node& x = n(node);
    if (x.kind == N::This) return "this";
    if (x.kind == N::Ident) {
      std::uint32_t sy = identSym(node);
      if (sy == kNone || !trackable(sy)) return "";
      if (roots) roots->push_back(sy);
      return "#" + std::to_string(sy);
    }
    if (x.kind == N::Member && !(x.flags & kFlagOptional)) {
      std::string b = pathKey(x.kids[0], roots);
      return b.empty() ? "" : b + "." + std::string(x.text);
    }
    if (x.kind == N::Index) {
      std::string b = pathKey(x.kids[0], roots);
      if (b.empty()) return "";
      const Node& ix = n(x.kids[1]);
      if (ix.kind == N::Number) return b + "[" + std::string(ix.text) + "]";
      if (ix.kind == N::Ident) { std::string k = pathKey(x.kids[1], roots); return k.empty() ? "" : b + "[" + k + "]"; }
    }
    return "";
  }
  std::uint32_t pathSymFor(const std::string& key, const std::vector<std::uint32_t>& roots, TypeId declared) {
    auto it = pathSyms.find(key);
    if (it != pathSyms.end()) return it->second;
    out.syms.push_back({SymKind::Var, keep(key), declared, kNone, false});
    pathRoots[key] = roots;
    return pathSyms[key] = static_cast<std::uint32_t>(out.syms.size() - 1);
  }
  // The symbol standing for the node, if it is a path some test or write has met before.
  std::uint32_t pathSymOf(std::uint32_t node) const {
    if (n(node).kind != N::Member && n(node).kind != N::Index) return kNone;
    std::string k = pathKey(node);
    auto it = k.empty() ? pathSyms.end() : pathSyms.find(k);
    return it == pathSyms.end() ? kNone : it->second;
  }
  std::uint32_t pathSymFor2(std::uint32_t node, TypeId declared) {  // the symbol of a path node, created if need be
    std::vector<std::uint32_t> roots;
    std::string k = pathKey(node, &roots);
    return k.empty() ? kNone : pathSymFor(k, roots, declared);
  }
  void forgetPaths(const std::function<bool(const std::string&, const std::vector<std::uint32_t>&)>& pick) {
    for (auto& [k, sy] : pathSyms) if (pick(k, pathRoots[k])) narrowing.push_back({sy, out.syms[sy].type});
  }
  void resetPaths(std::uint32_t base) {  // the local was assigned: what was known about the paths that use it is gone
    forgetPaths([&](const std::string&, const std::vector<std::uint32_t>& roots) { return std::find(roots.begin(), roots.end(), base) != roots.end(); });
  }
  void resetBelow(const std::string& key) {  // a write or call on `key`: its fields and elements may have changed
    if (key.empty()) return;
    forgetPaths([&](const std::string& k, const std::vector<std::uint32_t>&) { return k.size() > key.size() && k.compare(0, key.size(), key) == 0 && (k[key.size()] == '.' || k[key.size()] == '['); });
  }
  bool trackable(std::uint32_t sym) const { return out.syms[sym].kind == SymKind::Var || out.syms[sym].kind == SymKind::Param; }
  TypeId currentType(std::uint32_t sym, const std::vector<Fact>* extra = nullptr) const {
    if (extra) for (auto it = extra->rbegin(); it != extra->rend(); ++it) if (it->first == sym) return it->second;
    for (auto it = narrowing.rbegin(); it != narrowing.rend(); ++it) if (it->first == sym) return it->second;
    return out.syms[sym].type;
  }
  void pushFacts(const std::vector<Fact>& fs) { for (const Fact& f : fs) narrowing.push_back(f); }
  // What a successful (truthy) or failed instanceof test leaves of `cur` for class type C.
  TypeId narrowByInstanceOf(TypeId cur, TypeId cls, bool truthy) {
    if (isDyn(cur)) return truthy ? cls : kNoType;  // a Dyn that is an instance of the class is that class
    std::vector<TypeId> keep;
    for (TypeId m : unionMembers(cur)) {
      if (m == tNull || ty(m).k != TK::Object) { if (!truthy) keep.push_back(m); continue; }
      bool sub = objAssignable(ty(m).obj, ty(cls).obj), sup = objAssignable(ty(cls).obj, ty(m).obj);
      if (truthy) { if (sub) keep.push_back(m); else if (sup) keep.push_back(cls); }
      else if (!sub) keep.push_back(m);
    }
    return keep.empty() ? kNoType : unionOf(keep);
  }
  // The members of the union `cur` of records whose property `field` is (keepEqual) or is not the literal `lit`.
  TypeId narrowByLiteral(TypeId cur, std::string_view field, const std::string& lit, bool keepEqual) {
    if (ty(cur).k != TK::Union) return kNoType;
    std::vector<TypeId> keep;
    for (TypeId m : ty(cur).params) {
      const Member* mm = ty(m).k == TK::Object ? findMember(m, std::string(field)) : nullptr;
      if (!mm || !mm->hasLiteral) { keep.push_back(m); continue; }
      if ((mm->literal == lit) == keepEqual) keep.push_back(m);
    }
    return keep.empty() ? kNoType : unionOf(keep);
  }
  void factsOf(std::uint32_t cond, bool truthy, std::vector<Fact>& fs) {
    const Node& c = n(cond);
    if (c.kind == N::Unary && c.text == "!") { factsOf(c.kids[0], !truthy, fs); return; }
    if (c.kind == N::Call && c.kids.size() == 3 && n(c.kids[0]).kind == N::Ident && n(c.kids[0]).text == "__dynIsTag" && n(c.kids[1]).kind == N::Ident && n(c.kids[2]).kind == N::Number) {  // x instanceof C on a Dyn
      std::uint32_t sy = out.nodeSym[c.kids[1]];
      if (sy != kNone && trackable(sy) && truthy && isDyn(currentType(sy, &fs))) fs.push_back({sy, static_cast<TypeId>(std::stoul(std::string(n(c.kids[2]).text)))});
      return;
    }
    if (c.kind != N::Binary) return;
    if (c.text == "&&") { if (truthy) { factsOf(c.kids[0], true, fs); factsOf(c.kids[1], true, fs); } return; }
    if (c.text == "||") { if (!truthy) { factsOf(c.kids[0], false, fs); factsOf(c.kids[1], false, fs); } return; }
    bool eq = c.text == "==" || c.text == "===", ne = c.text == "!=" || c.text == "!==";
    if (eq || ne) {
      // typeof x === 'number' (the typeof of a Dyn has become a call of __dynTypeof)
      auto isTypeofOf = [&](std::uint32_t k) { return n(k).kind == N::Call && n(n(k).kids[0]).kind == N::Ident && n(n(k).kids[0]).text == "__dynTypeof" && n(n(k).kids[1]).kind == N::Ident; };
      if ((isTypeofOf(c.kids[0]) && n(c.kids[1]).kind == N::String) || (isTypeofOf(c.kids[1]) && n(c.kids[0]).kind == N::String)) {
        std::uint32_t tu = isTypeofOf(c.kids[0]) ? c.kids[0] : c.kids[1], ls = tu == c.kids[0] ? c.kids[1] : c.kids[0];
        std::uint32_t sy = out.nodeSym[n(tu).kids[1]];
        std::string_view lit = n(ls).text;
        lit = lit.substr(1, lit.size() - 2);
        if (sy != kNone && trackable(sy) && isDyn(currentType(sy, &fs)) && eq == truthy) {
          TypeId nt = lit == "number" ? num(Num::f64) : lit == "string" ? tStr : lit == "boolean" ? tBool : kNoType;
          if (nt != kNoType) fs.push_back({sy, nt});
        }
        return;
      }
      std::uint32_t dm = n(c.kids[0]).kind == N::Member && n(c.kids[1]).kind == N::String ? c.kids[0] : n(c.kids[1]).kind == N::Member && n(c.kids[0]).kind == N::String ? c.kids[1] : kNone;
      if (dm != kNone) {  // s.kind === 'circle': the members of the union s has whose `kind` is (or is not) 'circle'
        std::uint32_t sn = n(dm).kids[0], ln = dm == c.kids[0] ? c.kids[1] : c.kids[0];
        if (n(sn).kind == N::Ident && out.nodeSym[sn] != kNone && trackable(out.nodeSym[sn])) {
          std::uint32_t sy = out.nodeSym[sn];
          TypeId cur = currentType(sy, &fs);
          TypeId nt = narrowByLiteral(cur, n(dm).text, std::string(n(ln).text.substr(1, n(ln).text.size() - 2)), eq == truthy);
          if (nt != kNoType && nt != cur) fs.push_back({sy, nt});
        }
        return;
      }
      auto isNullLit = [&](std::uint32_t k) { return n(k).kind == N::Literal && n(k).text == "null"; };
      auto testable = [&](std::uint32_t k) { return n(k).kind == N::Ident || (n(k).kind == N::Member && pathSymOf(k) != kNone); };
      std::uint32_t idn = isNullLit(c.kids[1]) && testable(c.kids[0]) ? c.kids[0] : isNullLit(c.kids[0]) && testable(c.kids[1]) ? c.kids[1] : kNone;
      if (idn == kNone) return;
      std::uint32_t sy = n(idn).kind == N::Member ? pathSymOf(idn) : out.nodeSym[idn];
      if (sy == kNone || !trackable(sy)) return;
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
  // A handler sees the variables as they were when its try began, so locals that code in a try (or a using scope) assigns live in
  // cells: the handler reads the cell, whichever call threw.
  void markCells(std::uint32_t node) {
    std::vector<std::string_view> names;
    collectAssigned(node, names);
    for (std::string_view nm : names) {
      std::uint32_t sy = lookup(nm);
      if (sy != kNone && trackable(sy) && !out.syms[sy].isGlobal) { out.syms[sy].captured = true; out.syms[sy].reassigned = true; }
    }
  }
  bool exitsAbruptly(std::uint32_t st) const {
    if (st == kNone) return false;
    const Node& x = n(st);
    switch (x.kind) {
      case N::Return: case N::Break: case N::Continue: case N::Throw: return true;
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
      if (sy != kNone && trackable(sy)) resetPaths(sy);
    }
    std::vector<std::string> keys;
    collectAssignedPaths(loopNode, keys);
    for (const std::string& key : keys) {  // a path written in the loop, and what hangs below it, is not what it was before the loop
      auto it = pathSyms.find(key);
      if (it != pathSyms.end()) narrowing.push_back({it->second, out.syms[it->second].type});
      resetBelow(key);
    }
    std::vector<std::string> called;
    collectCalledPaths(loopNode, called);
    for (const std::string& key : called) resetBelow(key);
  }
  void collectAssignedPaths(std::uint32_t i, std::vector<std::string>& v) const {
    if (i == kNone) return;
    const Node& x = n(i);
    if ((x.kind == N::Assign || x.kind == N::UpdatePre || x.kind == N::UpdatePost) && (n(x.kids[0]).kind == N::Member || n(x.kids[0]).kind == N::Index)) { std::string k = pathKey(x.kids[0]); if (!k.empty()) v.push_back(k); }
    for (std::uint32_t k : x.kids) collectAssignedPaths(k, v);
  }
  void collectCalledPaths(std::uint32_t i, std::vector<std::string>& v) const {  // `p.m(...)` in a loop: what hangs below p may change
    if (i == kNone) return;
    const Node& x = n(i);
    if (x.kind == N::Call && !x.kids.empty() && n(x.kids[0]).kind == N::Member) { std::string k = pathKey(n(x.kids[0]).kids[0]); if (!k.empty()) v.push_back(k); }
    for (std::uint32_t k : x.kids) collectCalledPaths(k, v);
  }

  // ---- lambdas: checked where they appear, so they see the variables around them
  // Whether a function declaration sits inside the body of another function, method or lambda (found from the tree, not from what is being checked).
  std::set<std::uint32_t> nestedFuncs;
  bool nestedBuilt = false;
  void markNested(std::uint32_t node, bool inside) {
    if (node == kNone) return;
    const Node& x = n(node);
    if (x.kind == N::Function && inside) nestedFuncs.insert(node);
    bool in = inside || x.kind == N::Function || x.kind == N::Method || x.kind == N::FuncExpr;
    for (std::uint32_t k : x.kids) markNested(k, in);
  }
  bool isNestedFunction(std::uint32_t node) {
    if (!nestedBuilt) { nestedBuilt = true; markNested(a.root, false); for (std::uint32_t pre : a.prelude) markNested(pre, false); }
    return nestedFuncs.count(node) != 0;
  }
  bool padCallbacks = true;  // a function with fewer parameters than the function type it is given to gets unused ones; off for the arguments of the library's array methods, which keep their arity
  TypeId funcExpr(std::uint32_t i, TypeId expected) {
    Type et;
    if (expected != kNoType && ty(expected).k == TK::Union) {  // `(() => void) | null` (an optional callback): the function type is what the lambda is checked against
      TypeId only = kNoType;
      for (TypeId m : ty(expected).params) { if (m == tNull) continue; if (only != kNoType || ty(m).k != TK::Func) { only = kNoType; break; } only = m; }
      if (only != kNoType) expected = only;
    }
    bool haveExpected = expected != kNoType && ty(expected).k == TK::Func;
    if (haveExpected) et = ty(expected);
    // Defaults on lambda parameters: the parameter takes `T | null` (an argument left out is null) and the body starts by replacing null with the default
    std::size_t lambdaMin = static_cast<std::size_t>(-1);
    {
      std::vector<std::uint32_t> prologue;
      std::size_t required = 0;
      for (std::size_t k = 2; k < n(i).kids.size(); ++k) {
        std::uint32_t p = n(i).kids[k];
        std::uint32_t d = n(p).kids[1];
        if (d == kNone) { required = k - 1; continue; }
        bool nullDefault = n(d).kind == N::Literal && n(d).text == "null";  // `x?: T`: the parser already made it `T | null`
        if (!nullDefault) {
          std::uint32_t ann = n(p).kids[0];
          if (ann == kNone) { diag(kZCannotInfer, p, "parameter '" + std::string(n(p).text) + "' of a function expression"); continue; }
          std::uint32_t nul = newNode(N::TypeRef, "null", {}, p);
          a.nodes[p].kids[0] = newNode(N::TypeUnion, {}, {ann, nul}, p);
          std::string nm(n(p).text);
          std::vector<std::uint32_t> st = snippet(a, "if (" + nm + " === null) { " + nm + " = __H0; }", {{d}}, p);
          out.nodeType.resize(a.nodes.size(), kNoType);
          out.nodeSym.resize(a.nodes.size(), kNone);
          if (!st.empty()) prologue.push_back(st[0]);
        }
        a.nodes[p].kids[1] = kNone;
      }
      if (required < n(i).kids.size() - 2) lambdaMin = required;  // some parameter is optional (padding for callbacks comes after it and stays required)
      else lambdaMin = static_cast<std::size_t>(-1);
      if (!prologue.empty()) {
        auto& body = a.nodes[n(i).kids[1]].kids;
        body.insert(body.begin(), prologue.begin(), prologue.end());
      }
    }
    // `() => expr` where a function returning nothing is expected: the value is dropped, as in TypeScript
    if (haveExpected && et.elem == tVoid && n(i).kids[0] == kNone && n(n(i).kids[1]).kids.size() == 1 && n(n(n(i).kids[1]).kids[0]).kind == N::Return && !n(n(n(i).kids[1]).kids[0]).kids.empty() && n(n(n(i).kids[1]).kids[0]).kids[0] != kNone)
      a.nodes[n(n(i).kids[1]).kids[0]].kind = N::ExprStmt;
    // JavaScript callbacks may take fewer parameters than they are called with (`items.map(x => ...)` for `(x, i) => ...`):
    // the missing ones are added unused, so the function has the expected type.
    if (haveExpected && padCallbacks) {
      for (std::size_t k = n(i).kids.size() - 2; k < et.params.size(); ++k) {
        std::vector<std::uint32_t> st = snippet(a, "(__unused" + std::to_string(k) + ") => 0;", {}, i);
        out.nodeType.resize(a.nodes.size(), kNoType);
        out.nodeSym.resize(a.nodes.size(), kNone);
        if (st.empty()) break;
        std::uint32_t extra = n(n(st[0]).kids[0]).kids[2];
        a.nodes[i].kids.push_back(extra);
      }
    }
    const Node& x = n(i);
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
    if (!selfName.empty() && fnStack.size() == selfDepth && ret != kNoType && mentionsInLambda(i, selfName, true)) {  // the body uses the variable being declared: check it once the variable exists
      selfDeferred.push_back({i, expected});
      curRet = savedRet; inferredRet = savedInferred; loops = savedLoops; immediate = savedImmediate;
      narrowing = std::move(savedNarrowing);
      TypeId ft = func(ps, ret, static_cast<std::uint32_t>(np));
      out.nodeType[i] = ft;
      return ft;
    }
    bool named = !x.text.empty() && !(x.flags & kFlagArrow) && ret != kNoType && mentionsIdent(x.kids[1], x.text);
    if (named) {  // a named function expression: its name is a variable of the enclosing scope holding its own closure (a shared cell)
      push();
      std::uint32_t sy = declare(SymKind::Var, x.text, func(ps, ret, static_cast<std::uint32_t>(np)), i, true, i);
      out.syms[sy].reassigned = true;
      out.syms[sy].isGlobal = false;  // declared while a top-level declaration is checked: still a captured variable, not a global
      out.selfSym[i] = sy;
    }
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
    if (named) pop();
    if (ret == kNoType) ret = inferredRet != kNoType ? inferredRet : tVoid;
    if (ret != tVoid && !bad(ret) && ty(ret).k != TK::Any && !terminates(x.kids[1])) diag(kZMissingReturn, i, "function expression");
    curRet = savedRet; inferredRet = savedInferred; loops = savedLoops; immediate = savedImmediate;
    narrowing = std::move(savedNarrowing);
    TypeId ft = func(ps, ret, static_cast<std::uint32_t>(std::min(np, lambdaMin)));
    out.nodeType[i] = ft;
    return ft;
  }

  // An interface made only of data properties is a record: values of it come from object literals.
  // `interface Q extends P { z: T }` is a record too when every P is one (found by name in the list `peers`).
  bool isRecordDecl(std::uint32_t iface, const std::vector<std::uint32_t>* peers = nullptr, int depth = 0) const {
    const Node& c = n(iface);
    if (c.kids.size() < 2 || a.tparams.count(iface) || depth > 16) return false;
    if (c.kids[0] != kNone) {
      if (!peers) return false;
      for (std::uint32_t r : n(c.kids[0]).kids) {
        if (n(r).kind != N::TypeRef || !n(r).kids.empty()) return false;
        bool found = false;
        for (std::uint32_t p : *peers) if (n(p).kind == N::Interface && n(p).text == n(r).text && p != iface) { found = isRecordDecl(p, peers, depth + 1); break; }
        if (!found) return false;
      }
    }
    for (std::size_t k = 1; k < c.kids.size(); ++k) if (n(c.kids[k]).kind != N::Field) return false;
    return true;
  }
  // ---- anonymous records: one class per distinct list of (name, type)
  std::map<std::pair<std::vector<std::pair<std::string, TypeId>>, std::vector<std::string>>, std::uint32_t> recordObjs;
  TypeId recordOf(const std::vector<std::pair<std::string, TypeId>>& shape, const std::vector<std::string>& lits = {}) {
    auto rkey = std::make_pair(shape, lits);
    auto it = recordObjs.find(rkey);
    if (it != recordObjs.end()) return objType(it->second);
    ObjInfo info;
    info.isClass = true; info.isRecord = true;
    info.name = "{";
    bool tmpl = false;
    auto oi = static_cast<std::uint32_t>(out.objs.size());
    for (std::size_t i = 0; i < shape.size(); ++i) {
      bool opt = i < lits.size() && lits[i] == "\x01";  // an optional member (`b?: B`): marked in the literal slot
      bool lit = i < lits.size() && !lits[i].empty() && !opt;
      info.name += (i ? "; " : " ") + shape[i].first + (opt ? "?" : "") + ": " + (lit ? "'" + lits[i] + "'" : name(shape[i].second));
      tmpl = tmpl || hasParam(shape[i].second);
      Member m; m.name = shape[i].first; m.type = shape[i].second; m.owner = oi;
      if (lit) { m.literal = lits[i]; m.hasLiteral = true; }
      m.optional = opt;
      info.members.push_back(std::move(m));
    }
    info.name += shape.empty() ? "}" : " }";
    info.isTemplate = tmpl;
    out.objs.push_back(std::move(info));
    recordObjs[rkey] = oi;
    return objType(oi);
  }
  // `{ a: 1, b }`: checked against the record it is expected to be, else its own anonymous record
  // The instance fields of an object type, inherited first.
  void instanceFields(std::uint32_t obj, std::vector<Member>& outFields) {
    if (out.objs[obj].parent != kNoObj) instanceFields(out.objs[obj].parent, outFields);
    for (const Member& m : out.objs[obj].members) if (!m.method && !m.isStatic) outFields.push_back(m);
  }
  // ---- Dyn property access: `d.name`, `d[k]` read and write through the helpers of the prelude
  // If `tg` is a property or index of a Dyn, the pieces of its access: the object, and how the key is spelled (a quoted name, or a key expression).
  bool dynAccess(std::uint32_t tg, std::uint32_t& obj, std::uint32_t& key, std::string& suffix) {
    if (rawDyn() || (n(tg).kind != N::Member && n(tg).kind != N::Index)) return false;
    obj = n(tg).kids[0];
    if (n(tg).kind == N::Member && (n(tg).flags & kFlagOptional)) return false;
    if (n(obj).kind == N::Ident) { std::uint32_t sy = lookup(n(obj).text); if (sy == kNone || !trackable(sy)) return false; }  // Class.field, Enum.Member, Math.PI are not Dyn accesses
    TypeId ot = expr(obj);
    if (!isDyn(ot)) return false;
    key = kNone;
    suffix = "";
    if (n(tg).kind == N::Member) return true;
    key = n(tg).kids[1];
    TypeId kt = expr(key);
    suffix = kt == tStr ? "" : isNum(kt) ? "N" : "D";  // __dynGet / __dynGetN / __dynGetD
    return true;
  }
  // d.name = v, d[k] += v, d.n++: a call of __dynSet(o, key, ...). `op` is "" for a plain store, else the binary operator; `valueNode` kNone means 1 (++/--).
  bool rewriteDynStore(std::uint32_t i, std::uint32_t tg, const std::string& op, std::uint32_t valueNode, bool decrement) {
    std::uint32_t obj, key;
    std::string suffix;
    if (!dynAccess(tg, obj, key, suffix)) return false;
    std::vector<std::vector<std::uint32_t>> holes;
    auto hole = [&](std::uint32_t nd) { holes.push_back({nd}); return "__H" + std::to_string(holes.size() - 1); };
    std::string o = hole(obj);
    std::string k = key == kNone ? "'" + std::string(n(tg).text) + "'" : hole(key);
    std::string v;
    if (op.empty()) v = hole(valueNode);
    else {
      std::string o2 = hole(cloneNode(obj, false));
      std::string k2 = key == kNone ? k : hole(cloneNode(key, false));
      std::string cur = "__dynGet" + suffix + "(" + o2 + ", " + k2 + ")";
      static const std::pair<const char*, const char*> kOps[] = {{"+", "__dynAdd"}, {"-", "__dynSub"}, {"*", "__dynMul"}, {"/", "__dynDiv"}, {"%", "__dynMod"}, {"**", "__dynPow"}};
      const char* fn = nullptr;
      for (auto [b, f] : kOps) if (op == b) fn = f;
      if (!fn) { diag(kZUnsupported, i, "operator '" + op + "=' on a Dyn property"); return true; }
      v = std::string(fn) + "(" + cur + ", " + (valueNode == kNone ? "1" : hole(valueNode)) + ")";
    }
    (void)decrement;
    return replaceWith(i, "__dynSet" + suffix + "(" + o + ", " + k + ", " + v + ")", holes);
  }

  // `{ ...a, x: 1 }`: the spread becomes one property per field of `a` (read from the same expression), later entries replacing earlier ones.
  void expandSpreads(std::uint32_t i) {
    std::vector<std::pair<std::string_view, std::uint32_t>> entries;
    auto put = [&](std::string_view nm, std::uint32_t v) {
      for (auto& e : entries) if (e.first == nm) { e.second = v; return; }
      entries.push_back({nm, v});
    };
    for (std::uint32_t p : std::vector<std::uint32_t>(n(i).kids)) {
      if (n(p).kind != N::Spread) { put(n(p).text, n(p).kids[0]); continue; }
      std::uint32_t sn = n(p).kids[0];
      TypeId st = expr(sn);
      if (bad(st)) continue;
      if (ty(st).k != TK::Object || out.objs[ty(st).obj].isTuple) { diag(kZUnsupported, p, "spread of '" + name(st) + "' in an object literal"); continue; }
      ensureBuilt(ty(st).obj);
      std::vector<Member> fs;
      instanceFields(ty(st).obj, fs);
      for (const Member& f : fs) put(keep(f.name), newNode(N::Member, keep(f.name), {sn}, p));
    }
    std::vector<std::uint32_t> props;
    for (auto& e : entries) props.push_back(newNode(N::Prop, e.first, {e.second}, i));
    a.nodes[i].kids = props;
  }

  TypeId objectLit(std::uint32_t i, const Node& x, TypeId expected) {
    bool computed = false;
    for (std::uint32_t p : x.kids) computed = computed || (n(p).kind == N::Prop && n(p).kids.size() > 1);
    if (!rawDyn() && isDyn(expected)) { bool simple = true; for (std::uint32_t p : x.kids) simple = simple && n(p).kind == N::Prop; computed = computed || simple; }  // an object literal where an any is expected is a dynamic object
    if (computed) {  // { a: 1, [k]: v }: an object whose keys are known when it runs: a Dyn
      std::vector<std::vector<std::uint32_t>> holes{{}, {}};
      std::string keys = "[", vals = "[";
      for (std::uint32_t p : std::vector<std::uint32_t>(x.kids)) {
        if (n(p).kind != N::Prop) { diag(kZUnsupported, p, "spread next to a computed key"); return tError; }
        std::uint32_t kn = n(p).kids.size() > 1 ? n(p).kids[1] : kNone;
        std::string sep = holes[0].empty() ? "" : ", ";
        if (kn == kNone) keys += sep + "'" + std::string(n(p).text) + "'";
        else { keys += sep + "__H" + std::to_string(2 * holes[0].size()); }
        holes[0].push_back(kn);
        vals += sep + "__H" + std::to_string(2 * holes[0].size() - 1);
      }
      // holes numbering: even = key expressions (or unused), odd = values
      std::vector<std::vector<std::uint32_t>> real;
      for (std::size_t k = 0; k < holes[0].size(); ++k) { real.push_back({holes[0][k] == kNone ? n(x.kids[k]).kids[0] : holes[0][k]}); real.push_back({n(x.kids[k]).kids[0]}); }
      if (replaceWith(i, "__dynObjOf(" + keys + "], " + vals + "])", real)) return expr0(i, expected);
      return tError;
    }
    for (std::uint32_t p : x.kids) if (n(p).kind == N::Spread) { expandSpreads(i); break; }
    TypeId rec = kNoType;
    const std::vector<std::uint32_t> props(x.kids);
    if (expected != kNoType) {
      for (TypeId mt : unionMembers(expected)) if (ty(mt).k == TK::Object && out.objs[ty(mt).obj].isRecord) {
        // among several records the literal-typed properties (`kind: 'circle'`) pick the one the literal is
        bool match = true;
        for (const Member& mm : out.objs[ty(mt).obj].members) {
          if (!mm.hasLiteral) continue;
          bool found = false;
          for (std::uint32_t p : props) if (n(p).kind == N::Prop && n(p).text == mm.name && n(n(p).kids[0]).kind == N::String) found = n(n(p).kids[0]).text.substr(1, n(n(p).kids[0]).text.size() - 2) == mm.literal;
          match = match && found;
        }
        if (rec == kNoType || match) rec = mt;
        if (match && rec == mt) { bool lits = false; for (const Member& mm : out.objs[ty(mt).obj].members) lits = lits || mm.hasLiteral; if (lits) break; }
      }
    }
    if (rec != kNoType) {
      std::uint32_t oi = ty(rec).obj;
      ensureBuilt(oi);
      const std::vector<Member> members = out.objs[oi].members;
      const std::string rname = out.objs[oi].name;
      std::vector<char> seen(members.size(), 0);
      for (std::uint32_t p : props) {
        const Node& pn = n(p);
        std::size_t k = 0;
        while (k < members.size() && members[k].name != pn.text) ++k;
        if (k == members.size()) { diag(kZNoSuchProperty, p, "'" + std::string(pn.text) + "' does not exist in '" + rname + "'"); expr(pn.kids[0]); continue; }
        if (seen[k]) diag(kZDuplicateDeclaration, p, "property '" + std::string(pn.text) + "'");
        seen[k] = 1;
        TypeId vt = expr(pn.kids[0], members[k].type);
        require(vt, members[k].type, pn.kids[0]);
        if (members[k].hasLiteral && !(n(pn.kids[0]).kind == N::String && n(pn.kids[0]).text.substr(1, n(pn.kids[0]).text.size() - 2) == members[k].literal)) diag(kZNotAssignable, pn.kids[0], "a value other than '" + members[k].literal + "'");
      }
      for (std::size_t k = 0; k < members.size(); ++k) {
        if (seen[k]) continue;
        if (!members[k].optional) { diag(kZNotAssignable, i, "missing property '" + members[k].name + "' for '" + rname + "'"); continue; }
        std::uint32_t nul = newNode(N::Literal, "null", {}, i);  // an optional property left out is null
        out.nodeType[nul] = tNull;
        std::uint32_t prop = newNode(N::Prop, keep(members[k].name), {nul}, i);
        a.nodes[i].kids.push_back(prop);
      }
      return rec;
    }
    std::vector<std::pair<std::string, TypeId>> shape;
    bool bad_ = false;
    for (std::uint32_t p : props) {
      const Node& pn = n(p);
      TypeId vt = expr(pn.kids[0]);
      if (bad(vt) || vt == tNull || vt == tVoid) { if (!bad(vt)) diag(kZCannotInfer, p, "property '" + std::string(pn.text) + "'"); bad_ = true; continue; }
      bool dup = false;
      for (auto& e : shape) dup = dup || e.first == pn.text;
      if (dup) { diag(kZDuplicateDeclaration, p, "property '" + std::string(pn.text) + "'"); bad_ = true; continue; }
      shape.push_back({std::string(pn.text), vt});
    }
    return bad_ ? tError : recordOf(shape);
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
  struct PendingFn { std::uint32_t node; std::vector<std::uint32_t> params; std::vector<TypeId> paramTypes; std::uint32_t minArgs; Ctx ctx; };
  std::map<std::uint32_t, PendingFn> pendingFns;  // functions whose return type is still to be found, by symbol
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
      a.nodes[clone].kind = N::Function;  // a static method instantiates as a plain function
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
        if (args.size() < generics[sy].tp.size()) fillTypeDefaults(generics[sy], args);
        if (args.size() != generics[sy].tp.size()) { diag(kZCannotInfer, refNode, "'" + std::string(rn.text) + "' needs " + std::to_string(generics[sy].tp.size()) + " type argument(s)"); return kNoObj; }
        std::uint32_t inst = instantiateClass(sy, args, refNode);
        if (inst == kNone) return kNoObj;
        o = ty(out.syms[inst].type).obj;
      } else if (out.syms[sy].kind == SymKind::Class && rn.kids.empty()) {
        o = ty(out.syms[sy].type).obj;
      } else { diag(kZInvalidHierarchy, refNode, "'" + std::string(rn.text) + "' is not " + (wantInterface ? "an interface" : "a class")); return kNoObj; }
      if ((out.objs[o].isRecord && !(wantInterface && cn.kind == N::Interface)) || (!out.objs[o].isRecord && out.objs[o].isInterface != wantInterface)) { diag(kZInvalidHierarchy, refNode, "'" + std::string(rn.text) + "' is not " + (wantInterface ? "an interface" : "a class")); return kNoObj; }
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
    if (cn.kind == N::Interface && cn.kids[0] != kNone && !out.objs[oi].isRecord)
      for (std::uint32_t r : std::vector<std::uint32_t>(n(cn.kids[0]).kids)) { std::uint32_t io = resolve(r, true); if (io != kNoObj) out.objs[oi].ifaces.push_back(io); }
  }

  // Type arguments left out take the defaults of the declaration (`class Box<T = number>`); false when one has none.
  bool fillTypeDefaults(const GenericDecl& g, std::vector<TypeId>& args) {
    for (std::size_t k = args.size(); k < g.tp.size(); ++k) {
      const Node& tpn = n(g.tp[k]);
      if (tpn.kids.size() < 2 || tpn.kids[1] == kNone) return false;
      args.push_back(annotation(tpn.kids[1]));
    }
    return true;
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

  bool mentionsUnbound(const GenericDecl& g, TypeId t, const std::vector<TypeId>& bound) {
    const Type x = ty(t);
    if (x.k == TK::Param) { for (std::size_t i = 0; i < g.selfParams.size(); ++i) if (g.selfParams[i] == t) return bound[i] == kNoType; return false; }
    if (x.k == TK::Array) return mentionsUnbound(g, x.elem, bound);
    if (x.k == TK::Func) { for (TypeId p : x.params) if (mentionsUnbound(g, p, bound)) return true; return mentionsUnbound(g, x.elem, bound); }
    return false;
  }
  // `t` with the template's type parameters replaced by what is bound so far (kNoType where nothing is).
  TypeId substitute(const GenericDecl& g, TypeId t, const std::vector<TypeId>& bound) {
    const Type x = ty(t);
    switch (x.k) {
      case TK::Param:
        for (std::size_t i = 0; i < g.selfParams.size(); ++i) if (g.selfParams[i] == t) return bound[i];
        return t;
      case TK::Array: { TypeId e = substitute(g, x.elem, bound); return e == kNoType ? t : arrayOf(e); }
      case TK::Func: {
        std::vector<TypeId> ps;
        for (TypeId p : x.params) ps.push_back(substitute(g, p, bound));
        return func(ps, substitute(g, x.elem, bound), x.minArgs, x.variadic);
      }
      default: return t;
    }
  }
  // Type arguments of a call or new: explicit ones, else inferred from the already evaluated argument types. Empty on failure.
  std::vector<TypeId> typeArgsFor(std::uint32_t gsym, std::uint32_t callNode, const std::vector<std::uint32_t>& argNodes, TypeId templateFunc) {
    GenericDecl& g = generics[gsym];
    ensureSelf(g);
    auto ex = a.targs.find(callNode);
    if (ex != a.targs.end()) {
      std::vector<TypeId> args;
      for (std::uint32_t t : std::vector<std::uint32_t>(ex->second)) args.push_back(annotation(t));
      if (args.size() < g.tp.size()) fillTypeDefaults(g, args);
      if (args.size() != g.tp.size()) { diag(kZWrongArgCount, callNode, "expected " + std::to_string(g.tp.size()) + " type argument(s), got " + std::to_string(args.size())); return {}; }
      const Type fe = ty(templateFunc);
      for (std::size_t k = 0; k < argNodes.size() && k < fe.params.size(); ++k)
        if (out.nodeType[argNodes[k]] == kNoType) expr(argNodes[k], substitute(g, fe.params[k], args));
      return args;
    }
    std::vector<TypeId> bound(g.tp.size(), kNoType);
    const Type f = ty(templateFunc);
    // a function expression whose parameters are annotated says what they are: `each(() => [0, 1, 2], (i: i32) => ...)` is i32 all through, so the literals of the first one become i32
    for (std::size_t k = 0; k < argNodes.size() && k < f.params.size(); ++k) {
      const Node& an = n(argNodes[k]);
      if (an.kind != N::FuncExpr || ty(f.params[k]).k != TK::Func) continue;
      const Type& ft = ty(f.params[k]);
      for (std::size_t j = 2; j < an.kids.size() && j - 2 < ft.params.size(); ++j) {
        const Node& pn = n(an.kids[j]);
        if (pn.kids.empty() || pn.kids[0] == kNone) continue;
        TypeId at = annotation(pn.kids[0]);
        if (!bad(at) && ty(ft.params[j - 2]).k == TK::Param) unify(g, ft.params[j - 2], at, bound, argNodes[k]);
      }
    }
    for (std::size_t k = 0; k < argNodes.size() && k < f.params.size(); ++k)
      if (out.nodeType[argNodes[k]] != kNoType && !unify(g, f.params[k], out.nodeType[argNodes[k]], bound, argNodes[k])) return {};
    for (std::size_t k = 0; k < argNodes.size() && k < f.params.size(); ++k) {  // function expressions, now that the other arguments have bound what they can
      if (out.nodeType[argNodes[k]] != kNoType) continue;
      TypeId want = substitute(g, f.params[k], bound);
      if (ty(f.params[k]).k == TK::Func && mentionsUnbound(g, ty(f.params[k]).elem, bound)) {  // the result type is what the lambda is to tell
        std::vector<TypeId> ps;
        for (TypeId p : ty(f.params[k]).params) ps.push_back(substitute(g, p, bound));
        want = func(ps, kNoType, ty(f.params[k]).minArgs, ty(f.params[k]).variadic);
      }
      TypeId lt = expr(argNodes[k], want);
      if (bad(lt) || !unify(g, f.params[k], lt, bound, argNodes[k])) return {};
    }
    if (genericExpected != kNoType && !bad(genericExpected) && std::find(bound.begin(), bound.end(), kNoType) != bound.end()) {  // `return Promise.reject(e)` in a function returning Promise<number>: the wanted type gives T
      std::vector<TypeId> b2 = bound;
      std::size_t before = out.diags.size();
      if (unify(g, f.elem, genericExpected, b2, callNode)) for (std::size_t k = 0; k < bound.size(); ++k) if (bound[k] == kNoType) bound[k] = b2[k];
      if (out.diags.size() > before) out.diags.resize(before);
    }
    for (std::size_t i = 0; i < bound.size(); ++i)
      if (bound[i] == kNoType && n(g.tp[i]).kids.size() > 1 && n(g.tp[i]).kids[1] != kNone) bound[i] = annotation(n(g.tp[i]).kids[1]);  // not inferred: the default
      else if (bound[i] == kNoType) { diag(kZCannotInfer, callNode, "type argument '" + out.tparams[ty(g.selfParams[i]).obj].name + "'"); return {}; }
    return bound;
  }

  // Members of a class or interface node, in order.
  std::vector<std::uint32_t> membersOf(std::uint32_t node) const {
    const Node& c = n(node);
    std::size_t from = c.kind == N::Class ? kClassMembersFrom : 1;
    return std::vector<std::uint32_t>(c.kids.begin() + static_cast<std::ptrdiff_t>(from), c.kids.end());
  }

  static std::uint8_t accessOf(std::uint32_t fl) { return (fl & frontend::kFlagPrivate) ? 2 : (fl & frontend::kFlagProtected) ? 1 : 0; }

  // The type of the top-level `const name` (annotated, or initialised with a literal or another such const), tError when it cannot be told yet.
  TypeId moduleConstType(std::string_view nm, int depth = 0) {
    if (!topList || depth > 8) return tError;
    for (std::uint32_t st : *topList) {
      if (n(st).kind != N::VarDecl) continue;
      for (std::uint32_t d : n(st).kids) {
        const Node& dn = n(d);
        if (dn.text != nm || (dn.kids.size() > 2 && dn.kids[2] != kNone)) continue;
        if (dn.kids[0] != kNone) return annotation(dn.kids[0]);
        if (dn.kids[1] == kNone) return tError;
        const Node* in = &n(dn.kids[1]);
        if (in->kind == N::Unary && in->text == "-" && n(in->kids[0]).kind == N::Number) in = &n(in->kids[0]);
        if (in->kind == N::Number) return num(Num::f64);
        if (in->kind == N::String) return tStr;
        if (in->kind == N::Literal && in->text != "null") return tBool;
        if (in->kind == N::Ident) return moduleConstType(in->text, depth + 1);
        if (in->kind == N::New && n(in->kids[0]).kind == N::Ident && !a.targs.count(dn.kids[1])) {  // `const BLACK = new CssColor(0, 255)`
          std::uint32_t cs = lookup(n(in->kids[0]).text);
          if (cs != kNone && out.syms[cs].kind == SymKind::Class) return out.syms[cs].type;
        }
        return tError;
      }
    }
    return tError;
  }
  void classMembers(std::uint32_t cls, std::uint32_t objIdx) {
    const Node& c = n(cls);
    bool isIface = c.kind == N::Interface && !out.objs[objIdx].isRecord;
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
    if (out.objs[objIdx].isRecord && c.kind == N::Interface && c.kids[0] != kNone) {  // a record carries the fields of the records it extends
      for (std::uint32_t r : n(c.kids[0]).kids) {
        std::uint32_t ps = lookup(n(r).text);
        if (ps == kNone || out.syms[ps].kind != SymKind::Class) continue;
        std::uint32_t po = ty(out.syms[ps].type).obj;
        ensureBuilt(po);
        for (const Member& pm : out.objs[po].members) {
          Member copy = pm;
          copy.owner = objIdx;
          out.objs[objIdx].members.push_back(std::move(copy));
        }
      }
    }
    for (std::uint32_t m : mems) {
      const Node& mn = n(m);
      if (a.tparams.count(m)) continue;  // a static generic method: a generic function of its own
      std::uint32_t fl = mn.flags;
      bool isCtor = mn.kind == N::Method && mn.text == "constructor";
      bool dup = false;
      if (!isCtor) for (const Member& e : out.objs[objIdx].members) if (e.owner == objIdx && e.name == mn.text && e.isStatic == ((fl & frontend::kFlagStatic) != 0)) dup = true;
      if (dup || (isCtor && ctorNode != kNone)) { diag(kZDuplicateDeclaration, m, "'" + std::string(mn.text) + "'"); continue; }
      if (isIface && isCtor) { diag(kZUnsupported, m, "constructors in interfaces"); continue; }
      if ((fl & frontend::kFlagAbstract) && !isIface && !(out.objs[objIdx].isAbstract)) diag(kZAbstractViolation, m, "abstract member '" + std::string(mn.text) + "' in a concrete class");
      Member mem;
      mem.name = std::string(mn.text); mem.owner = objIdx; mem.access = accessOf(fl); mem.isStatic = (fl & frontend::kFlagStatic) != 0;
      if (mn.kind == N::Field && isIface) {  // an interface property reads like a getter; classes satisfy it with a field or a getter
        TypeId t = mn.kids[0] != kNone ? annotation(mn.kids[0]) : tError;
        out.nodeType[m] = t;
        mem.type = func({}, t, 0); mem.method = true; mem.readonly = true; mem.isAbstract = true; mem.getter = true;
        out.objs[objIdx].members.push_back(std::move(mem));
        continue;
      }
      if (mn.kind == N::Field) {
        TypeId t = tError;
        if (mn.kids[0] != kNone) t = annotation(mn.kids[0]);
        else if (mn.kids[1] != kNone) {
          const Node& in = n(mn.kids[1]);
          t = in.kind == N::Number ? num(Num::f64) : in.kind == N::String ? tStr : (in.kind == N::Literal && in.text != "null") ? tBool : tError;
          if (t == tError && (in.kind == N::Call || in.kind == N::New || in.kind == N::Template || in.kind == N::Binary || in.kind == N::Unary || in.kind == N::Cond || in.kind == N::Member)) {
            // any other initializer: its type, when it can be told from here (names it uses are in scope; the class is not yet built)
            std::size_t before = out.diags.size();
            TypeId it = expr(mn.kids[1]);
            if (out.diags.size() > before) out.diags.resize(before);
            if (!bad(it) && it != tNull && it != tVoid) t = it;
          }
          if (t == tError && in.kind == N::Ident) t = moduleConstType(in.text);  // `private fill = BLACK`: the type of a module-level const, found in the list of top statements
          if (t == tError) diag(kZCannotInfer, m, "field '" + std::string(mn.text) + "'");
        } else diag(kZCannotInfer, m, "field '" + std::string(mn.text) + "'");
        out.nodeType[m] = t;
        mem.type = t; mem.readonly = (fl & frontend::kFlagReadonly) != 0; mem.optional = (fl & frontend::kFlagOptional) != 0;
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
    if (!isIface) {      // a derived class without a constructor takes its base class's parameters
      if (ctorNode == kNone && par != kNoObj && out.objs[par].ctor != kNoType) out.objs[objIdx].ctor = func(ty(out.objs[par].ctor).params, self, ty(out.objs[par].ctor).minArgs);
      // `implements I`: every member of I must be present with the same type
      if (c.kind == N::Class && c.kids[1] != kNone)
        for (std::uint32_t r : std::vector<std::uint32_t>(n(c.kids[1]).kids)) {
          TypeId it = annotation(r);
          if (bad(it)) continue;
          if (ty(it).k == TK::Object && out.objs[ty(it).obj].isRecord) {  // an interface of fields: structural, the class declares each field with its type
            for (const Member& im : out.objs[ty(it).obj].members) {
              const Member* m = lookupMember(objIdx, im.name, false);
              if (!m || m->method || m->isStatic || m->access != 0 || m->type != im.type) diag(kZMissingInterfaceMember, r, "'" + im.name + "' of '" + out.objs[ty(it).obj].name + "'");
            }
            continue;
          }
          if (ty(it).k != TK::Object || !out.objs[ty(it).obj].isInterface) { diag(kZInvalidHierarchy, r, "'implements' needs an interface"); continue; }
          std::uint32_t io = ty(it).obj;
          for (const Member& im : out.objs[io].members) {
            const Member* m = lookupMember(objIdx, im.name, false);
            if (im.getter && m && !m->method && !m->isStatic && m->access == 0 && ty(im.type).elem == m->type) continue;  // a property satisfied by a field
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
        if (mn.kind != N::Field || mn.kids[1] != kNone || (mn.flags & (frontend::kFlagStatic | frontend::kFlagDefinite)) || out.objs[objIdx].isRecord) continue;
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
    for (std::uint32_t s : stmts) {  // static generic methods are generic functions named `Class.method`
      if (n(s).kind != N::Class || a.tparams.count(s)) continue;
      for (std::size_t k = frontend::kClassMembersFrom; k < n(s).kids.size(); ++k) {
        std::uint32_t mi = n(s).kids[k];
        auto tp = a.tparams.find(mi);
        if (n(mi).kind != N::Method || tp == a.tparams.end()) continue;
        std::string_view full = keep(std::string(n(s).text) + "." + std::string(n(mi).text));
        std::uint32_t gs = declare(SymKind::GenericFunc, full, kNoType, mi, true, mi);
        out.nodeSym[mi] = gs;
        GenericDecl g;
        g.node = mi; g.tp = tp->second; g.scopes = scopes; g.isFunc = true;
        generics[gs] = std::move(g);
        genericSyms.push_back(gs);
      }
    }
    for (std::uint32_t s : stmts) {
      if (n(s).kind != N::Class && n(s).kind != N::Interface) continue;
      if (a.tparams.count(s)) continue;
      ObjInfo info;
      info.name = std::string(n(s).text);
      info.isRecord = n(s).kind == N::Interface && isRecordDecl(s, &stmts);
      info.isClass = n(s).kind == N::Class || info.isRecord;
      info.isInterface = n(s).kind == N::Interface && !info.isRecord;
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
      inferReturns = true; sigNeedsInfer = false;
      TypeId sig = signature(s, 2, false, ps);
      inferReturns = false;
      bool needInfer = sigNeedsInfer;
      out.nodeType[s] = sig;
      out.nodeSym[s] = declare(SymKind::Func, n(s).text, sig, s, true, s);
      if (isNestedFunction(s)) {  // a nested function: another function may use it (and it may use the variables around it), so it is captured like a variable
        out.syms[out.nodeSym[s]].ownerFn = fnStack.back();
        out.syms[out.nodeSym[s]].reassigned = true;  // its closure is stored after the closures that call it exist: a shared cell
      }
      if (n(s).kids[1] == kNone) { diag(kZUnsupported, s, "function declarations without a body"); continue; }
      if (needInfer) {
        std::uint32_t fsym = out.nodeSym[s];
        pendingFns[fsym] = {s, ps, ty(sig).params, ty(sig).minArgs, saveCtx()};
        defer->push_back([this, fsym]() { resolvePending(fsym); });
        continue;
      }
      defer->push_back([this, s, sig, ps]() { checkBody(s, sig, ps, false); });
    }
    for (std::uint32_t as : aliasSyms) if (out.syms[as].kind == SymKind::TypeAlias) resolveAlias(as);  // report errors even in unused aliases
    for (std::uint32_t gs : genericSyms) {  // check every template once, over its own type parameters
      GenericDecl& g = generics[gs];
      ensureSelf(g);
      if (g.isFunc) instantiateFunc(gs, g.selfParams, g.node); else instantiateClass(gs, g.selfParams, g.node);
    }
    bool rootList = &stmts == topList;
    if (rootList)  // top-level variables of known type are visible to functions declared above them (they are globals)
      for (std::size_t si = 0; si < stmts.size(); ++si) {
        std::uint32_t s = stmts[si];
        if (n(s).kind != N::VarDecl || n(s).text == "using") continue;
        for (std::uint32_t d : n(s).kids) {
          const Node& dn = n(d);
          if ((dn.kids.size() > 2 && dn.kids[2] != kNone) || dn.kids[0] == kNone || dn.kids[1] == kNone || scopes.back()->count(dn.text)) continue;
          bool earlyUse = false;  // only a name that a statement above the declaration mentions inside a function needs to be declared ahead
          for (std::size_t pj = 0; pj < si && !earlyUse; ++pj) earlyUse = mentionsInFunction(stmts[pj], dn.text);
          if (!earlyUse) continue;
          TypeId vt = annotation(dn.kids[0]);
          if (bad(vt)) continue;
          declAsGlobal = true;
          std::uint32_t sy = declare(SymKind::Var, dn.text, vt, d, n(s).text == "const", d);
          declAsGlobal = false;
          out.syms[sy].forward = true;
          forwardVars[d] = {sy, vt};
        }
      }
    for (std::size_t si = 0; si < stmts.size(); ++si) {
      std::uint32_t s = stmts[si];
      if (n(s).kind == N::VarDecl && n(s).text == "using") for (std::size_t r = si + 1; r < stmts.size(); ++r) markCells(stmts[r]);
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
    if (!a.prelude.empty()) { topList = &a.prelude; inPrelude = true; stmtList(a.prelude); inPrelude = false; }  // Error and friends, in the scope every module sees
    if (lookup("__fmtDyn") != kNone) preludeDone = jsonPreludeDone = true;  // the Dyn prelude carries the console.log and JSON helpers
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
    if (im.getter && m && !m->method && !m->isStatic && m->access == 0 && c.types[im.type].elem == m->type) continue;  // a property satisfied by a field
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
  auto isFn = [&](std::uint32_t k) { return k != kNone && ast.nodes[k].kind == N::FuncExpr; };
  for (std::uint32_t i = 0; i < ast.nodes.size(); ++i) {  // name inference for function expressions, as JavaScript does
    const Node& x = ast.nodes[i];
    if ((x.kind == N::Declarator || x.kind == N::Field) && x.kids.size() > 1 && !x.text.empty() && isFn(x.kids[1])) c.out.lambdaNames[x.kids[1]] = std::string(x.text);
    else if (x.kind == N::Prop && isFn(x.kids[0])) c.out.lambdaNames[x.kids[0]] = std::string(x.text);
    else if (x.kind == N::Assign && x.text == "=" && isFn(x.kids[1]) && (ast.nodes[x.kids[0]].kind == N::Ident || ast.nodes[x.kids[0]].kind == N::Member)) c.out.lambdaNames[x.kids[1]] = std::string(ast.nodes[x.kids[0]].text);
  }
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
