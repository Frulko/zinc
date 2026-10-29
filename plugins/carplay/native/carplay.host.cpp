#define ZRT_HOSTED_CPP
#include "zinc_native_carplay.h"
#include "zrt_raster.h"
extern "C" {
#include <libavcodec/avcodec.h>
#include <libswscale/swscale.h>
#if defined(__linux__) && __has_include(<libavutil/hwcontext_drm.h>)
#include <libavutil/hwcontext_drm.h>
#include <libavutil/imgutils.h>
#include <sys/mman.h>
#define ZP_CARPLAY_PRIME 1
#endif
}
#include <string.h>
#include <stdio.h>
#include "microphone.h"

// Decoders belong to the plugin, never to the engine. All calls run on the app thread.
struct Decoder {
  AVCodecContext* codec = nullptr;
  AVFrame* frame = nullptr;
  SwsContext* scale = nullptr;
  int image = -1;
  bool hardware = false;
#ifdef ZP_CARPLAY_PRIME
  AVFrame* held[3] = {};
  AVFrame* cached = nullptr;
  zrt::raster::Picture picture{};
#endif
};

#ifdef ZP_CARPLAY_PRIME
static AVPixelFormat carplay_pick_format(AVCodecContext* ctx, const AVPixelFormat* offered) {
  for (const AVPixelFormat* p = offered; *p != AV_PIX_FMT_NONE; ++p) if (*p == AV_PIX_FMT_DRM_PRIME) return *p;
  return avcodec_default_get_format(ctx, offered);
}

static bool carplay_picture_of(const AVFrame* frame, HalPicture* out) {
  const auto* desc = (const AVDRMFrameDescriptor*)frame->data[0];
  if (!desc || desc->nb_layers != 1 || desc->nb_objects < 1 || desc->layers[0].nb_planes < 1 || desc->layers[0].nb_planes > 4) return false;
  const auto& layer = desc->layers[0];
  out->modifier = desc->objects[0].format_modifier;
  out->format = layer.format;
  out->w = frame->width; out->h = frame->height; out->nplanes = layer.nb_planes;
  for (int i = 0; i < layer.nb_planes; ++i) {
    const auto& plane = layer.planes[i];
    if (plane.object_index >= desc->nb_objects) return false;
    out->fd[i] = desc->objects[plane.object_index].fd;
    out->offset[i] = (uint32_t)plane.offset;
    out->pitch[i] = (uint32_t)plane.pitch;
  }
  out->full_range = frame->color_range == AVCOL_RANGE_JPEG;
  out->bt709 = frame->colorspace == AVCOL_SPC_BT709;
  return true;
}

static AVFrame* carplay_cached_frame(Decoder& d, const AVFrame* frame) {
  if (!d.cached) return nullptr;
  if (frame->format == AV_PIX_FMT_DRM_PRIME) {
    const auto* desc = (const AVDRMFrameDescriptor*)frame->data[0];
    if (!desc || desc->nb_layers != 1 || desc->nb_objects != 1) return nullptr;
    const auto& layer = desc->layers[0];
    const AVPixelFormat fmt = layer.format == MKTAG('Y','U','1','2') ? AV_PIX_FMT_YUV420P : layer.format == MKTAG('N','V','1','2') ? AV_PIX_FMT_NV12 : AV_PIX_FMT_NONE;
    if (fmt == AV_PIX_FMT_NONE || layer.nb_planes < 1 || layer.nb_planes > 4) return nullptr;
    if (d.cached->format != fmt || d.cached->width != frame->width || d.cached->height != frame->height) {
      av_frame_unref(d.cached);
      d.cached->format = fmt; d.cached->width = frame->width; d.cached->height = frame->height;
      if (av_frame_get_buffer(d.cached, 0) < 0) return nullptr;
    }
    void* mapped = mmap(nullptr, desc->objects[0].size, PROT_READ, MAP_SHARED, desc->objects[0].fd, 0);
    if (mapped == MAP_FAILED) return nullptr;
    const uint8_t* src[4] = {};
    int pitch[4] = {};
    for (int i = 0; i < layer.nb_planes; ++i) { src[i] = (const uint8_t*)mapped + layer.planes[i].offset; pitch[i] = (int)layer.planes[i].pitch; }
    av_image_copy(d.cached->data, d.cached->linesize, src, pitch, fmt, frame->width, frame->height);
    munmap(mapped, desc->objects[0].size);
  } else {
    if (d.cached->format != frame->format || d.cached->width != frame->width || d.cached->height != frame->height) {
      av_frame_unref(d.cached);
      d.cached->format = frame->format; d.cached->width = frame->width; d.cached->height = frame->height;
      if (av_frame_get_buffer(d.cached, 0) < 0) return nullptr;
    }
    if (av_frame_copy(d.cached, frame) < 0) return nullptr;
  }
  d.cached->color_range = frame->color_range;
  d.cached->colorspace = frame->colorspace;
  return d.cached;
}
#endif

static bool carplay_convert(Decoder& d, AVFrame* frame) {
  uint8_t* pixels = (uint8_t*)zrt::raster::dyn_pixels(d.image);
  if (!pixels) return false;
  d.scale = sws_getCachedContext(d.scale, frame->width, frame->height, (AVPixelFormat)frame->format,
                                  frame->width, frame->height, AV_PIX_FMT_BGRA, SWS_BILINEAR, nullptr, nullptr, nullptr);
  if (!d.scale) return false;
  uint8_t* out[] = {pixels};
  int stride[] = {frame->width * 4};
  sws_scale(d.scale, frame->data, frame->linesize, 0, frame->height, out, stride);
  zrt::raster::dyn_update(d.image, (uint32_t*)pixels, frame->width);
  return true;
}

#ifdef ZP_CARPLAY_PRIME
static void carplay_fill(void* user) {
  Decoder& d = *(Decoder*)user;
  d.picture.filled = true;
  AVFrame* frame = carplay_cached_frame(d, d.held[0]);
  if (frame) carplay_convert(d, frame);
}
#endif
struct HostCarplay : NativeCarplay {
  carplay::MicrophoneEncoder microphones[4];
  int32_t micOpen(int32_t codec, int32_t rate, int32_t channels, int32_t samples, int32_t bitrate) override {
    for (int i = 0; i < 4; ++i) if (!microphones[i].active()) {
      if (microphones[i].open(codec, rate, channels, samples, bitrate)) { message[0] = 0; return i; }
      fail(microphones[i].error.c_str()); return -1;
    }
    fail("too many microphone encoders"); return -1;
  }
  zrt::Array<uint8_t> micEncode(int32_t h, zrt::Array<double> samples) override {
    zrt::Array<uint8_t> out = zrt::Array<uint8_t>::with_cap(0);
    if (h < 0 || h >= 4) { fail("invalid microphone encoder"); return out; }
    auto bytes = microphones[h].encode(samples.length() ? samples.a->data : nullptr, samples.length());
    if (!microphones[h].error.empty()) fail(microphones[h].error.c_str());
    for (uint8_t b : bytes) out.push(b);
    return out;
  }
  void micClose(int32_t h) override { if (h >= 0 && h < 4) microphones[h].close(); }
  Decoder slots[4];
  Decoder audio[8];
  char message[128] = "";
  void fail(const char* text) { snprintf(message, sizeof message, "%s", text); }
  zrt::String error() override { return zrt::String::from(message, (uint32_t)strlen(message)); }
  void close(int32_t h) override {
    if (h < 0 || h >= 12) return;
    Decoder& d = h < 4 ? slots[h] : audio[h - 4];
    avcodec_free_context(&d.codec);
    av_frame_free(&d.frame);
    sws_freeContext(d.scale); d.scale = nullptr;
    if (d.image >= 0) { zrt::raster::dyn_set_picture(d.image, nullptr); zrt::raster::dyn_destroy(d.image); }
    d.image = -1;
#ifdef ZP_CARPLAY_PRIME
    for (AVFrame*& held : d.held) av_frame_free(&held);
    av_frame_free(&d.cached);
#endif
    d.hardware = false;
  }
  int32_t open(int32_t codec, int32_t width, int32_t height, zrt::Array<uint8_t> config) override {
    message[0] = 0;
    if ((codec != 1 && codec != 2) || width < 1 || height < 1 || width > 4096 || height > 4096 || config.length() > 65536) { fail("invalid video configuration"); return -1; }
    int h = 0;
    while (h < 4 && slots[h].codec) ++h;
    if (h == 4) { fail("too many video streams"); return -1; }
    Decoder& d = slots[h];
    auto make_decoder = [&](const AVCodec* c, bool prime) -> AVCodecContext* {
      if (!c) return nullptr;
      AVCodecContext* ctx = avcodec_alloc_context3(c);
      if (!ctx) return nullptr;
      ctx->width = width; ctx->height = height;
      ctx->thread_count = 1;
      ctx->max_pixels = 4096 * 4096;
      ctx->flags |= AV_CODEC_FLAG_LOW_DELAY;
#ifdef ZP_CARPLAY_PRIME
      if (prime) ctx->get_format = carplay_pick_format;
#else
      (void)prime;
#endif
      if (config.length()) {
        ctx->extradata = (uint8_t*)av_mallocz(config.length() + AV_INPUT_BUFFER_PADDING_SIZE);
        if (!ctx->extradata) { avcodec_free_context(&ctx); return nullptr; }
        memcpy(ctx->extradata, config.a->data, config.length());
        ctx->extradata_size = config.length();
      }
      if (avcodec_open2(ctx, c, nullptr) < 0) { avcodec_free_context(&ctx); return nullptr; }
      return ctx;
    };
#ifdef ZP_CARPLAY_PRIME
    if (codec == 1 && hal_display && hal_display->layers) {
      d.codec = make_decoder(avcodec_find_decoder_by_name("h264_v4l2m2m"), true);
      d.hardware = d.codec != nullptr;
    }
#endif
    if (!d.codec) d.codec = make_decoder(avcodec_find_decoder(codec == 1 ? AV_CODEC_ID_H264 : AV_CODEC_ID_HEVC), false);
    d.frame = av_frame_alloc();
    if (!d.codec || !d.frame) { close(h); fail("cannot allocate video decoder"); return -1; }
#ifdef ZP_CARPLAY_PRIME
    if (d.hardware) {
      for (AVFrame*& held : d.held) held = av_frame_alloc();
      d.cached = av_frame_alloc();
      if (!d.held[0] || !d.held[1] || !d.held[2] || !d.cached) { close(h); fail("cannot allocate hardware video frames"); return -1; }
      fprintf(stderr, "carplay: video decoder h264_v4l2m2m (dmabuf when available)\n");
    }
#endif
    return h;
  }
  int32_t audioOpen(int32_t codec, int32_t rate, int32_t channels, zrt::Array<uint8_t> config) override {
    if ((codec != 1 && codec != 2) || rate < 8000 || rate > 96000 || channels < 1 || channels > 2 || config.length() > 256) { fail("invalid audio configuration"); return -1; }
    int h = 0;
    while (h < 8 && audio[h].codec) ++h;
    if (h == 8) { fail("too many audio streams"); return -1; }
    Decoder& d = audio[h];
    const AVCodec* c = avcodec_find_decoder(codec == 1 ? AV_CODEC_ID_AAC : AV_CODEC_ID_OPUS);
    d.codec = avcodec_alloc_context3(c); d.frame = av_frame_alloc();
    if (!d.codec || !d.frame) { close(h + 4); fail("cannot allocate audio decoder"); return -1; }
    d.codec->sample_rate = rate;
    av_channel_layout_default(&d.codec->ch_layout, channels);
    if (config.length()) {
      d.codec->extradata = (uint8_t*)av_mallocz(config.length() + AV_INPUT_BUFFER_PADDING_SIZE);
      if (!d.codec->extradata) { close(h + 4); return -1; }
      memcpy(d.codec->extradata, config.a->data, config.length());
      d.codec->extradata_size = config.length();
    }
    if (!c || avcodec_open2(d.codec, c, nullptr) < 0) { close(h + 4); fail("cannot open audio decoder"); return -1; }
    return h + 4;
  }
  zrt::Array<double> audioDecode(int32_t h, zrt::Array<uint8_t> bytes) override {
    zrt::Array<double> out = zrt::Array<double>::with_cap(0);
    if (h < 4 || h >= 12 || !audio[h - 4].codec || bytes.length() <= 0 || bytes.length() > 65536) { fail("invalid audio packet"); return out; }
    Decoder& d = audio[h - 4];
    AVPacket* p = av_packet_alloc();
    if (!p || av_new_packet(p, bytes.length()) < 0) { av_packet_free(&p); return out; }
    memcpy(p->data, bytes.a->data, bytes.length());
    int rc = avcodec_send_packet(d.codec, p);
    av_packet_free(&p);
    if (rc < 0) { fail("audio packet rejected"); return out; }
    while (avcodec_receive_frame(d.codec, d.frame) >= 0) {
      AVFrame* f = d.frame;
      const int channels = f->ch_layout.nb_channels;
      if (channels < 1 || channels > 2 || f->nb_samples > 11520) { fail("invalid decoded audio dimensions"); return out; }
      const bool planar = av_sample_fmt_is_planar((AVSampleFormat)f->format);
      const AVSampleFormat format = av_get_packed_sample_fmt((AVSampleFormat)f->format);
      if (format != AV_SAMPLE_FMT_FLT && format != AV_SAMPLE_FMT_S16 && format != AV_SAMPLE_FMT_S32) { fail("unsupported decoded audio format"); return out; }
      for (int i = 0; i < f->nb_samples; ++i) for (int ch = 0; ch < channels; ++ch) {
        const uint8_t* data = f->extended_data[planar ? ch : 0];
        const int index = planar ? i : i * channels + ch;
        double value = format == AV_SAMPLE_FMT_FLT ? ((const float*)data)[index] : format == AV_SAMPLE_FMT_S16 ? ((const int16_t*)data)[index] / 32768.0 : ((const int32_t*)data)[index] / 2147483648.0;
        out.push(value);
      }
    }
    return out;
  }
  int32_t image(int32_t h) override { return h >= 0 && h < 4 ? slots[h].image : -1; }
  bool decode(int32_t h, zrt::Array<uint8_t> bytes) override {
    if (h < 0 || h >= 4 || !slots[h].codec || bytes.length() <= 0 || bytes.length() > 8*1024*1024) { fail("invalid video packet"); return false; }
    Decoder& d = slots[h];
    AVPacket* packet = av_packet_alloc();
    if (!packet || av_new_packet(packet, bytes.length()) < 0) { av_packet_free(&packet); fail("cannot allocate video packet"); return false; }
    memcpy(packet->data, bytes.a->data, bytes.length());
    int rc = avcodec_send_packet(d.codec, packet);
    av_packet_free(&packet);
    if (rc < 0) { fail("video packet rejected"); return false; }
    while ((rc = avcodec_receive_frame(d.codec, d.frame)) >= 0) {
      const int w = d.frame->width, height = d.frame->height;
      if (w <= 0 || height <= 0 || w > 4096 || height > 4096) { fail("video frame exceeds 4096 pixels"); return false; }
      int32_t iw = 0, ih = 0;
      if (d.image < 0) d.image = zrt::raster::dyn_create(w, height);
      else if (zrt::raster::image_size(d.image, &iw, &ih) && (iw != w || ih != height)) {
        zrt::raster::dyn_set_picture(d.image, nullptr);
        zrt::raster::dyn_resize(d.image, w, height);
      }
      if (d.image < 0 || !zrt::raster::image_size(d.image, &iw, &ih) || iw != w || ih != height) {
        fail("cannot allocate runtime image"); return false;
      }
#ifdef ZP_CARPLAY_PRIME
      if (d.frame->format == AV_PIX_FMT_DRM_PRIME && d.hardware && carplay_picture_of(d.frame, &d.picture.hal)) {
        AVFrame* next = d.held[2];
        av_frame_unref(next);
        if (av_frame_ref(next, d.frame) < 0) { fail("cannot retain hardware video frame"); return false; }
        d.held[2] = d.held[1]; d.held[1] = d.held[0]; d.held[0] = next;
        static uint32_t serial = 0;
        d.picture.hal.serial = ++serial;
        d.picture.bx = 0; d.picture.by = 0; d.picture.bw = w; d.picture.bh = height;
        d.picture.fill = carplay_fill; d.picture.user = &d; d.picture.filled = false; d.picture.software = false;
        zrt::raster::dyn_set_picture(d.image, &d.picture);
        zrt::raster::dyn_update(d.image, nullptr, 0);
        continue;
      }
#endif
      zrt::raster::dyn_set_picture(d.image, nullptr);
      AVFrame* pixels = d.frame;
#ifdef ZP_CARPLAY_PRIME
      if (d.hardware) pixels = carplay_cached_frame(d, d.frame);
#endif
      if (!pixels || !carplay_convert(d, pixels)) { fail("cannot convert video frame"); return false; }
    }
    if (rc != AVERROR(EAGAIN) && rc != AVERROR_EOF) { fail("video decoding failed"); return false; }
    return true;
  }
};
NativeCarplay* zinc_create_Carplay() {
  static HostCarplay instance;
  instance.rc = zrt::IMMORTAL;
  return &instance;
}
