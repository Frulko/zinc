// zinc:audio for macos and linux: miniaudio's engine (vendor/miniaudio.h) behind two tables, the decoded sounds and
// the voices that play them. The engine always mixes 48 kHz stereo and owns no device: with an output, a device
// opened beside it pulls the mix from its own thread; on the null backend nothing pulls it but mix(), so a headless
// run is silent, starts no thread and renders the same samples every time.
#include "zinc_native_audio.h"
#include "../vendor/miniaudio.h"
#if ZP_AUDIO_OPUS
#include "../vendor/extras/decoders/libopus/miniaudio_libopus.h"
#endif
#define STB_VORBIS_HEADER_ONLY
#include "../vendor/stb_vorbis.c"   // only to size a Vorbis decoder's memory (loadMusic): the code is in miniaudio_impl.c
#undef STB_VORBIS_HEADER_ONLY
#define QOA_NO_STDIO
#include "../vendor/qoa.h"         // declarations: the code is in miniaudio_impl.c
#ifdef __APPLE__
#include <AudioToolbox/ExtendedAudioFile.h>
#endif
#include <assert.h>
#include <math.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace {
// Plugin-local boundary: this cannot intercept QuickJS or allocations outside miniaudio's callbacks.
#ifndef NDEBUG
enum class RenderPhase { Control, Rendering };
thread_local RenderPhase renderPhase = RenderPhase::Control;
void render_phase(RenderPhase next) {
  assert(renderPhase != next && "nested audio render or invalid render exit");
  renderPhase = next;
}
#endif
void control_only() {
#ifndef NDEBUG
  assert(renderPhase == RenderPhase::Control && "audio control or allocation during render");
#endif
}
struct RenderScope {
  RenderScope() {
#ifndef NDEBUG
    render_phase(RenderPhase::Rendering);
#endif
  }
  ~RenderScope() {
#ifndef NDEBUG
    render_phase(RenderPhase::Control);
#endif
  }
  RenderScope(const RenderScope&) = delete;
  RenderScope& operator=(const RenderScope&) = delete;
};
const int MAXSOUND = 256, MAXVOICE = 32;
const ma_uint32 RATE = 48000;
#if ZP_AUDIO_OPUS
const char* const decode_error = "not a WAV, FLAC, MP3, Ogg Vorbis, QOA or Ogg Opus file";
const char* const file_decode_error = "not a file an enabled audio decoder can play";
#else
const char* const decode_error = "not a WAV, FLAC, MP3, Ogg Vorbis or QOA file";
const char* const file_decode_error = "not a WAV, FLAC, MP3 or Ogg Vorbis file";
#endif
// Native 16-bit sources stay 16-bit; all others stay float. A long compressed file (load) is decoded on a thread into pcm,
// sized from the file's length: `filled` frames are ready while
// `pending`; a voice plays what is there (Prog below) and waits for the rest, so load() returns at once and play() works at once.
struct Clip { void* pcm; ma_uint64 frames; ma_uint32 channels, rate; ma_format format; ma_uint64 filled; int pending, quit; pthread_t th; ma_decoder* dec; void* file; };
// a clip as a data source: the frames decoded so far, silence (the cursor waiting) for the ones not yet there
struct Prog { ma_data_source_base base; Clip* clip; ma_uint64 cursor; };
// A voice's lifecycle (ZN-697, ZN-695): a free slot, a voice that plays (or waits for its `from`), one whose end is set (a stop time, faded or
// not: it plays on until that frame of the mix), one held by pause() (out of the mix, its cursor kept, until resume() or a stop). The end
// itself is miniaudio's clock reaching the stop time, or the clip's end: live() reads it.
enum class VState : uint8_t { Free, Playing, Ending, Paused };
struct Voice { ma_audio_buffer_ref src; Prog prog; bool useProg; ma_sound sound; int32_t clip; uint64_t started; ma_uint64 from; VState state; bool pitched; };   // from: the mix frame a delayed voice starts at
// The one place a voice changes state: Free -> Playing (start), Playing -> Ending (a stop time), Playing <-> Paused (pause, resume), any ->
// Free (release); an ending voice never goes back to Playing (a late voiceSet or resume cannot revive it) and is not paused (it is leaving:
// its stop time and fade run on miniaudio's clock, which a pause would not hold).
bool to(Voice& v, VState s) {
  const bool ok = s == VState::Free || (s == VState::Playing && (v.state == VState::Free || v.state == VState::Paused)) ||
                  ((s == VState::Ending || s == VState::Paused) && v.state == VState::Playing);
  if (ok) v.state = s;
  return ok;
}
Clip clips[MAXSOUND];
// Heap bytes counted by an allocator handed to miniaudio: the engine's (a sound's node, measured around its init) and each streamed music's decoder.
// A 16-byte header keeps the size (and the alignment of what follows).
struct Heap { size_t now, peak; };
Heap engineHeap;
void heap_add(void* u, size_t add, size_t sub) {
  Heap* h = (Heap*)u;
  const size_t n = __atomic_add_fetch(&h->now, add - sub, __ATOMIC_RELAXED);
  size_t p = __atomic_load_n(&h->peak, __ATOMIC_RELAXED);
  while (n > p && !__atomic_compare_exchange_n(&h->peak, &p, n, true, __ATOMIC_RELAXED, __ATOMIC_RELAXED)) {}
}
void* heap_malloc(size_t sz, void* u) {
  control_only();
  size_t* p = (size_t*)malloc(sz + 16);
  if (!p) return nullptr;
  *p = sz;
  heap_add(u, sz, 0);
  return (char*)p + 16;
}
void* heap_realloc(void* q, size_t sz, void* u) {
  control_only();
  if (!q) return heap_malloc(sz, u);
  size_t* p = (size_t*)((char*)q - 16);
  const size_t old = *p;
  p = (size_t*)realloc(p, sz + 16);
  if (!p) return nullptr;
  *p = sz;
  heap_add(u, sz, old);
  return (char*)p + 16;
}
void heap_free(void* q, void* u) {
  control_only();
  if (!q) return;
  size_t* p = (size_t*)((char*)q - 16);
  heap_add(u, 0, *p);
  free(p);
}
ma_allocation_callbacks counted(Heap* h) { return ma_allocation_callbacks{h, heap_malloc, heap_realloc, heap_free}; }
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
ma_result prog_read(ma_data_source* ds, void* out, ma_uint64 frames, ma_uint64* read) {
  Prog* p = (Prog*)ds;
  Clip* c = p->clip;
  const bool pending = __atomic_load_n(&c->pending, __ATOMIC_ACQUIRE);
  const ma_uint64 avail = pending ? __atomic_load_n(&c->filled, __ATOMIC_ACQUIRE) : c->frames;
  ma_uint64 n = avail > p->cursor ? avail - p->cursor : 0;
  if (n > frames) n = frames;
  const size_t fb = ma_get_bytes_per_frame(c->format, c->channels);
  if (n) memcpy(out, (const char*)c->pcm + (size_t)p->cursor * fb, (size_t)n * fb);
  p->cursor += n;
  if (n < frames && pending) { ma_silence_pcm_frames((char*)out + (size_t)n * fb, frames - n, c->format, c->channels); n = frames; }   // still decoding: silence, the cursor waits
  if (read) *read = n;
  return n == 0 ? MA_AT_END : MA_SUCCESS;
}
ma_result prog_seek(ma_data_source* ds, ma_uint64 f) { ((Prog*)ds)->cursor = f; return MA_SUCCESS; }
ma_result prog_format(ma_data_source* ds, ma_format* f, ma_uint32* ch, ma_uint32* rate, ma_channel* map, size_t cap) {
  Clip* c = ((Prog*)ds)->clip;
  if (f) *f = c->format;
  if (ch) *ch = c->channels;
  if (rate) *rate = c->rate;
  if (map) ma_channel_map_init_standard(ma_standard_channel_map_default, map, cap, c->channels);
  return MA_SUCCESS;
}
ma_result prog_cursor(ma_data_source* ds, ma_uint64* c) { *c = ((Prog*)ds)->cursor; return MA_SUCCESS; }
ma_result prog_length(ma_data_source* ds, ma_uint64* l) { *l = ((Prog*)ds)->clip->frames; return MA_SUCCESS; }
ma_data_source_vtable prog_vtable = {prog_read, prog_seek, prog_format, prog_cursor, prog_length, nullptr, 0};

// QOA (ZN-440.01): the sounds the asset build encodes ("as": "audio" rules; "qoaf", vendor/qoa.h) as a decoding backend of miniaudio, so load()
// and loadMusic() read them as they read a WAV. A file is frames of 5120 samples per channel decoded alone (each carries its
// predictor's state): a frame is decoded when the cursor enters it, into one frame of 16-bit samples, the only memory it holds; a seek is the
// frame's offset (every frame but the last is full, so its offset is arithmetic) and a skip into it.
struct Qoa {
  ma_data_source_base base;   // first: miniaudio sees it as a data source
  const unsigned char* data;
  size_t size;
  qoa_desc desc;
  short* frame;               // the decoded frame the cursor is in
  ma_uint64 cursor, at;       // the next sample to read; the first sample of `frame` (~0: none decoded)
  unsigned len;               // samples per channel in `frame`
};
ma_result qd_read(ma_data_source* ds, void* out, ma_uint64 frames, ma_uint64* read) {
  Qoa* q = (Qoa*)ds;
  const unsigned ch = q->desc.channels;
  ma_uint64 n = 0;
  while (n < frames && q->cursor < q->desc.samples) {
    const ma_uint64 f = q->cursor / QOA_FRAME_LEN * QOA_FRAME_LEN;
    if (q->at != f) {
      const size_t off = 8 + (size_t)(f / QOA_FRAME_LEN) * QOA_FRAME_SIZE(ch, QOA_SLICES_PER_FRAME);
      q->len = 0;
      if (off < q->size) qoa_decode_frame(q->data + off, (unsigned)(q->size - off), &q->desc, q->frame, &q->len);
      if (!q->len) break;   // a damaged file ends there
      q->at = f;
    }
    const ma_uint64 in = q->cursor - f;
    if (in >= q->len) break;
    ma_uint64 k = q->len - in;
    if (k > frames - n) k = frames - n;
    memcpy((short*)out + n * ch, q->frame + in * ch, (size_t)k * ch * sizeof(short));
    n += k;
    q->cursor += k;
  }
  if (read) *read = n;
  return n == 0 ? MA_AT_END : MA_SUCCESS;
}
ma_result qd_seek(ma_data_source* ds, ma_uint64 f) { Qoa* q = (Qoa*)ds; q->cursor = f < q->desc.samples ? f : q->desc.samples; return MA_SUCCESS; }
ma_result qd_format(ma_data_source* ds, ma_format* f, ma_uint32* ch, ma_uint32* rate, ma_channel* map, size_t cap) {
  Qoa* q = (Qoa*)ds;
  if (f) *f = ma_format_s16;
  if (ch) *ch = q->desc.channels;
  if (rate) *rate = q->desc.samplerate;
  if (map) ma_channel_map_init_standard(ma_standard_channel_map_default, map, cap, q->desc.channels);
  return MA_SUCCESS;
}
ma_result qd_cursor(ma_data_source* ds, ma_uint64* c) { *c = ((Qoa*)ds)->cursor; return MA_SUCCESS; }
ma_result qd_length(ma_data_source* ds, ma_uint64* l) { *l = ((Qoa*)ds)->desc.samples; return MA_SUCCESS; }
ma_data_source_vtable qd_vtable = {qd_read, qd_seek, qd_format, qd_cursor, qd_length, nullptr, 0};
ma_result qd_init_stream(void*, ma_read_proc, ma_seek_proc, ma_tell_proc, void*, const ma_decoding_backend_config*, const ma_allocation_callbacks*, ma_data_source**) { return MA_NOT_IMPLEMENTED; }   // bytes in memory only (the clip, the mapped pack)
ma_result qd_init_memory(void*, const void* data, size_t size, const ma_decoding_backend_config*, const ma_allocation_callbacks* a, ma_data_source** out) {
  qoa_desc d{};
  if (size > 0x7fffffff || !qoa_decode_header((const unsigned char*)data, (int)size, &d)) return MA_INVALID_FILE;
  Qoa* q = (Qoa*)ma_malloc(sizeof(Qoa), a);
  short* frame = (short*)ma_malloc((size_t)QOA_FRAME_LEN * d.channels * sizeof(short), a);
  ma_data_source_config c = ma_data_source_config_init();
  c.vtable = &qd_vtable;
  if (!q || !frame || ma_data_source_init(&c, &q->base) != MA_SUCCESS) { ma_free(frame, a); ma_free(q, a); return MA_OUT_OF_MEMORY; }
  q->data = (const unsigned char*)data; q->size = size; q->desc = d; q->frame = frame; q->cursor = 0; q->at = ~(ma_uint64)0; q->len = 0;
  *out = &q->base;
  return MA_SUCCESS;
}
void qd_uninit(void*, ma_data_source* ds, const ma_allocation_callbacks* a) {
  Qoa* q = (Qoa*)ds;
  ma_data_source_uninit(&q->base);
  ma_free(q->frame, a);
  ma_free(q, a);
}
ma_decoding_backend_vtable qoa_backend = {qd_init_stream, nullptr, nullptr, qd_init_memory, qd_uninit};
ma_decoding_backend_vtable* backends[] = {&qoa_backend
#if ZP_AUDIO_OPUS
  , ma_decoding_backend_libopus
#endif
};
// Custom codecs precede miniaudio's built-ins; 0 channels/rate keeps the file's format.
ma_decoder_config decoding(ma_uint32 channels, ma_uint32 rate) {
  ma_decoder_config c = ma_decoder_config_init(ma_format_f32, channels, rate);
  c.ppCustomBackendVTables = backends;
  c.customBackendCount = sizeof backends / sizeof backends[0];
  return c;
}
// the decoding thread of a long file: chunks of 4096 frames, `filled` published after each; the decoder and the file's copy go when it ends
void* decode_thread(void* arg) {
  Clip* c = (Clip*)arg;
  char* out = (char*)c->pcm;
  const size_t fb = ma_get_bytes_per_frame(c->format, c->channels);
  ma_uint64 done = 0;
  while (done < c->frames && !__atomic_load_n(&c->quit, __ATOMIC_RELAXED)) {
    ma_uint64 want = c->frames - done < 4096 ? c->frames - done : 4096, got = 0;
    ma_decoder_read_pcm_frames(c->dec, out + (size_t)done * fb, want, &got);
    if (!got) break;
    done += got;
    __atomic_store_n(&c->filled, done, __ATOMIC_RELEASE);
  }
  ma_decoder_uninit(c->dec);
  free(c->dec);
  free(c->file);
  c->frames = done;   // the file's real length, when its header said more
  __atomic_store_n(&c->pending, 0, __ATOMIC_RELEASE);
  return nullptr;
}
// waits for the thread of a clip (to read all its samples, or to free them)
void settle(Clip* c, bool abandon) {
  if (!c->th) return;
  if (abandon) __atomic_store_n(&c->quit, 1, __ATOMIC_RELAXED);
  pthread_join(c->th, nullptr);
  c->th = 0;
}
void release(Voice& v) {
  if (v.state == VState::Free) return;
  ma_sound_uninit(&v.sound);   // leaves the mix before its samples can go away
  if (v.useProg) ma_data_source_uninit(&v.prog.base); else ma_audio_buffer_ref_uninit(&v.src);
  to(v, VState::Free);
}
// A voice's number for the program: the count of plays when it started (never 0), so a voice that took the place of another is not it.
int32_t voice_id(Voice& v) { return (int32_t)(v.started & 0x7fffffff); }
Voice* voice_at(int32_t id) {
  for (Voice& v : voices) if (v.state != VState::Free && id > 0 && voice_id(v) == id) return &v;
  return nullptr;
}
bool live(Voice& v) { return v.state == VState::Paused || (v.state != VState::Free && !ma_sound_at_end(&v.sound) && (ma_sound_is_playing(&v.sound) || ma_engine_get_time_in_pcm_frames(&eng) < v.from)); }   // playing, held, or waiting for its time
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

// Music: a file played as it is read (ZN-440's streaming, for a song or an audiobook: never decoded whole). A thread per music
// decodes the file into a ring of RING seconds at the mixer's format (48 kHz stereo float); the mixer reads the ring through a
// data source, and plays silence when the thread falls behind (a disk waking up) instead of waiting. On Apple systems the file
// is read by AudioToolbox's ExtAudioFile (AAC, ALAC, MP3, WAV, AIFF: what an iPod or iTunes holds), elsewhere by miniaudio's
// decoders (WAV, FLAC, MP3, Ogg Vorbis). The file is opened on that thread too: a sleeping iPod disk takes a second to answer.
const int MAXMUSIC = 4;
const double RING = 2.0;
// Where a music comes from: a file on disk, read ahead by its thread into the ring (openMusic); or an asset read in place from its mapped pack
// and decoded on the mixer's thread as the mix asks for it (loadMusic, ZN-440.02): no thread, no ring, the decoder's state alone in memory.
enum class MSrc : uint8_t { File, Asset };
enum class FileDecoder : uint8_t { None, AudioToolbox, Miniaudio };
struct Music {
  ma_data_source_base base;   // first: miniaudio sees the music as a data source
  ma_sound sound;
  bool used, soundOn, loop;
  MSrc src;
  int32_t gen;                // the handle is gen << 2 | slot: a closed music's handle is refused, never another's
  const unsigned char* view;  // Asset: the bytes in the pack (zn_asset_view)
  ma_decoder adec;            // Asset: the decoder the mixer reads, its memory counted in heap
  Heap heap;
  size_t fixed;               // Asset: bytes outside heap (the sound's node, a Vorbis decoder's setup)
  char path[1024];
  pthread_t th;
  pthread_mutex_t mu;
  pthread_cond_t cv;
  float* buf;                 // a ring of cap frames (stereo)
  size_t cap, head, count;
  volatile int status;        // 0 opening, 1 open, -1 failed (why: err)
  volatile bool quit, eof, wantPlay;
  double seekTo;              // -1: none asked
  double duration, startAt;   // startAt: where the ring starts in the file, in seconds
  uint64_t played;            // frames read by the mixer since base
  char err[200];
#ifdef __APPLE__
  ExtAudioFileRef xf;
  double fileRate;
#endif
  ma_decoder dec;
  FileDecoder fileDecoder;
};
Music musics[MAXMUSIC];
int32_t music_id(Music& m) { return m.gen << 2 | (int32_t)(&m - musics); }
Music* music_at(int32_t h) { Music* m = h > 0 ? &musics[h & 3] : nullptr; return m && m->used && m->gen == h >> 2 ? m : nullptr; }
static_assert(MAXMUSIC == 4, "music handles keep the slot in 2 bits");
Music* free_music() {
  for (Music& m : musics) if (!m.used) return &m;
  fail("too many musics open (4): close() the ones no longer played");
  return nullptr;
}
// The asset bytes in place (src/host/sys_host.cpp): weak, so a host without them refuses loadMusic.
extern "C" const unsigned char* zn_asset_view(const char* name, uint32_t n, uint64_t* size, const char** why) __attribute__((weak));
extern "C" void zn_asset_unview(const unsigned char* p) __attribute__((weak));
// What stb_vorbis allocates for a file (its setup: codebooks, windows, channel buffers): it takes it from malloc, not from miniaudio's allocator,
// so it is read from a probe of the same bytes. 0 for anything else.
size_t vorbis_setup(const unsigned char* d, uint64_t size) {
  if (size < 4 || memcmp(d, "OggS", 4) || size > 0x7fffffff) return 0;
  int e = 0;
  stb_vorbis* v = stb_vorbis_open_memory(d, (int)size, &e, nullptr);
  if (!v) return 0;
  const size_t n = stb_vorbis_get_info(v).setup_memory_required;
  stb_vorbis_close(v);
  return n;
}

ma_result music_read(ma_data_source* ds, void* out, ma_uint64 frames, ma_uint64* read) {
  Music* m = (Music*)ds;
  float* o = (float*)out;
  size_t n = 0;
  bool end = false;
  if (pthread_mutex_trylock(&m->mu) == 0) {   // the mixer never waits: a busy ring plays silence for this block
    n = frames < m->count ? (size_t)frames : m->count;
    for (size_t i = 0; i < n; i++) { const size_t k = (m->head + i) % m->cap; o[i * 2] = m->buf[k * 2]; o[i * 2 + 1] = m->buf[k * 2 + 1]; }
    m->head = (m->head + n) % m->cap; m->count -= n; m->played += n;
    end = m->eof && m->count == 0 && m->seekTo < 0;
    pthread_mutex_unlock(&m->mu);
    pthread_cond_signal(&m->cv);
  }
  memset(o + n * 2, 0, (size_t)(frames - n) * 2 * sizeof(float));
  if (read) *read = end && n == 0 ? 0 : frames;
  return end && n == 0 ? MA_AT_END : MA_SUCCESS;
}
ma_result music_seek(ma_data_source*, ma_uint64) { return MA_SUCCESS; }
ma_result music_format(ma_data_source*, ma_format* f, ma_uint32* ch, ma_uint32* rate, ma_channel* map, size_t cap) {
  if (f) *f = ma_format_f32;
  if (ch) *ch = 2;
  if (rate) *rate = RATE;
  if (map) ma_channel_map_init_standard(ma_standard_channel_map_default, map, cap, 2);
  return MA_SUCCESS;
}
ma_data_source_vtable music_vtable = {music_read, music_seek, music_format, ds_cursor, ds_length, nullptr, 0};

void file_decoder(Music& m, FileDecoder next) {
  assert((next == FileDecoder::None || m.fileDecoder == FileDecoder::None) && "file decoder already open");
  m.fileDecoder = next;
}
bool music_open_file(Music& m) {
  assert(m.fileDecoder == FileDecoder::None);
#ifdef __APPLE__
  CFURLRef url = CFURLCreateFromFileSystemRepresentation(nullptr, (const UInt8*)m.path, (CFIndex)strlen(m.path), false);
  OSStatus s = url ? ExtAudioFileOpenURL(url, &m.xf) : -1;
  if (url) CFRelease(url);
  if (s == noErr) {
    AudioStreamBasicDescription in{}, want{};
    UInt32 sz = sizeof in;
    SInt64 len = 0;
    ExtAudioFileGetProperty(m.xf, kExtAudioFileProperty_FileDataFormat, &sz, &in);
    sz = sizeof len;
    ExtAudioFileGetProperty(m.xf, kExtAudioFileProperty_FileLengthFrames, &sz, &len);
    m.fileRate = in.mSampleRate > 0 ? in.mSampleRate : RATE;
    m.duration = (double)len / m.fileRate;
    want.mSampleRate = RATE; want.mFormatID = kAudioFormatLinearPCM; want.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked;
    want.mChannelsPerFrame = 2; want.mBitsPerChannel = 32; want.mFramesPerPacket = 1; want.mBytesPerFrame = 8; want.mBytesPerPacket = 8;
    if (ExtAudioFileSetProperty(m.xf, kExtAudioFileProperty_ClientDataFormat, sizeof want, &want) != noErr) {
      ExtAudioFileDispose(m.xf);
      snprintf(m.err, sizeof m.err, "%s: cannot be converted to 48 kHz stereo", m.path);
      return false;
    }
    file_decoder(m, FileDecoder::AudioToolbox);
    return true;
  }
#if !ZP_AUDIO_OPUS
  snprintf(m.err, sizeof m.err, "%s: not a file AudioToolbox can play (error %d)", m.path, (int)s);
  return false;
#endif
#endif
  ma_decoder_config dc = decoding(2, RATE);
  if (ma_decoder_init_file(m.path, &dc, &m.dec) != MA_SUCCESS) { snprintf(m.err, sizeof m.err, "%s: %s", m.path, file_decode_error); return false; }
  ma_uint64 len = 0;
  ma_decoder_get_length_in_pcm_frames(&m.dec, &len);
  m.duration = (double)len / RATE;
  file_decoder(m, FileDecoder::Miniaudio);
  return true;
}
size_t music_decode(Music& m, float* out, size_t frames) {
#ifdef __APPLE__
  if (m.fileDecoder == FileDecoder::AudioToolbox) {
    AudioBufferList bl;
    bl.mNumberBuffers = 1;
    bl.mBuffers[0].mNumberChannels = 2; bl.mBuffers[0].mDataByteSize = (UInt32)(frames * 8); bl.mBuffers[0].mData = out;
    UInt32 n = (UInt32)frames;
    return ExtAudioFileRead(m.xf, &n, &bl) == noErr ? n : 0;
  }
#endif
  ma_uint64 n = 0;
  ma_decoder_read_pcm_frames(&m.dec, out, frames, &n);
  return (size_t)n;
}
void music_file_seek(Music& m, double sec) {
#ifdef __APPLE__
  if (m.fileDecoder == FileDecoder::AudioToolbox) { ExtAudioFileSeek(m.xf, (SInt64)(sec * m.fileRate)); return; }
#endif
  ma_decoder_seek_to_pcm_frame(&m.dec, (ma_uint64)(sec * RATE));
}
void music_close_file(Music& m) {
#ifdef __APPLE__
  if (m.fileDecoder == FileDecoder::AudioToolbox) ExtAudioFileDispose(m.xf);
  else
#endif
  if (m.fileDecoder == FileDecoder::Miniaudio) ma_decoder_uninit(&m.dec);
  file_decoder(m, FileDecoder::None);
}
void* music_thread(void* p) {
  Music& m = *(Music*)p;
  const bool ok = music_open_file(m);
  pthread_mutex_lock(&m.mu);
  m.status = ok ? 1 : -1;
  if (ok && m.wantPlay) ma_sound_start(&m.sound);
  pthread_mutex_unlock(&m.mu);
  if (!ok) return nullptr;
  const size_t CHUNK = 4096;
  float* tmp = (float*)ma_malloc(CHUNK * 2 * sizeof(float), nullptr);
  while (tmp) {
    pthread_mutex_lock(&m.mu);
    while (!m.quit && m.seekTo < 0 && (m.eof || m.cap - m.count < CHUNK)) pthread_cond_wait(&m.cv, &m.mu);
    if (m.quit) { pthread_mutex_unlock(&m.mu); break; }
    double seek = m.seekTo;
    if (seek >= 0) { m.head = m.count = 0; m.played = 0; m.startAt = seek; m.eof = false; m.seekTo = -1; }
    pthread_mutex_unlock(&m.mu);
    if (seek >= 0) music_file_seek(m, seek);
    const size_t n = music_decode(m, tmp, CHUNK);   // unlocked: the mixer reads on meanwhile
    pthread_mutex_lock(&m.mu);
    const bool again = n == 0 && m.loop && m.seekTo < 0;
    if (m.seekTo < 0) {   // a seek asked during the read drops it
      for (size_t i = 0; i < n; i++) { const size_t k = (m.head + m.count + i) % m.cap; m.buf[k * 2] = tmp[i * 2]; m.buf[k * 2 + 1] = tmp[i * 2 + 1]; }
      m.count += n;
      if (n == 0 && !again) m.eof = true;
    }
    pthread_mutex_unlock(&m.mu);
    if (again) music_file_seek(m, 0);   // a loop: the ring goes on with the start, without a gap
  }
  ma_free(tmp, nullptr);
  music_close_file(m);
  return nullptr;
}

// The next frames of the mix. The engine's clock, which time() and the delays count on, stands still while no sound is in
// the graph: it is moved by hand over that silence.
void render(void* out, ma_uint32 frames) {
  const RenderScope scope;
  const ma_uint64 t = ma_engine_get_time_in_pcm_frames(&eng);
  ma_engine_read_pcm_frames(&eng, out, frames, nullptr);
  if (ma_engine_get_time_in_pcm_frames(&eng) < t + frames) ma_engine_set_time_in_pcm_frames(&eng, t + frames);
}
// What the device played, mono, for a microphone's echo canceller (played()): kept from the first call on, a second at most.
pthread_mutex_t tapMu = PTHREAD_MUTEX_INITIALIZER;
bool tapOn;
float tap[RATE];
ma_uint32 tapHead, tapCount;
void keep_played(const float* out, ma_uint32 frames) {
  pthread_mutex_lock(&tapMu);   // ponytail: a lock on the device's thread, held for a copy of one period; a lock-free ring if it ever shows
  for (ma_uint32 i = 0; i < frames; i++) {
    tap[(tapHead + tapCount) % RATE] = (out[2 * i] + out[2 * i + 1]) * 0.5f;
    if (tapCount < RATE) tapCount++; else tapHead = (tapHead + 1) % RATE;
  }
  pthread_mutex_unlock(&tapMu);
}
// While the inspector pauses the program (zinc dev, src/host/gfx_host.cpp) the device gets silence and the mix stands still, so it goes on where it stopped.
extern "C" int zn_dev_paused(void) __attribute__((weak));
int held;   // suspend(): read on the device's thread
void pull(ma_device*, void* out, const void*, ma_uint32 frames) {
  if ((zn_dev_paused && zn_dev_paused()) || __atomic_load_n(&held, __ATOMIC_RELAXED)) { memset(out, 0, (size_t)frames * 2 * sizeof(float)); return; }
  render(out, frames);
  if (tapOn) keep_played((const float*)out, frames);
}
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
void close_music(Music* m) {
  if (!m || !m->used) return;
  if (m->src == MSrc::Asset) {
    ma_sound_uninit(&m->sound);   // leaves the mix before its decoder goes
    ma_decoder_uninit(&m->adec);
    if (zn_asset_unview) zn_asset_unview(m->view);
    m->used = false;
    return;
  }
  pthread_mutex_lock(&m->mu);
  m->quit = true;
  pthread_mutex_unlock(&m->mu);
  pthread_cond_signal(&m->cv);
  pthread_join(m->th, nullptr);
  if (m->soundOn) ma_sound_uninit(&m->sound);   // leaves the mix before its ring goes
  ma_data_source_uninit(&m->base);
  ma_free(m->buf, nullptr);
  pthread_mutex_destroy(&m->mu);
  pthread_cond_destroy(&m->cv);
  m->used = false;
}
void shutdown() {   // the device stops with the program instead of being cut by the system
  if (!opened) return;
  if (output()) ma_device_uninit(&dev);
  for (Voice& v : voices) release(v);
  for (Stream& s : streams) if (s.used) { ma_sound_uninit(&s.sound); s.used = false; }
  for (Music& m : musics) close_music(&m);
  ma_engine_uninit(&eng);
  opened = false;
}
// The mixer, started on first use, and with it the opening of the output unless the run is headless (the rule of the
// window: src/host/hal_dispatch.cpp) or ZINC_AUDIO=null asks for silence.
ma_engine* engine() {
  if (opened) return &eng;
  ma_engine_config c = ma_engine_config_init();
  c.noDevice = MA_TRUE;
  c.channels = 2;
  c.sampleRate = RATE;
  c.allocationCallbacks = counted(&engineHeap);
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
  zrt::String backend() override { control_only(); return str(engine() && output() ? ma_get_backend_name(dev.pContext->backend) : "null"); }
  int32_t load(zrt::Array<uint8_t> bytes) override { control_only();
    int32_t h = free_slot();
    if (h < 0) return -1;
    if (!bytes.a || bytes.a->len <= 0) return fail("the file is empty");
    engine();   // a program loads its sounds as it starts: the output opens now, not at the first play()
    // Ask the decoder for its native format; keep other sources' existing float conversion and precision.
    ma_decoder_config dc = decoding(0, 0);
    ma_decoder_config probeConfig = dc;
    probeConfig.format = ma_format_unknown;
    ma_decoder probe;
    if (ma_decoder_init_memory(bytes.a->data, (size_t)bytes.a->len, &probeConfig, &probe) == MA_SUCCESS) {
      if (probe.outputFormat == ma_format_s16) dc.format = ma_format_s16;
      ma_decoder_uninit(&probe);
    }
    if (bytes.a->len >= 262144 && memcmp(bytes.a->data, "RIFF", 4)) {   // a long compressed file: its decode (15 s of a 4 MB MP3 on a Pi 3) is not waited for
      void* file = malloc((size_t)bytes.a->len);   // the program's array may go once load() returns
      ma_decoder* d = (ma_decoder*)malloc(sizeof(ma_decoder));
      ma_uint64 len = 0;
      if (file && d) memcpy(file, bytes.a->data, (size_t)bytes.a->len);
      if (file && d && ma_decoder_init_memory(file, (size_t)bytes.a->len, &dc, d) == MA_SUCCESS) {
        if (ma_decoder_get_length_in_pcm_frames(d, &len) == MA_SUCCESS && len > 0 && len < ((ma_uint64)1 << 31) / ma_get_bytes_per_frame(d->outputFormat, d->outputChannels)) {
          void* pcm = ma_malloc((size_t)len * ma_get_bytes_per_frame(d->outputFormat, d->outputChannels), nullptr);
          if (pcm) {
            clips[h] = Clip{pcm, len, d->outputChannels, d->outputSampleRate, d->outputFormat, 0, 1, 0, 0, d, file};
            if (pthread_create(&clips[h].th, nullptr, decode_thread, &clips[h]) == 0) return h;
            ma_free(pcm, nullptr);
            clips[h] = Clip{};
          }
        }
        ma_decoder_uninit(d);
      }
      free(file);
      free(d);
    }
    ma_uint64 frames = 0;
    void* pcm = nullptr;
    ma_result r = ma_decode_memory(bytes.a->data, (size_t)bytes.a->len, &dc, &frames, &pcm);
    if (r != MA_SUCCESS || !pcm || frames == 0) {
      if (pcm) ma_free(pcm, nullptr);
      return fail(r == MA_OUT_OF_MEMORY ? "out of memory" : decode_error);
    }
    clips[h] = Clip{pcm, frames, dc.channels, dc.sampleRate, dc.format};
    return h;
  }
  int32_t tone(int32_t wave, double hz, double seconds) override { control_only();
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
    clips[h] = Clip{pcm, frames, 1, RATE, ma_format_f32};
    return h;
  }
  zrt::String error() override { control_only(); return str(err_msg); }
  double duration(int32_t h) override { control_only(); Clip* c = clip_at(h); return c ? (double)c->frames / c->rate : 0; }
  void unload(int32_t h) override { control_only();
    Clip* c = clip_at(h);
    if (!c) return;
    stop(h);
    settle(c, true);
    ma_free(c->pcm, nullptr);
    *c = Clip{};
  }
  bool play(int32_t h, double volume, bool loop, double rate, double pan) override { control_only(); return start(h, volume, loop, rate, pan, 0, 0) != 0; }
  int32_t start(int32_t h, double volume, bool loop, double rate, double pan, double offset, double delay) override { control_only();
    Clip* c = clip_at(h);
    ma_engine* e = engine();
    if (!c || !e) return 0;
    Voice* v = nullptr;
    for (Voice& x : voices) if (!live(x)) { v = &x; break; }
    if (!v) {   // all busy: the oldest one-shot gives way, a loop (the music) or a held voice (a paused narration) only when there is nothing else
      auto age = [](Voice& x) { return x.started + (ma_sound_is_looping(&x.sound) || x.state == VState::Paused ? (uint64_t)1 << 62 : 0); };
      v = &voices[0];
      for (Voice& x : voices) if (age(x) < age(*v)) v = &x;
    }
    release(*v);
    v->useProg = __atomic_load_n(&c->pending, __ATOMIC_ACQUIRE) != 0;   // a long file still decoding is read as it comes
    ma_data_source* src = &v->src.ds;
    if (v->useProg) {
      v->prog.clip = c;
      v->prog.cursor = 0;
      ma_data_source_config pc = ma_data_source_config_init();
      pc.vtable = &prog_vtable;
      if (ma_data_source_init(&pc, &v->prog.base) != MA_SUCCESS) return 0;
      src = &v->prog.base;
    } else {
      ma_audio_buffer_ref_init(c->format, c->channels, c->pcm, c->frames, &v->src);
      v->src.sampleRate = c->rate;   // miniaudio 0.11 leaves it at 0, which would play the clip at the mixer's rate
    }
    // a 2D mix: no 3D position, and a resampler only for a voice played at another rate (ZN-656): a clip at the mixer's
    // rate played at 1 is added sample for sample (miniaudio's resampler runs even at a ratio of 1)
    const float r = rate_of(rate);
    const ma_uint32 flags = MA_SOUND_FLAG_NO_SPATIALIZATION | (r == 1.0f ? MA_SOUND_FLAG_NO_PITCH : 0);
    if (ma_sound_init_from_data_source(e, src, flags, nullptr, &v->sound) != MA_SUCCESS) return 0;
    to(*v, VState::Playing);
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
  void stop(int32_t h) override { control_only(); for (Voice& v : voices) if (v.state != VState::Free && v.clip == h) release(v); }
  bool playing(int32_t h) override { control_only();
    for (Voice& v : voices) if (v.clip == h && live(v)) return true;
    return false;
  }
  void setVolume(int32_t h, double volume) override { control_only(); for (Voice& v : voices) if (v.state != VState::Free && v.clip == h) ma_sound_set_volume(&v.sound, (float)volume); }
  void setLoop(int32_t h, bool on) override { control_only(); for (Voice& v : voices) if (v.state != VState::Free && v.clip == h) ma_sound_set_looping(&v.sound, on); }
  void setRate(int32_t h, double rate) override { control_only(); for (Voice& v : voices) if (v.state != VState::Free && v.pitched && v.clip == h) ma_sound_set_pitch(&v.sound, rate_of(rate)); }
  void setPan(int32_t h, double pan) override { control_only(); for (Voice& v : voices) if (v.state != VState::Free && v.clip == h) ma_sound_set_pan(&v.sound, pan_of(pan)); }
  void stopAll() override { control_only(); for (Voice& v : voices) release(v); }
  // A stop now, or at a frame of the mix; with a fade, miniaudio's fader takes the voice's gain from where it is to 0 over the `fade` seconds
  // before that frame, sample by sample on the mixer's thread (after the resampler: a pitched voice fades over the same frames of mix).
  void voiceStop(int32_t id, double delay, double fade) override { control_only();
    Voice* v = voice_at(id);
    if (!v) return;
    const ma_uint64 d = delay > 0 ? (ma_uint64)(delay * RATE + 0.5) : 0, f = fade > 0 ? (ma_uint64)(fade * RATE + 0.5) : 0;
    if (d + f == 0 || v->state == VState::Paused) { release(*v); return; }   // a held voice is silent: it ends now
    ma_sound_set_stop_time_with_fade_in_pcm_frames(&v->sound, ma_engine_get_time_in_pcm_frames(&eng) + d + f, f);
    to(*v, VState::Ending);   // a second stop moves the end (a running fade goes on when it asks for none)
  }
  // pause() takes the voice out of the mix at once, where it is (ma_sound_stop keeps the cursor), and resume() puts it back: the frames of mix
  // in between do not count, so it ends that much later. ponytail: a hard cut, as alSourcePause or FMOD's setPaused; a few ms of ramp (fade, then
  // seek back by the ramp on resume) if a click is heard.
  void voicePause(int32_t id, bool on) override { control_only();
    Voice* v = voice_at(id);
    if (!v) return;
    if (on && live(*v) && to(*v, VState::Paused)) ma_sound_stop(&v->sound);
    else if (!on && v->state == VState::Paused && to(*v, VState::Playing)) ma_sound_start(&v->sound);
  }
  void voiceSet(int32_t id, double volume, double rate, double pan) override { control_only();
    Voice* v = voice_at(id);
    if (!v) return;
    ma_sound_set_volume(&v->sound, (float)volume);
    if (v->pitched) ma_sound_set_pitch(&v->sound, rate_of(rate));
    ma_sound_set_pan(&v->sound, pan_of(pan));
  }
  bool voicePlaying(int32_t id) override { control_only(); Voice* v = voice_at(id); return v && live(*v); }
  void voiceLoop(int32_t id, double from, double to) override { control_only();
    Voice* v = voice_at(id);
    Clip* c = v && !v->useProg ? clip_at(v->clip) : nullptr;
    if (!c) return;
    const auto at = [c](double s) { const ma_uint64 f = s > 0 ? (ma_uint64)(s * c->rate) : 0; return f < c->frames ? f : c->frames; };
    const ma_uint64 b = at(from), e = at(to);
    ma_data_source_set_loop_point_in_pcm_frames(&v->src, e > b ? b : 0, e > b ? e : ~(ma_uint64)0);   // ~0: to the end
  }
  void suspend(bool on) override { control_only(); __atomic_store_n(&held, on ? 1 : 0, __ATOMIC_RELAXED); }
  int32_t pcm(zrt::Array<double> samples, int32_t channels, int32_t rate) override { control_only();
    const int64_t frames = samples.a && channels > 0 ? samples.a->len / channels : 0;
    if (channels < 1 || channels > 2 || rate < 8000 || rate > 192000 || frames < 1) return fail("samples of 1 or 2 channels, at 8000 to 192000 frames per second");
    int32_t h = free_slot();
    if (h < 0) return -1;
    engine();
    float* pcm = (float*)ma_malloc((size_t)(frames * channels) * sizeof(float), nullptr);
    if (!pcm) return fail("out of memory");
    for (int64_t i = 0; i < frames * channels; i++) pcm[i] = (float)samples.a->data[i];
    clips[h] = Clip{pcm, (ma_uint64)frames, (ma_uint32)channels, (ma_uint32)rate, ma_format_f32};
    return h;
  }
  int32_t channels(int32_t h) override { control_only(); Clip* c = clip_at(h); return c ? (int32_t)c->channels : 0; }
  int32_t rate(int32_t h) override { control_only(); Clip* c = clip_at(h); return c ? (int32_t)c->rate : 0; }
  zrt::Array<double> samples(int32_t h, int32_t channel) override { control_only();
    Clip* c = clip_at(h);
    if (!c || channel < 0 || (ma_uint32)channel >= c->channels || c->frames > 0x7fffffff) return zrt::Array<double>::with_cap(0);
    settle(c, false);
    const int32_t n = (int32_t)c->frames;
    zrt::Array<double> r = zrt::Array<double>::with_cap(n);
    for (int32_t i = 0; i < n; i++) {
      const size_t at = (size_t)i * c->channels + channel;
      r.a->data[i] = c->format == ma_format_s16 ? (double)((const ma_int16*)c->pcm)[at] / 32768.0 : ((const float*)c->pcm)[at];
    }
    r.a->len = n;
    return r;
  }
  int32_t streamOpen(int32_t channels, int32_t rate) override { control_only();
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
  int32_t streamWrite(int32_t h, zrt::Array<double> samples) override { control_only();
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
  zrt::Array<double> streamInfo(int32_t h) override { control_only();
    Stream* s = stream_at(h);
    zrt::Array<double> r = zrt::Array<double>::with_cap(3);
    double v[3] = {0, 0, 0};
    if (s) { pthread_mutex_lock(&s->mu); v[0] = (double)(s->count / s->channels) / s->rate; v[1] = (double)s->underruns; v[2] = (double)s->dropped; pthread_mutex_unlock(&s->mu); }
    memcpy(r.a->data, v, sizeof v);
    r.a->len = 3;
    return r;
  }
  void streamSetVolume(int32_t h, double volume) override { control_only(); if (Stream* s = stream_at(h)) ma_sound_set_volume(&s->sound, (float)volume); }
  void streamClose(int32_t h) override { control_only();
    Stream* s = stream_at(h);
    if (!s) return;
    ma_sound_uninit(&s->sound);   // leaves the mix before its buffer goes
    ma_data_source_uninit(&s->base);
    ma_free(s->buf, nullptr);
    pthread_mutex_destroy(&s->mu);
    s->used = false;
  }
  int32_t musicOpen(zrt::String path) override { control_only();
    ma_engine* e = engine();
    if (!e) return fail("no mixer");
    if (path.bytes() == 0 || path.bytes() >= sizeof(musics[0].path)) return fail("no file, or a path too long");
    Music* free_m = free_music();
    if (!free_m) return -1;
    Music& m = *free_m;
    memset(m.path, 0, sizeof m.path);
    memcpy(m.path, path.ptr(), path.bytes());
    m.cap = (size_t)(RING * RATE);
    m.buf = (float*)ma_malloc(m.cap * 2 * sizeof(float), nullptr);
    if (!m.buf) return fail("out of memory");
    m.head = m.count = 0; m.played = 0; m.startAt = 0; m.duration = 0; m.seekTo = -1;
    m.status = 0; m.quit = false; m.eof = false; m.wantPlay = false; m.loop = false; m.err[0] = 0;
    m.src = MSrc::File;
    pthread_mutex_init(&m.mu, nullptr);
    pthread_cond_init(&m.cv, nullptr);
    ma_data_source_config dc = ma_data_source_config_init();
    dc.vtable = &music_vtable;
    const bool ds = ma_data_source_init(&dc, &m.base) == MA_SUCCESS;
    m.soundOn = ds && ma_sound_init_from_data_source(e, &m.base, MA_SOUND_FLAG_NO_SPATIALIZATION | MA_SOUND_FLAG_NO_PITCH, nullptr, &m.sound) == MA_SUCCESS;
    if (!m.soundOn || pthread_create(&m.th, nullptr, music_thread, &m) != 0) {   // nothing is left behind (it leaked the source, mutex and condition)
      if (m.soundOn) ma_sound_uninit(&m.sound);
      if (ds) ma_data_source_uninit(&m.base);
      pthread_mutex_destroy(&m.mu);
      pthread_cond_destroy(&m.cv);
      ma_free(m.buf, nullptr);
      return fail("the music cannot start");
    }
    m.gen++;
    m.used = true;
    return music_id(m);
  }
  // An asset streamed in place: the decoder reads the mapped pack on the mixer's thread, as the mix pulls frames, at the file's own rate and
  // channels (the sound's node converts them, so a loop is seamless across the resampler too); a loop is miniaudio's data-source loop, which
  // seeks to the start inside the read that reached the end.
  int32_t musicAsset(zrt::String name) override { control_only();
    ma_engine* e = engine();
    if (!e) return fail("no mixer");
    if (!zn_asset_view || !zn_asset_unview) return fail("this program reads no asset in place");
    Music* free_m = free_music();
    if (!free_m) return -1;
    Music& m = *free_m;
    uint64_t size = 0;
    const char* why = "no such asset";
    const unsigned char* d = zn_asset_view(name.ptr(), (uint32_t)name.bytes(), &size, &why);
    if (!d) return fail(why);
    m.heap = Heap{};
    ma_decoder_config dc = decoding(0, 0);
    dc.allocationCallbacks = counted(&m.heap);
    if (ma_decoder_init_memory(d, (size_t)size, &dc, &m.adec) != MA_SUCCESS) {
      zn_asset_unview(d);
      return fail(decode_error);
    }
    const size_t before = __atomic_load_n(&engineHeap.now, __ATOMIC_RELAXED);
    const ma_uint32 flags = MA_SOUND_FLAG_NO_SPATIALIZATION | (m.adec.outputSampleRate == RATE ? MA_SOUND_FLAG_NO_PITCH : 0);   // a resampler only off 48 kHz
    if (ma_sound_init_from_data_source(e, &m.adec, flags, nullptr, &m.sound) != MA_SUCCESS) {
      ma_decoder_uninit(&m.adec);
      zn_asset_unview(d);
      return fail("the music cannot start");
    }
    m.fixed = __atomic_load_n(&engineHeap.now, __ATOMIC_RELAXED) - before + vorbis_setup(d, size);
    ma_uint64 len = 0;
    ma_decoder_get_length_in_pcm_frames(&m.adec, &len);
    m.duration = m.adec.outputSampleRate ? (double)len / m.adec.outputSampleRate : 0;
    m.src = MSrc::Asset;
    m.view = d;
    m.status = 1;
    m.soundOn = true;
    m.wantPlay = m.loop = false;
    m.err[0] = 0;
    snprintf(m.path, sizeof m.path, "%.*s", (int)name.bytes(), name.ptr());
    m.gen++;
    m.used = true;
    return music_id(m);
  }
  void musicPlay(int32_t h, bool on) override { control_only();
    Music* m = music_at(h);
    if (!m) return;
    if (m->src == MSrc::Asset) {   // ma_sound_start plays an ended sound from its start
      m->wantPlay = on;
      if (on) ma_sound_start(&m->sound); else ma_sound_stop(&m->sound);
      return;
    }
    pthread_mutex_lock(&m->mu);
    m->wantPlay = on;
    if (m->status == 1) {
      if (on && m->eof && m->count == 0 && m->seekTo < 0) { m->seekTo = 0; pthread_cond_signal(&m->cv); }   // played to its end: again from the start
      if (on) ma_sound_start(&m->sound); else ma_sound_stop(&m->sound);
    }
    pthread_mutex_unlock(&m->mu);
  }
  void musicLoop(int32_t h, bool on) override { control_only();
    Music* m = music_at(h);
    if (!m) return;
    if (m->src == MSrc::Asset) { m->loop = on; ma_sound_set_looping(&m->sound, on); return; }
    pthread_mutex_lock(&m->mu);
    m->loop = on;
    pthread_mutex_unlock(&m->mu);
  }
  void musicSeek(int32_t h, double seconds) override { control_only();
    Music* m = music_at(h);
    if (!m) return;
    const double at = seconds > 0 ? (m->duration > 0 && seconds > m->duration ? m->duration : seconds) : 0;
    if (m->src == MSrc::Asset) { ma_sound_seek_to_pcm_frame(&m->sound, (ma_uint64)(at * m->adec.outputSampleRate)); return; }   // done on the mixer's thread
    pthread_mutex_lock(&m->mu);
    m->seekTo = at;
    m->head = m->count = 0;   // what was decoded for before the seek is not heard
    pthread_mutex_unlock(&m->mu);
    pthread_cond_signal(&m->cv);
  }
  zrt::Array<double> musicInfo(int32_t h) override { control_only();
    Music* m = music_at(h);
    double v[5] = {0, 0, 0, -1, 0};
    if (m && m->src == MSrc::Asset) {
      ma_uint64 at = 0;
      ma_sound_get_cursor_in_pcm_frames(&m->sound, &at);
      const bool end = ma_sound_at_end(&m->sound);
      v[0] = end ? m->duration : (double)at / m->adec.outputSampleRate;
      v[1] = m->duration;
      v[2] = m->wantPlay && !end ? 1 : 0;
      v[3] = end ? 2 : 1;
      v[4] = (double)(__atomic_load_n(&m->heap.peak, __ATOMIC_RELAXED) + m->fixed);
    } else if (m) {
      pthread_mutex_lock(&m->mu);
      v[0] = m->seekTo >= 0 ? m->seekTo : m->startAt + (double)m->played / RATE;
      if (m->duration > 0 && v[0] > m->duration) v[0] = m->loop ? fmod(v[0], m->duration) : m->duration;
      v[1] = m->duration;
      v[2] = m->wantPlay && m->status == 1 && !(m->eof && m->count == 0 && m->seekTo < 0) ? 1 : 0;
      v[3] = m->status == 1 && m->eof && m->count == 0 && m->seekTo < 0 ? 2 : m->status;
      v[4] = (double)(m->cap * 2 * sizeof(float));   // its ring; the system's decoder is not counted
      pthread_mutex_unlock(&m->mu);
    }
    zrt::Array<double> r = zrt::Array<double>::with_cap(5);
    memcpy(r.a->data, v, sizeof v);
    r.a->len = 5;
    return r;
  }
  zrt::String musicError(int32_t h) override { control_only(); Music* m = music_at(h); return str(m ? m->err : "no such music"); }
  void musicSetVolume(int32_t h, double volume) override { control_only(); if (Music* m = music_at(h)) ma_sound_set_volume(&m->sound, (float)volume); }
  void musicClose(int32_t h) override { control_only(); close_music(music_at(h)); }
  zrt::Array<double> played() override { control_only();
    pthread_mutex_lock(&tapMu);
    tapOn = true;
    zrt::Array<double> r = zrt::Array<double>::with_cap((int32_t)tapCount);
    for (ma_uint32 i = 0; i < tapCount; i++) r.a->data[i] = tap[(tapHead + i) % RATE];
    r.a->len = (int32_t)tapCount;
    tapHead = tapCount = 0;
    pthread_mutex_unlock(&tapMu);
    return r;
  }
  double time() override { control_only(); return opened ? (double)ma_engine_get_time_in_pcm_frames(&eng) / RATE : 0; }
  void setMasterVolume(double volume) override { control_only(); if (ma_engine* e = engine()) ma_engine_set_volume(e, (float)volume); }
  zrt::Array<double> mix(int32_t frames) override { control_only();
    ma_engine* e = engine();
    if (!e || frames <= 0 || output()) return zrt::Array<double>::with_cap(0);   // a device has the mix: two readers would tear it
    if (frames > 480000) frames = 480000;   // 10 s a call
    float* buf = (float*)ma_malloc((size_t)frames * 2 * sizeof(float), nullptr);
    if (!buf) return zrt::Array<double>::with_cap(0);
    if (__atomic_load_n(&held, __ATOMIC_RELAXED)) memset(buf, 0, (size_t)frames * 2 * sizeof(float));   // suspended: silence, the time stands still
    else render(buf, (ma_uint32)frames);   // it fills what no voice reaches with silence
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
