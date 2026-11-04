// zinc:sf-symbols on macOS: NSImage draws the symbol into a runtime image of zinc:gfx.
#define ZRT_HOSTED_CPP
#import <AppKit/AppKit.h>
#include <dlfcn.h>
#include <map>
#include <string>
#include "zinc_native_symbols.h"
#include "zrt_raster.h"

// A plugin loaded by zinc finds the rasterizer in the process (as plugins/screen-capture does); a program without zinc:gfx has none: -1.
template <class F> static F host_function(const char* name, F self) { F f = reinterpret_cast<F>(dlsym(RTLD_DEFAULT, name)); return f != self ? f : nullptr; }
namespace zrt { namespace raster {
__attribute__((weak)) int32_t dyn_create(int32_t w, int32_t h) { static auto f = host_function("_ZN3zrt6raster10dyn_createEii", &dyn_create); return f ? f(w, h) : -1; }
__attribute__((weak)) void dyn_update(int32_t id, const uint32_t* px, int32_t s) { static auto f = host_function("_ZN3zrt6raster10dyn_updateEiPKji", &dyn_update); if (f) f(id, px, s); }
__attribute__((weak)) void dyn_set_alpha(int32_t id, bool on) { static auto f = host_function("_ZN3zrt6raster13dyn_set_alphaEib", &dyn_set_alpha); if (f) f(id, on); }
__attribute__((weak)) uint32_t* dyn_pixels(int32_t id) { static auto f = host_function("_ZN3zrt6raster10dyn_pixelsEi", &dyn_pixels); return f ? f(id) : nullptr; }
}}

namespace {
const int PIXELS_PER_POINT = 2;

int32_t drawSymbol(NSString* name, double side, double pointSize, double weight) {
  NSImage* image = [NSImage imageWithSystemSymbolName:name accessibilityDescription:nil];
  if (!image) return -1;
  NSImageSymbolConfiguration* configuration = [NSImageSymbolConfiguration configurationWithPointSize:pointSize weight:weight scale:NSImageSymbolScaleMedium];
  image = [image imageWithSymbolConfiguration:configuration];
  const int pixels = (int)(side * PIXELS_PER_POINT);
  const int32_t runtimeImage = zrt::raster::dyn_create(pixels, pixels);
  uint32_t* out = runtimeImage >= 0 ? zrt::raster::dyn_pixels(runtimeImage) : nullptr;
  if (!out) return -1;
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef context = CGBitmapContextCreate(nullptr, pixels, pixels, 8, 0, space, kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst);
  CGColorSpaceRelease(space);
  CGContextScaleCTM(context, PIXELS_PER_POINT, PIXELS_PER_POINT);
  [NSGraphicsContext saveGraphicsState];
  NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithCGContext:context flipped:NO];
  const NSSize size = image.size;
  const NSRect glyph = NSMakeRect((side - size.width) / 2, (side - size.height) / 2, size.width, size.height);
  [image drawInRect:glyph fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1];
  [NSColor.whiteColor set];
  NSRectFillUsingOperation(NSMakeRect(0, 0, side, side), NSCompositingOperationSourceIn);
  [NSGraphicsContext restoreGraphicsState];
  // White over nothing: the premultiplied colour is the alpha, so every pixel is white with its alpha, the runtime images' straight format.
  const uint8_t* rows = (const uint8_t*)CGBitmapContextGetData(context);
  const size_t stride = CGBitmapContextGetBytesPerRow(context);
  for (int y = 0; y < pixels; y++) {
    const uint32_t* row = (const uint32_t*)(rows + stride * y);
    for (int x = 0; x < pixels; x++) out[y * pixels + x] = (row[x] & 0xFF000000u) | 0xFFFFFFu;
  }
  CGContextRelease(context);
  zrt::raster::dyn_set_alpha(runtimeImage, true);
  zrt::raster::dyn_update(runtimeImage, nullptr, 0);
  return runtimeImage;
}
}  // namespace

struct MacSymbols : NativeSymbols {
  std::map<std::string, int32_t> images;
  int32_t image(zrt::String name, double side, double pointSize, double weight) override {
    const char* deterministic = getenv("ZINC_DETERMINISTIC");
    if (deterministic && deterministic[0] == '1') return -1;
    const std::string nameText(name.ptr(), name.bytes());
    const std::string key = nameText + "/" + std::to_string(side) + "/" + std::to_string(pointSize) + "/" + std::to_string(weight);
    auto found = images.find(key);
    if (found != images.end()) return found->second;
    const int32_t made = drawSymbol([NSString stringWithUTF8String:nameText.c_str()], side, pointSize, weight);
    images[key] = made;
    return made;
  }
};

NativeSymbols* zinc_create_Symbols() {
  static MacSymbols instance;
  instance.rc = zrt::IMMORTAL;
  return &instance;
}
