#include "aot/aot.h"

#include <algorithm>
#include <cstdio>
#include <map>
#include <set>
#include <vector>

#include "zn/bytecode.h"
#include "zn/ops.h"

namespace zn::aot {

namespace {

enum class Fmt { OP, ABC, AD, AX, ABK, AB2, AK2 };
struct OpInfoRow { const char* name; Fmt fmt; bool binary; };  // binary: the C operand is a register the operation reads

constexpr OpInfoRow kOps[] = {
#define X(name, fmt, b, c, out) {#name, Fmt::fmt, #c[0] != '_'},
    ZN_OPCODES(X)
#undef X
};

std::set<std::string> namesOf(int which) {
  std::set<std::string> s;
  if (which == 0) {
#define X(name, expr) s.insert(#name);
    ZN_ARITH_OPS(X)
#undef X
  } else {
#define X(name, zero, expr) s.insert(#name);
    ZN_DIV_OPS(X)
#undef X
  }
  return s;
}

struct FnEmitter {
  const zbc::Module& m;
  const zbc::Function& f;
  std::size_t index;
  std::string out;
  std::set<std::uint32_t> labels;
  std::map<std::uint32_t, std::vector<const zbc::Handler*>> handlersAt;
  const std::set<std::string>& arith;
  const std::set<std::string>& divs;
  const std::vector<char>& typedFn;   // per function: compiled as a C function with typed parameters (ZN-144)
  bool typed = false;                  // this one is

  FnEmitter(const zbc::Module& mod, const zbc::Function& fn, std::size_t i, const std::set<std::string>& a, const std::set<std::string>& d, const std::vector<char>& tf)
      : m(mod), f(fn), index(i), arith(a), divs(d), typedFn(tf) {}

  std::string r(unsigned k) { return typed ? "r" + std::to_string(k) : "r[" + std::to_string(k) + "]"; }
  std::string num(std::int64_t v) { return std::to_string(v); }
  void line(const std::string& s) { out += "  " + s + "\n"; }

  static unsigned lengthOf(std::uint32_t w) {
    Fmt fm = kOps[opOf(w)].fmt;
    return fm == Fmt::AB2 || fm == Fmt::AK2 ? 2 : 1;
  }

  void collectLabels() {
    for (std::size_t pc = 0; pc < f.code.size(); pc += lengthOf(f.code[pc])) {
      std::uint32_t w = f.code[pc];
      const OpInfoRow& o = kOps[opOf(w)];
      std::string nm = o.name;
      if (nm == "Jmp") labels.insert(axOf(w));
      else if (nm == "JmpIf" || nm == "JmpIfNot") labels.insert(dOf(w));
      else if (o.fmt == Fmt::AB2 || o.fmt == Fmt::AK2) labels.insert(f.code[pc + 1]);
    }
    for (const zbc::Handler& h : f.handlers) { labels.insert(h.target); handlersAt[h.at].push_back(&h); }
  }

  // What follows a call or throw that did not return normally: take a handler of this instruction, else propagate.
  std::string unwind(std::uint32_t pc, const std::string& exc) {
    std::string s;
    auto it = handlersAt.find(pc);
    if (it != handlersAt.end()) {
      for (const zbc::Handler* h : it->second)
        s += "if (isSubclassRT(" + exc + "->cls, " + std::to_string(h->cls) + ")) { m.thrown = nullptr; r[" + std::to_string(h->reg) + "] = reinterpret_cast<Slot>(" + exc + "); goto L" + std::to_string(h->target) + "; } ";
    }
    return s;
  }
  std::string afterCall(std::uint32_t pc) {
    return "if (__builtin_expect(st != 0, 0)) { if (st == 1) { Obj* e = m.thrown; " + unwind(pc, "e") + "} return st; }";  // (only in functions that call)
  }
  bool leaf = false;  // no calls and no runtime calls: the registers can live in C++ locals
  // A function that calls keeps its registers in C++ locals too (ZN-397): the window `win` holds only the frames of its callees, the argument registers are
  // copied there before a call and back after it (the callee may write them; the registers above them are the callee's and dead after the call).
  bool locals = false;
  std::string frame(unsigned A) { return std::string(locals ? "win" : "r") + " + " + std::to_string(A); }
  std::string toWin(unsigned A, unsigned n) { std::string s; if (locals) for (unsigned k = A; k < A + n; ++k) s += "win[" + std::to_string(k) + "] = r[" + std::to_string(k) + "]; "; return s; }
  std::string fromWin(unsigned A, unsigned n) { std::string s; if (locals) for (unsigned k = A; k < A + n; ++k) s += "r[" + std::to_string(k) + "] = win[" + std::to_string(k) + "]; "; return s; }
  static unsigned rtArity(unsigned id) { return rtParamCount(rtInfo(static_cast<zn::Rt>(id))); }
  unsigned virtArity(unsigned sel, unsigned A) {   // the argument registers of a virtual call: the parameters of an implementation of the selector, else the rest of the frame
    for (const zbc::ClassInfo& c : m.classes) if (sel < c.vtable.size() && c.vtable[sel] < m.functions.size()) return std::max<unsigned>(1, static_cast<unsigned>(m.functions[c.vtable[sel]].params.size()));
    return f.nregs > A ? f.nregs - A : 1;
  }
  std::string unwindDepth() { return ""; }
  std::string trap(const std::string& msg) { return typed ? "{ m.error = " + msg + "; m.failed = true; return 0; }" : "{ m.error = " + msg + "; return 2; }"; }
  std::string checked(const std::string& call) { return "{ const char* e = " + call + "; if (__builtin_expect(e != nullptr, 0)) " + trap("e") + " }"; }

  void emit() {
    collectLabels();
    leaf = true;
    for (std::size_t pc = 0; pc < f.code.size(); pc += lengthOf(f.code[pc])) { std::string n = kOps[opOf(f.code[pc])].name; if (n == "Call" || n == "CallVirt" || n == "Rt" || n == "CallNative") leaf = false; }
    typed = typedFn[index] != 0;
    locals = !leaf && !typed;
    if (typed) {   // typed parameters and result, the registers are locals, a failure is a flag: no window, no status codes (ZN-144)
      std::string ps;
      for (std::size_t k = 0; k < f.params.size(); ++k) ps += ", Slot a" + std::to_string(k);
      out += "// function " + std::to_string(index) + " (typed)\nstatic Slot t" + std::to_string(index) + "(Machine& m" + ps + ") {\n";
      line("if (__builtin_expect(op::stackLow(m), 0)) { m.error = \"stack overflow\"; m.failed = true; return 0; }");
      for (std::uint32_t k = 0; k < (f.nregs ? f.nregs : 1); ++k) line("Slot r" + std::to_string(k) + (k < f.params.size() ? " = a" + std::to_string(k) : "") + ";");
    } else
    out += "// function " + std::to_string(index) + (leaf ? " (a leaf: its registers are locals)" : "") + "\nstatic int f" + std::to_string(index) + "(Machine& m, Slot* " + (leaf || locals ? "win" : "r") + ") {\n";
    if (typed) {}
    else if (leaf) {  // the registers are C++ locals so the compiler keeps them in machine registers; arguments come in, the result goes out through the window
      line("Slot r[" + std::to_string(f.nregs ? f.nregs : 1) + "];");
      for (std::size_t k = 0; k < f.params.size(); ++k) line("r[" + std::to_string(k) + "] = win[" + std::to_string(k) + "];");
    } else {
      // a window outside the stack (the temporary one of an exception text, a native callback) is not checked against its end
      line("if (__builtin_expect(op::stackLow(m) || (win + " + std::to_string(f.nregs ? f.nregs : 1) + " > m.stackEnd && win >= m.stack && win < m.stackEnd), 0)) { m.error = \"stack overflow\"; return 2; }");
      line("Slot r[" + std::to_string(f.nregs ? f.nregs : 1) + "];");
      for (std::size_t k = 0; k < f.params.size(); ++k) line("r[" + std::to_string(k) + "] = win[" + std::to_string(k) + "];");
    }
    for (std::size_t pc = 0; pc < f.code.size(); pc += lengthOf(f.code[pc])) {
      std::uint32_t w = f.code[pc];
      const OpInfoRow& o = kOps[opOf(w)];
      std::string nm = o.name;
      if (labels.count(static_cast<std::uint32_t>(pc))) out += "L" + std::to_string(pc) + ":\n";
      unsigned A = aOf(w), B = bOf(w), C = cOf(w), D = dOf(w);
      auto P = static_cast<std::uint32_t>(pc);
      if (arith.count(nm)) line(r(A) + " = zn::ops::" + nm + "(" + r(B) + ", " + (o.binary ? r(C) : std::string("0")) + ");");
      else if (divs.count(nm)) line("if (!zn::ops::" + nm + "Defined(" + r(B) + ", " + r(C) + ")) " + trap("zn::ops::" + nm + "Message()") + " " + r(A) + " = zn::ops::" + nm + "(" + r(B) + ", " + r(C) + ");");
      else if (nm == "Nop") {}
      else if (nm == "Trap") line(trap("\"trap: unreachable code executed\""));
      else if (nm == "Move") line(r(A) + " = " + r(B) + ";");
      else if (nm == "LoadI") line(r(A) + " = zn::ops::sx(" + num(sdOf(w)) + ");");
      else if (nm == "LoadK") { char buf[40]; std::snprintf(buf, sizeof buf, "UINT64_C(0x%llx)", static_cast<unsigned long long>(f.consts[D].bits)); line(r(A) + " = " + buf + ";"); }
      else if (nm == "AddI32K") line(r(A) + " = zn::ops::AddI32K(" + r(B) + ", " + num(immOf(w)) + ");");
      else if (nm == "Jmp") line("goto L" + std::to_string(axOf(w)) + ";");
      else if (nm == "JmpIf") line("if (" + r(A) + ") goto L" + std::to_string(D) + ";");
      else if (nm == "JmpIfNot") line("if (!" + r(A) + ") goto L" + std::to_string(D) + ";");
      else if (o.fmt == Fmt::AB2) line("if (zn::ops::" + nm + "(" + r(A) + ", " + r(B) + ")) goto L" + std::to_string(f.code[pc + 1]) + ";");
      else if (o.fmt == Fmt::AK2) line("if (zn::ops::" + nm + "(" + r(A) + ", " + num(immOf(w)) + ")) goto L" + std::to_string(f.code[pc + 1]) + ";");
      else if (nm == "Call" && typed) {
        const zbc::Function& g = m.functions[D];
        std::string args;
        for (std::size_t k = 0; k < g.params.size(); ++k) args += ", " + r(A + static_cast<unsigned>(k));
        line("{ Slot v = t" + std::to_string(D) + "(m" + args + "); if (__builtin_expect(m.failed, 0)) return 0; " + (g.ret.cls == zbc::Cls::None ? "(void)v;" : r(A) + " = v;") + " }");
      }
      else if (nm == "Call") { unsigned n = static_cast<unsigned>(m.functions[D].params.size()); line("{ " + toWin(A, n) + "int st = f" + std::to_string(D) + "(m, " + frame(A) + "); " + fromWin(A, std::max(1u, n)) + afterCall(P) + " }"); }
      else if (nm == "CallVirt") line("{ const char* ce = nullptr; Slot vt = " + r(A) + "; const Func* cf = op::virtualTarget(&vt, 0, " + std::to_string(D) + ", ce); if (__builtin_expect(ce != nullptr, 0)) " + trap("ce") + " " + toWin(A, virtArity(D, A)) + "int st = cf->native(m, " + frame(A) + "); " + fromWin(A, virtArity(D, A)) + afterCall(P) + " }");
      else if (nm == "Ret" && typed) line("return " + r(A) + ";");
      else if (nm == "RetV" && typed) line("return 0;");
      else if (nm == "Ret") line(leaf || locals ? "{ win[0] = " + r(A) + "; return 0; }" : "{ r[0] = " + r(A) + "; return 0; }");
      else if (nm == "RetV") line("return 0;");
      else if (nm == "Throw") line("{ if (!" + r(A) + ") " + trap("op::kNullRef") + " Obj* e = reinterpret_cast<Obj*>(" + r(A) + "); " + unwind(P, "e") + "m.thrown = e; " + unwindDepth() + "return 1; }");
      else if (nm == "New") line("{ Slot t; " + checked("op::newObject(m, " + std::to_string(D) + ", t)") + " " + r(A) + " = t; }");
      else if (nm == "GetField") line("{ Obj* o = reinterpret_cast<Obj*>(" + r(B) + "); if (__builtin_expect(!o, 0)) " + trap("op::kNullRef") + " " + r(A) + " = o->fields()[" + std::to_string(C) + "]; }");
      else if (nm == "SetField") line("{ Obj* o = reinterpret_cast<Obj*>(" + r(A) + "); if (__builtin_expect(!o, 0)) " + trap("op::kNullRef") + " Slot old = o->fields()[" + std::to_string(C) + "]; o->fields()[" + std::to_string(C) + "] = " + r(B) + "; if (o->cls->fieldRef[" + std::to_string(C) + "]) m.releaseSlot(old); }");
      else if (nm == "Downcast") line("{ Slot t = " + r(A) + "; " + checked("op::downcast(&t, 0, " + std::to_string(D) + ")") + " }");
      else if (nm == "EqR") line(r(A) + " = Slot{" + r(B) + " == " + r(C) + "};");
      else if (nm == "NeR") line(r(A) + " = Slot{" + r(B) + " != " + r(C) + "};");
      else if (nm == "LoadNull") line(r(A) + " = 0;");
      else if (nm == "InstanceOf") line(r(A) + " = op::instanceOf(" + r(A) + ", " + std::to_string(D) + ");");
      else if (nm == "GetGlobal") line(r(A) + " = m.globals[" + std::to_string(D) + "];");
      else if (nm == "SetGlobal" && typed) line("m.globals[" + std::to_string(D) + "] = " + r(A) + ";");
      else if (nm == "SetGlobal") line("{ Slot old = m.globals[" + std::to_string(D) + "]; m.globals[" + std::to_string(D) + "] = " + r(A) + "; if (m.globalRef[" + std::to_string(D) + "]) m.releaseSlot(old); }");
      else if (nm == "Retain") line("m.retain(reinterpret_cast<Obj*>(" + r(A) + "));");
      else if (nm == "Release") line(checked("op::release(m, " + r(A) + ")"));
      else if (nm == "LoadStr") line(r(A) + " = reinterpret_cast<Slot>(m.strConsts[" + std::to_string(D) + "]);");
      else if (nm == "ArrGet") line("{ Slot t[3] = {0, " + r(B) + ", " + r(C) + "}; " + checked("op::arrGet(t, 0, 1, 2)") + " " + r(A) + " = t[0]; }");
      else if (nm == "ArrSet") line("{ Slot t[3] = {" + r(A) + ", " + r(B) + ", " + r(C) + "}; " + checked("op::arrSet(m, t, 0, 1, 2)") + " }");
      else if (nm == "ArrLen") line("{ Slot t[2] = {0, " + r(B) + "}; " + checked("op::arrLen(t, 0, 1)") + " " + r(A) + " = t[0]; }");
      else if (nm == "ArrPush") line("{ Slot t[3] = {0, " + r(B) + ", " + r(C) + "}; " + checked("op::arrPush(t, 0, 1, 2)") + " " + r(A) + " = t[0]; }");
      else if (nm == "Rt" && D >= static_cast<unsigned>(zn::Rt::HostGfxFrames) && D < static_cast<unsigned>(zn::Rt::HostSysFirst))   // a graphics row: its direct entry when the host has one (ZN-397)
        line("{ " + toWin(A, rtArity(D)) + "if (zn::host::HostFast hf = zn::host::hostFast[" + std::to_string(D) + "]) hf(" + frame(A) + "); else { const char* e = rtCall(m, static_cast<zn::Rt>(" + std::to_string(D) + "), " + frame(A) + ", " + frame(f.nregs) + "); if (__builtin_expect(e != nullptr, 0)) { if (e != m.error.c_str()) m.error = e; return 2; } } " + fromWin(A, std::max(1u, rtArity(D))) + "}");
      else if (nm == "Rt") line("{ " + toWin(A, rtArity(D)) + "const char* e = rtCall(m, static_cast<zn::Rt>(" + std::to_string(D) + "), " + frame(A) + ", " + frame(f.nregs) + "); " + fromWin(A, std::max(1u, rtArity(D))) + "if (__builtin_expect(e != nullptr, 0)) { if (e != m.error.c_str()) m.error = e; return 2; } }");
      else if (nm == "CallNative") line("{ " + toWin(A, f.nregs > A ? f.nregs - A : 1) + "const char* e = nativeCall(m, " + std::to_string(D) + ", " + frame(A) + ", " + frame(f.nregs) + "); " + fromWin(A, f.nregs > A ? f.nregs - A : 1) + "if (__builtin_expect(e != nullptr, 0)) { if (e != m.error.c_str()) m.error = e; return 2; } }");
      else if (nm == "LogStr") line(checked("op::logStr(m, " + r(A) + ")"));
      else if (nm == "LogI") line("*m.out += std::to_string(static_cast<std::int64_t>(" + r(A) + "));");
      else if (nm == "LogU") line("*m.out += std::to_string(" + r(A) + ");");
      else if (nm == "LogF64") line("op::logF64(m, " + r(A) + ");");
      else if (nm == "LogF32") line("*m.out += numberToString(static_cast<double>(zn::ops::asF(" + r(A) + ")));");
      else if (nm == "LogFx12" || nm == "LogFx16") line("*m.out += numberToString(zn::ops::fxToD(" + r(A) + ", " + (nm == "LogFx12" ? "12" : "16") + "));");
      else if (nm == "LogBool") line("*m.out += " + r(A) + " ? \"true\" : \"false\";");
      else if (nm == "LogSep") line("*m.out += ' ';");
      else if (nm == "LogEnd") line("*m.out += '\\n';");
      else if (nm == "LogBegErr") line("m.errMark = m.out->size();");
      else if (nm == "LogEndErr") line("m.flushErrLine();");
      else line("#error \"AOT: no translation for " + nm + "\"");
    }
    line("return 0;");
    out += "}\n\n";
    if (typed) {   // the window entry the interpreter, the other compiled functions and the virtual calls use
      std::string args;
      for (std::size_t k = 0; k < f.params.size(); ++k) args += (k ? ", r[" : ", r[") + std::to_string(k) + "]";
      out += "static int f" + std::to_string(index) + "(Machine& m, Slot* r) {\n  m.failed = false;\n  Slot v = t" + std::to_string(index) + "(m" + args + ");\n  if (__builtin_expect(m.failed, 0)) return 2;\n" +
             (f.ret.cls == zbc::Cls::None ? "  (void)v;\n" : "  r[0] = v;\n") + "  return 0;\n}\n\n";
    }
  }
};

// Functions that can be compiled with typed parameters (ZN-144): numbers and booleans in and out, no references, no handlers, only operations on registers, and calls to such functions.
std::vector<char> typedFunctions(const zbc::Module& mod, const std::set<std::string>& arith, const std::set<std::string>& divs) {
  auto scalar = [](zbc::Cls c) { return c == zbc::Cls::I || c == zbc::Cls::S || c == zbc::Cls::D; };
  static const std::set<std::string> plain = {"Nop", "Trap", "Move", "LoadI", "LoadK", "AddI32K", "Jmp", "JmpIf", "JmpIfNot", "Call", "Ret", "RetV", "GetGlobal", "SetGlobal",
                                              "LogI", "LogU", "LogF64", "LogF32", "LogBool", "LogSep", "LogEnd", "LogBegErr", "LogEndErr", "LogFx12", "LogFx16"};
  std::vector<char> ok(mod.functions.size(), 0);
  for (std::size_t i = 0; i < mod.functions.size(); ++i) {
    const zbc::Function& f = mod.functions[i];
    bool good = i != 0 && f.handlers.empty() && f.nregs <= 200 && f.params.size() <= 8 && (f.ret.cls == zbc::Cls::None || scalar(f.ret.cls));   // function 0 (main) keeps the window entry
    for (const zbc::VType& p : f.params) good = good && scalar(p.cls);
    for (std::size_t pc = 0; good && pc < f.code.size(); pc += (kOps[opOf(f.code[pc])].fmt == Fmt::AB2 || kOps[opOf(f.code[pc])].fmt == Fmt::AK2) ? 2 : 1) {
      const OpInfoRow& o = kOps[opOf(f.code[pc])];
      std::string nm = o.name;
      if (arith.count(nm) || divs.count(nm) || plain.count(nm) || o.fmt == Fmt::AB2 || o.fmt == Fmt::AK2) {
        if ((nm == "GetGlobal" || nm == "SetGlobal") && (dOf(f.code[pc]) >= mod.globals.size() || !scalar(mod.globals[dOf(f.code[pc])].cls))) good = false;
        if (nm == "Call" && dOf(f.code[pc]) >= mod.functions.size()) good = false;
      } else good = false;
    }
    ok[i] = good;
  }
  for (bool changed = true; changed;) {   // a call out of the typed set takes the function out of it
    changed = false;
    for (std::size_t i = 0; i < mod.functions.size(); ++i) {
      if (!ok[i]) continue;
      const zbc::Function& f = mod.functions[i];
      for (std::size_t pc = 0; pc < f.code.size(); pc += (kOps[opOf(f.code[pc])].fmt == Fmt::AB2 || kOps[opOf(f.code[pc])].fmt == Fmt::AK2) ? 2 : 1)
        if (std::string(kOps[opOf(f.code[pc])].name) == "Call" && !ok[dOf(f.code[pc])]) { ok[i] = 0; changed = true; break; }
    }
  }
  return ok;
}

}  // namespace

// Whether the module calls the host (the Rt::Host* entries): the program then installs the graphics host and links its library.
bool usesHost(const zbc::Module& mod) {
  for (const zbc::Function& fn : mod.functions)
    for (std::size_t pc = 0; pc < fn.code.size(); pc += (kOps[opOf(fn.code[pc])].fmt == Fmt::AB2 || kOps[opOf(fn.code[pc])].fmt == Fmt::AK2) ? 2 : 1)
      if (std::string(kOps[opOf(fn.code[pc])].name) == "Rt" && ((dOf(fn.code[pc]) >= static_cast<unsigned>(zn::Rt::HostGfxFrames) && dOf(fn.code[pc]) <= static_cast<unsigned>(zn::Rt::HostHostLast)) || dOf(fn.code[pc]) >= static_cast<unsigned>(zn::Rt::HostLoopWait))) return true;
  return false;
}

// Whether the module calls the host layout engine (the Rt::HostLayout* rows, ZN-284.01): the program then installs it and links zn_layout and Yoga.
bool usesLayout(const zbc::Module& mod) {
  for (const zbc::Function& fn : mod.functions)
    for (std::size_t pc = 0; pc < fn.code.size(); pc += (kOps[opOf(fn.code[pc])].fmt == Fmt::AB2 || kOps[opOf(fn.code[pc])].fmt == Fmt::AK2) ? 2 : 1)
      if (std::string(kOps[opOf(fn.code[pc])].name) == "Rt" && isLayoutRow(static_cast<zn::Rt>(dOf(fn.code[pc])))) return true;
  return false;
}

std::string emitCpp(const zbc::Module& mod, const std::vector<std::uint8_t>* resources, bool rnLayout) {
  auto arith = namesOf(0), divs = namesOf(1);
  std::string s = "// Generated by zinc (ZN-022): a function of the module per C++ function, over the interpreter's register window.\n"
                  "#include \"rt/rt.h\"\n#include \"zn/host.h\"\n#include \"zn/ops.h\"\n\nusing namespace zn;\nusing namespace zn::rt;\n\n";
  auto bytes = zbc::encode(mod);
  s += "static const unsigned char kModule[] = {";
  for (std::size_t i = 0; i < bytes.size(); ++i) {
    if (i % 24 == 0) s += "\n  ";
    s += std::to_string(bytes[i]) + ",";
  }
  s += "\n};\n\n";
  const std::vector<char> typedFn = typedFunctions(mod, arith, divs);
  for (std::size_t i = 0; i < mod.functions.size(); ++i) {
    s += "static int f" + std::to_string(i) + "(Machine& m, Slot* r);\n";
    if (typedFn[i]) { s += "static Slot t" + std::to_string(i) + "(Machine& m"; for (std::size_t k = 0; k < mod.functions[i].params.size(); ++k) s += ", Slot"; s += ");\n"; }
  }
  s += "\n";
  for (std::size_t i = 0; i < mod.functions.size(); ++i) {
    FnEmitter fe(mod, mod.functions[i], i, arith, divs, typedFn);
    fe.emit();
    s += fe.out;
  }
  if (resources && usesHost(mod)) {  // baked fonts and images
    s += "static const unsigned char kResources[] = {";
    for (std::size_t i = 0; i < resources->size(); ++i) {
      if (i % 32 == 0) s += "\n  ";
      s += std::to_string((*resources)[i]) + ",";
    }
    s += "\n};\n\n";
  }
  std::vector<std::string> linkedNative;  // modules the program is linked with (ZINC_NATIVE_LIBS): the generated main registers them
  for (const zn::zbc::Native& nt : mod.natives) if (nt.module != "Fixture" && std::find(linkedNative.begin(), linkedNative.end(), nt.module) == linkedNative.end()) linkedNative.push_back(nt.module);
  std::string nativeDecls, nativeRegs;
  for (const std::string& nm : linkedNative) { nativeDecls += "extern \"C\" const ZnModule* zn_module_" + nm + "(void);\n"; nativeRegs += "  { char e[256]; if (zn_register_module(zn_module_" + nm + "(), e, sizeof e) < 0) { std::fprintf(stderr, \"%s\\n\", e); return 2; } }\n"; }
  bool hasFixture = false;
  for (const zn::zbc::Native& nt : mod.natives) hasFixture = hasFixture || nt.module == "Fixture";
  s += "static int (*const kNatives[])(Machine&, Slot*) = {";
  for (std::size_t i = 0; i < mod.functions.size(); ++i) s += (i ? ", f" : "f") + std::to_string(i);
  s += "};\n\n";
  s += "// The engine of a compiled program: run the native code of the function.\n"
       "bool zn::rt::Machine::exec(const Func* f, Slot* base) {\n"
       "  int st = f->native(*this, base);\n"
       "  if (st == 1) { error = \"panic: Uncaught \" + exceptionText(thrown); thrown = nullptr; return false; }\n"
       "  return st == 0;\n"
       "}\n\n"
       + std::string(usesHost(mod) ? "namespace zn::host { void installGfx(); void installLayout(); bool installResources(const unsigned char*, decltype(sizeof 0)); }  // the graphics host (src/host), linked by zinc build\n" : "") +
       std::string(hasFixture || !linkedNative.empty() ? "#include \"zn/native.h\"\n" + nativeDecls : "") + std::string(hasFixture ? "#include \"zn/native.h\"\nextern \"C\" const ZnModule* fixture_module(void);  // the C test module of tests/native, linked by zinc build (ZN-097; plugin modules come with the loader)\n" : "") +
       "int main() {\n" + nativeRegs + (hasFixture ? "  { char e[256]; zn_register_module(fixture_module(), e, sizeof e); }\n" : "") + (usesHost(mod) ? "  zn::host::installGfx();\n" + std::string(rnLayout && usesLayout(mod) ? "  zn::host::installLayout();\n" : "") + std::string(resources ? "  zn::host::installResources(kResources, sizeof kResources);\n" : "") : std::string()) + "  return zn::rt::runProgram(kModule, sizeof kModule, kNatives, " + std::to_string(mod.functions.size()) + ");\n}\n";
  return s;
}

}  // namespace zn::aot
