// The one piece of the SDL HAL that needs AppKit (ZN-249): a transparent window also needs its Metal layer to stop being opaque, or the compositor ignores the alpha of what is drawn.
#import <Cocoa/Cocoa.h>
extern "C" void hal_sdl_transparent_layers(void* nswindow) {
  NSWindow* w = (__bridge NSWindow*)nswindow;
  if (!w) return;
  w.opaque = NO;
  w.backgroundColor = NSColor.clearColor;
  NSView* content = w.contentView;
  content.wantsLayer = YES;
  content.layer.opaque = NO;
  for (NSView* v in content.subviews) { v.wantsLayer = YES; v.layer.opaque = NO; }
}
