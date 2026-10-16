// zinc:video on iOS: the AVFoundation backend of player.h. See docs/plugins/video.md.
//
// The worker reads each picture with AVAssetReader (VideoToolbox decodes, in hardware on a phone) from an AVAssetReaderTrackOutput in
// 32BGRA: the system converts, so a picture is only scaled to the player's box here (a row copy at 1:1). Audio is not played (as elsewhere).
// Manual reference counting, as the other Objective-C plugins (camera.macos.mm).
#define ZRT_HOSTED_CPP   // zrt.h takes <new> from the standard library, which AVFoundation includes too
#import <AVFoundation/AVFoundation.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#include "zinc_native_video.h"
#include "zrt_raster.h"
#if __has_include("zn/resource_stats.h")
#include "zn/resource_stats.h"
#endif

struct Held {};
// The scale to the player's box, kept from picture to picture: where each output column and row reads in the picture.
struct Conv { int w, h, box[4]; int *lx, *ly; };
#include "player.h"

struct Source : SourceBase {
  AVAssetReader* reader;
  AVAssetReaderTrackOutput* out;
  double fdur, start;   // the nominal frame duration, the first picture's time (s; -1 before it)
  Conv cv;
};

static void backend_init() {}

/** The file's first video track (retained), or nil. The asset loads its tracks asynchronously since iOS 18 deprecated the getter: this
 *  thread waits for them, at most 5 s (a local file answers at once; the answer comes on another queue). */
static AVAssetTrack* video_track(AVURLAsset* a) {
  __block AVAssetTrack* t = nil;
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  [a loadTracksWithMediaType:AVMediaTypeVideo completionHandler:^(NSArray<AVAssetTrack*>* tracks, NSError*) {
    t = [tracks.firstObject retain];
    dispatch_semaphore_signal(done);
  }];
  if (dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) != 0) t = nil;   // ponytail: a late answer leaks its track
  dispatch_release(done);
  return t;
}
static AVURLAsset* asset_of(const char* path) {
  NSString* p = [NSString stringWithUTF8String:path];
  if (!p || ![[NSFileManager defaultManager] fileExistsAtPath:p]) return nil;
  return [AVURLAsset URLAssetWithURL:[NSURL fileURLWithPath:p] options:nil];   // relative to the working directory, as fopen
}
static bool src_probe(const char* path, int* w, int* h) {
  @autoreleasepool {
    AVURLAsset* a = asset_of(path);
    AVAssetTrack* t = a ? video_track(a) : nil;
    if (!t) return false;
    CGSize sz = t.naturalSize;
    if (w) { *w = (int)(sz.width + 0.5); *h = (int)(sz.height + 0.5); }
    [t release];
    return sz.width >= 1 && sz.height >= 1;
  }
}
static void conv_free(Conv* c) { free(c->lx); *c = Conv{}; }
static void src_close(SourceBase* b) {
  Source* s = static_cast<Source*>(b);
  if (!s) return;
  [s->reader cancelReading];
  [s->out release];
  [s->reader release];
  conv_free(&s->cv);
  free(s);
}
static SourceBase* src_open(const char* path, int item) {
  @autoreleasepool {
    AVURLAsset* a = asset_of(path);
    AVAssetTrack* t = a ? video_track(a) : nil;
    if (!t) return nullptr;
    NSError* err = nil;
    Source* s = (Source*)calloc(1, sizeof(Source));
    s->item = item; s->start = -1;
    s->reader = [[AVAssetReader alloc] initWithAsset:a error:&err];
    NSDictionary* fmt = @{(id)kCVPixelBufferPixelFormatTypeKey: @(kCVPixelFormatType_32BGRA)};
    s->out = s->reader ? [[AVAssetReaderTrackOutput alloc] initWithTrack:t outputSettings:fmt] : nil;
    s->out.alwaysCopiesSampleData = NO;   // the picture is read once, into the slot
    float fps = t.nominalFrameRate;
    s->fdur = fps > 0 ? 1.0 / fps : 1.0 / 30;
    double d = CMTimeGetSeconds(a.duration);
    s->dur = d > 0 ? d : 0;
    CMFormatDescriptionRef desc = (CMFormatDescriptionRef)t.formatDescriptions.firstObject;
    FourCharCode c = desc ? CMFormatDescriptionGetMediaSubType(desc) : 0;
    char cc[5] = {(char)(c >> 24), (char)(c >> 16), (char)(c >> 8), (char)c, 0};
    snprintf(s->name, sizeof s->name, "%s (avfoundation)", c ? cc : "video");
    [t release];
    if (!s->out || ![s->reader canAddOutput:s->out]) { fprintf(stderr, "video: cannot read %s: %s\n", path, err ? err.localizedDescription.UTF8String : "no output"); src_close(s); return nullptr; }
    [s->reader addOutput:s->out];
    if (![s->reader startReading]) { fprintf(stderr, "video: cannot read %s: %s\n", path, s->reader.error.localizedDescription.UTF8String); src_close(s); return nullptr; }
    return s;
  }
}

static Held* held_new() { return nullptr; }
static void held_free(Held*&) {}
static void held_unref(Held*) {}
static bool held_any(const Held*) { return false; }
static bool held_picture(const Held*, int, HalPicture*) { return false; }
static bool held_convert(Player*, Held*, int, uint32_t*) { return false; }

/** A BGRA picture (w x h, `bpr` bytes a row) into the player's box: the nearest sample, a row copy at 1:1. BGRA in memory is
 *  0xAARRGGBB as a little-endian word: the alpha byte goes, runtime images are 0x00RRGGBB. */
static bool to_box(Player* p, Conv* c, const uint8_t* src, size_t bpr, int w, int h, uint32_t* px) {
  if (c->w != w || c->h != h || !c->lx) {
    conv_free(c);
    c->w = w; c->h = h;
    fit(p, w, h, c->box);
    if (!(c->lx = (int*)malloc(sizeof(int) * (c->box[2] + c->box[3])))) return false;
    c->ly = c->lx + c->box[2];
    for (int i = 0; i < c->box[2]; i++) c->lx[i] = (int)(((int64_t)i * 2 + 1) * w / (2 * c->box[2]));
    for (int j = 0; j < c->box[3]; j++) c->ly[j] = (int)(((int64_t)j * 2 + 1) * h / (2 * c->box[3]));
  }
  bars(p, px, c->box);
  const bool same = c->box[2] == w;
  for (int j = 0; j < c->box[3]; j++) {
    const uint32_t* row = (const uint32_t*)(src + (size_t)c->ly[j] * bpr);
    uint32_t* o = px + (size_t)(c->box[1] + j) * p->w + c->box[0];
    if (same) for (int i = 0; i < w; i++) o[i] = row[i] & 0xFFFFFF;
    else for (int i = 0; i < c->box[2]; i++) o[i] = row[c->lx[i]] & 0xFFFFFF;
  }
  return true;
}

static int src_step(Player* p, SourceBase* b, uint32_t gen, double base, int loop) {
  Source* s = static_cast<Source*>(b);
  for (;;) @autoreleasepool {
    CMSampleBufferRef sb = [s->out copyNextSampleBuffer];
    if (!sb) {   // the end of the file, or a reader that failed
      if (s->reader.status == AVAssetReaderStatusFailed) fprintf(stderr, "video: %s\n", s->reader.error.localizedDescription.UTF8String);
      return 0;
    }
    CVImageBufferRef ib = CMSampleBufferGetImageBuffer(sb);
    if (!ib) { CFRelease(sb); continue; }   // a sample without a picture
    double t = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb));
    if (s->start < 0) s->start = t;
    double pos = t - s->start;
    if (!(pos >= 0)) pos = 0;
    const double fd = s->fdur;
    if (pos + fd > s->end) s->end = pos + fd;
    const int k = slot_take(p, gen);
    if (k >= 0) {
      const uint64_t c0 = vlog ? hal_time_us() : 0;
      Slot& sl = p->slot[k];
      sl.has_px = true;
      bool ok = CVPixelBufferLockBaseAddress(ib, kCVPixelBufferLock_ReadOnly) == kCVReturnSuccess;
      if (ok) {
        ok = CVPixelBufferGetPixelFormatType(ib) == kCVPixelFormatType_32BGRA &&
             to_box(p, &s->cv, (const uint8_t*)CVPixelBufferGetBaseAddress(ib), CVPixelBufferGetBytesPerRow(ib), (int)CVPixelBufferGetWidth(ib), (int)CVPixelBufferGetHeight(ib), sl.px);
        CVPixelBufferUnlockBaseAddress(ib, kCVPixelBufferLock_ReadOnly);
      }
      if (vlog) fprintf(stderr, "video: p%d converted pos %.4f in %.2f ms (%s)\n", (int)(p - players), pos, (hal_time_us() - c0) / 1e3, s->name);
      slot_commit(p, s, k, ok, gen, base, pos, fd, loop);
    }
    CFRelease(sb);
    return 1;
  }
}
