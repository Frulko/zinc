#pragma once
// The QuickJS engine (ZN-051): plain JavaScript and stripped TypeScript run on QuickJS-ng behind the same host calls as the typed engines. The
// functions `__host_*` that zinc:gfx, zinc:sys, zinc:fs... call are generated from the runtime table (include/zn/runtime.h), so the host is written once.
#include <string>
#include <vector>

namespace zn::qjs {

struct Options {
  std::string entry;    // the program: .js, .mjs or .ts
  std::string stdRoot;  // lib/std, for 'zinc:ui' and the other standard modules
  std::vector<std::string> args;  // after `--`
};

// Runs the program to its end (its modules, the promise jobs, the timers, or the frame loop of a zinc:gfx program); the process exit code.
int run(const Options& o);

extern const char* kPrelude;
extern const char* kWebShims;   // TextEncoder, TextDecoder, AbortController: evaluated in every context (the main program and zinc:script)

}  // namespace zn::qjs
