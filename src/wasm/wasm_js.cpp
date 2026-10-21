// WebAssembly for an engine that has none (ZN-773.06, docs/reports/js-engines-jsc-v8.md section 5): QuickJS-ng. WAMR's fast interpreter
// (third_party/wamr) under the WebAssembly JavaScript API, ported from txiki.js (src/wasm.c and src/js/polyfills/wasm.js, MIT,
// Copyright (c) 2019-present Saul Ibarra Corretge) from the QuickJS API to Node-API. It is a module beside zinc (libzn_wasm, the `wasm` pack,
// `zinc engine install wasm`) that zinc opens the first time a program reads `WebAssembly` (src/main.cpp wasmGlobal); its napi_* go through
// the engine's tables (napi_trampoline.cpp), so one build runs on any engine that fills them.
// What differs from txiki: imports belong to the instance (every function import is one trampoline that finds the instance's own JS function
// by its index), an exported function is a native function bound to its WAMR function (no lookup by name per call), i64 is always a BigInt,
// the errors are WebAssembly.CompileError / LinkError / RuntimeError made here, and an instance lives as long as a buffer of its memory does.
//
// txiki.js's licence, for the parts of this file and of wasm_api.js.inc ported from it:
//   Copyright (c) 2019-present Saul Ibarra Corretge <s@saghul.net>
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the
//   "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish,
//   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to
//   the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions
//   of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
//   LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
//   CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
#include "zn/napi_table.h"

#include <wasm_export.h>
#include "wasm.h"           // WAMR's internals, as txiki uses them: a module's import records, an instance's functions and tables
#include "wasm_runtime.h"

#include <cstring>
#include <string>
#include <vector>

namespace zn::wasm {
extern const zn_napi_table* gNapi;
extern const zn_napi_table_ext* gNapiExt;
}

namespace {
constexpr uint32_t kStack = 512 * 1024;   // the wasm stack of an instance (txiki's)
constexpr uint32_t kMaxArgs = 32;
constexpr const char* kWasm =   // the JavaScript half: the classes of the API over the functions below
#include "wasm_api.js.inc"
    ;

struct Ctx { napi_ref compileError = nullptr, linkError = nullptr, runtimeError = nullptr; };   // per context: its WebAssembly's errors

enum Kind { kModule = 0x6d6f64, kInstance = 0x696e73 };
struct Module {
  int kind = kModule;
  wasm_module_t module = nullptr;
  std::vector<uint8_t> bytes;   // WAMR reads the module in place until it is unloaded
  bool linked = false;          // its function imports point at the trampoline
};

struct Instance {   // freed when its handle and every buffer of its memory are gone
  int kind = kInstance;
  napi_env env = nullptr;
  Ctx* ctx = nullptr;
  napi_ref module = nullptr;       // WAMR needs the module until the instance is gone
  wasm_module_inst_t inst = nullptr;
  wasm_exec_env_t exec = nullptr;
  std::vector<napi_ref> imports;   // the JS function of each function import, by import index
  std::vector<napi_ref> externrefs;   // ponytail: every externref that crosses stays alive with the instance; a free list if a program streams them
  napi_ref pending = nullptr;      // what an imported function threw, thrown again when the wasm call returns
  napi_ref buffer = nullptr;       // memory.buffer, detached when the memory moves or grows
  void* bufferData = nullptr;
  size_t bufferSize = 0;
  std::vector<struct Fn*> fns;     // the exported functions made (each keeps the instance's handle alive: wasm_api.js)
  int refs = 1;
};
Instance* gInstantiating = nullptr;   // the start function runs inside wasm_runtime_instantiate, before the exec env has its user data

struct Fn {   // an exported function: the native function's data
  Instance* i;
  wasm_function_inst_t f;
  uint32_t pc, rc;
  wasm_valkind_t pt[kMaxArgs], rt[kMaxArgs];
};

// ---- small helpers

napi_value undefined(napi_env env) { napi_value v; napi_get_undefined(env, &v); return v; }
napi_value null(napi_env env) { napi_value v; napi_get_null(env, &v); return v; }
napi_value string(napi_env env, const char* s) { napi_value v; napi_create_string_utf8(env, s, NAPI_AUTO_LENGTH, &v); return v; }
napi_value u32(napi_env env, uint32_t n) { napi_value v; napi_create_uint32(env, n, &v); return v; }
std::string text(napi_env env, napi_value v) {
  size_t n = 0;
  if (napi_get_value_string_utf8(env, v, nullptr, 0, &n) != napi_ok) return {};
  std::string s(n, '\0');
  napi_get_value_string_utf8(env, v, s.data(), n + 1, &n);
  return s;
}
napi_value fail(napi_env env, napi_ref ctor, const char* msg) {
  napi_value c, m = string(env, msg), e;
  napi_get_reference_value(env, ctor, &c);
  if (napi_new_instance(env, c, 1, &m, &e) == napi_ok) napi_throw(env, e);
  return nullptr;
}
napi_value typeError(napi_env env, const char* msg) { napi_throw_type_error(env, nullptr, msg); return nullptr; }

struct Call {
  napi_value argv[8];
  size_t argc = 8;
  Ctx* ctx = nullptr;
  Call(napi_env env, napi_callback_info info) {
    void* data;
    napi_get_cb_info(env, info, &argc, argv, nullptr, &data);
    ctx = static_cast<Ctx*>(data);
    for (size_t k = argc; k < 8; k++) argv[k] = undefined(env);
  }
};
template <class T>
T* unwrap(napi_env env, napi_value v, int kind) {
  void* p = nullptr;
  if (napi_unwrap(env, v, &p) != napi_ok || !p || *static_cast<int*>(p) != kind) { typeError(env, "not a WebAssembly handle"); return nullptr; }
  return static_cast<T*>(p);
}

void release(Instance* i) {
  if (--i->refs) return;
  if (i->exec) wasm_runtime_destroy_exec_env(i->exec);
  if (i->inst) wasm_runtime_deinstantiate(i->inst);
  for (napi_ref r : i->imports) napi_delete_reference(i->env, r);
  for (napi_ref r : i->externrefs) napi_delete_reference(i->env, r);
  for (Fn* f : i->fns) delete f;
  if (i->pending) napi_delete_reference(i->env, i->pending);
  napi_delete_reference(i->env, i->module);
  delete i;
}

// A buffer of the memory is an external ArrayBuffer over WAMR's bytes: detached as soon as they move or grow, so a view never reads freed memory.
void dropBuffer(Instance* i) {
  if (!i->buffer) return;
  napi_value b;
  napi_get_reference_value(i->env, i->buffer, &b);
  if (b) napi_detach_arraybuffer(i->env, b);
  napi_delete_reference(i->env, i->buffer);
  i->buffer = nullptr;
}
void dropBufferIfMoved(Instance* i) {
  if (!i->buffer) return;
  wasm_memory_inst_t mem = wasm_runtime_get_default_memory(i->inst);
  if (!mem || wasm_memory_get_base_address(mem) != i->bufferData ||
      wasm_memory_get_cur_page_count(mem) * wasm_memory_get_bytes_per_page(mem) != i->bufferSize)
    dropBuffer(i);
}

// externref: a JS value boxed in the instance; WAMR keeps the key (slot + 1)
bool box(Instance* i, napi_env env, napi_value v, void** key) {
  napi_valuetype t;
  napi_typeof(env, v, &t);
  if (t == napi_null) { *key = nullptr; return true; }
  napi_ref r;
  napi_create_reference(env, v, 1, &r);
  i->externrefs.push_back(r);
  *key = reinterpret_cast<void*>(static_cast<uintptr_t>(i->externrefs.size()));
  return true;
}
napi_value unbox(Instance* i, napi_env env, void* key) {
  const uintptr_t slot = reinterpret_cast<uintptr_t>(key);
  if (!slot || slot > i->externrefs.size()) return null(env);
  napi_value v;
  napi_get_reference_value(env, i->externrefs[slot - 1], &v);
  return v;
}
napi_value unboxIndex(Instance* i, napi_env env, uint32_t idx) {
  void* key = nullptr;
  if (idx == static_cast<uint32_t>(NULL_REF) || !wasm_externref_ref2obj(idx, &key)) return null(env);
  return unbox(i, env, key);
}
bool boxIndex(Instance* i, napi_env env, napi_value v, uint32_t* idx) {
  void* key;
  box(i, env, v, &key);
  if (!key) { *idx = static_cast<uint32_t>(NULL_REF); return true; }
  return wasm_externref_obj2ref(i->inst, key, idx);
}

// ToWebAssemblyValue for the number types; false with a pending exception
bool toNumber(napi_env env, napi_value v, double* d) {
  napi_valuetype t;
  napi_typeof(env, v, &t);
  if (t != napi_number && napi_coerce_to_number(env, v, &v) != napi_ok) return false;
  return napi_get_value_double(env, v, d) == napi_ok;
}
bool toI32(napi_env env, napi_value v, int32_t* r) {
  napi_valuetype t;
  napi_typeof(env, v, &t);
  if (t != napi_number && napi_coerce_to_number(env, v, &v) != napi_ok) return false;
  return napi_get_value_int32(env, v, r) == napi_ok;
}
bool toI64(napi_env env, napi_value v, int64_t* r) {
  napi_valuetype t;
  napi_typeof(env, v, &t);
  if (t != napi_bigint) { typeError(env, "a WebAssembly i64 takes a BigInt"); return false; }
  bool lossless;
  return napi_get_value_bigint_int64(env, v, r, &lossless) == napi_ok;
}
napi_value fromI64(napi_env env, int64_t n) { napi_value v; napi_create_bigint_int64(env, n, &v); return v; }
napi_value fromDouble(napi_env env, double n) { napi_value v; napi_create_double(env, n, &v); return v; }
napi_value fromI32(napi_env env, int32_t n) { napi_value v; napi_create_int32(env, n, &v); return v; }

// ---- calls between JS and wasm

// Every function import of a module points here; the attachment is the import's index, the exec env's user data the instance.
void importTrampoline(wasm_exec_env_t exec, uint64_t* args) {
  auto* i = static_cast<Instance*>(wasm_runtime_get_user_data(exec));
  if (!i) i = gInstantiating;
  wasm_module_inst_t inst = wasm_runtime_get_module_inst(exec);
  const auto index = static_cast<uint32_t>(reinterpret_cast<uintptr_t>(wasm_runtime_get_function_attachment(exec)));
  const WASMModule* m = reinterpret_cast<WASMModuleInstance*>(inst)->module;
  const WASMFuncType* type = m->import_functions[index].u.function.func_type;
  napi_env env = i->env;
  napi_handle_scope scope;
  napi_open_handle_scope(env, &scope);
  napi_value argv[kMaxArgs];
  const uint32_t n = type->param_count < kMaxArgs ? type->param_count : kMaxArgs;
  for (uint32_t k = 0; k < n; k++) {
    switch (type->types[k]) {
      case VALUE_TYPE_I32: argv[k] = fromI32(env, static_cast<int32_t>(args[k])); break;
      case VALUE_TYPE_I64: argv[k] = fromI64(env, static_cast<int64_t>(args[k])); break;
      case VALUE_TYPE_F32: { float f; uint32_t b = static_cast<uint32_t>(args[k]); std::memcpy(&f, &b, 4); argv[k] = fromDouble(env, f); break; }
      case VALUE_TYPE_F64: { double d; std::memcpy(&d, &args[k], 8); argv[k] = fromDouble(env, d); break; }
      default: argv[k] = null(env);   // ponytail: externref/funcref arguments of an import arrive as null (WAMR's raw calls pass no externref, see txiki)
    }
  }
  napi_value fn, ret;
  napi_get_reference_value(env, i->imports[index], &fn);
  bool ok = napi_call_function(env, undefined(env), fn, n, argv, &ret) == napi_ok;
  if (ok && type->result_count) {
    switch (type->types[type->param_count]) {
      case VALUE_TYPE_I32: { int32_t r; ok = toI32(env, ret, &r); args[0] = static_cast<uint32_t>(r); break; }
      case VALUE_TYPE_I64: { int64_t r; ok = toI64(env, ret, &r); args[0] = static_cast<uint64_t>(r); break; }
      case VALUE_TYPE_F32: { double d; ok = toNumber(env, ret, &d); float f = static_cast<float>(d); uint32_t b; std::memcpy(&b, &f, 4); args[0] = b; break; }
      case VALUE_TYPE_F64: { double d; ok = toNumber(env, ret, &d); std::memcpy(&args[0], &d, 8); break; }
      default: args[0] = static_cast<uint32_t>(NULL_REF);
    }
  }
  if (!ok) {
    napi_value e;
    napi_get_and_clear_last_exception(env, &e);
    if (i->pending) napi_delete_reference(env, i->pending);
    napi_create_reference(env, e, 1, &i->pending);
    wasm_runtime_set_exception(inst, "imported function threw");
  }
  napi_close_handle_scope(env, scope);
}

// After a call into wasm: true when it returned; false with the exception thrown (what an import threw, or a RuntimeError for a trap)
bool afterCall(napi_env env, Instance* i, bool ok, const char* trap = nullptr) {
  if (i->inst) dropBufferIfMoved(i);   // `memory.grow` may have run inside the call
  if (ok) return true;
  if (i->pending) {
    napi_value e;
    napi_get_reference_value(env, i->pending, &e);
    napi_delete_reference(env, i->pending);
    i->pending = nullptr;
    if (i->inst) wasm_runtime_clear_exception(i->inst);
    napi_throw(env, e);
    return false;
  }
  const char* ex = trap ? trap : wasm_runtime_get_exception(i->inst);
  std::string msg = ex ? ex : "call failed";
  if (msg.rfind("Exception: ", 0) == 0) msg.erase(0, 11);
  if (i->inst) wasm_runtime_clear_exception(i->inst);
  fail(env, i->ctx->runtimeError, msg.c_str());
  return false;
}

napi_value callExport(napi_env env, napi_callback_info info) {
  size_t argc = kMaxArgs;
  napi_value argv[kMaxArgs];
  void* data;
  napi_get_cb_info(env, info, &argc, argv, nullptr, &data);
  const Fn* fn = static_cast<Fn*>(data);
  Instance* i = fn->i;
  wasm_val_t params[kMaxArgs], results[kMaxArgs];
  for (uint32_t k = 0; k < fn->pc; k++) {
    napi_value v = k < argc ? argv[k] : undefined(env);
    wasm_val_t& p = params[k];
    p.kind = fn->pt[k];
    switch (fn->pt[k]) {
      case WASM_I32: if (!toI32(env, v, &p.of.i32)) return nullptr; break;
      case WASM_I64: if (!toI64(env, v, &p.of.i64)) return nullptr; break;
      case WASM_F32: { double d; if (!toNumber(env, v, &d)) return nullptr; p.of.f32 = static_cast<float>(d); break; }
      case WASM_F64: if (!toNumber(env, v, &p.of.f64)) return nullptr; break;
      case WASM_EXTERNREF: { void* key; box(i, env, v, &key); p.of.foreign = reinterpret_cast<uintptr_t>(key); break; }
      case WASM_FUNCREF: {
        napi_valuetype t;
        napi_typeof(env, v, &t);
        if (t != napi_null) return typeError(env, "a funcref argument from JavaScript must be null here");   // ponytail: only null crosses
        p.of.i32 = static_cast<int32_t>(NULL_REF);
        break;
      }
      default: return typeError(env, "this WebAssembly type cannot cross to JavaScript");
    }
  }
  if (!afterCall(env, i, wasm_runtime_call_wasm_a(i->exec, fn->f, fn->rc, results, fn->pc, params))) return nullptr;
  auto one = [&](uint32_t k) -> napi_value {
    switch (fn->rt[k]) {
      case WASM_I32: return fromI32(env, results[k].of.i32);
      case WASM_I64: return fromI64(env, results[k].of.i64);
      case WASM_F32: return fromDouble(env, results[k].of.f32);
      case WASM_F64: return fromDouble(env, results[k].of.f64);
      case WASM_EXTERNREF: return unbox(i, env, reinterpret_cast<void*>(results[k].of.foreign));
      default: return null(env);   // ponytail: a funcref result comes back as null; Table.get carries functions
    }
  };
  if (fn->rc == 0) return undefined(env);
  if (fn->rc == 1) return one(0);
  napi_value arr;
  napi_create_array(env, &arr);
  for (uint32_t k = 0; k < fn->rc; k++) napi_set_element(env, arr, k, one(k));
  return arr;
}

// ---- the native side of the JS API (wasm_api.js calls these; each takes the handles it made)

wasm_module_t load(std::vector<uint8_t>& bytes, char* err, uint32_t errSize) {
  LoadArgs args{};
  args.no_resolve = true;
  return wasm_runtime_load_ex(bytes.data(), static_cast<uint32_t>(bytes.size()), &args, err, errSize);
}
bool bytesOf(napi_env env, napi_value v, std::vector<uint8_t>& out) {   // a Uint8Array (wasm_api.js turns a BufferSource into one)
  void* data;
  size_t n;
  napi_typedarray_type t;
  bool is;
  if (napi_is_typedarray(env, v, &is) != napi_ok || !is || napi_get_typedarray_info(env, v, &t, &n, &data, nullptr, nullptr) != napi_ok || t != napi_uint8_array) return false;
  out.assign(static_cast<uint8_t*>(data), static_cast<uint8_t*>(data) + n);
  return true;
}

napi_value jsParseModule(napi_env env, napi_callback_info info) {
  Call c(env, info);
  auto* m = new Module;
  if (!bytesOf(env, c.argv[0], m->bytes)) { delete m; return typeError(env, "WebAssembly.Module(): Argument 0 must be a buffer source"); }
  char err[256] = "";
  if (m->bytes.empty() || !(m->module = load(m->bytes, err, sizeof err))) { delete m; return fail(env, c.ctx->compileError, *err ? err : "empty module"); }
  napi_value h;
  napi_create_object(env, &h);
  napi_wrap(env, h, m, [](napi_env, void* p, void*) { auto* m = static_cast<Module*>(p); if (m->module) wasm_runtime_unload(m->module); delete m; }, nullptr, nullptr);
  return h;
}

napi_value jsValidate(napi_env env, napi_callback_info info) {
  Call c(env, info);
  std::vector<uint8_t> bytes;
  napi_value r;
  if (!bytesOf(env, c.argv[0], bytes)) return typeError(env, "WebAssembly.validate(): Argument 0 must be a buffer source");
  char err[256];
  wasm_module_t m = bytes.empty() ? nullptr : load(bytes, err, sizeof err);
  if (m) wasm_runtime_unload(m);
  napi_get_boolean(env, m != nullptr, &r);
  return r;
}

const char* kindName(wasm_import_export_kind_t k) {
  switch (k) {
    case WASM_IMPORT_EXPORT_KIND_FUNC: return "function";
    case WASM_IMPORT_EXPORT_KIND_TABLE: return "table";
    case WASM_IMPORT_EXPORT_KIND_MEMORY: return "memory";
    default: return "global";
  }
}
const char* valName(wasm_valkind_t k) {
  switch (k) {
    case WASM_I32: return "i32";
    case WASM_I64: return "i64";
    case WASM_F32: return "f32";
    case WASM_F64: return "f64";
    case WASM_V128: return "v128";
    case WASM_EXTERNREF: return "externref";
    default: return "anyfunc";
  }
}

// [{module, name, kind}] (globals add type and mutable), or [{name, kind}] for the exports
napi_value jsModuleExports(napi_env env, napi_callback_info info) {
  Call c(env, info);
  auto* m = unwrap<Module>(env, c.argv[0], kModule);
  if (!m) return nullptr;
  napi_value arr;
  napi_create_array(env, &arr);
  const int32_t n = wasm_runtime_get_export_count(m->module);
  const WASMModule* wm = reinterpret_cast<const WASMModule*>(m->module);
  for (int32_t k = 0; k < n; k++) {
    wasm_export_t exp;
    wasm_runtime_get_export_type(m->module, k, &exp);
    napi_value o;
    napi_create_object(env, &o);
    napi_set_named_property(env, o, "name", string(env, exp.name));
    napi_set_named_property(env, o, "kind", string(env, kindName(exp.kind)));
    napi_set_named_property(env, o, "index", u32(env, wm->exports[k].index));
    napi_set_element(env, arr, static_cast<uint32_t>(k), o);
  }
  return arr;
}

// instantiate(module, functions, globals): the JS function of each function import and the value of each global import, in import order
napi_value jsInstantiate(napi_env env, napi_callback_info info) {
  Call c(env, info);
  auto* m = unwrap<Module>(env, c.argv[0], kModule);
  if (!m) return nullptr;
  WASMModule* wm = reinterpret_cast<WASMModule*>(m->module);
  if (!m->linked) {   // once per module: every function import calls the trampoline with its index; the instance has the function
    for (uint32_t k = 0; k < wm->import_function_count; k++) {
      WASMFunctionImport& f = wm->import_functions[k].u.function;
      f.func_ptr_linked = reinterpret_cast<void*>(importTrampoline);
      f.signature = nullptr;
      f.attachment = reinterpret_cast<void*>(static_cast<uintptr_t>(k));
      f.call_conv_raw = true;
    }
    m->linked = true;
  }
  for (uint32_t k = 0; k < wm->import_global_count; k++) {   // the value is copied into the instance when it is made
    WASMGlobalImport& g = wm->import_globals[k].u.global;
    napi_value v;
    napi_get_element(env, c.argv[2], k, &v);
    switch (g.type.val_type) {
      case VALUE_TYPE_I32: if (!toI32(env, v, &g.global_data_linked.i32)) return nullptr; break;
      case VALUE_TYPE_I64: if (!toI64(env, v, &g.global_data_linked.i64)) return nullptr; break;
      case VALUE_TYPE_F32: { double d; if (!toNumber(env, v, &d)) return nullptr; g.global_data_linked.f32 = static_cast<float>(d); break; }
      case VALUE_TYPE_F64: if (!toNumber(env, v, &g.global_data_linked.f64)) return nullptr; break;
      default: g.global_data_linked.u32 = static_cast<uint32_t>(NULL_REF);   // ponytail: an imported externref/funcref global starts null
    }
    g.is_linked = true;
  }
  auto* i = new Instance;
  i->env = env;
  i->ctx = c.ctx;
  napi_create_reference(env, c.argv[0], 1, &i->module);
  for (uint32_t k = 0; k < wm->import_function_count; k++) {
    napi_value f;
    napi_get_element(env, c.argv[1], k, &f);
    i->imports.emplace_back();
    napi_create_reference(env, f, 1, &i->imports.back());
  }
  char err[256] = "";
  Instance* outer = gInstantiating;
  gInstantiating = i;
  i->inst = wasm_runtime_instantiate(m->module, kStack, 0, err, sizeof err);
  gInstantiating = outer;
  if (!i->inst) {   // a trap in the start function, an exception of an import it called, or a link error
    if (i->pending || !std::strncmp(err, "Exception: ", 11)) afterCall(env, i, false, err);
    else fail(env, c.ctx->linkError, err);
    release(i);
    return nullptr;
  }
  if (!(i->exec = wasm_runtime_create_exec_env(i->inst, kStack))) { release(i); return fail(env, c.ctx->runtimeError, "out of memory"); }
  wasm_runtime_set_user_data(i->exec, i);
  napi_value h;
  napi_create_object(env, &h);
  napi_wrap(env, h, i, [](napi_env env, void* p, void*) {
    auto* i = static_cast<Instance*>(p);
    if (i->buffer) { napi_delete_reference(env, i->buffer); i->buffer = nullptr; }   // the buffer, if JS still holds it, keeps the instance
    release(i);
  }, nullptr, nullptr);
  return h;
}

// func(instance, index): the exported function of that function index, named by it
napi_value jsFunc(napi_env env, napi_callback_info info) {
  Call c(env, info);
  auto* i = unwrap<Instance>(env, c.argv[0], kInstance);
  if (!i) return nullptr;
  uint32_t idx;
  napi_get_value_uint32(env, c.argv[1], &idx);
  auto* mi = reinterpret_cast<WASMModuleInstance*>(i->inst);
  if (idx >= mi->e->function_count) return fail(env, c.ctx->runtimeError, "function index out of bounds");
  auto* fn = new Fn{i, reinterpret_cast<wasm_function_inst_t>(&mi->e->functions[idx]), 0, 0, {}, {}};
  fn->pc = wasm_func_get_param_count(fn->f, i->inst);
  fn->rc = wasm_func_get_result_count(fn->f, i->inst);
  if (fn->pc > kMaxArgs || fn->rc > kMaxArgs) { delete fn; return fail(env, c.ctx->linkError, "too many parameters or results"); }
  wasm_func_get_param_types(fn->f, i->inst, fn->pt);
  wasm_func_get_result_types(fn->f, i->inst, fn->rt);
  const std::string name = std::to_string(idx);
  napi_value f;
  napi_create_function(env, nullptr, 0, callExport, fn, &f);   // named below: Node-API's name is not configurable, a function's is
  i->fns.push_back(fn);
  const napi_property_descriptor props[] = {{"length", nullptr, nullptr, nullptr, nullptr, u32(env, fn->pc), napi_configurable, nullptr},
                                            {"name", nullptr, nullptr, nullptr, nullptr, string(env, name.c_str()), napi_configurable, nullptr}};
  napi_define_properties(env, f, 2, props);
  return f;
}

wasm_memory_inst_t memoryOf(napi_env env, Call& c, Instance** out) {
  auto* i = unwrap<Instance>(env, c.argv[0], kInstance);
  if (!i) return nullptr;
  *out = i;
  wasm_memory_inst_t mem = wasm_runtime_get_default_memory(i->inst);
  if (!mem) fail(env, c.ctx->runtimeError, "no memory");
  return mem;
}
napi_value jsMemoryBuffer(napi_env env, napi_callback_info info) {
  Call c(env, info);
  Instance* i;
  wasm_memory_inst_t mem = memoryOf(env, c, &i);
  if (!mem) return nullptr;
  dropBufferIfMoved(i);
  napi_value b;
  if (i->buffer) { napi_get_reference_value(env, i->buffer, &b); return b; }
  i->bufferData = wasm_memory_get_base_address(mem);
  i->bufferSize = static_cast<size_t>(wasm_memory_get_cur_page_count(mem) * wasm_memory_get_bytes_per_page(mem));
  i->refs++;
  napi_create_external_arraybuffer(env, i->bufferData, i->bufferSize, [](napi_env, void*, void* hint) { release(static_cast<Instance*>(hint)); }, i, &b);
  napi_create_reference(env, b, 1, &i->buffer);
  return b;
}
napi_value jsMemoryGrow(napi_env env, napi_callback_info info) {
  Call c(env, info);
  Instance* i;
  wasm_memory_inst_t mem = memoryOf(env, c, &i);
  if (!mem) return nullptr;
  uint32_t delta;
  napi_get_value_uint32(env, c.argv[1], &delta);
  const auto old = static_cast<uint32_t>(wasm_memory_get_cur_page_count(mem));
  if (delta && !wasm_memory_enlarge(mem, delta)) { napi_throw_range_error(env, nullptr, "WebAssembly.Memory.grow(): Maximum memory size exceeded"); return nullptr; }
  dropBuffer(i);   // a grow, even of 0 pages, detaches the old buffer
  return u32(env, old);
}

bool globalOf(napi_env env, Call& c, Instance** i, wasm_global_inst_t* g) {
  if (!(*i = unwrap<Instance>(env, c.argv[0], kInstance))) return false;
  if (wasm_runtime_get_export_global_inst((*i)->inst, text(env, c.argv[1]).c_str(), g)) return true;
  fail(env, c.ctx->runtimeError, "global not found");
  return false;
}
napi_value jsGlobalInfo(napi_env env, napi_callback_info info) {
  Call c(env, info);
  Instance* i;
  wasm_global_inst_t g;
  if (!globalOf(env, c, &i, &g)) return nullptr;
  napi_value o, mut;
  napi_create_object(env, &o);
  napi_get_boolean(env, g.is_mutable, &mut);
  napi_set_named_property(env, o, "value", string(env, valName(g.kind)));
  napi_set_named_property(env, o, "mutable", mut);
  return o;
}
napi_value jsGlobalGet(napi_env env, napi_callback_info info) {
  Call c(env, info);
  Instance* i;
  wasm_global_inst_t g;
  if (!globalOf(env, c, &i, &g)) return nullptr;
  switch (g.kind) {
    case WASM_I32: { int32_t v; std::memcpy(&v, g.global_data, 4); return fromI32(env, v); }
    case WASM_I64: { int64_t v; std::memcpy(&v, g.global_data, 8); return fromI64(env, v); }
    case WASM_F32: { float v; std::memcpy(&v, g.global_data, 4); return fromDouble(env, v); }
    case WASM_F64: { double v; std::memcpy(&v, g.global_data, 8); return fromDouble(env, v); }
    case WASM_EXTERNREF: { uint32_t v; std::memcpy(&v, g.global_data, 4); return unboxIndex(i, env, v); }
    default: return null(env);
  }
}
napi_value jsGlobalSet(napi_env env, napi_callback_info info) {
  Call c(env, info);
  Instance* i;
  wasm_global_inst_t g;
  if (!globalOf(env, c, &i, &g)) return nullptr;
  if (!g.is_mutable) return typeError(env, "WebAssembly.Global: cannot set the value of an immutable global");
  switch (g.kind) {
    case WASM_I32: { int32_t v; if (!toI32(env, c.argv[2], &v)) return nullptr; std::memcpy(g.global_data, &v, 4); break; }
    case WASM_I64: { int64_t v; if (!toI64(env, c.argv[2], &v)) return nullptr; std::memcpy(g.global_data, &v, 8); break; }
    case WASM_F32: { double d; if (!toNumber(env, c.argv[2], &d)) return nullptr; float v = static_cast<float>(d); std::memcpy(g.global_data, &v, 4); break; }
    case WASM_F64: { double v; if (!toNumber(env, c.argv[2], &v)) return nullptr; std::memcpy(g.global_data, &v, 8); break; }
    case WASM_EXTERNREF: { uint32_t v; if (!boxIndex(i, env, c.argv[2], &v)) return nullptr; std::memcpy(g.global_data, &v, 4); break; }
    default: return typeError(env, "WebAssembly.Global: this type cannot be set from JavaScript");
  }
  return undefined(env);
}

bool tableOf(napi_env env, Call& c, Instance** i, wasm_table_inst_t* t) {
  if (!(*i = unwrap<Instance>(env, c.argv[0], kInstance))) return false;
  if (wasm_runtime_get_export_table_inst((*i)->inst, text(env, c.argv[1]).c_str(), t)) return true;
  fail(env, c.ctx->runtimeError, "table not found");
  return false;
}
napi_value jsTableInfo(napi_env env, napi_callback_info info) {
  Call c(env, info);
  Instance* i;
  wasm_table_inst_t t;
  if (!tableOf(env, c, &i, &t)) return nullptr;
  napi_value o;
  napi_create_object(env, &o);
  napi_set_named_property(env, o, "element", string(env, valName(t.elem_kind)));
  napi_set_named_property(env, o, "length", u32(env, t.cur_size));
  napi_set_named_property(env, o, "maximum", u32(env, t.max_size));
  return o;
}
// tableGet(instance, name, index): a function index (wasm_api.js makes the function), the externref's value, or null
napi_value jsTableGet(napi_env env, napi_callback_info info) {
  Call c(env, info);
  Instance* i;
  wasm_table_inst_t t;
  if (!tableOf(env, c, &i, &t)) return nullptr;
  uint32_t idx;
  napi_get_value_uint32(env, c.argv[2], &idx);
  if (idx >= t.cur_size) { napi_throw_range_error(env, nullptr, "WebAssembly.Table.get(): index out of bounds"); return nullptr; }
  table_elem_type_t e;
  std::memcpy(&e, static_cast<uint8_t*>(t.elems) + idx * sizeof e, sizeof e);
  if (static_cast<uint32_t>(e) == static_cast<uint32_t>(NULL_REF)) return null(env);
  return t.elem_kind == WASM_FUNCREF ? u32(env, static_cast<uint32_t>(e)) : unboxIndex(i, env, static_cast<uint32_t>(e));
}
// tableSet(instance, name, index, value): value is a function index or null for funcref, any value for externref
napi_value jsTableSet(napi_env env, napi_callback_info info) {
  Call c(env, info);
  Instance* i;
  wasm_table_inst_t t;
  if (!tableOf(env, c, &i, &t)) return nullptr;
  uint32_t idx, v = static_cast<uint32_t>(NULL_REF);
  napi_get_value_uint32(env, c.argv[2], &idx);
  if (idx >= t.cur_size) { napi_throw_range_error(env, nullptr, "WebAssembly.Table.set(): index out of bounds"); return nullptr; }
  napi_valuetype ty;
  napi_typeof(env, c.argv[3], &ty);
  if (t.elem_kind == WASM_FUNCREF) { if (ty != napi_null) napi_get_value_uint32(env, c.argv[3], &v); }
  else if (!boxIndex(i, env, c.argv[3], &v)) return nullptr;
  const table_elem_type_t e = v;
  std::memcpy(static_cast<uint8_t*>(t.elems) + idx * sizeof e, &e, sizeof e);
  return undefined(env);
}
// tableGrow(instance, name, delta): the old length, or -1 past the maximum
napi_value jsTableGrow(napi_env env, napi_callback_info info) {
  Call c(env, info);
  auto* i = unwrap<Instance>(env, c.argv[0], kInstance);
  if (!i) return nullptr;
  uint32_t delta;
  napi_get_value_uint32(env, c.argv[2], &delta);
  auto* mi = reinterpret_cast<WASMModuleInstance*>(i->inst);
  const std::string name = text(env, c.argv[1]);
  for (uint32_t k = 0; k < mi->module->export_count; k++) {
    const WASMExport& e = mi->module->exports[k];
    if (e.kind != EXPORT_KIND_TABLE || name != e.name) continue;
    const uint32_t old = mi->tables[e.index]->cur_size;
    napi_value r;
    napi_create_int32(env, wasm_enlarge_table(mi, e.index, delta, static_cast<table_elem_type_t>(NULL_REF)) ? static_cast<int32_t>(old) : -1, &r);
    return r;
  }
  return fail(env, c.ctx->runtimeError, "table not found");
}

// setErrors(CompileError, LinkError, RuntimeError): the classes this context's errors are made from
napi_value jsSetErrors(napi_env env, napi_callback_info info) {
  Call c(env, info);
  napi_create_reference(env, c.argv[0], 1, &c.ctx->compileError);
  napi_create_reference(env, c.argv[1], 1, &c.ctx->linkError);
  napi_create_reference(env, c.argv[2], 1, &c.ctx->runtimeError);
  return undefined(env);
}

bool initRuntime() {
  static const bool ok = [] {
    RuntimeInitArgs a{};
    a.mem_alloc_type = Alloc_With_System_Allocator;
    return wasm_runtime_full_init(&a);
  }();
  return ok;
}
}  // namespace

// The module's one entry: the WebAssembly namespace object for this context, or nullptr with an exception pending.
extern "C" __attribute__((visibility("default"))) napi_value zn_wasm_install(napi_env env, const zn_napi_table* napi, const zn_napi_table_ext* ext) {
  zn::wasm::gNapi = napi;
  zn::wasm::gNapiExt = ext;
  if (!initRuntime()) { napi_throw_type_error(env, nullptr, "WebAssembly: the WAMR runtime did not start"); return nullptr; }
  auto* ctx = new Ctx;   // ponytail: one per context, never freed (a few bytes; contexts live as long as the program)
  static const struct { const char* name; napi_callback cb; } fns[] = {
      {"setErrors", jsSetErrors}, {"parseModule", jsParseModule}, {"validate", jsValidate},
      {"moduleExports", jsModuleExports}, {"instantiate", jsInstantiate}, {"func", jsFunc}, {"memoryBuffer", jsMemoryBuffer},
      {"memoryGrow", jsMemoryGrow}, {"globalInfo", jsGlobalInfo}, {"globalGet", jsGlobalGet}, {"globalSet", jsGlobalSet},
      {"tableInfo", jsTableInfo}, {"tableGet", jsTableGet}, {"tableSet", jsTableSet}, {"tableGrow", jsTableGrow}};
  napi_value native, script, factory, result;
  napi_create_object(env, &native);
  for (const auto& f : fns) {
    napi_value v;
    napi_create_function(env, f.name, NAPI_AUTO_LENGTH, f.cb, ctx, &v);
    napi_set_named_property(env, native, f.name, v);
  }
  napi_create_string_utf8(env, kWasm, NAPI_AUTO_LENGTH, &script);
  if (napi_run_script(env, script, "<webassembly>", &factory) != napi_ok) return nullptr;
  if (napi_call_function(env, undefined(env), factory, 1, &native, &result) != napi_ok) return nullptr;
  return result;
}
