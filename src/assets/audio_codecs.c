/* The codecs of the audio importer (ZN-440.01, assets.cpp): the sources are read by miniaudio's decoders (WAV, FLAC, MP3; Ogg Vorbis through
   stb_vorbis), which also resample and mix down, and encoded by qoa.h: the translation unit of zinc:audio (plugins/audio/vendor, PIN), without
   devices, threads, engine or encoders. Compiled with hidden visibility (CMakeLists.txt): zinc exports its symbols to the plugins it loads, and
   the audio plugin has its own miniaudio and qoa, built with other options. */
#define MA_NO_DEVICE_IO
#define MA_NO_THREADING
#define MA_NO_ENGINE
#define MA_NO_NODE_GRAPH
#define MA_NO_RESOURCE_MANAGER
#define MA_NO_GENERATION
#define MA_NO_ENCODING
#include "../../plugins/audio/vendor/miniaudio_impl.c"

/* `src` (`size` bytes) as a QOA file, at `channels` and `rate` (0: the source's) in *out (malloc'd, *outLen bytes); 0, or why it cannot be. */
const char* zn_assets_encode_qoa(const void* src, size_t size, unsigned channels, unsigned rate, unsigned char** out, unsigned* outLen) {
  ma_decoder_config c = ma_decoder_config_init(ma_format_s16, channels, rate);
  ma_uint64 frames = 0;
  void* pcm = NULL;
  qoa_desc d;
  ma_result r = ma_decode_memory(src, size, &c, &frames, &pcm);
  *out = NULL;
  *outLen = 0;
  if (r != MA_SUCCESS || !pcm || !frames) { ma_free(pcm, NULL); return r == MA_OUT_OF_MEMORY ? "out of memory" : "not a WAV, FLAC, MP3 or Ogg Vorbis file"; }
  if (c.channels > QOA_MAX_CHANNELS || frames > 0xffffffffu) { ma_free(pcm, NULL); return "QOA holds 8 channels and 2^32 samples a channel at most"; }
  memset(&d, 0, sizeof d);
  d.channels = c.channels;
  d.samplerate = c.sampleRate;
  d.samples = (unsigned)frames;
  *out = (unsigned char*)qoa_encode((const short*)pcm, &d, outLen);
  ma_free(pcm, NULL);
  return *out ? NULL : "the QOA encoder refused it";
}
