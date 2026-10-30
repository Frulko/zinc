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
// Precise scrolling of the main window (trackpad, Magic Mouse) straight from its NSEvents (hal_sdl.cpp ns_scroll): SDL keeps only the deltas, and the
// gesture phase (fingers down, lifted) and the OS momentum phase are what lets zinc:ui follow the fingers and then macOS's own inertia. Such an event
// is not passed on to SDL; notched wheels, precise devices without phases and the other windows' events still go through SDL. With nswindow null it
// only answers that the stream exists (the weak stand-in in hal_sdl.cpp answers 0).
extern "C" int hal_sdl_scroll_monitor(void* nswindow, void (*cb)(double age_s, double dx, double dy, uint32_t phase, uint32_t momentum)) {
  static id monitor;
  NSWindow* w = (__bridge NSWindow*)nswindow;
  if (!w || monitor) return 1;
  __weak NSWindow* main = w;
  monitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel handler:^NSEvent*(NSEvent* e) {
    if (e.window != main || !e.hasPreciseScrollingDeltas || (e.phase == NSEventPhaseNone && e.momentumPhase == NSEventPhaseNone)) return e;
    cb(NSProcessInfo.processInfo.systemUptime - e.timestamp, e.scrollingDeltaX, e.scrollingDeltaY, (uint32_t)e.phase, (uint32_t)e.momentumPhase);
    return nil;
  }];
  return 1;
}
// System Settings > Accessibility > Display > Reduce motion (hal_sdl.cpp signal_theme: the `reducemotion` signal)
// The program's command-line arguments are not files to open: AppKit hands each one to application:openFile:, which SDL3 turns into a drop
// (`zinc run examples/discord` dropped "examples/discord" on the app). SDL2 registered this default; SDL3 no longer does. Not persisted.
extern "C" void hal_sdl_ignore_argv_files(void) {
  [[NSUserDefaults standardUserDefaults] registerDefaults:@{@"NSTreatUnrecognizedCommandLineArgumentsAsOpen": @NO}];
}
extern "C" int hal_sdl_reduce_motion(void) { return NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion ? 1 : 0; }
