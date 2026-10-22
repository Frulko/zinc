// The sketch: C++ on Arduino's core (arduino-esp32, an ESP-IDF component the firmware is built with: plugin.json), on Zinc's native ABI
// (include/zn/native.h, the export table of zinc_native_sketch_abi.h that zinc generates from sketch.spec.ts). The module's init() is the
// sketch's setup() and its poll() its loop(): the mquickjs firmware calls it once per frame, between two frames of the program. On the
// computer, the same file builds without Arduino (ARDUINO is not defined there) and answers with the computer's values.
#include "zinc_native_sketch_abi.h"
#include <stdio.h>
#include <string.h>
#ifdef ARDUINO
#include <Arduino.h>
#include <Preferences.h>
#else
#include <chrono>
static uint32_t millis() {
  static const auto start = std::chrono::steady_clock::now();
  return static_cast<uint32_t>(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count());
}
#endif

static const ZnHostApi* host;
static int32_t bootCount, loopCount;
static char chipText[80];

#ifdef ARDUINO
// The firmware marks a new image valid itself once a program runs (main/main.c): Arduino's start must not do it first
extern "C" bool verifyRollbackLater() { return true; }
#endif

void setup() {   // as in a .ino: Arduino.h declares setup() and loop()
#ifdef ARDUINO
  initArduino();   // CONFIG_AUTOSTART_ARDUINO=n: app_main is the firmware's, and the core starts here
  Preferences prefs;
  prefs.begin("sketch");
  bootCount = prefs.getInt("boots", 0) + 1;
  prefs.putInt("boots", bootCount);
  prefs.end();
  snprintf(chipText, sizeof chipText, "%s, %lu MHz", ESP.getChipModel(), static_cast<unsigned long>(ESP.getCpuFreqMHz()));
#else
  bootCount = 1;
  snprintf(chipText, sizeof chipText, "the computer, no Arduino");
#endif
}

void loop() { loopCount++; }

int32_t zn_sketch_boots(void*, ZnCtx*, const ZnVal*, ZnVal* ret) { ret->i = bootCount; return ZN_OK; }
int32_t zn_sketch_chip(void*, ZnCtx* cx, const ZnVal*, ZnVal* ret) { ret->s = host->ret_str(cx, chipText, static_cast<uint32_t>(strlen(chipText))); return ZN_OK; }
int32_t zn_sketch_millis(void*, ZnCtx*, const ZnVal*, ZnVal* ret) { ret->i = static_cast<int32_t>(millis()); return ZN_OK; }
int32_t zn_sketch_loops(void*, ZnCtx*, const ZnVal*, ZnVal* ret) { ret->i = loopCount; return ZN_OK; }
int32_t zn_sketch_freeHeap(void*, ZnCtx*, const ZnVal*, ZnVal* ret) {
#ifdef ARDUINO
  ret->i = static_cast<int32_t>(ESP.getFreeHeap());
#else
  ret->i = 0;
#endif
  return ZN_OK;
}

static int32_t init(const ZnHostApi* h, void** self) {
  host = h;
  *self = nullptr;
  setup();
  return ZN_OK;
}

static void poll(void*, uint64_t) { loop(); }

static const ZnExport exports[] = {ZN_sketch_EXPORTS};

extern "C" const ZnModule* zn_module_Sketch(void) {
  static const ZnModule m = {ZN_ABI_VERSION, sizeof(ZnModule), "Sketch", exports, sizeof exports / sizeof exports[0], nullptr, 0, 0, init, poll, nullptr};
  return &m;
}
