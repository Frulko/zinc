#include "assets/sprite.h"
namespace zn::assets {
std::string zimHeader(int format, int scale, unsigned flags, int w, int h) {
  std::string o = "ZIM1";
  o += static_cast<char>(format);
  o += static_cast<char>(scale);
  o += static_cast<char>(flags & 0xff);
  o += static_cast<char>(flags >> 8);
  for (int i = 0; i < 4; ++i) o += static_cast<char>(static_cast<std::uint32_t>(w) >> (8*i));
  for (int i = 0; i < 4; ++i) o += static_cast<char>(static_cast<std::uint32_t>(h) >> (8*i));
  return o;
}

}
