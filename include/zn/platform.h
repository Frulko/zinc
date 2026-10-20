// The operating system a program runs on, as zinc:sys platform() and React Native's Platform.OS name it: android, ios, macos, linux, windows, webos.
// ZINC_PLATFORM=<one of them> forces it (tests on the desktop run a phone's behaviour: scroll physics, transitions, back key;
// docs/reports/mobile-native-feel.md). The compiler takes the same name for zinc:platform TARGET and the `x.<name>.ts` platform files, and
// `zinc build --target` sets it to the target's OS (a webOS build takes x.webos.ts).
#pragma once
#include <stdlib.h>
#include <string.h>
#if defined(__APPLE__)
#include <TargetConditionals.h>
#endif

namespace zn {
inline const char* builtPlatform() {
#if defined(__ANDROID__)
  return "android";
#elif defined(__APPLE__) && TARGET_OS_IPHONE
  return "ios";
#elif defined(__APPLE__)
  return "macos";
#elif defined(_WIN32)
  return "windows";
#else
  return "linux";   // ponytail: a webOS build says linux at run time (its files are chosen at compile time); a define of the armv7-webos target would name it
#endif
}
inline bool knownPlatform(const char* p) {
  return p && (!strcmp(p, "android") || !strcmp(p, "ios") || !strcmp(p, "macos") || !strcmp(p, "linux") || !strcmp(p, "windows") || !strcmp(p, "webos"));
}
// ZINC_PLATFORM when it names one of them, else the platform this binary was built for
inline const char* runPlatform() { const char* p = getenv("ZINC_PLATFORM"); return knownPlatform(p) ? p : builtPlatform(); }
}  // namespace zn
