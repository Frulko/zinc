#pragma once
/**
 * @file aes_primitives.h
 * @brief AES-like primitives and table aliases for the custom cipher
 *
 * This header provides:
 * 1. Meaningful aliases for the cryptographic lookup tables
 * 2. Helper functions implementing standard AES operations (with custom primitives)
 *
 * CIPHER STRUCTURE OVERVIEW:
 * ==========================
 * The calcHashAB function implements a custom AES-128-like cipher with:
 *
 * Phase 1: CBC-MAC style compression (5 rounds of 16-byte blocks)
 *   - Uses standard AES ShiftRows permutation
 *   - Uses CUSTOM nibble-based S-boxes (NOT standard AES S-box)
 *   - Uses CUSTOM MixColumns multiplication tables
 *
 * Phase 2: State expansion/compression
 *   - generate_key_material: Expands 44 bytes → 190 bytes (key derivation/mixing)
 *   - generate_initial_buffer: Compresses 190 bytes → 16 bytes (heavily obfuscated)
 *
 * Phase 3: White-Box AES encryption (2 x 16-byte blocks)
 *   - 9 inner rounds using T-tables (combined SubBytes+MixColumns+AddRoundKey)
 *   - 1 final round using S-box only
 *   - Round keys are embedded in the T-tables
 *
 * KEY DIFFERENCES FROM STANDARD AES:
 * - S-box: Nibble-based (two 4-bit lookups per byte) instead of 8-bit lookup
 * - MixColumns: Custom GF multiplication polynomial
 * - White-Box: T-tables contain pre-computed, key-embedded transformations
 */

#include <stdint.h>

/*============================================================================
 * STANDARD AES SHIFTROWS PERMUTATION
 *============================================================================
 * This permutation IS standard AES. For a 4x4 state matrix in column-major:
 *
 *   State indices:      After ShiftRows:
 *   [ 0  4  8 12 ]      [ 0  4  8 12 ]  (row 0: no shift)
 *   [ 1  5  9 13 ]  ->  [ 5  9 13  1 ]  (row 1: shift left 1)
 *   [ 2  6 10 14 ]      [10 14  2  6 ]  (row 2: shift left 2)
 *   [ 3  7 11 15 ]      [15  3  7 11 ]  (row 3: shift left 3)
 *
 * Reading column-by-column gives: {0,5,10,15, 4,9,14,3, 8,13,2,7, 12,1,6,11}
 */
static const uint8_t AES_SHIFT_ROWS[16] = {
    0,  5,  10, 15, /* Column 0: rows 0,1,2,3 shifted */
    4,  9,  14, 3,  /* Column 1: rows 0,1,2,3 shifted */
    8,  13, 2,  7,  /* Column 2: rows 0,1,2,3 shifted */
    12, 1,  6,  11  /* Column 3: rows 0,1,2,3 shifted */
};

/*============================================================================
 * HELPER FUNCTIONS
 *============================================================================*/

/**
 * Apply standard AES ShiftRows permutation to 16-byte state
 *
 * @param state  16-byte state array (modified in place)
 *
 * This is the ONLY part of the cipher that matches standard AES exactly.
 */
static inline void shift_rows(uint8_t state[16]) {
  uint8_t temp[16];
  for (int i = 0; i < 16; i++) {
    temp[i] = state[AES_SHIFT_ROWS[i]];
  }
  __builtin_memcpy(state, temp, 16);
}

/**
 * Apply standard AES ShiftRows and return permuted indices
 *
 * Instead of permuting bytes, computes the permuted index array
 * for use with indirect table lookups.
 *
 * @param indices  16-element index array (output)
 * @param offsets  4-element array of column offsets
 * @param values   16-byte input values to permute
 */
static inline void shift_rows_indices(uint32_t indices[16], const int offsets[4], const uint8_t values[16]) {
  for (int i = 0; i < 16; i++) {
    indices[i] = 4 * values[AES_SHIFT_ROWS[i]] + offsets[i % 4];
  }
}
