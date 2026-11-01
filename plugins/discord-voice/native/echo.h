// The echo cancellation of a call: what the speakers played (the far end, stereo, as the playback callback hands it to the device) is the
// reference of zinc:microphone's SpeexDSP canceller (../../microphone/native/voice.h), and the microphone's frames are cleaned of it before
// they are encoded. Not thread-safe: the caller holds one lock around played() and process(). tests/native/discord_echo_test.cpp runs it alone.
#pragma once
#include "../../microphone/native/voice.h"
#include <vector>

struct EchoPath {
  voice::Proc* p = nullptr;
  std::vector<float> ref;   // mono, played since the last process()
  ~EchoPath() { set(false, 0); }
  void set(bool on, int rate) {
    if (on == (p != nullptr)) return;
    if (p) { voice::close(p); p = nullptr; }
    ref.clear();
    if (on) p = voice::open(rate, voice::ECHO);
  }
  /** `frames` stereo frames just played. */
  void played(const float* st, int frames) {
    if (!p) return;
    for (int i = 0; i < frames; i++) ref.push_back(0.5f * (st[2 * i] + st[2 * i + 1]));
    if (ref.size() > 96000) ref.erase(ref.begin(), ref.end() - 48000);   // the microphone stopped: keep a second
  }
  /** `frames` stereo frames of the microphone, cleaned in place. */
  void process(float* st, int frames, int rate) {
    if (!p) return;
    if (!ref.empty()) { voice::reference(p, ref.data(), (int)ref.size(), rate); ref.clear(); }
    voice::process(p, st, frames, 2);
  }
};
