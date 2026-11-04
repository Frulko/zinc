// zinc:monitors on macOS. What Apple documents goes through Quartz Display Services; the rest is private and looked up at run time, so a
// macOS that drops a symbol gets an error message, not a load failure: CGVirtualDisplay (virtual displays), DisplayServices (native
// brightness), IOAVService (DDC on Apple Silicon), MonitorPanel (rotation), CGSConfigureDisplayEnabled (connection).
// Manual retain/release: plugins are not built with ARC. Everything but the DDC queue runs on the program's thread, the main one.
#define ZRT_HOSTED_CPP
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <IOKit/IOKitLib.h>
#import <Metal/Metal.h>
#import <QuartzCore/QuartzCore.h>
#include <dlfcn.h>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <unistd.h>
#include <vector>
#include "zinc_native_monitors.h"

@interface CGVirtualDisplayMode : NSObject
- (instancetype)initWithWidth:(NSUInteger)w height:(NSUInteger)h refreshRate:(double)r;
@end
@interface CGVirtualDisplaySettings : NSObject
@property(nonatomic) unsigned int hiDPI;
@property(copy, nonatomic) NSArray* modes;
@end
@interface CGVirtualDisplayDescriptor : NSObject
@property(copy, nonatomic) NSString* name;
@property(nonatomic) unsigned int vendorID, productID, serialNum, maxPixelsWide, maxPixelsHigh;
@property(nonatomic) CGSize sizeInMillimeters;
@property(nonatomic) CGPoint redPrimary, greenPrimary, bluePrimary, whitePoint;
- (void)setDispatchQueue:(dispatch_queue_t)q;
@end
@interface CGVirtualDisplay : NSObject
- (instancetype)initWithDescriptor:(CGVirtualDisplayDescriptor*)d;
- (BOOL)applySettings:(CGVirtualDisplaySettings*)s;
- (CGDirectDisplayID)displayID;
@end
@interface MPDisplay : NSObject
- (BOOL)canChangeOrientation;
- (void)setOrientation:(int)degrees;
@end
@interface MPDisplayMgr : NSObject
- (MPDisplay*)displayWithID:(int)id;
- (void)lockAccess;
- (void)unlockAccess;
@end

namespace {
std::string lastError;
int revisionCount = 0;
std::map<CGDirectDisplayID, CGVirtualDisplay*> virtuals;
std::set<CGDirectDisplayID> disconnected;
struct Gamma { double dim, warmth; };
std::map<CGDirectDisplayID, Gamma> gammas;
std::map<CGDirectDisplayID, NSWindow*> boosts;
std::map<CGDirectDisplayID, double> boostLevels;

bool fail(const std::string& why) { lastError = why; return false; }
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
std::string json(id value) {
  NSData* data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  return std::string((const char*)data.bytes, data.length);
}
template <class T> T privateSymbol(const char* framework, const char* name) {
  void* lib = framework ? dlopen(framework, RTLD_LAZY) : RTLD_DEFAULT;
  return lib ? (T)dlsym(lib, name) : nullptr;
}

NSScreen* screenOf(CGDirectDisplayID display) {
  for (NSScreen* s in NSScreen.screens)
    if ([s.deviceDescription[@"NSScreenNumber"] unsignedIntValue] == display) return s;
  return nil;
}

/** One display configuration transaction; the change stays after this process ends, as System Settings' do. */
template <class F> bool configure(const char* what, F change) {
  CGDisplayConfigRef config;
  if (CGBeginDisplayConfiguration(&config) != kCGErrorSuccess) return fail("cannot begin a display configuration");
  CGError e = change(config);
  if (e != kCGErrorSuccess) { CGCancelDisplayConfiguration(config); return fail(std::string(what) + " refused (CGError " + std::to_string(e) + ")"); }
  e = CGCompleteDisplayConfiguration(config, kCGConfigurePermanently);
  if (e != kCGErrorSuccess) return fail(std::string(what) + " failed (CGError " + std::to_string(e) + ")");
  return true;
}

// ---- Native brightness ----
const char* DISPLAY_SERVICES = "/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices";
typedef int (*BrightnessGet)(CGDirectDisplayID, float*);
typedef int (*BrightnessSet)(CGDirectDisplayID, float);

// ---- DDC over IOAVService (Apple Silicon) ----
const uint8_t DDC_CHIP = 0x37, DDC_SOURCE = 0x51;
const int DDC_REPLY_DELAY_US = 50000, DDC_ATTEMPTS = 3;
typedef CFTypeRef (*AvCreate)(CFAllocatorRef, io_service_t);
typedef IOReturn (*AvWrite)(CFTypeRef, uint32_t, uint32_t, void*, uint32_t);
typedef IOReturn (*AvRead)(CFTypeRef, uint32_t, uint32_t, void*, uint32_t);
const AvCreate avCreate = privateSymbol<AvCreate>(nullptr, "IOAVServiceCreateWithService");
const AvWrite avWrite = privateSymbol<AvWrite>(nullptr, "IOAVServiceWriteI2C");
const AvRead avRead = privateSymbol<AvRead>(nullptr, "IOAVServiceReadI2C");

dispatch_queue_t ddcQueue() {
  static dispatch_queue_t q = dispatch_queue_create("dev.zinc.monitors.ddc", DISPATCH_QUEUE_SERIAL);
  return q;
}
struct AvLink { uint32_t product, serial; CFTypeRef service; };
std::vector<AvLink> avLinks;
int avLinksRevision = -1;

/** In the IOService plane an external DCPAVServiceProxy follows the framebuffer of its monitor, whose DisplayAttributes identify it. */
void refreshAvLinks() {
  if (avLinksRevision == revisionCount) return;
  avLinksRevision = revisionCount;
  for (AvLink& l : avLinks) CFRelease(l.service);
  avLinks.clear();
  if (!avCreate) return;
  io_iterator_t it;
  if (IORegistryEntryCreateIterator(IORegistryGetRootEntry(kIOMainPortDefault), kIOServicePlane, kIORegistryIterateRecursively, &it) != KERN_SUCCESS) return;
  uint32_t product = 0, serial = 0;
  while (io_object_t entry = IOIteratorNext(it)) {
    io_name_t name;
    IORegistryEntryGetName(entry, name);
    if (strstr(name, "AppleCLCD2") || strstr(name, "IOMobileFramebufferShim")) {
      CFTypeRef attrs = IORegistryEntryCreateCFProperty(entry, CFSTR("DisplayAttributes"), kCFAllocatorDefault, 0);
      if (attrs) {
        NSDictionary* productAttrs = ((__bridge NSDictionary*)attrs)[@"ProductAttributes"];
        product = [productAttrs[@"ProductID"] unsignedIntValue];
        serial = [productAttrs[@"SerialNumber"] unsignedIntValue];
        CFRelease(attrs);
      }
    } else if (!strcmp(name, "DCPAVServiceProxy")) {
      CFTypeRef location = IORegistryEntryCreateCFProperty(entry, CFSTR("Location"), kCFAllocatorDefault, 0);
      if (location && CFEqual(location, CFSTR("External"))) {
        CFTypeRef service = avCreate(kCFAllocatorDefault, entry);
        if (service) avLinks.push_back({product, serial, service});
      }
      if (location) CFRelease(location);
    }
    IOObjectRelease(entry);
  }
  IOObjectRelease(it);
}
CFTypeRef avServiceOf(CGDirectDisplayID display) {
  if (CGDisplayIsBuiltin(display)) return nullptr;
  refreshAvLinks();
  for (const AvLink& l : avLinks)
    if (l.product == CGDisplayModelNumber(display) && (l.serial == 0 || l.serial == CGDisplaySerialNumber(display))) return l.service;
  return nullptr;
}
/** The DDC/CI frame: length, opcode, payload, then an XOR of everything on the wire, the addresses included. */
bool ddcSend(CFTypeRef service, std::vector<uint8_t> body) {
  uint8_t sum = (DDC_CHIP << 1) ^ DDC_SOURCE;
  for (uint8_t b : body) sum ^= b;
  body.push_back(sum);
  return avWrite(service, DDC_CHIP, DDC_SOURCE, body.data(), (uint32_t)body.size()) == kIOReturnSuccess;
}
std::map<std::pair<CGDirectDisplayID, int>, int> ddcPending;   // main thread and queue: only touched on the queue

// ---- Boost: a multiply-blended HDR layer above everything scales what the screen shows past SDR white ----
void drawBoost(CAMetalLayer* layer, double level) {
  static id<MTLCommandQueue> queue = [layer.device newCommandQueue];
  id<CAMetalDrawable> drawable = [layer nextDrawable];
  if (!drawable) return;
  MTLRenderPassDescriptor* pass = [MTLRenderPassDescriptor renderPassDescriptor];
  pass.colorAttachments[0].texture = drawable.texture;
  pass.colorAttachments[0].loadAction = MTLLoadActionClear;
  pass.colorAttachments[0].storeAction = MTLStoreActionStore;
  pass.colorAttachments[0].clearColor = MTLClearColorMake(level, level, level, 1);
  id<MTLCommandBuffer> commands = [queue commandBuffer];
  [[commands renderCommandEncoderWithDescriptor:pass] endEncoding];
  [commands presentDrawable:drawable];
  [commands commit];
}
NSWindow* makeBoostWindow(NSScreen* screen) {
  NSWindow* w = [[NSWindow alloc] initWithContentRect:screen.frame styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
  w.opaque = NO;
  w.backgroundColor = NSColor.clearColor;
  w.ignoresMouseEvents = YES;
  w.releasedWhenClosed = NO;
  w.level = NSScreenSaverWindowLevel;
  w.sharingType = NSWindowSharingNone;
  w.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorStationary | NSWindowCollectionBehaviorIgnoresCycle | NSWindowCollectionBehaviorFullScreenAuxiliary;
  CAMetalLayer* layer = [CAMetalLayer layer];
  layer.device = MTLCreateSystemDefaultDevice();
  layer.pixelFormat = MTLPixelFormatRGBA16Float;
  layer.wantsExtendedDynamicRangeContent = YES;
  CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceExtendedLinearSRGB);
  layer.colorspace = space;
  CGColorSpaceRelease(space);
  layer.opaque = NO;
  layer.compositingFilter = @"multiplyBlendMode";
  w.contentView.wantsLayer = YES;
  w.contentView.layer = layer;
  layer.frame = w.contentView.bounds;
  layer.drawableSize = screen.frame.size;
  return w;
}

void reconfigured(CGDirectDisplayID, CGDisplayChangeSummaryFlags flags, void*) {
  if (!(flags & kCGDisplayBeginConfigurationFlag)) revisionCount++;
}
}  // namespace

struct DdcReply { int job, current, maximum; };
std::mutex ddcRepliesLock;
std::vector<DdcReply> ddcReplies;

struct MacMonitors : NativeMonitors, zrt::Poller {
  bool polling = false;
  int nextDdcJob = 0;
  std::map<int, zrt::Fn<void(double, double)>> ddcJobs;

  MacMonitors() { CGDisplayRegisterReconfigurationCallback(reconfigured, nullptr); }

  bool fake() override {
    const char* forced = getenv("ZINC_FAKE_DISPLAYS");
    if (forced) return forced[0] == '1';
    const char* deterministic = getenv("ZINC_DETERMINISTIC");
    return deterministic && deterministic[0] == '1';
  }

  zrt::String displays() override {
    uint32_t count = 0;
    CGDirectDisplayID ids[32];
    CGGetOnlineDisplayList(32, ids, &count);
    NSMutableArray* out = [NSMutableArray array];
    std::set<CGDirectDisplayID> seen;
    for (uint32_t i = 0; i < count; i++) {
      const CGDirectDisplayID d = ids[i];
      seen.insert(d);
      CGRect bounds = CGDisplayBounds(d);
      CGDisplayModeRef mode = CGDisplayCopyDisplayMode(d);
      NSScreen* screen = screenOf(d);
      NSString* name = screen ? screen.localizedName : (CGDisplayIsBuiltin(d) ? @"Built-in Display" : [NSString stringWithFormat:@"Display %u", d]);
      if (virtuals.count(d)) name = [(id)virtuals[d] name];
      [out addObject:@{
        @"id": @(d), @"name": name ?: @"Display", @"builtin": @(CGDisplayIsBuiltin(d) != 0), @"main": @(CGDisplayIsMain(d) != 0),
        @"connected": @(CGDisplayIsActive(d) != 0), @"virtual": @(virtuals.count(d) != 0),
        @"x": @(bounds.origin.x), @"y": @(bounds.origin.y), @"width": @(bounds.size.width), @"height": @(bounds.size.height),
        @"pixelWidth": @(mode ? CGDisplayModeGetPixelWidth(mode) : 0), @"pixelHeight": @(mode ? CGDisplayModeGetPixelHeight(mode) : 0),
        @"refresh": @(mode ? CGDisplayModeGetRefreshRate(mode) : 0), @"rotation": @(CGDisplayRotation(d)),
        @"mirrorOf": @(CGDisplayMirrorsDisplay(d)), @"modeId": @(mode ? CGDisplayModeGetIODisplayModeID(mode) : 0)
      }];
      if (mode) CGDisplayModeRelease(mode);
    }
    for (CGDirectDisplayID d : disconnected) {
      if (seen.count(d)) continue;
      [out addObject:@{
        @"id": @(d), @"name": [NSString stringWithFormat:@"Display %u", d], @"builtin": @(CGDisplayIsBuiltin(d) != 0), @"main": @NO, @"connected": @NO,
        @"virtual": @NO, @"x": @0, @"y": @0, @"width": @0, @"height": @0, @"pixelWidth": @0, @"pixelHeight": @0, @"refresh": @0, @"rotation": @0,
        @"mirrorOf": @0, @"modeId": @0
      }];
    }
    return str(json(out));
  }
  int32_t revision() override { return revisionCount; }

  zrt::String modes(int32_t id) override {
    NSDictionary* options = @{(__bridge NSString*)kCGDisplayShowDuplicateLowResolutionModes: @YES};
    NSMutableArray* out = [NSMutableArray array];
    CFArrayRef all = CGDisplayCopyAllDisplayModes((CGDirectDisplayID)id, (__bridge CFDictionaryRef)options);
    if (all) {
      for (CFIndex i = 0; i < CFArrayGetCount(all); i++) {
        CGDisplayModeRef m = (CGDisplayModeRef)CFArrayGetValueAtIndex(all, i);
        if (!CGDisplayModeIsUsableForDesktopGUI(m)) continue;
        [out addObject:@{
          @"id": @(CGDisplayModeGetIODisplayModeID(m)), @"width": @(CGDisplayModeGetWidth(m)), @"height": @(CGDisplayModeGetHeight(m)),
          @"pixelWidth": @(CGDisplayModeGetPixelWidth(m)), @"pixelHeight": @(CGDisplayModeGetPixelHeight(m)), @"refresh": @(CGDisplayModeGetRefreshRate(m))
        }];
      }
      CFRelease(all);
    }
    return str(json(out));
  }
  bool setMode(int32_t id, int32_t modeId) override {
    NSDictionary* options = @{(__bridge NSString*)kCGDisplayShowDuplicateLowResolutionModes: @YES};
    CFArrayRef all = CGDisplayCopyAllDisplayModes((CGDirectDisplayID)id, (__bridge CFDictionaryRef)options);
    if (!all) return fail("this display has no modes");
    CGDisplayModeRef found = nullptr;
    for (CFIndex i = 0; i < CFArrayGetCount(all) && !found; i++) {
      CGDisplayModeRef m = (CGDisplayModeRef)CFArrayGetValueAtIndex(all, i);
      if (CGDisplayModeGetIODisplayModeID(m) == modeId) found = m;
    }
    bool ok = found ? configure("the mode", [&](CGDisplayConfigRef c) { return CGConfigureDisplayWithDisplayMode(c, (CGDirectDisplayID)id, found, nullptr); }) : fail("this display no longer has that mode");
    CFRelease(all);
    return ok;
  }

  double nativeBrightness(int32_t id) override {
    static BrightnessGet get = privateSymbol<BrightnessGet>(DISPLAY_SERVICES, "DisplayServicesGetBrightness");
    float value = -1;
    if (!get || get((CGDirectDisplayID)id, &value) != 0) return -1;
    return value;
  }
  bool setNativeBrightness(int32_t id, double value) override {
    static BrightnessSet set = privateSymbol<BrightnessSet>(DISPLAY_SERVICES, "DisplayServicesSetBrightness");
    if (!set) return fail("DisplayServices is not available on this macOS");
    return set((CGDirectDisplayID)id, (float)value) == 0 || fail("this display has no native brightness");
  }

  void ddcRead(int32_t id, int32_t code, zrt::Fn<void(double, double)> done) override {
    CFTypeRef service = avServiceOf((CGDirectDisplayID)id);
    if (!service || !avWrite || !avRead) {
      fail("this display has no DDC link");
      done(-1, -1);
      return;
    }
    if (!polling) { polling = true; zrt::add_poller(this); }
    const int job = nextDdcJob++;
    ddcJobs[job] = done;
    dispatch_async(ddcQueue(), ^{
      DdcReply answer = {job, -1, -1};
      for (int attempt = 0; attempt < DDC_ATTEMPTS && answer.current < 0; attempt++) {
        if (!ddcSend(service, {0x82, 0x01, (uint8_t)code})) continue;
        usleep(DDC_REPLY_DELAY_US);
        uint8_t reply[11] = {};
        if (avRead(service, DDC_CHIP, 0, reply, sizeof reply) != kIOReturnSuccess) continue;
        const bool isAnswer = reply[2] == 0x02 && reply[3] == 0 && reply[4] == (uint8_t)code;
        if (!isAnswer) continue;
        answer.maximum = (reply[6] << 8) | reply[7];
        answer.current = (reply[8] << 8) | reply[9];
      }
      std::lock_guard<std::mutex> hold(ddcRepliesLock);
      ddcReplies.push_back(answer);
    });
  }

  /** The answers of the DDC queue, on the program's thread. */
  bool poll() override {
    std::vector<DdcReply> answers;
    { std::lock_guard<std::mutex> hold(ddcRepliesLock); answers.swap(ddcReplies); }
    for (const DdcReply& answer : answers) {
      auto job = ddcJobs.find(answer.job);
      if (job == ddcJobs.end()) continue;
      if (answer.current < 0) fail("the monitor did not answer over DDC");
      zrt::Fn<void(double, double)> done = job->second;
      ddcJobs.erase(job);
      done(answer.current, answer.maximum);
    }
    return !ddcJobs.empty();
  }

  bool ddcWrite(int32_t id, int32_t code, int32_t value) override {
    CFTypeRef service = avServiceOf((CGDirectDisplayID)id);
    if (!service || !avWrite) return fail("this display has no DDC link");
    const auto key = std::make_pair((CGDirectDisplayID)id, (int)code);
    dispatch_async(ddcQueue(), ^{ ddcPending[key] = value; });
    dispatch_async(ddcQueue(), ^{
      auto it = ddcPending.find(key);
      if (it == ddcPending.end()) return;
      const int newest = it->second;
      ddcPending.erase(it);
      ddcSend(service, {0x84, 0x03, (uint8_t)code, (uint8_t)(newest >> 8), (uint8_t)newest});
      usleep(DDC_REPLY_DELAY_US);
    });
    return true;
  }

  bool setGamma(int32_t id, double dim, double warmth) override {
    const CGDirectDisplayID d = (CGDirectDisplayID)id;
    if (dim >= 1 && warmth <= 0) {
      if (!gammas.erase(d)) return true;
      CGDisplayRestoreColorSyncSettings();   // restores every display: put the others back
      for (const auto& g : gammas) setGamma((int32_t)g.first, g.second.dim, g.second.warmth);
      return true;
    }
    gammas[d] = {dim, warmth};
    const CGGammaValue red = (CGGammaValue)dim, green = (CGGammaValue)(dim * (1 - 0.22 * warmth)), blue = (CGGammaValue)(dim * (1 - 0.6 * warmth));
    return CGSetDisplayTransferByFormula(d, 0, red, 1, 0, green, 1, 0, blue, 1) == kCGErrorSuccess || fail("this display refuses gamma changes");
  }

  double boostMax(int32_t id) override {
    NSScreen* screen = screenOf((CGDirectDisplayID)id);
    return screen ? screen.maximumPotentialExtendedDynamicRangeColorComponentValue : 1;
  }
  bool setBoost(int32_t id, double level) override {
    const CGDirectDisplayID d = (CGDirectDisplayID)id;
    auto it = boosts.find(d);
    if (level <= 1) {
      if (it != boosts.end()) { [it->second close]; [it->second release]; boosts.erase(it); }
      return true;
    }
    NSScreen* screen = screenOf(d);
    if (!screen) return fail("this display is not connected");
    if (boostMax(id) <= 1) return fail("this display cannot go above SDR white");
    NSWindow* window = it != boosts.end() ? it->second : (boosts[d] = makeBoostWindow(screen));
    [window setFrame:screen.frame display:NO];
    [window orderFrontRegardless];
    drawBoost((CAMetalLayer*)window.contentView.layer, MIN(level, boostMax(id)));
    return true;
  }

  bool setOrigin(int32_t id, int32_t x, int32_t y) override {
    return configure("the arrangement", [&](CGDisplayConfigRef c) { return CGConfigureDisplayOrigin(c, (CGDirectDisplayID)id, x, y); });
  }
  bool setMain(int32_t id) override {
    // The main display is the one at (0, 0): every display moves by the same amount.
    const CGRect target = CGDisplayBounds((CGDirectDisplayID)id);
    uint32_t count = 0;
    CGDirectDisplayID ids[32];
    CGGetActiveDisplayList(32, ids, &count);
    return configure("the main display", [&](CGDisplayConfigRef c) {
      for (uint32_t i = 0; i < count; i++) {
        const CGRect b = CGDisplayBounds(ids[i]);
        CGError e = CGConfigureDisplayOrigin(c, ids[i], (int)(b.origin.x - target.origin.x), (int)(b.origin.y - target.origin.y));
        if (e != kCGErrorSuccess) return e;
      }
      return kCGErrorSuccess;
    });
  }
  bool setMirror(int32_t id, int32_t masterId) override {
    return configure("mirroring", [&](CGDisplayConfigRef c) { return CGConfigureDisplayMirrorOfDisplay(c, (CGDirectDisplayID)id, (CGDirectDisplayID)masterId); });
  }
  bool setRotation(int32_t id, int32_t degrees) override {
    dlopen("/System/Library/PrivateFrameworks/MonitorPanel.framework/MonitorPanel", RTLD_LAZY);
    Class managerClass = NSClassFromString(@"MPDisplayMgr");
    if (!managerClass) return fail("MonitorPanel is not available on this macOS");
    MPDisplayMgr* manager = [[managerClass alloc] init];
    [manager lockAccess];
    MPDisplay* display = [manager displayWithID:id];
    const bool can = display && [display canChangeOrientation];
    if (can) [display setOrientation:degrees];
    [manager unlockAccess];
    [manager release];
    return can || fail("this display cannot rotate");
  }
  bool setConnected(int32_t id, bool on) override {
    typedef CGError (*SetEnabled)(CGDisplayConfigRef, CGDirectDisplayID, bool);
    static SetEnabled setEnabled = privateSymbol<SetEnabled>(nullptr, "CGSConfigureDisplayEnabled");
    if (!setEnabled) return fail("connecting displays is not available on this macOS");
    const CGDirectDisplayID d = (CGDirectDisplayID)id;
    uint32_t active = 0;
    CGGetActiveDisplayList(0, nullptr, &active);
    if (!on && active <= 1) return fail("this is the last display: disconnecting it would leave no screen");
    const bool ok = configure("the connection", [&](CGDisplayConfigRef c) { return setEnabled(c, d, on); });
    if (ok && !on) disconnected.insert(d);
    if (ok && on) disconnected.erase(d);
    return ok;
  }

  int32_t createVirtual(zrt::String name, int32_t width, int32_t height, double refresh, bool hidpi) override {
    Class displayClass = NSClassFromString(@"CGVirtualDisplay");
    if (!displayClass) { fail("virtual displays are not available on this macOS"); return 0; }
    static uint32_t serial = 1;
    const int scale = hidpi ? 2 : 1;
    CGVirtualDisplayDescriptor* descriptor = [[NSClassFromString(@"CGVirtualDisplayDescriptor") alloc] init];
    descriptor.name = [[[NSString alloc] initWithBytes:name.ptr() length:name.bytes() encoding:NSUTF8StringEncoding] autorelease];
    descriptor.vendorID = 0x7A6E;
    descriptor.productID = 0x0001;
    descriptor.serialNum = serial++;
    descriptor.maxPixelsWide = width * scale;
    descriptor.maxPixelsHigh = height * scale;
    descriptor.sizeInMillimeters = CGSizeMake(width * 0.2, height * 0.2);   // about 127 dpi at one point per pixel
    descriptor.redPrimary = CGPointMake(0.64, 0.33);   // sRGB
    descriptor.greenPrimary = CGPointMake(0.30, 0.60);
    descriptor.bluePrimary = CGPointMake(0.15, 0.06);
    descriptor.whitePoint = CGPointMake(0.3127, 0.3290);
    [descriptor setDispatchQueue:dispatch_get_main_queue()];
    CGVirtualDisplay* display = [[displayClass alloc] initWithDescriptor:descriptor];
    [descriptor release];
    if (!display) { fail("the system refused to create the virtual display"); return 0; }
    NSMutableArray* modes = [NSMutableArray array];
    for (double factor : {1.0, 0.75, 0.5}) {
      id mode = [[[NSClassFromString(@"CGVirtualDisplayMode") alloc] initWithWidth:(NSUInteger)(width * factor) height:(NSUInteger)(height * factor) refreshRate:refresh] autorelease];
      [modes addObject:mode];
    }
    CGVirtualDisplaySettings* settings = [[NSClassFromString(@"CGVirtualDisplaySettings") alloc] init];
    settings.hiDPI = hidpi ? 1 : 0;
    settings.modes = modes;
    const BOOL applied = [display applySettings:settings];
    [settings release];
    if (!applied) { [display release]; fail("the system refused the virtual display's modes"); return 0; }
    const CGDirectDisplayID d = [display displayID];
    virtuals[d] = display;
    return (int32_t)d;
  }
  bool destroyVirtual(int32_t id) override {
    auto it = virtuals.find((CGDirectDisplayID)id);
    if (it == virtuals.end()) return fail("this is not a virtual display of this app");
    [it->second release];   // the display goes away with its last reference
    virtuals.erase(it);
    return true;
  }
  zrt::String error() override { return str(lastError); }
};

NativeMonitors* zinc_create_Monitors() {
  static MacMonitors instance;
  instance.rc = zrt::IMMORTAL;
  return &instance;
}
