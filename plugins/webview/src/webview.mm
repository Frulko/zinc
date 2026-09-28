// zinc:webview for macOS: WKWebViews added on top of the SDL window's content view (docs/plugins/webview.md).
// Manual retain/release (the app is not built with ARC). WebKit calls back on the main thread while SDL pumps Cocoa
// events inside hal_poll_input; those callbacks only queue events, a zrt::Poller hands them to the program.
#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>
#include <SDL3/SDL.h>
#include <string.h>
#include "hal.h"
#include "zinc_native_webview.h"

#ifndef ZP_WEBVIEW_INSPECTABLE
#define ZP_WEBVIEW_INSPECTABLE 0
#endif

// HALs without a window (null HAL) do not define it; hal_sdl.cpp's definition wins when linked.
extern "C" __attribute__((weak)) void* hal_window_handle(void) { return nullptr; }

// Embedded assets (zinc_assets.cpp, generated because index.ts uses zinc:assets).
struct ZincAsset { const char* name; const unsigned char* data; uint32_t size; };
extern const ZincAsset zinc_assets[];
extern const uint32_t zinc_asset_count;

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
  if (const char* dir = getenv("ZINC_ASSETS")) {  // dev: straight from the project, edits show on reload
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

/** IPC is accepted from the app's own pages (zinc://, inline HTML) and local dev servers only. */
static bool trusted(WKFrameInfo* f) {
  if (!f.isMainFrame) return false;
  NSString* p = f.securityOrigin.protocol, *h = f.securityOrigin.host;
  if ([p isEqual:@"zinc"] || [p isEqual:@"file"]) return true;
  return ([p isEqual:@"http"] || [p isEqual:@"https"]) && ([h isEqual:@"localhost"] || [h isEqual:@"127.0.0.1"]);
}

@interface ZincBridge : NSObject <WKScriptMessageHandler, WKURLSchemeHandler, WKNavigationDelegate>
@property int vid;
@end
@implementation ZincBridge
- (void)userContentController:(WKUserContentController*)u didReceiveScriptMessage:(WKScriptMessage*)m {
  NSDictionary* b = m.body;
  if (![b isKindOfClass:[NSDictionary class]]) return;
  if (!trusted(m.frameInfo)) { NSLog(@"zinc:webview: IPC from %@ ignored (untrusted origin)", m.frameInfo.securityOrigin.host); return; }
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
static const int MAXV = 16;
struct View { WKWebView* wv; ZincBridge* br; double x, y, w, h; };
static View views[MAXV];
static View* at(int32_t v) { return v >= 0 && v < MAXV && views[v].wv ? &views[v] : nullptr; }

static NSWindow* window() {
  SDL_Window* sw = (SDL_Window*)hal_window_handle();
  return sw ? (NSWindow*)SDL_GetPointerProperty(SDL_GetWindowProperties(sw), SDL_PROP_WINDOW_COCOA_WINDOW_POINTER, nullptr) : nil;
}
/** Logical surface rectangle -> content view frame (same letterbox/zoom mapping as the SDL renderer). */
static void place(View& v) {
  NSView* cv = v.wv.superview;
  if (!cv) return;
  int W = 1, H = 1;
  hal_surface_size(&W, &H);
  NSSize s = cv.bounds.size;
  double k = fmin(s.width / W, s.height / H), ox = (s.width - W * k) / 2, oy = (s.height - H * k) / 2;
  NSRect r = NSMakeRect(ox + v.x * k, cv.isFlipped ? oy + v.y * k : s.height - (oy + (v.y + v.h) * k), v.w * k, v.h * k);
  if (!NSEqualRects(r, v.wv.frame)) v.wv.frame = r;
}

struct MacWebview : NativeWebview, zrt::Poller {
  zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::String)> cb;

  int32_t create(double x, double y, double w, double h) override {
    @autoreleasepool {
      NSWindow* win = window();
      int slot = 0;
      while (slot < MAXV && views[slot].wv) slot++;
      if (!win || slot == MAXV) return -1;
      ZincBridge* br = [[ZincBridge alloc] init];
      br.vid = slot;
      WKWebViewConfiguration* cfg = [[[WKWebViewConfiguration alloc] init] autorelease];
      [cfg setURLSchemeHandler:br forURLScheme:@"zinc"];
      [cfg.userContentController addScriptMessageHandler:br name:@"zinc"];
      [cfg.userContentController addUserScript:[[[WKUserScript alloc] initWithSource:BRIDGE injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES] autorelease]];
      WKWebView* wv = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 1, 1) configuration:cfg];
      wv.navigationDelegate = br;
      if (@available(macOS 13.3, *)) wv.inspectable = ZP_WEBVIEW_INSPECTABLE;
      [win.contentView addSubview:wv];
      views[slot] = View{wv, br, x, y, w, h};
      place(views[slot]);
      return slot;
    }
  }
  void setBounds(int32_t v, double x, double y, double w, double h) override {
    if (View* p = at(v)) { p->x = x; p->y = y; p->w = w; p->h = h; place(*p); }
  }
  void setVisible(int32_t v, bool on) override { if (View* p = at(v)) p->wv.hidden = !on; }
  void navigate(int32_t v, zrt::String url) override {
    @autoreleasepool {
      View* p = at(v);
      NSURL* u = p ? [NSURL URLWithString:ns(url)] : nil;
      if (!u) return;
      if (u.isFileURL) [p->wv loadFileURL:u allowingReadAccessToURL:[u URLByDeletingLastPathComponent]];
      else [p->wv loadRequest:[NSURLRequest requestWithURL:u]];
    }
  }
  void loadHtml(int32_t v, zrt::String html, zrt::String base) override {
    @autoreleasepool { if (View* p = at(v)) [p->wv loadHTMLString:ns(html) baseURL:[NSURL URLWithString:ns(base)]]; }
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
      [p->wv removeFromSuperview];
      [p->wv release];
      [p->br release];
      *p = View{};
    }
  }
  void onEvent(zrt::Fn<void(int32_t, int32_t, int32_t, zrt::String, zrt::String)> f) override { cb = f; }

  bool poll() override {
    bool any = false;
    for (View& v : views) if (v.wv) { place(v); any = true; }  // follows window resizes (letterbox, zoom)
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
