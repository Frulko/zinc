// zstd's decoder (third_party/zstd, 1.5.7, BSD-3) in the driver's unit, as lz4.c is: the sidecar stream's +zstd (stream.h).
#define ZSTD_DISABLE_ASM 1
#define ZSTD_LEGACY_SUPPORT 0
#include "../../third_party/zstd/common/debug.c"
#include "../../third_party/zstd/common/entropy_common.c"
#include "../../third_party/zstd/common/error_private.c"
#include "../../third_party/zstd/common/fse_decompress.c"
#include "../../third_party/zstd/common/zstd_common.c"
#include "../../third_party/zstd/common/xxhash.c"
#include "../../third_party/zstd/decompress/huf_decompress.c"
#include "../../third_party/zstd/decompress/zstd_ddict.c"
#include "../../third_party/zstd/decompress/zstd_decompress.c"
#include "../../third_party/zstd/decompress/zstd_decompress_block.c"
