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

// The interpreter: the engine that provides Machine::exec.
bool Machine::exec(const Func* entry, Slot* base) {
  static const void* const labels[] = {
#define X(name, fmt, b, c, o) &&L_##name,
      ZN_OPCODES(X)
#undef X
  };
  if (fp == framesEnd) { error = "stack overflow"; return false; }
  *fp++ = {nullptr, nullptr, nullptr};  // marks where this exec() returns

  const Func* fn = entry;
  const std::uint32_t* code = fn->code;
  const std::uint32_t* pc = code;
  Slot* r = base;
  std::uint32_t w;

#define NEXT() do { w = *pc++; goto *labels[w & 0xFFu]; } while (0)
#define A aOf(w)
#define B bOf(w)
#define C cOf(w)
#define TRAP(msg) do { error = msg; return false; } while (0)
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
  if (__builtin_expect(fp == framesEnd, 0)) TRAP("stack overflow");
  *fp++ = {pc, fn, r};
  r = nb; fn = callee; code = callee->code; pc = code;
  NEXT();
}
L_Ret: {
  Slot v = r[A];
  const Frame f = *--fp;
  r[0] = v;
  if (!f.ret) return true;
  r = f.base; fn = f.fn; code = fn->code; pc = f.ret;
  NEXT();
}
L_RetV: {
  const Frame f = *--fp;
  if (!f.ret) return true;
  r = f.base; fn = f.fn; code = fn->code; pc = f.ret;
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
    r = f.base; fn = f.fn; code = fn->code; at = f.ret - 1;
  }
}
L_New: {
  const ClassRT* cr = &classes[dOf(w)];
  if (cr->kind == zbc::CKind::Array) { r[A] = reinterpret_cast<Slot>(newArr(cr)); NEXT(); }
  if (cr->kind == zbc::CKind::Map || cr->kind == zbc::CKind::Set) {
    auto* o = new MapObj();
    o->cls = cr; o->rc = 1;
    o->t.kk = cr->keyKind;
    o->t.hasVals = cr->kind == zbc::CKind::Map;
    track(o);
    r[A] = reinterpret_cast<Slot>(o);
    NEXT();
  }
  auto* o = static_cast<Obj*>(std::calloc(1, sizeof(Obj) + cr->nfields * sizeof(Slot)));
  if (!o) TRAP("out of memory");
  o->cls = cr; o->rc = 1;
  track(o);
  r[A] = reinterpret_cast<Slot>(o);
  NEXT();
}
L_GetField: {
  auto* o = reinterpret_cast<Obj*>(r[B]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  r[A] = o->fields()[C];
  NEXT();
}
L_SetField: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  Slot old = o->fields()[C];
  o->fields()[C] = r[B];
  if (o->cls->fieldRef[C]) releaseSlot(old);
  NEXT();
}
L_CallVirt: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  const Func* callee = o->cls->vtable[dOf(w)];
  if (__builtin_expect(fp == framesEnd, 0)) TRAP("stack overflow");
  *fp++ = {pc, fn, r};
  r = r + A; fn = callee; code = callee->code; pc = code;
  NEXT();
}
L_Downcast: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  if (o && !isSubclassRT(o->cls, dOf(w))) TRAP("invalid cast");
  NEXT();
}
L_LoadNull: r[A] = 0; NEXT();
L_InstanceOf: {
  auto* o = reinterpret_cast<Obj*>(r[A]);
  r[A] = Slot{o && isSubclassRT(o->cls, dOf(w))};
  NEXT();
}
L_EqR: r[A] = Slot{r[B] == r[C]}; NEXT();
L_NeR: r[A] = Slot{r[B] != r[C]}; NEXT();
L_GetGlobal: r[A] = globals[dOf(w)]; NEXT();
L_SetGlobal: { Slot old = globals[dOf(w)]; globals[dOf(w)] = r[A]; if (globalRef[dOf(w)]) releaseSlot(old); NEXT(); }
L_Retain: retain(reinterpret_cast<Obj*>(r[A])); NEXT();
L_Release: if (__builtin_expect(!release(reinterpret_cast<Obj*>(r[A])), 0)) TRAP("release of an object that is already dead"); NEXT();
L_LoadStr: r[A] = reinterpret_cast<Slot>(strConsts[dOf(w)]); NEXT();
L_ArrGet: {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[B]));
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  if (__builtin_expect(r[C] >= o->v.size(), 0)) TRAP("array index out of bounds");
  r[A] = o->v[r[C]];
  NEXT();
}
L_ArrSet: {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[A]));
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  Slot i = r[B];
  if (__builtin_expect(i >= o->v.size(), 0)) { if (i != o->v.size()) TRAP("array index out of bounds"); o->v.push_back(r[C]); }  // writing at length appends, like the native runtime
  else { Slot old = o->v[i]; o->v[i] = r[C]; if (o->cls->elemRef) releaseSlot(old); }
  NEXT();
}
L_ArrLen: {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[B]));
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  r[A] = o->v.size();
  NEXT();
}
L_ArrPush: {
  auto* o = static_cast<ArrObj*>(reinterpret_cast<Obj*>(r[B]));
  if (__builtin_expect(!o, 0)) TRAP("null reference");
  if (__builtin_expect(o->v.size() >= 0x7fffffffu, 0)) TRAP("RangeError: Invalid array length");
  o->v.push_back(r[C]);
  r[A] = o->v.size();
  NEXT();
}
L_Rt: {
  const char* e = rtCall(*this, static_cast<Rt>(dOf(w)), r + A, r + fn->nregs);
  if (__builtin_expect(e != nullptr, 0)) { if (e != error.c_str()) error = e; return false; }
  NEXT();
}
L_LogStr: {
  auto* s = reinterpret_cast<StrObj*>(r[A]);
  if (!s) TRAP("null reference");
  out->append(s->data(), s->len);
  NEXT();
}
L_LogI: *out += std::to_string(static_cast<std::int64_t>(r[A])); NEXT();
L_LogU: *out += std::to_string(r[A]); NEXT();
L_LogF64: { double d = asD(r[A]); *out += (d == 0 && std::signbit(d)) ? std::string("-0") : numberToString(d); NEXT(); }  // console.log prints -0
L_LogF32: *out += numberToString(static_cast<double>(asF(r[A]))); NEXT();
L_LogBool: *out += r[A] ? "true" : "false"; NEXT();
L_LogSep: *out += ' '; NEXT();
L_LogEnd: *out += '\n'; NEXT();
#undef NEXT
#undef A
#undef B
#undef C
#undef TRAP
}

}  // namespace zn::rt

namespace zn::vm {

using namespace zn::rt;

Result run(const zbc::Module& mod, std::string& out, bool traceFree) {
  Machine m;
  m.out = &out;
  m.traceFree = traceFree;
  Result res;
  std::string err;
  if (!m.load(mod, err)) { res.ok = false; res.error = err; return res; }
  if (!m.exec(&m.funcs[0], m.stack)) { res.ok = false; res.error = m.error; }
  else {
    for (std::size_t g = m.globals.size(); g-- > 0;) if (m.globalRef[g]) { Slot v = m.globals[g]; m.globals[g] = 0; m.releaseSlot(v); }  // statics die in reverse order of definition
    for (const Obj* o : m.allocated) if (o->rc != kImmortal) ++res.leaked;
  }
  res.trace = std::move(m.trace);
  return res;
}

}  // namespace zn::vm
