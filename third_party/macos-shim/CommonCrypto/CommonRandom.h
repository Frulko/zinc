// Stand-in for Apple's header (see CommonCryptoError.h); the function itself is in libSystem.
#pragma once
#include <stddef.h>
#include <stdint.h>
#include "CommonCryptoError.h"
#ifdef __cplusplus
extern "C" {
#endif
CCCryptorStatus CCRandomGenerateBytes(void *bytes, size_t count);
#ifdef __cplusplus
}
#endif
