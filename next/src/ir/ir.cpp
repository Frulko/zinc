#include "ir/ir.h"

#include "zn/native_sig.h"

#include <cctype>
#include <cstdio>

namespace zn::ir {

using frontend::Num;

const char* builtinName(Builtin b) {
  static const char* names[] = {
#define X(id, name, arity) name,
      ZN_BUILTINS(X)
#undef X
  };
  return names[static_cast<int>(b)];
}
int builtinArity(Builtin b) {
  static const int arities[] = {
#define X(id, name, arity) arity,
      ZN_BUILTINS(X)
#undef X
  };
  return arities[static_cast<int>(b)];
}

const char* opName(IrOp o) {
  static const char* names[] = {"const", "add", "sub", "mul", "div", "rem", "pow", "and", "or", "xor", "shl", "shr", "ushr",
      "neg", "not", "bitnot", "eq", "ne", "lt", "le", "gt", "ge", "conv", "refcast", "instof", "call", "callvirt", "builtin", "new", "getfield", "setfield",
      "getglobal", "setglobal", "arrnew", "arrget", "arrset", "arrlen", "arrpush", "arrpop", "strconcat", "tostr", "strlen", "retain", "release", "callnative", "rt",
      "br", "condbr", "ret", "throw", "unreachable"};
  return names[static_cast<int>(o)];
}
bool isTerminator(IrOp o) { return o == IrOp::Br || o == IrOp::CondBr || o == IrOp::Ret || o == IrOp::Throw || o == IrOp::Unreachable; }

bool Module::isSubtype(std::uint32_t a, std::uint32_t b) const {
  if (a >= classes.size() || b >= classes.size()) return false;
  for (std::uint32_t k = 0, o = a; o != kNoClass && k < 1000; o = classes[o].parent, ++k) {
    if (o == b) return true;
    for (std::uint32_t i : classes[o].implements) if (i == b) return true;
  }
  return false;
}

TypeId Module::intern(const Type& t) {
  for (TypeId i = 0; i < types.size(); ++i) if (types[i] == t) return i;
  types.push_back(t);
  return static_cast<TypeId>(types.size() - 1);
}

std::uint8_t effects(const Module& m, const Inst& i) {
  auto isInt = [&](TypeId t) { const Type& x = m.types[t]; return x.k == Type::K::Num && x.num != Num::f64 && x.num != Num::f32 && x.num != Num::fx12 && x.num != Num::fx16; };
  switch (i.op) {
    case IrOp::Call: case IrOp::CallVirt: case IrOp::Builtin: return kReads | kWrites | kThrows;
    case IrOp::CallNative: return kReads | kWrites | kThrows | kAllocs;
    case IrOp::Rt: return kReads | kWrites | kThrows | kAllocs;
    case IrOp::Retain: case IrOp::Release: return kWrites;
    case IrOp::Div: case IrOp::Rem: return isInt(i.ty) ? kThrows : kPure;  // integer division by zero traps
    case IrOp::New: case IrOp::ArrNew: case IrOp::StrConcat: case IrOp::ToStr: return kAllocs;
    case IrOp::GetField: case IrOp::GetGlobal: case IrOp::ArrLen: case IrOp::StrLen: case IrOp::InstOf: return kReads;
    case IrOp::ArrGet: return kReads | kThrows;                      // bounds trap
    case IrOp::SetField: case IrOp::SetGlobal: return kWrites;
    case IrOp::ArrSet: return kWrites | kThrows;
    case IrOp::ArrPush: return kWrites | kAllocs;
    case IrOp::ArrPop: return kReads | kWrites;
    case IrOp::Throw: return kThrows;
    default: return kPure;
  }
}

// A name of the text format: bare when it is made of letters, digits, `_`, `$` and `.`, else quoted like a string (class names such as
// `fn (i32) => i32` and `{ a: f64 }` hold spaces and punctuation).
static std::string quoteStr(const std::string& s) {
  std::string o = "\"";
  for (char c : s) o += c == '\n' ? "\\n" : c == '\t' ? "\\t" : c == '"' ? "\\\"" : c == '\\' ? "\\\\" : std::string(1, c);
  return o + "\"";
}
std::string nameText(const std::string& s) {
  bool bare = !s.empty();
  for (char c : s) if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '$' || c == '.')) bare = false;
  return bare ? s : quoteStr(s);
}

std::string typeName(const Module& m, TypeId t) {
  const Type& x = m.types[t];
  switch (x.k) {
    case Type::K::Void: return "void";
    case Type::K::Bool: return "bool";
    case Type::K::Str: return "str";
    case Type::K::Num: {
      static const char* n[] = {"f64", "f32", "fx12", "fx16", "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64", "isize", "usize"};
      return n[static_cast<int>(x.num)];
    }
    case Type::K::Ref: return "ref " + nameText(m.classes[x.aux].name);
    case Type::K::Array: return typeName(m, x.aux) + "[]";
    case Type::K::Map: return "Map<" + typeName(m, x.aux2) + ", " + typeName(m, x.aux) + ">";
    case Type::K::Set: return "Set<" + typeName(m, x.aux) + ">";
  }
  return "?";
}

namespace {

std::string v(ValueId id) { return "%" + std::to_string(id); }

std::string edgeText(const Edge& e) {
  std::string s = "bb" + std::to_string(e.to);
  if (!e.args.empty()) {
    s += "(";
    for (std::size_t i = 0; i < e.args.size(); ++i) s += (i ? ", " : "") + v(e.args[i]);
    s += ")";
  }
  return s;
}

std::string escape(const std::string& s) {
  std::string o = "\"";
  for (char c : s) o += c == '\n' ? "\\n" : c == '\t' ? "\\t" : c == '"' ? "\\\"" : c == '\\' ? "\\\\" : std::string(1, c);
  return o + "\"";
}

std::string fmtDouble(double d) {
  char buf[40];
  std::snprintf(buf, sizeof buf, "%.17g", d);
  return buf;
}

// A selector is named by its text name; a second selector with the same name (another signature) is `name#1`, a third `name#2`...
std::string selText(const Module& m, std::uint32_t id) {
  std::size_t k = 0;
  for (std::uint32_t j = 0; j < id; ++j) if (m.selectors[j].name == m.selectors[id].name) ++k;
  return nameText(m.selectors[id].name) + (k ? "#" + std::to_string(k) : "");
}

std::string instText(const Module& m, const Function& f, const Inst& i) {
  (void)f;
  std::string s;
  if (i.res != kNoValue) s += v(i.res) + ": " + typeName(m, i.ty) + " = ";
  s += opName(i.op);
  const Type& rt = m.types[i.ty];
  switch (i.op) {
    case IrOp::Const:
      if (rt.k == Type::K::Ref || (rt.builtinRef() && i.imm == kNullConst)) s += " null";
      else if (rt.k == Type::K::Str) s += " " + escape(m.strings[static_cast<std::size_t>(i.imm)]);
      else if (rt.k == Type::K::Bool) s += i.imm ? " true" : " false";
      else if (rt.k == Type::K::Num && (rt.num == Num::f64 || rt.num == Num::f32 || rt.num == Num::fx12 || rt.num == Num::fx16)) s += " " + fmtDouble(i.fimm);
      else s += " " + std::to_string(i.imm);
      return s;
    case IrOp::Call: s += " @" + nameText(m.functions[i.sym].name); break;
    case IrOp::CallVirt: s += " ." + selText(m, i.sym); break;
    case IrOp::Builtin: s += std::string(" ") + builtinName(static_cast<Builtin>(i.sym)); break;
    case IrOp::New: case IrOp::InstOf: s += " " + nameText(m.classes[i.sym].name); break;
    case IrOp::GetField: case IrOp::SetField: s += " ." + std::to_string(i.sym); break;
    case IrOp::GetGlobal: case IrOp::SetGlobal: s += " @@" + nameText(m.globals[i.sym].name); break;
    case IrOp::ArrNew: s += " " + typeName(m, i.ty); break;
    case IrOp::Rt: s += std::string(" ") + rtInfo(static_cast<zn::Rt>(i.sym)).name; break;
    case IrOp::CallNative: s += " #" + std::to_string(i.sym); break;
    default: break;
  }
  if (i.op == IrOp::Br) return s + " " + edgeText(i.edges[0]);
  if (i.op == IrOp::CondBr) return s + " " + v(i.args[0]) + ", " + edgeText(i.edges[0]) + ", " + edgeText(i.edges[1]);
  if (!i.args.empty()) {
    bool call = i.op == IrOp::Call || i.op == IrOp::CallVirt || i.op == IrOp::Builtin || i.op == IrOp::Rt || i.op == IrOp::CallNative;
    s += call ? "(" : " ";
    for (std::size_t k = 0; k < i.args.size(); ++k) s += (k ? ", " : "") + v(i.args[k]);
    if (call) s += ")";
  } else if (i.op == IrOp::Call || i.op == IrOp::CallVirt || i.op == IrOp::Builtin) s += "()";
  if ((i.op == IrOp::Call || i.op == IrOp::CallVirt) && !i.edges.empty()) s += " unwind " + edgeText(i.edges[0]);
  return s;
}

}  // namespace

std::string dump(const Module& m) {
  std::string out = std::string("zir ") + std::to_string(kTextVersion) + "\n";
  for (const Selector& sel : m.selectors) {
    out += "selector ." + selText(m, static_cast<std::uint32_t>(&sel - m.selectors.data())) + "(";
    for (std::size_t i = 0; i < sel.params.size(); ++i) out += (i ? ", " : "") + typeName(m, sel.params[i]);
    out += ") -> " + typeName(m, sel.ret) + "\n";
  }
  for (const Class& c : m.classes) {
    out += (c.isInterface ? "interface " : c.isAbstract ? "abstract class " : "class ") + nameText(c.name);
    if (c.parent != kNoClass) out += " : " + nameText(m.classes[c.parent].name);
    if (!c.implements.empty()) {
      out += " implements";
      for (std::size_t i = 0; i < c.implements.size(); ++i) out += (i ? ", " : " ") + nameText(m.classes[c.implements[i]].name);
    }
    if (!c.isInterface) {
      out += " {";
      for (std::size_t i = 0; i < c.fields.size(); ++i) out += (i ? ", " : " ") + nameText(c.fields[i].name) + ": " + typeName(m, c.fields[i].type);
      out += c.fields.empty() ? "}" : " }";
    }
    out += "\n";
    for (std::uint32_t sel : c.selectors) {
      out += "  sel ." + selText(m, sel);
      if (!c.isInterface && sel < c.vtable.size() && c.vtable[sel] != kNoClass) out += " -> @" + nameText(m.functions[c.vtable[sel]].name);
      out += "\n";
    }
  }
  for (const Global& g : m.globals) out += "global @@" + nameText(g.name) + ": " + typeName(m, g.type) + "\n";
  for (const Native& n : m.natives) out += "native \"" + n.module + "\" \"" + n.name + "\" \"" + n.sig + "\"\n";
  for (const Function& f : m.functions) {
    out += "func @" + nameText(f.name) + "(";
    for (std::size_t i = 0; i < f.params.size(); ++i) out += (i ? ", " : "") + v(f.params[i]) + ": " + typeName(m, f.valueTypes[f.params[i]]);
    out += ") -> " + typeName(m, f.ret) + " {\n";
    for (std::size_t b = 0; b < f.blocks.size(); ++b) {
      out += "bb" + std::to_string(b);
      if (b > 0 && !f.blocks[b].params.empty()) {
        out += "(";
        for (std::size_t i = 0; i < f.blocks[b].params.size(); ++i) out += (i ? ", " : "") + v(f.blocks[b].params[i]) + ": " + typeName(m, f.valueTypes[f.blocks[b].params[i]]);
        out += ")";
      }
      out += ":\n";
      for (const Inst& i : f.blocks[b].insts) out += "  " + instText(m, f, i) + "\n";
    }
    out += "}\n";
  }
  return out;
}

// ---- verifier

namespace {

struct Verifier {
  const Module& m;
  const Function& f;
  std::string err;
  std::vector<int> defBlock;   // per value: defining block or -1
  std::vector<int> defIndex;   // per value: instruction index, -1 for parameters
  std::vector<std::vector<bool>> dom;  // dom[b][a]: a dominates b

  Verifier(const Module& mod, const Function& fn) : m(mod), f(fn) {}

  bool fail(std::size_t b, int inst, const std::string& msg) {
    if (err.empty()) err = "@" + f.name + " bb" + std::to_string(b) + (inst >= 0 ? " inst " + std::to_string(inst) : "") + ": " + msg;
    return false;
  }
  bool numT(TypeId t) const { return m.types[t].k == Type::K::Num; }
  bool intT(TypeId t) const {
    if (!numT(t)) return false;
    Num n = m.types[t].num;
    return n != Num::f64 && n != Num::f32 && n != Num::fx12 && n != Num::fx16;
  }
  bool known(ValueId x) const { return x < f.valueTypes.size(); }
  TypeId tyOf(ValueId x) const { return f.valueTypes[x]; }

  void computeDominators() {
    std::size_t n = f.blocks.size();
    std::vector<bool> reach(n, false);
    std::vector<BlockId> stack{0};
    reach[0] = true;
    while (!stack.empty()) {
      BlockId b = stack.back(); stack.pop_back();
      const auto& insts = f.blocks[b].insts;
      if (insts.empty()) continue;
      for (const Edge& e : insts.back().edges) if (e.to < n && !reach[e.to]) { reach[e.to] = true; stack.push_back(e.to); }
      for (const Inst& i : insts) if (i.op == IrOp::Call || i.op == IrOp::CallVirt) for (const Edge& e : i.edges) if (e.to < n && !reach[e.to]) { reach[e.to] = true; stack.push_back(e.to); }
    }
    std::vector<std::vector<BlockId>> preds(n);
    for (BlockId b = 0; b < n; ++b) {
      if (!reach[b]) continue;
      for (const Inst& i : f.blocks[b].insts) for (const Edge& e : i.edges) if (e.to < n) preds[e.to].push_back(b);
    }
    dom.assign(n, std::vector<bool>(n, true));
    for (BlockId b = 0; b < n; ++b) if (!reach[b]) dom[b].assign(n, false);
    dom[0].assign(n, false);
    dom[0][0] = true;
    for (bool changed = true; changed;) {
      changed = false;
      for (BlockId b = 1; b < n; ++b) {
        if (!reach[b]) continue;
        std::vector<bool> d(n, true);
        for (BlockId p : preds[b]) for (std::size_t k = 0; k < n; ++k) d[k] = d[k] && dom[p][k];
        d[b] = true;
        if (d != dom[b]) { dom[b] = d; changed = true; }
      }
    }
  }

  bool dominatesUse(ValueId x, std::size_t ub, int ui) const {
    int db = defBlock[x];
    if (db < 0) return false;
    if (static_cast<std::size_t>(db) == ub) return defIndex[x] < ui;
    return dom[ub][static_cast<std::size_t>(db)];
  }

  bool checkEdge(std::size_t b, int ii, const Edge& e) {
    if (e.to >= f.blocks.size()) return fail(b, ii, "branch to missing block bb" + std::to_string(e.to));
    if (e.to == 0) return fail(b, ii, "branch to the entry block");
    const auto& ps = f.blocks[e.to].params;
    if (e.args.size() != ps.size()) return fail(b, ii, "branch to bb" + std::to_string(e.to) + " passes " + std::to_string(e.args.size()) + " arguments for " + std::to_string(ps.size()) + " parameters");
    for (std::size_t k = 0; k < ps.size(); ++k) {
      if (!known(e.args[k])) return fail(b, ii, "branch argument is an unknown value");
      if (tyOf(e.args[k]) != tyOf(ps[k])) return fail(b, ii, "branch argument type " + typeName(m, tyOf(e.args[k])) + " does not match parameter type " + typeName(m, tyOf(ps[k])));
      if (!dominatesUse(e.args[k], b, 1 << 30)) return fail(b, ii, "branch argument " + v(e.args[k]) + " does not dominate its use");
    }
    return true;
  }

  bool checkInst(std::size_t b, int ii, const Inst& i) {
    if (i.ty >= m.types.size()) return fail(b, ii, "invalid result type");
    for (ValueId a : i.args) {
      if (!known(a)) return fail(b, ii, "unknown operand");
      if (!dominatesUse(a, b, ii))
        return fail(b, ii, "operand " + v(a) + (static_cast<std::size_t>(defBlock[a]) == b ? " is used before it is defined" : " does not dominate its use"));
    }
    auto arity = [&](std::size_t n) { return i.args.size() == n || fail(b, ii, std::string(opName(i.op)) + " expects " + std::to_string(n) + " operands"); };
    auto same = [&](ValueId a, TypeId t, const char* what) { return tyOf(a) == t || fail(b, ii, std::string(what) + " type " + typeName(m, tyOf(a)) + " is not " + typeName(m, t)); };
    TypeId vt = m.types.size() ? 0 : 0;
    (void)vt;
    switch (i.op) {
      case IrOp::Const: {
        if (!arity(0)) return false;
        const Type& t = m.types[i.ty];
        bool nullable = t.k == Type::K::Str || t.k == Type::K::Array || t.k == Type::K::Map || t.k == Type::K::Set;  // null of a builtin class: imm == kNullConst
        if (t.k != Type::K::Num && t.k != Type::K::Bool && t.k != Type::K::Str && t.k != Type::K::Ref && !(nullable && i.imm == kNullConst)) return fail(b, ii, "const of a non-scalar type");
        if (t.k == Type::K::Ref && i.imm != 0) return fail(b, ii, "the only reference constant is null");
        if (t.k == Type::K::Str && i.imm != kNullConst && (i.imm < 0 || static_cast<std::size_t>(i.imm) >= m.strings.size())) return fail(b, ii, "const string index out of range");
        break;
      }
      case IrOp::Add: case IrOp::Sub: case IrOp::Mul: case IrOp::Div: case IrOp::Rem: case IrOp::Pow:
        if (!arity(2) || !numT(i.ty) || !same(i.args[0], i.ty, "left operand") || !same(i.args[1], i.ty, "right operand")) return err.empty() ? fail(b, ii, "numeric operation on a non-numeric type") : false;
        break;
      case IrOp::And: case IrOp::Or: case IrOp::Xor: case IrOp::Shl: case IrOp::Shr: case IrOp::UShr:
        if (!arity(2) || !intT(i.ty) || !same(i.args[0], i.ty, "left operand") || !same(i.args[1], i.ty, "right operand")) return err.empty() ? fail(b, ii, "bit operation on a non-integer type") : false;
        break;
      case IrOp::Neg:
        if (!arity(1) || !numT(i.ty) || !same(i.args[0], i.ty, "operand")) return err.empty() ? fail(b, ii, "neg on a non-numeric type") : false;
        break;
      case IrOp::BitNot:
        if (!arity(1) || !intT(i.ty) || !same(i.args[0], i.ty, "operand")) return err.empty() ? fail(b, ii, "bitnot on a non-integer type") : false;
        break;
      case IrOp::Not:
        if (!arity(1) || m.types[i.ty].k != Type::K::Bool || m.types[tyOf(i.args[0])].k != Type::K::Bool) return err.empty() ? fail(b, ii, "not needs bool") : false;
        break;
      case IrOp::Eq: case IrOp::Ne: case IrOp::Lt: case IrOp::Le: case IrOp::Gt: case IrOp::Ge: {
        if (!arity(2)) return false;
        if (m.types[i.ty].k != Type::K::Bool) return fail(b, ii, "comparison must produce bool");
        if (tyOf(i.args[0]) != tyOf(i.args[1])) return fail(b, ii, "comparison operands differ: " + typeName(m, tyOf(i.args[0])) + " and " + typeName(m, tyOf(i.args[1])));
        Type::K k = m.types[tyOf(i.args[0])].k;
        if (k != Type::K::Num && k != Type::K::Str && !((k == Type::K::Bool || k == Type::K::Ref || k == Type::K::Array || k == Type::K::Map || k == Type::K::Set) && (i.op == IrOp::Eq || i.op == IrOp::Ne))) return fail(b, ii, "comparison on an unordered type");
        break;
      }
      case IrOp::Conv:
        if (!arity(1) || !numT(i.ty) || !numT(tyOf(i.args[0]))) return err.empty() ? fail(b, ii, "conv needs numeric types") : false;
        break;
      case IrOp::Call: {
        if (i.sym >= m.functions.size()) return fail(b, ii, "call to a missing function");
        const Function& cf = m.functions[i.sym];
        if (i.args.size() != cf.params.size()) return fail(b, ii, "call to @" + cf.name + " passes " + std::to_string(i.args.size()) + " arguments for " + std::to_string(cf.params.size()));
        for (std::size_t k = 0; k < i.args.size(); ++k)
          if (tyOf(i.args[k]) != cf.valueTypes[cf.params[k]]) return fail(b, ii, "argument " + std::to_string(k) + " of @" + cf.name + " has type " + typeName(m, tyOf(i.args[k])) + ", expected " + typeName(m, cf.valueTypes[cf.params[k]]));
        if (i.ty != cf.ret) return fail(b, ii, "call result type differs from @" + cf.name + "'s return type");
        if (i.edges.size() > 1) return fail(b, ii, "a call has at most one unwind edge");
        break;
      }
      case IrOp::RefCast: {
        if (!arity(1) || m.types[i.ty].k != Type::K::Ref || m.types[tyOf(i.args[0])].k != Type::K::Ref) return err.empty() ? fail(b, ii, "refcast needs references") : false;
        std::uint32_t from = m.types[tyOf(i.args[0])].aux, to = m.types[i.ty].aux;
        if (!m.isSubtype(from, to) && !m.isSubtype(to, from)) return fail(b, ii, "refcast between unrelated classes " + m.classes[from].name + " and " + m.classes[to].name);
        break;
      }
      case IrOp::InstOf:
        if (!arity(1) || i.sym >= m.classes.size() || m.types[i.ty].k != Type::K::Bool || m.types[tyOf(i.args[0])].k != Type::K::Ref) return err.empty() ? fail(b, ii, "instof needs a reference and a class") : false;
        break;
      case IrOp::CallVirt: {
        if (i.sym >= m.selectors.size()) return fail(b, ii, "callvirt of a missing selector");
        const Selector& sel = m.selectors[i.sym];
        if (i.args.empty() || m.types[tyOf(i.args[0])].k != Type::K::Ref) return fail(b, ii, "callvirt needs a receiver reference");
        const Class& rc = m.classes[m.types[tyOf(i.args[0])].aux];
        bool visible = false;
        for (std::uint32_t sv : rc.selectors) if (sv == i.sym) visible = true;
        if (!visible) return fail(b, ii, "selector ." + sel.name + " is not a method of " + rc.name);
        if (i.args.size() != sel.params.size() + 1) return fail(b, ii, "callvirt ." + sel.name + " passes " + std::to_string(i.args.size() - 1) + " arguments for " + std::to_string(sel.params.size()));
        for (std::size_t k = 0; k < sel.params.size(); ++k)
          if (tyOf(i.args[k + 1]) != sel.params[k]) return fail(b, ii, "argument " + std::to_string(k) + " of ." + sel.name + " has type " + typeName(m, tyOf(i.args[k + 1])) + ", expected " + typeName(m, sel.params[k]));
        if (i.ty != sel.ret) return fail(b, ii, "callvirt result type differs from ." + sel.name + "'s return type");
        if (i.edges.size() > 1) return fail(b, ii, "a call has at most one unwind edge");
        break;
      }
      case IrOp::Builtin: {
        if (i.sym >= static_cast<std::uint32_t>(Builtin::Count)) return fail(b, ii, "unknown builtin");
        int ar = builtinArity(static_cast<Builtin>(i.sym));
        if (ar >= 0 && i.args.size() != static_cast<std::size_t>(ar)) return fail(b, ii, std::string(builtinName(static_cast<Builtin>(i.sym))) + " expects " + std::to_string(ar) + " arguments");
        break;
      }
      case IrOp::New:
        if (!arity(0)) return false;
        if (i.sym >= m.classes.size() || m.types[i.ty].k != Type::K::Ref || m.types[i.ty].aux != i.sym) return fail(b, ii, "new must produce a ref of its class");
        if (m.classes[i.sym].isInterface || m.classes[i.sym].isAbstract) return fail(b, ii, "new of the " + std::string(m.classes[i.sym].isInterface ? "interface " : "abstract class ") + m.classes[i.sym].name);
        break;
      case IrOp::GetField: case IrOp::SetField: {
        if (!arity(i.op == IrOp::GetField ? 1 : 2)) return false;
        const Type& ot = m.types[tyOf(i.args[0])];
        if (ot.k != Type::K::Ref) return fail(b, ii, "field access on a non-ref");
        const Class& c = m.classes[ot.aux];
        if (c.isInterface) return fail(b, ii, "field access on the interface " + c.name);
        if (i.sym >= c.fields.size()) return fail(b, ii, "field index out of range for " + c.name);
        if (i.op == IrOp::GetField && i.ty != c.fields[i.sym].type) return fail(b, ii, "getfield result type differs from the field type");
        if (i.op == IrOp::SetField && tyOf(i.args[1]) != c.fields[i.sym].type) return fail(b, ii, "setfield value type differs from the field type");
        break;
      }
      case IrOp::GetGlobal: case IrOp::SetGlobal:
        if (i.sym >= m.globals.size()) return fail(b, ii, "missing global");
        if (!arity(i.op == IrOp::GetGlobal ? 0 : 1)) return false;
        if (i.op == IrOp::GetGlobal && i.ty != m.globals[i.sym].type) return fail(b, ii, "getglobal result type differs from the global's type");
        if (i.op == IrOp::SetGlobal && tyOf(i.args[0]) != m.globals[i.sym].type) return fail(b, ii, "setglobal value type differs from the global's type");
        break;
      case IrOp::ArrNew:
        if (!arity(0) || (m.types[i.ty].k != Type::K::Array && m.types[i.ty].k != Type::K::Map && m.types[i.ty].k != Type::K::Set)) return err.empty() ? fail(b, ii, "arrnew must produce an array, a Map or a Set") : false;
        break;
      case IrOp::ArrGet: case IrOp::ArrSet: case IrOp::ArrLen: case IrOp::ArrPush: case IrOp::ArrPop: {
        std::size_t need = i.op == IrOp::ArrGet ? 2 : i.op == IrOp::ArrSet ? 3 : i.op == IrOp::ArrPush ? 2 : 1;
        if (!arity(need)) return false;
        const Type& at = m.types[tyOf(i.args[0])];
        if (at.k != Type::K::Array) return fail(b, ii, "array operation on a non-array");
        if ((i.op == IrOp::ArrGet || i.op == IrOp::ArrSet) && (!numT(tyOf(i.args[1])) || m.types[tyOf(i.args[1])].num != Num::i32)) return fail(b, ii, "array index must be i32");
        if (i.op == IrOp::ArrSet && tyOf(i.args[2]) != at.aux) return fail(b, ii, "arrset value type differs from the element type");
        if (i.op == IrOp::ArrPush && tyOf(i.args[1]) != at.aux) return fail(b, ii, "arrpush value type differs from the element type");
        if ((i.op == IrOp::ArrGet || i.op == IrOp::ArrPop) && i.ty != at.aux) return fail(b, ii, "result type differs from the element type");
        break;
      }
      case IrOp::StrConcat:
        if (!arity(2) || m.types[tyOf(i.args[0])].k != Type::K::Str || m.types[tyOf(i.args[1])].k != Type::K::Str) return err.empty() ? fail(b, ii, "strconcat needs strings") : false;
        break;
      case IrOp::ToStr:
        if (!arity(1) || m.types[i.ty].k != Type::K::Str) return err.empty() ? fail(b, ii, "tostr must produce a string") : false;
        break;
      case IrOp::StrLen:
        if (!arity(1) || m.types[tyOf(i.args[0])].k != Type::K::Str) return err.empty() ? fail(b, ii, "strlen needs a string") : false;
        break;
      case IrOp::Retain: case IrOp::Release: {
        if (!arity(1)) return false;
        Type::K k = m.types[tyOf(i.args[0])].k;
        if (k != Type::K::Ref && k != Type::K::Str && k != Type::K::Array && k != Type::K::Map && k != Type::K::Set) return fail(b, ii, "retain or release of a value that is not a reference");
        break;
      }
      case IrOp::CallNative: {
        if (i.sym >= m.natives.size()) return fail(b, ii, "unknown native export");
        nsig::Sig sg;
        if (!nsig::parse(m.natives[i.sym].sig.c_str(), sg)) return fail(b, ii, "native signature '" + m.natives[i.sym].sig + "' is not callable");
        if (!arity(sg.arity())) return false;
        std::string ps = sg.params + (sg.result == 'P' ? "cc" : "");
        for (std::size_t k = 0; k < ps.size(); ++k) {
          const Type& at = m.types[tyOf(i.args[k])];
          char l = ps[k];
          bool ok = l == 's' ? at.k == Type::K::Str : l == 'b' ? at.k == Type::K::Bool : (l == 'i' || l == 'u' || l == 'd') ? at.k == Type::K::Num : l == 'c' ? at.k == Type::K::Ref : at.k == Type::K::Array;
          if (!ok) return fail(b, ii, "native argument " + std::to_string(k) + " does not match the signature");
        }
        break;
      }
      case IrOp::Rt: {
        if (i.sym >= static_cast<std::uint32_t>(zn::Rt::Count)) return fail(b, ii, "unknown runtime call");
        const RtInfo& ri = rtInfo(static_cast<zn::Rt>(i.sym));
        if (!arity(rtParamCount(ri))) return false;
        if (rtParamCount(ri) == 0) break;
        Type::K rk = m.types[tyOf(i.args[0])].k;
        char l0 = rtParam(ri, 0);
        bool okRecv = l0 == 's' ? rk == Type::K::Str : l0 == 'a' ? rk == Type::K::Array : l0 == 'm' ? rk == Type::K::Map : l0 == 't' ? rk == Type::K::Set : l0 == 'x' ? (rk == Type::K::Ref || rk == Type::K::Str || rk == Type::K::Array || rk == Type::K::Map || rk == Type::K::Set) : true;
        if (!okRecv) return fail(b, ii, std::string("runtime call ") + ri.name + " on a receiver of another type");
        break;
      }
      case IrOp::Br:
        if (!arity(0) || i.edges.size() != 1) return err.empty() ? fail(b, ii, "br needs one edge") : false;
        return checkEdge(b, ii, i.edges[0]);
      case IrOp::CondBr:
        if (!arity(1) || i.edges.size() != 2) return err.empty() ? fail(b, ii, "condbr needs a condition and two edges") : false;
        if (m.types[tyOf(i.args[0])].k != Type::K::Bool) return fail(b, ii, "condbr condition must be bool");
        return checkEdge(b, ii, i.edges[0]) && checkEdge(b, ii, i.edges[1]);
      case IrOp::Ret: {
        bool isVoid = m.types[f.ret].k == Type::K::Void;
        if (isVoid ? !i.args.empty() : i.args.size() != 1) return fail(b, ii, "ret operand count does not match the return type");
        if (!isVoid && tyOf(i.args[0]) != f.ret) return fail(b, ii, "ret value type " + typeName(m, tyOf(i.args[0])) + " differs from " + typeName(m, f.ret));
        break;
      }
      case IrOp::Throw: if (!arity(1)) return false; break;
      case IrOp::Unreachable: if (!arity(0)) return false; break;
    }
    if ((i.op == IrOp::Call || i.op == IrOp::CallVirt) && !i.edges.empty()) {
      if (!i.edges[0].args.empty()) return fail(b, ii, "an unwind edge carries no arguments");
      if (i.edges[0].to >= f.blocks.size() || i.edges[0].to == 0) return fail(b, ii, "unwind edge to a missing block");
      const auto& hp = f.blocks[i.edges[0].to].params;
      if (hp.size() != 1 || (m.types[tyOf(hp[0])].k != Type::K::Ref)) return fail(b, ii, "an unwind edge goes to a block whose only parameter is the exception");
    } else if (!isTerminator(i.op) && !i.edges.empty()) return fail(b, ii, "only calls and terminators have edges");
    bool hasRes = m.types[i.ty].k != Type::K::Void;
    if (i.res != kNoValue && !hasRes) return fail(b, ii, "a void instruction defines a value");
    if (i.res == kNoValue && hasRes && !isTerminator(i.op)) return fail(b, ii, "an instruction with a result type defines no value");
    return true;
  }

  bool run() {
    if (f.blocks.empty()) return fail(0, -1, "function has no blocks");
    if (f.params != f.blocks[0].params) return fail(0, -1, "function parameters differ from the entry block's");
    defBlock.assign(f.valueTypes.size(), -1);
    defIndex.assign(f.valueTypes.size(), -1);
    auto define = [&](ValueId x, std::size_t b, int idx) {
      if (!known(x)) return fail(b, idx, "defines an unknown value");
      if (defBlock[x] != -1) return fail(b, idx, "value " + v(x) + " is defined twice");
      defBlock[x] = static_cast<int>(b);
      defIndex[x] = idx;
      return true;
    };
    for (std::size_t b = 0; b < f.blocks.size(); ++b) {
      for (ValueId p : f.blocks[b].params) if (!define(p, b, -1)) return false;
      const auto& insts = f.blocks[b].insts;
      if (insts.empty() || !isTerminator(insts.back().op)) return fail(b, -1, "block does not end with a terminator");
      for (std::size_t k = 0; k < insts.size(); ++k) {
        if (isTerminator(insts[k].op) && k + 1 != insts.size()) return fail(b, static_cast<int>(k), "terminator in the middle of a block");
        if (insts[k].res != kNoValue && !define(insts[k].res, b, static_cast<int>(k))) return false;
      }
    }
    computeDominators();
    for (std::size_t b = 0; b < f.blocks.size(); ++b)
      for (std::size_t k = 0; k < f.blocks[b].insts.size(); ++k)
        if (!checkInst(b, static_cast<int>(k), f.blocks[b].insts[k])) return false;
    return true;
  }
};

}  // namespace

namespace {
// Class tables: parents exist, layouts extend the parent's, and every concrete class implements every selector it exposes.
std::string verifyClasses(const Module& m) {
  for (std::size_t ci = 0; ci < m.classes.size(); ++ci) {
    const Class& c = m.classes[ci];
    if (c.parent != kNoClass) {
      if (c.parent >= m.classes.size() || m.classes[c.parent].isInterface) return "class " + c.name + " has an invalid parent";
      const Class& p = m.classes[c.parent];
      if (c.fields.size() < p.fields.size()) return "class " + c.name + " does not keep its parent's fields";
      for (std::size_t k = 0; k < p.fields.size(); ++k)
        if (c.fields[k].name != p.fields[k].name || c.fields[k].type != p.fields[k].type) return "class " + c.name + " moves the field " + p.fields[k].name + " of " + p.name;
    }
    for (std::uint32_t i : c.implements) if (i >= m.classes.size() || !m.classes[i].isInterface) return "class " + c.name + " implements a non-interface";
    for (std::uint32_t sel : c.selectors) if (sel >= m.selectors.size()) return "class " + c.name + " names a missing selector";
    if (c.isInterface || c.isAbstract) continue;
    if (c.vtable.size() != m.selectors.size()) return "class " + c.name + " has a vtable of the wrong size";
    for (std::uint32_t sel : c.selectors) {
      std::uint32_t fn = c.vtable[sel];
      const Selector& s = m.selectors[sel];
      if (fn == kNoClass || fn >= m.functions.size()) return "class " + c.name + " has no implementation of ." + s.name;
      const Function& f = m.functions[fn];
      if (f.params.size() != s.params.size() + 1) return "class " + c.name + ": @" + f.name + " does not match the signature of ." + s.name;
      const Type& rt = m.types[f.valueTypes[f.params[0]]];
      if (rt.k != Type::K::Ref || !m.isSubtype(static_cast<std::uint32_t>(ci), rt.aux)) return "class " + c.name + ": the receiver of @" + f.name + " is not a supertype of the class";
      for (std::size_t k = 0; k < s.params.size(); ++k) if (f.valueTypes[f.params[k + 1]] != s.params[k]) return "class " + c.name + ": @" + f.name + " parameter types differ from ." + s.name;
      if (f.ret != s.ret) return "class " + c.name + ": @" + f.name + " returns a different type than ." + s.name;
    }
  }
  return "";
}
}  // namespace

std::string verify(const Module& m) {
  if (m.functions.empty() || m.functions[0].name != "main") return "module has no @main as function 0";
  if (std::string e = verifyClasses(m); !e.empty()) return e;
  for (const Function& f : m.functions) {
    Verifier v(m, f);
    if (!v.run()) return v.err;
    if (m.fixedPoint && !f.library && f.name != "main") {   // @main also holds the library modules' initialisers (they count in f64)   // fixed point: the program's own `number` arithmetic is integer ops. f64 stays where a value comes from outside (a call, a field, an element, a
      // parameter: Date.now(), a native module's double, an explicit f64) and in conversions and math; an f64 operation on values that only conversions and constants produced is
      // `number` arithmetic that escaped the lowering.
      std::vector<char> outside(f.valueTypes.size(), 0);
      for (ValueId p : f.params) outside[p] = 1;
      for (const Block& b : f.blocks) {
        for (ValueId p : b.params) outside[p] = 1;
        for (const Inst& i : b.insts) {
          if (i.res == kNoValue) continue;
          switch (i.op) {
            case IrOp::Call: case IrOp::CallVirt: case IrOp::CallNative: case IrOp::Rt: case IrOp::GetField: case IrOp::ArrGet: case IrOp::ArrPop: case IrOp::GetGlobal: outside[i.res] = 1; break;
            case IrOp::Add: case IrOp::Sub: case IrOp::Mul: case IrOp::Div: case IrOp::Rem: case IrOp::Neg:
              for (ValueId a : i.args) if (outside[a]) outside[i.res] = 1;
              break;
            default: break;
          }
        }
      }
      for (const Block& b : f.blocks)
        for (const Inst& i : b.insts) {
          bool arith = i.op == IrOp::Add || i.op == IrOp::Sub || i.op == IrOp::Mul || i.op == IrOp::Div || i.op == IrOp::Rem || i.op == IrOp::Neg || i.op == IrOp::Eq || i.op == IrOp::Ne ||
                       i.op == IrOp::Lt || i.op == IrOp::Le || i.op == IrOp::Gt || i.op == IrOp::Ge;
          if (!arith || i.args.empty()) continue;
          const Type& t = m.types[f.valueTypes[i.args[0]]];
          if (t.k != Type::K::Num || t.num != frontend::Num::f64) continue;
          bool any = false;
          for (ValueId a : i.args) any = any || outside[a];
          if (!any) return "@" + f.name + ": " + opName(i.op) + " on f64 in a fixed-point profile";
        }
    }
  }
  return "";
}

}  // namespace zn::ir
