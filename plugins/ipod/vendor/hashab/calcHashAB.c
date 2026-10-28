#include "calcHashAB.h"
#include <stddef.h>
#include <stdint.h>
#include "aes_primitives.h"
#include "byte_helpers.h"
#include "data/FINAL_PERM.h"
#include "data/FINAL_SBOX.h"
#include "data/INPUT_SBOX.h"
#include "data/MIXCOL_MULT.h"
#include "data/MIXCOL_STATE.h"
#include "data/NIBBLE_SBOX_EVEN.h"
#include "data/NIBBLE_SBOX_MAIN.h"
#include "data/NIBBLE_SBOX_ODD.h"
#include "data/OUTPUT_SBOX.h"
#include "data/ROUND_KEYS.h"
#include "data/WB_FINAL_SBOX.h"
#include "data/WB_INPUT_A.h"
#include "data/WB_INPUT_B.h"
#include "data/WB_MIX_A.h"
#include "data/WB_MIX_B.h"
#include "data/WB_STATE_EXTRACT.h"
#include "data/WB_T_MIX.h"
#include "data/WB_T_TABLES.h"
#include "generate_initial_buffer.h"
#include "generate_key_material.h"

static inline uint8_t apply_sbox_pair(const uint8_t* table, uint8_t input, uint8_t key) {
  uint8_t high = table[(input & 0xF0) + (key >> 4)];
  uint8_t low = table[256 + (uint8_t)((key & 0xF) + 16 * input)];
  return (high << 4) | low;
}

static inline uint8_t mix_column_byte(int idx0, int idx1, int idx2, int idx3, int j) {
  int base = j * 1536;

  uint8_t a = MIXCOL_STATE[idx0 + j];
  uint8_t b = MIXCOL_STATE[idx1 + j];
  uint8_t c = MIXCOL_STATE[idx2 + j];
  uint8_t d = MIXCOL_STATE[idx3 + j];

  uint8_t t1 = MIXCOL_MULT[(d & 0xF) + base + 768 + (uint8_t)(c * 16)] & 0xF;
  uint8_t t2 = MIXCOL_MULT[(b & 0xF) + base + 256 + (uint8_t)(a * 16)];
  uint8_t low = MIXCOL_MULT[t1 + base + 1280 + (uint8_t)(t2 * 16)] & 0xF;

  uint8_t u1 = MIXCOL_MULT[(b >> 4) + (a & 0xF0) + base];
  uint8_t u2 = MIXCOL_MULT[(c & 0xF0) + base + 512 + (d >> 4)] & 0xF;
  uint8_t high = MIXCOL_MULT[(uint8_t)(u1 * 16) + base + 1024 + u2];

  return low + 16 * high;
}

static inline void phase2_transform(const int* rs, const uint8_t* input, const uint8_t* tab_in, const uint8_t* tab_mix, uint8_t* out_state) {
  uint8_t rs_bytes[16];
  for (int w = 0; w < 4; w++) {
    for (int b = 0; b < 4; b++) {
      uint8_t byte_val = (rs[w] >> (b * 8)) & 0xFF;
      rs_bytes[w * 4 + b] = WB_STATE_EXTRACT[byte_val + (b << 8) + (w << 10)];
    }
  }

  uint8_t input_trans[16];
  for (int i = 0; i < 16; i++) {
    input_trans[i] = tab_in[input[i] + i * 256];
  }

  for (int i = 0; i < 16; i++) {
    int base = i * 512;
    uint8_t rs_b = rs_bytes[i];
    uint8_t in_b = input_trans[i];
    out_state[i] = 16 * tab_mix[(rs_b & 0xF0) + base + (in_b >> 4)] + (tab_mix[(uint8_t)(16 * rs_b + (in_b & 0xF)) + base + 256] & 0xF);
  }
}

static const uint8_t LOW_SUB[16] = {
    0x6, 0x3, 0xC, 0x9, 0x2, 0xF, 0x8, 0x5, 0xE, 0xB, 0x4, 0x1, 0xA, 0x7, 0x0, 0xD,
};

static const uint8_t NIBBLE_LO_TABLE[256] = {0xCE, 0xC0, 0xC2, 0xC4, 0xC7, 0xC9, 0xCB, 0xCA, 0xCC, 0xCE, 0xC1, 0xC3, 0xC5, 0xC4, 0xC6, 0xC8, 0xCB, 0xCD, 0xCF, 0xC1, 0xC0, 0xC2, 0xC4, 0xC7, 0xC9, 0xCB, 0xCA, 0xCC, 0xCE, 0xC1, 0xC3, 0xC5, 0xC4, 0xC6, 0xC8, 0xCA, 0xCD, 0xCF, 0xC1, 0xC0, 0xC2, 0xC4, 0xC7, 0xC9, 0xCB, 0xCA, 0xCC, 0xCE, 0xC1, 0xC3, 0xC5, 0xC7, 0xC6, 0xC8, 0xCA, 0xCD, 0xCF, 0xC1, 0xC0, 0xC2, 0xC4, 0xC7, 0xC9, 0xCB, 0xCA, 0xCC, 0xCE, 0xC0, 0xC3, 0xC5, 0xC7, 0xC6, 0xC8, 0xCA, 0xCD, 0xCF, 0xC1, 0xC0, 0xC2, 0xC4, 0xC7, 0xC9, 0xCB, 0xCD, 0xCC, 0xCE, 0xC0, 0xC3, 0xC5, 0xC7, 0xC6, 0xC8, 0xCA, 0xCD, 0xCF, 0xC1, 0xC0, 0xC2, 0xC4, 0xC6, 0xC9, 0xCB, 0xCD, 0xCC, 0xCE, 0xC0, 0xC3, 0xC5, 0xC7, 0xC6, 0xC8, 0xCA, 0xCD, 0xCF, 0xC1, 0xC3, 0xC2, 0xC4, 0xC6, 0xC9, 0xCB, 0xCD, 0xCC, 0xCE, 0xC0, 0xC3, 0xC5, 0xC7, 0xC6, 0xC8, 0xCA, 0xCC, 0xCF, 0xC1, 0xC3, 0xC2, 0xC4, 0xC6, 0xC9, 0xCB, 0xCD, 0xCC, 0xCE, 0xC0, 0xC3, 0xC5, 0xC7, 0xC9, 0xC8, 0xCA, 0xCC, 0xCF, 0xC1, 0xC3, 0xC2, 0xC4, 0xC6, 0xC9, 0xCB, 0xCD, 0xCC, 0xCE, 0xC0, 0xC2, 0xC5, 0xC7, 0xC9, 0xC8, 0xCA, 0xCC, 0xCF, 0xC1, 0xC3, 0xC2, 0xC4, 0xC6, 0xC9, 0xCB, 0xCD, 0xCF, 0xCE, 0xC0, 0xC2, 0xC5, 0xC7, 0xC9, 0xC8, 0xCA, 0xCC, 0xCF, 0xC1, 0xC3, 0xC2, 0xC4, 0xC6, 0xC8, 0xCB, 0xCD, 0xCF, 0xCE, 0xC0, 0xC2, 0xC5, 0xC7, 0xC9, 0xC8, 0xCA, 0xCC, 0xCF, 0xC1, 0xC3, 0xC5, 0xC4, 0xC6, 0xC8, 0xCB, 0xCD, 0xCF, 0xCE, 0xC0, 0xC2, 0xC5, 0xC7, 0xC9, 0xC8, 0xCA, 0xCC, 0xCE, 0xC1, 0xC3, 0xC5, 0xC4, 0xC6, 0xC8, 0xCB, 0xCD, 0xCF, 0xCE, 0xC0, 0xC2, 0xC5, 0xC7, 0xC9, 0xCB, 0xCA, 0xCC, 0xCE, 0xC1, 0xC3, 0xC5, 0xC4, 0xC6, 0xC8, 0xCB, 0xCD, 0xCF};
static inline uint8_t nibble_lo(uint8_t input) {
  return NIBBLE_LO_TABLE[input];
}

static const uint8_t NIBBLE_HI_TABLE[256] = {0x9D, 0x78, 0x57, 0x32, 0x09, 0xE4, 0xC3, 0xDE, 0xB5, 0x90, 0x6F, 0x4A, 0x21, 0x3C, 0x1B, 0xF6, 0xCD, 0xA8, 0x87, 0x62, 0x79, 0x54, 0x33, 0x0E, 0xE5, 0xC0, 0xDF, 0xBA, 0x91, 0x6C, 0x4B, 0x26, 0x3D, 0x18, 0xF7, 0xD2, 0xA9, 0x84, 0x63, 0x7E, 0x55, 0x30, 0x0F, 0xEA, 0xC1, 0xDC, 0xBB, 0x96, 0x6D, 0x48, 0x27, 0x02, 0x19, 0xF4, 0xD3, 0xAE, 0x85, 0x60, 0x7F, 0x5A, 0x31, 0x0C, 0xEB, 0xC6, 0xDD, 0xB8, 0x97, 0x72, 0x49, 0x24, 0x03, 0x1E, 0xF5, 0xD0, 0xAF, 0x8A, 0x61, 0x7C, 0x5B, 0x36, 0x0D, 0xE8, 0xC7, 0xA2, 0xB9, 0x94, 0x73, 0x4E, 0x25, 0x00, 0x1F, 0xFA, 0xD1, 0xAC, 0x8B, 0x66, 0x7D, 0x58, 0x37, 0x12, 0xE9, 0xC4, 0xA3, 0xBE, 0x95, 0x70, 0x4F, 0x2A, 0x01, 0x1C, 0xFB, 0xD6, 0xAD, 0x88, 0x67, 0x42, 0x59, 0x34, 0x13, 0xEE, 0xC5, 0xA0, 0xBF, 0x9A, 0x71, 0x4C, 0x2B, 0x06, 0x1D, 0xF8, 0xD7, 0xB2, 0x89, 0x64, 0x43, 0x5E, 0x35, 0x10, 0xEF, 0xCA, 0xA1, 0xBC, 0x9B, 0x76, 0x4D, 0x28, 0x07, 0xE2, 0xF9, 0xD4, 0xB3, 0x8E, 0x65, 0x40, 0x5F, 0x3A, 0x11, 0xEC, 0xCB, 0xA6, 0xBD, 0x98, 0x77, 0x52, 0x29, 0x04, 0xE3, 0xFE, 0xD5, 0xB0, 0x8F, 0x6A, 0x41, 0x5C, 0x3B, 0x16, 0xED, 0xC8, 0xA7, 0x82, 0x99, 0x74, 0x53, 0x2E, 0x05, 0xE0, 0xFF, 0xDA, 0xB1, 0x8C, 0x6B, 0x46, 0x5D, 0x38, 0x17, 0xF2, 0xC9, 0xA4, 0x83, 0x9E, 0x75, 0x50, 0x2F, 0x0A, 0xE1, 0xFC, 0xDB, 0xB6, 0x8D, 0x68, 0x47, 0x22, 0x39, 0x14, 0xF3, 0xCE, 0xA5, 0x80, 0x9F, 0x7A, 0x51, 0x2C, 0x0B, 0xE6, 0xFD, 0xD8, 0xB7, 0x92, 0x69, 0x44, 0x23, 0x3E, 0x15, 0xF0, 0xCF, 0xAA, 0x81, 0x9C, 0x7B, 0x56, 0x2D, 0x08, 0xE7, 0xC2, 0xD9, 0xB4, 0x93, 0x6E, 0x45, 0x20, 0x3F, 0x1A, 0xF1, 0xCC, 0xAB, 0x86};
static inline uint8_t nibble_hi(uint8_t input) {
  return NIBBLE_HI_TABLE[input];
}

void calcHashAB(uint8_t target[57], uint8_t sha1[20], uint8_t uuid[8], const uint8_t rnd_bytes[23]) {
  uint32_t perm_indices[55];
  uint8_t expanded_buffer[190];
  uint8_t round_key[176];
  uint8_t phase1_output[80];
  int round_state[8];

  struct {
    uint8_t uuid_data[8];
    uint8_t sha1_data[20];
    uint8_t rnd_data[23];
    uint8_t padding[29];
  } input_data;

  union {
    int as_ints[8];
    uint8_t as_bytes[32];
  } cipher_block;
  uint8_t ibuff_result[16];
  uint8_t cipher_state[16];

  __builtin_memcpy(round_key, ROUND_KEYS, sizeof(round_key));
  __builtin_memcpy(input_data.uuid_data, uuid, sizeof(input_data.uuid_data));
  __builtin_memcpy(input_data.sha1_data, sha1, sizeof(input_data.sha1_data));
  __builtin_memcpy(input_data.rnd_data, rnd_bytes, sizeof(input_data.rnd_data));
  __builtin_memset(input_data.padding, 165, sizeof(input_data.padding));

  uint8_t key_state[16] = {0xC9, 0xA1, 0x5C, 0x44, 0x17, 0x4B, 0xFA, 0xCD, 0xF3, 0x32, 0x85, 0x94, 0x00, 0x5C, 0x0E, 0x5E};

  static const int MIXCOL_OFFSETS[4] = {0, 1024, 2048, 3072};

  for (int block = 0; block < 5; block++) {
    int block_offset = block * 16;

    const uint8_t* first_sbox = block ? NIBBLE_SBOX_ODD : NIBBLE_SBOX_EVEN;

    uint8_t* input_bytes = (uint8_t*)&input_data;
    for (int i = 0; i < 16; i++) {
      uint8_t transformed_input = INPUT_SBOX[input_bytes[block_offset + i]];
      cipher_state[i] = apply_sbox_pair(first_sbox, transformed_input, key_state[i]);
    }

    uint8_t round_output[16];
    for (int i = 0; i < 16; i++) {
      round_output[i] = apply_sbox_pair(NIBBLE_SBOX_MAIN, cipher_state[i], round_key[i]);
    }

    for (int round = 1; round < 10; round++) {
      uint8_t* round_key_ptr = &round_key[round * 16];

      for (int i = 0; i < 16; i++) {
        perm_indices[i] = 4 * round_output[AES_SHIFT_ROWS[i]] + MIXCOL_OFFSETS[i % 4];
      }

      for (int col = 0; col < 4; col++) {
        int idx0 = perm_indices[col * 4 + 0];
        int idx1 = perm_indices[col * 4 + 1];
        int idx2 = perm_indices[col * 4 + 2];
        int idx3 = perm_indices[col * 4 + 3];

        for (int j = 0; j < 4; j++) {
          cipher_state[col * 4 + j] = mix_column_byte(idx0, idx1, idx2, idx3, j);
        }
      }

      for (int i = 0; i < 16; i++) {
        round_output[i] = apply_sbox_pair(NIBBLE_SBOX_MAIN, cipher_state[i], round_key_ptr[i]);
      }
    }

    uint8_t permuted[16];
    for (int i = 0; i < 16; i++) {
      permuted[i] = round_output[AES_SHIFT_ROWS[i]];
    }

    for (int i = 0; i < 16; i++) {
      cipher_state[i] = apply_sbox_pair(NIBBLE_SBOX_MAIN, FINAL_SBOX[permuted[i]], round_key[160 + i]);
    }

    __builtin_memcpy(key_state, cipher_state, 16);

    for (int i = 0; i < 16; i++) {
      phase1_output[block_offset + i] = OUTPUT_SBOX[cipher_state[i]];
    }
  }

  static const uint8_t PERMUTATION_TABLE[32] = {6, 24, 17, 7, 19, 13, 14, 9, 21, 29, 2, 31, 1, 4, 28, 26, 16, 20, 11, 30, 3, 10, 27, 25, 5, 15, 22, 0, 18, 23, 8, 12};

  for (int i = 0; i < 32; i++) {
    cipher_block.as_bytes[i] = phase1_output[PERMUTATION_TABLE[i] + 44];
  }
  __builtin_memcpy(round_state, &cipher_block, sizeof(cipher_block));

  target[0] = 3;
  target[1] = 0;
  __builtin_memcpy(target + 2, input_data.rnd_data, 23);

  for (int i = 0; i < 23; i++) {
    target[i + 2] = 69 * target[i + 2] + 118 * (target[i + 2] & 0x5D) + 17;
  }

  generate_key_material(phase1_output, expanded_buffer);
  generate_initial_buffer(ibuff_result, expanded_buffer);

  uint8_t* output_base = target + 25;

  for (int iteration = 0; iteration < 2; iteration++) {
    uint8_t mix_state[16];
    const uint8_t* input = (iteration == 0) ? ibuff_result : cipher_block.as_bytes;
    const uint8_t* tab_in = (iteration == 0) ? WB_INPUT_A : WB_INPUT_B;
    const uint8_t* tab_mix = (iteration == 0) ? WB_MIX_A : WB_MIX_B;
    const int* rs = &round_state[iteration * 4];

    uint8_t phase2_out[16];
    phase2_transform(rs, input, tab_in, tab_mix, phase2_out);

    __builtin_memcpy(&cipher_block, phase2_out, 16);
    __builtin_memcpy(mix_state, phase2_out, 16);

    for (int round = 0; round < 9; round++) {
      int round_offset = round * 4096;

      for (int i = 0; i < 16; i++) {
        perm_indices[i] = 4 * (round_offset + mix_state[AES_SHIFT_ROWS[i]] + i * 256);
      }

      for (int col = 0; col < 4; col++) {
        int col_offset = col * 4;

        int idx0 = perm_indices[col_offset + 1];
        int idx1 = perm_indices[col_offset + 2];
        int idx2 = perm_indices[col_offset + 3];
        int idx3 = perm_indices[col_offset];

        const uint8_t* t_ptr0 = &WB_T_TABLES[idx1];
        const uint8_t* t_ptr1 = &WB_T_TABLES[idx3];
        const uint8_t* t_ptr2 = &WB_T_TABLES[idx0];

        for (int byte_idx = 0; byte_idx < 4; byte_idx++) {
          int block = round * 16 + col * 4 + byte_idx;

          uint8_t t0 = t_ptr0[byte_idx];
          uint8_t t1 = t_ptr1[byte_idx];
          uint8_t t2 = t_ptr2[byte_idx];
          uint8_t t3 = WB_T_TABLES[idx2 + byte_idx];

          uint8_t hi_nib_t0 = nibble_hi(t0);
          uint8_t hi_nib_t1 = nibble_hi(t1);
          uint8_t lo_nib_t2 = nibble_lo(t2);
          uint8_t lo_nib_t3 = nibble_lo(t3);
          uint8_t t0_x27 = 27 * t0;
          uint8_t mixed_t1 = 128 + (122 ^ (uint8_t)(-27 * t1));

          size_t wb_t_mix_idx1 = block * 1536 + 0 * 256 + ((((hi_nib_t1 >> 4) ^ 0x09) & 0x0F) << 4) | ((lo_nib_t2 ^ 0x0E) & 0x0F);
          size_t wb_t_mix_idx3 = block * 1536 + 1 * 256 + ((((mixed_t1 & 0x0F) ^ 0x0C) << 4) | (((5 * t2 & 0x0F) ^ 0x06) & 0x0F));
          size_t wb_t_mix_idx2 = block * 1536 + 2 * 256 + ((((hi_nib_t0 >> 4) ^ 0x09) & 0x0F) << 4) | ((lo_nib_t3 ^ 0x0E) & 0x0F);
          size_t wb_t_mix_idx0 = block * 1536 + 3 * 256 + (((((t0_x27 & 0x0F) + 7) & 0x0F) ^ 0x1) << 4) | LOW_SUB[t3 & 0x0F];
          size_t wb_t_mix_idx4 = block * 1536 + 4 * 256 + ((WB_T_MIX[wb_t_mix_idx1] & 0x0F) << 4) | (WB_T_MIX[wb_t_mix_idx2] & 0x0F);
          size_t wb_t_mix_idx5 = block * 1536 + 5 * 256 + ((WB_T_MIX[wb_t_mix_idx3] & 0x0F) << 4) | (WB_T_MIX[wb_t_mix_idx0] & 0x0F);

          cipher_block.as_bytes[col_offset + byte_idx] = 16 * WB_T_MIX[wb_t_mix_idx4] + (WB_T_MIX[wb_t_mix_idx5] & 0xF);
        }
      }

      if (round < 8) {
        __builtin_memcpy(mix_state, &cipher_block, 16);
      }
    }

    uint8_t* state = cipher_block.as_bytes;
    uint8_t temp[16];
    for (int i = 0; i < 16; i++) {
      temp[i] = WB_FINAL_SBOX[state[AES_SHIFT_ROWS[i]] + i * 256];
    }
    __builtin_memcpy(state, temp, 16);

    __builtin_memcpy(output_base + iteration * 16, &cipher_block, 16);
  }

  __builtin_memcpy(perm_indices, FINAL_PERM, sizeof(perm_indices));

  for (int i = 0; i < 55; i++) {
    char* swap_ptr = (char*)(target + perm_indices[i] + 2);
    char tmp = *swap_ptr;
    *swap_ptr = target[i + 2];
    target[i + 2] = tmp;
  }

  for (int i = 0; i < 55; i++) {
    uint8_t x = target[i + 2];
    uint8_t y = (uint8_t)(93u ^ (uint8_t)(13u * x));
    if (x % 2 == 1) {
      y ^= 0x80u;
    }

    target[i + 2] = y;
  }
}
