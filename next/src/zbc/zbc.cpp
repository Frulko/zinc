#include "zbc/zbc.h"

#include <cstdio>
#include <cstring>

namespace zn::zbc {

namespace {

constexpr std::uint32_t kNoCls = ir::kNoClass;

std::string vtName(const Module& m, VType t) {
  switch (t.cls) {
    case Cls::I: return "i";
    case Cls::S: return "f32";
    case Cls::D: return "f64";
    case Cls::R: return "ref " + (t.ref < m.classes.size() ? m.classes[t.ref].name : std::string("?"));
    default: return "void";
  }
}

// Register state in the verifier: 0 undefined, 1 I, 2 S, 3 D, 4 + class id for a reference.
using St = std::uint16_t;
St enc(VType t) { return t.cls == Cls::I ? 1 : t.cls == Cls::S ? 2 : t.cls == Cls::D ? 3 : t.cls == Cls::R ? static_cast<St>(4 + t.ref) : 0; }
St encCls(Cls c) { return c == Cls::I ? 1 : c == Cls::S ? 2 : c == Cls::D ? 3 : 0; }
bool isRef(St s) { return s >= 4; }
std::string stName(const Module& m, St s) {
  if (s == 0) return "nothing";
  if (s == 1) return "i";
  if (s == 2) return "f32";
  if (s == 3) return "f64";
  return vtName(m, VType{Cls::R, static_cast<std::uint16_t>(s - 4)});
}

bool isSub(const Module& m, std::uint32_t a, std::uint32_t b) {
  if (a == b) return true;
  if (a >= m.classes.size()) return false;
  for (std::uint32_t s : m.classes[a].supers) if (s == b) return true;
  return false;
}

bool assignableTo(const Module& m, St s, VType want) {
  if (want.cls != Cls::R) return s == enc(want);
  return isRef(s) && isSub(m, static_cast<std::uint32_t>(s - 4), want.ref);
}

St joinSt(const Module& m, St a, St b) {
  if (a == b) return a;
  if (!isRef(a) || !isRef(b)) return 0;
  auto ca = static_cast<std::uint32_t>(a - 4), cb = static_cast<std::uint32_t>(b - 4);
  if (isSub(m, ca, cb)) return b;
  if (isSub(m, cb, ca)) return a;
  for (std::uint32_t p = m.classes[ca].parent, k = 0; p != kNoCls && p < m.classes.size() && k < 1000; p = m.classes[p].parent, ++k)
    if (isSub(m, cb, p)) return static_cast<St>(4 + p);
  return 0;
}

Cls rcToCls(RC r) { return r == RC::I ? Cls::I : r == RC::S ? Cls::S : r == RC::D ? Cls::D : Cls::None; }

bool isFused(Op op) { Fmt f = opInfo(op).fmt; return f == Fmt::AB2 || f == Fmt::AK2; }
bool aIsReg(Op op) {
  const OpInfo& i = opInfo(op);
  if (i.fmt == Fmt::OP || i.fmt == Fmt::AX) return false;
  if (i.fmt == Fmt::ABK || i.fmt == Fmt::AB2 || i.fmt == Fmt::AK2) return true;
  if (i.fmt == Fmt::AD) return op == Op::LoadI || op == Op::LoadK || op == Op::JmpIf || op == Op::JmpIfNot || op == Op::Call || op == Op::GetGlobal || op == Op::SetGlobal || op == Op::New || op == Op::CallVirt || op == Op::Downcast;
  return i.out != RC::None || op == Op::Ret || op == Op::Throw || op == Op::LogI || op == Op::LogU || op == Op::LogF64 || op == Op::LogF32 || op == Op::LogBool || op == Op::SetField;
}
bool bIsReg(Op op) { const OpInfo& i = opInfo(op); return (i.fmt == Fmt::ABC && i.inB != RC::None) || i.fmt == Fmt::ABK || i.fmt == Fmt::AB2; }
bool cIsReg(Op op) { const OpInfo& i = opInfo(op); return i.fmt == Fmt::ABC && i.inC != RC::None; }
bool cIsImm(Op op) { const OpInfo& i = opInfo(op); return i.fmt == Fmt::ABK || i.fmt == Fmt::AK2 || op == Op::GetField || op == Op::SetField; }
bool isTerminator(Op op) { return op == Op::Jmp || op == Op::Ret || op == Op::RetV || op == Op::Throw || op == Op::Trap; }
bool isCondJump(Op op) { return op == Op::JmpIf || op == Op::JmpIfNot || isFused(op); }
// Jump target of a conditional or unconditional jump at pc.
std::uint32_t jumpTarget(const std::vector<std::uint32_t>& code, std::size_t pc) {
  Op op = static_cast<Op>(opOf(code[pc]));
  if (op == Op::Jmp) return axOf(code[pc]);
  if (isFused(op)) return pc + 1 < code.size() ? code[pc + 1] : 0xFFFFFFFFu;
  return dOf(code[pc]);
}

// ---- module-level checks

std::string verifyTables(const Module& m) {
  auto vtOk = [&](VType t) { return t.cls != Cls::R || t.ref < m.classes.size(); };
  if (m.classes.size() > kMaxClasses) return "too many classes";
  for (std::size_t ci = 0; ci < m.classes.size(); ++ci) {
    const ClassInfo& c = m.classes[ci];
    std::string who = "class " + c.name + ": ";
    if (c.parent != kNoCls && (c.parent >= m.classes.size() || m.classes[c.parent].isInterface)) return who + "invalid parent";
    if (c.fields.size() > kMaxFields) return who + "too many fields";
    for (VType t : c.fields) if (!vtOk(t)) return who + "field of an unknown class";
    for (std::uint32_t s : c.supers) if (s >= m.classes.size()) return who + "unknown supertype";
    if (c.parent != kNoCls) {
      const ClassInfo& p = m.classes[c.parent];
      if (c.fields.size() < p.fields.size()) return who + "does not keep its parent's fields";
      for (std::size_t k = 0; k < p.fields.size(); ++k) if (!(c.fields[k] == p.fields[k])) return who + "changes a field of its parent";
      if (!isSub(m, static_cast<std::uint32_t>(ci), c.parent)) return who + "does not list its parent as a supertype";
    }
    for (std::uint32_t s : c.selectors) if (s >= m.selectors.size()) return who + "unknown selector";
    if (c.isInterface || c.isAbstract) continue;
    if (c.vtable.size() != m.selectors.size()) return who + "vtable has the wrong size";
    for (std::uint32_t sel : c.selectors) {
      std::uint32_t fn = c.vtable[sel];
      const SelInfo& si = m.selectors[sel];
      if (fn == kNoCls || fn >= m.functions.size()) return who + "no implementation of ." + si.name;
      const Function& f = m.functions[fn];
      if (f.params.size() != si.params.size() + 1 || f.params[0].cls != Cls::R || !isSub(m, static_cast<std::uint32_t>(ci), f.params[0].ref))
        return who + "@" + f.name + " cannot implement ." + si.name + " (receiver)";
      for (std::size_t k = 0; k < si.params.size(); ++k) if (!(f.params[k + 1] == si.params[k])) return who + "@" + f.name + " has other parameter types than ." + si.name;
      if (!(f.ret == si.ret)) return who + "@" + f.name + " returns another type than ." + si.name;
    }
  }
  for (const SelInfo& s : m.selectors) {
    if (!vtOk(s.ret)) return "selector ." + s.name + " returns an unknown class";
    for (VType t : s.params) if (!vtOk(t)) return "selector ." + s.name + " takes an unknown class";
  }
  for (VType t : m.globals) if (!vtOk(t)) return "global of an unknown class";
  for (const Function& f : m.functions) {
    if (!vtOk(f.ret)) return "@" + f.name + " returns an unknown class";
    for (VType t : f.params) if (!vtOk(t)) return "@" + f.name + " takes an unknown class";
  }
  return "";
}

// ---- function verifier

struct Verifier {
  const Module& m;
  const Function& f;
  std::size_t fi;
  std::string err;
  using State = std::vector<St>;  // per register

  Verifier(const Module& mod, std::size_t idx) : m(mod), f(mod.functions[idx]), fi(idx) {}

  bool fail(std::size_t pc, const std::string& msg) {
    if (err.empty()) err = "@" + f.name + " pc " + std::to_string(pc) + ": " + msg;
    return false;
  }

  std::vector<char> isStart;

  bool structure() {
    if (f.nregs > kMaxRegisters) return fail(0, "frame has more than " + std::to_string(kMaxRegisters) + " registers");
    if (f.params.size() > f.nregs) return fail(0, "more parameters than registers");
    if (f.code.empty()) return fail(0, "function has no code");
    if (f.code.size() > kMaxCodeWords) return fail(0, "function is too large");
    if (f.consts.size() > kMaxConsts) return fail(0, "too many constants");
    isStart.assign(f.code.size() + 1, 0);
    std::size_t lastStart = 0;
    for (std::size_t pc = 0; pc < f.code.size();) {
      std::uint32_t w = f.code[pc];
      if (opOf(w) >= static_cast<unsigned>(Op::Count)) return fail(pc, "unknown opcode " + std::to_string(opOf(w)));
      Op op = static_cast<Op>(opOf(w));
      const OpInfo& info = opInfo(op);
      isStart[pc] = 1;
      lastStart = pc;
      auto reg = [&](unsigned r, const char* what) { return r < f.nregs || fail(pc, std::string(what) + " register r" + std::to_string(r) + " is outside the frame (" + std::to_string(f.nregs) + ")"); };
      if (instrLen(op) == 2 && pc + 1 >= f.code.size()) return fail(pc, "instruction is cut off by the end of the code");
      if (info.fmt == Fmt::OP) { if ((w >> 8) != 0) return fail(pc, "operands on an operand-less instruction"); }
      else if (info.fmt == Fmt::AX) { if (axOf(w) >= f.code.size()) return fail(pc, "jump target out of range"); }
      else {
        if (aIsReg(op) && !reg(aOf(w), "A")) return false;
        if (info.fmt == Fmt::AD) {
          unsigned d = dOf(w);
          switch (op) {
            case Op::LoadK: if (d >= f.consts.size()) return fail(pc, "constant index out of range"); break;
            case Op::JmpIf: case Op::JmpIfNot: if (d >= f.code.size()) return fail(pc, "jump target out of range"); break;
            case Op::Call: if (d >= m.functions.size()) return fail(pc, "call to a missing function"); break;
            case Op::GetGlobal: case Op::SetGlobal: if (d >= m.globals.size()) return fail(pc, "missing global"); break;
            case Op::New: case Op::Downcast: if (d >= m.classes.size()) return fail(pc, "unknown class"); break;
            case Op::CallVirt: if (d >= m.selectors.size()) return fail(pc, "unknown selector"); break;
            default: break;
          }
        } else {  // ABC, ABK, AB2, AK2
          if (bIsReg(op) || op == Op::Move) { if (!reg(bOf(w), "B")) return false; } else if (bOf(w) != 0) return fail(pc, "unused operand B is not zero");
          if (cIsReg(op)) { if (!reg(cOf(w), "C")) return false; } else if (!cIsImm(op) && cOf(w) != 0) return fail(pc, "unused operand C is not zero");
          if (!aIsReg(op) && aOf(w) != 0) return fail(pc, "unused operand A is not zero");
          if (isFused(op) && f.code[pc + 1] >= f.code.size()) return fail(pc, "jump target out of range");
        }
      }
      pc += instrLen(op);
    }
    // every jump must land on the first word of an instruction
    for (std::size_t pc = 0; pc < f.code.size();) {
      Op op = static_cast<Op>(opOf(f.code[pc]));
      if (op == Op::Jmp || isCondJump(op)) {
        std::uint32_t t = jumpTarget(f.code, pc);
        if (t >= f.code.size() || !isStart[t]) return fail(pc, "jump target is not the start of an instruction");
      }
      pc += instrLen(op);
    }
    Op last = static_cast<Op>(opOf(f.code[lastStart]));
    if (!isTerminator(last)) return fail(lastStart, "code can fall off the end");
    return true;
  }

  State join(const State& a, const State& b) const {
    State r = a;
    for (std::size_t i = 0; i < r.size(); ++i) r[i] = joinSt(m, a[i], b[i]);
    return r;
  }

  bool step(std::size_t pc, State& s) {
    std::uint32_t w = f.code[pc];
    Op op = static_cast<Op>(opOf(w));
    const OpInfo& info = opInfo(op);
    auto defined = [&](unsigned r, const char* what) {
      return s[r] != 0 || fail(pc, std::string(what) + " r" + std::to_string(r) + " is read before it holds a value (undefined, clobbered by a call, or of conflicting types at a join)");
    };
    auto needCls = [&](unsigned r, Cls want, const char* what) {
      if (!defined(r, what)) return false;
      if (s[r] != encCls(want)) return fail(pc, std::string(what) + " r" + std::to_string(r) + " holds " + stName(m, s[r]) + ", expected " + vtName(m, VType{want, 0}));
      return true;
    };
    auto needRef = [&](unsigned r, const char* what) {
      if (!defined(r, what)) return false;
      if (!isRef(s[r])) return fail(pc, std::string(what) + " r" + std::to_string(r) + " holds " + stName(m, s[r]) + ", expected a reference");
      return true;
    };
    auto needType = [&](unsigned r, VType want, const char* what) {
      if (!defined(r, what)) return false;
      if (!assignableTo(m, s[r], want)) return fail(pc, std::string(what) + " r" + std::to_string(r) + " holds " + stName(m, s[r]) + ", expected " + vtName(m, want));
      return true;
    };
    switch (op) {
      case Op::Move:
        if (!defined(bOf(w), "move source")) return false;
        s[aOf(w)] = s[bOf(w)];
        return true;
      case Op::LoadI: s[aOf(w)] = 1; return true;
      case Op::LoadK: s[aOf(w)] = encCls(f.consts[dOf(w)].cls); return true;
      case Op::GetGlobal: s[aOf(w)] = enc(m.globals[dOf(w)]); return true;
      case Op::SetGlobal: return needType(aOf(w), m.globals[dOf(w)], "operand");
      case Op::JmpIf: case Op::JmpIfNot: return needCls(aOf(w), Cls::I, "condition");
      case Op::Throw: return defined(aOf(w), "thrown value");
      case Op::LogI: case Op::LogU: case Op::LogBool: return needCls(aOf(w), Cls::I, "operand");
      case Op::LogF64: return needCls(aOf(w), Cls::D, "operand");
      case Op::LogF32: return needCls(aOf(w), Cls::S, "operand");
      case Op::Ret:
        if (f.ret.cls == Cls::None) return fail(pc, "ret with a value in a void function");
        return needType(aOf(w), f.ret, "return value");
      case Op::RetV: return f.ret.cls == Cls::None || fail(pc, "retv in a function returning " + vtName(m, f.ret));
      case Op::Call: {
        const Function& callee = m.functions[dOf(w)];
        unsigned base = aOf(w);
        if (base + callee.params.size() > f.nregs) return fail(pc, "call window of @" + callee.name + " does not fit in the frame");
        for (std::size_t k = 0; k < callee.params.size(); ++k)
          if (!needType(base + static_cast<unsigned>(k), callee.params[k], "argument")) return false;
        for (std::size_t r = base; r < s.size(); ++r) s[r] = 0;  // the callee's frame overlays everything from the window up
        if (callee.ret.cls != Cls::None) s[base] = enc(callee.ret);
        return true;
      }
      case Op::New: {
        const ClassInfo& c = m.classes[dOf(w)];
        if (c.isInterface || c.isAbstract) return fail(pc, "new of the " + std::string(c.isInterface ? "interface " : "abstract class ") + c.name);
        s[aOf(w)] = static_cast<St>(4 + dOf(w));
        return true;
      }
      case Op::GetField: {
        if (!needRef(bOf(w), "object")) return false;
        const ClassInfo& c = m.classes[s[bOf(w)] - 4];
        if (cOf(w) >= c.fields.size()) return fail(pc, "field " + std::to_string(cOf(w)) + " does not exist in " + c.name);
        s[aOf(w)] = enc(c.fields[cOf(w)]);
        return true;
      }
      case Op::SetField: {
        if (!needRef(aOf(w), "object")) return false;
        const ClassInfo& c = m.classes[s[aOf(w)] - 4];
        if (cOf(w) >= c.fields.size()) return fail(pc, "field " + std::to_string(cOf(w)) + " does not exist in " + c.name);
        return needType(bOf(w), c.fields[cOf(w)], "stored value");
      }
      case Op::CallVirt: {
        unsigned base = aOf(w);
        if (!needRef(base, "receiver")) return false;
        const ClassInfo& c = m.classes[s[base] - 4];
        const SelInfo& sel = m.selectors[dOf(w)];
        bool visible = false;
        for (std::uint32_t x : c.selectors) if (x == dOf(w)) visible = true;
        if (!visible) return fail(pc, "." + sel.name + " is not a method of " + c.name);
        if (base + sel.params.size() + 1 > f.nregs) return fail(pc, "call window of ." + sel.name + " does not fit in the frame");
        for (std::size_t k = 0; k < sel.params.size(); ++k)
          if (!needType(base + 1 + static_cast<unsigned>(k), sel.params[k], "argument")) return false;
        for (std::size_t r = base; r < s.size(); ++r) s[r] = 0;
        if (sel.ret.cls != Cls::None) s[base] = enc(sel.ret);
        return true;
      }
      case Op::Downcast:
        if (!needRef(aOf(w), "value")) return false;
        s[aOf(w)] = static_cast<St>(4 + dOf(w));
        return true;
      case Op::EqR: case Op::NeR:
        if (!needRef(bOf(w), "operand") || !needRef(cOf(w), "operand")) return false;
        s[aOf(w)] = 1;
        return true;
      default: break;
    }
    if (info.fmt == Fmt::ABK) { if (!needCls(bOf(w), Cls::I, "operand")) return false; s[aOf(w)] = 1; return true; }
    if (info.fmt == Fmt::AB2) return needCls(aOf(w), Cls::I, "operand") && needCls(bOf(w), Cls::I, "operand");
    if (info.fmt == Fmt::AK2) return needCls(aOf(w), Cls::I, "operand");
    if (info.inB != RC::None && !needCls(bOf(w), rcToCls(info.inB), "operand")) return false;
    if (info.inC != RC::None && !needCls(cOf(w), rcToCls(info.inC), "operand")) return false;
    if (info.out != RC::None) s[aOf(w)] = encCls(rcToCls(info.out));
    return true;
  }

  bool run() {
    if (!structure()) return false;
    std::size_t n = f.code.size();
    std::vector<char> leader(n + 1, 0);
    leader[0] = 1;
    for (std::size_t pc = 0; pc < n;) {
      Op op = static_cast<Op>(opOf(f.code[pc]));
      if (op == Op::Jmp || isCondJump(op)) leader[jumpTarget(f.code, pc)] = 1;
      std::size_t next = pc + instrLen(op);
      if (isTerminator(op) || isCondJump(op)) leader[next] = 1;
      pc = next;
    }
    std::vector<State> in(n);
    std::vector<char> have(n, 0);
    State entry(f.nregs, 0);
    for (std::size_t i = 0; i < f.params.size(); ++i) entry[i] = enc(f.params[i]);
    in[0] = entry; have[0] = 1;
    std::vector<std::size_t> work{0};
    auto push = [&](std::size_t target, const State& s) {
      if (!have[target]) { in[target] = s; have[target] = 1; work.push_back(target); return; }
      State j = join(in[target], s);
      if (j != in[target]) { in[target] = j; work.push_back(target); }
    };
    while (!work.empty()) {
      std::size_t pc = work.back(); work.pop_back();
      State s = in[pc];
      for (;;) {
        if (!step(pc, s)) return false;
        Op op = static_cast<Op>(opOf(f.code[pc]));
        std::size_t next = pc + instrLen(op);
        if (op == Op::Jmp) { push(axOf(f.code[pc]), s); break; }
        if (isTerminator(op)) break;
        if (isCondJump(op)) {
          push(jumpTarget(f.code, pc), s);
          if (next >= n) return fail(pc, "code can fall off the end");
          push(next, s);
          break;
        }
        if (next >= n) return fail(pc, "code can fall off the end");
        if (leader[next]) { push(next, s); break; }
        pc = next;
      }
    }
    return true;
  }
};

// ---- binary format. "ZBC2", u32 version, then: classes, selectors, globals, functions (see encode()).

constexpr char kMagic[4] = {'Z', 'B', 'C', '2'};
constexpr std::uint32_t kVersion = 2;

struct Writer {
  std::vector<std::uint8_t> b;
  void u8(std::uint8_t v) { b.push_back(v); }
  void u16(std::uint16_t v) { u8(v & 0xFF); u8(v >> 8); }
  void u32(std::uint32_t v) { u16(v & 0xFFFF); u16(static_cast<std::uint16_t>(v >> 16)); }
  void u64(std::uint64_t v) { u32(static_cast<std::uint32_t>(v)); u32(static_cast<std::uint32_t>(v >> 32)); }
  void str(const std::string& s) { u32(static_cast<std::uint32_t>(s.size())); for (char c : s) u8(static_cast<std::uint8_t>(c)); }
  void vt(VType t) { u8(static_cast<std::uint8_t>(t.cls)); if (t.cls == Cls::R) u16(t.ref); }
  void u32s(const std::vector<std::uint32_t>& v) { u32(static_cast<std::uint32_t>(v.size())); for (std::uint32_t x : v) u32(x); }
};

struct Reader {
  const std::vector<std::uint8_t>& b;
  std::size_t p = 0;
  bool bad = false;
  explicit Reader(const std::vector<std::uint8_t>& bytes) : b(bytes) {}
  bool has(std::size_t n) { if (p > b.size() || b.size() - p < n) { bad = true; return false; } return true; }
  std::uint8_t u8() { if (!has(1)) return 0; return b[p++]; }
  std::uint16_t u16() { std::uint16_t lo = u8(); return static_cast<std::uint16_t>(lo | u8() << 8); }
  std::uint32_t u32() { std::uint32_t lo = u16(); return lo | static_cast<std::uint32_t>(u16()) << 16; }
  std::uint64_t u64() { std::uint64_t lo = u32(); return lo | static_cast<std::uint64_t>(u32()) << 32; }
  bool str(std::string& out) {
    std::uint32_t n = u32();
    if (!has(n)) return false;
    out.assign(reinterpret_cast<const char*>(b.data() + p), n);
    p += n;
    return true;
  }
  bool vt(VType& t) {
    std::uint8_t c = u8();
    if (c > static_cast<std::uint8_t>(Cls::R)) { bad = true; return false; }
    t.cls = static_cast<Cls>(c);
    t.ref = t.cls == Cls::R ? u16() : 0;
    return !bad;
  }
  bool u32s(std::vector<std::uint32_t>& v) {
    std::uint32_t n = u32();
    if (!has(static_cast<std::size_t>(n) * 4)) return false;
    v.clear();
    for (std::uint32_t i = 0; i < n; ++i) v.push_back(u32());
    return !bad;
  }
};

std::string constText(const Const& c) {
  char buf[48];
  if (c.cls == Cls::D) { double d; std::memcpy(&d, &c.bits, 8); std::snprintf(buf, sizeof buf, "%.17g", d); return std::string("f64 ") + buf; }
  if (c.cls == Cls::S) { float f; std::uint32_t lo = static_cast<std::uint32_t>(c.bits); std::memcpy(&f, &lo, 4); std::snprintf(buf, sizeof buf, "%.9g", static_cast<double>(f)); return std::string("f32 ") + buf; }
  return "i " + std::to_string(static_cast<std::int64_t>(c.bits));
}

}  // namespace

std::string verify(const Module& m) {
  if (m.functions.empty()) return "module has no functions";
  if (m.functions.size() > kMaxFunctions) return "too many functions";
  if (m.functions[0].name != "main" || !m.functions[0].params.empty()) return "function 0 must be main with no parameters";
  if (std::string e = verifyTables(m); !e.empty()) return e;
  for (std::size_t i = 0; i < m.functions.size(); ++i) {
    Verifier v(m, i);
    if (!v.run()) return v.err;
  }
  return "";
}

std::vector<std::uint8_t> encode(const Module& m) {
  Writer w;
  for (char c : kMagic) w.u8(static_cast<std::uint8_t>(c));
  w.u32(kVersion);
  w.u32(static_cast<std::uint32_t>(m.classes.size()));
  for (const ClassInfo& c : m.classes) {
    w.str(c.name);
    w.u32(c.parent);
    w.u8(static_cast<std::uint8_t>((c.isInterface ? 1 : 0) | (c.isAbstract ? 2 : 0)));
    w.u32s(c.supers);
    w.u32(static_cast<std::uint32_t>(c.fields.size()));
    for (VType t : c.fields) w.vt(t);
    w.u32s(c.selectors);
    w.u32s(c.vtable);
  }
  w.u32(static_cast<std::uint32_t>(m.selectors.size()));
  for (const SelInfo& s : m.selectors) {
    w.str(s.name);
    w.u8(static_cast<std::uint8_t>(s.params.size()));
    for (VType t : s.params) w.vt(t);
    w.vt(s.ret);
  }
  w.u32(static_cast<std::uint32_t>(m.globals.size()));
  for (VType t : m.globals) w.vt(t);
  w.u32(static_cast<std::uint32_t>(m.functions.size()));
  for (const Function& f : m.functions) {
    w.str(f.name);
    w.u8(static_cast<std::uint8_t>(f.params.size()));
    for (VType t : f.params) w.vt(t);
    w.vt(f.ret);
    w.u16(static_cast<std::uint16_t>(f.nregs));
    w.u32(static_cast<std::uint32_t>(f.code.size()));
    for (std::uint32_t x : f.code) w.u32(x);
    w.u32(static_cast<std::uint32_t>(f.consts.size()));
    for (const Const& c : f.consts) { w.u8(static_cast<std::uint8_t>(c.cls)); w.u64(c.bits); }
  }
  return w.b;
}

bool decode(const std::vector<std::uint8_t>& bytes, Module& out, std::string& err) {
  Reader r(bytes);
  auto fail = [&](const char* msg) { err = msg; return false; };
  for (char c : kMagic) if (r.u8() != static_cast<std::uint8_t>(c)) return fail("not a ZBC file (bad magic)");
  if (r.u32() != kVersion) return fail("unsupported ZBC version");
  out = Module{};
  std::uint32_t nc = r.u32();
  if (nc > kMaxClasses) return fail("too many classes");
  for (std::uint32_t i = 0; i < nc; ++i) {
    ClassInfo c;
    if (!r.str(c.name)) return fail("truncated file (class name)");
    c.parent = r.u32();
    std::uint8_t fl = r.u8();
    c.isInterface = fl & 1; c.isAbstract = (fl & 2) != 0;
    if (!r.u32s(c.supers)) return fail("truncated file (class supertypes)");
    std::uint32_t nf = r.u32();
    if (nf > kMaxFields) return fail("too many fields");
    for (std::uint32_t k = 0; k < nf; ++k) { VType t; if (!r.vt(t)) return fail("invalid field type"); c.fields.push_back(t); }
    if (!r.u32s(c.selectors) || !r.u32s(c.vtable)) return fail("truncated file (class tables)");
    out.classes.push_back(std::move(c));
  }
  std::uint32_t ns = r.u32();
  if (ns > 65535) return fail("too many selectors");
  for (std::uint32_t i = 0; i < ns; ++i) {
    SelInfo s;
    if (!r.str(s.name)) return fail("truncated file (selector name)");
    std::uint8_t np = r.u8();
    for (std::uint8_t k = 0; k < np; ++k) { VType t; if (!r.vt(t)) return fail("invalid selector type"); s.params.push_back(t); }
    if (!r.vt(s.ret)) return fail("invalid selector type");
    out.selectors.push_back(std::move(s));
  }
  std::uint32_t ng = r.u32();
  if (!r.has(ng)) return fail("truncated file (globals)");
  for (std::uint32_t i = 0; i < ng; ++i) { VType t; if (!r.vt(t)) return fail("invalid global type"); out.globals.push_back(t); }
  std::uint32_t nf = r.u32();
  if (nf > kMaxFunctions) return fail("too many functions");
  for (std::uint32_t i = 0; i < nf; ++i) {
    Function f;
    if (!r.str(f.name)) return fail("truncated file (function name)");
    std::uint8_t np = r.u8();
    for (std::uint8_t k = 0; k < np; ++k) { VType t; if (!r.vt(t)) return fail("invalid parameter type"); f.params.push_back(t); }
    if (!r.vt(f.ret)) return fail("invalid return type");
    f.nregs = r.u16();
    std::uint32_t ncode = r.u32();
    if (ncode > kMaxCodeWords || !r.has(static_cast<std::size_t>(ncode) * 4)) return fail("truncated file (code)");
    for (std::uint32_t k = 0; k < ncode; ++k) f.code.push_back(r.u32());
    std::uint32_t nk = r.u32();
    if (nk > kMaxConsts || !r.has(static_cast<std::size_t>(nk) * 9)) return fail("truncated file (constants)");
    for (std::uint32_t k = 0; k < nk; ++k) {
      Const c;
      std::uint8_t cc = r.u8();
      if (cc == 0 || cc > static_cast<std::uint8_t>(Cls::D)) return fail("invalid constant class");
      c.cls = static_cast<Cls>(cc);
      c.bits = r.u64();
      f.consts.push_back(c);
    }
    if (r.bad) return fail("truncated file");
    out.functions.push_back(std::move(f));
  }
  if (r.bad) return fail("truncated file");
  if (r.p != bytes.size()) return fail("trailing bytes after the last function");
  return true;
}

std::string disassemble(const Module& m) {
  std::string out;
  for (std::size_t ci = 0; ci < m.classes.size(); ++ci) {
    const ClassInfo& c = m.classes[ci];
    out += std::string(c.isInterface ? "interface " : c.isAbstract ? "abstract class " : "class ") + c.name;
    if (c.parent != kNoCls && c.parent < m.classes.size()) out += " : " + m.classes[c.parent].name;
    if (!c.isInterface) {
      out += " {";
      for (std::size_t k = 0; k < c.fields.size(); ++k) out += (k ? ", " : " ") + vtName(m, c.fields[k]);
      out += c.fields.empty() ? "}" : " }";
    }
    out += "\n";
    for (std::uint32_t sel : c.selectors) {
      if (sel >= m.selectors.size()) continue;
      if (c.isInterface || c.isAbstract) { out += "  method ." + m.selectors[sel].name + "\n"; continue; }
      if (sel < c.vtable.size() && c.vtable[sel] != kNoCls && c.vtable[sel] < m.functions.size()) out += "  vtable ." + m.selectors[sel].name + " -> @" + m.functions[c.vtable[sel]].name + "\n";
    }
  }
  for (std::size_t g = 0; g < m.globals.size(); ++g) out += "global g" + std::to_string(g) + ": " + vtName(m, m.globals[g]) + "\n";
  for (const Function& f : m.functions) {
    out += "func @" + f.name + "(";
    for (std::size_t i = 0; i < f.params.size(); ++i) out += (i ? ", " : "") + vtName(m, f.params[i]);
    out += ") -> " + vtName(m, f.ret) + " nregs=" + std::to_string(f.nregs) + "\n";
    for (std::size_t pc = 0; pc < f.code.size();) {
      std::uint32_t w = f.code[pc];
      char head[24];
      if (opOf(w) >= static_cast<unsigned>(Op::Count)) { out += "  ?\n"; ++pc; continue; }
      Op op = static_cast<Op>(opOf(w));
      const OpInfo& info = opInfo(op);
      std::snprintf(head, sizeof head, "%4zu  %-9s", pc, info.name);
      std::string s = head, ops;
      auto r = [](unsigned x) { return "r" + std::to_string(x); };
      auto clsN = [&](unsigned id) { return id < m.classes.size() ? m.classes[id].name : std::string("?"); };
      if (info.fmt == Fmt::AX) ops = "-> " + std::to_string(axOf(w));
      else if (info.fmt == Fmt::AD) {
        switch (op) {
          case Op::LoadI: ops = r(aOf(w)) + ", " + std::to_string(sdOf(w)); break;
          case Op::LoadK: ops = r(aOf(w)) + ", " + (dOf(w) < f.consts.size() ? constText(f.consts[dOf(w)]) : "?"); break;
          case Op::JmpIf: case Op::JmpIfNot: ops = r(aOf(w)) + ", -> " + std::to_string(dOf(w)); break;
          case Op::Call: ops = r(aOf(w)) + ", @" + (dOf(w) < m.functions.size() ? m.functions[dOf(w)].name : "?"); break;
          case Op::New: case Op::Downcast: ops = r(aOf(w)) + ", " + clsN(dOf(w)); break;
          case Op::CallVirt: ops = r(aOf(w)) + ", ." + (dOf(w) < m.selectors.size() ? m.selectors[dOf(w)].name : "?"); break;
          default: ops = r(aOf(w)) + ", g" + std::to_string(dOf(w)); break;
        }
      } else if (info.fmt == Fmt::ABK) {
        ops = r(aOf(w)) + ", " + r(bOf(w)) + ", " + std::to_string(immOf(w));
      } else if (info.fmt == Fmt::AB2) {
        ops = r(aOf(w)) + ", " + r(bOf(w)) + ", -> " + std::to_string(pc + 1 < f.code.size() ? f.code[pc + 1] : 0u);
      } else if (info.fmt == Fmt::AK2) {
        ops = r(aOf(w)) + ", " + std::to_string(immOf(w)) + ", -> " + std::to_string(pc + 1 < f.code.size() ? f.code[pc + 1] : 0u);
      } else if (info.fmt == Fmt::ABC) {
        if (aIsReg(op)) ops = r(aOf(w));
        if (bIsReg(op) || op == Op::Move) ops += (ops.empty() ? "" : ", ") + r(bOf(w));
        if (cIsReg(op)) ops += (ops.empty() ? "" : ", ") + r(cOf(w));
        if (op == Op::GetField || op == Op::SetField) ops += ", ." + std::to_string(cOf(w));
      }
      out += s + ops + "\n";
      pc += instrLen(op);
    }
  }
  return out;
}

}  // namespace zn::zbc
