/* zinc:lvgl on the native ABI (include/zn/native.h, the export table of zinc_native_lvgl_abi.h that zinc generates from lvgl.spec.ts): LVGL 9
   (vendor/lvgl, configured by lv_conf.h) behind handles. C with no runtime type, so the same file is the plugin's library on the computer and
   goes into the ESP32's mquickjs firmware. There LVGL renders 32 rows at a time into two DMA buffers of the firmware and sends each to the
   panel while it renders the next (zn_panel_flush, firmware/esp32-mquickjs/main/main.c); on the computer it renders into an RGBA copy of the
   display that frame() hands to TypeScript. The objects, their styles and layout live in LVGL's memory, not in JavaScript's: a program keeps
   only the handles. Events are queued (listen, nextEvent) rather than called back, as mquickjs carries no callbacks. */
#include <stdlib.h>
#include <string.h>

#include "zinc_native_lvgl_abi.h"
#include "vendor/lvgl/lvgl.h"

#ifdef ESP_PLATFORM
#include "esp_system.h"
/* the firmware's panel (main.c): a buffer the bus can read, and an area sent to the panel (pixels in its byte order) */
void *zn_panel_buffer(size_t bytes);
void zn_panel_flush(int x0, int y0, int x1, int y1, const void *pixels);
void zn_panel_rotate(int quarter);
#endif

enum { BAND = 32, MAX_OBJS = 512, MAX_SERIES = 16, QUEUE = 32 };

static const ZnHostApi *host;
static lv_display_t *display;
static lv_indev_t *pointer;
static int pointer_x, pointer_y, pointer_down, width, height; /* the panel's size, as started (portrait on the board) */
static int quarter;                                            /* the display's quarter turn (rotate) */
static lv_obj_t *objs[MAX_OBJS]; /* handle - 1 */
static int next_free;
static int queue[QUEUE], queue_head, queue_count;
static lv_chart_series_t *series[MAX_SERIES];
static lv_obj_t *series_chart[MAX_SERIES]; /* a slot is free again when its chart is deleted (LVGL frees the series with it) */
static uint8_t *rgba; /* the computer's copy of the display */
static int changed;
static struct { int turns, us, slowest, areas, pixels; } stats;

static void flush(lv_display_t *d, const lv_area_t *a, uint8_t *pixels)
{
    const int w = lv_area_get_width(a), h = lv_area_get_height(a);
    stats.areas++;
    stats.pixels += w * h;
#ifdef ESP_PLATFORM
    lv_draw_rgb565_swap(pixels, (uint32_t)(w * h)); /* the panel reads the high byte first */
    zn_panel_flush(a->x1, a->y1, a->x2 + 1, a->y2 + 1, pixels);
#else
    const uint16_t *src = (const uint16_t *)pixels;
    for (int y = 0; y < h; y++) {
        uint8_t *dst = rgba + ((size_t)(a->y1 + y) * lv_display_get_horizontal_resolution(d) + a->x1) * 4;
        for (int x = 0; x < w; x++, src++, dst += 4) {
            const uint16_t c = *src;
            dst[0] = (uint8_t)((c >> 11) * 255 / 31);
            dst[1] = (uint8_t)((c >> 5 & 63) * 255 / 63);
            dst[2] = (uint8_t)((c & 31) * 255 / 31);
            dst[3] = 255;
        }
    }
    changed = 1;
#endif
    /* the next band renders into the other buffer; the firmware waits for this one's transfer before it sends that one */
    lv_display_flush_ready(d);
}

static void read_pointer(lv_indev_t *indev, lv_indev_data_t *data)
{
    (void)indev;
    data->point.x = pointer_x;
    data->point.y = pointer_y;
    data->state = pointer_down ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
}

/* ---- handles */

static int handle_of(lv_obj_t *o) { return (int)(intptr_t)lv_obj_get_user_data(o); }

static void on_delete(lv_event_t *e)
{
    lv_obj_t *o = (lv_obj_t *)lv_event_get_current_target(e);
    const int h = handle_of(o);
    if (h > 0 && h <= MAX_OBJS && objs[h - 1] == o) {
        objs[h - 1] = NULL;
        for (int k = 0; k < queue_count; k++) /* its queued events go nowhere: the handle may name a new object by then */
            if (queue[(queue_head + k) % QUEUE] / 256 == h) queue[(queue_head + k) % QUEUE] = 0;
    }
    for (int k = 0; k < MAX_SERIES; k++)
        if (series_chart[k] == o) series_chart[k] = NULL, series[k] = NULL;
    void *owned = lv_event_get_user_data(e); /* a button matrix's map, a Lottie animation's buffer */
    if (owned) lv_free(owned);
}

static int adopt(ZnCtx *cx, lv_obj_t *o)
{
#ifdef ESP_PLATFORM
    if (!o) { host->set_error(cx, "zinc:lvgl: the board's heap is full: fewer objects at once (build a page when it is shown, delete it when it is left)"); return 0; }
#else
    if (!o) { host->set_error(cx, "zinc:lvgl: LVGL's memory pool is full, as the board's heap would be (lv_conf.h): fewer objects at once (build a page when it is shown, delete it when it is left)"); return 0; }
#endif
    for (int k = 0; k < MAX_OBJS; k++) {
        const int i = (next_free + k) % MAX_OBJS;
        if (objs[i]) continue;
        objs[i] = o;
        next_free = i + 1;
        lv_obj_set_user_data(o, (void *)(intptr_t)(i + 1));
        lv_obj_add_event_cb(o, on_delete, LV_EVENT_DELETE, NULL);
        return i + 1;
    }
    lv_obj_delete(o);
    host->set_error(cx, "zinc:lvgl: more than 512 objects");
    return 0;
}

static lv_obj_t *get(ZnCtx *cx, int64_t h)
{
    if (!display) { host->set_error(cx, "zinc:lvgl: start() first"); return NULL; }
    if (h < 1 || h > MAX_OBJS || !objs[h - 1]) { host->set_error(cx, "zinc:lvgl: no such object (deleted?)"); return NULL; }
    return objs[h - 1];
}

#define THE_OBJ(n)                              \
    lv_obj_t *o = get(cx, args[n].i);       \
    if (!o) return ZN_ERROR;                \
    (void)self

/* ---- the module */

int32_t zn_lvgl_start(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    ret->i = 0;
    if (display) return ZN_OK;
    width = (int)args[0].i;
    height = (int)args[1].i;
    const uint32_t bytes = (uint32_t)(width * BAND * 2);
#ifdef ESP_PLATFORM
    void *a = zn_panel_buffer(bytes), *b = zn_panel_buffer(bytes);
#else
    void *a = malloc(bytes), *b = malloc(bytes);
    rgba = calloc((size_t)width * height, 4);
#endif
    if (!a || !b) { host->set_error(cx, "zinc:lvgl: no memory for the draw buffers"); return ZN_ERROR; }
    lv_init();
    display = lv_display_create(width, height);
    lv_display_set_buffers(display, a, b, bytes, LV_DISPLAY_RENDER_MODE_PARTIAL);
    lv_display_set_flush_cb(display, flush);
    const lv_color_t primary = lv_color_hex((uint32_t)args[3].i);
    lv_display_set_theme(display, lv_theme_default_init(display, primary, primary, args[2].i != 0, LV_FONT_DEFAULT));
    pointer = lv_indev_create();
    lv_indev_set_type(pointer, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(pointer, read_pointer);
    lv_timer_pause(lv_indev_get_read_timer(pointer)); /* read by step(), once per turn, with the pointer of that turn */
    adopt(cx, lv_screen_active());
    ret->i = 1;
    return ZN_OK;
}

int32_t zn_lvgl_step(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    if (!display) { host->set_error(cx, "zinc:lvgl: start() first"); return ZN_ERROR; }
    const double t0 = host->now_ms();
    lv_tick_inc((uint32_t)args[0].i); /* the frame's time: virtual in a deterministic run, so are LVGL's animations */
#ifdef ESP_PLATFORM
    /* the touch is in the panel's portrait pixels; LVGL's turn with the panel (zn_panel_rotate's MADCTL: 1 MV|MX, 2 MX|MY, 3 MV|MY) */
    const int px = (int)args[1].i, py = (int)args[2].i;
    pointer_x = quarter == 1 ? py : quarter == 2 ? width - 1 - px : quarter == 3 ? height - 1 - py : px;
    pointer_y = quarter == 1 ? width - 1 - px : quarter == 2 ? height - 1 - py : quarter == 3 ? px : py;
#else
    pointer_x = (int)args[1].i; /* the computer shows the picture upright: its pointer is LVGL's */
    pointer_y = (int)args[2].i;
#endif
    pointer_down = args[3].i != 0;
    lv_indev_read(pointer);
    const uint32_t next = lv_timer_handler();
    const int us = (int)((host->now_ms() - t0) * 1000);
    stats.turns++;
    stats.us += us;
    if (us > stats.slowest) stats.slowest = us;
    ret->i = next == LV_NO_TIMER_READY ? 1000 : (int)next;
    return ZN_OK;
}

/* A quarter turn of the display (0 as started, 1 to 3 clockwise): LVGL lays the screens out again at the turned size. The board turns its
   panel (the controller's MADCTL: no pixel is moved by hand) and the touch with it; the computer's picture takes the turned size. */
int32_t zn_lvgl_rotate(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)ret;
    if (!display) { host->set_error(cx, "zinc:lvgl: start() first"); return ZN_ERROR; }
    const int q = (int)(args[0].i & 3);
    if (q == quarter) return ZN_OK;
#ifdef ESP_PLATFORM
    zn_panel_rotate(q);
#endif
    quarter = q;
    lv_display_set_resolution(display, q & 1 ? height : width, q & 1 ? width : height);
    lv_obj_invalidate(lv_screen_active());
    return ZN_OK;
}

int32_t zn_lvgl_displayWidth(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)cx;
    (void)args;
    ret->i = display ? lv_display_get_horizontal_resolution(display) : 0;
    return ZN_OK;
}

int32_t zn_lvgl_displayHeight(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)cx;
    (void)args;
    ret->i = display ? lv_display_get_vertical_resolution(display) : 0;
    return ZN_OK;
}

int32_t zn_lvgl_frame(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)args;
    ret->v.p = NULL;
    ret->v.n = 0;
    if (!rgba || !changed) return ZN_OK;
    const uint32_t n = (uint32_t)(width * height * 4);
    uint8_t *out = host->ret_buf(cx, n);
    if (!out) { host->set_error(cx, "zinc:lvgl: out of memory"); return ZN_ERROR; }
    memcpy(out, rgba, n);
    changed = 0;
    ret->v.p = out;
    ret->v.n = n;
    return ZN_OK;
}

int32_t zn_lvgl_stats(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)args;
    int32_t *out = host->ret_buf(cx, 10 * sizeof(int32_t));
    if (!out) { host->set_error(cx, "zinc:lvgl: out of memory"); return ZN_ERROR; }
    out[0] = stats.turns;
    out[1] = stats.us;
    out[2] = stats.slowest;
    out[3] = stats.areas;
    out[4] = stats.pixels;
#ifdef ESP_PLATFORM
    out[5] = (int32_t)esp_get_free_heap_size();
    out[6] = (int32_t)esp_get_minimum_free_heap_size();
#else
    out[5] = out[6] = -1;
#endif
    lv_mem_monitor_t m;
    lv_mem_monitor(&m);
    out[7] = (int32_t)(m.total_size - m.free_size);
    out[8] = (int32_t)m.total_size;
    out[9] = (int32_t)m.max_used;
    memset(&stats, 0, sizeof stats);
    ret->v.p = out;
    ret->v.n = 10;
    return ZN_OK;
}

/* LVGL's constants by their names without LV_ (what TypeScript looks up once) */
#define C(n) {#n, LV_##n}
static const struct { const char *name; int32_t value; } constants[] = {
    C(STYLE_WIDTH), C(STYLE_HEIGHT), C(STYLE_MIN_WIDTH), C(STYLE_MAX_WIDTH), C(STYLE_MIN_HEIGHT), C(STYLE_MAX_HEIGHT), C(STYLE_LENGTH),
    C(STYLE_TRANSLATE_X), C(STYLE_TRANSLATE_Y), C(STYLE_RADIUS), C(STYLE_CLIP_CORNER), C(STYLE_OPA), C(STYLE_ANIM_DURATION),
    C(STYLE_PAD_TOP), C(STYLE_PAD_BOTTOM), C(STYLE_PAD_LEFT), C(STYLE_PAD_RIGHT), C(STYLE_PAD_ROW), C(STYLE_PAD_COLUMN),
    C(STYLE_BG_COLOR), C(STYLE_BG_OPA), C(STYLE_BG_GRAD_COLOR), C(STYLE_BG_GRAD_DIR),
    C(STYLE_BORDER_COLOR), C(STYLE_BORDER_WIDTH), C(STYLE_BORDER_OPA), C(STYLE_BORDER_SIDE),
    C(STYLE_OUTLINE_COLOR), C(STYLE_OUTLINE_WIDTH), C(STYLE_OUTLINE_PAD),
    C(STYLE_SHADOW_COLOR), C(STYLE_SHADOW_WIDTH), C(STYLE_SHADOW_OPA), C(STYLE_SHADOW_OFFSET_Y), C(STYLE_SHADOW_SPREAD),
    C(STYLE_TEXT_COLOR), C(STYLE_TEXT_OPA), C(STYLE_TEXT_ALIGN), C(STYLE_TEXT_LETTER_SPACE), C(STYLE_TEXT_LINE_SPACE),
    C(STYLE_ARC_COLOR), C(STYLE_ARC_WIDTH), C(STYLE_ARC_OPA), C(STYLE_ARC_ROUNDED), C(STYLE_LINE_COLOR), C(STYLE_LINE_WIDTH),
    C(OBJ_FLAG_HIDDEN), C(OBJ_FLAG_CLICKABLE), C(OBJ_FLAG_CHECKABLE), C(OBJ_FLAG_SCROLLABLE), C(OBJ_FLAG_SCROLL_ELASTIC),
    C(OBJ_FLAG_SCROLL_MOMENTUM), C(OBJ_FLAG_SCROLL_ONE), C(OBJ_FLAG_SCROLL_CHAIN_HOR), C(OBJ_FLAG_SCROLL_CHAIN_VER),
    C(OBJ_FLAG_SCROLL_ON_FOCUS), C(OBJ_FLAG_SNAPPABLE), C(OBJ_FLAG_EVENT_BUBBLE), C(OBJ_FLAG_CLICK_FOCUSABLE),
    C(OBJ_FLAG_OVERFLOW_VISIBLE),
    C(STATE_DEFAULT), C(STATE_CHECKED), C(STATE_FOCUSED), C(STATE_PRESSED), C(STATE_DISABLED),
    C(PART_MAIN), C(PART_SCROLLBAR), C(PART_INDICATOR), C(PART_KNOB), C(PART_SELECTED), C(PART_ITEMS),
    C(EVENT_CLICKED), C(EVENT_SHORT_CLICKED), C(EVENT_LONG_PRESSED), C(EVENT_PRESSED), C(EVENT_RELEASED), C(EVENT_VALUE_CHANGED),
    C(EVENT_SCROLL), C(EVENT_SCROLL_END),
    C(ALIGN_DEFAULT), C(ALIGN_TOP_LEFT), C(ALIGN_TOP_MID), C(ALIGN_TOP_RIGHT), C(ALIGN_BOTTOM_LEFT), C(ALIGN_BOTTOM_MID),
    C(ALIGN_BOTTOM_RIGHT), C(ALIGN_LEFT_MID), C(ALIGN_RIGHT_MID), C(ALIGN_CENTER),
    C(FLEX_FLOW_ROW), C(FLEX_FLOW_COLUMN), C(FLEX_FLOW_ROW_WRAP), C(FLEX_FLOW_COLUMN_WRAP),
    C(FLEX_ALIGN_START), C(FLEX_ALIGN_END), C(FLEX_ALIGN_CENTER), C(FLEX_ALIGN_SPACE_EVENLY), C(FLEX_ALIGN_SPACE_AROUND),
    C(FLEX_ALIGN_SPACE_BETWEEN),
    C(TEXT_ALIGN_LEFT), C(TEXT_ALIGN_CENTER), C(TEXT_ALIGN_RIGHT),
    C(GRAD_DIR_NONE), C(GRAD_DIR_VER), C(GRAD_DIR_HOR),
    C(BORDER_SIDE_NONE), C(BORDER_SIDE_BOTTOM), C(BORDER_SIDE_TOP), C(BORDER_SIDE_FULL),
    C(CHART_TYPE_LINE), C(CHART_TYPE_BAR), C(SIZE_CONTENT), C(OPA_TRANSP), C(OPA_COVER),
};

int32_t zn_lvgl_constant(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)cx;
    ret->i = -1;
    for (size_t i = 0; i < sizeof constants / sizeof constants[0]; i++)
        if (!strcmp(constants[i].name, args[0].s.p)) ret->i = constants[i].value;
    return ZN_OK;
}

int32_t zn_lvgl_pct(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)cx;
    ret->i = lv_pct((int32_t)args[0].i);
    return ZN_OK;
}

int32_t zn_lvgl_screen(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)args;
    if (!display) { host->set_error(cx, "zinc:lvgl: start() first"); return ZN_ERROR; }
    ret->i = handle_of(lv_screen_active());
    return ZN_OK;
}

static const struct { const char *kind; lv_obj_t *(*create)(lv_obj_t *parent); } kinds[] = {
    {"obj", lv_obj_create}, {"label", lv_label_create}, {"button", lv_button_create}, {"slider", lv_slider_create},
    {"switch", lv_switch_create}, {"checkbox", lv_checkbox_create}, {"arc", lv_arc_create}, {"bar", lv_bar_create},
    {"chart", lv_chart_create}, {"spinner", lv_spinner_create}, {"buttonmatrix", lv_buttonmatrix_create}, {"led", lv_led_create},
    {"roller", lv_roller_create}, {"line", lv_line_create},
};

int32_t zn_lvgl_create(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    lv_obj_t *parent = NULL;
    (void)self;
    if (args[1].i && !(parent = get(cx, args[1].i))) return ZN_ERROR;
    if (!display) { host->set_error(cx, "zinc:lvgl: start() first"); return ZN_ERROR; }
    for (size_t i = 0; i < sizeof kinds / sizeof kinds[0]; i++)
        if (!strcmp(kinds[i].kind, args[0].s.p)) {
            ret->i = adopt(cx, kinds[i].create(parent)); /* no parent: a new screen */
            return ret->i ? ZN_OK : ZN_ERROR;
        }
    host->set_error(cx, "zinc:lvgl: no such kind of object (obj, label, button, slider, switch, checkbox, arc, bar, chart, spinner, buttonmatrix, led, roller, line)");
    return ZN_ERROR;
}

int32_t zn_lvgl_child(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    lv_obj_t *c = lv_obj_get_child(o, (int32_t)args[1].i);
    const int h = c ? handle_of(c) : 0;
    ret->i = !c ? 0 : h > 0 && h <= MAX_OBJS && objs[h - 1] == c ? h : adopt(cx, c); /* a child LVGL made has no handle yet */
    return !c || ret->i ? ZN_OK : ZN_ERROR;
}

int32_t zn_lvgl_exists(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)cx;
    ret->i = args[0].i >= 1 && args[0].i <= MAX_OBJS && objs[args[0].i - 1];
    return ZN_OK;
}
int32_t zn_lvgl_remove(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret) { THE_OBJ(0); (void)ret; lv_obj_delete(o); return ZN_OK; }
int32_t zn_lvgl_clean(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret) { THE_OBJ(0); (void)ret; lv_obj_clean(o); return ZN_OK; }

int32_t zn_lvgl_setSize(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_obj_set_size(o, (int32_t)args[1].i, (int32_t)args[2].i);
    return ZN_OK;
}

int32_t zn_lvgl_setPos(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_obj_set_pos(o, (int32_t)args[1].i, (int32_t)args[2].i);
    return ZN_OK;
}

int32_t zn_lvgl_align(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_obj_align(o, (lv_align_t)args[1].i, (int32_t)args[2].i, (int32_t)args[3].i);
    return ZN_OK;
}

int32_t zn_lvgl_flex(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_obj_set_flex_flow(o, (lv_flex_flow_t)args[1].i);
    lv_obj_set_flex_align(o, (lv_flex_align_t)args[2].i, (lv_flex_align_t)args[3].i, (lv_flex_align_t)args[4].i);
    return ZN_OK;
}

int32_t zn_lvgl_flexGrow(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_obj_set_flex_grow(o, (uint8_t)args[1].i);
    return ZN_OK;
}

int32_t zn_lvgl_style(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_style_value_t v = {.num = (int32_t)args[2].i};
    lv_obj_set_local_style_prop(o, (lv_style_prop_t)args[1].i, v, (lv_style_selector_t)args[3].i);
    return ZN_OK;
}

int32_t zn_lvgl_styleColor(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_style_value_t v = {.color = lv_color_hex((uint32_t)args[2].i)};
    lv_obj_set_local_style_prop(o, (lv_style_prop_t)args[1].i, v, (lv_style_selector_t)args[3].i);
    return ZN_OK;
}

int32_t zn_lvgl_font(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    const int64_t px = args[1].i;
    const lv_font_t *f = px == 12 ? &lv_font_montserrat_12 : px == 14 ? &lv_font_montserrat_14 : px == 20 ? &lv_font_montserrat_20
                         : px == 28 ? &lv_font_montserrat_28 : NULL;
    if (!f) { host->set_error(cx, "zinc:lvgl: the fonts are Montserrat 12, 14, 20 and 28 px"); return ZN_ERROR; }
    lv_obj_set_style_text_font(o, f, (lv_style_selector_t)args[2].i);
    return ZN_OK;
}

int32_t zn_lvgl_flag(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    if (args[2].i) lv_obj_add_flag(o, (lv_obj_flag_t)args[1].i);
    else lv_obj_remove_flag(o, (lv_obj_flag_t)args[1].i);
    return ZN_OK;
}

int32_t zn_lvgl_state(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    if (args[2].i) lv_obj_add_state(o, (lv_state_t)args[1].i);
    else lv_obj_remove_state(o, (lv_state_t)args[1].i);
    return ZN_OK;
}

int32_t zn_lvgl_hasState(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    ret->i = lv_obj_has_state(o, (lv_state_t)args[1].i);
    return ZN_OK;
}

int32_t zn_lvgl_setText(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    if (lv_obj_check_type(o, &lv_label_class)) lv_label_set_text(o, args[1].s.p);
    else if (lv_obj_check_type(o, &lv_checkbox_class)) lv_checkbox_set_text(o, args[1].s.p);
    else { host->set_error(cx, "zinc:lvgl: setText() is for labels and check boxes"); return ZN_ERROR; }
    return ZN_OK;
}

int32_t zn_lvgl_setValue(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    const int32_t v = (int32_t)args[1].i;
    const lv_anim_enable_t anim = args[2].i ? LV_ANIM_ON : LV_ANIM_OFF;
    if (lv_obj_check_type(o, &lv_slider_class)) lv_slider_set_value(o, v, anim);
    else if (lv_obj_check_type(o, &lv_bar_class)) lv_bar_set_value(o, v, anim);
    else if (lv_obj_check_type(o, &lv_arc_class)) lv_arc_set_value(o, v);
    else if (lv_obj_check_type(o, &lv_roller_class)) lv_roller_set_selected(o, (uint32_t)v, anim);
    else { host->set_error(cx, "zinc:lvgl: setValue() is for sliders, bars, arcs and rollers"); return ZN_ERROR; }
    return ZN_OK;
}

int32_t zn_lvgl_value(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    if (lv_obj_check_type(o, &lv_slider_class)) ret->i = lv_slider_get_value(o);
    else if (lv_obj_check_type(o, &lv_bar_class)) ret->i = lv_bar_get_value(o);
    else if (lv_obj_check_type(o, &lv_arc_class)) ret->i = lv_arc_get_value(o);
    else if (lv_obj_check_type(o, &lv_roller_class)) ret->i = (int32_t)lv_roller_get_selected(o);
    else ret->i = lv_obj_has_state(o, LV_STATE_CHECKED); /* a switch, a check box, a checkable button */
    return ZN_OK;
}

int32_t zn_lvgl_setRange(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    const int32_t lo = (int32_t)args[1].i, hi = (int32_t)args[2].i;
    if (lv_obj_check_type(o, &lv_slider_class)) lv_slider_set_range(o, lo, hi);
    else if (lv_obj_check_type(o, &lv_bar_class)) lv_bar_set_range(o, lo, hi);
    else if (lv_obj_check_type(o, &lv_arc_class)) lv_arc_set_range(o, lo, hi);
    else { host->set_error(cx, "zinc:lvgl: setRange() is for sliders, bars and arcs"); return ZN_ERROR; }
    return ZN_OK;
}

int32_t zn_lvgl_setOptions(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    const char *s = args[1].s.p;
    if (lv_obj_check_type(o, &lv_roller_class)) {
        lv_roller_set_options(o, s, LV_ROLLER_MODE_NORMAL); /* copied */
        return ZN_OK;
    }
    if (!lv_obj_check_type(o, &lv_buttonmatrix_class)) { host->set_error(cx, "zinc:lvgl: setOptions() is for rollers and button matrices"); return ZN_ERROR; }
    /* LVGL keeps the map's pointers: one block with the array and the texts, freed with the object (on_delete) */
    size_t n = 1, len = strlen(s);
    for (const char *p = s; *p; p++) n += *p == '|' || *p == '\n' ? (*p == '\n' ? 2 : 1) : 0;
    char **map = lv_malloc((n + 1) * sizeof(char *) + 2 * len + n + 2); /* LVGL's memory: the computer's pool counts it, as the board's heap does */
    if (!map) { host->set_error(cx, "zinc:lvgl: out of memory"); return ZN_ERROR; }
    char *text = (char *)(map + n + 1);
    size_t k = 0;
    map[k++] = text;
    for (const char *p = s; *p; p++) {
        if (*p == '|' || *p == '\n') {
            *text++ = 0;
            if (*p == '\n') { map[k++] = text; *text++ = '\n'; *text++ = 0; }
            map[k++] = text;
        } else {
            *text++ = *p;
        }
    }
    *text++ = 0;
    map[k] = text; /* "" ends the map */
    *text = 0;
    lv_buttonmatrix_set_map(o, (const char *const *)map);
    lv_obj_add_event_cb(o, on_delete, LV_EVENT_DELETE, map);
    return ZN_OK;
}

int32_t zn_lvgl_selected(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    const uint32_t b = lv_obj_check_type(o, &lv_buttonmatrix_class) ? lv_buttonmatrix_get_selected_button(o) : LV_BUTTONMATRIX_BUTTON_NONE;
    ret->i = b == LV_BUTTONMATRIX_BUTTON_NONE ? -1 : (int32_t)b;
    return ZN_OK;
}

int32_t zn_lvgl_buttonText(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    const char *t = lv_obj_check_type(o, &lv_buttonmatrix_class) ? lv_buttonmatrix_get_button_text(o, (uint32_t)args[1].i) : NULL;
    if (!t) t = "";
    ret->s = host->ret_str(cx, t, (uint32_t)strlen(t));
    return ZN_OK;
}

int32_t zn_lvgl_scrollTo(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_obj_scroll_to(o, (int32_t)args[1].i, (int32_t)args[2].i, args[3].i ? LV_ANIM_ON : LV_ANIM_OFF);
    return ZN_OK;
}

int32_t zn_lvgl_scrollY(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    ret->i = lv_obj_get_scroll_y(o);
    return ZN_OK;
}

int32_t zn_lvgl_chartSetup(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    if (!lv_obj_check_type(o, &lv_chart_class)) { host->set_error(cx, "zinc:lvgl: not a chart"); return ZN_ERROR; }
    lv_chart_set_type(o, (lv_chart_type_t)args[1].i);
    lv_chart_set_point_count(o, (uint32_t)args[2].i);
    lv_chart_set_axis_range(o, LV_CHART_AXIS_PRIMARY_Y, (int32_t)args[3].i, (int32_t)args[4].i);
    return ZN_OK;
}

int32_t zn_lvgl_chartSeries(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    if (!lv_obj_check_type(o, &lv_chart_class)) { host->set_error(cx, "zinc:lvgl: not a chart"); return ZN_ERROR; }
    int k = 0;
    while (k < MAX_SERIES && series_chart[k]) k++;
    if (k == MAX_SERIES) { host->set_error(cx, "zinc:lvgl: 16 chart series at once at most"); return ZN_ERROR; }
    if (!(series[k] = lv_chart_add_series(o, lv_color_hex((uint32_t)args[1].i), LV_CHART_AXIS_PRIMARY_Y))) { host->set_error(cx, "zinc:lvgl: out of memory"); return ZN_ERROR; }
    series_chart[k] = o;
    ret->i = k;
    return ZN_OK;
}

int32_t zn_lvgl_chartPush(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    const int64_t s = args[1].i;
    if (s < 0 || s >= MAX_SERIES || series_chart[s] != o) { host->set_error(cx, "zinc:lvgl: no such chart series"); return ZN_ERROR; }
    lv_chart_set_next_value(o, series[s], (int32_t)args[2].i);
    return ZN_OK;
}

int32_t zn_lvgl_chartSet(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    const int64_t s = args[1].i;
    if (s < 0 || s >= MAX_SERIES || series_chart[s] != o) { host->set_error(cx, "zinc:lvgl: no such chart series"); return ZN_ERROR; }
    if (args[2].i < 0 || args[2].i >= (int64_t)lv_chart_get_point_count(o)) { host->set_error(cx, "zinc:lvgl: no such chart point"); return ZN_ERROR; }
    lv_chart_set_series_value_by_id(o, series[s], (uint32_t)args[2].i, (int32_t)args[3].i);
    lv_chart_refresh(o);
    return ZN_OK;
}

/* ---- Lottie: an animation of LottieFiles' JSON (ThorVG reads and copies it) drawn by ThorVG into a buffer of w x h pixels, 4 bytes each, in
   LVGL's memory and freed with the object (on_delete). LVGL plays it in a loop and draws a frame only while the object is visible. */
int32_t zn_lvgl_lottie(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    lv_obj_t *parent = get(cx, args[0].i);
    (void)self;
    if (!parent) return ZN_ERROR;
    const int32_t w = (int32_t)args[2].i, h = (int32_t)args[3].i;
    if (w < 1 || h < 1 || w > 1024 || h > 1024) { host->set_error(cx, "zinc:lvgl: lottie() takes a width and a height of 1 to 1024 pixels"); return ZN_ERROR; }
    void *buf = lv_malloc(lv_draw_buf_width_to_stride(w, LV_COLOR_FORMAT_ARGB8888_PREMULTIPLIED) * h + LV_DRAW_BUF_ALIGN);
    if (!buf) { host->set_error(cx, "zinc:lvgl: no memory left for the animation's buffer (4 bytes a pixel): make it smaller"); return ZN_ERROR; }
    lv_obj_t *o = lv_lottie_create(parent);
    if (!(ret->i = adopt(cx, o))) { lv_free(buf); return ZN_ERROR; }
    lv_obj_add_event_cb(o, on_delete, LV_EVENT_DELETE, buf);
    lv_lottie_set_buffer(o, w, h, buf);
    lv_lottie_set_src_data(o, args[1].s.p, args[1].s.n);
    if (lv_lottie_get_anim(o)->end_value <= 0) {
        lv_obj_delete(o);
        host->set_error(cx, "zinc:lvgl: lottie(): ThorVG could not read the animation (a Lottie JSON, as LottieFiles exports it)");
        return ZN_ERROR;
    }
    return ZN_OK;
}

extern const lv_obj_class_t lv_lottie_class; /* lv_lottie.c defines it; no header of LVGL 9.6 declares it */

static lv_obj_t *the_lottie(ZnCtx *cx, int64_t h)
{
    lv_obj_t *o = get(cx, h);
    if (o && !lv_obj_check_type(o, &lv_lottie_class)) { host->set_error(cx, "zinc:lvgl: not a Lottie animation"); return NULL; }
    return o;
}

int32_t zn_lvgl_lottiePlay(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    lv_obj_t *o = the_lottie(cx, args[0].i);
    (void)self;
    (void)ret;
    if (!o) return ZN_ERROR;
    if (args[1].i) lv_anim_resume(lv_lottie_get_anim(o));
    else lv_anim_pause(lv_lottie_get_anim(o));
    return ZN_OK;
}

int32_t zn_lvgl_lottieRestart(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    lv_obj_t *o = the_lottie(cx, args[0].i);
    (void)self;
    (void)ret;
    if (!o) return ZN_ERROR;
    lv_lottie_get_anim(o)->act_time = 0; /* the first frame at the next turn */
    return ZN_OK;
}

static void on_event(lv_event_t *e)
{
    if (queue_count == QUEUE) return; /* a program that does not read its events loses the newest */
    const int h = handle_of((lv_obj_t *)lv_event_get_current_target(e));
    queue[(queue_head + queue_count++) % QUEUE] = h * 256 + (int)lv_event_get_code(e);
}

int32_t zn_lvgl_listen(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    THE_OBJ(0);
    (void)ret;
    lv_obj_add_event_cb(o, on_event, (lv_event_code_t)args[1].i, NULL);
    return ZN_OK;
}

int32_t zn_lvgl_nextEvent(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self;
    (void)cx;
    (void)args;
    ret->i = -1;
    if (!queue_count) return ZN_OK;
    ret->i = queue[queue_head];
    queue_head = (queue_head + 1) % QUEUE;
    queue_count--;
    return ZN_OK;
}

static int32_t init(const ZnHostApi *h, void **self)
{
    host = h;
    *self = 0;
    return ZN_OK;
}

static const ZnExport exports[] = {ZN_lvgl_EXPORTS};

const ZnModule *zn_module_Lvgl(void)
{
    static const ZnModule m = {ZN_ABI_VERSION, sizeof(ZnModule), "Lvgl", exports, sizeof exports / sizeof exports[0], 0, 0, 0, init, 0, 0};
    return &m;
}
