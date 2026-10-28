#pragma once
#include <stdint.h>

/**
 * generate_buffer_from_state_mixing - Mixes two state buffers to produce a transformed output.
 *
 * This is a core mixing primitive used in key derivation. It takes a seed/key buffer
 * and uses it to transform a state buffer through heavily obfuscated arithmetic operations.
 *
 * @param seed_state Input seed buffer (16 x 32-bit integers, controls transformation)
 * @param state State buffer to transform (16 x 32-bit integers, modified in-place)
 */
void generate_buffer_from_state_mixing(int* seed_state, int* state);
