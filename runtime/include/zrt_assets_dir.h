// The assets/ directory of a program built ahead of time, shared by the host's zinc:assets (next/src/host/sys_host.cpp) and zinc:webview's
// zinc:// URLs (ZN-314, ZN-645): assets/ beside the executable (zinc export), in the bundle's Resources (the .app of zinc export: the
// executable is in Contents/MacOS), one level above it (zinc build writes <project>/build/<name>); with `cwd`, else the assets/ of the
// directory the program was started in. "" when none. ZINC_ASSETS, which zinc run sets, is the callers' to check first.
#pragma once
#include <limits.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <unistd.h>
#include <string>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#endif

inline std::string zrt_program_assets_dir(bool cwd) {
  std::string bases[4];
  int n = 0;
  char exe[PATH_MAX], real[PATH_MAX];
#ifdef __APPLE__
  uint32_t size = sizeof exe;
  const bool have = _NSGetExecutablePath(exe, &size) == 0;
#else
  const ssize_t len = readlink("/proc/self/exe", exe, sizeof exe - 1);
  const bool have = len > 0;
  if (have) exe[len] = 0;
#endif
  if (have && realpath(exe, real)) {
    const std::string path = real, dir = path.substr(0, path.find_last_of('/')), up = dir.substr(0, dir.find_last_of('/'));
    bases[n++] = dir;
    bases[n++] = up + "/Resources";
    bases[n++] = up;
  }
  if (cwd && getcwd(real, sizeof real)) bases[n++] = real;
  for (int i = 0; i < n; i++) {
    struct stat st;
    if (stat((bases[i] + "/assets").c_str(), &st) == 0 && S_ISDIR(st.st_mode)) return bases[i] + "/assets";
  }
  return std::string();
}
