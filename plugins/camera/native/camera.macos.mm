// zinc:camera on macOS and iOS (camera.ios.mm includes this file): AVFoundation (an AVCaptureSession per camera, 32BGRA buffers scaled by the
// output to the asked size), then the shared part (camera.host.cpp). Frames arrive on a serial dispatch queue and are copied, under a mutex,
// into the camera's newest frame; the program's thread takes it in frame(). Manual retain/release: plugins are not built with ARC.
// Nothing slow runs on the program's thread: building and starting a session (startRunning blocks for 0.3 to 1.5 s on a USB webcam) and
// stopping it run on one serial control queue, and open() returns at once with the camera "starting" (cam_backend_state). A closed session
// is parked for a moment before it stops: opening the same camera again (another size or rate) takes it back and changes its format in
// place, without the stop and start that cost most of a switch.
// Privacy: the system asks the person once per app (requestPermission). A session is only started once access is granted, so a process
// without NSCameraUsageDescription is never stopped by the system for asking; `zinc export` writes the usage text and the entitlement.
#define CAM_BACKEND 1
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#include <TargetConditionals.h>
#include <atomic>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "backend.h"

@interface ZnCamSink : NSObject <AVCaptureVideoDataOutputSampleBufferDelegate> {
@public
  pthread_mutex_t mu;
  uint32_t* px;   // w * h, the newest frame
  int w, h;
  uint32_t seq;
}
@end
@implementation ZnCamSink
- (void)captureOutput:(AVCaptureOutput*)output didOutputSampleBuffer:(CMSampleBufferRef)sample fromConnection:(AVCaptureConnection*)connection {
  CVImageBufferRef ib = CMSampleBufferGetImageBuffer(sample);
  if (!ib || CVPixelBufferLockBaseAddress(ib, kCVPixelBufferLock_ReadOnly) != kCVReturnSuccess) return;
  const uint8_t* base = (const uint8_t*)CVPixelBufferGetBaseAddress(ib);
  const size_t stride = CVPixelBufferGetBytesPerRow(ib);
  const int bw = (int)CVPixelBufferGetWidth(ib), bh = (int)CVPixelBufferGetHeight(ib);
  pthread_mutex_lock(&mu);
  const int cw = bw < w ? bw : w, ch = bh < h ? bh : h;
  // BGRA in memory is 0xAARRGGBB, which the runtime image reads as 0x00RRGGBB (it ignores the top byte): whole rows, no per-pixel work
  for (int y = 0; y < ch; y++) memcpy(px + (size_t)y * w, base + (size_t)y * stride, (size_t)cw * 4);
  seq++;
  pthread_mutex_unlock(&mu);
  CVPixelBufferUnlockBaseAddress(ib, kCVPixelBufferLock_ReadOnly);
}
@end

namespace {
struct Session {
  std::atomic<bool> used{false}, parked{false};   // parked: closed by the program, stopping soon unless the same camera is opened again
  std::atomic<int> state{0};                      // 0 starting, 1 running, -1 failed (why)
  char id[256] = "", why[256] = "";
  AVCaptureDevice* dev = nil;                     // the rest belongs to the control queue, except sink (made by open on the program's thread)
  AVCaptureSession* session = nil;
  AVCaptureVideoDataOutput* out = nil;
  ZnCamSink* sink = nil;
  dispatch_queue_t frames = nullptr;
};
const int MAXS = 8;
Session sessions[MAXS];
dispatch_queue_t control() { static dispatch_queue_t q = dispatch_queue_create("zinc.camera.control", DISPATCH_QUEUE_SERIAL); return q; }

NSArray<AVCaptureDevice*>* video_devices() {
  NSMutableArray* types = [NSMutableArray arrayWithObject:AVCaptureDeviceTypeBuiltInWideAngleCamera];
#if TARGET_OS_IPHONE
  if (@available(iOS 17.0, *)) [types addObject:AVCaptureDeviceTypeExternal];   // a USB camera on an iPad
#else
  if (@available(macOS 14.0, *)) {
    [types addObject:AVCaptureDeviceTypeExternal];
    // an iPhone (Continuity Camera): its own type when the app's Info.plist says NSCameraUseContinuityCameraDeviceType (zinc export writes
    // it); without the key AVCaptureDeviceTypeExternal still lists it, with a deprecation warning from AVFoundation
    if ([[[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSCameraUseContinuityCameraDeviceType"] boolValue]) [types addObject:AVCaptureDeviceTypeContinuityCamera];
  } else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    [types addObject:AVCaptureDeviceTypeExternalUnknown];
#pragma clang diagnostic pop
  }
#endif
  return [AVCaptureDeviceDiscoverySession discoverySessionWithDeviceTypes:types mediaType:AVMediaTypeVideo position:AVCaptureDevicePositionUnspecified].devices;
}
const char* position_of(AVCaptureDevice* d) {
  if (d.position == AVCaptureDevicePositionFront) return "front";
  if (d.position == AVCaptureDevicePositionBack) return "back";
#if !TARGET_OS_IPHONE
  if ([d.deviceType isEqualToString:AVCaptureDeviceTypeBuiltInWideAngleCamera]) return "front";   // a Mac's own camera faces the person
#endif
  return "external";
}

// The smallest format that covers the asked size at the asked rate (else the largest), so the output scales down, never up; `got`: the rate
void pick(AVCaptureDevice* dev, int w, int h, int fps, AVCaptureDeviceFormat** best, double* got) {
  long bestArea = 0;
  double rate = 0;
  *best = nil;
  for (int pass = 0; pass < 2 && !*best; pass++)
    for (AVCaptureDeviceFormat* f in dev.formats) {
      CMVideoDimensions d = CMVideoFormatDescriptionGetDimensions(f.formatDescription);
      double top = 0;
      for (AVFrameRateRange* r in f.videoSupportedFrameRateRanges) if (r.maxFrameRate > top) top = r.maxFrameRate;
      const long area = (long)d.width * d.height;
      if (pass == 0 ? d.width >= w && d.height >= h && top >= fps - 0.5 && (!*best || area < bestArea) : !*best || area > bestArea) { *best = f; bestArea = area; rate = top; }
    }
  *got = rate < fps ? rate : fps;
}
// The device's format and rate, the output's size (on the control queue, inside the session's configuration)
void configure(Session& s, AVCaptureDeviceFormat* best, double got, int w, int h) {
  if (best && [s.dev lockForConfiguration:nil]) {
    s.dev.activeFormat = best;
    // a camera with fixed rates (a phone, a UVC webcam) takes only the exact durations of its ranges, a 1/30 that is not theirs raises
    AVFrameRateRange* hit = nil;
    for (AVFrameRateRange* r in s.dev.activeFormat.videoSupportedFrameRateRanges)
      if (got >= r.minFrameRate - 0.01 && got <= r.maxFrameRate + 0.01 && (!hit || fabs(r.maxFrameRate - got) < fabs(hit.maxFrameRate - got))) hit = r;
    if (got > 0 && hit) {
      const bool fixed = hit.maxFrameRate - hit.minFrameRate < 0.01;
      const CMTime d = fixed ? hit.maxFrameDuration : CMTimeMake(1, (int32_t)got);
      @try { s.dev.activeVideoMinFrameDuration = d; s.dev.activeVideoMaxFrameDuration = d; } @catch (NSException*) {}   // the default rate stays
    }
    [s.dev unlockForConfiguration];
  }
  s.out.videoSettings = @{ (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA), (id)kCVPixelBufferWidthKey: @(w), (id)kCVPixelBufferHeightKey: @(h),
                           AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill };
#if TARGET_OS_IPHONE
  // the app's portrait screen: frames upright, the front camera as a mirror (ponytail: portrait only; follow UIDevice orientation when an app turns)
  AVCaptureConnection* c = [s.out connectionWithMediaType:AVMediaTypeVideo];
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  if (c.isVideoOrientationSupported) c.videoOrientation = AVCaptureVideoOrientationPortrait;
#pragma clang diagnostic pop
  if (c.isVideoMirroringSupported) { c.automaticallyAdjustsVideoMirroring = NO; c.videoMirrored = s.dev.position == AVCaptureDevicePositionFront; }
#endif
}
void failed(Session& s, const char* why) { snprintf(s.why, sizeof s.why, "%s", why); s.state = -1; }
// A new session (control queue): input, output, format, then startRunning, the call that takes a fraction of a second to seconds
void build(Session& s, AVCaptureDeviceFormat* best, double got, int w, int h) {
  NSError* e = nil;
  AVCaptureDeviceInput* input = [AVCaptureDeviceInput deviceInputWithDevice:s.dev error:&e];
  if (!input) { failed(s, e ? e.localizedDescription.UTF8String : "the camera cannot be opened"); return; }
  s.session = [[AVCaptureSession alloc] init];
  [s.session beginConfiguration];
  if (![s.session canAddInput:input]) { [s.session commitConfiguration]; failed(s, "the camera is in use or cannot be opened"); return; }
  [s.session addInput:input];
  s.out = [[AVCaptureVideoDataOutput alloc] init];
  s.out.alwaysDiscardsLateVideoFrames = YES;
  s.frames = dispatch_queue_create("zinc.camera", DISPATCH_QUEUE_SERIAL);
  [s.out setSampleBufferDelegate:s.sink queue:s.frames];
  if (![s.session canAddOutput:s.out]) { [s.session commitConfiguration]; failed(s, "the camera gives no video output"); return; }
  [s.session addOutput:s.out];
  configure(s, best, got, w, h);
  [s.session commitConfiguration];
  [s.session startRunning];
  if (s.session.running) s.state = 1; else failed(s, "the camera did not start (another app may be using it)");
}
// Stops and frees a session (control queue); its slot is free afterwards
void stop(Session& s) {
  if (s.session) { [s.session stopRunning]; [s.session release]; }
  if (s.frames) { dispatch_sync(s.frames, ^{}); dispatch_release(s.frames); }   // no frame is being copied any more
  [s.out release];
  [s.dev release];
  free(s.sink->px);
  pthread_mutex_destroy(&s.sink->mu);
  [s.sink release];
  s.session = nil; s.out = nil; s.dev = nil; s.sink = nil; s.frames = nullptr;
  s.state = 0; s.id[0] = 0; s.why[0] = 0;
  s.used = false;
}
}  // namespace

int cam_backend_permission(bool ask) {
  switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo]) {
    case AVAuthorizationStatusAuthorized: return 1;
    case AVAuthorizationStatusDenied: case AVAuthorizationStatusRestricted: return 2;
    default:
#if TARGET_OS_IPHONE
      // iOS ends an app that asks without NSCameraUsageDescription in its Info.plist (zinc.json "permissions": ["camera"] writes it)
      if (![[NSBundle mainBundle] objectForInfoDictionaryKey:@"NSCameraUsageDescription"]) return 2;
#endif
      if (ask) [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL) {}];
      return 0;
  }
}

int cam_backend_list(CamDevice* out, int max) {
  @autoreleasepool {
    int n = 0;
    for (AVCaptureDevice* d in video_devices()) {
      if (n == max) break;
      snprintf(out[n].id, sizeof out[n].id, "%s", d.uniqueID.UTF8String);
      snprintf(out[n].name, sizeof out[n].name, "%s", d.localizedName.UTF8String);
      out[n].position = position_of(d);
      n++;
    }
    return n;
  }
}

int cam_backend_open(const char* idc, int w, int h, int fps, int* ow, int* oh, double* ofps, char* err, int n) {
  @autoreleasepool {
    switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo]) {
      case AVAuthorizationStatusAuthorized: break;
      case AVAuthorizationStatusNotDetermined: snprintf(err, n, "access to the camera was not asked yet: call requestPermission() first"); return -1;
      default: snprintf(err, n, "access to the camera is denied to this app (System Settings > Privacy & Security > Camera)"); return -1;
    }
    AVCaptureDevice* dev = [AVCaptureDevice deviceWithUniqueID:[NSString stringWithUTF8String:idc]];
    if (!dev) { snprintf(err, n, "no camera '%s' (devices() lists them)", idc); return -1; }
    AVCaptureDeviceFormat* best = nil;
    double got = 0;
    pick(dev, w, h, fps, &best, &got);
    int slot = -1;
    for (int i = 0; i < MAXS && slot < 0; i++)   // the same camera, closed a moment ago: taken back, its format changed in place
      if (sessions[i].used && sessions[i].state >= 0 && !strcmp(sessions[i].id, idc) && sessions[i].parked.exchange(false)) slot = i;
    const bool again = slot >= 0;
    for (int i = 0; i < MAXS && slot < 0; i++) if (!sessions[i].used) slot = i;
    if (slot < 0) { snprintf(err, n, "too many cameras open"); return -1; }
    Session* s = &sessions[slot];
    if (again) {
      pthread_mutex_lock(&s->sink->mu);
      free(s->sink->px);
      s->sink->px = (uint32_t*)calloc((size_t)w * h, 4);
      s->sink->w = w; s->sink->h = h;
      pthread_mutex_unlock(&s->sink->mu);
    } else {
      s->used = true; s->parked = false; s->state = 0;
      snprintf(s->id, sizeof s->id, "%s", idc);
      s->dev = [dev retain];
      s->sink = [[ZnCamSink alloc] init];
      pthread_mutex_init(&s->sink->mu, nullptr);
      s->sink->w = w; s->sink->h = h; s->sink->seq = 0;
      s->sink->px = (uint32_t*)calloc((size_t)w * h, 4);
    }
    [best retain];
    dispatch_async(control(), ^{
      @autoreleasepool {
        if (s->state < 0) {}   // a failed session waits for its close
        else if (!s->session) build(*s, best, got, w, h);
        else { [s->session beginConfiguration]; configure(*s, best, got, w, h); [s->session commitConfiguration]; s->state = 1; }
        [best release];
      }
    });
    *ow = w; *oh = h; *ofps = got > 0 ? got : fps;
    return slot;
  }
}

int cam_backend_state(int b, char* err, int n) {
  if (b < 0 || b >= MAXS || !sessions[b].used) return -1;
  const int st = sessions[b].state;
  if (st < 0) snprintf(err, n, "%s", sessions[b].why);
  return st;
}

bool cam_backend_take(int b, uint32_t* px, int w, int h, uint32_t* seq) {
  if (b < 0 || b >= MAXS || !sessions[b].used || sessions[b].parked) return false;
  ZnCamSink* s = sessions[b].sink;
  pthread_mutex_lock(&s->mu);
  const bool fresh = s->seq != *seq && s->w == w && s->h == h;
  if (fresh) { memcpy(px, s->px, (size_t)w * h * 4); *seq = s->seq; }
  pthread_mutex_unlock(&s->mu);
  return fresh;
}

void cam_backend_close(int b) {
  if (b < 0 || b >= MAXS || !sessions[b].used || sessions[b].parked) return;
  Session* s = &sessions[b];
  s->parked = true;
  // parked for 300 ms: a format change or a fresh start of the same camera takes it back (open) instead of stopping and starting it
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC), control(), ^{
    if (s->parked.exchange(false)) @autoreleasepool { stop(*s); }
  });
}

#include "camera.host.cpp"
