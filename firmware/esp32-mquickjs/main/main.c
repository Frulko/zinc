/* mquickjs on the ESP32-2432S022 (README.md): the board's screen (ST7789 on an 8-bit i80 bus) and touch (CST820) behind the zinc:gfx
   host calls of zn_stdlib.c, and the program of the `js` partition: bytecode `zinc run --target esp32 --engine mquickjs` compiled on the
   computer, run from the mapped flash (no RAM for the program), or JavaScript source, parsed here. Drawing is a display list: a frame records commands, then renders them BAND rows at a
   time and sends each band while the next one renders, so there is no frame buffer in RAM (240x320x2 would be 150 KiB) and no tearing
   between commands. */
#include <math.h>
#include <stdio.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "driver/spi_master.h"
#include "esp_app_desc.h"
#include "esp_heap_caps.h"
#include "esp_lcd_io_i80.h"
#include "esp_lcd_io_spi.h"
#include "esp_lcd_panel_io.h"
#include "esp_partition.h"
#include "esp_rom_crc.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "zn.h"

typedef uint8_t Uint8;
#define SDL_COMPILE_TIME_ASSERT(name, x) _Static_assert(x, #name)
#define SDL_arraysize(a) (sizeof(a) / sizeof((a)[0]))
#include "SDL_render_debug_font.h" /* 8x8 public-domain VGA glyphs from '!' (33), least significant bit leftmost */

#ifdef ZN_PANEL_SPI
/* the emulator's board (esp32sim --board ttgo-tdisplay, `zinc run --emulator`): the LilyGO T-Display's ST7789 on SPI2; its 240x320 RAM
   holds the whole frame, of which the real T-Display shows 135x240 */
enum { LCD_SCLK = 18, LCD_MOSI = 19, LCD_CS = 5, LCD_DC = 16, LCD_RST = 23, LCD_BL = 4 };
#else
/* boards/esp32-2432s022.json */
static const int LCD_DATA[8] = {15, 13, 12, 14, 27, 25, 33, 32};
enum { LCD_WR = 4, LCD_RD = 2, LCD_CS = 17, LCD_DC = 16, LCD_BL = 0 };
#endif
enum { TP_SDA = 21, TP_SCL = 22, TP_ADDR = 0x15 };
enum { W = 240, H = 320, BAND = 16, LCD_HZ = 10000000, FRAME_US = 16667 }; /* the panel refreshes at 60 Hz */
#define JS_HEAP (96 * 1024) /* keep equal to kHeap in src/cli_mqjs.cpp */
#define MAX_CMDS 768
#define TEXT_POOL 4096

enum { OP_RECT, OP_RRECT, OP_TEXT };
typedef struct {
    uint8_t op, scale;   /* text: the glyphs' scale; rrect: the radius */
    uint16_t color;      /* RGB565, high byte first as the panel reads it */
    int16_t a, b, c, d;  /* rect: x0 y0 x1 y1 clipped to the screen; rrect: x0 y0 x1 y1; text: x y */
    uint16_t text, len;  /* text: offset and length in text_pool; rrect: len is the alpha */
} Cmd;

static Cmd cmds[MAX_CMDS];
static char text_pool[TEXT_POOL];
static int ncmd, ntext, dropped;
static uint16_t background, *band, *bands[2]; /* the band being rendered, one of two: the bus may still read the other */
static esp_lcd_panel_io_handle_t io;
static i2c_master_dev_handle_t tp;
static int touch_down, touch_x, touch_y;
static int frames;
static int64_t present_us;

static uint16_t rgb565(uint32_t c)
{
    uint16_t v = (c >> 8 & 0xF800) | (c >> 5 & 0x07E0) | (c >> 3 & 0x1F);
    return v >> 8 | v << 8;
}

static int16_t clamp16(int v) { return v < -32768 ? -32768 : v > 32767 ? 32767 : v; }

static Cmd *push(int op)
{
    if (ncmd == MAX_CMDS) {
        dropped++;
        return NULL;
    }
    cmds[ncmd].op = op;
    return &cmds[ncmd++];
}

/* ---- the panel */

static void lcd_cmd(int c, const uint8_t *p, int n) { esp_lcd_panel_io_tx_param(io, c, p, n); }

static void lcd_init(void)
{
#ifdef ZN_PANEL_SPI
    gpio_set_direction(LCD_RST, GPIO_MODE_OUTPUT);
    gpio_set_level(LCD_RST, 1);
    spi_bus_config_t bc = {
        .sclk_io_num = LCD_SCLK, .mosi_io_num = LCD_MOSI, .miso_io_num = -1, .quadwp_io_num = -1, .quadhd_io_num = -1,
        .max_transfer_sz = W * BAND * 2,
    };
    ESP_ERROR_CHECK(spi_bus_initialize(SPI2_HOST, &bc, SPI_DMA_CH_AUTO));
    esp_lcd_panel_io_spi_config_t ic = {
        .cs_gpio_num = LCD_CS, .dc_gpio_num = LCD_DC, .spi_mode = 0, .pclk_hz = 40000000, .trans_queue_depth = 2,
        .lcd_cmd_bits = 8, .lcd_param_bits = 8,
    };
    ESP_ERROR_CHECK(esp_lcd_new_panel_io_spi((esp_lcd_spi_bus_handle_t)SPI2_HOST, &ic, &io));
#else
    gpio_set_direction(LCD_RD, GPIO_MODE_OUTPUT);
    gpio_set_level(LCD_RD, 1); /* never read */
    esp_lcd_i80_bus_config_t bc = {
        .dc_gpio_num = LCD_DC, .wr_gpio_num = LCD_WR, .clk_src = LCD_CLK_SRC_DEFAULT,
        .bus_width = 8, .max_transfer_bytes = W * BAND * 2, .dma_burst_size = 64,
    };
    for (int i = 0; i < 8; i++) bc.data_gpio_nums[i] = LCD_DATA[i];
    esp_lcd_i80_bus_handle_t bus;
    ESP_ERROR_CHECK(esp_lcd_new_i80_bus(&bc, &bus));
    esp_lcd_panel_io_i80_config_t ic = {
        .cs_gpio_num = LCD_CS, .pclk_hz = LCD_HZ, .trans_queue_depth = 2, .lcd_cmd_bits = 8, .lcd_param_bits = 8,
        .dc_levels = {.dc_data_level = 1},
    };
    ESP_ERROR_CHECK(esp_lcd_new_panel_io_i80(bus, &ic, &io));
#endif
    lcd_cmd(0x01, NULL, 0); /* software reset (the reset line is the chip's EN) */
    vTaskDelay(pdMS_TO_TICKS(150));
    lcd_cmd(0x11, NULL, 0); /* sleep out */
    vTaskDelay(pdMS_TO_TICKS(120));
    /* the vendor's panel tuning (LovyanGFX, as plugins/display-st7789 of the prototype sent it): porch, gate, VCOM, power, 60 Hz, gamma */
    static const uint8_t seq[] = {
        0xB2, 5, 0x0c, 0x0c, 0x00, 0x33, 0x33, 0xB7, 1, 0x35, 0xBB, 1, 0x28, 0xC0, 1, 0x0C, 0xC2, 2, 0x01, 0xFF,
        0xC3, 1, 0x10, 0xC4, 1, 0x20, 0xC6, 1, 0x0f, 0xD0, 2, 0xa4, 0xa1, 0xB0, 2, 0x00, 0xC0,
        0xE0, 14, 0xd0, 0x00, 0x02, 0x07, 0x0a, 0x28, 0x32, 0x44, 0x42, 0x06, 0x0e, 0x12, 0x14, 0x17,
        0xE1, 14, 0xd0, 0x00, 0x02, 0x07, 0x0a, 0x28, 0x31, 0x54, 0x47, 0x0e, 0x1c, 0x17, 0x1b, 0x1e,
        0x38, 0, /* idle mode off */
        0x3A, 1, 0x55, /* 16 bits per pixel */
        0x36, 1, 0x08, /* MADCTL: BGR, portrait */
        0x20, 0,       /* no inversion */
        0x29, 0,       /* display on */
    };
    for (size_t i = 0; i < sizeof seq; i += 2 + seq[i + 1]) lcd_cmd(seq[i], seq[i + 1] ? &seq[i + 2] : NULL, seq[i + 1]);
    static const uint8_t caset[4] = {0, 0, (W - 1) >> 8, (W - 1) & 0xff};
    lcd_cmd(0x2A, caset, 4);
    for (int i = 0; i < 2; i++) bands[i] = heap_caps_malloc(W * BAND * 2, MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL);
    gpio_set_direction(LCD_BL, GPIO_MODE_OUTPUT);
    gpio_set_level(LCD_BL, 0); /* on after the first frame, which hides the power-on RAM noise */
}

static void fill_row(uint16_t *row, int x0, int x1, uint16_t color)
{
    if (x0 < 0) x0 = 0;
    if (x1 > W) x1 = W;
    for (int x = x0; x < x1; x++) row[x] = color;
}

/* RGB565 (as the panel reads it) blended over `dst`, alpha 0..255: the 0x07E0F81F spread does the three channels in one multiply */
static void blend_row(uint16_t *row, int x0, int x1, uint16_t color, int alpha)
{
    if (x0 < 0) x0 = 0;
    if (x1 > W) x1 = W;
    uint32_t s = (uint16_t)(color >> 8 | color << 8), a = (alpha + 4) >> 3;
    s = (s | s << 16) & 0x07E0F81F;
    for (int x = x0; x < x1; x++) {
        uint32_t d = (uint16_t)(row[x] >> 8 | row[x] << 8);
        d = (d | d << 16) & 0x07E0F81F;
        d += ((s - d) * a >> 5) & 0x07E0F81F;
        uint16_t v = d | d >> 16;
        row[x] = v >> 8 | v << 8;
    }
}

static void draw(const Cmd *c, int y0)
{
    int y1 = y0 + BAND;
    if (c->op == OP_RECT) {
        int ya = c->b > y0 ? c->b : y0, yb = c->d < y1 ? c->d : y1;
        for (int y = ya; y < yb; y++) fill_row(band + (y - y0) * W, c->a, c->c, c->color);
    } else if (c->op == OP_RRECT) {
        int r = c->scale, ya = c->b > y0 ? c->b : y0, yb = c->d < y1 ? c->d : y1;
        for (int y = ya; y < yb; y++) {
            float dy = y < c->b + r ? c->b + r - y - 0.5f : y >= c->d - r ? y + 0.5f - (c->d - r) : 0; /* into a corner */
            int inset = dy > 0 ? r - (int)(sqrtf(r * r - dy * dy) + 0.5f) : 0;
            if (c->len >= 255) fill_row(band + (y - y0) * W, c->a + inset, c->c - inset, c->color);
            else blend_row(band + (y - y0) * W, c->a + inset, c->c - inset, c->color, c->len);
        }
    } else {
        int s = c->scale, size = 8 * s;
        if (c->b >= y1 || c->b + size <= y0) return;
        for (int i = 0; i < c->len; i++) {
            int ch = (uint8_t)text_pool[c->text + i], gx = c->a + i * size;
            if (ch < 33 || ch > 126 || gx >= W || gx + size <= 0) continue;
            const uint8_t *glyph = SDL_RenderDebugTextFontData + (ch - 33) * 8;
            for (int y = c->b > y0 ? c->b : y0; y < y1 && y < c->b + size; y++) {
                uint8_t bits = glyph[(y - c->b) / s];
                uint16_t *row = band + (y - y0) * W;
                for (int b = 0; bits; b++, bits >>= 1)
                    if (bits & 1) fill_row(row, gx + b * s, gx + b * s + s, c->color);
            }
        }
    }
}

static int touches(const Cmd *c, int y0)
{
    int bottom = c->op == OP_TEXT ? c->b + 8 * c->scale : c->d;
    return c->b < y0 + BAND && bottom > y0;
}

static uint32_t mix(uint32_t h, uint32_t v) { return (h ^ v) * 16777619u; }

/* A band is rendered and sent only when the commands that touch it differ from the last frame's (a hash of them), so a still
   screen costs no transfer and a moving ball a few bands. */
static int bands_sent;
static void present(void)
{
    static uint32_t shown[H / BAND];
    static int which;
    int64_t t0 = esp_timer_get_time();
    for (int y0 = 0; y0 < H; y0 += BAND) {
        uint32_t h = mix(2166136261u, background);
        for (int i = 0; i < ncmd; i++) {
            const Cmd *c = &cmds[i];
            if (!touches(c, y0)) continue;
            h = mix(mix(mix(h, c->op | c->scale << 8 | (uint32_t)c->color << 16), (uint16_t)c->a | (uint32_t)(uint16_t)c->b << 16),
                    (uint16_t)c->c | (uint32_t)(uint16_t)c->d << 16);
            h = mix(h, c->len);
            if (c->op == OP_TEXT)
                for (int k = 0; k < c->len; k++) h = mix(h, (uint8_t)text_pool[c->text + k]);
        }
        if (frames && shown[y0 / BAND] == h) continue;
        shown[y0 / BAND] = h;
        bands_sent++;
        band = bands[which ^= 1];
        for (int i = 0; i < W * BAND; i++) band[i] = background;
        for (int i = 0; i < ncmd; i++)
            if (touches(&cmds[i], y0)) draw(&cmds[i], y0);
        const uint8_t raset[4] = {y0 >> 8, y0 & 0xff, (y0 + BAND - 1) >> 8, (y0 + BAND - 1) & 0xff};
        lcd_cmd(0x2B, raset, 4); /* waits for the previous band's transfer, which ran while this one rendered */
        esp_lcd_panel_io_tx_color(io, 0x2C, band, W * BAND * 2); /* queued: the bus reads it while the next band renders into the other */
    }
    ncmd = ntext = 0;
    if (!frames++) gpio_set_level(LCD_BL, 1);
    present_us += esp_timer_get_time() - t0;
}

/* ---- touch: CST820 on I2C, 0x02 finger count, 0x03..0x06 X high/low, Y high/low (12 bits) */

static void touch_init(void)
{
    i2c_master_bus_config_t bc = {
        .i2c_port = I2C_NUM_0, .sda_io_num = TP_SDA, .scl_io_num = TP_SCL, .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7, .flags.enable_internal_pullup = true,
    };
    i2c_master_bus_handle_t bus;
    i2c_device_config_t dc = {.dev_addr_length = I2C_ADDR_BIT_LEN_7, .device_address = TP_ADDR, .scl_speed_hz = 400000};
    static const uint8_t no_sleep[2] = {0xFE, 0xFF}; /* keep answering on I2C (the chip naps after 2 s idle otherwise) */
    if (i2c_new_master_bus(&bc, &bus) != ESP_OK || i2c_master_bus_add_device(bus, &dc, &tp) != ESP_OK ||
        i2c_master_transmit(tp, no_sleep, 2, 20) != ESP_OK) {
        printf("mqjs: no touch controller at 0x%02x\n", TP_ADDR);
        tp = NULL;
    }
}

static void touch_poll(void)
{
    static const uint8_t reg = 0x02;
    uint8_t b[5];
    if (!tp || i2c_master_transmit_receive(tp, &reg, 1, b, sizeof b, 10) != ESP_OK) return;
    touch_down = (b[0] & 0x0F) != 0;
    if (touch_down) { /* kept after release, so a lift lands where the finger left */
        int x = (b[1] & 0x0F) << 8 | b[2], y = (b[3] & 0x0F) << 8 | b[4];
        touch_x = x < W ? x : W - 1;
        touch_y = y < H ? y : H - 1;
    }
}

/* ---- the globals of zn_stdlib.c */

static char *capture; /* when set, JS_PrintValueF output is appended here too (the error screen) */
static size_t ncapture;

static void log_write(void *opaque, const void *buf, size_t len)
{
    fwrite(buf, 1, len, stdout);
    if (capture && ncapture + len < 1024) {
        memcpy(capture + ncapture, buf, len);
        ncapture += len;
    }
}

JSValue js_print(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    for (int i = 0; i < argc; i++) {
        if (i) putchar(' ');
        if (JS_IsString(ctx, argv[i])) {
            JSCStringBuf buf;
            size_t len;
            const char *s = JS_ToCStringLen(ctx, &len, argv[i], &buf);
            fwrite(s, 1, len, stdout);
        } else {
            JS_PrintValueF(ctx, argv[i], JS_DUMP_LONG);
        }
    }
    putchar('\n');
    return JS_UNDEFINED;
}

JSValue js_gc(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    JS_GC(ctx);
    return JS_UNDEFINED;
}

static int now_ms(void) { return (int)(esp_timer_get_time() / 1000); }

JSValue js_date_constructor(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    return JS_ThrowTypeError(ctx, "the board has no clock: use Date.now() or performance.now()");
}

/* milliseconds since boot: no real-time clock on the board */
JSValue js_date_now(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, now_ms()); }
JSValue js_performance_now(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, now_ms()); }

/* ---- the zinc:gfx host calls (lib/gfx.d.ts): the functions `__host_gfx*` that zinc:gfx's QuickJS module calls, those the board has */

/* coordinates are rounded to whole pixels (the panel has no antialiasing) */
static int nums(JSContext *ctx, JSValue *argv, int *v, int n)
{
    for (int i = 0; i < n; i++) {
        double d;
        if (JS_ToNumber(ctx, &d, argv[i])) return -1;
        d = floor(d + 0.5);
        v[i] = d < -32768 ? -32768 : d > 32767 ? 32767 : (int)d;
    }
    return 0;
}

JSValue js_gfx_width(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, W); }
JSValue js_gfx_height(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, H); }
JSValue js_gfx_pixel_scale(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, 1); }

/* clear(color): the frame's background; the commands recorded before it are dropped */
JSValue js_gfx_clear(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    uint32_t color;
    if (JS_ToUint32(ctx, &color, argv[0])) return JS_EXCEPTION;
    background = rgb565(color);
    ncmd = ntext = 0;
    return JS_UNDEFINED;
}

JSValue js_gfx_rect(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    int v[4];
    uint32_t color;
    if (nums(ctx, argv, v, 4) || JS_ToUint32(ctx, &color, argv[4])) return JS_EXCEPTION;
    int x0 = v[0] > 0 ? v[0] : 0, y0 = v[1] > 0 ? v[1] : 0, x1 = v[0] + v[2] < W ? v[0] + v[2] : W, y1 = v[1] + v[3] < H ? v[1] + v[3] : H;
    Cmd *c = x0 < x1 && y0 < y1 ? push(OP_RECT) : NULL;
    if (c) *c = (Cmd){OP_RECT, 0, rgb565(color), x0, y0, x1, y1, 0, 0};
    return JS_UNDEFINED;
}

/* rrect(x, y, w, h, radius, color, alpha) */
JSValue js_gfx_rrect(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    int v[5], alpha;
    uint32_t color;
    if (nums(ctx, argv, v, 5) || JS_ToUint32(ctx, &color, argv[5]) || JS_ToInt32Sat(ctx, &alpha, argv[6])) return JS_EXCEPTION;
    int r = v[4] < 0 ? 0 : v[4], half = (v[2] < v[3] ? v[2] : v[3]) / 2;
    if (r > half) r = half;
    if (r > 255) r = 255;
    Cmd *c = alpha > 0 && v[2] > 0 && v[3] > 0 && v[0] < W && v[1] < H && v[0] + v[2] > 0 && v[1] + v[3] > 0 ? push(OP_RRECT) : NULL;
    if (c) *c = (Cmd){OP_RRECT, r, rgb565(color), v[0], v[1], clamp16(v[0] + v[2]), clamp16(v[1] + v[3]), 0, alpha > 255 ? 255 : alpha};
    return JS_UNDEFINED;
}

static void text(const char *s, size_t len, int x, int y, uint32_t color, int scale)
{
    if (ntext + len > TEXT_POOL) {
        dropped++;
        return;
    }
    Cmd *c = push(OP_TEXT);
    if (!c) return;
    *c = (Cmd){OP_TEXT, scale < 1 ? 1 : scale > 8 ? 8 : scale, rgb565(color), clamp16(x), clamp16(y), 0, 0, ntext, len};
    memcpy(text_pool + ntext, s, len);
    ntext += len;
}

/* text(x, y, value, color, scale): the 8x8 font, `scale` times */
JSValue js_gfx_text(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    int v[2], scale;
    uint32_t color;
    if (nums(ctx, argv, v, 2) || JS_ToUint32(ctx, &color, argv[3]) || JS_ToInt32Sat(ctx, &scale, argv[4])) return JS_EXCEPTION;
    JSCStringBuf buf;
    size_t len;
    const char *s = JS_ToCStringLen(ctx, &len, argv[2], &buf);
    if (!s) return JS_EXCEPTION;
    text(s, len, v[0], v[1], color, scale);
    return JS_UNDEFINED;
}

/* no images are baked into the firmware: image(name) is -1, as on a target whose build bakes no assets */
JSValue js_gfx_image(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, -1); }

/* keep(): nothing changed, the frame on the panel stays */
static int keep_frame;
JSValue js_gfx_keep(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)
{
    keep_frame = 1;
    return JS_UNDEFINED;
}

/* no buttons on the board: the finger is the pointer, and the only touch */
JSValue js_gfx_false(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_FALSE; }
JSValue js_gfx_pointer_x(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, touch_x); }
JSValue js_gfx_pointer_y(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, touch_y); }
JSValue js_gfx_pointer_down(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewBool(touch_down); }
JSValue js_gfx_touch_count(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv) { return JS_NewInt32(ctx, touch_down); }

/* ---- the program */

/* The exception on the UART and on the screen, white on dark red, wrapped at 30 columns; the program stops there. */
static void show_error(JSContext *ctx, const char *what)
{
    static char msg[1024];
    capture = msg;
    ncapture = 0;
    printf("mqjs: %s: ", what);
    JS_PrintValueF(ctx, JS_GetException(ctx), JS_DUMP_LONG);
    printf("\n");
    capture = NULL;
    ncmd = ntext = 0;
    background = rgb565(0x5a0e0e);
    text(what, strlen(what), 8, 8, 0xffd0d0, 2);
    int y = 36;
    for (size_t i = 0; i < ncapture && y < H - 8;) {
        size_t n = 0;
        while (i + n < ncapture && n < 29 && msg[i + n] != '\n') n++;
        text(msg + i, n, 4, y, 0xffffff, 1);
        y += 10;
        i += n + (i + n < ncapture && msg[i + n] == '\n');
    }
    present();
}

#include "zn_stdlib.h"

/* The js partition (0x110000, written by zinc): "ZNJS", the program's length (little endian), then mquickjs bytecode or JavaScript source.
   Bytecode runs in place from the mapped flash: the first boot of a program, or of another firmware, relocates it once into a copy
   after it (COPY_HEAD then the bytes), whose pointers are then its mapped addresses and the atoms of this firmware's ROM library. */
enum { SECTOR = 4096 };
typedef struct { char magic[4]; uint32_t len, crc, key; } CopyHead; /* "ZNJR"; key: this firmware and the copy's address */

static int relocate(const esp_partition_t *p, uint32_t at, uint32_t span, const uint8_t *src, uint32_t len, uintptr_t copy)
{
    /* mquickjs reads each string at its relocated address to share the ROM's atoms: the raw bytes go to the copy first, then the
       relocated ones. A small context of its own holds the ROM atom tables (the same in every context) before the program's heap exists. */
    enum { TMP_HEAP = 16 * 1024 };
    const uint32_t h = sizeof(JSBytecodeHeader);
    uint8_t *buf = malloc(len), *mem = malloc(TMP_HEAP);
    int ok = buf && mem;
    if (ok) {
        memcpy(buf, src, len);
        JSContext *tmp = JS_NewContext(mem, TMP_HEAP, &js_stdlib);
        ok = esp_partition_erase_range(p, at, span) == ESP_OK && esp_partition_write(p, at + sizeof(CopyHead), buf, len) == ESP_OK &&
             !JS_RelocateBytecode2(tmp, (JSBytecodeHeader *)buf, buf + h, len - h, copy + h, 1) &&
             esp_partition_erase_range(p, at, span) == ESP_OK && esp_partition_write(p, at + sizeof(CopyHead), buf, len) == ESP_OK;
        JS_FreeContext(tmp);
    }
    if (!ok)
        printf("mqjs: could not relocate the program's %u bytes into the flash (bytecode of another mquickjs, or largest free block %u)\n", (unsigned)len,
               (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
    free(buf);
    free(mem);
    return ok;
}

/* The program: bytecode in the mapped flash, or source in RAM (the caller frees it); NULL when there is none or it cannot be prepared. */
static const uint8_t *read_program(uint32_t *plen, int *pbytecode)
{
    const esp_partition_t *p = esp_partition_find_first(0x40, ESP_PARTITION_SUBTYPE_ANY, "js");
    const uint8_t *map;
    esp_partition_mmap_handle_t handle;
    if (!p || esp_partition_mmap(p, 0, p->size, ESP_PARTITION_MMAP_DATA, (const void **)&map, &handle) != ESP_OK) return NULL;
    uint32_t len;
    memcpy(&len, map + 4, 4);
    if (memcmp(map, "ZNJS", 4) || len > p->size - 8) return NULL;
    const uint8_t *src = map + 8;
    *plen = len;
    if (!(*pbytecode = JS_IsBytecode(src, len))) {
        uint8_t *buf = malloc(len + 1);
        if (!buf) printf("mqjs: no room for the program's %u bytes of source\n", (unsigned)len);
        else memcpy(buf, src, len), buf[len] = 0;
        return buf;
    }
    const uint32_t at = (8 + len + SECTOR - 1) & -SECTOR, span = (sizeof(CopyHead) + len + SECTOR - 1) & -SECTOR;
    if (at + span > p->size) {
        printf("mqjs: the program's %u bytes leave no room for its copy in the js partition (%u bytes at most)\n", (unsigned)len,
               (unsigned)(p->size / 2 - SECTOR));
        return NULL;
    }
    const uint8_t *copy = map + at + sizeof(CopyHead);
    uint32_t key;
    memcpy(&key, esp_app_get_description()->app_elf_sha256, 4);
    const CopyHead want = {{'Z', 'N', 'J', 'R'}, len, esp_rom_crc32_le(0, src, len), key ^ (uint32_t)(uintptr_t)copy};
    if (memcmp(map + at, &want, sizeof want)) {
        int64_t t0 = esp_timer_get_time();
        if (!relocate(p, at, span, src, len, (uintptr_t)copy) || esp_partition_write(p, at, &want, sizeof want) != ESP_OK) return NULL;
        printf("mqjs: the program was relocated into the flash in %d ms (once per program and firmware)\n",
               (int)((esp_timer_get_time() - t0) / 1000));
    }
    return copy;
}

/* ---- what the modules share (zn.h) */

JSContext *zn_ctx;
typedef struct { uint8_t kind; int32_t a, b; char *text; uint16_t len; } Event;
static QueueHandle_t events;
static int events_dropped;

void zn_post(int kind, int a, int b, const void *text, size_t len)
{
    Event e = {kind, a, b, NULL, 0};
    if (text && (e.text = malloc(len + 1))) {
        memcpy(e.text, text, len);
        e.text[len] = 0;
        e.len = len > 65535 ? 65535 : len;
    }
    if (xQueueSend(events, &e, 0) != pdTRUE) {
        free(e.text);
        events_dropped++;
    }
}

void IRAM_ATTR zn_post_isr(int kind, int a, int b)
{
    Event e = {kind, a, b, NULL, 0};
    BaseType_t woken = pdFALSE;
    if (xQueueSendFromISR(events, &e, &woken) != pdTRUE) events_dropped++;
    if (woken) portYIELD_FROM_ISR();
}

int zn_str(JSContext *ctx, JSValue v, char *buf, size_t size)
{
    JSCStringBuf tmp;
    size_t len;
    const char *s = JS_ToCStringLen(ctx, &len, v, &tmp);
    if (!s) return -1;
    if (len >= size) len = size - 1;
    memcpy(buf, s, len);
    buf[len] = 0;
    return (int)len;
}

int zn_int(JSContext *ctx, int argc, JSValue *argv, int i, int *out)
{
    *out = 0;
    return i < argc && JS_ToInt32Sat(ctx, out, argv[i]) ? -1 : 0;
}

int zn_pin_reserved(int pin)
{
#ifdef ZN_PANEL_SPI
    static const int8_t board[] = {LCD_SCLK, LCD_MOSI, LCD_CS, LCD_DC, LCD_RST, LCD_BL, TP_SDA, TP_SCL};
#else
    static const int8_t board[] = {15, 13, 12, 14, 27, 25, 33, 32, LCD_WR, LCD_RD, LCD_CS, LCD_DC, LCD_BL, TP_SDA, TP_SCL};
#endif
    for (size_t i = 0; i < sizeof board; i++)
        if (board[i] == pin) return 1;
    return 0;
}

/* Calls the global function `name` with n small integers, then `text` when not NULL; its result as an integer in *result (when given).
   0 when the function is missing, 1 when it ran, -1 on an exception (the caller shows it). */
static int call(JSContext *ctx, const char *name, int n, const int *v, const char *text, size_t len, int *result)
{
    JSGCRef f_ref, s_ref;
    JSValue *f = JS_PushGCRef(ctx, &f_ref), *s = JS_PushGCRef(ctx, &s_ref);
    *f = JS_GetPropertyStr(ctx, JS_GetGlobalObject(ctx), name);
    *s = text ? JS_NewStringLen(ctx, text, len) : JS_UNDEFINED;
    const int argc = n + (text != NULL), ready = JS_IsFunction(ctx, *f) && !JS_IsException(*s), full = ready && JS_StackCheck(ctx, argc + 2);
    if (ready && !full) {
        if (text) JS_PushArg(ctx, *s);
        for (int i = n - 1; i >= 0; i--) JS_PushArg(ctx, JS_NewInt32(ctx, v[i])); /* small integers: no allocation */
        JS_PushArg(ctx, *f);
        JS_PushArg(ctx, JS_NULL);
    }
    JS_PopGCRef(ctx, &s_ref);
    JS_PopGCRef(ctx, &f_ref);
    if (!ready) return 0;
    if (full) return -1;
    JSValue r = JS_Call(ctx, argc);
    if (JS_IsException(r)) return -1;
    if (result && JS_ToInt32Sat(ctx, result, r)) return -1;
    return 1;
}

static int deliver(JSContext *ctx, Event *e)
{
    const int v[3] = {e->kind, e->a, e->b};
    const int rc = call(ctx, "__zincEvent", 3, v, e->text, e->len, NULL);
    free(e->text);
    return rc;
}

/* The program's loop: the events other tasks queued, the timers of js/runtime.js (__zincTurn), and a frame at most every FRAME_US when
   zinc:gfx's onFrame set globalThis.__zincFrameCb (called with the seconds since the previous frame). It sleeps on the queue until the
   next timer or frame; a program with none of them and nothing listening has ended. */
static void run(JSContext *ctx)
{
    int64_t mark = esp_timer_get_time(), js_us = 0, last = mark, next_frame = mark;
    int mark_frames = frames;
    JSGCRef cb_ref, dt_ref;
    Event e;
    for (;;) {
        while (xQueueReceive(events, &e, 0) == pdTRUE)
            if (deliver(ctx, &e) < 0) { show_error(ctx, "Error"); return; }
        int64_t f0 = esp_timer_get_time();
        int wait = -1;
        const int now_ms = (int)(f0 / 1000);
        if (call(ctx, "__zincTurn", 1, &now_ms, NULL, 0, &wait) < 0) { show_error(ctx, "Error"); return; }
        /* the frame callback and its argument in GC references: each allocation may move them, JS_StackCheck too */
        JSValue *cb = JS_PushGCRef(ctx, &cb_ref), *dt = JS_PushGCRef(ctx, &dt_ref);
        *cb = JS_GetPropertyStr(ctx, JS_GetGlobalObject(ctx), "__zincFrameCb");
        const int framed = JS_IsFunction(ctx, *cb), due = framed && f0 >= next_frame;
        int full = 0;
        if (due) {
            *dt = JS_NewFloat64(ctx, (f0 - last) / 1e6);
            if (!(full = JS_StackCheck(ctx, 3))) {
                JS_PushArg(ctx, *dt);
                JS_PushArg(ctx, *cb);
                JS_PushArg(ctx, JS_NULL);
            }
        }
        JS_PopGCRef(ctx, &dt_ref);
        JS_PopGCRef(ctx, &cb_ref);
        if (due) {
            touch_poll();
            last = f0;
            int64_t p0 = present_us;
            if (full || JS_IsException(JS_Call(ctx, 1))) { show_error(ctx, "Error"); return; }
            if (keep_frame) {
                keep_frame = 0;
                ncmd = ntext = 0;
                frames++;
            } else {
                present();
            }
            js_us += esp_timer_get_time() - f0 - (present_us - p0);
            next_frame += FRAME_US; /* frames the panel would not show are not drawn */
            if (next_frame < esp_timer_get_time()) next_frame = esp_timer_get_time();
        }
        if (framed) {
            const int to_frame = (int)((next_frame - esp_timer_get_time()) / 1000);
            if (wait < 0 || to_frame < wait) wait = to_frame > 0 ? to_frame : 0;
        } else if (wait < 0 && !uxQueueMessagesWaiting(events)) {
            printf("mqjs: the program ended (no frame, timer or listener left)\n");
            return;
        }
        int64_t t = esp_timer_get_time();
        if (t - mark >= 5000000) {
            int n = frames - mark_frames;
            const int fps10 = (int)(n * 10000000LL / (t - mark)), bands10 = n ? bands_sent * 10 / n : 0; /* integers: newlib nano */
            printf("mqjs: %d.%d fps, js %d us, render+send %d us and %d.%d of %d bands per frame, %d commands dropped, %d events dropped, free heap %u\n",
                   fps10 / 10, fps10 % 10, n ? (int)(js_us / n) : 0, n ? (int)(present_us / n) : 0, bands10 / 10, bands10 % 10, H / BAND,
                   dropped, events_dropped, (unsigned)esp_get_free_heap_size());
            if (frames < 1000) JS_DumpMemory(ctx, 0);
            mark = t;
            mark_frames = frames;
            js_us = present_us = 0;
            dropped = bands_sent = events_dropped = 0;
        }
        if (wait > 0 && xQueueReceive(events, &e, pdMS_TO_TICKS(wait)) == pdTRUE && deliver(ctx, &e) < 0) { show_error(ctx, "Error"); return; }
    }
}

void app_main(void)
{
    events = xQueueCreate(32, sizeof(Event));
    zn_storage_init();
    lcd_init();
    touch_init();
    printf("mqjs: free heap %u, largest block %u\n", (unsigned)esp_get_free_heap_size(),
           (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
    uint32_t len = 0;
    int bytecode = 0;
    int64_t t0 = esp_timer_get_time();
    const uint8_t *prog = read_program(&len, &bytecode);
    if (!prog) {
        text("No program.", 11, 8, 8, 0xffffff, 2);
        text("zinc run <app> --target esp32", 29, 4, 40, 0xa0a0a0, 1);
        text("  --engine mquickjs", 19, 4, 52, 0xa0a0a0, 1);
        present();
        printf("mqjs: no program in the js partition (zinc run <app> --target esp32 --engine mquickjs writes one)\n");
        return;
    }
    void *mem = heap_caps_malloc(JS_HEAP, MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
    if (!mem) {
        printf("mqjs: no %d bytes for the JavaScript heap\n", JS_HEAP);
        return;
    }
    JSContext *ctx = JS_NewContext(mem, JS_HEAP, &js_stdlib);
    JS_SetLogFunc(ctx, log_write);
    JSValue val;
    if (bytecode) {
        val = JS_LoadBytecode(ctx, prog);
    } else {
        val = JS_Parse(ctx, (const char *)prog, len, "app.js", 0);
        free((void *)prog);
    }
    printf("mqjs: %s of %u bytes loaded in %d us, free heap %u\n", bytecode ? "bytecode" : "source", (unsigned)len,
           (int)(esp_timer_get_time() - t0), (unsigned)esp_get_free_heap_size());
    if (JS_IsException(val) || JS_IsException(JS_Run(ctx, val))) {
        show_error(ctx, JS_IsException(val) ? "Syntax error" : "Error");
        return;
    }
    zn_ctx = ctx;
    run(ctx);
}
