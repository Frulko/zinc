// zinc:video on Android: the MediaCodec backend of player.h (NDK, API 24). See docs/plugins/video.md.
//
// The worker demuxes with AMediaExtractor (the file opened here, handed over as a descriptor) and decodes with AMediaCodec, the device's
// own decoder (hardware when it has one). The decoder renders into an AImageReader of YUV_420_888: the layout every decoder must give
// there (CTS checks it), with its planes' strides, so no vendor colour format, stride or slice height is guessed. When the decoder cannot
// render to the reader, it hands its pictures in ByteBuffers instead (planar or semi-planar, the stride and slice height of the output
// format). Each picture is scaled to the player's size and converted to 0x00RRGGBB here, as on webOS. Audio is not played (as elsewhere).
#include "zinc_native_video.h"
#include "zrt_raster.h"
#include <dlfcn.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
#include <android/native_window.h>
#include <media/NdkImage.h>
#include <media/NdkImageReader.h>
#include <media/NdkMediaCodec.h>
#include <media/NdkMediaExtractor.h>
#if __has_include("zn/resource_stats.h")
#include "zn/resource_stats.h"
#endif

struct Held {};
// The scale to the player's box, kept from picture to picture: where each output column and row reads in the visible picture.
struct Conv { int w, h, box[4]; int *lx, *ly; };
#include "player.h"

// ---------------------------------------------------------------- YUV 4:2:0 to the player's image
/** One picture's planes: the visible part is w x h from (x, y0); chroma samples are `cp` bytes apart (1 planar, 2 semi-planar). */
struct Yuv {
  const uint8_t *y, *u, *v;
  int ys, cs, cp;   // the row strides of the luma and of the chroma, the chroma's pixel stride
  int x, y0, w, h;
  bool full;        // full range (else limited, 16..235)
};
static void conv_free(Conv* c) { free(c->lx); *c = Conv{}; }
static bool conv_prepare(Player* p, Conv* c, int w, int h) {
  conv_free(c);
  c->w = w; c->h = h;
  fit(p, w, h, c->box);
  c->lx = (int*)malloc(sizeof(int) * (c->box[2] + c->box[3]));
  if (!c->lx) return false;
  c->ly = c->lx + c->box[2];
  for (int i = 0; i < c->box[2]; i++) c->lx[i] = (int)(((int64_t)i * 2 + 1) * w / (2 * c->box[2]));
  for (int j = 0; j < c->box[3]; j++) c->ly[j] = (int)(((int64_t)j * 2 + 1) * h / (2 * c->box[3]));
  return true;
}
static inline uint32_t clamp8(int v) { return v < 0 ? 0 : v > 255 ? 255 : (uint32_t)v; }
/** The picture into `px`: bars, then the box. BT.601, or BT.709 from 720 lines up (the webOS backend's rule), 16.16 fixed point.
 *  ponytail: the nearest sample, as on webOS; a filter when a downscale shows its aliasing. */
static bool yuv_convert(Player* p, Conv* c, const Yuv& f, uint32_t* px) {
  if (f.w < 2 || f.h < 2) return false;
  if ((c->w != f.w || c->h != f.h || !c->lx) && !conv_prepare(p, c, f.w, f.h)) return false;
  bars(p, px, c->box);
  const bool hd = f.h >= 720;
  const int ky = f.full ? 65536 : 76309, oy = f.full ? 0 : 16;   // limited range: the luma times 255/219, the chroma times 255/224
  const int rv = f.full ? (hd ? 103206 : 91881) : (hd ? 117489 : 104597), gu = f.full ? (hd ? 12276 : 22553) : (hd ? 13975 : 25675),
            gv = f.full ? (hd ? 30679 : 46802) : (hd ? 34925 : 53279), bu = f.full ? (hd ? 121609 : 116130) : (hd ? 138438 : 132201);
  for (int j = 0; j < c->box[3]; j++) {
    const int sy = f.y0 + c->ly[j], sc = sy / 2;
    const uint8_t *yr = f.y + (size_t)sy * f.ys, *ur = f.u + (size_t)sc * f.cs, *vr = f.v + (size_t)sc * f.cs;
    uint32_t* out = px + (size_t)(c->box[1] + j) * p->w + c->box[0];
    for (int i = 0; i < c->box[2]; i++) {
      const int sx = f.x + c->lx[i], cx = (sx / 2) * f.cp;
      const int Y = (yr[sx] - oy) * ky, U = ur[cx] - 128, V = vr[cx] - 128;
      out[i] = clamp8((Y + rv * V + 32768) >> 16) << 16 | clamp8((Y - gu * U - gv * V + 32768) >> 16) << 8 | clamp8((Y + bu * U + 32768) >> 16);
    }
  }
  return true;
}

// ---------------------------------------------------------------- one opened file
enum { COLOR_YUV420_PLANAR = 19, COLOR_YUV420_SEMIPLANAR = 21, COLOR_QCOM_NV12_32M = 0x7FA30C04 };
struct Source : SourceBase {
  int fd;
  AMediaExtractor* ex;
  AMediaCodec* dec;
  AImageReader* reader;   // null: the decoder hands ByteBuffers
  bool in_done, out_done;
  int64_t start;          // the first picture's timestamp (us)
  double fdur;
  int color, bw, bh, stride, slice, crop[4];   // the ByteBuffers' layout (output format)
  bool full;
  Conv cv;
};
static bool force_buffers;   // ZINC_VIDEO_BYTEBUFFER=1: ByteBuffers even when the reader works (the fallback, to compare)

static void backend_init() { force_buffers = getenv("ZINC_VIDEO_BYTEBUFFER") != nullptr; }

/** The extractor over `path` with its first video track selected; its format in *fmt (owned by the caller). */
static AMediaExtractor* open_track(const char* path, int* fd, AMediaFormat** fmt) {
  *fd = open(path, O_RDONLY | O_CLOEXEC);
  struct stat st;
  if (*fd < 0 || fstat(*fd, &st) != 0) { if (*fd >= 0) close(*fd); *fd = -1; return nullptr; }
  AMediaExtractor* ex = AMediaExtractor_new();
  if (ex && AMediaExtractor_setDataSourceFd(ex, *fd, 0, st.st_size) == AMEDIA_OK) {
    for (size_t i = 0, n = AMediaExtractor_getTrackCount(ex); i < n; i++) {
      AMediaFormat* f = AMediaExtractor_getTrackFormat(ex, i);
      const char* mime = nullptr;
      if (f && AMediaFormat_getString(f, AMEDIAFORMAT_KEY_MIME, &mime) && mime && !strncmp(mime, "video/", 6) && AMediaExtractor_selectTrack(ex, i) == AMEDIA_OK) { *fmt = f; return ex; }
      if (f) AMediaFormat_delete(f);
    }
  }
  if (ex) AMediaExtractor_delete(ex);
  close(*fd); *fd = -1;
  return nullptr;
}
static bool src_probe(const char* path, int* w, int* h) {
  int fd; AMediaFormat* f = nullptr;
  AMediaExtractor* ex = open_track(path, &fd, &f);
  if (!ex) return false;
  int32_t fw = 0, fh = 0;
  AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_WIDTH, &fw);
  AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_HEIGHT, &fh);
  if (w) { *w = fw; *h = fh; }
  AMediaFormat_delete(f);
  AMediaExtractor_delete(ex);
  close(fd);
  return fw > 0 && fh > 0;
}
static void src_close(SourceBase* b) {
  Source* s = static_cast<Source*>(b);
  if (!s) return;
  if (s->dec) { AMediaCodec_stop(s->dec); AMediaCodec_delete(s->dec); }
  if (s->reader) AImageReader_delete(s->reader);
  if (s->ex) AMediaExtractor_delete(s->ex);
  if (s->fd >= 0) close(s->fd);
  conv_free(&s->cv);
  free(s);
}
/** The decoder's name (API 28: "c2.goldfish.h264.decoder", "OMX.Nvidia.h264.decode"), else the format's. */
static void name_of(Source* s, const char* mime) {
  using GetName = media_status_t (*)(AMediaCodec*, char**);
  using FreeName = void (*)(AMediaCodec*, char*);
  static GetName get = (GetName)dlsym(RTLD_DEFAULT, "AMediaCodec_getName");
  static FreeName rel = (FreeName)dlsym(RTLD_DEFAULT, "AMediaCodec_releaseName");
  char* n = nullptr;
  if (get && rel && get(s->dec, &n) == AMEDIA_OK && n) { snprintf(s->name, sizeof s->name, "%s (%s)", n, s->reader ? "mediacodec" : "mediacodec, buffers"); rel(s->dec, n); }
  else snprintf(s->name, sizeof s->name, "%s (%s)", mime + 6, s->reader ? "mediacodec" : "mediacodec, buffers");
}
static SourceBase* src_open(const char* path, int item) {
  Source* s = (Source*)calloc(1, sizeof(Source));
  AMediaFormat* f = nullptr;
  s->item = item;
  s->ex = open_track(path, &s->fd, &f);
  const char* mime = nullptr;
  if (!s->ex || !AMediaFormat_getString(f, AMEDIAFORMAT_KEY_MIME, &mime) || !(s->dec = AMediaCodec_createDecoderByType(mime))) {
    if (f) AMediaFormat_delete(f);
    src_close(s);
    return nullptr;
  }
  int32_t w = 0, h = 0, fps = 0;
  int64_t dur = 0;
  AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_WIDTH, &w);
  AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_HEIGHT, &h);
  if (AMediaFormat_getInt64(f, AMEDIAFORMAT_KEY_DURATION, &dur) && dur > 0) s->dur = dur / 1e6;
  s->fdur = AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_FRAME_RATE, &fps) && fps > 0 ? 1.0 / fps : 1.0 / 30;
  s->start = -1;
  s->bw = w; s->bh = h; s->stride = w; s->slice = h; s->crop[2] = w - 1; s->crop[3] = h - 1;
  // the reader first: three images, one decoded into while one is converted
  ANativeWindow* win = nullptr;
  bool ok = false;
  if (!force_buffers && w > 0 && h > 0 && AImageReader_new(w, h, AIMAGE_FORMAT_YUV_420_888, 3, &s->reader) == AMEDIA_OK && AImageReader_getWindow(s->reader, &win) == AMEDIA_OK)
    ok = AMediaCodec_configure(s->dec, f, win, nullptr, 0) == AMEDIA_OK && AMediaCodec_start(s->dec) == AMEDIA_OK;
  if (!ok) {
    if (s->reader) {   // a decoder that refused the reader's window: a fresh one for buffers
      AImageReader_delete(s->reader); s->reader = nullptr;
      AMediaCodec_delete(s->dec);
      s->dec = AMediaCodec_createDecoderByType(mime);
    }
    ok = s->dec && AMediaCodec_configure(s->dec, f, nullptr, nullptr, 0) == AMEDIA_OK && AMediaCodec_start(s->dec) == AMEDIA_OK;
  }
  if (ok) name_of(s, mime);
  else fprintf(stderr, "video: no decoder for %s (%s)\n", path, mime);
  AMediaFormat_delete(f);   // owns `mime`
  if (!ok) { src_close(s); return nullptr; }
  return s;
}

/** The ByteBuffers' layout from the decoder's output format. A slice height of 0 or below the height means the height (seen on old
 *  devices), a stride of 0 the width. */
static void read_format(Source* s) {
  AMediaFormat* f = AMediaCodec_getOutputFormat(s->dec);
  if (!f) return;
  int32_t v = 0, l = 0, t = 0, r = 0, b = 0;
  if (AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_WIDTH, &v) && v > 0) s->bw = v;
  if (AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_HEIGHT, &v) && v > 0) s->bh = v;
  s->stride = AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_STRIDE, &v) && v >= s->bw ? v : s->bw;
  s->slice = AMediaFormat_getInt32(f, "slice-height", &v) && v >= s->bh ? v : s->bh;
  if (AMediaFormat_getInt32(f, AMEDIAFORMAT_KEY_COLOR_FORMAT, &v)) s->color = v;
  s->full = AMediaFormat_getInt32(f, "color-range", &v) && v == 1;   // MediaFormat.COLOR_RANGE_FULL
  if (AMediaFormat_getInt32(f, "crop-left", &l) && AMediaFormat_getInt32(f, "crop-top", &t) && AMediaFormat_getInt32(f, "crop-right", &r) &&
      AMediaFormat_getInt32(f, "crop-bottom", &b) && l >= 0 && t >= 0 && r > l && b > t && r < s->bw && b < s->bh) { s->crop[0] = l; s->crop[1] = t; s->crop[2] = r; s->crop[3] = b; }
  else { s->crop[0] = s->crop[1] = 0; s->crop[2] = s->bw - 1; s->crop[3] = s->bh - 1; }
  if (vlog) fprintf(stderr, "video: output %dx%d stride %d slice %d colour 0x%x crop %d,%d-%d,%d%s\n", s->bw, s->bh, s->stride, s->slice, s->color, s->crop[0], s->crop[1], s->crop[2], s->crop[3], s->full ? " full range" : "");
  AMediaFormat_delete(f);
}
/** A ByteBuffer picture into the slot. Planar (I420) and semi-planar (NV12, Qualcomm's NV12 aligned to 32 MB) layouts; another vendor
 *  layout (Qualcomm's tiles) is refused once in the log. */
static bool from_buffer(Player* p, Source* s, const uint8_t* d, size_t n, uint32_t* px) {
  const size_t luma = (size_t)s->stride * s->slice;
  Yuv y{d, nullptr, nullptr, s->stride, 0, 0, s->crop[0], s->crop[1], s->crop[2] - s->crop[0] + 1, s->crop[3] - s->crop[1] + 1, s->full};
  if (s->color == COLOR_YUV420_PLANAR) { y.u = d + luma; y.v = y.u + luma / 4; y.cs = s->stride / 2; y.cp = 1; if (n < luma * 3 / 2) return false; }
  else if (s->color == COLOR_YUV420_SEMIPLANAR || s->color == COLOR_QCOM_NV12_32M) { y.u = d + luma; y.v = y.u + 1; y.cs = s->stride; y.cp = 2; if (n < luma + luma / 2 - 1) return false; }
  else { static bool said; if (!said) fprintf(stderr, "video: the decoder's colour format 0x%x is not read\n", s->color); said = true; return false; }
  return yuv_convert(p, &s->cv, y, px);
}
/** The reader's picture (YUV_420_888: three planes with their strides) into the slot; waits for it after the render (at most 0.25 s).
 *  The latest: one that came after its wait is dropped, never shown a picture late. */
static bool from_reader(Player* p, Source* s, uint32_t* px) {
  AImage* img = nullptr;
  for (int i = 0; i < 250 && AImageReader_acquireLatestImage(s->reader, &img) == AMEDIA_IMGREADER_NO_BUFFER_AVAILABLE; i++) usleep(1000);  // ponytail: a poll; the listener and a condition if it shows
  if (!img) return false;
  uint8_t* pl[3] = {};
  int len[3], rs[3], ps[3];
  AImageCropRect r{};
  int32_t w = 0, h = 0;
  bool ok = AImage_getWidth(img, &w) == AMEDIA_OK && AImage_getHeight(img, &h) == AMEDIA_OK;
  for (int i = 0; ok && i < 3; i++) ok = AImage_getPlaneData(img, i, &pl[i], &len[i]) == AMEDIA_OK && AImage_getPlaneRowStride(img, i, &rs[i]) == AMEDIA_OK && AImage_getPlanePixelStride(img, i, &ps[i]) == AMEDIA_OK;
  if (ok && (AImage_getCropRect(img, &r) != AMEDIA_OK || r.right <= r.left || r.bottom <= r.top || r.right > w || r.bottom > h)) r = {0, 0, w, h};
  ok = ok && rs[1] == rs[2] && ps[1] == ps[2] && ps[0] == 1;
  if (ok) ok = yuv_convert(p, &s->cv, Yuv{pl[0], pl[1], pl[2], rs[0], rs[1], ps[1], r.left, r.top, r.right - r.left, r.bottom - r.top, s->full}, px);
  AImage_delete(img);
  return ok;
}

static Held* held_new() { return nullptr; }
static void held_free(Held*&) {}
static void held_unref(Held*) {}
static bool held_any(const Held*) { return false; }
static bool held_picture(const Held*, int, HalPicture*) { return false; }
static bool held_convert(Player*, Held*, int, uint32_t*) { return false; }

/** Feeds the decoder what it takes now; one sample at a time, the end of the stream once. */
static void feed(Source* s) {
  while (!s->in_done) {
    const ssize_t i = AMediaCodec_dequeueInputBuffer(s->dec, 0);
    if (i < 0) return;
    size_t cap = 0;
    uint8_t* buf = AMediaCodec_getInputBuffer(s->dec, i, &cap);
    const ssize_t n = buf ? AMediaExtractor_readSampleData(s->ex, buf, cap) : -1;
    if (n < 0) { AMediaCodec_queueInputBuffer(s->dec, i, 0, 0, 0, AMEDIACODEC_BUFFER_FLAG_END_OF_STREAM); s->in_done = true; return; }
    AMediaCodec_queueInputBuffer(s->dec, i, 0, n, AMediaExtractor_getSampleTime(s->ex), 0);
    AMediaExtractor_advance(s->ex);
  }
}
static int src_step(Player* p, SourceBase* b, uint32_t gen, double base, int loop) {
  Source* s = static_cast<Source*>(b);
  for (int idle = 0; !s->out_done;) {
    feed(s);
    AMediaCodecBufferInfo info;
    const ssize_t o = AMediaCodec_dequeueOutputBuffer(s->dec, &info, 10000);
    if (o == AMEDIACODEC_INFO_OUTPUT_FORMAT_CHANGED) { read_format(s); continue; }
    if (o == AMEDIACODEC_INFO_OUTPUT_BUFFERS_CHANGED) continue;
    if (o == AMEDIACODEC_INFO_TRY_AGAIN_LATER) { if (++idle > 300) return 0; continue; }   // 3 s with nothing out: a stuck decoder ends the file
    if (o < 0) return 0;                                                                    // a decoder error
    const bool eos = info.flags & AMEDIACODEC_BUFFER_FLAG_END_OF_STREAM;
    if (eos) s->out_done = true;
    if ((info.flags & AMEDIACODEC_BUFFER_FLAG_CODEC_CONFIG) || (eos && info.size <= 0)) {
      AMediaCodec_releaseOutputBuffer(s->dec, o, false);
      continue;
    }
    if (s->start < 0) s->start = info.presentationTimeUs;
    double pos = (info.presentationTimeUs - s->start) / 1e6;
    if (pos < 0) pos = 0;
    if (pos + s->fdur > s->end) s->end = pos + s->fdur;
    const int k = slot_take(p, gen);
    if (k < 0) { AMediaCodec_releaseOutputBuffer(s->dec, o, false); return 1; }
    const uint64_t c0 = vlog ? hal_time_us() : 0;
    Slot& sl = p->slot[k];
    sl.has_px = true;
    bool ok;
    if (s->reader) ok = AMediaCodec_releaseOutputBuffer(s->dec, o, true) == AMEDIA_OK && from_reader(p, s, sl.px);
    else {
      size_t n = 0;
      const uint8_t* d = AMediaCodec_getOutputBuffer(s->dec, o, &n);
      ok = d && info.offset >= 0 && (size_t)info.offset < n && from_buffer(p, s, d + info.offset, n - info.offset, sl.px);
      AMediaCodec_releaseOutputBuffer(s->dec, o, false);
    }
    if (vlog) fprintf(stderr, "video: p%d converted pos %.4f in %.2f ms (%s)\n", (int)(p - players), pos, (hal_time_us() - c0) / 1e3, s->name);
    slot_commit(p, s, k, ok, gen, base, pos, s->fdur, loop);
    return 1;
  }
  return 0;
}
