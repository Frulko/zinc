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
// The colour behind the frame (hal_sdl.cpp window_background): the window's and its content layer's, so an edge that grows during a live resize
// shows the app's background until the frame of the new size covers it
extern "C" void hal_sdl_window_background(void* nswindow, uint32_t rgb) {
  NSWindow* w = (__bridge NSWindow*)nswindow;
  if (!w) return;
  NSColor* c = [NSColor colorWithSRGBRed:((rgb >> 16) & 255) / 255.0 green:((rgb >> 8) & 255) / 255.0 blue:(rgb & 255) / 255.0 alpha:1];
  w.backgroundColor = c;
  if (w.contentView.layer) w.contentView.layer.backgroundColor = c.CGColor;
}
