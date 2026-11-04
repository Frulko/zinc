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

extern "C" __attribute__((weak)) void zrt_prof_info(const char* key, const char* val);   // runtime/gfx.cpp: what the machine's GPU is

static SDL_MetalView view;
static CAMetalLayer* layer;
static id<MTLCommandQueue> queue;
static id<MTLBuffer> frame;
static int fw, fh;
static id<MTLCommandBuffer> reading;   // the last present: the GPU reads the frame until it completes

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
    return queue != nil;
  }
}
static void metal_close() {
  @autoreleasepool {
    if (reading) { [reading waitUntilCompleted]; reading = nil; }
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
    if (layer.drawableSize.width != fw || layer.drawableSize.height != fh) layer.drawableSize = CGSizeMake(fw, fh);   // SDL's view sets it from its bounds
    id<CAMetalDrawable> d = [layer nextDrawable];
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
