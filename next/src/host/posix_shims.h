// POSIX calls the host library uses, delivered on Windows (mingw-w64 through the pinned zig, docs/targets/windows.md).
// Included by the host files only: the real POSIX declarations stay untouched on the mac and Linux. mingw-w64 ships
// dirent.h, unistd.h, sys/time.h and the process environment, so only what the CRT leaves out is here.
#pragma once
#ifndef _WIN32
#include <unistd.h>
#include <pwd.h>
#else
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <io.h>
#include <direct.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <errno.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <dirent.h>   // mingw-w64's own: _WDIR and DIR are as the POSIX ones are

// ---- process and identity: a Windows user's home and name live in the environment
struct passwd {
  const char* pw_name;   // USERNAME
  const char* pw_dir;    // USERPROFILE
  const char* pw_shell;  // COMSPEC, the nearest NT has to a login shell
};
inline passwd* getpwuid(unsigned) {
  static passwd pw = {getenv("USERNAME"), getenv("USERPROFILE"), getenv("COMSPEC")};
  return &pw;
}
inline unsigned getuid(void) { return 0; }
inline unsigned getgid(void) { return 0; }
inline int kill(pid_t pid, int) {   // Windows knows no signals between processes: a stop is a TerminateProcess
  HANDLE h = OpenProcess(PROCESS_TERMINATE, FALSE, static_cast<DWORD>(pid));
  if (!h) return -1;
  const int ok = TerminateProcess(h, 9) != 0;
  CloseHandle(h);
  return ok ? 0 : -1;
}

// ---- environment: the same functions, the same semantics; _putenv_s keeps the copy the CRT owns
inline int setenv(const char* name, const char* value, int) { return _putenv_s(name, value ? value : ""); }
inline int unsetenv(const char* name) { return _putenv_s(name, "") == 0 ? 0 : -1; }   // an empty value removes it from the block
// environ: the process's environment, refreshed (and the last one freed) on each call: the callers read it straight through
#define environ zn_posix_environ()
inline char** zn_posix_environ(void) {
  static char** held = nullptr;
  if (held) { for (char** h = held; *h; ++h) delete[] *h; delete[] held; held = nullptr; }
  char* s = GetEnvironmentStrings();
  if (!s) return nullptr;
  size_t count = 0;
  for (char* e = s; *e; ++count) { while (*e) ++e; ++e; }   // "NAME=VALUE" entries, each closed by a null
  held = new char*[count + 1]{};
  size_t i = 0;
  for (char* e = s; *e && i < count; ++i) {
    const size_t n = strlen(e);
    char* copy = new char[n + 1];
    memcpy(copy, e, n + 1);
    held[i] = copy;
    while (*e) ++e;
    ++e;
  }
  held[count] = nullptr;
  FreeEnvironmentStringsA(s);
  return held;
}

// ---- files: the calls the CRT's io.h leaves out
#define realpath zn_realpath
inline char* zn_realpath(const char* path, char* out) { return _fullpath(out, path, 4096); }
#define lstat stat   // links read their target later (NTFS reparse points rare in a Zinc program)
inline ssize_t readlink(const char*, char* b, size_t) { errno = EINVAL; return -1; }
inline int symlink(const char* target, const char* link) {
  const int rc = CreateSymbolicLinkA(link, target, 0) != FALSE ? 0 : -1;
  if (rc != 0) errno = EPERM;   // a symbolic link needs Developer Mode or a privilege
  return rc;
}
#define rmdir _rmdir
#define unlink _unlink
#define chmod zn_chmod
inline int zn_chmod(const char* path, mode_t mode) {
  // one write bit at least: not read-only; no write bit: read-only (Windows has only this bit)
  DWORD attrs = GetFileAttributesA(path);
  if (attrs == INVALID_FILE_ATTRIBUTES) return -1;
  if (mode & 0222) attrs &= ~FILE_ATTRIBUTE_READONLY;
  else attrs |= FILE_ATTRIBUTE_READONLY;
  return SetFileAttributesA(path, attrs) ? 0 : -1;
}
#define mkdir zn_mkdir   // mingw's mkdir takes no mode
inline int zn_mkdir(const char* path, mode_t) { return _mkdir(path); }
#define S_ISLNK(m) 0   // lstat is stat here: links are followed, a listing reports no entry as a link
inline char* mkdtemp_shim(char* tpl) {
  // `prefixXXXXXX`: the six characters random, a directory whole and empty, the name kept in the template
  const size_t n = strlen(tpl);
  if (n < 6) { errno = EINVAL; return nullptr; }
  const size_t at = n - 6;
  static const char* cs = "0123456789abcdefghjklmnpqrstuvwxyz";
  for (int tries = 0; tries < 64; ++tries) {
    unsigned v = (GetTickCount() << 8) ^ (tries * 7919u) ^ static_cast<unsigned>(GetCurrentProcessId());
    for (int i = 5; i >= 0; --i) { tpl[at + i] = cs[v % 31]; v /= 31; }
    if (CreateDirectoryA(tpl, nullptr)) return tpl;
    if (GetLastError() != ERROR_ALREADY_EXISTS) { errno = EIO; return nullptr; }
  }
  errno = EEXIST;
  return nullptr;
}
#define mkdtemp mkdtemp_shim
// The POSIX mmap/munmap pair assets_host.cpp and splash.cpp use is a Windows file mapping, a read-only view of the
// whole file: the caller unmaps the pointer alone.
inline void* mmap_file_shim(int fd, size_t size) {
  if (!size) return nullptr;
  HANDLE fh = CreateFileMapping(reinterpret_cast<HANDLE>(_get_osfhandle(fd)), nullptr, PAGE_READONLY, 0, 0, nullptr);
  if (!fh) return nullptr;
  void* m = MapViewOfFile(fh, FILE_MAP_READ, 0, 0, size);
  CloseHandle(fh);   // the view keeps the mapping alive as long as it is mapped
  return m;
}
#define munmap(p, s) UnmapViewOfFile(p)

// ---- host facts
#define gethostname zn_gethostname   // no Winsock start-up needed
inline int zn_gethostname(char* name, size_t len) { DWORD n = static_cast<DWORD>(len); return GetComputerNameA(name, &n) ? 0 : -1; }
inline int getloadavg_shim(double* l, int n) { for (int i = 0; i < n && i < 3; ++i) l[i] = 0; return 0; }
#define getloadavg getloadavg_shim
inline time_t time_shim(time_t* t) { return time(t); }

// utsname/uname: the facts the POSIX uname gives, from Windows' own queries
struct utsname {
  char sysname[32];   // "Windows"
  char release[64];   // 10.0.19045
  char version[4096]; // the build and the service pack
  char machine[32];   // AMD64
  char nodename[64];  // the computer's name
};
inline int uname(utsname* u) {
  if (!u) return -1;
  std::memset(u, 0, sizeof *u);
  std::strcpy(u->sysname, "Windows");
  if (const char* b = getenv("PROCESSOR_ARCHITECTURE")) std::snprintf(u->machine, sizeof u->machine, "%s", b);
  if (const char* c = getenv("COMPUTERNAME")) std::snprintf(u->nodename, sizeof u->nodename, "%s", c);
  using RtlGetVersion_t = LONG (WINAPI*)(RTL_OSVERSIONINFOW*);
  RTL_OSVERSIONINFOW v{}; v.dwOSVersionInfoSize = sizeof v;
  if (const HMODULE ntdll = GetModuleHandleA("ntdll.dll"))
    if (reinterpret_cast<RtlGetVersion_t>(GetProcAddress(ntdll, "RtlGetVersion"))(&v) == 0)
      std::snprintf(u->release, sizeof u->release, "%lu.%lu.%lu", v.dwMajorVersion, v.dwMinorVersion, v.dwBuildNumber);
  std::snprintf(u->version, sizeof u->version, "%s %s", u->release, u->machine);
  return 0;
}

// ---- signals the signal tables name: Windows carries few of them; the POSIX numbers stand in where libuv maps a
// process kill (a uv_process_kill over an unknown number errs, "unknown", and the program reports it).
#ifndef SIGHUP
#define SIGHUP 1
#endif
#ifndef SIGQUIT
#define SIGQUIT 3
#endif
#ifndef SIGUSR1
#define SIGUSR1 10
#endif
#ifndef SIGUSR2
#define SIGUSR2 12
#endif
#ifndef SIGALRM
#define SIGALRM 14
#endif
#ifndef SIGCHLD
#define SIGCHLD 20
#endif
#ifndef SIGCONT
#define SIGCONT 19
#endif
#ifndef SIGSTOP
#define SIGSTOP 17
#endif
#ifndef SIGPIPE
#define SIGPIPE 13
#endif
#ifndef SIGWINCH
#define SIGWINCH 28
#endif
#endif  // _WIN32
