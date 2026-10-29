// zinc:ipod audio fingerprints: Chromaprint (vendor/chromaprint) over the first seconds of a file, decoded by the platform
// (AudioToolbox's ExtAudioFile on macOS: MP3, AAC, ALAC, WAV, AIFF). Std types only, so it is tested without the database.
#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace ipod {

/** Seconds of audio fingerprinted from the start of a file: enough to tell songs apart, little to read from a slow iPod disk. */
constexpr double kFingerprintSeconds = 30;

/** Chromaprint's raw fingerprint (about 8 values a second) of the start of `file`; empty with `why` when the file cannot be
 *  decoded here, is shorter than 3 seconds or is silent (silence would match every other silence). */
std::vector<uint32_t> fingerprint(const std::string& file, std::string& why);
/** 0..1: the share of equal bits of two fingerprints at their best alignment (within 1.5 s); 0 when they overlap too little to
 *  say. The same recording in two encodings scores above 0.9, two different songs about 0.5. */
double similarity(const std::vector<uint32_t>& a, const std::vector<uint32_t>& b);
/** At least this similarity makes two tracks the same audio (measured: the same melody as WAV, ALAC, AAC 128 and MP3 96 kbps 1.0,
 *  as MP3 32 kbps 0.97; three different melodies 0.61 to 0.64). */
constexpr double kSameAudio = 0.8;
/** Only tracks whose durations are this close are compared by fingerprint (and so only they are fingerprinted). */
constexpr double kAudioDurationMs = 5000;
/** Chromaprint's compressed text form, for the cache file; decode gives back the raw values (empty when the text is bad). */
std::string encodeFingerprint(const std::vector<uint32_t>& fp);
std::vector<uint32_t> decodeFingerprint(const std::string& text);

}  // namespace ipod
