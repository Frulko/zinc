#pragma once
extern "C" {
#include <libavcodec/avcodec.h>
#include <libavutil/opt.h>
}
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

namespace carplay {
// WebSocket payloads match the pinned PlayPort browser sender, not encrypted RTP.
class MicrophoneEncoder {
  AVCodecContext* encoder = nullptr;
  AVFrame* frame = nullptr;
  int codec = -1, count = 0;
  int64_t timestamp = 0;
public:
  std::string error;
  MicrophoneEncoder() = default;
  MicrophoneEncoder(const MicrophoneEncoder&) = delete;
  MicrophoneEncoder& operator=(const MicrophoneEncoder&) = delete;
  ~MicrophoneEncoder() { close(); }
  void close() {
    // Discard encoder padding at stream end; it must never become an extra live packet.
    if (encoder && avcodec_is_open(encoder)) {
      avcodec_send_frame(encoder, nullptr);
      AVPacket* packet = av_packet_alloc();
      if (packet) {
        while (avcodec_receive_packet(encoder, packet) >= 0) av_packet_unref(packet);
        av_packet_free(&packet);
      }
    }
    avcodec_free_context(&encoder);
    av_frame_free(&frame);
    codec = -1; count = 0; timestamp = 0;
  }
  bool active() const { return codec >= 0; }
  bool open(int kind, int rate, int channels, int samples, int bitrate) {
    close(); error.clear();
    if ((kind != 0 && kind != 1) || rate < 8000 || rate > 96000 || channels < 1 || channels > 2 ||
        samples < 1 || samples > rate * 60 / 1000 || bitrate < 0 || bitrate > 512000) {
      error = "invalid microphone configuration"; return false;
    }
    if (kind == 1) {
      if ((rate != 8000 && rate != 12000 && rate != 16000 && rate != 24000 && rate != 48000) || samples != rate / 50) {
        error = "Opus microphone requires a supported rate and 20 ms packets"; return false;
      }
      const AVCodec* c = avcodec_find_encoder_by_name("libopus");
      if (!c) { error = "FFmpeg libopus microphone encoder is unavailable"; return false; }
      encoder = avcodec_alloc_context3(c);
      frame = av_frame_alloc();
      if (!encoder || !frame) { close(); error = "cannot allocate microphone encoder"; return false; }
      encoder->sample_rate = rate;
      encoder->sample_fmt = AV_SAMPLE_FMT_FLT;
      encoder->time_base = AVRational{1, rate};
      encoder->bit_rate = bitrate ? bitrate : 32000;
      av_channel_layout_default(&encoder->ch_layout, channels);
      av_opt_set(encoder->priv_data, "application", "voip", 0);
      av_opt_set(encoder->priv_data, "frame_duration", "20", 0);
      if (avcodec_open2(encoder, c, nullptr) < 0 || encoder->frame_size != samples) {
        close(); error = "cannot open 20 ms Opus microphone encoder"; return false;
      }
      frame->format = encoder->sample_fmt;
      frame->sample_rate = rate;
      frame->nb_samples = samples;
      if (av_channel_layout_copy(&frame->ch_layout, &encoder->ch_layout) < 0 || av_frame_get_buffer(frame, 0) < 0) {
        close(); error = "cannot allocate microphone frame"; return false;
      }
    }
    codec = kind; count = samples * channels;
    return true;
  }
  std::vector<uint8_t> encode(const double* samples, int size) {
    error.clear();
    if (!active() || size != count || !samples) { error = "invalid microphone sample count or closed encoder"; return {}; }
    for (int i = 0; i < size; ++i) if (!std::isfinite(samples[i])) { error = "non-finite microphone sample"; return {}; }
    if (codec == 0) {
      std::vector<uint8_t> out(1 + size * 2); out[0] = 0x10;
      for (int i = 0; i < size; ++i) {
        const int value = (int)std::floor(std::clamp(samples[i], -1.0, 1.0) * 32767.0 + 0.5);
        out[1 + 2 * i] = (uint8_t)value;
        out[2 + 2 * i] = (uint8_t)((uint16_t)value >> 8);
      }
      return out;
    }
    if (av_frame_make_writable(frame) < 0) { error = "cannot write microphone frame"; return {}; }
    for (int i = 0; i < size; ++i) ((float*)frame->data[0])[i] = (float)std::clamp(samples[i], -1.0, 1.0);
    frame->pts = timestamp;
    timestamp += frame->nb_samples;
    if (avcodec_send_frame(encoder, frame) < 0) { error = "microphone encoder rejected samples"; return {}; }
    AVPacket* packet = av_packet_alloc();
    if (!packet) { error = "cannot allocate microphone packet"; return {}; }
    const int rc = avcodec_receive_packet(encoder, packet);
    std::vector<uint8_t> out;
    if (rc >= 0 && packet->size > 0 && packet->size <= 65536) {
      out.push_back(0x11); out.insert(out.end(), packet->data, packet->data + packet->size);
    } else { error = "microphone encoder did not produce a packet"; }
    av_packet_free(&packet);
    return out;
  }
};
}
