#define ZRT_HOSTED_CPP
#include "zinc_native_threektx2.h"
#include <vector>
#define BASISD_SUPPORT_KTX2 1
#define BASISD_SUPPORT_KTX2_ZSTD 0
#include "basis_universal/transcoder/basisu_transcoder.cpp"

namespace {
using Bytes = zrt::Array<uint8_t>;
using Ints = zrt::Array<int32_t>;
constexpr uint32_t INPUT_LIMIT = 64u << 20, OUTPUT_LIMIT = 128u << 20, SIDE_LIMIT = 4096;

struct Impl : NativeThreeKTX2 {
  Impl() { rc = zrt::IMMORTAL; }
  Bytes transcode(Bytes data, bool etc1, Ints info, Bytes error) override {
    const auto fail = [error](const char* message) {
      for (const char* p = message; *p; ++p) error.push(uint8_t(*p));
      return Bytes();
    };
    if (data.length() < 80 || uint32_t(data.length()) > INPUT_LIMIT)
      return fail("KTX2 input must be 80 bytes to 64 MiB");
    // C++'s static guard initializes the shared lookup tables once, including concurrent native callers.
    static const bool initialized = [] { basist::basisu_transcoder_init(); return true; }();
    (void)initialized;
    std::vector<uint8_t> source(data.length());
    for (int32_t i = 0; i < data.length(); ++i) source[i] = data.a->data[i];
    basist::ktx2_transcoder decoder;
    if (!decoder.init(source.data(), uint32_t(source.size()))) return fail("invalid KTX2 header or index");
    if (!decoder.is_etc1s()) return fail("native KTX2 loader supports ETC1S only");
    if (!decoder.get_width() || !decoder.get_height() || decoder.get_width() > SIDE_LIMIT || decoder.get_height() > SIDE_LIMIT ||
        decoder.get_header().m_pixel_depth || decoder.get_layers() != 0 || decoder.get_faces() != 1)
      return fail("native KTX2 loader needs a 2D texture up to 4096 pixels, without arrays or cubemaps");
    uint32_t max_levels = 1;
    for (uint32_t side = std::max(decoder.get_width(), decoder.get_height()); side > 1; side >>= 1) ++max_levels;
    if (decoder.get_levels() > max_levels) return fail("invalid KTX2 mip count for its dimensions");
    const bool compressed = etc1 && !decoder.get_has_alpha();
    const auto format = compressed ? basist::transcoder_texture_format::cTFETC1_RGB : basist::transcoder_texture_format::cTFRGBA32;
    uint64_t total = 0;
    std::vector<basist::ktx2_image_level_info> levels(decoder.get_levels());
    for (uint32_t i = 0; i < levels.size(); ++i) {
      auto& level = levels[i];
      if (!decoder.get_image_level_info(level, i, 0, 0)) return fail("invalid KTX2 mip level");
      total += compressed ? uint64_t(level.m_total_blocks) * 8 : uint64_t(level.m_orig_width) * level.m_orig_height * 4;
      if (total > OUTPUT_LIMIT) return fail("KTX2 output exceeds 128 MiB");
    }
    if (!decoder.start_transcoding() || decoder.is_video()) return fail("invalid KTX2 codebooks or unsupported video");
    Bytes output = Bytes::with_cap(int32_t(total));
    output.a->len = int32_t(total);
    size_t offset = 0;
    for (uint32_t i = 0; i < levels.size(); ++i) {
      const auto& level = levels[i];
      const uint32_t capacity = compressed ? level.m_total_blocks : level.m_orig_width * level.m_orig_height;
      if (!decoder.transcode_image_level(i, 0, 0, output.a->data + offset, capacity, format))
        return fail("KTX2 mip transcode failed");
      offset += size_t(capacity) * (compressed ? 8 : 4);
    }
    // Publish metadata only after all levels succeed.
    info.push(decoder.get_dfd_transfer_func()); info.push(decoder.get_dfd_color_primaries());
    info.push(decoder.get_dfd_flags()); info.push(compressed ? 1 : 0);
    for (const auto& level : levels) {
      info.push(level.m_orig_width); info.push(level.m_orig_height);
      info.push(compressed ? level.m_total_blocks * 8 : level.m_orig_width * level.m_orig_height * 4);
    }
    return output;
  }
};
}

NativeThreeKTX2* zinc_create_ThreeKTX2() {
  static Impl module;
  return &module;
}
