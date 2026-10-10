// zinc:audio for macos and linux: miniaudio's engine (vendor/miniaudio.h) behind two tables, the decoded sounds and
// the voices that play them. The engine always mixes 48 kHz stereo and owns no device: with an output, a device
// opened beside it pulls the mix from its own thread; on the null backend nothing pulls it but mix(), so a headless
// run is silent, starts no thread and renders the same samples every time.
#include "zinc_native_audio.h"
#include "../vendor/miniaudio.h"
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace {
const int MAXSOUND = 256, MAXVOICE = 32;
const ma_uint32 RATE = 48000;
struct Clip { void* pcm; ma_uint64 frames; ma_uint32 channels, rate; };   // float samples
struct Voice { ma_audio_buffer_ref src; ma_sound sound; int32_t clip; uint64_t started; bool used; };
Clip clips[MAXSOUND];
Voice voices[MAXVOICE];
ma_engine eng;
ma_device dev;
pthread_t opener;
bool opened, opening, playing_out;   // opening: the opener thread runs or waits to be joined; playing_out: dev pulls the mix
uint64_t plays;
char err_msg[200];

zrt::String str(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }
int32_t fail(const char* why) { snprintf(err_msg, sizeof err_msg, "%s", why); return -1; }
Clip* clip_at(int32_t h) { return h >= 0 && h < MAXSOUND && clips[h].pcm ? &clips[h] : nullptr; }
int32_t free_slot() {
  for (int32_t h = 0; h < MAXSOUND; h++) if (!clips[h].pcm) return h;
  return fail("too many sounds loaded (256): unload() the ones no longer used");
}
void release(Voice& v) {
  if (!v.used) return;
  ma_sound_uninit(&v.sound);   // leaves the mix before its samples can go away
  ma_audio_buffer_ref_uninit(&v.src);
  v.used = false;
}
bool live(Voice& v) { return v.used && ma_sound_is_playing(&v.sound) && !ma_sound_at_end(&v.sound); }
bool env_on(const char* n) { const char* v = getenv(n); return v && *v && *v != '0'; }

void pull(ma_device*, void* out, const void*, ma_uint32 frames) { ma_engine_read_pcm_frames(&eng, out, frames, nullptr); }
// The default playback device, asked for the mixer's format (miniaudio converts when the hardware has another).
// On its own thread: starting Core Audio took 90 to 520 ms on the development Mac, a frozen frame if a game paid it
// at its first sound. Sounds started meanwhile begin when the device does.
void* open_output(void*) {
  ma_device_config c = ma_device_config_init(ma_device_type_playback);
  c.playback.format = ma_format_f32;
  c.playback.channels = 2;
  c.sampleRate = RATE;
  c.dataCallback = pull;
  if (ma_device_init(nullptr, &c, &dev) != MA_SUCCESS) return nullptr;   // nothing to play on: the null backend
  if (ma_device_start(&dev) == MA_SUCCESS) playing_out = true; else ma_device_uninit(&dev);
  return nullptr;
}
/** Whether a device plays the mix; waits for the opener to know. */
bool output() {
  if (opening) { pthread_join(opener, nullptr); opening = false; }
  return playing_out;
}
void shutdown() {   // the device stops with the program instead of being cut by the system
  if (!opened) return;
  if (output()) ma_device_uninit(&dev);
  for (Voice& v : voices) release(v);
  ma_engine_uninit(&eng);
  opened = false;
}
// The mixer, started on first use, and with it the opening of the output unless the run is headless (the rule of the
// window: next/src/host/hal_dispatch.cpp) or ZINC_AUDIO=null asks for silence.
ma_engine* engine() {
  if (opened) return &eng;
  ma_engine_config c = ma_engine_config_init();
  c.noDevice = MA_TRUE;
  c.channels = 2;
  c.sampleRate = RATE;
  if (ma_engine_init(&c, &eng) != MA_SUCCESS) return nullptr;
  opened = true;
  atexit(shutdown);
  const char* pick = getenv("ZINC_AUDIO");
  const bool silent = env_on("ZINC_HEADLESS") || env_on("ZINC_DETERMINISTIC") || getenv("ZINC_RECORD") || getenv("ZINC_REPLAY") || (pick && !strcmp(pick, "null"));
  if (!silent) opening = pthread_create(&opener, nullptr, open_output, nullptr) == 0;
  return &eng;
}
}  // namespace

struct HostAudio : NativeAudio {
  zrt::String backend() override { return str(engine() && output() ? ma_get_backend_name(dev.pContext->backend) : "null"); }
  int32_t load(zrt::Array<uint8_t> bytes) override {
    int32_t h = free_slot();
    if (h < 0) return -1;
    if (!bytes.a || bytes.a->len <= 0) return fail("the file is empty");
    engine();   // a program loads its sounds as it starts: the output opens now, not at the first play()
    // The file's own rate and channels (converted while it plays), but always float samples: miniaudio 0.11.25 drops the
    // end of a sound in any other format (ma_engine_node_process_pcm_frames__sound marks the sound ended while the last
    // converted frames, up to 512, still wait in its cache), so a 16-bit clip under 11 ms would never be heard.
    // ponytail: 8 bytes per stereo frame in memory, 21 MB per minute at 44.1 kHz; long music wants streaming (ZN-440)
    ma_decoder_config dc = ma_decoder_config_init(ma_format_f32, 0, 0);
    ma_uint64 frames = 0;
    void* pcm = nullptr;
    ma_result r = ma_decode_memory(bytes.a->data, (size_t)bytes.a->len, &dc, &frames, &pcm);
    if (r != MA_SUCCESS || !pcm || frames == 0) {
      if (pcm) ma_free(pcm, nullptr);
      return fail(r == MA_OUT_OF_MEMORY ? "out of memory" : "not a WAV, FLAC, MP3 or Ogg Vorbis file");
    }
    clips[h] = Clip{pcm, frames, dc.channels, dc.sampleRate};
    return h;
  }
  int32_t tone(int32_t wave, double hz, double seconds) override {
    if (wave < 0 || wave > 4) return fail("unknown wave (0 sine, 1 square, 2 triangle, 3 sawtooth, 4 noise)");
    if (!(seconds > 0) || seconds > 60 || !(hz > 0) || hz > 20000) return fail("a tone lasts up to 60 seconds, between 0 and 20000 Hz");
    int32_t h = free_slot();
    if (h < 0) return -1;
    engine();
    const ma_uint64 frames = (ma_uint64)(seconds * RATE + 0.5);
    if (frames == 0) return fail("a tone shorter than one frame");
    float* pcm = (float*)ma_malloc((size_t)frames * sizeof(float), nullptr);
    if (!pcm) return fail("out of memory");
    if (wave == 4) {
      // xorshift32 from a fixed seed, the same noise every run; not ma_noise, whose white noise is all positive in
      // 0.11.25 (a constant offset of half its amplitude)
      uint32_t x = 0x9E3779B9u;
      for (ma_uint64 i = 0; i < frames; i++) { x ^= x << 13; x ^= x >> 17; x ^= x << 5; pcm[i] = (float)(int32_t)x / 4294967296.0f; }
    } else {
      static const ma_waveform_type kinds[] = {ma_waveform_type_sine, ma_waveform_type_square, ma_waveform_type_triangle, ma_waveform_type_sawtooth};
      ma_waveform_config wc = ma_waveform_config_init(ma_format_f32, 1, RATE, kinds[wave], 0.5, hz);
      ma_waveform w;
      ma_waveform_init(&wc, &w);
      ma_waveform_read_pcm_frames(&w, pcm, frames, nullptr);
    }
    ma_uint64 fade = RATE / 200;   // 5 ms in and out: a wave cut at full level clicks
    if (fade > frames / 2) fade = frames / 2;
    for (ma_uint64 i = 0; i < fade; i++) { const float g = (float)i / (float)fade; pcm[i] *= g; pcm[frames - 1 - i] *= g; }
    clips[h] = Clip{pcm, frames, 1, RATE};
    return h;
  }
  zrt::String error() override { return str(err_msg); }
  double duration(int32_t h) override { Clip* c = clip_at(h); return c ? (double)c->frames / c->rate : 0; }
  void unload(int32_t h) override {
    Clip* c = clip_at(h);
    if (!c) return;
    stop(h);
    ma_free(c->pcm, nullptr);
    *c = Clip{};
  }
  bool play(int32_t h, double volume, bool loop) override {
    Clip* c = clip_at(h);
    ma_engine* e = engine();
    if (!c || !e) return false;
    Voice* v = nullptr;
    for (Voice& x : voices) if (!live(x)) { v = &x; break; }
    if (!v) {   // all busy: the oldest one-shot gives way, a loop (the music) only when there is nothing else
      auto age = [](Voice& x) { return x.started + (ma_sound_is_looping(&x.sound) ? (uint64_t)1 << 62 : 0); };
      v = &voices[0];
      for (Voice& x : voices) if (age(x) < age(*v)) v = &x;
    }
    release(*v);
    ma_audio_buffer_ref_init(ma_format_f32, c->channels, c->pcm, c->frames, &v->src);
    v->src.sampleRate = c->rate;   // miniaudio 0.11 leaves it at 0, which would play the clip at the mixer's rate
    // a 2D mix: no 3D position and no pitch, so a clip at the mixer's rate is added sample for sample
    if (ma_sound_init_from_data_source(e, &v->src, MA_SOUND_FLAG_NO_SPATIALIZATION | MA_SOUND_FLAG_NO_PITCH, nullptr, &v->sound) != MA_SUCCESS) return false;
    v->used = true;
    v->clip = h;
    v->started = ++plays;
    ma_sound_set_volume(&v->sound, (float)volume);
    ma_sound_set_looping(&v->sound, loop);
    return ma_sound_start(&v->sound) == MA_SUCCESS;
  }
  void stop(int32_t h) override { for (Voice& v : voices) if (v.used && v.clip == h) release(v); }
  bool playing(int32_t h) override {
    for (Voice& v : voices) if (v.clip == h && live(v)) return true;
    return false;
  }
  void setVolume(int32_t h, double volume) override { for (Voice& v : voices) if (v.used && v.clip == h) ma_sound_set_volume(&v.sound, (float)volume); }
  void setLoop(int32_t h, bool on) override { for (Voice& v : voices) if (v.used && v.clip == h) ma_sound_set_looping(&v.sound, on); }
  void stopAll() override { for (Voice& v : voices) release(v); }
  void setMasterVolume(double volume) override { if (ma_engine* e = engine()) ma_engine_set_volume(e, (float)volume); }
  zrt::Array<double> mix(int32_t frames) override {
    ma_engine* e = engine();
    if (!e || frames <= 0 || output()) return zrt::Array<double>::with_cap(0);   // a device has the mix: two readers would tear it
    if (frames > 480000) frames = 480000;   // 10 s a call
    float* buf = (float*)ma_malloc((size_t)frames * 2 * sizeof(float), nullptr);
    if (!buf) return zrt::Array<double>::with_cap(0);
    ma_engine_read_pcm_frames(e, buf, (ma_uint64)frames, nullptr);   // it fills what no voice reaches with silence
    zrt::Array<double> r = zrt::Array<double>::with_cap(frames * 2);
    for (int32_t i = 0; i < frames * 2; i++) r.a->data[i] = buf[i];
    r.a->len = frames * 2;
    ma_free(buf, nullptr);
    return r;
  }
};

NativeAudio* zinc_create_Audio() {
  static HostAudio inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
