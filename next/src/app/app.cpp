// The embedder contract of include/zn/app.h (ZN-620, docs/reports/zinc-next-mobile-core.md §3): the program's top level runs in zn_app_init and
// stops where its loop would start (the prelude's __runLoop returns in an app); each zn_app_iterate then calls the prelude's __appStep, one frame
// or one turn of the timers. The machine lives between the calls. runModuleHooked and report (src/rt/program.cpp) do the same in one go.
// A player (src/app/player.cpp, ZN-631) starts interpreted programs through app_core.h and takes the shell's calls with its hooks.
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <string>
#include <vector>

#include "app/app_core.h"
#include "zn/app.h"

extern "C" void zn_hal_sdl_event(const void* sdl_event);   // targets/macos/hal_sdl.cpp: queued for the next poll of the window HAL

namespace zn::rt {
namespace {
// ponytail: one program per process, as the platforms give an app one entry; appStart replaces the one that runs
struct App {
  zbc::Module mod;                  // an AOT program's module; a player's unit keeps its own
  const zbc::Module* code = &mod;   // the module the machine runs
  std::unique_ptr<Machine> m;
  std::string out;
  std::uint32_t step = 0;   // the prelude's __appStep; 0: the top level ran the whole program
  bool trace = false, over = false;
  int status = 0;           // report's: 0, 1 (runtime error), 101 (uncaught exception), 4 (leak check)
  Result res;
};
App* gApp = nullptr;

std::uint32_t findFunction(const zbc::Module& mod, const char* name) {
  for (std::uint32_t i = 1; i < mod.functions.size(); ++i) if (mod.functions[i].name == name) return i;
  return 0;
}
}  // namespace

AppHooks gAppHooks;

// The end of the run: what runModuleHooked does after main returned, then report's output and status. Once.
int appFinish() {
  App& a = *gApp;
  if (a.over) return a.status;
  a.over = true;
  Machine& m = *a.m;
  nativeEnd(m);
  if (a.res.ok) {
    for (std::size_t g = m.globals.size(); g-- > 0;) if (m.globalRef[g]) { Slot v = m.globals[g]; m.globals[g] = 0; m.releaseSlot(v); }
    a.res.leaked = m.live - m.immortals;
  }
  a.res.trace = std::move(m.trace);
  a.status = report(a.res, a.out, a.trace);
  return a.status;
}

int appStart(zbc::Module own, const zbc::Module* code, int (*const* natives)(Machine&, Slot*), std::size_t count) {
  if (gApp && !gApp->over) appFinish();
  delete gApp;
  gApp = new App;
  App& a = *gApp;
  a.mod = std::move(own);
  if (code) a.code = code;
  std::string err;
  a.trace = std::getenv("ZN_TRACE_FREE") != nullptr;
  a.m = std::make_unique<Machine>();
  Machine& m = *a.m;
  m.out = &a.out;
  m.outLive = true;
  m.traceFree = a.trace;
  if (!m.load(*a.code, err)) { std::fprintf(stderr, "%s\n", err.c_str()); a.over = true; a.status = 1; return -1; }
#ifndef ZN_NO_MIMALLOC
  if (a.code->heapBytes) setHeapBudget(a.code->heapBytes);
#endif
  m.registry = !natives;   // an AOT program ends with the process; the interpreter keeps its list of live objects (Fast Refresh moves them)
  for (std::size_t i = 0; natives && i < count && i < m.funcs.size(); ++i) m.funcs[i].native = natives[i];
  if (!m.exec(&m.funcs[0], m.stack)) { a.res.ok = false; a.res.error = m.error; return appFinish() ? -1 : 1; }
  a.step = findFunction(*a.code, kAppStepFunction);
  if (!a.step) return appFinish() ? -1 : 1;   // no event loop in the program: it is done
  return 0;
}

// The generated program's main under ZN_APP_LIBRARY calls this in place of runProgramPacked: load, run the top level, keep the machine.
int runProgramApp(const unsigned char* packed, std::size_t size, int (*const* natives)(Machine&, Slot*), std::size_t count) {
  zbc::Module mod;
  std::vector<std::uint8_t> bytes;
  std::string err;
  if (!zbc::unpackRuns(packed, size, bytes)) { std::fprintf(stderr, "embedded module: damaged\n"); return -1; }
  if (!zbc::decode(bytes, mod, err)) { std::fprintf(stderr, "embedded module: %s\n", err.c_str()); return -1; }
  err = zbc::verify(mod);
  if (!err.empty()) { std::fprintf(stderr, "embedded module: invalid ZBC: %s\n", err.c_str()); return -1; }
  return appStart(std::move(mod), nullptr, natives, count);
}

int appTick() {
  if (!gApp || gApp->over) return 1;
  Machine& m = *gApp->m;
  if (!m.exec(&m.funcs[gApp->step], m.stack)) { gApp->res.ok = false; gApp->res.error = m.error; return appFinish() ? -1 : 1; }
  if (m.outLive && !m.out->empty()) m.flushOut();   // the frame's lines reach the log now (a frame before the background has no next one soon)
  if (m.stack[0] != 0) return 0;   // __appStep returned true: more to run
  return appFinish() ? -1 : 1;
}

Machine* appMachine() { return gApp && !gApp->over ? gApp->m.get() : nullptr; }

bool appCodeChanged(const zbc::Module& code) {
  if (!gApp || gApp->over) return false;
  gApp->code = &code;
  gApp->step = findFunction(code, kAppStepFunction);
  return gApp->step != 0;
}

}  // namespace zn::rt

extern "C" int zn_app_iterate(void) { return zn::rt::gAppHooks.tick ? zn::rt::gAppHooks.tick() : zn::rt::appTick(); }

extern "C" void zn_app_event(const void* sdl_event) {
  if (zn::rt::gAppHooks.event && zn::rt::gAppHooks.event(sdl_event)) return;
  zn_hal_sdl_event(sdl_event);
}

extern "C" void zn_app_quit(void) {
  if (zn::rt::gApp) zn::rt::appFinish();   // ponytail: a program stopped by the shell mid-run skips __host_gfxFinish (no last-frame capture)
  std::fflush(stdout);
}

extern "C" int zn_app_main(int argc, char** argv) {
  int rc = zn_app_init(argc, argv);
  while (rc == 0) rc = zn_app_iterate();
  return zn::rt::gApp && zn::rt::gApp->over ? zn::rt::gApp->status : rc < 0 ? 1 : 0;
}
