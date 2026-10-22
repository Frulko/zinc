/* zinc:qrcode on the native ABI (include/zn/native.h, the export table of zinc_native_qrcode_abi.h that zinc generates from qrcode.spec.ts):
   C with no runtime type, so the same file builds the plugin's library on the computer and goes into the ESP32's mquickjs firmware. */
#include "zinc_native_qrcode_abi.h"
#include "vendor/qrcodegen.h"

#ifndef QRCODE_MAX_VERSION
#define QRCODE_MAX_VERSION 20 /* 97 x 97 modules; the two buffers are static: 2.4 KB of RAM on the ESP32 */
#endif

static const ZnHostApi *host;
static uint8_t code[qrcodegen_BUFFER_LEN_FOR_VERSION(QRCODE_MAX_VERSION)], scratch[qrcodegen_BUFFER_LEN_FOR_VERSION(QRCODE_MAX_VERSION)];

int32_t zn_qrcode_encode(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    static const enum qrcodegen_Ecc ECC[] = {qrcodegen_Ecc_LOW, qrcodegen_Ecc_MEDIUM, qrcodegen_Ecc_QUARTILE, qrcodegen_Ecc_HIGH};
    const int64_t ecc = args[1].i, max = args[2].i;
    (void)self;
    if (ecc < 0 || ecc > 3) { host->set_error(cx, "zinc:qrcode: ecc is 0 (low) to 3 (high)"); return ZN_ERROR; }
    if (max < 1 || max > QRCODE_MAX_VERSION) { host->set_error(cx, "zinc:qrcode: the version is 1 to 20 at most"); return ZN_ERROR; }
    ret->v.p = 0;
    ret->v.n = 0;
    if (!qrcodegen_encodeText(args[0].s.p, scratch, code, ECC[ecc], qrcodegen_VERSION_MIN, (int)max, qrcodegen_Mask_AUTO, true)) return ZN_OK;
    const int size = qrcodegen_getSize(code), row = (size + 7) / 8;
    uint8_t *out = (uint8_t *)host->ret_buf(cx, (uint32_t)(1 + size * row));
    if (!out) { host->set_error(cx, "zinc:qrcode: out of memory"); return ZN_ERROR; }
    out[0] = (uint8_t)size;
    for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++) {
            uint8_t *b = out + 1 + y * row + x / 8;
            if (x % 8 == 0) *b = 0;
            if (qrcodegen_getModule(code, x, y)) *b |= (uint8_t)(0x80 >> (x % 8));
        }
    ret->v.p = out;
    ret->v.n = (uint32_t)(1 + size * row);
    return ZN_OK;
}

static int32_t init(const ZnHostApi *h, void **self)
{
    host = h;
    *self = 0;
    return ZN_OK;
}

static const ZnExport exports[] = {ZN_qrcode_EXPORTS};

const ZnModule *zn_module_Qrcode(void)
{
    static const ZnModule m = {ZN_ABI_VERSION, sizeof(ZnModule), "Qrcode", exports, sizeof exports / sizeof exports[0], 0, 0, 0, init, 0, 0};
    return &m;
}
