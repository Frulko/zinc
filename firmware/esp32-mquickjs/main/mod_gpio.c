/* zinc:gpio (js/modules/gpio.js): setup, write, read and watch on the chip's pins. An edge is read in the interrupt, debounced there
   (the time of the last accepted edge per pin) and posted to the JavaScript task as ZN_EV_GPIO, pin | value << 8 and the milliseconds. */
#include "driver/gpio.h"
#include "esp_attr.h"
#include "esp_timer.h"
#include "zn.h"

static int64_t last_us[GPIO_NUM_MAX];
static uint16_t debounce_ms[GPIO_NUM_MAX];
static uint8_t edge_of[GPIO_NUM_MAX], level_of[GPIO_NUM_MAX];

static int usable(JSContext *ctx, int pin, int output)
{
    if (pin < 0 || pin >= GPIO_NUM_MAX || !GPIO_IS_VALID_GPIO(pin) || (pin >= 6 && pin <= 11)) {
        JS_ThrowRangeError(ctx, "zinc:gpio: no pin %d on the ESP32 (6 to 11 are the flash's)", pin);
        return 0;
    }
    if (zn_pin_reserved(pin)) {
        JS_ThrowRangeError(ctx, "zinc:gpio: pin %d is the board's (panel, backlight or touch)", pin);
        return 0;
    }
    if (output && !GPIO_IS_VALID_OUTPUT_GPIO(pin)) {
        JS_ThrowRangeError(ctx, "zinc:gpio: pin %d is an input only (34 to 39)", pin);
        return 0;
    }
    return 1;
}

/* setup(pin, mode 0 in / 1 out, pull 0 none / 1 up / 2 down); an output reads back its level (input and output) */
ZN_FN(js_gpio_setup)
{
    int pin, out, pull;
    if (zn_int(ctx, argc, argv, 0, &pin) || zn_int(ctx, argc, argv, 1, &out) || zn_int(ctx, argc, argv, 2, &pull)) return JS_EXCEPTION;
    if (!usable(ctx, pin, out)) return JS_EXCEPTION;
    if (pull && pin >= 34) return JS_ThrowRangeError(ctx, "zinc:gpio setup: pin %d has no internal pull resistor (34 to 39): wire one and use \"none\"", pin);
    gpio_reset_pin(pin);
    gpio_set_direction(pin, out ? GPIO_MODE_INPUT_OUTPUT : GPIO_MODE_INPUT);
    gpio_set_pull_mode(pin, pull == 1 ? GPIO_PULLUP_ONLY : pull == 2 ? GPIO_PULLDOWN_ONLY : GPIO_FLOATING);
    return JS_UNDEFINED;
}

ZN_FN(js_gpio_write)
{
    int pin, v;
    if (zn_int(ctx, argc, argv, 0, &pin) || zn_int(ctx, argc, argv, 1, &v)) return JS_EXCEPTION;
    if (!usable(ctx, pin, 1)) return JS_EXCEPTION;
    gpio_set_level(pin, v != 0);
    return JS_UNDEFINED;
}

ZN_FN(js_gpio_read)
{
    int pin;
    if (zn_int(ctx, argc, argv, 0, &pin)) return JS_EXCEPTION;
    if (!usable(ctx, pin, 0)) return JS_EXCEPTION;
    return JS_NewInt32(ctx, gpio_get_level(pin));
}

static void IRAM_ATTR edge_isr(void *arg)
{
    const int pin = (int)(intptr_t)arg, v = gpio_get_level(pin);
    const int64_t t = esp_timer_get_time();
    if (v == level_of[pin] || t - last_us[pin] < debounce_ms[pin] * 1000LL) return; /* a bounce, or the same level again */
    level_of[pin] = v;
    last_us[pin] = t;
    if ((edge_of[pin] == 0 && !v) || (edge_of[pin] == 1 && v)) return;
    zn_post_isr(ZN_EV_GPIO, pin | v << 8, (int)(t / 1000));
}

/* watch(pin, edge 0 rising / 1 falling / 2 both, debounce ms): both edges interrupt, the level decides which is posted */
ZN_FN(js_gpio_watch)
{
    static int service;
    int pin, edge, ms;
    if (zn_int(ctx, argc, argv, 0, &pin) || zn_int(ctx, argc, argv, 1, &edge) || zn_int(ctx, argc, argv, 2, &ms)) return JS_EXCEPTION;
    if (!usable(ctx, pin, 0)) return JS_EXCEPTION;
    if (!service && gpio_install_isr_service(0) == ESP_OK) service = 1;
    edge_of[pin] = edge;
    debounce_ms[pin] = ms < 0 ? 0 : ms > 60000 ? 60000 : ms;
    level_of[pin] = gpio_get_level(pin);
    gpio_set_intr_type(pin, GPIO_INTR_ANYEDGE);
    gpio_isr_handler_remove(pin);
    if (gpio_isr_handler_add(pin, edge_isr, (void *)(intptr_t)pin) != ESP_OK) return JS_ThrowInternalError(ctx, "zinc:gpio watch: no interrupt for pin %d", pin);
    gpio_intr_enable(pin);
    return JS_UNDEFINED;
}
