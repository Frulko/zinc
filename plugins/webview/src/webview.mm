// zinc:webview for macOS and iOS: WKWebViews laid over the SDL window's view (docs/plugins/webview.md), each inside a clipping container:
// the container takes the clip zinc:ui computes (NativeView, ZN-749), the web view the node's box inside it, so a scroll area cuts it off.
// Manual retain/release (the app is not built with ARC). WebKit calls back on the main thread while SDL pumps the platform's events
// inside hal_poll_input; those callbacks only queue events, a zrt::Poller hands them to the program.
#include <TargetConditionals.h>
#if TARGET_OS_IPHONE
#import <UIKit/UIKit.h>
typedef UIView ZView;
typedef CGRect ZRect;
typedef CGSize ZSize;
#define ZMakeRect CGRectMake
#define ZEqualRects CGRectEqualToRect
#else
#import <Cocoa/Cocoa.h>
typedef NSView ZView;
typedef NSRect ZRect;
typedef NSSize ZSize;
#define ZMakeRect NSMakeRect
#define ZEqualRects NSEqualRects
#endif
#import <WebKit/WebKit.h>
#include <SDL3/SDL.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "hal.h"
#if !TARGET_OS_IPHONE
#include <objc/message.h>
#endif
#include "zrt_assets_dir.h"
#include "zinc_native_webview.h"

#ifndef ZP_WEBVIEW_INSPECTABLE
#define ZP_WEBVIEW_INSPECTABLE 0
#endif

extern "C" void* hal_window_handle(void);

// Embedded assets (zinc_assets.cpp, generated because index.ts uses zinc:assets).
struct ZincAsset { const char* name; const unsigned char* data; uint32_t size; };
// Next has no embedded table; the prototype's strong definitions replace these empty defaults.
extern const ZincAsset zinc_assets[] __attribute__((weak)) = {{nullptr, nullptr, 0}};
extern const uint32_t zinc_asset_count __attribute__((weak)) = 0;

// Events for the program, delivered by the poller: [view, kind, id, a, b].
static NSMutableArray* queue;
static void push(int v, int kind, int id, NSString* a, NSString* b) {
  if (!queue) queue = [[NSMutableArray alloc] init];
  [queue addObject:@[@(v), @(kind), @(id), a ?: @"", b ?: @""]];
}
static NSString* ns(const zrt::String& s) {
  return [[[NSString alloc] initWithBytes:s.ptr() length:s.bytes() encoding:NSUTF8StringEncoding] autorelease];
}
static zrt::String zs(NSString* s) { const char* u = s.UTF8String; return zrt::String::from(u, (uint32_t)strlen(u)); }

// ---------------------------------------------------------------- zinc:// assets
static NSData* asset(NSString* name) {
  if (!name.length || [name hasPrefix:@"/"] || [[name pathComponents] containsObject:@".."]) return nil;
  static const std::string built = zrt_program_assets_dir(false);   // a built app's assets/: beside it, in its .app's Resources, above it (ZN-645)
  const char* dir = getenv("ZINC_ASSETS");   // dev: straight from the project, edits show on reload
  if (!dir && !built.empty()) dir = built.c_str();
  if (dir) {
    NSData* d = [NSData dataWithContentsOfFile:[[NSString stringWithUTF8String:dir] stringByAppendingPathComponent:name]];
    if (d) return d;
  }
  const char* n = name.UTF8String;
  for (uint32_t i = 0; i < zinc_asset_count; i++)
    if (!strcmp(zinc_assets[i].name, n)) return [NSData dataWithBytesNoCopy:(void*)zinc_assets[i].data length:zinc_assets[i].size freeWhenDone:NO];
  return nil;
}
static NSString* mime(NSString* name) {
  NSDictionary* m = @{@"html": @"text/html", @"htm": @"text/html", @"css": @"text/css", @"js": @"text/javascript", @"mjs": @"text/javascript",
    @"json": @"application/json", @"svg": @"image/svg+xml", @"png": @"image/png", @"jpg": @"image/jpeg", @"jpeg": @"image/jpeg",
    @"gif": @"image/gif", @"webp": @"image/webp", @"wasm": @"application/wasm", @"txt": @"text/plain", @"woff2": @"font/woff2", @"ttf": @"font/ttf"};
  return m[name.pathExtension.lowercaseString] ?: @"application/octet-stream";
}

// The page side: window.zinc (postMessage, invoke, onmessage). Injected before any page script runs.
static NSString* const BRIDGE = @"(() => {"
  "const h = window.webkit.messageHandlers.zinc, pend = new Map(); let seq = 0;"
  "const str = (x) => x === undefined ? '' : typeof x === 'string' ? x : JSON.stringify(x);"
  "const parse = (s) => { try { return JSON.parse(s); } catch (e) { return s; } };"
  "window.zinc = {"
  " postMessage(x) { h.postMessage({ t: 'm', d: str(x) }); },"
  " invoke(cmd, args) { return new Promise((res, rej) => { const id = ++seq; pend.set(id, [res, rej]); h.postMessage({ t: 'i', id, cmd: String(cmd), d: str(args) }); }); },"
  " onmessage: null,"
  " __settle(id, ok, r) { const p = pend.get(id); if (!p) return; pend.delete(id); if (ok) p[0](parse(r)); else p[1](new Error(r)); },"
  " __dispatch(d) { const v = parse(d); if (window.zinc.onmessage) window.zinc.onmessage(v); window.dispatchEvent(new MessageEvent('zinc', { data: v })); },"
  "};})();";

/** IPC is accepted from the app's own pages (zinc://, inline HTML) and the local dev server the app itself opened:
 *  same port only (`port`), so a link to another local server does not get the bridge. */
static bool trusted(WKFrameInfo* f, NSInteger port) {
  if (!f.isMainFrame) return false;
  NSString* p = f.securityOrigin.protocol, *h = f.securityOrigin.host;
  if ([p isEqual:@"zinc"] || [p isEqual:@"file"]) return true;
  return ([p isEqual:@"http"] || [p isEqual:@"https"]) && ([h isEqual:@"localhost"] || [h isEqual:@"127.0.0.1"]) && f.securityOrigin.port == port;
}

@interface ZincBridge : NSObject <WKScriptMessageHandler, WKURLSchemeHandler, WKNavigationDelegate>
@property int vid;
@property NSInteger port;  // port of the local http(s) page the app navigated to (-1: none)
@end
@implementation ZincBridge
- (void)userContentController:(WKUserContentController*)u didReceiveScriptMessage:(WKScriptMessage*)m {
  NSDictionary* b = m.body;
  if (![b isKindOfClass:[NSDictionary class]]) return;
  if (!trusted(m.frameInfo, self.port)) { NSLog(@"zinc:webview: IPC from %@ ignored (untrusted origin)", m.frameInfo.securityOrigin.host); return; }
  NSString* d = [b[@"d"] isKindOfClass:[NSString class]] ? b[@"d"] : @"";
  if ([b[@"t"] isEqual:@"i"]) push(self.vid, 1, [b[@"id"] intValue], [b[@"cmd"] description], d);
  else push(self.vid, 0, 0, d, nil);
}
- (void)webView:(WKWebView*)w startURLSchemeTask:(id<WKURLSchemeTask>)t {
  NSURL* url = t.request.URL;
  NSString* name = [url.path hasPrefix:@"/"] ? [url.path substringFromIndex:1] : url.path;
  if (!name.length) name = @"index.html";
  NSData* d = asset(name);
  NSHTTPURLResponse* r = [[[NSHTTPURLResponse alloc] initWithURL:url statusCode:d ? 200 : 404 HTTPVersion:@"HTTP/1.1"
    headerFields:@{@"Content-Type": d ? mime(name) : @"text/plain", @"Cache-Control": @"no-cache"}] autorelease];
  [t didReceiveResponse:r];
  [t didReceiveData:d ?: [@"not found" dataUsingEncoding:NSUTF8StringEncoding]];
  [t didFinish];
}
- (void)webView:(WKWebView*)w stopURLSchemeTask:(id<WKURLSchemeTask>)t {}
- (void)webView:(WKWebView*)w didFinishNavigation:(WKNavigation*)n { push(self.vid, 2, 0, w.URL.absoluteString ?: @"", nil); }
@end

// ---------------------------------------------------------------- views
#if !TARGET_OS_IPHONE
/** The clipping container: a top-left origin as UIKit's, so both platforms place the web view inside it the same way. */
@interface ZincClip : NSView
@end
@implementation ZincClip
- (BOOL)isFlipped { return YES; }
@end
#endif

static const int MAXV = 16;
struct View { WKWebView* wv; ZincBridge* br; ZView* clip; double x, y, w, h, cx, cy, cw, ch; };
// the snapshots of the off-screen web views (hal_overlays): the newest picture of each, BGRA premultiplied, at `scale` pixels a point
struct Shot { uint32_t* px = nullptr; int w = 0, h = 0; unsigned gen = 0; bool taking = false; };
static View views[MAXV];
static View* at(int32_t v) { return v >= 0 && v < MAXV && views[v].wv ? &views[v] : nullptr; }
#if !TARGET_OS_IPHONE
static NSWindow* offscreen;   // the web views' window when the app has none (offscreenView)
static Shot shots[MAXV];
static void snap(int i, int scale) {
  View& v = views[i];
  Shot& s = shots[i];
  if (s.taking || v.w < 1 || v.h < 1) return;
  s.taking = true;
  WKSnapshotConfiguration* c = [[[WKSnapshotConfiguration alloc] init] autorelease];
  c.snapshotWidth = @(v.w);   // points; the picture comes at the window's backing scale, redrawn below at `scale`
  if (@available(macOS 10.15, *)) c.afterScreenUpdates = YES;
  const int pw = (int)(v.w * scale), ph = (int)(v.h * scale);
  [v.wv takeSnapshotWithConfiguration:c completionHandler:^(NSImage* img, NSError*) {
    s.taking = false;
    CGImageRef cg = img ? [img CGImageForProposedRect:nullptr context:nil hints:nil] : nullptr;
    if (!cg || pw < 1 || ph < 1) return;
    if (s.w != pw || s.h != ph) { free(s.px); s.px = (uint32_t*)malloc((size_t)pw * ph * 4); s.w = pw; s.h = ph; }
    CGColorSpaceRef cs = CGColorSpaceCreateDeviceRGB();
    CGContextRef ctx = CGBitmapContextCreate(s.px, pw, ph, 8, (size_t)pw * 4, cs, kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little);
    CGContextDrawImage(ctx, CGRectMake(0, 0, pw, ph), cg);
    CGContextRelease(ctx); CGColorSpaceRelease(cs);
    s.gen++;
  }];
}
/** Web view i's newest picture for a display driver: its box and clip in points, its pixels (w x h, `scale` a point), a number that
 *  changes with each new picture; 0 when there is none (no such view, hidden, not taken yet). Asks for the next picture meanwhile. */
static int overlayPicture(int i, int scale, const uint32_t** px, int* pw, int* ph, double box[4], double clip[4], unsigned* gen) {
  if (i < 0 || i >= MAXV || !views[i].wv || !offscreen || views[i].clip.hidden) return 0;
  snap(i, scale);
  const Shot& s = shots[i];
  if (!s.px) return 0;
  const View& v = views[i];
  *px = s.px; *pw = s.w; *ph = s.h; *gen = s.gen;
  box[0] = v.x; box[1] = v.y; box[2] = v.w; box[3] = v.h; clip[0] = v.cx; clip[1] = v.cy; clip[2] = v.cw; clip[3] = v.ch;
  return 1;
}
/** A touch of the screen at (x, y) points for the off-screen web views: kind 0 press, 1 release, 2 drag, 3 scroll by (dx, dy) points.
 *  1 when a web view takes it (the point is in its clip, or it holds the press), else 0: the app's. */
static int overlayPointer(double x, double y, int kind, double dx, double dy) {
  static int held = -1;
  if (!offscreen) return 0;
  int hit = held;
  if (hit < 0) for (int i = 0; i < MAXV; i++) {
    const View& v = views[i];
    if (v.wv && !v.clip.hidden && x >= v.cx && x < v.cx + v.cw && y >= v.cy && y < v.cy + v.ch) { hit = i; break; }
  }
  if (hit < 0) return 0;
  @autoreleasepool {
    const NSPoint at = NSMakePoint(x, offscreen.contentView.bounds.size.height - y);   // the window's coordinates: bottom-left origin
    NSEvent* e = nil;
    if (kind == 3) {
      CGEventRef ce = CGEventCreateScrollWheelEvent(nullptr, kCGScrollEventUnitPixel, 2, (int32_t)dy, (int32_t)dx);
      e = [NSEvent eventWithCGEvent:ce];
      CFRelease(ce);
      if (e) { NSView* target = [offscreen.contentView hitTest:at]; [target scrollWheel:e]; }
      return 1;
    }
    const NSEventType t = kind == 0 ? NSEventTypeLeftMouseDown : kind == 1 ? NSEventTypeLeftMouseUp : NSEventTypeLeftMouseDragged;
    e = [NSEvent mouseEventWithType:t location:at modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:offscreen.windowNumber
                            context:nil eventNumber:0 clickCount:1 pressure:kind == 1 ? 0 : 1];
    [offscreen sendEvent:e];
  }
  held = kind == 0 ? hit : kind == 1 ? -1 : held;
  return 1;
}
static HalOverlays overlays = {overlayPicture, overlayPointer};
static int overlaysRegistered = (hal_overlays = &overlays, 0);
#endif

#if !TARGET_OS_IPHONE
// No window of the app (a display driver shows it elsewhere: display-sidecar): the web views live in a window of their own, off every
// screen, at the surface's size in points; their pictures are taken (WKWebView snapshots) and the driver lays them into its frames
// (hal_overlays), and sends them the screen's touches.
static ZView* offscreenView() {
  if (!offscreen) {
    [NSApplication sharedApplication];
    if (NSApp.activationPolicy == NSApplicationActivationPolicyRegular && !NSApp.isRunning) [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];   // no Dock icon
    [NSApp finishLaunching];
    int W = 1, H = 1;
    hal_surface_size(&W, &H);
    offscreen = [[NSWindow alloc] initWithContentRect:NSMakeRect(-30000, -30000, W, H) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    offscreen.releasedWhenClosed = NO;
    [offscreen setFrameOrigin:NSMakePoint(-30000, -30000)];
    [offscreen orderFrontRegardless];   // off every screen, but ordered in: WebKit paints and runs its timers only for a window that is
  }
  return offscreen.contentView;
}
#endif
/** The view SDL draws the surface into: the window's content view (macOS), its view controller's view (iOS). */
static ZView* hostView() {
  SDL_Window* sw = (SDL_Window*)hal_window_handle();
#if !TARGET_OS_IPHONE
  if (!sw && hal_display && !hal_display->host_window) return offscreenView();
#endif
  if (!sw) return nil;
#if TARGET_OS_IPHONE
  UIWindow* w = (UIWindow*)SDL_GetPointerProperty(SDL_GetWindowProperties(sw), SDL_PROP_WINDOW_UIKIT_WINDOW_POINTER, nullptr);
  return w.rootViewController.view ?: w;
#else
  NSWindow* w = (NSWindow*)SDL_GetPointerProperty(SDL_GetWindowProperties(sw), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr);
  return w.contentView;
#endif
}
/** Logical surface rectangles -> the container's frame in the host view (the letterbox/zoom mapping of the SDL renderer) and the web view's
 *  frame inside it. */
static void frameOf(View& v) {
  ZView* hv = v.clip.superview;
  if (!hv) return;
  int W = 1, H = 1;
  hal_surface_size(&W, &H);
  ZSize s = hv.bounds.size;
  double k = fmin(s.width / W, s.height / H), ox = (s.width - W * k) / 2, oy = (s.height - H * k) / 2;
#if TARGET_OS_IPHONE
  const bool flipped = true;
#else
  const bool flipped = hv.isFlipped;
#endif
  ZRect c = ZMakeRect(ox + v.cx * k, flipped ? oy + v.cy * k : s.height - (oy + (v.cy + v.ch) * k), v.cw * k, v.ch * k);
  ZRect r = ZMakeRect((v.x - v.cx) * k, (v.y - v.cy) * k, v.w * k, v.h * k);
  if (ZEqualRects(c, v.clip.frame) && ZEqualRects(r, v.wv.frame)) return;
  v.clip.frame = c;
  v.wv.frame = r;
  static const bool trace = getenv("ZINC_WEBVIEW_TRACE") != nullptr;   // the frames the OS was given, top-left origin, in the host view's units (tests)
  if (trace) std::fprintf(stderr, "webview %d: clip %g,%g %gx%g view %g,%g %gx%g\n", v.br.vid, c.origin.x, flipped ? c.origin.y : s.height - c.origin.y - c.size.height,
                          c.size.width, c.size.height, r.origin.x, r.origin.y, r.size.width, r.size.height);
}

struct MacWebview : NativeWebview, zrt::Poller {
  zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::String)> cb;

  int32_t create(double x, double y, double w, double h) override {
    @autoreleasepool {
      ZView* hv = hostView();
      int slot = 0;
      while (slot < MAXV && views[slot].wv) slot++;
      if (!hv || slot == MAXV) return -1;
      ZincBridge* br = [[ZincBridge alloc] init];
      br.vid = slot;
      br.port = -1;
      WKWebViewConfiguration* cfg = [[[WKWebViewConfiguration alloc] init] autorelease];
      [cfg setURLSchemeHandler:br forURLScheme:@"zinc"];
      [cfg.userContentController addScriptMessageHandler:br name:@"zinc"];
      [cfg.userContentController addUserScript:[[[WKUserScript alloc] initWithSource:BRIDGE injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES] autorelease]];
      WKWebView* wv = [[WKWebView alloc] initWithFrame:ZMakeRect(0, 0, 1, 1) configuration:cfg];
      wv.navigationDelegate = br;
#if TARGET_OS_IPHONE
      ZView* clip = [[UIView alloc] initWithFrame:ZMakeRect(0, 0, 1, 1)];
      clip.clipsToBounds = YES;
      if (@available(iOS 16.4, *)) wv.inspectable = ZP_WEBVIEW_INSPECTABLE;
#else
      ZView* clip = [[ZincClip alloc] initWithFrame:ZMakeRect(0, 0, 1, 1)];
      clip.wantsLayer = YES;
      clip.layer.masksToBounds = YES;
      if (@available(macOS 14.0, *)) clip.clipsToBounds = YES;   // NSView stopped clipping its subviews by default with the macOS 14 SDK
      if (@available(macOS 13.3, *)) wv.inspectable = ZP_WEBVIEW_INSPECTABLE;
      // off screen, WebKit takes the page for hidden (document.hidden, no requestAnimationFrame: a map never draws its tiles): its window
      // is shown on another screen, so occlusion is not asked. ponytail: WebKit's private setter, skipped when a release drops it
      SEL noOcclusion = NSSelectorFromString(@"_setWindowOcclusionDetectionEnabled:");
      if (hv.window == offscreen && [wv respondsToSelector:noOcclusion]) ((void (*)(id, SEL, BOOL))objc_msgSend)(wv, noOcclusion, NO);
#endif
      [clip addSubview:wv];
      [hv addSubview:clip];
      views[slot] = View{wv, br, clip, x, y, w, h, x, y, w, h};
      frameOf(views[slot]);
      return slot;
    }
  }
  void setBounds(int32_t v, double x, double y, double w, double h) override { place(v, x, y, w, h, x, y, w, h); }
  void place(int32_t v, double x, double y, double w, double h, double cx, double cy, double cw, double ch) override {
    if (View* p = at(v)) { *p = View{p->wv, p->br, p->clip, x, y, w, h, cx, cy, cw, ch}; frameOf(*p); }
  }
  void setVisible(int32_t v, bool on) override {
    View* p = at(v);
    if (!p) return;
    p->clip.hidden = !on;
    if (getenv("ZINC_WEBVIEW_TRACE")) std::fprintf(stderr, "webview %d: %s\n", v, on ? "shown" : "hidden");
  }
  void navigate(int32_t v, zrt::String url) override {
    @autoreleasepool {
      View* p = at(v);
      NSURL* u = p ? [NSURL URLWithString:ns(url)] : nil;
      if (!u) return;
      if ([u.scheme isEqual:@"http"] || [u.scheme isEqual:@"https"]) p->br.port = u.port ? u.port.integerValue : 0;
      if (u.isFileURL) [p->wv loadFileURL:u allowingReadAccessToURL:[u URLByDeletingLastPathComponent]];
      else [p->wv loadRequest:[NSURLRequest requestWithURL:u]];
    }
  }
  void loadHtml(int32_t v, zrt::String html, zrt::String base) override {
    @autoreleasepool {
      View* p = at(v);
      if (!p) return;
      NSURL* b = [NSURL URLWithString:ns(base)];
      if ([b.scheme isEqual:@"http"] || [b.scheme isEqual:@"https"]) p->br.port = b.port ? b.port.integerValue : 0;
      [p->wv loadHTMLString:ns(html) baseURL:b];
    }
  }
  void eval(int32_t v, zrt::String js) override {
    @autoreleasepool { if (View* p = at(v)) [p->wv evaluateJavaScript:ns(js) completionHandler:nil]; }
  }
  void call(int32_t v, NSString* js, NSDictionary* args) {
    if (View* p = at(v)) [p->wv callAsyncJavaScript:js arguments:args inFrame:nil inContentWorld:[WKContentWorld pageWorld] completionHandler:nil];
  }
  void post(int32_t v, zrt::String data) override {
    @autoreleasepool { call(v, @"window.zinc.__dispatch(d)", @{@"d": ns(data)}); }
  }
  void reply(int32_t v, int32_t id, bool ok, zrt::String result) override {
    @autoreleasepool { call(v, @"window.zinc.__settle(id, ok, r)", @{@"id": @(id), @"ok": @(ok), @"r": ns(result)}); }
  }
  void close(int32_t v) override {
    @autoreleasepool {
      View* p = at(v);
      if (!p) return;
      [p->wv.configuration.userContentController removeScriptMessageHandlerForName:@"zinc"];
      p->wv.navigationDelegate = nil;
      [p->clip removeFromSuperview];
      [p->clip release];
      [p->wv release];
      [p->br release];
      *p = View{};
    }
  }
  void onEvent(zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::String)> f) override { cb = f; }

  bool poll() override {
    bool any = false;
    for (View& v : views) if (v.wv) { frameOf(v); any = true; }  // follows window resizes (letterbox, zoom)
#if !TARGET_OS_IPHONE
    // the off-screen window has no SDL to run the main loop: WebKit's loads, timers and snapshot answers are delivered here
    if (offscreen) @autoreleasepool {
      while (NSEvent* e = [NSApp nextEventMatchingMask:NSEventMaskAny untilDate:nil inMode:NSDefaultRunLoopMode dequeue:YES]) [NSApp sendEvent:e];
      CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0, true);
    }
#endif
    if (!queue.count) return any;
    @autoreleasepool {
      NSArray* evs = [[queue copy] autorelease];
      [queue removeAllObjects];
      for (NSArray* e in evs) {
        if (!cb) break;
        zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::String)> f = cb;
        f([e[0] intValue], [e[1] intValue], [e[2] intValue], zs(e[3]), zs(e[4]));
        zrt::check_uncaught();
      }
    }
    return true;
  }
  void shutdown() override {
    cb = nullptr;
    for (int i = 0; i < MAXV; i++) close(i);
    [queue removeAllObjects];
  }
};

NativeWebview* zinc_create_Webview() {
  static MacWebview m;
  m.rc = zrt::IMMORTAL;
  zrt::add_poller(&m);
  return &m;
}
