/* zinc:wifi (js/modules/wifi.js), in the network image only (ZN_NET): the station, the setup portal (WiFiManager's way: an open access
   point whose page saves the network a phone picks, every name answered with the board's address so that the phone opens the page by
   itself), the clock (SNTP), the board's name on the network (mDNS, zinc-xxxx.local) and the update server (mod_update.c). Wi-Fi's events
   arrive on the event loop's task and are posted to the JavaScript task as ZN_EV_WIFI, the state in `a`. The network is kept in NVS,
   namespace "zinc.wifi", out of the program's keys. Wi-Fi and BLE do not fit together beside the JavaScript heap: zn_radio decides. */
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <time.h>

#include "esp_netif.h" /* before dns_server.h, which uses its types */
#include "dns_server.h"
#include "esp_bt.h"
#include "esp_event.h"
#include "esp_http_server.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_wifi.h"
#include "lwip/inet.h"
#include "mdns.h"
#include "nvs.h"
#include "zn.h"

enum { OFF, CONNECTING, CONNECTED, SETUP, SCANNED = 100 };
static const char *const STATES[] = {"off", "connecting", "connected", "setup"};
static int state, tries, inited, joined_once, quiet, wanted; /* wanted: the station was asked for (not only ESP-NOW or a scan) */ /* quiet: started by the firmware for updates, no portal */
static char name[16], portal[33], ssid[33], pass[65], ip[16], message[96];
static esp_netif_t *sta, *ap;
static dns_server_handle_t dns;
static httpd_handle_t http;
static wifi_ap_record_t seen[10];
static uint16_t nseen;
static int scan_for_js;

/* ---- the radio: Wi-Fi (zinc:wifi, zinc:espnow, the update server) or BLE, the first asked keeps it until the board restarts */
static int radio_owner; /* 0 none, 1 Wi-Fi, 2 BLE */
int zn_radio(JSContext *ctx, int ble)
{
    const int want = ble ? 2 : 1;
    if (radio_owner == want) return 0;
    if (radio_owner) {
        if (ctx)
            JS_ThrowInternalError(ctx, ble ? "zinc:ble: Wi-Fi has the radio (zinc:wifi, zinc:espnow or the update server); BLE and Wi-Fi do not fit "
                                             "together in the ESP32's memory: use one of them in a program"
                                           : "zinc:wifi: BLE has the radio (zinc:ble); BLE and Wi-Fi do not fit together in the ESP32's memory: use one "
                                             "of them in a program");
        return -1;
    }
    radio_owner = want;
    if (!ble) esp_bt_controller_mem_release(ESP_BT_MODE_BTDM); /* the Bluetooth controller's reserved RAM goes to the heap */
    return 0;
}

const char *zn_board_name(void)
{
    if (!name[0]) {
        uint8_t mac[6];
        esp_read_mac(mac, ESP_MAC_WIFI_STA);
        snprintf(name, sizeof name, "zinc-%02x%02x", mac[4], mac[5]);
    }
    return name;
}

static void post(int s, const char *why)
{
    state = s;
    snprintf(message, sizeof message, "%s", why ? why : "");
    zn_post(ZN_EV_WIFI, s, 0, NULL, 0);
}

static void load(void)
{
    nvs_handle_t h;
    size_t n1 = sizeof ssid, n2 = sizeof pass;
    ssid[0] = pass[0] = 0;
    if (nvs_open("zinc.wifi", NVS_READONLY, &h) != ESP_OK) return;
    if (nvs_get_str(h, "ssid", ssid, &n1) != ESP_OK || nvs_get_str(h, "pass", pass, &n2) != ESP_OK) ssid[0] = pass[0] = 0;
    nvs_close(h);
}

static void save(void)
{
    nvs_handle_t h;
    if (nvs_open("zinc.wifi", NVS_READWRITE, &h) != ESP_OK) return;
    nvs_set_str(h, "ssid", ssid);
    nvs_set_str(h, "pass", pass);
    nvs_commit(h);
    nvs_close(h);
}

static void join(void)
{
    wifi_config_t c = {0};
    memcpy(c.sta.ssid, ssid, strlen(ssid));
    memcpy(c.sta.password, pass, strlen(pass));
    c.sta.threshold.authmode = pass[0] ? WIFI_AUTH_WPA_PSK : WIFI_AUTH_OPEN;
    esp_wifi_set_config(WIFI_IF_STA, &c);
    tries = 0;
    post(CONNECTING, NULL);
    esp_wifi_connect();
}

/* ---- the setup portal: the page, the form, every unknown address sent to the page */

static void html(httpd_req_t *req, const char *s) /* text escaped for HTML */
{
    char out[8];
    for (const char *p = s; *p; p++) {
        const char *e = *p == '<' ? "&lt;" : *p == '>' ? "&gt;" : *p == '&' ? "&amp;" : *p == '"' ? "&quot;" : NULL;
        if (e) httpd_resp_sendstr_chunk(req, e);
        else {
            out[0] = *p;
            out[1] = 0;
            httpd_resp_sendstr_chunk(req, out);
        }
    }
}

static const char PAGE_HEAD[] =
    "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><title>Zinc setup</title><style>body{font:17px "
    "system-ui,sans-serif;margin:24px auto;max-width:420px;padding:0 16px;background:#101418;color:#e8eaed}input,select,button{font:inherit;"
    "width:100%;box-sizing:border-box;padding:12px;margin:6px 0 14px;border-radius:8px;border:1px solid #445}button{background:#4f8cff;"
    "color:#fff;border:0}small{color:#9aa}</style><h2>";

static esp_err_t page_get(httpd_req_t *req)
{
    if (!dns) return zn_update_page(req); /* no portal open: the board's page */
    httpd_resp_set_type(req, "text/html");
    httpd_resp_sendstr_chunk(req, PAGE_HEAD);
    html(req, zn_board_name());
    httpd_resp_sendstr_chunk(req, "</h2>");
    if (message[0]) {
        httpd_resp_sendstr_chunk(req, "<p>");
        html(req, message);
        httpd_resp_sendstr_chunk(req, "</p>");
    }
    httpd_resp_sendstr_chunk(req, "<form method=post action=/save><label>Network<select name=s><option value=''>Other (below)</option>");
    for (int i = 0; i < nseen; i++) {
        httpd_resp_sendstr_chunk(req, "<option>");
        html(req, (const char *)seen[i].ssid);
        httpd_resp_sendstr_chunk(req, "</option>");
    }
    httpd_resp_sendstr_chunk(req, "</select></label><label>Other network<input name=o autocapitalize=none></label><label>Password<input "
                                  "name=p type=password></label><button>Join</button></form><small>The board keeps the network and joins "
                                  "it at each start.</small>");
    return httpd_resp_sendstr_chunk(req, NULL);
}

static void url_decode(char *s)
{
    char *o = s;
    for (; *s; s++, o++) {
        if (*s == '+') *o = ' ';
        else if (*s == '%' && s[1] && s[2]) {
            const char hex[3] = {s[1], s[2], 0};
            *o = (char)strtol(hex, NULL, 16);
            s += 2;
        } else *o = *s;
    }
    *o = 0;
}

static esp_err_t page_save(httpd_req_t *req)
{
    char body[256], s[100], o[100], p[200];
    const int n = httpd_req_recv(req, body, req->content_len < sizeof body - 1 ? req->content_len : sizeof body - 1);
    if (n <= 0) return ESP_FAIL;
    body[n] = 0;
    s[0] = o[0] = p[0] = 0;
    httpd_query_key_value(body, "s", s, sizeof s);
    httpd_query_key_value(body, "o", o, sizeof o);
    httpd_query_key_value(body, "p", p, sizeof p);
    url_decode(s);
    url_decode(o);
    url_decode(p);
    snprintf(ssid, sizeof ssid, "%s", o[0] ? o : s);
    snprintf(pass, sizeof pass, "%s", p);
    httpd_resp_set_type(req, "text/html");
    httpd_resp_sendstr_chunk(req, PAGE_HEAD);
    httpd_resp_sendstr_chunk(req, "Joining ");
    html(req, ssid);
    httpd_resp_sendstr_chunk(req, "</h2><p>The board's screen shows the result. If it cannot join, this network comes back: open the page "
                                  "again.</p>");
    httpd_resp_sendstr_chunk(req, NULL);
    if (ssid[0]) {
        save();
        join();
    }
    return ESP_OK;
}

static esp_err_t not_found(httpd_req_t *req, httpd_err_code_t err)
{
    if (!dns) return httpd_resp_send_err(req, HTTPD_404_NOT_FOUND, "not found");
    httpd_resp_set_status(req, "303 See Other");
    httpd_resp_set_hdr(req, "Location", "http://192.168.4.1/");
    return httpd_resp_sendstr(req, "the setup page"); /* iOS wants a body to see a portal */
}

static void serve(void)
{
    if (http) return;
    httpd_config_t c = HTTPD_DEFAULT_CONFIG();
    c.stack_size = 6144; /* the update handlers stream into the flash */
    c.max_open_sockets = 4;
    c.lru_purge_enable = true;
    c.recv_wait_timeout = 10;
    if (httpd_start(&http, &c) != ESP_OK) return;
    static const httpd_uri_t root = {.uri = "/", .method = HTTP_GET, .handler = page_get}, form = {.uri = "/save", .method = HTTP_POST, .handler = page_save};
    httpd_register_uri_handler(http, &root);
    httpd_register_uri_handler(http, &form);
    httpd_register_err_handler(http, HTTPD_404_NOT_FOUND, not_found);
    zn_update_register(http);
}

static void open_portal(const char *why)
{
    if (quiet) { /* the firmware's own connection for updates: no portal, it tries again later */
        post(CONNECTING, why);
        return;
    }
    wifi_config_t c = {0};
    const char *n = portal[0] ? portal : zn_board_name();
    memcpy(c.ap.ssid, n, strlen(n));
    c.ap.ssid_len = strlen(n);
    c.ap.channel = 1;
    c.ap.max_connection = 2;
    c.ap.authmode = WIFI_AUTH_OPEN;
    esp_wifi_set_mode(WIFI_MODE_APSTA); /* the station half lists the networks for the page */
    esp_wifi_set_config(WIFI_IF_AP, &c);
    static char uri[] = "http://192.168.4.1";
    esp_netif_dhcps_stop(ap);
    esp_netif_dhcps_option(ap, ESP_NETIF_OP_SET, ESP_NETIF_CAPTIVEPORTAL_URI, uri, strlen(uri)); /* DHCP option 114 */
    esp_netif_dhcps_start(ap);
    serve();
    if (!dns) {
        dns_server_config_t d = DNS_SERVER_CONFIG_SINGLE("*", "WIFI_AP_DEF");
        dns = start_dns_server(&d);
    }
    esp_wifi_scan_start(NULL, false);
    post(SETUP, why);
    printf("mqjs: wifi setup portal open: join the network %s and open any page\n", n);
    zn_update_announce(); /* the update server answers on the portal's network too */
}

static void close_portal(void)
{
    if (dns) stop_dns_server(dns);
    dns = NULL;
    esp_wifi_set_mode(WIFI_MODE_STA);
}

static void on_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        if (!wanted) return;
        if (ssid[0]) join();
        else open_portal(NULL);
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        ip[0] = 0;
        if (state == OFF || !ssid[0]) return;
        if (state == CONNECTED || ++tries < 4 || joined_once) { /* a network that worked once is tried again and again */
            if (state != CONNECTING) post(CONNECTING, NULL);
            esp_wifi_connect();
        } else if (state == CONNECTING) {
            char why[96];
            snprintf(why, sizeof why, "Could not join %s: check the password.", ssid);
            open_portal(why);
            if (quiet) esp_wifi_connect();
        }
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_SCAN_DONE) {
        nseen = sizeof seen / sizeof seen[0];
        esp_wifi_scan_get_ap_records(&nseen, seen);
        if (scan_for_js) {
            char out[sizeof seen / sizeof seen[0] * 44];
            size_t n = 0;
            for (int i = 0; i < nseen; i++)
                n += snprintf(out + n, sizeof out - n, "%s%s\t%d\t%d", i ? "\n" : "", (const char *)seen[i].ssid, seen[i].rssi, seen[i].authmode != WIFI_AUTH_OPEN);
            scan_for_js = 0;
            zn_post(ZN_EV_WIFI, SCANNED, nseen, out, n);
        }
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *e = data;
        inet_ntoa_r(e->ip_info.ip.addr, ip, sizeof ip);
        joined_once = 1;
        if (dns) close_portal();
        serve();
        static int once;
        if (!once) {
            once = 1;
            esp_sntp_config_t s = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
            esp_netif_sntp_init(&s);
            if (mdns_init() == ESP_OK) {
                mdns_hostname_set(zn_board_name());
                mdns_service_add(NULL, "_zinc", "_tcp", 80, NULL, 0);
            }
        }
        printf("mqjs: wifi connected to %s as %s.local (%s)\n", ssid, zn_board_name(), ip);
        zn_update_announce();
        post(CONNECTED, NULL);
    }
}

/* the driver, once: the station and the access point's interfaces, buffers cut to the least (sdkconfig.net) */
int zn_wifi_init(JSContext *ctx)
{
    if (inited) return 0;
    if (zn_radio(ctx, 0)) return -1;
    esp_netif_init();
    esp_event_loop_create_default();
    sta = esp_netif_create_default_wifi_sta();
    ap = esp_netif_create_default_wifi_ap();
    wifi_init_config_t c = WIFI_INIT_CONFIG_DEFAULT();
    if (esp_wifi_init(&c) != ESP_OK) {
        if (ctx) JS_ThrowInternalError(ctx, "zinc:wifi: the Wi-Fi driver does not start (free heap %u)", (unsigned)esp_get_free_heap_size());
        return -1;
    }
    esp_wifi_set_storage(WIFI_STORAGE_RAM);
    esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, on_event, NULL);
    esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, on_event, NULL);
    esp_netif_set_hostname(sta, zn_board_name());
    esp_wifi_set_mode(WIFI_MODE_STA);
    inited = 1;
    return 0;
}

static int driver_on;
void zn_wifi_up(void) /* the driver started once (WIFI_EVENT_STA_START), for the station or for ESP-NOW */
{
    if (driver_on) return;
    driver_on = 1;
    esp_wifi_start();
}

static void begin(void)
{
    wanted = 1;
    load();
    if (!driver_on) { /* WIFI_EVENT_STA_START joins or opens the portal */
        zn_wifi_up();
        return;
    }
    if (!ssid[0]) { /* forgotten: the portal, even when the station is still on the network */
        if (!dns) {
            esp_wifi_disconnect();
            open_portal(NULL);
        }
        return;
    }
    if (state != CONNECTED && state != CONNECTING) join();
}

/* after the program's first run, in the network image: a board that knows a network joins it, for zinc's updates over Wi-Fi, unless
   the program took the radio (BLE, ESP-NOW on its own channel) */
void zn_wifi_auto(void)
{
    if (radio_owner || inited) return;
    load();
    if (!ssid[0]) return;
    quiet = 1;
    if (zn_wifi_init(NULL) == 0) begin();
}

/* start(portal, timezone) */
ZN_FN(js_wifi_start)
{
    char tz[64];
    if (argc > 0 && zn_str(ctx, argv[0], portal, sizeof portal) < 0) return JS_EXCEPTION;
    if (argc > 1 && zn_str(ctx, argv[1], tz, sizeof tz) < 0) return JS_EXCEPTION;
    if (argc > 1 && tz[0]) {
        setenv("TZ", tz, 1);
        tzset();
    }
    if (zn_wifi_init(ctx)) return JS_EXCEPTION;
    quiet = 0;
    if (state != OFF) zn_post(ZN_EV_WIFI, state, 0, NULL, 0); /* already running: the listener hears the state */
    begin();
    return JS_UNDEFINED;
}

/* connect(ssid, password): kept, and joined */
ZN_FN(js_wifi_connect)
{
    if (zn_str(ctx, argc > 0 ? argv[0] : JS_UNDEFINED, ssid, sizeof ssid) < 0 || zn_str(ctx, argc > 1 ? argv[1] : JS_UNDEFINED, pass, sizeof pass) < 0)
        return JS_EXCEPTION;
    if (zn_wifi_init(ctx)) return JS_EXCEPTION;
    save();
    joined_once = 0;
    wanted = 1;
    if (!driver_on) zn_wifi_up();
    else join();
    return JS_UNDEFINED;
}

ZN_FN(js_wifi_forget)
{
    nvs_handle_t h;
    if (nvs_open("zinc.wifi", NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_all(h);
        nvs_commit(h);
        nvs_close(h);
    }
    ssid[0] = pass[0] = 0;
    joined_once = 0;
    return JS_UNDEFINED;
}

ZN_FN(js_wifi_stop)
{
    if (!inited || state == OFF) return JS_UNDEFINED;
    if (dns) close_portal();
    wanted = 0;
    post(OFF, NULL);
    esp_wifi_disconnect();
    esp_wifi_stop();
    driver_on = 0;
    return JS_UNDEFINED;
}

/* state, network, address, signal, the board's name, the portal's network, the last failure: joined by tabs (wifi.js splits them) */
ZN_FN(js_wifi_info)
{
    char out[200];
    wifi_ap_record_t r;
    const int rssi = state == CONNECTED && esp_wifi_sta_get_ap_info(&r) == ESP_OK ? r.rssi : 0;
    const int n = snprintf(out, sizeof out, "%s\t%s\t%s\t%d\t%s\t%s\t%s", STATES[state], state == SETUP ? "" : ssid, ip, rssi, zn_board_name(),
                           portal[0] ? portal : zn_board_name(), message);
    return JS_NewStringLen(ctx, out, n < (int)sizeof out ? n : (int)sizeof out - 1);
}

ZN_FN(js_wifi_scan)
{
    if (zn_wifi_init(ctx)) return JS_EXCEPTION;
    zn_wifi_up();
    scan_for_js = 1;
    if (esp_wifi_scan_start(NULL, false) != ESP_OK) zn_post(ZN_EV_WIFI, SCANNED, 0, "", 0);
    return JS_UNDEFINED;
}

/* the local time once SNTP has set it, else "" */
ZN_FN(js_wifi_clock)
{
    time_t now = time(NULL);
    if (now < 1700000000) return JS_NewString(ctx, "");
    struct tm t;
    localtime_r(&now, &t);
    char out[24];
    const size_t n = strftime(out, sizeof out, "%Y-%m-%d %H:%M:%S", &t);
    return JS_NewStringLen(ctx, out, n);
}
