// Buffered per-refresh capture: no allocation or SD writes while a refresh is recorded.
#pragma once
#include <stdint.h>
namespace zn::n3ds::capture {
enum Metric { Wait, Validate, Replay, Upload, Submit, GpuSurfaces, SoftwareSurfaces, Uploads, UploadBytes, Quads, PreviousGpu, Vblanks, Count };
void init();
void model(bool isNew3ds);
bool enabled();
void begin(bool first, bool stereo);
void phases();
void add(Metric metric, uint32_t value);
void end(bool complete);
void finish();
uint64_t tick();
struct Scope {
  Metric metric; uint64_t start;
  explicit Scope(Metric m) : metric(m), start(enabled() ? tick() : 0) {}
  ~Scope() { if (start) add(metric, (uint32_t)(tick() - start)); }
};
}
