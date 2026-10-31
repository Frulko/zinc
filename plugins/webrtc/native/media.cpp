// zinc:webrtc media (media.h): VP8 through libvpx 1.17 (vendor/libvpx, generic C: the same code on every target), Opus through libopus
// 1.6.1 (vendor/opus, floating point), the BGRX <-> I420 conversion and the reassembly of received RTP packets into frames.
// MEDIA_NO_VP8: built without libvpx (zinc:discord-voice takes the H.264, Opus and reassembly parts only); vp8Encoder/vp8Decoder are null.
#include "media.h"
#ifndef MEDIA_NO_VP8
#include "vpx/vp8cx.h"
#include "vpx/vp8dx.h"
#include "vpx/vpx_decoder.h"
#include "vpx/vpx_encoder.h"
#endif
#include "opus.h"
#include <string.h>

namespace media {
namespace {
inline uint8_t clip(int v) { return (uint8_t)(v < 0 ? 0 : v > 255 ? 255 : v); }
inline uint16_t be16(const uint8_t* p) { return (uint16_t)(p[0] << 8 | p[1]); }
inline uint32_t be32(const uint8_t* p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
}  // namespace

void toI420(const uint32_t* px, int w, int h, int stride, uint8_t* y, int ys, uint8_t* u, int us, uint8_t* v, int vs) {
  for (int r = 0; r < h; r++) {
    const uint32_t* s = px + (size_t)r * stride;
    uint8_t* d = y + (size_t)r * ys;
    for (int c = 0; c < w; c++) {
      const int R = (s[c] >> 16) & 255, G = (s[c] >> 8) & 255, B = s[c] & 255;
      d[c] = (uint8_t)(((66 * R + 129 * G + 25 * B + 128) >> 8) + 16);
    }
  }
  for (int r = 0; r < (h + 1) / 2; r++)
    for (int c = 0; c < (w + 1) / 2; c++) {   // the average of the 2x2 block (or what of it lies inside an odd edge)
      int R = 0, G = 0, B = 0, n = 0;
      for (int dy = 0; dy < 2; dy++)
        for (int dx = 0; dx < 2; dx++) {
          const int yy = r * 2 + dy, xx = c * 2 + dx;
          if (yy >= h || xx >= w) continue;
          const uint32_t p = px[(size_t)yy * stride + xx];
          R += (p >> 16) & 255; G += (p >> 8) & 255; B += p & 255; n++;
        }
      R /= n; G /= n; B /= n;
      u[(size_t)r * us + c] = clip(((-38 * R - 74 * G + 112 * B + 128) >> 8) + 128);
      v[(size_t)r * vs + c] = clip(((112 * R - 94 * G - 18 * B + 128) >> 8) + 128);
    }
}

void fromI420(const uint8_t* y, int ys, const uint8_t* u, int us, const uint8_t* v, int vs, int w, int h, uint32_t* px) {
  for (int r = 0; r < h; r++)
    for (int c = 0; c < w; c++) {
      const int C = y[(size_t)r * ys + c] - 16, D = u[(size_t)(r / 2) * us + c / 2] - 128, E = v[(size_t)(r / 2) * vs + c / 2] - 128;
      px[(size_t)r * w + c] = (uint32_t)clip((298 * C + 409 * E + 128) >> 8) << 16 | (uint32_t)clip((298 * C - 100 * D - 208 * E + 128) >> 8) << 8 |
                              clip((298 * C + 516 * D + 128) >> 8);
    }
}

void scale(const uint32_t* src, int sw, int sh, uint32_t* dst, int dw, int dh) {
  for (int r = 0; r < dh; r++) {
    const uint32_t* s = src + (size_t)(r * sh / dh) * sw;
    for (int c = 0; c < dw; c++) dst[(size_t)r * dw + c] = s[c * sw / dw];
  }
}

// ---- VP8 (libvpx). Real-time settings as WebRTC's own libvpx wrapper uses them: CBR, no lag, error resilient, a buffer of one second.
#ifndef MEDIA_NO_VP8
namespace {
struct Vp8Enc : VideoEncoder {
  vpx_codec_ctx_t ctx;
  vpx_codec_enc_cfg_t cfg;
  vpx_image_t img;
  bool ok = false;
  int layers = 1;
  unsigned count = 0;   // frames since the last key frame: the layer pattern (TL0, TL1, TL0, ...)
  Vp8Enc(int w_, int h_, int bps, int fps, int layers_) {
    w = w_; h = h_; layers = layers_ == 2 ? 2 : 1;
    if (vpx_codec_enc_config_default(vpx_codec_vp8_cx(), &cfg, 0)) return;
    cfg.g_w = (unsigned)w; cfg.g_h = (unsigned)h;
    cfg.g_timebase.num = 1; cfg.g_timebase.den = 1000;   // milliseconds
    cfg.rc_target_bitrate = (unsigned)(bps / 1000);
    cfg.g_error_resilient = VPX_ERROR_RESILIENT_DEFAULT;
    cfg.g_lag_in_frames = 0;
    cfg.g_pass = VPX_RC_ONE_PASS;
    cfg.rc_end_usage = VPX_CBR;
    cfg.rc_min_quantizer = 2; cfg.rc_max_quantizer = 56;
    cfg.rc_undershoot_pct = 100; cfg.rc_overshoot_pct = 15;
    cfg.rc_buf_initial_sz = 500; cfg.rc_buf_optimal_sz = 600; cfg.rc_buf_sz = 1000;
    cfg.rc_dropframe_thresh = 0;
    cfg.kf_mode = VPX_KF_AUTO;
    cfg.kf_max_dist = (unsigned)(fps > 0 ? fps * 10 : 300);   // a key frame every 10 s at most; a PLI asks for one sooner
    cfg.g_threads = w * h >= 640 * 480 ? 2 : 1;
    if (layers == 2) {   // libvpx's two-layer pattern (examples/vpx_temporal_svc_encoder.c, mode 1); libwebrtc splits the rate 60/40 too
      cfg.ts_number_layers = 2; cfg.ts_periodicity = 2;
      cfg.ts_layer_id[0] = 0; cfg.ts_layer_id[1] = 1;
      cfg.ts_rate_decimator[0] = 2; cfg.ts_rate_decimator[1] = 1;
      layerRates(bps);
    }
    if (vpx_codec_enc_init(&ctx, vpx_codec_vp8_cx(), &cfg, 0)) return;
    // ponytail: -8 is libvpx's real-time speed for a generic C build (no SIMD); a desktop keeps 640x480 at 30 fps, a Pi 3 does not.
    vpx_codec_control(&ctx, VP8E_SET_CPUUSED, -8);
    vpx_codec_control(&ctx, VP8E_SET_NOISE_SENSITIVITY, 0);
    vpx_codec_control(&ctx, VP8E_SET_STATIC_THRESHOLD, 1);
    vpx_codec_control(&ctx, VP8E_SET_TOKEN_PARTITIONS, VP8_ONE_TOKENPARTITION);
    vpx_codec_control(&ctx, VP8E_SET_MAX_INTRA_BITRATE_PCT, 300);
    vpx_img_alloc(&img, VPX_IMG_FMT_I420, (unsigned)w, (unsigned)h, 16);
    ok = true;
  }
  ~Vp8Enc() override { if (ok) { vpx_img_free(&img); vpx_codec_destroy(&ctx); } }
  bool encode(const uint32_t* px, int, int, int64_t ms, bool forceKey, std::vector<uint8_t>& out, bool& key) override {
    out.clear(); key = false;
    if (!ok) return false;
    toI420(px, w, h, w, img.planes[0], img.stride[0], img.planes[1], img.stride[1], img.planes[2], img.stride[2]);
    vpx_enc_frame_flags_t flags = forceKey ? VPX_EFLAG_FORCE_KF : 0;
    if (forceKey) count = 0;
    tid = layers == 2 ? (int)(count & 1) : 0;
    if (layers == 2) {
      // TL0 refers to and updates the last frame only; TL1 refers to it and updates nothing, so dropping it loses nothing that follows
      flags |= VP8_EFLAG_NO_REF_GF | VP8_EFLAG_NO_REF_ARF | VP8_EFLAG_NO_UPD_GF | VP8_EFLAG_NO_UPD_ARF;
      if (tid == 1) flags |= VP8_EFLAG_NO_UPD_LAST | VP8_EFLAG_NO_UPD_ENTROPY;
      vpx_codec_control(&ctx, VP8E_SET_TEMPORAL_LAYER_ID, tid);
    }
    if (vpx_codec_encode(&ctx, &img, ms, 1, flags, VPX_DL_REALTIME)) return false;
    vpx_codec_iter_t it = nullptr;
    while (const vpx_codec_cx_pkt_t* p = vpx_codec_get_cx_data(&ctx, &it))
      if (p->kind == VPX_CODEC_CX_FRAME_PKT) {
        out.insert(out.end(), (const uint8_t*)p->data.frame.buf, (const uint8_t*)p->data.frame.buf + p->data.frame.sz);
        key = key || (p->data.frame.flags & VPX_FRAME_IS_KEY);
      }
    if (key) { tid = 0; count = 0; }
    sync = tid > 0; nonref = tid > 0;
    count++;
    return !out.empty();
  }
  int qp() override {
    int q = -1;
    if (ok) vpx_codec_control(&ctx, VP8E_GET_LAST_QUANTIZER, &q);
    return q;
  }
  void setRate(int bps, int) override {
    if (!ok || cfg.rc_target_bitrate == (unsigned)(bps / 1000)) return;
    cfg.rc_target_bitrate = (unsigned)(bps / 1000);
    if (layers == 2) layerRates(bps);
    vpx_codec_enc_config_set(&ctx, &cfg);
  }
  void layerRates(int bps) { cfg.ts_target_bitrate[0] = (unsigned)(bps * 6 / 10000); cfg.ts_target_bitrate[1] = (unsigned)(bps / 1000); }
};
struct Vp8Dec : VideoDecoder {
  vpx_codec_ctx_t ctx;
  bool ok = false;
  Vp8Dec() {
    vpx_codec_dec_cfg_t c;
    memset(&c, 0, sizeof c);
    c.threads = 1;
    ok = vpx_codec_dec_init(&ctx, vpx_codec_vp8_dx(), &c, 0) == VPX_CODEC_OK;
  }
  ~Vp8Dec() override { if (ok) vpx_codec_destroy(&ctx); }
  bool decode(const uint8_t* data, size_t n, std::vector<uint32_t>& px, int& w, int& h) override {
    if (!ok || vpx_codec_decode(&ctx, data, (unsigned)n, nullptr, 0)) return false;
    vpx_codec_iter_t it = nullptr;
    bool got = false;
    while (vpx_image_t* im = vpx_codec_get_frame(&ctx, &it)) {
      w = (int)im->d_w; h = (int)im->d_h;
      px.resize((size_t)w * h);
      fromI420(im->planes[0], im->stride[0], im->planes[1], im->stride[1], im->planes[2], im->stride[2], w, h, px.data());
      got = true;
    }
    return got;
  }
};
}  // namespace

VideoEncoder* vp8Encoder(int w, int h, int bps, int fps, int layers) {
  Vp8Enc* e = new Vp8Enc(w, h, bps, fps, layers);
  if (!e->ok) { delete e; return nullptr; }
  return e;
}
VideoDecoder* vp8Decoder() {
  Vp8Dec* d = new Vp8Dec();
  if (!d->ok) { delete d; return nullptr; }
  return d;
}

#else
VideoEncoder* vp8Encoder(int, int, int, int, int) { return nullptr; }
VideoDecoder* vp8Decoder() { return nullptr; }
#endif

#ifndef __APPLE__   // videotoolbox.cpp on macOS; V4L2 M2M on a Pi is for the cross-platform pass
bool h264Available() { return false; }
VideoEncoder* h264Encoder(int, int, int, int) { return nullptr; }
VideoDecoder* h264Decoder() { return nullptr; }
#endif

// ---- Opus. Deep PLC and DRED where the build has them (ENABLE_DEEP_PLC, ENABLE_DRED: plugins/webrtc; zinc:discord-voice builds without).
struct OpusEnc { OpusEncoder* e; int ch; };
struct OpusDec {
  OpusDecoder* d;
#ifdef ENABLE_DRED
  OpusDREDDecoder* dd = nullptr;
  OpusDRED* dred = nullptr;
#endif
};
OpusEnc* opusEncoder(int channels, int bps) {
  int err = 0;
  OpusEncoder* e = opus_encoder_create(48000, channels, OPUS_APPLICATION_VOIP, &err);
  if (!e || err != OPUS_OK) return nullptr;
  opus_encoder_ctl(e, OPUS_SET_INBAND_FEC(1));
  opus_encoder_ctl(e, OPUS_SET_PACKET_LOSS_PERC(5));
  OpusEnc* r = new OpusEnc{e, channels};
  opusSetBitrate(r, bps);
  return r;
}
void opusSetBitrate(OpusEnc* e, int bps) {
  const bool low = bps <= 16000;
  opus_encoder_ctl(e->e, OPUS_SET_BITRATE(bps));
  opus_encoder_ctl(e->e, OPUS_SET_DTX(low ? 1 : 0));
  opus_encoder_ctl(e->e, OPUS_SET_SIGNAL(low ? OPUS_SIGNAL_VOICE : OPUS_AUTO));
  opus_encoder_ctl(e->e, OPUS_SET_MAX_BANDWIDTH(low ? OPUS_BANDWIDTH_WIDEBAND : OPUS_BANDWIDTH_FULLBAND));
}
void opusSetLoss(OpusEnc* e, int pct) { opus_encoder_ctl(e->e, OPUS_SET_PACKET_LOSS_PERC(pct < 0 ? 0 : pct > 100 ? 100 : pct)); }
bool opusSetDred(OpusEnc* e, int ms) {
#ifdef ENABLE_DRED
  return opus_encoder_ctl(e->e, OPUS_SET_DRED_DURATION(ms / 10)) == OPUS_OK;
#else
  (void)e; (void)ms;
  return false;
#endif
}
int opusEncode(OpusEnc* e, const float* pcm, uint8_t* out, int max, int samples) { return opus_encode_float(e->e, pcm, samples, out, max); }
void opusFree(OpusEnc* e) { if (e) { opus_encoder_destroy(e->e); delete e; } }
OpusDec* opusDecoder() {
  int err = 0;
  OpusDecoder* d = opus_decoder_create(48000, 1, &err);
  if (!d || err != OPUS_OK) return nullptr;
  OpusDec* r = new OpusDec{d};
#ifdef ENABLE_DEEP_PLC
  opus_decoder_ctl(d, OPUS_SET_COMPLEXITY(5));   // 5 and up: the concealment is the neural one (deep PLC)
#endif
#ifdef ENABLE_DRED
  r->dd = opus_dred_decoder_create(&err);
  r->dred = opus_dred_alloc(&err);
#endif
  return r;
}
int opusSamples(const uint8_t* data, int n) { return opus_packet_get_nb_samples(data, n, 48000); }
bool opusHasFec(const uint8_t* data, int n) { return opus_packet_has_lbrr(data, n) > 0; }
int opusDecode(OpusDec* d, const uint8_t* data, int n, float* pcm, int max, bool fec) {
  return opus_decode_float(d->d, data, data ? n : 0, pcm, max, fec ? 1 : 0);
}
int opusDredParse(OpusDec* d, const uint8_t* data, int n, int maxSamples) {
#ifdef ENABLE_DRED
  if (!d->dd || !d->dred) return 0;
  int end = 0;
  const int r = opus_dred_parse(d->dd, d->dred, data, n, maxSamples, 48000, &end, 0);
  return r > 0 ? r : 0;
#else
  (void)d; (void)data; (void)n; (void)maxSamples;
  return 0;
#endif
}
int opusDredDecode(OpusDec* d, int offset, float* pcm, int samples) {
#ifdef ENABLE_DRED
  return opus_decoder_dred_decode_float(d->d, d->dred, offset, pcm, samples);
#else
  (void)d; (void)offset; (void)pcm; (void)samples;
  return -1;
#endif
}
void opusFree(OpusDec* d) {
  if (!d) return;
#ifdef ENABLE_DRED
  if (d->dd) opus_dred_decoder_destroy(d->dd);
  if (d->dred) opus_dred_free(d->dred);
#endif
  opus_decoder_destroy(d->d);
  delete d;
}

// ---- reassembly
void Reassembler::push(const uint8_t* p, size_t n, int64_t nowMs) {
  if (n < 12 || (p[0] >> 6) != 2) return;
  size_t hl = 12 + 4 * (p[0] & 15);
  if ((p[0] & 0x10) && n >= hl + 4) hl += 4 + 4 * (size_t)be16(p + hl + 2);
  if (p[0] & 0x20) n -= p[n - 1] < n ? p[n - 1] : 0;   // padding
  if (hl > n) return;
  const uint16_t seq = be16(p + 2);
  const int16_t step = maxSeq < 0 ? 0 : (int16_t)(uint16_t)(seq - (uint16_t)maxSeq);
  if (step > 3000 || step < -3000) { q.clear(); next = -1; maxSeq = -1; waitKey = true; }   // the sender started over (a new codec, new sequence numbers)
  const int64_t ext = maxSeq < 0 ? seq : maxSeq + step;
  if (ext > maxSeq) maxSeq = ext;
  if (next < 0) next = ext;
  if (ext < next || q.count(ext)) return;   // too late, or a copy
  Pkt& k = q[ext];
  k.ts = be32(p + 4); k.marker = (p[1] & 0x80) != 0; k.at = nowMs;
  k.payload.assign(p + hl, p + n);
}

// The payload of one packet appended to a frame; false when it cannot start or continue one.
bool Reassembler::payload(const Pkt& p, std::vector<uint8_t>& out, bool first, bool& key) {
  const uint8_t* d = p.payload.data();
  const size_t n = p.payload.size();
  if (n == 0) return false;
  if (codec == OPUS) { out.insert(out.end(), d, d + n); return true; }
  if (codec == VP8) {   // RFC 7741: the payload descriptor
    size_t i = 1;
    const bool start = (d[0] & 0x10) && (d[0] & 7) == 0;
    if (d[0] & 0x80) {
      if (n < 2) return false;
      const uint8_t x = d[1];
      i = 2;
      if (x & 0x80) i += i < n && (d[i] & 0x80) ? 2 : 1;
      if (x & 0x40) i++;
      if (x & 0x30) i++;
    }
    if (i >= n || first != start) return false;
    if (first) key = (d[i] & 1) == 0;
    out.insert(out.end(), d + i, d + n);
    return true;
  }
  // H.264, RFC 6184: single NAL units, STAP-A and FU-A, written out as Annex B
  static const uint8_t sc[4] = {0, 0, 0, 1};
  const int type = d[0] & 0x1F;
  auto nal = [&](const uint8_t* b, size_t m) {
    if (m == 0) return;
    const int t = b[0] & 0x1F;
    if (t == 5 || t == 7) key = true;
    out.insert(out.end(), sc, sc + 4);
    out.insert(out.end(), b, b + m);
  };
  if (type >= 1 && type <= 23) nal(d, n);
  else if (type == 24) {
    for (size_t o = 1; o + 2 <= n;) {
      const size_t m = be16(d + o);
      if (o + 2 + m > n) return false;
      nal(d + o + 2, m);
      o += 2 + m;
    }
  } else if (type == 28) {
    if (n < 2) return false;
    if (d[1] & 0x80) {
      const uint8_t h = (uint8_t)((d[0] & 0xE0) | (d[1] & 0x1F));
      if ((h & 0x1F) == 5 || (h & 0x1F) == 7) key = true;
      out.insert(out.end(), sc, sc + 4);
      out.push_back(h);
    } else if (first) return false;   // a fragment without its start
    out.insert(out.end(), d + 2, d + n);
  } else return false;
  return true;
}

bool Reassembler::pop(std::vector<uint8_t>& frame, int64_t nowMs, int& lost, bool& key) {
  lost = 0;
  const int64_t wait = waitMs > 0 ? waitMs : codec == OPUS ? 60 : 100;   // ms a gap may take to fill (reordering, a retransmission)
  while (!q.empty()) {
    auto it = q.begin();
    if (it->first != next) {   // a gap before the oldest packet
      if (nowMs - it->second.at < wait && q.size() < 600) return false;
      if (codec == OPUS) lost += (int)(it->first - next < 5 ? it->first - next : 5);
      else { waitKey = true; askKey = true; }
      next = it->first;
    }
    frame.clear(); key = false;
    if (codec == OPUS) {
      const bool ok = payload(it->second, frame, true, key);
      q.erase(it); next++;
      if (ok) return true;
      continue;
    }
    // video: the packets of one timestamp, in sequence, up to the marker bit
    const uint32_t ts = it->second.ts;
    int64_t s = next;
    bool complete = false;
    for (auto j = it; j != q.end() && j->first == s && j->second.ts == ts; ++j, ++s)
      if (j->second.marker) { complete = true; break; }
    if (!complete) {
      auto j = q.find(s);   // the run ended on a packet of another frame: the marker packet is lost
      const bool broken = j != q.end() && j->second.ts != ts;
      if (!broken && nowMs - it->second.at < wait && q.size() < 600) return false;
      while (!q.empty() && q.begin()->first < s) q.erase(q.begin());   // drop what came of this frame
      next = s; waitKey = true; askKey = true; dropped++;
      continue;
    }
    bool ok = true;
    for (int64_t k = next; k <= s && ok; k++) ok = payload(q[k], frame, k == next, key);
    while (!q.empty() && q.begin()->first <= s) q.erase(q.begin());
    next = s + 1;
    if (!ok) { waitKey = true; askKey = true; dropped++; continue; }
    if (waitKey && !key) { askKey = true; dropped++; continue; }   // nothing decodes before a key frame (the host asks at most every 300 ms)
    waitKey = false;
    return true;
  }
  return false;
}

}  // namespace media
