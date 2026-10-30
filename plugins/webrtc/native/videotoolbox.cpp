// zinc:webrtc on macOS: H.264 constrained baseline in hardware through VideoToolbox (media.h). Apple ships the codec with the system, so
// there is no library and no licence fee. The encoder takes BGRX frames as they come from zinc:camera and gives 4-byte length-prefixed
// NAL units (SPS and PPS first on a key frame); the decoder takes Annex B and gives BGRX. Both are synchronous: the worker thread of a
// transceiver waits for its frame.
#include "media.h"
#include <CoreFoundation/CoreFoundation.h>
#include <CoreMedia/CoreMedia.h>
#include <CoreVideo/CoreVideo.h>
#include <VideoToolbox/VideoToolbox.h>
#include <stdlib.h>
#include <string.h>
#include <algorithm>

namespace media {
namespace {
void put32(std::vector<uint8_t>& o, size_t n) { for (int s = 24; s >= 0; s -= 8) o.push_back((uint8_t)(n >> s)); }
CFNumberRef num(int32_t v) { return CFNumberCreate(nullptr, kCFNumberSInt32Type, &v); }
void setNum(VTSessionRef s, CFStringRef key, int32_t v) { CFNumberRef n = num(v); VTSessionSetProperty(s, key, n); CFRelease(n); }

struct VtEnc : VideoEncoder {
  VTCompressionSessionRef s = nullptr;
  std::vector<uint8_t>* out = nullptr;
  bool key = false, failed = false;
  std::vector<uint8_t> u, v;   // the chroma planes of a frame, before they are interleaved
  static void done(void* ref, void*, OSStatus st, VTEncodeInfoFlags, CMSampleBufferRef sb) {
    VtEnc* e = (VtEnc*)ref;
    if (st != noErr || !sb || !e->out) { e->failed = true; return; }
    bool key = true;
    CFArrayRef att = CMSampleBufferGetSampleAttachmentsArray(sb, false);
    if (att && CFArrayGetCount(att) > 0) {
      CFBooleanRef notSync = nullptr;
      if (CFDictionaryGetValueIfPresent((CFDictionaryRef)CFArrayGetValueAtIndex(att, 0), kCMSampleAttachmentKey_NotSync, (const void**)&notSync) && notSync)
        key = !CFBooleanGetValue(notSync);
    }
    e->key = key;
    std::vector<uint8_t>& o = *e->out;
    if (key) {
      CMFormatDescriptionRef f = CMSampleBufferGetFormatDescription(sb);
      size_t count = 0;
      CMVideoFormatDescriptionGetH264ParameterSetAtIndex(f, 0, nullptr, nullptr, &count, nullptr);
      for (size_t i = 0; i < count; i++) {
        const uint8_t* p = nullptr;
        size_t n = 0;
        if (CMVideoFormatDescriptionGetH264ParameterSetAtIndex(f, i, &p, &n, nullptr, nullptr) == noErr) { put32(o, n); o.insert(o.end(), p, p + n); }
      }
    }
    CMBlockBufferRef bb = CMSampleBufferGetDataBuffer(sb);
    const size_t len = CMBlockBufferGetDataLength(bb), at = o.size();
    o.resize(at + len);
    CMBlockBufferCopyDataBytes(bb, 0, len, o.data() + at);   // AVCC: 4-byte lengths, VideoToolbox's default
  }
  VtEnc(int w_, int h_, int bps, int fps) {
    w = w_; h = h_;
    CFMutableDictionaryRef spec = CFDictionaryCreateMutable(nullptr, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
#if !TARGET_OS_IPHONE   // iOS encodes on the hardware anyway, and the key is iOS 17.4's (the app runs from 16.3)
    CFDictionarySetValue(spec, kVTVideoEncoderSpecification_EnableHardwareAcceleratedVideoEncoder, kCFBooleanTrue);
#endif
    CFMutableDictionaryRef src = CFDictionaryCreateMutable(nullptr, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFNumberRef pf = num(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange), cw = num(w), ch = num(h);
    CFDictionarySetValue(src, kCVPixelBufferPixelFormatTypeKey, pf);
    CFDictionarySetValue(src, kCVPixelBufferWidthKey, cw);
    CFDictionarySetValue(src, kCVPixelBufferHeightKey, ch);
    const OSStatus st = VTCompressionSessionCreate(nullptr, w, h, kCMVideoCodecType_H264, spec, src, nullptr, done, this, &s);
    CFRelease(pf); CFRelease(cw); CFRelease(ch); CFRelease(spec); CFRelease(src);
    if (st != noErr) { s = nullptr; return; }
    VTSessionSetProperty(s, kVTCompressionPropertyKey_RealTime, kCFBooleanTrue);
    VTSessionSetProperty(s, kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse);
    // BT.601, as the VP8 path (media.cpp) and the browsers without colour information take it, written in the stream's VUI so a decoder
    // converts back with the same matrix (without it the colours drift by up to 20 levels)
    VTSessionSetProperty(s, kVTCompressionPropertyKey_YCbCrMatrix, kCVImageBufferYCbCrMatrix_ITU_R_601_4);
    VTSessionSetProperty(s, kVTCompressionPropertyKey_ColorPrimaries, kCVImageBufferColorPrimaries_SMPTE_C);
    VTSessionSetProperty(s, kVTCompressionPropertyKey_TransferFunction, kCVImageBufferTransferFunction_ITU_R_709_2);
    if (__builtin_available(macOS 12.0, *)) VTSessionSetProperty(s, kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_ConstrainedBaseline_AutoLevel);
    else VTSessionSetProperty(s, kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Baseline_AutoLevel);
    setNum(s, kVTCompressionPropertyKey_MaxKeyFrameInterval, fps > 0 ? fps * 10 : 300);
    setNum(s, kVTCompressionPropertyKey_ExpectedFrameRate, fps > 0 ? fps : 30);
    setNum(s, kVTCompressionPropertyKey_AverageBitRate, bps);
    VTCompressionSessionPrepareToEncodeFrames(s);
  }
  ~VtEnc() override {
    if (!s) return;
    VTCompressionSessionInvalidate(s);
    CFRelease(s);
  }
  bool encode(const uint32_t* px, int, int, int64_t ms, bool forceKey, std::vector<uint8_t>& o, bool& isKey) override {
    o.clear(); isKey = false;
    if (!s) return false;
    CVPixelBufferRef pb = nullptr;
    CVPixelBufferPoolRef pool = VTCompressionSessionGetPixelBufferPool(s);
    if (!pool || CVPixelBufferPoolCreatePixelBuffer(nullptr, pool, &pb) != kCVReturnSuccess) return false;
    // NV12 converted here (BT.601, media.cpp's conversion): VideoToolbox's own BGRA conversion and the decoder's do not agree on a matrix
    CVPixelBufferLockBaseAddress(pb, 0);
    const int cw = (w + 1) / 2, chh = (h + 1) / 2;
    u.resize((size_t)cw * chh); v.resize((size_t)cw * chh);
    uint8_t* yp = (uint8_t*)CVPixelBufferGetBaseAddressOfPlane(pb, 0);
    uint8_t* uv = (uint8_t*)CVPixelBufferGetBaseAddressOfPlane(pb, 1);
    const int ys = (int)CVPixelBufferGetBytesPerRowOfPlane(pb, 0), uvs = (int)CVPixelBufferGetBytesPerRowOfPlane(pb, 1);
    toI420(px, w, h, w, yp, ys, u.data(), cw, v.data(), cw);
    for (int r = 0; r < chh; r++)
      for (int c = 0; c < cw; c++) { uv[r * uvs + c * 2] = u[(size_t)r * cw + c]; uv[r * uvs + c * 2 + 1] = v[(size_t)r * cw + c]; }
    CVPixelBufferUnlockBaseAddress(pb, 0);
    CFDictionaryRef props = nullptr;
    if (forceKey) {
      const void* k[1] = {kVTEncodeFrameOptionKey_ForceKeyFrame};
      const void* v[1] = {kCFBooleanTrue};
      props = CFDictionaryCreate(nullptr, k, v, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    }
    out = &o; failed = false; key = false;
    VTCompressionSessionEncodeFrame(s, pb, CMTimeMake(ms, 1000), kCMTimeInvalid, props, nullptr, nullptr);
    VTCompressionSessionCompleteFrames(s, kCMTimeInvalid);
    out = nullptr;
    if (props) CFRelease(props);
    CVPixelBufferRelease(pb);
    isKey = key;
    return !failed && !o.empty();
  }
  void setRate(int bps, int) override { if (s) setNum(s, kVTCompressionPropertyKey_AverageBitRate, bps); }
};

struct VtDec : VideoDecoder {
  VTDecompressionSessionRef s = nullptr;
  CMVideoFormatDescriptionRef fmt = nullptr;
  std::vector<uint8_t> sps, pps, u, v;
  std::vector<uint32_t>* out = nullptr;
  int ow = 0, oh = 0, fitW = 0, fitH = 0;
  bool got = false, refit = false;
  static void done(void* ref, void*, OSStatus st, VTDecodeInfoFlags, CVImageBufferRef img, CMTime, CMTime) {
    VtDec* d = (VtDec*)ref;
    if (st != noErr || !img || !d->out) return;
    CVPixelBufferLockBaseAddress(img, kCVPixelBufferLock_ReadOnly);
    const int w = (int)CVPixelBufferGetWidth(img), h = (int)CVPixelBufferGetHeight(img), cw = (w + 1) / 2, chh = (h + 1) / 2;
    const uint8_t* yp = (const uint8_t*)CVPixelBufferGetBaseAddressOfPlane(img, 0);
    const uint8_t* uv = (const uint8_t*)CVPixelBufferGetBaseAddressOfPlane(img, 1);
    const int ys = (int)CVPixelBufferGetBytesPerRowOfPlane(img, 0), uvs = (int)CVPixelBufferGetBytesPerRowOfPlane(img, 1);
    d->u.resize((size_t)cw * chh); d->v.resize((size_t)cw * chh);
    for (int r = 0; r < chh; r++)
      for (int c = 0; c < cw; c++) { d->u[(size_t)r * cw + c] = uv[r * uvs + c * 2]; d->v[(size_t)r * cw + c] = uv[r * uvs + c * 2 + 1]; }
    d->out->resize((size_t)w * h);
    fromI420(yp, ys, d->u.data(), cw, d->v.data(), cw, w, h, d->out->data());
    CVPixelBufferUnlockBaseAddress(img, kCVPixelBufferLock_ReadOnly);
    d->ow = w; d->oh = h; d->got = true;
  }
  void reset() {
    if (s) { VTDecompressionSessionInvalidate(s); CFRelease(s); s = nullptr; }
    if (fmt) { CFRelease(fmt); fmt = nullptr; }
  }
  bool open() {
    reset();
    const uint8_t* sets[2] = {sps.data(), pps.data()};
    const size_t sizes[2] = {sps.size(), pps.size()};
    if (CMVideoFormatDescriptionCreateFromH264ParameterSets(nullptr, 2, sets, sizes, 4, &fmt) != noErr) { fmt = nullptr; return false; }
    CFMutableDictionaryRef dst = CFDictionaryCreateMutable(nullptr, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFNumberRef pf = num(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange);
    CFDictionarySetValue(dst, kCVPixelBufferPixelFormatTypeKey, pf);
    const CMVideoDimensions d = CMVideoFormatDescriptionGetDimensions(fmt);
    if (fitW > 0 && fitH > 0 && (d.width > fitW || d.height > fitH)) {   // scaled by the decoder: no full-size frame is converted
      const double k = std::min((double)fitW / d.width, (double)fitH / d.height);
      CFNumberRef sw = num(std::max(2, (int)(d.width * k) & ~1)), sh = num(std::max(2, (int)(d.height * k) & ~1));
      CFDictionarySetValue(dst, kCVPixelBufferWidthKey, sw);
      CFDictionarySetValue(dst, kCVPixelBufferHeightKey, sh);
      CFRelease(sw); CFRelease(sh);
    }
    refit = false;
    VTDecompressionOutputCallbackRecord cb = {done, this};
    const OSStatus st = VTDecompressionSessionCreate(nullptr, fmt, nullptr, dst, &cb, &s);
    CFRelease(pf); CFRelease(dst);
    if (st != noErr) { s = nullptr; return false; }
    return true;
  }
  ~VtDec() override { reset(); }
  void fit(int w, int h) override { if (w != fitW || h != fitH) { fitW = w; fitH = h; refit = true; } }
  bool decode(const uint8_t* data, size_t n, std::vector<uint32_t>& px, int& w, int& h) override {
    // Annex B -> NAL units: parameter sets (re)open the session, the rest becomes one AVCC sample
    std::vector<uint8_t> avcc, nsps, npps;
    size_t i = 0;
    auto startAt = [&](size_t k) { return k + 3 <= n && data[k] == 0 && data[k + 1] == 0 && data[k + 2] == 1; };
    while (i < n && !startAt(i)) i++;
    while (i < n) {
      const size_t b = i + 3;
      size_t e = b;
      while (e < n && !startAt(e)) e++;
      size_t end = e;
      while (end > b && data[end - 1] == 0) end--;   // the zero of a 4-byte start code
      if (end > b) {
        const int t = data[b] & 0x1F;
        if (t == 7) nsps.assign(data + b, data + end);
        else if (t == 8) npps.assign(data + b, data + end);
        else if (t == 1 || t == 5) { put32(avcc, end - b); avcc.insert(avcc.end(), data + b, data + end); }
      }
      i = e;
    }
    if (!nsps.empty() && !npps.empty() && (nsps != sps || npps != pps || !s || refit)) { sps = nsps; pps = npps; if (!open()) return false; }
    if (!s || avcc.empty()) return false;
    CMBlockBufferRef bb = nullptr;
    CMSampleBufferRef sb = nullptr;
    if (CMBlockBufferCreateWithMemoryBlock(nullptr, nullptr, avcc.size(), kCFAllocatorDefault, nullptr, 0, avcc.size(), 0, &bb) != noErr) return false;
    CMBlockBufferReplaceDataBytes(avcc.data(), bb, 0, avcc.size());
    const size_t size = avcc.size();
    if (CMSampleBufferCreateReady(nullptr, bb, fmt, 1, 0, nullptr, 1, &size, &sb) != noErr) { CFRelease(bb); return false; }
    out = &px; got = false;
    VTDecompressionSessionDecodeFrame(s, sb, 0, nullptr, nullptr);
    VTDecompressionSessionWaitForAsynchronousFrames(s);
    out = nullptr;
    CFRelease(sb); CFRelease(bb);
    if (got) { w = ow; h = oh; }
    return got;
  }
};
}  // namespace

bool h264Available() {
  static int known = -1;   // ponytail: decided once on the first call (a worker or the program's thread; same answer either way)
  if (known < 0) {
    const char* off = getenv("ZINC_WEBRTC_H264");
    known = off && !strcmp(off, "0") ? 0 : VTIsHardwareDecodeSupported(kCMVideoCodecType_H264) ? 1 : 0;
  }
  return known == 1;
}
VideoEncoder* h264Encoder(int w, int h, int bps, int fps) {
  VtEnc* e = new VtEnc(w, h, bps, fps);
  if (!e->s) { delete e; return nullptr; }
  return e;
}
VideoDecoder* h264Decoder() { return new VtDec(); }

}  // namespace media
