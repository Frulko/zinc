#pragma once
// The JavaScript engines beside QuickJS (ZN-773, docs/reports/js-engines-jsc-v8.md): JavaScriptCore and V8 are modules zinc loads with dlopen
// (libzn_engine_jsc, libzn_engine_v8), each with its engine's Node-API, its own copy of the bindings and the driver of src/engine/driver.cpp.
// zinc bundles the program into one script (zinc bundle's script mode) and hands it to the module's one entry point. zinc exports no C++ (the
// coalescing cost of ZN-592.01), so the module links the stateless code it needs (codecs, text) and gets zinc's live state here: the host tables,
// the redraw hook, the native registry. ZN_ENGINE_ABI changes when this struct changes: a pack built for another value is refused.
#define ZN_ENGINE_ABI 2

extern "C" {
struct zn_engine_args {
  int abi;               // ZN_ENGINE_ABI of the zinc that loads the module
  const char* bundle;    // the program, one script (src/qjs/bundle.cpp with BundleOptions::engine)
  const char* entry;     // the file it was bundled from
  const char* std_root;  // lib/std
  const char* caps;      // __ZINC_CAPS__ as JSON (zn::qjs::capsJson)
  const char* web;       // the web environment: "" (off), "1" or "trace" (zn::qjs::webMode)
  const char* web_base;  // the page's directory, what relative URLs resolve against
  void* host_gfx;        // zn::host::HostCall: hostGfx, hostSys, hostLayout as zinc installed them
  void* host_sys;
  void* host_layout;
  void (**redraw)();     // &zn::host::redraw: the frame the window HAL draws during a live resize
  const void* native_provider;           // &zn::frontend::gNativeProvider
  const void* (*gl_present_hooks)();     // zn::host::glPresentHooks (the 2D canvas drawn into a zinc:gfx image)
  void* decode_rgba;     // zn::res::decodeRgba and imageSize: zinc's decoders (stb_image, libwebp), not linked twice
  void* image_size;
  void* map_stack;       // zn::qjs::mapStack: a stack trace through the bundle's source map, back to the files the user wrote
  // WebGL (ZN-773.02): libzn_webgl opened by zinc with the engine's Node-API table (include/zn/napi_table.h); what it returns installs
  // document.createElement('canvas').getContext('webgl') in a context, a void (*)(napi_env), or nullptr without the module
  void* (*webgl_open)(const struct zn_napi_table* napi);
};
typedef int (*zn_engine_run_fn)(const zn_engine_args*);   // the exported `zn_engine_run`: the process exit code
}
