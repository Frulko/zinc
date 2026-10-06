// AST + checker results -> typed SSA IR. Locals use on-the-fly SSA construction (Braun et al.) with block parameters
// as phis; trivial parameters are removed afterwards. Top-level variables used by functions become globals.
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <unordered_map>

#include "frontend/check.h"
#include "ir/ir.h"

namespace zn::ir {
namespace {

using frontend::N;
using frontend::Node;
using frontend::SymKind;
using NumK = frontend::Num;
constexpr std::uint32_t kNil = frontend::kNone;

std::string unescape(std::string_view s) {
  std::string o;
  for (std::size_t i = 0; i < s.size(); ++i) {
    if (s[i] != '\\' || i + 1 >= s.size()) { o += s[i]; continue; }
    char c = s[++i];
    switch (c) {
      case 'n': o += '\n'; break;
      case 'r': o += '\r'; break;
      case 't': o += '\t'; break;
      case '0': o += '\0'; break;
      case 'b': o += '\b'; break;
      case 'f': o += '\f'; break;
      case 'v': o += '\v'; break;
      case 'x': {
        if (i + 2 < s.size()) { o += static_cast<char>(std::strtol(std::string(s.substr(i + 1, 2)).c_str(), nullptr, 16)); i += 2; }
        break;
      }
      default: o += c; break;
    }
  }
  return o;
}

struct Lowering {
  const frontend::Ast& a;
  const frontend::Checked& c;
  Module m;
  std::vector<frontend::Diag> diags;

  std::vector<std::uint32_t> classOfObj;                          // checker object -> IR class
  std::unordered_map<std::uint32_t, std::uint32_t> funcOfNode;    // Function/Method node -> function index
  std::unordered_map<std::string, std::uint32_t> methodFn;        // "obj:name" -> instance method function (concrete only)
  std::unordered_map<std::string, std::uint32_t> staticFn;        // "obj:name" -> static method function
  std::unordered_map<std::string, std::uint32_t> staticGlobal;    // "obj:name" -> global of a static field
  std::unordered_map<std::uint32_t, std::uint32_t> ctorOfClass;   // IR class -> constructor function
  std::unordered_map<std::uint32_t, std::uint32_t> classNodeOfObj;  // checker object -> its Class node
  std::vector<char> instantiated;                                 // per checker object: appears in a `new`
  std::vector<std::vector<std::pair<std::string, frontend::TypeId>>> layouts;  // per object: instance fields, parent first
  std::vector<char> layoutDone;
  std::unordered_map<std::string, std::uint32_t> selectorIds;
  std::vector<std::int64_t> ownerFn;                              // per symbol: owning function (0 = main), -1 unknown
  std::vector<char> topLevel, global;                             // per symbol
  std::vector<std::uint32_t> globalIndex;                         // per symbol
  std::unordered_map<std::string, std::uint32_t> stringIds;

  struct Job { std::uint32_t fn; std::uint32_t node; std::uint32_t cls; bool ctor; std::uint32_t classNode; bool lambda = false; };
  std::vector<Job> jobs;

  Lowering(const frontend::Ast& ast, const frontend::Checked& ch) : a(ast), c(ch) {}

  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  void unsupported(std::uint32_t node, const std::string& what) { diags.push_back({frontend::kZUnsupported, n(node).start, what, n(node).file}); }

  static std::string mkey(std::uint32_t obj, std::string_view name) { return std::to_string(obj) + ":" + std::string(name); }

  TypeId irType(frontend::TypeId t, std::uint32_t at = kNil) {
    const frontend::Type& x = c.types[t];
    switch (x.k) {
      case frontend::TK::Num: return m.numT(x.num);
      case frontend::TK::Bool: return m.boolT();
      case frontend::TK::Str: return m.strT();
      case frontend::TK::Void: return m.voidT();
      case frontend::TK::Array: return m.arrayT(irType(x.elem, at));
      case frontend::TK::Set: return m.setT(irType(x.elem, at));
      case frontend::TK::Map: return m.mapT(irType(x.params[0], at), irType(x.elem, at));
      case frontend::TK::Func: if (!typeHasParam(t)) return m.refT(fnClassOf(t)); break;
      case frontend::TK::Object:
        if (classOfObj[x.obj] != kNil) return m.refT(classOfObj[x.obj]);
        break;
      case frontend::TK::Union: {  // references with null: the class every member derives from (null is a null reference)
        std::vector<std::uint32_t> objs;
        for (frontend::TypeId mt : x.params) {
          if (mt == frontend::kNoType) continue;
          const frontend::Type& mtt = c.types[mt];
          if (mtt.k == frontend::TK::Null) continue;
          if (mtt.k != frontend::TK::Object || classOfObj[mtt.obj] == kNil) { objs.clear(); break; }
          objs.push_back(mtt.obj);
        }
        for (std::uint32_t cand : objs) {
          bool all = true;
          for (std::uint32_t o : objs) all = all && frontend::objAssignable(c, o, cand);
          if (all) return m.refT(classOfObj[cand]);
        }
        break;
      }
      default: break;
    }
    if (at != kNil) unsupported(at, "this type in the IR");
    return m.voidT();
  }

  std::uint32_t internStr(const std::string& s) {
    auto it = stringIds.find(s);
    if (it != stringIds.end()) return it->second;
    m.strings.push_back(s);
    return stringIds[s] = static_cast<std::uint32_t>(m.strings.size() - 1);
  }

  // ---- classes: layout, selectors, vtables
  const std::vector<std::pair<std::string, frontend::TypeId>>& layoutOf(std::uint32_t obj) {
    if (!layoutDone[obj]) {
      layoutDone[obj] = 1;
      std::vector<std::pair<std::string, frontend::TypeId>> lay;
      if (c.objs[obj].parent != kNil) lay = layoutOf(c.objs[obj].parent);
      for (const frontend::Member& mem : c.objs[obj].members)
        if (!mem.method && !mem.isStatic && mem.owner == obj) lay.push_back({mem.name, mem.type});
      layouts[obj] = std::move(lay);
    }
    return layouts[obj];
  }
  std::uint32_t fieldIndex(std::uint32_t obj, std::string_view name) {
    const auto& lay = layoutOf(obj);
    for (std::uint32_t k = 0; k < lay.size(); ++k) if (lay[k].first == name) return k;
    return kNil;
  }

  std::uint32_t selectorFor(const std::string& name, frontend::TypeId ft) {
    std::string key = name + "#" + std::to_string(ft);
    auto it = selectorIds.find(key);
    if (it != selectorIds.end()) return it->second;
    Selector s;
    s.name = name;
    for (frontend::TypeId p : c.types[ft].params) s.params.push_back(irType(p));
    s.ret = irType(c.types[ft].elem);
    m.selectors.push_back(std::move(s));
    return selectorIds[key] = static_cast<std::uint32_t>(m.selectors.size() - 1);
  }

  std::uint32_t resolveMethod(std::uint32_t obj, std::string_view name) const {
    for (std::uint32_t o = obj, k = 0; o != kNil && k < 1000; o = c.objs[o].parent, ++k) {
      auto it = methodFn.find(mkey(o, name));
      if (it != methodFn.end()) return it->second;
    }
    return kNil;
  }

  // Closed world: if every instantiated class that can be the receiver resolves `name` to one function, call it directly.
  bool devirtualize(std::uint32_t recvObj, std::string_view name, std::uint32_t& fnOut) const {
    std::uint32_t found = kNil;
    for (std::uint32_t k = 0; k < c.objs.size(); ++k) {
      if (!instantiated[k] || !frontend::objAssignable(c, k, recvObj)) continue;
      std::uint32_t fn = resolveMethod(k, name);
      if (fn == kNil) return false;
      if (found != kNil && found != fn) return false;
      found = fn;
    }
    fnOut = found;
    return found != kNil;
  }

  void collectClasses() {
    classOfObj.assign(c.objs.size(), kNil);
    layouts.assign(c.objs.size(), {});
    layoutDone.assign(c.objs.size(), 0);
    instantiated.assign(c.objs.size(), 0);
    for (std::uint32_t o = 0; o < c.objs.size(); ++o) {
      if ((!c.objs[o].isClass && !c.objs[o].isInterface) || c.objs[o].isTemplate) continue;
      classOfObj[o] = static_cast<std::uint32_t>(m.classes.size());
      Class cl;
      cl.name = c.objs[o].name;
      cl.isInterface = c.objs[o].isInterface;
      cl.isAbstract = c.objs[o].isAbstract;
      m.classes.push_back(std::move(cl));
    }
    // every function type used as a value gets its interface before the vtables are sized
    std::function<void(frontend::TypeId, bool)> scan = [&](frontend::TypeId t, bool create) {
      if (t == frontend::kNoType || typeHasParam(t)) return;
      const frontend::Type& x = c.types[t];
      if (x.k == frontend::TK::Func) {
        if (create) fnClassOf(t);
        for (frontend::TypeId p : std::vector<frontend::TypeId>(x.params)) scan(p, true);
        scan(x.elem, true);
      } else if (x.k == frontend::TK::Array || x.k == frontend::TK::Set) scan(x.elem, true);
      else if (x.k == frontend::TK::Map) { scan(x.params[0], true); scan(x.elem, true); }
      else if (x.k == frontend::TK::Union) for (frontend::TypeId p : std::vector<frontend::TypeId>(x.params)) scan(p, true);
    };
    for (const frontend::Symbol& sy : c.syms) {
      if (sy.kind == SymKind::Var || sy.kind == SymKind::Param) scan(sy.type, true);
      else if (sy.kind == SymKind::Func) scan(sy.type, false);  // a declared function is not a value until it is used as one
    }
    for (std::uint32_t o = 0; o < c.objs.size(); ++o) {
      if (classOfObj[o] == kNil) continue;
      for (const frontend::Member& mem : c.objs[o].members) scan(mem.type, !mem.method);
    }
    for (std::uint32_t o = 0; o < c.objs.size(); ++o) {
      if (classOfObj[o] == kNil) continue;
      Class& cl = m.classes[classOfObj[o]];
      if (c.objs[o].parent != kNil) cl.parent = classOfObj[c.objs[o].parent];
      if (!cl.isInterface) for (const auto& [nm, t] : layoutOf(o)) cl.fields.push_back({nm, irType(t)});
      for (std::uint32_t i = 0; i < c.objs.size(); ++i)
        if (i != o && classOfObj[i] != kNil && c.objs[i].isInterface && frontend::objAssignable(c, o, i)) cl.implements.push_back(classOfObj[i]);
      for (const frontend::Member& mem : c.objs[o].members)
        if (!mem.method && mem.isStatic && mem.owner == o) {
          m.globals.push_back({c.objs[o].name + "." + mem.name, irType(mem.type)});
          staticGlobal[mkey(o, mem.name)] = static_cast<std::uint32_t>(m.globals.size() - 1);
        }
    }
  }

  void buildVtables() {
    for (std::uint32_t o = 0; o < c.objs.size(); ++o) {  // selectors visible on each class
      if (classOfObj[o] == kNil) continue;
      Class& cl = m.classes[classOfObj[o]];
      for (std::uint32_t p = o, k = 0; p != kNil && k < 1000; p = c.objs[p].parent, ++k)
        for (const frontend::Member& mem : c.objs[p].members) {
          if (!mem.method || mem.isStatic) continue;
          std::uint32_t sel = selectorFor(mem.name, mem.type);
          if (std::find(cl.selectors.begin(), cl.selectors.end(), sel) == cl.selectors.end()) cl.selectors.push_back(sel);
        }
    }
    for (std::uint32_t o = 0; o < c.objs.size(); ++o) {
      if (classOfObj[o] == kNil) continue;
      Class& cl = m.classes[classOfObj[o]];
      if (cl.isInterface || cl.isAbstract) continue;
      cl.vtable.assign(m.selectors.size(), kNil);
      for (std::uint32_t sel : cl.selectors) cl.vtable[sel] = resolveMethod(o, m.selectors[sel].name);
    }
  }

  // ---- closures: a lambda is a class with the captured variables as fields and one method, `call`; a function type is an
  // interface with that method; a captured variable that is reassigned lives in a shared cell (a one-field class)
  struct LambdaInfo {
    std::uint32_t node = 0, fn = 0, cls = 0;
    std::vector<std::uint32_t> caps;   // captured symbols, in field order
    std::int32_t thisField = -1;       // field holding the captured `this`, if any
  };
  std::unordered_map<std::uint32_t, LambdaInfo> lambdas;                          // FuncExpr node -> info
  std::unordered_map<frontend::TypeId, std::uint32_t> fnClassOfType;              // function type -> IR interface
  std::unordered_map<std::uint32_t, std::pair<std::uint32_t, std::uint32_t>> thunkOfSym;  // function symbol -> {class, function}
  std::unordered_map<TypeId, std::uint32_t> cellOfType;
  bool isCell(std::uint32_t s) const { return c.syms[s].captured && c.syms[s].reassigned && !c.syms[s].isGlobal; }

  bool typeHasParam(frontend::TypeId t) const {
    const frontend::Type& x = c.types[t];
    switch (x.k) {
      case frontend::TK::Param: return true;
      case frontend::TK::Array: case frontend::TK::Set: return typeHasParam(x.elem);
      case frontend::TK::Map: return typeHasParam(x.elem) || typeHasParam(x.params[0]);
      case frontend::TK::Func: { if (typeHasParam(x.elem)) return true; for (auto p : x.params) if (typeHasParam(p)) return true; return false; }
      case frontend::TK::Union: { for (auto p : x.params) if (typeHasParam(p)) return true; return false; }
      case frontend::TK::Object: return c.objs[x.obj].isTemplate;
      default: return false;
    }
  }
  std::uint32_t fnClassOf(frontend::TypeId ft) {
    auto it = fnClassOfType.find(ft);
    if (it != fnClassOfType.end()) return it->second;
    Class cl;
    cl.name = "fn " + frontend::typeName(c, ft);
    cl.isInterface = true;
    m.classes.push_back(std::move(cl));
    auto id = static_cast<std::uint32_t>(m.classes.size() - 1);
    fnClassOfType[ft] = id;
    std::uint32_t sel = selectorFor("call", ft);
    m.classes[id].selectors = {sel};
    return id;
  }
  std::uint32_t cellClass(TypeId t) {
    auto it = cellOfType.find(t);
    if (it != cellOfType.end()) return it->second;
    Class cl;
    cl.name = "cell " + typeName(m, t);
    cl.fields = {Field{"v", t}};
    m.classes.push_back(std::move(cl));
    return cellOfType[t] = static_cast<std::uint32_t>(m.classes.size() - 1);
  }

  void collectLambdas(std::uint32_t i, std::uint32_t curObj) {
    if (i == kNil) return;
    const Node& x = n(i);
    if ((x.kind == N::Class || x.kind == N::Function || x.kind == N::Interface || x.kind == N::FuncExpr) && c.nodeType[i] == frontend::kNoType) return;  // a generic template
    if (x.kind == N::Interface) return;
    if (x.kind == N::Class) curObj = c.types[c.nodeType[i]].obj;
    if (x.kind == N::FuncExpr && !typeHasParam(c.nodeType[i])) {
      LambdaInfo li;
      li.node = i;
      auto cap = c.captures.find(i);
      if (cap != c.captures.end()) li.caps = cap->second;
      Class cl;
      cl.name = "lambda" + std::to_string(lambdas.size());
      for (std::uint32_t sym : li.caps) {
        TypeId ft = irType(c.syms[sym].type, i);
        cl.fields.push_back({std::string(c.syms[sym].name), isCell(sym) ? m.refT(cellClass(ft)) : ft});
      }
      bool usesThis = std::find(c.lambdaUsesThis.begin(), c.lambdaUsesThis.end(), i) != c.lambdaUsesThis.end();
      if (usesThis && curObj != kNil && classOfObj[curObj] != kNil) {
        li.thisField = static_cast<std::int32_t>(cl.fields.size());
        cl.fields.push_back({"this", m.refT(classOfObj[curObj])});
      }
      frontend::TypeId ftype = c.nodeType[i];
      cl.implements = {fnClassOf(ftype)};
      cl.selectors = {selectorFor("call", ftype)};
      m.classes.push_back(std::move(cl));
      li.cls = static_cast<std::uint32_t>(m.classes.size() - 1);
      std::vector<TypeId> ps{m.refT(li.cls)};
      for (frontend::TypeId p : c.types[ftype].params) ps.push_back(irType(p, i));
      li.fn = addFunction(m.classes[li.cls].name, ps, irType(c.types[ftype].elem, i));
      funcOfNode[i] = li.fn;
      jobs.push_back({li.fn, i, kNil, false, kNil, true});
      lambdas[i] = li;
    }
    for (std::uint32_t k : x.kids) collectLambdas(k, curObj);
  }

  // A function used as a value gets a class whose `call` forwards to it.
  void buildThunks() {
    for (std::uint32_t node : c.funcValueUses) {
      std::uint32_t sym = c.nodeSym[node];
      if (sym == kNil || thunkOfSym.count(sym)) continue;
      auto target = funcOfNode.find(c.syms[sym].decl);
      if (target == funcOfNode.end()) continue;
      frontend::TypeId ftype = c.nodeType[node];
      if (typeHasParam(ftype)) continue;
      Class cl;
      cl.name = "fnref " + std::string(c.syms[sym].name);
      cl.implements = {fnClassOf(ftype)};
      cl.selectors = {selectorFor("call", ftype)};
      m.classes.push_back(std::move(cl));
      auto cls = static_cast<std::uint32_t>(m.classes.size() - 1);
      const Function& tf = m.functions[target->second];
      std::vector<TypeId> ps{m.refT(cls)};
      for (ValueId pv : tf.params) ps.push_back(tf.valueTypes[pv]);
      std::uint32_t fi = addFunction(m.classes[cls].name + "$call", ps, tf.ret);
      Function& f = m.functions[fi];
      f.blocks.emplace_back();
      f.blocks[0].params = f.params;
      Inst call;
      call.op = IrOp::Call; call.sym = target->second; call.ty = tf.ret;
      for (std::size_t k = 1; k < f.params.size(); ++k) call.args.push_back(f.params[k]);
      if (m.types[tf.ret].k != Type::K::Void) { f.valueTypes.push_back(tf.ret); call.res = static_cast<ValueId>(f.valueTypes.size() - 1); }
      ValueId rv = call.res;
      f.blocks[0].insts.push_back(std::move(call));
      Inst ret;
      ret.op = IrOp::Ret; ret.ty = m.voidT();
      if (rv != kNoValue) ret.args = {rv};
      f.blocks[0].insts.push_back(std::move(ret));
      thunkOfSym[sym] = {cls, fi};
    }
  }

  // Lambda and thunk classes implement `call` with their function.
  void finishClosureClasses() {
    auto finish = [&](std::uint32_t cls, std::uint32_t fn) {
      Class& cl = m.classes[cls];
      cl.vtable.assign(m.selectors.size(), kNil);
      cl.vtable[cl.selectors[0]] = fn;
    };
    for (auto& [node, li] : lambdas) finish(li.cls, li.fn);
    for (auto& [sym, th] : thunkOfSym) finish(th.first, th.second);
  }

  // ---- module structure
  std::uint32_t addFunction(const std::string& name, const std::vector<TypeId>& params, TypeId ret) {
    Function f;
    f.name = name;
    f.ret = ret;
    for (TypeId t : params) { f.valueTypes.push_back(t); f.params.push_back(static_cast<ValueId>(f.valueTypes.size() - 1)); }
    m.functions.push_back(std::move(f));
    return static_cast<std::uint32_t>(m.functions.size() - 1);
  }

  bool classHasInit(const Node& cls) const {
    for (std::size_t k = frontend::kClassMembersFrom; k < cls.kids.size(); ++k) {
      const Node& mn = n(cls.kids[k]);
      if (mn.kind == N::Field && mn.kids[1] != kNil && !(mn.flags & frontend::kFlagStatic)) return true;
    }
    return false;
  }
  bool classHasExplicitCtor(const Node& cls) const {
    for (std::size_t k = frontend::kClassMembersFrom; k < cls.kids.size(); ++k) {
      const Node& mn = n(cls.kids[k]);
      if (mn.kind == N::Method && mn.text == "constructor") return true;
    }
    return false;
  }
  // A class needs a constructor function when it declares one, has instance initialisers, or extends a class that needs one.
  bool needsCtor(std::uint32_t obj) const {
    auto it = classNodeOfObj.find(obj);
    if (it == classNodeOfObj.end()) return false;
    const Node& cls = n(it->second);
    if (classHasExplicitCtor(cls) || classHasInit(cls)) return true;
    return c.objs[obj].parent != kNil && needsCtor(c.objs[obj].parent);
  }

  void collectClassNodes(std::uint32_t i) {
    if (i == kNil) return;
    const Node& x = n(i);
    if ((x.kind == N::Class || x.kind == N::Function || x.kind == N::Interface) && c.nodeType[i] == frontend::kNoType) return;  // a generic template: only its instances are lowered
    if (x.kind == N::Class) classNodeOfObj[c.types[c.nodeType[i]].obj] = i;
    for (std::uint32_t k : x.kids) collectClassNodes(k);
  }

  void collectFunctions(const std::vector<std::uint32_t>& stmts, const std::string& prefix) {
    for (std::uint32_t s : stmts) {
      const Node& x = n(s);
      if ((x.kind == N::Class || x.kind == N::Function || x.kind == N::Interface) && c.nodeType[s] == frontend::kNoType) continue;  // a generic template
      if (x.kind == N::Function) {
        frontend::TypeId sig = c.nodeType[s];
        std::vector<TypeId> ps;
        for (frontend::TypeId p : c.types[sig].params) ps.push_back(irType(p, s));
        auto inm = c.nodeNames.find(s);
        std::string nm = prefix + (inm != c.nodeNames.end() ? inm->second : std::string(x.text));
        std::uint32_t fi = addFunction(nm, ps, irType(c.types[sig].elem, s));
        funcOfNode[s] = fi;
        if (c.captures.count(s) && !c.captures.at(s).empty()) unsupported(s, "a nested function that uses variables of the function around it (use an arrow function)");
        jobs.push_back({fi, s, kNil, false, kNil});
        if (x.kids[1] != kNil) collectFunctions(n(x.kids[1]).kids, nm + ".");
      } else if (x.kind == N::Class) {
        std::uint32_t obj = c.types[c.nodeType[s]].obj, cls = classOfObj[obj];
        TypeId self = m.refT(cls);
        bool hasCtor = false;
        for (std::size_t k = frontend::kClassMembersFrom; k < x.kids.size(); ++k) {
          std::uint32_t mem = x.kids[k];
          const Node& mn = n(mem);
          if (mn.kind != N::Method) continue;
          bool isCtor = mn.text == "constructor", isStatic = (mn.flags & frontend::kFlagStatic) != 0;
          hasCtor = hasCtor || isCtor;
          if (mn.kids[1] == kNil) continue;  // abstract: no body, no function
          frontend::TypeId sig = c.nodeType[mem];
          std::vector<TypeId> ps;
          if (!isStatic) ps.push_back(self);
          for (frontend::TypeId p : c.types[sig].params) ps.push_back(irType(p, mem));
          std::string nm = c.objs[obj].name + "." + std::string(mn.text);
          std::uint32_t fi = addFunction(nm, ps, isCtor ? m.voidT() : irType(c.types[sig].elem, mem));
          funcOfNode[mem] = fi;
          if (isCtor) ctorOfClass[cls] = fi;
          else if (isStatic) staticFn[mkey(obj, mn.text)] = fi;
          else methodFn[mkey(obj, mn.text)] = fi;
          jobs.push_back({fi, mem, isStatic ? kNil : cls, isCtor, s});
          collectFunctions(n(mn.kids[1]).kids, nm + ".");
        }
        if (!hasCtor && needsCtor(obj)) {  // initialisers and the base constructor need a constructor to run in
          std::vector<TypeId> ps{self};
          if (c.objs[obj].ctor != frontend::kNoType) for (frontend::TypeId p : c.types[c.objs[obj].ctor].params) ps.push_back(irType(p, s));
          std::uint32_t fi = addFunction(c.objs[obj].name + ".constructor", ps, m.voidT());
          ctorOfClass[cls] = fi;
          jobs.push_back({fi, s, cls, true, s});
        }
      }
    }
  }

  // Which top-level variables are used from functions (globals), and captures (unsupported).
  void analyze() {
    ownerFn.assign(c.syms.size(), -1);
    topLevel.assign(c.syms.size(), 0);
    global.assign(c.syms.size(), 0);
    globalIndex.assign(c.syms.size(), kNil);
    for (int pass = 0; pass < 2; ++pass) {
      std::function<void(std::uint32_t, std::int64_t, bool)> walk = [&](std::uint32_t i, std::int64_t fn, bool top) {
        if (i == kNil) return;
        const Node& x = n(i);
        if ((x.kind == N::Class || x.kind == N::Function || x.kind == N::Interface) && c.nodeType[i] == frontend::kNoType) return;  // a generic template
        std::int64_t cur = fn;
        if (x.kind == N::Function || x.kind == N::Method || x.kind == N::FuncExpr) { auto it = funcOfNode.find(i); if (it != funcOfNode.end()) cur = it->second; }
        if (x.kind == N::Interface) return;
        if (x.kind == N::Class) {  // instance field initializers run in the constructor, static ones where the class is declared
          std::uint32_t cls = classOfObj[c.types[c.nodeType[i]].obj];
          auto it = ctorOfClass.find(cls);
          for (std::size_t k = frontend::kClassMembersFrom; k < x.kids.size(); ++k) {
            std::uint32_t mem = x.kids[k];
            if (n(mem).kind == N::Field) {
              bool isStatic = (n(mem).flags & frontend::kFlagStatic) != 0;
              walk(n(mem).kids[1], (!isStatic && it != ctorOfClass.end()) ? static_cast<std::int64_t>(it->second) : fn, false);
            } else walk(mem, fn, false);
          }
          return;
        }
        if (x.kind == N::New && pass == 0) {
          std::uint32_t cs = c.nodeSym[x.kids[0]];
          if (cs != kNil && c.syms[cs].kind == SymKind::Class) instantiated[c.types[c.syms[cs].type].obj] = 1;
        }
        if (pass == 0 && (x.kind == N::Declarator || x.kind == N::Param) && x.kids.size() > 2 && x.kids[2] != kNil) {  // identifiers bound by a pattern
          std::function<void(std::uint32_t)> own = [&](std::uint32_t pn) {
            const Node& q = n(pn);
            if (q.kind == N::Ident) { if (c.nodeSym[pn] != kNil) { ownerFn[c.nodeSym[pn]] = cur; topLevel[c.nodeSym[pn]] = top && x.kind == N::Declarator; } return; }
            for (std::uint32_t k : q.kids) if (k != kNil) own(k);
          };
          own(x.kids[2]);
        }
        if ((x.kind == N::Declarator || x.kind == N::Param) && c.nodeSym[i] != kNil && pass == 0) {
          ownerFn[c.nodeSym[i]] = cur;
          topLevel[c.nodeSym[i]] = top && x.kind == N::Declarator;
        }
        if (x.kind == N::Ident && pass == 1) {
          std::uint32_t s = c.nodeSym[i];
          if (s != kNil && (c.syms[s].kind == SymKind::Var || c.syms[s].kind == SymKind::Param) && ownerFn[s] != cur && ownerFn[s] != -1) {
            if (topLevel[s]) global[s] = 1;
            else if (!c.syms[s].captured) unsupported(i, "a variable of another function ('" + std::string(x.text) + "')");
          }
        }
        bool childTop = x.kind == N::Program || (top && x.kind == N::VarDecl);
        for (std::uint32_t k : x.kids) walk(k, cur, childTop);
      };
      walk(a.root, 0, true);
      for (std::uint32_t inst : c.instances) walk(inst, 0, false);
    }
    for (std::uint32_t s = 0; s < c.syms.size(); ++s) {
      if (!global[s]) continue;
      m.globals.push_back({std::string(c.syms[s].name), irType(c.syms[s].type)});
      globalIndex[s] = static_cast<std::uint32_t>(m.globals.size() - 1);
    }
  }

  // ---- function bodies
  struct FnLower;
  void lowerAll();
  void run() {
    collectClasses();
    collectClassNodes(a.root);
    for (std::uint32_t inst : c.instances) collectClassNodes(inst);
    addFunction("main", {}, m.voidT());  // function 0
    collectFunctions(n(a.root).kids, "");
    collectFunctions(c.instances, "");  // monomorphised generic functions and classes
    collectLambdas(a.root, kNil);
    for (std::uint32_t inst : c.instances) collectLambdas(inst, kNil);
    buildThunks();
    jobs.insert(jobs.begin(), Job{0, kNil, kNil, false, kNil});
    analyze();
    buildVtables();
    finishClosureClasses();
    lowerAll();
    for (Class& cl : m.classes)  // selectors may have appeared since a vtable was filled
      if (!cl.isInterface && !cl.isAbstract) cl.vtable.resize(m.selectors.size(), kNil);
  }
};

struct Lowering::FnLower {
  Lowering& L;
  Module& m;
  const frontend::Ast& a;
  const frontend::Checked& c;
  Function& f;
  Job job;

  std::vector<std::vector<BlockId>> preds;
  std::vector<char> sealed;
  std::vector<std::unordered_map<std::uint32_t, ValueId>> defs;
  std::vector<std::vector<std::pair<std::uint32_t, ValueId>>> incomplete;
  std::unordered_map<std::uint32_t, TypeId> varType;
  BlockId cur = 0;
  std::vector<std::pair<BlockId, BlockId>> loopTargets;  // (break, continue)
  std::uint32_t thisVar, nextVar;
  const Lowering::LambdaInfo* lam = nullptr;  // set when this function is a lambda body

  FnLower(Lowering& l, Job j) : L(l), m(l.m), a(l.a), c(l.c), f(l.m.functions[j.fn]), job(j) {
    thisVar = static_cast<std::uint32_t>(c.syms.size());
    nextVar = thisVar + 1;
    if (j.lambda) lam = &l.lambdas.at(j.node);
  }

  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  TypeId tv(ValueId v) const { return f.valueTypes[v]; }
  const Type& ty(TypeId t) const { return m.types[t]; }
  void unsupported(std::uint32_t node, const std::string& what) { L.unsupported(node, what); }

  // ---- blocks and values
  BlockId newBlock() {
    f.blocks.emplace_back();
    preds.emplace_back();
    sealed.push_back(0);
    defs.emplace_back();
    incomplete.emplace_back();
    return static_cast<BlockId>(f.blocks.size() - 1);
  }
  ValueId newValue(TypeId t) { f.valueTypes.push_back(t); return static_cast<ValueId>(f.valueTypes.size() - 1); }
  ValueId emit(IrOp op, TypeId t, std::vector<ValueId> args = {}, std::int64_t imm = 0, double fimm = 0, std::uint32_t sym = 0) {
    Inst i;
    i.op = op; i.ty = t; i.args = std::move(args); i.imm = imm; i.fimm = fimm; i.sym = sym;
    if (ty(t).k != Type::K::Void) i.res = newValue(t);
    f.blocks[cur].insts.push_back(std::move(i));
    return f.blocks[cur].insts.back().res;
  }
  bool open() const { return f.blocks[cur].insts.empty() || !isTerminator(f.blocks[cur].insts.back().op); }
  void startDead() { cur = newBlock(); sealed[cur] = 1; }  // code after a terminator: no predecessors, removed later

  void terminate(IrOp op, std::vector<ValueId> args, std::vector<Edge> edges) {
    if (!open()) return;
    Inst i;
    i.op = op; i.ty = m.voidT(); i.args = std::move(args); i.edges = std::move(edges);
    for (const Edge& e : i.edges) preds[e.to].push_back(cur);
    f.blocks[cur].insts.push_back(std::move(i));
  }
  void br(BlockId to, std::vector<ValueId> args = {}) { terminate(IrOp::Br, {}, {Edge{to, std::move(args)}}); }
  void condbr(ValueId cond, BlockId t, BlockId e) { terminate(IrOp::CondBr, {cond}, {Edge{t, {}}, Edge{e, {}}}); }

  ValueId constNum(TypeId t, double v) {
    const Type& x = ty(t);
    bool fl = x.num == NumK::f64 || x.num == NumK::f32 || x.num == NumK::fx12 || x.num == NumK::fx16;
    return emit(IrOp::Const, t, {}, fl ? 0 : static_cast<std::int64_t>(v), fl ? v : 0);
  }
  ValueId constBool(bool b) { return emit(IrOp::Const, m.boolT(), {}, b ? 1 : 0); }
  ValueId constStr(const std::string& s) { return emit(IrOp::Const, m.strT(), {}, L.internStr(s)); }
  ValueId coerce(ValueId v, TypeId to) {
    if (v == kNoValue || tv(v) == to) return v;
    if (ty(tv(v)).k == Type::K::Num && ty(to).k == Type::K::Num) return emit(IrOp::Conv, to, {v});
    if (ty(tv(v)).k == Type::K::Ref && ty(to).k == Type::K::Ref) return emit(IrOp::RefCast, to, {v});  // subtype (or closed-world proven) cast
    return v;
  }

  // ---- SSA construction
  void setArg(Edge& e, std::size_t idx, ValueId v) { if (e.args.size() <= idx) e.args.resize(idx + 1, kNoValue); e.args[idx] = v; }
  void fillParam(BlockId b, ValueId p, std::uint32_t var) {
    std::size_t idx = 0;
    for (; idx < f.blocks[b].params.size(); ++idx) if (f.blocks[b].params[idx] == p) break;
    for (BlockId pr : std::vector<BlockId>(preds[b])) {
      ValueId v = readVar(var, pr);
      for (Edge& e : f.blocks[pr].insts.back().edges) if (e.to == b) setArg(e, idx, v);
    }
  }
  void seal(BlockId b) {
    sealed[b] = 1;
    auto pend = incomplete[b];
    incomplete[b].clear();
    for (auto& [var, p] : pend) fillParam(b, p, var);
  }
  void writeVar(std::uint32_t var, ValueId v) { defs[cur][var] = v; varType[var] = tv(v); }
  ValueId readVar(std::uint32_t var, BlockId b) {
    auto it = defs[b].find(var);
    if (it != defs[b].end()) return it->second;
    TypeId t = varType[var];
    ValueId v;
    if (!sealed[b]) {
      v = newValue(t);
      f.blocks[b].params.push_back(v);
      incomplete[b].push_back({var, v});
    } else if (preds[b].empty()) {
      BlockId saved = cur;
      cur = b;  // an unreachable block: any value will do
      Inst i; i.op = IrOp::Const; i.ty = t; i.res = newValue(t);
      v = i.res;
      f.blocks[b].insts.insert(f.blocks[b].insts.begin(), std::move(i));
      cur = saved;
    } else if (preds[b].size() == 1) {
      v = readVar(var, preds[b][0]);
    } else {
      v = newValue(t);
      f.blocks[b].params.push_back(v);
      defs[b][var] = v;
      fillParam(b, v, var);
    }
    defs[b][var] = v;
    return v;
  }

  // ---- variables
  // The environment field of a captured symbol in the lambda being lowered, or -1.
  int capField(std::uint32_t s) const {
    if (!lam) return -1;
    for (std::size_t k = 0; k < lam->caps.size(); ++k) if (lam->caps[k] == s) return static_cast<int>(k);
    return -1;
  }
  // The variable's own storage: for a cell variable the cell itself, for the others the value.
  ValueId storageOf(std::uint32_t s) {
    int fi = capField(s);
    if (fi >= 0) return emit(IrOp::GetField, m.classes[lam->cls].fields[static_cast<std::size_t>(fi)].type, {f.params[0]}, 0, 0, static_cast<std::uint32_t>(fi));
    return readVar(s, cur);
  }
  ValueId readSym(std::uint32_t s) {
    if (L.global[s]) return emit(IrOp::GetGlobal, L.irType(c.syms[s].type), {}, 0, 0, L.globalIndex[s]);
    if (L.isCell(s)) return emit(IrOp::GetField, L.irType(c.syms[s].type), {storageOf(s)}, 0, 0, 0);
    return storageOf(s);
  }
  void writeSym(std::uint32_t s, ValueId v) {
    if (L.global[s]) { emit(IrOp::SetGlobal, m.voidT(), {coerce(v, m.globals[L.globalIndex[s]].type)}, 0, 0, L.globalIndex[s]); return; }
    if (L.isCell(s)) { emit(IrOp::SetField, m.voidT(), {storageOf(s), coerce(v, L.irType(c.syms[s].type))}, 0, 0, 0); return; }
    writeVar(s, v);
  }
  // The first write of a variable: a captured, reassigned one gets its cell here.
  void declSym(std::uint32_t s, ValueId v) {
    if (!L.global[s] && L.isCell(s)) {
      TypeId t = L.irType(c.syms[s].type);
      std::uint32_t cls = L.cellClass(t);
      ValueId cell = emit(IrOp::New, m.refT(cls), {}, 0, 0, cls);
      emit(IrOp::SetField, m.voidT(), {cell, coerce(v, t)}, 0, 0, 0);
      writeVar(s, cell);
      return;
    }
    writeSym(s, v);
  }

  // ---- expressions
  static double parseNumber(std::string_view t, bool& isInt) {
    std::string s;
    for (char ch : t) if (ch != '_') s += ch;
    isInt = s.find_first_of(".eE") == std::string::npos || (s.size() > 1 && s[0] == '0' && std::strchr("xXbBoO", s[1]));
    if (s.size() > 1 && s[0] == '0') {
      if (s[1] == 'x' || s[1] == 'X') return static_cast<double>(std::strtoull(s.c_str() + 2, nullptr, 16));
      if (s[1] == 'b' || s[1] == 'B') return static_cast<double>(std::strtoull(s.c_str() + 2, nullptr, 2));
      if (s[1] == 'o' || s[1] == 'O') return static_cast<double>(std::strtoull(s.c_str() + 2, nullptr, 8));
    }
    return std::strtod(s.c_str(), nullptr);
  }
  static bool numLit(const Node& x, const frontend::Ast& ast, double& val) {
    if (x.kind == N::Number) { bool i; val = parseNumber(x.text, i); return true; }
    if (x.kind == N::Unary && (x.text == "-" || x.text == "+")) {
      double v;
      if (!numLit(ast.nodes[x.kids[0]], ast, v)) return false;
      val = x.text == "-" ? -v : v;
      return true;
    }
    return false;
  }

  TypeId natural(std::uint32_t node) { return L.irType(c.nodeType[node], node); }
  bool isNumTy(TypeId t) const { return ty(t).k == Type::K::Num; }
  bool isTupleObj(frontend::TypeId t) const { return c.types[t].k == frontend::TK::Object && c.objs[c.types[t].obj].isTuple; }

  ValueId exprTo(std::uint32_t node, TypeId want) { return coerce(expr(node, want), want); }

  ValueId toStr(ValueId v) { return ty(tv(v)).k == Type::K::Str ? v : emit(IrOp::ToStr, m.strT(), {v}); }

  IrOp arithOp(std::string_view op) {
    if (op == "+") return IrOp::Add;
    if (op == "-") return IrOp::Sub;
    if (op == "*") return IrOp::Mul;
    if (op == "/") return IrOp::Div;
    if (op == "%") return IrOp::Rem;
    if (op == "**") return IrOp::Pow;
    if (op == "&") return IrOp::And;
    if (op == "|") return IrOp::Or;
    if (op == "^") return IrOp::Xor;
    if (op == "<<") return IrOp::Shl;
    if (op == ">>") return IrOp::Shr;
    return IrOp::UShr;
  }

  TypeId commonNum(TypeId l, TypeId r) {
    if (l == r) return l;
    if (frontend::widens(ty(l).num, ty(r).num)) return r;
    if (frontend::widens(ty(r).num, ty(l).num)) return l;
    return m.numT(NumK::f64);
  }

  ValueId compare(std::uint32_t node, const Node& x) {
    std::uint32_t le = x.kids[0], re = x.kids[1];
    auto isNullLit = [&](std::uint32_t k) { return n(k).kind == N::Literal && n(k).text == "null"; };
    if (isNullLit(le) || isNullLit(re)) {  // x === null: compare with a null reference of x's type
      std::uint32_t other = isNullLit(le) ? re : le;
      ValueId o = expr(other);
      ValueId nl = emit(IrOp::Const, tv(o));
      std::string_view ox = x.text;
      IrOp cmp = (ox == "==" || ox == "===") ? IrOp::Eq : IrOp::Ne;
      return emit(cmp, m.boolT(), isNullLit(le) ? std::vector<ValueId>{nl, o} : std::vector<ValueId>{o, nl});
    }
    double dv;
    bool lLit = numLit(n(le), a, dv), rLit = numLit(n(re), a, dv);
    TypeId lt = natural(le), rt = natural(re), common;
    if (isNumTy(lt) && isNumTy(rt)) common = lLit && !rLit ? rt : rLit && !lLit ? lt : commonNum(lt, rt);
    else common = lt;
    ValueId l = exprTo(le, common), r = exprTo(re, common);
    std::string_view o = x.text;
    IrOp op = (o == "==" || o == "===") ? IrOp::Eq : (o == "!=" || o == "!==") ? IrOp::Ne : o == "<" ? IrOp::Lt : o == "<=" ? IrOp::Le : o == ">" ? IrOp::Gt : IrOp::Ge;
    (void)node;
    return emit(op, m.boolT(), {l, r});
  }

  // a || b and a && b on strings and numbers yield an operand: `a || b` is a when a is truthy, else b.
  ValueId truthy(ValueId v) {
    const Type t = ty(tv(v));
    if (t.k == Type::K::Str) return emit(IrOp::Gt, m.boolT(), {emit(IrOp::StrLen, m.numT(NumK::i32), {v}), constNum(m.numT(NumK::i32), 0)});
    if (t.k == Type::K::Num && (t.num == NumK::f64 || t.num == NumK::f32)) {  // NaN is falsy: abs(v) > 0 is false for it
      TypeId f64 = m.numT(NumK::f64);
      return emit(IrOp::Gt, m.boolT(), {builtin(Builtin::MathAbs, {coerce(v, f64)}, f64), constNum(f64, 0)});
    }
    return emit(IrOp::Ne, m.boolT(), {v, constNum(tv(v), 0)});
  }
  ValueId valueShortCircuit(std::uint32_t i, const Node& x, bool isAnd) {
    TypeId rt = natural(i);
    ValueId l = exprTo(x.kids[0], rt);
    BlockId rhs = newBlock(), join = newBlock();
    ValueId jp = newValue(rt);
    f.blocks[join].params.push_back(jp);
    ValueId cond = truthy(l);
    if (isAnd) terminate(IrOp::CondBr, {cond}, {Edge{rhs, {}}, Edge{join, {l}}});
    else terminate(IrOp::CondBr, {cond}, {Edge{join, {l}}, Edge{rhs, {}}});
    sealed[rhs] = 1;
    cur = rhs;
    br(join, {exprTo(x.kids[1], rt)});
    seal(join);
    cur = join;
    return jp;
  }

  ValueId shortCircuit(const Node& x, bool isAnd) {
    ValueId l = exprTo(x.kids[0], m.boolT());
    BlockId rhs = newBlock(), join = newBlock();
    ValueId jp = newValue(m.boolT());
    f.blocks[join].params.push_back(jp);
    if (isAnd) { terminate(IrOp::CondBr, {l}, {Edge{rhs, {}}, Edge{join, {l}}}); }
    else { terminate(IrOp::CondBr, {l}, {Edge{join, {l}}, Edge{rhs, {}}}); }
    sealed[rhs] = 1;
    cur = rhs;
    ValueId r = exprTo(x.kids[1], m.boolT());
    br(join, {r});
    seal(join);
    cur = join;
    return jp;
  }

  ValueId expr(std::uint32_t i, TypeId want = kNoValue) {
    const Node& x = n(i);
    switch (x.kind) {
      case N::Number: {
        bool isInt;
        double v = parseNumber(x.text, isInt);
        TypeId t = (want != kNoValue && isNumTy(want)) ? want : m.numT(NumK::f64);
        return constNum(t, v);
      }
      case N::String: return constStr(unescape(x.text.substr(1, x.text.size() - 2)));
      case N::Template: {
        ValueId acc = kNoValue;
        for (std::size_t k = 0; k < x.kids.size(); ++k) {
          ValueId part = (k % 2 == 0) ? constStr(unescape(n(x.kids[k]).text)) : toStr(expr(x.kids[k]));
          acc = acc == kNoValue ? part : emit(IrOp::StrConcat, m.strT(), {acc, part});
        }
        return acc;
      }
      case N::Literal:
        if (x.text == "null") {
          if (want != kNoValue && ty(want).k == Type::K::Ref) return emit(IrOp::Const, want);
          unsupported(i, "null without a reference type to give it");
          return constBool(false);
        }
        return constBool(x.text == "true");
      case N::This: return readVar(thisVar, cur);
      case N::Ident: {
        std::uint32_t s = c.nodeSym[i];
        if (s == kNil) return constNum(m.numT(NumK::f64), 0);
        if (c.syms[s].kind == SymKind::Builtin) return constNum(m.numT(NumK::f64), x.text == "NaN" ? std::nan("") : HUGE_VAL);
        if (c.syms[s].kind == SymKind::Func) {  // a function used as a value
          auto th = L.thunkOfSym.find(s);
          if (th == L.thunkOfSym.end()) { unsupported(i, "this function used as a value"); return constBool(false); }
          return emit(IrOp::New, m.refT(th->second.first), {}, 0, 0, th->second.first);
        }
        ValueId v = readSym(s);
        if (c.nodeType[i] != frontend::kNoType && c.types[c.nodeType[i]].k == frontend::TK::Object) return coerce(v, natural(i));  // a variable narrowed by instanceof
        return v;
      }
      case N::Array: {
        if (isTupleObj(c.nodeType[i])) {  // a tuple literal: a fresh object with one field per element
          std::uint32_t obj = c.types[c.nodeType[i]].obj, cls = L.classOfObj[obj];
          ValueId o = emit(IrOp::New, m.refT(cls), {}, 0, 0, cls);
          for (std::size_t k = 0; k < x.kids.size(); ++k) {
            TypeId ft = m.classes[cls].fields[k].type;
            emit(IrOp::SetField, m.voidT(), {o, exprTo(x.kids[k], ft)}, 0, 0, static_cast<std::uint32_t>(k));
          }
          return o;
        }
        TypeId at = natural(i);
        TypeId el = ty(at).aux;
        ValueId arr = emit(IrOp::ArrNew, at);
        for (std::uint32_t e : x.kids) {
          if (n(e).kind == N::Spread) { unsupported(e, "spread elements"); continue; }
          emit(IrOp::ArrPush, m.numT(NumK::i32), {arr, exprTo(e, el)});
        }
        return arr;
      }
      case N::ObjectLit: {  // a fresh object of the record class, fields set in source order
        std::uint32_t obj = c.types[c.nodeType[i]].obj, cls = L.classOfObj[obj];
        ValueId o = emit(IrOp::New, m.refT(cls), {}, 0, 0, cls);
        for (std::uint32_t p : x.kids) {
          std::uint32_t fi = L.fieldIndex(obj, n(p).text);
          emit(IrOp::SetField, m.voidT(), {o, exprTo(n(p).kids[0], m.classes[cls].fields[fi].type)}, 0, 0, fi);
        }
        return o;
      }
      case N::Binary: {
        std::string_view o = x.text;
        if (o == ",") { expr(x.kids[0]); return expr(x.kids[1], want); }
        if (o == "instanceof") {
          ValueId v = expr(x.kids[0]);
          std::uint32_t cls = L.classOfObj[c.types[c.nodeType[x.kids[1]]].obj];
          return emit(IrOp::InstOf, m.boolT(), {v}, 0, 0, cls);
        }
        if (o == "??") return nullish(i, x);
        if ((o == "&&" || o == "||") && ty(natural(i)).k != Type::K::Bool) return valueShortCircuit(i, x, o == "&&");
        if (o == "&&") return shortCircuit(x, true);
        if (o == "||") return shortCircuit(x, false);
        if (o == "==" || o == "===" || o == "!=" || o == "!==" || o == "<" || o == "<=" || o == ">" || o == ">=") return compare(i, x);
        TypeId rt = natural(i);
        if (ty(rt).k == Type::K::Str) {
          ValueId l = toStr(expr(x.kids[0])), r = toStr(expr(x.kids[1]));
          return emit(IrOp::StrConcat, rt, {l, r});
        }
        ValueId l = exprTo(x.kids[0], rt), r = exprTo(x.kids[1], rt);
        return emit(arithOp(o), rt, {l, r});
      }
      case N::Unary: {
        TypeId rt = natural(i);
        double v;
        if (x.text == "-" && numLit(x, a, v) && want != kNoValue && isNumTy(want)) return constNum(want, v);
        if (x.text == "!") return emit(IrOp::Not, m.boolT(), {exprTo(x.kids[0], m.boolT())});
        if (x.text == "-") return emit(IrOp::Neg, rt, {exprTo(x.kids[0], rt)});
        if (x.text == "+") return exprTo(x.kids[0], rt);
        if (x.text == "~") return emit(IrOp::BitNot, rt, {exprTo(x.kids[0], rt)});
        unsupported(i, "operator '" + std::string(x.text) + "'");
        return constBool(false);
      }
      case N::UpdatePre: case N::UpdatePost: {
        LVal lv = lvalue(x.kids[0]);
        ValueId old = load(lv);
        ValueId one = constNum(lv.type, 1);
        ValueId nv = emit(x.text == "++" ? IrOp::Add : IrOp::Sub, lv.type, {old, one});
        store(lv, nv);
        return x.kind == N::UpdatePre ? nv : old;
      }
      case N::Assign: {
        if (n(x.kids[0]).kind == N::ArrayPattern) {  // [a, b] = value: the value is evaluated before any target is written
          ValueId v = expr(x.kids[1]);
          bindPattern(x.kids[0], v);
          return v;
        }
        LVal lv = lvalue(x.kids[0]);
        ValueId nv;
        if (x.text == "=") nv = exprTo(x.kids[1], lv.type);
        else {
          std::string_view bop = x.text.substr(0, x.text.size() - 1);
          ValueId old = load(lv);
          if (ty(lv.type).k == Type::K::Str) nv = emit(IrOp::StrConcat, lv.type, {old, toStr(expr(x.kids[1]))});
          else {
            bool shift = bop == "&" || bop == "|" || bop == "^" || bop == "<<" || bop == ">>" || bop == ">>>";
            TypeId opT = shift ? m.numT(bop == ">>>" ? NumK::u32 : NumK::i32) : natural(x.kids[1]);
            // result kind of the operation per the checker's arith rule: recompute from operand types
            TypeId lt = lv.type, rt = natural(x.kids[1]);
            double dv;
            bool rLit = numLit(n(x.kids[1]), a, dv);
            if (!shift) {
              bool isDiv = bop == "/" || bop == "**";
              TypeId r = rLit && !isDiv && ty(lt).num != NumK::f64 && ty(lt).num != NumK::f32 ? lt : commonNum(lt, rt);
              if (isDiv && !(ty(r).num == NumK::f32 || ty(r).num == NumK::f64)) r = m.numT(NumK::f64);
              opT = r;
            }
            ValueId r = exprTo(x.kids[1], opT);
            nv = coerce(emit(arithOp(bop), opT, {coerce(old, opT), r}), lv.type);
          }
        }
        store(lv, nv);
        return nv;
      }
      case N::Cond: {
        TypeId rt = natural(i);
        ValueId cond = exprTo(x.kids[0], m.boolT());
        BlockId tb = newBlock(), eb = newBlock(), join = newBlock();
        ValueId jp = newValue(rt);
        f.blocks[join].params.push_back(jp);
        condbr(cond, tb, eb);
        sealed[tb] = sealed[eb] = 1;
        cur = tb; ValueId a1 = exprTo(x.kids[1], rt); br(join, {a1});
        cur = eb; ValueId b1 = exprTo(x.kids[2], rt); br(join, {b1});
        seal(join);
        cur = join;
        return jp;
      }
      case N::FuncExpr: {  // a closure: an object holding the captured variables
        const Lowering::LambdaInfo& li = L.lambdas.at(i);
        ValueId o = emit(IrOp::New, m.refT(li.cls), {}, 0, 0, li.cls);
        for (std::size_t k = 0; k < li.caps.size(); ++k) {
          std::uint32_t sym = li.caps[k];
          ValueId v = L.isCell(sym) ? storageOf(sym) : readSym(sym);  // a cell is shared, anything else is copied
          emit(IrOp::SetField, m.voidT(), {o, coerce(v, m.classes[li.cls].fields[k].type)}, 0, 0, static_cast<std::uint32_t>(k));
        }
        if (li.thisField >= 0) emit(IrOp::SetField, m.voidT(), {o, coerce(readVar(thisVar, cur), m.classes[li.cls].fields[static_cast<std::size_t>(li.thisField)].type)}, 0, 0, static_cast<std::uint32_t>(li.thisField));
        return o;
      }
      case N::Call: return call(i, x);
      case N::New: return newObject(i, x);
      case N::Member: {
        const Node& on = n(x.kids[0]);
        std::uint32_t os = on.kind == N::Ident ? c.nodeSym[x.kids[0]] : kNil;
        if (os != kNil && c.syms[os].kind == SymKind::Builtin) {
          return constNum(m.numT(NumK::f64), x.text == "PI" ? 3.14159265358979323846 : 2.71828182845904523536);
        }
        if (os != kNil && c.syms[os].kind == SymKind::Class) {  // Class.staticField
          const frontend::Member* sm = frontend::lookupMember(c, c.types[c.syms[os].type].obj, x.text, true);
          return emit(IrOp::GetGlobal, natural(i), {}, 0, 0, L.staticGlobal[Lowering::mkey(sm->owner, x.text)]);
        }
        if (os != kNil && c.syms[os].kind == SymKind::Enum) {  // Enum.Member: a constant
          for (const auto& [nm, v] : c.enumMembers.at(os)) if (nm == x.text) return constNum(m.numT(NumK::i32), static_cast<double>(v));
        }
        frontend::TypeId ot = c.nodeType[x.kids[0]];
        const frontend::Type& ct = c.types[ot];
        ValueId obj = expr(x.kids[0]);
        if (ct.k == frontend::TK::Object) {
          const frontend::Member* gm = frontend::lookupMember(c, ct.obj, x.text, false);
          if (gm && gm->getter) {  // reading an accessor calls it
            std::uint32_t direct = kNil;
            if (L.devirtualize(ct.obj, x.text, direct)) {
              const Function& cf = m.functions[direct];
              return callFunction(direct, {coerce(obj, cf.valueTypes[cf.params[0]])}, x.kids, x.kids.size());
            }
            std::uint32_t sel = L.selectorFor(std::string(x.text), gm->type);
            return emit(IrOp::CallVirt, m.selectors[sel].ret, {obj}, 0, 0, sel);
          }
        }
        if (ct.k == frontend::TK::Array) return emit(IrOp::ArrLen, m.numT(NumK::i32), {obj});
        if (ct.k == frontend::TK::Str) return emit(IrOp::StrLen, m.numT(NumK::i32), {obj});
        if (ct.k == frontend::TK::Map || ct.k == frontend::TK::Set) return emit(IrOp::Rt, m.numT(NumK::i32), {obj}, 0, 0, static_cast<std::uint32_t>(ct.k == frontend::TK::Map ? zn::Rt::MapSize : zn::Rt::SetSize));
        std::uint32_t fi = L.fieldIndex(ct.obj, x.text);
        return emit(IrOp::GetField, natural(i), {obj}, 0, 0, fi);
      }
      case N::Index: {
        if (isTupleObj(c.nodeType[x.kids[0]])) {  // t[k] with a constant k: a field
          ValueId obj = expr(x.kids[0]);
          auto k = static_cast<std::uint32_t>(std::strtoull(std::string(n(x.kids[1]).text).c_str(), nullptr, 10));
          return emit(IrOp::GetField, natural(i), {obj}, 0, 0, k);
        }
        ValueId arr = expr(x.kids[0]);
        ValueId idx = exprTo(x.kids[1], m.numT(NumK::i32));
        return emit(IrOp::ArrGet, natural(i), {arr, idx});
      }
      default: unsupported(i, "this expression"); return constBool(false);
    }
  }

  // ---- lvalues
  struct LVal { enum K { Var, Field, Elem, Static } k; std::uint32_t sym = kNil; ValueId obj = kNoValue, idx = kNoValue; std::uint32_t field = 0; TypeId type = 0; };
  LVal lvalue(std::uint32_t node) {
    const Node& x = n(node);
    LVal lv;
    lv.type = natural(node);
    if (x.kind == N::Ident) { lv.k = LVal::Var; lv.sym = c.nodeSym[node]; return lv; }
    if (x.kind == N::Member) {
      std::uint32_t os = n(x.kids[0]).kind == N::Ident ? c.nodeSym[x.kids[0]] : kNil;
      if (os != kNil && c.syms[os].kind == SymKind::Class) {  // Class.staticField
        const frontend::Member* sm = frontend::lookupMember(c, c.types[c.syms[os].type].obj, x.text, true);
        lv.k = LVal::Static;
        lv.field = L.staticGlobal[Lowering::mkey(sm->owner, x.text)];
        return lv;
      }
      lv.k = LVal::Field;
      lv.obj = expr(x.kids[0]);
      lv.field = L.fieldIndex(c.types[c.nodeType[x.kids[0]]].obj, x.text);
      return lv;
    }
    if (isTupleObj(c.nodeType[x.kids[0]])) {
      lv.k = LVal::Field;
      lv.obj = expr(x.kids[0]);
      lv.field = static_cast<std::uint32_t>(std::strtoull(std::string(n(x.kids[1]).text).c_str(), nullptr, 10));
      return lv;
    }
    lv.k = LVal::Elem;
    lv.obj = expr(x.kids[0]);
    lv.idx = exprTo(x.kids[1], m.numT(NumK::i32));
    return lv;
  }
  ValueId load(const LVal& lv) {
    if (lv.k == LVal::Var) return readSym(lv.sym);
    if (lv.k == LVal::Static) return emit(IrOp::GetGlobal, lv.type, {}, 0, 0, lv.field);
    if (lv.k == LVal::Field) return emit(IrOp::GetField, lv.type, {lv.obj}, 0, 0, lv.field);
    return emit(IrOp::ArrGet, lv.type, {lv.obj, lv.idx});
  }
  void store(const LVal& lv, ValueId v) {
    v = coerce(v, lv.type);
    if (lv.k == LVal::Var) writeSym(lv.sym, v);
    else if (lv.k == LVal::Static) emit(IrOp::SetGlobal, m.voidT(), {v}, 0, 0, lv.field);
    else if (lv.k == LVal::Field) emit(IrOp::SetField, m.voidT(), {lv.obj, v}, 0, 0, lv.field);
    else emit(IrOp::ArrSet, m.voidT(), {lv.obj, lv.idx, v});
  }

  // ---- calls
  ValueId callFunction(std::uint32_t fn, std::vector<ValueId> recv, const std::vector<std::uint32_t>& args, std::size_t firstArg) {
    const Function& cf = m.functions[fn];
    std::vector<ValueId> vs = std::move(recv);
    for (std::size_t k = firstArg; k < args.size(); ++k) {
      std::size_t pi = vs.size();
      TypeId pt = pi < cf.params.size() ? cf.valueTypes[cf.params[pi]] : m.voidT();
      vs.push_back(exprTo(args[k], pt));
    }
    return emit(IrOp::Call, cf.ret, std::move(vs), 0, 0, fn);
  }

  ValueId builtin(Builtin b, std::vector<ValueId> args, TypeId ret) { return emit(IrOp::Builtin, ret, std::move(args), 0, 0, static_cast<std::uint32_t>(b)); }

  // The IR type a letter of the runtime table (zn/runtime.h) stands for, given the receiver's IR type.
  TypeId rtIrType(char l, TypeId recv) {
    const Type r = ty(recv);
    switch (l) {
      case 's': case 'w': return m.strT();
      case 'i': case 'j': case 'z': return m.numT(NumK::i32);
      case 'b': return m.boolT();
      case 'd': return m.numT(NumK::f64);
      case 'n': return m.voidT();
      case 'a': case 'm': case 't': return recv;
      case 'e': case 'v': return r.aux;
      case 'k': return r.aux2;
      case 'A': case 'V': return m.arrayT(r.aux);
      case 'K': return m.arrayT(r.aux2);
      case 'S': return m.arrayT(m.strT());
      default: return m.voidT();
    }
  }
  // recv.member(args) on a string, array, Map or Set: one Rt call; an omitted trailing `j` argument is INT32_MAX.
  ValueId rtMemberCall(const Node& callee, const std::vector<std::uint32_t>& args, ValueId recv, const char* owner) {
    for (const RtInfo& r : kRtInfo) {
      if ((r.flags & 2) || !rtOwnedBy(r, owner) || callee.text != rtMember(r)) continue;
      TypeId rtyp = tv(recv);
      std::vector<ValueId> vs{recv};
      for (unsigned k = 1; k < rtParamCount(r); ++k) {
        char l = rtParam(r, k);
        if (k < args.size()) {
          if (l == 'c') vs.push_back(coerce(expr(args[k]), L.irType(c.nodeType[args[k]])));  // the comparator keeps its own function type
          else vs.push_back(exprTo(args[k], rtIrType(l, rtyp)));
        } else if (l == 'w') vs.push_back(constStr(" "));
        else vs.push_back(constNum(m.numT(NumK::i32), l == 'z' ? 0 : 2147483647));
      }
      return emit(IrOp::Rt, rtIrType(rtRet(r), rtyp), std::move(vs), 0, 0, static_cast<std::uint32_t>(r.id));
    }
    return kNoValue;
  }

  // a ?? b. A Map.get has no null to test: ask the Map whether it holds the key.
  ValueId nullish(std::uint32_t i, const Node& x) {
    TypeId rt = natural(i);
    const Node& ln = n(x.kids[0]);
    BlockId hb = newBlock(), eb = newBlock(), join = newBlock();
    ValueId jp = newValue(rt);
    f.blocks[join].params.push_back(jp);
    bool mapGet = false;
    if (ln.kind == N::Call && n(ln.kids[0]).kind == N::Member && n(ln.kids[0]).text == "get") {
      const frontend::Type& mt = c.types[c.nodeType[n(ln.kids[0]).kids[0]]];
      mapGet = mt.k == frontend::TK::Map;
    }
    if (mapGet) {
      ValueId mp = expr(n(ln.kids[0]).kids[0]);
      ValueId key = exprTo(ln.kids[1], ty(tv(mp)).aux2);
      ValueId has = emit(IrOp::Rt, m.boolT(), {mp, key}, 0, 0, static_cast<std::uint32_t>(zn::Rt::MapHas));
      condbr(has, hb, eb);
      sealed[hb] = sealed[eb] = 1;
      cur = hb;
      ValueId g = emit(IrOp::Rt, ty(tv(mp)).aux, {mp, key}, 0, 0, static_cast<std::uint32_t>(zn::Rt::MapGet));
      br(join, {coerce(g, rt)});
    } else {
      ValueId l = expr(x.kids[0]);
      ValueId nl = emit(IrOp::Const, tv(l));
      condbr(emit(IrOp::Ne, m.boolT(), {l, nl}), hb, eb);
      sealed[hb] = sealed[eb] = 1;
      cur = hb;
      br(join, {coerce(l, rt)});
    }
    cur = eb;
    ValueId d = exprTo(x.kids[1], rt);
    br(join, {d});
    seal(join);
    cur = join;
    return jp;
  }

  ValueId thisValue(std::uint32_t asObj) {
    ValueId t = readVar(thisVar, cur);
    return coerce(t, m.refT(L.classOfObj[asObj]));
  }
  std::uint32_t currentObj() { return c.types[c.nodeType[job.classNode]].obj; }

  // Is this call a call of a function value (a variable, a field, a call result, a lambda) rather than of a declared function or method?
  bool isValueCall(const Node& callee, std::uint32_t calleeId) {
    frontend::TypeId ct = c.nodeType[calleeId];
    if (ct == frontend::kNoType || c.types[ct].k != frontend::TK::Func) return false;
    if (callee.kind == N::Ident) {
      std::uint32_t sy = c.nodeSym[calleeId];
      return sy != kNil && c.syms[sy].kind != SymKind::Func && c.syms[sy].kind != SymKind::Builtin;
    }
    if (callee.kind == N::Member) {
      const Node& on = n(callee.kids[0]);
      if (on.kind == N::Super) return false;
      if (on.kind == N::Ident && c.nodeSym[callee.kids[0]] != kNil && (c.syms[c.nodeSym[callee.kids[0]]].kind == SymKind::Class || c.syms[c.nodeSym[callee.kids[0]]].kind == SymKind::Builtin)) return false;
      frontend::TypeId ot = c.nodeType[callee.kids[0]];
      if (ot == frontend::kNoType || c.types[ot].k != frontend::TK::Object) return false;
      const frontend::Member* mem = frontend::lookupMember(c, c.types[ot].obj, callee.text, false);
      return mem && !mem->method;
    }
    return callee.kind != N::Super;
  }

  ValueId call(std::uint32_t i, const Node& x) {
    const Node& callee = n(x.kids[0]);
    if (isValueCall(callee, x.kids[0])) {  // f(args): the closure's `call` through its function type's vtable
      frontend::TypeId ftype = c.nodeType[x.kids[0]];
      ValueId fv = coerce(expr(x.kids[0]), L.irType(ftype));
      const Selector& sg = m.selectors[L.selectorFor("call", ftype)];
      std::vector<ValueId> vs{fv};
      for (std::size_t k = 0; k < sg.params.size(); ++k) vs.push_back(exprTo(x.kids[k + 1], sg.params[k]));
      return emit(IrOp::CallVirt, sg.ret, std::move(vs), 0, 0, L.selectorFor("call", ftype));
    }
    if (callee.kind == N::Super) {  // super(args): the base class constructor, if it has a function
      std::uint32_t par = c.objs[currentObj()].parent;
      auto it = L.ctorOfClass.find(L.classOfObj[par]);
      if (it == L.ctorOfClass.end()) return kNoValue;
      return callFunction(it->second, {thisValue(par)}, x.kids, 1);
    }
    if (callee.kind == N::Ident) {
      std::uint32_t s = c.nodeSym[x.kids[0]];
      if (s != kNil && c.syms[s].kind == SymKind::Func) return callFunction(L.funcOfNode[c.syms[s].decl], {}, x.kids, 1);
      if (s != kNil && c.syms[s].kind == SymKind::Builtin && (callee.text == "parseInt" || callee.text == "parseFloat")) {
        bool isInt = callee.text == "parseInt";
        std::vector<ValueId> vs{exprTo(x.kids[1], m.strT())};
        if (isInt) vs.push_back(x.kids.size() > 2 ? exprTo(x.kids[2], m.numT(NumK::i32)) : constNum(m.numT(NumK::i32), 0));
        return emit(IrOp::Rt, m.numT(NumK::f64), std::move(vs), 0, 0, static_cast<std::uint32_t>(isInt ? zn::Rt::ParseInt : zn::Rt::ParseFloat));
      }
    } else if (callee.kind == N::Member) {
      const Node& on = n(callee.kids[0]);
      std::uint32_t os = on.kind == N::Ident ? c.nodeSym[callee.kids[0]] : kNil;
      if (on.kind == N::Super) {  // super.method(args): the base implementation, called directly
        std::uint32_t par = c.objs[currentObj()].parent;
        std::uint32_t fn = L.resolveMethod(par, callee.text);
        if (fn != kNil) return callFunction(fn, {thisValue(par)}, x.kids, 1);
      } else if (os != kNil && c.syms[os].kind == SymKind::Builtin) {
        std::string full = std::string(on.text) + "." + std::string(callee.text);
        if (full == "String.fromCharCode") return emit(IrOp::Rt, m.strT(), {exprTo(x.kids[1], m.numT(NumK::i32))}, 0, 0, static_cast<std::uint32_t>(zn::Rt::FromCharCode));
        if (full == "Math.imul") { TypeId i32 = m.numT(NumK::i32); ValueId l = exprTo(x.kids[1], i32), r = exprTo(x.kids[2], i32); return emit(IrOp::Mul, i32, {l, r}); }
        for (std::uint32_t b = 0; b < static_cast<std::uint32_t>(Builtin::Count); ++b) {
          if (full != builtinName(static_cast<Builtin>(b))) continue;
          std::vector<ValueId> vs;
          bool log = static_cast<Builtin>(b) == Builtin::ConsoleLog;
          for (std::size_t k = 1; k < x.kids.size(); ++k) vs.push_back(log ? expr(x.kids[k]) : exprTo(x.kids[k], m.numT(NumK::f64)));
          return builtin(static_cast<Builtin>(b), std::move(vs), log ? m.voidT() : m.numT(NumK::f64));
        }
      } else if (os != kNil && c.syms[os].kind == SymKind::Class) {  // Class.staticMethod(args)
        const frontend::Member* sm = frontend::lookupMember(c, c.types[c.syms[os].type].obj, callee.text, true);
        auto it = L.staticFn.find(Lowering::mkey(sm->owner, callee.text));
        if (it != L.staticFn.end()) return callFunction(it->second, {}, x.kids, 1);
      } else {
        const frontend::Type& ct = c.types[c.nodeType[callee.kids[0]]];
        ValueId recv = expr(callee.kids[0]);
        if (ct.k == frontend::TK::Array) {
          TypeId el = L.irType(ct.elem);
          if (callee.text == "push") return emit(IrOp::ArrPush, m.numT(NumK::i32), {recv, exprTo(x.kids[1], el)});
          if (callee.text == "pop") return emit(IrOp::ArrPop, el, {recv});
        }
        if (ct.k == frontend::TK::Num && callee.text == "toString") return emit(IrOp::ToStr, m.strT(), {recv});
        if (ct.k == frontend::TK::Str || ct.k == frontend::TK::Array || ct.k == frontend::TK::Map || ct.k == frontend::TK::Set) {
          ValueId r = rtMemberCall(callee, x.kids, recv, ct.k == frontend::TK::Str ? "string" : ct.k == frontend::TK::Array ? "Array" : ct.k == frontend::TK::Map ? "Map" : "Set");
          if (r != kNoValue || ty(tv(recv)).k != Type::K::Void) return r;
        } else if (ct.k == frontend::TK::Num && callee.text == "toFixed") {
          ValueId digits = exprTo(x.kids[1], m.numT(NumK::i32));
          return builtin(Builtin::NumToFixed, {coerce(recv, m.numT(NumK::f64)), digits}, m.strT());
        } else if (ct.k == frontend::TK::Object) {
          std::uint32_t direct = kNil;
          if (L.devirtualize(ct.obj, callee.text, direct)) {  // one possible implementation in the closed world
            const Function& cf = m.functions[direct];
            return callFunction(direct, {coerce(recv, cf.valueTypes[cf.params[0]])}, x.kids, 1);
          }
          std::uint32_t sel = L.selectorFor(std::string(callee.text), c.nodeType[x.kids[0]]);
          const Selector& sg = m.selectors[sel];
          std::vector<ValueId> vs{recv};
          for (std::size_t k = 0; k < sg.params.size(); ++k) vs.push_back(exprTo(x.kids[k + 1], sg.params[k]));
          return emit(IrOp::CallVirt, sg.ret, std::move(vs), 0, 0, sel);
        }
      }
    }
    unsupported(i, "this call");
    return constBool(false);
  }

  ValueId newObject(std::uint32_t i, const Node& x) {
    if (c.types[c.nodeType[i]].k == frontend::TK::Map || c.types[c.nodeType[i]].k == frontend::TK::Set) return emit(IrOp::ArrNew, L.irType(c.nodeType[i]));
    std::uint32_t s = c.nodeSym[x.kids[0]];
    std::uint32_t obj = c.types[c.syms[s].type].obj, cls = L.classOfObj[obj];
    (void)i;
    ValueId o = emit(IrOp::New, m.refT(cls), {}, 0, 0, cls);
    auto it = L.ctorOfClass.find(cls);
    if (it != L.ctorOfClass.end()) callFunction(it->second, {o}, x.kids, 1);
    return o;
  }

  // ---- statements
  // ---- destructuring: write the elements or properties of `v` into the pattern's targets
  void assignTarget(std::uint32_t node, ValueId val, bool isDecl) {
    const Node& x = n(node);
    if (x.kind == N::ArrayPattern || x.kind == N::ObjectPattern) { bindPattern(node, val, isDecl); return; }
    if (x.kind == N::Ident) {
      std::uint32_t sym = c.nodeSym[node];
      ValueId cv = coerce(val, L.irType(c.syms[sym].type));
      if (isDecl) declSym(sym, cv); else writeSym(sym, cv);
      return;
    }
    LVal lv = lvalue(node);
    store(lv, val);
  }
  void bindPattern(std::uint32_t pat, ValueId v, bool isDecl = false) {
    const Node& p = n(pat);
    frontend::TypeId vt = c.nodeType[pat];
    const frontend::Type& ct = c.types[vt];
    if (p.kind == N::ArrayPattern) {
      bool tup = isTupleObj(vt);
      for (std::size_t k = 0; k < p.kids.size(); ++k) {
        std::uint32_t e = p.kids[k];
        if (n(e).kind == N::Empty) continue;
        if (n(e).kind == N::Spread) { unsupported(e, "rest patterns"); continue; }
        ValueId elem;
        if (tup) elem = emit(IrOp::GetField, L.irType(c.objs[ct.obj].members[k].type), {v}, 0, 0, static_cast<std::uint32_t>(k));
        else elem = emit(IrOp::ArrGet, L.irType(ct.elem), {v, constNum(m.numT(NumK::i32), static_cast<double>(k))});
        assignTarget(e, elem, isDecl);
      }
      return;
    }
    for (std::uint32_t pp : p.kids) {  // {a, b: x}: fields of a class instance
      std::uint32_t fi = L.fieldIndex(ct.obj, n(pp).text);
      ValueId prop = emit(IrOp::GetField, L.irType(c.nodeType[pp]), {v}, 0, 0, fi);
      assignTarget(n(pp).kids[0], prop, isDecl);
    }
  }

  void declare(std::uint32_t d, bool) {
    const Node& x = n(d);
    if (x.kids.size() > 2 && x.kids[2] != kNil) {  // const [a, b] = ... / const {x, y} = ...
      bindPattern(x.kids[2], expr(x.kids[1]), true);
      return;
    }
    std::uint32_t s = c.nodeSym[d];
    TypeId t = L.irType(c.syms[s].type, d);
    ValueId v = exprTo(x.kids[1], t);
    declSym(s, v);
  }

  void loopBody(std::uint32_t body, BlockId brk, BlockId cont) {
    loopTargets.push_back({brk, cont});
    stmt(body);
    loopTargets.pop_back();
  }

  void stmt(std::uint32_t s) {
    const Node& x = n(s);
    switch (x.kind) {
      case N::Empty: case N::Function: case N::Interface: case N::TypeAlias: case N::Enum: break;
      case N::Switch: {  // a chain of tests, then the clause bodies in order so a clause without `break` falls into the next
        ValueId disc = expr(x.kids[0]);
        TypeId dt = tv(disc);
        std::size_t nc = x.kids.size() - 1, defIdx = nc;
        BlockId end = newBlock();
        std::vector<BlockId> bodies(nc);
        for (BlockId& b : bodies) b = newBlock();
        for (std::size_t k = 0; k < nc; ++k) if (n(x.kids[1 + k]).kids[0] == kNil) defIdx = k;
        for (std::size_t k = 0; k < nc; ++k) {
          std::uint32_t test = n(x.kids[1 + k]).kids[0];
          if (test == kNil) continue;
          ValueId eq = emit(IrOp::Eq, m.boolT(), {disc, exprTo(test, dt)});
          BlockId next = newBlock();
          condbr(eq, bodies[k], next);
          sealed[next] = 1;
          cur = next;
        }
        br(defIdx < nc ? bodies[defIdx] : end);
        loopTargets.push_back({end, loopTargets.empty() ? end : loopTargets.back().second});
        for (std::size_t k = 0; k < nc; ++k) {
          sealed[bodies[k]] = 1;
          cur = bodies[k];
          const Node& cl = n(x.kids[1 + k]);
          for (std::size_t j = 1; j < cl.kids.size(); ++j) stmt(cl.kids[j]);
          br(k + 1 < nc ? bodies[k + 1] : end);
        }
        loopTargets.pop_back();
        seal(end);
        cur = end;
        break;
      }
      case N::Class: {  // static field initialisers run where the class is declared
        if (c.nodeType[s] == frontend::kNoType) break;  // a generic template
        std::uint32_t obj = c.types[c.nodeType[s]].obj;
        for (std::size_t k = frontend::kClassMembersFrom; k < x.kids.size(); ++k) {
          const Node& mn = n(x.kids[k]);
          if (mn.kind != N::Field || !(mn.flags & frontend::kFlagStatic) || mn.kids[1] == kNil) continue;
          std::uint32_t g = L.staticGlobal[Lowering::mkey(obj, mn.text)];
          emit(IrOp::SetGlobal, m.voidT(), {exprTo(mn.kids[1], m.globals[g].type)}, 0, 0, g);
        }
        break;
      }
      case N::Block: for (std::uint32_t k : x.kids) stmt(k); break;
      case N::VarDecl: for (std::uint32_t d : x.kids) declare(d, x.text == "const"); break;
      case N::ExprStmt: expr(x.kids[0]); break;
      case N::If: {
        ValueId cond = exprTo(x.kids[0], m.boolT());
        BlockId tb = newBlock(), join = newBlock(), eb = x.kids[2] != kNil ? newBlock() : join;
        condbr(cond, tb, eb);
        sealed[tb] = 1;
        if (eb != join) sealed[eb] = 1;
        cur = tb; stmt(x.kids[1]); br(join);
        if (eb != join) { cur = eb; stmt(x.kids[2]); br(join); }
        seal(join);
        cur = join;
        break;
      }
      case N::While: {
        BlockId header = newBlock(), body = newBlock(), exit = newBlock();
        br(header);
        cur = header;
        condbr(exprTo(x.kids[0], m.boolT()), body, exit);
        sealed[body] = 1;
        cur = body; loopBody(x.kids[1], exit, header); br(header);
        seal(header);
        seal(exit);
        cur = exit;
        break;
      }
      case N::DoWhile: {
        BlockId body = newBlock(), test = newBlock(), exit = newBlock();
        br(body);
        cur = body; loopBody(x.kids[0], exit, test); br(test);
        seal(test);
        cur = test;
        ValueId cond = exprTo(x.kids[1], m.boolT());
        condbr(cond, body, exit);
        seal(body);
        seal(exit);
        cur = exit;
        break;
      }
      case N::For: {
        if (x.kids[0] != kNil && n(x.kids[0]).kind == N::VarDecl)
          for (std::uint32_t d : n(x.kids[0]).kids) if (c.nodeSym[d] != kNil && L.isCell(c.nodeSym[d])) unsupported(d, "a closure capturing a loop variable that the loop modifies");
        if (x.kids[0] != kNil) { if (n(x.kids[0]).kind == N::VarDecl) stmt(x.kids[0]); else expr(x.kids[0]); }
        BlockId header = newBlock(), body = newBlock(), update = newBlock(), exit = newBlock();
        br(header);
        cur = header;
        if (x.kids[1] != kNil) condbr(exprTo(x.kids[1], m.boolT()), body, exit); else br(body);
        sealed[body] = 1;
        cur = body; loopBody(x.kids[3], exit, update); br(update);
        seal(update);
        cur = update;
        if (x.kids[2] != kNil) expr(x.kids[2]);
        br(header);
        seal(header);
        seal(exit);
        cur = exit;
        break;
      }
      case N::ForOf: {
        ValueId arr = expr(x.kids[1]);
        std::uint32_t arrVar = nextVar++, idxVar = nextVar++;
        TypeId i32 = m.numT(NumK::i32);
        writeVar(arrVar, arr);
        writeVar(idxVar, constNum(i32, 0));
        BlockId header = newBlock(), body = newBlock(), update = newBlock(), exit = newBlock();
        br(header);
        cur = header;
        ValueId idx = readVar(idxVar, cur), a1 = readVar(arrVar, cur);
        ValueId len = emit(IrOp::ArrLen, i32, {a1});
        condbr(emit(IrOp::Lt, m.boolT(), {idx, len}), body, exit);
        sealed[body] = 1;
        cur = body;
        ValueId elem = emit(IrOp::ArrGet, ty(tv(arr)).aux, {readVar(arrVar, cur), readVar(idxVar, cur)});
        if (n(x.kids[0]).kids.size() > 2 && n(x.kids[0]).kids[2] != kNil) bindPattern(n(x.kids[0]).kids[2], elem, true);
        else declSym(c.nodeSym[x.kids[0]], elem);
        loopBody(x.kids[2], exit, update);
        br(update);
        seal(update);
        cur = update;
        writeVar(idxVar, emit(IrOp::Add, i32, {readVar(idxVar, cur), constNum(i32, 1)}));
        br(header);
        seal(header);
        seal(exit);
        cur = exit;
        break;
      }
      case N::Return: {
        if (x.kids[0] == kNil) terminate(IrOp::Ret, {}, {});
        else terminate(IrOp::Ret, {exprTo(x.kids[0], f.ret)}, {});
        startDead();
        break;
      }
      case N::Break: terminate(IrOp::Br, {}, {Edge{loopTargets.back().first, {}}}); startDead(); break;
      case N::Continue: terminate(IrOp::Br, {}, {Edge{loopTargets.back().second, {}}}); startDead(); break;
      default: unsupported(s, "this statement"); break;
    }
  }

  // ---- cleanup passes
  void removeUnreachable() {
    std::size_t nb = f.blocks.size();
    std::vector<char> reach(nb, 0);
    std::vector<BlockId> st{0};
    reach[0] = 1;
    while (!st.empty()) {
      BlockId b = st.back(); st.pop_back();
      for (const Inst& i : f.blocks[b].insts) for (const Edge& e : i.edges) if (!reach[e.to]) { reach[e.to] = 1; st.push_back(e.to); }
    }
    std::vector<BlockId> remap(nb, 0);
    std::vector<Block> kept;
    for (BlockId b = 0; b < nb; ++b) if (reach[b]) { remap[b] = static_cast<BlockId>(kept.size()); kept.push_back(std::move(f.blocks[b])); }
    for (Block& b : kept) for (Inst& i : b.insts) for (Edge& e : i.edges) e.to = remap[e.to];
    f.blocks = std::move(kept);
  }

  void replaceUses(ValueId from, ValueId to) {
    for (Block& b : f.blocks) for (Inst& i : b.insts) {
      for (ValueId& v : i.args) if (v == from) v = to;
      for (Edge& e : i.edges) for (ValueId& v : e.args) if (v == from) v = to;
    }
  }

  void simplifyParams() {
    for (bool changed = true; changed;) {
      changed = false;
      std::vector<std::vector<Edge*>> incoming(f.blocks.size());
      for (Block& b : f.blocks) for (Inst& i : b.insts) for (Edge& e : i.edges) incoming[e.to].push_back(&e);
      for (BlockId b = 1; b < f.blocks.size() && !changed; ++b) {
        for (std::size_t p = f.blocks[b].params.size(); p-- > 0 && !changed;) {
          ValueId pv = f.blocks[b].params[p], same = kNoValue;
          bool trivial = true;
          for (Edge* e : incoming[b]) {
            ValueId v = e->args[p];
            if (v == pv) continue;
            if (same == kNoValue) same = v; else if (same != v) { trivial = false; break; }
          }
          if (!trivial || same == kNoValue) continue;
          replaceUses(pv, same);
          f.blocks[b].params.erase(f.blocks[b].params.begin() + static_cast<std::ptrdiff_t>(p));
          for (Edge* e : incoming[b]) e->args.erase(e->args.begin() + static_cast<std::ptrdiff_t>(p));
          changed = true;
        }
      }
    }
  }

  void compact() {  // dense value ids in definition order, for a stable dump
    std::vector<ValueId> remap(f.valueTypes.size(), kNoValue);
    std::vector<TypeId> types;
    auto def = [&](ValueId v) { remap[v] = static_cast<ValueId>(types.size()); types.push_back(f.valueTypes[v]); };
    for (Block& b : f.blocks) {
      for (ValueId p : b.params) def(p);
      for (Inst& i : b.insts) if (i.res != kNoValue) def(i.res);
    }
    for (Block& b : f.blocks) {
      for (ValueId& p : b.params) p = remap[p];
      for (Inst& i : b.insts) {
        for (ValueId& v : i.args) v = remap[v];
        for (Edge& e : i.edges) for (ValueId& v : e.args) v = remap[v];
        if (i.res != kNoValue) i.res = remap[i.res];
      }
    }
    f.valueTypes = std::move(types);
    f.params = f.blocks[0].params;
  }

  // ---- entry
  void run() {
    BlockId entry = newBlock();
    sealed[entry] = 1;
    cur = entry;
    f.blocks[entry].params = f.params;
    std::size_t first = 0;
    if (job.cls != kNil) {
      writeVar(thisVar, f.params[0]);
      first = 1;
    }
    if (lam) {  // the closure object is the first parameter
      first = 1;
      if (lam->thisField >= 0) writeVar(thisVar, emit(IrOp::GetField, m.classes[lam->cls].fields[static_cast<std::size_t>(lam->thisField)].type, {f.params[0]}, 0, 0, static_cast<std::uint32_t>(lam->thisField)));
    }
    const Node* fn = job.node == kNil ? nullptr : &n(job.node);
    if (fn && fn->kind != N::Class) {  // Function or Method: parameters become variables
      for (std::size_t k = 0; k < fn->kids.size() - 2; ++k) {
        std::uint32_t p = fn->kids[2 + k];
        if (n(p).kids.size() > 2 && n(p).kids[2] != kNil) { bindPattern(n(p).kids[2], f.params[first + k], true); continue; }
        std::uint32_t ps = c.nodeSym[p];
        if (ps != kNil && !L.global[ps]) declSym(ps, f.params[first + k]);
        if (n(p).kids[1] != kNil) L.unsupported(p, "default parameter values in the IR");
      }
    }
    const std::vector<std::uint32_t>* body = nullptr;
    if (job.node == kNil) body = &n(a.root).kids;
    else if (fn->kind != N::Class && fn->kids[1] != kNil) body = &n(fn->kids[1]).kids;
    std::size_t idx = 0;
    if (job.ctor) {  // [super(...)] [parameter properties] field initialisers, then the rest of the body
      std::uint32_t obj = c.types[c.nodeType[job.classNode]].obj, par = c.objs[obj].parent;
      auto isSuperCall = [&](std::uint32_t st) {
        return n(st).kind == N::ExprStmt && n(n(st).kids[0]).kind == N::Call && n(n(n(st).kids[0]).kids[0]).kind == N::Super;
      };
      if (fn->kind == N::Class) {  // synthesized: forward the parameters to the base constructor
        if (par != kNil) {
          auto it = L.ctorOfClass.find(L.classOfObj[par]);
          if (it != L.ctorOfClass.end()) {
            std::vector<ValueId> vs{thisValue(par)};
            for (std::size_t k = 1; k < f.params.size(); ++k) vs.push_back(f.params[k]);
            emit(IrOp::Call, m.functions[it->second].ret, std::move(vs), 0, 0, it->second);
          }
        }
      } else if (par != kNil && body && !body->empty() && isSuperCall((*body)[0])) {
        stmt((*body)[0]);
        idx = 1;
      }
      while (body && idx < body->size() && (n((*body)[idx]).flags & frontend::kFlagSynthetic)) stmt((*body)[idx++]);
      const Node& cls = n(job.classNode);
      for (std::size_t k = frontend::kClassMembersFrom; k < cls.kids.size(); ++k) {
        const Node& mn = n(cls.kids[k]);
        if (mn.kind != N::Field || mn.kids[1] == kNil || (mn.flags & frontend::kFlagStatic)) continue;
        std::uint32_t fi = L.fieldIndex(obj, mn.text);
        TypeId ft = m.classes[job.cls].fields[fi].type;
        emit(IrOp::SetField, m.voidT(), {readVar(thisVar, cur), exprTo(mn.kids[1], ft)}, 0, 0, fi);
      }
    }
    if (body) for (; idx < body->size(); ++idx) stmt((*body)[idx]);
    if (open()) {
      if (ty(f.ret).k == Type::K::Void) terminate(IrOp::Ret, {}, {});
      else terminate(IrOp::Unreachable, {}, {});
    }
    removeUnreachable();
    simplifyParams();
    compact();
  }
};

void Lowering::lowerAll() {
  for (const Job& j : jobs) {
    FnLower fl(*this, j);
    fl.run();
  }
}

}  // namespace

LowerResult lower(const frontend::Ast& ast, const frontend::Checked& checked, std::string_view) {
  Lowering l(ast, checked);
  l.run();
  return {std::move(l.m), std::move(l.diags)};
}

}  // namespace zn::ir
