// zinc:screen-capture on macOS: ScreenCaptureKit (macOS 12.3; thumbnails need SCScreenshotManager, macOS 14), then the shared part
// (screen.host.cpp). An SCStream per capture delivers 32BGRA pixel buffers (IOSurfaces) at the asked size and rate on a serial queue; the
// newest one is kept retained, and frame() on the program's thread locks it and points the capture's runtime image at its pixels: no copy.
// Only changed frames arrive (an idle screen sends none). Everything that touches a stream runs on one serial control queue; nothing waits
// on the program's thread.
// Privacy: the person allows screen recording once per app (System Settings > Privacy & Security > Screen & System Audio Recording). Nothing
// here calls ScreenCaptureKit before CGPreflightScreenCaptureAccess says it is allowed, so listing or opening never shows the system's
// question by itself: only permission(ask) does. Manual retain/release: plugins are not built with ARC.
#define SC_BACKEND 1
#import <AppKit/AppKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#include <atomic>
#include <map>
#include <mutex>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include "backend.h"

static const char* DENIED = "screen recording permission is not granted: allow this app in System Settings > Privacy & Security > Screen & "
                            "System Audio Recording (for `zinc run`, the terminal that runs it), then quit and open it again";

@interface ZnScOut : NSObject <SCStreamOutput, SCStreamDelegate> {
@public
  pthread_mutex_t mu;
  CVPixelBufferRef pending;   // the newest complete frame, not taken yet
  std::atomic<int>* state;
  std::string* why;           // under mu
}
@end
@implementation ZnScOut
- (void)stream:(SCStream*)stream didOutputSampleBuffer:(CMSampleBufferRef)sb ofType:(SCStreamOutputType)type {
  if (type != SCStreamOutputTypeScreen) return;
  CFArrayRef atts = CMSampleBufferGetSampleAttachmentsArray(sb, false);
  if (!atts || CFArrayGetCount(atts) == 0) return;
  NSNumber* st = ((NSDictionary*)CFArrayGetValueAtIndex(atts, 0))[SCStreamFrameInfoStatus];
  CVPixelBufferRef pb = CMSampleBufferGetImageBuffer(sb);
  if (!st || st.integerValue != SCFrameStatusComplete || !pb) return;   // idle, blank, suspended: the last frame stays
  CVPixelBufferRetain(pb);
  pthread_mutex_lock(&mu);
  CVPixelBufferRef old = pending;
  pending = pb;
  pthread_mutex_unlock(&mu);
  if (old) CVPixelBufferRelease(old);
}
- (void)stream:(SCStream*)stream didStopWithError:(NSError*)error {   // the window closed, the display went away, the person stopped it
  pthread_mutex_lock(&mu);
  *why = error ? std::string("the capture stopped: ") + error.localizedDescription.UTF8String : "the capture stopped";
  pthread_mutex_unlock(&mu);
  *state = -1;
}
@end

namespace {
struct Session {
  std::atomic<bool> used{false}, closing{false};
  bool waiting = false;        // the shareable content has not arrived yet (control queue after open)
  std::atomic<int> state{0};   // 0 starting, 1 running, -1 failed or ended
  std::string why;             // under out->mu once out exists, else written before state turns -1
  ZnScOut* out = nil;          // made by open; the rest belongs to the control queue
  SCStream* stream = nil;
  dispatch_queue_t frames = nullptr;
  CVPixelBufferRef shown = nullptr;   // the program's thread: locked, the image points at it
  int w = 0, h = 0;
};
const int MAXS = 8;
Session sessions[MAXS];
dispatch_queue_t control() { static dispatch_queue_t q = dispatch_queue_create("zinc.screen-capture", DISPATCH_QUEUE_SERIAL); return q; }

struct Listing {
  std::mutex mu;
  int state = 1, gen = 0;   // 0 running, 1 done, -1 failed
  std::vector<ScSource> out;
  std::string why;
} L;

double backing() { NSScreen* s = [NSScreen mainScreen]; return s ? s.backingScaleFactor : 1; }
// Sizes without ScreenCaptureKit (open() answers at once): a display's pixels, a window's bounds in pixels
bool display_size(CGDirectDisplayID d, int* w, int* h) {
  CGDisplayModeRef m = CGDisplayCopyDisplayMode(d);
  if (!m) return false;
  *w = (int)CGDisplayModeGetPixelWidth(m); *h = (int)CGDisplayModeGetPixelHeight(m);
  CGDisplayModeRelease(m);
  return *w > 0 && *h > 0;
}
bool window_size(CGWindowID id, int* w, int* h) {
  CFArrayRef a = CGWindowListCopyWindowInfo(kCGWindowListOptionIncludingWindow, id);
  bool ok = false;
  if (a && CFArrayGetCount(a) > 0) {
    CGRect r;
    CFDictionaryRef b = (CFDictionaryRef)CFDictionaryGetValue((CFDictionaryRef)CFArrayGetValueAtIndex(a, 0), kCGWindowBounds);
    if (b && CGRectMakeWithDictionaryRepresentation(b, &r)) { const double s = backing(); *w = (int)(r.size.width * s); *h = (int)(r.size.height * s); ok = *w > 0 && *h > 0; }
  }
  if (a) CFRelease(a);
  return ok;
}
std::string display_name(CGDirectDisplayID d, int i) {
  for (NSScreen* s in [NSScreen screens])
    if ([s.deviceDescription[@"NSScreenNumber"] unsignedIntValue] == d) return s.localizedName.UTF8String;
  return "Screen " + std::to_string(i + 1);
}
// A thumbnail: the CGImage drawn in BGRX pixels
void draw(CGImageRef img, ScSource& s) {
  s.thumb.assign((size_t)s.tw * s.th, 0);
  CGColorSpaceRef cs = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef c = CGBitmapContextCreate(s.thumb.data(), s.tw, s.th, 8, (size_t)s.tw * 4, cs, kCGImageAlphaNoneSkipFirst | kCGBitmapByteOrder32Little);
  if (c) { CGContextDrawImage(c, CGRectMake(0, 0, s.tw, s.th), img); CGContextRelease(c); }
  CGColorSpaceRelease(cs);
}
// An application's icon at SC_ICON x SC_ICON, straight alpha (the runtime images' format); empty when it has none
std::vector<uint32_t> app_icon(pid_t pid) {
  std::vector<uint32_t> px;
  NSImage* im = [NSRunningApplication runningApplicationWithProcessIdentifier:pid].icon;
  NSRect r = NSMakeRect(0, 0, SC_ICON, SC_ICON);
  CGImageRef cg = im ? [im CGImageForProposedRect:&r context:nil hints:nil] : nullptr;
  if (!cg) return px;
  px.assign((size_t)SC_ICON * SC_ICON, 0);
  CGColorSpaceRef cs = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
  CGContextRef c = CGBitmapContextCreate(px.data(), SC_ICON, SC_ICON, 8, (size_t)SC_ICON * 4, cs, kCGImageAlphaPremultipliedFirst | kCGBitmapByteOrder32Little);
  if (c) { CGContextSetInterpolationQuality(c, kCGInterpolationHigh); CGContextDrawImage(c, CGRectMake(0, 0, SC_ICON, SC_ICON), cg); CGContextRelease(c); }
  CGColorSpaceRelease(cs);
  for (uint32_t& p : px) {   // premultiplied -> straight
    const uint32_t a = p >> 24;
    if (a == 0 || a == 255) continue;
    const uint32_t rr = ((p >> 16) & 255) * 255 / a, gg = ((p >> 8) & 255) * 255 / a, bb = (p & 255) * 255 / a;
    p = a << 24 | (rr > 255 ? 255 : rr) << 16 | (gg > 255 ? 255 : gg) << 8 | (bb > 255 ? 255 : bb);
  }
  return px;
}
void list_failed(int gen, const std::string& why) {
  std::lock_guard<std::mutex> g(L.mu);
  if (gen == L.gen) { L.why = why; L.state = -1; }
}

// The stream of a session, once ScreenCaptureKit gave the shareable content (control queue)
void build(Session& s, SCShareableContent* content, const std::string& id, int fps, bool cursor) {
  SCContentFilter* filter = nil;
  if (id.rfind("window:", 0) == 0) {
    const CGWindowID wid = (CGWindowID)strtoul(id.c_str() + 7, nullptr, 10);
    for (SCWindow* w in content.windows) if (w.windowID == wid) filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:w];
  } else {
    const CGDirectDisplayID did = id.empty() ? CGMainDisplayID() : (CGDirectDisplayID)strtoul(id.c_str() + 7, nullptr, 10);
    for (SCDisplay* d in content.displays) if (d.displayID == did) filter = [[SCContentFilter alloc] initWithDisplay:d excludingWindows:@[]];
  }
  if (!filter) { s.why = "the source '" + id + "' is gone"; s.state = -1; return; }
  SCStreamConfiguration* cfg = [[SCStreamConfiguration alloc] init];
  cfg.width = s.w; cfg.height = s.h;
  cfg.minimumFrameInterval = CMTimeMake(1, fps);
  cfg.pixelFormat = kCVPixelFormatType_32BGRA;
  cfg.showsCursor = cursor;
  cfg.queueDepth = 5;   // the program holds two (the one shown, the newest), ScreenCaptureKit keeps drawing in the others
  if (@available(macOS 14.0, *)) { cfg.scalesToFit = YES; cfg.preservesAspectRatio = YES; }   // a resized window stays inside the frame
  s.stream = [[SCStream alloc] initWithFilter:filter configuration:cfg delegate:s.out];
  [filter release];
  [cfg release];
  s.frames = dispatch_queue_create("zinc.screen-capture.frames", DISPATCH_QUEUE_SERIAL);
  NSError* e = nil;
  if (![s.stream addStreamOutput:s.out type:SCStreamOutputTypeScreen sampleHandlerQueue:s.frames error:&e]) {
    s.why = e ? e.localizedDescription.UTF8String : "the capture has no output"; s.state = -1; return;
  }
  Session* sp = &s;
  [s.stream startCaptureWithCompletionHandler:^(NSError* err) {
    if (!err) { int z = 0; sp->state.compare_exchange_strong(z, 1); return; }
    pthread_mutex_lock(&sp->out->mu);
    sp->why = err.code == SCStreamErrorUserDeclined ? DENIED : err.localizedDescription.UTF8String;
    pthread_mutex_unlock(&sp->out->mu);
    sp->state = -1;
  }];
}
// Frees a session (control queue, the stream stopped); the slot is free afterwards
void release(Session& s) {
  if (s.frames) { dispatch_sync(s.frames, ^{}); dispatch_release(s.frames); }   // no frame is being handed over any more
  [s.stream release];
  if (s.out->pending) CVPixelBufferRelease(s.out->pending);
  pthread_mutex_destroy(&s.out->mu);
  [s.out release];
  s.stream = nil; s.out = nil; s.frames = nullptr;
  s.why.clear(); s.state = 0; s.closing = false;
  s.used = false;
}
}  // namespace

int sc_backend_permission(bool ask) {
  if (CGPreflightScreenCaptureAccess()) return 1;
  if (ask) CGRequestScreenCaptureAccess();   // the system's question the first time; System Settings afterwards
  return 2;
}

bool sc_backend_list(bool screens, bool windows, int tw, int th, std::string& err) {
  if (!CGPreflightScreenCaptureAccess()) { err = DENIED; return false; }
  int gen;
  { std::lock_guard<std::mutex> g(L.mu); gen = ++L.gen; L.state = 0; L.out.clear(); L.why.clear(); }
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:YES completionHandler:^(SCShareableContent* content, NSError* e) {
    if (!content) { list_failed(gen, e ? e.localizedDescription.UTF8String : "the sources cannot be listed"); return; }
    @autoreleasepool {
      // what to list: displays first (the main one first), then the windows people share (layer 0, a title, not tiny)
      std::vector<ScSource>* found = new std::vector<ScSource>();
      std::vector<SCContentFilter*> filters;
      int i = 0;
      if (screens) {
        NSMutableArray<SCDisplay*>* ds = [NSMutableArray arrayWithArray:content.displays];
        [ds sortUsingComparator:^NSComparisonResult(SCDisplay* a, SCDisplay* b) { return a.displayID == CGMainDisplayID() ? NSOrderedAscending : b.displayID == CGMainDisplayID() ? NSOrderedDescending : NSOrderedSame; }];
        for (SCDisplay* d in ds) {
          ScSource s;
          s.id = "screen:" + std::to_string(d.displayID); s.kind = "screen"; s.name = display_name(d.displayID, i++);
          if (!display_size(d.displayID, &s.w, &s.h)) { s.w = (int)d.width; s.h = (int)d.height; }
          found->push_back(s);
          filters.push_back([[SCContentFilter alloc] initWithDisplay:d excludingWindows:@[]]);
        }
      }
      if (windows) {
        const double sc = backing();
        std::map<pid_t, std::vector<uint32_t>> icons;   // one per application
        for (SCWindow* w in content.windows) {
          if (w.windowLayer != 0 || w.title.length == 0 || w.frame.size.width < 64 || w.frame.size.height < 64) continue;
          ScSource s;
          s.id = "window:" + std::to_string(w.windowID); s.kind = "window"; s.name = w.title.UTF8String;
          s.app = w.owningApplication.applicationName ? w.owningApplication.applicationName.UTF8String : "";
          if (w.owningApplication) {
            const pid_t pid = w.owningApplication.processID;
            auto it = icons.find(pid);
            if (it == icons.end()) it = icons.emplace(pid, app_icon(pid)).first;
            s.icon = it->second;
          }
          s.w = (int)(w.frame.size.width * sc); s.h = (int)(w.frame.size.height * sc);
          found->push_back(s);
          filters.push_back([[SCContentFilter alloc] initWithDesktopIndependentWindow:w]);
        }
      }
      auto finish = [gen, found]() {
        std::lock_guard<std::mutex> g(L.mu);
        if (gen == L.gen) { L.out = std::move(*found); L.state = 1; }
        delete found;
      };
      bool shots = false;
      if (@available(macOS 14.0, *)) shots = tw > 0 && th > 0;
      if (!shots) { for (SCContentFilter* f : filters) [f release]; finish(); return; }
      if (@available(macOS 14.0, *)) {
        dispatch_group_t group = dispatch_group_create();
        for (size_t k = 0; k < filters.size(); k++) {
          ScSource& s = (*found)[k];
          s.tw = tw; s.th = th;
          sc_fit(s.w, s.h, s.tw, s.th);
          SCStreamConfiguration* cfg = [[SCStreamConfiguration alloc] init];
          cfg.width = s.tw; cfg.height = s.th; cfg.showsCursor = NO;
          dispatch_group_enter(group);
          ScSource* sp = &s;   // found does not grow any more
          [SCScreenshotManager captureImageWithFilter:filters[k] configuration:cfg completionHandler:^(CGImageRef img, NSError*) {
            if (img) draw(img, *sp); else sp->tw = sp->th = 0;
            dispatch_group_leave(group);
          }];
          [cfg release];
          [filters[k] release];
        }
        dispatch_group_notify(group, control(), ^{ finish(); });
        dispatch_release(group);
      }
    }
  }];
  return true;
}

int sc_backend_list_state(std::vector<ScSource>& out, std::string& err) {
  std::lock_guard<std::mutex> g(L.mu);
  if (L.state < 0) err = L.why;
  if (L.state == 1) out = std::move(L.out);
  return L.state;
}

int sc_backend_open(const char* idc, int w, int h, int fps, bool cursor, int* ow, int* oh, std::string& err) {
  if (!CGPreflightScreenCaptureAccess()) { err = DENIED; return -1; }
  const std::string id = idc;
  int sw = 0, sh = 0;
  if (id.rfind("window:", 0) == 0) { if (!window_size((CGWindowID)strtoul(idc + 7, nullptr, 10), &sw, &sh)) { err = "no window '" + id + "' (sources() lists them)"; return -1; } }
  else if (id.empty() || id.rfind("screen:", 0) == 0) { if (!display_size(id.empty() ? CGMainDisplayID() : (CGDirectDisplayID)strtoul(idc + 7, nullptr, 10), &sw, &sh)) { err = "no screen '" + id + "' (sources() lists them)"; return -1; } }
  else { err = "no source '" + id + "' (sources() lists them)"; return -1; }
  int slot = -1;
  for (int i = 0; i < MAXS && slot < 0; i++) { bool f = false; if (sessions[i].used.compare_exchange_strong(f, true)) slot = i; }
  if (slot < 0) { err = "too many screen captures open"; return -1; }
  Session& s = sessions[slot];
  s.state = 0; s.closing = false; s.why.clear(); s.waiting = true;
  s.w = w; s.h = h;
  sc_fit(sw, sh, s.w, s.h);
  s.out = [[ZnScOut alloc] init];
  pthread_mutex_init(&s.out->mu, nullptr);
  s.out->pending = nullptr; s.out->state = &s.state; s.out->why = &s.why;
  Session* sp = &s;
  [SCShareableContent getShareableContentExcludingDesktopWindows:YES onScreenWindowsOnly:NO completionHandler:^(SCShareableContent* content, NSError* e) {
    [content retain];
    dispatch_async(control(), ^{
      @autoreleasepool {
        sp->waiting = false;
        if (sp->closing) release(*sp);   // closed before it started
        else if (!content) { sp->why = e ? e.localizedDescription.UTF8String : "the sources cannot be listed"; sp->state = -1; }
        else build(*sp, content, id, fps, cursor);
        [content release];
      }
    });
  }];
  *ow = s.w; *oh = s.h;
  return slot;
}

int sc_backend_state(int b, std::string& err) {
  if (b < 0 || b >= MAXS || !sessions[b].used) return -1;
  Session& s = sessions[b];
  const int st = s.state;
  if (st < 0) { pthread_mutex_lock(&s.out->mu); err = s.why; pthread_mutex_unlock(&s.out->mu); }
  return st;
}

bool sc_backend_take(int b, const uint32_t** px, int* stride) {
  if (b < 0 || b >= MAXS || !sessions[b].used) return false;
  Session& s = sessions[b];
  pthread_mutex_lock(&s.out->mu);
  CVPixelBufferRef pb = s.out->pending;
  s.out->pending = nullptr;
  pthread_mutex_unlock(&s.out->mu);
  if (!pb) return false;
  if ((int)CVPixelBufferGetWidth(pb) != s.w || (int)CVPixelBufferGetHeight(pb) != s.h || CVPixelBufferGetPixelFormatType(pb) != kCVPixelFormatType_32BGRA ||
      CVPixelBufferLockBaseAddress(pb, kCVPixelBufferLock_ReadOnly) != kCVReturnSuccess) { CVPixelBufferRelease(pb); return false; }
  // BGRA in memory is 0xAARRGGBB, which the runtime image reads as 0x00RRGGBB (it ignores the top byte): the buffer is the image's pixels
  CVPixelBufferRef old = s.shown;
  s.shown = pb;
  *px = (const uint32_t*)CVPixelBufferGetBaseAddress(pb);
  *stride = (int)(CVPixelBufferGetBytesPerRow(pb) / 4);
  if (old) { CVPixelBufferUnlockBaseAddress(old, kCVPixelBufferLock_ReadOnly); CVPixelBufferRelease(old); }
  return true;
}

void sc_backend_close(int b) {
  if (b < 0 || b >= MAXS || !sessions[b].used || sessions[b].closing) return;
  Session* s = &sessions[b];
  s->closing = true;
  if (s->shown) { CVPixelBufferUnlockBaseAddress(s->shown, kCVPixelBufferLock_ReadOnly); CVPixelBufferRelease(s->shown); s->shown = nullptr; }
  dispatch_async(control(), ^{
    if (s->waiting) return;   // the shareable content's block frees it
    if (!s->stream) { release(*s); return; }
    [s->stream stopCaptureWithCompletionHandler:^(NSError*) { dispatch_async(control(), ^{ release(*s); }); }];
  });
}

#include "screen.host.cpp"
