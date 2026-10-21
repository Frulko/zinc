# ESP32: Wi-Fi, captive portal, OTA, mDNS and ESP-NOW on 4 MB / no PSRAM

Date: 2026-10-22. Scope: classic ESP32-D0WD-V3, 4 MB flash, no PSRAM, ESP-IDF 5.5.5 (`~/.zinc/esp-idf`, tag v5.5.5), firmware in `firmware/esp32-mquickjs`.
No build and no board access were used. Marks: **[measured]** = a number from a run reported by someone else (source given), **[read]** = checked in the IDF tree on this Mac, **[estimate]** = my reasoning, to be measured on the board. We measured nothing ourselves yet.

Starting facts [read]: `partitions.csv` has nvs 0x9000 (24 KB), phy_init 0xf000, factory 0x10000 (1 MB), js 0x110000 (512 KB). The current app is `build/zinc-mquickjs.bin`, 321,088 bytes, with no Wi-Fi.

## 1. Wi-Fi station with the least RAM

### What the driver takes

- Static buffers are DMA memory taken from the heap in `esp_wifi_init()` and given back in `esp_wifi_deinit()`. Dynamic buffers are taken per frame and freed after use. Peak dynamic use is `p = b_rx*m_rx + b_tx*m_tx` (Wi-Fi driver guide, "Wi-Fi Buffer Usage").
- Defaults [read, `components/esp_wifi/Kconfig`]: static RX 10 (about 1.6 KB each), dynamic RX 32, dynamic TX 32, static TX 16 (only if static TX is chosen), RX management buffers 5 static (about 500 bytes each), AMPDU TX and RX on, BA window 6, WPA3-SAE on, SoftAP support on, IRAM optimisations on.
- Espressif's own "minimum" rank for a chip without PSRAM [source 1]: static RX 4, dynamic RX 8, dynamic TX 8, RX BA window disabled (i.e. AMPDU RX off), TCP send buffer 8 KB, TCP window 8 KB, Wi-Fi IRAM opt on. Reported cost: TCP 25.6 / 27.8 Mbit/s (TX/RX), far above what a JavaScript device needs. Note the doc says static RX below 6 is not recommended unless AMPDU is disabled, so the two go together.

### sdkconfig for the smallest station (add to `sdkconfig.defaults`)

```
# Wi-Fi: small and boring. Dynamic TX buffers are the default and already right without PSRAM.
CONFIG_ESP_WIFI_STATIC_RX_BUFFER_NUM=4
CONFIG_ESP_WIFI_DYNAMIC_RX_BUFFER_NUM=8
CONFIG_ESP_WIFI_DYNAMIC_TX_BUFFER_NUM=8
CONFIG_ESP_WIFI_AMPDU_TX_ENABLED=n
CONFIG_ESP_WIFI_AMPDU_RX_ENABLED=n
CONFIG_ESP_WIFI_RX_MGMT_BUF_NUM_DEF=3
CONFIG_ESP_WIFI_MGMT_SBUF_NUM=6
CONFIG_ESP_WIFI_ENABLE_WPA3_SAE=n          # WPA2-PSK only; saves flash and the SAE heap work (see below)
CONFIG_ESP_WIFI_NVS_ENABLED=n              # we keep the credentials ourselves in our own NVS namespace
CONFIG_ESP_WIFI_RX_IRAM_OPT=n              # frees about 17 KB of IRAM [source 4]; slower RX, irrelevant here
CONFIG_ESP_WIFI_IRAM_OPT=n                 # frees more than 10 KB of IRAM [read, Kconfig help]
CONFIG_LWIP_TCP_SND_BUF_DEFAULT=5760       # default, 4 x MSS; do not raise
CONFIG_LWIP_TCP_WND_DEFAULT=5760
CONFIG_LWIP_MAX_SOCKETS=8                  # HTTP server wants 3 for itself; 4 usable (see section 3)
CONFIG_LWIP_TCP_RECVMBOX_SIZE=6
CONFIG_LWIP_TCPIP_RECVMBOX_SIZE=16
CONFIG_LWIP_IPV6=n                         # about 7 KB of RAM while running, 39 KB of flash [source 2]
CONFIG_ESP_COEX_SW_COEXIST_ENABLE=y        # only if BLE is ever used with Wi-Fi [source 4]
```

Notes on the choices:

- AMPDU off: this is Espressif's own "minimum" setting, not a hack. Cost: lower throughput on a busy 802.11n network. A program upload is about 100 KB at most, so it does not matter. [estimate] on the effect with real routers.
- WPA3 off: the Kconfig option exists [read, line 301]. Disabling means the board cannot join a WPA3-only (SAE) network; WPA2/WPA3 mixed networks still work with WPA2. I have no measured saving: [estimate] a few KB of flash and a transient heap peak at association. Keep it on if the first-run experience on new routers matters more than 5 KB; I would turn it off only after measuring.
- `ESP_WIFI_IRAM_OPT=n` and `RX_IRAM_OPT=n` move Wi-Fi code from IRAM to flash. On the classic ESP32 IRAM and DRAM are separate pools, but the free IRAM left goes into the same capability heap that `malloc` can use for 32-bit-access data, so it can raise the "free heap" figure. [estimate]
- `esp_netif`, `esp_event`, NVS and the lwIP task are needed in any case.
- Power save: `esp_wifi_set_ps(WIFI_PS_MIN_MODEM)` is the default for stations; it lowers current, not RAM. For ESP-NOW receive use `WIFI_PS_NONE` (section 5).

### RAM taken after `esp_wifi_start`

- [measured, Espressif] ESP32, release/v5.5, default sdkconfig, "application free memory": empty project 366 K, Wi-Fi station example 230 K, BLE gatt_server 205 K, BLE+Wi-Fi provisioning example 140 K [source 5]. Delta for Wi-Fi station = 136 K. Caution: this figure appears to count all heap pools, including IRAM that default Wi-Fi code occupies, so it overstates the DRAM cost. It is not comparable with our "280 KB free" which is DRAM we can use.
- [measured, community] Arduino-ESP32 on ESP-WROOM-32: free heap 311,588 to 265,932 after `WiFi.mode(WIFI_STA)`, that is 45.6 KB [source 6]; a forum report gives 41 to 46 KB after `WiFi.begin()` [source 7]. Arduino uses the default buffer counts above, so this is the default-config cost.
- [estimate] With the settings above, tuned station before any socket: about 25 to 35 KB. Reasoning: static RX 4 x 1.6 = 6.4 KB, 3 management buffers 1.5 KB, Wi-Fi/`esp_timer`-like task stacks and driver state about 12 to 15 KB (taken from the 45 KB default minus 6 static RX buffers = 9.6 KB saved, and dynamic peaks reduced), lwIP/`tcpip_thread` stack 3 KB, netif and event loop about 3 KB. Must be measured with `heap_caps_get_free_size(MALLOC_CAP_INTERNAL)` before `esp_wifi_init`, after `esp_wifi_init`, after `esp_wifi_start`, and after `IP_EVENT_STA_GOT_IP`.
- Add [estimate] 8 to 13 KB transient dynamic buffers while traffic flows (8 RX x about 1.6 KB).

### Order matters: allocate the JavaScript heap first

The 96 KiB JavaScript heap needs one contiguous block. Wi-Fi and lwIP allocate and free many small pieces at runtime and can fragment the heap. Allocate the JS heap (and any framebuffer) at boot before `esp_wifi_init`, and log `heap_caps_get_largest_free_block()` after each Wi-Fi step.

### Stopping Wi-Fi to give RAM back

```c
esp_wifi_disconnect();
esp_wifi_stop();
esp_wifi_deinit();                       /* frees the static RX/TX buffers (guide: "freed in esp_wifi_deinit") */
esp_netif_destroy_default_wifi(sta_netif);  /* if you created it with esp_netif_create_default_wifi_sta */
```

- `mdns_free()` and `esp_http_server` `httpd_stop()` first.
- Not everything comes back: netif, event-loop and `tcpip_thread` stay (they cannot be created twice cleanly in all versions). [estimate] 5 to 10 KB stays allocated. The safe way to get the whole budget back is a reboot. For a "no network" program, simply do not start Wi-Fi at all: Wi-Fi is initialised only when the program imports `zinc:wifi`.
- Wi-Fi PHY calibration data costs nothing extra when `phy_init` data is used; leave `CONFIG_ESP_PHY_INIT_DATA_IN_PARTITION` as is.

## 2. A WiFiManager equivalent on ESP-IDF

### Candidates

| Option | Licence | Size and complexity | Fit for a screen board |
|---|---|---|---|
| IDF `examples/protocols/http_server/captive_portal` [read] | Example code: Unlicense OR CC0-1.0 (copy freely). `dns_server.c` is 290 lines in the example's `components/dns_server`, header says Unlicense OR CC0-1.0. `main.c` 195 lines, `root.html` 259 bytes | Smallest. Needs only `esp_http_server` (which we need for OTA anyway) and the 290-line DNS server | Best: it is exactly WiFiManager's trick (AP + DNS that answers every name with the AP address + HTTP 404 handler that redirects to the form) |
| `tonyp7/esp32-wifi-manager` [source 8] | MIT | 282 commits, 780 stars, 31 open issues, no GitHub releases, written for IDF 4.2 (ESP32 and ESP32-S2). Own HTTP server code, cJSON, own NVS layer and a web UI. Does not state RAM | Works in principle, but old and larger; every IDF change since 4.2 (esp_netif, event API, lwIP) is on us. [estimate] needs porting work for 5.5. Use as a reference for the form and for the retry logic only |
| `wifi_provisioning` in IDF 5.5.5 [read, `components/wifi_provisioning`] (and `espressif/network_provisioning` 1.4.0 on the registry, which is the successor and also covers Thread [source 9]) | Apache-2.0 (IDF; registry page does not print the licence) | protocomm + protobuf-c + mbedTLS (X25519/AES for security 1, SRP6a for security 2). Transports: SoftAP (HTTP), BLE (GATT), console [source 10] | It needs Espressif's phone apps (ESP SoftAP Prov / ESP BLE Prov) or `tools/esp_prov`; no browser captive portal. Good security (proof of possession), but BLE costs about 90 KB of RAM (the 140 K vs 230 K figure above [measured]) and the apps are another thing to explain to makers |
| Improv Wi-Fi serial [source 11] | Protocol open; SDKs Apache-2.0 (`sdk-cpp`, `sdk-serial-js`, `sdk-ble-js`, Android, iOS) [source 12] | Tiny binary protocol on the UART | No screen needed, works from `zinc` on the computer. See below |

### Improv serial from the `zinc` CLI

- Packet [source 11]: `"IMPROV"`, version `1`, type (`0x01` current state, `0x02` error, `0x03` RPC command, `0x04` RPC result), length, data, checksum (sum of bytes, low byte). RPC commands: `0x01` send Wi-Fi settings (SSID, password), `0x02` request state, `0x03` device info (firmware name, version, chip, device name), `0x04` scan networks, `0x05` hostname.
- ESPHome uses this SDK for Wi-Fi setup [source 13]. I did not verify the WLED claim.
- Yes, `zinc` can provision over USB: `zinc flash` already opens the serial port, so `zinc wifi setup` could open it (at the console baud), send `0x03` to identify the board, `0x04` to list networks, ask the user (or on macOS read the current SSID and the Keychain entry with the user's consent), send `0x01`, and wait for state `0x04` (provisioned) with the redirect URL string, which can carry `http://zinc-xxxx.local`. The computer then knows the address.
- Device side: about 150 lines of C to parse and answer, one task or a poll in the existing UART reader (stack 2 to 3 KB, freed after provisioning) [estimate]. Pitfall: the UART also carries log output and our console; Improv packets begin with the `IMPROV` marker so a parser can pick them out of the stream, as ESPHome does. The firmware must read UART0 itself while in "setup" state, and `zinc` must not hold the port for the monitor at the same time.
- Browser path for free: `improv-wifi/sdk-serial-js` (Apache-2.0) gives a website Web Serial setup with no code from us [source 12].

### Recommendation for a board with a screen

Use the **IDF captive-portal example** (copy `dns_server` and the flow of `main.c`; Unlicense/CC0 means no attribution is needed, but keep a note in `third_party/README.md` as the rule asks) plus an Improv serial responder as a second, optional front door.

Flow [read, adapted from the example]:

1. No saved credentials (or three failed connects) means setup mode: `WIFI_MODE_APSTA` so a scan works, SSID `zinc-xxxx` (last bytes of the MAC), open or a printed WPA2 password, AP address 192.168.4.1, DHCP option for the captive portal URI (`CONFIG_ESP_ENABLE_DHCP_CAPTIVEPORTAL`, `ESP_NETIF_CAPTIVEPORTAL_URI`, in the example already).
2. The LCD shows the AP name and a QR code in the standard Wi-Fi format `WIFI:T:nopass;S:zinc-ab12;;` (or `T:WPA;P:password;`). Phone cameras on iOS and Android join from the QR; the OS then probes its captive-portal URL, the DNS server answers with 192.168.4.1, and the sign-in sheet opens by itself. Note from the example: iOS needs a response body on the redirect, so the 404 handler sends text after the 302 [read, main.c line 133].
3. The form posts SSID and password. Save them to NVS (`zinc` namespace), `esp_wifi_set_mode(WIFI_MODE_STA)`, connect, show the result and `zinc-xxxx.local` on the LCD, stop the DNS server and the AP (the example's `stop_dns_server`).
4. Setup mode is a separate boot state: the JavaScript program is not running, so the portal has all the RAM (no need to fit it in the 90 KB budget).

Smallest code [estimate]: the example's two C files (485 lines), plus about 150 lines for scan, form parse and NVS, plus an HTML page of a few KB embedded in flash. RAM in setup mode [estimate]: Wi-Fi AP+STA tuned 35 to 45 KB, httpd 4 KB stack plus sockets, DNS task about 3 KB.

Security: an open AP exposes the password the user types to anyone nearby on a plain HTTP page. For makers and classrooms this is the WiFiManager norm; offer an optional printed PIN that must be typed into the form. SoftAP provisioning with security 1 (proof of possession) is the stronger answer, at the price of the phone apps.

## 3. OTA

### Partition table for 4 MB (proposal A: keep `js` where it is)

`nvs` 0x9000 +0x6000 (24 KB); `phy_init` 0xf000; the table lives at 0x8000 and the bootloader at 0x1000 (up to 28 KB) [read, IDF defaults].

```
# Name,    Type, SubType, Offset,   Size
nvs,       data, nvs,     0x9000,   0x6000
phy_init,  data, phy,     0xf000,   0x1000
otadata,   data, ota,     0x10000,  0x2000
ota_0,     app,  ota_0,   0x20000,  0xF0000    # 960 KB, ends 0x110000
js,        0x40, 0x00,    0x110000, 0x80000    # unchanged: 512 KB
ota_1,     app,  ota_1,   0x190000, 0xF0000    # 960 KB, ends 0x280000
storage,   data, spiffs,  0x280000, 0x180000   # 1.5 MB free to 0x400000 (reserve; nothing uses it yet)
```

- App partitions must start at a multiple of 0x10000 [read, IDF partition rules]; otadata needs 0x2000 (two 4 KB sectors) [read, `partitions_two_ota.csv`].
- No `factory` entry: with a blank otadata the bootloader runs `ota_0` [IDF behaviour, estimate from `partitions_two_ota` docs]. `zinc flash` must then write the app at 0x20000 instead of 0x10000 (a change in the flasher and in `tools/build-esp32-core`).
- Is 960 KB enough? Today's app is 321 KB without Wi-Fi [measured, file size]. Wi-Fi + lwIP + esp_http_server + mbedTLS parts + mDNS at `-Os` typically add 400 to 600 KB [estimate]; so 750 to 950 KB. It is close to the limit. Check the size of the first build with Wi-Fi before fixing the table.
- Proposal B if A is too small: move `js` to the end and grow the slots. nvs, phy_init, otadata as above; `ota_0` 0x20000 size 0x180000 (1.5 MB); `ota_1` 0x1A0000 size 0x180000; `js` 0x320000 size 0x80000; free 0x3A0000 to 0x400000 (384 KB). This changes the `js` offset that `zinc` knows (0x110000), so the program writer must read the table instead of the constant.
- A partition table cannot be updated by OTA: the first Wi-Fi-capable firmware must be flashed once over USB with the new table, bootloader included (rollback needs a bootloader built with the option below).

### Firmware OTA with `esp_http_server`

Headers [read]: `esp_ota_begin(partition, image_size, &handle)`; `image_size` may be `OTA_SIZE_UNKNOWN` (erases the whole partition first) or `OTA_WITH_SEQUENTIAL_WRITES` (erases incrementally while writing, avoids a long stall) in `components/app_update/include/esp_ota_ops.h`.

```c
static esp_err_t ota_post(httpd_req_t *req) {
    if (!authorised(req)) { httpd_resp_send_err(req, HTTPD_401_UNAUTHORIZED, "token"); return ESP_FAIL; }
    const esp_partition_t *dst = esp_ota_get_next_update_partition(NULL);
    esp_ota_handle_t h;
    if (req->content_len == 0 || req->content_len > dst->size) { httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "size"); return ESP_FAIL; }
    if (esp_ota_begin(dst, OTA_WITH_SEQUENTIAL_WRITES, &h) != ESP_OK) return ESP_FAIL;
    static char buf[2048];                              /* static: keep it off the 4 KB httpd stack */
    int left = req->content_len;
    while (left > 0) {
        int n = httpd_req_recv(req, buf, MIN(left, sizeof buf));
        if (n == HTTPD_SOCK_ERR_TIMEOUT) continue;      /* retry */
        if (n <= 0 || esp_ota_write(h, buf, n) != ESP_OK) { esp_ota_abort(h); return ESP_FAIL; }
        left -= n;
    }
    if (esp_ota_end(h) != ESP_OK || esp_ota_set_boot_partition(dst) != ESP_OK) return ESP_FAIL; /* esp_ota_end checks the image header and SHA */
    httpd_resp_sendstr(req, "ok");
    vTaskDelay(pdMS_TO_TICKS(300)); esp_restart();
}
```

- `httpd_req_recv` is a stream: RAM does not grow with the body, only the 2 to 4 KB buffer. A 900 KB upload is fine. A POST body must not be read with `HTTPD_MAX_REQ_HDR_LEN` limits in mind: that limit (1024 default, Kconfig [read]) is for headers only.
- Give the HTTP server a bigger stack for this handler: `config.stack_size = 6144` [estimate; default 4096 is in `HTTPD_DEFAULT_CONFIG`, read], and `config.recv_wait_timeout = 10` for slow clients.
- Pause the JavaScript program while writing flash? Flash writes stall both cores' cache access for a few ms per sector; the engine keeps running between sectors. [estimate] Pausing it during OTA is simpler and avoids input glitches; it is also the moment to free the JS heap.
- Client: `curl -H "X-Zinc-Token: $T" --data-binary @zinc-mquickjs.bin http://zinc-ab12.local/ota`.

### Rollback

```
CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y     # [read: components/bootloader/Kconfig.projbuild]
```

With it, a freshly OTA-written slot boots in state `ESP_OTA_IMG_PENDING_VERIFY`. If the new firmware resets before it calls `esp_ota_mark_app_valid_cancel_rollback()` the bootloader marks it aborted and boots the previous slot. Call it once the app has proved itself: for Zinc, after the JavaScript runtime has started and (if a network is configured) the station got an IP, or after N seconds without a panic. To roll back by hand: `esp_ota_mark_app_invalid_rollback_and_reboot()`. This is software rollback; the eFuse anti-rollback (version numbers) is a separate, irreversible option and is not needed.

### Updating only the `js` partition over HTTP

Use `esp_partition_find_first(0x40, 0x00, NULL)` (the data type 0x40 as in `partitions.csv`). No `esp_ota_*` for it: it is not an app. Rules from `esp_partition.h` [read]: erase before write, `esp_partition_erase_range(p, offset, size)` with offset and size multiples of the 4096-byte sector; writes sequential in any size.

```c
static esp_err_t js_post(httpd_req_t *req) {
    const esp_partition_t *p = esp_partition_find_first(0x40, 0x00, NULL);
    size_t len = req->content_len;                       /* body = the "ZNJS" image exactly as zinc writes it today */
    if (!authorised(req) || len < 8 || len > p->size / 2) { httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "size"); return ESP_FAIL; }
    esp_partition_erase_range(p, 0, (len + 4095) & ~4095u);   /* about 45 ms per sector [estimate]; a 40 KB program = 10 sectors */
    static uint8_t buf[2048]; size_t off = 0; bool first = true; uint8_t head[8];
    while (off < len) {
        int n = httpd_req_recv(req, (char *)buf, MIN(len - off, sizeof buf));
        if (n == HTTPD_SOCK_ERR_TIMEOUT) continue;
        if (n <= 0) return ESP_FAIL;                      /* the magic was not written: the old program is already gone, the partition reads as empty */
        size_t at = off, skip = 0;
        if (at < 8) { size_t k = MIN((size_t)n, 8 - at); memcpy(head + at, buf, k); skip = k; }  /* keep the "ZNJS" header back */
        if ((size_t)n > skip) esp_partition_write(p, at + skip, buf + skip, n - skip);
        off += n;
    }
    /* optional: verify an HMAC here, before committing */
    esp_partition_write(p, 0, head, 8);                   /* commit last: a half upload never looks valid */
    httpd_resp_sendstr(req, "ok"); return ESP_OK;
}
```

- Body size: `content_len` is a 32-bit value; the limit is the partition (the firmware says a program is at most half of 512 KB because bytecode is relocated into a copy [read, `partitions.csv` comment], so refuse above 256 KB). Chunk size does not matter to flash; 2 to 4 KB per `httpd_req_recv` is fine. Chunked transfer encoding is not supported by `esp_http_server` for requests (it needs `Content-Length`) [IDF behaviour, estimate; test it].
- This is not atomic: the old program is erased before the new one is complete. Because the header is written last, a failed upload leaves an invalid program (the firmware should then print "no program" and wait), never a half-valid one. A double-buffered js would need a second 512 KB partition; the 1.5 MB `storage` area in proposal A could hold one later.
- Running the program after upload: `esp_restart()` is simplest (and gives back every byte of heap).

### Authentication: one shared token

- Generate 16 random bytes at the first boot (`esp_fill_random`, hardware RNG is only strong with Wi-Fi/BT on, which is the case here) and keep them in NVS. Show the token on the LCD and the serial console on request ("pairing"). `zinc device pair zinc-ab12.local` asks the user to type it once and stores it in the project's `.zinc` folder.
- Send it as `X-Zinc-Token: <hex>`; compare in constant time (`mbedtls_ct_memcmp` or a 16-byte xor loop).
- Plain HTTP exposes the token to someone sniffing the LAN and allows replay. If that matters: the client sends `X-Zinc-Sig: HMAC-SHA256(token, body)`; the device keeps a running `mbedtls_md_hmac_update` over the chunks and compares before the commit step (js: header write; firmware: `esp_ota_set_boot_partition`). The mbedTLS md/hmac code is already linked for Wi-Fi [estimate]. This proves the sender holds the token and that the body is intact, but does not stop replay of an old upload; add a nonce from `GET /nonce` if needed. No TLS: certificate handling costs 40 KB or more of heap per handshake [estimate], not worth it for a classroom device.
- Disable OTA when no token has been set, and rate-limit failures (one second delay).

## 4. mDNS (`zinc-xxxx.local`)

- IDF 5.5.5 does not ship `mdns` in `components/` [read: no `mdns` directory]; it comes from the component registry as `espressif/mdns`. Latest 1.14.0, "supports all targets", published about two weeks before this check [source 14]. The component lives in `espressif/esp-protocols` and is Apache-2.0 [source 15]. Add `idf.py add-dependency "espressif/mdns^1.14.0"` (creates `idf_component.yml`; the vendoring rule in `AGENTS.md` suggests copying it into `third_party/` with the licence and a pinned version instead of fetching at build time).
- Kconfig [source 16]: task stack 4096 (`MDNS_TASK_STACK_SIZE`), priority 1, affinity CPU0, `MDNS_MAX_SERVICES` 10, `MDNS_MAX_INTERFACES` 3, `MDNS_ACTION_QUEUE_LEN` 16, `MDNS_ENABLE_BROWSE` on (off saves 3 to 4 KB of flash, not RAM). Recommended: `MDNS_MAX_SERVICES=2`, `MDNS_MAX_INTERFACES=1`, `MDNS_ACTION_QUEUE_LEN=8`, `MDNS_ENABLE_BROWSE=n`, `MDNS_TASK_STACK_SIZE=3072` [estimate; test].
- RAM [estimate]: 4 KB stack + 2 to 4 KB heap for the structures, one UDP socket on 224.0.0.251:5353 (lwIP PCB under 1 KB), packets built on demand. About 8 KB; no published number found. Flash about 20 to 30 KB [estimate].
- Code:

```c
mdns_init();
mdns_hostname_set("zinc-ab12");                 /* last two MAC bytes in hex */
mdns_instance_name_set("Zinc board");
mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0);
mdns_service_add(NULL, "_zinc", "_tcp", 80, NULL, 0);   /* lets `zinc device list` browse for boards */
```

- A browse for `_zinc._tcp` from the computer (macOS Bonjour works without any install) finds boards by service type and avoids typing names. Windows 10+ resolves `.local` natively; plain Android before API 33 may not resolve `.local` in the browser. [estimate]
- LwIP needs `CONFIG_LWIP_IGMP=y` (default) for multicast; a router that blocks multicast between wired and Wi-Fi (client isolation) hides the board: say so in the error message of `zinc device`.

## 5. ESP-NOW

API in IDF 5.5.5 [read, `components/esp_wifi/include/esp_now.h`; semantic details from source 17]:

```c
esp_wifi_init(&cfg); esp_wifi_set_storage(WIFI_STORAGE_RAM);
esp_wifi_set_mode(WIFI_MODE_STA); esp_wifi_start();
esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);        /* only when not connected to an AP */
esp_now_init();
esp_now_register_recv_cb(on_recv);
esp_now_register_send_cb(on_sent);
esp_now_peer_info_t peer = { .channel = 0, .ifidx = WIFI_IF_STA, .encrypt = false };
memset(peer.peer_addr, 0xFF, 6);                        /* broadcast peer must be added before sending to it */
esp_now_add_peer(&peer);
esp_now_send(peer.peer_addr, data, len);

static void on_recv(const esp_now_recv_info_t *info, const uint8_t *data, int len);   /* info->src_addr, info->des_addr, info->rx_ctrl (RSSI) */
static void on_sent(const esp_now_send_info_t *tx_info, esp_now_send_status_t status); /* 5.5 passes tx_info, not the MAC (changed from 5.1) */
```

- Callback signatures read from the 5.5.5 header: `esp_now_recv_cb_t(const esp_now_recv_info_t*, const uint8_t*, int)` and `esp_now_send_cb_t(const esp_now_send_info_t*, esp_now_send_status_t)`. The send callback's first argument differs from older IDF examples. Callbacks run in the high-priority Wi-Fi task: copy into a FreeRTOS queue and let a normal task hand the data to JavaScript. Wait for the send callback before the next send (callbacks can reorder) [source 17].
- Payload: 250 bytes (`ESP_NOW_MAX_DATA_LEN`, v1.0). ESP-NOW v2.0: `ESP_NOW_MAX_DATA_LEN_V2` = 1470 [read]. A v2 device receives from both; a v1 device truncates or drops anything above 250 [source 17]. `esp_now_get_version()` exists [read]. Whether v2 is active on the classic ESP32 with 5.5.5 and what the real range is: **not verified** here. Design `zinc:espnow` for 250 bytes and add a larger limit only after reading `esp_now_get_version()` on the board and testing with two boards.
- Broadcast: destination `FF:FF:FF:FF:FF:FF`, unacknowledged, no retry, no encryption (encrypting multicast is not supported [source 17]). Unicast gets a MAC-level ack: `ESP_NOW_SEND_SUCCESS` means the peer's radio acked it, not that the application got it. A receiver does not need to add the sender as a peer unless the frames are encrypted.
- Encryption: PMK (global, `esp_now_set_pmk`, 16 bytes) and per-peer LMK (16 bytes, AES-128 CCMP). Up to 20 peers, of which up to 17 encrypted (default 7, `CONFIG_ESP_WIFI_ESPNOW_MAX_ENCRYPT_NUM`) [source 17]; the 17 hardware keys are shared with SoftAP [Wi-Fi guide]. The `ESP_NOW_MAX_ENCRYPT_PEER_NUM 6` macro in the 5.5.5 header [read] is older than the Kconfig; read the Kconfig value at run time. For `zinc:espnow` offer: open broadcast (default) and an optional `key` argument (16 bytes) for a unicast group.
- Coexistence with a station connection: ESP-NOW rides on the station (or SoftAP) interface and the single radio, so it uses the channel the station is on. A peer channel of 0 means "current"; a non-zero channel must equal the current one [source 17]. Two boards both associated to the same router are on the same channel and talk. Boards on different routers or channels do not. If the board is not connected, set the channel yourself (all boards must use the same one). Channel hopping of a connected station (router changes channel) breaks the link silently.
- Power save: for reliable receive use `esp_wifi_set_ps(WIFI_PS_NONE)`; a station in modem sleep wakes on beacons and misses frames (the doc describes a wake window API for the low-power case [source 17]).
- BLE and ESP-NOW: the coexistence guide marks ESP-NOW TX stable with BLE and ESP-NOW RX with BLE as supported in STA mode [source 4].
- RAM [estimate]: ESP-NOW itself is small (peer table, queues; under 2 KB). It needs the Wi-Fi driver started but no IP stack traffic: Wi-Fi core 25 to 35 KB, no httpd, no mDNS. `libespnow.a` is 65 KB of archive [read: `components/esp_wifi/lib/esp32`], mostly dropped by the linker if unused; flash cost estimate 10 to 20 KB.
- What a single board can prove: init, add peer, send to broadcast, send callback status (a unicast to an absent MAC reports `ESP_NOW_SEND_FAIL`; a broadcast reports success once sent), the queue to JavaScript, the Zinc API, memory use and error paths. A board does not hear its own transmissions, so receive and RSSI need a second ESP32 (two boards, or a second board running the same firmware). The Espressif QEMU build does not emulate the radio as far as I know [estimate, unverified]; the simulator in `src/sim` should offer a loopback fake for the JavaScript side only.

## 6. RAM budget (all [estimate], to be measured)

Baseline 280 KB free heap before the 96 KiB JavaScript heap, so about 184 KB with it allocated first, before our own tasks, display buffers and the engine's stacks (not included here).

| Part | Idle | Peak | Basis |
|---|---|---|---|
| Wi-Fi station, tuned (section 1) | 25 to 35 KB | +8 to 13 KB while traffic flows | 41 to 46 KB measured at defaults [6, 7], minus the cuts |
| lwIP sockets, 2 active HTTP connections | 2 KB | 12 to 24 KB | 5760-byte send buffer and window each [read, Kconfig], TCP PCB about 0.3 KB |
| `esp_http_server` | 6 KB (4 KB stack + state) | 10 KB (stack 6 KB for OTA handler + 2 KB buffer) | `HTTPD_DEFAULT_CONFIG` stack 4096 [read] |
| mDNS | 6 to 8 KB | 10 KB | 4 KB stack + structures |
| Subtotal Wi-Fi + HTTP + mDNS | 40 to 55 KB | 65 to 90 KB | |
| NimBLE host and controller (BLE only mode, classic BT memory released) | about 65 to 90 KB | | 88 KB runtime heap at defaults, about 20 KB recoverable by lowering block counts [source 18, community, IDF 5.0]; +6 to 7 KB vs Bluedroid in another test [source 18]; Espressif's provisioning demo (BLE+Wi-Fi) leaves 140 K vs 230 K for Wi-Fi alone [5, measured] |

Reading the table, on 184 KB (after the JS heap):

- Wi-Fi + HTTP + mDNS: leaves about 95 to 145 KB at idle and about 95 KB at the worst peak. **Yes, it leaves at least the 90 KB asked for, but the margin at peak (an upload while JavaScript allocates) is thin.** The upload path should run with the JavaScript program paused, which gives back its working set, and `zinc:wifi` should expose `lowMemory` events.
- Adding NimBLE at the same time: 105 to 145 KB for the whole stack, so about 40 to 80 KB free at idle and zero margin at peak. **Not viable together with the 96 KiB JavaScript heap on this chip.** Use BLE only in a mode that excludes Wi-Fi + HTTP (a BLE-only program), and release classic BT memory with `esp_bt_mem_release(ESP_BT_MODE_CLASSIC_BT)` [IDF API, estimate on savings]. Do not use BLE provisioning for the first setup.
- Fragmentation is the larger risk than the sum. Allocate the JS heap first, keep one static 2 KB upload buffer, set `max_open_sockets` to 3 or 4, `lru_purge_enable = true`, log `heap_caps_get_largest_free_block`.
- Setup mode (AP + DNS + portal, JavaScript not running) has the whole 280 KB.

## 7. Recommendation

1. Wi-Fi station with static RX 4, dynamic RX/TX 8, AMPDU off, IPv6 off, no NVS in the driver; measure RAM at four points and put the numbers in the perf log.
2. First setup: IDF captive portal (copy the example's `dns_server`, Unlicense/CC0) and the QR code `WIFI:...` on the LCD; Wi-Fi in a separate boot state with JavaScript stopped.
3. Add Improv serial (tiny) so `zinc wifi setup` can provision over USB with no AP and no screen; use `improv-wifi/sdk-serial-js` for a browser page later.
4. No BLE provisioning and no `wifi_provisioning`: 90 KB of RAM and a phone app for no gain on a screen board; do not use tonyp7's component (old, IDF 4.2).
5. Partition table A: otadata + ota_0 960 KB + js (unchanged at 0x110000) + ota_1 960 KB + 1.5 MB spare; switch to B only if the first Wi-Fi build is over about 900 KB. Flash it once over USB; enable `CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE` in the same step.
6. Firmware OTA: `POST /ota`, streamed in 2 KB chunks with `esp_ota_begin(OTA_WITH_SEQUENTIAL_WRITES)`, `esp_ota_end`, `esp_ota_set_boot_partition`; mark valid after the runtime started.
7. Program update: `POST /js`, streamed to the `js` partition, magic header written last, size limit 256 KB; reboot to run it.
8. Auth: one 16-byte token generated at first boot, shown on the LCD, `X-Zinc-Token` header, constant-time compare; optional `X-Zinc-Sig` HMAC-SHA256 of the body; no TLS.
9. mDNS with `espressif/mdns` 1.14.0 (Apache-2.0), vendored, one hostname `zinc-xxxx` and service `_zinc._tcp` for discovery; trimmed Kconfig.
10. `zinc:espnow`: 250-byte payload, broadcast by default, optional 16-byte key, callbacks into a queue, `WIFI_PS_NONE`, document the shared-channel rule; v2 (1470) only after a two-board test; BLE and Wi-Fi/HTTP together are out of budget.

## Sources

1. https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-guides/wifi.html (sections Wi-Fi Buffer Usage, How to Improve Wi-Fi Performance, Wi-Fi Buffer Configure)
2. https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-guides/lwip.html (Minimum RAM usage)
3. https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-guides/performance/ram-usage.html
4. https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-guides/coexist.html
5. https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/advanced-development/system/ram-usage.html (ESP32, release/v5.5, empty 366 K, station 230 K, provision 140 K)
6. https://github.com/espressif/arduino-esp32/issues/8033 (311,588 to 265,932 bytes)
7. https://forum.arduino.cc/t/esp32-using-more-than-50-000-bytes-of-memory-for-wifi/1378106
8. https://github.com/tonyp7/esp32-wifi-manager (README: MIT, IDF 4.2+)
9. https://components.espressif.com/components/espressif/network_provisioning
10. https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/provisioning/wifi_provisioning.html
11. https://www.improv-wifi.com/serial/
12. https://github.com/improv-wifi (sdk-cpp, sdk-serial-js, sdk-ble-js: Apache-2.0)
13. https://raw.githubusercontent.com/improv-wifi/sdk-cpp/main/README.md (ESPHome uses it)
14. https://components.espressif.com/components/espressif/mdns
15. https://raw.githubusercontent.com/espressif/esp-protocols/master/components/mdns/LICENSE
16. https://raw.githubusercontent.com/espressif/esp-protocols/master/components/mdns/Kconfig
17. https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/network/esp_now.html
18. https://esp32.com/viewtopic.php?p=127978 and https://esp32.com/viewtopic.php?p=114383 (NimBLE heap reports, found by search; I read only the search summary, not the threads)

Local files read: `~/.zinc/esp-idf/components/esp_wifi/Kconfig`, `components/esp_wifi/include/esp_now.h`, `components/lwip/Kconfig`, `components/app_update/include/esp_ota_ops.h`, `components/esp_partition/include/esp_partition.h`, `components/esp_http_server/include/esp_http_server.h`, `components/partition_table/partitions_two_ota.csv`, `examples/protocols/http_server/captive_portal/`, `examples/provisioning/wifi_prov_mgr`, `examples/system/ota`, `examples/wifi/espnow`.
