/* zinc:espnow (js/modules/espnow.js), in the network image only (ZN_NET): packets of up to 250 bytes between boards, with no access
   point, on the Wi-Fi radio (the station's channel when the board is on a network: every board must be on the same one). The radio's
   callbacks run on Wi-Fi's task and post ZN_EV_ESPNOW: a = 0 received (b the RSSI, the text the sender's address then the data), a = 1
   or 2 sent or not acknowledged (b the send's id). */
#include <stdio.h>
#include <string.h>

#include "esp_mac.h"
#include "esp_now.h"
#include "esp_wifi.h"
#include "zn.h"

static int started, last_id;
static volatile int sending[8]; /* the ids of the sends waiting for their callback, in order (the radio answers in order) */
static volatile unsigned head, tail;

static void mac_text(const uint8_t *m, char out[18]) { snprintf(out, 18, "%02x:%02x:%02x:%02x:%02x:%02x", m[0], m[1], m[2], m[3], m[4], m[5]); }

static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len)
{
    char buf[17 + ESP_NOW_MAX_DATA_LEN];
    mac_text(info->src_addr, buf);
    memcpy(buf + 17, data, len);
    zn_post(ZN_EV_ESPNOW, 0, info->rx_ctrl ? info->rx_ctrl->rssi : 0, buf, 17 + len);
}

static void on_sent(const esp_now_send_info_t *tx, esp_now_send_status_t status)
{
    if (head == tail) return;
    const int id = sending[tail++ % 8];
    zn_post(ZN_EV_ESPNOW, status == ESP_NOW_SEND_SUCCESS ? 1 : 2, id, NULL, 0);
}

static int parse_mac(const char *s, uint8_t m[6])
{
    unsigned v[6];
    if (sscanf(s, "%2x:%2x:%2x:%2x:%2x:%2x", &v[0], &v[1], &v[2], &v[3], &v[4], &v[5]) != 6) return -1;
    for (int i = 0; i < 6; i++) m[i] = (uint8_t)v[i];
    return 0;
}

/* start(channel): 0 keeps the station's, else 1 to 13 when the board is not on a network */
ZN_FN(js_espnow_start)
{
    int channel;
    if (zn_int(ctx, argc, argv, 0, &channel)) return JS_EXCEPTION;
    if (started) return JS_UNDEFINED;
    if (zn_wifi_init(ctx)) return JS_EXCEPTION;
    zn_wifi_up();
    if (channel > 0 && esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE) != ESP_OK)
        return JS_ThrowRangeError(ctx, "zinc:espnow start: channel %d cannot be set (1 to 13, and not while on a network: the network's is used)", channel);
    esp_wifi_set_ps(WIFI_PS_NONE); /* a radio that sleeps misses packets */
    if (esp_now_init() != ESP_OK) return JS_ThrowInternalError(ctx, "zinc:espnow start: esp_now_init failed");
    esp_now_register_recv_cb(on_recv);
    esp_now_register_send_cb(on_sent);
    esp_now_peer_info_t all = {.channel = 0, .ifidx = WIFI_IF_STA, .encrypt = false};
    memset(all.peer_addr, 0xff, 6);
    esp_now_add_peer(&all);
    started = 1;
    return JS_UNDEFINED;
}

/* send(to, data): the send's id, which the callback names */
ZN_FN(js_espnow_send)
{
    char to[24];
    static char data[ESP_NOW_MAX_DATA_LEN + 2];
    uint8_t mac[6];
    if (!started) return JS_ThrowInternalError(ctx, "zinc:espnow send: call start() first");
    if (zn_str(ctx, argc > 0 ? argv[0] : JS_UNDEFINED, to, sizeof to) < 0) return JS_EXCEPTION;
    if (parse_mac(to, mac)) return JS_ThrowTypeError(ctx, "zinc:espnow send: %s is not an address (aa:bb:cc:dd:ee:ff, or BROADCAST)", to);
    const int n = zn_str(ctx, argc > 1 ? argv[1] : JS_UNDEFINED, data, sizeof data);
    if (n < 0) return JS_EXCEPTION;
    if (n > ESP_NOW_MAX_DATA_LEN) return JS_ThrowRangeError(ctx, "zinc:espnow send: %d bytes at most in a packet", ESP_NOW_MAX_DATA_LEN);
    if (!esp_now_is_peer_exist(mac)) {
        esp_now_peer_info_t p = {.channel = 0, .ifidx = WIFI_IF_STA, .encrypt = false};
        memcpy(p.peer_addr, mac, 6);
        if (esp_now_add_peer(&p) != ESP_OK) return JS_ThrowRangeError(ctx, "zinc:espnow send: no room for another board (20 at most)");
    }
    if (head - tail >= 8) return JS_ThrowInternalError(ctx, "zinc:espnow send: 8 packets wait for the radio already: send after onSent");
    const int id = ++last_id;
    sending[head++ % 8] = id;
    if (esp_now_send(mac, (const uint8_t *)data, n) != ESP_OK) {
        head--;
        return JS_ThrowInternalError(ctx, "zinc:espnow send: the radio refused the packet");
    }
    return JS_NewInt32(ctx, id);
}

ZN_FN(js_espnow_address)
{
    uint8_t m[6];
    char out[18];
    esp_read_mac(m, ESP_MAC_WIFI_STA);
    mac_text(m, out);
    return JS_NewStringLen(ctx, out, 17);
}

ZN_FN(js_espnow_stop)
{
    if (started) esp_now_deinit();
    started = 0;
    head = tail = 0;
    return JS_UNDEFINED;
}
