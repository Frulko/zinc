// The decoder thread of zinc:gfx startImageDecode (header: image_decode.h): one worker at a low priority (a Raspberry Pi 3 has four cores and the
// render bands and the program's thread use them) decodes the files in order into ARGB words; the program's thread takes the pixels with a poll.
// ponytail: one worker and a linear scan of the jobs (a few dozen at most, the byte cap keeps them few); two workers if a board decodes covers
// slower than the network brings them.
#include "host/image_decode.h"
#include "res/codec.h"
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>
#include <vector>
#include <stdlib.h>
#if defined(__APPLE__)
#include <pthread.h>
#include <pthread/qos.h>
#elif defined(__linux__)
#include <sys/resource.h>
#include <sys/syscall.h>
#include <unistd.h>
#endif

namespace zn::host {
namespace {
struct Job {
  int32_t handle = 0;
  std::vector<uint8_t> file;
  uint32_t* px = nullptr;
  int w = 0, h = 0;
  bool alpha = false, done = false, cancelled = false, running = false;
  size_t held = 0;   // bytes this job weighs in the pool: its file, then its pixels
};
struct Pool {
  std::mutex m;
  std::condition_variable cv;
  std::deque<Job*> jobs;   // every job not yet taken, in order
  size_t held = 0;
  int32_t next = 1;
  bool started = false;
};
constexpr size_t kHeldMax = 64u << 20;   // file bytes and pixels in flight
Pool& pool() { static Pool* p = new Pool; return *p; }   // never freed: the worker may still run when the program exits

void drop(Pool& p, Job* j) {   // the lock is held
  for (auto it = p.jobs.begin(); it != p.jobs.end(); ++it) if (*it == j) { p.jobs.erase(it); break; }
  free(j->px);
  p.held -= j->held;
  delete j;
}

// RGBA bytes to 0xAARRGGBB words in place (swap the red and the blue byte); the alpha test is an AND of all the words, so the loop has no branch
uint32_t* toArgb(uint8_t* rgba, int w, int h, bool* alpha) {
  uint32_t* px = reinterpret_cast<uint32_t*>(rgba);   // malloc'd: aligned
  uint32_t all = 0xFFFFFFFFu;
  for (size_t i = 0, k = static_cast<size_t>(w) * h; i < k; i++) {
    const uint32_t v = px[i];
    all &= v;
    px[i] = (v & 0xFF00FF00u) | (v & 0xFFu) << 16 | (v >> 16 & 0xFFu);
  }
  *alpha = (all >> 24) != 255;
  return px;
}

void worker() {
#if defined(__APPLE__)
  pthread_set_qos_class_self_np(QOS_CLASS_UTILITY, 0);
#elif defined(__linux__)
  setpriority(PRIO_PROCESS, static_cast<id_t>(syscall(SYS_gettid)), 10);   // this thread only
#endif
  Pool& p = pool();
  std::unique_lock<std::mutex> lk(p.m);
  for (;;) {
    Job* j = nullptr;
    for (Job* c : p.jobs) if (!c->done && !c->running) { j = c; break; }
    if (!j) { p.cv.wait(lk); continue; }
    if (j->cancelled) { drop(p, j); continue; }
    j->running = true;
    std::vector<uint8_t> file = std::move(j->file);
    lk.unlock();
    int w = 0, h = 0;
    bool alpha = false;
    uint32_t* px = nullptr;
    if (uint8_t* rgba = zn::res::decodeRgbaAlloc(file.data(), file.size(), &w, &h)) px = toArgb(rgba, w, h, &alpha);
    file = std::vector<uint8_t>();
    lk.lock();
    j->running = false;
    if (j->cancelled) { free(px); drop(p, j); continue; }   // nobody wants it any more
    j->px = px; j->w = w; j->h = h; j->alpha = alpha; j->done = true;
    const size_t now = px ? static_cast<size_t>(w) * h * 4 : 0;
    p.held = p.held - j->held + now;   // the file is gone, the pixels weigh
    j->held = now;
  }
}
}  // namespace

int32_t decodeStart(const uint64_t* slots, uint32_t n) {
  Pool& p = pool();
  std::lock_guard<std::mutex> lk(p.m);
  if (p.held + n > kHeldMax) return 0;
  Job* j = new Job;
  j->file.resize(n);
  for (uint32_t i = 0; i < n; i++) j->file[i] = static_cast<uint8_t>(slots[i]);
  j->held = n;
  p.held += n;
  j->handle = p.next++;
  if (p.next < 1) p.next = 1;
  p.jobs.push_back(j);
  if (!p.started) { p.started = true; std::thread(worker).detach(); }
  p.cv.notify_one();
  return j->handle;
}

int32_t decodeTake(int32_t handle, uint32_t** px, int* w, int* h, bool* alpha) {
  Pool& p = pool();
  std::lock_guard<std::mutex> lk(p.m);
  for (Job* j : p.jobs) {
    if (j->handle != handle || j->cancelled) continue;
    if (!j->done) return -2;
    *px = j->px; j->px = nullptr;
    *w = j->w; *h = j->h; *alpha = j->alpha;
    const bool ok = *px != nullptr;
    drop(p, j);
    return ok ? 0 : -1;
  }
  return -1;   // not there: spent, cancelled or never given
}

void decodeCancel(int32_t handle) {
  Pool& p = pool();
  std::lock_guard<std::mutex> lk(p.m);
  for (Job* j : p.jobs) {
    if (j->handle != handle || j->cancelled) continue;
    if (j->done) drop(p, j);
    else if (j->running) j->cancelled = true;   // the worker drops it when it is done
    else { j->cancelled = true; j->file = std::vector<uint8_t>(); p.held -= j->held; j->held = 0; }   // still queued: the worker drops it unread
    return;
  }
}

}  // namespace zn::host
