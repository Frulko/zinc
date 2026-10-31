// zinc:microphone's voice processing (voice.cpp): acoustic echo cancellation, noise suppression and gain control for a call, by SpeexDSP
// (vendor/speexdsp, BSD-3-Clause): its MDF echo canceller, with the preprocessor's residual echo suppressor, denoiser and AGC behind it.
// No engine types: tests/native/voice_aec_test.cpp runs it on its own.
#pragma once

namespace voice {
struct Proc;
enum { ECHO = 1, NOISE = 2, GAIN = 4 };
/** A processor for a microphone at `rate` frames per second; `what` is ECHO | NOISE | GAIN (0: nullptr). */
Proc* open(int rate, int what);
/** The far end: what the speakers play, mono at `rate` (resampled to the microphone's), in the order it is played. */
void reference(Proc* p, const float* samples, int n, int rate);
/** `frames` frames of the microphone, `ch` channels interleaved, processed in place, 10 ms late (the first 10 ms out are silence). Two
 *  channels are processed as their mix, written to both. */
void process(Proc* p, float* io, int frames, int ch);
void close(Proc* p);
}  // namespace voice
