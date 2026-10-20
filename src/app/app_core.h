#pragma once
// Inside the app library (ZN-631): the running program beneath include/zn/app.h, as a player (src/app/player.cpp) drives it, and the hooks it
// sets on the shell's calls. One program at a time per process; appStart replaces the one that runs.
#include <cstddef>

#include "rt/rt.h"
#include "zbc/zbc.h"

namespace zn::rt {

// Starts a program on a new machine and runs its top level, up to its loop: zn_app_init's codes (0 running, 1 done, <0 error). Its module is
// `own`, or `code` when given (the caller keeps it alive while it runs). With `natives` (an AOT program) function i runs natives[i]; without, the
// interpreter runs it and keeps its list of live objects (what Fast Refresh moves).
int appStart(zbc::Module own, const zbc::Module* code, int (*const* natives)(Machine&, Slot*), std::size_t count);
int appTick();          // one tick of the running program: zn_app_iterate's codes
int appFinish();        // ends the running program once (its output flushed, its natives released): its exit status
Machine* appMachine();  // the running program's machine; null when none runs
// The machine's code was replaced by `code` (Fast Refresh): the tick function is found again in it. False when it has none.
bool appCodeChanged(const zbc::Module& code);

// A player's: zn_app_iterate calls `tick` instead of appTick, zn_app_event gives `event` each SDL event first (true: taken, not the program's)
struct AppHooks {
  int (*tick)() = nullptr;
  bool (*event)(const void* sdl_event) = nullptr;
};
extern AppHooks gAppHooks;

}  // namespace zn::rt
