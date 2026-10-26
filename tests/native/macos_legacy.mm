// Exercise the actual legacy HAL without posting system events or taking keyboard focus.
#include "../../targets/macos-legacy/hal_cocoa.mm"
#include <cassert>
#include <cstdio>

static void render(uint32_t* rows, int32_t y0, int32_t y1) {
  for (int y = y0; y < y1; ++y) for (int x = 0; x < 64; ++x)
    rows[(y - y0) * 64 + x] = y < 24 ? (x < 32 ? 0xff0000 : 0x00ff00) : (x < 32 ? 0x0000ff : 0xffffff);
}
static NSEvent* key(NSEventType type, unsigned short code) {
  return [NSEvent keyEventWithType:type location:NSZeroPoint modifierFlags:0 timestamp:0
    windowNumber:[window windowNumber] context:nil characters:@" " charactersIgnoringModifiers:@" " isARepeat:NO keyCode:code];
}
int main(int argc, char** argv) {
  setenv("ZINC_BACKGROUND", "1", 1); unsetenv("ZINC_HEADLESS"); setenv("ZINC_FRAMES", "30", 1);
  @autoreleasepool {
    const pid_t front = [[[NSWorkspace sharedWorkspace] frontmostApplication] processIdentifier];
    HalConfig cfg = {64, 48, "Zinc Legacy HAL test", 1};
    hal_init(&cfg);
    assert(window && [window isVisible]);
    assert([NSApp activationPolicy] != NSApplicationActivationPolicyRegular);
    HalInput in;
    hal_poll_input(&in);
    assert([[[NSWorkspace sharedWorkspace] frontmostApplication] processIdentifier] == front);
    HalFrame frame = {}; frame.w = 64; frame.h = 48; frame.render = render;
    hal_present(&frame);
    NSView* view = [window contentView];
    NSBitmapImageRep* bitmap = [view bitmapImageRepForCachingDisplayInRect:view.bounds];
    [view cacheDisplayInRect:view.bounds toBitmapImageRep:bitmap];
    // Read the rendered view, not the source raster: catches swapped channels and inverted rows.
    const NSInteger sx = [bitmap pixelsWide] / 64, sy = [bitmap pixelsHigh] / 48;
    NSColor* top = [[bitmap colorAtX:8 * sx y:8 * sy] colorUsingColorSpace:[NSColorSpace deviceRGBColorSpace]];
    NSColor* bottom = [[bitmap colorAtX:8 * sx y:40 * sy] colorUsingColorSpace:[NSColorSpace deviceRGBColorSpace]];
    assert([top redComponent] > .9 && [top blueComponent] < .1);
    assert([bottom blueComponent] > .9 && [bottom redComponent] < .1);
    if (argc > 1) assert([[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}]
      writeToFile:[NSString stringWithUTF8String:argv[1]] atomically:YES]);
    [NSApp postEvent:key(NSEventTypeKeyDown, 126) atStart:NO];
    hal_poll_input(&in); assert(in.buttons & HAL_UP);
    [NSApp postEvent:key(NSEventTypeKeyUp, 126) atStart:NO];
    hal_poll_input(&in); assert(!(in.buttons & HAL_UP));
    [NSApp postEvent:key(NSEventTypeKeyDown, 49) atStart:NO];
    hal_poll_input(&in); assert(in.buttons & HAL_A);
    [NSApp postEvent:key(NSEventTypeKeyUp, 49) atStart:NO];
    hal_poll_input(&in); assert(!(in.buttons & HAL_A));
    for (int button = 0; button < 2; ++button) {
      const NSEventType down = button ? NSEventTypeRightMouseDown : NSEventTypeLeftMouseDown;
      const NSEventType up = button ? NSEventTypeRightMouseUp : NSEventTypeLeftMouseUp;
      for (int held = 1; held >= 0; --held) {
        [NSApp postEvent:[NSEvent mouseEventWithType:held ? down : up location:NSMakePoint(5, 7) modifierFlags:0
          timestamp:0 windowNumber:[window windowNumber] context:nil eventNumber:0 clickCount:1 pressure:held] atStart:NO];
        hal_poll_input(&in);
        assert(in.pbuttons == (held ? 1u << button : 0));
        assert(in.nbtn == 1 && in.btn[0].button == (button ? 2 : 0) && in.btn[0].down == held);
        assert(in.btn[0].x == 5 && in.btn[0].y == 41);
      }
    }
    [window performClose:nil]; hal_poll_input(&in); assert(in.quit);
    hal_shutdown(); assert(!window);
    assert([[[NSWorkspace sharedWorkspace] frontmostApplication] processIdentifier] == front);
  }
  std::puts("legacy Cocoa: pixels, game keys, pointer, background focus and close ok");
}
