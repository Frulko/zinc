#pragma once
// The QuickJS engine (ZN-051): plain JavaScript and stripped TypeScript run on QuickJS-ng behind the same host calls as the typed engines. The
// functions `__host_*` that zinc:gfx, zinc:sys, zinc:fs... call are generated from the runtime table (include/zn/runtime.h), so the host is written once.
#include <string>
#include <vector>

struct JSRuntime;

namespace zn::qjs {

struct Options {
  std::string entry;    // the program: .js, .mjs or .ts
  std::string stdRoot;  // lib/std, for 'zinc:ui' and the other standard modules
  std::vector<std::string> args;  // after `--`
  int profileHz = 0;    // zinc profile --engine quickjs: the sampling rate of the QuickJS profiler (builds with ZN_QJS_PROFILE only)
};

// Runs the program to its end (its modules, the promise jobs, the timers, or the frame loop of a zinc:gfx program); the process exit code.
int run(const Options& o);

extern const char* kPrelude;
extern const char* kWebShims;   // TextEncoder, TextDecoder, AbortController: evaluated in every context (the main program and zinc:script)

#ifdef ZN_QJS_PROFILE
void profileStart(JSRuntime* rt, int hz);   // src/qjs/qjs_prof.cpp: the report goes to stderr at exit (hz 0: no report, only ZN_QJS_DUMP)
#endif

}  // namespace zn::qjs
