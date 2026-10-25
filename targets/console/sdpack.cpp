// The asset packs a console reads beside the program (Pocket Tokyo's streamed cells, docs/reports/pocket3d-techniques.md 2.2), and a reader
// thread that reads and checks what a frame will want before it asks:
//   - the packs on the card: every <group>.zpk of the program's folder, which tools/console-demos writes from zinc pack's packs/ beside the
//     pack linked into the core. 3DS: the folder named as the .3dsx beside it (sdmc:/3ds/tokyo.3dsx -> sdmc:/3ds/tokyo/); PSP: the EBOOT's
//     folder (ms0:/PSP/GAME/tokyo/); Vita: app0:, inside the .vpk. ZINC_SD_DIR names another (the emulators that give the program no path).
//     A pack there is opened over its index alone (the data stays on the card); gfx_stubs.cpp falls back to it for what the linked pack has not.
//   - the pack linked into the core: its large entries are checked and inflated by the thread too (a 3DS mid chunk took 15 to 70 ms in the
//     frame that read it).
// The World asks for a chunk and its pictures before it loads them (render3d.host.cpp worldLoad, zn_asset_ready): the thread reads them into
// a few slots, and the frame takes them (zn_console_side_take) without waiting. An entry asked for directly is read then (zn_console_side_read).
// The thread runs below the program's priority: on the 3DS on the other core, on the Vita on the two other user cores, on the PSP (one core)
// in the time the program waits for the vblank and the GE, as Pocket Tokyo's reader (priority 36 under the frame's 32).
#include <dirent.h>
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <unistd.h>

#include <memory>
#include <string>
#include <vector>

#include "zpk/zpk.h"

#if defined(__3DS__)
#include <3ds.h>
#elif defined(__PSP__)
#include <pspkernel.h>
#include <pspthreadman.h>
#elif defined(__vita__)
#include <psp2/kernel/processmgr.h>
#include <psp2/kernel/threadmgr.h>
#endif

extern "C" {
extern const unsigned char* zn_console_pack;   // host_console.cpp (weak: none) or the core's embedded pack
extern unsigned long zn_console_pack_size;
void hal_log(const char* s, size_t n);         // the console's HAL: its log
#if defined(__3DS__)
size_t zn_console_heap_held(void);             // hal_n3ds.cpp
extern int __system_argc;                      // libctru: the program's arguments (the Homebrew Launcher gives its path)
extern char** __system_argv;
#endif
}

namespace {

// ---------------------------------------------------------------- the console's threads and clock
#if defined(__3DS__)
struct Lock { LightLock l; void init() { LightLock_Init(&l); } void on() { LightLock_Lock(&l); } void off() { LightLock_Unlock(&l); } };
struct Wake { LightEvent e; void init() { LightEvent_Init(&e, RESET_ONESHOT); } void wait() { LightEvent_Wait(&e); } void signal() { LightEvent_Signal(&e); } };
double nowMs() { return (double)svcGetSystemTick() * 1000.0 / SYSCLOCK_ARM11; }
Thread reader = nullptr;
void (*body)() = nullptr;
void entry(void*) { body(); }
bool start(void (*fn)()) {
  body = fn;
  // the other core when the system lends it (80% of it: checking and inflating a 300 KB mid chunk took 140 ms at 30%), else this one: below
  // the program, in the time it waits for the screen
  s32 prio = 0x30;
  svcGetThreadPriority(&prio, CUR_THREAD_HANDLE);
  APT_SetAppCpuTimeLimit(80);
  reader = threadCreate(entry, nullptr, 32 * 1024, prio + 1, 1, false);
  if (!reader) reader = threadCreate(entry, nullptr, 32 * 1024, prio + 1, -2, false);
  return reader != nullptr;
}
void join() { if (reader) { threadJoin(reader, 1000000000ull); threadFree(reader); reader = nullptr; } }
#else   // the PSP and the Vita: the same kernel calls (a semaphore as the lock)
struct Lock {
  SceUID s = -1;
  void init() { s = sceKernelCreateSema("zinc pack lock", 0, 1, 1, nullptr); }
  void on() { sceKernelWaitSema(s, 1, nullptr); }
  void off() { sceKernelSignalSema(s, 1); }
};
struct Wake {
  SceUID s = -1;
  void init() { s = sceKernelCreateSema("zinc pack wake", 0, 0, 1, nullptr); }
  void wait() { sceKernelWaitSema(s, 1, nullptr); }
  void signal() { sceKernelSignalSema(s, 1); }   // at most one pending: the thread looks at the whole list when it wakes
};
#if defined(__PSP__)
double nowMs() { return (double)sceKernelGetSystemTimeWide() / 1000.0; }
#else
double nowMs() { return (double)sceKernelGetProcessTimeWide() / 1000.0; }
#endif
SceUID reader = -1;
void (*body)() = nullptr;
int entry(SceSize, void*) { body(); return 0; }
bool start(void (*fn)()) {
  body = fn;
#if defined(__PSP__)
  // one core: below the program's 32, so it runs while the frame waits for the vblank or the GE (Pocket Tokyo's 36)
  reader = sceKernelCreateThread("zinc reader", entry, 36, 64 * 1024, PSP_THREAD_ATTR_USER, nullptr);
#else
  // the two user cores the program does not start on, below its priority
  reader = sceKernelCreateThread("zinc reader", entry, 0xB0, 64 * 1024, 0, 0x00020000 | 0x00040000, nullptr);   // 0xA0 the default
#endif
  if (reader < 0) return false;
  return sceKernelStartThread(reader, 0, nullptr) >= 0;
}
void join() {
  if (reader < 0) return;
  SceUInt t = 1000000;
#if defined(__PSP__)
  sceKernelWaitThreadEnd(reader, &t);
#else
  sceKernelWaitThreadEnd(reader, nullptr, &t);
#endif
  sceKernelDeleteThread(reader);
  reader = -1;
}
#endif

// the program's folder on the card (ZINC_SD_DIR: tools/console-demos sets it for the 3DS emulator, which gives no path; on a 3DS the path
// the Homebrew Launcher gives comes first, wherever the person put the .3dsx and its folder)
std::string folder() {
#if defined(__3DS__)
  if (__system_argc > 0 && __system_argv && __system_argv[0]) {
    std::string p(__system_argv[0]);
    const size_t slash = p.rfind('/'), dot = p.rfind('.');
    if (slash != std::string::npos && dot != std::string::npos && dot > slash) return p.substr(0, dot) + "/";
  }
#endif
  if (const char* d = getenv("ZINC_SD_DIR")) if (*d) { std::string s(d); return s.back() == '/' || s.back() == ':' ? s : s + "/"; }
#if defined(__3DS__)
  return "sdmc:/3ds/zinc/";
#elif defined(__PSP__)
  char cwd[256];   // the PSP's C library starts in the EBOOT's folder
  if (getcwd(cwd, sizeof cwd) && cwd[0]) { std::string s(cwd); return s.back() == '/' ? s : s + "/"; }
  return "ms0:/PSP/GAME/zinc/";
#else
  return "app0:";
#endif
}

// ---------------------------------------------------------------- the packs and the reader
struct Pack { std::string path; std::vector<unsigned char> index; zn::zpk::Reader r; FILE* f = nullptr; };   // f null: the linked pack
struct Slot { std::string name, data; };
// names asked for ahead, entries read and not taken yet (the oldest dropped first); a linked entry smaller than kSmall, or asked for while
// kBurst wait already, is read by the frame
enum { kWant = 8, kReady = 8, kSmall = 16 * 1024, kBurst = 2 };

std::vector<std::unique_ptr<Pack>> packs;   // the card's, then the linked one
bool opened = false;
Lock lock;                       // the lists below, held a moment
Lock files;                      // the packs' files, held through a read
Wake wake;                       // a name was asked for
std::vector<std::string> want;   // in the order asked (the World asks nearest first)
std::string busy;                // the name the thread is reading
std::vector<Slot> ready;
bool running = false;
volatile bool quit = false;
// what the run cost: entries read from the card (those a frame waited for), their bytes and milliseconds, the linked entries the thread read
// and their milliseconds, the most heap in use, the least linear memory free (the 3DS's GPU memory)
uint32_t reads = 0, waited = 0, linked = 0, dropped = 0; uint64_t bytesRead = 0; double readMs = 0, linkedMs = 0; size_t peakHeap = 0, minLinear = (size_t)-1;

void say(const std::string& s) { hal_log(s.data(), s.size()); }

// the pack and row of `name` (of `kind`, or any when kind < 0)
Pack* where(const std::string& name, int kind, long* at) {
  for (auto& p : packs) {
    const long i = p->r.find(name);
    if (i >= 0 && (kind < 0 || p->r.entry((size_t)i).kind == kind)) { *at = i; return p.get(); }
  }
  return nullptr;
}
// the entry read (from the card, or the linked pack) into out, its bytes checked
bool readEntry(Pack* p, long i, const std::string& name, std::string& out) {
  std::string err;
  bool ok;
  const double t0 = nowMs();
  if (!p->f) {
    ok = p->r.read((size_t)i, out, err);
    linked++; linkedMs += nowMs() - t0;
  } else {
    const zn::zpk::Entry e = p->r.entry((size_t)i);
    std::vector<unsigned char> stored(e.storedSize ? e.storedSize : 1);
    files.on();
    ok = fseek(p->f, (long)e.offset, SEEK_SET) == 0 && fread(stored.data(), 1, e.storedSize, p->f) == e.storedSize;
    readMs += nowMs() - (double)t0;
    reads++; bytesRead += e.storedSize;
    files.off();
    if (!ok) err = "cannot read " + name + " in " + p->path;
    else {
      out.resize(e.size);
      ok = p->r.decode((size_t)i, stored.data(), reinterpret_cast<uint8_t*>(out.data()), err);
    }
  }
  if (!ok) say("zinc: " + err + "\n");
  return ok;
}

void work() {
  while (!quit) {
    lock.on();
    if (want.empty()) { lock.off(); wake.wait(); continue; }
    Slot s{want.front(), std::string()};
    want.erase(want.begin());
    busy = s.name;
    lock.off();
    long i = -1;
    Pack* p = where(s.name, -1, &i);
    const bool ok = p && readEntry(p, i, s.name, s.data);
    lock.on();
    if (ok) {
      if (ready.size() >= kReady) { ready.erase(ready.begin()); dropped++; }   // asked for and never taken (the eye turned away)
      ready.push_back(std::move(s));
    }
    busy.clear();
    lock.off();
  }
}

// the numbers so far (the memory too without packs: the same program's peak without its streamed level)
void numbers() {
  char line[320];
  snprintf(line, sizeof line, "zinc: sd packs: %lu entries read (%lu while a frame waited), %lu KB, %.1f ms each; %lu linked entries read ahead, %.1f ms each; %lu never taken; heap at most %lu KB, linear memory free at least %lu KB\n",
           (unsigned long)reads, (unsigned long)waited, (unsigned long)(bytesRead / 1024), reads ? readMs / reads : 0.0, (unsigned long)linked,
           linked ? linkedMs / linked : 0.0, (unsigned long)dropped, (unsigned long)(peakHeap / 1024), (unsigned long)(minLinear == (size_t)-1 ? 0 : minLinear / 1024));
  say(line);
}
void report() {
  quit = true;
  if (running) { wake.signal(); join(); running = false; }
  numbers();
  for (auto& p : packs) if (p->f) fclose(p->f);
}

void open() {
  if (opened) return;
  opened = true;
  lock.init();
  files.init();
  wake.init();
  const std::string dir = folder();
  std::string seen = "(no folder)";
  if (DIR* d = opendir(dir.c_str())) {
    seen = "";
    while (dirent* e = readdir(d)) {
      const std::string n = e->d_name;
      seen += n + " ";
      if (n.size() < 5 || strcasecmp(n.c_str() + n.size() - 4, ".zpk") != 0) continue;   // NEAR.ZPK in PPSSPP's umd0: (the EBOOT's folder)
      auto p = std::make_unique<Pack>();
      p->path = dir + n;
      p->f = fopen(p->path.c_str(), "rb");
      unsigned char h[32];
      std::string err = "not a pack";
      if (p->f && fread(h, 1, 32, p->f) == 32 && fseek(p->f, 0, SEEK_END) == 0) {
        const long size = ftell(p->f);
        uint32_t names = 0, nsize = 0, dsize = 0;
        memcpy(&names, h + 20, 4); memcpy(&nsize, h + 24, 4); memcpy(&dsize, h + 28, 4);
        const uint64_t index = (uint64_t)names + nsize + dsize;   // header, rows, names and dictionary (docs/zpk.md)
        if (size > 0 && index >= 32 && index <= (uint64_t)size && index < (64u << 20)) {
          p->index.resize((size_t)index);
          if (fseek(p->f, 0, SEEK_SET) == 0 && fread(p->index.data(), 1, p->index.size(), p->f) == p->index.size() &&
              p->r.open(p->index.data(), (size_t)size, err)) {
            say("zinc: " + p->path + ": " + std::to_string(p->r.count()) + " entries on the card\n");
            packs.push_back(std::move(p));
            continue;
          }
        }
      }
      say("zinc: " + p->path + ": " + err + "\n");
      if (p->f) fclose(p->f);
    }
    closedir(d);
  }
  if (packs.empty() && getenv("ZINC_PROFILE") && *getenv("ZINC_PROFILE") == '1') say("zinc: no packs in " + dir + ": " + seen + "\n");
  if (zn_console_pack && zn_console_pack_size) {
    auto p = std::make_unique<Pack>();
    std::string err;
    p->path = "the linked pack";
    if (p->r.open(zn_console_pack, zn_console_pack_size, err)) packs.push_back(std::move(p));
  }
  atexit(report);
  running = !packs.empty() && !(getenv("ZINC_SD_SYNC") && *getenv("ZINC_SD_SYNC") == '1') && start(work);   // ZINC_SD_SYNC=1: no thread
}

void sample() {
  const struct mallinfo m = mallinfo();
  size_t used = (size_t)m.uordblks;
#if defined(__3DS__)
  used -= zn_console_heap_held();   // what hal_n3ds.cpp holds back to be an Old 3DS in the emulator
#endif
  if (used > peakHeap) peakHeap = used;
#if defined(__3DS__)
  const size_t lf = linearSpaceFree();
  if (lf < minLinear) minLinear = lf;
#endif
  static double last = 0;   // ZINC_PROFILE=1: the numbers every 5 seconds too (an emulator's runner may stop the program before its exit)
  static const bool profile = getenv("ZINC_PROFILE") && *getenv("ZINC_PROFILE") == '1';
  const double now = nowMs();
  if (profile && now - last > 5000) { last = now; numbers(); }
}

}  // namespace

/** Whether `name` can be taken now: 1 read ahead (or small, or nowhere: the frame reads it), 0 asked for and on its way. */
extern "C" int zn_console_side_ready(const char* name, uint32_t n) {
  open();
  sample();
  if (!running) return 1;
  const std::string key(name, n);
  long i = -1;
  Pack* p = where(key, -1, &i);
  if (!p || (!p->f && p->r.entry((size_t)i).storedSize < kSmall)) return 1;
  int r = 0;
  lock.on();
  // a burst of linked entries (the loading screen asks for dozens): the frame reads those itself, the thread keeps to the card's and to the
  // few a flight asks for, so that neither waits for the other and the slots hold little
  if (!p->f && want.size() >= kBurst) {
    bool mine = busy == key;
    for (const Slot& s : ready) mine |= s.name == key;
    for (const std::string& w : want) mine |= w == key;
    if (!mine) { lock.off(); return 1; }
  }
  for (const Slot& s : ready) if (s.name == key) r = 1;
  if (!r) {
    bool asked = busy == key;
    for (const std::string& w : want) asked |= w == key;
    if (!asked && want.size() < kWant) { want.push_back(key); wake.signal(); }
  }
  lock.off();
  return r;
}

/** The entry `name` if the thread has read it (it is then the caller's): before the linked pack, which would inflate it again. */
bool zn_console_side_take(const std::string& name, std::string& out) {
  if (!running) return false;
  bool ok = false;
  lock.on();
  for (size_t k = 0; k < ready.size() && !ok; k++)
    if (ready[k].name == name) { out = std::move(ready[k].data); ready.erase(ready.begin() + (long)k); ok = true; }
  lock.off();
  return ok;
}

/** The entry `name` (kind 0 data, 1 an image) of the card's packs: the one read ahead, else read now. False when it is not there. */
bool zn_console_side_read(const std::string& name, int kind, std::string& out) {
  open();
  if (zn_console_side_take(name, out)) return true;
  long i = -1;
  Pack* p = where(name, kind, &i);
  if (!p || !p->f) return false;   // the linked pack's: host_console.cpp read it already
  const bool ok = readEntry(p, i, name, out);
  if (ok) waited++;   // not asked for ahead: read now, the frame waits for the card
  return ok;
}

/** Whether the card's packs hold `name` of `kind` (zinc:assets exists). */
bool zn_console_side_has(const std::string& name, int kind) {
  open();
  long i = -1;
  const Pack* p = where(name, kind, &i);
  return p && p->f;
}
