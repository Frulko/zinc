// Shared by the fuzz harnesses (scripts/fuzz.sh). Each harness is one libFuzzer entry point over a parser of
// untrusted input; the runtime is linked with ZRT_DEBUG so every allocation goes through malloc (ASan sees it).
// Without libFuzzer, main.cpp replays files and directories through the same entry point (corpus regression).
#pragma once
#include "zrt.h"
#include <stdint.h>
#include <stddef.h>

namespace zfuzz {
/** Bytes as a runtime string (any bytes: invalid UTF-8 included). */
inline zrt::String str(const uint8_t* d, size_t n) { return zrt::String::from((const char*)d, (uint32_t)n); }
/** A pending error is part of the parser's contract (catchable); clear it so the next input starts clean. */
inline void clear() { zrt::take_error(); zrt::drain_microtasks(); }
}
