// zinc:audio on a console core (ZN-759): the native module 'Audio' of plugins/audio (its spec, plugins/audio/native/audio.spec.ts), linked into the
// core because a console loads no plugin library. miniaudio stays on the desktop: its engine needs atomics the PSP's and the PS2's MIPS cores do not
// have, and its device backends know none of these consoles. This is a small mixer with the same contract: sounds (tones, samples, WAV files) are
// handles, each play starts one of 32 voices, mixed in stereo with a linear resampler at the console's rate (console_audio.h: 44100 on the PSP,
// whose hardware resampler is broken, so only 44.1 kHz and its halves go out; 48000 on the Vita and the PS2; 22050 on the 3DS).
// The mix is rendered on the program's thread, when the HAL asks at the end of a frame (zn_console_audio_render), never on an audio thread: the
// program's calls and the mix never race, and the HAL's own thread (if it has one) only copies finished samples. Without an output (the headless
// core of the T0 tests) nothing pulls the mix but mix(), as on the desktop's null backend.
// load() takes PCM WAV (8 or 16 bits, mono or stereo) and Ogg Vorbis (stb_vorbis, the decoder plugins/audio vendors); FLAC and MP3 play on a
// desktop.
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>

#include "console_audio.h"
#include "zn/native.h"

extern "C" int stb_vorbis_decode_memory(const unsigned char* mem, int len, int* channels, int* sample_rate, short** output);   // stb_vorbis.c

#ifndef ZN_CONSOLE_AUDIO_RATE
#define ZN_CONSOLE_AUDIO_RATE 48000
#endif

namespace {
const int kSounds = 64, kVoices = 32, kStreams = 4;
const int kRate = ZN_CONSOLE_AUDIO_RATE;

struct Clip { std::vector<float> pcm; int ch = 0, rate = 0; bool used = false; };
struct Voice {
  int clip = -1, stream = -1;
  double pos = 0, step = 1;   // in the clip's frames
  float vol = 1, pan = 0;
  bool loop = false, used = false, pitched = false;
  uint64_t started = 0, from = 0, stopAt = 0;   // mixer frames: from = when a delayed voice starts, stopAt = when it ends (0: never)
};
struct Stream { std::vector<float> buf; size_t head = 0, count = 0; int ch = 0, rate = 0; bool used = false, primed = false; double underruns = 0, dropped = 0; float vol = 1; };
Clip clips[kSounds];
Voice voices[kVoices];
Stream streams[kStreams];
float master = 1;
uint64_t now = 0, plays = 0;   // frames mixed; voices started
bool started = false;          // a sound exists: the HAL opens its output (zn_console_audio_rate)
char errMsg[160] = "";
std::vector<double> outD;       // the D results (samples, mix, streamInfo), valid until the next call
std::vector<float> acc;

int fail(const char* why) { std::strncpy(errMsg, why, sizeof errMsg - 1); return -1; }
Clip* clipAt(int64_t h) { return h >= 0 && h < kSounds && clips[h].used ? &clips[h] : nullptr; }
int freeSlot() { for (int h = 0; h < kSounds; h++) if (!clips[h].used) return h; return fail("too many sounds loaded (64): unload() the ones no longer used"); }
int voiceId(const Voice& v) { return static_cast<int>(v.started & 0x7fffffff); }
Voice* voiceAt(int64_t id) { for (Voice& v : voices) if (v.used && id > 0 && voiceId(v) == id) return &v; return nullptr; }
bool live(const Voice& v) { return v.used; }
float rateOf(double r) { return r > 0 ? static_cast<float>(r < 1.0 / 64 ? 1.0 / 64 : r > 64 ? 64 : r) : 1.0f; }
float panOf(double p) { return p == p ? static_cast<float>(p < -1 ? -1 : p > 1 ? 1 : p) : 0.0f; }
int newClip(int ch, int rate, size_t frames) {
  const int h = freeSlot();
  if (h < 0) return -1;
  clips[h].pcm.assign(frames * static_cast<size_t>(ch), 0.0f);
  clips[h].ch = ch; clips[h].rate = rate; clips[h].used = true;
  started = true;
  return h;
}

// Mixes `frames` stereo frames into acc (cleared first) and moves the clock.
void mixInto(int frames) {
  acc.assign(static_cast<size_t>(frames) * 2, 0.0f);
  for (Voice& v : voices) {
    if (!v.used) continue;
    for (int i = 0; i < frames; i++) {
      const uint64_t t = now + static_cast<uint64_t>(i);
      if (t < v.from) continue;
      if (v.stopAt && t >= v.stopAt) { v.used = false; break; }
      float l = 0, r = 0;
      if (v.stream >= 0) {   // a stream: its next frame, or silence while it waits for PRIME
        Stream& s = streams[v.stream];
        const size_t prime = static_cast<size_t>(0.06 * s.rate) * static_cast<size_t>(s.ch);
        if (!s.primed && s.count >= prime) s.primed = true;
        if (!s.primed || s.count < static_cast<size_t>(s.ch)) { if (s.primed) { s.primed = false; s.underruns++; } continue; }
        l = s.buf[s.head]; r = s.ch == 2 ? s.buf[(s.head + 1) % s.buf.size()] : l;
        s.head = (s.head + static_cast<size_t>(s.ch)) % s.buf.size(); s.count -= static_cast<size_t>(s.ch);
        l *= s.vol; r *= s.vol;
      } else {
        Clip& c = clips[v.clip];
        const size_t n = c.pcm.size() / static_cast<size_t>(c.ch);
        if (v.pos >= static_cast<double>(n)) { if (v.loop && n) v.pos = std::fmod(v.pos, static_cast<double>(n)); else { v.used = false; break; } }
        const size_t k = static_cast<size_t>(v.pos);
        const float f = static_cast<float>(v.pos - static_cast<double>(k));
        const size_t k2 = k + 1 < n ? k + 1 : (v.loop ? 0 : k);
        const float* a = &c.pcm[k * static_cast<size_t>(c.ch)], *b = &c.pcm[k2 * static_cast<size_t>(c.ch)];
        l = a[0] + (b[0] - a[0]) * f;
        r = c.ch == 2 ? a[1] + (b[1] - a[1]) * f : l;
        v.pos += v.step;
      }
      const float gl = v.pan > 0 ? 1 - v.pan : 1, gr = v.pan < 0 ? 1 + v.pan : 1;   // balance: at -1 the right is silent
      acc[static_cast<size_t>(i) * 2] += l * v.vol * gl;
      acc[static_cast<size_t>(i) * 2 + 1] += r * v.vol * gr;
    }
  }
  now += static_cast<uint64_t>(frames);
}

int startVoice(int64_t h, double volume, bool loop, double rate, double pan, double offset, double delay) {
  Clip* c = clipAt(h);
  if (!c) return 0;
  Voice* v = nullptr;
  for (Voice& x : voices) if (!x.used) { v = &x; break; }
  if (!v) {   // all busy: the oldest one-shot gives way, a loop (the music) only when there is nothing else
    auto age = [](const Voice& x) { return x.started + (x.loop ? uint64_t(1) << 62 : 0); };
    v = &voices[0];
    for (Voice& x : voices) if (age(x) < age(*v)) v = &x;
  }
  const float r = rateOf(rate);
  *v = Voice{};
  v->used = true; v->clip = static_cast<int>(h); v->loop = loop; v->vol = static_cast<float>(volume > 0 ? volume : 0); v->pan = panOf(pan);
  v->pitched = r != 1.0f;
  v->step = static_cast<double>(c->rate) / kRate * r;
  v->pos = offset > 0 ? offset * c->rate : 0;
  v->from = delay > 0 ? now + static_cast<uint64_t>(delay * kRate) : 0;
  v->started = ++plays;
  return voiceId(*v);
}

// The tone of the desktop module: sine, square, triangle, sawtooth at peak 0.5 or a fixed xorshift noise, 5 ms fades at both ends.
int tone(int64_t wave, double hz, double seconds) {
  if (wave < 0 || wave > 4) return fail("unknown wave (0 sine, 1 square, 2 triangle, 3 sawtooth, 4 noise)");
  if (!(seconds > 0) || seconds > 60 || !(hz > 0) || hz > 20000) return fail("a tone lasts up to 60 seconds, between 0 and 20000 Hz");
  const size_t frames = static_cast<size_t>(seconds * kRate + 0.5);
  if (!frames) return fail("a tone shorter than one frame");
  const int h = newClip(1, kRate, frames);
  if (h < 0) return -1;
  float* p = clips[h].pcm.data();
  uint32_t x = 0x9E3779B9u;
  for (size_t i = 0; i < frames; i++) {
    const double ph = std::fmod(hz * static_cast<double>(i) / kRate, 1.0);
    float s;
    switch (wave) {
      case 0: s = static_cast<float>(0.5 * std::sin(6.283185307179586 * ph)); break;
      case 1: s = ph < 0.5 ? 0.5f : -0.5f; break;
      case 2: s = static_cast<float>(ph < 0.5 ? -0.5 + 2 * ph : 1.5 - 2 * ph); break;
      case 3: s = static_cast<float>(ph - 0.5); break;
      default: x ^= x << 13; x ^= x >> 17; x ^= x << 5; s = static_cast<float>(static_cast<int32_t>(x)) / 4294967296.0f; break;
    }
    p[i] = s;
  }
  size_t fade = kRate / 200;
  if (fade > frames / 2) fade = frames / 2;
  for (size_t i = 0; i < fade; i++) { const float g = static_cast<float>(i) / static_cast<float>(fade); p[i] *= g; p[frames - 1 - i] *= g; }
  return h;
}

uint32_t le(const uint8_t* p, int n) { uint32_t v = 0; for (int i = n - 1; i >= 0; i--) v = v << 8 | p[i]; return v; }
// A RIFF WAVE file of PCM samples (format 1, 8 or 16 bits); anything else says what a console core plays.
int loadWav(const uint8_t* d, size_t n) {
  if (n >= 4 && !std::memcmp(d, "OggS", 4)) {   // Ogg Vorbis, decoded whole (a sound effect, a jingle)
    int ch = 0, rate = 0;
    short* pcm = nullptr;
    const int frames = stb_vorbis_decode_memory(d, static_cast<int>(n), &ch, &rate, &pcm);
    if (frames <= 0 || !pcm || ch < 1 || ch > 2 || rate < 8000 || rate > 192000) { std::free(pcm); return fail("not an Ogg Vorbis file this decoder reads"); }
    const int h = newClip(ch, rate, static_cast<size_t>(frames));
    if (h >= 0) for (size_t i = 0; i < static_cast<size_t>(frames) * static_cast<size_t>(ch); i++) clips[h].pcm[i] = pcm[i] / 32768.0f;
    std::free(pcm);
    return h;
  }
  if (n < 12 || std::memcmp(d, "RIFF", 4) || std::memcmp(d + 8, "WAVE", 4)) return fail("a console core plays WAV (PCM, 8 or 16 bits) and Ogg Vorbis files; FLAC and MP3 play on a desktop");
  int ch = 0, rate = 0, bits = 0, fmt = 0;
  for (size_t at = 12; at + 8 <= n;) {
    const uint32_t len = le(d + at + 4, 4);
    const uint8_t* body = d + at + 8;
    if (at + 8 + len > n) break;
    if (!std::memcmp(d + at, "fmt ", 4) && len >= 16) { fmt = static_cast<int>(le(body, 2)); ch = static_cast<int>(le(body + 2, 2)); rate = static_cast<int>(le(body + 4, 4)); bits = static_cast<int>(le(body + 14, 2)); }
    if (!std::memcmp(d + at, "data", 4) && fmt) {
      if (fmt != 1 || (bits != 8 && bits != 16) || ch < 1 || ch > 2 || rate < 8000 || rate > 192000) return fail("a WAV of PCM samples, 8 or 16 bits, 1 or 2 channels");
      const size_t bytes = static_cast<size_t>(bits / 8), frames = len / bytes / static_cast<size_t>(ch);
      if (!frames) return fail("the file is empty");
      const int h = newClip(ch, rate, frames);
      if (h < 0) return -1;
      float* p = clips[h].pcm.data();
      for (size_t i = 0; i < frames * static_cast<size_t>(ch); i++)
        p[i] = bits == 8 ? (static_cast<float>(body[i]) - 128.0f) / 128.0f : static_cast<float>(static_cast<int16_t>(le(body + i * 2, 2))) / 32768.0f;
      return h;
    }
    at += 8 + len + (len & 1);
  }
  return fail("not a WAV file with PCM samples");
}

ZnStr zs(const char* s) { return ZnStr{s, static_cast<uint32_t>(std::strlen(s))}; }
ZnView dview() { return ZnView{outD.data(), static_cast<uint32_t>(outD.size())}; }
#define FN(name) int32_t name(void*, ZnCtx*, const ZnVal* a, ZnVal* r)
FN(fBackend) { (void)a; r->s = zs(zn_console_audio_rate() ? zn_console_audio_backend() : "null"); return ZN_OK; }
FN(fLoad) { r->i = a[0].v.n ? loadWav(static_cast<const uint8_t*>(a[0].v.p), a[0].v.n) : fail("the file is empty"); return ZN_OK; }
FN(fTone) { r->i = tone(a[0].i, a[1].d, a[2].d); return ZN_OK; }
FN(fError) { (void)a; r->s = zs(errMsg); return ZN_OK; }
FN(fDuration) { Clip* c = clipAt(a[0].i); r->d = c ? static_cast<double>(c->pcm.size() / static_cast<size_t>(c->ch)) / c->rate : 0; return ZN_OK; }
FN(fStop) { (void)r; for (Voice& v : voices) if (v.used && v.clip == a[0].i) v.used = false; return ZN_OK; }
FN(fUnload) { if (Clip* c = clipAt(a[0].i)) { fStop(nullptr, nullptr, a, r); *c = Clip{}; } return ZN_OK; }
FN(fPlay) { r->i = startVoice(a[0].i, a[1].d, a[2].i != 0, a[3].d, a[4].d, 0, 0) != 0; return ZN_OK; }
FN(fPlaying) { r->i = 0; for (Voice& v : voices) if (v.used && v.clip == a[0].i) r->i = 1; return ZN_OK; }
FN(fSetVolume) { (void)r; for (Voice& v : voices) if (v.used && v.clip == a[0].i) v.vol = static_cast<float>(a[1].d > 0 ? a[1].d : 0); return ZN_OK; }
FN(fSetLoop) { (void)r; for (Voice& v : voices) if (v.used && v.clip == a[0].i) v.loop = a[1].i != 0; return ZN_OK; }
FN(fSetRate) { (void)r; for (Voice& v : voices) if (v.used && v.pitched && v.clip == a[0].i) v.step = static_cast<double>(clips[v.clip].rate) / kRate * rateOf(a[1].d); return ZN_OK; }
FN(fSetPan) { (void)r; for (Voice& v : voices) if (v.used && v.clip == a[0].i) v.pan = panOf(a[1].d); return ZN_OK; }
FN(fStopAll) { (void)a; (void)r; for (Voice& v : voices) if (v.stream < 0) v.used = false; return ZN_OK; }
FN(fStart) { r->i = startVoice(a[0].i, a[1].d, a[2].i != 0, a[3].d, a[4].d, a[5].d, a[6].d); return ZN_OK; }
FN(fVoiceStop) { (void)r; if (Voice* v = voiceAt(a[0].i)) { if (a[1].d > 0) v->stopAt = now + static_cast<uint64_t>(a[1].d * kRate); else v->used = false; } return ZN_OK; }
FN(fVoiceSet) {
  (void)r;
  if (Voice* v = voiceAt(a[0].i)) {
    v->vol = static_cast<float>(a[1].d > 0 ? a[1].d : 0);
    if (v->pitched) v->step = static_cast<double>(clips[v->clip].rate) / kRate * rateOf(a[2].d);
    v->pan = panOf(a[3].d);
  }
  return ZN_OK;
}
FN(fVoicePlaying) { Voice* v = voiceAt(a[0].i); r->i = v && live(*v); return ZN_OK; }
FN(fPcm) {
  const int ch = static_cast<int>(a[1].i), rate = static_cast<int>(a[2].i);
  const size_t frames = ch > 0 ? a[0].v.n / static_cast<uint32_t>(ch) : 0;
  if (ch < 1 || ch > 2 || rate < 8000 || rate > 192000 || frames < 1) { r->i = fail("samples of 1 or 2 channels, at 8000 to 192000 frames per second"); return ZN_OK; }
  const int h = newClip(ch, rate, frames);
  if (h >= 0) { const double* s = static_cast<const double*>(a[0].v.p); for (size_t i = 0; i < frames * static_cast<size_t>(ch); i++) clips[h].pcm[i] = static_cast<float>(s[i]); }
  r->i = h;
  return ZN_OK;
}
FN(fChannels) { Clip* c = clipAt(a[0].i); r->i = c ? c->ch : 0; return ZN_OK; }
FN(fRate) { Clip* c = clipAt(a[0].i); r->i = c ? c->rate : 0; return ZN_OK; }
FN(fSamples) {
  outD.clear();
  Clip* c = clipAt(a[0].i);
  if (c && a[1].i >= 0 && a[1].i < c->ch) for (size_t i = static_cast<size_t>(a[1].i); i < c->pcm.size(); i += static_cast<size_t>(c->ch)) outD.push_back(c->pcm[i]);
  r->v = dview();
  return ZN_OK;
}
FN(fTime) { (void)a; r->d = static_cast<double>(now) / kRate; return ZN_OK; }
FN(fStreamOpen) {
  const int ch = static_cast<int>(a[0].i), rate = static_cast<int>(a[1].i);
  if (ch < 1 || ch > 2 || rate < 8000 || rate > 192000) { r->i = fail("a stream of 1 or 2 channels, at 8000 to 192000 frames per second"); return ZN_OK; }
  int h = 0;
  while (h < kStreams && streams[h].used) h++;
  if (h == kStreams) { r->i = fail("too many streams open (4)"); return ZN_OK; }
  Voice* v = nullptr;
  for (Voice& x : voices) if (!x.used) { v = &x; break; }
  if (!v) { r->i = fail("all 32 voices play"); return ZN_OK; }
  streams[h] = Stream{};
  streams[h].buf.assign(static_cast<size_t>(rate) * static_cast<size_t>(ch), 0.0f);   // one second
  streams[h].ch = ch; streams[h].rate = rate; streams[h].used = true;
  *v = Voice{};
  v->used = true; v->stream = h; v->started = ++plays;   // ponytail: a stream at another rate than the mixer's plays at the mixer's (no resampler)
  started = true;
  r->i = h;
  return ZN_OK;
}
Stream* streamAt(int64_t h) { return h >= 0 && h < kStreams && streams[h].used ? &streams[h] : nullptr; }
FN(fStreamWrite) {
  Stream* s = streamAt(a[0].i);
  r->i = 0;
  if (!s) return ZN_OK;
  const double* p = static_cast<const double*>(a[1].v.p);
  const size_t n = a[1].v.n - a[1].v.n % static_cast<uint32_t>(s->ch);
  for (size_t i = 0; i < n; i++) {
    if (s->count == s->buf.size()) { s->head = (s->head + 1) % s->buf.size(); s->count--; s->dropped++; }
    s->buf[(s->head + s->count) % s->buf.size()] = static_cast<float>(p[i]);
    s->count++;
  }
  r->i = static_cast<int64_t>(s->count / static_cast<size_t>(s->ch));
  return ZN_OK;
}
FN(fStreamInfo) {
  outD.assign(3, 0.0);
  if (Stream* s = streamAt(a[0].i)) { outD[0] = static_cast<double>(s->count / static_cast<size_t>(s->ch)) / s->rate; outD[1] = s->underruns; outD[2] = s->dropped; }
  r->v = dview();
  return ZN_OK;
}
FN(fStreamSetVolume) { (void)r; if (Stream* s = streamAt(a[0].i)) s->vol = static_cast<float>(a[1].d > 0 ? a[1].d : 0); return ZN_OK; }
FN(fStreamClose) { (void)r; if (Stream* s = streamAt(a[0].i)) { for (Voice& v : voices) if (v.used && v.stream == a[0].i) v.used = false; *s = Stream{}; } return ZN_OK; }
FN(fSetMasterVolume) { (void)r; master = static_cast<float>(a[0].d > 0 ? a[0].d : 0); return ZN_OK; }
FN(fMix) {   // the null backend only: with an output the HAL takes the mix
  outD.clear();
  int frames = static_cast<int>(a[0].i);
  if (frames > 0 && !zn_console_audio_rate()) {
    if (frames > 480000) frames = 480000;
    mixInto(frames);
    outD.resize(acc.size());
    for (size_t i = 0; i < acc.size(); i++) outD[i] = acc[i] * master;
  }
  r->v = dview();
  return ZN_OK;
}

const ZnExport kExports[] = {
  {"backend", ">s", fBackend, 0}, {"load", "B>i", fLoad, 0}, {"tone", "idd>i", fTone, 0}, {"error", ">s", fError, 0}, {"duration", "i>d", fDuration, 0},
  {"unload", "i>n", fUnload, 0}, {"play", "idbdd>b", fPlay, 0}, {"stop", "i>n", fStop, 0}, {"playing", "i>b", fPlaying, 0},
  {"setVolume", "id>n", fSetVolume, 0}, {"setLoop", "ib>n", fSetLoop, 0}, {"setRate", "id>n", fSetRate, 0}, {"setPan", "id>n", fSetPan, 0},
  {"stopAll", ">n", fStopAll, 0}, {"start", "idbdddd>i", fStart, 0}, {"voiceStop", "id>n", fVoiceStop, 0}, {"voiceSet", "iddd>n", fVoiceSet, 0},
  {"voicePlaying", "i>b", fVoicePlaying, 0}, {"pcm", "Dii>i", fPcm, 0}, {"channels", "i>i", fChannels, 0}, {"rate", "i>i", fRate, 0},
  {"samples", "ii>D", fSamples, 0}, {"time", ">d", fTime, 0}, {"streamOpen", "ii>i", fStreamOpen, 0}, {"streamWrite", "iD>i", fStreamWrite, 0},
  {"streamInfo", "i>D", fStreamInfo, 0}, {"streamSetVolume", "id>n", fStreamSetVolume, 0}, {"streamClose", "i>n", fStreamClose, 0},
  {"setMasterVolume", "d>n", fSetMasterVolume, 0}, {"mix", "i>D", fMix, 0},
};
}  // namespace

extern "C" const ZnModule zn_console_audio_module;
extern "C" {
const ZnModule zn_console_audio_module = {ZN_ABI_VERSION, sizeof(ZnModule), "Audio", kExports, sizeof kExports / sizeof kExports[0], nullptr, 0, 0, nullptr, nullptr, nullptr};
__attribute__((weak)) int zn_console_audio_output(void) { return 0; }
__attribute__((weak)) const char* zn_console_audio_backend(void) { return ZN_CONSOLE_AUDIO_NAME; }   // the HAL's output, when it picks one at run time   // the HAL: 1 when it plays the mix (it then calls zn_console_audio_render)
int zn_console_audio_rate(void) { return started && zn_console_audio_output() ? kRate : 0; }
void zn_console_audio_render(int16_t* lr, int frames) {
  mixInto(frames);
  for (size_t i = 0; i < static_cast<size_t>(frames) * 2; i++) {
    const float s = acc[i] * master * 32767.0f;
    lr[i] = static_cast<int16_t>(s > 32767.0f ? 32767 : s < -32768.0f ? -32768 : s);
  }
}
}
