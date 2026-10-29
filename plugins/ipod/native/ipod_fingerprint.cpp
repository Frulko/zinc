// zinc:ipod audio fingerprints (ipod_fingerprint.h). The platform decodes straight to Chromaprint's own rate (11025 Hz mono, 16
// bits), so the vendored Chromaprint needs no resampler (its resampler is FFmpeg's LGPL code, left out of vendor/chromaprint).
#include "ipod_fingerprint.h"

#include <chromaprint.h>

#include <algorithm>
#include <cstdlib>

#ifdef __APPLE__
#include <AudioToolbox/ExtendedAudioFile.h>
#endif

namespace ipod {
namespace {

constexpr int kRate = 11025;          // Chromaprint's working rate
constexpr double kMinSeconds = 3;     // shorter gives too few values to compare
constexpr int kMaxShift = 18;         // values (~0.12 s each): how far two copies may be shifted (an encoder's delay, a gap)
constexpr int kMinOverlap = 20;       // values two fingerprints must share to be compared

/** Up to `seconds` of `file` as 11025 Hz mono 16-bit samples. */
bool decode(const std::string& file, double seconds, std::vector<int16_t>& out, std::string& why) {
  out.clear();
#ifdef __APPLE__
  CFURLRef url = CFURLCreateFromFileSystemRepresentation(nullptr, (const UInt8*)file.data(), (CFIndex)file.size(), false);
  if (!url) { why = "not a file name"; return false; }
  ExtAudioFileRef f = nullptr;
  OSStatus st = ExtAudioFileOpenURL(url, &f);
  CFRelease(url);
  if (st != noErr) { why = "the audio cannot be read (" + std::to_string((int)st) + ")"; return false; }
  AudioStreamBasicDescription c = {};
  c.mSampleRate = kRate;
  c.mFormatID = kAudioFormatLinearPCM;
  c.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked;
  c.mChannelsPerFrame = 1;
  c.mBitsPerChannel = 16;
  c.mBytesPerFrame = c.mBytesPerPacket = 2;
  c.mFramesPerPacket = 1;
  st = ExtAudioFileSetProperty(f, kExtAudioFileProperty_ClientDataFormat, sizeof c, &c);   // the converter resamples and mixes down
  if (st != noErr) { ExtAudioFileDispose(f); why = "the audio cannot be converted (" + std::to_string((int)st) + ")"; return false; }
  const size_t want = (size_t)(seconds * kRate);
  out.resize(want);
  size_t got = 0;
  while (got < want) {
    UInt32 n = (UInt32)std::min<size_t>(8192, want - got);
    AudioBufferList bl;
    bl.mNumberBuffers = 1;
    bl.mBuffers[0].mNumberChannels = 1;
    bl.mBuffers[0].mDataByteSize = n * 2;
    bl.mBuffers[0].mData = out.data() + got;
    if (ExtAudioFileRead(f, &n, &bl) != noErr || n == 0) break;
    got += n;
  }
  ExtAudioFileDispose(f);
  out.resize(got);
  return true;
#else
  (void)file; (void)seconds;
  why = "audio fingerprints need macOS for now (no decoder on this system)";   // ponytail: a vendored decoder on Linux, later.md
  return false;
#endif
}

}  // namespace

std::vector<uint32_t> fingerprint(const std::string& file, std::string& why) {
  std::vector<uint32_t> fp;
  std::vector<int16_t> pcm;
  if (!decode(file, kFingerprintSeconds, pcm, why)) return fp;
  if (pcm.size() < (size_t)(kMinSeconds * kRate)) { why = "shorter than 3 seconds"; return fp; }
  int loud = 0;
  for (int16_t s : pcm) loud += std::abs((int)s) > 64;
  if (loud < (int)(pcm.size() / 100)) { why = "silent"; return fp; }
  ChromaprintContext* ctx = chromaprint_new(CHROMAPRINT_ALGORITHM_DEFAULT);
  uint32_t* raw = nullptr;
  int n = 0;
  if (chromaprint_start(ctx, kRate, 1) && chromaprint_feed(ctx, pcm.data(), (int)pcm.size()) && chromaprint_finish(ctx) &&
      chromaprint_get_raw_fingerprint(ctx, &raw, &n) && raw)
    fp.assign(raw, raw + n);
  else why = "no fingerprint";
  if (raw) chromaprint_dealloc(raw);
  chromaprint_free(ctx);
  return fp;
}

double similarity(const std::vector<uint32_t>& a, const std::vector<uint32_t>& b) {
  double best = 0;
  const int na = (int)a.size(), nb = (int)b.size();
  for (int shift = -kMaxShift; shift <= kMaxShift; shift++) {   // b[i + shift] against a[i]
    int from = std::max(0, -shift), to = std::min(na, nb - shift);
    if (to - from < kMinOverlap) continue;
    long errors = 0;
    for (int i = from; i < to; i++) errors += __builtin_popcount(a[i] ^ b[i + shift]);
    best = std::max(best, 1.0 - (double)errors / (32.0 * (to - from)));
  }
  return best;
}

std::string encodeFingerprint(const std::vector<uint32_t>& fp) {
  char* text = nullptr;
  int n = 0;
  std::string out;
  if (!fp.empty() && chromaprint_encode_fingerprint(fp.data(), (int)fp.size(), CHROMAPRINT_ALGORITHM_DEFAULT, &text, &n, 1) && text) out.assign(text, (size_t)n);
  if (text) chromaprint_dealloc(text);
  return out;
}

std::vector<uint32_t> decodeFingerprint(const std::string& text) {
  std::vector<uint32_t> fp;
  uint32_t* raw = nullptr;
  int n = 0, algo = 0;
  if (!text.empty() && chromaprint_decode_fingerprint(text.data(), (int)text.size(), &raw, &n, &algo, 1) && raw) fp.assign(raw, raw + n);
  if (raw) chromaprint_dealloc(raw);
  return fp;
}

}  // namespace ipod
