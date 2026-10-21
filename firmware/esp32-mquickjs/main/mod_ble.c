/* zinc:ble (js/modules/ble.js; plugins/ble is the Mac's side, docs/plugins/ble.md), in the network image only (ZN_NET), on NimBLE: the
   board advertises the Nordic UART Service and a central (the Mac) connects, writes RX and is notified on TX; a scan reports the
   devices that advertise the service. Messages are UTF-8 text ended by '\n', cut here (whole messages reach JavaScript, never half of a
   character). NimBLE's task posts ZN_EV_BLE: a = 1 open (b the connection, the text the central's address), 2 closed, 3 a message, 4 a
   device seen (b its RSSI, the text "address\tname"), 5 the scan ended. One link at a time (CONFIG_BT_NIMBLE_MAX_CONNECTIONS). */
#include <string.h>

#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "zn.h"

enum { EV_OPEN = 1, EV_CLOSE, EV_MESSAGE, EV_DEVICE, EV_SCAN_END };
#define MAX_MESSAGE 512

static const ble_uuid128_t NUS = BLE_UUID128_INIT(0x9e, 0xca, 0xdc, 0x24, 0x0e, 0xe5, 0xa9, 0xe0, 0x93, 0xf3, 0xa3, 0xb5, 0x01, 0x00, 0x40, 0x6e),
                           RX = BLE_UUID128_INIT(0x9e, 0xca, 0xdc, 0x24, 0x0e, 0xe5, 0xa9, 0xe0, 0x93, 0xf3, 0xa3, 0xb5, 0x02, 0x00, 0x40, 0x6e),
                           TX = BLE_UUID128_INIT(0x9e, 0xca, 0xdc, 0x24, 0x0e, 0xe5, 0xa9, 0xe0, 0x93, 0xf3, 0xa3, 0xb5, 0x03, 0x00, 0x40, 0x6e);
static uint16_t tx_handle, conn = BLE_HS_CONN_HANDLE_NONE, mtu = 23;
static uint8_t own_addr_type;
static int started, synced, advertising;
static char adv_name[30];
static char partial[MAX_MESSAGE];
static size_t npartial;

static void addr_text(const ble_addr_t *a, char out[18])
{
    const uint8_t *v = a->val; /* least significant byte first */
    snprintf(out, 18, "%02x:%02x:%02x:%02x:%02x:%02x", v[5], v[4], v[3], v[2], v[1], v[0]);
}

static int rx_access(uint16_t c, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    if (ctxt->op != BLE_GATT_ACCESS_OP_WRITE_CHR) return 0;
    uint8_t buf[256];
    uint16_t n = 0;
    if (ble_hs_mbuf_to_flat(ctxt->om, buf, sizeof buf, &n)) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    for (uint16_t i = 0; i < n; i++) {
        if (buf[i] != '\n') partial[npartial++] = buf[i];
        if (buf[i] == '\n' || npartial == sizeof partial) { /* a message, or a piece of one too long */
            zn_post(ZN_EV_BLE, EV_MESSAGE, c, partial, npartial);
            npartial = 0;
        }
    }
    return 0;
}

static int tx_access(uint16_t c, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg) { return 0; }

static const struct ble_gatt_svc_def services[] = {
    {.type = BLE_GATT_SVC_TYPE_PRIMARY,
     .uuid = &NUS.u,
     .characteristics =
         (struct ble_gatt_chr_def[]){
             {.uuid = &RX.u, .access_cb = rx_access, .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP},
             {.uuid = &TX.u, .access_cb = tx_access, .val_handle = &tx_handle, .flags = BLE_GATT_CHR_F_NOTIFY},
             {0},
         }},
    {0},
};

static int gap_event(struct ble_gap_event *e, void *arg);

static void advertise(void)
{
    if (!synced || !advertising || conn != BLE_HS_CONN_HANDLE_NONE) return;
    struct ble_hs_adv_fields f = {0}, r = {0};
    f.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    f.uuids128 = &NUS; /* the service in the advertisement (what a central filters on), the name in the scan response: 31 bytes each */
    f.num_uuids128 = 1;
    f.uuids128_is_complete = 1;
    r.name = (const uint8_t *)adv_name;
    r.name_len = strlen(adv_name);
    r.name_is_complete = 1;
    ble_gap_adv_set_fields(&f);
    ble_gap_adv_rsp_set_fields(&r);
    struct ble_gap_adv_params p = {.conn_mode = BLE_GAP_CONN_MODE_UND, .disc_mode = BLE_GAP_DISC_MODE_GEN};
    ble_gap_adv_start(own_addr_type, NULL, BLE_HS_FOREVER, &p, gap_event, NULL);
}

static int gap_event(struct ble_gap_event *e, void *arg)
{
    switch (e->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (e->connect.status) advertise();
        else {
            struct ble_gap_conn_desc d;
            char a[18] = "";
            conn = e->connect.conn_handle;
            mtu = 23;
            npartial = 0;
            if (ble_gap_conn_find(conn, &d) == 0) addr_text(&d.peer_id_addr, a);
            zn_post(ZN_EV_BLE, EV_OPEN, conn, a, strlen(a));
        }
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        zn_post(ZN_EV_BLE, EV_CLOSE, e->disconnect.conn.conn_handle, NULL, 0);
        conn = BLE_HS_CONN_HANDLE_NONE;
        advertise();
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        advertise();
        break;
    case BLE_GAP_EVENT_MTU:
        mtu = e->mtu.value;
        break;
    case BLE_GAP_EVENT_DISC: { /* the service in the advertisement, the name often in the scan response that follows it */
        static ble_addr_t uart_seen[8];
        static unsigned nseen;
        struct ble_hs_adv_fields f;
        if (ble_hs_adv_parse_fields(&f, e->disc.data, e->disc.length_data)) break;
        int uart = 0, known = 0;
        for (int i = 0; i < f.num_uuids128; i++) uart |= ble_uuid_cmp(&f.uuids128[i].u, &NUS.u) == 0;
        for (unsigned i = 0; i < nseen && i < 8; i++) known |= ble_addr_cmp(&uart_seen[i], &e->disc.addr) == 0;
        if (uart && !known) uart_seen[nseen++ % 8] = e->disc.addr;
        if (!(uart || known) || !f.name_len) break;
        char out[18 + 32];
        addr_text(&e->disc.addr, out);
        out[17] = '\t';
        const int n = f.name_len < 31 ? f.name_len : 31;
        memcpy(out + 18, f.name, n);
        zn_post(ZN_EV_BLE, EV_DEVICE, e->disc.rssi, out, 18 + n);
        break;
    }
    case BLE_GAP_EVENT_DISC_COMPLETE:
        zn_post(ZN_EV_BLE, EV_SCAN_END, 0, NULL, 0);
        break;
    }
    return 0;
}

static void on_sync(void)
{
    ble_hs_util_ensure_addr(0);
    ble_hs_id_infer_auto(0, &own_addr_type);
    synced = 1;
    advertise();
}

static void host_task(void *arg)
{
    nimble_port_run();
    nimble_port_freertos_deinit();
}

static int start(JSContext *ctx)
{
    if (started) return 0;
    if (zn_radio(ctx, 1)) return -1;
    if (nimble_port_init() != ESP_OK) {
        JS_ThrowInternalError(ctx, "zinc:ble: the Bluetooth controller does not start (free heap %u)", (unsigned)esp_get_free_heap_size());
        return -1;
    }
    ble_hs_cfg.sync_cb = on_sync;
    ble_svc_gap_init();
    ble_svc_gatt_init();
    if (ble_gatts_count_cfg(services) || ble_gatts_add_svcs(services)) {
        JS_ThrowInternalError(ctx, "zinc:ble: the UART service cannot be added");
        return -1;
    }
    ble_svc_gap_device_name_set(adv_name[0] ? adv_name : zn_board_name());
    nimble_port_freertos_init(host_task);
    started = 1;
    return 0;
}

/* '' when BLE can be used, 'wifi' when Wi-Fi has the radio */
ZN_FN(js_ble_state) { return JS_NewString(ctx, zn_radio(NULL, 1) ? "wifi" : ""); }

/* advertise(name): the UART service under `name` until stop(); a central that connects is a link */
ZN_FN(js_ble_advertise)
{
    if (zn_str(ctx, argc > 0 ? argv[0] : JS_UNDEFINED, adv_name, sizeof adv_name) < 0) return JS_EXCEPTION;
    if (!adv_name[0]) snprintf(adv_name, sizeof adv_name, "%s", zn_board_name());
    if (start(ctx)) return JS_EXCEPTION;
    ble_svc_gap_device_name_set(adv_name);
    advertising = 1;
    if (synced) {
        ble_gap_adv_stop();
        advertise();
    }
    return JS_UNDEFINED;
}

/* scan(seconds): the devices seen, until stopScan() or `seconds` (0: until stopScan) */
ZN_FN(js_ble_scan)
{
    int seconds;
    if (zn_int(ctx, argc, argv, 0, &seconds) || start(ctx)) return JS_EXCEPTION;
    for (int i = 0; !synced && i < 100; i++) vTaskDelay(pdMS_TO_TICKS(10)); /* the controller's first sync: a few ms */
    struct ble_gap_disc_params p = {.passive = 0, .filter_duplicates = 0}; /* the scan responses too */
    ble_gap_disc_cancel();
    if (ble_gap_disc(own_addr_type, seconds > 0 ? seconds * 1000 : BLE_HS_FOREVER, &p, gap_event, NULL))
        return JS_ThrowInternalError(ctx, "zinc:ble scan: the scan does not start");
    return JS_UNDEFINED;
}

ZN_FN(js_ble_stop_scan)
{
    if (started && ble_gap_disc_cancel() == 0) zn_post(ZN_EV_BLE, EV_SCAN_END, 0, NULL, 0);
    return JS_UNDEFINED;
}

/* send(link, text): text already ended by '\n' (ble.js), notified on TX in pieces of the link's MTU */
ZN_FN(js_ble_send)
{
    int c;
    JSCStringBuf tmp;
    size_t len;
    if (zn_int(ctx, argc, argv, 0, &c)) return JS_EXCEPTION;
    const char *s = JS_ToCStringLen(ctx, &len, argc > 1 ? argv[1] : JS_UNDEFINED, &tmp);
    if (!s) return JS_EXCEPTION;
    if (c != conn) return JS_ThrowInternalError(ctx, "ble: the link is not open");
    const size_t piece = mtu > 3 ? mtu - 3 : 20;
    for (size_t at = 0; at < len; at += piece) {
        struct os_mbuf *om = ble_hs_mbuf_from_flat(s + at, len - at < piece ? len - at : piece);
        int rc = om ? ble_gatts_notify_custom(conn, tx_handle, om) : BLE_HS_ENOMEM;
        for (int tries = 0; rc == BLE_HS_ENOMEM && tries < 50; tries++) { /* the controller's buffers are full: let them go out */
            vTaskDelay(pdMS_TO_TICKS(10));
            om = ble_hs_mbuf_from_flat(s + at, len - at < piece ? len - at : piece);
            rc = om ? ble_gatts_notify_custom(conn, tx_handle, om) : BLE_HS_ENOMEM;
        }
        if (rc) return JS_ThrowInternalError(ctx, "ble: the link takes no more now (it closed, or the central does not read)");
    }
    return JS_UNDEFINED;
}

ZN_FN(js_ble_close)
{
    int c;
    if (zn_int(ctx, argc, argv, 0, &c)) return JS_EXCEPTION;
    if (started && c == conn) ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM);
    return JS_UNDEFINED;
}

ZN_FN(js_ble_stop)
{
    if (!started) return JS_UNDEFINED;
    advertising = 0;
    ble_gap_adv_stop();
    ble_gap_disc_cancel();
    if (conn != BLE_HS_CONN_HANDLE_NONE) ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM);
    return JS_UNDEFINED;
}
