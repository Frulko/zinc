// The sound of a console core (ZN-759): zinc:audio's mixer (audio_console.cpp) and what a console HAL does with it. The HAL defines
// zn_console_audio_output() (1: it plays the mix) and, at the end of each frame, renders what its output will need next with
// zn_console_audio_render; a HAL with an audio thread queues the samples in a ZnAudioRing, which that thread drains.
#pragma once
#include <stdint.h>
#include <string.h>

#ifndef ZN_CONSOLE_AUDIO_NAME
#define ZN_CONSOLE_AUDIO_NAME "console"   // what zinc:audio's backend() names (sceAudio, ndsp, audsrv...)
#endif

extern "C" {
int zn_console_audio_output(void);                    // the HAL's: 1 when it plays the mix
const char* zn_console_audio_backend(void);           // the HAL's (optional): the name zinc:audio backend() gives
int zn_console_audio_rate(void);                      // the mixer's frames per second once a program made a sound, else 0 (the HAL opens its output then)
void zn_console_audio_render(int16_t* lr, int frames);   // the next frames of the mix, stereo interleaved
}

/** A ring of stereo s16 frames between the program's thread (it writes in hal_frame_end) and the HAL's audio thread (it reads blocks):
 *  one writer, one reader, indices that only grow. */
struct ZnAudioRing {
  int16_t* buf;          // cap frames x 2
  uint32_t cap;          // frames, a power of two
  volatile uint32_t w, r;
  uint32_t filled() const { return w - r; }
  /** Renders blocks of `block` frames until `ahead` frames wait. */
  void fill(uint32_t block, uint32_t ahead) {
    while (filled() + block <= ahead && filled() + block <= cap) {
      const uint32_t at = w & (cap - 1);
      if (at + block <= cap) zn_console_audio_render(buf + at * 2, (int)block);
      else { int16_t tmp[4096]; const uint32_t n = block <= 2048 ? block : 2048; zn_console_audio_render(tmp, (int)n); for (uint32_t i = 0; i < n; i++) { const uint32_t k = (w + i) & (cap - 1); buf[k * 2] = tmp[i * 2]; buf[k * 2 + 1] = tmp[i * 2 + 1]; } w = w + n; continue; }
      w = w + block;
    }
  }
  /** Copies the next `n` frames out (silence when the program has not rendered them: a slow frame). */
  void take(int16_t* out, uint32_t n) {
    for (uint32_t i = 0; i < n; i++) {
      if (filled() == 0) { memset(out + i * 2, 0, (n - i) * 4); return; }
      const uint32_t k = r & (cap - 1);
      out[i * 2] = buf[k * 2]; out[i * 2 + 1] = buf[k * 2 + 1];
      r = r + 1;
    }
  }
};
