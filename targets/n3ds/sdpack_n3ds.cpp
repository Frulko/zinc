// The asset packs on the 3DS's SD card beside the program (Pocket Tokyo's streamed cells, docs/reports/pocket3d-techniques.md 2.2): every
// <group>.zpk in the folder named as the .3dsx next to it (sdmc:/3ds/tokyo.3dsx -> sdmc:/3ds/tokyo/), which tools/console-demos writes from
// zinc pack's packs/ beside the pack linked into the core. A pack there is opened over its index alone (the data stays on the card);
// gfx_stubs.cpp falls back to it for what the linked pack has not. A reader thread, below the program's priority on the other core, reads
// the entries asked for ahead (zn_console_side_ready) into a few slots, so a frame takes them without waiting for the card; an entry asked
// for directly is read then (zn_console_side_read).
#include <3ds.h>
#include <dirent.h>
#include <malloc.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <memory>
#include <string>
#include <vector>

#include "zpk/zpk.h"

extern "C" int __system_argc;
extern "C" char** __system_argv;
extern "C" void zn_console_echo(const char* s, size_t n);   // hal_n3ds.cpp

namespace {

struct Pack { std::string path; std::vector<unsigned char> index; zn::zpk::Reader r; FILE* f = nullptr; };
struct Slot { std::string name, data; };
enum { kWant = 8, kReady = 6 };   // names asked for ahead, and entries read and not taken yet (the oldest dropped first)

std::vector<std::unique_ptr<Pack>> packs;
bool opened = false;
LightLock lock;                 // the lists below, held a moment
LightLock files;                // the packs' files, held through a read
LightEvent wake;                // a name was asked for
std::vector<std::string> want;  // in the order asked (the most wanted first: the World asks nearest first)
std::string busy;               // the name the thread is reading
std::vector<Slot> ready;
Thread reader = nullptr;
volatile bool quit = false;
// what the run cost: entries read (those a frame waited for), their bytes and milliseconds, the most heap in use, the least linear memory free
uint32_t reads = 0, waited = 0; uint64_t bytesRead = 0, readTicks = 0; size_t peakHeap = 0, minLinear = (size_t)-1;

void say(const std::string& s) { zn_console_echo(s.data(), s.size()); }

// the folder of the .3dsx's name beside it (the Homebrew Launcher gives its path); without one (Azahar, 3dslink) ZINC_SD_DIR, which
// tools/console-demos sets to sdmc:/3ds/<name>/, else sdmc:/3ds/zinc/
std::string folder() {
  if (__system_argc > 0 && __system_argv && __system_argv[0]) {
    std::string p(__system_argv[0]);
    const size_t slash = p.rfind('/'), dot = p.rfind('.');
    if (slash != std::string::npos && dot != std::string::npos && dot > slash) return p.substr(0, dot) + "/";
  }
  if (const char* d = getenv("ZINC_SD_DIR")) if (*d) { std::string s(d); return s.back() == '/' ? s : s + "/"; }
  return "sdmc:/3ds/zinc/";
}

// the pack and row of `name` (of `kind`, or any when kind < 0)
Pack* where(const std::string& name, int kind, long* at) {
  for (auto& p : packs) {
    const long i = p->r.find(name);
    if (i >= 0 && (kind < 0 || p->r.entry((size_t)i).kind == kind)) { *at = i; return p.get(); }
  }
  return nullptr;
}
// the entry read from the card into out, its bytes checked (zn::zpk::Reader::decode)
bool readFile(const std::string& name, int kind, std::string& out) {
  long i = -1;
  Pack* p = where(name, kind, &i);
  if (!p) return false;
  const zn::zpk::Entry e = p->r.entry((size_t)i);
  std::vector<unsigned char> stored(e.storedSize ? e.storedSize : 1);
  std::string err;
  LightLock_Lock(&files);
  const uint64_t t0 = svcGetSystemTick();
  bool ok = fseek(p->f, (long)e.offset, SEEK_SET) == 0 && fread(stored.data(), 1, e.storedSize, p->f) == e.storedSize;
  readTicks += svcGetSystemTick() - t0;
  reads++; bytesRead += e.storedSize;
  LightLock_Unlock(&files);
  if (!ok) err = "cannot read " + name + " in " + p->path;
  else {
    out.resize(e.size);
    ok = p->r.decode((size_t)i, stored.data(), reinterpret_cast<uint8_t*>(out.data()), err);
  }
  if (!ok) say("zinc: " + err + "\n");
  return ok;
}

void work(void*) {
  while (!quit) {
    LightLock_Lock(&lock);
    if (want.empty()) { LightLock_Unlock(&lock); LightEvent_Wait(&wake); continue; }
    Slot s{want.front(), std::string()};
    want.erase(want.begin());
    busy = s.name;
    LightLock_Unlock(&lock);
    const bool ok = readFile(s.name, -1, s.data);
    LightLock_Lock(&lock);
    if (ok) {
      if (ready.size() >= kReady) ready.erase(ready.begin());   // asked for and never taken (the eye turned away)
      ready.push_back(std::move(s));
    }
    busy.clear();
    LightLock_Unlock(&lock);
  }
}

// the numbers so far (the memory too without packs: the same program's peak without its streamed level)
void numbers() {
  char line[256];
  snprintf(line, sizeof line, "zinc: sd packs: %lu entries read (%lu while a frame waited), %lu KB, %.1f ms each; heap at most %lu KB, linear memory free at least %lu KB\n",
           (unsigned long)reads, (unsigned long)waited, (unsigned long)(bytesRead / 1024), reads ? readTicks * 1000.0 / SYSCLOCK_ARM11 / reads : 0.0,
           (unsigned long)(peakHeap / 1024), (unsigned long)(minLinear == (size_t)-1 ? 0 : minLinear / 1024));
  say(line);
}
void report() {
  quit = true;
  if (reader) { LightEvent_Signal(&wake); threadJoin(reader, 1000000000ull); threadFree(reader); reader = nullptr; }
  numbers();
  for (auto& p : packs) if (p->f) fclose(p->f);
}

void open() {
  if (opened) return;
  opened = true;
  LightLock_Init(&lock);
  LightLock_Init(&files);
  LightEvent_Init(&wake, RESET_ONESHOT);
  const std::string dir = folder();
  if (DIR* d = opendir(dir.c_str())) {
    while (dirent* e = readdir(d)) {
      const std::string n = e->d_name;
      if (n.size() < 5 || n.compare(n.size() - 4, 4, ".zpk") != 0) continue;
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
            say("zinc: " + p->path + ": " + std::to_string(p->r.count()) + " entries on the SD card\n");
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
  atexit(report);
  if (packs.empty()) return;
  // the other core when the system lends it (30% of it), else this one: below the program, in the time it waits for the screen
  s32 prio = 0x30;
  svcGetThreadPriority(&prio, CUR_THREAD_HANDLE);
  APT_SetAppCpuTimeLimit(30);
  reader = threadCreate(work, nullptr, 32 * 1024, prio + 1, 1, false);
  if (!reader) reader = threadCreate(work, nullptr, 32 * 1024, prio + 1, -2, false);
}

void sample() {
  const struct mallinfo m = mallinfo();
  if ((size_t)m.uordblks > peakHeap) peakHeap = (size_t)m.uordblks;
  const size_t lf = linearSpaceFree();
  if (lf < minLinear) minLinear = lf;
  static uint64_t last = 0;   // ZINC_PROFILE=1: the numbers every 5 seconds too (an emulator's runner may stop the program before its exit)
  static const bool profile = getenv("ZINC_PROFILE") && *getenv("ZINC_PROFILE") == '1';
  const uint64_t now = svcGetSystemTick();
  if (profile && now - last > 5ull * SYSCLOCK_ARM11) { last = now; numbers(); }
}

}  // namespace

/** Whether `name` of the SD card's packs can be taken now: 1 read ahead (or not on the card: the linked pack's, or none), 0 asked for and
 *  on its way. The World asks for a chunk and its pictures before it loads them (render3d.host.cpp worldLoad, zn_asset_ready). */
extern "C" int zn_console_side_ready(const char* name, uint32_t n) {
  open();
  sample();
  if (packs.empty()) return 1;
  const std::string key(name, n);
  long i = -1;
  if (!where(key, -1, &i)) return 1;
  int r = 0;
  LightLock_Lock(&lock);
  for (const Slot& s : ready) if (s.name == key) r = 1;
  if (!r) {
    bool asked = busy == key;
    for (const std::string& w : want) asked |= w == key;
    if (!asked && want.size() < kWant) { want.push_back(key); LightEvent_Signal(&wake); }
  }
  LightLock_Unlock(&lock);
  return r;
}

/** The entry `name` (kind 0 data, 1 an image) of the SD card's packs: the one read ahead, else read now. False when it is not there. */
bool zn_console_side_read(const std::string& name, int kind, std::string& out) {
  open();
  if (packs.empty()) return false;
  bool ok = false;
  LightLock_Lock(&lock);
  for (size_t k = 0; k < ready.size() && !ok; k++)
    if (ready[k].name == name) { out = std::move(ready[k].data); ready.erase(ready.begin() + (long)k); ok = true; }
  LightLock_Unlock(&lock);
  if (!ok && (ok = readFile(name, kind, out))) waited++;   // not asked for ahead: read now, the frame waits for the card
  return ok;
}
