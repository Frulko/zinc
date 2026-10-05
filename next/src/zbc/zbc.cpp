#include "zbc/zbc.h"

#include <cstdio>
#include <cstring>

namespace zn::zbc {

namespace {

const char* clsName(Cls c) {
  switch (c) {
    case Cls::I: return "i";
    case Cls::S: return "f32";
    case Cls::D: return "f64";
    default: return "void";
  }
}

Cls rcToCls(RC r) { return r == RC::I ? Cls::I : r == RC::S ? Cls::S : r == RC::D ? Cls::D : Cls::None; }

bool aIsReg(Op op) {
  const OpInfo& i = opInfo(op);
  if (i.fmt == Fmt::OP || i.fmt == Fmt::AX) return false;
  if (i.fmt == Fmt::AD) return op == Op::LoadI || op == Op::LoadK || op == Op::JmpIf || op == Op::JmpIfNot || op == Op::Call || op == Op::GetGlobal || op == Op::SetGlobal;
  return i.out != RC::None || op == Op::Ret || op == Op::Throw || op == Op::LogI || op == Op::LogU || op == Op::LogF64 || op == Op::LogF32 || op == Op::LogBool;
}
bool bIsReg(Op op) { const OpInfo& i = opInfo(op); return i.fmt == Fmt::ABC && i.inB != RC::None; }
bool cIsReg(Op op) { const OpInfo& i = opInfo(op); return i.fmt == Fmt::ABC && i.inC != RC::None; }
bool isTerminator(Op op) { return op == Op::Jmp || op == Op::Ret || op == Op::RetV || op == Op::Throw || op == Op::Trap; }

// ---- verifier

struct Verifier {
  const Module& m;
  const Function& f;
  std::size_t fi;
  std::string err;
  using State = std::vector<std::uint8_t>;  // per register: 0 undefined, else Cls

  Verifier(const Module& mod, std::size_t idx) : m(mod), f(mod.functions[idx]), fi(idx) {}

  bool fail(std::size_t pc, const std::string& msg) {
    if (err.empty()) err = "@" + f.name + " pc " + std::to_string(pc) + ": " + msg;
    return false;
  }

  bool structure() {
    if (f.nregs > kMaxRegisters) return fail(0, "frame has more than " + std::to_string(kMaxRegisters) + " registers");
    if (f.params.size() > f.nregs) return fail(0, "more parameters than registers");
    if (f.code.empty()) return fail(0, "function has no code");
    if (f.code.size() > kMaxCodeWords) return fail(0, "function is too large");
    if (f.consts.size() > kMaxConsts) return fail(0, "too many constants");
    for (std::size_t pc = 0; pc < f.code.size(); ++pc) {
      std::uint32_t w = f.code[pc];
      if (opOf(w) >= static_cast<unsigned>(Op::Count)) return fail(pc, "unknown opcode " + std::to_string(opOf(w)));
      Op op = static_cast<Op>(opOf(w));
      const OpInfo& info = opInfo(op);
      auto reg = [&](unsigned r, const char* what) { return r < f.nregs || fail(pc, std::string(what) + " register r" + std::to_string(r) + " is outside the frame (" + std::to_string(f.nregs) + ")"); };
      if (info.fmt == Fmt::OP) { if ((w >> 8) != 0) return fail(pc, "operands on an operand-less instruction"); continue; }
      if (info.fmt == Fmt::AX) { if (axOf(w) >= f.code.size()) return fail(pc, "jump target out of range"); continue; }
      if (aIsReg(op) && !reg(aOf(w), "A")) return false;
      if (info.fmt == Fmt::ABC) {
        if (bIsReg(op) || op == Op::Move) { if (!reg(bOf(w), "B")) return false; } else if (bOf(w) != 0) return fail(pc, "unused operand B is not zero");
        if (cIsReg(op)) { if (!reg(cOf(w), "C")) return false; } else if (cOf(w) != 0) return fail(pc, "unused operand C is not zero");
        if (!aIsReg(op) && aOf(w) != 0) return fail(pc, "unused operand A is not zero");
      } else {  // AD
        unsigned d = dOf(w);
        switch (op) {
          case Op::LoadK: if (d >= f.consts.size()) return fail(pc, "constant index out of range"); break;
          case Op::JmpIf: case Op::JmpIfNot: if (d >= f.code.size()) return fail(pc, "jump target out of range"); break;
          case Op::Call: if (d >= m.functions.size()) return fail(pc, "call to a missing function"); break;
          case Op::GetGlobal: case Op::SetGlobal: if (d >= m.globals.size()) return fail(pc, "missing global"); break;
          default: break;
        }
      }
    }
    Op last = static_cast<Op>(opOf(f.code.back()));
    if (!isTerminator(last)) return fail(f.code.size() - 1, "code can fall off the end");
    return true;
  }

  static State join(const State& a, const State& b) {
    State r = a;
    for (std::size_t i = 0; i < r.size(); ++i) if (r[i] != b[i]) r[i] = 0;
    return r;
  }

  bool step(std::size_t pc, State& s) {
    std::uint32_t w = f.code[pc];
    Op op = static_cast<Op>(opOf(w));
    const OpInfo& info = opInfo(op);
    auto need = [&](unsigned r, Cls want, const char* what) {
      if (s[r] == 0) return fail(pc, std::string(what) + " r" + std::to_string(r) + " is read before it holds a value (undefined, clobbered by a call, or of conflicting types at a join)");
      if (static_cast<Cls>(s[r]) != want) return fail(pc, std::string(what) + " r" + std::to_string(r) + " holds " + clsName(static_cast<Cls>(s[r])) + ", expected " + clsName(want));
      return true;
    };
    switch (op) {
      case Op::Move:
        if (s[bOf(w)] == 0) return fail(pc, "move reads r" + std::to_string(bOf(w)) + " before it holds a value");
        s[aOf(w)] = s[bOf(w)];
        return true;
      case Op::LoadI: s[aOf(w)] = static_cast<std::uint8_t>(Cls::I); return true;
      case Op::LoadK: s[aOf(w)] = static_cast<std::uint8_t>(f.consts[dOf(w)].cls); return true;
      case Op::GetGlobal: s[aOf(w)] = static_cast<std::uint8_t>(m.globals[dOf(w)]); return true;
      case Op::SetGlobal: return need(aOf(w), m.globals[dOf(w)], "operand");
      case Op::JmpIf: case Op::JmpIfNot: return need(aOf(w), Cls::I, "condition");
      case Op::Throw: return s[aOf(w)] != 0 || fail(pc, "throw reads an undefined register");
      case Op::LogI: case Op::LogU: case Op::LogBool: return need(aOf(w), Cls::I, "operand");
      case Op::LogF64: return need(aOf(w), Cls::D, "operand");
      case Op::LogF32: return need(aOf(w), Cls::S, "operand");
      case Op::Ret:
        if (f.ret == Cls::None) return fail(pc, "ret with a value in a void function");
        return need(aOf(w), f.ret, "return value");
      case Op::RetV: return f.ret == Cls::None || fail(pc, "retv in a function returning " + std::string(clsName(f.ret)));
      case Op::Call: {
        const Function& callee = m.functions[dOf(w)];
        unsigned base = aOf(w);
        if (base + callee.params.size() > f.nregs) return fail(pc, "call window of @" + callee.name + " does not fit in the frame");
        for (std::size_t k = 0; k < callee.params.size(); ++k)
          if (!need(base + static_cast<unsigned>(k), callee.params[k], "argument")) return false;
        for (std::size_t r = base; r < s.size(); ++r) s[r] = 0;  // the callee's frame overlays everything from the window up
        if (callee.ret != Cls::None) {
          if (base >= f.nregs) return fail(pc, "call result register is outside the frame");
          s[base] = static_cast<std::uint8_t>(callee.ret);
        }
        return true;
      }
      default: break;
    }
    if (info.inB != RC::None && !need(bOf(w), rcToCls(info.inB), "operand")) return false;
    if (info.inC != RC::None && !need(cOf(w), rcToCls(info.inC), "operand")) return false;
    if (info.out != RC::None) s[aOf(w)] = static_cast<std::uint8_t>(rcToCls(info.out));
    return true;
  }

  bool run() {
    if (!structure()) return false;
    std::size_t n = f.code.size();
    std::vector<char> leader(n + 1, 0);
    leader[0] = 1;
    for (std::size_t pc = 0; pc < n; ++pc) {
      Op op = static_cast<Op>(opOf(f.code[pc]));
      if (op == Op::Jmp) leader[axOf(f.code[pc])] = 1;
      if (op == Op::JmpIf || op == Op::JmpIfNot) leader[dOf(f.code[pc])] = 1;
      if (isTerminator(op) || op == Op::JmpIf || op == Op::JmpIfNot) leader[pc + 1] = 1;
    }
    std::vector<State> in(n);
    std::vector<char> have(n, 0);
    State entry(f.nregs, 0);
    for (std::size_t i = 0; i < f.params.size(); ++i) entry[i] = static_cast<std::uint8_t>(f.params[i]);
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
      for (;; ++pc) {
        if (!step(pc, s)) return false;
        Op op = static_cast<Op>(opOf(f.code[pc]));
        if (op == Op::Jmp) { push(axOf(f.code[pc]), s); break; }
        if (isTerminator(op)) break;
        if (op == Op::JmpIf || op == Op::JmpIfNot) {
          push(dOf(f.code[pc]), s);
          if (pc + 1 >= n) return fail(pc, "code can fall off the end");
          push(pc + 1, s);
          break;
        }
        if (pc + 1 >= n) return fail(pc, "code can fall off the end");
        if (leader[pc + 1]) { push(pc + 1, s); break; }
      }
    }
    return true;
  }
};

// ---- binary format: "ZBC1", u32 version, u32 nglobals, u8 class per global, u32 nfunctions, then per function:
//   u32 name length + bytes, u8 nparams + u8 classes, u8 ret class, u16 nregs, u32 ncode + words, u32 nconsts + (u8 class, u64 bits).

constexpr char kMagic[4] = {'Z', 'B', 'C', '1'};
constexpr std::uint32_t kVersion = 1;

struct Writer {
  std::vector<std::uint8_t> b;
  void u8(std::uint8_t v) { b.push_back(v); }
  void u16(std::uint16_t v) { u8(v & 0xFF); u8(v >> 8); }
  void u32(std::uint32_t v) { u16(v & 0xFFFF); u16(static_cast<std::uint16_t>(v >> 16)); }
  void u64(std::uint64_t v) { u32(static_cast<std::uint32_t>(v)); u32(static_cast<std::uint32_t>(v >> 32)); }
};

struct Reader {
  const std::vector<std::uint8_t>& b;
  std::size_t p = 0;
  bool bad = false;
  explicit Reader(const std::vector<std::uint8_t>& bytes) : b(bytes) {}
  bool has(std::size_t n) { if (b.size() - p < n || p > b.size()) { bad = true; return false; } return true; }
  std::uint8_t u8() { if (!has(1)) return 0; return b[p++]; }
  std::uint16_t u16() { std::uint16_t lo = u8(); return static_cast<std::uint16_t>(lo | u8() << 8); }
  std::uint32_t u32() { std::uint32_t lo = u16(); return lo | static_cast<std::uint32_t>(u16()) << 16; }
  std::uint64_t u64() { std::uint64_t lo = u32(); return lo | static_cast<std::uint64_t>(u32()) << 32; }
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
  w.u32(static_cast<std::uint32_t>(m.globals.size()));
  for (Cls c : m.globals) w.u8(static_cast<std::uint8_t>(c));
  w.u32(static_cast<std::uint32_t>(m.functions.size()));
  for (const Function& f : m.functions) {
    w.u32(static_cast<std::uint32_t>(f.name.size()));
    for (char c : f.name) w.u8(static_cast<std::uint8_t>(c));
    w.u8(static_cast<std::uint8_t>(f.params.size()));
    for (Cls c : f.params) w.u8(static_cast<std::uint8_t>(c));
    w.u8(static_cast<std::uint8_t>(f.ret));
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
  auto cls = [&](std::uint8_t v, Cls& dst) { if (v > static_cast<std::uint8_t>(Cls::D)) return false; dst = static_cast<Cls>(v); return true; };
  std::uint32_t ng = r.u32();
  if (!r.has(ng)) return fail("truncated file (globals)");
  out.globals.assign(ng, Cls::I);
  for (std::uint32_t i = 0; i < ng; ++i) if (!cls(r.u8(), out.globals[i])) return fail("invalid global class");
  std::uint32_t nf = r.u32();
  if (nf > kMaxFunctions) return fail("too many functions");
  out.functions.clear();
  for (std::uint32_t i = 0; i < nf; ++i) {
    Function f;
    std::uint32_t nl = r.u32();
    if (!r.has(nl)) return fail("truncated file (function name)");
    for (std::uint32_t k = 0; k < nl; ++k) f.name += static_cast<char>(r.u8());
    std::uint8_t np = r.u8();
    for (std::uint8_t k = 0; k < np; ++k) { Cls c = Cls::None; if (!cls(r.u8(), c)) return fail("invalid parameter class"); f.params.push_back(c); }
    if (!cls(r.u8(), f.ret)) return fail("invalid return class");
    f.nregs = r.u16();
    std::uint32_t nc = r.u32();
    if (nc > kMaxCodeWords || !r.has(static_cast<std::size_t>(nc) * 4)) return fail("truncated file (code)");
    for (std::uint32_t k = 0; k < nc; ++k) f.code.push_back(r.u32());
    std::uint32_t nk = r.u32();
    if (nk > kMaxConsts || !r.has(static_cast<std::size_t>(nk) * 9)) return fail("truncated file (constants)");
    for (std::uint32_t k = 0; k < nk; ++k) { Const c; if (!cls(r.u8(), c.cls)) return fail("invalid constant class"); c.bits = r.u64(); f.consts.push_back(c); }
    if (r.bad) return fail("truncated file");
    out.functions.push_back(std::move(f));
  }
  if (r.bad) return fail("truncated file");
  if (r.p != bytes.size()) return fail("trailing bytes after the last function");
  return true;
}

std::string disassemble(const Module& m) {
  std::string out;
  for (std::size_t g = 0; g < m.globals.size(); ++g) out += "global g" + std::to_string(g) + ": " + clsName(m.globals[g]) + "\n";
  for (const Function& f : m.functions) {
    out += "func @" + f.name + "(";
    for (std::size_t i = 0; i < f.params.size(); ++i) out += (i ? ", " : "") + std::string(clsName(f.params[i]));
    out += ") -> " + std::string(clsName(f.ret)) + " nregs=" + std::to_string(f.nregs) + "\n";
    for (std::size_t pc = 0; pc < f.code.size(); ++pc) {
      std::uint32_t w = f.code[pc];
      char head[24];
      if (opOf(w) >= static_cast<unsigned>(Op::Count)) { out += "  ?\n"; continue; }
      Op op = static_cast<Op>(opOf(w));
      const OpInfo& info = opInfo(op);
      std::snprintf(head, sizeof head, "%4zu  %-9s", pc, info.name);
      std::string s = head, ops;
      auto r = [](unsigned x) { return "r" + std::to_string(x); };
      if (info.fmt == Fmt::AX) ops = "-> " + std::to_string(axOf(w));
      else if (info.fmt == Fmt::AD) {
        switch (op) {
          case Op::LoadI: ops = r(aOf(w)) + ", " + std::to_string(sdOf(w)); break;
          case Op::LoadK: ops = r(aOf(w)) + ", " + (dOf(w) < f.consts.size() ? constText(f.consts[dOf(w)]) : "?"); break;
          case Op::JmpIf: case Op::JmpIfNot: ops = r(aOf(w)) + ", -> " + std::to_string(dOf(w)); break;
          case Op::Call: ops = r(aOf(w)) + ", @" + (dOf(w) < m.functions.size() ? m.functions[dOf(w)].name : "?"); break;
          default: ops = r(aOf(w)) + ", g" + std::to_string(dOf(w)); break;
        }
      } else if (info.fmt == Fmt::ABC) {
        if (aIsReg(op)) ops = r(aOf(w));
        if (bIsReg(op) || op == Op::Move) ops += (ops.empty() ? "" : ", ") + r(bOf(w));
        if (cIsReg(op)) ops += (ops.empty() ? "" : ", ") + r(cOf(w));
      }
      out += s + ops + "\n";
    }
  }
  return out;
}

}  // namespace zn::zbc
