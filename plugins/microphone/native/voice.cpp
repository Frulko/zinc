// zinc:microphone's voice processing (voice.h). Frames of 10 ms: the microphone's frame and the far end's frame of the same turn go into
// Speex's echo canceller (a 250 ms filter: the speaker's latency, the room and the microphone's latency), then the preprocessor, which takes
// away the echo left (it reads the canceller's state), the noise, and levels the voice. The far end is paired with the microphone by count,
// not by clock: both run at the same rate, so the delay between them stays what it was when they met, and the filter learns it.
#include "voice.h"
#include "../../audio/vendor/miniaudio.h"
#include <speex/speex_echo.h>
#include <speex/speex_preprocess.h>
#include <algorithm>
#include <vector>

namespace voice {
namespace {
const int kTailMs = 250;     // the echo the filter models: up to 250 ms after the sound left
const int kMaxLeadMs = 200;
const float kAgcLevel = 24000;   // Speex's loudness target: its default (8000) brings a voice down to about -33 dBFS; this keeps it near -24  // far end not yet paired beyond this (the microphone stopped reading): the oldest goes
inline short s16(float v) { v *= 32768.f; return (short)(v > 32767.f ? 32767.f : v < -32768.f ? -32768.f : v); }
}  // namespace

struct Proc {
  int rate = 0, frame = 0;
  SpeexEchoState* echo = nullptr;
  SpeexPreprocessState* pre = nullptr;
  std::vector<float> ref, in, out;   // far end not paired yet; microphone waiting for a whole frame; processed, not given back yet
  std::vector<short> rec, play, res;
  ma_linear_resampler rs;
  int rsFrom = 0;   // the far end's rate the resampler converts from (0: none yet)
};

Proc* open(int rate, int what) {
  if (!what || rate <= 0) return nullptr;
  Proc* p = new Proc();
  p->rate = rate; p->frame = rate / 100;
  p->rec.resize(p->frame); p->play.resize(p->frame); p->res.resize(p->frame);
  p->out.assign(p->frame, 0.f);
  if (what & ECHO) {
    p->echo = speex_echo_state_init(p->frame, rate * kTailMs / 1000);
    speex_echo_ctl(p->echo, SPEEX_ECHO_SET_SAMPLING_RATE, &rate);
  }
  p->pre = speex_preprocess_state_init(p->frame, rate);
  // the echo left is taken away by the denoiser's gains, so it runs with the echo canceller too, only without its noise floor
  int on = (what & (NOISE | ECHO)) ? 1 : 0;
  speex_preprocess_ctl(p->pre, SPEEX_PREPROCESS_SET_DENOISE, &on);
  if (!(what & NOISE)) { int db = 0; speex_preprocess_ctl(p->pre, SPEEX_PREPROCESS_SET_NOISE_SUPPRESS, &db); }
  on = (what & GAIN) ? 1 : 0;
  speex_preprocess_ctl(p->pre, SPEEX_PREPROCESS_SET_AGC, &on);
  float level = kAgcLevel;
  speex_preprocess_ctl(p->pre, SPEEX_PREPROCESS_SET_AGC_LEVEL, &level);
  if (p->echo) speex_preprocess_ctl(p->pre, SPEEX_PREPROCESS_SET_ECHO_STATE, p->echo);
  return p;
}

void reference(Proc* p, const float* s, int n, int rate) {
  if (!p || !p->echo || n <= 0) return;
  if (rate == p->rate) p->ref.insert(p->ref.end(), s, s + n);
  else {
    if (rate != p->rsFrom) {
      if (p->rsFrom) ma_linear_resampler_uninit(&p->rs, nullptr);
      ma_linear_resampler_config c = ma_linear_resampler_config_init(ma_format_f32, 1, (ma_uint32)rate, (ma_uint32)p->rate);
      if (ma_linear_resampler_init(&c, nullptr, &p->rs) != MA_SUCCESS) { p->rsFrom = 0; return; }
      p->rsFrom = rate;
    }
    ma_uint64 inN = (ma_uint64)n, outN = 0;
    ma_linear_resampler_get_expected_output_frame_count(&p->rs, inN, &outN);
    const size_t at = p->ref.size();
    p->ref.resize(at + (size_t)outN + 1);
    outN = p->ref.size() - at;
    ma_linear_resampler_process_pcm_frames(&p->rs, s, &inN, p->ref.data() + at, &outN);
    p->ref.resize(at + (size_t)outN);
  }
  const size_t lead = (size_t)p->rate * kMaxLeadMs / 1000;
  if (p->ref.size() > lead) p->ref.erase(p->ref.begin(), p->ref.end() - (long)lead);
}

void process(Proc* p, float* io, int frames, int ch) {
  if (!p || frames <= 0) return;
  for (int f = 0; f < frames; f++) p->in.push_back(ch == 2 ? (io[2 * f] + io[2 * f + 1]) * 0.5f : io[f * ch]);
  const int N = p->frame;
  size_t used = 0;
  for (; used + N <= p->in.size(); used += N) {
    for (int i = 0; i < N; i++) p->rec[i] = s16(p->in[used + i]);
    short* res = p->rec.data();
    if (p->echo) {
      const int have = (int)std::min(p->ref.size(), (size_t)N);   // no far end (nothing played): silence
      for (int i = 0; i < N; i++) p->play[i] = i < have ? s16(p->ref[i]) : 0;
      p->ref.erase(p->ref.begin(), p->ref.begin() + have);
      speex_echo_cancellation(p->echo, p->rec.data(), p->play.data(), p->res.data());
      res = p->res.data();
    }
    speex_preprocess_run(p->pre, res);
    for (int i = 0; i < N; i++) p->out.push_back(res[i] / 32768.f);
  }
  p->in.erase(p->in.begin(), p->in.begin() + (long)used);
  for (int f = 0; f < frames; f++) for (int c = 0; c < ch; c++) io[f * ch + c] = p->out[f];
  p->out.erase(p->out.begin(), p->out.begin() + frames);
}

void close(Proc* p) {
  if (!p) return;
  if (p->echo) speex_echo_state_destroy(p->echo);
  speex_preprocess_state_destroy(p->pre);
  if (p->rsFrom) ma_linear_resampler_uninit(&p->rs, nullptr);
  delete p;
}
}  // namespace voice
