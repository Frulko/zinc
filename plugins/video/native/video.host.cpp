// zinc:video for macos, linux and rpi1 (video.rpi1.cpp includes this file): the FFmpeg backend of player.h. See docs/plugins/video.md.
//
// The worker thread demuxes and decodes with FFmpeg (VideoToolbox on macOS, <codec>_v4l2m2m on Linux when the kernel exposes a V4L2
// mem2mem decoder, software otherwise) and converts each frame to 0x00RRGGBB with swscale directly at the player's size (letterboxed).
//
// Zero copy (ZN-731, Linux): when the display driver has hardware layers (hal.h HalDisplay.layers) a V4L2 decoder is asked for its
// frames as dmabufs (AV_PIX_FMT_DRM_PRIME) and the player's image gets a raster::Picture: the display shows the decoder's buffer on a
// plane of its own and nothing here reads it. A frame that draws the image another way (turned, blended, under a translucent box) asks
// for its pixels: the picture on screen is converted then, and the decode thread converts the following ones as before.
#include "zinc_native_video.h"
#include "zrt_raster.h"
extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libavutil/hwcontext.h>
#include <libswscale/swscale.h>
#if defined(__linux__) && __has_include(<libavutil/hwcontext_drm.h>)
#include <libavutil/hwcontext_drm.h>
#include <libavutil/imgutils.h>
#include <sys/mman.h>
#define ZP_VIDEO_PRIME 1
#endif
}
#if __has_include("zn/resource_stats.h")
#include "zn/resource_stats.h"
#endif

using Held = AVFrame;   // a dmabuf frame a slot keeps for the display
struct Conv { SwsContext* sws; int sw_w, sw_h, sw_fmt, ox, oy, ow, oh; };  // swscale, its input and the letterbox rectangle
#include "player.h"

// ---------------------------------------------------------------- one opened file
struct Source : SourceBase {
  AVFormatContext* fmt; AVCodecContext* dec; AVBufferRef* hw; Conv cv;
  AVPixelFormat hwfmt;
  int stream;
  double tb, fdur;             // time base, nominal frame duration (s)
  int64_t start, last;         // first and last pts
  bool draining;
  bool uncached;               // the decoder's frames lie in device memory mapped without a cache (V4L2): publish copies them first
  bool prime;                  // the decoder is asked for dmabufs (AV_PIX_FMT_DRM_PRIME): the display has hardware layers
  AVPacket* pkt; AVFrame *fr, *sw;   // the packet read, the frame decoded, its copy in memory (hardware or uncached frames)
};

static AVPixelFormat pick_format(AVCodecContext* c, const AVPixelFormat* f) {
  Source* s = (Source*)c->opaque;
  for (const AVPixelFormat* q = f; s->prime && *q != AV_PIX_FMT_NONE; q++) if (*q == AV_PIX_FMT_DRM_PRIME) return *q;
  for (const AVPixelFormat* q = f; *q != AV_PIX_FMT_NONE; q++) if (*q == s->hwfmt) return *q;
  return avcodec_default_get_format(c, f);
}
static bool try_decoder(Source* s, const AVCodec* c, const AVCodecParameters* par, bool hwdev) {
  AVCodecContext* d = avcodec_alloc_context3(c);
  if (!d || avcodec_parameters_to_context(d, par) < 0) { avcodec_free_context(&d); return false; }
  d->opaque = s;
  d->thread_count = 0;  // software: automatic slice/frame threads
  if (s->prime) d->get_format = pick_format;
  if (hwdev) { d->hw_device_ctx = av_buffer_ref(s->hw); d->get_format = pick_format; d->thread_count = 1; }
  if (avcodec_open2(d, c, nullptr) < 0) { avcodec_free_context(&d); return false; }
  s->dec = d;
  return true;
}
static bool open_decoder(Source* s, const AVCodec* sw, const AVCodecParameters* par) {
#if ZP_VIDEO_HWDECODE
#ifdef __APPLE__
  for (int i = 0;; i++) {
    const AVCodecHWConfig* cfg = avcodec_get_hw_config(sw, i);
    if (!cfg) break;
    if ((cfg->methods & AV_CODEC_HW_CONFIG_METHOD_HW_DEVICE_CTX) && cfg->device_type == AV_HWDEVICE_TYPE_VIDEOTOOLBOX) s->hwfmt = cfg->pix_fmt;
  }
  if (s->hwfmt != AV_PIX_FMT_NONE && av_hwdevice_ctx_create(&s->hw, AV_HWDEVICE_TYPE_VIDEOTOOLBOX, nullptr, nullptr, 0) == 0 && try_decoder(s, sw, par, true)) {
    snprintf(s->name, sizeof s->name, "%s (videotoolbox)", sw->name);
    return true;
  }
  s->hwfmt = AV_PIX_FMT_NONE;
  av_buffer_unref(&s->hw);
#else
  // Raspberry Pi (bcm2835-codec), other SoCs with a stateful V4L2 decoder; fails fast without /dev/video*
  char n[48];
  snprintf(n, sizeof n, "%s_v4l2m2m", sw->name);
#ifdef ZP_VIDEO_PRIME
  // ZINC_VIDEO_PRIME=0: the decoder's frames as pixels in memory whatever the display (to compare, or a decoder whose dmabufs fail)
  const char* off = getenv("ZINC_VIDEO_PRIME");
  s->prime = hal_display && hal_display->layers && !(off && *off == '0');
#endif
  if (const AVCodec* m2m = avcodec_find_decoder_by_name(n)) if (try_decoder(s, m2m, par, false)) {
    snprintf(s->name, sizeof s->name, "%s%s", n, s->prime ? " (dmabuf)" : "");
    s->uncached = true;
    return true;
  }
  s->prime = false;
#endif
#endif
  if (!try_decoder(s, sw, par, false)) return false;
  snprintf(s->name, sizeof s->name, "%s (software)", sw->name);
  return true;
}
static void src_close(Source* s) {
  if (!s) return;
  avcodec_free_context(&s->dec);
  avformat_close_input(&s->fmt);
  av_buffer_unref(&s->hw);
  sws_freeContext(s->cv.sws);
  av_packet_free(&s->pkt); av_frame_free(&s->fr); av_frame_free(&s->sw);
  free(s);
}
static void src_close(SourceBase* s) { src_close(static_cast<Source*>(s)); }
static AVFormatContext* open_input(const char* path, int* stream, const AVCodec** codec) {
  AVFormatContext* fmt = nullptr;
  if (avformat_open_input(&fmt, path, nullptr, nullptr) < 0) return nullptr;
  if (avformat_find_stream_info(fmt, nullptr) < 0 || (*stream = av_find_best_stream(fmt, AVMEDIA_TYPE_VIDEO, -1, -1, codec, 0)) < 0 || !*codec) {
    avformat_close_input(&fmt);
    return nullptr;
  }
  return fmt;
}
static bool src_probe(const char* path, int* w, int* h) {
  int st; const AVCodec* codec = nullptr;
  AVFormatContext* fmt = open_input(path, &st, &codec);
  if (!fmt) return false;
  if (w) {
    AVCodecParameters* par = fmt->streams[st]->codecpar;
    AVRational sar = par->sample_aspect_ratio;
    double dw = sar.num > 0 && sar.den > 0 ? par->width * av_q2d(sar) + 0.5 : par->width;
    *w = dw >= 1 && dw <= 8192 ? (int)dw : 0;
    *h = par->height;
  }
  avformat_close_input(&fmt);
  return true;
}
static SourceBase* src_open(const char* path, int item) {
  int st; const AVCodec* codec = nullptr;
  AVFormatContext* fmt = open_input(path, &st, &codec);
  if (!fmt) return nullptr;
  for (unsigned i = 0; i < fmt->nb_streams; i++) if ((int)i != st) fmt->streams[i]->discard = AVDISCARD_ALL;  // ponytail: video only, audio is a follow-up
  Source* s = (Source*)calloc(1, sizeof(Source));
  AVStream* vs = fmt->streams[st];
  s->fmt = fmt; s->stream = st; s->item = item; s->hwfmt = AV_PIX_FMT_NONE; s->cv.sw_fmt = -1;
  s->start = s->last = AV_NOPTS_VALUE;
  s->range = vs->codecpar->color_range;
  s->tb = av_q2d(vs->time_base);
  s->fdur = vs->avg_frame_rate.num > 0 && vs->avg_frame_rate.den > 0 ? av_q2d(av_inv_q(vs->avg_frame_rate)) : 1.0 / 30;
  s->dur = fmt->duration > 0 ? fmt->duration / (double)AV_TIME_BASE : 0;
  s->pkt = av_packet_alloc(); s->fr = av_frame_alloc(); s->sw = av_frame_alloc();
  if (!s->pkt || !s->fr || !s->sw || !open_decoder(s, codec, vs->codecpar)) { src_close(s); return nullptr; }
  return s;
}

/** Frame -> 0x00RRGGBB at the player's size, aspect kept, bars in the background colour. `range`: the stream's, when it names one. */
static bool convert(Player* p, Conv* s, AVFrame* f, int range, uint32_t* px) {
  if (!s->sws || f->width != s->sw_w || f->height != s->sw_h || f->format != s->sw_fmt) {
    int box[4];
    double sar = f->sample_aspect_ratio.num > 0 && f->sample_aspect_ratio.den > 0 ? av_q2d(f->sample_aspect_ratio) : 1;
    fit(p, f->width * sar, f->height, box);
    s->ox = box[0]; s->oy = box[1]; s->ow = box[2]; s->oh = box[3];
    s->sws = sws_getCachedContext(s->sws, f->width, f->height, (AVPixelFormat)f->format, s->ow, s->oh, AV_PIX_FMT_BGR0, SWS_BILINEAR, nullptr, nullptr, nullptr);
    if (!s->sws) return false;
    const int* coef = sws_getCoefficients(f->colorspace == AVCOL_SPC_BT709 ? SWS_CS_ITU709 : SWS_CS_DEFAULT);
    sws_setColorspaceDetails(s->sws, coef, (range != AVCOL_RANGE_UNSPECIFIED ? range : f->color_range) == AVCOL_RANGE_JPEG, coef, 1, 0, 1 << 16, 1 << 16);
    s->sw_w = f->width; s->sw_h = f->height; s->sw_fmt = f->format;
  }
  const int box[4] = {s->ox, s->oy, s->ow, s->oh};
  bars(p, px, box);
  uint8_t* dst[4] = {(uint8_t*)(px + (size_t)s->oy * p->w + s->ox), nullptr, nullptr, nullptr};
  int ds[4] = {p->w * 4, 0, 0, 0};
  sws_scale(s->sws, f->data, f->linesize, 0, f->height, dst, ds);
  // swscale writes 0xFF in the pad byte; runtime images are 0x00RRGGBB
  for (int y = 0; y < s->oh; y++) { uint32_t* r = px + (size_t)(s->oy + y) * p->w + s->ox; for (int x = 0; x < s->ow; x++) r[x] &= 0xFFFFFF; }
  return true;
}
static void conv_free(Conv* c) { sws_freeContext(c->sws); c->sws = nullptr; }

#ifdef ZP_VIDEO_PRIME
/** A dmabuf frame for the display: its buffers by descriptor, nothing mapped. False: a layout a HalPicture does not describe. */
static bool picture_of(const AVFrame* fr, int range, HalPicture* h) {
  const AVDRMFrameDescriptor* d = (const AVDRMFrameDescriptor*)fr->data[0];
  if (!d || d->nb_layers != 1 || d->layers[0].nb_planes > 4) return false;
  const AVDRMLayerDescriptor& l = d->layers[0];
  h->modifier = d->objects[0].format_modifier; h->format = l.format; h->w = fr->width; h->h = fr->height; h->nplanes = l.nb_planes;
  for (int i = 0; i < l.nb_planes; i++) { h->fd[i] = d->objects[l.planes[i].object_index].fd; h->offset[i] = (uint32_t)l.planes[i].offset; h->pitch[i] = (uint32_t)l.planes[i].pitch; }
  h->full_range = (range != AVCOL_RANGE_UNSPECIFIED ? range : fr->color_range) == AVCOL_RANGE_JPEG;
  h->bt709 = fr->colorspace == AVCOL_SPC_BT709;
  return true;
}
/** A dmabuf frame copied into ordinary memory (`tmp`, kept from picture to picture) for swscale: the software way of showing it, at the
 *  price of the copy ZN-730 measured (5 ms for 854x480 on a Pi 3: the buffer is mapped without a cache). Null: not readable here.
 *  ponytail: YU12 and NV12 in one buffer, what bcm2835-codec gives; another layout is shown by a hardware layer only. */
static AVFrame* from_prime(const AVFrame* fr, AVFrame* tmp) {
  const AVDRMFrameDescriptor* d = (const AVDRMFrameDescriptor*)fr->data[0];
  if (!d || d->nb_layers != 1 || d->nb_objects != 1) return nullptr;
  const AVDRMLayerDescriptor& l = d->layers[0];
  const AVPixelFormat fmt = l.format == MKTAG('Y', 'U', '1', '2') ? AV_PIX_FMT_YUV420P : l.format == MKTAG('N', 'V', '1', '2') ? AV_PIX_FMT_NV12 : AV_PIX_FMT_NONE;
  if (fmt == AV_PIX_FMT_NONE) return nullptr;
  if (tmp->format != fmt || tmp->width != fr->width || tmp->height != fr->height) {
    av_frame_unref(tmp);
    tmp->format = fmt; tmp->width = fr->width; tmp->height = fr->height;
    if (av_frame_get_buffer(tmp, 0) < 0) return nullptr;
  }
  void* m = mmap(nullptr, d->objects[0].size, PROT_READ, MAP_SHARED, d->objects[0].fd, 0);
  if (m == MAP_FAILED) return nullptr;
  const uint8_t* src[4] = {};
  int pitch[4] = {};
  for (int i = 0; i < l.nb_planes; i++) { src[i] = (const uint8_t*)m + l.planes[i].offset; pitch[i] = (int)l.planes[i].pitch; }
  av_image_copy(tmp->data, tmp->linesize, src, pitch, fmt, fr->width, fr->height);
  munmap(m, d->objects[0].size);
  tmp->sample_aspect_ratio = fr->sample_aspect_ratio; tmp->colorspace = fr->colorspace; tmp->color_range = fr->color_range;
  return tmp;
}
#else
static bool picture_of(const AVFrame*, int, HalPicture*) { return false; }
static AVFrame* from_prime(const AVFrame*, AVFrame*) { return nullptr; }
#endif
static Held* held_new() { return av_frame_alloc(); }
static void held_free(Held*& h) { av_frame_free(&h); }
static void held_unref(Held* h) { av_frame_unref(h); }
static bool held_any(const Held* h) { return h && h->buf[0]; }
static bool held_picture(const Held* h, int range, HalPicture* out) { return picture_of(h, range, out); }
static bool held_convert(Player* p, Held* h, int range, uint32_t* px) { AVFrame* f = from_prime(h, p->tmp); return f && convert(p, &p->conv, f, range, px); }

/** Worker: converts the decoded frame into a free slot and marks it ready with its timeline position. */
static void publish(Player* p, Source* s, AVFrame* fr, uint32_t gen, double base, int loop) {
  AVFrame* f = fr;
  AVFrame* sw = s->sw;
  const bool prime = fr->format == AV_PIX_FMT_DRM_PRIME;
  if (prime) f = nullptr;   // a dmabuf: kept as it is, read only if a frame draws it in software (below)
  else if (s->hwfmt != AV_PIX_FMT_NONE && fr->format == s->hwfmt) {
    av_frame_unref(sw);
    if (av_hwframe_transfer_data(sw, fr, 0) < 0) return;
    av_frame_copy_props(sw, fr);
    f = sw;
  } else if (s->uncached) {
    // swscale read a V4L2 buffer at 82 ms a picture on a Pi 3 (854x480, ZN-730): each sample is a trip to the memory. One copy into
    // ordinary memory first (5 ms), kept from picture to picture, and the conversion reads that (8 ms).
    if (sw->format != fr->format || sw->width != fr->width || sw->height != fr->height) {
      av_frame_unref(sw);
      sw->format = fr->format; sw->width = fr->width; sw->height = fr->height;
      if (av_frame_get_buffer(sw, 0) < 0) return;
    }
    if (av_frame_copy(sw, fr) < 0) return;
    sw->sample_aspect_ratio = fr->sample_aspect_ratio; sw->colorspace = fr->colorspace; sw->color_range = fr->color_range;
    f = sw;
  }
  int64_t pts = fr->best_effort_timestamp;
  if (pts == AV_NOPTS_VALUE) pts = s->last == AV_NOPTS_VALUE ? 0 : s->last + (int64_t)(s->fdur / s->tb + 0.5);
  if (s->start == AV_NOPTS_VALUE) s->start = pts;
  s->last = pts;
  double pos = (pts - s->start) * s->tb;
  if (pos < 0) pos = 0;
  double fd = fr->duration > 0 ? fr->duration * s->tb : s->fdur;
  if (pos + fd > s->end) s->end = pos + fd;
  const int k = slot_take(p, gen);
  if (k < 0) return;
  const uint64_t c0 = vlog ? hal_time_us() : 0;
  Slot& sl = p->slot[k];
  av_frame_unref(sl.hw);
  bool ok = true;
  sl.has_px = !prime || p->want_px;
  if (prime) {
    ok = av_frame_ref(sl.hw, fr) == 0;
    sl.range = s->range;
    double sar = fr->sample_aspect_ratio.num > 0 && fr->sample_aspect_ratio.den > 0 ? av_q2d(fr->sample_aspect_ratio) : 1;
    fit(p, fr->width * sar, fr->height, sl.box);
    if (ok && sl.has_px) f = from_prime(fr, sw);
  }
  if (ok && sl.has_px) ok = f && convert(p, &s->cv, f, s->range, sl.px);
  if (vlog) fprintf(stderr, sl.has_px ? "video: p%d converted pos %.4f in %.2f ms (%s)\n" : "video: p%d kept pos %.4f as a dmabuf, %.2f ms (%s)\n", (int)(p - players), pos, (hal_time_us() - c0) / 1e3, s->name);
  slot_commit(p, s, k, ok, gen, base, pos, fd, loop);
}

static int src_step(Player* p, SourceBase* b, uint32_t gen, double base, int loop) {
  Source* s = static_cast<Source*>(b);
  for (;;) {
    int r = avcodec_receive_frame(s->dec, s->fr);
    if (r == 0) { publish(p, s, s->fr, gen, base, loop); av_frame_unref(s->fr); return 1; }
    if (r != AVERROR(EAGAIN) || s->draining) return 0;   // end of file, or a decoder error
    if (av_read_frame(s->fmt, s->pkt) < 0) { avcodec_send_packet(s->dec, nullptr); s->draining = true; continue; }
    if (s->pkt->stream_index == s->stream) avcodec_send_packet(s->dec, s->pkt);  // a corrupt packet is skipped
    av_packet_unref(s->pkt);
  }
}

static void backend_init() { av_log_set_level(vlog ? AV_LOG_WARNING : AV_LOG_FATAL); }
