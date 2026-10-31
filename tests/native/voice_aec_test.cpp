// zinc:microphone's echo canceller (plugins/microphone/native/voice.cpp) on a recorded far end (tests/t0/voice_aec.sh): a recorded voice
// played into a simulated room (40 ms to the microphone, 150 ms of decaying reflections, a little noise) makes the near end; the processor
// gets the far end as its reference and the near end as its microphone, 10 ms at a time. Prints the echo return loss enhancement (ERLE:
// the echo's energy over what is left of it) from 6 to 9 s, once the filter has converged, and fails under 20 dB; then the person near the
// microphone talks over it (another recording, 9 to 12 s): their voice must come through (no more than 10 dB lost while both talk).
#include "voice.h"
#include "../../plugins/audio/vendor/miniaudio.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <vector>

int main(int argc, char** argv) {
  if (argc < 3) { fprintf(stderr, "usage: voice_aec_test <far end audio file> <near end audio file>\n"); return 2; }
  const int rate = 48000;
  ma_decoder_config dc = ma_decoder_config_init(ma_format_f32, 1, rate);
  ma_uint64 n = 0;
  void* pcm = nullptr;
  if (ma_decode_file(argv[1], &dc, &n, &pcm) != MA_SUCCESS) { fprintf(stderr, "cannot decode %s\n", argv[1]); return 2; }
  const float* far = (const float*)pcm;
  ma_uint64 nn = 0;
  void* pcm2 = nullptr;
  if (ma_decode_file(argv[2], &dc, &nn, &pcm2) != MA_SUCCESS) { fprintf(stderr, "cannot decode %s\n", argv[2]); return 2; }
  const float* talk = (const float*)pcm2;
  if (n < (ma_uint64)rate * 12 || nn < (ma_uint64)rate * 3) { fprintf(stderr, "the recordings are too short\n"); return 2; }
  n = (ma_uint64)rate * 12;
  const size_t dt = (size_t)rate * 9;   // double talk from here
  // the room: a direct path after 40 ms at half the level, then reflections decaying by 60 dB over 150 ms
  std::vector<float> ir((size_t)rate * 190 / 1000, 0.f);
  const size_t d0 = (size_t)rate * 40 / 1000;
  ir[d0] = 0.5f;
  uint32_t x = 12345;
  for (size_t i = d0 + 1; i < ir.size(); i++) {
    x = x * 1103515245u + 12345u;
    const float r = (float)((x >> 16) & 0x7fff) / 32768.f - 0.5f;
    ir[i] = 0.25f * r * expf(-6.9f * (float)(i - d0) / (float)(ir.size() - d0));
  }
  std::vector<float> near((size_t)n, 0.f);
  for (size_t t = 0; t < (size_t)n; t++) {
    float s = 0;
    for (size_t k = d0, e = t < ir.size() ? t + 1 : ir.size(); k < e; k++) s += ir[k] * far[t - k];
    x = x * 1103515245u + 12345u;
    near[t] = s + ((float)((x >> 16) & 0x7fff) / 32768.f - 0.5f) * 0.0006f;   // the room's noise, about -70 dBFS
    if (t >= dt) near[t] += 0.5f * talk[t - dt];
  }
  voice::Proc* p = voice::open(rate, voice::ECHO | voice::NOISE | voice::GAIN);
  std::vector<float> out(near);
  const int block = rate / 50;   // the microphone's 20 ms blocks
  for (size_t at = 0; at + block <= (size_t)n; at += block) {
    voice::reference(p, far + at, block, rate);
    voice::process(p, out.data() + at, block, 1);
  }
  voice::close(p);
  double e = 0, r = 0, v = 0, o = 0;
  for (size_t t = (size_t)rate * 6; t < dt; t++) { e += (double)near[t] * near[t]; r += (double)out[t] * out[t]; }
  for (size_t t = dt + rate / 2; t < (size_t)n; t++) { v += 0.25 * talk[t - dt] * talk[t - dt]; o += (double)out[t] * out[t]; }
  const double erle = 10 * log10(e / (r > 1e-12 ? r : 1e-12)), kept = 10 * log10(o / v);
  printf("far end %.0f s, echo %.1f dBFS, ERLE %.1f dB; double talk: near voice %.1f dBFS, out %+.1f dB of it\n", (double)n / rate,
         10 * log10(e / (double)(dt - rate * 6)), erle, 10 * log10(v / (double)(n - dt - rate / 2)), kept);
  // gain control alone: the near voice 25 dB quieter, 3 s of it; the last 1.5 s come out louder
  std::vector<float> quiet((size_t)rate * 3);
  for (size_t t = 0; t < quiet.size(); t++) quiet[t] = 0.03f * talk[t];
  const std::vector<float> asIs(quiet);
  voice::Proc* g = voice::open(rate, voice::GAIN);
  for (size_t at = 0; at + block <= quiet.size(); at += block) voice::process(g, quiet.data() + at, block, 1);
  voice::close(g);
  double qi = 0, qo = 0;
  for (size_t t = quiet.size() / 2; t < quiet.size(); t++) { qi += (double)asIs[t] * asIs[t]; qo += (double)quiet[t] * quiet[t]; }
  const double raised = 10 * log10(qo / qi);
  printf("gain control: a voice at %.1f dBFS comes out %+.1f dB\n", 10 * log10(qi / (double)(quiet.size() / 2)), raised);
  ma_free(pcm2, nullptr);
  ma_free(pcm, nullptr);
  return erle >= 20 && kept > -10 && raised > 6 ? 0 : 1;
}
