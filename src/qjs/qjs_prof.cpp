// The QuickJS profiler (ZN-598), in builds with -DZN_QJS_PROFILE=ON only: the hooks of third_party/quickjs-ng/patches/0001-profile-hooks.patch
// count the opcodes executed, the calls and backward jumps of each bytecode function, and a SIGPROF timer samples the running JS function
// (time in a C function counts for its JS caller). `zinc profile <file> --engine quickjs` prints the report at exit (docs/reports/zinc-next-profiling.md).
// ZN_QJS_DUMP=<file> also writes each called function with its counts and bytecode, one JSON object per line, for tools/qjs2c (ZN-599).
#include <sys/time.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <csignal>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "quickjs.h"

extern "C" {
extern uint64_t zn_qjs_prof_ops[256];
const void* JS_ZnProfCurrent(JSRuntime* rt);
void JS_ZnProfDescribe(JSRuntime* rt, const void* b, const void* fobj, char* name, int name_size, char* file, int file_size, int* line, int* col);
void JS_ZnProfBytecode(const void* b, const uint8_t** code, int* len, int* kind, int* stack_size);
}

namespace {

const char* const kOpNames[] = {
#define FMT(f)
#define DEF(id, size, n_pop, n_push, f) #id,
#define def(id, size, n_pop, n_push, f)
#include "quickjs-opcode.h"
#undef def
#undef DEF
#undef FMT
};

// One bytecode function, named when first seen (while it is alive); when the engine frees it, its row keeps its counts and leaves the address to
// the next function there. ponytail: a fixed table of 16k functions without allocation (the sampler writes it from a signal handler), the rest
// is "other".
struct Fn {
  std::atomic<const void*> b{nullptr};
  std::atomic<bool> named{false};
  uint64_t calls = 0, loops = 0;
  std::atomic<uint64_t> samples{0};
  char name[64], file[400];
  int line = 0, col = 0, kind = 0, stack = 0;
  std::vector<uint8_t>* code = nullptr;   // ZN_QJS_DUMP: copied at the first call
};
constexpr size_t kFns = 1 << 14;
Fn gFns[kFns];
std::atomic<uint64_t> gOutside{0}, gOther{0};
JSRuntime* gRt = nullptr;
int gHz = 0;
char gCwd[1024];
size_t gCwdLen = 0;
const char* gDump = nullptr;

const void* const kFreed = reinterpret_cast<const void*>(1);
size_t hashOf(const void* b) { return (reinterpret_cast<uintptr_t>(b) >> 4) * 0x9E3779B97F4A7C15ull >> 50; }   // 14 bits: kFns

Fn* slot(const void* b, const void* fobj = nullptr) {
  size_t h = hashOf(b);
  for (size_t k = 0; k < 64; ++k) {
    Fn& f = gFns[(h + k) & (kFns - 1)];
    const void* cur = f.b.load(std::memory_order_acquire);
    if (cur == b) return f.named.load(std::memory_order_acquire) ? &f : nullptr;
    if (!cur && f.b.compare_exchange_strong(cur, b)) {
      JS_ZnProfDescribe(gRt, b, fobj, f.name, sizeof f.name, f.file, sizeof f.file, &f.line, &f.col);
      f.named.store(true, std::memory_order_release);
      return &f;
    }
    if (cur == b) return f.named.load(std::memory_order_acquire) ? &f : nullptr;
  }
  return nullptr;
}

void onSample(int) {
  const void* b = gRt ? JS_ZnProfCurrent(gRt) : nullptr;
  if (!b) { gOutside.fetch_add(1, std::memory_order_relaxed); return; }
  if (Fn* f = slot(b)) f->samples.fetch_add(1, std::memory_order_relaxed);
  else gOther.fetch_add(1, std::memory_order_relaxed);
}

bool gQuiet = false;

void report() {
  itimerval off{};
  setitimer(ITIMER_PROF, &off, nullptr);
  std::vector<Fn*> fns;
  uint64_t inJs = 0;
  for (Fn& f : gFns) if (f.named.load()) { fns.push_back(&f); inJs += f.samples.load(); }
  inJs += gOther.load();
  std::sort(fns.begin(), fns.end(), [](Fn* a, Fn* b) { return a->samples != b->samples ? a->samples > b->samples : a->calls > b->calls; });
  uint64_t total = inJs + gOutside.load(), ops = 0;
  for (uint64_t n : zn_qjs_prof_ops) ops += n;
  FILE* o = gQuiet ? nullptr : stderr;
  if (o) std::fprintf(o, "\nQuickJS profile: %llu samples at %d Hz (%llu in JS functions, %llu outside JS), %zu functions, %llu bytecodes executed\n",
               (unsigned long long)total, gHz, (unsigned long long)inJs, (unsigned long long)gOutside.load(), fns.size(), (unsigned long long)ops);
  if (o) std::fprintf(o, "%8s %6s %10s %10s  %-32s %s\n", "samples", "%", "calls", "back-jumps", "function", "file:line:col");
  for (size_t k = 0; o && k < fns.size() && k < 30; ++k) {
    const Fn& f = *fns[k];
    const char* file = f.file[0] ? f.file : "?";
    if (gCwdLen && !std::strncmp(file, gCwd, gCwdLen) && file[gCwdLen] == '/') file += gCwdLen + 1;   // paths under the working directory, relative
    std::fprintf(o, "%8llu %5.1f%% %10llu %10llu  %-32s %s:%d:%d\n", (unsigned long long)f.samples.load(), total ? 100.0 * f.samples.load() / total : 0.0,
                 (unsigned long long)f.calls, (unsigned long long)f.loops, f.name[0] ? f.name : "<anonymous>", file, f.line, f.col);
  }
  if (o && gOther.load()) std::fprintf(o, "%8llu  in functions past the table's %zu\n", (unsigned long long)gOther.load(), kFns);
  std::vector<int> order;
  for (int k = 0; k < int(sizeof kOpNames / sizeof *kOpNames); ++k) if (zn_qjs_prof_ops[k]) order.push_back(k);
  std::sort(order.begin(), order.end(), [](int a, int b) { return zn_qjs_prof_ops[a] > zn_qjs_prof_ops[b]; });
  if (o) std::fprintf(o, "opcode mix (%zu opcodes used):\n", order.size());
  for (size_t k = 0; o && k < order.size() && k < 30; ++k)
    std::fprintf(o, "%12llu %5.1f%%  %s\n", (unsigned long long)zn_qjs_prof_ops[order[k]], 100.0 * zn_qjs_prof_ops[order[k]] / ops, kOpNames[order[k]]);
  if (!gDump) return;
  std::string path = gDump;
  if (!path.empty() && path.back() == '/') path += std::to_string(getpid()) + ".jsonl";   // a directory: one file per process (test262 runs)
  FILE* d = std::fopen(path.c_str(), "w");
  if (!d) { std::fprintf(stderr, "cannot write %s\n", path.c_str()); return; }
  auto str = [d](const char* s) {
    std::fputc('"', d);
    for (; *s; ++s) if (*s == '"' || *s == '\\') std::fprintf(d, "\\%c", *s); else if ((unsigned char)*s < 32) std::fprintf(d, "\\u%04x", *s); else std::fputc(*s, d);
    std::fputc('"', d);
  };
  for (const Fn* f : fns) {
    if (!f->code) continue;
    std::fputs("{\"file\": ", d); str(f->file);
    std::fputs(", \"name\": ", d); str(f->name);
    std::fprintf(d, ", \"line\": %d, \"col\": %d, \"kind\": %d, \"stack\": %d, \"samples\": %llu, \"calls\": %llu, \"code\": \"", f->line, f->col, f->kind, f->stack,
                 (unsigned long long)f->samples.load(), (unsigned long long)f->calls);
    for (uint8_t c : *f->code) std::fprintf(d, "%02x", c);
    std::fputs("\"}\n", d);
  }
  std::fclose(d);
}

}  // namespace

extern "C" {
uint64_t zn_qjs_prof_ops[256];
void zn_qjs_prof_call(JSRuntime*, const void* b, const void* fobj) {
  if (!gRt) return;
  Fn* f = slot(b, fobj);
  if (!f) return;
  ++f->calls;
  if (gDump && !f->code) {
    const uint8_t* code;
    int len;
    JS_ZnProfBytecode(b, &code, &len, &f->kind, &f->stack);
    f->code = new std::vector<uint8_t>(code, code + len);
  }
}
void zn_qjs_prof_loop(const void* b) { if (gRt) if (Fn* f = slot(b)) ++f->loops; }
void zn_qjs_prof_free(const void* b) {
  if (!gRt) return;
  size_t h = hashOf(b);
  for (size_t k = 0; k < 64; ++k) {
    Fn& f = gFns[(h + k) & (kFns - 1)];
    const void* cur = f.b.load(std::memory_order_acquire);
    if (!cur) return;
    if (cur == b) { f.b.store(kFreed, std::memory_order_release); return; }
  }
}
}

namespace zn::qjs {

// Counts from now on and samples `hz` times per second of CPU; the report goes to stderr when the process exits.
void profileStart(JSRuntime* rt, int hz) {
  gRt = rt;
  if (getcwd(gCwd, sizeof gCwd)) gCwdLen = std::strlen(gCwd);
  gDump = std::getenv("ZN_QJS_DUMP");
  gQuiet = hz <= 0;
  gHz = hz > 0 ? std::clamp(hz, 10, 10000) : 1000;
  struct sigaction sa{};
  sa.sa_handler = onSample;
  sa.sa_flags = SA_RESTART;
  sigaction(SIGPROF, &sa, nullptr);
  itimerval t{};
  t.it_interval.tv_usec = t.it_value.tv_usec = 1000000 / gHz;
  setitimer(ITIMER_PROF, &t, nullptr);
  std::atexit(report);
}

}  // namespace zn::qjs
