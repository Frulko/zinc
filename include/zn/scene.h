// The seam between the recorder and the renderers (ZN-174, docs/reports/ui-rendering-architecture.md 4.2 and 4.10).
// Scene v1 is the runtime's command list unchanged (zrt::raster::Cmd, runtime/zrt_raster.h, 48 bytes): what ZINC_SCENE_DUMP writes and what the display drivers
// already receive as HalFrame.frames. A Backend draws it; the software raster is the reference, display-gl and the web renderer join in later stages.
#pragma once
#include <cstddef>
#include <cstdint>
#include <memory>

namespace zn::gfx {

enum class Tier : std::uint8_t { T0, T1, T2, T3, T4 };

struct Caps {
  Tier tier = Tier::T0;
  char api[16] = {};        // "sw", "gl", "gles2", "webgl2" ...
  char renderer[64] = {};
  bool partialPresent = false;   // a damaged rectangle may be drawn alone (the rest of the target keeps the previous frame)
  bool threadedBands = false;    // draw() may be called for disjoint bands from several threads
};

struct RectI { std::int32_t x0, y0, x1, y1; };

/** One command list in paint order: `cmds` points at `count` records of zrt::raster::Cmd, `text` and `pts` are its pools. */
struct SceneList { const void* cmds; std::uint32_t count; const char* text; const float* pts; };

struct FrameInfo { std::int32_t width, height; };   // physical pixels

class Backend {
 public:
  virtual ~Backend() = default;
  virtual Caps caps() const = 0;
  virtual bool begin(const FrameInfo& f) = 0;   // false: skip the frame (surface lost, throttled)
  /** Draws the lists, in order, into the target limited to `damage` (the software backend renders into the buffer given to setTarget). */
  virtual void draw(const SceneList* lists, int n, const RectI& damage) = 0;
  virtual void present() = 0;
  virtual bool read(const RectI& r, std::uint32_t* rgb) = 0;   // 0x00RRGGBB, row by row: golden capture and frame hashes
  virtual void lost() = 0;                                     // context loss: drop GPU state, keep CPU copies
};

/** The software raster as a Backend: renders into `pixels` (width x height, 0x00RRGGBB) that the caller owns, in bands from `threads` threads. */
std::unique_ptr<Backend> makeSoftwareBackend(std::uint32_t* pixels, int width, int height, int threads = 1);

/** Backend for the "renderer" setting of zinc.json: "cpu" is the software raster; "gl" and "auto" drive the display driver through the HAL (not a Backend yet): null. */
std::unique_ptr<Backend> makeBackend(const char* renderer, std::uint32_t* pixels, int width, int height);

}  // namespace zn::gfx
