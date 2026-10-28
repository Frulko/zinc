#pragma once
#include <stdint.h>

#define LOBYTE(x) ((uint8_t)((x) & 0xFF))
#define BYTE1(x) ((uint8_t)(((x) >> 8) & 0xFF))
#define BYTE2(x) ((uint8_t)(((x) >> 16) & 0xFF))
#define HIBYTE(x) ((uint8_t)(((x) >> 24) & 0xFF))
#define LOWORD(x) ((uint16_t)((x) & 0xFFFF))
#define HIWORD(x) ((uint16_t)(((x) >> 16) & 0xFFFF))

#define SET_LOBYTE(var, val) ((var) = ((var) & 0xFFFFFF00u) | ((uint8_t)(val)))
#define SET_BYTE1(var, val) ((var) = ((var) & 0xFFFF00FFu) | (((uint32_t)(uint8_t)(val)) << 8))
#define SET_BYTE2(var, val) ((var) = ((var) & 0xFF00FFFFu) | (((uint32_t)(uint8_t)(val)) << 16))
#define SET_HIBYTE(var, val) ((var) = ((var) & 0x00FFFFFFu) | (((uint32_t)(uint8_t)(val)) << 24))
