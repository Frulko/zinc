#include "zrt.h"
#include "mod/sys.h"
#include <stdlib.h>
#include <string.h>
#ifndef ZRT_PLATFORM
#define ZRT_PLATFORM "unknown"
#endif

namespace zrt {
extern int zrt_argc;
extern char** zrt_argv;
namespace sys {
Array<String> args() {
  Array<String> r = Array<String>::with_cap(0);
  for (int i = 1; i < zrt_argc; i++) r.push(String::from(zrt_argv[i], (uint32_t)strlen(zrt_argv[i])));
  return r;
}
String env(const String& name) {
  StrBuilder sb; to_s(sb, name); sb.ch('\0');
  const char* v = getenv(sb.buf);
  return v ? String::from(v, (uint32_t)strlen(v)) : String();
}
void exit(int32_t code) { hal_shutdown(); ::exit(code); }
String platform() { return String::from(ZRT_PLATFORM, (uint32_t)strlen(ZRT_PLATFORM)); }
double clock() { return now_ms(); }
int32_t liveObjects() { return (int32_t)live_objects; }
int32_t allocations() { return (int32_t)alloc_count; }
}}
