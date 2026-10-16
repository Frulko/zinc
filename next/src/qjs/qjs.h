#pragma once
// The QuickJS engine (ZN-051): plain JavaScript and stripped TypeScript run on QuickJS-ng behind the same host calls as the typed engines. The
// functions `__host_*` that zinc:gfx, zinc:sys, zinc:fs... call are generated from the runtime table (include/zn/runtime.h), so the host is written once.
#include <string>
#include <vector>

struct JSRuntime;
struct JSContext;

namespace zn::qjs {

struct Options {
  std::string entry;    // the program: .js, .mjs, .ts, .tsx, or a bundle's bytecode (.qbc, zinc bundle --bytecode)
  std::string stdRoot;  // lib/std, for 'zinc:ui' and the other standard modules
  std::string cacheDir; // the transformed modules, by content hash (~/.zinc/cache/qjs); "" transforms each module at each run
  std::vector<std::string> args;  // after `--`
  int profileHz = 0;    // zinc profile --engine quickjs: the sampling rate of the QuickJS profiler (builds with ZN_QJS_PROFILE only)
};

// Runs the program to its end (its modules, the promise jobs, the timers, or the frame loop of a zinc:gfx program); the process exit code.
int run(const Options& o);

// ---- the bundler (src/qjs/bundle.cpp, docs/reports/zinc-quickjs-bundler.md)
// One module of a program as the QuickJS loader sees it: its resolved name (an absolute path or a zinc: specifier), its JavaScript after the
// transform stage, and the specifiers it imports with what each resolved to. `bare`: a package name the loader does not resolve (node_modules):
// the linker does. `host`: a module the host provides at run time (zinc:native), never bundled.
struct Collected { std::string name, js; std::vector<std::pair<std::string, std::string>> deps; bool bare = false, host = false; };
// Walks the program from `entry` with the loader `run` uses (relative files, importmap.json, zinc: modules, plugins), transforming each module;
// static imports only. False with `err` set (a transform diagnostic, a syntax error, a missing file).
bool collect(const std::string& entry, const std::string& stdRoot, const std::string& cacheDir, std::vector<Collected>& mods, std::string& err);

struct BundleOptions {
  std::string entry, stdRoot, out;   // out: the bundle (.js), its source map out + ".map", its bytecode with the extension .qbc
  std::string esbuild;               // the pinned esbuild (src/tc), "" for --check
  std::string work;                  // a scratch directory for the staged modules
  std::string cacheDir;              // as Options::cacheDir
  std::string capsFile;              // targets/capabilities.json: the profile's row folded in as __ZINC_CAPS__
  bool minify = false, sourcemap = false, bytecode = false, check = false, watch = false, quiet = false;
};
// zinc bundle: the exit code (0, 1 when the program has errors, 2 for a usage or tool problem).
int bundle(const BundleOptions& o);
// The QuickJS-specific lint of one transformed module (Q0001: a global or API QuickJS-ng 0.17 does not have): "file:line:col: warning ..." lines.
std::vector<std::string> quickjsLint(const std::string& js, const std::string& file);
// QuickJS bytecode of a bundle (a single module that imports only zinc:native): what `zinc run app.qbc` loads without parsing. `name` is the module name
// stack traces show. False with `err` set.
bool compileBytecode(const std::string& js, const std::string& name, std::string& bytes, std::string& err);
// The constants of zinc:platform for this run as a JSON object ({"TARGET":"macos","PROFILE":"macos","GPU":true...}): __ZINC_CAPS__ of a bundle,
// and the global of the same name `zinc run --engine quickjs` defines.
std::string capsJson(const std::string& capsFile);
// A stack trace with the positions of `file` (a bundle) replaced by the original ones its source map `mapJson` gives.
std::string mapStack(const std::string& stack, const std::string& file, const std::string& mapJson);

// src/qjs/native_js.cpp: the native modules of plugins (zinc:native for this engine, and the global function its requireNative calls).
void installNative(JSContext* ctx);
extern const char* kNativeModule;

// src/qjs/webenv.cpp: the web environment (window, document, events, storage, network: lib/std/webenv.js), installed when the program asks for it
// (ZINC_WEB=1, or "web" in its zinc.json); nothing otherwise. False with the error printed.
bool webEnv(JSContext* ctx, const std::string& stdRoot, const std::string& entry);

extern const char* kPrelude;
extern const char* kWebShims;   // TextEncoder, TextDecoder, AbortController: evaluated in every context (the main program and zinc:script)

#ifdef ZN_QJS_PROFILE
void profileStart(JSRuntime* rt, int hz);   // src/qjs/qjs_prof.cpp: the report goes to stderr at exit (hz 0: no report, only ZN_QJS_DUMP)
#endif

}  // namespace zn::qjs
