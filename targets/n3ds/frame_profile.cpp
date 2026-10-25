#include "frame_profile.h"
#include "hal.h"
#include "zn/alloc_stats.h"
#include <stdio.h>
#include <inttypes.h>
#include <stdlib.h>
#include <string.h>
extern "C" uint32_t zrt_prof_last_frame(uint32_t*, uint32_t) __attribute__((weak));
namespace zn::n3ds::capture {
namespace {
constexpr uint32_t Capacity = 3600;
struct Sample {
  uint32_t gap, elapsed, stereo, phase[9], metric[Count], allocs, frees;
};
Sample* samples;
Sample current{};
uint32_t count;
uint64_t start, previous, allocStart, freeStart;
bool on;
const char* deviceModel = "unknown";
}
void init() {
  count = 0; start = previous = 0;
  const char* flag = getenv("ZINC_FRAME_CAPTURE");
  on = flag && *flag && *flag != '0';
  if (on) {
    samples = (Sample*)calloc(Capacity, sizeof(Sample));
    on = samples != nullptr;
  }
}
void model(bool isNew3ds) { deviceModel = isNew3ds ? "new3ds" : "old3ds"; }
bool enabled() { return on; }
uint64_t tick() { return hal_time_us(); }
void begin(bool first, bool stereo) {
  if (!on || !first) return;
  memset(&current, 0, sizeof current);
  const uint64_t now = tick();
  current.gap = previous ? (uint32_t)(now - previous) : 0;
  current.stereo = stereo;
  previous = start = now;
  allocStart = zn::rt::gAllocs; freeStart = zn::rt::gFrees;
}
void phases() {
  if (!on) return;
  uint32_t phase[9];
  if (zrt_prof_last_frame && zrt_prof_last_frame(phase, 9) == 9)
    for (int i = 0; i < 9; i++) current.phase[i] += phase[i];
}
void add(Metric metric, uint32_t value) { if (on) current.metric[metric] += value; }
void end(bool complete) {
  if (!on || !complete || !start) return;
  current.elapsed = (uint32_t)(tick() - start);
  current.allocs = (uint32_t)(zn::rt::gAllocs - allocStart);
  current.frees = (uint32_t)(zn::rt::gFrees - freeStart);
  samples[count++ % Capacity] = current;
}
void finish() {
  if (!on) return;
  on = false;
  FILE* f = fopen("sdmc:/zinc-frames.csv", "w");
  if (f) {
    fprintf(f, "# zinc-n3ds-frame-capture schema=1 capacity=%" PRIu32 " omitted=%" PRIu32 " model=%s\n", Capacity, count > Capacity ? count - Capacity : 0, deviceModel);
    fputs("refresh,stereo,gap_us,elapsed_us,app_us,input_us,physics_us,layout_us,paint_us,effects_us,diff_us,raster_us,present_us,wait_us,validate_us,replay_us,upload_us,submit_us,gpu_surfaces,software_surfaces,uploads,upload_bytes,quads,previous_gpu_us,vblanks,rt_allocs,rt_frees\n", f);
    for (uint32_t i = count > Capacity ? count - Capacity : 0; i < count; i++) {
      const Sample& s = samples[i % Capacity];
      fprintf(f, "%" PRIu32 ",%" PRIu32 ",%" PRIu32 ",%" PRIu32, i, s.stereo, s.gap, s.elapsed);
      for (uint32_t p : s.phase) fprintf(f, ",%" PRIu32, p);
      for (uint32_t m : s.metric) fprintf(f, ",%" PRIu32, m);
      fprintf(f, ",%" PRIu32 ",%" PRIu32 "\n", s.allocs, s.frees);
    }
    const bool failed = ferror(f) != 0;
    if (fclose(f) != 0 || failed) { static const char msg[] = "n3ds capture: writing zinc-frames.csv failed"; hal_log_err(msg, sizeof msg - 1); }
  }
  else { static const char msg[] = "n3ds capture: cannot open zinc-frames.csv"; hal_log_err(msg, sizeof msg - 1); }
  free(samples); samples = nullptr;
}
}
