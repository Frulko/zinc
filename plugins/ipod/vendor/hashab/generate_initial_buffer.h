#pragma once
#include <stdint.h>

/**
 * generate_initial_buffer - Compresses 190-byte key material to 16-byte initial state.
 *
 * This function takes the expanded key material from generate_key_material and
 * compresses it down to a 16-byte buffer that serves as the initial input for
 * the White-Box AES encryption phase (Phase 3 of calcHashAB).
 *
 * @param output OUTPUT buffer (16 bytes) - receives the computed initial state
 * @param input INPUT buffer (190 bytes) - the expanded key material to compress
 * @return Integer result (not used by caller)
 */
int generate_initial_buffer(uint8_t* output, uint8_t* input);
