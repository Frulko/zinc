#include "platform/platform.h"

#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <thread>

#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <io.h>
#include <psapi.h>
#else
#include <cerrno>
#include <csignal>
#include <dlfcn.h>
#include <fcntl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/utsname.h>
#include <sys/wait.h>
#include <unistd.h>
#endif

namespace zn::plat {

std::string quoteWindowsArg(const std::string& arg) {
  if (!arg.empty() && arg.find_first_of(" \t\n\v\"") == std::string::npos) return arg;
  std::string o = "\"";
  for (std::size_t i = 0;; ++i) {
    std::size_t slashes = 0;
    while (i < arg.size() && arg[i] == '\\') { ++slashes; ++i; }
    if (i == arg.size()) { o.append(slashes * 2, '\\'); break; }           // before the closing quote: each one doubled
    if (arg[i] == '"') o.append(slashes * 2 + 1, '\\');                    // before a quote: doubled, plus one for the quote
    else o.append(slashes, '\\');                                          // elsewhere: as they are
    o += arg[i];
  }
  return o + "\"";
}

namespace {
// one bracket class at p (just after '['): sets `matched` for c and returns the index after ']', or npos when the class is not closed
std::size_t matchClass(const std::string& p, std::size_t i, char c, bool& matched) {
  bool neg = i < p.size() && (p[i] == '!' || p[i] == '^');
  if (neg) ++i;
  bool any = false;
  for (bool first = true; i < p.size() && (first || p[i] != ']'); first = false) {
    char lo = p[i];
    if (lo == '\\' && i + 1 < p.size()) lo = p[++i];
    char hi = lo;
    if (i + 2 < p.size() && p[i + 1] == '-' && p[i + 2] != ']') { hi = p[i + 2]; i += 2; if (hi == '\\' && i + 1 < p.size()) hi = p[++i]; }
    if (c >= lo && c <= hi) any = true;
    ++i;
  }
  if (i >= p.size()) return std::string::npos;
  matched = (any != neg) && c != '/';   // FNM_PATHNAME: a class never matches the separator
  return i + 1;
}
bool glob(const std::string& p, std::size_t pi, const std::string& s, std::size_t si) {
  while (pi < p.size()) {
    const char c = p[pi];
    if (c == '*') {
      while (pi < p.size() && p[pi] == '*') ++pi;
      for (std::size_t k = si;; ++k) {                                     // the star takes s[si, k): never a '/'
        if (glob(p, pi, s, k)) return true;
        if (k == s.size() || s[k] == '/') return false;
      }
    }
    if (si == s.size()) return false;
    if (c == '?') { if (s[si] == '/') return false; ++pi; ++si; continue; }
    if (c == '[') {
      bool m = false;
      const std::size_t next = matchClass(p, pi + 1, s[si], m);
      if (next != std::string::npos) { if (!m) return false; pi = next; ++si; continue; }
      // an unclosed '[' is an ordinary character
    }
    char lit = c;
    if (c == '\\' && pi + 1 < p.size()) lit = p[++pi];
    if (s[si] != lit) return false;
    ++pi; ++si;
  }
  return si == s.size();
}
}  // namespace
bool globMatch(const std::string& pattern, const std::string& path) { return glob(pattern, 0, path, 0); }

int run(const std::vector<std::string>& argv, const SpawnOptions& o) {
  const Pid p = spawn(argv, o);
  int code = -1;
  if (p == -1 || !wait(p, code, true)) return -1;
  return code;
}

#ifdef _WIN32
// ---------------------------------------------------------------- Windows

namespace {
std::wstring wide(const std::string& s) {
  if (s.empty()) return {};
  const int n = MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), nullptr, 0);
  std::wstring w(static_cast<std::size_t>(n), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, s.data(), static_cast<int>(s.size()), w.data(), n);
  return w;
}
std::string lastError() {
  wchar_t* msg = nullptr;
  const DWORD code = GetLastError();
  FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, nullptr, code, 0, reinterpret_cast<wchar_t*>(&msg), 0, nullptr);
  std::string out;
  if (msg) {
    const int n = WideCharToMultiByte(CP_UTF8, 0, msg, -1, nullptr, 0, nullptr, nullptr);
    out.resize(n > 0 ? static_cast<std::size_t>(n - 1) : 0);
    if (n > 1) WideCharToMultiByte(CP_UTF8, 0, msg, -1, out.data(), n, nullptr, nullptr);
    LocalFree(msg);
  }
  while (!out.empty() && (out.back() == '\n' || out.back() == '\r' || out.back() == ' ')) out.pop_back();
  return out.empty() ? "error " + std::to_string(code) : out;
}
std::string commandLine(const std::vector<std::string>& argv) {
  std::string line;
  for (const std::string& a : argv) line += (line.empty() ? "" : " ") + quoteWindowsArg(a);
  return line;
}
// CreateProcessW with stdio handles; the variables of o.env and o.unset are set around the call, as a child takes a copy of ours.
// ponytail: not thread-safe (the command line spawns from one thread); an environment block per child if that changes.
Pid create(const std::vector<std::string>& argv, const SpawnOptions& o, DWORD flags, HANDLE out, HANDLE err) {
  if (argv.empty()) return -1;
  std::vector<std::pair<std::string, std::string>> saved;
  auto keep = [&](const std::string& k) { const char* v = std::getenv(k.c_str()); saved.emplace_back(k, v ? std::string(1, '=') + v : std::string()); };
  for (const auto& kv : o.env) { keep(kv.first); _putenv_s(kv.first.c_str(), kv.second.c_str()); }
  for (const std::string& k : o.unset) { keep(k); _putenv_s(k.c_str(), ""); }
  STARTUPINFOW si{};
  si.cb = sizeof si;
  if (out || err) {
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
    si.hStdOutput = out ? out : GetStdHandle(STD_OUTPUT_HANDLE);
    si.hStdError = err ? err : GetStdHandle(STD_ERROR_HANDLE);
  }
  std::wstring cmd = wide(commandLine(argv));
  const std::wstring cwd = wide(o.cwd);
  PROCESS_INFORMATION pi{};
  const BOOL ok = CreateProcessW(nullptr, cmd.data(), nullptr, nullptr, (out || err) ? TRUE : FALSE, flags | (o.newGroup ? CREATE_NEW_PROCESS_GROUP : 0),
                                 nullptr, cwd.empty() ? nullptr : cwd.c_str(), &si, &pi);
  for (auto it = saved.rbegin(); it != saved.rend(); ++it) _putenv_s(it->first.c_str(), it->second.empty() ? "" : it->second.c_str() + 1);
  if (!ok) return -1;
  CloseHandle(pi.hThread);
  return reinterpret_cast<Pid>(pi.hProcess);
}
HANDLE nullDevice() {
  SECURITY_ATTRIBUTES sa{sizeof sa, nullptr, TRUE};
  return CreateFileW(L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, OPEN_EXISTING, 0, nullptr);
}
}  // namespace

std::string homeDir() {
  if (const char* h = std::getenv("USERPROFILE"); h && *h) return h;
  if (const char* h = std::getenv("HOME"); h && *h) return h;
  return "";
}
std::string exePath() {
  char buf[MAX_PATH];
  const DWORD n = GetModuleFileNameA(nullptr, buf, MAX_PATH);
  return n > 0 && n < MAX_PATH ? std::string(buf, n) : std::string();
}
std::string shellPath() {
  if (const char* p = std::getenv("PATH"); p && *p) {
    std::string seg;
    for (const char* c = p;; ++c) {
      if (*c == ';' || *c == 0) {
        if (!seg.empty()) {
          const std::string f = seg + (seg.back() == '\\' || seg.back() == '/' ? "" : "\\") + "sh.exe";
          std::error_code ec;
          if (std::filesystem::exists(f, ec)) return f;
        }
        seg.clear();
        if (!*c) break;
      } else seg += *c;
    }
  }
  // Git for Windows' usr\bin is not on the PATH of a barely configured machine: the usual install places
  static const char* const bases[] = {std::getenv("ProgramW6432"), std::getenv("ProgramFiles"), "C:\\Program Files"};
  for (const char* b : bases) {
    if (!b || !*b) continue;
    const std::string p = std::string(b) + "\\Git\\usr\\bin\\sh.exe";
    std::error_code ec;
    if (std::filesystem::exists(p, ec)) return p;
  }
  return "";
}
bool isTerminal(int fd) { return _isatty(fd) != 0; }
bool fileStamp(const std::string& path, long long& size, long long& mtimeNs) {
  WIN32_FILE_ATTRIBUTE_DATA d;
  if (!GetFileAttributesExW(wide(path).c_str(), GetFileExInfoStandard, &d)) return false;
  size = static_cast<long long>((static_cast<unsigned long long>(d.nFileSizeHigh) << 32) | d.nFileSizeLow);
  const unsigned long long t = (static_cast<unsigned long long>(d.ftLastWriteTime.dwHighDateTime) << 32) | d.ftLastWriteTime.dwLowDateTime;
  mtimeNs = (static_cast<long long>(t) - 116444736000000000LL) * 100;   // 100 ns ticks since 1601 to ns since 1970
  return true;
}

void* libOpen(const std::string& path, bool) { return reinterpret_cast<void*>(LoadLibraryW(wide(path).c_str())); }
void* libSymbol(void* lib, const char* name) { return lib ? reinterpret_cast<void*>(GetProcAddress(static_cast<HMODULE>(lib), name)) : nullptr; }
void libClose(void* lib) { if (lib) FreeLibrary(static_cast<HMODULE>(lib)); }
std::string libError() { return lastError(); }
const char* libSuffix() { return ".dll"; }

Pid spawn(const std::vector<std::string>& argv, const SpawnOptions& o) {
  if (!o.quiet) return create(argv, o, 0, nullptr, nullptr);
  HANDLE nul = nullDevice();
  const Pid p = create(argv, o, 0, nul, nul);
  CloseHandle(nul);
  return p;
}
bool wait(Pid pid, int& code, bool block) {
  HANDLE h = reinterpret_cast<HANDLE>(pid);
  if (WaitForSingleObject(h, block ? INFINITE : 0) != WAIT_OBJECT_0) return false;
  DWORD c = 0;
  code = GetExitCodeProcess(h, &c) ? static_cast<int>(c) : -1;
  CloseHandle(h);
  return true;
}
void stop(Pid pid) {
  // ponytail: ends the child only, not what it started; a job object per newGroup child when `zinc dev` runs on Windows
  HANDLE h = reinterpret_cast<HANDLE>(pid);
  TerminateProcess(h, 1);
  WaitForSingleObject(h, INFINITE);
  CloseHandle(h);
}
int capture(const std::vector<std::string>& argv, std::string& out) {
  SECURITY_ATTRIBUTES sa{sizeof sa, nullptr, TRUE};
  HANDLE r = nullptr, w = nullptr;
  if (!CreatePipe(&r, &w, &sa, 0)) return -1;
  SetHandleInformation(r, HANDLE_FLAG_INHERIT, 0);
  const Pid p = create(argv, {}, 0, w, nullptr);
  CloseHandle(w);
  if (p == -1) { CloseHandle(r); return -1; }
  char buf[4096];
  DWORD n = 0;
  while (ReadFile(r, buf, sizeof buf, &n, nullptr) && n > 0) out.append(buf, n);
  CloseHandle(r);
  int code = -1;
  wait(p, code, true);
  return code;
}
void spawnDetached(const std::vector<std::string>& argv) {
  const Pid p = create(argv, {}, DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP, nullptr, nullptr);
  if (p != -1) CloseHandle(reinterpret_cast<HANDLE>(p));
}
void replaceProcess(const std::string& path, const std::vector<std::string>& argv) {
  std::vector<std::string> a = argv;
  if (a.empty()) a.push_back(path); else a[0] = path;
  std::fflush(nullptr);
  const int code = run(a);
  if (code != -1) std::exit(code);
}
int exitStatus(int systemResult) { return systemResult; }   // the C runtime's system() returns the exit code itself

const char* osName() { return "windows"; }
std::string machine() {
#if defined(_M_ARM64) || defined(__aarch64__)
  return "aarch64";
#else
  return "x86_64";
#endif
}
long long maxRssBytes() {
  PROCESS_MEMORY_COUNTERS c{};
  return GetProcessMemoryInfo(GetCurrentProcess(), &c, sizeof c) ? static_cast<long long>(c.PeakWorkingSetSize) : 0;
}

}  // namespace zn::plat

int setenv(const char* name, const char* value, int overwrite) {
  if (!overwrite && std::getenv(name)) return 0;
  return _putenv_s(name, value) == 0 ? 0 : -1;
}
int unsetenv(const char* name) { return _putenv_s(name, "") == 0 ? 0 : -1; }
char* realpath(const char* path, char* resolved) { return _fullpath(resolved, path, resolved ? _MAX_PATH : 0); }

#else
// ---------------------------------------------------------------- POSIX

std::string homeDir() {
  const char* h = std::getenv("HOME");
  return h ? h : "";
}
std::string exePath() { return ""; }
std::string shellPath() { return "/bin/sh"; }
bool isTerminal(int fd) { return ::isatty(fd) != 0; }
bool fileStamp(const std::string& path, long long& size, long long& mtimeNs) {
  struct stat st;
  if (::stat(path.c_str(), &st) != 0) return false;
  size = static_cast<long long>(st.st_size);
#ifdef __APPLE__
  mtimeNs = static_cast<long long>(st.st_mtimespec.tv_sec) * 1000000000LL + st.st_mtimespec.tv_nsec;
#else
  mtimeNs = static_cast<long long>(st.st_mtim.tv_sec) * 1000000000LL + st.st_mtim.tv_nsec;
#endif
  return true;
}

void* libOpen(const std::string& path, bool global) { return ::dlopen(path.c_str(), RTLD_NOW | (global ? RTLD_GLOBAL : RTLD_LOCAL)); }
void* libSymbol(void* lib, const char* name) { return ::dlsym(lib, name); }
void libClose(void* lib) { if (lib) ::dlclose(lib); }
std::string libError() { const char* e = ::dlerror(); return e ? e : "unknown error"; }
const char* libSuffix() {
#ifdef __APPLE__
  return ".dylib";
#else
  return ".so";
#endif
}

Pid spawn(const std::vector<std::string>& argv, const SpawnOptions& o) {
  if (argv.empty()) return -1;
  const pid_t pid = ::fork();
  if (pid != 0) return pid < 0 ? -1 : pid;
  if (o.newGroup) ::setpgid(0, 0);
  for (const std::string& k : o.unset) ::unsetenv(k.c_str());
  for (const auto& kv : o.env) ::setenv(kv.first.c_str(), kv.second.c_str(), 1);
  if (!o.cwd.empty() && ::chdir(o.cwd.c_str()) != 0) ::_exit(127);
  if (o.quiet) { int fd = ::open("/dev/null", O_WRONLY); if (fd >= 0) { ::dup2(fd, 1); ::dup2(fd, 2); } }
  std::vector<char*> a;
  for (const std::string& x : argv) a.push_back(const_cast<char*>(x.c_str()));
  a.push_back(nullptr);
  ::execvp(a[0], a.data());
  ::_exit(127);
}
bool wait(Pid pid, int& code, bool block) {
  int st = 0;
  pid_t r;
  while ((r = ::waitpid(static_cast<pid_t>(pid), &st, block ? 0 : WNOHANG)) < 0 && errno == EINTR) {}
  if (r == 0) return false;
  code = r > 0 && WIFEXITED(st) ? WEXITSTATUS(st) : -1;
  return true;
}
void stop(Pid pid) {
  if (pid <= 0) return;
  const pid_t p = static_cast<pid_t>(pid);
  ::kill(-p, SIGTERM);
  for (int i = 0; i < 25; ++i) { int st; if (::waitpid(p, &st, WNOHANG) == p) return; std::this_thread::sleep_for(std::chrono::milliseconds(10)); }
  ::kill(-p, SIGKILL);
  int st;
  ::waitpid(p, &st, 0);
}
int capture(const std::vector<std::string>& argv, std::string& out) {
  if (argv.empty()) return -1;
  int fd[2];
  if (::pipe(fd) != 0) return -1;
  const pid_t pid = ::fork();
  if (pid < 0) { ::close(fd[0]); ::close(fd[1]); return -1; }
  if (pid == 0) {
    ::dup2(fd[1], 1); ::close(fd[0]); ::close(fd[1]);
    std::vector<char*> a;
    for (const std::string& x : argv) a.push_back(const_cast<char*>(x.c_str()));
    a.push_back(nullptr);
    ::execvp(a[0], a.data());
    ::_exit(127);
  }
  ::close(fd[1]);
  char buf[4096];
  for (ssize_t k; (k = ::read(fd[0], buf, sizeof buf)) != 0;) {
    if (k < 0) { if (errno == EINTR) continue; break; }
    out.append(buf, static_cast<std::size_t>(k));
  }
  ::close(fd[0]);
  int code = -1;
  wait(pid, code, true);
  return code;
}
void spawnDetached(const std::vector<std::string>& argv) {
  if (argv.empty()) return;
  const pid_t p = ::fork();
  if (p == 0) {
    if (::fork() == 0) {   // a grandchild: nobody waits for it, init reaps it
      ::setsid();
      const int fd = ::open("/dev/null", O_RDWR);
      for (int k = 0; k < 3; ++k) ::dup2(fd, k);
      std::vector<char*> a;
      for (const std::string& x : argv) a.push_back(const_cast<char*>(x.c_str()));
      a.push_back(nullptr);
      ::execv(a[0], a.data());
    }
    ::_exit(0);
  }
  if (p > 0) ::waitpid(p, nullptr, 0);
}
void replaceProcess(const std::string& path, const std::vector<std::string>& argv) {
  std::vector<char*> a;
  for (const std::string& x : argv) a.push_back(const_cast<char*>(x.c_str()));
  a.push_back(nullptr);
  ::execv(path.c_str(), a.data());
}
int exitStatus(int systemResult) { return systemResult != -1 && WIFEXITED(systemResult) ? WEXITSTATUS(systemResult) : -1; }

const char* osName() {
#ifdef __APPLE__
  return "macos";
#else
  return "linux";
#endif
}
std::string machine() {
  struct utsname un {};
  ::uname(&un);
  return un.machine;
}
long long maxRssBytes() {
  rusage ru{};
  ::getrusage(RUSAGE_SELF, &ru);
#ifdef __APPLE__
  return static_cast<long long>(ru.ru_maxrss);          // bytes on macOS
#else
  return static_cast<long long>(ru.ru_maxrss) * 1024;   // KiB on Linux
#endif
}

}  // namespace zn::plat
#endif

