// The 3DS's part of the console player (ZN-792): mbedTLS's entropy from the ps:ps service (PS_GenerateRandomBytes, the hardware's
// generator; Azahar emulates it). The network is ZN-791's (net_n3ds.cpp), the screen's frame the runtime's.
#include <3ds.h>
#include <stddef.h>

#include <mbedtls/platform.h>
#include <psa/crypto.h>

#include "zn/host.h"

int mbedtls_platform_get_entropy(psa_driver_get_entropy_flags_t, size_t* estimate_bits, unsigned char* out, size_t size) {
  static bool open = R_SUCCEEDED(psInit());   // kept open: the player asks again for each session
  if (!open || R_FAILED(PS_GenerateRandomBytes(out, size))) return PSA_ERROR_INSUFFICIENT_ENTROPY;
  *estimate_bits = size * 8;
  return 0;
}
