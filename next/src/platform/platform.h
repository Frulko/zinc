// zn::plat: the operating-system calls of the command line and its tools that differ between POSIX and Windows, behind one header
// (docs/reports/zinc-windows-port.md). The POSIX side is the code that was inline in cli_core.cpp, main.cpp and src/tc, moved here unchanged;
// the Windows side is Win32. Depends on nothing of the engine. Sockets are in platform/socket.h (it pulls in the system's socket headers).
#pragma once
#include <string>
#include <utility>
#include <vector>

namespace zn::plat {

// ---- environment and files
std::string homeDir();                                     // $HOME; %USERPROFILE% on Windows; "" when neither is set
/** The POSIX shell that runs the toolchain's shell lines (`'...'` quoting, /dev/null, pipes, `command -v`): Git for
 *  Windows' sh.exe on Windows, /bin/sh elsewhere; "" when the machine has none. The lines keep one spelling on both. */
std::string shellPath();
bool isTerminal(int fd);                                   // isatty
/** Size and modification time (ns since the epoch) of a file: the stamps of the caches. False when it cannot be read. */
bool fileStamp(const std::string& path, long long& size, long long& mtimeNs);

// ---- shared libraries (plugins, the window and WebGL modules)
void* libOpen(const std::string& path, bool global);      // dlopen(RTLD_NOW | RTLD_GLOBAL or RTLD_LOCAL); LoadLibraryW
void* libSymbol(void* lib, const char* name);              // dlsym; GetProcAddress
void libClose(void* lib);
std::string libError();                                    // why the last libOpen failed
const char* libSuffix();                                   // ".dylib", ".so", ".dll"

// ---- processes
using Pid = long long;   // a pid_t, or a process HANDLE on Windows
struct SpawnOptions {
  bool quiet = false;                                      // stdout and stderr to the null device
  bool newGroup = false;                                   // its own process group, so stop() reaches what it starts
  std::string cwd;                                         // "" keeps ours
  std::vector<std::pair<std::string, std::string>> env;    // set in the child only
  std::vector<std::string> unset;                          // removed in the child only
};
/** Starts argv[0] (looked up in PATH when it has no directory) with its arguments, no shell. -1 when it cannot start. */
Pid spawn(const std::vector<std::string>& argv, const SpawnOptions& o = {});
/** True when the child has ended (then `code` is its exit status, -1 when a signal ended it); false while it runs (block = false). */
bool wait(Pid pid, int& code, bool block = true);
/** Ends a child started with newGroup and what it started: SIGTERM, up to 250 ms, then SIGKILL (TerminateProcess on Windows); reaps it. */
void stop(Pid pid);
/** spawn + wait: the exit status, -1 when it could not start or a signal ended it. */
int run(const std::vector<std::string>& argv, const SpawnOptions& o = {});
/** run, keeping what the program prints on stdout in `out`. */
int capture(const std::vector<std::string>& argv, std::string& out);
/** Starts a program that outlives us (its own session, stdio on the null device) and does not wait for it. */
void spawnDetached(const std::vector<std::string>& argv);
/** Replaces this process with `path` (execv). On Windows, which cannot, it runs it and exits with its status. Returns only on failure. */
void replaceProcess(const std::string& path, const std::vector<std::string>& argv);
/** The exit status in what std::system or pclose returned (WEXITSTATUS); -1 when a signal ended it or nothing ran. */
int exitStatus(int systemResult);

/** One argument quoted for a Windows command line (the rules of CommandLineToArgvW and the C runtime). Pure: tested on every host. */
std::string quoteWindowsArg(const std::string& arg);

// ---- the machine
/** The null device in a shell command line: "NUL" for cmd.exe, "/dev/null" elsewhere (cmd answers "the system cannot find the path" to /dev/null). */
inline const char* shellNull() {
#ifdef _WIN32
  return "NUL";
#else
  return "/dev/null";
#endif
}
const char* osName();                                      // "macos", "linux", "windows": the names of the release archives
std::string machine();                                     // uname -m: "arm64", "x86_64", "aarch64"...
long long maxRssBytes();                                   // peak resident memory of this process

/** fnmatch(pattern, path, FNM_PATHNAME): `*` and `?` stop at '/', `[...]` and `[!...]` classes, `\` escapes. Ours on Windows, which has no
 *  fnmatch; the T0 test compares it with the C library's on POSIX. */
bool globMatch(const std::string& pattern, const std::string& path);

}  // namespace zn::plat

#ifdef _WIN32
// mingw-w64 has no setenv/unsetenv; the command line calls them in some seventy places, so POSIX's two are given here rather than rewritten
int setenv(const char* name, const char* value, int overwrite);
int unsetenv(const char* name);
char* realpath(const char* path, char* resolved);   // _fullpath: absolute and normalized, but links are not resolved and the file need not exist
#endif
