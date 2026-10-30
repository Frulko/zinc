#include "aot/aot.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <map>
#include <set>
#include <vector>

#include "zn/bytecode.h"
#include "zn/ops.h"

namespace zn::aot {

namespace {

enum class Fmt { OP, ABC, AD, AX, ABK, AB2, AK2, LX };
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

// The C++ name of compiled function i: f<i> (the window entry) or t<i> (typed); a debug build puts the Zinc name in front, so lldb's stack
// says add__t2 rather than t2 (ZN-371.06).
std::string fname(const zbc::Module& m, char kind, std::size_t i) {
  std::string n;
  if (!m.lines.empty() && i < m.functions.size()) {
    for (char c : m.functions[i].name) n += std::isalnum(static_cast<unsigned char>(c)) ? c : '_';
    n += "__";
  }
  return n + kind + std::to_string(i);
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
  bool tablesOk;                       // zbc::verifyTables(m) is empty, checked once per module
  bool typed = false;                  // this one is

  FnEmitter(const zbc::Module& mod, const zbc::Function& fn, std::size_t i, const std::set<std::string>& a, const std::set<std::string>& d, const std::vector<char>& tf, bool tok)
      : m(mod), f(fn), index(i), arith(a), divs(d), typedFn(tf), tablesOk(tok) {}

  std::string r(unsigned k) { return typed ? "r" + std::to_string(k) : "r[" + std::to_string(k) + "]"; }
  // The verifier's register classes before each instruction (ZN-409): a field access on a register of a known object class goes through that
  // class's C++ struct (structOf), so the compiler sees typed, distinct members instead of a Slot array.
  std::vector<std::vector<std::uint16_t>> types;
  int objClass(unsigned reg, std::uint32_t pc, unsigned field) const {
    if (pc >= types.size() || reg >= types[pc].size() || types[pc][reg] < 4) return -1;
    const unsigned c = types[pc][reg] - 4u;
    if (c >= m.classes.size() || !hasStruct(m.classes[c]) || field >= m.classes[c].fields.size()) return -1;
    return static_cast<int>(c);
  }
  static bool hasStruct(const zbc::ClassInfo& c) { return c.kind == zbc::CKind::Object && !c.isInterface && !c.fields.empty(); }
  std::string num(std::int64_t v) { return std::to_string(v); }
  // A debug build (zinc build --debug, ZN-371.06): every C++ line of a statement carries its .ts line, so lldb steps by the source; the code of
  // the engine's own functions is "zinc-runtime".
  std::string dbgLine;
  void line(const std::string& s) { out += dbgLine + "  " + s + "\n"; }
  // the typed copy of each local of a debug build, under its source name: what lldb's frame variable shows
  std::map<unsigned, std::pair<std::string, std::string>> named;   // home register -> (C++ name, conversion of the register)
  void declareLocals() {
    if (m.lines.empty() || f.vars.empty()) return;
    static const std::set<std::string> taken = {"m", "r", "win", "zt", "ze", "st", "e", "a", "Slot", "Obj", "op", "auto", "bool", "char", "double", "float", "int", "long", "short",
      "signed", "unsigned", "register", "union", "struct", "template", "typename", "operator", "friend", "inline", "virtual", "explicit", "mutable", "goto", "sizeof",
      "volatile", "namespace", "using", "asm", "and", "or", "not", "xor", "bitand", "bitor", "compl", "default", "delete", "new", "this", "true", "false", "nullptr"};
    for (const zbc::VarInfo& v : f.vars) {
      std::string name;
      for (char c : v.name) name += std::isalnum(static_cast<unsigned char>(c)) || c == '_' ? c : '_';
      if (name == "this") name = "self";
      if (taken.count(name) || (name.size() > 1 && (name[0] == 'r' || name[0] == 'a' || name[0] == 'L' || name[0] == 't' || name[0] == 'f') && std::isdigit(static_cast<unsigned char>(name[1])))) name += "_";
      std::string type, conv = r(v.reg);
      switch (v.vt.cls) {
        case zbc::Cls::I:
          if (v.type == "bool") { type = "bool"; conv = conv + " != 0"; }
          else if (!v.type.empty() && v.type[0] == 'u') { type = "std::uint64_t"; conv = "static_cast<std::uint64_t>(" + conv + ")"; }
          else { type = "std::int64_t"; conv = "static_cast<std::int64_t>(" + conv + ")"; }
          break;
        case zbc::Cls::S: type = "float"; conv = "zn::ops::asF(" + conv + ")"; break;
        case zbc::Cls::D: type = "double"; conv = "zn::ops::asD(" + conv + ")"; break;
        default: {
          const zbc::CKind k = v.vt.ref < m.classes.size() ? m.classes[v.vt.ref].kind : zbc::CKind::Object;
          type = k == zbc::CKind::String ? "zn::rt::StrObj*" : k == zbc::CKind::Array ? "zn::rt::ArrObj*" : "zn::rt::Obj*";
          conv = "reinterpret_cast<" + type + ">(" + conv + ")";
        }
      }
      line(type + " " + name + "{};   // " + v.name + ": " + v.type);
      named[v.reg] = {name, conv};
    }
  }

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
        s += "if (op::catches(" + exc + ", " + std::to_string(h->cls) + ")) { m.thrown = nullptr; r[" + std::to_string(h->reg) + "] = reinterpret_cast<Slot>(" + exc + "); goto L" + std::to_string(h->target) + "; } ";
    }
    return s;
  }
  std::string afterCall(std::uint32_t pc) {
    std::string u = unwind(pc, "e");
    if (u.empty()) return "ZST";   // (only in functions that call)
    return "if (__builtin_expect(st != 0, 0)) { if (st == 1) { Obj* e = m.thrown; " + u + "} return st; }";
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
    for (const zbc::ClassInfo& c : m.classes)
      for (std::size_t k = 0; k < c.vtable.size() && k < c.selectors.size(); ++k)
        if (c.selectors[k] == sel && c.vtable[k] < m.functions.size()) return std::max<unsigned>(1, static_cast<unsigned>(m.functions[c.vtable[k]].params.size()));
    return f.nregs > A ? f.nregs - A : 1;
  }
  std::string unwindDepth() { return ""; }
  // One error exit per function (ZN-603): an instruction that can fail jumps to Ltrap (m.error = zt) or, for runtime and native calls whose
  // message may already be m.error, to Lrterr; the C++ per instruction shrinks to a test and a jump.
  bool usedTrap = false, usedRt = false;
  std::string trap(const std::string& msg) {
    if (typed) return "{ m.error = " + msg + "; m.failed = true; return 0; }";
    usedTrap = true;
    return msg == "op::kNullRef" ? "ZNULLREF" : "ZTRAP(" + msg + ")";
  }
  std::string checked(const std::string& call) {
    if (typed) return "{ const char* e = " + call + "; if (__builtin_expect(e != nullptr, 0)) " + trap("e") + " }";
    usedTrap = true;
    return "ZCHK(" + call + ")";
  }
  std::string rtFail() { usedRt = true; return "ZRTERR"; }
  std::string nullGuard(const std::string& reg) {
    if (typed) return "if (__builtin_expect(!" + reg + ", 0)) " + trap("op::kNullRef") + " ";
    usedTrap = true;
    return "ZNULL(" + reg + ") ";
  }

  void emit() {
    collectLabels();
    leaf = true;
    for (std::size_t pc = 0; pc < f.code.size(); pc += lengthOf(f.code[pc])) { std::string n = kOps[opOf(f.code[pc])].name; if (n == "Call" || n == "CallVirt" || n == "Rt" || n == "CallNative") leaf = false; }
    typed = typedFn[index] != 0;
    if (!typed && tablesOk) types = zbc::registerTypes(m, index, true);
    locals = !leaf && !typed;
    if (typed) {   // typed parameters and result, the registers are locals, a failure is a flag: no window, no status codes (ZN-144)
      std::string ps;
      for (std::size_t k = 0; k < f.params.size(); ++k) ps += ", Slot a" + std::to_string(k);
      out += "// function " + std::to_string(index) + " (typed)\nZFN Slot " + fname(m, 't', index) + "(Machine& m" + ps + ") {\n";
      line("if (__builtin_expect(op::stackLow(m), 0)) { m.error = \"stack overflow\"; m.failed = true; return 0; }");
      for (std::uint32_t k = 0; k < (f.nregs ? f.nregs : 1); ++k) line("Slot r" + std::to_string(k) + (k < f.params.size() ? " = a" + std::to_string(k) : "") + ";");
    } else
    out += "// function " + std::to_string(index) + (leaf ? " (a leaf: its registers are locals)" : "") + "\nZFN int " + fname(m, 'f', index) + "(Machine& m, Slot* " + (leaf || locals ? "win" : "r") + ") {\n";
    if (!typed) line("const char* zt; const char* ze;");
    if (typed) {}
    else if (leaf) {  // the registers are C++ locals so the compiler keeps them in machine registers; arguments come in, the result goes out through the window
      line("Slot r[" + std::to_string(f.nregs ? f.nregs : 1) + "];");
      for (std::size_t k = 0; k < f.params.size(); ++k) line("r[" + std::to_string(k) + "] = win[" + std::to_string(k) + "];");
    } else {
      // a window outside the stack (the temporary one of an exception text, a native callback) is not checked against its end
      line("ZSTACK(" + std::to_string(f.nregs ? f.nregs : 1) + ")");
      line("Slot r[" + std::to_string(f.nregs ? f.nregs : 1) + "];");
      for (std::size_t k = 0; k < f.params.size(); ++k) line("r[" + std::to_string(k) + "] = win[" + std::to_string(k) + "];");
    }
    if (!m.lines.empty()) out = "#line 1 \"zinc-runtime\"\n" + out;   // the code before the first statement and between them is the engine's
    declareLocals();
    for (std::size_t pc = 0; pc < f.code.size(); pc += lengthOf(f.code[pc])) {
      std::uint32_t w = f.code[pc];
      const OpInfoRow& o = kOps[opOf(w)];
      std::string nm = o.name;
      if (labels.count(static_cast<std::uint32_t>(pc))) out += "L" + std::to_string(pc) + ":\n";
      if (nm == "Line" && axOf(w) < m.lines.size() && m.lines[axOf(w)].file < m.files.size()) {   // the .ts line of what follows
        std::string file;
        for (char c : m.files[m.lines[axOf(w)].file]) { if (c == '"' || c == '\\') file += '\\'; file += c; }
        dbgLine = "#line " + std::to_string(m.lines[axOf(w)].line) + " \"" + file + "\"\n";
      }
      unsigned A = aOf(w), B = bOf(w), C = cOf(w), D = dOf(w);
      auto P = static_cast<std::uint32_t>(pc);
      if (arith.count(nm)) line(r(A) + " = zn::ops::" + nm + "(" + r(B) + ", " + (o.binary ? r(C) : std::string("0")) + ");");
      else if (divs.count(nm)) line("if (!zn::ops::" + nm + "Defined(" + r(B) + ", " + r(C) + ")) " + trap("zn::ops::" + nm + "Message()") + " " + r(A) + " = zn::ops::" + nm + "(" + r(B) + ", " + r(C) + ");");
      else if (nm == "Nop" || nm == "Line") {}   // Line: a statement start of a debug build, nothing to do compiled
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
        line("{ Slot v = " + fname(m, 't', D) + "(m" + args + "); if (__builtin_expect(m.failed, 0)) return 0; " + (g.ret.cls == zbc::Cls::None ? "(void)v;" : r(A) + " = v;") + " }");
      }
      else if (nm == "Call") { unsigned n = static_cast<unsigned>(m.functions[D].params.size()); line("{ " + toWin(A, n) + "int st = " + fname(m, 'f', D) + "(m, " + frame(A) + "); " + fromWin(A, std::max(1u, n)) + afterCall(P) + " }"); }
      else if (nm == "CallVirt") line("{ " + (typed ? "const char* ce = nullptr; Slot vt = " + r(A) + "; const Func* cf = op::virtualTarget(&vt, 0, " + std::to_string(D) + ", ce); if (__builtin_expect(ce != nullptr, 0)) " + trap("ce") + " " : (usedTrap = true, "ZVIRT(" + r(A) + ", " + std::to_string(D) + ") ")) + toWin(A, virtArity(D, A)) + "int st = cf->native(m, " + frame(A) + "); " + fromWin(A, virtArity(D, A)) + afterCall(P) + " }");
      else if (nm == "Ret" && typed) line("return " + r(A) + ";");
      else if (nm == "RetV" && typed) line("return 0;");
      else if (nm == "Ret") line(leaf || locals ? "{ win[0] = " + r(A) + "; return 0; }" : "{ r[0] = " + r(A) + "; return 0; }");
      else if (nm == "RetV") line("return 0;");
      else if (nm == "Throw") line("{ if (!" + r(A) + ") " + trap("op::kNullRef") + " Obj* e = reinterpret_cast<Obj*>(" + r(A) + "); " + unwind(P, "e") + "m.thrown = e; " + unwindDepth() + "return 1; }");
      else if (nm == "New") line("{ Slot t; " + checked("op::newObject(m, " + std::to_string(D) + ", t)") + " " + r(A) + " = t; }");
      else if ((nm == "GetField" || nm == "SetField") && objClass(nm == "GetField" ? B : A, P, C) >= 0) {
        const int cls = objClass(nm == "GetField" ? B : A, P, C);
        const zbc::Cls fk = m.classes[cls].fields[C].cls;
        const std::string ptr = "ZOBJ(" + std::to_string(cls) + ", " + r(nm == "GetField" ? B : A) + ")", mem = "->f" + std::to_string(C);
        const std::string guard = nullGuard(r(nm == "GetField" ? B : A));
        if (nm == "GetField") line("{ " + guard + r(A) + " = " + (fk == zbc::Cls::D ? "std::bit_cast<Slot>(" + ptr + mem + ")" : ptr + mem) + "; }");
        else if (fk == zbc::Cls::R) line("{ " + guard + "Slot old = " + ptr + mem + "; " + ptr + mem + " = " + r(B) + "; op::dropC(m, old); }");
        else line("{ " + guard + ptr + mem + " = " + (fk == zbc::Cls::D ? "std::bit_cast<double>(" + r(B) + ")" : r(B)) + "; }");
      }
      else if (nm == "GetField") line("{ Obj* o = reinterpret_cast<Obj*>(" + r(B) + "); " + nullGuard("o") + r(A) + " = o->fields()[" + std::to_string(C) + "]; }");
      else if (nm == "SetField") line("{ Obj* o = reinterpret_cast<Obj*>(" + r(A) + "); " + nullGuard("o") + "Slot old = o->fields()[" + std::to_string(C) + "]; o->fields()[" + std::to_string(C) + "] = " + r(B) + "; if (o->cls->fieldRef[" + std::to_string(C) + "]) op::dropC(m, old); }");
      else if (nm == "Downcast") line("{ Slot t = " + r(A) + "; " + checked("op::downcast(&t, 0, " + std::to_string(D) + ")") + " }");
      else if (nm == "EqR") line(r(A) + " = Slot{" + r(B) + " == " + r(C) + "};");
      else if (nm == "NeR") line(r(A) + " = Slot{" + r(B) + " != " + r(C) + "};");
      else if (nm == "LoadNull") line(r(A) + " = 0;");
      else if (nm == "InstanceOf") line(r(A) + " = op::instanceOf(" + r(A) + ", " + std::to_string(D) + ");");
      else if (nm == "GetGlobal") line(r(A) + " = m.globals[" + std::to_string(D) + "];");
      else if (nm == "SetGlobal" && (typed || (D < m.globals.size() && (m.globals[D].cls == zbc::Cls::I || m.globals[D].cls == zbc::Cls::S || m.globals[D].cls == zbc::Cls::D))))   // a number: no reference to drop (ZN-602)
        line("m.globals[" + std::to_string(D) + "] = " + r(A) + ";");
      else if (nm == "SetGlobal") line("ZSETG(" + std::to_string(D) + ", " + r(A) + ")");
      else if (nm == "Retain") line("ZRETAIN(" + r(A) + ");");
      else if (nm == "Release") line(typed ? checked("op::releaseC(m, " + r(A) + ")") : (usedTrap = true, "ZRELEASE(" + r(A) + ")"));
      else if (nm == "LoadStr") line(r(A) + " = ZSTR(" + std::to_string(D) + ");");
      else if (nm == "ArrGet") line("{ Slot t[3] = {0, " + r(B) + ", " + r(C) + "}; " + checked("op::arrGet(t, 0, 1, 2)") + " " + r(A) + " = t[0]; }");
      else if (nm == "ArrSet") line("{ Slot t[3] = {" + r(A) + ", " + r(B) + ", " + r(C) + "}; " + checked("op::arrSet(m, t, 0, 1, 2)") + " }");
      else if (nm == "ArrLen") line("{ Slot t[2] = {0, " + r(B) + "}; " + checked("op::arrLen(t, 0, 1)") + " " + r(A) + " = t[0]; }");
      else if (nm == "ArrPush") line("{ Slot t[3] = {0, " + r(B) + ", " + r(C) + "}; " + checked("op::arrPush(t, 0, 1, 2)") + " " + r(A) + " = t[0]; }");
      else if (nm == "Rt" && (D == static_cast<unsigned>(zn::Rt::HostGfxWidth) || D == static_cast<unsigned>(zn::Rt::HostGfxHeight)))   // what width() / height() return, without a call (ZN-399)
        line("if (!zn::host::gfxStarted) zn::host::startGfx(); " + r(A) + " = static_cast<Slot>(static_cast<std::int64_t>(zrt::" + (D == static_cast<unsigned>(zn::Rt::HostGfxWidth) ? "surf_w" : "surf_h") + "));");
      else if (nm == "Rt" && ((D >= static_cast<unsigned>(zn::Rt::HostGfxFrames) && D < static_cast<unsigned>(zn::Rt::HostSysFirst)) || isGlRow(static_cast<zn::Rt>(D))))   // a graphics or zinc:gl row: its direct entry when the host has one (ZN-397, ZN-562.03)
        line("{ " + toWin(A, rtArity(D)) + "if (zn::host::HostFast hf = zn::host::hostFast[" + std::to_string(D) + "]) hf(" + frame(A) + "); else { const char* e = rtCall(m, (zn::Rt)" + std::to_string(D) + ", " + frame(A) + ", " + frame(f.nregs) + "); " + rtFail() + " } " + fromWin(A, std::max(1u, rtArity(D))) + "}");
      else if (nm == "Rt" && (D == static_cast<unsigned>(zn::Rt::MapGet) || D == static_cast<unsigned>(zn::Rt::MapHas) || D == static_cast<unsigned>(zn::Rt::SetHas)))   // the hot Map / Set rows, direct (ZN-602)
        line("{ const char* e = op::" + std::string(D == static_cast<unsigned>(zn::Rt::MapGet) ? "mapGet(" : "mapHas(") + r(A) + ", " + r(A + 1) + "); " + rtFail() + " }");
      else if (nm == "Rt" && D == static_cast<unsigned>(zn::Rt::MapSet)) line("{ const char* e = op::mapSet(m, " + r(A) + ", " + r(A + 1) + ", " + r(A + 2) + "); " + rtFail() + " }");
      else if (nm == "Rt" && D == static_cast<unsigned>(zn::Rt::SetAdd)) line("{ const char* e = op::setAdd(m, " + r(A) + ", " + r(A + 1) + "); " + rtFail() + " }");
      else if (nm == "Rt") line("{ " + toWin(A, rtArity(D)) + "const char* e = rtCall(m, (zn::Rt)" + std::to_string(D) + ", " + frame(A) + ", " + frame(f.nregs) + "); " + fromWin(A, std::max(1u, rtArity(D))) + rtFail() + " }");
      else if (nm == "CallNative") line("{ " + toWin(A, f.nregs > A ? f.nregs - A : 1) + "const char* e = nativeCall(m, " + std::to_string(D) + ", " + frame(A) + ", " + frame(f.nregs) + "); " + fromWin(A, f.nregs > A ? f.nregs - A : 1) + rtFail() + " }");
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
      if (!named.empty() && (nm == "Move" || nm == "LoadI" || nm == "LoadNull")) {   // a debug build's home register: its named copy follows
        auto it = named.find(aOf(w));
        if (it != named.end()) line(it->second.first + " = " + it->second.second + ";");
      }
    }
    dbgLine.clear();
    if (!m.lines.empty()) out += "#line 1 \"zinc-runtime\"\n";
    line("return 0;");
    if (usedTrap) out += "Ltrap:\n  m.error = zt;\n  return 2;\n";
    if (usedRt) out += "Lrterr:\n  if (ze != m.error.c_str()) m.error = ze;\n  return 2;\n";
    out += "}\n\n";
    if (typed) {   // the window entry the interpreter, the other compiled functions and the virtual calls use
      std::string args;
      for (std::size_t k = 0; k < f.params.size(); ++k) args += (k ? ", r[" : ", r[") + std::to_string(k) + "]";
      out += "ZFN int " + fname(m, 'f', index) + "(Machine& m, Slot* r) {\n  m.failed = false;\n  Slot v = " + fname(m, 't', index) + "(m" + args + ");\n  if (__builtin_expect(m.failed, 0)) return 2;\n" +
             (f.ret.cls == zbc::Cls::None ? "  (void)v;\n" : "  r[0] = v;\n") + "  return 0;\n}\n\n";
    }
  }
};

// Functions that can be compiled with typed parameters (ZN-144): numbers and booleans in and out, no references, no handlers, only operations on registers, and calls to such functions.
// Bytes as one string literal: a single token for the compiler instead of a list of a million integers, about 2 characters a byte (ZN-604).
void appendBytes(std::string& s, const std::uint8_t* p, std::size_t n) {
  s += "\"";
  bool octal = false;   // the last escape was octal: a digit after it would extend it, so it is escaped too
  for (std::size_t i = 0; i < n; ++i) {
    if (i && i % 96 == 0) { s += "\"\n  \""; octal = false; }
    const unsigned c = p[i];
    if (c >= 32 && c < 127 && c != '"' && c != '\\' && c != '?' && !(octal && c >= '0' && c <= '7')) { s += static_cast<char>(c); octal = false; continue; }
    char buf[8];
    std::snprintf(buf, sizeof buf, "\\%o", c);
    s += buf;
    octal = true;
  }
  s += "\"";
}

std::vector<char> typedFunctions(const zbc::Module& mod, const std::set<std::string>& arith, const std::set<std::string>& divs) {
  auto scalar = [](zbc::Cls c) { return c == zbc::Cls::I || c == zbc::Cls::S || c == zbc::Cls::D; };
  static const std::set<std::string> plain = {"Nop", "Line", "Trap", "Move", "LoadI", "LoadK", "AddI32K", "Jmp", "JmpIf", "JmpIfNot", "Call", "Ret", "RetV", "GetGlobal", "SetGlobal",
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
      if (std::string(kOps[opOf(fn.code[pc])].name) == "Rt" && zn::isHostRow(static_cast<zn::Rt>(dOf(fn.code[pc])))) return true;
  return false;
}

unsigned rtNeeded(const zbc::Module& mod) {
  unsigned n = 0;
  for (const zbc::Function& fn : mod.functions)
    for (std::size_t pc = 0; pc < fn.code.size(); pc += (kOps[opOf(fn.code[pc])].fmt == Fmt::AB2 || kOps[opOf(fn.code[pc])].fmt == Fmt::AK2) ? 2 : 1)
      if (std::string(kOps[opOf(fn.code[pc])].name) == "Rt") n = std::max(n, dOf(fn.code[pc]) + 1);
  return n;
}

// Whether the module calls the host layout engine (the Rt::HostLayout* rows, ZN-284.01): the program then installs it and links zn_layout and Yoga.
bool usesLayout(const zbc::Module& mod) {
  for (const zbc::Function& fn : mod.functions)
    for (std::size_t pc = 0; pc < fn.code.size(); pc += (kOps[opOf(fn.code[pc])].fmt == Fmt::AB2 || kOps[opOf(fn.code[pc])].fmt == Fmt::AK2) ? 2 : 1)
      if (std::string(kOps[opOf(fn.code[pc])].name) == "Rt" && isLayoutRow(static_cast<zn::Rt>(dOf(fn.code[pc])))) return true;
  return false;
}

// Whether the module calls zinc:gl (the Rt::HostGl* rows, ZN-562): the program installs WebGL's host rows and links zn_gl.
bool usesGl(const zbc::Module& mod) {
  for (const zbc::Function& fn : mod.functions)
    for (std::size_t pc = 0; pc < fn.code.size(); pc += (kOps[opOf(fn.code[pc])].fmt == Fmt::AB2 || kOps[opOf(fn.code[pc])].fmt == Fmt::AK2) ? 2 : 1)
      if (std::string(kOps[opOf(fn.code[pc])].name) == "Rt" && isGlRow(static_cast<zn::Rt>(dOf(fn.code[pc])))) return true;
  return false;
}

std::vector<std::string> emitCppParts(const zbc::Module& mod, const std::vector<std::uint8_t>* resources, bool rnLayout, unsigned maxParts, const std::string& resourcesFile) {
  auto arith = namesOf(0), divs = namesOf(1);
  std::string s = "// Generated by zinc (ZN-022): a function of the module per C++ function, over the interpreter's register window.\n"
                  "#include \"rt/rt.h\"\n#include \"zn/host.h\"\n#include \"zn/ops.h\"\n\nusing namespace zn;\nusing namespace zn::rt;\n\n"
                  "// The checks every function repeats, short (ZN-604): zt and ze are the messages of the function's error exits Ltrap and Lrterr.\n"
                  "#define ZTRAP(msg) { zt = (msg); goto Ltrap; }\n"
                  "#define ZNULLREF ZTRAP(op::kNullRef)\n"
                  "#define ZNULL(x) if (__builtin_expect(!(x), 0)) ZNULLREF\n"
                  "#define ZCHK(call) if (__builtin_expect((zt = (call)) != nullptr, 0)) goto Ltrap;\n"
                  "#define ZRTERR if (__builtin_expect(e != nullptr, 0)) { ze = e; goto Lrterr; }\n"
                  "#define ZST if (__builtin_expect(st != 0, 0)) return st;\n"
                  "#define ZRETAIN(x) op::retainC(x)\n"
                  "#define ZRELEASE(x) ZCHK(op::releaseC(m, x))\n"
                  "#define ZSTR(k) reinterpret_cast<Slot>(m.strConsts[k])\n"
                  "#define ZOBJ(cls, x) reinterpret_cast<Z_C##cls*>(x)\n"
                  "#define ZSETG(g, x) { Slot old = m.globals[g]; m.globals[g] = (x); if (m.globalRef[g]) op::dropC(m, old); }\n"
                  "#define ZVIRT(x, sel) const char* ce = nullptr; Slot vt = (x); const Func* cf = op::virtualTarget(&vt, 0, sel, ce); if (__builtin_expect(ce != nullptr, 0)) ZTRAP(ce)\n"
                  "// a window outside the stack (the temporary one of an exception text, a native callback) is not checked against its end\n"
                  "#define ZFN static\n"
                  "#define ZSTACK(n) if (__builtin_expect(op::stackLow(m) || (win + (n) > m.stackEnd && win >= m.stack && win < m.stackEnd), 0)) { m.error = \"stack overflow\"; return 2; }\n\n";
  // The module the program loads keeps its tables (classes, selectors, strings, globals, signatures) but not the code of its functions: every
  // function is compiled below, so its words would only be decoded and verified at each launch (ZN-603). One Trap stands for each body.
  auto tablesOf = [](const zbc::Module& m) {
    zbc::Module tables = m;
    tables.workers.clear();   // a worker's code is compiled below, in its own namespace
    for (zbc::Function& fn : tables.functions) { fn.code.assign(1, static_cast<std::uint32_t>(zn::Op::Trap)); fn.consts.clear(); fn.handlers.clear(); }
    return zbc::packRuns(zbc::encode(tables));
  };
  auto bytes = tablesOf(mod);
  // one struct per object class with fields (ZN-409): the same layout as Obj + Slot fields[], f64 fields typed double; then the functions' declarations
  auto declarations = [&](const zbc::Module& m, const std::vector<char>& typed) {
    std::string d;
    for (std::size_t c = 0; c < m.classes.size(); ++c) {
      const zbc::ClassInfo& ci = m.classes[c];
      if (!FnEmitter::hasStruct(ci)) continue;
      const std::string n = "Z_C" + std::to_string(c);
      d += "struct " + n + " { const ClassRT* cls; std::uint32_t rc, pad;";
      for (std::size_t k = 0; k < ci.fields.size(); ++k) d += std::string(ci.fields[k].cls == zbc::Cls::D ? " double" : " Slot") + " f" + std::to_string(k) + ";";
      d += " };\nstatic_assert(sizeof(" + n + ") == sizeof(Obj) + " + std::to_string(ci.fields.size()) + " * sizeof(Slot), \"" + n + " layout\");\n";
    }
    for (std::size_t i = 0; i < m.functions.size(); ++i) {
      d += "ZFN int " + fname(m, 'f', i) + "(Machine& m, Slot* r);\n";
      if (typed[i]) { d += "ZFN Slot " + fname(m, 't', i) + "(Machine& m"; for (std::size_t k = 0; k < m.functions[i].params.size(); ++k) d += ", Slot"; d += ");\n"; }
    }
    return d + "\n";
  };
  const std::vector<char> typedFn = typedFunctions(mod, arith, divs);
  s += declarations(mod, typedFn);
  std::vector<std::string> bodies(mod.functions.size());
  std::size_t total = 0;
  const bool tablesOk = zbc::verifyTables(mod).empty();
  for (std::size_t i = 0; i < mod.functions.size(); ++i) {
    FnEmitter fe(mod, mod.functions[i], i, arith, divs, typedFn, tablesOk);
    fe.emit();
    bodies[i] = std::move(fe.out);
    total += bodies[i].size();
  }
  // A large program is compiled as several translation units (ZN-604, ZN-427): the first has the tables, the baked resources and main, the others
  // ZN_AOT_UNIT_FNS (48) functions each in index order. A change to one function's body then changes one unit, whose object zinc build finds
  // cached for the others; the units are compiled in parallel. Small programs (the benchmarks) stay one unit with static functions.
  const char* pb = std::getenv("ZN_AOT_PART_BYTES");   // tests: split small programs too
  const std::size_t kPartBytes = pb ? std::max<std::size_t>(1, std::strtoull(pb, nullptr, 10)) : std::size_t{512} << 10;
  const char* gs = std::getenv("ZN_AOT_UNIT_FNS");
  const std::size_t group = gs ? std::max<std::size_t>(1, std::strtoull(gs, nullptr, 10)) : 48;
  const bool split = maxParts > 1 && total >= kPartBytes && !bodies.empty();
  if (split) s.replace(s.find("#define ZFN static\n"), 19, "#define ZFN   // the functions are called across the units of this program\n");
  std::vector<std::string> out(1, s);
  if (split) for (std::size_t i = 0; i < bodies.size(); i += group) {
    out.push_back(s);
    for (std::size_t k = i; k < std::min(bodies.size(), i + group); ++k) out.back() += bodies[k];
  }
  else for (std::string& b : bodies) out[0] += b;
  s = std::move(out[0]);
  // zinc:worker (D181): each worker program compiled in a namespace of its own, registered at start for src/rt/worker.cpp to run on its thread
  for (std::size_t w = 0; w < mod.workers.size(); ++w) {
    zbc::Module wm;
    std::string werr;
    if (!zbc::decode(mod.workers[w].second, wm, werr)) continue;   // the build verified it; the program then says the worker is not part of it
    const std::vector<char> wt = typedFunctions(wm, arith, divs);
    const std::string ns = "zw" + std::to_string(w);
    s += "#include \"rt/worker.h\"\nnamespace " + ns + " {   // the worker '" + mod.workers[w].first + "'\n" + declarations(wm, wt);
    for (std::size_t i = 0; i < wm.functions.size(); ++i) { FnEmitter fe(wm, wm.functions[i], i, arith, divs, wt); fe.emit(); s += fe.out; }
    auto wb = tablesOf(wm);
    s += "static const char kModule[] = \n  ";
    appendBytes(s, wb.data(), wb.size());
    s += ";\nstatic int (*const kNatives[])(Machine&, Slot*) = {";
    for (std::size_t i = 0; i < wm.functions.size(); ++i) s += (i ? ", " : "") + fname(wm, 'f', i);
    std::string key;
    appendBytes(key, reinterpret_cast<const std::uint8_t*>(mod.workers[w].first.data()), mod.workers[w].first.size());
    s += "};\nstatic const bool kAdded = (zn::rt::worker::addCompiled(" + key + ", reinterpret_cast<const unsigned char*>(kModule), " + std::to_string(wb.size()) + ", kNatives, " + std::to_string(wm.functions.size()) + "), true);\n}  // namespace " + ns + "\n\n";
  }
  s += "static const char kModule[] = \n  ";
  appendBytes(s, bytes.data(), bytes.size());
  s += ";\nstatic const unsigned kModuleSize = " + std::to_string(bytes.size()) + ";\n\n";
  if (resources && usesHost(mod)) {  // baked fonts and images
    s += "static const char kResources[] = \n  ";
    appendBytes(s, resources->data(), resources->size());
    s += ";\n\n";
  }
  std::string fileLit;   // the name of the external resources' file as a C string
  appendBytes(fileLit, reinterpret_cast<const std::uint8_t*>(resourcesFile.data()), resourcesFile.size());
  std::vector<std::string> linkedNative;  // modules the program is linked with (ZINC_NATIVE_LIBS): the generated main registers them
  for (const zn::zbc::Native& nt : mod.natives) if (nt.module != "Fixture" && std::find(linkedNative.begin(), linkedNative.end(), nt.module) == linkedNative.end()) linkedNative.push_back(nt.module);
  std::string nativeDecls, nativeRegs;
  for (const std::string& nm : linkedNative) { nativeDecls += "extern \"C\" const ZnModule* zn_module_" + nm + "(void);\n"; nativeRegs += "  { char e[256]; if (zn_register_module(zn_module_" + nm + "(), e, sizeof e) < 0) { std::fprintf(stderr, \"%s\\n\", e); return 2; } }\n"; }
  bool hasFixture = false;
  for (const zn::zbc::Native& nt : mod.natives) hasFixture = hasFixture || nt.module == "Fixture";
  s += "static int (*const kNatives[])(Machine&, Slot*) = {";
  for (std::size_t i = 0; i < mod.functions.size(); ++i) s += (i ? ", " : "") + fname(mod, 'f', i);
  s += "};\n\n";
  s += "// The engine of a compiled program: run the native code of the function.\n"
       "bool zn::rt::Machine::exec(const Func* f, Slot* base) {\n"
       "  int st = f->native(*this, base);\n"
       "  if (st == 1) { error = \"panic: Uncaught \" + exceptionText(thrown); thrown = nullptr; return false; }\n"
       "  return st == 0;\n"
       "}\n\n"
       + std::string(usesHost(mod) ? "namespace zn::host { void installGfx(); bool showSplash(); void installLayout(); void installGl(); bool installResources(const unsigned char*, decltype(sizeof 0)); bool installResourcesFile(const char*); }  // the graphics host (src/host), linked by zinc build\n" : "") +
       std::string(hasFixture || !linkedNative.empty() ? "#include \"zn/native.h\"\n" + nativeDecls : "") + std::string(hasFixture ? "#include \"zn/native.h\"\nextern \"C\" const ZnModule* fixture_module(void);  // the C test module of tests/native, linked by zinc build (ZN-097; plugin modules come with the loader)\n" : "") +
       "#ifdef ZN_APP_LIBRARY   // linked into an app shell (ZN-620, include/zn/app.h): main is zn_app_init, which keeps the machine for zn_app_iterate\n"
       "#include \"zn/app.h\"\n#define main zn_app_init\n#define runProgramPacked runProgramApp\n"
       "namespace zn::rt { int runProgramApp(const unsigned char*, decltype(sizeof 0), int (*const*)(Machine&, Slot*), decltype(sizeof 0)); }\n#endif\n"
       "#ifdef ZN_CONSOLE_CORE   // linked into a console core (tools/build-console-core --aot, ZN-480): its entry installs the hosts and runs the program\n"
       "extern \"C\" void zn_console_aot(const unsigned char** module, unsigned long* size, const unsigned char** res, unsigned long* resSize, int (*const** natives)(Machine&, Slot*), unsigned long* count) {\n"
       "  *module = reinterpret_cast<const unsigned char*>(kModule); *size = kModuleSize; *natives = kNatives; *count = " + std::to_string(mod.functions.size()) + ";\n" +
       std::string(resources && usesHost(mod) ? "  *res = reinterpret_cast<const unsigned char*>(kResources); *resSize = sizeof kResources - 1;\n" : "  *res = nullptr; *resSize = 0;\n") +
       "}\n#else\n" +
       (usesHost(mod) ? "#include \"zn/hostsys.h\"\n\nint main(int argc, char** argv) {\n  zn::host::setProgramArgs(std::vector<std::string>(argv + 1, argv + argc));   // zinc:sys args()\n" : "int main(int, char**) {\n") + nativeRegs + (hasFixture ? "  { char e[256]; zn_register_module(fixture_module(), e, sizeof e); }\n" : "") + (usesHost(mod) ? "  zn::host::installGfx();\n  zn::host::showSplash();   // the splash first (ZN-446): before the fonts, the plugins and the program\n  zn::rt::gConsoleTap = zn::netlog::consoleLine;   // the inspector's Console\n" + std::string(rnLayout && usesLayout(mod) ? "  zn::host::installLayout();\n" : "") + std::string(usesGl(mod) ? "  zn::host::installGl();\n" : "") + std::string(resources ? "  zn::host::installResources(reinterpret_cast<const unsigned char*>(kResources), sizeof kResources - 1);\n" : !resourcesFile.empty() ? "  if (!zn::host::installResourcesFile(" + fileLit + ")) return 2;   // the fonts and images beside the program\n" : "") : std::string()) + "  return zn::rt::runProgramPacked(reinterpret_cast<const unsigned char*>(kModule), kModuleSize, kNatives, " + std::to_string(mod.functions.size()) + ");\n}\n#endif\n";
  out[0] = std::move(s);
  return out;
}

std::string emitCpp(const zbc::Module& mod, const std::vector<std::uint8_t>* resources, bool rnLayout, const std::string& resourcesFile) { return emitCppParts(mod, resources, rnLayout, 1, resourcesFile)[0]; }

}  // namespace zn::aot
