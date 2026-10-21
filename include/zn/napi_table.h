#pragma once
// The Node-API of the engine that loads a module (ZN-773.02): libzn_webgl is built once and runs on every engine, so its napi_* calls go
// through this table, which the engine hands over when it opens the module (src/gl/napi_trampoline.cpp defines each napi_* there as a hidden
// function that calls the entry of the same name). The list is every Node-API function the module calls, its own and those of the
// src/qjs/napi_util.h helpers it uses: a module that needs one more adds a line here, and every engine fills it again in the same line:
//   static const zn_napi_table table = { ZN_NAPI_TABLE_INIT };   // where the engine's napi_* are declared
#include <napi/js_native_api.h>

// X(return type, name, (parameters), (arguments)); the table's field is the name and an underscore (`typeof` and `throw` are C++ keywords)
#define ZN_NAPI_FUNCTIONS(X)                                                                                                                   \
  X(napi_status, napi_get_undefined, (napi_env env, napi_value* result), (env, result))                                                            \
  X(napi_status, napi_get_null, (napi_env env, napi_value* result), (env, result))                                                                 \
  X(napi_status, napi_get_global, (napi_env env, napi_value* result), (env, result))                                                               \
  X(napi_status, napi_get_boolean, (napi_env env, bool value, napi_value* result), (env, value, result))                                           \
  X(napi_status, napi_create_object, (napi_env env, napi_value* result), (env, result))                                                            \
  X(napi_status, napi_create_array, (napi_env env, napi_value* result), (env, result))                                                             \
  X(napi_status, napi_create_double, (napi_env env, double value, napi_value* result), (env, value, result))                                       \
  X(napi_status, napi_create_int32, (napi_env env, int32_t value, napi_value* result), (env, value, result))                                       \
  X(napi_status, napi_create_uint32, (napi_env env, uint32_t value, napi_value* result), (env, value, result))                                     \
  X(napi_status, napi_create_int64, (napi_env env, int64_t value, napi_value* result), (env, value, result))                                       \
  X(napi_status, napi_create_string_utf8, (napi_env env, const char* str, size_t length, napi_value* result), (env, str, length, result))          \
  X(napi_status, napi_create_symbol, (napi_env env, napi_value description, napi_value* result), (env, description, result))                       \
  X(napi_status, napi_create_function, (napi_env env, const char* utf8name, size_t length, napi_callback cb, void* data, napi_value* result),      \
    (env, utf8name, length, cb, data, result))                                                                                                 \
  X(napi_status, napi_typeof, (napi_env env, napi_value value, napi_valuetype* result), (env, value, result))                                      \
  X(napi_status, napi_get_value_double, (napi_env env, napi_value value, double* result), (env, value, result))                                    \
  X(napi_status, napi_get_value_int32, (napi_env env, napi_value value, int32_t* result), (env, value, result))                                    \
  X(napi_status, napi_get_value_uint32, (napi_env env, napi_value value, uint32_t* result), (env, value, result))                                  \
  X(napi_status, napi_get_value_int64, (napi_env env, napi_value value, int64_t* result), (env, value, result))                                    \
  X(napi_status, napi_get_value_bool, (napi_env env, napi_value value, bool* result), (env, value, result))                                        \
  X(napi_status, napi_get_value_string_utf8, (napi_env env, napi_value value, char* buf, size_t bufsize, size_t* result),                         \
    (env, value, buf, bufsize, result))                                                                                                        \
  X(napi_status, napi_coerce_to_bool, (napi_env env, napi_value value, napi_value* result), (env, value, result))                                  \
  X(napi_status, napi_coerce_to_number, (napi_env env, napi_value value, napi_value* result), (env, value, result))                                \
  X(napi_status, napi_coerce_to_string, (napi_env env, napi_value value, napi_value* result), (env, value, result))                                \
  X(napi_status, napi_set_property, (napi_env env, napi_value object, napi_value key, napi_value value), (env, object, key, value))                \
  X(napi_status, napi_get_property, (napi_env env, napi_value object, napi_value key, napi_value* result), (env, object, key, result))             \
  X(napi_status, napi_set_named_property, (napi_env env, napi_value object, const char* utf8name, napi_value value), (env, object, utf8name, value)) \
  X(napi_status, napi_get_named_property, (napi_env env, napi_value object, const char* utf8name, napi_value* result),                            \
    (env, object, utf8name, result))                                                                                                           \
  X(napi_status, napi_set_element, (napi_env env, napi_value object, uint32_t index, napi_value value), (env, object, index, value))               \
  X(napi_status, napi_get_element, (napi_env env, napi_value object, uint32_t index, napi_value* result), (env, object, index, result))            \
  X(napi_status, napi_define_properties, (napi_env env, napi_value object, size_t property_count, const napi_property_descriptor* properties),     \
    (env, object, property_count, properties))                                                                                                 \
  X(napi_status, napi_is_array, (napi_env env, napi_value value, bool* result), (env, value, result))                                              \
  X(napi_status, napi_get_array_length, (napi_env env, napi_value value, uint32_t* result), (env, value, result))                                  \
  X(napi_status, napi_get_cb_info, (napi_env env, napi_callback_info cbinfo, size_t* argc, napi_value* argv, napi_value* this_arg, void** data),  \
    (env, cbinfo, argc, argv, this_arg, data))                                                                                                 \
  X(napi_status, napi_call_function, (napi_env env, napi_value recv, napi_value func, size_t argc, const napi_value* argv, napi_value* result),    \
    (env, recv, func, argc, argv, result))                                                                                                     \
  X(napi_status, napi_new_instance, (napi_env env, napi_value constructor, size_t argc, const napi_value* argv, napi_value* result),               \
    (env, constructor, argc, argv, result))                                                                                                    \
  X(napi_status, napi_define_class, (napi_env env, const char* utf8name, size_t length, napi_callback constructor, void* data,                    \
    size_t property_count, const napi_property_descriptor* properties, napi_value* result),                                                   \
    (env, utf8name, length, constructor, data, property_count, properties, result))                                                           \
  X(napi_status, napi_wrap, (napi_env env, napi_value js_object, void* native_object, napi_finalize finalize_cb, void* finalize_hint,             \
    napi_ref* result), (env, js_object, native_object, finalize_cb, finalize_hint, result))                                                  \
  X(napi_status, napi_unwrap, (napi_env env, napi_value js_object, void** result), (env, js_object, result))                                       \
  X(napi_status, napi_throw, (napi_env env, napi_value error), (env, error))                                                                       \
  X(napi_status, napi_throw_type_error, (napi_env env, const char* code, const char* msg), (env, code, msg))                                       \
  X(napi_status, napi_throw_range_error, (napi_env env, const char* code, const char* msg), (env, code, msg))                                      \
  X(napi_status, napi_is_exception_pending, (napi_env env, bool* result), (env, result))                                                           \
  X(napi_status, napi_get_and_clear_last_exception, (napi_env env, napi_value* result), (env, result))                                             \
  X(napi_status, napi_create_reference, (napi_env env, napi_value value, uint32_t initial_refcount, napi_ref* result),                            \
    (env, value, initial_refcount, result))                                                                                                    \
  X(napi_status, napi_delete_reference, (napi_env env, napi_ref ref), (env, ref))                                                                  \
  X(napi_status, napi_get_reference_value, (napi_env env, napi_ref ref, napi_value* result), (env, ref, result))                                    \
  X(napi_status, napi_is_arraybuffer, (napi_env env, napi_value value, bool* result), (env, value, result))                                        \
  X(napi_status, napi_create_arraybuffer, (napi_env env, size_t byte_length, void** data, napi_value* result), (env, byte_length, data, result))   \
  X(napi_status, napi_get_arraybuffer_info, (napi_env env, napi_value arraybuffer, void** data, size_t* byte_length),                             \
    (env, arraybuffer, data, byte_length))                                                                                                     \
  X(napi_status, napi_is_typedarray, (napi_env env, napi_value value, bool* result), (env, value, result))                                         \
  X(napi_status, napi_get_typedarray_info, (napi_env env, napi_value typedarray, napi_typedarray_type* type, size_t* length, void** data,         \
    napi_value* arraybuffer, size_t* byte_offset), (env, typedarray, type, length, data, arraybuffer, byte_offset))                          \
  X(napi_status, napi_is_dataview, (napi_env env, napi_value value, bool* result), (env, value, result))                                           \
  X(napi_status, napi_get_dataview_info, (napi_env env, napi_value dataview, size_t* bytelength, void** data, napi_value* arraybuffer,           \
    size_t* byte_offset), (env, dataview, bytelength, data, arraybuffer, byte_offset))                                                       \
  X(napi_status, napi_run_script, (napi_env env, napi_value script, const char* source_url, napi_value* result), (env, script, source_url, result))

extern "C" {
struct zn_napi_table {
#define ZN_NAPI_FIELD(ret, name, params, args) ret(NAPI_CDECL* name##_) params;
  ZN_NAPI_FUNCTIONS(ZN_NAPI_FIELD)
#undef ZN_NAPI_FIELD
};
}

// The entries in order, from the napi_* visible where it is expanded (positional: napi/inline.h may have turned a name into a macro).
#define ZN_NAPI_TABLE_ENTRY(ret, name, params, args) name,
#define ZN_NAPI_TABLE_INIT ZN_NAPI_FUNCTIONS(ZN_NAPI_TABLE_ENTRY)

// What libzn_wasm needs beyond that (ZN-773.06): JavaScriptCore's Node-API has no detach and no BigInt, so these are a second table that only
// the engines that have them fill (QuickJS, the one engine that gets WebAssembly from the module).
#define ZN_NAPI_EXT_FUNCTIONS(X)                                                                                                               \
  X(napi_status, napi_create_external_arraybuffer, (napi_env env, void* external_data, size_t byte_length, napi_finalize finalize_cb,             \
    void* finalize_hint, napi_value* result), (env, external_data, byte_length, finalize_cb, finalize_hint, result))                          \
  X(napi_status, napi_detach_arraybuffer, (napi_env env, napi_value arraybuffer), (env, arraybuffer))                                             \
  X(napi_status, napi_create_bigint_int64, (napi_env env, int64_t value, napi_value* result), (env, value, result))                               \
  X(napi_status, napi_get_value_bigint_int64, (napi_env env, napi_value value, int64_t* result, bool* lossless), (env, value, result, lossless))   \
  X(napi_status, napi_open_handle_scope, (napi_env env, napi_handle_scope* result), (env, result))                                                 \
  X(napi_status, napi_close_handle_scope, (napi_env env, napi_handle_scope scope), (env, scope))

extern "C" {
struct zn_napi_table_ext {
#define ZN_NAPI_FIELD(ret, name, params, args) ret(NAPI_CDECL* name##_) params;
  ZN_NAPI_EXT_FUNCTIONS(ZN_NAPI_FIELD)
#undef ZN_NAPI_FIELD
};
}
#define ZN_NAPI_TABLE_EXT_INIT ZN_NAPI_EXT_FUNCTIONS(ZN_NAPI_TABLE_ENTRY)
