// Exercise the production clip readers; count requested PCM allocation bytes, not whole-process RSS.
#define ZRT_HOSTED_CPP
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <vector>
#include "../../plugins/audio/vendor/miniaudio.h"
static ma_result tracked_decode(const void*, size_t, ma_decoder_config*, ma_uint64*, void**);
static void* tracked_malloc(size_t, const ma_allocation_callbacks*);
#define ma_decode_memory tracked_decode
#define ma_malloc tracked_malloc
#include "../../plugins/audio/native/audio.host.cpp"
#undef ma_decode_memory
#undef ma_malloc

static std::map<void*, size_t> allocations;
static size_t pcmBytes;
static void* tracked_malloc(size_t n, const ma_allocation_callbacks* callbacks) {
  void* p = ma_malloc(n, callbacks);
  if (p && !callbacks) allocations[p] = n;
  return p;
}
static void* alloc(size_t n, void*) { void* p = malloc(n); if (p) allocations[p] = n; return p; }
static void* realloc_pcm(void* p, size_t n, void*) {
  void* q = realloc(p, n);
  if (q) { allocations.erase(p); allocations[q] = n; }
  return q;
}
static void free_pcm(void* p, void*) { allocations.erase(p); free(p); }
static ma_result tracked_decode(const void* data, size_t size, ma_decoder_config* config, ma_uint64* frames, void** out) {
  ma_decoder_config c = *config;
  c.allocationCallbacks = {nullptr, alloc, realloc_pcm, free_pcm};
  const ma_result result = ma_decode_memory(data, size, &c, frames, out);
  *config = c;
  pcmBytes = *out ? allocations.at(*out) : 0;
  return result;
}
static void put(std::vector<uint8_t>& b, size_t at, unsigned value, int n) {
  for (int i = 0; i < n; ++i) b[at + i] = (uint8_t)(value >> (8 * i));
}
static std::vector<uint8_t> wav(int frames, int channels, int bits = 16, int tag = 1) {
  const int bytes = bits / 8, len = frames * channels * bytes;
  std::vector<uint8_t> b(44 + len);
  memcpy(b.data(), "RIFF", 4); put(b, 4, 36 + len, 4); memcpy(b.data() + 8, "WAVEfmt ", 8);
  put(b, 16, 16, 4); put(b, 20, tag, 2); put(b, 22, channels, 2); put(b, 24, RATE, 4);
  put(b, 28, RATE * channels * bytes, 4); put(b, 32, channels * bytes, 2); put(b, 34, bits, 2);
  memcpy(b.data() + 36, "data", 4); put(b, 40, len, 4);
  for (int i = 0; i < frames; ++i) for (int ch = 0; ch < channels; ++ch) {
    const int value = i == frames - 1 ? 24576 : ch == 0 ? 8192 : -16384;
    const size_t at = 44 + (i * channels + ch) * bytes;
    if (tag == 3) { const float f = 1.23456788f; memcpy(b.data() + at, &f, 4); }
    else if (bits == 8) b[at] = 160;
    else put(b, at, (unsigned)(value * (bits == 24 ? 256 : bits == 32 ? 65536 : 1)) + (bits > 16 ? 127 : 0), bytes);
  }
  return b;
}
static int load(HostAudio& audio, const std::vector<uint8_t>& b) {
  auto data = zrt::Array<uint8_t>::with_cap((int)b.size());
  memcpy(data.a->data, b.data(), b.size()); data.a->len = (int)b.size();
  const int h = audio.load(data); assert(h >= 0); return h;
}
static void check(HostAudio& audio, int frames, int channels) {
  const auto b = wav(frames, channels);
  auto config = ma_decoder_config_init(ma_format_f32, 0, 0);
  ma_uint64 count = 0; void* reference = nullptr;
  assert(tracked_decode(b.data(), b.size(), &config, &count, &reference) == MA_SUCCESS);
  const size_t floatBytes = pcmBytes;
  const int h = load(audio, b);
  assert(clips[h].format == ma_format_s16 && clips[h].frames == (ma_uint64)frames);
  assert(pcmBytes * 2 == floatBytes);
  const size_t storedBytes = pcmBytes;
  for (int ch = 0; ch < channels; ++ch) {
    const auto samples = audio.samples(h, ch);
    assert(samples.a->len == frames);
    for (int i = 0; i < frames; ++i) assert(samples.a->data[i] == ((const float*)reference)[i * channels + ch]);
  }
  assert(audio.play(h, 1, false, 1, 0));
  const auto mixed = audio.mix(frames + 8);
  for (int i = 0; i < frames + 8; ++i) for (int ch = 0; ch < 2; ++ch) {
    const float want = i < frames ? ((const float*)reference)[i * channels + (channels == 1 ? 0 : ch)] : 0;
    assert(mixed.a->data[i * 2 + ch] == want);
  }
  assert(!audio.playing(h));
  printf("%d frames %d channels: whole, PCM allocation %zu -> %zu bytes\n", frames, channels, floatBytes, storedBytes);
  ma_free(reference, nullptr); audio.unload(h);
}
int main() {
  setenv("ZINC_HEADLESS", "1", 1);
  HostAudio audio;
  for (int n : {240, 480, 960, 2000}) for (int ch : {1, 2}) check(audio, n, ch);
  for (int bits : {8, 24, 32}) {
    const auto b = wav(480, 1, bits);
    const int h = load(audio, b);
    assert(clips[h].format == ma_format_f32);
    auto config = ma_decoder_config_init(ma_format_f32, 0, 0);
    ma_uint64 n = 0; void* reference = nullptr;
    assert(tracked_decode(b.data(), b.size(), &config, &n, &reference) == MA_SUCCESS);
    const auto samples = audio.samples(h, 0);
    for (int i = 0; i < 480; ++i) assert(samples.a->data[i] == ((float*)reference)[i]);
    ma_free(reference, nullptr); audio.unload(h);
  }
  const int h = load(audio, wav(480, 1, 32, 3));
  assert(clips[h].format == ma_format_f32 && audio.samples(h, 0).a->data[479] == (double)1.23456788f);
  audio.unload(h);
  // A padded QOA takes the real background decoder path without requiring a long-running sound.
  qoa_desc desc{}; desc.channels = 1; desc.samplerate = RATE; desc.samples = 48000;
  std::vector<short> pcm(desc.samples, 8192); pcm.back() = 24576;
  unsigned size = 0;
  void* encoded = qoa_encode(pcm.data(), &desc, &size); assert(encoded);
  std::vector<uint8_t> file(262144); assert(size <= file.size()); memcpy(file.data(), encoded, size); free(encoded);
  const int async = load(audio, file);
  assert(clips[async].th); settle(&clips[async], false);
  assert(clips[async].format == ma_format_s16 && clips[async].frames == desc.samples);
  assert(allocations.at(clips[async].pcm) == desc.samples * sizeof(short));
  auto config = decoding(0, 0);
  ma_uint64 frames = 0; void* reference = nullptr;
  assert(tracked_decode(file.data(), file.size(), &config, &frames, &reference) == MA_SUCCESS);
  const auto samples = audio.samples(async, 0);
  for (ma_uint64 i = 0; i < frames; ++i) assert(samples.a->data[i] == ((float*)reference)[i]);
  printf("progressive QOA: %llu frames, PCM allocation 192000 -> %zu bytes\n", frames, allocations.at(clips[async].pcm));
  ma_free(reference, nullptr); audio.unload(async);
  const int generated = audio.tone(0, 440, 0.01);
  assert(generated >= 0 && clips[generated].format == ma_format_f32); audio.unload(generated);
  auto precise = zrt::Array<double>::with_cap(1); precise.a->data[0] = 1.23456788; precise.a->len = 1;
  const int computed = audio.pcm(precise, 1, RATE);
  assert(computed >= 0 && clips[computed].format == ma_format_f32 && audio.samples(computed, 0).a->data[0] == (double)(float)precise.a->data[0]);
  audio.unload(computed);
  // The progressive reader must use the clip's byte width and format even while playback waits for more data.
  for (ma_format format : {ma_format_u8, ma_format_s16, ma_format_f32}) {
    unsigned char pcm[16]{};
    Clip clip{}; clip.pcm = pcm; clip.frames = 4; clip.channels = 1; clip.rate = RATE; clip.format = format;
    clip.filled = 2; clip.pending = 1;
    Prog p{}; p.clip = &clip;
    unsigned char out[16]; memset(out, 0xcc, sizeof out);
    ma_uint64 n = 0;
    assert(prog_read(&p, out, 4, &n) == MA_SUCCESS && n == 4 && p.cursor == 2);
    const size_t bytes = ma_get_bytes_per_sample(format);
    assert(memcmp(out, pcm, bytes * 2) == 0);
    for (size_t i = bytes * 2; i < bytes * 4; ++i) assert(out[i] == (format == ma_format_u8 ? 128 : 0));
    ma_format actual; prog_format(&p, &actual, nullptr, nullptr, nullptr, 0); assert(actual == format);
    clip.pending = 0;
    assert(prog_read(&p, out, 4, &n) == MA_SUCCESS && n == 2 && p.cursor == 4);
    assert(prog_read(&p, out, 4, &n) == MA_AT_END && n == 0);
  }
  puts("native sample precision and progressive formats: ok");
  printf("clip table: %zu bytes, %zu per slot\n", sizeof clips, sizeof(Clip));
  shutdown();
}
