#pragma once
#include <stdint.h>

/**
 * generate_key_material - Generates a 190-byte key material buffer from a 44-byte input.
 *
 * This is a key derivation/mixing function that expands input state through
 * multiple rounds of non-linear mixing using S-boxes and the generate_buffer_from_state_mixing mixing function.
 *
 * @param input 44-byte input buffer (from Phase 1 CBC-MAC output)
 * @param output 190-byte output buffer (key material for whitening)
 */
void generate_key_material(uint8_t* input, uint8_t* output);
