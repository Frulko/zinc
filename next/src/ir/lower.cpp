// AST + checker results -> typed SSA IR. Locals use on-the-fly SSA construction (Braun et al.) with block parameters
// as phis; trivial parameters are removed afterwards. Top-level variables used by functions become globals.
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

  std::vector<std::uint32_t> classOfObj;                         // checker object -> IR class
  std::unordered_map<std::uint32_t, std::uint32_t> funcOfNode;   // Function/Method node -> function index
  std::unordered_map<std::uint64_t, std::uint32_t> methodFn;     // (checker object << 32 | member name hash) -> function
  std::unordered_map<std::uint32_t, std::uint32_t> ctorOfClass;  // IR class -> constructor function
  std::vector<std::int64_t> ownerFn;                             // per symbol: owning function (0 = main), -1 unknown
  std::vector<char> topLevel, global;                            // per symbol
  std::vector<std::uint32_t> globalIndex;                        // per symbol
  std::unordered_map<std::string, std::uint32_t> stringIds;

  struct Job { std::uint32_t fn; std::uint32_t node; std::uint32_t cls; bool ctor; std::uint32_t classNode; };
  std::vector<Job> jobs;

  Lowering(const frontend::Ast& ast, const frontend::Checked& ch) : a(ast), c(ch) {}

  const Node& n(std::uint32_t i) const { return a.nodes[i]; }
  void unsupported(std::uint32_t node, const std::string& what) { diags.push_back({frontend::kZUnsupported, n(node).start, what}); }

  static std::uint64_t mkey(std::uint32_t obj, std::string_view name) { return (static_cast<std::uint64_t>(obj) << 32) ^ std::hash<std::string_view>{}(name); }

  TypeId irType(frontend::TypeId t, std::uint32_t at = kNil) {
    const frontend::Type& x = c.types[t];
    switch (x.k) {
      case frontend::TK::Num: return m.numT(x.num);
      case frontend::TK::Bool: return m.boolT();
      case frontend::TK::Str: return m.strT();
      case frontend::TK::Void: return m.voidT();
      case frontend::TK::Array: return m.arrayT(irType(x.elem, at));
      case frontend::TK::Object:
        if (classOfObj[x.obj] != kNil) return m.refT(classOfObj[x.obj]);
        break;
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

  std::uint32_t fieldIndex(std::uint32_t obj, std::string_view name) const {
    std::uint32_t k = 0;
    for (const frontend::Member& mem : c.objs[obj].members) {
      if (mem.method) continue;
      if (mem.name == name) return k;
      ++k;
    }
    return kNil;
  }

  // ---- module structure
  void collectClasses() {
    classOfObj.assign(c.objs.size(), kNil);
    for (std::uint32_t o = 0; o < c.objs.size(); ++o) {
      if (!c.objs[o].isClass) continue;
      classOfObj[o] = static_cast<std::uint32_t>(m.classes.size());
      m.classes.push_back({c.objs[o].name, {}});
    }
    for (std::uint32_t o = 0; o < c.objs.size(); ++o) {
      if (classOfObj[o] == kNil) continue;
      for (const frontend::Member& mem : c.objs[o].members)
        if (!mem.method) m.classes[classOfObj[o]].fields.push_back({mem.name, irType(mem.type)});
    }
  }

  std::uint32_t addFunction(const std::string& name, const std::vector<TypeId>& params, TypeId ret) {
    Function f;
    f.name = name;
    f.ret = ret;
    for (TypeId t : params) { f.valueTypes.push_back(t); f.params.push_back(static_cast<ValueId>(f.valueTypes.size() - 1)); }
    m.functions.push_back(std::move(f));
    return static_cast<std::uint32_t>(m.functions.size() - 1);
  }

  void collectFunctions(const std::vector<std::uint32_t>& stmts, const std::string& prefix) {
    for (std::uint32_t s : stmts) {
      const Node& x = n(s);
      if (x.kind == N::Function) {
        frontend::TypeId sig = c.nodeType[s];
        std::vector<TypeId> ps;
        for (frontend::TypeId p : c.types[sig].params) ps.push_back(irType(p, s));
        std::string nm = prefix + std::string(x.text);
        std::uint32_t fi = addFunction(nm, ps, irType(c.types[sig].elem, s));
        funcOfNode[s] = fi;
        jobs.push_back({fi, s, kNil, false, kNil});
        if (x.kids[1] != kNil) collectFunctions(n(x.kids[1]).kids, nm + ".");
      } else if (x.kind == N::Class) {
        std::uint32_t obj = c.types[c.nodeType[s]].obj, cls = classOfObj[obj];
        TypeId self = m.refT(cls);
        bool hasCtor = false, hasInit = false;
        for (std::uint32_t mem : x.kids) {
          const Node& mn = n(mem);
          if (mn.kind == N::Field && mn.kids[1] != kNil) hasInit = true;
          if (mn.kind != N::Method) continue;
          frontend::TypeId sig = c.nodeType[mem];
          bool isCtor = mn.text == "constructor";
          hasCtor = hasCtor || isCtor;
          std::vector<TypeId> ps{self};
          for (frontend::TypeId p : c.types[sig].params) ps.push_back(irType(p, mem));
          std::string nm = std::string(x.text) + "." + std::string(mn.text);
          std::uint32_t fi = addFunction(nm, ps, isCtor ? m.voidT() : irType(c.types[sig].elem, mem));
          funcOfNode[mem] = fi;
          if (isCtor) ctorOfClass[cls] = fi; else methodFn[mkey(obj, mn.text)] = fi;
          jobs.push_back({fi, mem, cls, isCtor, s});
          if (mn.kids[1] != kNil) collectFunctions(n(mn.kids[1]).kids, nm + ".");
        }
        if (!hasCtor && hasInit) {  // field initializers need a constructor to run in
          std::uint32_t fi = addFunction(std::string(x.text) + ".constructor", {self}, m.voidT());
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
        std::int64_t cur = fn;
        if (x.kind == N::Function || x.kind == N::Method) { auto it = funcOfNode.find(i); if (it != funcOfNode.end()) cur = it->second; }
        if (x.kind == N::Class) {  // field initializers run in the constructor
          std::uint32_t cls = classOfObj[c.types[c.nodeType[i]].obj];
          auto it = ctorOfClass.find(cls);
          for (std::uint32_t mem : x.kids) {
            if (n(mem).kind == N::Field) walk(n(mem).kids[1], it != ctorOfClass.end() ? static_cast<std::int64_t>(it->second) : fn, false);
            else walk(mem, fn, false);
          }
          return;
        }
        if ((x.kind == N::Declarator || x.kind == N::Param) && c.nodeSym[i] != kNil && pass == 0) {
          ownerFn[c.nodeSym[i]] = cur;
          topLevel[c.nodeSym[i]] = top && x.kind == N::Declarator;
        }
        if (x.kind == N::Ident && pass == 1) {
          std::uint32_t s = c.nodeSym[i];
          if (s != kNil && (c.syms[s].kind == SymKind::Var || c.syms[s].kind == SymKind::Param) && ownerFn[s] != cur && ownerFn[s] != -1) {
            if (topLevel[s]) global[s] = 1; else unsupported(i, "closures (captured variable '" + std::string(x.text) + "')");
          }
        }
        bool childTop = x.kind == N::Program || (top && x.kind == N::VarDecl);
        for (std::uint32_t k : x.kids) walk(k, cur, childTop);
      };
      walk(a.root, 0, true);
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
    addFunction("main", {}, m.voidT());  // function 0
    collectFunctions(n(a.root).kids, "");
    jobs.insert(jobs.begin(), Job{0, kNil, kNil, false, kNil});
    analyze();
    lowerAll();
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

  FnLower(Lowering& l, Job j) : L(l), m(l.m), a(l.a), c(l.c), f(l.m.functions[j.fn]), job(j) {
    thisVar = static_cast<std::uint32_t>(c.syms.size());
    nextVar = thisVar + 1;
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
  ValueId readSym(std::uint32_t s) {
    if (L.global[s]) return emit(IrOp::GetGlobal, L.irType(c.syms[s].type), {}, 0, 0, L.globalIndex[s]);
    return readVar(s, cur);
  }
  void writeSym(std::uint32_t s, ValueId v) {
    if (L.global[s]) { emit(IrOp::SetGlobal, m.voidT(), {coerce(v, m.globals[L.globalIndex[s]].type)}, 0, 0, L.globalIndex[s]); return; }
    writeVar(s, v);
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
        if (x.text == "null") { unsupported(i, "null"); return constBool(false); }
        return constBool(x.text == "true");
      case N::This: return readVar(thisVar, cur);
      case N::Ident: {
        std::uint32_t s = c.nodeSym[i];
        if (s == kNil) return constNum(m.numT(NumK::f64), 0);
        if (c.syms[s].kind == SymKind::Builtin) return constNum(m.numT(NumK::f64), x.text == "NaN" ? std::nan("") : HUGE_VAL);
        return readSym(s);
      }
      case N::Array: {
        TypeId at = natural(i);
        TypeId el = ty(at).aux;
        ValueId arr = emit(IrOp::ArrNew, at);
        for (std::uint32_t e : x.kids) {
          if (n(e).kind == N::Spread) { unsupported(e, "spread elements"); continue; }
          emit(IrOp::ArrPush, m.numT(NumK::i32), {arr, exprTo(e, el)});
        }
        return arr;
      }
      case N::Binary: {
        std::string_view o = x.text;
        if (o == ",") { expr(x.kids[0]); return expr(x.kids[1], want); }
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
      case N::Call: return call(i, x);
      case N::New: return newObject(i, x);
      case N::Member: {
        const Node& on = n(x.kids[0]);
        if (on.kind == N::Ident && c.nodeSym[x.kids[0]] != kNil && c.syms[c.nodeSym[x.kids[0]]].kind == SymKind::Builtin) {
          return constNum(m.numT(NumK::f64), x.text == "PI" ? 3.14159265358979323846 : 2.71828182845904523536);
        }
        frontend::TypeId ot = c.nodeType[x.kids[0]];
        const frontend::Type& ct = c.types[ot];
        ValueId obj = expr(x.kids[0]);
        if (ct.k == frontend::TK::Array) return emit(IrOp::ArrLen, m.numT(NumK::i32), {obj});
        if (ct.k == frontend::TK::Str) return emit(IrOp::StrLen, m.numT(NumK::i32), {obj});
        std::uint32_t fi = L.fieldIndex(ct.obj, x.text);
        return emit(IrOp::GetField, natural(i), {obj}, 0, 0, fi);
      }
      case N::Index: {
        ValueId arr = expr(x.kids[0]);
        ValueId idx = exprTo(x.kids[1], m.numT(NumK::i32));
        return emit(IrOp::ArrGet, natural(i), {arr, idx});
      }
      default: unsupported(i, "this expression"); return constBool(false);
    }
  }

  // ---- lvalues
  struct LVal { enum K { Var, Field, Elem } k; std::uint32_t sym = kNil; ValueId obj = kNoValue, idx = kNoValue; std::uint32_t field = 0; TypeId type = 0; };
  LVal lvalue(std::uint32_t node) {
    const Node& x = n(node);
    LVal lv;
    lv.type = natural(node);
    if (x.kind == N::Ident) { lv.k = LVal::Var; lv.sym = c.nodeSym[node]; return lv; }
    if (x.kind == N::Member) {
      lv.k = LVal::Field;
      lv.obj = expr(x.kids[0]);
      lv.field = L.fieldIndex(c.types[c.nodeType[x.kids[0]]].obj, x.text);
      return lv;
    }
    lv.k = LVal::Elem;
    lv.obj = expr(x.kids[0]);
    lv.idx = exprTo(x.kids[1], m.numT(NumK::i32));
    return lv;
  }
  ValueId load(const LVal& lv) {
    if (lv.k == LVal::Var) return readSym(lv.sym);
    if (lv.k == LVal::Field) return emit(IrOp::GetField, lv.type, {lv.obj}, 0, 0, lv.field);
    return emit(IrOp::ArrGet, lv.type, {lv.obj, lv.idx});
  }
  void store(const LVal& lv, ValueId v) {
    v = coerce(v, lv.type);
    if (lv.k == LVal::Var) writeSym(lv.sym, v);
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

  ValueId call(std::uint32_t i, const Node& x) {
    const Node& callee = n(x.kids[0]);
    if (callee.kind == N::Ident) {
      std::uint32_t s = c.nodeSym[x.kids[0]];
      if (s != kNil && c.syms[s].kind == SymKind::Func) return callFunction(L.funcOfNode[c.syms[s].decl], {}, x.kids, 1);
    } else if (callee.kind == N::Member) {
      const Node& on = n(callee.kids[0]);
      std::uint32_t os = on.kind == N::Ident ? c.nodeSym[callee.kids[0]] : kNil;
      if (os != kNil && c.syms[os].kind == SymKind::Builtin) {
        std::string full = std::string(on.text) + "." + std::string(callee.text);
        for (std::uint32_t b = 0; b < static_cast<std::uint32_t>(Builtin::Count); ++b) {
          if (full != builtinName(static_cast<Builtin>(b))) continue;
          std::vector<ValueId> vs;
          bool log = static_cast<Builtin>(b) == Builtin::ConsoleLog;
          for (std::size_t k = 1; k < x.kids.size(); ++k) vs.push_back(log ? expr(x.kids[k]) : exprTo(x.kids[k], m.numT(NumK::f64)));
          return builtin(static_cast<Builtin>(b), std::move(vs), log ? m.voidT() : m.numT(NumK::f64));
        }
      } else {
        const frontend::Type& ct = c.types[c.nodeType[callee.kids[0]]];
        ValueId recv = expr(callee.kids[0]);
        if (ct.k == frontend::TK::Array) {
          TypeId el = L.irType(ct.elem);
          if (callee.text == "push") return emit(IrOp::ArrPush, m.numT(NumK::i32), {recv, exprTo(x.kids[1], el)});
          if (callee.text == "pop") return emit(IrOp::ArrPop, el, {recv});
        } else if (ct.k == frontend::TK::Num && callee.text == "toFixed") {
          ValueId digits = exprTo(x.kids[1], m.numT(NumK::i32));
          return builtin(Builtin::NumToFixed, {coerce(recv, m.numT(NumK::f64)), digits}, m.strT());
        } else if (ct.k == frontend::TK::Object) {
          auto it = L.methodFn.find(mkey(ct.obj, callee.text));
          if (it != L.methodFn.end()) return callFunction(it->second, {recv}, x.kids, 1);
        }
      }
    }
    unsupported(i, "this call");
    return constBool(false);
  }

  ValueId newObject(std::uint32_t i, const Node& x) {
    std::uint32_t s = c.nodeSym[x.kids[0]];
    std::uint32_t obj = c.types[c.syms[s].type].obj, cls = L.classOfObj[obj];
    (void)i;
    ValueId o = emit(IrOp::New, m.refT(cls), {}, 0, 0, cls);
    auto it = L.ctorOfClass.find(cls);
    if (it != L.ctorOfClass.end()) callFunction(it->second, {o}, x.kids, 1);
    return o;
  }

  // ---- statements
  void declare(std::uint32_t d, bool) {
    const Node& x = n(d);
    std::uint32_t s = c.nodeSym[d];
    TypeId t = L.irType(c.syms[s].type, d);
    ValueId v = exprTo(x.kids[1], t);
    writeSym(s, v);
  }

  void loopBody(std::uint32_t body, BlockId brk, BlockId cont) {
    loopTargets.push_back({brk, cont});
    stmt(body);
    loopTargets.pop_back();
  }

  void stmt(std::uint32_t s) {
    const Node& x = n(s);
    switch (x.kind) {
      case N::Empty: case N::Function: case N::Class: break;
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
        std::uint32_t es = c.nodeSym[x.kids[0]];
        writeSym(es, elem);
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
    const Node* fn = job.node == kNil ? nullptr : &n(job.node);
    if (fn && fn->kind != N::Class) {  // Function or Method: parameters become variables
      for (std::size_t k = 0; k < fn->kids.size() - 2; ++k) {
        std::uint32_t p = fn->kids[2 + k];
        std::uint32_t ps = c.nodeSym[p];
        if (ps != kNil && !L.global[ps]) writeVar(ps, f.params[first + k]);
        if (n(p).kids[1] != kNil) L.unsupported(p, "default parameter values in the IR");
      }
    }
    if (job.ctor) {  // field initializers first
      const Node& cls = n(job.classNode);
      std::uint32_t obj = c.types[c.nodeType[job.classNode]].obj;
      for (std::uint32_t mem : cls.kids) {
        const Node& mn = n(mem);
        if (mn.kind != N::Field || mn.kids[1] == kNil) continue;
        std::uint32_t fi = L.fieldIndex(obj, mn.text);
        TypeId ft = m.classes[job.cls].fields[fi].type;
        emit(IrOp::SetField, m.voidT(), {readVar(thisVar, cur), exprTo(mn.kids[1], ft)}, 0, 0, fi);
      }
    }
    if (job.node == kNil) { for (std::uint32_t s : n(a.root).kids) stmt(s); }
    else if (fn->kind != N::Class) { if (fn->kids[1] != kNil) for (std::uint32_t s : n(fn->kids[1]).kids) stmt(s); }
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
