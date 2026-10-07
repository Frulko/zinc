#pragma once
// The event loop of the host (ZN-082), on libuv (third_party/libuv; no libuv type appears here): child processes, and waiting for the next thing
// to happen. The timers and promises of a program are scheduled in Zinc (the prelude of src/frontend/modules.cpp); this is where the process
// really sleeps, and where the completion of outside work (a child's output, its exit) is collected.
#include <string>
#include <vector>

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

// ---- the process API of zinc:process (plugins/process): argv without a shell, cwd and environment, stdin, separate output streams, events
struct Event {
  int handle = 0;      // the child (kinds 0 to 2), or 0
  int kind = 0;        // 0 stdout chunk, 1 stderr chunk, 2 exit (data = the code, 128 + signal when killed), 10 signal (data = its name), 11 stdin chunk, 12 stdin end
  std::string data;
};
// Starts argv[0] (looked up in PATH); cwd "" keeps the program's; env holds KEY=VALUE entries added to the environment. -1 on failure (lastError()).
int spawnProcess(const std::vector<std::string>& argv, const std::string& cwd, const std::vector<std::string>& env);
const std::string& lastError();
int pidOf(int handle);
bool writeStdin(int handle, const std::string& data);   // blocks until written; false when stdin is closed
void closeStdin(int handle);
void signalProcess(int handle, int signal);
// The next event that is ready (the loop is pumped first); false when there is none.
bool nextEvent(Event& out);
// Children still running, signals watched and stdin being read: whether the program has work that is not a timer.
bool active();
// Signals and standard input of the program itself (zinc:sys): events of kind 10, 11 and 12.
bool watchSignal(const std::string& name);              // false for an unknown or uncatchable name
bool sendSignal(int pid, const std::string& name);      // false for an unknown name
void readStdin();
// zinc:osc over UDP (src/host/osc.cpp): packed messages (see osc.h) arrive as events of kind 20; a listening socket keeps the loop alive.
bool oscListen(int port);
void oscClose();
bool oscSend(const std::string& host, int port, const std::string& packed);

}  // namespace zn::loop
