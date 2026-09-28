// zinc:gpio esp32 — driver/gpio, edges delivered through an ISR -> FreeRTOS queue -> Poller
// (the ISR runs on the GPIO interrupt context and must not touch the Zinc heap, so it only
// pushes a plain {pin,value} struct; PinEdge objects and the debounce/edge-match logic that
// match gpio.cpp run on the main task when the Poller drains the queue). simulate() delivers an
// edge directly (no hardware access), so it also works headless under QEMU, same as the sim.
#include "zrt.h"
#include "mod/gpio.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <string.h>

namespace zrt { namespace gpio {
struct Pin { bool out = false; uint8_t value = 0; int8_t edge = 2; uint16_t debounce = 0; double last = -1e9; Fn<void(Ref<PinEdge>)> cb; };
static Pin pins[GPIO_NUM_MAX];
struct RawEdge { uint8_t pin, value; };
static QueueHandle_t isr_q = nullptr;
static bool isr_service_installed = false;

static void IRAM_ATTR isr_handler(void* arg) {
  RawEdge e; e.pin = (uint8_t)(uintptr_t)arg; e.value = (uint8_t)gpio_get_level((gpio_num_t)e.pin);
  BaseType_t hpw = pdFALSE;
  xQueueSendFromISR(isr_q, &e, &hpw);
  if (hpw) portYIELD_FROM_ISR();
}
static void deliver(uint8_t pin, uint8_t value) {
  Pin& p = pins[pin];
  uint8_t old = p.value; p.value = value;
  if (!p.cb || old == value) return;
  bool rising = value > old;
  if (p.edge == 0 && !rising) return;
  if (p.edge == 1 && rising) return;
  double t = now_ms();
  if (t - p.last < p.debounce) return;
  p.last = t;
  auto e = make<PinEdge>(); e->pin = pin; e->value = value; e->timestampMs = t;
  Fn<void(Ref<PinEdge>)> cb = p.cb;
  microtask([cb, e]() { cb(e); });
}
struct Driver : Poller {
  bool poll() override {
    RawEdge e;
    while (isr_q && xQueueReceive(isr_q, &e, 0) == pdTRUE) deliver(e.pin, e.value);
    return true;  // ISR-driven: stay registered for the life of the program
  }
};
static void init() {
  if (isr_q) return;
  isr_q = xQueueCreate(32, sizeof(RawEdge));
  add_poller(new (alloc(sizeof(Driver))) Driver());
}
void setup(uint8_t pin, const String& mode, const String& pull) {
  init();
  Pin& p = pins[pin];
  p.out = mode.bytes() && mode.ptr()[0] == 'o';
  bool up = !p.out && pull.bytes() && pull.ptr()[0] == 'u';
  bool down = !p.out && pull.bytes() && pull.ptr()[0] == 'd';
  gpio_config_t cfg{};
  cfg.pin_bit_mask = 1ULL << pin;
  cfg.mode = p.out ? GPIO_MODE_OUTPUT : GPIO_MODE_INPUT;
  cfg.pull_up_en = up ? GPIO_PULLUP_ENABLE : GPIO_PULLUP_DISABLE;
  cfg.pull_down_en = down ? GPIO_PULLDOWN_ENABLE : GPIO_PULLDOWN_DISABLE;
  cfg.intr_type = GPIO_INTR_DISABLE;
  gpio_config(&cfg);
  p.value = up ? 1 : 0;
}
void write(uint8_t pin, uint8_t value) { init(); pins[pin].value = value ? 1 : 0; gpio_set_level((gpio_num_t)pin, value ? 1 : 0); }
uint8_t read(uint8_t pin) { init(); return pins[pin].out ? pins[pin].value : (uint8_t)gpio_get_level((gpio_num_t)pin); }
void watch(uint8_t pin, const String& edge, uint16_t debounceMs, Fn<void(Ref<PinEdge>)> cb) {
  init();
  Pin& p = pins[pin];
  p.edge = edge.bytes() && edge.ptr()[0] == 'r' ? 0 : edge.bytes() && edge.ptr()[0] == 'f' ? 1 : 2;
  p.debounce = debounceMs; p.cb = cb; p.last = -1e9;
  if (!isr_service_installed) { gpio_install_isr_service(0); isr_service_installed = true; }
  gpio_set_intr_type((gpio_num_t)pin, p.edge == 0 ? GPIO_INTR_POSEDGE : p.edge == 1 ? GPIO_INTR_NEGEDGE : GPIO_INTR_ANYEDGE);
  gpio_isr_handler_add((gpio_num_t)pin, isr_handler, (void*)(uintptr_t)pin);
  gpio_intr_enable((gpio_num_t)pin);
}
void simulate(uint8_t pin, uint8_t value) { init(); deliver(pin, value ? 1 : 0); }
}}
