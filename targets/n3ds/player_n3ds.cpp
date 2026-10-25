// The 3DS's part of the console player (ZN-792): mbedTLS's entropy from the ps:ps service (PS_GenerateRandomBytes, the hardware's
// generator; Azahar emulates it), and the font of the waiting screen. The network is ZN-791's (net_n3ds.cpp), the screen's frame the runtime's.
#include <3ds.h>
#include <stddef.h>

#include <mbedtls/platform.h>
#include <psa/crypto.h>

#include "zn/host.h"
#include "player_font_zrs.h"

int mbedtls_platform_get_entropy(psa_driver_get_entropy_flags_t, size_t* estimate_bits, unsigned char* out, size_t size) {
  static bool open = R_SUCCEEDED(psInit());   // kept open: the player asks again for each session
  if (!open || R_FAILED(PS_GenerateRandomBytes(out, size))) return PSA_ERROR_INSUFFICIENT_ENTROPY;
  *estimate_bits = size * 8;
  return 0;
}

// The waiting screen writes with gfx.text's 8 px grid font, which only a program's resources.bin brings: the player has none until a program
// comes, and its screen stayed blank (a dark screen on the console, as if it had frozen). player_font.zrs is that font alone (6.7 KB, the
// `grid` 8 px font of any zinc pack's resources.bin, kept by its ZRS1 layout, src/host/resources.cpp); hal_init installs it once.
extern "C" void zn_n3ds_player_font(void) {
  static bool done = false;
  if (done) return;
  done = true;
  zn::host::installResources(player_font_zrs, player_font_zrs_size);
}
