/* Run the pinned tracker's unchanged callback through CUI's public offscreen API. */
#define _POSIX_C_SOURCE 200809L
#define cui_app_run cui_compare_app_run
#include "tracker.c"
#undef cui_app_run
#include <cui/cui_render.h>
#include <time.h>
#include <stdlib.h>

static double now(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (double)t.tv_sec + (double)t.tv_nsec * 1e-9;
}

static int count(const char *key, int fallback) {
    const char *s = getenv(key);
    return s ? atoi(s) : fallback;
}

int cui_compare_app_run(const cui_app_desc *desc, void (*callback)(cui_ctx *, void *), void *user) {
    int frames = count("CUI_COMPARE_FRAMES", 120), skip = count("CUI_COMPARE_SKIP", 30);
    if (frames < 1 || frames > 4096 || skip < 0 || skip >= frames) return 2;
    cui_sw_renderer *sw = cui_sw_create();
    if (!sw) return 1;
    cui_ctx *ui = cui_create(&(cui_ctx_desc){ .renderer = cui_sw_iface(sw), .theme = desc->theme, .accent = desc->accent });
    if (!ui) { cui_sw_destroy(sw); return 1; }
    int w = desc->width, h = desc->height;
    unsigned char *pixels = malloc((size_t)w * (size_t)h * 4);
    if (!pixels) { cui_destroy(ui); cui_sw_destroy(sw); return 1; }
    cui_set_viewport(ui, (float)w, (float)h, 1);
    cui_sw_set_incremental(sw, true);
    printf("cui compare json: {\"window\":[%d,%d],\"scale\":1,\"skipped\":%d,\"frames\":[", w, h, skip);
    for (int i = 0; i < frames; ++i) {
        double t0 = now();
        cui_begin_frame(ui, 1 / 60.0f);
        callback(ui, user);
        cui_end_frame(ui);
        double t1 = now();
        const cui_draw_data *dd = cui_get_draw_data(ui);
        cui_sw_render(sw, dd, pixels, dd->width_px, dd->height_px, dd->width_px * 4, CUI_SW_RGBA);
        double t2 = now();
        if (i >= skip) printf("%s[%.3f,%.3f]", i == skip ? "" : ",", (t1 - t0) * 1e6, (t2 - t1) * 1e6);
    }
    printf("]}\n");
    const char *shot = getenv("CUI_COMPARE_SHOT");
    bool ok = !shot || cui_write_png(shot, pixels, w, h, w * 4);
    free(pixels);
    cui_destroy(ui);
    cui_sw_destroy(sw);
    return ok ? 0 : 1;
}
