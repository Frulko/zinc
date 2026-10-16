// zinc:camera on macOS: AVFoundation (an AVCaptureSession per camera, 32BGRA buffers scaled by the output to the asked size), then the shared
// part (camera.host.cpp). Frames arrive on a serial dispatch queue and are copied, under a mutex, into the camera's newest frame; the
// program's thread takes it in frame(). Manual retain/release: plugins are not built with ARC.
// Privacy: the system asks the person once per app (requestPermission). A session is only started once access is granted, so a process
// without NSCameraUsageDescription is never stopped by the system for asking; `zinc export` writes the usage text and the entitlement.
#define CAM_BACKEND 1
#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#include <pthread.h>
#include <stdio.h>
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
  for (int y = 0; y < ch; y++) {
    const uint32_t* s = (const uint32_t*)(base + (size_t)y * stride);
    uint32_t* d = px + (size_t)y * w;
    for (int x = 0; x < cw; x++) d[x] = s[x] & 0xFFFFFF;   // BGRA in memory is 0xAARRGGBB: the runtime image is opaque 0x00RRGGBB
  }
  seq++;
  pthread_mutex_unlock(&mu);
  CVPixelBufferUnlockBaseAddress(ib, kCVPixelBufferLock_ReadOnly);
}
@end

namespace {
struct Session { AVCaptureSession* session = nil; ZnCamSink* sink = nil; dispatch_queue_t queue = nullptr; };
const int MAXS = 8;
Session sessions[MAXS];

NSArray<AVCaptureDevice*>* video_devices() {
  NSArray* types;
  if (@available(macOS 14.0, *)) types = @[AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDeviceTypeExternal];   // ponytail: no Continuity Camera (an iPhone), which needs NSCameraUseContinuityCameraDeviceType in the Info.plist
  else {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    types = @[AVCaptureDeviceTypeBuiltInWideAngleCamera, AVCaptureDeviceTypeExternalUnknown];
#pragma clang diagnostic pop
  }
  return [AVCaptureDeviceDiscoverySession discoverySessionWithDeviceTypes:types mediaType:AVMediaTypeVideo position:AVCaptureDevicePositionUnspecified].devices;
}
const char* position_of(AVCaptureDevice* d) {
  if (d.position == AVCaptureDevicePositionFront) return "front";
  if (d.position == AVCaptureDevicePositionBack) return "back";
  if ([d.deviceType isEqualToString:AVCaptureDeviceTypeBuiltInWideAngleCamera]) return "front";   // a Mac's own camera faces the person
  return "external";
}
}  // namespace

int cam_backend_permission(bool ask) {
  switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo]) {
    case AVAuthorizationStatusAuthorized: return 1;
    case AVAuthorizationStatusDenied: case AVAuthorizationStatusRestricted: return 2;
    default:
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
    int slot = 0;
    while (slot < MAXS && sessions[slot].session) slot++;
    if (slot == MAXS) { snprintf(err, n, "too many cameras open"); return -1; }
    AVCaptureDevice* dev = [AVCaptureDevice deviceWithUniqueID:[NSString stringWithUTF8String:idc]];
    if (!dev) { snprintf(err, n, "no camera '%s' (devices() lists them)", idc); return -1; }
    // the smallest format that covers the asked size at the asked rate (else the largest), so the output scales down, never up
    AVCaptureDeviceFormat* best = nil;
    long bestArea = 0;
    double rate = 0;
    for (int pass = 0; pass < 2 && !best; pass++)
      for (AVCaptureDeviceFormat* f in dev.formats) {
        CMVideoDimensions d = CMVideoFormatDescriptionGetDimensions(f.formatDescription);
        double top = 0;
        for (AVFrameRateRange* r in f.videoSupportedFrameRateRanges) if (r.maxFrameRate > top) top = r.maxFrameRate;
        const long area = (long)d.width * d.height;
        if (pass == 0 ? d.width >= w && d.height >= h && top >= fps - 0.5 && (!best || area < bestArea) : !best || area > bestArea) { best = f; bestArea = area; rate = top; }
      }
    NSError* e = nil;
    AVCaptureDeviceInput* input = [AVCaptureDeviceInput deviceInputWithDevice:dev error:&e];
    if (!input) { snprintf(err, n, "%s", e ? e.localizedDescription.UTF8String : "the camera cannot be opened"); return -1; }
    AVCaptureSession* session = [[AVCaptureSession alloc] init];
    [session beginConfiguration];
    if (![session canAddInput:input]) { [session commitConfiguration]; [session release]; snprintf(err, n, "the camera is in use or cannot be opened"); return -1; }
    [session addInput:input];
    const double got = rate < fps ? rate : fps;
    bool inRange = false;   // a duration outside the format's ranges raises an exception
    for (AVFrameRateRange* r in best.videoSupportedFrameRateRanges) inRange = inRange || (got >= r.minFrameRate - 0.01 && got <= r.maxFrameRate + 0.01);
    if (best && [dev lockForConfiguration:nil]) {
      dev.activeFormat = best;
      if (got > 0 && inRange) { dev.activeVideoMinFrameDuration = CMTimeMake(1, (int32_t)got); dev.activeVideoMaxFrameDuration = CMTimeMake(1, (int32_t)got); }
      [dev unlockForConfiguration];
    }
    ZnCamSink* sink = [[ZnCamSink alloc] init];
    pthread_mutex_init(&sink->mu, nullptr);
    sink->w = w; sink->h = h; sink->seq = 0;
    sink->px = (uint32_t*)calloc((size_t)w * h, 4);
    AVCaptureVideoDataOutput* out = [[AVCaptureVideoDataOutput alloc] init];
    out.videoSettings = @{ (id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA), (id)kCVPixelBufferWidthKey: @(w), (id)kCVPixelBufferHeightKey: @(h),
                           AVVideoScalingModeKey: AVVideoScalingModeResizeAspectFill };
    out.alwaysDiscardsLateVideoFrames = YES;
    dispatch_queue_t q = dispatch_queue_create("zinc.camera", DISPATCH_QUEUE_SERIAL);
    [out setSampleBufferDelegate:sink queue:q];
    if (![session canAddOutput:out]) { [session commitConfiguration]; [out release]; [session release]; free(sink->px); [sink release]; dispatch_release(q); snprintf(err, n, "the camera gives no video output"); return -1; }
    [session addOutput:out];
    [out release];
    [session commitConfiguration];
    [session startRunning];   // blocks until it runs (a fraction of a second)
    sessions[slot].session = session; sessions[slot].sink = sink; sessions[slot].queue = q;
    *ow = w; *oh = h; *ofps = got > 0 ? got : fps;
    return slot;
  }
}

bool cam_backend_take(int b, uint32_t* px, int w, int h, uint32_t* seq) {
  if (b < 0 || b >= MAXS || !sessions[b].sink) return false;
  ZnCamSink* s = sessions[b].sink;
  pthread_mutex_lock(&s->mu);
  const bool fresh = s->seq != *seq && s->w == w && s->h == h;
  if (fresh) { memcpy(px, s->px, (size_t)w * h * 4); *seq = s->seq; }
  pthread_mutex_unlock(&s->mu);
  return fresh;
}

void cam_backend_close(int b) {
  if (b < 0 || b >= MAXS || !sessions[b].session) return;
  Session& s = sessions[b];
  [s.session stopRunning];
  dispatch_sync(s.queue, ^{});   // no frame is being copied any more
  [s.session release];
  free(s.sink->px);
  pthread_mutex_destroy(&s.sink->mu);
  [s.sink release];
  dispatch_release(s.queue);
  s = Session();
}

#include "camera.host.cpp"
