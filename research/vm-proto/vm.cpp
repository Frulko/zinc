// Zinc VM dispatch prototype (research only, not wired into the build). See docs/reports/zinc-vm.md.
//
// A tiny *typed* register bytecode (ops know their operand types: no tags, no boxing), hand-assembled for four
// kernels of tests/bench/kernels, and executed by five dispatch strategies whose op semantics are written once
// (the BODY_* macros) and expanded per strategy:
//
//   switch       for(;;) switch over 64-bit instruction words, operands decoded per instruction
//   goto         computed goto (labels as values), token threaded over the same words
//   goto-direct  computed goto, direct threaded: words pre-decoded into {label address, a, b, c, imm}
//   tail         [[clang::musttail]] handler chain over pre-decoded {handler, a, b, c, imm} (wasm3 / Luau-style)
//   tail-acc     the same, plus an int and an f64 accumulator pinned in machine registers (they are handler
//                arguments); operands marked ACC select a handler specialisation at pre-decode time (quickening in
//                data memory: no machine code is generated, so this is iOS-legal)
//
// Without the accumulator, ACC operands are resolved to an ordinary frame slot, so every strategy runs exactly the
// same instruction stream.
//
// Build: clang++ -std=c++20 -O2 -fno-math-errno vm.cpp -o vm      (run.mjs does it)
// Run:   ./vm <fib|mandelbrot|nbody|spectralnorm> <switch|goto|goto-direct|tail|tail-acc> [--nofuse]
//        --nofuse replaces the FORLOOP super-instruction (i++; if (i < n) goto L) by ADDI_I32 + JLT_I32.
//        --inline inlines spectralnorm's A(i, j) into its callers (what a MIR inlining pass would give the VM).
//
// ponytail: 64-bit instruction words (op, a, b, c, imm32) instead of the 32-bit words + extension words of the
// design; decoding cost is the same shift-and-mask, and the kernels never need wide operands.
// ponytail: RC is elided by hand (borrowed registers), as the MIR RC pass of the design would do; the one owned
// temporary (spectralnorm's tmp array) is dropped with an explicit DROP_ARR.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

union Reg { int64_t i; int32_t w; double f; void* p; };
struct ArrF { uint32_t rc; int32_t len, cap; double* data; };   // same layout as zrt::ArrObj<double>
struct ArrP { uint32_t rc; int32_t len, cap; void** data; };    // zrt::ArrObj<Ref<T>>
struct Obj { void* vtbl; uint32_t rc, wc; double f[7]; };       // zrt::Object header (vptr, rc, wc) + 7 doubles

// name, mask of operands (A=1, B=2, C=4) that are typed value registers and may therefore be the accumulator
#define OPS(X) \
  X(HALT, 0) X(LOADI, 0) X(LOADK, 0) X(MOV, 0) X(LDG, 0) \
  X(ADD_I32, 7) X(SUB_I32, 7) X(MUL_I32, 7) X(ADDI_I32, 3) \
  X(ADD_F64, 7) X(SUB_F64, 7) X(MUL_F64, 7) X(DIV_F64, 7) X(ADDK_F64, 3) X(DIVK_F64, 3) X(KDIV_F64, 3) \
  X(I2F, 3) X(SQRT_F64, 3) \
  X(JMP, 0) X(JLT_I32, 3) X(JGE_I32, 3) X(JLT_I32I, 1) X(JNLE_F64, 3) X(FORLOOP, 0) \
  X(CALL, 0) X(RET, 0) \
  X(NEWARR_F64, 0) X(DROP_ARR, 0) X(ALEN, 0) X(AGET_F64, 1) X(ASET_F64, 4) X(AGET_REF, 0) X(GETF_F64, 1) X(SETF_F64, 4)

enum Op : uint8_t {
#define X(n, m) OP_##n,
  OPS(X)
#undef X
  NOPS
};
static const uint8_t MASK[] = {
#define X(n, m) m,
  OPS(X)
#undef X
};
constexpr int ACC = 255;

struct Ins { const void* h; uint8_t a, b, c, pad; int32_t imm; };  // pre-decoded instruction, 16 bytes
struct Fn { std::vector<uint64_t> raw; std::vector<Ins> dec; int nregs; };
struct Frame { const void* ip; Reg* fp; };
struct VM {
  const double* K; Reg* G; Fn* fns;
  Frame* csp; Frame* cend; Reg* send;
  Reg result;
};

[[noreturn]] __attribute__((noinline, cold)) static void panic(const char* m) { fprintf(stderr, "panic: %s\n", m); exit(70); }

// ---------------------------------------------------------------------------------------------------------------
// Op semantics, written once. A strategy defines: A_ B_ C_ IMM_ (operand fields), ACC_A/B/C (operand is the
// machine-register accumulator), CODE(f) (entry of a function), NEXT, JUMP(off), DISPATCH, EXIT, and the
// variables ip, fp, vm, ia (int accumulator), fa (f64 accumulator).
#define RI(X) (ACC_##X ? (int32_t)ia : fp[X##_].w)
#define RF(X) (ACC_##X ? fa : fp[X##_].f)
#define WI(X, v) do { int32_t v_ = (v); if (ACC_##X) ia = v_; else fp[X##_].w = v_; } while (0)
#define WF(X, v) do { double v_ = (v); if (ACC_##X) fa = v_; else fp[X##_].f = v_; } while (0)
#define WRAP(e) ((int32_t)(uint32_t)(e))

#define BODY_HALT       { vm->result = fp[A_]; EXIT; }
#define BODY_LOADI      { fp[A_].w = IMM_; NEXT; }
#define BODY_LOADK      { fp[A_].f = vm->K[IMM_]; NEXT; }
#define BODY_MOV        { fp[A_] = fp[B_]; NEXT; }
#define BODY_LDG        { fp[A_] = vm->G[IMM_]; NEXT; }
#define BODY_ADD_I32    { WI(A, WRAP((uint32_t)RI(B) + (uint32_t)RI(C))); NEXT; }
#define BODY_SUB_I32    { WI(A, WRAP((uint32_t)RI(B) - (uint32_t)RI(C))); NEXT; }
#define BODY_MUL_I32    { WI(A, WRAP((uint32_t)RI(B) * (uint32_t)RI(C))); NEXT; }
#define BODY_ADDI_I32   { WI(A, WRAP((uint32_t)RI(B) + (uint32_t)IMM_)); NEXT; }
#define BODY_ADD_F64    { WF(A, RF(B) + RF(C)); NEXT; }
#define BODY_SUB_F64    { WF(A, RF(B) - RF(C)); NEXT; }
#define BODY_MUL_F64    { WF(A, RF(B) * RF(C)); NEXT; }
#define BODY_DIV_F64    { WF(A, RF(B) / RF(C)); NEXT; }
#define BODY_ADDK_F64   { WF(A, RF(B) + vm->K[C_]); NEXT; }
#define BODY_DIVK_F64   { WF(A, RF(B) / vm->K[C_]); NEXT; }
#define BODY_KDIV_F64   { WF(A, vm->K[C_] / RF(B)); NEXT; }
#define BODY_I2F        { WF(A, (double)RI(B)); NEXT; }
#define BODY_SQRT_F64   { WF(A, __builtin_sqrt(RF(B))); NEXT; }
#define BODY_JMP        { JUMP(IMM_); }
#define BODY_JLT_I32    { if (RI(A) < RI(B)) JUMP(IMM_); NEXT; }
#define BODY_JGE_I32    { if (RI(A) >= RI(B)) JUMP(IMM_); NEXT; }
#define BODY_JLT_I32I   { if (RI(A) < (int8_t)B_) JUMP(IMM_); NEXT; }
#define BODY_JNLE_F64   { if (!(RF(A) <= RF(B))) JUMP(IMM_); NEXT; }
#define BODY_FORLOOP    { int32_t v_ = fp[A_].w + 1; fp[A_].w = v_; if (v_ < fp[B_].w) JUMP(IMM_); NEXT; }
#define BODY_CALL { \
    Fn* f_ = &vm->fns[IMM_]; Reg* nfp_ = fp + A_; \
    if (vm->csp == vm->cend || nfp_ + f_->nregs + 1 > vm->send) panic("stack overflow"); \
    vm->csp->ip = ip; vm->csp->fp = fp; vm->csp++; \
    fp = nfp_; ip = CODE(f_); DISPATCH; }
#define BODY_RET        { fp[0] = fp[A_]; vm->csp--; ip = (decltype(ip))vm->csp->ip; fp = vm->csp->fp; NEXT; }
#define BODY_NEWARR_F64 { int32_t n_ = fp[B_].w; ArrF* a_ = (ArrF*)malloc(sizeof(ArrF)); a_->rc = 1; a_->len = a_->cap = n_; \
                          a_->data = (double*)calloc(n_ ? n_ : 1, 8); fp[A_].p = a_; NEXT; }
#define BODY_DROP_ARR   { ArrF* a_ = (ArrF*)fp[A_].p; if (a_ && --a_->rc == 0) { free(a_->data); free(a_); } NEXT; }
#define BODY_ALEN       { fp[A_].w = ((ArrF*)fp[B_].p)->len; NEXT; }
#define BODY_AGET_F64   { ArrF* a_ = (ArrF*)fp[B_].p; int32_t i_ = fp[C_].w; \
                          if ((uint32_t)i_ >= (uint32_t)a_->len) panic("index out of bounds"); WF(A, a_->data[i_]); NEXT; }
#define BODY_ASET_F64   { ArrF* a_ = (ArrF*)fp[A_].p; int32_t i_ = fp[B_].w; \
                          if ((uint32_t)i_ >= (uint32_t)a_->len) panic("index out of bounds"); a_->data[i_] = RF(C); NEXT; }
#define BODY_AGET_REF   { ArrP* a_ = (ArrP*)fp[B_].p; int32_t i_ = fp[C_].w; \
                          if ((uint32_t)i_ >= (uint32_t)a_->len) panic("index out of bounds"); fp[A_].p = a_->data[i_]; NEXT; }
#define BODY_GETF_F64   { WF(A, *(double*)((char*)fp[B_].p + IMM_)); NEXT; }
#define BODY_SETF_F64   { *(double*)((char*)fp[A_].p + IMM_) = RF(C); NEXT; }

// ---------------------------------------------------------------------------------------------------------------
// 1. switch over raw words
#define A_ ((uint8_t)(w >> 8))
#define B_ ((uint8_t)(w >> 16))
#define C_ ((uint8_t)(w >> 24))
#define IMM_ ((int32_t)(w >> 32))
#define ACC_A false
#define ACC_B false
#define ACC_C false
#define CODE(f) ((f)->raw.data())
#define EXIT return

static void run_switch(VM* vm, const uint64_t* ip, Reg* fp) {
  int64_t ia = 0; double fa = 0; (void)ia; (void)fa;
#define DISPATCH continue
#define NEXT { ip++; continue; }
#define JUMP(o) { ip += (o); continue; }
  for (;;) {
    uint64_t w = *ip;
    switch ((Op)(uint8_t)w) {
#define X(n, m) case OP_##n: BODY_##n
      OPS(X)
#undef X
      default: __builtin_unreachable();
    }
  }
#undef DISPATCH
#undef NEXT
#undef JUMP
}

// 2. computed goto, token threaded over raw words
static void run_goto(VM* vm, const uint64_t* ip, Reg* fp) {
  static const void* L[] = {
#define X(n, m) &&L_##n,
    OPS(X)
#undef X
  };
  int64_t ia = 0; double fa = 0; (void)ia; (void)fa;
  uint64_t w;
#define DISPATCH { w = *ip; goto *L[(uint8_t)w]; }
#define NEXT { ip++; DISPATCH; }
#define JUMP(o) { ip += (o); DISPATCH; }
  DISPATCH;
#define X(n, m) L_##n: BODY_##n
  OPS(X)
#undef X
#undef DISPATCH
#undef NEXT
#undef JUMP
}
#undef A_
#undef B_
#undef C_
#undef IMM_
#undef CODE

// 3. computed goto, direct threaded over pre-decoded instructions
#define A_ (ip->a)
#define B_ (ip->b)
#define C_ (ip->c)
#define IMM_ (ip->imm)
#define CODE(f) ((f)->dec.data())
static const void** g_labels;
static void run_goto_direct(VM* vm, const Ins* ip, Reg* fp) {
  static const void* L[] = {
#define X(n, m) &&L_##n,
    OPS(X)
#undef X
  };
  if (!vm) { g_labels = L; return; }
  int64_t ia = 0; double fa = 0; (void)ia; (void)fa;
#define DISPATCH goto *ip->h
#define NEXT { ip++; DISPATCH; }
#define JUMP(o) { ip += (o); DISPATCH; }
  DISPATCH;
#define X(n, m) L_##n: BODY_##n
  OPS(X)
#undef X
#undef DISPATCH
#undef NEXT
#undef JUMP
}
#undef ACC_A
#undef ACC_B
#undef ACC_C
#undef EXIT

// 4/5. musttail handler chain; M = which operands are the accumulator (0 for the plain `tail` strategy)
#ifdef PRESERVE_NONE
#define CC __attribute__((preserve_none))
#else
#define CC
#endif
typedef CC void (*Handler)(const Ins*, Reg*, int64_t, double, VM*);
#define ACC_A ((M & 1) != 0)
#define ACC_B ((M & 2) != 0)
#define ACC_C ((M & 4) != 0)
#define DISPATCH [[clang::musttail]] return ((Handler)ip->h)(ip, fp, ia, fa, vm)
#define NEXT { ip++; DISPATCH; }
#define JUMP(o) { ip += (o); DISPATCH; }
#define EXIT return
#define X(n, m) template<int M> CC static void h_##n(const Ins* ip, Reg* fp, int64_t ia, double fa, VM* vm) BODY_##n
OPS(X)
#undef X
static const void* TAIL[NOPS][8] = {
#define X(n, m) { (const void*)&h_##n<0>, (const void*)&h_##n<1>, (const void*)&h_##n<2>, (const void*)&h_##n<3>, \
                  (const void*)&h_##n<4>, (const void*)&h_##n<5>, (const void*)&h_##n<6>, (const void*)&h_##n<7> },
  OPS(X)
#undef X
};

// ---------------------------------------------------------------------------------------------------------------
// assembler
static bool g_fuse = true, g_inline = false;
static uint64_t enc(Op o, int a, int b, int c, int32_t imm) {
  return (uint64_t)o | (uint64_t)(uint8_t)a << 8 | (uint64_t)(uint8_t)b << 16 | (uint64_t)(uint8_t)c << 24 | (uint64_t)(uint32_t)imm << 32;
}
struct Asm {
  Fn& f;
  std::vector<int> pos;
  std::vector<std::pair<int, int>> fix;
  explicit Asm(Fn& fn, int nregs) : f(fn) { f.nregs = nregs; }
  void op(Op o, int a = 0, int b = 0, int c = 0, int32_t imm = 0) { f.raw.push_back(enc(o, a, b, c, imm)); }
  int label() { pos.push_back(-1); return (int)pos.size() - 1; }
  void bind(int l) { pos[l] = (int)f.raw.size(); }
  void jop(Op o, int a, int b, int l) { fix.push_back({(int)f.raw.size(), l}); op(o, a, b); }
  // i++; if (i < n) goto top  -- the FORLOOP super-instruction, or its two-op expansion
  void loopEnd(int i, int n, int top) {
    if (g_fuse) jop(OP_FORLOOP, i, n, top);
    else { op(OP_ADDI_I32, i, i, 0, 1); jop(OP_JLT_I32, i, n, top); }
  }
  ~Asm() { for (auto [at, l] : fix) f.raw[at] = (f.raw[at] & 0xFFFFFFFFull) | (uint64_t)(uint32_t)(pos[l] - at) << 32; }
};

// ACC operands become frame slot `nregs` unless the strategy keeps a machine-register accumulator
static void resolveAcc(Fn& f, bool keep) {
  if (keep) return;
  for (auto& w : f.raw) {
    uint8_t m = MASK[(uint8_t)w];
    for (int k = 0; k < 3; k++)
      if ((m >> k & 1) && (uint8_t)(w >> (8 + 8 * k)) == ACC) w = (w & ~(0xFFull << (8 + 8 * k))) | (uint64_t)f.nregs << (8 + 8 * k);
  }
}
static void predecode(Fn& f, bool tail) {
  f.dec.clear();
  for (uint64_t w : f.raw) {
    Op o = (Op)(uint8_t)w;
    Ins in{nullptr, (uint8_t)(w >> 8), (uint8_t)(w >> 16), (uint8_t)(w >> 24), 0, (int32_t)(w >> 32)};
    int m = 0;
    for (int k = 0; k < 3; k++) if ((MASK[o] >> k & 1) && (&in.a)[k] == ACC) m |= 1 << k;
    in.h = tail ? TAIL[o][m] : g_labels[o];
    f.dec.push_back(in);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 6. `jit`: a baseline-JIT micro-experiment (macOS arm64, MAP_JIT). Each bytecode is pasted as a fixed arm64
// template whose holes (frame offsets, constants, branch targets) are patched: the code a copy-and-patch JIT emits
// for typed ops, with operands still loaded from / stored to the frame and ACC kept in d0. Only the ops of
// mandelbrot are covered. ponytail: templates are hand-encoded instead of extracted from clang-compiled stencils.
#if defined(__APPLE__) && defined(__aarch64__)
#include <sys/mman.h>
#include <pthread.h>
#include <libkern/OSCacheControl.h>
#include <chrono>
typedef void (*JitFn)(Reg* fp, const double* K);
// With `pin` (strategy `jit-pin`), the typed frame slots are pinned to machine registers (f64 -> d16..d31,
// i32 -> spare x registers): typed bytecode tells the JIT each slot's type statically, so this needs no
// register allocator and no guards, unlike a JS baseline JIT whose slots hold tagged values.
static JitFn jit_compile(const Fn& f, bool pin, size_t* bytes) {
  std::vector<uint32_t> c;
  std::vector<size_t> at(f.raw.size() + 1);
  std::vector<std::pair<size_t, int>> fix;  // (code index of branch, target bytecode index)
  const int FP = 0, KP = 1;
  // slot types, as the verifier knows them from the typed ops: 1 = i32, 2 = f64
  std::vector<int> ty(256, 0), map(256, -1);
  auto T = [&](int r, int t) { if (r != ACC) ty[r] = t; };
  for (int pass = 0; pass < 2; pass++) for (uint64_t w : f.raw) {
    int a = (uint8_t)(w >> 8), b = (uint8_t)(w >> 16), cc = (uint8_t)(w >> 24);
    switch ((Op)(uint8_t)w) {
      case OP_LOADI: T(a, 1); break;
      case OP_LOADK: T(a, 2); break;
      case OP_I2F: T(a, 2); T(b, 1); break;
      case OP_ADD_F64: case OP_SUB_F64: case OP_MUL_F64: case OP_DIV_F64: T(a, 2); T(b, 2); T(cc, 2); break;
      case OP_ADDI_I32: case OP_JGE_I32: case OP_FORLOOP: T(a, 1); T(b, 1); break;
      case OP_JNLE_F64: T(a, 2); T(b, 2); break;
      case OP_MOV: if (ty[b]) T(a, ty[b]); else if (ty[a]) T(b, ty[a]); break;
      default: break;
    }
  }
  if (pin) {
    static const int gpr[] = {2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15};
    int nd = 16, nx = 0;
    for (int r = 0; r < 255; r++) {
      if (ty[r] == 2 && nd < 32) map[r] = nd++;
      if (ty[r] == 1 && nx < 12) map[r] = gpr[nx++];
    }
  }
  auto ldrd = [&](int d, int r) { c.push_back(0xFD400000 | (uint32_t)r << 10 | FP << 5 | d); };
  auto strd = [&](int d, int r) { c.push_back(0xFD000000 | (uint32_t)r << 10 | FP << 5 | d); };
  auto ldrw = [&](int w, int r) { c.push_back(0xB9400000 | (uint32_t)(r * 2) << 10 | FP << 5 | w); };
  auto strw = [&](int w, int r) { c.push_back(0xB9000000 | (uint32_t)(r * 2) << 10 | FP << 5 | w); };
  // operand -> machine register: ACC is d0; pinned slots are their register; other slots go through temporaries
  auto fsrc = [&](int r, int tmp) { if (r == ACC) return 0; if (map[r] >= 0) return map[r]; ldrd(tmp, r); return tmp; };
  auto fdst = [&](int r) { return r == ACC ? 0 : map[r] >= 0 ? map[r] : 3; };
  auto fput = [&](int r) { if (r != ACC && map[r] < 0) strd(3, r); };
  auto isrc = [&](int r, int tmp) { if (map[r] >= 0) return map[r]; ldrw(tmp, r); return tmp; };
  auto idst = [&](int r) { return map[r] >= 0 ? map[r] : 9; };
  auto iput = [&](int r) { if (map[r] < 0) strw(9, r); };
  for (size_t i = 0; i < f.raw.size(); i++) {
    at[i] = c.size();
    uint64_t w = f.raw[i];
    int a = (uint8_t)(w >> 8), b = (uint8_t)(w >> 16), cc = (uint8_t)(w >> 24), imm = (int32_t)(w >> 32);
    auto br = [&](uint32_t ins) { fix.push_back({c.size(), (int)i + imm}); c.push_back(ins); };
    switch ((Op)(uint8_t)w) {
      case OP_LOADI: { int d = idst(a); c.push_back(0x52800000 | (imm & 0xFFFF) << 5 | d); c.push_back(0x72A00000 | ((uint32_t)imm >> 16) << 5 | d); iput(a); break; }
      case OP_LOADK: { int d = fdst(a); c.push_back(0xFD400000 | (uint32_t)imm << 10 | KP << 5 | d); fput(a); break; }
      case OP_MOV:
        if (ty[a] == 2) { int n = fsrc(b, 1), d = fdst(a); c.push_back(0x1E604000 | n << 5 | d); fput(a); }       // fmov
        else { int n = isrc(b, 10), d = idst(a); c.push_back(0x2A0003E0 | n << 16 | d); iput(a); }                 // mov w
        break;
      case OP_I2F: { int n = isrc(b, 9), d = fdst(a); c.push_back(0x1E620000 | n << 5 | d); fput(a); break; }      // scvtf
      case OP_ADD_F64: case OP_SUB_F64: case OP_MUL_F64: case OP_DIV_F64: {
        static const uint32_t base[] = {0x1E602800, 0x1E603800, 0x1E600800, 0x1E601800};
        int n = fsrc(b, 1), m = fsrc(cc, 2), d = fdst(a);
        c.push_back(base[(uint8_t)w - OP_ADD_F64] | (uint32_t)m << 16 | (uint32_t)n << 5 | d); fput(a); break;
      }
      case OP_ADDI_I32: { int n = isrc(b, 9), d = idst(a); c.push_back(0x11000000 | (uint32_t)imm << 10 | n << 5 | d); iput(a); break; }
      case OP_JMP: br(0x14000000); break;
      case OP_JGE_I32: { int n = isrc(a, 9), m = isrc(b, 10); c.push_back(0x6B000000 | m << 16 | n << 5 | 31); br(0x5400000A); break; }  // cmp; b.ge
      case OP_JNLE_F64: { int n = fsrc(a, 1), m = fsrc(b, 2); c.push_back(0x1E602000 | (uint32_t)m << 16 | (uint32_t)n << 5); br(0x54000008); break; }  // fcmp; b.hi
      case OP_FORLOOP: { int n = isrc(a, 9); c.push_back(0x11000000 | 1 << 10 | n << 5 | n); if (map[a] < 0) strw(9, a);
                         int m = isrc(b, 10); c.push_back(0x6B000000 | m << 16 | n << 5 | 31); br(0x5400000B); break; }  // add; cmp; b.lt
      case OP_HALT: if (map[a] >= 0) { if (ty[a] == 2) strd(map[a], a); else strw(map[a], a); } c.push_back(0xD65F03C0); break;
      default: fprintf(stderr, "jit: op %d not covered (mandelbrot only)\n", (int)(uint8_t)w); exit(2);
    }
  }
  for (auto [ci, t] : fix) {
    int32_t off = (int32_t)at[t] - (int32_t)ci;
    c[ci] = (c[ci] & 0xFC000000) == 0x14000000 ? 0x14000000 | (off & 0x3FFFFFF) : c[ci] | (uint32_t)(off & 0x7FFFF) << 5;
  }
  *bytes = c.size() * 4;
  void* mem = mmap(nullptr, 1 << 16, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_PRIVATE | MAP_ANON | MAP_JIT, -1, 0);
  if (mem == MAP_FAILED) panic("mmap(MAP_JIT) failed");
  pthread_jit_write_protect_np(0);          // this thread: pages writable, not executable (W^X)
  memcpy(mem, c.data(), *bytes);
  pthread_jit_write_protect_np(1);          // executable again, not writable
  sys_icache_invalidate(mem, *bytes);
  return (JitFn)mem;
}
#endif

// ---------------------------------------------------------------------------------------------------------------
// kernels (same algorithms, sizes and floating-point evaluation order as tests/bench/kernels/*.ts)
struct Program { std::vector<Fn> fns; std::vector<double> K; std::vector<Reg> G; };

static void k_fib(Program& p) {
  p.fns.resize(2);
  { Asm a(p.fns[0], 2); a.op(OP_LOADI, 1, 0, 0, 32); a.op(OP_CALL, 1, 0, 0, 1); a.op(OP_HALT, 1); }
  { Asm a(p.fns[1], 4);                     // fib(n: r0)
    int ret = a.label();
    a.jop(OP_JLT_I32I, 0, 2, ret);          // if (n < 2) return n
    a.op(OP_ADDI_I32, 2, 0, 0, -1); a.op(OP_CALL, 2, 0, 0, 1);
    a.op(OP_ADDI_I32, 3, 0, 0, -2); a.op(OP_CALL, 3, 0, 0, 1);
    a.op(OP_ADD_I32, 1, 2, 3); a.op(OP_RET, 1);
    a.bind(ret); a.op(OP_RET, 0); }
}

static void k_mandelbrot(Program& p) {
  p.K = {0.0, 400.0, 3.0, 1.5, 2.0, 4.0};
  p.fns.resize(1);
  Asm a(p.fns[0], 19);
  // r0 checksum r1 py r2 px r3 y0 r4 x0 r5 x r6 y r7 iter r8 H r9 W r10 MAX r11 400.0 r12 3.0 r13 1.5 r14 2.0
  // r15 x*x r16 y*y r17 4.0 r18 xt
  a.op(OP_LOADK, 0, 0, 0, 0); a.op(OP_LOADI, 8, 0, 0, 400); a.op(OP_LOADI, 9, 0, 0, 400); a.op(OP_LOADI, 10, 0, 0, 200);
  a.op(OP_LOADK, 11, 0, 0, 1); a.op(OP_LOADK, 12, 0, 0, 2); a.op(OP_LOADK, 13, 0, 0, 3); a.op(OP_LOADK, 14, 0, 0, 4);
  a.op(OP_LOADK, 17, 0, 0, 5);
  a.op(OP_LOADI, 1, 0, 0, 0);
  int lpy = a.label(), lpx = a.label(), lit = a.label(), ldone = a.label();
  a.bind(lpy);
  a.op(OP_I2F, ACC, 1); a.op(OP_DIV_F64, ACC, ACC, 11); a.op(OP_MUL_F64, ACC, ACC, 12); a.op(OP_SUB_F64, 3, ACC, 13);
  a.op(OP_LOADI, 2, 0, 0, 0);
  a.bind(lpx);
  a.op(OP_I2F, ACC, 2); a.op(OP_DIV_F64, ACC, ACC, 11); a.op(OP_MUL_F64, ACC, ACC, 12); a.op(OP_SUB_F64, 4, ACC, 14);
  a.op(OP_LOADK, 5, 0, 0, 0); a.op(OP_LOADK, 6, 0, 0, 0); a.op(OP_LOADI, 7, 0, 0, 0);
  a.bind(lit);                              // while (x*x + y*y <= 4 && iter < MAX_ITER)
  a.op(OP_MUL_F64, 15, 5, 5); a.op(OP_MUL_F64, 16, 6, 6); a.op(OP_ADD_F64, ACC, 15, 16); a.jop(OP_JNLE_F64, ACC, 17, ldone);
  a.jop(OP_JGE_I32, 7, 10, ldone);
  a.op(OP_MUL_F64, 15, 5, 5); a.op(OP_MUL_F64, 16, 6, 6); a.op(OP_SUB_F64, ACC, 15, 16); a.op(OP_ADD_F64, 18, ACC, 4);
  a.op(OP_MUL_F64, ACC, 14, 5); a.op(OP_MUL_F64, ACC, ACC, 6); a.op(OP_ADD_F64, 6, ACC, 3);
  a.op(OP_MOV, 5, 18);
  a.op(OP_ADDI_I32, 7, 7, 0, 1);
  a.jop(OP_JMP, 0, 0, lit);
  a.bind(ldone);
  a.op(OP_I2F, ACC, 7); a.op(OP_ADD_F64, 0, 0, ACC);
  a.loopEnd(2, 9, lpx);
  a.loopEnd(1, 8, lpy);
  a.op(OP_HALT, 0);
}

enum { FX = 16, FY = 24, FZ = 32, FVX = 40, FVY = 48, FVZ = 56, FMASS = 64 };
static void k_nbody(Program& p) {
  // bodies are built and offsetMomentum()/energy() run natively in main(): one-shot, <0.01% of the run
  p.K = {0.01};
  p.fns.resize(2);
  { Asm a(p.fns[0], 6);
    int l = a.label();
    a.op(OP_LOADI, 0, 0, 0, 0); a.op(OP_LOADI, 1, 0, 0, 600000); a.op(OP_LOADK, 2, 0, 0, 0);
    a.bind(l); a.op(OP_MOV, 4, 2); a.op(OP_CALL, 4, 0, 0, 1); a.loopEnd(0, 1, l);
    a.op(OP_HALT, 0); }
  { Asm a(p.fns[1], 15);                    // advance(dt: r0)
    a.op(OP_LDG, 1, 0, 0, 0); a.op(OP_ALEN, 2, 1); a.op(OP_LOADI, 3, 0, 0, 0);
    int li = a.label(), lendi = a.label(), lj = a.label(), lendj = a.label(), lb = a.label(), lendb = a.label();
    a.jop(OP_JGE_I32, 3, 2, lendi);
    a.bind(li);
    a.op(OP_AGET_REF, 4, 1, 3);             // bi
    a.op(OP_ADDI_I32, 5, 3, 0, 1);          // j = i + 1
    a.jop(OP_JGE_I32, 5, 2, lendj);
    a.bind(lj);
    a.op(OP_AGET_REF, 6, 1, 5);             // bj
    const int d[3] = {7, 8, 9}, pos[3] = {FX, FY, FZ}, vel[3] = {FVX, FVY, FVZ};
    for (int k = 0; k < 3; k++) { a.op(OP_GETF_F64, d[k], 4, 0, pos[k]); a.op(OP_GETF_F64, ACC, 6, 0, pos[k]); a.op(OP_SUB_F64, d[k], d[k], ACC); }
    a.op(OP_MUL_F64, ACC, 7, 7); a.op(OP_MUL_F64, 10, 8, 8); a.op(OP_ADD_F64, ACC, ACC, 10);
    a.op(OP_MUL_F64, 10, 9, 9); a.op(OP_ADD_F64, 10, ACC, 10);          // dSq
    a.op(OP_SQRT_F64, 11, 10);                                           // distance
    a.op(OP_MUL_F64, ACC, 10, 11); a.op(OP_DIV_F64, 12, 0, ACC);        // mag = dt / (dSq * distance)
    a.op(OP_GETF_F64, 13, 6, 0, FMASS);
    for (int k = 0; k < 3; k++) {           // bi.v -= d * bj.mass * mag
      a.op(OP_MUL_F64, ACC, d[k], 13); a.op(OP_MUL_F64, ACC, ACC, 12);
      a.op(OP_GETF_F64, 14, 4, 0, vel[k]); a.op(OP_SUB_F64, 14, 14, ACC); a.op(OP_SETF_F64, 4, 0, 14, vel[k]);
    }
    a.op(OP_GETF_F64, 13, 4, 0, FMASS);
    for (int k = 0; k < 3; k++) {           // bj.v += d * bi.mass * mag
      a.op(OP_MUL_F64, ACC, d[k], 13); a.op(OP_MUL_F64, ACC, ACC, 12);
      a.op(OP_GETF_F64, 14, 6, 0, vel[k]); a.op(OP_ADD_F64, 14, 14, ACC); a.op(OP_SETF_F64, 6, 0, 14, vel[k]);
    }
    a.loopEnd(5, 2, lj);
    a.bind(lendj);
    a.loopEnd(3, 2, li);
    a.bind(lendi);
    a.op(OP_LOADI, 3, 0, 0, 0);
    a.jop(OP_JGE_I32, 3, 2, lendb);
    a.bind(lb);                             // for (const b of bodies) b.p += dt * b.v
    a.op(OP_AGET_REF, 4, 1, 3);
    for (int k = 0; k < 3; k++) {
      a.op(OP_GETF_F64, ACC, 4, 0, vel[k]); a.op(OP_MUL_F64, ACC, 0, ACC);
      a.op(OP_GETF_F64, 14, 4, 0, pos[k]); a.op(OP_ADD_F64, 14, 14, ACC); a.op(OP_SETF_F64, 4, 0, 14, pos[k]);
    }
    a.loopEnd(3, 2, lb);
    a.bind(lendb);
    a.op(OP_RET, 0); }
}

static void k_spectralnorm(Program& p) {
  p.K = {0.0, 1.0, 2.0};
  p.fns.resize(5);  // 0 main, 1 A, 2 timesA, 3 timesAt, 4 timesAtA
  { Asm a(p.fns[1], 5);                     // A(i: r0, j: r1): 1.0 / (ij * (ij + 1) / 2 + i + 1)
    a.op(OP_ADD_I32, 2, 0, 1); a.op(OP_ADDI_I32, 3, 2, 0, 1); a.op(OP_MUL_I32, 3, 2, 3);
    a.op(OP_I2F, ACC, 3); a.op(OP_DIVK_F64, ACC, ACC, 2); a.op(OP_I2F, 4, 0); a.op(OP_ADD_F64, ACC, ACC, 4);
    a.op(OP_ADDK_F64, ACC, ACC, 1); a.op(OP_KDIV_F64, 2, ACC, 1); a.op(OP_RET, 2); }
  for (int t = 0; t < 2; t++) {             // timesA / timesAt (x: r0, out: r1)
    Asm a(p.fns[2 + t], 12);
    int li = a.label(), lj = a.label();
    a.op(OP_LOADI, 5, 0, 0, 1000); a.op(OP_LOADI, 2, 0, 0, 0);
    a.bind(li); a.op(OP_LOADK, 3, 0, 0, 0); a.op(OP_LOADI, 4, 0, 0, 0);
    a.bind(lj);
    int i = t == 0 ? 2 : 4, j = t == 0 ? 4 : 2;  // A(i, j) or A(j, i)
    if (g_inline) {                         // --inline: A's body in place, as a MIR inlining pass would emit it
      a.op(OP_ADD_I32, 8, i, j); a.op(OP_ADDI_I32, 9, 8, 0, 1); a.op(OP_MUL_I32, 9, 8, 9);
      a.op(OP_I2F, ACC, 9); a.op(OP_DIVK_F64, ACC, ACC, 2); a.op(OP_I2F, 10, i); a.op(OP_ADD_F64, ACC, ACC, 10);
      a.op(OP_ADDK_F64, ACC, ACC, 1); a.op(OP_KDIV_F64, 6, ACC, 1);
    } else { a.op(OP_MOV, 6, i); a.op(OP_MOV, 7, j); a.op(OP_CALL, 6, 0, 0, 1); }
    a.op(OP_AGET_F64, ACC, 0, 4); a.op(OP_MUL_F64, ACC, 6, ACC); a.op(OP_ADD_F64, 3, 3, ACC);  // sum += A * x[j]
    a.loopEnd(4, 5, lj);
    a.op(OP_ASET_F64, 1, 2, 3);
    a.loopEnd(2, 5, li);
    a.op(OP_RET, 0);
  }
  { Asm a(p.fns[4], 6);                     // timesAtA(x: r0, out: r1)
    a.op(OP_LOADI, 3, 0, 0, 1000); a.op(OP_NEWARR_F64, 2, 3);
    a.op(OP_MOV, 4, 0); a.op(OP_MOV, 5, 2); a.op(OP_CALL, 4, 0, 0, 2);
    a.op(OP_MOV, 4, 2); a.op(OP_MOV, 5, 1); a.op(OP_CALL, 4, 0, 0, 3);
    a.op(OP_DROP_ARR, 2); a.op(OP_RET, 0); }
  { Asm a(p.fns[0], 14);
    int lf = a.label(), lit = a.label(), l2 = a.label();
    a.op(OP_LOADI, 0, 0, 0, 1000); a.op(OP_NEWARR_F64, 1, 0); a.op(OP_NEWARR_F64, 2, 0);
    a.op(OP_LOADI, 3, 0, 0, 0); a.op(OP_LOADK, 4, 0, 0, 1);
    a.bind(lf); a.op(OP_ASET_F64, 1, 3, 4); a.loopEnd(3, 0, lf);
    a.op(OP_LOADI, 5, 0, 0, 0); a.op(OP_LOADI, 6, 0, 0, 10);
    a.bind(lit);
    a.op(OP_MOV, 8, 1); a.op(OP_MOV, 9, 2); a.op(OP_CALL, 8, 0, 0, 4);
    a.op(OP_MOV, 8, 2); a.op(OP_MOV, 9, 1); a.op(OP_CALL, 8, 0, 0, 4);
    a.loopEnd(5, 6, lit);
    a.op(OP_LOADK, 10, 0, 0, 0); a.op(OP_LOADK, 11, 0, 0, 0); a.op(OP_LOADI, 3, 0, 0, 0);
    a.bind(l2);
    a.op(OP_AGET_F64, 12, 1, 3); a.op(OP_AGET_F64, 13, 2, 3);
    a.op(OP_MUL_F64, ACC, 12, 13); a.op(OP_ADD_F64, 10, 10, ACC);
    a.op(OP_MUL_F64, ACC, 13, 13); a.op(OP_ADD_F64, 11, 11, ACC);
    a.loopEnd(3, 0, l2);
    a.op(OP_DIV_F64, ACC, 10, 11); a.op(OP_SQRT_F64, 10, ACC); a.op(OP_HALT, 10); }
}

// nbody host side: bodies, offsetMomentum(), energy() (native, one-shot)
static Obj g_bodies[5];
static ArrP g_barr;
static void* g_bptr[5];
static void nbody_setup(Program& p) {
  const double PI = 3.141592653589793, SM = 4 * PI * PI, DPY = 365.24;
  const double init[5][7] = {
    {0, 0, 0, 0, 0, 0, SM},
    {4.84143144246472090e+00, -1.16032004402742839e+00, -1.03622044471123109e-01, 1.66007664274403694e-03 * DPY, 7.69901118419740425e-03 * DPY, -6.90460016972063023e-05 * DPY, 9.54791938424326609e-04 * SM},
    {8.34336671824457987e+00, 4.12479856412430479e+00, -4.03523417114321381e-01, -2.76742510726862411e-03 * DPY, 4.99852801234917238e-03 * DPY, 2.30417297573763929e-05 * DPY, 2.85885980666130812e-04 * SM},
    {1.28943695621391310e+01, -1.51111514016986312e+01, -2.23307578892655734e-01, 2.96460137564761618e-03 * DPY, 2.37847173959480950e-03 * DPY, -2.96589568540237556e-05 * DPY, 4.36624404335156298e-05 * SM},
    {1.53796971148509165e+01, -2.59193146099879641e+01, 1.79258772950371181e-01, 2.68067772490389322e-03 * DPY, 1.62824170038242295e-03 * DPY, -9.51592254519715870e-05 * DPY, 5.15138902046611451e-05 * SM},
  };
  for (int i = 0; i < 5; i++) { g_bodies[i] = Obj{nullptr, 1, 0, {}}; memcpy(g_bodies[i].f, init[i], sizeof init[i]); g_bptr[i] = &g_bodies[i]; }
  double px = 0, py = 0, pz = 0;
  for (auto& b : g_bodies) { px += b.f[3] * b.f[6]; py += b.f[4] * b.f[6]; pz += b.f[5] * b.f[6]; }
  g_bodies[0].f[3] = -px / SM; g_bodies[0].f[4] = -py / SM; g_bodies[0].f[5] = -pz / SM;
  g_barr = ArrP{1, 5, 5, g_bptr};
  p.G.resize(1); p.G[0].p = &g_barr;
}
static double nbody_energy() {
  double e = 0;
  for (int i = 0; i < 5; i++) {
    const double* bi = g_bodies[i].f;
    e += 0.5 * bi[6] * (bi[3] * bi[3] + bi[4] * bi[4] + bi[5] * bi[5]);
    for (int j = i + 1; j < 5; j++) {
      const double* bj = g_bodies[j].f;
      double dx = bi[0] - bj[0], dy = bi[1] - bj[1], dz = bi[2] - bj[2];
      e -= (bi[6] * bj[6]) / __builtin_sqrt(dx * dx + dy * dy + dz * dz);
    }
  }
  return e;
}

int main(int argc, char** argv) {
  if (argc < 3) { fprintf(stderr, "usage: vm <fib|mandelbrot|nbody|spectralnorm> <switch|goto|goto-direct|tail|tail-acc> [--nofuse] [--inline]\n"); return 2; }
  const char* kn = argv[1];
  const char* st = argv[2];
  for (int i = 3; i < argc; i++) { if (!strcmp(argv[i], "--nofuse")) g_fuse = false; if (!strcmp(argv[i], "--inline")) g_inline = true; }
  Program p;
  if (!strcmp(kn, "fib")) k_fib(p);
  else if (!strcmp(kn, "mandelbrot")) k_mandelbrot(p);
  else if (!strcmp(kn, "nbody")) { k_nbody(p); nbody_setup(p); }
  else if (!strcmp(kn, "spectralnorm")) k_spectralnorm(p);
  else { fprintf(stderr, "unknown kernel %s\n", kn); return 2; }

  bool acc = !strcmp(st, "tail-acc") || !strncmp(st, "jit", 3), tail = !strcmp(st, "tail-acc") || !strcmp(st, "tail"), direct = !strcmp(st, "goto-direct");
  run_goto_direct(nullptr, nullptr, nullptr);  // exports the label table
  for (Fn& f : p.fns) { resolveAcc(f, acc); if (tail || direct) predecode(f, tail); }

  static Reg stack[1 << 16];
  static Frame frames[4096];
  VM vm{p.K.data(), p.G.data(), p.fns.data(), frames, frames + 4096, stack + (1 << 16), {}};
  if (!strcmp(st, "switch")) run_switch(&vm, p.fns[0].raw.data(), stack);
  else if (!strcmp(st, "goto")) run_goto(&vm, p.fns[0].raw.data(), stack);
  else if (direct) run_goto_direct(&vm, p.fns[0].dec.data(), stack);
  else if (tail) { const Ins* ip = p.fns[0].dec.data(); ((Handler)ip->h)(ip, stack, 0, 0.0, &vm); }
#if defined(__APPLE__) && defined(__aarch64__)
  else if (!strncmp(st, "jit", 3)) {
    size_t bytes;
    auto t0 = std::chrono::steady_clock::now();
    JitFn fn = jit_compile(p.fns[0], !strcmp(st, "jit-pin"), &bytes);
    auto t1 = std::chrono::steady_clock::now();
    fn(stack, p.K.data());
    fprintf(stderr, "jit: %zu bytes of code for %zu bytecodes, compiled in %.1f us\n", bytes, p.fns[0].raw.size(),
            std::chrono::duration<double, std::micro>(t1 - t0).count());
    vm.result = stack[0];
  }
#endif
  else { fprintf(stderr, "unknown strategy %s\n", st); return 2; }

  if (!strcmp(kn, "fib")) printf("%d\n", vm.result.w);
  else if (!strcmp(kn, "mandelbrot")) printf("%.0f\n", vm.result.f);
  else if (!strcmp(kn, "nbody")) printf("%.9f\n", nbody_energy());
  else printf("%.9f\n", vm.result.f);
  return 0;
}
