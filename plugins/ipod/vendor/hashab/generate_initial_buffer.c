#include <stdint.h>

#include "data/IBUFF_KEY_TABLE.h"
#include "data/IBUFF_MIX_SEED_A.h"
#include "data/IBUFF_MIX_SEED_B.h"

#include "byte_helpers.h"
#include "generate_initial_buffer.h"

static inline uint8_t idx64(uint8_t x) {
  return (-19 * x + 69) & 0x3f;
}

static inline int8_t xform_v318(uint32_t v) {
  return v - 116 - ((2 * v + 14) & 0xa);
}

static inline int8_t mix_byte(int8_t x) {
  return 94 * ((-65 * x) & 0xda) - 17 * x - 75;
}

static inline int32_t read316(uint32_t v) {
  return -0x35d1732d * v - 0x6448adfb;
}

static inline int32_t read317(uint32_t v) {
  return 0x2bf06481 * v - 0x7dbb7ad1;
}

static inline uint32_t v318_mask(uint32_t v) {
  return (2 * v + 0x3845070e) & 0x842fbc0a;
}

static inline uint32_t read318(uint32_t v) {
  return v - v318_mask(v);
}

static inline uint32_t read318_off(uint32_t v) {
  return v - 0x21c59e74 - v318_mask(v);
}

static void mix_with_v318(uint8_t* a1, uint32_t* v318) {
  for (int i = 0; i != 64; ++i) {
    uint8_t* out = &a1[i & 0xf];

    int8_t t = xform_v318(v318[i]);
    int8_t v213 = -208 + (102 ^ t);
    int8_t mixed = mix_byte(*out);
    int8_t v214 = -81 - v213 | 255 ^ -54 - 49 * mixed;
    int8_t v216 = 19 * ((4 * v214 + 2 * (-49 * mixed + v213) + 57) & 0x50) - 93 * mixed - 31 - 19 * v213 - 38 * v214;
    int8_t v217 = 5 ^ 27 * v216;

    *out = 47 + 63 * v217 - 126 * (17 & v217);
  }
}

static void mix_with_v317(uint8_t* a1, uint32_t* v317) {
  for (int i = 0; i != 64; ++i) {
    uint8_t* out = &a1[i & 0xf];

    int8_t v219 = 65 * *out + ((126 * *out) | 0x9c) + 50;
    int8_t v296 = -81 + (24 ^ v219);
    int8_t decoded = 127 * LOBYTE(v317[i]) - 48;
    int8_t v220 = (-73 * (7 * decoded - 14 * (decoded & 0x5b) + 125)) | (-82 - v296);
    int8_t v221 = -65 * ((4 * v220 + 2 * (v296 - -73 * (7 * decoded - 14 * (decoded & 0x5b) + 125)) - 91) & 0xae) + -119 * (7 * decoded - 14 * (decoded & 0x5b) + 125) - -65 * v296 - 22 - 126 * v220;

    *out = 0x1741 - 63 * (90 ^ 63 * (1 - v221));
  }
}

static int fold_v315_into_output(uint8_t* a1, uint32_t* v315) {
  int result = 0;
  do {
    int8_t v222 = 23 * (-19 * LOBYTE(v315[result]) + 69) + 31;
    int8_t v223 = -0xd92 - 31 * (112 ^ -41 - 89 * v222 + 2 * (112 & 56 - 39 * v222));
    int8_t v224 = 63 ^ (45 - 33 * v223);
    int8_t v225 = 65 * (((-2 * v224 - 1) & 0x80) + v224) - 43 * (-67 * ((uint16_t)(0x14ed * LOWORD(v315[result]) - 0x3bbb) >> 8) + 44) + 4;
    int8_t v226 = -914 - 31 * (27 ^ -129 - (27 ^ -33 + 63 * v225));
    int8_t v227 = 9 ^ (45 - 33 * v226);
    int8_t v228 = (117 - (((-2 * v227 - 1) & 0xec) + v227)) ^ 0xc2 ^ (-49 * (-47 * ((unsigned int)(0x755b14ed * v315[result] - 0xfa73bbb) >> 16) - 45) + 98) ^ 0x3b;
    int8_t v229 = 0x160d + 31 * (182 ^ -128 + (48 ^ v228));
    int8_t v230 = 156 ^ (45 - 33 * v229);
    int8_t v231 = 119 + 89 * v230 + 78 * (79 & v230);
    int8_t v232 = 123 * ((unsigned int)(0x755b14ed * v315[result] - 0xfa73bbb) >> 24) + 10 * (((unsigned int)(0x755b14ed * v315[result] - 0xfa73bbb) >> 24) & 0xfd) - 113;
    int8_t v233 = -132 - 77 * v232 - 2 * (125 | 51 * v232) - (44 ^ -23 * v231);
    int8_t v234 = -128 + (127 ^ 128 + (70 ^ v233));
    int8_t v297 = 244 + 31 * v234 - 62 * (57 & v234);
    int8_t v235 = 65 * a1[result & 0xf] + ((126 * a1[result & 0xf]) | 0xe0) - 112;
    int8_t v236 = 100 - (110 ^ 127 - (170 ^ v235));
    int8_t v237 = -0x1650 + 41 * (110 ^ 27 + v236);
    int8_t v238 = 136 ^ (45 - 33 * v297);
    int8_t v239 = 0x4a3 + 9 * (119 ^ v238);
    int8_t v240 = -74 - 3 * v237 - 99 * v239 - 246 * (-54 - 57 * v239 | 47 - 25 * v237);
    int8_t v241 = 106 + 77 * v240 + 2 * (95 & 54 + 51 * v240);
    int8_t v242 = -0x13ab - 53 * (95 ^ v241);
    uint8_t* out = &a1[result++ & 0xf];
    *out = 121 - 35 * v242 - 2 * (90 & -34 + 29 * v242);
  } while (result != 128);

  return result;
}

int generate_initial_buffer(uint8_t* a1, uint8_t* a2) {
  uint32_t v315[128];
  uint32_t v316[64];
  uint32_t v317[64];
  uint32_t v318[70];

  __builtin_memcpy(v318, IBUFF_MIX_SEED_A, 0x100u);
  __builtin_memcpy(v317, IBUFF_MIX_SEED_B, sizeof(v317));
  __builtin_memcpy(v316, IBUFF_KEY_TABLE, sizeof(v316));
  __builtin_memset(v315, 0, sizeof(v315));

  for (unsigned int i = 0; i != 512; i += 4) {
    uint8_t b0 = a2[i % 0xbe];
    uint8_t b1 = a2[(i + 1) % 0xbe];
    uint8_t b2 = a2[(i + 2) % 0xbe];
    uint8_t b3 = a2[(i + 3) % 0xbe];

    uint8_t v3 = -128 * b0 + (60 ^ 63 * b0);
    uint32_t v4 = 0x39a04a0d + 0x554e0d8a * (70 ^ 87 & v3) - 0x2aa706c5 * (230 ^ v3);
    int v298 = -0x7fffffff * ~(0x16b95557 ^ -0x30fc880d * v4);
    SET_LOBYTE(v4, -65 * b1);
    int v302 = -0x6e97a90b * (-0x27e9b546 * (v4 & 0xda) - 0x6c0b255d * (uint8_t)v4 - 0x19720829) + 0x32879462;
    SET_LOBYTE(v4, -65 * b2);
    uint8_t v5 = -128 * b3 + (6 ^ 63 * b3);
    unsigned int v6 = -0x2f600aab ^ -0xda1c1e7 - 2 * (24 ^ 25 & v5) + (220 ^ v5);
    int v299 = 0x7d0d9900 * (0x12a5dd2f * (-0x3286ec62 * (v4 & 0xda) - 0x66bc89cf * (uint8_t)v4 + 0x1052e4b7) + 0x2963068c) + 0xd990000 * v302 - 0x306d1a8f - 0x67000000 * v298 - 0x1fa237d5;
    int v7 = 0x47e3a2cb - 0x5c38e499 * v299 + 0x6a516471 * (0x22c1cb4c ^ v6) + 0x2b5d371e * (-0x544da01 & 0xe3182fc + 0x31f60957 * v299 + (0x22c1cb4c ^ v6));
    v315[i / 4] = 0x39866647 - 0x11a1971b * (-0x544da01 ^ 0x565dc91 * v7);
  }

  for (int j = 0; j != 512; ++j) {
    uint8_t jb = (uint8_t)j;
    uint8_t idx_cur = jb & 0x7f;
    uint8_t idx_115 = 127 & 115 + jb;
    uint8_t idx_71 = 127 & 71 + jb;
    uint8_t idx_101 = 127 & 101 + jb;

    unsigned int v9 = ((((((unsigned int)(-0x755b14ed * v315[idx_115] + 0xfa73bba) >> 29) - 0x172a0008) ^ 0xed5c) + 0x172a0000) ^ (((0x55275898 * v315[idx_115] + 0x660fddd7) ^ 0xed5c) + 0x172a0000) ^ 0x95ffa6fe) - 0x1f64dcc4;
    int v303 = idx_cur;
    int v246 = v315[v303];
    unsigned int v10 = -0x1f64dcc5 - v9 | -0x8503 ^ -0x50a70000 + (0x8502 ^ 0x604e3bba - 0x755b14ed * v246);
    int v11 = -0x539f5b6 - 0x32313662 * v10 - 0x48ad7fa3 * v246 - 0x19189b31 * v9 + 0x32313662 * (0x13039f15 & 0x2f0c1880 + 2 * v10 + 0xaa4eb13 * v246 + v9);
    unsigned int v12 = -0x755b14ed * v315[idx_71] + 0xfa73bba;
    int v300 = -0x59ef3253 * (-0x7ace5781 * ((0x9e88d62 * (0x533c4251 * (v12 >> 27) + 0x7a16c498) + 0x37410591) | (-0x17f680a6 * (0x156afc25 * (32 * v12 + 32) - 0x43603030) - 0x66973f21)) + 0x3f8bc631 * (0x533c4251 * (v12 >> 27) + 0x7a16c498) - 0x3d419ed3 * (0x156afc25 * (32 * v12 + 32) - 0x43603030) - 0x2b6b5494) + 0x14786343 * v11 - 0x341cefc1;
    unsigned int v13 = -0x755b14ed * v315[idx_101] + 0xfa73bba;
    v315[v303] = -0x17158cd6 - -0x38da74bf * (-0x3c14c211 * (0x308a955 * (v13 >> 9) + 0x25bb69a7) + 0x5e6e311d * (0x6b800000 * v13 - 0x4e787b0) + 0x6127a448 - 0x1576575b * ((0x290417fa * (0x308a955 * (v13 >> 9) + 0x25bb69a7) - 0x161f2e15) | (-0x77670a32 * (0x6b800000 * v13 - 0x4e787b0) - 0x67556061))) + 0x6e98cc67 * (v300 + 0x57936f2d * ((-0x101e445e * v11) & 0xdf873d6));
  }

  int8_t v249 = -19 * LOBYTE(v315[22]);
  unsigned int v14 = (0x755b14ed * v315[22] - 0xfa73bbb) / 5u - 0x67baf6ac - ((2 * ((0x755b14ed * v315[22] - 0xfa73bbb) / 5u)) & 0x23c63882);
  int v15 = 0x1e5ef717 + 0x16fac07a * (0x11e31c41 ^ -0x661ed13 + v14);
  int v16 = read316(v316[63]);
  int v304 = 0x1652896 + (0x2a3090c2 ^ -0x175bb0a7 * v15);
  unsigned int v17 = -0x4debb223 + 0x73df1a07 * v16 - 0x73df1a07 * (-0x6f72b2db | v16) - 0x73df1a07 * ((0x164ce359 ^ (v16 | read317(v317[60]))) & (0x640a258 | 0x100c4101 & v16)) - 0x73df1a07 * (0x7f7ef3db | v16 | 0x164ce359 ^ read317(v317[60])) + 0x73df1a07 * (0x164ce359 | v16 | read317(v317[60]));
  unsigned int v253 = (-0x2f49c615 * (((0x6ac333b7 * v17 - 0x295daffc) & (((read317(v317[60])) | 0x6f72b2da) ^ 0x86605088) & 0x86605088) + -0x6ac333b7 * v17 + (~((read317(v317[60])) | 0x6f72b2da) & 0x799faf77) + ((0x6ac333b7 * v17 - 0x295daffc) | ((read317(v317[60])) | 0x6f72b2da) ^ 0x86605088 | 0x86605088)) - 0x4da857ac) / 3 + 0x4fd491a8;
  unsigned int v18 = (((((-0x35d1732d * v316[idx64(LOBYTE(v315[33]))] - 0x6448adfb) | 0xc3456f96) + 0x19f50000) ^ 0x87c9) - 0x19f50000) & 0xbcbbfeeb ^ 0xa69b640a;
  uint32_t v42_r = read318(v318[42]);
  unsigned int v18_t = (v18 + 0x59641d3c - ((2 * v18) & 0xb2c83a78)) / 5 - 0x88c9600;
  v318[42] = -v42_r - v18_t + ((2 * (v18_t + v42_r + 0x66c6f78c)) | 0x842fbc0a) + 0x3afea6e8;
  SET_LOBYTE(v18, (127 * LOBYTE(v317[idx64(LOBYTE(v315[55]))]) - 48) & 0x1f);
  unsigned int v19 = ((((0x6f72b2db << (((((32 - v18) & 0x1f) + 48) ^ 0x30) & 31)) + 0x6e39ffff) ^ 0x3cc0) - 0x6e3a0000) ^ ((((0x6f72b2dau >> (v18 & 31)) + ~(0xffffffff >> (v18 & 31)) + 0x6e3a0000) ^ 0x3cc0) - 0x6e3a0000) ^ 0x6ce109e9;
  int8_t v278 = -29 + v19 - 2 * (22 | v19);
  int v20 = (read317(v317[26])) | read317(v317[idx64(LOBYTE(v315[87]))]);
  SET_LOBYTE(v19, ((127 * LOBYTE(v317[26]) - 48) & 6 | 0x41) - 72 - ((127 * LOBYTE(v317[26]) - 48) & 0x90 | 0x28));
  int8_t v255 = -5 * v20 - -5 * ((v20 | v19 | 0xb8) + (v20 & v19 & 0xb8) + (~(uint8_t)v19 & 0x47)) - 17;
  unsigned int v275 = -0x2a3090c3 ^ -0x1652896 + v304;
  int8_t v259 = -128 + (61 ^ -22 + v304);
  unsigned int v301 = read318_off(v318[v259 & 0x3f]) / 5;
  int v289 = v275 & (0x12ffaf12 ^ v301);
  int32_t expr421 = 0x33af54cd - (-0x5755d0a & 0x7dbb7ad0 - 0x2bf06481 * v317[42]) - 2 * (0x3924b1d8 | -0x3d75fdda & ~(-0x2448530 - 0x2bf06481 * v317[42])) ^ 0x56c16bae - (-0x4a5404f6 & 0x7dbb7ad0 - 0x2bf06481 * v317[42]) - 2 * (0x211570a5 | 0x14aa8b0a & ~(-0x2448530 - 0x2bf06481 * v317[42]));
  unsigned int v21 = 0x1998bad - (-0x67ce3e83 ^ expr421);
  int v22 = v275 & (0x14a074b3 ^ -0x1998bae + v21 & (0x3047874d | read317(v317[42])));
  unsigned int v276 = 0x9c94810 + (v22 ^ 0x3eb0f4f3 + 2 * (-0x3eb0f4f4 & -0x1652896 + v304) - (-0x14a074b4 & -0x1652896 + v304));
  int v283 = 2 * (0x10cf2f10 & -0x1652896 + v304);
  int32_t expr429 = 0x6a7828e1 - (-0x688617d7 & read317(v317[42])) - 2 * (-0x2d01bf47 | 0x501a800 & ~(0x244852f + 0x2bf06481 * v317[42])) ^ 0x76561a96 - (0x58c1909b & read317(v317[42])) - 2 * (0x1d9489fc | -0x3fbeeffd & ~(0x244852f + 0x2bf06481 * v317[42]));
  unsigned int v23 = -0xb640000 + (0xad69 ^ 0xb63ffff - (-0x309536bb ^ expr429));
  unsigned int v24 = v23 & 0x1ad1af2c ^ v23 & (0x52f1eed9 - ((0x2bf06481 * v317[42] - 2 * ((read317(v317[42])) | 0x87cd9e0a) + 0xa122338) & 0x4f2159fc) + 2 * ((0x2bf06481 * v317[42] - 2 * ((read317(v317[42])) | 0x87cd9e0a) + 0xa122338) & 0x422148d8 | 0xad0e1127)) ^ (-0x1127 - ((0x6481 * LOWORD(v317[42]) - 2 * ((uint16_t)(0x6481 * LOWORD(v317[42]) - 0x7ad1) | 0x9e0a) + 0x2338) & 0x59fc) + 2 * ((0x6481 * LOWORD(v317[42]) - 2 * ((uint16_t)(0x6481 * LOWORD(v317[42]) - 0x7ad1) | 0x9e0a) + 0x2338) & 0x48d8 | 0x1127)) & 0xad69 ^ 0x46e895d6;
  unsigned int v25 = (-0x46e838ff ^ v24) & (-0x9232d7c ^ v301);
  unsigned int v26 = 0x76d3035c - v24 - v25 - (-0x9232d7c | v24) - 2 * (-0x92bef80 | ~v24) + 2 * (v25 | -0x922205a + v24 - (-0x9232d7c & v24) - (-0x92bef80 ^ v24));
  unsigned int v27 = (-0x301d0d27 ^ v26) & (0x687763d5 ^ -0x9c94810 + v276 & (v289 ^ -0x10cf2f11 + v283 - (0x12ffaf12 & -0x1652896 + v304)));
  int v28 = 0x7b78730f - (-0x687763d6 ^ (0x7fffffff | v26)) - (v27 ^ -0x14000003 + v26 - (0x20012140 ^ v26) - (-0x17889c2b & v26));
  int v29 = -0x29e43c85 + (0x39cbc6c ^ -0x13010f3b + v28);
  v318[63] = -0x1c228387 + (-0x3de821fb ^ -0x29e43c85 - v29 + (-0x3de821fb ^ 0x1c228387 + v318[63]));
  v317[25] = v317[25] - 0x5863db81 * read318(v318[v259 & 0x3f]) + 0x39fe1474;
  int v284 = -0x128b26c3 * v253 + 0x532b4d1a;
  int32_t expr443 = 0x683d1559 - 2 * (-0x17c2eaa6 | ~v284 & 0x1c228387 + v318[21]) + (~v284 & -0x63dd7c79 + v318[21]) ^ -0x2b4202ce - v284 - 2 * (0x12a61f2f | -0x3fee4000 & ~v284) - (0x4217de05 | ~v284);
  unsigned int v30 = 0x6bb0000 + (0x42c4 ^ -0x6bb0001 - (-0x564f58b ^ expr443));
  unsigned int v31 = v30 & ((((2 * v318[21] + 0x3845070e) & 0x842fbc0a) - v318[21] + 0x43a94950 - ((2 * (((2 * v318[21] + 0x3845070e) & 0x842fbc0a) - v318[21]) + 0x438b3ce6) | 0x43c755bc)) & 0xe048272c ^ 0x5e34ba68) ^ ((((2 * LOWORD(v318[21]) + 0x70e) & 0xbc0a) - LOWORD(v318[21]) + 0x4950 - ((uint16_t)(2 * (((2 * LOWORD(v318[21]) + 0x70e) & 0xbc0a) - LOWORD(v318[21])) + 0x3ce6) | 0x55bc)) & 0x272c ^ 0xba68) & 0x42c4 ^ 0x5264a299;
  int v32 = -2 * (0xa00400 & -0x1652896 + v304) + (0xa62722 & -0x1652896 + v304);
  int v290 = -0x6dbd18bc + 0x54af123b * (v31 ^ 0x61c340b7 & v30) + v315[122] * (0x31ba214 + 0x628cb593 * (v31 ^ 0x61c340b7 & v30) + 0x3ae694da * (-0x2d9b1de3 | v31 ^ -0x1e3cbf49 & v30)) + 0x56a1db8a * (-0x2d9b1de3 | v31 ^ -0x1e3cbf49 & v30);
  v317[60] = v290;
  int v267 = read316(v316[idx64(LOBYTE(v315[120]))]);
  int v33 = 0x5eae21db ^ (v267 | ~(0x2a3090c2 ^ -0x1652896 + v304));
  unsigned int v34 = 0x7fffffff - (0x2151de24 ^ v33) & (-0x198d63b0 ^ 0x1d0f63a6 - v32 ^ 0x2c34b76b & -0x1652896 + v304);
  unsigned int v35 = ~v34;
  v315[5] = v315[5] - 0x11a1971b * v35;
  v318[35] = 0x63dd7c79 + (-0x3de821fb ^ 0x31a7e76f + (-0x3de821fb ^ 0x1c228387 + v318[35]));
  int8_t v250 = -0x13f880 - 0x23ff * (90 ^ 50 + v278);
  uint32_t v250_val = v318[v250 & 0x3f];
  uint32_t v250_m = v318_mask(v250_val);
  uint32_t v250_nr = v250_m - v250_val;
  unsigned int v265 = 0x19eca8cf * v250_m - 0x19eca8cf * (((2 * v250_nr + 0x438b3ce7) & 0x211a9a4a) + v250_val) - 0x63ca6a0c;
  int32_t t29 = read316(v316[29]);
  int32_t t18 = read316(v316[idx64(LOBYTE(v315[18]))]);
  int32_t t29_or = t29 | 0x3cba9069;
  int32_t t18_or = (t18 | 0xc3456f96) ^ 0x6276a54d;
  unsigned int v36 = -2 * (-0x1d9b5af7 & (-0x9a4857 ^ t29_or)) + (0x6276a54d & (-0x9a4857 ^ t29_or));
  int32_t inner = (t29_or & t18_or);
  int32_t expr = 0x80000000 + 3 * (inner ^ 0x1d9b5af6 - v36);
  unsigned int v37 = 0x593e77bd * (-0xbb196ef ^ expr);
  unsigned int v38 = ~(0x6916fb95 * v37) | -0x5655 ^ -0x20ae0000 + (0x5654 ^ -0x5d0d7ad1 + 0x2bf06481 * v317[44]);
  v317[44] = 0x59bf3393 + v317[44] + 0x206c3d15 * v37 - 0x4f3848fe * v38 + 0x4f3848fe * (-0xbb196ef & 0x2448531 + 0x2bf06481 * v317[44] - 0x16e9046b * v37 + 2 * v38);
  int v251 = v317[44];
  int v39 = v317[idx64(LOBYTE(v315[44]))];
  int v40 = -0x4f740f4c - (0x15f40359 ^ 0x244852f + 0x2bf06481 * v39);
  v315[107] = v315[107] + 0x11a1971b * (-0x15f4035a ^ -0x308bf0b5 + v40);
  SET_LOBYTE(v40, (-19 * LOBYTE(v315[71]) + 69) & 0x1f);
  unsigned int v41 = ((((-0x4f2159fc << (((((32 - v40) & 0x1f) + 58 - ((2 * (32 - v40)) & 0x14)) ^ 0x3a) & 31)) + 0x29c6ffff) ^ 0x9d87) - 0x29c70000) ^ ((((0xb0dea603 >> (v40 & 31)) + ~(0xffffffff >> (v40 & 31)) + 0x29c70000) ^ 0x9d87) - 0x29c70000) ^ 0x80651d5b;
  unsigned int v42 = -0x5ada25d5 ^ -0x3c00395d + v41 - 2 * (-0x3c00395d | 0x10000904 & v41) + (-0x6f72b2db | ~v41);
  int v277 = -0x557b4886 - 0x226224d * (0x1920ee76 ^ v42);
  int v43 = read317(v317[29]);
  int v262 = v43 | 0x6f72b2da;
  unsigned int v269 = (v43 | 0x6f72b2da) ^ 0xec13b6f2;
  int v263 = 0x265be685 * v277 - 0x2828ee63;
  SET_LOBYTE(v42, v40 - 2 * ((-19 * LOBYTE(v315[71]) + 69) & 1) + 97);
  unsigned int v44 = ~v43 & (((((-0x4f2159fc << (((((32 - v40) & 0x1f) + 34 - ((2 * (32 - v40)) & 4)) ^ 0x22) & 31)) + 0x6318ffff) ^ 0x2cda) - 0x63190000) ^ ((((0xb0dea603 >> ((v42 ^ 0x61) & 31)) + ~(0xffffffff >> ((v42 ^ 0x61) & 31)) + 0x63190000) ^ 0x2cda) - 0x63190000) ^ 0xfcb4e3fc);
  unsigned int v45 = ~(-0x144148aa ^ v44 ^ 0x7792f696 - v43 - 2 * (-0x521ed64 | 0x420e160 & ~v43) - (-0x34b1c04 | ~v43));
  unsigned int v46 = 0x3ccd66eb - (-0x6e9f5a36 ^ v45);
  unsigned int v47 = -0x64f6554e + v262 + 0x265be685 * v277 + v46 - (v263 & v269 | 0x13ec490d & (v263 | v269)) + (0x13ec490d | ~v262);
  unsigned int v48 = -0x3ccd66ec + v46 | -0x2828ee62 + v262 + 0x265be685 * v277 - (v263 & v269 | 0x13ec490d & (v263 | v269)) + (0x13ec490d | ~v262);
  v318[54] = -0x3845070f - v318[54] - v47 + v48 + 2 * (0x1c228387 + v318[54] ^ 0x3de821fa & (-~(v47 - v48 + (-0x3de821fb ^ 0x1c228387 + v318[54])) ^ 0x1c228387 + v318[54]));
  int v49 = read316(v316[idx64(LOBYTE(v315[45]))]);
  v315[62] = -0x467999b9 + 0x6e5e68e5 * (0x242c2d76 ^ 0xfa73bba + 0xaa4eb13 * v315[62]);
  int v260 = v315[62];
  int v50 = read317(v317[45]);
  int v51 = (v50 | 0x4cf50fa3) & ((v49 | v50) ^ 0x3966a969);
  int v52 = 2 * (0x18040909 & (0x1e041b99 ^ (-0x330af05d | v50))) - (0x3966a969 & (0x1e041b99 ^ (0x4cf50fa3 | v50)));
  int v53 = -0x66b83c8 - (v51 ^ -0x1804090a + v52);
  unsigned int v54 = -0x4e030ef4 + v49 + (-0x4cf50fa4 | ~v49);
  unsigned int v55 = -0x7eac89ca ^ -0x6507e168 + v54 & 0x66b83c7 + v53;
  unsigned int v56 = (-0x2bf06481 * v317[v259 & 0x3f] + 0x7dbb7ad0) / 5u + 0x8087b19;
  unsigned int v57 = 0x7a93c2b6 + (-0x317fcc7f ^ 0x8087b19 - v56 + (-0x1537637 ^ v55));
  unsigned int v58 = 0xd0e8a5f + (-0x317fcc7f ^ 0x56c3d4a + v57);
  v318[19] = -0x1c228387 + (-0x3de821fb ^ 0xd0e8a5f - v58 + (-0x3de821fb ^ 0x1c228387 + v318[19]));
  int v264 = -0x519f5e2f * v265 - 0xe0cbcd;
  SET_LOBYTE(v54, v317[(-47 * v265 + 51) & 0x3f] * (-96 - v317[(-47 * v265 + 51) & 0x3f]) - 1);
  SET_LOBYTE(v58, 256 - 59 * (6 ^ v54));
  uint32_t v59 = v316[(13 * (uint8_t)v58 - 7 - ((26 * (uint8_t)v58) & 0xf2)) & 0x3f];
  unsigned int v279 = 0x63dd7c78 - (-0x3de821fb ^ 0x1bb75205 - 0x35d1732d * v59);
  int v60 = read316(v316[idx64(LOBYTE(v315[27]))]) + 0x6448adfb;
  v318[21] = 0x2c03a6ea - v318[21] - v60 - 2 * (-0x1c228388 - v318[21] | -0xd189 ^ 0x3ace0000 + (0xd188 ^ -0x1f16adfb + v60));
  SET_LOBYTE(v52, 2 * (-48 * (LOBYTE(v317[41]) + v290) - v290 * LOBYTE(v317[41]) - 1));
  SET_LOBYTE(v58, -48 * (LOBYTE(v317[41]) + v290) - v290 * LOBYTE(v317[41]) - 1 - (v52 & 0x42));
  SET_LOBYTE(v60, 31 & ~(127 - (94 ^ 33 + v58)));
  SET_LOBYTE(v34, -48 * (LOBYTE(v317[41]) + v290) - v290 * LOBYTE(v317[41]) - 1 - (v52 & 0x9e));
  int v273 = -923132121 - 185571887 * (1u << (31 & v60));
  SET_LOBYTE(v60, 31 & 128 + (106 ^ -22 + 2 * (5 & 32 - (31 & ~(-v34))) - (31 & 32 - (31 & ~(-v34)))));
  unsigned int v61 = ~(0xffffffff >> (v60 & 31)) + (0x98b99bd8 >> (v60 & 31));
  v317[10] = 0x628cb593 * v315[73] + 0x10a7e50b;
  int v252 = v317[10];
  SET_LOBYTE(v60, (((2 * LOBYTE(v318[60]) + 14) & 0xa) - (LOBYTE(v318[60]) - 116)) & 0x1f);
  int v62 = 0x2bf06481 * v317[idx64(LOBYTE(v315[98]))];
  unsigned int v63 = (((unsigned int)(v62 - 0x7dbb7ad1) >> (v60 & 31)) + ~(0xffffffff >> (v60 & 31)) - 0x74060000) ^ 0x3056;
  SET_LOBYTE(v60, xform_v318(LOBYTE(v318[60])));
  int v64 = (((((v62 - 2109438672) << ((((v60 & 0x1F) + 12 - ((2 * v60) & 0x18)) ^ 0xC) & 31)) - 1946550273) ^ 0x3056) + 1946550272) ^ (v63 + 1946550272) ^ 0x72272ACA;
  v318[20] = 0x47baf8f0 - v318[20] - 2 * (-0x1c228388 - v318[20] | -0x27f0 ^ -0x15e00000 + (0x27ef ^ 0x15dfffff - (0xdd8d535 ^ v64))) + (0xdd8d535 ^ v64);
  unsigned int v65 = 0x363f4c3f - (0x4217de05 & read317(v317[56])) - 2 * (-0xbd891c5 | 0x2109004 & ~(0x244852f + 0x2bf06481 * v317[56])) ^ 0x676ca7e5 - 2 * (-0x1893581a | ~(0x244852f + 0x2bf06481 * v317[56]) & 0x1c228387 + v318[41]) + (~(read317(v317[56])) & -0x63dd7c79 + v318[41]);
  int8_t v258 = 69 + 137 * v273 + v61 - 2 * (v61 & 32 + 9 * v273);
  unsigned int v66 = ((-0x2bf06481 * v317[56] + 0x7dbb7ad0) | (-0x35d1732d * v316[v258 & 0x3f] - 0x6448adfb)) ^ 0xd076d46c;
  unsigned int v67 = -0x39fe0000 + (0x83c8 ^ 0x39fdffff - (-0x6cb43623 ^ v65));
  unsigned int v68 = v66 & 0x83c8 ^ v66 & v67 ^ v67 & 0xd076d46c ^ 0xbd5bded4;
  v318[49] = ((((v68 + 0x42a4a163 - ((2 * v68) & 0x854942c6)) >> 1) + 0x3ca26ebc - v279 + ((2 * v279 + 0x3845070e) | 0x842fbc0a) - ((v68 + 0x42a4a163 - ((2 * v68) & 0x854942c6)) & 0x1adcd048) - ((2 * (((v68 + 0x42a4a163 - ((2 * v68) & 0x854942c6)) >> 1) - ((v68 + 0x42a4a163 - ((2 * v68) & 0x854942c6)) & 0x1adcd048)) + 0x1adcd048) & 0x1adcd048)) ^ 0x4217de05) + 0x63dd7c79;
  uint32_t v69 = v316[idx64(LOBYTE(v315[10]))];
  int v70 = -0x7c2cc4d + (0x369466f ^ -0x22dbd825 + v69 * (-0x240fc5e4 + 0x1ab48a17 * v69));
  unsigned int v71 = -0x6b78d406 * (-0x3694670 ^ 0x7c2cc4d + v70) + v69 * (0x80000000 - 0x217f3dd3 * (-0x3694670 ^ 0x7c2cc4d + v70));
  unsigned int v72 = 0x7fffffff - (-0x394ed5b2 ^ 0x1c228387 + v318[39]);
  unsigned int v73 = 0x7fffffff - (0x18e76093 ^ -0x630eaff * v71) & (-0x7b590bb5 ^ v72);
  int v74 = 0x5fdf3876 - v72 - v73 - (0x67189f6c | v72) - 2 * (-0x1fff66f8 | ~v72) + 2 * (v73 | -0x18c60004 + v72 - (-0x18e76094 & v72) - (-0x1fff66f8 ^ v72));
  unsigned int v75 = (-0x339f2bd ^ v74) & (-0x647011ed ^ 0x596e2234 - (0x4217de05 & read317(v317[37])) - 2 * (0x17564430 | -0x3ffe65fb & ~(0x244852f + 0x2bf06481 * v317[37])) ^ 0x6b3f78bb - 2 * (-0x14c08744 | ~(0x244852f + 0x2bf06481 * v317[37]) & 0x1c228387 + v318[39]) + (~(read317(v317[37])) & -0x63dd7c79 + v318[39]));
  int v76 = -0x3038925f + 0x388bf7f5 * (v75 ^ -v74 + (0x18192d60 & v74) + (0x18000d40 ^ v74));
  int v77 = -0x35d1732d * v316[idx64(LOBYTE(v315[43]))];
  v317[24] = -0x44072d30 - 0x5863db81 * (0x244852f + 0x2bf06481 * v317[24] ^ 0x28b7f083 + 0x2873bc5d * v76);
  SET_LOBYTE(v77, 194 ^ 34 - 2 * (168 | 123 & ~(5 + v77)) - (123 & 5 + v77) ^ -38 - 2 * (217 | 2 & ~(5 + v77)) - (2 & 5 + v77));
  SET_LOBYTE(v77, 37 * ((v77 | 0x7d) + (v77 & 0x4c) + (~(uint8_t)v77 & 0xb3)) + 119);
  int8_t v257 = 32 + 79 * v77 + 214 * (22 | -25 - 45 * v77);
  SET_LOBYTE(v76, 45 * LOBYTE(v316[idx64(LOBYTE(v315[31]))]) - 6);
  SET_LOBYTE(v77, 2 * v76);
  SET_LOBYTE(v76, 31 & v76);
  SET_LOBYTE(v75, 128 + (49 ^ -51 - v76 + v77 - (28 | v77)));
  unsigned int v78 = 0x7afcb137 * (((0x519f5e2f * v265 + 0xe0cbcc) >> (v75 & 31)) + ~(0xffffffff >> (v75 & 31)));
  int v79 = 663825449 * ((1369398831 * v265 + 14732237) << (((((32 - v76) & 0x1F) - 2 * ((32 - v76) & 0x1B) - 37) ^ 0xDB) & 31)) - 1376933510;
  unsigned int v80 = v318[idx64(LOBYTE(v315[50]))];
  unsigned int v81 = -0xf4cbf9a ^ -0x30c4d711 - 2 * (-0x1c459e8a | -0x147f3887 & 0x1c228387 + v80) + (0x147f3886 | -0x63dd7c79 + v80);
  unsigned int v82 = -0x424f35b8 - 0x5a8cbb0f * (-0x5109e712 ^ v81);
  unsigned int v83 = 0x34bd303c + 0x4c8dd1a7 * (-0x147f3887 | -0x6cf59316 + 0x4f942b79 * v78 + 0x86ccfe7 * v79 + 2 * (0x306bd487 * v78 & -0x130a6ceb - 0x86ccfe7 * v79));
  int v84 = 0x2e01163 - (0x68b9cec7 - 0x3f6f2c11 * v82 & -0x65d9bd64 - 0x229239e9 * v83);
  v317[13] = -0x6ba351af + 0x5863db81 * (0x244852f + 0x2bf06481 * v317[13] ^ -0x2e01164 + v84);
  int v85 = -0x35d1732d * v316[(-51 * v255 - 99) & 0x3f] - 0x6448adfb;
  unsigned int v86 = -0x2c4e07cc - 2 * (-0x2c4e07cb | ~v85 & 0x1c228387 + v318[58]) + (~v85 & -0x63dd7c79 + v318[58]) ^ 0x1048fd5b - v85 - 2 * (-0x31cee0a8 | 0x6c005 & ~v85) - (0x4217de05 | ~v85);
  int v87 = -0x45520000 + (0xf9ec ^ 0x4551ffff - (0x1d80e76d ^ v86));
  unsigned int v88 = v87 & 0xcddc11aa ^ v87 & (-0x3226a250 - ((v318[58] - 0x63dd7c79) & 0x908d4d25) + 2 * ((v318[58] - 0x63dd7c79) & 0x80894d25 | 0x3226a250)) ^ (0x5db0 - ((LOWORD(v318[58]) - 0x7c79) & 0x4d25) + 2 * ((LOWORD(v318[58]) - 0x7c79) & 0x4d25 | 0xa250)) & 0xf9ec ^ 0x388842ff;
  unsigned int v89 = -2 * (0x10005041 & v88) + (-0x6cefaf9f & v88);
  unsigned int v90 = (0x38885357 ^ v88) & (-0x23e78830 ^ -0x74ca8972 - v85 - 2 * (-0x1056ed0e | 0x1004610c & ~v85) - (0x1b8c639e | ~v85) ^ 0x6a5ff975 - v85 - 2 * (-0x20a13544 | 0x12403 & ~v85) - (-0x74fed145 | ~v85));
  int v91 = ~(v90 ^ -0x10005042 - v89);
  unsigned int v92 = 0x7605107c - 2 * (-0x9faef83 | ~v91 & 0x1c228387 + v318[35]) + (~v91 & -0x63dd7c79 + v318[35]) ^ -0x25f4748 - v91 - 2 * (0x3b88dab5 | -0x3fe8fc00 & ~v91) - (0x4217de05 | ~v91);
  int v93 = -0x1e72e02b - 0x238331ad * (-0x32723538 ^ v92);
  unsigned int v94 = 0x3313627b * ~(0x203c1bbd ^ -0x1c228388 - v318[35]);
  unsigned int v95 = ~(0x3de821fa ^ 0x1c228387 + v318[29]) | ~(0x1dd43a47 ^ -0x2b00d34d * v94);
  unsigned int v96 = v95 ^ 0x5356336b;
  int v97 = 0x393f5a25 * v93 - 0x79017bca;
  unsigned int v98 = -0x693a2ac4 - 0x393f5a25 * v93 - v95 + (-0x5356336c | v95) + (0x5356336b | v95 | v97);
  unsigned int v99 = -0x16dc1d59 + v98 - 2 * (-0x2fcefe1d & -0x1dc45972 + v98 + (-0x2ca9cc95 & v96 & v97)) + (0x5356336b & v96 & v97);
  v318[28] = 0x63dd7c79 + (0x4217de05 ^ -(-0x2fcefe1d ^ -0x36b73a36 + v99) + (-0x3de821fb ^ 0x1c228387 + v318[28]));
  int v100 = read317(v317[idx64(LOBYTE(v315[106]))]);
  unsigned int v101 = -2 * (0x30300022 & (0x126ecc7a ^ (v100 | v284))) + (-0x4bc4f3d2 & (0x126ecc7a ^ (v100 | v284)));
  unsigned int v102 = -0xb8732e0 - (-0x2fa7ff00 | 0x2420cc20 & v100) + (0x88200c4 | 0x305321b & v100);
  unsigned int v103 = 0x32b48223 + v101 - ((-0x4bc4f3d2 ^ (-0x2725fe3c | v284)) & (v100 | v284)) + 2 * (-0x32b48223 - v101 | (0x343b0c2e ^ (-0x2725fe3c | v284)) & (v100 | v284)) & (-0xb8732e0 ^ v102);
  v317[23] = v317[23] - 0x5863db81 * (v103 ^ -v102 + (-0x229e8e09 & v102) + (-0x2b9fbee0 ^ v102));
  unsigned int v104 = 0x1a164566 - 2 * (-0xc43d1cb & 0x1a164566 + v315[118] * (0x1ebd03e - 0x433e369 * v315[118])) + v315[118] * (-0x7e142fc2 + 0x7bcc1c97 * v315[118]);
  int v105 = -0x1f2d7a70 - 0x4bd064ef * (0xc43d1ca ^ -0xc43d1cb + v104);
  v317[24] = -0x44072d30 - 0x5863db81 * (0x3d5e8c8f + 0x2a334a0f * v105 ^ 0x244852f + 0x2bf06481 * v317[24]);
  unsigned int v106 = 0x6357b2b9 + 2 * (-0x1fe555ed ^ 0xfa73bba + 0xaa4eb13 * v315[108]);
  int v285 = read317(v317[54]);
  int v107 = -0x38793d0b * v317[41] * v317[41] - 0x7dc36110 * v317[41] - 0x1524887c - 0x7dc36110 * v317[41];
  unsigned int v108 = 0x31eb2df5 ^ -0x4397db0a - 2 * (0x3c6824f7 | ~v285 & 0x1ca84d47 + v106) + (~v285 & -0x6357b2b9 + v106) ^ -0x5fe8832c - v285 - 2 * (-0x1fb32f02 | 0x1f822b00 & ~v285) - (0x3fcaabd8 | ~v285);
  unsigned int v109 = -0x5d84dceb ^ (v285 | 0x4f055e3f + 0x7d08bc0c * v317[41] + v107 * (-0x6337fd90 + 0x499520dd * v317[41]));
  int v110 = -0x3fe87489 * v317[41] * v317[41] - 0x6bd0eeb0 * v317[41] + 0x76dea124 - 0x6bd0eeb0 * v317[41];
  unsigned int v286 = -0x43584f14 & 0x2104d4bf + 0x32123604 * v317[41] + v110 * (-0x7da29fb0 - 0x38e36339 * v317[41]);
  unsigned int v111 = -0x96fcd73 + (~(0x2104d4bf + 0x32123604 * v317[41] + v110 * (-0x7da29fb0 - 0x38e36339 * v317[41])) & 0x7ffffffe - 2 * (-0x1e53d877 ^ -0xfa73bbb - 0xaa4eb13 * v315[108]));
  unsigned int v112 = ~(-0x2c92d899 ^ 0x7fffffff - (0x39d35f01 ^ 0x3ca7b0ec - v286) ^ 0x96fcd73 + v111);
  unsigned int v113 = v112 ^ 0xce03a165;
  unsigned int v114 = ~(v109 & v108 ^ v108 & 0xa27b2315 ^ v109 & 0x12302603 ^ 0xc2bf61c1) & (v112 ^ 0x15418799);
  unsigned int v115 = -v114 - 2 * (0x1b40243c & v113) + (0x3f70bc3f & v113);
  unsigned int v116 = -0x5c3e0e26 + (-0x1aafe9c1 ^ 0x1b40243b + v115 - 2 * (~v114 & -v113 + (0x3f70bc3f & v113) + (0x1b40243c ^ v113)));
  unsigned int v287 = -0x1aafe9c1 ^ -0x1c228388 - v318[35] ^ 0x23c1f1d9 - v116;
  unsigned int v274 = v287 + 0x63dd7c79;
  v318[35] = v287 + 0x63dd7c79;
  unsigned int v117 = (((0x2bf06481 * v317[idx64(LOBYTE(v315[39]))] - 0x5d0d7ad1) ^ 0x5654) - 0x20ae0000) ^ (((0x2bf06481 * v317[37] - 0x5d0d7ad1) ^ 0x5654) - 0x20ae0000) ^ 0xbe86d0b3;
  unsigned int v118 = -2 * (-0x7ffd3bc & (-0x38dd3bb ^ (v264 | 0x18d1aa22 - 0x35d1732d * v316[29]))) + (-0x47ec01a & (0x7c722c45 ^ (v264 | -0x672e55de - 0x35d1732d * v316[29])));
  unsigned int v119 = (-0x1fc49cfa ^ -0x4bf9bc63 - (-0x41792f4d & 0xe0cbcc + 0x519f5e2f * v265) - 2 * (-0xa808d15 | 0xa808010 & ~(0xe0cbcc - 0x2e60a1d1 * v265)) ^ 0x113ad1f3 - 2 * (0x113ad1f4 | v117 & ~(0xe0cbcc - 0x2e60a1d1 * v265)) + (v117 & ~(0xe0cbcc + 0x519f5e2f * v265))) & (v264 | -0x672e55de - 0x35d1732d * v316[29]);
  int v120 = 0x394e8e41 - 0x295fdfcd * (v119 ^ 0x7ffd3bb - v118);
  v315[34] = 0x39866647 + 0x6e5e68e5 * (0xfa73bba + 0xaa4eb13 * v315[34] ^ 0x7ffd3ba + 0x14e82505 * v120);
  unsigned int v121 = 0x255d0ec - 2 * (-0x17c0747a & 0x1a164566 + v315[78] * (0x1ebd03e - 0x433e369 * v315[78])) + v315[78] * (-0x7e142fc2 + 0x7bcc1c97 * v315[78]);
  unsigned int v122 = 0x7fffffff - (-0x8f20d75 ^ 0x244852f + 0x2bf06481 * v317[40]) & (0x17c07479 ^ v121);
  int v123 = -0x2f40cb9e - (v122 ^ -0x320d4284 + v121 - (0x320034 ^ v121) - (0x8f20d74 & v121));
  unsigned int v124 = (read317(v317[40])) | read317(v317[idx64(LOBYTE(v315[35]))]);
  unsigned int v125 = (~v124 & (-0x32ff46c8 | 0x2f40cb9d + v123)) + (0x32ff46c7 & -0x2f40cb9e - v123);
  v317[42] = -0x6ba351af + 0x5863db81 * (0x244852f + 0x2bf06481 * v317[42] ^ v125 + (-0x32ff46c8 & v124 & 0x2f40cb9d + v123));
  unsigned int v126 = v318[idx64(LOBYTE(v315[39]))];
  unsigned int v127 = 0x3d076958 ^ -0x7605cea2 - (-0x3de821fb ^ 0x1c228387 + v126);
  unsigned int v128 = -0x76214a0d + (-0x2c7b2dd2 ^ 3 * (0x3d076958 ^ v127));
  v315[49] += 0x11a1971b * (v128 - ((2 * v128 - 0x13bd6be6) & 0xa709a45c)) + 0x6b46c739;
  v318[48] = -0x1c228388 - (0x17d8b138 ^ 0x1652895 - v304);
  v317[62] = -0x5863db81 * read318(v318[v258 & 0x3f]) + 0x2b7c4d71 - v317[idx64(LOBYTE(v315[93]))];
  unsigned int v129 = (-0x2bf06481 * v317[idx64(LOBYTE(v315[112]))] + 0x7dbb7ad0) / 3u;
  int v245 = v318[55];
  unsigned int v130 = 2 * (-0x3de821fb & 0x1c228387 + v318[55]);
  int v131 = read318_off(v318[60]) / 3;
  v318[55] = 0x438b3ce8 + v129 + v130 - v131 - v245 + 2 * (-0x3de821fb | -0x21c59e74 - v129 - v130 + v131 + v245);
  SET_LOBYTE(v131, 80 - -45 * LOBYTE(v316[60]));
  int8_t v132 = ~(-36 - 67 * v257) & (63 ^ v131);
  int v133 = -67 * v257 - 36;
  SET_LOBYTE(v131, 201 ^ (87 ^ (150 | v133)) & (154 ^ ~(105 & (22 ^ v131))) ^ 154 & (87 ^ (150 | v133)) ^ (4 | 65 & ~v131));
  int8_t v134 = ~(3 ^ v132 ^ 16 - v133 - 2 * (17 | 46 & ~v133) + (63 | v133)) & (219 ^ v131);
  int8_t v306 = -20 + (v134 ^ 255 + v131 - (201 ^ v131) - (237 & v131));
  v317[55] += 0x4043378a;
  unsigned int v135 = v318[idx64(LOBYTE(v315[68]))];
  SET_LOBYTE(v277, -182 + (125 ^ 20 + v306));
  v315[77] = v315[77] + 0x7682cf5e - 0x5bac4f41 * v316[((unsigned int)(-0x2bf06481 * v290 + 0x7dbb7ad0) >> 1) & 0x3f];
  v317[29] = -0x5863db81 * (read318_off(v135) / 0xf) - 0x44072d30;
  uint32_t v307 = v316[(45 * LOBYTE(v316[(45 * LOBYTE(v316[37]) - 6) & 0x3f]) - 6) & 0x3f];
  int v248 = v317[46] - 0x4e7988ad * v307 - 0x4586647b;
  int v247 = -0x5863db81 + 0x4f3848fe * (0x244852f + 0x2bf06481 * v317[46] | 0x1bb75205 - 0x35d1732d * v307);
  int v136 = read317(v317[59]);
  int v137 = read316(v316[29]);
  unsigned int v138 = v136 | ~((0x35d1732d * v316[60] + 0x6448adfa) / 5u);
  unsigned int v139 = -0x29b35636 + 0x12c07e19 * (v138 & (0x41c18798 & v136 | -0x41c18799 & v136 | v136 ^ v137));
  unsigned int v305 = -0x105d98b7 - -0x55b3bb09 * (-0x3667fe29 * v139 - (~((0x35d1732d * v316[60] + 0x6448adfa) / 5u) | v137) + (~((0x35d1732d * v316[60] + 0x6448adfa) / 5u) | v137 | (0x3667fe29 * v139 - 0x4f039d5a)));
  int v272 = -0x35d1732d * v316[idx64(LOBYTE(v315[16]))] - 0x6448adfb;
  unsigned int v140 = (0x36276fb4 ^ 0x36276fb4 - (0x26276414 | 0x10000ba0 & v272) + (-0x7f2ffffe | 0x49089049 & v272)) & (0x1711ad9a ^ -0x33a65789 - (-0x3363890b & read317(v290)) - 2 * (-0x42ce7d | 0x4674 & ~(0x244852f + 0x2bf06481 * v290)) ^ -0x420fcfb4 - (-0x6a6b12e4 & read317(v290)) - 2 * (0x285b4331 | 0x1584ac0c & ~(0x244852f + 0x2bf06481 * v290)));
  SET_LOBYTE(v137, 2 * (148 & -76 - (20 | 160 & v272) + (2 | 73 & v272)) - (215 & -76 - (20 | 160 & v272) + (2 | 73 & v272)));
  int8_t v141 = (-45 * LOBYTE(v316[idx64(LOBYTE(v315[16]))]) + 5) | (-127 * v290 + 47);
  SET_LOBYTE(v130, -206 - (v140 ^ 107 + v137));
  int32_t t60 = read316(v316[60]);
  int v142 = 0x6c2d7728 - t60 - 2 * (-0x14abf206 | 0x896000 & ~t60) - (0xd96930 | ~t60) ^ -0x76b21513 - t60 - 2 * (-0x38d26058 | 0x4047 & ~t60) - (0x42204b47 | ~t60);
  int8_t v313 = ((41 - ((-45 * LOBYTE(v316[60]) + 5) & 0x30) + 12) ^ (-((-45 * LOBYTE(v316[60]) + 5) & 0x47) - 18 - 2 * (~(-45 * LOBYTE(v316[60]) + 5) & 0x47 | 0xa8)) ^ 0xad) & (((((v130 + v141 - 51 - (v141 | (v130 - 51))) ^ 0x9e) + 96 - ((2 * ((v130 + v141 - 51 - (v141 | (v130 - 51))) ^ 0x9e)) | 0xc2)) | 0x77) ^ 0x1d);
  int8_t v244 = 2 * (24 & (181 ^ v142)) - (29 & (181 ^ v142));
  int8_t v254 = -13 + (60 ^ -4 + (v313 ^ -25 + v244));
  int v143 = read316(v316[62]);
  unsigned int v144 = -0x38878d8f + 0x3319a0ce * v143 - 0x198cd067 * (0x10200145 ^ v143) - 0x198cd067 * (-0x3072a348 | v143) - 0x198cd067 * (-0x10200146 | v143);
  v315[10] = -0x7741d715 + 0x11a1971b * (0x562001d5 | 0x7a28ff52 + 0x34d14b57 * v144);
  int v145 = -0x40dabbc7 - (-0x2accf03 ^ 0x244852f + 0x2bf06481 * v317[52]);
  unsigned int v291 = 0x6f72b2da | read317(v317[52]);
  unsigned int v146 = (((v291 + 0x60c70000) ^ 0xd6ce) - 0x60c70000) & ((v145 - ((v145 + 0x40dabbc6) & 0xa6784bdf) - 0x7591c136 - 2 * ((v145 - ((v145 + 0x40dabbc6) & 0xa6784bdf) + 0x40dabbc6) | 0x49938305)) ^ 0xba4de0db) ^ ((uint16_t)(v145 - ((v145 - 0x443a) & 0x4bdf) + 0x3eca - 2 * ((v145 - ((v145 - 0x443a) & 0x4bdf) - 0x443a) | 0x8305)) ^ 0xe0db) & 0xd6ce ^ (((v291 + 0x60c70000) ^ 0xd6ce) - 0x60c70000) & 0xf35ae7de ^ 0x61c0dc9;
  unsigned int v147 = 0x206fd1e7 - (0x3a51ffe4 & -0x405064d6 - 0x32c84339 * v305 + 0x755b14ed * v315[48] + 2 * (0xfa73bba + 0xaa4eb13 * v315[48] & 0x30a9291b + 0x32c84339 * v305));
  unsigned int v148 = -0x6accede9 - v146 + 2 * (0x88ceda0 | v146) - (-0x7351004e | v146) - (-0x265fff48 ^ -0x22437d43 & v146) + 2 * (-0x11110005 + v146 - (0x88ceda0 ^ v146) - (0xcaeffb2 & v146) | -0x265fff48 ^ -0x22437d43 & v146);
  unsigned int v149 = 0x7fffffff - (0x1b473513 ^ 0x19e22dfd + v147) ^ -0x31219538 - (0x6b4382eb & -0x405064d6 - 0x32c84339 * v305 + 0x755b14ed * v315[48] + 2 * (0xfa73bba + 0xaa4eb13 * v315[48] & 0x30a9291b + 0x32c84339 * v305)) - 2 * (-0x1c651822 | 0x8410021 & (0xfa73bba + 0xaa4eb13 * v315[48] ^ 0x30a9291b + 0x32c84339 * v305));
  unsigned int v150 = -0x71360000 + (0x2bb5 ^ 0x7135ffff - (-0x7222d33 ^ v149));
  unsigned int v151 = v150 & 0x913fd914 ^ v150 & v148 ^ v148 & 0x2bb5 ^ 0xedf82796;
  unsigned int v152 = -2 * (0xc448408 & (0xc5e84a8 ^ v291)) + (0x1e65cf5e & (-0x73a17b58 ^ v291));
  unsigned int v153 = v291 & (0x1e65cf5e ^ (-0x5987b421 | 0x7dbb7ad0 - 0x2bf06481 * v317[52]));
  int v154 = ~(v153 ^ -0xc448409 - v152);
  unsigned int v155 = ~v154 & (0x78b3f5e4 ^ 0x1a1e0000 + (0x8502 ^ 0x168b291b + 0x32c84339 * v305) ^ 0x1a1e0000 + (0x8502 ^ -0xa76c446 - 0x755b14ed * v315[48]));
  unsigned int v156 = -0x20323f39 + v155 - 2 * (-0x20323f38 | v155);
  unsigned int v157 = 0x3725d414 - v154 - 2 * (0x3e71de32 | -0x74c0a1c & ~v154) - (0x78b3f5e4 | ~v154);
  int v158 = -0x2e53c51f - 0x464742b3 * (0x61bc1efa ^ v156 ^ v157);
  unsigned int v159 = -0x1207d17e & v151 | ~(-0x3d08061c + 0x23db3c7b * v158) & (-0x1207d17e | v151);
  unsigned int v160 = 0x6eba9935 * (0x3e121f2d ^ v159 + (0x1207d17d & ~v151));
  v315[8] += 0x23736f1 * v160 + 0x11a1971b * ((0x1427623a * v160) & 0x7c243e5a) + 0x2b662b41;
  v317[20] = v317[20] - 0x4e7988ad * v316[idx64(LOBYTE(v315[1]))] + 0x12dd7706;
  SET_LOBYTE(v151, -149 + v305 * (880 + v305 * (-92 - 35 * v305)));
  SET_LOBYTE(v160, -78 - 121 * v151 + 90 * (70 & -3 * v151));
  SET_LOBYTE(v151, -71 + 91 * v160 - 2 * (57 & -37 * v160));
  SET_LOBYTE(v160, 211 + v305 * (-528 + v305 * (-124 + 53 * v305)));
  SET_LOBYTE(v158, -74 - v151 - (31 | v151) + 2 * (9 | v151));
  SET_LOBYTE(v156, 37 + (59 ^ -27 * v160));
  SET_LOBYTE(v156, 32 - (31 & -128 + (68 ^ -37 + v156)));
  unsigned int v161 = ((((0xc7ad237u >> ((v158 ^ 0xa9) & 31)) + ~(0xffffffff >> ((v158 ^ 0xa9) & 31)) - 0x2a430000) ^ 0x8bae) + 0x2a430000) ^ ((((0xc7ad238 << ((((v156 & 0x1f) + 113 - ((2 * v156) & 2)) ^ 0x71) & 31)) - 0x2a430001) ^ 0x8bae) + 0x2a430000) ^ 0xbfbea390;
  v315[32] = 0x80000000 + v315[32] + 0x11a1971b * (0x3fbea390 ^ v161);
  int8_t t = xform_v318(LOBYTE(v318[41]));
  SET_LOBYTE(v156, 84 ^ 64 - t + (31 & t) + (20 ^ t));
  unsigned int v292 = 0x65d6417d * (~(0xffffffff >> (v156 & 31)) + (0x46ef99f4u >> (v156 & 31))) + 0x15ed5520;
  int v162 = 0x3c81bd23 * (0x46ef99f5 << ((((2 * LOBYTE(v318[41]) + 14) & 0xa) - (LOBYTE(v318[41]) - 116)) & 0x1f)) - 0xef67924;
  unsigned int v163 = -0x2e099853 * ~(-0x1523dd1f ^ -0x1c228388 - v274);
  unsigned int v164 = ~(-0x28cbfce5 ^ -0x14606bdb * v163);
  unsigned int v165 = 0x6d721258 - (0x2d221200 | 0x40500058 & v164) + (0x1289e487 | -0x7ffbf6e0 & v164);
  unsigned int v166 = -0xef753eb + v287 - 2 * (-0xef753eb | 0xe2151e8 & v287) + (0x4f2159fc | ~v287);
  unsigned int v167 = ~(v166 & v165 ^ v165 & 0xb309f411 ^ v166 & 0x6d721258 ^ 0x7e4ce04e);
  unsigned int v168 = 0x1f7b0000 + (0x5ea7 ^ 0x5b9d4514 - 0xbb05a8b * v162 - 0x7780ffd5 * v292 + 2 * (-0x1642b3a0 - 0x87f002b * v292 & 0x1b2a6e8b + 0xbb05a8b * v162));
  unsigned int v169 = v167 & 0x5ea7 ^ v168 & 0xa0b30fa1 ^ 0x9fbdde36;
  unsigned int v170 = -2 * (-0x1fbdd098 & (v169 ^ v167 & v168)) + (v169 ^ v167 & v168);
  unsigned int v171 = -0x4460713f + (-0x41b383d ^ -0x1fbdd098 + v170);
  v317[4] = v317[4] + 0x5863db81 * (-0x41b383d ^ -0x3b9f8ec1 + v171);
  unsigned int v172 = v318[idx64(LOBYTE(v315[93]))];
  v318[30] = -0x1d75351b;
  SET_LOBYTE(v172, -12 + (5 ^ 7 + v172));
  unsigned int v173 = (0x755b14ed * v260 - 0xfa73bbb) / 3u;
  unsigned int v174 = 0x29ea41c9 * (-0x2c534379 ^ v173);
  unsigned int v175 = 0x44f00fdb * ((-0x11c3a879 * v174 + ((0x238750f2 * v174) & 0xa759790e) + 0x2c534379) << (((((-19 * LOBYTE(v315[22]) + v172 - 47) & 0x1f) + 12 - ((2 * (-19 * LOBYTE(v315[22]) + v172 - 47)) & 0x18)) ^ 0xc) & 31)) - 0x17b37bab;
  SET_LOBYTE(v174, 31 & (99 ^ 99 + 2 * (12 & 32 - (31 & -47 + v172 + v249)) - (31 & 32 - (31 & -47 + v172 + v249))));
  unsigned int v176 = 0x47cc8be3 * ((~v173 >> (v174 & 31)) + ~(0xffffffff >> (v174 & 31)));
  int v261 = -0x58f4f0c0 + 0x69fb7ed3 * v175 - 0x37dc5fb5 * v176 + 0x4f3848fe * (0x23e111cb * v176 | 0xccc3470 - 0x3eaabad * v175);
  v317[60] = v261;
  int v177 = -0x35d1732d * v316[idx64(LOBYTE(v315[122]))] + 0x489b075;
  v318[10] = -0x1c228388 - (0x3de821fa ^ v177);
  uint32_t v270 = v316[idx64(LOBYTE(v315[35]))];
  int v308 = -0x35d1732d * v270 - 0x6448adfb;
  int v178 = read317(v317[8]);
  unsigned int v280 = -0x79114337 + v178 + (-0xc2c6f99 | ~v178);
  int32_t t41 = read316(v316[41]);
  unsigned int v179 = v308 & t41;
  unsigned int v180 = -0x7e081462 + ((0x17eb6bf5 | v178 | v179) & (-0x17eb6bf6 | v178 | v179));
  int v293 = -0x7ac24d30 + v280 & 0x7e081462 + v180;
  int v309 = 0x20569de9 * (-0x35e8cca5 * (v316[41] + v270) - 0x76f80a59 * (v308 | read316(v316[41]))) - 0x56b2825c;
  unsigned int v181 = v293 & -0x5620c444 + 2 * (-0x29df3bbd & (0xc2c6f98 | 0xe212666 + v309)) - (-0x5620c444 ^ (0xc2c6f98 | -0x71ded99a + v309));
  int v182 = 0x60e7ce74 + 0x655c29cd * v181 + 0x3547ac66 * (-0x20a47bbb | v181);
  v317[46] = v247 + v248 + 0x279c247f * (-0x20a47bbb ^ 0x3224eb05 * v182);
  uint32_t v183 = v316[idx64(LOBYTE(v315[98]))];
  SET_LOBYTE(v174, 45 - 125 * v183 - 34 * (217 | -5 * ~(-9 * v183)));
  int v314 = -0x35d1732d * v316[idx64(LOBYTE(v315[67]))] - 0x6448adfb;
  int8_t v266 = -708 + 0xa27 * v174 - 46 * (38 & -15 * v174) - 46 * (199 & 128 * v174 + (38 ^ -15 * v174) + (255 ^ v267 & v314)) + 23 * (200 ^ v267 & v314) - 46 * (55 & (200 ^ v267 & v314));
  unsigned int v184 = (unsigned int)(-0x2bf06481 * v317[idx64(LOBYTE(v315[38]))] + 0x7dbb7ad0) >> 1;
  unsigned int v185 = v184 * v184;
  unsigned int v186 = -0x7e219114 + (-0x24e1697d ^ v184 * v185);
  v317[17] = -0x44072d30 - 0x5863db81 * (-0x24e1697d ^ -0x1de6eec + v186 ^ -0x2448530 - 0x2bf06481 * v317[17]);
  v317[44] = v251 - 0x4e7988ad * v316[62] + 0x12dd7706;
  unsigned int v187 = 63 & 35 + 67 * v257;
  int8_t v256 = 67 * v257 + 35;
  uint32_t v26_r = read318(v318[26]);
  int32_t v316_t = -0x35d1732d * v316[v187];
  v318[26] = ((2 * (v26_r + 0x79f1b392 + v316_t)) | 0x842fbc0a) - v316_t - v26_r - 0x582c151e;
  unsigned int v310 = v318[v187];
  unsigned int v188 = -0x6a95f0fa ^ -0x1b6bc0fb - 2 * (0x33557da8 | 0x313ec15d & 0x1c228387 + v310) + (-0x313ec15e | -0x63dd7c79 + v310);
  unsigned int v189 = ~(-0x2629b2ac ^ v188);
  unsigned int v190 = (0x4217de05 ^ -0x63dd7c79 + v318[34]) & (-0x50319800 ^ v189 & (0x313ec15d | read317(v261)));
  int v294 = -0x35d1732d * v316[idx64(LOBYTE(v315[79]))] - 0x6448adfb;
  unsigned int v191 = 0x746ed03d - (0x40444014 | 0x342a9029 & v294) + (-0x7cfed07e | 0x8900040 & v294);
  unsigned int v192 = 0x2ad1e22c + v191 - 2 * (0x20209011 | v191) - 2 * (~(-v191 + (0x21319613 & v191) + (0x20209011 ^ v191)) | -0x2d11867c & (-0xb912fc3 ^ v191)) + (-0x2d11867c & (0x746ed03d ^ v191)) + (0x21319613 | v191);
  unsigned int v193 = -0x7b04422d + v192 - (-0x4f2159fd | ~v294 & -0x2be2e830 + v192);
  unsigned int v194 = 0x45c038eb - 2 * (-0x3a3fc714 | ~v193 & 0x1c228387 + v318[34]) + (~v193 & -0x63dd7c79 + v318[34]) ^ -0x1b40abbc - v193 - 2 * (0x22a77641 | -0x3fef77fc & ~v193) - (0x4217de05 | ~v193);
  int v195 = 0x3fee69fa - (-0x2fce6801 & 0x1c228387 + v318[34]) + (0x503197ff & -0x63dd7c79 + v318[34]) + (v190 ^ 0x3fee69fa + 2 * (-0x3fee69fb & 0x1c228387 + v318[34]) - (-0x2fce6801 & 0x1c228387 + v318[34]));
  int v194_xor = 0x7142c069 - (-0x1898b153 ^ v194);
  unsigned int v288 = 0x7b009154 ^ -0x7142c06a + v194_xor & 0x40119606 + v195;
  unsigned int v271 = 0x3960cfe0 - 0x54a952b3 * (0x313ec15d & -0x63dd7c79 + v310) - 0x56ad5a9a * (-0x16c006 | 0x1c228387 + v310);
  unsigned int v268 = -0x7564ae19 - 0x72c009b * (0x375932ae ^ -0x6df81923 - (0x2da55683 & read317(v261)) - 2 * (-0x1b9d6fa5 | 0x2da55683 & ~(0x244852f + 0x2bf06481 * v261)) ^ 0x36a00b15 - (-0x1c9b97df & read317(v261)) - 2 * (-0x2cc45d0b | -0x1c9b97df & ~(0x244852f + 0x2bf06481 * v261)));
  unsigned int v196 = -0x2076cbfa - 0x2ff3d99b * (0x2d267f7e ^ -0x59bc7fd2 - v294 - 2 * (-0x6214c9b | 0x4204c8a & ~v294) - (-0x539b3335 | ~v294) ^ 0x65d728bb - v294 - 2 * (-0x2b0733e5 | 0x610a0 & ~v294) - (-0x6f21a35e | ~v294));
  unsigned int v197 = -0x34e4d16f + 0x1ce884eb * (-0xc201069 & 0x6849c88d + 0x3444e493 * v196);
  unsigned int v198 = -0x7bfc2b74 - 0x4103fc3d * v197 + v294 - (-0x4f2159fd | v294 | -0x7bfc2b73 - 0x4103fc3d * v197) - (0x4f2159fc | v294) | 0x15c85f66 - 0x24e85385 * v271 & 0x15f7555a + 0x5023e593 * v268;
  unsigned int v199 = 0x7fffffff - (0x4ff6eab ^ v288) & 0x4605175d - 2 * (-0x39fae8a2 | 0x39fae8a1 ^ v198) + (-0x4605175f ^ v198);
  int v200 = -0x4c8e4637 - 0x11f0428d * v199 + 0x23e0851a * (0x3d401cd4 | v199);
  int v311 = -0x7fffffff * (0x3d401cd4 ^ 0x1845afbb * v200);
  v318[35] = 0x63dd7c79 + (0x4217de05 ^ -v311 + (-0x3de821fb ^ 0x1c228387 + v274));
  unsigned int v281 = (read317(v317[43])) | ~((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1);
  unsigned int v201 = v281 & (0xe83d820 ^ (read317(v317[43]) | read317(v317[37]) & read317(v317[41])));
  int v282 = 2 * (0xa008020 & (0x8d7bb75 ^ v281)) - (0xe83d820 & (0x8d7bb75 ^ v281));
  unsigned int v202 = ((read317(v317[37]) + read317(v317[41]) - ((read317(v317[37])) | (read317(v317[41])))) ^ 0xf309d58f) & ((((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1) + 0x5228b98a - ((2 * ((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1)) & 0xa4517314)) ^ 0x5228b98a);
  unsigned int v203 = 2 * ((((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1) + 0x5228b98a - ((2 * ((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1)) & 0xa4517314)) & 0x202800);
  unsigned int v204 = v201 | -0x4a50a32d + v282;
  int v205 = 0x4a50a32d - v282 - v201;
  unsigned int v206 = ((((((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1) + 0x5228b98a - ((2 * ((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1)) & 0xa4517314)) & 0xcf62a70) - v203 - v202 + 2 * (v202 | (v203 - ((((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1) + 0x5228b98a - ((2 * ((unsigned int)(0x755b14ed * v315[27] - 0xfa73bbb) >> 1)) & 0xa4517314)) & 0xcf62a70) - 0x202801)) - 0x4f51d7ff) ^ 0xaff7) + 0x4f720000;
  unsigned int v207 = -0x3d6a916c - (0x66b63889 ^ -0x42d33b0d & v206 ^ 2 * v204 + v205 & (0xaff7 ^ v206)) + 2 * (0x19494385 & (-0x1949c777 ^ 0x3d2cc4f3 & v206 ^ 2 * v204 + v205 & (0xaff7 ^ v206)));
  v318[16] = 0x2399ab09 - v207 - v318[16] - 2 * (-0x1c228388 - v318[16] | -0x14bd ^ 0xd730000 + (0x14bc ^ 0x16ae4de6 + v207));
  int32_t left = 0x43fdde65 - t60 - 2 * (-0x3aaf7005 | -0x152b194 & ~t60) - (0x7ead4e6c | ~t60);
  int32_t right = -0x5d1a730f - t60 - 2 * (-0x1f325112 | 0x2125001 & ~t60) - (0x4217de05 | ~t60);
  unsigned int v208 = left ^ right;
  int v209 = -0x464e923c - 0x17863ba1 * (-0x5a62deeb ^ v208);
  unsigned int v295 = -0x22dab147 + 0x5184c5db * (-0x2c22004a & -0x68fa3745 - 0x2a55979f * v209);
  int v210 = 0x4e3bae53 * v295 + 0x6ec2bc05;
  int32_t part1 = 0x1a8c762a - t60 - 2 * (-0x2bdd67b5 | 0x24945a0 & ~t60) - (0x4669dde1 | ~t60);
  int32_t part2 = 0x79c77802 - t60 - 2 * (0xeb8875c | -0x1ef98f60 & ~t60) - (-0x14f10f58 | ~t60);
  int32_t xored = (part1 ^ part2) ^ 0x5a72ad68;
  int32_t inner_33 = ~(-(v210 & (0xe8b27f ^ xored)));
  v315[33] = -0x6bc6d4c6 - 0x3bb21bc7 * (-0x3bc7a037 * v295 - 0x3a939df3 * inner_33);
  v318[58] = 0x121e62b9 + 0x755b14ed * v315[118] + 2 * (-0x3de821fb | 0xfa73bbb + 0xaa4eb13 * v315[118] + (-0x3de821fb ^ 0x1c228387 + v318[58])) - (-0x3de821fb ^ 0x1c228387 + v318[58]);
  v317[21] = v317[21] - 0x5863db81 * (-0x3de821fb ^ 0x1c228387 + v318[60]);
  v317[10] = v252 - 0x44072d30 - v261;
  SET_LOBYTE(v205, 60 ^ 13 + v254);
  SET_LOBYTE(v209, -4096 + 25 * (160 ^ v205));
  SET_LOBYTE(v205, -42 + 99 * v209 - 86 * (36 & 62 + (32 ^ 41 * v209)) + 170 * (32 & 41 * v209));
  SET_LOBYTE(v295, 11008 + 63 * (254 ^ 3 * v205));
  SET_LOBYTE(v210, -2338 - 4959 * v305 + 82 * (110 & -28 - 57 * v305));
  SET_LOBYTE(v205, 1081 + 97 * v210 + 18 * (110 & -25 * v210));
  SET_LOBYTE(v210, 127 - (123 ^ 34 + 57 * v205));
  SET_LOBYTE(v305, 5953 - 63 * (94 ^ v210));
  SET_LOBYTE(v205, 2048 - 9 * (216 ^ 51 - 47 * v265));
  SET_LOBYTE(v205, 50 + 75 * v205 - 186 * (88 & -57 * v205));
  SET_LOBYTE(v210, ~(34 ^ -61 + 11 * v205));
  SET_LOBYTE(v272, 321 - 63 * (7 ^ v210));
  SET_LOBYTE(v274, 5313 - 63 * (86 ^ 127 - (115 ^ 372417 + 203775 * v259)));
  SET_LOBYTE(v205, 2014 + 183 * v258 - 110 * (18 | v258));
  SET_LOBYTE(v205, 103 + 11 * v205 - 70 * (18 & -7 * v205) - 70 * (29 & -66 + (18 ^ -7 * v205)));
  SET_LOBYTE(v268, 2304 + 63 * (38 ^ -31 - 117 * v205 - 2 * (97 & 11 * v205)));
  SET_LOBYTE(v205, 9221 - 123 * v250);
  SET_LOBYTE(v210, 63 + 77 * v205 + 2 * (126 & -62 + 51 * v205));
  SET_LOBYTE(v264, 5697 - 63 * (91 ^ v210));
  SET_LOBYTE(v205, 19 * (37 * (-19 * LOBYTE(v315[92]) - 26) - 69 + 118) - 55);
  SET_LOBYTE(v210, -129 - (7 ^ -10 - 63 * v205));
  SET_LOBYTE(v271, 2241 - 63 * (34 ^ v210));
  SET_LOBYTE(v205, -51 * (-5 * ((2 * LOBYTE(v318[37]) + 14) & 0xa) - v255 + 5 * (LOBYTE(v318[37]) + ((2 * (((2 * LOBYTE(v318[37]) + 14) & 0xa) - LOBYTE(v318[37])) - 25) & (-102 * v255 + 58))) - 102) - 99);
  SET_LOBYTE(v210, 83 ^ 58 + (25 ^ 128 + (25 ^ v205)));
  a1[0] = -0x3d00 + 63 * (137 ^ v210);
  a1[1] = -13;
  a1[2] = -13;
  SET_LOBYTE(v209, 128 * v295 + (12 ^ 63 * v295));
  SET_LOBYTE(v205, 66 - (34 ^ 255 - (214 ^ v209)));
  SET_LOBYTE(v210, 175 ^ -163 + (34 ^ 61 + v205));
  a1[3] = -0x2f00 + 63 * (117 ^ v210);
  SET_LOBYTE(v205, -304 + 825 * v253);
  SET_LOBYTE(v210, 127 - (122 ^ -48 + 37 * v205));
  a1[4] = 0x17c1 - 63 * (95 ^ v210);
  a1[5] = -13;
  SET_LOBYTE(v209, 128 * v305 + (51 ^ 63 * v305));
  SET_LOBYTE(v209, 144 - (1 ^ 255 - (233 ^ v209)));
  SET_LOBYTE(v209, 218 ^ -107 + (1 ^ -17 + v209));
  a1[6] = 0x2d00 + 63 * (181 ^ -128 + (53 ^ v209));
  a1[7] = -13;
  a1[8] = -256 + 63 * (37 ^ -0x10db + 0x19ff * v256 - 0x14bf * v272 - 0x11fe * (218 & -65 * v272));
  SET_LOBYTE(v205, 55 + 65 * v274 + 2 * (73 | 63 * v274));
  SET_LOBYTE(v205, 39 + (11 ^ v205));
  SET_LOBYTE(v205, -1917 - 127 * (24 ^ -39 + v205));
  SET_LOBYTE(v210, -115 - 127 * v205 + 2 * (89 & 25 - v205));
  a1[9] = 0x1e41 - 63 * (124 ^ v210);
  a1[10] = -22;
  SET_LOBYTE(v205, 10 + 65 * v268 + 2 * (118 | 63 * v268));
  SET_LOBYTE(v210, -21 + (96 ^ v205));
  SET_LOBYTE(v205, 3813 + 69 * (76 ^ 21 + v210));
  SET_LOBYTE(v210, -7 - 115 * v205 + 2 * (79 & 55 - 13 * v205));
  a1[11] = 0x19c1 - 63 * (106 ^ v210);
  SET_LOBYTE(v205, -95 - 65 * v264 - 2 * (33 & 63 * v264));
  SET_LOBYTE(v210, 1540 + 26 * (104 ^ 236 & v205) - 13 * (123 ^ v205));
  SET_LOBYTE(v205, 967299 + 109 * v210 - 238 * (108 & 59 * v210) - 3465 * (125 ^ 54 + v277));
  SET_LOBYTE(v210, 128 * v205 + (67 ^ -57 * v205));
  a1[12] = 0x1941 - 63 * (102 ^ v210);
  SET_LOBYTE(v205, -948891 - 77202961 * v266 - 14 * (17 & 7842 + 638041 * v266 + 14338 * (71 & 39 * v266)) - 1734898 * (71 & 39 * v266));
  SET_LOBYTE(v210, 35 + (17 ^ 55 * v205));
  SET_LOBYTE(v205, -6656 + 55 * (186 ^ -64 + v210));
  a1[13] = -0xdf2 + 0x1dc7 * v205 + 126 * (87 | -128 * v205 + (55 ^ 7 * v205)) + 126 * (55 & 7 * v205);
  a1[14] = -22;
  a1[15] = -0x1d00 + 63 * (37 ^ (-0x3644 + 833 * v271 - 0x34fe * (218 & -65 * v271)));
  mix_with_v318(a1, v318);
  mix_with_v317(a1, v317);
  return fold_v315_into_output(a1, v315);
}
