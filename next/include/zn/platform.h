// The operating system a program runs on, as zinc:sys platform() and React Native's Platform.OS name it: android, ios, macos, linux.
// ZINC_PLATFORM=android|ios|macos|linux forces it (tests on the desktop run a phone's behaviour: scroll physics, transitions, back key;
// docs/reports/mobile-native-feel.md). The compiler takes the same name for zinc:platform TARGET and the `x.<name>.ts` platform files.
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
#else
  return "linux";
#endif
}
inline bool knownPlatform(const char* p) { return p && (!strcmp(p, "android") || !strcmp(p, "ios") || !strcmp(p, "macos") || !strcmp(p, "linux")); }
// ZINC_PLATFORM when it names one of the four, else the platform this binary was built for
inline const char* runPlatform() { const char* p = getenv("ZINC_PLATFORM"); return knownPlatform(p) ? p : builtPlatform(); }
}  // namespace zn
