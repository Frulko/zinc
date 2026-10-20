#ifndef ZN_SIM_H
#define ZN_SIM_H
/* The simulator's chip ABI (ZN-292, the simulator design report, section 3.3): a part is a table of functions behind a C ABI, so a chip written in C, C++ or
 * (later) WebAssembly implements the same interface. Times are virtual nanoseconds of the scheduler. Nothing here names a target, a board or a plugin. */
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

#define ZN_SIM_ABI_VERSION 1u

/* Pin levels: what a pin or a net carries. */
enum { ZN_SIM_LOW = 0, ZN_SIM_HIGH = 1, ZN_SIM_Z = 2 /* nothing drives it */, ZN_SIM_X = 3 /* two drivers of the same strength disagree */ };
/* Drive strengths, weakest first: a pull resistor loses against any driver. */
enum { ZN_SIM_PULL = 1, ZN_SIM_WEAK = 2, ZN_SIM_STRONG = 3 };

typedef struct ZnSimHost {
  void* user;
  uint64_t (*now_ns)(void* user);
  /* wake the part's `tick` at an absolute time (0: cancel the pending one) */
  void (*schedule)(void* user, uint64_t t_ns);
  /* drive a pin of this part: level ZN_SIM_LOW / HIGH / Z, strength ZN_SIM_* */
  void (*drive)(void* user, int pin, int level, int strength);
  int (*level)(void* user, int pin);
  void (*log)(void* user, const char* text);
} ZnSimHost;

typedef struct ZnSimPart {
  uint32_t abi;
  const char* type;                                                           /* "zn-ssd1306"; aliases are the registry's business */
  void* (*create)(const ZnSimHost* host, const char* attrs_json);
  void (*destroy)(void* self);
  void (*pin_changed)(void* self, int pin, int level, uint64_t t_ns);          /* an edge on one of the part's pins */
  int (*i2c_write)(void* self, const uint8_t* p, int n, uint64_t t_ns);        /* returns the ack (1) or nack (0) */
  int (*i2c_read)(void* self, uint8_t* p, int n, uint64_t t_ns);
  void (*spi_xfer)(void* self, const uint8_t* tx, uint8_t* rx, int n, uint64_t t_ns);
  void (*tick)(void* self, uint64_t t_ns);                                     /* the scheduled wake-up */
  void (*control)(void* self, const char* name, double value);                 /* set-control: temperature, pressed, rotation */
  int (*render)(void* self, uint32_t* rgba, int w, int h);                     /* visual state for the UI and screenshots; returns the bytes used or -1 */
} ZnSimPart;

#ifdef __cplusplus
}
#endif
#endif
