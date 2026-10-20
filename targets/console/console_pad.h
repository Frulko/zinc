// What every console HAL adds to its pad (ZN-753): the pad session a core was built with (tools/build-console-core --input, the `pad` and
// `padup` lines of a ZINC_INPUT script), held on top of the real pad, and an analog stick read as the d-pad.
#pragma once
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "hal.h"

#ifndef ZN_CONSOLE_INPUT
#define ZN_CONSOLE_INPUT ""   // "frame+Name,frame-Name,..." in frame order: Name (Up Down Left Right A B X Y L R Start Select) held from + to -
#endif

/** The buttons the built-in session holds at poll `frame` (frames counted from 0, as ZINC_INPUT counts them); polls come in order. */
static inline uint32_t zn_console_script(int32_t frame) {
  static const char* const names[] = {"Up", "Down", "Left", "Right", "A", "B", "X", "Y", "L", "R", "Start", "Select"};   // the HAL_* bit order
  static const char* at = ZN_CONSOLE_INPUT;
  static uint32_t held = 0;
  while (*at) {
    char* end;
    const long f = strtol(at, &end, 10);
    if (end == at || f > frame) break;
    const char sign = *end++;
    const size_t n = strcspn(end, ",");
    for (int i = 0; i < 12; i++)
      if (strlen(names[i]) == n && !strncmp(end, names[i], n)) held = sign == '+' ? held | 1u << i : held & ~(1u << i);
    at = end + n + (end[n] == ',');
  }
  return held;
}

/** The W3C gamepad bits (zinc:gfx GamepadButton) of zinc:gfx buttons (HalButton bits): the built-in session also holds the console's gamepad 0. */
static inline uint32_t zn_console_w3c(uint32_t hal) {
  static const uint8_t to[12] = {12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 9, 8};   // Up Down Left Right A B X Y L R Start Select
  uint32_t w = 0;
  for (int i = 0; i < 12; i++) if (hal & 1u << i) w |= 1u << to[i];
  return w;
}

/** A stick at (x, y), 0..255 with 128 at rest (PSP, Vita, PS2), as the d-pad past a third of its travel. */
static inline uint32_t zn_console_stick(int x, int y) {
  uint32_t b = 0;
  if (x < 128 - 48) b |= HAL_LEFT;
  if (x > 128 + 48) b |= HAL_RIGHT;
  if (y < 128 - 48) b |= HAL_UP;
  if (y > 128 + 48) b |= HAL_DOWN;
  return b;
}
