// Sierra window host: the shared software raster, presented by Cocoa without SDL or Metal.
#import <Cocoa/Cocoa.h>
#include "hal.h"
#include <cstdlib>
#include <cstring>
#include <vector>

namespace {
NSWindow* window;
NSAutoreleasePool* pool;
std::vector<uint32_t> pixels;
int width, height, imageWidth, imageHeight, frames;
bool headless, quit;
uint32_t buttons;
uint32_t pointerButtons;
uint64_t nextFrame;
bool enabled(const char* name) { const char* s = std::getenv(name); return s && *s && std::strcmp(s, "0"); }
uint32_t gameButton(unsigned short key) {
  switch (key) {
    case 126: return HAL_UP; case 125: return HAL_DOWN; case 123: return HAL_LEFT; case 124: return HAL_RIGHT;
    case 49: return HAL_A; case 36: return HAL_START; case 53: return HAL_SELECT;
    default: return 0;
  }
}
}

@interface ZincLegacyView : NSView
@end
@implementation ZincLegacyView
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstResponder { return YES; }
- (void)keyDown:(NSEvent*)event { (void)event; }   // game keys were consumed by the HAL; do not beep as a text responder
- (void)drawRect:(NSRect)dirty {
  (void)dirty;
  if (pixels.empty()) return;
  CGColorSpaceRef color = CGColorSpaceCreateDeviceRGB();
  CGDataProviderRef data = CGDataProviderCreateWithData(nullptr, pixels.data(), pixels.size() * sizeof(uint32_t), nullptr);
  CGImageRef image = CGImageCreate(imageWidth, imageHeight, 8, 32, imageWidth * sizeof(uint32_t), color,
    kCGBitmapByteOrder32Little | kCGImageAlphaNoneSkipFirst, data, nullptr, false, kCGRenderingIntentDefault);
  NSImage* bitmap = [[NSImage alloc] initWithCGImage:image size:NSMakeSize(imageWidth, imageHeight)];
  [bitmap drawInRect:self.bounds fromRect:NSZeroRect operation:NSCompositingOperationCopy fraction:1 respectFlipped:YES hints:nil];
  [bitmap release];
  CGImageRelease(image); CGDataProviderRelease(data); CGColorSpaceRelease(color);
}
@end

@interface ZincLegacyDelegate : NSObject <NSWindowDelegate>
@end
@implementation ZincLegacyDelegate
- (BOOL)windowShouldClose:(id)sender { (void)sender; quit = true; return YES; }
- (void)windowDidResignKey:(NSNotification*)notification { (void)notification; buttons = pointerButtons = 0; }
@end

namespace { ZincLegacyDelegate* delegate; }
extern "C" {
void hal_init(const HalConfig* cfg) {
  width = cfg->width; height = cfg->height; quit = false; buttons = pointerButtons = 0;
  headless = enabled("ZINC_HEADLESS");
  const char* budget = std::getenv("ZINC_FRAMES");
  frames = budget ? std::atoi(budget) : headless ? 60 : -1;
  nextFrame = hal_time_us();
  if (headless || !cfg->gfx) return;
  pool = [[NSAutoreleasePool alloc] init];
  [NSApplication sharedApplication];
  const bool background = enabled("ZINC_BACKGROUND");
  // As in SDL's Cocoa host, leave a background CLI's activation policy alone.
  if (!background) [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
  [NSApp finishLaunching];
  window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, width, height)
    styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
    backing:NSBackingStoreBuffered defer:NO];
  [window setReleasedWhenClosed:NO];
  [window setTitle:[NSString stringWithUTF8String:cfg->title ? cfg->title : "Zinc Legacy"]];
  ZincLegacyView* view = [[ZincLegacyView alloc] initWithFrame:NSMakeRect(0, 0, width, height)];
  [window setContentView:view]; [window makeFirstResponder:view]; [view release];
  delegate = [[ZincLegacyDelegate alloc] init]; [window setDelegate:delegate];
  [window center];
  [window orderFront:nil];
  if (!background) { [window makeKeyWindow]; [NSApp activateIgnoringOtherApps:YES]; }
}
void hal_shutdown(void) {
  [window setDelegate:nil]; [window close]; [window release]; window = nil;
  [delegate release]; delegate = nil;
  pixels.clear();
  [pool drain]; pool = nil;
}
void hal_frame_begin(void) {}
void hal_frame_end(void) {
  if (headless) return;
  const uint64_t now = hal_time_us();
  nextFrame += 16667;
  if (nextFrame > now) hal_sleep_us(nextFrame - now); else nextFrame = now;
}
double hal_fixed_dt(void) { return 1.0 / 60.0; }
void hal_surface_size(int* w, int* h) { *w = width; *h = height; }
int32_t hal_pixel_scale(void) { return 1; }
void hal_present(const HalFrame* frame) {
  if (!window || !frame) return;
  @autoreleasepool {
    imageWidth = frame->w; imageHeight = frame->h;
    pixels.resize(static_cast<size_t>(imageWidth) * imageHeight);
    frame->render(pixels.data(), 0, imageHeight);
    [[window contentView] setNeedsDisplay:YES];
    [window displayIfNeeded];
  }
}
void hal_poll_input(HalInput* in) {
  *in = {};
  if (frames == 0) quit = true;
  if (frames > 0) --frames;
  if (window) {
    @autoreleasepool {
      NSEvent* event;
      while ((event = [NSApp nextEventMatchingMask:NSEventMaskAny untilDate:[NSDate distantPast] inMode:NSDefaultRunLoopMode dequeue:YES])) {
        if ([event window] == window) {
          const NSEventType type = [event type];
          if (type == NSEventTypeKeyDown) buttons |= gameButton([event keyCode]);
          if (type == NSEventTypeKeyUp) buttons &= ~gameButton([event keyCode]);
          if (type == NSEventTypeScrollWheel) { in->wheel += [event scrollingDeltaY]; in->wheel_x += [event scrollingDeltaX]; }
          const bool down = type == NSEventTypeLeftMouseDown || type == NSEventTypeRightMouseDown || type == NSEventTypeOtherMouseDown;
          const bool up = type == NSEventTypeLeftMouseUp || type == NSEventTypeRightMouseUp || type == NSEventTypeOtherMouseUp;
          const NSInteger nativeButton = (type == NSEventTypeRightMouseDown || type == NSEventTypeRightMouseUp) ? 1 :
            (type == NSEventTypeLeftMouseDown || type == NSEventTypeLeftMouseUp) ? 0 : [event buttonNumber];
          if ((down || up) && nativeButton < 3) {
            const int button = nativeButton == 1 ? 2 : nativeButton == 2 ? 1 : 0;
            const uint32_t bit = 1u << nativeButton;
            if (down) pointerButtons |= bit; else pointerButtons &= ~bit;
            const NSPoint p = [[window contentView] convertPoint:[event locationInWindow] fromView:nil];
            if (in->nbtn < HAL_MAX_BUTTON_EVENTS) in->btn[in->nbtn++] = {static_cast<float>(p.x), static_cast<float>(p.y), button, down};
          }
        }
        [NSApp sendEvent:event];
      }
      NSPoint point = [[window contentView] convertPoint:[window mouseLocationOutsideOfEventStream] fromView:nil];
      in->px = point.x; in->py = point.y;
      in->pdown = pointerButtons & 1; in->pbuttons = pointerButtons;
    }
  }
  in->buttons = buttons; in->quit = quit;
}
}
