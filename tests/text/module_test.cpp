#include "text/module.h"
#include <cassert>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <iostream>
#ifndef _WIN32
#include <dlfcn.h>
#endif
int main(int argc, char** argv) {
  using namespace zn::text;
  assert(argc == 3);
#ifndef _WIN32
  assert(!dlopen(argv[2], RTLD_NOLOAD | RTLD_NOW));
#endif
  if (std::string(argv[1]) == "missing") {
    std::string first, error;
    for (int i = 0; i < 2; ++i) {
      assert(!loadModule(error));
      assert(error.find("text module unavailable") != std::string::npos);
      if (i) assert(first == error); else { first = error; setenv("ZINC_TEXT_LIB", argv[2], 1); }
    }
    std::cout << "missing module: cached error, no silent fallback\n";
    return 0;
  }
  if (std::string(argv[1]) == "tampered") {
    configureModule(argv[2], std::string(64, '0'));
    std::string error;
    assert(!loadModule(error) && error.find("checksum mismatch") != std::string::npos);
    return 0;
  }
  std::ifstream input(argv[1], std::ios::binary);
  std::string bytes{std::istreambuf_iterator<char>(input), {}};
  assert(!bytes.empty());
  auto face = Face::open(reinterpret_cast<const uint8_t*>(bytes.data()), bytes.size());
  assert(face && face->unitsPerEm() > 0 && face->hasGlyph('A'));
#ifndef _WIN32
  void* loaded = dlopen(argv[2], RTLD_NOLOAD | RTLD_NOW);
  assert(loaded); dlclose(loaded);
#endif
  Options options;
  auto lines = layout({face.get()}, "office", options);
  assert(lines.size() == 1 && lines[0].width > 0);
  const auto& glyph = lines[0].runs[0].glyphs[0];
  Bitmap bitmap; Outline path;
  assert(rasterize(*face, glyph.gid, 20, bitmap) && !bitmap.a.empty());
  assert(outline(*face, glyph.gid, 20, path) && !path.ops.empty());
  assert(face->ascent(20) > 0 && face->descent(20) >= 0);
  (void)face->hasEmoji(0x1f600); (void)face->isColor();
  assert(breakOpportunities("a b", nullptr).size() == 3);
  std::vector<uint8_t> full(bytes.begin(), bytes.end()), subset;
  assert(module().subset(full, {'A', 'B'}, subset) && subset.size() < full.size()/4);
  assert(module().characters(bytes) > 100);
  std::string zim, table, error;
  assert(module().msdfAtlas(bytes, {'A'}, 24, zim, table, error));
  assert(zim.rfind("ZIM1", 0) == 0 && table.find("glyphs") != std::string::npos);
  face.reset();
  std::cout << "text module: lazy open, shape, raster, outline, breaks, subset, MSDF, close\n";
}
