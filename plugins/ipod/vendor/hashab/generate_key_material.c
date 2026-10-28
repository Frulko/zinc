#include "generate_key_material.h"
#include "byte_helpers.h"
#include "data/GEN190_SBOX.h"
#include "data/GEN190_STATE_TABLE.h"
#include "generate_buffer_from_state_mixing.h"

static inline uint8_t read_state_table(uint32_t offset) {
  return GEN190_STATE_TABLE[offset & 2047];
}

static inline uint8_t read_sbox(uint32_t idx) {
  return GEN190_SBOX[idx & 2047];
}

static inline uint32_t read_u32(const uint8_t* tab, int offset) {
  uint32_t result;
  __builtin_memcpy(&result, tab + offset, sizeof(result));
  return result;
}

static int32_t process_input_chunk(uint8_t byte0, uint8_t byte1, uint8_t byte2, uint8_t byte3) {
  int tmp1 = 0x151b4282 * ((-65 * byte1) & 0xda) - 0xa8da141 * (uint8_t)(-65 * byte1) - 0x7b3835d;
  uint32_t tmp2 = -0x4d668bfa + 0x7fffffff * (-0x2288b947 ^ 0x2f697e42 - 0x3370113f * tmp1);
  uint32_t tmp3 = -0x4e901d79 * (0x2856866e * ((-65 * byte0) & 0xda) - 0x142b4337 * (uint8_t)(-65 * byte0) - 0x6245d15a) + ((-0x2addd2b3 - tmp2 + ((2 * tmp2 - 0x6532e80e) & 0xbaee8d72)) << 8) + 0x75a8da9b;
  int tmp4 = ((uint8_t)(65 * byte2 + ((126 * byte2) | 0x70) - 56) - 2 * ((65 * byte2 + ((uint8_t)(126 * byte2) | 0x70) - 56) & 0xe2) + ((2 * (2 * ((65 * byte2 + ((uint8_t)(126 * byte2) | 0x70) - 56) & 0xe2) - (uint8_t)(65 * byte2 + ((126 * byte2) | 0x70) - 56)) - 453) & 0x1fe9dd6e) + 0x700b122b) ^ 0x3d6e8a2b;
  int tmp5 = 0x7fff0000 - 0x10000 * (-0x1b64 ^ tmp4);
  int tmp6 = 0x61a60e93 - (0xa80498d ^ -0x10000 - tmp5);
  int tmp7 = -0x6a21d959 * (uint8_t)(-65 * byte3) - 0x2bbc4d4e * ((-65 * byte3) & 0xda) + 0x7a32543b;
  uint32_t tmp8 = -0xd000000 + tmp3 - 0x17000000 * tmp7 - (-0xa80498e ^ 0x1e59f16c + tmp6);
  return (tmp8 ^ 0xac150ed ^ 0xa7b95656) - 0x68f5c387;
}

void generate_key_material(uint8_t* a1, uint8_t* output) {
  uint32_t v187[16];
  uint32_t v196[16];
  int32_t v205[16];
  uint8_t v211_v212[320];
  uint8_t* v212 = &v211_v212[1];
  int32_t v228[9];
  int32_t v229_arr[32] = {0};

  static const int32_t INIT_CONST[16] = {0x2a0ed355, -0x1557e0ef, -0x54be9533, 0x6bdab689, 0x2c740245, -0x12f2b1ff, -0x52596643, 0x6e3fe579, 0x2ed93135, -0x108d830f, -0x4ff43753, 0x70a51469, 0x313e6025, -0xe28541f, -0x4d8f0863, 0};

  v228[0] = 0x73 | (0x0a << 8) | (0x43 << 16) | (0x59 << 24);
  __builtin_memcpy(&v228[0], "YC\ns", 4);

  int v2 = 0;
  do {
    uint8_t v176_val = a1[4 * v2 + 23];
    uint8_t v3 = -65 * a1[4 * v2 + 20] - 113 - ((126 * a1[4 * v2 + 20]) & 0x1e);
    int v4 = -0xd7c73d3 * (uint8_t)(-65 * a1[4 * v2 + 21]) + 0x1af8e7a6 * ((-65 * a1[4 * v2 + 21]) & 0xda) + 0x35bb697f;
    int v5 = 0x1120f695 + 0x7fffffff * (0x10f416e7 ^ -0x2b972500 - 0x268ea3a5 * v4);
    int v181 = -0x12a93093 + 0x7b6cb500 * (-0xbe919 ^ -0x20f696 + v5);
    uint32_t v6 = -0x6411f445 ^ 0x743fcab3 - 2 * (17 ^ 179 & v3) + (85 ^ v3);
    uint32_t v182 = 0x80000000 * v181 - 0x35fe2983 * (0xbe8043a ^ 0x3172bd27 - 0x500de63 * v181 + (-0x102e3ef8 ^ v6));
    v6 = (v6 & 0xffffff00) | ((uint8_t)(-65 * a1[4 * v2 + 22] - 27 - ((126 * a1[4 * v2 + 22]) & 0xca)));
    uint32_t v7 = (((-0x6a3ac269 * (0x76391227 * (uint8_t)v6 + 0x138ddbb2 * (((v6 & 0x87) ^ 7) + (v6 & 0x3f)) + 0x5d4b362a)) ^ 0xec690b78) << 16) + 0x10000;
    uint32_t v8 = -0x1a0d9e7d * (-0x14eef6c9 ^ -v7);
    uint32_t v9 = ((uint8_t)(65 * v176_val + ((126 * v176_val) | 0xd8) - 108) - 2 * ((65 * v176_val + ((uint8_t)(126 * v176_val) | 0xd8) - 108) & 0xb6) + ((2 * (2 * ((65 * v176_val + ((uint8_t)(126 * v176_val) | 0xd8) - 108) & 0xb6) - (uint8_t)(65 * v176_val + ((126 * v176_val) | 0xd8) - 108)) - 365) & 0x275cf832) - 0x13ae7b63) ^ 0x9f2635a8;
    uint32_t v10 = -0x23f505a4 + 0x2d3a83d3 * v182 + 0x5445cbd3 * v8 - 0x7000000 * v9 + 0xe000000 * (49 & v9) - 0x32f800e * (0xbe8043a | 0xd7ed2d5 * v182) + 0x32f800e * (-0x14eef6c9 & -0xe374ad5 * v8);
    v205[v2++] = 0x170a3c78 + 0x7fffffff * (-0x2d7806bc ^ -0x39f628c2 - 0x10085249 * v10);
  } while (v2 != 6);

  for (int chunk_idx = 0; chunk_idx < 5; chunk_idx++) {
    int base = chunk_idx * 4;
    v205[6 + chunk_idx] = process_input_chunk(a1[base], a1[base + 1], a1[base + 2], a1[base + 3]);
  }

  v205[11] = v205[13] = v205[14] = v205[15] = -0x166dca43;
  v205[12] = -0x166dca3f;

  int v172 = 0;
  while (1) {
    int32_t* v56 = v205;

    int32_t* loop_end = v205 + 16;
    do {
      int32_t curVal = *v56;
      int v57 = curVal + 0x68f5c387;
      v57 &= 0xffffff00;
      int v58 = ~(-0x6230cf19 ^ -0x170a3c79 + curVal - v57);
      uint8_t v59 = read_state_table((v58 ^ 0xe230cf5c) + 64);
      v58 = (v58 & 0xffffff00) | (uint8_t)(123 * v59 + ((10 * v59 + 121) & 0xbe) - 28);
      uint32_t v60 = (0x44824334 - curVal + ((2 * curVal - 0x2e1478f2) & 0xa50ff288)) >> 8;
      uint32_t v61 = 0x170a3c78 - (0x2d7806bb ^ 0xffffff - v60);
      uint8_t v62;
      {
        uint8_t v61_byte = (uint8_t)(v61 - 121);
        int32_t idx = 1 * v61_byte + (-2) * ((int32_t)(v61_byte | 0xffffffbb)) + 250;
        v62 = read_state_table((uint32_t)idx);
      }
      int v63 = (uint8_t)(((-10 * v62 - 73) & 0x98) + 5 * v62 + 88) + ((-2 * (((-10 * v62 - 73) & 0x98) + 5 * v62 + 88) - 1) & 0x98) - 76;
      uint32_t v64 = -0x6e88de75 * (-0xfad41e4 ^ v63);
      uint32_t v178 = -0x143e0900 * (222 - (((-2 * (uint8_t)v58 - 1) & 0x1be) + (uint8_t)v58)) + 0x6648e93b * v64 + 0x7c961f35 + 0x3aebc1f7 * ((-0x65c703ba * v64) & 0xe0a57c38);
      uint32_t v65 = -0x3a1e6bd0 + 0x1f5dc100 * (-0x12119f ^ -0x6a5b1 + 0x18b039 * v178);
      uint32_t v66 = -0x12119ed0 ^ 0x1519b241 * v65;
      uint32_t v183 = 0x80000000 + 0x436c3937 * (-0x3e73dbc3 ^ v66);
      uint32_t v67 = (((2 * v61 - 0x2e1478f2) & 0xa50ff288) + 0x44824334 - v61) >> 8;
      uint32_t v68 = 0x170a3c78 - (0x2d7806bb ^ 0xffffff - v67);
      uint32_t v69 = -2 * (-0x2d7bcefc & -0x170a3c79 + v68) + (-0x16bcc71 & 0x68f5c387 + v68);
      int32_t idx66 = -0x52842ec6 - v69 - 2 * (0x2d7bcefb - v69 | -0x2d7bcec0 ^ -0x16bcc90 & -0x170a3c79 + v68) + (0x52843140 ^ -0x16bcc90 & 0x68f5c387 + v68);
      v66 = (v66 & 0xffffff00) | read_state_table((uint32_t)idx66);
      uint32_t v70 = (uint8_t)(31 * (uint8_t)v66 + ((-62 * (uint8_t)v66 + 29) & 4) - 17) ^ 0x84dad334;
      uint32_t v71 = -0x22ebfde5 + v178 + 0x745e2bf * v183 - 0x3aebc1f7 * v70 + 0x75d783ee * (-0x37fbf7f8 | -0x33212442 & v70) + 0x75d783ee * (-0x3e73dbc3 & 0x215acc87 * v183);
      uint32_t v72 = (0x44824334 - v68 + ((2 * v68 - 0x2e1478f2) & 0xa50ff288)) >> 8;
      uint32_t v73 = -v72 - 2 * ((0xffffff - v72) | 0xad7806bb) - 0x5187f947;
      uint32_t xor_val = (v73 & 0x4b7ac337) ^ (v73 & 0x4b7ac3c8) ^ 0x953c058e;
      int32_t idx73 = -0x7ffffcc0 + (0x153c05ca ^ xor_val);
      v73 = (v73 & 0xffffff00) | (uint8_t)(read_state_table((uint32_t)idx73) - 37);
      int v74 = -0x5bfbe83 * (-0x7a19002b * (uint8_t)v73 - 0xbcdffaa * (v73 & 0xde) - 0x4da12d0b);
      uint32_t v75 = 0x75b8de76 + (-0x32bad7a4 ^ -0x2b1d35c3 + v74);
      uint32_t v76 = -0x30b13900 + 257 * v71 - 0x3aebc1f7 * (-0x32bad7a4 ^ 0xa47218a + v75);
      int v77 = -0x269bf0e4 - 0x455f2b00 * (0x1e69d9 ^ -0x6a5b1 + 0x18b039 * v76);
      int v78 = v76 - 0x3aebc1f7 * (0x1e69d9ac ^ -0x4a26783 * v77);
      *v56 = 0x170a3c78 - (-0x2d7806bc ^ 0x3686a5b0 - 0xb18b039 * v78);
      v56 += 1;
    } while (v56 != loop_end);

    __builtin_memcpy(v196, INIT_CONST, sizeof(v196));
    v196[15] = v228[0];

    for (int i = 0; i != 3; i++) {
      generate_buffer_from_state_mixing((int*)v205, (int*)v196);

      for (int j = 0; j != 16; j++) {
        int32_t* v196_arr = (int32_t*)v196;
        int v80 = -0x5398da79 * v196_arr[j];

        uint8_t v81;
        {
          int32_t temp = v80 + 0x4b484c1;
          temp = temp * (-0xb18b039);
          temp = temp + 0x3686a5b0;
          temp = temp | (int32_t)0xffffff00;
          int32_t idx81 = 63 - temp;
          v81 = read_state_table((uint32_t)idx81);
        }
        int v82 = -0xb18b039 * (v80 - 0x3aebc1f7 * ((uint8_t)(123 * v81 + ((10 * v81 + 121) & 0x96) - 8) + ((-2 * (uint8_t)(123 * v81 + ((10 * v81 + 121) & 0x96) - 8) - 1) & 0x196)) - 0x4258ac62);
        uint32_t v184 = -0x2fdf40c1 * (0x2c3a4800 * (v82 + 0x3686a5b1) - 0x6dbc683) + 0x604d4bc9 * (0x682bffbf * ((uint32_t)(v82 + 0x3686a5b0) >> 21) - 0x68dc1e44) - 0x5aa7c026 - 0x3aebc1f7 * ((0x4a435f2 * (0x2c3a4800 * (v82 + 0x3686a5b1) - 0x6dbc683) + 0x33c6c6d5) | (0x59afe07e * (0x682bffbf * ((uint32_t)(v82 + 0x3686a5b0) >> 21) - 0x68dc1e44) - 0x74b1aa87));
        uint32_t v83 = ((-57 * (-61 - 55 * (-65 * (uint8_t)((uint32_t)(v82 + 0x3686a5b0) >> 21) - 68) - 47) - 80) | 0xffffff00) ^ 0x57d0703d;
        v83 = (v83 & 0xffffff00) | read_state_table((uint32_t)(v83 - 0x57d06efe - ((2 * v83) & 0x505f1f84)));
        v83 = (v83 & 0xffffff00) | (uint8_t)(5 * (uint8_t)v83 + 96 + ((-10 * (uint8_t)v83 - 73) & 0x88));
        int v84 = 0x7cac5dfa * ((uint8_t)v83 & 0x2c) - 0x3e562efd * ((uint8_t)v83 + 0x1f47ce2c);
        int v85 = -0x7fffffff * (0x1f47ce68 ^ 0x1fe021ab * v84);
        uint32_t v86 = ~(v85 ^ -0x3686a5b1 + 0xb18b039 * v184);
        int v87 = 0x85717eb * (0x3571a725 * (v86 >> 22) + 0x65252c4f) + 0x3cf06f59 * (-0x1a78c400 * v86 - 0x3b78bbad) + 0x7b462dd9 - 0x3aebc1f7 * ((-0x25bbc6a6 * (0x3571a725 * (v86 >> 22) + 0x65252c4f) + 0x1f14cd3b) | (-0x42dbf5a2 * (-0x1a78c400 * v86 - 0x3b78bbad) - 0x55024c7b));

        int32_t lookup_val = -0xb18b039 * v87 + 0x3686a5b0;
        uint32_t lookup_idx = 830 - lookup_val - (255 | ~lookup_val);
        uint8_t tbl_val = read_state_table(lookup_idx);

        uint8_t tbl_transform = (uint8_t)(31 * tbl_val + ((-62 * tbl_val + 29) & 0xb2) - 104);
        int tbl_combined = 217 + (217 ^ tbl_transform);
        int inner_v88 = v87 - (-0x3aebc1f7 * tbl_combined) + 0xe2895a1;
        int mid_v88 = -0xb18b039 * inner_v88 + 0x3686a5b0;
        int v88 = 0x5ea41d80 * mid_v88 + 0x21c4d674;
        uint32_t v89 = 0x7ba5d30f * ((uint32_t)mid_v88 >> 25);
        int v90 = -0x524f4ec7 + 0x45143e09 * (-128 + 0x10bcbbef * v89 ^ 0x5ec3063 - 0x36d9af0d * v88);
        v205[j] = 0x170a3c78 - (-0x2d7806bc ^ 0x3686a5b0 - 0xb18b039 * v90);
      }
    }

    generate_buffer_from_state_mixing((int*)v205, (int*)v196);

    for (int v91 = 0; v91 < 8; v91++) {
      v229_arr[v91] = -0x7095510b * v196[8 + v91] + 0x1a313b21;
    }
    int v91 = 0;
    uint8_t* v174 = &v212[32 * v172 - 1];

    do {
      int32_t* v229_local = v229_arr;
      int v92 = -0x79cf6773 * v229_local[v91] + 0x4d8f3d8a;
      uint8_t v93 = ~(116 ^ -257 - (103 ^ 92 & ~v92) ^ -94 - v92 - (163 | ~v92));
      uint8_t v94 = (-75 - (BYTE2(v92) & 0xf) + 91 - 2 * ((-75 - (BYTE2(v92) & 0xf) + 90) | 2)) ^ (65 - (BYTE2(v92) & 0xf0) - 2 * ((~BYTE2(v92) & 0xa0) | 0x52)) ^ 0x22;

      v174[4 * v91] = -0x1db4 + 63 * (125 ^ v93) + 2 * (180 & (125 ^ v93));
      v174[4 * v91 + 1] = -8448 + 63 * (37 ^ BYTE1(v92));
      v174[4 * v91 + 2] = 424 + 65 * v94 - 2 * (168 | v94);
      v174[4 * v91++ + 3] = 63 * ((HIBYTE(v92) ^ 0xab) + 7) + 2 * ((HIBYTE(v92) ^ 0xab) & 0x8e) + 57;
    } while (v91 != 8);

    if (++v172 == 5)
      break;
    int v95 = -0x166dca47;
    if (v172 != 4)
      v95 = v172 - 0x166dca43;
    v205[11] = v95;
  }

  for (int i = 0; i < 16; i++) {
    v187[i] = 0x14243245 * read_u32(GEN190_STATE_TABLE, i * 4) - 0x3f7784fd;
  }

  v205[11] = -0x166dca46;
  int32_t* v96 = v205;
  int32_t* v173 = v205;
  int32_t* loop_end2 = v205 + 16;

  do {
    int32_t v97_val = *v96;
    int v98 = -2 * (0x3374000 & -0x170a3c79 + v97_val) + (0x17f75cdc & 0x68f5c387 + v97_val);
    int v99 = 0x1bbc4b6c - 0x6530037d * v98 + 0x6530037d * (0x12875800 ^ 0x17f75c23 & 0x68f5c387 + v97_val) + 0x359ff906 * (0x1cc83cdd - v98 | 0x12875800 ^ 0x17f75c23 & -0x170a3c79 + v97_val);
    v98 = (v98 & 0xffffff00) | read_sbox((uint32_t)(-0x6315322b * v99 + 0x71b09b66 - ((0x39d59baa * v99) & 0xe36136cc)));
    v99 = (v99 & 0xffffff00) | (uint8_t)((uint8_t)v98 - 109 - ((2 * (uint8_t)v98 + 102) & 0xc0));
    int v100 = (uint8_t)v99 - 2 * ((((uint8_t)v99 & 0x37) ^ 0x36) + ((uint8_t)v99 & 0x76)) + 0x18e1cc48;
    uint32_t v101 = ~(-0x13002cc9 ^ -0x2be1f89b + v100);
    int v102 = 0x18e1cad2 + 256 * v101 - 512 * (-0x13002d | v101);
    uint32_t v103 = ((2 * (((((2 * v97_val - 0x2e1478f2) & 0xa50ff288) + 0x44824334 - v97_val) >> 8) - 0x1000000) + 1) | 0x5af00d77) + -0x166dca43 - (((((2 * v97_val - 0x2e1478f2) & 0xa50ff288) + 0x44824334 - v97_val) >> 8) - 0x1000000);
    uint32_t v104 = 0x8b8f00d * ((uint8_t)(v103 - 121) + 0x10037140) - 0x1171e01a * ((uint8_t)(v103 - 121) | 0xfce579da) - 0x1a7e203b;
    v104 = (v104 & 0xffffff00) | GEN190_SBOX[(0x2a94dec5 * v104 + 0x31a8661 - ((0x5529bd8a * v104) & 0x6350cc2) + 256) & 0x7ff];
    int v105 = (uint8_t)(31 * (uint8_t)v104 + ((-62 * (uint8_t)v104 + 23) & 0xaa) + 31);
    uint32_t v106 = -0x91a6d56 ^ -0x91a6d01 - v105;
    uint32_t v107 = -0x13002cc9 ^ v106 + (-0x13002cc9 ^ -0x2be1f89b + v102);
    uint32_t v108 = v107 + 0x2be1f89b;
    uint32_t v109 = 2 * (-0x13002cc9 & v107);
    uint32_t v110 = v109 + 0x3ee22563 - v108;
    uint32_t v111 = v108 - v109;
    uint32_t v112 = (0x44824334 - v103 + ((2 * v103 - 0x2e1478f2) & 0xa50ff288)) >> 8;
    int v113 = 0x49eeb075 + 0x25535f00 * (-0x57631 ^ v110);
    uint32_t v114 = 0x170a3c78 - (0x2d7806bb ^ 0xffffff - v112);
    uint32_t v177 = -2 * (0x186e5840 & -0x170a3c79 + v114) + (-0x2791a330 & 0x68f5c387 + v114);
    uint32_t v115 = -0x13002cc9 ^ -0x3ee22564 + v111 - 0x7fffffff * (-0x57630ab ^ 0xd4e3761 * v113);
    uint32_t v116 = 0x3ee22564 + (-0x13002cc9 ^ v115);
    uint32_t v117 = 0x7dd14bae - 0x5184d39f * v177 + 0x5184d39f * (0x50065804 ^ -0x2791a3d1 & 0x68f5c387 + v114) + 0x5cf658c2 * (-0x3a7e7a6d - v177 | -0x2ff9a7fc ^ -0x2791a3d1 & -0x170a3c79 + v114);
    v117 = (v117 & 0xffffff00) | GEN190_SBOX[(0x5417885f * v117 - ((-0x57d0ef42 * v117) & 0xd4f04458) + 0x6a78242c) & 0x7ff];
    int v118 = (uint8_t)(43 * (uint8_t)v117 + ((-86 * (uint8_t)v117 - 47) & 0x74) + 93) ^ 0x17cf682b;
    int v119 = 0x1fcebab6 + (0x17cf6811 ^ v118);
    uint32_t v120 = -0x541e0765 + (-0x13002cc9 ^ 0x214f1fe6 + v116 + v119);
    uint32_t v121 = 2 * (-0x13002cc9 & -0x2be1f89b + v120);
    uint32_t v122 = -0x34ec24c0 + 0x2c4f6d00 * (-0x232bce ^ 0x1dda9c + v120 - v121);
    uint32_t v123 = 0x80000000 - 0x7fffffff * (-0x232bcdc0 ^ -0x34b4ed9b * v122);
    uint32_t v124 = 0x80000000 - 0x6bd9f41b * (0x24b769bc ^ v123);
    int v125 = 0x411dda9c + v120 - v121 - 0x7fffffff * (0x24b769bc ^ -0x2872c613 * v124);
    uint32_t v126 = (((2 * v114 - 0x2e1478f2) & 0xa50ff288) + 0x44824334 - v114) >> 8;
    uint32_t v127 = 0x170a3c78 - (0x2d7806bb ^ 0xffffff - v126);
    uint32_t v128 = 0x56475815 ^ 0x5d3d9202 - 2 * (-0x22c26efd | 255 & -0x170a3c79 + v127) + (-256 | 0x68f5c387 + v127);
    v127 = (v127 & 0xffffff00) | GEN190_SBOX[(v128 ^ 0xf48536ad) + 768 & 0x7ff];
    uint32_t v129 = 0x3ee22564 + v125;
    int v130 = (uint8_t)(-107 * (uint8_t)v127 + ((-42 * (uint8_t)v127 - 103) & 0x6e) + 124) + ((-2 * (-107 * (uint8_t)v127 + ((-42 * (uint8_t)v127 - 103) & 0x6e) + 124) - 1) & 0x6e) + 0x42e84745;
    uint32_t v131 = -0x541e0765 + (-0x13002cc9 ^ -0x1ca6ce0 + v129 + v130);
    uint32_t v132 = 0x2be1f89b + (-0x13002cc9 ^ -0x21078964 + 257 * v131 - 2 * (-0x13002cc9 & -0x2be1f89b + v131) - 512 * (-0x2cc9 & 0x1e0765 + v131));
    *v173 = 0x170a3c78 - (0x3e782a73 ^ 0x2be1f89a - v132);
    v96 = v173 + 1;
    v173 = v96;
  } while (v96 != loop_end2);

  generate_buffer_from_state_mixing((int*)v205, (int*)v187);

  for (int k = 0; k != 3; k++) {
    int v185 = 0;
    for (int m = 0; m != 16; v185 = m) {
      int32_t* v187_arr = (int32_t*)v187;
      uint32_t v134 = -0x6193d4f1 * v187_arr[m] + ((-0x3cd8561e * v187_arr[m] - 0x5c0f3291) & 0xd9ffa66e) - 0x3ef839ef;
      uint32_t v175 = -0x6193d4f1 * v187_arr[m] + ((-0x3cd8561e * v187_arr[m] - 0x5c0f3291) & 0xd9ffa66e) - 0x13164154;
      int v135 = -0x62256c8d + v134 - 2 * (-0x30800019 + v134 - (0xf3fffe7 & v134) - (0xb022140 ^ v134) | 0xc3fd310 ^ 0xf3fff18 & v134) - (0xf3fffe7 & v134) - (0xb022140 ^ v134) + (0xc3fd310 ^ 0xf3fff18 & v134);
      v135 = (v135 & 0xffffff00) | (uint8_t)(GEN190_SBOX[(v135 + 0x69635ef2 - ((2 * v135 + 0x634ad8e6) & 0x6f7be4fe)) & 0x7ff] - 77);
      int v136 = 0x3109f69b * (-0x2bfa3fe5 * (uint8_t)v135 + 0x57f47fca * ((uint8_t)v135 & 0x96) + 0x2878b92b) - 0x38a819e8;
      uint32_t v137 = 0x2d1c4a3d + 2 * v134 - 0x33f2e5e9 * v136 - v175 + 2 * (-0x13002cc9 | 0x11c5db27 - 2 * v134 + 0x33f2e5e9 * v136 + v175 - 2 * (-0x13002cc9 | ~v134)) + 2 * (-0x13002cc9 | ~v134);
      uint32_t v138 = ~(-0x13002cc9 ^ -0x2be1f89b + v137);
      int v139 = 0x6f6d945d * (v138 >> 21);
      int v140 = v139 - 0x39315c19;
      int v141 = -0x76cb200b * (v139 - 0x39315c18);
      uint32_t v142 = 0x3d63e057 - 0x1e7c0800 * v138 + 0x3cf81000 * (-0x6f9c3 | v138);
      int v143 = -0x68338f7f * v142 - 1;
      uint32_t v144 = v143 | -0x4857 ^ -0x2f80000 + (0x4856 ^ 0x4b4e02f8 + v141);
      int v145 = 0x3ebdb683 - v141 + v143 - 2 * v144 + 2 * (0x24ce3f1e & -0x2e751d11 + 0x934dff5 * v140 - 0x17cc7081 * v142 + 2 * v144);
      int v146 = -2 * (0x124214a2 & -0x2be1f89b + v145) + (0x13d234eb & -0x2be1f89b + v145);
      int v147 = -0x21c95494 - (0xd21014 ^ -0x364a56b7 - v146 ^ 0x13d23414 & -0x2be1f89b + v145);
      v147 = (v147 & 0xffffff00) | GEN190_SBOX[(v147 + 0x58619c28 - ((2 * v147 + 0x4392a926) & 0x6d308d2a)) & 0x7ff];
      int v148 = 0x2bafa9ef - ((uint8_t)(31 * (uint8_t)v147 + ((-62 * (uint8_t)v147 + 23) & 0xc2) - 109) + ((-2 * (uint8_t)(31 * (uint8_t)v147 + ((-62 * (uint8_t)v147 + 23) & 0xc2) - 109) - 1) & 0x1c2));
      int v149 = -0x3a60f3c8 - v145;
      uint32_t v150 = 0x2be1f89a - v145 | -0x9225 ^ 0x1b030000 + (0x9224 ^ -0x46b2a90f + v148);
      uint32_t v151 = 0x7fffffff - (-0x13002cc9 ^ 0x11f2956f - v148 + v149 - 2 * v150);
      uint32_t v152 = (((2 * (2 * ((0x3ff - (v151 >> 22)) | 0x1ed1faa) - (0x4693e491 - (v151 >> 22))) - 0x76b27e2f) | (-2 * (0x1eb542bf - (v151 << 10) - 2 * ((-0x400 - (v151 << 10)) | 0xd147f879)) - 0x65256373)) + 0x1eb542bf - (v151 << 10) - 2 * ((-0x400 - (v151 << 10)) | 0xd147f879) + 0x4693e491 - (v151 >> 22) - 2 * ((0x3ff - (v151 >> 22)) | 0x1ed1faa) + 0x6debf0d1) ^ 0x3c5534e4;
      int v153 = 0x40b25e4d + 2 * v152 - (0x623d9994 & v152) - 2 * (0x22281100 | v152) - 2 * (-0x9806041 + v152 - (-0x1dc2666c & v152) - (0x22281100 ^ v152) | -0x1fc26edd ^ -0x1dc26695 & v152) + (0x603d9123 ^ 0x623d996b & v152);
      v153 = (v153 & 0xffffff00) | GEN190_SBOX[(v153 + 0x238b34c5 - ((2 * v153 - 0x50155b1e) & 0x972bc0a8)) & 0x7ff];
      int v154 = (uint8_t)(43 * (uint8_t)v153 + ((-86 * (uint8_t)v153 - 47) & 0x9c) - 55) ^ 0x52973f4e;
      int v155 = 0x80000000 + (-0x2d68c080 ^ v154);
      uint32_t v156 = -v155 + (-0x13002cc9 ^ v152);
      uint32_t v157 = ~v156;
      int v158 = 0x1a006443 + 128 * v157 - 256 * (0x2b98c5 | v157);
      int v159 = 0x5f932e07 * (v157 >> 25);
      int v160 = v159 + 0x4fdf38f0;
      uint32_t v161 = 0x434023e - v158 | -0xa576 ^ -0x5c390000 + (0xa576 ^ 0x5c38ff80 + 0x553edfb7 * v159);
      int v162 = 0x3c2d0d34 - v158 - 0x553edfb7 * v160 - 2 * v161;
      v205[v185] = 0x170a3c78 - (0x3e782a73 ^ 0x2be1f89a - v162 - 2 * (-0x6cc4e4d & -0x97ec64d + v158 - 0x2ac12049 * v160 + 2 * v161));
      m = v185 + 1;
    }
    generate_buffer_from_state_mixing((int*)v205, (int*)v187);
  }

  for (int i = 0; i < 8; i++) {
    v228[i + 1] = v187[i + 8];
    v229_arr[i] = -0x7095510b * v187[i + 8] + 0x1a313b21;
  }

  for (int n = 0; n != 32; n++) {
    uint32_t v164 = -0x79cf6773 * v229_arr[n] + 0x4d8f3d8a;
    uint32_t v186 = 0x232636f5 * (HIBYTE(v164) | 0xffffff00) - 0x2aec5ff9;
    v212[4 * n + 191] = -23 * (91 * (45 * (-115 * *(((uint8_t*)v229_arr) + 4 * n) - 118) - 17) - 118) + 70;
    v212[4 * n + 192] = 23 * (((2 * (BYTE1(v164) ^ 0xaa)) | 0x8a) - (BYTE1(v164) ^ 0xaa) + 59) - 23 * ((2 * (((2 * (BYTE1(v164) ^ 0xaa)) | 0x8a) - (BYTE1(v164) ^ 0xaa) + 59)) & 0xdf) - 42;
    v164 = (v164 & 0xffffff00) | (uint8_t)(-5 * (-51 * BYTE2(v164) + 43) + ((10 * (-51 * BYTE2(v164) + 43) + 83) & 0x26) + 67);
    v212[4 * n + 193] = -23 * ((uint8_t)v164 + ((-2 * (uint8_t)v164 - 1) & 0x26)) - 5;
    v164 = (v164 & 0xffffff00) | (uint8_t)(-93 * (uint8_t)v186 + ((-70 * (uint8_t)v186 - 21) & 8) - 122);
    v212[4 * n + 194] = -23 * ((uint8_t)v164 + ((-2 * (uint8_t)v164 - 1) & 8)) + 34;
  }

  for (int n = 0; n != 30; n++) {
    v212[n + 159] = -25 * v212[n + 191] - ((78 * v212[n + 191] - 85) & 0xb4) - 80;
  }

  __builtin_memcpy(output, v211_v212, 190);
}
