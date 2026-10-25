// The PS Vita's part of the console player (ZN-792): mbedTLS's entropy from the kernel's generator, 64 bytes a call
// (sceKernelGetRandomNumber, psp2/kernel/rng.h). The network is ZN-791's (net_vita.cpp), the screen's frame the runtime's.
#include <psp2/kernel/rng.h>
#include <stddef.h>

#include <mbedtls/platform.h>
#include <psa/crypto.h>

int mbedtls_platform_get_entropy(psa_driver_get_entropy_flags_t, size_t* estimate_bits, unsigned char* out, size_t size) {
  for (size_t at = 0; at < size; at += 64) {
    const size_t n = size - at < 64 ? size - at : 64;
    if (sceKernelGetRandomNumber(out + at, n) < 0) return PSA_ERROR_INSUFFICIENT_ENTROPY;
  }
  *estimate_bits = size * 8;
  return 0;
}
