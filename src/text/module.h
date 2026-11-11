#pragma once
#include "text/layout.h"
#include <set>
#include <string>
namespace zn::text {
namespace font {
bool subsetTtf(const std::vector<uint8_t>&, const std::set<uint32_t>&, std::vector<uint8_t>&);
std::size_t fontCharacters(const std::string&);
bool msdfAtlas(const std::string&, const std::set<uint32_t>&, int, std::string&, std::string&, std::string&);
}
// Private, same-build boundary: STL types and Face keep their existing ownership.
struct Module {
  uint32_t version;
  uint32_t bytes;
  decltype(&Face::open) open;
  void (*destroy)(Face*);
  decltype(&Face::unitsPerEm) unitsPerEm;
  decltype(&Face::ascent) ascent;
  decltype(&Face::descent) descent;
  decltype(&Face::hasGlyph) hasGlyph;
  decltype(&Face::hasEmoji) hasEmoji;
  decltype(&Face::isColor) isColor;
  decltype(&layout) layout;
  decltype(&breakOpportunities) breaks;
  decltype(&rasterize) rasterize;
  decltype(&outline) outline;
  decltype(&font::subsetTtf) subset;
  decltype(&font::fontCharacters) characters;
  decltype(&font::msdfAtlas) msdfAtlas;
};
const Module& module();
const Module* loadModule(std::string& error);
// A fused executable pins its own module to the hash read from its embedded manifest.
void configureModule(const std::string& path, const std::string& sha256);
}
