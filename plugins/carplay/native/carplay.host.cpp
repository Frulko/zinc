#define ZRT_HOSTED_CPP
#include "zinc_native_carplay.h"
#include "zrt_raster.h"
extern "C" {
#include <libavcodec/avcodec.h>
#include <libswscale/swscale.h>
}
#include <string.h>

// Decoders belong to the plugin, never to the engine. All calls run on the app thread.
struct Decoder {
  AVCodecContext* codec = nullptr;
  AVFrame* frame = nullptr;
  SwsContext* scale = nullptr;
  int image = -1;
};
struct HostCarplay : NativeCarplay {
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
    if (d.image >= 0) zrt::raster::dyn_destroy(d.image);
    d.image = -1;
  }
  int32_t open(int32_t codec, zrt::Array<uint8_t> config) override {
    message[0] = 0;
    if ((codec != 1 && codec != 2) || config.length() > 65536) { fail("invalid video configuration"); return -1; }
    int h = 0;
    while (h < 4 && slots[h].codec) ++h;
    if (h == 4) { fail("too many video streams"); return -1; }
    Decoder& d = slots[h];
    const AVCodec* c = avcodec_find_decoder(codec == 1 ? AV_CODEC_ID_H264 : AV_CODEC_ID_HEVC);
    d.codec = avcodec_alloc_context3(c);
    d.frame = av_frame_alloc();
    if (!d.codec || !d.frame) { close(h); fail("cannot allocate video decoder"); return -1; }
    d.codec->thread_count = 1;
    d.codec->max_pixels = 4096 * 4096;
    d.codec->flags |= AV_CODEC_FLAG_LOW_DELAY;
    if (config.length()) {
      d.codec->extradata = (uint8_t*)av_mallocz(config.length() + AV_INPUT_BUFFER_PADDING_SIZE);
      if (!d.codec->extradata) { close(h); fail("cannot allocate codec configuration"); return -1; }
      memcpy(d.codec->extradata, config.a->data, config.length());
      d.codec->extradata_size = config.length();
    }
    if (!c || avcodec_open2(d.codec, c, nullptr) < 0) { close(h); fail("cannot open video decoder"); return -1; }
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
      else if (zrt::raster::image_size(d.image, &iw, &ih) && (iw != w || ih != height)) zrt::raster::dyn_resize(d.image, w, height);
      if (d.image < 0) { fail("cannot allocate runtime image"); return false; }
      d.scale = sws_getCachedContext(d.scale, w, height, (AVPixelFormat)d.frame->format, w, height, AV_PIX_FMT_BGRA, SWS_BILINEAR, nullptr, nullptr, nullptr);
      if (!d.scale) { fail("cannot convert video frame"); return false; }
      uint8_t* out[] = {(uint8_t*)zrt::raster::dyn_pixels(d.image)};
      int stride[] = {w * 4};
      sws_scale(d.scale, d.frame->data, d.frame->linesize, 0, height, out, stride);
      zrt::raster::dyn_update(d.image, (uint32_t*)out[0], w);
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
