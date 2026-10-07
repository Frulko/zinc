#include "vm/vm.h"

#include <bit>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "rt/rt.h"
#include "zn/ops.h"

namespace zn::rt {

using namespace zn::ops;

// Superinstructions: a pair of neighbouring instructions that the interpreter runs as one dispatch. The pair stays two words long, the first word gets the fused opcode
// (the real opcodes end at Op::Count) and the second keeps its own encoding, so jump targets, handler positions and the size of the code are unchanged and a jump to
// the second instruction still runs it alone. `AddI32K` then `Call` (an argument computed just before a call: fib(n - 1)) and `AddI32` then `Ret` (return a + b).
constexpr std::uint32_t kFusedCallAddK = static_cast<std::uint32_t>(Op::Count), kFusedRetAddI32 = static_cast<std::uint32_t>(Op::Count) + 1;

// The pair at word i (and its length), or 0 when there is none.
static std::uint32_t fusedAt(const std::uint32_t* code, std::size_t n, std::size_t i, unsigned& len) {
  Op a = static_cast<Op>(opOf(code[i]));
  len = a < Op::Count ? instrLen(a) : 1;
  if (len != 1 || i + 1 >= n || (a != Op::AddI32K && a != Op::AddI32)) return 0;
  Op b = static_cast<Op>(opOf(code[i + 1]));
  return a == Op::AddI32K && b == Op::Call ? kFusedCallAddK : a == Op::AddI32 && b == Op::Ret ? kFusedRetAddI32 : 0;
}

static void fuseAll(Machine& m) {
  m.fusedReady = true;
  m.fusedCode.resize(m.funcs.size());
  for (std::size_t f = 0; f < m.funcs.size(); ++f) {
    Func& fn = m.funcs[f];
    if (fn.native || !fn.code) continue;
    std::size_t n = m.codeLen[f];
    unsigned len = 1;
    std::size_t first = n;
    for (std::size_t i = 0; i < n; i += len) if (fusedAt(fn.code, n, i, len)) { first = i; break; }
    if (first == n) continue;  // nothing to fuse: the function keeps running from the module's own code
    std::vector<std::uint32_t> code(fn.code, fn.code + n);
    for (std::size_t i = first; i < n; i += len)
      if (std::uint32_t fused = fusedAt(code.data(), n, i, len)) code[i] = (code[i] & ~0xFFu) | fused;
    m.fusedCode[f] = std::move(code);
    fn.code = m.fusedCode[f].data();
  }
}

// The interpreter: the engine that provides Machine::exec.
bool Machine::exec(const Func* entry, Slot* base) {
  if (!fusedReady) fuseAll(*this);
  return trackFn ? execT<true>(entry, base) : execT<false>(entry, base); }

// kTrack: keep `curFn` up to date for the sampling profiler (zinc profile); a normal run does not pay for the stores.
template <bool kTrack>
bool Machine::execT(const Func* entry, Slot* base) {
  static const void* const labels[] = {
#define X(name, fmt, b, c, o) &&L_##name,
      ZN_OPCODES(X)
#undef X
      &&L_CallAddK, &&L_RetAddI32,  // the superinstructions (kFusedFirst...), after the real opcodes
  };
  if (fp == framesEnd) { error = "stack overflow"; return false; }
  *fp++ = {nullptr, nullptr, nullptr};  // marks where this exec() returns

  const Func* fn = entry;
  if constexpr (kTrack) curFn = fn;
  const std::uint32_t* code = fn->code;
  const std::uint32_t* pc = code;
  Slot* r = base;
  std::uint32_t w;

#define NEXT() do { w = *pc++; goto *labels[w & 0xFFu]; } while (0)
#define A aOf(w)
#define B bOf(w)
#define C cOf(w)
#define TRAP(msg) do { error = msg; if (__builtin_expect(trapTrace, 0)) error += " (in @" + mod->functions[static_cast<std::size_t>(fn - funcs.data())].name + " at word " + std::to_string(pc - code - 1) + ")"; return false; } while (0)
  NEXT();

L_Nop: NEXT();
L_Trap: TRAP("trap: unreachable code executed");
L_Move: r[A] = r[B]; NEXT();
L_LoadI: r[A] = sx(sdOf(w)); NEXT();
L_LoadK: r[A] = fn->consts[dOf(w)].bits; NEXT();

#define X(name, expr) L_##name: r[A] = zn::ops::name(r[B], r[C]); NEXT();
  ZN_ARITH_OPS(X)
#undef X
#define X(name, zero, expr) L_##name: { if (!zn::ops::name##Defined(r[B], r[C])) TRAP("division by zero"); r[A] = zn::ops::name(r[B], r[C]); NEXT(); }
  ZN_DIV_OPS(X)
#undef X

L_AddI32K: r[A] = zn::ops::AddI32K(r[B], immOf(w)); NEXT();

// Fused compare-and-jump: word 0 holds the operands, word 1 (now at *pc) the absolute target.
#define X(name, cond) L_##name: { if (zn::ops::name(r[A], r[B])) pc = code + *pc; else ++pc; NEXT(); }
  ZN_JUMP_OPS(X)
#undef X
#define X(name, cond) L_##name: { if (zn::ops::name(r[A], immOf(w))) pc = code + *pc; else ++pc; NEXT(); }
  ZN_JUMP_IMM_OPS(X)
#undef X

L_Jmp: pc = code + axOf(w); NEXT();
L_JmpIf: if (r[A]) pc = code + dOf(w); NEXT();
L_JmpIfNot: if (!r[A]) pc = code + dOf(w); NEXT();
L_Call: {
  const Func* callee = &funcs[dOf(w)];
  Slot* nb = r + A;
  if (__builtin_expect(fp == framesEnd || nb + callee->nregs > stackEnd, 0)) TRAP("stack overflow");
  *fp++ = {pc, fn, r};
  r = nb; fn = callee; if constexpr (kTrack) curFn = fn;
  code = callee->code; pc = code;
  NEXT();
}
// the first half of a fused pair, then the second as a plain instruction
L_CallAddK: { r[A] = zn::ops::AddI32K(r[B], immOf(w)); w = *pc++; goto L_Call; }
L_RetAddI32: { r[A] = zn::ops::AddI32(r[B], r[C]); w = *pc++; goto L_Ret; }
L_Ret: {
  Slot v = r[A];
  const Frame f = *--fp;
  r[0] = v;
  if (!f.ret) return true;
  r = f.base; fn = f.fn; if constexpr (kTrack) curFn = fn;
  code = fn->code; pc = f.ret;
  NEXT();
}
L_RetV: {
  const Frame f = *--fp;
  if (!f.ret) return true;
  r = f.base; fn = f.fn; if constexpr (kTrack) curFn = fn;
  code = fn->code; pc = f.ret;
  NEXT();
}
L_Throw: {  // unwind to the nearest handler that takes the object, through the callers if need be
  Slot exc = r[A];
  if (!exc) TRAP("null reference");
  const std::uint32_t* at = pc - 1;  // the throwing instruction
  for (;;) {
    auto idx = static_cast<std::uint32_t>(at - code);
    const zbc::Handler* hit = nullptr;
    for (std::uint32_t k = 0; k < fn->nhandlers; ++k)
      if (fn->handlers[k].at == idx && isSubclassRT(reinterpret_cast<Obj*>(exc)->cls, fn->handlers[k].cls)) { hit = &fn->handlers[k]; break; }
    if (hit) { r[hit->reg] = exc; pc = code + hit->target; NEXT(); }
    const Frame f = *--fp;
    if (!f.ret) { error = "panic: Uncaught " + exceptionText(reinterpret_cast<Obj*>(exc)); return false; }
    r = f.base; fn = f.fn; if constexpr (kTrack) curFn = fn;
  code = fn->code; at = f.ret - 1;
  }
}
L_New: { if (const char* e = op::newObject(*this, dOf(w), r[A])) TRAP(e); NEXT(); }
L_GetField: { if (const char* e = op::getField(r, A, B, C)) TRAP(e); NEXT(); }
L_SetField: { if (const char* e = op::setField(*this, r, A, B, C)) TRAP(e); NEXT(); }
L_CallVirt: {
  const char* e = nullptr;
  const Func* callee = op::virtualTarget(r, A, dOf(w), e);
  if (__builtin_expect(e != nullptr, 0)) TRAP(e);
  if (__builtin_expect(fp == framesEnd || r + A + callee->nregs > stackEnd, 0)) TRAP("stack overflow");
  *fp++ = {pc, fn, r};
  r = r + A; fn = callee; if constexpr (kTrack) curFn = fn;
  code = callee->code; pc = code;
  NEXT();
}
L_Downcast: { if (const char* e = op::downcast(r, A, dOf(w))) TRAP(e); NEXT(); }
L_LoadNull: r[A] = 0; NEXT();
L_InstanceOf: r[A] = op::instanceOf(r[A], dOf(w)); NEXT();
L_EqR: r[A] = Slot{r[B] == r[C]}; NEXT();
L_NeR: r[A] = Slot{r[B] != r[C]}; NEXT();
L_GetGlobal: r[A] = globals[dOf(w)]; NEXT();
L_SetGlobal: { Slot old = globals[dOf(w)]; globals[dOf(w)] = r[A]; if (globalRef[dOf(w)]) releaseSlot(old); NEXT(); }
L_Retain: retain(reinterpret_cast<Obj*>(r[A])); NEXT();
L_Release: if (const char* e = op::release(*this, r[A])) TRAP(e); NEXT();
L_LoadStr: r[A] = reinterpret_cast<Slot>(strConsts[dOf(w)]); NEXT();
L_ArrGet: { if (const char* e = op::arrGet(r, A, B, C)) TRAP(e); NEXT(); }
L_ArrSet: { if (const char* e = op::arrSet(*this, r, A, B, C)) TRAP(e); NEXT(); }
L_ArrLen: { if (const char* e = op::arrLen(r, A, B)) TRAP(e); NEXT(); }
L_ArrPush: { if (const char* e = op::arrPush(r, A, B, C)) TRAP(e); NEXT(); }
L_Rt: {
  const char* e = rtCall(*this, static_cast<Rt>(dOf(w)), r + A, r + fn->nregs);
  if (__builtin_expect(e != nullptr, 0)) { if (e != error.c_str()) error = e; if (__builtin_expect(trapTrace, 0)) error += " (in @" + mod->functions[static_cast<std::size_t>(fn - funcs.data())].name + " at word " + std::to_string(pc - code - 1) + ", runtime call " + zn::rtInfo(static_cast<Rt>(dOf(w))).name + ")"; return false; }
  NEXT();
}
L_LogStr: { if (const char* e = op::logStr(*this, r[A])) TRAP(e); NEXT(); }
L_LogI: *out += std::to_string(static_cast<std::int64_t>(r[A])); NEXT();
L_LogU: *out += std::to_string(r[A]); NEXT();
L_LogF64: op::logF64(*this, r[A]); NEXT();
L_LogF32: *out += numberToString(static_cast<double>(asF(r[A]))); NEXT();
L_LogBool: *out += r[A] ? "true" : "false"; NEXT();
L_LogSep: *out += ' '; NEXT();
L_LogEnd: *out += '\n'; NEXT();
L_LogBegErr: errMark = out->size(); NEXT();
L_LogEndErr: flushErrLine(); NEXT();
#undef NEXT
#undef A
#undef B
#undef C
#undef TRAP
}

template bool Machine::execT<true>(const Func*, Slot*);
template bool Machine::execT<false>(const Func*, Slot*);

}  // namespace zn::rt

namespace zn::vm {

using namespace zn::rt;

Result run(const zbc::Module& mod, std::string& out, bool traceFree) { return runModule(mod, out, traceFree, nullptr, nullptr); }
Result runHooked(const zbc::Module& mod, std::string& out, void (*setup)(Machine&, const void*), const void* setupData, void (*finish)(Machine&, const void*), const void* finishData,
                 std::size_t stackSlots, std::size_t maxDepth) {
  return runModuleHooked(mod, out, false, setup, setupData, finish, finishData, stackSlots, maxDepth);
}

}  // namespace zn::vm
