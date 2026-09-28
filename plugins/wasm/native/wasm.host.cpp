// zinc:wasm for macos / linux / rpi1 / rmpp: WebAssembly through the wasm3 interpreter (vendor/wasm3, MIT, compiled as
// C next to the program). One wasm3 runtime per instance; modules keep their bytes so each instance parses a fresh
// copy (wasm3 binds a parsed module to one runtime). Host imports go through one raw-function trampoline that calls
// the Zinc callback with the arguments as doubles.
#include "zinc_native_wasm.h"
extern "C" {
#include "../vendor/wasm3/wasm3.h"
#include "../vendor/wasm3/m3_env.h"
}
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include <math.h>

static const int MAXM = 64, MAXI = 64;
struct Mod { uint8_t* bytes; uint32_t n; bool used; };
struct Inst { IM3Runtime rt; IM3Module mod; uint8_t* bytes; bool used; };
static Mod mods[MAXM];
static Inst insts[MAXI];
static IM3Environment env = nullptr;
static char err_msg[512];
static bool call_failed = false;
static zrt::Fn<double(int32_t, zrt::Array<double>)> host_cb;

static zrt::String str(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }
struct CStr { zrt::StrBuilder sb; CStr(const zrt::String& s) { zrt::to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };
/** wasm3's messages, in the spelling shared with the sim (V8's are mapped there). */
static void set_err(const char* e) {
  if (!e) e = "unknown error";
  if (!strncmp(e, "[trap] ", 7)) e += 7;
  if (!strcmp(e, "unreachable executed")) e = "unreachable";
  snprintf(err_msg, sizeof err_msg, "%s", e);
}
static Inst* inst_at(int32_t h) { return h >= 0 && h < MAXI && insts[h].used ? &insts[h] : nullptr; }

// arguments and results of a host import live in wasm3 stack slots (results first)
static m3ApiRawFunction(trampoline) {
  int32_t id = (int32_t)(intptr_t)_ctx->userdata;
  IM3Function f = _ctx->function;
  uint32_t nret = m3_GetRetCount(f), narg = m3_GetArgCount(f);
  uint64_t* args = _sp + nret;
  zrt::Array<double> a = zrt::Array<double>::with_cap((int32_t)narg);
  for (uint32_t i = 0; i < narg; i++) {
    M3ValueType t = m3_GetArgType(f, i);
    double v = t == c_m3Type_i32 ? (double)*(int32_t*)&args[i] : t == c_m3Type_i64 ? (double)*(int64_t*)&args[i]
      : t == c_m3Type_f32 ? (double)*(float*)&args[i] : *(double*)&args[i];
    a.push(v);
  }
  if (!host_cb) m3ApiTrap("zinc: host function called after teardown");
  auto cb = host_cb;
  double r = cb(id, a);
  if (zrt::g_err.p) { zrt::Ref<zrt::Error> e = zrt::take_error(); static char buf[256]; zrt::StrBuilder sb; zrt::to_s(sb, e->message); sb.ch('\0'); snprintf(buf, sizeof buf, "host function threw: %s", sb.buf); m3ApiTrap(buf); }
  if (nret) {
    M3ValueType t = m3_GetRetType(f, 0);
    if (t == c_m3Type_i32) *(int32_t*)_sp = (int32_t)(int64_t)r;
    else if (t == c_m3Type_i64) *(int64_t*)_sp = (int64_t)r;
    else if (t == c_m3Type_f32) *(float*)_sp = (float)r;
    else *(double*)_sp = r;
  }
  m3ApiSuccess();
}

struct HostWasm : NativeWasm {
  int32_t compile(zrt::Array<uint8_t> bytes) override {
    if (!env) env = m3_NewEnvironment();
    int h = 0;
    while (h < MAXM && mods[h].used) h++;
    if (h == MAXM) { set_err("too many modules"); return -1; }
    uint32_t n = (uint32_t)bytes.length();
    uint8_t* b = (uint8_t*)malloc(n ? n : 1);
    if (n) memcpy(b, bytes.a->data, n);
    IM3Module m = nullptr;
    M3Result r = m3_ParseModule(env, &m, b, n);
    if (r) { set_err(r); ::free(b); return -1; }
    m3_FreeModule(m);
    mods[h] = Mod{b, n, true};
    return h;
  }
  zrt::String imports(int32_t) override { return zrt::String(); }  // parsed by index.ts
  zrt::String exports(int32_t) override { return zrt::String(); }
  int32_t instantiate(int32_t m) override {
    if (m < 0 || m >= MAXM || !mods[m].used) { set_err("module is gone"); return -1; }
    int h = 0;
    while (h < MAXI && insts[h].used) h++;
    if (h == MAXI) { set_err("too many instances"); return -1; }
    uint8_t* b = (uint8_t*)malloc(mods[m].n ? mods[m].n : 1);
    memcpy(b, mods[m].bytes, mods[m].n);
    IM3Runtime rt = m3_NewRuntime(env, 64 * 1024, nullptr);
    IM3Module mod = nullptr;
    M3Result r = m3_ParseModule(env, &mod, b, mods[m].n);
    if (!r) { r = m3_LoadModule(rt, mod); if (r) m3_FreeModule(mod); }
    if (r) { set_err(r); m3_FreeRuntime(rt); ::free(b); return -1; }
    insts[h] = Inst{rt, mod, b, true};
    return h;
  }
  bool linkImport(int32_t h, zrt::String module, zrt::String name, int32_t id) override {
    Inst* x = inst_at(h);
    if (!x) return false;
    CStr mo(module), na(name);
    M3Result r = m3_LinkRawFunctionEx(x->mod, mo.c(), na.c(), nullptr, trampoline, (void*)(intptr_t)id);
    if (r) { set_err(r); return false; }
    return true;
  }
  bool start(int32_t h) override {
    Inst* x = inst_at(h);
    if (!x) { set_err("instance is gone"); return false; }
    for (uint32_t i = 0; i < x->mod->numFunctions; i++) {
      M3Function& f = x->mod->functions[i];
      if (f.import.moduleUtf8 && !f.compiled) { snprintf(err_msg, sizeof err_msg, "import %s.%s is not provided", f.import.moduleUtf8, f.import.fieldUtf8); return false; }
    }
    M3Result r = m3_RunStart(x->mod);
    if (r) { set_err(r); return false; }
    return true;
  }
  double call(int32_t h, zrt::String name, zrt::Array<double> args) override {
    call_failed = false;
    Inst* x = inst_at(h);
    if (!x) { set_err("instance is gone"); call_failed = true; return NAN; }
    CStr n(name);
    IM3Function f = nullptr;
    M3Result r = m3_FindFunction(&f, x->rt, n.c());
    if (r) { snprintf(err_msg, sizeof err_msg, "no exported function %s", n.c()); call_failed = true; return NAN; }
    uint32_t narg = m3_GetArgCount(f);
    if ((uint32_t)args.length() != narg) { snprintf(err_msg, sizeof err_msg, "%s takes %u arguments", n.c(), narg); call_failed = true; return NAN; }
    union Slot { int32_t i; int64_t l; float f; double d; };
    Slot vals[32]; const void* ptrs[32];
    if (narg > 32) { set_err("too many arguments"); call_failed = true; return NAN; }
    for (uint32_t i = 0; i < narg; i++) {
      M3ValueType t = m3_GetArgType(f, i);
      double v = args.get((int32_t)i);
      if (t == c_m3Type_i32) vals[i].i = (int32_t)(int64_t)v; else if (t == c_m3Type_i64) vals[i].l = (int64_t)v;
      else if (t == c_m3Type_f32) vals[i].f = (float)v; else vals[i].d = v;
      ptrs[i] = &vals[i];
    }
    r = m3_Call(f, narg, ptrs);
    if (r) { set_err(r); call_failed = true; return NAN; }
    if (!m3_GetRetCount(f)) return 0;
    Slot out; const void* op[1] = {&out};
    m3_GetResults(f, 1, op);
    M3ValueType t = m3_GetRetType(f, 0);
    return t == c_m3Type_i32 ? (double)out.i : t == c_m3Type_i64 ? (double)out.l : t == c_m3Type_f32 ? (double)out.f : out.d;
  }
  bool failed() override { return call_failed; }
  int32_t argCount(int32_t h, zrt::String name) override {
    Inst* x = inst_at(h);
    if (!x) return -1;
    CStr n(name);
    IM3Function f = nullptr;
    return m3_FindFunction(&f, x->rt, n.c()) ? -1 : (int32_t)m3_GetArgCount(f);
  }
  int32_t memorySize(int32_t h) override { Inst* x = inst_at(h); return x ? (int32_t)m3_GetMemorySize(x->rt) : 0; }
  zrt::Array<uint8_t> memoryRead(int32_t h, int32_t off, int32_t n) override {
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap(n > 0 ? n : 0);
    Inst* x = inst_at(h);
    uint32_t size = 0;
    uint8_t* mem = x ? m3_GetMemory(x->rt, &size, 0) : nullptr;
    if (!mem || off < 0 || n < 0 || (uint64_t)off + (uint64_t)n > size) { set_err("out of bounds memory access"); return r; }
    if (n) { memcpy(r.a->data, mem + off, (size_t)n); r.a->len = n; }
    return r;
  }
  bool memoryWrite(int32_t h, int32_t off, zrt::Array<uint8_t> data) override {
    Inst* x = inst_at(h);
    uint32_t size = 0;
    uint8_t* mem = x ? m3_GetMemory(x->rt, &size, 0) : nullptr;
    int32_t n = data.length();
    if (!mem || off < 0 || (uint64_t)off + (uint64_t)n > size) { set_err("out of bounds memory access"); return false; }
    if (n) memcpy(mem + off, data.a->data, (size_t)n);
    return true;
  }
  double globalGet(int32_t h, zrt::String name) override {
    Inst* x = inst_at(h);
    if (!x) return NAN;
    CStr n(name);
    IM3Global g = m3_FindGlobal(x->mod, n.c());
    if (!g) return NAN;
    M3TaggedValue v;
    if (m3_GetGlobal(g, &v)) return NAN;
    return v.type == c_m3Type_i32 ? (double)v.value.i32 : v.type == c_m3Type_i64 ? (double)v.value.i64 : v.type == c_m3Type_f32 ? (double)v.value.f32 : v.value.f64;
  }
  void free(int32_t h) override { Inst* x = inst_at(h); if (!x) return; m3_FreeRuntime(x->rt); ::free(x->bytes); *x = Inst{}; }
  zrt::String error() override { return str(err_msg); }
  void onImport(zrt::Fn<double(int32_t, zrt::Array<double>)> cb) override { host_cb = cb; }
};

NativeWasm* zinc_create_Wasm() {
  static HostWasm inst;
  inst.rc = zrt::IMMORTAL;
  zrt::at_finish([] {
    host_cb = nullptr;
    for (Inst& x : insts) if (x.used) { m3_FreeRuntime(x.rt); ::free(x.bytes); x = Inst{}; }
    for (Mod& m : mods) if (m.used) { ::free(m.bytes); m = Mod{}; }
    if (env) { m3_FreeEnvironment(env); env = nullptr; }
  });
  return &inst;
}
