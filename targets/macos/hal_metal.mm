// The iOS and macOS (ZN-764) present of the software raster through Metal (ZN-627): the frame is memory the GPU reads as it is (a shared MTLBuffer: Apple GPUs
// have one memory for CPU and GPU), so the raster's damaged rows reach the screen without a copy on the CPU. Each present is one GPU blit of
// the buffer into the CAMetalLayer's drawable (a drawable's content is undefined when it is taken, so the whole frame goes in; on the GPU it
// is a fraction of a millisecond). What it replaces: SDL_Renderer's SDL_UpdateTexture, a staging texture made, filled by the CPU and blitted
// at every frame (5.6 to 6.8 ms p50 on the iPhone 17 simulator). hal_sdl.cpp keeps that path for ZINC_PRESENT=texture.
#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>
#include <SDL3/SDL.h>
#include <TargetConditionals.h>
#include <stdint.h>
#include <stdlib.h>

static SDL_MetalView view;
static CAMetalLayer* layer;
static id<MTLCommandQueue> queue;
static id<MTLBuffer> frame;
static int fw, fh;
static id<MTLCommandBuffer> reading;   // the last present: the GPU reads the frame until it completes

/** The window's CAMetalLayer (the window has SDL_WINDOW_METAL): false keeps the SDL_Renderer path. */
extern "C" bool hal_mtl_open(SDL_Window* w, bool nearest) {
  id<MTLDevice> dev = MTLCreateSystemDefaultDevice();
  if (!dev || !(view = SDL_Metal_CreateView(w))) return false;
  layer = (__bridge CAMetalLayer*)SDL_Metal_GetLayer(view);
  if (!layer) return false;
  layer.device = dev;
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

/** The GPU no longer reads the frame: the raster may write into it. */
extern "C" void hal_mtl_wait(void) {
  if (reading) { [reading waitUntilCompleted]; reading = nil; }
}

/** The frame's memory at this size, w * h pixels, zeroed when the size changes (a new buffer: the old one may still be read). */
extern "C" uint32_t* hal_mtl_pixels(int w, int h) {
  if (!frame || w != fw || h != fh) {
    hal_mtl_wait();
    frame = [layer.device newBufferWithLength:(NSUInteger)w * h * 4 options:MTLResourceStorageModeShared];   // Metal zeroes a new buffer
    fw = w; fh = h;
  }
  return frame ? (uint32_t*)frame.contents : nullptr;
}

/** The frame into the next drawable, on the GPU; the drawable is shown at the next display refresh. */
extern "C" void hal_mtl_present(void) {
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
  hal_mtl_wait();
  frame = nil; queue = nil; layer = nil;
  if (view) { SDL_Metal_DestroyView(view); view = nullptr; }
}
