// The echo path of a Discord call (plugins/discord-voice/native/echo.h, tests/t0/discord_echo.sh): the playback callback hands the played stereo
// frames to played() and the capture side runs process() on each 20 ms microphone frame, as voice.host.cpp does. The "remote voice" is
// low-passed noise with a syllable envelope (a stand-in for decoded Opus); the room is a 40 ms direct path and 150 ms of reflections, plus a
// little noise. One path has the canceller off (the microphone is left alone), the other on; prints the echo return loss enhancement from
// 6 s on and fails under 15 dB.
#include "../../plugins/discord-voice/native/echo.h"
#include <math.h>
#include <stdio.h>
#include <stdint.h>
#include <vector>

int main() {
  const int rate = 48000, frame = 960, n = rate * 10;
  uint32_t x = 777;
  auto rnd = [&]() { x = x * 1103515245u + 12345u; return (float)((x >> 16) & 0x7fff) / 32768.f - 0.5f; };
  std::vector<float> far(n);
  float lp = 0, lp2 = 0;
  for (int t = 0; t < n; t++) {
    lp += 0.25f * (rnd() - lp); lp2 += 0.25f * (lp - lp2);
    far[t] = 4.f * lp2 * (0.55f + 0.45f * sinf(2.f * (float)M_PI * 4.f * (float)t / rate));
  }
  std::vector<float> ir((size_t)rate * 190 / 1000, 0.f);
  const size_t d0 = (size_t)rate * 40 / 1000;
  ir[d0] = 0.5f;
  for (size_t i = d0 + 1; i < ir.size(); i++) ir[i] = 0.25f * rnd() * expf(-6.9f * (float)(i - d0) / (float)(ir.size() - d0));
  EchoPath off, on;
  on.set(true, rate);
  double r0 = 0, r1 = 0;
  std::vector<float> played(frame * 2), mic0(frame * 2), mic1(frame * 2);
  for (int at = 0; at + frame <= n; at += frame) {
    for (int i = 0; i < frame; i++) played[2 * i] = played[2 * i + 1] = far[at + i];
    on.played(played.data(), frame);   // the speakers play this block ...
    off.played(played.data(), frame);
    for (int i = 0; i < frame; i++) {   // ... and the microphone hears it, through the room
      const int t = at + i;
      float s = 0;
      for (size_t k = d0, m = (size_t)t < ir.size() ? (size_t)t + 1 : ir.size(); k < m; k++) s += ir[k] * far[t - k];
      s += rnd() * 0.0006f;
      mic0[2 * i] = mic0[2 * i + 1] = mic1[2 * i] = mic1[2 * i + 1] = s;
    }
    off.process(mic0.data(), frame, rate);
    on.process(mic1.data(), frame, rate);
    if (at >= rate * 6)
      for (int i = 0; i < frame; i++) { r0 += (double)mic0[2 * i] * mic0[2 * i]; r1 += (double)mic1[2 * i] * mic1[2 * i]; }
  }
  const double len = (double)(n - rate * 6), erle = 10 * log10(r0 / (r1 > 1e-12 ? r1 : 1e-12));
  printf("echo %.1f dBFS off, %.1f dBFS on: ERLE %.1f dB\n", 10 * log10(r0 / len), 10 * log10(r1 / len), erle);
  if (erle < 15) { printf("FAIL: the echo is cancelled by less than 15 dB\n"); return 1; }
  printf("ok\n");
  return 0;
}
