#define ZRT_HOSTED_CPP
#include <cassert>
#include <cstdio>
#include <vector>
#include <unistd.h>
#define zn_asset_view test_asset_view
#define zn_asset_unview test_asset_unview
#include "../../plugins/audio/native/audio.host.cpp"
#ifdef ZN_AUDIO_OPUS_WEBRTC_TEST
#include "zinc_native_webrtc.h"
#include "../../plugins/webrtc/native/media.h"
#endif
static std::vector<unsigned char> bytes;
extern "C" const unsigned char* zn_asset_view(const char*, uint32_t, uint64_t* size, const char**) { *size = bytes.size(); return bytes.data(); }
extern "C" void zn_asset_unview(const unsigned char*) {}
static bool audible(HostAudio& audio, int frames) {
  auto pcm = audio.mix(frames);
  for (int i = 0; i < pcm.a->len; ++i) if (fabs(pcm.a->data[i]) > 0.001) return true;
  return false;
}
int main(int argc, char** argv) {
  assert(argc == 2);
  FILE* f = fopen(argv[1], "rb"); assert(f);
  unsigned char block[1024]; size_t n;
  while ((n = fread(block, 1, sizeof block, f))) bytes.insert(bytes.end(), block, block + n);
  fclose(f);
#ifdef ZN_AUDIO_OPUS_WEBRTC_TEST
  auto* rtc = zinc_create_WebRTC();
  const int peer = rtc->create(str(""), false); assert(peer >= 0);
  auto* encoder = media::opusEncoder(1, 32000); assert(encoder);
  assert(media::opusSetDred(encoder, 100));
  float input[960]{}; unsigned char packet[4000];
  const int encoded = media::opusEncode(encoder, input, packet, sizeof packet); assert(encoded > 0);
  auto* rtcdecoder = media::opusDecoder(); assert(rtcdecoder);
  float output[5760]; assert(media::opusDecode(rtcdecoder, packet, encoded, output, 5760) > 0);
  media::opusFree(rtcdecoder); media::opusFree(encoder); rtc->close(peer);
  puts("combined WebRTC factory, DRED, encode/decode passed");
#endif
  HostAudio audio;
  auto b = zrt::Array<uint8_t>::with_cap((int)bytes.size());
  memcpy(b.a->data, bytes.data(), bytes.size()); b.a->len = (int)bytes.size();
  const int clip = audio.load(b);
#if !ZP_AUDIO_OPUS
  assert(clip < 0);
  assert(audio.musicAsset(str("tone")) < 0);
  puts("optional Opus disabled: rejected");
#else
  assert(clip >= 0 && fabs(audio.duration(clip) - .24) < .001);
  assert(audio.play(clip, 1, false, 1, 0) && audible(audio, 512));
  audio.stop(clip); assert(!audible(audio, 512)); audio.unload(clip);
  auto config = decoding(2, RATE); ma_decoder decoder;
  assert(ma_decoder_init_memory(bytes.data(), bytes.size(), &config, &decoder) == MA_SUCCESS);
  assert(ma_decoder_seek_to_pcm_frame(&decoder, 4800) == MA_SUCCESS);
  float pcm[1024]; ma_uint64 got = 0;
  assert(ma_decoder_read_pcm_frames(&decoder, pcm, 512, &got) == MA_SUCCESS && got == 512);
  ma_decoder_uninit(&decoder);
  assert(ma_decoder_init_memory(bytes.data(), 30, &config, &decoder) != MA_SUCCESS);
  unsigned char invalid[32]{};
  assert(ma_decoder_init_memory(invalid, sizeof invalid, &config, &decoder) != MA_SUCCESS);
  int h = audio.musicAsset(str("tone")); if (h < 0) fprintf(stderr, "asset error: %.*s\n", (int)audio.error().bytes(), audio.error().ptr()); assert(h >= 0);
  audio.musicSeek(h, .1); audio.musicPlay(h, true); assert(audible(audio, 512));
  audio.mix(12000); assert(audio.musicInfo(h).a->data[3] == 2);
  audio.musicLoop(h, true); audio.musicPlay(h, true); assert(audible(audio, 24000));
  audio.musicClose(h); assert(!audible(audio, 512));
  // Closing and reopening the same slot also exercises the file decoder's reset.
  for (int attempt = 0; attempt < 2; ++attempt) {
    h = audio.musicOpen(str(argv[1])); assert(h >= 0);
    bool ready = false;
    for (int i = 0; i < 1000; ++i) {
      Music* m = music_at(h); assert(m);
      pthread_mutex_lock(&m->mu); ready = m->status == 1 && m->count >= 512; pthread_mutex_unlock(&m->mu);
      if (ready) break;
      usleep(1000);
    }
    if (!ready) { Music* m = music_at(h); fprintf(stderr, "file status=%d count=%zu decoder=%d error=%s\n", m->status, m->count, (int)m->fileDecoder, m->err); }
    assert(ready); audio.musicPlay(h, true); assert(audible(audio, 512));
    audio.musicClose(h); assert(!audible(audio, 512));
  }
  puts("Opus: clip, mapped music, file music, restart, seek, loop, end, malformed, stop passed");
#endif
  zrt::finish_run();
}
