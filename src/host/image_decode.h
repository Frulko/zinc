#pragma once
// zinc:gfx startImageDecode / pollImageDecode / cancelImageDecode: image files decoded on a worker thread (src/host/image_decode.cpp).
// Its own file: the runtime's header (zrt.h) defines placement new and cannot meet <thread>; gfx_host.cpp turns the pixels into a runtime image.
#include <cstddef>
#include <cstdint>

namespace zn::host {

/** Queues the file (one byte per 64-bit slot, as the host calls hand a u8[]): a handle above 0, or 0 when too much is in flight to take more. */
int32_t decodeStart(const uint64_t* slots, uint32_t n);
/** -2 still running; -1 failed, cancelled or unknown (the handle is spent); 0 done: *px holds w * h ARGB words (malloc'd, the caller frees them). */
int32_t decodeTake(int32_t handle, uint32_t** px, int* w, int* h, bool* alpha);
/** Gives up a decode: its file and its pixels are dropped. */
void decodeCancel(int32_t handle);

}  // namespace zn::host
