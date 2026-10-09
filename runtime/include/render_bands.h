// Frame-barrier band pool for HALs and display drivers that rasterize on the CPU (docs/plugins/display-fbdev.md).
//
// run(y0, y1, step, job, ctx) cuts the rows [y0, y1) into bands of `step` rows and calls job(ctx, a, b) once per band,
// on the calling thread and on the pool's workers, which pull the next band from an atomic counter (uneven bands, e.g. a
// dense map next to an empty sky, balance themselves). run() returns only when every band is done: the caller
// presents a complete frame, bands never run ahead of or behind the frame they belong to. Bands never share pixels,
// so the result is bit-identical to one job(ctx, y0, y1) call as long as the job is (the rasterizer keeps its scratch
// per thread, runtime/raster.cpp). One thread means no thread is ever created and run() calls the job directly.
// A Pool must never be destroyed while its workers wait (glibc's pthread_cond_destroy blocks until they leave): make it
// a leaked heap object, `static Pool& p = *new Pool;`.
// ponytail: no work stealing across frames and no pinning; add when a profile shows workers starved between frames.
#pragma once
#include <stdint.h>
#include <stdlib.h>
#include <unistd.h>
#include <atomic>
#include <condition_variable>
#include <mutex>
#include <thread>

namespace zbands {

struct Pool {
  typedef void (*Job)(void* ctx, int32_t y0, int32_t y1);
  int threads = 1;   // total, the caller included

  /** ZINC_RENDER_THREADS=n, else the online cores; at most 8 (memory bandwidth, not cores, limits past that). */
  void init() {
    const char* e = getenv("ZINC_RENDER_THREADS");
    long n = e && *e ? atol(e) : sysconf(_SC_NPROCESSORS_ONLN);
    threads = n < 1 ? 1 : n > 8 ? 8 : (int)n;
    for (int i = 1; i < threads; i++) std::thread([this] { worker(); }).detach();
  }

  void run(int32_t y0, int32_t y1, int32_t step, Job fn, void* ctx) {
    if (threads == 1 || y1 - y0 <= step) { fn(ctx, y0, y1); return; }
    {
      std::lock_guard<std::mutex> l(mu);
      job = fn; jctx = ctx; by0 = y0; by1 = y1; bstep = step; next.store(0, std::memory_order_relaxed);
      pending = threads - 1; gen++;
    }
    go.notify_all();
    pull();
    std::unique_lock<std::mutex> l(mu);
    done.wait(l, [this] { return pending == 0; });   // the frame barrier: every worker has checked in
  }

 private:
  Job job = nullptr; void* jctx = nullptr;
  int32_t by0 = 0, by1 = 0, bstep = 1;
  std::atomic<int32_t> next{0};
  int pending = 0; unsigned gen = 0;
  std::mutex mu; std::condition_variable go, done;

  void pull() {
    for (;;) {
      int32_t a = by0 + next.fetch_add(1, std::memory_order_relaxed) * bstep;
      if (a >= by1) return;
      job(jctx, a, a + bstep < by1 ? a + bstep : by1);
    }
  }
  void worker() {
    unsigned seen = 0;
    for (;;) {
      std::unique_lock<std::mutex> l(mu);
      go.wait(l, [&] { return gen != seen; });
      seen = gen;
      l.unlock();
      pull();
      l.lock();
      if (--pending == 0) done.notify_one();
    }
  }
};

}  // namespace zbands
