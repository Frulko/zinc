#pragma once

#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wshorten-64-to-32"
#endif
#include <quickjs.h>
#if defined(__clang__)
#pragma clang diagnostic pop
#endif
#include <napi/js_native_api_types.h>
#include "js_native_api_shared.h"
#include <thread>
#include <cassert>
#include <memory>
#include <map>
#include <vector>
#include <deque>

// Reference info for preventing GC. Defined in the header so that both
// the NAPI implementation and env teardown (env_quickjs.cc) can touch it.
struct RefInfo {
  JSValue value;
  uint32_t count;
};

// CallbackInfo struct (zinc: in the header, for napi/inline.h)
struct CallbackInfo {
  napi_value newTarget;
  napi_value thisArg;
  napi_value* argv;
  JSValue* jsargv;   // zinc: the engine's arguments, read in place by napi_get_cb_info (argv unused when set)
  void* data;
  uint16_t argc;
  bool isConstructCall;
};

// zinc: the handles of the open scopes, by value in blocks of 256 (stable addresses, no allocation per value, push is a store)
struct HandleStack {
  static constexpr size_t kBlock = 256;
  std::vector<JSValue*> blocks;
  size_t n = 0;
  JSValue* push(JSValue v) {
    if ((n % kBlock) == 0 && n / kBlock == blocks.size()) blocks.push_back(new JSValue[kBlock]);
    JSValue* p = blocks[n / kBlock] + n % kBlock;
    *p = v;
    ++n;
    return p;
  }
  JSValue& operator[](size_t i) { return blocks[i / kBlock][i % kBlock]; }
  size_t size() const { return n; }
  void resize(size_t m) { n = m; }   // shrinks only: the scopes close in order
  HandleStack() = default;
  HandleStack(const HandleStack&) = delete;
  ~HandleStack() { for (JSValue* b : blocks) delete[] b; }
};

struct napi_env__ {
  JSContext* context = nullptr;
  JSContext* current_context = nullptr;
  napi_extended_error_info last_error{ nullptr, nullptr, 0, napi_ok };
  JSValue has_own_property_function = JS_UNDEFINED;
  napi_shared::PropertyNameIntrinsics property_name_intrinsics{};

  const std::thread::id thread_id{std::this_thread::get_id()};

  // Handle scope storage
  // zinc: the values themselves in a deque (stable addresses, one allocation per 32 values instead of one per value)
  HandleStack handle_scope_stack;
  // zinc: escaped values after their scope closed, with the stack position of the parent scope they now belong to
  std::vector<std::pair<size_t, std::unique_ptr<JSValue>>> escaped_held;
  size_t current_scope_start = 0;

  // One record per open escapable scope, keyed by the opaque token handed to the
  // caller. The token is a monotonic counter rather than a position in
  // handle_scope_stack: two scopes opened with no handle allocated between them
  // occupy the same position, so a position-derived token cannot tell them apart.
  // The escaped handle is held here rather than on handle_scope_stack because
  // inserting into the middle of the stack would shift every entry above it and
  // invalidate the recorded start of any nested scope that is still open.
  // napi_close_escapable_handle_scope pushes it onto the stack once the scope's own
  // handles are gone, at which point it lands in the parent scope and is freed with it.
  struct EscapableScope {
    size_t scope_start;
    std::unique_ptr<JSValue> escaped;
  };
  std::map<size_t, EscapableScope> escapable_scopes;
  size_t next_escapable_scope_token = 0;

  // Tracks every RefInfo* created by napi_create_reference so that
  // pending strong references can be released during Detach. Without
  // this, any napi_ref held by a native object (e.g. a polyfill's
  // Napi::FunctionReference) pins JS values, preventing QuickJS from
  // freeing them during teardown and causing an assertion failure in
  // JS_FreeRuntime.
  std::vector<void*> refs_list;

  // Set to true once Detach has run. Subsequent napi_delete_reference
  // calls (from native destructors running during the JS teardown
  // cascade) must not touch the context or the (already emptied)
  // refs_list.
  bool detached = false;

  // Reference count that keeps the env alive until BOTH Detach has run and
  // every outstanding native finalizer that may still call back into the env
  // has completed. This mirrors the V8 backend's refcounted napi_env__.
  //
  // On QuickJS the wrap/external finalizers are not all driven by Detach: some
  // are deferred to the engine's JS_FreeContext/JS_FreeRuntime teardown cascade
  // which runs *after* Detach returns. Those deferred finalizers (ExternalData)
  // still touch the env (e.g. an ObjectWrap destructor calling
  // napi_delete_reference). Each ExternalData holds one count for its whole
  // lifetime; Detach drops the initial owner count. Whoever drops the last
  // count deletes the env, so it always outlives its final use without leaking.
  int ref_count = 1;

  void Ref() { ++ref_count; }

  void Unref()
  {
    if (--ref_count == 0)
    {
      delete this;
    }
  }
};

#define RETURN_STATUS_IF_FALSE(env, condition, status) \
  do {                                                 \
    if (!(condition)) {                                \
      return napi_set_last_error((env), (status));     \
    }                                                  \
  } while (0)

#define CHECK_ENV(env)                                    \
  do {                                                    \
    if ((env) == nullptr) {                               \
      return napi_invalid_arg;                            \
    }                                                     \
    assert(env->thread_id == std::this_thread::get_id()); \
  } while (0)

#define CHECK_ARG(env, arg) \
  RETURN_STATUS_IF_FALSE((env), ((arg) != nullptr), napi_invalid_arg)

#define CHECK_JSQJS(env, expr)                                  \
  do {                                                          \
    JSValue __ret = (expr);                                     \
    if (JS_IsException(__ret)) {                                \
      JS_FreeValue(env->context, __ret);                        \
      return napi_set_last_error(env, napi_pending_exception);  \
    }                                                           \
  } while (0)

#define CHECK_JSQJS_ERR(env, expr)                              \
  do {                                                          \
    int __ret = (expr);                                         \
    if (__ret < 0) {                                            \
      return napi_set_last_error(env, napi_generic_failure);    \
    }                                                           \
  } while (0)

// This does not call napi_set_last_error because the expression
// is assumed to be a NAPI function call that already did.
#define CHECK_NAPI(expr)                  \
  do {                                    \
    napi_status status = (expr);          \
    if (status != napi_ok) return status; \
  } while (0)

// utf8 multibyte codepoint start check
#define UTF8_MULTIBYTE_START(c) (((c) & 0xC0) == 0xC0)

#define STR_AND_LENGTH(str) str, sizeof(str) - 1

static inline void napi_clear_last_error(napi_env env) {
  env->last_error.error_code = napi_ok;
  env->last_error.engine_error_code = 0;
  env->last_error.engine_reserved = nullptr;
}

// zinc: frees every handle from `start` up (the values of a closing scope, and the values escaped into it)
static inline void napi_truncate_handles(napi_env env, size_t start) {
  if (env->handle_scope_stack.size() == start && env->escaped_held.empty()) return;
  for (size_t i = start; i < env->handle_scope_stack.size(); i++) {
    JSValue& v = env->handle_scope_stack[i];
    if (JS_VALUE_HAS_REF_COUNT(v)) JS_FreeValue(env->context, v);   // zinc: numbers and booleans need no call
  }
  env->handle_scope_stack.resize(start);
  while (!env->escaped_held.empty() && env->escaped_held.back().first >= start) {
    JS_FreeValue(env->context, *env->escaped_held.back().second);
    env->escaped_held.pop_back();
  }
}

static inline napi_status napi_set_last_error(napi_env env, napi_status error_code, uint32_t engine_error_code = 0, void* engine_reserved = nullptr) {
  env->last_error.error_code = error_code;
  env->last_error.engine_error_code = engine_error_code;
  env->last_error.engine_reserved = engine_reserved;

  return error_code;
}
