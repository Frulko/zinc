// Software presentation: macOS keeps an immutable image at rest and uses Metal for animation; iOS uses Metal.
// ZINC_PRESENT=metal keeps the Metal path for comparison; published surfaces are never rewritten.
#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>
#import <QuartzCore/CATransaction.h>
#include "hal.h"
#include <SDL3/SDL.h>
#include <TargetConditionals.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#if TARGET_OS_OSX
#import <IOSurface/IOSurface.h>
#import <AppKit/AppKit.h>
#endif
#include <math.h>
#include <time.h>
#include <algorithm>
#include <mutex>
#include <vector>
#include <unordered_map>
#include "zrt_raster.h"

extern "C" __attribute__((weak)) void zrt_prof_info(const char* key, const char* val);   // runtime/gfx.cpp: what the machine's GPU is
extern "C" __attribute__((weak)) uint32_t zrt_frame_stats[8];   // runtime/gfx.cpp (gfx.frameStat)
struct ZrtPass { int32_t img, w, h; bool alpha; uint32_t count; const zrt::raster::Cmd* cmds; const char* text; const float* pts; };
extern "C" __attribute__((weak)) const ZrtPass* zrt_passes(uint32_t* n);   // runtime/gfx.cpp: the render targets' queued passes
extern "C" __attribute__((weak)) void zrt_passes_done();
extern "C" __attribute__((weak)) bool zrt_gpu_targets;

static SDL_MetalView view;
static CAMetalLayer* layer;
static id<MTLCommandQueue> queue;
static id<MTLBuffer> frame;
static int fw, fh;
static id<MTLCommandBuffer> reading;   // the last present: the GPU reads the frame until it completes

extern "C" bool hal_mtl_gpu_enable(void);
// The next drawable without the 1 s stall of a covered window (ZN-1000). A drawable comes back once the one after it is taken by the screen;
// a covered, hidden or minimized window shows nothing, so nextDrawable waits for its timeout (1001.9 ms measured) and holds the present, and
// the script behind it. So nextDrawable runs on a queue of its own and the present waits kDrawableWaitNs for it (three frames at 60 Hz; a shown
// window gets one within a frame or two): past that the frame is not presented (the frame buffer keeps it, the next present copies it whole)
// and the drawable, when it comes, goes to the next present. The window HAL stops presenting once it hears that the window is unseen.
static std::mutex fetch_mu;
static id<CAMetalDrawable> fetched;       // a drawable that came after its present gave up
static dispatch_semaphore_t fetch_done;   // the nextDrawable running, nil when none
static constexpr int64_t kDrawableWaitNs = 50000000;
extern "C" { bool hal_mtl_dropped; }   // a frame was not presented: the window HAL presents the next one whole, damaged or not
static id<CAMetalDrawable> next_drawable() {
  static dispatch_queue_t q = dispatch_queue_create("zinc drawable", dispatch_queue_attr_make_with_qos_class(DISPATCH_QUEUE_SERIAL, QOS_CLASS_USER_INTERACTIVE, 0));
  dispatch_semaphore_t done;
  {
    std::lock_guard<std::mutex> g(fetch_mu);
    if (!(done = fetch_done)) {
      if (fetched) { id<CAMetalDrawable> d = fetched; fetched = nil; return d; }
      done = fetch_done = dispatch_semaphore_create(0);
      CAMetalLayer* l = layer;
      dispatch_async(q, ^{
        id<CAMetalDrawable> d = [l nextDrawable];
        { std::lock_guard<std::mutex> g2(fetch_mu); fetched = d; fetch_done = nil; }
        dispatch_semaphore_signal(done);
      });
    }
  }
  if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, kDrawableWaitNs)) != 0) {
    if (getenv("ZINC_METAL_LOG")) fprintf(stderr, "metal: no drawable within 50 ms: the frame is not presented\n");
    hal_mtl_dropped = true;
    return nil;
  }
  std::lock_guard<std::mutex> g(fetch_mu);
  id<CAMetalDrawable> d = fetched; fetched = nil;
  return d;
}
#if TARGET_OS_OSX
static bool surface_mode;
static CALayer* image_layer;
static NSView* surface_view;
static IOSurfaceRef displayed, drawing;
static uint32_t* displayed_px;
static SDL_Window* surface_window;
static uint64_t presented_at, last_damage;
static bool adaptive, surface_nearest;
static int active_frames, idle_frames;
static void surface_resize(int w, int h) {
  if (drawing) { IOSurfaceUnlock(drawing, 0, nullptr); CFRelease(drawing); drawing = nullptr; }
  // Keep the last published image visible until the resized surface is ready.
  if (displayed) { CFRelease(displayed); displayed = nullptr; }
  displayed_px = nullptr; fw = w; fh = h;
}
static uint32_t* surface_begin(bool preserve = true) {
  @autoreleasepool {
    if (!drawing) {
      drawing = IOSurfaceCreate((__bridge CFDictionaryRef)@{
        (__bridge NSString*)kIOSurfaceWidth: @(fw), (__bridge NSString*)kIOSurfaceHeight: @(fh),
        (__bridge NSString*)kIOSurfaceBytesPerElement: @4, (__bridge NSString*)kIOSurfaceBytesPerRow: @(fw * 4),
        (__bridge NSString*)kIOSurfacePixelFormat: @(0x42475241u)});
      if (!drawing || IOSurfaceGetBytesPerRow(drawing) != (size_t)fw * 4) hal_panic("cannot allocate the display surface", __FILE__, __LINE__);
      if (IOSurfaceLock(drawing, 0, nullptr) != kIOReturnSuccess) hal_panic("cannot lock the display surface", __FILE__, __LINE__);
      if (preserve && displayed_px) memcpy(IOSurfaceGetBaseAddress(drawing), displayed_px, (size_t)fw * fh * 4);
    }
    return (uint32_t*)IOSurfaceGetBaseAddress(drawing);
  }
}
static void surface_present() {
  const SDL_DisplayMode* mode = SDL_GetCurrentDisplayMode(SDL_GetDisplayForWindow(surface_window));
  const uint64_t period = (uint64_t)(1e9 / (mode && mode->refresh_rate > 0 ? mode->refresh_rate : 60));
  const uint64_t now = SDL_GetTicksNS();
  if (presented_at && now - presented_at < period) SDL_DelayNS(period - (now - presented_at));
  presented_at = SDL_GetTicksNS();
  uint32_t* px = (uint32_t*)IOSurfaceGetBaseAddress(drawing);
  IOSurfaceUnlock(drawing, 0, nullptr);
  [CATransaction begin]; [CATransaction setDisableActions:YES];
  image_layer.frame = surface_view.bounds;
  image_layer.contents = (__bridge id)drawing;
  [CATransaction commit]; [CATransaction flush];
  // Published surfaces stay immutable: Core Animation owns their display lifetime.
  if (displayed) CFRelease(displayed);
  displayed = drawing; displayed_px = px; drawing = nullptr;
}
#endif

extern "C" const char* hal_mtl_name(void) {
#if TARGET_OS_OSX
  if (surface_mode) return "IOSurface";
#endif
  return "Metal";
}
static bool metal_open(SDL_Window* w, bool nearest) {
  @autoreleasepool {
    if (!(view = SDL_Metal_CreateView(w))) return false;
    layer = (__bridge CAMetalLayer*)SDL_Metal_GetLayer(view);
    if (!layer) return false;
    id<MTLDevice> dev = MTLCreateSystemDefaultDevice();
    if (!dev) return false;
    layer.device = dev;
    if (zrt_prof_info) zrt_prof_info("gpu", dev.name.UTF8String);   // the inspector's Info view, ZINC_PROFILE=json
    layer.pixelFormat = MTLPixelFormatBGRA8Unorm;   // the raster's byte order (0x00RRGGBB little-endian), as SDL's Metal renderer sets it
    layer.framebufferOnly = NO;                     // the drawable is a blit destination
    layer.opaque = YES;                             // the raster leaves the alpha byte at 0
    layer.contentsGravity = kCAGravityResizeAspect; // a fixed surface (a deterministic run) is letterboxed, as SDL's logical presentation did
    if (nearest) layer.magnificationFilter = kCAFilterNearest;   // ZINC_PIXEL_SCALE=logical: pixel art keeps square pixels
#if TARGET_OS_OSX
    // two drawables, not three: each is a buffer of the window's size (13.7 MB for 1180x760 at density 2); the raster's frame is the third.
    // A frame that misses the display waits for the next one instead of queueing. ZINC_DRAWABLES=3 to compare
    layer.maximumDrawableCount = 2;
    if (const char* e = getenv("ZINC_DRAWABLES")) layer.maximumDrawableCount = (NSUInteger)SDL_clamp(atoi(e), 2, 3);
#endif
    queue = [dev newCommandQueue];
    if (queue && getenv("ZINC_RENDERER") && !strcmp(getenv("ZINC_RENDERER"), "metal")) hal_mtl_gpu_enable();   // before the first frame: its render targets draw on the GPU too
    return queue != nil;
  }
}
static void metal_close() {
  @autoreleasepool {
    if (reading) { [reading waitUntilCompleted]; reading = nil; }
    { std::lock_guard<std::mutex> g(fetch_mu); fetched = nil; }   // a drawable of this layer, not of the next one
    frame = nil; queue = nil; layer = nil;
    if (view) { SDL_Metal_DestroyView(view); view = nullptr; }
    [CATransaction flush];
  }
}
#if TARGET_OS_OSX
static bool surface_open(SDL_Window* w, bool nearest) {
  @autoreleasepool {
    NSWindow* window = (__bridge NSWindow*)SDL_GetPointerProperty(SDL_GetWindowProperties(w), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr);
    if (!window) return false;
    NSView* content = window.contentView;
    surface_view = [[NSView alloc] initWithFrame:content.bounds];
    surface_view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    image_layer = [CALayer layer]; image_layer.opaque = YES;
    image_layer.contentsGravity = kCAGravityResizeAspect;
    if (nearest) image_layer.magnificationFilter = kCAFilterNearest;
    surface_view.layer = image_layer; surface_view.wantsLayer = YES;
    [content addSubview:surface_view]; presented_at = 0;
    return true;
  }
}
static void surface_close() {
  @autoreleasepool {
    [CATransaction begin]; [CATransaction setDisableActions:YES];
    surface_resize(fw, fh);
    [surface_view removeFromSuperview]; surface_view = nil; image_layer = nil;
    [CATransaction commit]; [CATransaction flush];
  }
}
static void activate_metal() {
  if (!metal_open(surface_window, surface_nearest)) { metal_close(); return; }
  frame = [layer.device newBufferWithLength:(NSUInteger)fw * fh * 4 options:MTLResourceStorageModeShared];
  if (!frame) hal_panic("cannot allocate the render buffer", __FILE__, __LINE__);
  const void* pixels = drawing ? IOSurfaceGetBaseAddress(drawing) : displayed_px;
  if (pixels) memcpy(frame.contents, pixels, (size_t)fw * fh * 4);
  surface_close(); surface_mode = false;
  if (zrt_prof_info) zrt_prof_info("present", "Metal");
}
#endif
extern "C" bool hal_mtl_open(SDL_Window* w, bool nearest) {
#if TARGET_OS_OSX
  surface_window = w; surface_nearest = nearest;
  active_frames = idle_frames = 0; last_damage = 0;
  const char* present = getenv("ZINC_PRESENT");
  adaptive = present && !strcmp(present, "auto");
  surface_mode = adaptive || (present && !strcmp(present, "surface"));
  if (surface_mode) return surface_open(w, nearest);
#endif
  if (metal_open(w, nearest)) return true;
  metal_close(); return false;
}
// After the animation rests, keep only its immutable image; the next burst restores Metal.
extern "C" uint32_t* hal_mtl_idle(void) {
  @autoreleasepool {
#if TARGET_OS_OSX
    if (adaptive && !surface_mode && frame && ++idle_frames >= 30) {
      if (reading) { [reading waitUntilCompleted]; reading = nil; }
      if (!surface_open(surface_window, surface_nearest)) return nullptr;
      uint32_t* pixels = surface_begin(false);
      memcpy(pixels, frame.contents, (size_t)fw * fh * 4);
      for (size_t i = 0, n = (size_t)fw * fh; i < n; ++i) pixels[i] |= 0xFF000000u;
      surface_mode = true;
      @autoreleasepool { surface_present(); }
      metal_close(); active_frames = idle_frames = 0;
      if (zrt_prof_info) zrt_prof_info("present", "IOSurface");
      return displayed_px;
    }
#endif
    return nullptr;
  }
}

/** The GPU no longer reads the frame: the raster may write into it. */
extern "C" void hal_mtl_wait(bool preserve = true) {
#if TARGET_OS_OSX
  if (adaptive && surface_mode) {
    active_frames = last_damage && SDL_GetTicksNS() - last_damage < 250000000 ? active_frames + 1 : 1;
    if (active_frames >= 8) activate_metal();
  }
  if (surface_mode) { surface_begin(preserve); return; }
#endif
  (void)preserve;
  if (reading) { [reading waitUntilCompleted]; reading = nil; }
}

/** The frame's memory at this size, w * h pixels, zeroed when the size changes (a new buffer: the old one may still be read). */
extern "C" uint32_t* hal_mtl_pixels(int w, int h) {
#if TARGET_OS_OSX
  if (surface_mode) {
    if (w != fw || h != fh) surface_resize(w, h);
    return surface_begin();
  }
#endif
  if (!frame || w != fw || h != fh) {
    hal_mtl_wait();
    frame = [layer.device newBufferWithLength:(NSUInteger)w * h * 4 options:MTLResourceStorageModeShared];   // Metal zeroes a new buffer
    fw = w; fh = h;
  }
  return frame ? (uint32_t*)frame.contents : nullptr;
}

/** The frame into the next drawable, on the GPU; the drawable is shown at the next display refresh. */
extern "C" void hal_mtl_present(void) {
#if TARGET_OS_OSX
  idle_frames = 0; last_damage = SDL_GetTicksNS();
  if (surface_mode) { @autoreleasepool { surface_present(); } return; }
#endif
  @autoreleasepool {
    if (!frame) return;
    if (layer.drawableSize.width != fw || layer.drawableSize.height != fh) {   // SDL's view sets it from its bounds
      // an explicit transaction: the present may run on the render thread (D182), which has no run loop to commit an implicit one
      [CATransaction begin];
      [CATransaction setDisableActions:YES];
      layer.drawableSize = CGSizeMake(fw, fh);
      [CATransaction commit];
    }
    id<CAMetalDrawable> d = next_drawable();
    if (!d) return;
    const NSUInteger w = SDL_min((NSUInteger)fw, d.texture.width), h = SDL_min((NSUInteger)fh, d.texture.height);   // a drawable of the old size, mid-rotation
    id<MTLCommandBuffer> cb = [queue commandBuffer];
    id<MTLBlitCommandEncoder> blit = [cb blitCommandEncoder];
    [blit copyFromBuffer:frame sourceOffset:0 sourceBytesPerRow:(NSUInteger)fw * 4 sourceBytesPerImage:(NSUInteger)fw * fh * 4 sourceSize:MTLSizeMake(w, h, 1)
               toTexture:d.texture destinationSlice:0 destinationLevel:0 destinationOrigin:MTLOriginMake(0, 0, 0)];
    [blit endEncoding];
    [cb presentDrawable:d];
    [cb commit];
    reading = cb;
  }
}

extern "C" void hal_mtl_close(void) {
#if TARGET_OS_OSX
  if (surface_mode) { surface_close(); surface_mode = false; fw = fh = 0; return; }
#endif
  metal_close(); fw = fh = 0;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------
// The Metal replay: the frame's command lists drawn on the GPU (ZINC_RENDERER=metal), the seam being the same lists the GL replay takes
// (HalFrame.frames). One uber fragment program, one instanced quad per command (80 bytes of instance data a sprite, not four vertices), the
// textures of a batch in one array indexed per instance (a sprite sheet switch costs nothing: the 20,000 draw calls of alternating sheets are
// one), render targets (createImage + beginImage/endImage) as MTLTextures drawn by passes before the frame, partial uploads with replaceRegion.
// A frame holding what the program does not draw yet (polygons, strokes, matrices, shaders, rounded clips, smooth sampling) is refused up front
// and the caller draws it with the software raster, as before.
using namespace zrt::raster;
typedef zrt::raster::Rect RRect;
namespace mr {
struct Inst { float x0, y0, x1, y1, u0, v0, u1, v1, bx, by, bw, bh, r, p1; uint32_t mode, grad, c1, c2, tex, flags; };
enum { M_FILL, M_BORDER, M_TEXT, M_IMAGE, M_SHADOW };
static const int MAXTEX = 16, RING = 3;
static const uint32_t CAP = 262144;
static NSString* const SRC = @R"MSL(
#include <metal_stdlib>
using namespace metal;
struct Inst { float x0, y0, x1, y1, u0, v0, u1, v1, bx, by, bw, bh, r, p1; uint mode, grad, c1, c2, tex, flags; };
struct VOut { float4 pos [[position]]; float2 p; float2 uv; float4 box; float2 rp; float4 c1; float4 c2; uint tex [[flat]]; uint mode [[flat]]; uint grad [[flat]]; uint flags [[flat]]; };
vertex VOut vs(uint vid [[vertex_id]], uint iid [[instance_id]], const device Inst* I [[buffer(0)]], constant float2& res [[buffer(1)]]) {
  Inst q = I[iid]; float2 k = float2(float(vid & 1), float(vid >> 1));
  VOut o; o.p = mix(float2(q.x0, q.y0), float2(q.x1, q.y1), k); o.uv = mix(float2(q.u0, q.v0), float2(q.u1, q.v1), k);
  o.pos = float4(o.p.x / res.x * 2.0 - 1.0, 1.0 - o.p.y / res.y * 2.0, 0.0, 1.0);
  o.box = float4(q.bx, q.by, q.bw, q.bh); o.rp = float2(q.r, q.p1); o.c1 = unpack_unorm4x8_to_float(q.c1); o.c2 = unpack_unorm4x8_to_float(q.c2);
  o.tex = q.tex; o.mode = q.mode; o.grad = q.grad; o.flags = q.flags; return o; }
float sdf(float2 p, float2 c, float2 h, float r) { float2 q = abs(p - c) - (h - r); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float cover(float2 p, float2 c, float2 h, float r) { return clamp(0.5 - sdf(p, c, h, r), 0.0, 1.0); }
constexpr sampler sl(filter::linear, address::clamp_to_edge), sn(filter::nearest, address::clamp_to_edge);
fragment float4 fs(VOut v [[stage_in]], array<texture2d<float>, 16> tex [[texture(0)]]) {
  float2 c = v.box.xy, h = v.box.zw; float r = v.rp.x; float3 col = v.c1.rgb; float a = v.c1.a, cov = 1.0;
  if (v.mode == 0) {
    cov = cover(v.p, c, h, r);
    if (v.grad >= 1 && v.grad <= 3) {
      float t;
      if (v.grad == 1) t = (v.p.y - (c.y - h.y)) / max(2.0 * h.y, 1e-6);
      else if (v.grad == 2) t = (v.p.x - (c.x - h.x)) / max(2.0 * h.x, 1e-6);
      else { float2 d = (v.p - (c - h)) / max(2.0 * h, float2(1e-6)) * 2.0 - 1.0; t = length(d); }
      col = mix(col, v.c2.rgb, clamp(t, 0.0, 1.0)); }
  } else if (v.mode == 1) { float bw = v.rp.y; cov = cover(v.p, c, h, r) - cover(v.p, c, h - bw, max(r - bw, 0.0)); }
  else if (v.mode == 2) { cov = tex[v.tex].sample(sl, v.uv).r; }
  else if (v.mode == 3) {
    float4 t = (v.flags & 4u) ? tex[v.tex].sample(sn, v.uv) : tex[v.tex].sample(sl, v.uv);
    float ta = (v.flags & 2u) ? t.a : 1.0; float3 rgb = t.rgb;
    if (v.flags & 1u) { rgb = t.a > 0.0 ? rgb / t.a : rgb; }
    col = rgb * v.c1.rgb; cov = ta; if (r > 0.0) cov *= cover(v.p, c, h, r);
  } else { float blur = v.rp.y, k = clamp(1.0 - (sdf(v.p, c, h, r) + blur * 0.5) / (blur * 1.5), 0.0, 1.0); cov = k * k * (3.0 - 2.0 * k); }
  float A = cov * a; return float4(col * A, A); }
)MSL";
static id<MTLDevice> dev; static id<MTLRenderPipelineState> pso[4]; static id<MTLBuffer> ring[RING]; static int ri; static dispatch_semaphore_t sem;
static id<MTLTexture> white; static bool ready, failed, unified;
struct MTex { id<MTLTexture> tex; uint32_t ver; int32_t w, h; bool pm; };
static std::unordered_map<int32_t, MTex> texs;   // by image id (baked: its index, runtime: DYN_BASE + n)
static id<MTLCommandBuffer> last_cb;
// the glyph atlas: shelf-packed R8, a new texture when it fills (a frame in flight keeps the old one)
static const int ATLAS = 1024;
struct GSlot { uint64_t key; int16_t ax, ay; };
static GSlot gtab[8192]; static int gcount, gx, gy, growh; static id<MTLTexture> atlas;
static struct { uint32_t draws, quads, passes, ups; uint64_t bytes; double up_us; } st;
static double now_us() { timespec t; clock_gettime(CLOCK_MONOTONIC, &t); return t.tv_sec * 1e6 + t.tv_nsec / 1e3; }
static inline int32_t f2i(float v) { return (int32_t)fminf(fmaxf(v, -134217728.0f), 134217728.0f); }
static inline int32_t ifloor(float v) { int32_t i = f2i(v); return (float)i > v ? i - 1 : i; }
static inline int32_t iceil(float v) { int32_t i = f2i(v); return (float)i < v ? i + 1 : i; }
static RRect isect(RRect a, RRect b) { return RRect{a.x0 > b.x0 ? a.x0 : b.x0, a.y0 > b.y0 ? a.y0 : b.y0, a.x1 < b.x1 ? a.x1 : b.x1, a.y1 < b.y1 ? a.y1 : b.y1}; }
static RRect bounds(float x, float y, float w, float h) { return RRect{ifloor(x), ifloor(y), iceil(x + w), iceil(y + h)}; }
static inline uint32_t pack(uint32_t c, uint32_t a) { return (c >> 16 & 255) | (c >> 8 & 255) << 8 | (c & 255) << 16 | a << 24; }

static bool init(id<MTLDevice> d) {
  if (ready || failed) return ready;
  failed = true; dev = d;
  unified = d.hasUnifiedMemory;
  NSError* err = nil;
  id<MTLLibrary> lib = [d newLibraryWithSource:SRC options:nil error:&err];
  if (!lib) { fprintf(stderr, "zinc: metal renderer: shader build failed: %s\n", err.localizedDescription.UTF8String); return false; }
  static const MTLBlendFactor sf[4] = {MTLBlendFactorOne, MTLBlendFactorOne, MTLBlendFactorDestinationColor, MTLBlendFactorOne};
  static const MTLBlendFactor df[4] = {MTLBlendFactorOneMinusSourceAlpha, MTLBlendFactorOne, MTLBlendFactorOneMinusSourceAlpha, MTLBlendFactorOneMinusSourceColor};
  for (int b = 0; b < 4; b++) {
    MTLRenderPipelineDescriptor* pd = [MTLRenderPipelineDescriptor new];
    pd.vertexFunction = [lib newFunctionWithName:@"vs"]; pd.fragmentFunction = [lib newFunctionWithName:@"fs"];
    MTLRenderPipelineColorAttachmentDescriptor* ca = pd.colorAttachments[0];
    ca.pixelFormat = MTLPixelFormatBGRA8Unorm; ca.blendingEnabled = YES;
    ca.sourceRGBBlendFactor = ca.sourceAlphaBlendFactor = sf[b]; ca.destinationRGBBlendFactor = ca.destinationAlphaBlendFactor = df[b];
    pso[b] = [d newRenderPipelineStateWithDescriptor:pd error:&err];
    if (!pso[b]) { fprintf(stderr, "zinc: metal renderer: pipeline failed: %s\n", err.localizedDescription.UTF8String); return false; }
  }
  for (int i = 0; i < RING; i++) ring[i] = [d newBufferWithLength:(NSUInteger)CAP * sizeof(Inst) options:MTLResourceStorageModeShared | MTLResourceCPUCacheModeWriteCombined];
  sem = dispatch_semaphore_create(RING);
  MTLTextureDescriptor* td = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatBGRA8Unorm width:1 height:1 mipmapped:NO];
  white = [d newTextureWithDescriptor:td]; const uint32_t one = 0xFFFFFFFFu; [white replaceRegion:MTLRegionMake2D(0, 0, 1, 1) mipmapLevel:0 withBytes:&one bytesPerRow:4];
  ready = true; failed = false; return true;
}
static void new_atlas() {
  MTLTextureDescriptor* td = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:MTLPixelFormatR8Unorm width:ATLAS height:ATLAS mipmapped:NO];
  #if TARGET_OS_OSX
  td.storageMode = unified ? MTLStorageModeShared : MTLStorageModeManaged;
#else
  td.storageMode = MTLStorageModeShared;
#endif
  atlas = [dev newTextureWithDescriptor:td]; memset(gtab, 0, sizeof gtab); gcount = gx = gy = growh = 0;
}
static const GSlot* glyph_slot(int32_t font, const Font& f, const Glyph* g) {
  if (g->w > ATLAS || g->h > ATLAS) return nullptr;
  if (!atlas) new_atlas();
  const uint64_t key = ((uint64_t)(uint32_t)font << 32) | g->cp | (1ull << 63);
  for (;;) {
    uint32_t i = (uint32_t)((key * 0x9E3779B97F4A7C15ull) >> 51);
    while (gtab[i].key && gtab[i].key != key) i = (i + 1) & 8191;
    if (gtab[i].key == key) return &gtab[i];
    if (gcount > 6000 || gy + g->h > ATLAS) { new_atlas(); continue; }
    if (gx + g->w + 1 > ATLAS) { gy += growh + 1; gx = 0; growh = 0; if (gy + g->h > ATLAS) continue; }
    [atlas replaceRegion:MTLRegionMake2D(gx, gy, g->w, g->h) mipmapLevel:0 withBytes:f.bitmap + g->off bytesPerRow:g->w];
    gtab[i] = GSlot{key, (int16_t)gx, (int16_t)gy}; gx += g->w + 1; if (g->h > growh) growh = g->h; gcount++;
    return &gtab[i];
  }
}
static const Glyph* glyph_of(int32_t font, const Font& f, uint32_t cp) {
  if (font >= RUNTIME_FONT_BASE) return runtime_glyph(font, cp);
  int32_t lo = 0, hi = f.count - 1;
  while (lo <= hi) { int32_t m = (lo + hi) >> 1; if (f.glyphs[m].cp == cp) return &f.glyphs[m]; if (f.glyphs[m].cp < cp) lo = m + 1; else hi = m - 1; }
  return nullptr;
}
static uint32_t next_cp(const char* s, uint32_t n, uint32_t& i) {
  uint8_t c = (uint8_t)s[i];
  uint32_t w = c < 0x80 ? 1 : c < 0xE0 ? 2 : c < 0xF0 ? 3 : 4, cp = c < 0x80 ? c : c < 0xE0 ? c & 0x1F : c < 0xF0 ? c & 0x0F : c & 0x07;
  for (uint32_t k = 1; k < w && i + k < n; k++) cp = (cp << 6) | ((uint8_t)s[i + k] & 0x3F);
  i += w; return cp;
}
// pixels of a runtime image into a texture region, premultiplied when the texture keeps them so
static void put(id<MTLTexture> t, const uint32_t* px, int32_t stride, int32_t x, int32_t y, int32_t w, int32_t h, bool pm, bool alpha) {
  const double t0 = now_us();
  const uint32_t* src = px + (size_t)y * stride + x; static std::vector<uint32_t> tmp;
  size_t bpr = (size_t)stride * 4;
  if (pm || !alpha) {   // premultiplied for a target; a picture without alpha has none (0x00RRGGBB): shown opaque
    tmp.resize((size_t)w * h);
    for (int32_t j = 0; j < h; j++) for (int32_t i = 0; i < w; i++) {
      uint32_t p = src[(size_t)j * stride + i], a = alpha ? p >> 24 : 255;
      if (pm && a != 255) p = a << 24 | ((p >> 16 & 255) * a + 127) / 255 << 16 | ((p >> 8 & 255) * a + 127) / 255 << 8 | ((p & 255) * a + 127) / 255;
      tmp[(size_t)j * w + i] = alpha ? p : p | 0xFF000000u;
    }
    src = tmp.data(); bpr = (size_t)w * 4;
  }
  [t replaceRegion:MTLRegionMake2D(x, y, w, h) mipmapLevel:0 withBytes:src bytesPerRow:bpr];
  st.ups++; st.bytes += (uint64_t)w * h * 4; st.up_us += now_us() - t0;
}
static id<MTLTexture> make_tex(int32_t w, int32_t h, bool target, MTLPixelFormat f) {
  MTLTextureDescriptor* td = [MTLTextureDescriptor texture2DDescriptorWithPixelFormat:f width:w height:h mipmapped:NO];
  td.usage = target ? (MTLTextureUsageShaderRead | MTLTextureUsageRenderTarget) : MTLTextureUsageShaderRead;
  #if TARGET_OS_OSX
  td.storageMode = unified ? MTLStorageModeShared : MTLStorageModeManaged;
#else
  td.storageMode = MTLStorageModeShared;
#endif
  return [dev newTextureWithDescriptor:td];
}
/** The texture of runtime image `id`, current: whole when new or replaced by the CPU, a rectangle when only a rectangle changed under a GPU-held image. */
static MTex* dyn_tex(int32_t id, bool for_pass) {
  const uint32_t* px; int32_t w, h, stride;
  if (!dyn_view(id, &px, &w, &h, &stride)) return nullptr;
  const bool alpha = dyn_alpha(id);
  MTex& t = texs[id];
  RRect dirty{0, 0, 0, 0}; const bool gpu = dyn_gpu(id, &dirty);
  const bool want_pm = alpha && (gpu || for_pass);
  const uint32_t ver = image_version(id);
  if (!t.tex || t.w != w || t.h != h || (for_pass && t.pm != want_pm) || (t.ver != ver && !gpu) || (t.pm && !gpu)) {
    t.tex = make_tex(w, h, true, MTLPixelFormatBGRA8Unorm); t.w = w; t.h = h; t.pm = want_pm;
    if (!t.tex) return nullptr;
    put(t.tex, px, stride, 0, 0, w, h, t.pm, alpha); t.ver = ver; dyn_gpu_synced(id); return &t;
  }
  if (t.ver != ver) {   // GPU-held: its own passes moved the version; only a CPU rectangle is newer
    if (dirty.x0 < dirty.x1 && dirty.y0 < dirty.y1) {
      const int32_t x0 = dirty.x0 < 0 ? 0 : dirty.x0, y0 = dirty.y0 < 0 ? 0 : dirty.y0, x1 = dirty.x1 > w ? w : dirty.x1, y1 = dirty.y1 > h ? h : dirty.y1;
      if (x0 < x1 && y0 < y1) put(t.tex, px, stride, x0, y0, x1 - x0, y1 - y0, t.pm, alpha);
      dyn_gpu_synced(id);
    }
    t.ver = ver;
  }
  return &t;
}
static MTex* baked_tex(int32_t i) {
  MTex& t = texs[i];
  if (!t.tex) {
    const Image& im = images[i];
    t.tex = make_tex(im.w, im.h, false, MTLPixelFormatRGBA8Unorm); t.w = im.w; t.h = im.h;
    [t.tex replaceRegion:MTLRegionMake2D(0, 0, im.w, im.h) mipmapLevel:0 withBytes:im.rgba bytesPerRow:(size_t)im.w * 4];
  }
  return &t;
}
// one render target's batcher
struct Ctx {
  id<MTLCommandBuffer> cb; id<MTLRenderCommandEncoder> enc; id<MTLBuffer> buf; uint32_t n, b0; int32_t w, h; RRect clip, cs[16]; int sp; uint32_t blend;
  id<MTLTexture> set[MAXTEX]; int nset; bool full; Inst* mem;
};
static Ctx C;
static void flush() {
  if (C.n == C.b0) return;
  if (C.clip.x1 > C.clip.x0 && C.clip.y1 > C.clip.y0) {
    [C.enc setRenderPipelineState:pso[C.blend]];
    [C.enc setScissorRect:MTLScissorRect{(NSUInteger)C.clip.x0, (NSUInteger)C.clip.y0, (NSUInteger)(C.clip.x1 - C.clip.x0), (NSUInteger)(C.clip.y1 - C.clip.y0)}];
    [C.enc setVertexBuffer:C.buf offset:(NSUInteger)C.b0 * sizeof(Inst) atIndex:0];
    id<MTLTexture> ts[MAXTEX]; for (int i = 0; i < MAXTEX; i++) ts[i] = i < C.nset ? C.set[i] : white;
    [C.enc setFragmentTextures:ts withRange:NSMakeRange(0, MAXTEX)];
    [C.enc drawPrimitives:MTLPrimitiveTypeTriangleStrip vertexStart:0 vertexCount:4 instanceCount:C.n - C.b0];
    st.draws++; st.quads += C.n - C.b0;
  }
  C.b0 = C.n;
}
static void set_clip(RRect r) { flush(); C.clip = RRect{std::max(r.x0, 0), std::max(r.y0, 0), std::min(r.x1, C.w), std::min(r.y1, C.h)}; }
static void set_blend(uint32_t m) { if (m != C.blend) { flush(); C.blend = m; } }
static int slot(id<MTLTexture> t) {
  for (int i = 0; i < C.nset; i++) if (C.set[i] == t) return i;
  if (C.nset == MAXTEX) { flush(); for (int i = 0; i < MAXTEX; i++) C.set[i] = nil; C.nset = 0; }
  C.set[C.nset] = t; return C.nset++;
}
static Inst* add() {
  if (C.n >= CAP) { if (!C.full) { C.full = true; fprintf(stderr, "zinc: metal renderer: more than %u quads in a frame, the rest is dropped\n", (unsigned)CAP); } return nullptr; }
  Inst* i = &C.mem[C.n++]; memset((void*)i, 0, sizeof *i); return i;
}
static void rectq(const Cmd& c, const RRect& b, uint32_t mode) {
  Inst* q = add(); if (!q) return;
  const float hw = c.w * 0.5f, hh = c.h * 0.5f;
  q->x0 = (float)b.x0; q->y0 = (float)b.y0; q->x1 = (float)b.x1; q->y1 = (float)b.y1;
  q->bx = c.x + hw; q->by = c.y + hh; q->bw = hw; q->bh = hh; q->r = fminf(fmaxf(c.r, 0), hw < hh ? hw : hh);
  q->mode = mode; q->grad = mode == M_FILL ? c.grad : 0; q->c1 = pack(c.c1, c.alpha); q->c2 = pack(c.c2, 255);
  if (mode == M_BORDER) q->p1 = c.s; else if (mode == M_SHADOW) q->p1 = c.s > 0.5f ? c.s : 0.5f;
}
static void draw_text(const Cmd& c, const char* s) {
  const Font* fp = font_at(c.res); if (!fp) return;
  const Font& f = *fp;
  int32_t pen = ifloor(c.x * 64), base = ifloor(c.y + 0.5f) + f.ascent;
  for (uint32_t i = 0; i < c.n;) {
    const uint32_t cp = next_cp(s, c.n, i);
    const Glyph* g = glyph_of(c.res, f, cp);
    if (!g && !ignorable_cp(cp)) g = glyph_of(c.res, f, '?');
    if (!g) continue;
    if (g->w > 0 && g->h > 0) {
      const GSlot* sl = glyph_slot(c.res, f, g);
      if (sl) {
        Inst* q = add(); if (!q) return;
        const int32_t px = ((pen + 32) >> 6) + g->x0, py = base + g->y0;
        q->x0 = (float)px; q->y0 = (float)py; q->x1 = (float)(px + g->w); q->y1 = (float)(py + g->h);
        q->u0 = (float)sl->ax / ATLAS; q->v0 = (float)sl->ay / ATLAS; q->u1 = (float)(sl->ax + g->w) / ATLAS; q->v1 = (float)(sl->ay + g->h) / ATLAS;
        q->mode = M_TEXT; q->c1 = pack(c.c1, c.alpha); q->tex = (uint32_t)slot(atlas);
      }
    }
    pen += g->adv + f2i(c.s * 64);
  }
}
static void draw_image(const Cmd& c) {
  if (!(c.w > 0 && c.h > 0 && c.w < 1e30f && c.h < 1e30f && c.x - c.x == 0 && c.y - c.y == 0)) return;
  const Box m = image_box(c);
  if (!(m.w != 0 && m.h != 0 && m.w - m.w == 0 && m.h - m.h == 0 && m.x - m.x == 0 && m.y - m.y == 0)) return;
  const float mw = m.w < 0 ? -m.w : m.w, mh = m.h < 0 ? -m.h : m.h;
  MTex* t; bool alpha = true, nearest;
  if (c.res >= DYN_BASE) {
    t = dyn_tex(c.res, false); if (!t) return;
    alpha = dyn_alpha(c.res);
    nearest = c.grad == 1 || (fabsf((float)t->w / c.w - 1) < 1e-6f && fabsf((float)t->h / c.h - 1) < 1e-6f);
  } else {
    if (c.res < 0 || c.res >= image_count) return;
    t = baked_tex(c.res); nearest = false;
  }
  if (!(((float)t->w / mw < 1e6f) && ((float)t->h / mh < 1e6f))) return;
  RRect b = bounds(c.x, c.y, c.w, c.h);
  const bool boxed = (c.pad & kImageBox) || (c.res >= DYN_BASE && alpha);
  const float mx0 = m.w < 0 ? m.x + m.w : m.x, my0 = m.h < 0 ? m.y + m.h : m.y;
  if (boxed) {
    const bool copy = c.grad != 1 && mw == (float)t->w && mh == (float)t->h && m.x == (float)ifloor(m.x) && m.y == (float)ifloor(m.y);
    nearest = c.grad == 1 || copy;
    b = isect(b, bounds(mx0, my0, mw, mh));
  }
  if (b.x0 >= b.x1 || b.y0 >= b.y1) return;
  set_blend(image_blend(c));
  Inst* q = add(); if (!q) return;
  q->x0 = (float)b.x0; q->y0 = (float)b.y0; q->x1 = (float)b.x1; q->y1 = (float)b.y1;
  const float hw = c.w * 0.5f, hh = c.h * 0.5f, rad = image_radius(c);
  q->bx = c.x + hw; q->by = c.y + hh; q->bw = hw; q->bh = hh; q->r = rad > 0 ? fminf(rad, hw < hh ? hw : hh) : 0;
  q->u0 = ((float)b.x0 - m.x) / m.w; q->u1 = ((float)b.x1 - m.x) / m.w; q->v0 = ((float)b.y0 - m.y) / m.h; q->v1 = ((float)b.y1 - m.y) / m.h;
  q->mode = M_IMAGE; q->c1 = pack(image_tint(c), c.alpha); q->tex = (uint32_t)slot(t->tex);
  q->flags = (t->pm ? 1u : 0u) | (c.res < DYN_BASE || alpha ? 2u : 0u) | (nearest ? 4u : 0u);
}
static void run_list(const Frame& f) {
  C.sp = 0;
  for (uint32_t i = 0; i < f.count; i++) {
    const Cmd& c = f.cmds[i];
    if (c.kind != IMAGE) set_blend(0);
    switch (c.kind) {
      case CLEAR: { Cmd k = c; k.x = (float)C.clip.x0; k.y = (float)C.clip.y0; k.w = (float)(C.clip.x1 - C.clip.x0); k.h = (float)(C.clip.y1 - C.clip.y0); k.r = 0; k.alpha = 255; k.grad = 0;
        if (k.w > 0 && k.h > 0) rectq(k, C.clip, M_FILL); break; }
      case RECT: { const RRect b = isect(bounds(c.x, c.y, c.w, c.h), C.clip); if (b.x0 < b.x1 && b.y0 < b.y1) rectq(c, b, M_FILL); break; }
      case BORDER: { const RRect b = isect(bounds(c.x, c.y, c.w, c.h), C.clip); if (b.x0 < b.x1 && b.y0 < b.y1) rectq(c, b, M_BORDER); break; }
      case SHADOW: { const float bl = c.s > 0.5f ? c.s : 0.5f; const RRect b = isect(bounds(c.x - bl, c.y - bl, c.w + 2 * bl, c.h + 2 * bl), C.clip); if (b.x0 < b.x1 && b.y0 < b.y1) rectq(c, b, M_SHADOW); break; }
      case TEXT: draw_text(c, f.text + c.off); break;
      case IMAGE: draw_image(c); break;
      case CLIP: if (C.sp < 16) { C.cs[C.sp++] = C.clip; set_clip(isect(C.clip, bounds(c.x, c.y, c.w, c.h))); } break;
      case UNCLIP: if (C.sp > 0) set_clip(C.cs[--C.sp]); break;
      default: break;
    }
  }
  flush();
}
/** Whether every command of the list is one this renderer draws. */
static bool supported(const Frame& f) {
  for (uint32_t i = 0; i < f.count; i++) {
    const Cmd& c = f.cmds[i];
    switch (c.kind) {
      case CLEAR: case BORDER: case SHADOW: case UNCLIP: case TEXT: break;
      case RECT: if (c.grad > 3) return false; break;
      case CLIP: if (c.r > 0) return false; break;
      case IMAGE: if (c.grad == 2 || (c.pad & kImageLayer) || (c.res >= DYN_BASE && dyn_picture(c.res))) return false; break;
      default: if (getenv("ZINC_METAL_LOG")) fprintf(stderr, "metal: command kind %d is drawn in software\n", c.kind); return false;
    }
  }
  return true;
}
static bool begin(id<MTLTexture> target, int32_t w, int32_t h, bool clear) {
  MTLRenderPassDescriptor* rp = [MTLRenderPassDescriptor renderPassDescriptor];
  rp.colorAttachments[0].texture = target; rp.colorAttachments[0].storeAction = MTLStoreActionStore;
  rp.colorAttachments[0].loadAction = clear ? MTLLoadActionClear : MTLLoadActionLoad; rp.colorAttachments[0].clearColor = MTLClearColorMake(0, 0, 0, 1);
  C.enc = [C.cb renderCommandEncoderWithDescriptor:rp]; if (!C.enc) return false;
  const float res[2] = {(float)w, (float)h}; [C.enc setVertexBytes:res length:sizeof res atIndex:1];
  C.w = w; C.h = h; C.clip = RRect{0, 0, w, h}; C.blend = 0; C.nset = 0; for (int i = 0; i < MAXTEX; i++) C.set[i] = nil;
  return true;
}
static void end() { flush(); [C.enc endEncoding]; C.enc = nil; }
}  // namespace mr

/** Runs the passes of the render targets queued since the last time, and, when `lists` is given (n > 0), draws them into the drawable and presents.
 *  False (nothing drawn, passes kept): a command it does not draw; the caller draws the frame in software. */
extern "C" bool hal_mtl_replay(const HalCmdList* const* lists, int n, int pw, int ph) {
  @autoreleasepool {
    if (!layer || !mr::init(layer.device)) { if (getenv("ZINC_METAL_LOG")) fprintf(stderr, "metal: init failed\n"); return false; }
    bool ok = true;
    for (int i = 0; i < n && ok; i++) ok = mr::supported(Frame{(const Cmd*)lists[i]->cmds, lists[i]->count, lists[i]->text, lists[i]->pts});
    if (!ok) return false;
    uint32_t np = 0; const ZrtPass* passes = zrt_passes ? zrt_passes(&np) : nullptr;
    dispatch_semaphore_wait(mr::sem, DISPATCH_TIME_FOREVER);
    id<MTLCommandBuffer> cb = [queue commandBuffer];
    mr::C.cb = cb; mr::C.buf = mr::ring[mr::ri]; mr::C.mem = (mr::Inst*)mr::ring[mr::ri].contents; mr::C.n = mr::C.b0 = 0; mr::C.full = false; mr::ri = (mr::ri + 1) % mr::RING;
    mr::st = {};
    for (uint32_t k = 0; k < np; k++) {   // the render targets first: what the frame draws of them is current
      const ZrtPass& p = passes[k];
      mr::MTex* t = mr::dyn_tex(p.img, true);
      if (!t || t->w != p.w || t->h != p.h) continue;
      const Frame fr{p.cmds, p.count, p.text, p.pts};
      if (!mr::supported(fr)) { fprintf(stderr, "zinc: metal renderer: a render target holds a command it does not draw yet (it stays as it was)\n"); continue; }
      if (!mr::begin(t->tex, p.w, p.h, false)) continue;
      mr::run_list(fr); mr::end(); mr::st.passes++;
    }
    if (zrt_passes_done) zrt_passes_done();
    id<CAMetalDrawable> d = nil;
    if (n > 0) {
      if (layer.drawableSize.width != pw || layer.drawableSize.height != ph) layer.drawableSize = CGSizeMake(pw, ph);
      d = next_drawable();
    }
    if (getenv("ZINC_METAL_LOG")) fprintf(stderr, "metal: %d lists, %u passes, drawable %p, size %dx%d\n", n, np, (__bridge void*)d, pw, ph);
    id<MTLTexture> dtex = d ? d.texture : nil;
    if (d) {
      if (mr::begin(d.texture, (int)d.texture.width, (int)d.texture.height, true)) {
        for (int i = 0; i < n; i++) mr::run_list(Frame{(const Cmd*)lists[i]->cmds, lists[i]->count, lists[i]->text, lists[i]->pts});
        mr::end();
      }
      [cb presentDrawable:d];
    }
    const auto stc = mr::st;
    dispatch_semaphore_t sem = mr::sem;
    [cb addCompletedHandler:^(id<MTLCommandBuffer> b) {
      if (zrt_frame_stats) {
        zrt_frame_stats[0] = stc.draws; zrt_frame_stats[1] = stc.quads; zrt_frame_stats[2] = (uint32_t)stc.bytes; zrt_frame_stats[3] = stc.ups; zrt_frame_stats[4] = (uint32_t)stc.up_us;
        zrt_frame_stats[6] = (uint32_t)((b.GPUEndTime - b.GPUStartTime) * 1e6); zrt_frame_stats[7] = stc.passes;
      }
      dispatch_semaphore_signal(sem);
    }];
    [cb commit];
    mr::last_cb = cb;
    static const char* shot = getenv("ZINC_METAL_SHOT");   // the last frame the GPU drew, as a 32-bit BMP (tests: the screenshot of the window is the raster's)
    if (shot && d) {
      [cb waitUntilCompleted];
      const NSUInteger w = dtex.width, h = dtex.height; std::vector<uint32_t> px(w * h);
      [dtex getBytes:px.data() bytesPerRow:w * 4 fromRegion:MTLRegionMake2D(0, 0, w, h) mipmapLevel:0];
      static int shotn; char shotp[1024]; snprintf(shotp, sizeof shotp, shot, ++shotn);   // a %d in the name: one file a drawn frame
      if (FILE* f = fopen(shotp, "wb")) {
        uint32_t hd[14] = {54 + (uint32_t)(w * h * 4), 0, 54, 40, (uint32_t)w, (uint32_t)h, 0x200001, 0, (uint32_t)(w * h * 4), 0, 0, 0, 0, 0};
        const uint16_t magic = 0x4d42; fwrite(&magic, 2, 1, f);
        fwrite(&hd[0], 4, 3, f); fwrite(&hd[3], 4, 1, f); fwrite(&hd[4], 4, 2, f); fwrite(&hd[6], 4, 7, f);
        for (NSUInteger y = h; y-- > 0;) fwrite(px.data() + y * w, 4, w, f);   // bottom-up rows
        fclose(f);
      }
    }
    return true;
  }
}
/** The CPU pixels of every GPU-held image are current again (a frame is about to be drawn in software). */
extern "C" void hal_mtl_readback(void) {
  if (!mr::ready) return;
  if (mr::last_cb) [mr::last_cb waitUntilCompleted];
  for (auto& kv : mr::texs) {
    RRect dirty;
    if (kv.first < zrt::raster::DYN_BASE || !zrt::raster::dyn_gpu(kv.first, &dirty)) continue;
    uint32_t* px = zrt::raster::dyn_pixels(kv.first); mr::MTex& t = kv.second;
    if (!px || !t.tex) continue;
    [t.tex getBytes:px bytesPerRow:(NSUInteger)t.w * 4 fromRegion:MTLRegionMake2D(0, 0, t.w, t.h) mipmapLevel:0];
    const bool alpha = zrt::raster::dyn_alpha(kv.first);
    for (size_t i = 0, n = (size_t)t.w * t.h; i < n; i++) {
      uint32_t p = px[i], a = p >> 24;
      if (!alpha) { px[i] = p & 0xFFFFFFu; continue; }
      if (t.pm && a && a != 255) px[i] = a << 24 | std::min(255u, ((p >> 16 & 255) * 255 + a / 2) / a) << 16 | std::min(255u, ((p >> 8 & 255) * 255 + a / 2) / a) << 8 | std::min(255u, ((p & 255) * 255 + a / 2) / a);
    }
    zrt::raster::dyn_gpu_release(kv.first); t.pm = false;
  }
}
/** Turns on the render targets of the GPU renderer (ZINC_RENDERER=metal): false where the device has no unified memory (the CPU path stays). */
extern "C" bool hal_mtl_gpu_enable(void) {
  if (!layer || !mr::init(layer.device) || !mr::unified || !&zrt_gpu_targets) return false;
  zrt_gpu_targets = true;
  return true;
}
