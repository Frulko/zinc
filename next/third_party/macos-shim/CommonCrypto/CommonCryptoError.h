// Stand-in for Apple's header, for cross builds with zig (its macOS libc headers do not include CommonCrypto): mimalloc asks the system for random bytes.
#pragma once
#include <stdint.h>
typedef int32_t CCCryptorStatus;
enum { kCCSuccess = 0 };
