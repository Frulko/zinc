#pragma once
// Baked fonts and images (ZN-048), a port of compiler/src/resources.ts: what a program draws with is decided from its text (the text sizes it
// mentions, the characters of its literals, the images of its assets directory), glyphs are rasterized from the TrueType files of lib/fonts
// with the same 4x4 supersampling as before, so frames stay pixel-identical, and everything goes into one blob that the host installs before the
// program runs (`zinc run`: baked in memory; `zinc build`: embedded in the program).
// The blob layout is private to res.cpp and src/host/resources.cpp (version 1, little endian).
#include <cstdint>
#include <string>
#include <vector>

namespace zn::res {

struct Options {
  std::string fontDir;    // lib/fonts: Inter-Regular.ttf, Inter-Bold.ttf, JetBrainsMono-Regular.ttf
  std::string assetsDir;  // images (PNG, SVG) and extra TrueType files; empty: none
  int hiScale = 2;        // pixels per logical pixel the target may display: > 0 embeds the TrueType files and bakes images at that scale
  // Which of `sources` are the engine's own modules (zinc:*, lib/std, plugins): with TrueType files embedded, the sizes and styles their tables
  // mention are not baked (the runtime rasterizes what they really use); empty: every source is the program's (ZN-428).
  std::vector<bool> library;
  bool wholeFonts = false;   // "text": "shaped": the shaper needs the whole TrueType files; otherwise they are subset to what the program can show
};

// `sources` are the texts of every file of the program (user code and standard modules): they decide the sizes and the characters.
bool bake(const std::vector<std::string>& sources, const Options& opt, std::vector<std::uint8_t>& blob, std::string& err);

}  // namespace zn::res
