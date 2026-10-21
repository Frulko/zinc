/* The update server of the network image (ZN_NET), on the HTTP server of mod_wifi.c once the board is on a network: what
   `zinc run --host <board>` talks to. GET /info (no token): the board, its firmware and its program's state, as JSON. With the header
   X-Zinc-Token (generated at the first start, kept in NVS "zinc.sys", printed on the UART, which zinc reads and keeps): POST /js, a
   program image as zinc writes it over USB, into the js partition, its header last (a cut upload leaves no program, never half of one);
   POST /ota, a firmware into the other slot, which the bootloader runs next and leaves when it does not start (rollback); GET
   /log?from=N, the console's output from byte N (X-Zinc-Log-End: where it ends now, X-Zinc-State: running, ended or failed). The
   JavaScript task is stopped before the flash is written (zn_pause) and the board restarts after. */
#include <string.h>

#include "esp_app_desc.h"
#include "esp_http_server.h"
#include "esp_ota_ops.h"
#include "esp_partition.h"
#include "esp_random.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs.h"
#include "zn.h"

static char token[33];

static const char *the_token(void)
{
    if (token[0]) return token;
    nvs_handle_t h;
    size_t n = sizeof token;
    if (nvs_open("zinc.sys", NVS_READWRITE, &h) != ESP_OK) return token;
    if (nvs_get_str(h, "token", token, &n) != ESP_OK || strlen(token) != 32) {
        uint8_t r[16];
        esp_fill_random(r, sizeof r); /* the radio is on: true random numbers */
        for (int i = 0; i < 16; i++) snprintf(token + 2 * i, 3, "%02x", r[i]);
        nvs_set_str(h, "token", token);
        nvs_commit(h);
    }
    nvs_close(h);
    return token;
}

void zn_update_announce(void) { printf("mqjs: update token %s\n", the_token()); }

static int authorised(httpd_req_t *req)
{
    char got[40] = {0};
    unsigned diff = httpd_req_get_hdr_value_str(req, "X-Zinc-Token", got, sizeof got) != ESP_OK;
    const char *want = the_token();
    for (int i = 0; i < 32; i++) diff |= (unsigned)(got[i] ^ want[i]); /* the same time whatever matches */
    if (!diff) return 1;
    vTaskDelay(pdMS_TO_TICKS(500));
    httpd_resp_send_err(req, HTTPD_401_UNAUTHORIZED, "X-Zinc-Token: the token the board printed on its UART");
    return 0;
}

static const char *const PROGRAM[] = {"running", "ended", "failed", "none"};

static esp_err_t info_get(httpd_req_t *req)
{
    const esp_app_desc_t *d = esp_app_get_description();
    char out[200];
    snprintf(out, sizeof out, "{\"name\":\"%s\",\"firmware\":\"%s\",\"sha\":\"%02x%02x%02x%02x\",\"slot\":\"%s\",\"heap\":%u,\"program\":\"%s\"}",
             zn_board_name(), d->project_name, d->app_elf_sha256[0], d->app_elf_sha256[1], d->app_elf_sha256[2], d->app_elf_sha256[3],
             esp_ota_get_running_partition()->label, (unsigned)esp_get_free_heap_size(), PROGRAM[zn_program_state]);
    httpd_resp_set_type(req, "application/json");
    return httpd_resp_sendstr(req, out);
}

esp_err_t zn_update_page(httpd_req_t *req)
{
    const esp_app_desc_t *d = esp_app_get_description();
    char out[400];
    snprintf(out, sizeof out, "<!doctype html><meta name=viewport content='width=device-width'><title>%s</title><body style='font:17px "
             "system-ui;margin:24px'><h2>%s</h2><p>Firmware %s, program %s, %u bytes free.</p><p><code>zinc run &lt;app&gt; --host %s.local"
             "</code> sends a program.</p>", zn_board_name(), zn_board_name(), d->project_name, PROGRAM[zn_program_state],
             (unsigned)esp_get_free_heap_size(), zn_board_name());
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_sendstr(req, out);
}

static uint8_t chunk[2048]; /* static: off the server's stack */

static int receive(httpd_req_t *req, int n)
{
    for (int tries = 0; tries < 5; tries++) {
        const int got = httpd_req_recv(req, (char *)chunk, n);
        if (got != HTTPD_SOCK_ERR_TIMEOUT) return got;
    }
    return -1;
}

static void restart(httpd_req_t *req, const char *what)
{
    httpd_resp_sendstr(req, what);
    printf("mqjs: %s, restarting\n", what);
    vTaskDelay(pdMS_TO_TICKS(300));
    esp_restart();
}

static esp_err_t js_post(httpd_req_t *req)
{
    if (!authorised(req)) return ESP_OK;
    const esp_partition_t *p = esp_partition_find_first(0x40, ESP_PARTITION_SUBTYPE_ANY, "js");
    const size_t len = req->content_len;
    if (!p || len < 9 || len > p->size / 2) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "a program image is 9 bytes to half of the js partition");
    zn_pause("Receiving a program");
    uint8_t head[8];
    size_t off = 0;
    esp_err_t e = esp_partition_erase_range(p, 0, (len + 4095) & ~4095u);
    while (e == ESP_OK && off < len) {
        const int n = receive(req, len - off < sizeof chunk ? len - off : sizeof chunk);
        if (n <= 0) break;
        size_t skip = 0;
        if (off < 8) {
            skip = 8 - off < (size_t)n ? 8 - off : (size_t)n;
            memcpy(head + off, chunk, skip);
        }
        if ((size_t)n > skip) e = esp_partition_write(p, off + skip, chunk + skip, n - skip);
        off += n;
    }
    if (e != ESP_OK || off != len || memcmp(head, "ZNJS", 4)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "the upload was cut or is not a program image; the board has no program now");
        vTaskDelay(pdMS_TO_TICKS(300));
        esp_restart();
    }
    esp_partition_write(p, 0, head, sizeof head); /* the header last */
    restart(req, "program received");
    return ESP_OK;
}

static esp_err_t ota_post(httpd_req_t *req)
{
    if (!authorised(req)) return ESP_OK;
    const esp_partition_t *dst = esp_ota_get_next_update_partition(NULL);
    esp_ota_handle_t h;
    const size_t len = req->content_len;
    if (!dst || len < 1024 || len > dst->size) return httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "a firmware is 1 KB to the size of a slot");
    zn_pause("Updating the firmware");
    if (esp_ota_begin(dst, OTA_WITH_SEQUENTIAL_WRITES, &h) != ESP_OK) return httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "esp_ota_begin");
    size_t off = 0;
    while (off < len) {
        const int n = receive(req, len - off < sizeof chunk ? len - off : sizeof chunk);
        if (n <= 0 || esp_ota_write(h, chunk, n) != ESP_OK) break;
        off += n;
    }
    if (off != len || esp_ota_end(h) != ESP_OK || esp_ota_set_boot_partition(dst) != ESP_OK) { /* esp_ota_end checks the image */
        if (off != len) esp_ota_abort(h);
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "the firmware was cut or is not valid; the board keeps the one it has");
        vTaskDelay(pdMS_TO_TICKS(300));
        esp_restart();
    }
    restart(req, "firmware received");
    return ESP_OK;
}

static esp_err_t log_get(httpd_req_t *req)
{
    if (!authorised(req)) return ESP_OK;
    char q[32], v[16];
    size_t from = 0;
    if (httpd_req_get_url_query_str(req, q, sizeof q) == ESP_OK && httpd_query_key_value(q, "from", v, sizeof v) == ESP_OK) from = strtoul(v, NULL, 10);
    static char out[ZN_LOG_SIZE];
    size_t end;
    const size_t n = zn_log_read(from, out, &end);
    char hdr[16];
    snprintf(hdr, sizeof hdr, "%u", (unsigned)end);
    httpd_resp_set_hdr(req, "X-Zinc-Log-End", hdr);
    httpd_resp_set_hdr(req, "X-Zinc-State", PROGRAM[zn_program_state]);
    httpd_resp_set_type(req, "text/plain");
    return httpd_resp_send(req, out, n);
}

void zn_update_register(httpd_handle_t http)
{
    static const httpd_uri_t uris[] = {
        {.uri = "/info", .method = HTTP_GET, .handler = info_get},
        {.uri = "/js", .method = HTTP_POST, .handler = js_post},
        {.uri = "/ota", .method = HTTP_POST, .handler = ota_post},
        {.uri = "/log", .method = HTTP_GET, .handler = log_get},
    };
    for (size_t i = 0; i < sizeof uris / sizeof uris[0]; i++) httpd_register_uri_handler(http, &uris[i]);
}
