// The PSP's part of the console player (ZN-792): mbedTLS's entropy. The PSP's hardware generator (the KIRK engine's PRNG, command 14 of
// sceUtilsBufferCopyWithRange) is a kernel export that a user-mode homebrew cannot call without a kernel PRX of its own; until that PRX
// exists, the bytes come from what a user-mode program can measure that an attacker on the network cannot: the jitter of the system
// clock (microseconds) around many short loops and system calls, the time since boot, the Wi-Fi MAC, the analog stick and the battery,
// hashed with SHA-256 together with a seed kept in the player's directory, which each boot advances. ponytail: a timing source; the KIRK
// PRX (targets/psp/rng_prx/, kernel mode, loaded at start under ARK/PRO) when the owner's PSP is the reference.
#include <pspctrl.h>
#include <psppower.h>
#include <psprtc.h>
#include <pspthreadman.h>
#include <pspwlan.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#include <string>

#include <mbedtls/platform.h>
#include <psa/crypto.h>

extern "C" {
#include "sha256.h"   // third_party/sha256, C (zn_console_zpk links it)
}

extern "C" const char* zn_console_data_dir(void);

namespace {
SHA256_CTX pool;
bool started = false;

void mix(const void* p, size_t n) { sha256_update(&pool, static_cast<const BYTE*>(p), n); }

// A few hundred samples of the clock around work whose length the scheduler, the caches and the memory stick vary.
void sample() {
  for (int i = 0; i < 256; i++) {
    const uint32_t a = sceKernelGetSystemTimeLow();
    volatile uint32_t x = a;
    for (uint32_t k = 0; k < 64 + (a & 63); k++) x = x * 1103515245u + 12345u;
    if ((i & 31) == 0) sceKernelDelayThread(1);   // a yield: the thread comes back when the scheduler says
    const uint32_t b = sceKernelGetSystemTimeLow();
    const uint32_t d = (b - a) ^ x;
    mix(&d, sizeof d);
  }
}

void start() {
  sha256_init(&pool);
  std::string seedPath = std::string(zn_console_data_dir() ? zn_console_data_dir() : "") + "agent/seed";
  unsigned char seed[32] = {};
  if (FILE* f = fopen(seedPath.c_str(), "rb")) { fread(seed, 1, sizeof seed, f); fclose(f); }
  mix(seed, sizeof seed);
  const SceInt64 wide = sceKernelGetSystemTimeWide();
  mix(&wide, sizeof wide);
  u64 tick = 0;
  sceRtcGetCurrentTick(&tick);
  mix(&tick, sizeof tick);
  u8 mac[8] = {};
  sceWlanGetEtherAddr(mac);
  mix(mac, sizeof mac);
  SceCtrlData pad{};
  sceCtrlPeekBufferPositive(&pad, 1);
  mix(&pad, sizeof pad);
  const int battery[3] = {scePowerGetBatteryVolt(), scePowerGetBatteryTemp(), scePowerGetBatteryLifePercent()};
  mix(battery, sizeof battery);
  sample();
  SHA256_CTX next = pool;   // the seed of the next boot: from this pool, never equal to what is given out
  const char tag[] = "next seed";
  sha256_update(&next, reinterpret_cast<const BYTE*>(tag), sizeof tag);
  sha256_final(&next, seed);
  if (FILE* f = fopen(seedPath.c_str(), "wb")) { fwrite(seed, 1, sizeof seed, f); fclose(f); }
  started = true;
}
}  // namespace

int mbedtls_platform_get_entropy(psa_driver_get_entropy_flags_t, size_t* estimate_bits, unsigned char* out, size_t size) {
  if (!started) start();
  for (size_t at = 0; at < size; at += SHA256_BLOCK_SIZE) {
    sample();
    SHA256_CTX take = pool;
    unsigned char block[SHA256_BLOCK_SIZE];
    sha256_final(&take, block);
    mix(block, sizeof block);   // the pool moves on: the next block is not this one
    memcpy(out + at, block, size - at < sizeof block ? size - at : sizeof block);
  }
  *estimate_bits = size * 8;
  return 0;
}
