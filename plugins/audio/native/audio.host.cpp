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
struct Voice { ma_audio_buffer_ref src; ma_sound sound; int32_t clip; uint64_t started; ma_uint64 from; bool used, pitched; };   // from: the mix frame a delayed voice starts at
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
// A voice's number for the program: the count of plays when it started (never 0), so a voice that took the place of another is not it.
int32_t voice_id(Voice& v) { return (int32_t)(v.started & 0x7fffffff); }
Voice* voice_at(int32_t id) {
  for (Voice& v : voices) if (v.used && id > 0 && voice_id(v) == id) return &v;
  return nullptr;
}
bool live(Voice& v) { return v.used && !ma_sound_at_end(&v.sound) && (ma_sound_is_playing(&v.sound) || ma_engine_get_time_in_pcm_frames(&eng) < v.from); }   // playing, or waiting for its time
bool env_on(const char* n) { const char* v = getenv(n); return v && *v && *v != '0'; }
// A playback rate (pitch and speed together) between 1/64 and 64, 1 for NaN; a pan between -1 and 1, 0 for NaN.
float rate_of(double r) { return r > 0 ? (float)(r < 1.0 / 64 ? 1.0 / 64 : r > 64 ? 64 : r) : 1.0f; }
float pan_of(double p) { return p == p ? (float)(p < -1 ? -1 : p > 1 ? 1 : p) : 0.0f; }

// Streams: samples a program writes as they come (the peer's audio of a call, a synthesizer), played through a miniaudio data source
// that reads a buffer on the mixer's thread. It starts once PRIME seconds are buffered; when it runs dry it plays silence and waits for
// PRIME again (an underrun); when the writer runs ahead of the device (two clocks that drift, a burst after a network stall), what is
// buffered beyond PRIME + SLACK is dropped, so the delay stays under 200 ms.
const int MAXSTREAM = 16;
const double PRIME = 0.06, SLACK = 0.12;
struct Stream {
  ma_data_source_base base;   // first: miniaudio sees the stream as a data source
  ma_sound sound;
  bool used, primed;
  ma_uint32 channels, rate;
  pthread_mutex_t mu;
  float* buf;                 // a ring of cap samples
  size_t cap, head, count;
  uint64_t underruns, dropped;
};
Stream streams[MAXSTREAM];
ma_result ds_read(ma_data_source* ds, void* out, ma_uint64 frames, ma_uint64* read) {
  Stream* s = (Stream*)ds;
  float* o = (float*)out;
  const size_t want = (size_t)frames * s->channels, prime = (size_t)(PRIME * s->rate) * s->channels, most = prime + (size_t)(SLACK * s->rate) * s->channels;
  size_t n = 0;
  pthread_mutex_lock(&s->mu);
  if (!s->primed && s->count >= prime) s->primed = true;
  if (s->primed) {
    if (s->count > most) { const size_t drop = s->count - prime; s->head = (s->head + drop) % s->cap; s->count -= drop; s->dropped += drop / s->channels; }
    n = want < s->count ? want : s->count;
    for (size_t i = 0; i < n; i++) o[i] = s->buf[(s->head + i) % s->cap];
    s->head = (s->head + n) % s->cap; s->count -= n;
    if (n < want) { s->primed = false; s->underruns++; }
  }
  pthread_mutex_unlock(&s->mu);
  memset(o + n, 0, (want - n) * sizeof(float));
  if (read) *read = frames;   // a stream never ends: silence while it waits
  return MA_SUCCESS;
}
ma_result ds_seek(ma_data_source*, ma_uint64) { return MA_SUCCESS; }
ma_result ds_format(ma_data_source* ds, ma_format* f, ma_uint32* ch, ma_uint32* rate, ma_channel* map, size_t cap) {
  Stream* s = (Stream*)ds;
  if (f) *f = ma_format_f32;
  if (ch) *ch = s->channels;
  if (rate) *rate = s->rate;
  if (map) ma_channel_map_init_standard(ma_standard_channel_map_default, map, cap, s->channels);
  return MA_SUCCESS;
}
ma_result ds_cursor(ma_data_source*, ma_uint64* c) { if (c) *c = 0; return MA_SUCCESS; }
ma_result ds_length(ma_data_source*, ma_uint64* l) { if (l) *l = 0; return MA_NOT_IMPLEMENTED; }
ma_data_source_vtable stream_vtable = {ds_read, ds_seek, ds_format, ds_cursor, ds_length, nullptr, 0};
Stream* stream_at(int32_t h) { return h >= 0 && h < MAXSTREAM && streams[h].used ? &streams[h] : nullptr; }

// The next frames of the mix. The engine's clock, which time() and the delays count on, stands still while no sound is in
// the graph: it is moved by hand over that silence.
void render(void* out, ma_uint32 frames) {
  const ma_uint64 t = ma_engine_get_time_in_pcm_frames(&eng);
  ma_engine_read_pcm_frames(&eng, out, frames, nullptr);
  if (ma_engine_get_time_in_pcm_frames(&eng) < t + frames) ma_engine_set_time_in_pcm_frames(&eng, t + frames);
}
void pull(ma_device*, void* out, const void*, ma_uint32 frames) { render(out, frames); }
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
  for (Stream& s : streams) if (s.used) { ma_sound_uninit(&s.sound); s.used = false; }
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
  bool play(int32_t h, double volume, bool loop, double rate, double pan) override { return start(h, volume, loop, rate, pan, 0, 0) != 0; }
  int32_t start(int32_t h, double volume, bool loop, double rate, double pan, double offset, double delay) override {
    Clip* c = clip_at(h);
    ma_engine* e = engine();
    if (!c || !e) return 0;
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
    // a 2D mix: no 3D position, and a resampler only for a voice played at another rate (ZN-656): a clip at the mixer's
    // rate played at 1 is added sample for sample (miniaudio's resampler runs even at a ratio of 1)
    const float r = rate_of(rate);
    const ma_uint32 flags = MA_SOUND_FLAG_NO_SPATIALIZATION | (r == 1.0f ? MA_SOUND_FLAG_NO_PITCH : 0);
    if (ma_sound_init_from_data_source(e, &v->src, flags, nullptr, &v->sound) != MA_SUCCESS) return 0;
    v->used = true;
    v->pitched = r != 1.0f;
    if (v->pitched) ma_sound_set_pitch(&v->sound, r);
    ma_sound_set_pan(&v->sound, pan_of(pan));   // balance: at -1 the right channel is silent, a mono clip included
    v->clip = h;
    v->started = ++plays;
    if (offset > 0) ma_sound_seek_to_pcm_frame(&v->sound, (ma_uint64)(offset * c->rate));
    v->from = delay > 0 ? ma_engine_get_time_in_pcm_frames(e) + (ma_uint64)(delay * RATE) : 0;
    if (v->from) ma_sound_set_start_time_in_pcm_frames(&v->sound, v->from);
    ma_sound_set_volume(&v->sound, (float)volume);
    ma_sound_set_looping(&v->sound, loop);
    return ma_sound_start(&v->sound) == MA_SUCCESS ? voice_id(*v) : 0;
  }
  void stop(int32_t h) override { for (Voice& v : voices) if (v.used && v.clip == h) release(v); }
  bool playing(int32_t h) override {
    for (Voice& v : voices) if (v.clip == h && live(v)) return true;
    return false;
  }
  void setVolume(int32_t h, double volume) override { for (Voice& v : voices) if (v.used && v.clip == h) ma_sound_set_volume(&v.sound, (float)volume); }
  void setLoop(int32_t h, bool on) override { for (Voice& v : voices) if (v.used && v.clip == h) ma_sound_set_looping(&v.sound, on); }
  void setRate(int32_t h, double rate) override { for (Voice& v : voices) if (v.used && v.pitched && v.clip == h) ma_sound_set_pitch(&v.sound, rate_of(rate)); }
  void setPan(int32_t h, double pan) override { for (Voice& v : voices) if (v.used && v.clip == h) ma_sound_set_pan(&v.sound, pan_of(pan)); }
  void stopAll() override { for (Voice& v : voices) release(v); }
  void voiceStop(int32_t id, double delay) override {
    Voice* v = voice_at(id);
    if (!v) return;
    if (delay > 0) ma_sound_set_stop_time_in_pcm_frames(&v->sound, ma_engine_get_time_in_pcm_frames(&eng) + (ma_uint64)(delay * RATE));
    else release(*v);
  }
  void voiceSet(int32_t id, double volume, double rate, double pan) override {
    Voice* v = voice_at(id);
    if (!v) return;
    ma_sound_set_volume(&v->sound, (float)volume);
    if (v->pitched) ma_sound_set_pitch(&v->sound, rate_of(rate));
    ma_sound_set_pan(&v->sound, pan_of(pan));
  }
  bool voicePlaying(int32_t id) override { Voice* v = voice_at(id); return v && live(*v); }
  int32_t pcm(zrt::Array<double> samples, int32_t channels, int32_t rate) override {
    const int64_t frames = samples.a && channels > 0 ? samples.a->len / channels : 0;
    if (channels < 1 || channels > 2 || rate < 8000 || rate > 192000 || frames < 1) return fail("samples of 1 or 2 channels, at 8000 to 192000 frames per second");
    int32_t h = free_slot();
    if (h < 0) return -1;
    engine();
    float* pcm = (float*)ma_malloc((size_t)(frames * channels) * sizeof(float), nullptr);
    if (!pcm) return fail("out of memory");
    for (int64_t i = 0; i < frames * channels; i++) pcm[i] = (float)samples.a->data[i];
    clips[h] = Clip{pcm, (ma_uint64)frames, (ma_uint32)channels, (ma_uint32)rate};
    return h;
  }
  int32_t channels(int32_t h) override { Clip* c = clip_at(h); return c ? (int32_t)c->channels : 0; }
  int32_t rate(int32_t h) override { Clip* c = clip_at(h); return c ? (int32_t)c->rate : 0; }
  zrt::Array<double> samples(int32_t h, int32_t channel) override {
    Clip* c = clip_at(h);
    if (!c || channel < 0 || (ma_uint32)channel >= c->channels || c->frames > 0x7fffffff) return zrt::Array<double>::with_cap(0);
    const int32_t n = (int32_t)c->frames;
    zrt::Array<double> r = zrt::Array<double>::with_cap(n);
    const float* p = (const float*)c->pcm + channel;
    for (int32_t i = 0; i < n; i++) r.a->data[i] = p[(size_t)i * c->channels];
    r.a->len = n;
    return r;
  }
  int32_t streamOpen(int32_t channels, int32_t rate) override {
    if (channels < 1 || channels > 2 || rate < 8000 || rate > 192000) return fail("a stream of 1 or 2 channels, at 8000 to 192000 frames per second");
    ma_engine* e = engine();
    if (!e) return fail("no mixer");
    int32_t h = 0;
    while (h < MAXSTREAM && streams[h].used) h++;
    if (h == MAXSTREAM) return fail("too many streams open (16)");
    Stream& s = streams[h];
    s.channels = (ma_uint32)channels; s.rate = (ma_uint32)rate;
    s.cap = (size_t)rate * channels;   // one second
    s.buf = (float*)ma_malloc(s.cap * sizeof(float), nullptr);
    if (!s.buf) return fail("out of memory");
    s.head = s.count = 0; s.primed = false; s.underruns = s.dropped = 0;
    pthread_mutex_init(&s.mu, nullptr);
    ma_data_source_config dc = ma_data_source_config_init();
    dc.vtable = &stream_vtable;
    if (ma_data_source_init(&dc, &s.base) != MA_SUCCESS) { ma_free(s.buf, nullptr); return fail("the stream cannot start"); }
    const ma_uint32 flags = MA_SOUND_FLAG_NO_SPATIALIZATION | (s.rate == RATE ? MA_SOUND_FLAG_NO_PITCH : 0);   // no resampler at the mixer's rate
    if (ma_sound_init_from_data_source(e, &s.base, flags, nullptr, &s.sound) != MA_SUCCESS) { ma_data_source_uninit(&s.base); ma_free(s.buf, nullptr); return fail("the stream cannot start"); }
    s.used = true;
    ma_sound_start(&s.sound);
    return h;
  }
  int32_t streamWrite(int32_t h, zrt::Array<double> samples) override {
    Stream* s = stream_at(h);
    if (!s) return 0;
    const size_t n = samples.a ? (size_t)samples.a->len - (size_t)samples.a->len % s->channels : 0;
    pthread_mutex_lock(&s->mu);
    for (size_t i = 0; i < n; i++) {
      if (s->count == s->cap) { s->head = (s->head + 1) % s->cap; s->count--; s->dropped++; }   // a full second: the oldest goes
      s->buf[(s->head + s->count) % s->cap] = (float)samples.a->data[i];
      s->count++;
    }
    const int32_t frames = (int32_t)(s->count / s->channels);
    pthread_mutex_unlock(&s->mu);
    return frames;
  }
  zrt::Array<double> streamInfo(int32_t h) override {
    Stream* s = stream_at(h);
    zrt::Array<double> r = zrt::Array<double>::with_cap(3);
    double v[3] = {0, 0, 0};
    if (s) { pthread_mutex_lock(&s->mu); v[0] = (double)(s->count / s->channels) / s->rate; v[1] = (double)s->underruns; v[2] = (double)s->dropped; pthread_mutex_unlock(&s->mu); }
    memcpy(r.a->data, v, sizeof v);
    r.a->len = 3;
    return r;
  }
  void streamSetVolume(int32_t h, double volume) override { if (Stream* s = stream_at(h)) ma_sound_set_volume(&s->sound, (float)volume); }
  void streamClose(int32_t h) override {
    Stream* s = stream_at(h);
    if (!s) return;
    ma_sound_uninit(&s->sound);   // leaves the mix before its buffer goes
    ma_data_source_uninit(&s->base);
    ma_free(s->buf, nullptr);
    pthread_mutex_destroy(&s->mu);
    s->used = false;
  }
  double time() override { return opened ? (double)ma_engine_get_time_in_pcm_frames(&eng) / RATE : 0; }
  void setMasterVolume(double volume) override { if (ma_engine* e = engine()) ma_engine_set_volume(e, (float)volume); }
  zrt::Array<double> mix(int32_t frames) override {
    ma_engine* e = engine();
    if (!e || frames <= 0 || output()) return zrt::Array<double>::with_cap(0);   // a device has the mix: two readers would tear it
    if (frames > 480000) frames = 480000;   // 10 s a call
    float* buf = (float*)ma_malloc((size_t)frames * 2 * sizeof(float), nullptr);
    if (!buf) return zrt::Array<double>::with_cap(0);
    render(buf, (ma_uint32)frames);   // it fills what no voice reaches with silence
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
