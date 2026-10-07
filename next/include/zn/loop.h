#pragma once
// The event loop of the host (ZN-082), on libuv (third_party/libuv; no libuv type appears here): child processes, and waiting for the next thing
// to happen. The timers and promises of a program are scheduled in Zinc (the prelude of src/frontend/modules.cpp); this is where the process
// really sleeps, and where the completion of outside work (a child's output, its exit) is collected.
#include <string>

namespace zn::loop {

// Runs the I/O and child-process callbacks that are ready, without waiting.
void pump();
// Waits for `ms` milliseconds or until an event arrives, whichever is first (<= 0: pump only).
void wait(double ms);
// Monotonic milliseconds since the first call.
double nowMs();

// A child process: `/bin/sh -c line`, its stdout and stderr merged. -1 when it cannot start.
int spawn(const std::string& line);
// What the child wrote since the last read (the loop is pumped first).
std::string read(int handle);
// -1 while it runs, else its exit code (128 + the signal when it was killed).
int status(int handle);
// SIGTERM to a child that still runs.
void kill(int handle);

}  // namespace zn::loop
