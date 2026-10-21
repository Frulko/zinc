# zinc:ble over a Nordic UART Service: ESP32 peripheral and Mac central

Research for `zinc:ble`. Date: 2026-10-22. Nothing here was built or run on a board (a board is in use elsewhere, no builds allowed in this task).
Marks: **[read]** = read in the ESP-IDF 5.5.5 tree at `~/.zinc/esp-idf` or in a cited source; **[reported]** = a number or claim from a third party, not reproduced here; **[estimate]** = my reasoning, to be measured; **[memory]** = from my knowledge of Apple's API, not re-checked in this session.
No RAM or flash number below is measured by us. The first step of the implementation is to measure the free heap (section 1.7) and replace the estimates.

## 1. ESP32 side (ESP-IDF 5.5.5, classic ESP32, no PSRAM)

### 1.1 NimBLE or Bluedroid

NimBLE.
- Smaller RAM and flash. Moddable measured, on the same heart-rate server example, a firmware 254 KB smaller and 33 KB more free heap after a connection with NimBLE than with Bluedroid **[reported]**: https://moddable.com/blog/moddable-sdk-improvements-for-esp32-projects/
- Counter-evidence: one forum user found NimBLE 6 to 7 KB heavier on IDF 5.1 (Blufi example), another 8.5 KB lighter than a tuned Bluedroid **[reported]**: https://esp32.com/viewtopic.php?t=33783 . The RAM sign depends on tuning; the flash gain is consistent. Flash is not our limit (app partition 1 MB, `firmware/esp32-mquickjs/partitions.csv`); RAM is.
- BLE-only controller with NimBLE is what every `examples/bluetooth/nimble/*/sdkconfig.defaults` sets (`CONFIG_BTDM_CTRL_MODE_BLE_ONLY=y`, `CONFIG_BT_NIMBLE_ENABLED=y`, `CONFIG_BT_BLUEDROID_ENABLED=n`) **[read]**.
- Bluedroid would need more tasks and dynamic memory for nothing we use. Note `CONFIG_BT_BLE_DYNAMIC_ENV_MEMORY` exists only in the Bluedroid Kconfig (`components/bt/host/bluedroid/Kconfig.in:1341`) **[read]**; it is not an option for NimBLE.

### 1.2 The smallest configuration that still serves NUS

Base: `examples/bluetooth/nimble/bleprph/sdkconfig.defaults.mini` (Espressif's own reduced profile for a peripheral) **[read]**, plus our choices. Stock defaults are from `components/bt/host/nimble/Kconfig.in` and `components/bt/controller/esp32/Kconfig.in` **[read]**.

```
CONFIG_BT_ENABLED=y
CONFIG_BTDM_CTRL_MODE_BLE_ONLY=y           # no classic BT code or static RAM linked
CONFIG_BTDM_CTRL_MODE_BR_EDR_ONLY=n
CONFIG_BTDM_CTRL_MODE_BTDM=n
CONFIG_BT_BLUEDROID_ENABLED=n
CONFIG_BT_NIMBLE_ENABLED=y
CONFIG_BTDM_CTRL_BLE_MAX_CONN=1            # controller: default 3, "each connection uses 1KB static DRAM"
CONFIG_BT_NIMBLE_MAX_CONNECTIONS=1         # host
CONFIG_BT_NIMBLE_MAX_BONDS=1
CONFIG_BT_NIMBLE_MAX_CCCDS=1
CONFIG_BT_NIMBLE_ROLE_PERIPHERAL=y
CONFIG_BT_NIMBLE_ROLE_BROADCASTER=y        # advertising
CONFIG_BT_NIMBLE_ROLE_CENTRAL=n
CONFIG_BT_NIMBLE_ROLE_OBSERVER=n
CONFIG_BT_NIMBLE_GATT_CLIENT=n             # we only serve
CONFIG_BT_NIMBLE_SM_SC=n                   # no pairing in v1
CONFIG_BT_NIMBLE_50_FEATURE_SUPPORT=n
CONFIG_BT_NIMBLE_ENABLE_CONN_REATTEMPT=n
CONFIG_BT_NIMBLE_PRINT_ERR_NAME=n
# services of the examples (HR, DIS, CTS, HTP, IPSS, TPS, IAS, LLS, SPS, PROX) all =n, as in the mini profile
CONFIG_BT_NIMBLE_MSYS_1_BLOCK_COUNT=6      # stock 12 (256 B blocks on a classic ESP32)
CONFIG_BT_NIMBLE_MSYS_2_BLOCK_COUNT=12     # stock 24
CONFIG_BT_NIMBLE_TRANSPORT_ACL_FROM_LL_COUNT=12   # stock 24 (255 B each)
CONFIG_BT_NIMBLE_TRANSPORT_EVT_COUNT=15
CONFIG_BT_NIMBLE_ATT_MAX_PREP_ENTRIES=15   # stock 64; we never use prepared writes
CONFIG_BT_ALARM_MAX_NUM=15
CONFIG_BT_NIMBLE_ATT_PREFERRED_MTU=247     # stock 256, see section 3
CONFIG_BT_NIMBLE_HOST_TASK_STACK_SIZE=3152 # mini profile value
CONFIG_BT_NIMBLE_PINNED_TO_CORE_1=y        # Wi-Fi and main on core 0 (1.5)
```

Notes:
- The two connection counts are separate: the controller option costs about 1 KB static DRAM per slot **[read]**, so going from the default 3 to 1 saves about 2 KB **[estimate from that help text]**.
- Mbuf pools are the largest tunable host chunk: 6 x 256 B + 12 x 320 B is about 5.4 KB **[estimate from Kconfig block sizes]**. Do not go below the mini values without a throughput test: a notify burst needs mbufs.
- The controller's static DRAM is not tunable. `esp_bt_controller_mem_release` is documented as releasing "about 70 KB" (BSS, data and other sections of the controller) **[read]**: https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/bluetooth/controller_vhci.html . That is the order of magnitude of the static cost of a controller **[estimate]**; a BLE-only build already excludes the classic part.
- Flash: NimBLE host plus controller adds on the order of 150 to 250 KB **[estimate]**, from the 254 KB gap to Bluedroid in the Moddable report. We have 1 MB.
- Free heap after init and one connection: not measured. Size the MicroQuickJS heap against the number measured in 1.7, not an assumption.
- Our `sdkconfig.defaults` already uses `CONFIG_COMPILER_OPTIMIZATION_SIZE` and `CONFIG_FREERTOS_HZ=1000`; keep them.

### 1.3 Init order

With `BTDM_CTRL_MODE_BLE_ONLY`, `esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT)` has nothing to release; it matters only for a `BTDM` build, where it must run before `esp_bt_controller_init` (or after `deinit`) and "cannot be reversed" (`components/bt/include/esp32/include/esp_bt.h` lines 499-513 **[read]**). NimBLE's `nimble_port_init()` initialises and enables the controller itself:

1. `nvs_flash_init()` (bleprph does it; PHY calibration and bond storage use NVS; Wi-Fi needs it anyway).
2. `nimble_port_init()`.
3. `ble_hs_cfg.sync_cb`, `reset_cb`, `store_status_cb = ble_store_util_status_rr`.
4. `ble_svc_gap_init(); ble_svc_gatt_init(); ble_gatts_count_cfg(svcs); ble_gatts_add_svcs(svcs);`
5. `ble_svc_gap_device_name_set(...)`, `ble_att_set_preferred_mtu(247)`.
6. `nimble_port_freertos_init(host_task)`; the task runs `nimble_port_run()` then `nimble_port_freertos_deinit()`.
7. In `sync_cb`: `ble_hs_util_ensure_addr(0)`, then start advertising.

This is the flow of `examples/bluetooth/nimble/bleprph/main/main.c` (`bleprph_host_task` at line 549, `app_main` from 556, advertise at 195-205) **[read]**.

### 1.4 Starting and stopping at run time, giving the RAM back

APIs: `nimble_port_stop()` and `nimble_port_deinit()` ("Deinitialize controller and NimBLE host stack"), `components/bt/host/nimble/nimble/porting/nimble/include/nimble/nimble_port.h` lines 47-55 **[read]**. Every example's host task ends with `nimble_port_freertos_deinit()` after `nimble_port_run()` returns, "only when `nimble_port_stop()` is executed" **[read]**.

```c
ble_gap_adv_stop();                       // ignore BLE_HS_EALREADY
if (conn != BLE_HS_CONN_HANDLE_NONE) ble_gap_terminate(conn, BLE_ERR_REM_USER_CONN_TERM);
// wait for BLE_GAP_EVENT_DISCONNECT (a semaphore), 1 s timeout
nimble_port_stop();                       // nimble_port_run() returns in the host task
nimble_port_deinit();                     // controller disable + deinit, host deinit
```
- Returned: heap-allocated parts (mbuf pools, host structures, controller dynamic buffers). Not returned: the controller's static `.bss/.data`. That is reclaimed only by `esp_bt_mem_release(ESP_BT_MODE_BTDM)` (header lines 523-538 **[read]**), irreversible until reboot. So `ble.stop()` gives back the dynamic part; a firmware that will never use BLE again in this boot may add `esp_bt_mem_release`. The size of each part is **[estimate]**.
- Restarting with `nimble_port_init()` after `deinit` is the examples' lifecycle, but I found no IDF example that loops it. Run it 20 times and watch `esp_get_minimum_free_heap_size()` before promising it **[to verify]**.
- Fragmentation: the ACL and mbuf pools are contiguous allocations. Started late, after Wi-Fi and the JS heap have fragmented DRAM, `nimble_port_init()` can fail with `ESP_ERR_NO_MEM`. Start BLE early, check the return code, surface it as a JS error.

### 1.5 Coexistence with Wi-Fi

- Software coexistence is `CONFIG_ESP_COEX_SW_COEXIST_ENABLE` (`components/esp_coex/Kconfig`) **[read]**; it must be on for Wi-Fi + BLE. One radio, time-division; when Wi-Fi and BLE are both connected each gets 50% of a coexistence period **[read]**: https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-guides/coexist.html
- The same guide says to run the Wi-Fi task and the Bluetooth controller/host on different CPUs (`CONFIG_BT_NIMBLE_PINNED_TO_CORE_CHOICE`, `CONFIG_ESP_WIFI_TASK_CORE_ID`) and names RAM savers: `CONFIG_ESP_WIFI_TX_BUFFER` (dynamic TX buffers) and `CONFIG_ESP_WIFI_RX_IRAM_OPT=n` (about 17 KB of IRAM) **[read]**.
- `examples/bluetooth/nimble/bleprph_wifi_coex`: `sdkconfig.defaults` sets `CONFIG_ESP_WIFI_IRAM_OPT=n`, `sdkconfig.defaults.esp32` sets `CONFIG_FREERTOS_PLACE_FUNCTIONS_INTO_FLASH=y` to save IRAM **[read]**.
- No total RAM for Wi-Fi plus BLE is published. On a board with no PSRAM it will leave little for the JS heap **[estimate]**. Decision for v1: exclusive at run time; `ble.start()` returns an error while Wi-Fi is up (and the reverse). Revisit after measuring.

### 1.6 Skeleton: NimBLE NUS peripheral

Modelled on `examples/bluetooth/nimble/bleprph/main/gatt_svr.c` (service table, `BLE_UUID128_INIT`, access callback) and `main.c` (advertise, GAP event) **[read]**. UUID bytes are little-endian, so the NUS UUID is written reversed. Not compiled.

```c
#define NUS(b12) BLE_UUID128_INIT(0x9e,0xca,0xdc,0x24,0x0e,0xe5,0xa9,0xe0, 0x93,0xf3,0xa3,0xb5, (b12),0x00,0x40,0x6e)
static const ble_uuid128_t u_svc = NUS(0x01), u_rx = NUS(0x02), u_tx = NUS(0x03);
static uint16_t tx_handle, conn = BLE_HS_CONN_HANDLE_NONE, mtu = 23;
static bool subscribed;

static int rx_access(uint16_t ch, uint16_t ah, struct ble_gatt_access_ctxt *c, void *arg) {
  if (c->op != BLE_GATT_ACCESS_OP_WRITE_CHR) return BLE_ATT_ERR_UNLIKELY;
  uint8_t buf[512]; uint16_t n;                        // 512 = ATT maximum value length
  if (ble_hs_mbuf_to_flat(c->om, buf, sizeof buf, &n)) return BLE_ATT_ERR_UNLIKELY;
  feed_line_parser(buf, n);                            // newline framing above, in plain C
  return 0;
}
static int tx_access(uint16_t ch, uint16_t ah, struct ble_gatt_access_ctxt *c, void *arg) { return 0; } // notify only

static const struct ble_gatt_svc_def svcs[] = {
  { .type = BLE_GATT_SVC_TYPE_PRIMARY, .uuid = &u_svc.u, .characteristics = (struct ble_gatt_chr_def[]) {
      { .uuid = &u_rx.u, .access_cb = rx_access, .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP },
      { .uuid = &u_tx.u, .access_cb = tx_access, .flags = BLE_GATT_CHR_F_NOTIFY, .val_handle = &tx_handle },
      { 0 } } },
  { 0 } };

static int gap_event(struct ble_gap_event *e, void *arg) {
  switch (e->type) {
  case BLE_GAP_EVENT_CONNECT:    if (e->connect.status == 0) conn = e->connect.conn_handle; else advertise(); break;
  case BLE_GAP_EVENT_DISCONNECT: conn = BLE_HS_CONN_HANDLE_NONE; subscribed = false; mtu = 23; advertise(); break;
  case BLE_GAP_EVENT_MTU:        mtu = e->mtu.value; break;                  // payload per packet = mtu - 3
  case BLE_GAP_EVENT_SUBSCRIBE:  if (e->subscribe.attr_handle == tx_handle) subscribed = e->subscribe.cur_notify; break;
  }
  return 0;
}
static void advertise(void) {
  uint8_t own; ble_hs_id_infer_auto(0, &own);
  struct ble_hs_adv_fields f = {0};                    // flags 3 + 128-bit UUID 18 = 21 of 31 bytes
  f.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
  f.uuids128 = &u_svc; f.num_uuids128 = 1; f.uuids128_is_complete = 1;
  ble_gap_adv_set_fields(&f);
  struct ble_hs_adv_fields r = {0};                    // the name does not fit beside the UUID: scan response
  const char *name = ble_svc_gap_device_name(); r.name = (uint8_t *)name; r.name_len = strlen(name); r.name_is_complete = 1;
  ble_gap_adv_rsp_set_fields(&r);
  struct ble_gap_adv_params p = {0}; p.conn_mode = BLE_GAP_CONN_MODE_UND; p.disc_mode = BLE_GAP_DISC_MODE_GEN;
  ble_gap_adv_start(own, NULL, BLE_HS_FOREVER, &p, gap_event, NULL);
}
static void on_sync(void) { ble_hs_util_ensure_addr(0); advertise(); }

int nus_send(const uint8_t *d, size_t n) {             // one message, chunked to the MTU
  if (conn == BLE_HS_CONN_HANDLE_NONE || !subscribed) return -1;
  for (size_t o = 0, k; o < n; o += k) {
    k = n - o < (size_t)(mtu - 3) ? n - o : (size_t)(mtu - 3);
    int rc;
    do { struct os_mbuf *om = ble_hs_mbuf_from_flat(d + o, k);
         rc = om ? ble_gatts_notify_custom(conn, tx_handle, om) : BLE_HS_ENOMEM;
         if (rc == BLE_HS_ENOMEM) vTaskDelay(1);
    } while (rc == BLE_HS_ENOMEM);                     // add a timeout
    if (rc) return rc;
  }
  return 0;
}
```
Checks when building it: mbuf ownership on a failed `ble_gatts_notify_custom` (read `components/bt/host/nimble/nimble/nimble/host/include/host/ble_gatt.h`), and the retry timeout.

Other points:
- Adv budget: a 128-bit UUID plus flags is 21 of 31 bytes, so a name longer than about 8 characters goes in the scan response. macOS merges both into the discovery result **[memory]**.
- No pairing in v1: the NUS channel is open to anyone in range. Document it. Later: `BLE_GATT_CHR_F_WRITE_ENC` plus Just Works bonding; macOS then shows a pairing dialog.
- `examples/bluetooth/nimble/ble_spp/spp_server` is Espressif's UART-over-BLE example. It uses a 16-bit custom service, not NUS, but the structure (a write characteristic and a notify characteristic) is the same **[read]**.

### 1.7 What to measure first (one board test, later)

```c
ESP_LOGW("heap", "boot %u", esp_get_free_heap_size());
nimble_port_init(); /* ... advertise ... */      ESP_LOGW("heap", "adv  %u", esp_get_free_heap_size());
/* Mac connects and sends 10 KB */               ESP_LOGW("heap", "conn %u min %u", esp_get_free_heap_size(), esp_get_minimum_free_heap_size());
nimble_port_stop(); nimble_port_deinit();        ESP_LOGW("heap", "stop %u", esp_get_free_heap_size());
```
Plus `idf.py size-components` with and without BLE. Replace the estimates above with these four numbers.

## 2. Mac side: CoreBluetooth from C++ (Objective-C++)

### 2.1 Shape of the native code

Model: `plugins/serial/native/serial.host.cpp` (nothing waits, work is queued) and `plugins/camera/native/camera.macos.mm` (a `.mm` with `"frameworks"` and `"native": {"impl": {"macos": ...}}` in `plugin.json`) **[read]**. For ble: `"frameworks": ["CoreBluetooth", "Foundation"]`, `native/ble.macos.mm`, `native/ble.sim.ts`.

- Create the manager on a private serial queue: `[[CBCentralManager alloc] initWithDelegate:d queue:dispatch_queue_create("zinc.ble", DISPATCH_QUEUE_SERIAL) options:nil]`. Callbacks then arrive on that queue and no main run loop or NSApplication is needed **[memory]**. bleak does exactly this (serial queue, waits for `centralManagerDidUpdateState_` before any call) **[read]**: https://github.com/hbldh/bleak/blob/develop/bleak/backends/corebluetooth/CentralManagerDelegate.py . With `queue:nil` callbacks go to the main queue, which must be running.
- Delegate callbacks push events into a mutex-guarded vector; the engine thread drains it in `poll()`, as `zinc:serial` does for bytes. Never block in a callback.
- Nothing works before `centralManagerDidUpdateState:` reports `CBManagerStatePoweredOn`. Expose `ble.state`: `poweredOn | poweredOff | unauthorized | unsupported | resetting | unknown`.

### 2.2 The calls **[memory]**

```objc
CBUUID* nus = [CBUUID UUIDWithString:@"6E400001-B5A3-F393-E0A9-E50E24DCCA9E"];
[cm scanForPeripheralsWithServices:@[nus] options:@{CBCentralManagerScanOptionAllowDuplicatesKey:@NO}];
// didDiscoverPeripheral:advertisementData:RSSI: -> keep a strong reference to the CBPeripheral
[cm stopScan]; [cm connectPeripheral:p options:nil];
// didConnectPeripheral: -> p.delegate = d; [p discoverServices:@[nus]];
// didDiscoverServices: -> [p discoverCharacteristics:@[rx, tx] forService:s];
// didDiscoverCharacteristicsForService: -> [p setNotifyValue:YES forCharacteristic:tx];
// didUpdateNotificationStateForCharacteristic: -> ready
// didUpdateValueForCharacteristic: -> chr.value, one chunk of the stream
```
- Identity: macOS never exposes the Bluetooth address. `peripheral.identifier` (NSUUID, stable per Mac) is the id for JS; name comes from `advertisementData[CBAdvertisementDataLocalNameKey]`; add RSSI.
- Write with response: `writeValue:forCharacteristic:type:CBCharacteristicWriteWithResponse`, completion in `didWriteValueForCharacteristic:error:`, chunk limit `[p maximumWriteValueLengthForType:CBCharacteristicWriteWithResponse]` (up to 512).
- Write without response (the NUS default): chunk limit `maximumWriteValueLengthForType:CBCharacteristicWriteWithoutResponse` (MTU - 3). Flow control: test `p.canSendWriteWithoutResponse` before each write; when NO, keep the rest and resume in `peripheralIsReadyToSendWriteWithoutResponse:` (bleak implements this callback **[read]**). Without this check, writes are dropped silently.
- Notifications carry at most MTU - 3 bytes per callback; append to a per-connection buffer and cut at `\n`.
- CoreBluetooth has no connect timeout: use a plugin timer that calls `cancelPeripheralConnection:`. Reconnecting is the app's job; fire a disconnect event from `didDisconnectPeripheral:error:`.

### 2.3 Permission (TCC) for a command-line binary

- Since macOS 11 (10.15 for apps built with that SDK) CoreBluetooth is governed by TCC service `kTCCServiceBluetoothAlways`; the usage string is `NSBluetoothAlwaysUsageDescription` **[memory]**.
- The prompt belongs to the **responsible process**, not necessarily the binary. An Apple Developer Forums thread about a command-line BLE tool killed when started from a terminal (but fine under the debugger) was answered: the tool inherits the permission of its parent terminal; granting Bluetooth to the terminal fixed it **[reported]**: https://developer.apple.com/forums/thread/675773
- A responsible process without `NSBluetoothAlwaysUsageDescription` does not get a polite denial. TCC logs `Refusing authorization request for service kTCCServiceBluetoothAlways ... without NSBluetoothAlwaysUsageDescription key`, the child dies with SIGABRT (exit 134), no prompt, nothing to grant later in System Settings. Reported for children of Claude Code (its bundle lacks the key; Terminal.app has it and prompts normally) **[read]**: https://github.com/anthropics/claude-code/issues/76517 . Workarounds there: run the process from a LaunchAgent (it becomes its own responsible process), or host the Bluetooth code in an ad-hoc signed `.app` that carries the key and talk to it over a socket.

Consequences for Zinc:
1. `zinc run` from Terminal.app: one prompt for Terminal, then it works. Other terminals must declare the key themselves; if the process aborts at the first manager, check that first.
2. `zinc run` from an agent session whose host lacks the key (like the loops of this repository): abort at the first CBCentralManager. **No test of the real radio path may run in an agent session or in `tests/run`.**
3. A packed app (`zinc pack`/`export`, a `.app`): the app is the responsible process, so export must write `NSBluetoothAlwaysUsageDescription` into its Info.plist when the app imports `zinc:ble`. Camera already has this (`NSCameraUsageDescription` in `docs/plugins/camera.md`, `backlog/tasks/zn-322.03 - Permissions-at-run-time-export-and-bundle-metadata.md`, `tests/t1/permissions_export.sh`) **[read]**; add Bluetooth to the same table.
4. Embedding a plist in the bare `zinc` binary with `-Wl,-sectcreate,__TEXT,__info_plist,Info.plist` is the usual way to give a Mach-O a usage string. It helps when the binary is itself the responsible process (launchd, `open`); it does not change the attribution when a terminal is the parent. A poster in the same Apple thread says the embedded plist did not work for them with Xcode 14.2 **[reported]**. Embed it as a best effort (one linker flag; verify with `otool -s __TEXT __info_plist build/zinc`), do not rely on it, and test it once by hand on this Mac **[to verify]**. The supported path is the app bundle.
5. TCC grants are keyed on code identity; an ad-hoc signed binary changes identity at every rebuild and loses the grant. Sign with a stable identifier (`codesign -s - --identifier ...`) **[memory]**.

Detecting the state:
- Read the class property `CBManager.authorization` (macOS 10.15+: `notDetermined`, `restricted`, `denied`, `allowedAlways`) before creating a manager. It does not prompt **[memory]**; the Claude Code issue also reports that a state-only probe never reaches TCC enforcement. Map `denied` and `restricted` to a typed error ("Bluetooth is not allowed for <app>: System Settings, Privacy and Security, Bluetooth") and do not create the manager.
- After creation, `centralManagerDidUpdateState:` with `CBManagerStateUnauthorized` is the "permission missing" signal when the process survives (app bundle, user clicked Don't Allow). `PoweredOff`: Bluetooth switched off. `Unsupported`: no radio.
- `notDetermined` from a terminal of unknown parent is the dangerous case: Terminal.app prompts, a host without the key aborts, and the plugin cannot tell them apart in-process. Guard: read the environment variable `__CFBundleIdentifier` (set by GUI terminals) and refuse with a clear message when it names a host known to lack the key (`com.anthropic.claude-code`). The list is **[estimate]** and will need maintenance.

### 2.4 Existing tools and licences

- bleak (Python), CoreBluetooth backend: MIT. A reference for queue, state wait and write-without-response flow control: https://github.com/hbldh/bleak . PyObjC based, nothing to vendor.
- noble / @abandonware/noble (Node): MIT per the GitHub API. The macOS binding is Objective-C++ over CoreBluetooth **[memory]**; Node-specific, not worth vendoring for about 400 lines.
- SimpleBLE: Business Source License 1.1 (checked in `LICENSE.md`; GitHub reports NOASSERTION): https://github.com/simpleble/simpleble . **Excluded.**
- Decision: vendor nothing; write `ble.macos.mm` on CoreBluetooth itself, as camera and microphone do on AVFoundation.

### 2.5 Testing without hardware

`ble.sim.ts` in the style of `plugins/serial/native/serial.sim.ts`: a simulated NUS peripheral that echoes lines behind the same JS surface, used by `zinc run --simulate`, `tests/run` and the device simulator (`src/sim`). The real radio test is one by-hand script in `tests/demo`, run from Terminal.app by the owner.

## 3. MTU and framing

- ATT starts at MTU 23 (20 bytes of payload). The ESP32 announces `CONFIG_BT_NIMBLE_ATT_PREFERRED_MTU` (stock 256 **[read]**); the effective MTU is the minimum of both sides and the exchange is started by the client, here the Mac (our NimBLE build has no GATT client, so the peripheral never starts it). CoreBluetooth has no API to set the MTU: read the outcome with `maximumWriteValueLengthForType:`; on the ESP32 read `BLE_GAP_EVENT_MTU` **[memory]**.
- What macOS actually negotiates varies by Mac and OS release; I have seen 182 (MTU 185) and larger values reported **[memory, unreliable]**. Design for any value from 20 to 512: chunk to `min(maximumWriteValueLength, mtu - 3)` at connect time. It works at 20 bytes, only slower.
- ESP32 asks for 247, not 512: with LE Data Length Extension (251 byte link-layer payload, 4 bytes L2CAP header, 3 bytes ATT header) an MTU of 247 gives a 244 byte payload that fits one link-layer packet **[estimate]**. A larger MTU only adds fragmentation and mbuf use.
- Framing: UTF-8 messages ending in `\n`. A message never contains `\n` (JSON escapes it; plain text must not). Each side appends every chunk to a byte buffer and emits one message per `\n`. Notifications and write-without-response are ordered and reliable at the link layer, so no sequence numbers. Chunk boundaries are arbitrary and invisible to the framing. Cap a message at 4 KB on the ESP32 (RAM) and 64 KB on the Mac; beyond that, drop and send an error event.
- Flow control: Mac side `canSendWriteWithoutResponse`; ESP32 side retry on `BLE_HS_ENOMEM`. No credit scheme in v1. A slow ESP32 consumer fills its mbufs and the Mac's write queue pauses: acceptable back-pressure.
- Throughput. Espressif measured two ESP32 boards with MTU 512, connection interval 7.5 ms, DLE 251, 1M PHY: notify about 340 kbit/s, write about 500 kbit/s, read about 200 kbit/s **[read]**: `examples/bluetooth/nimble/throughput_app/README.md`. A Mac central does not choose 7.5 ms (Apple's accessory guidelines set a floor of 15 ms for iOS and macOS **[memory]**), so expect a fraction: **[estimate]** about 20 to 100 kbit/s, i.e. 3 to 12 KB/s, with 15 to 30 ms of latency per message. Enough for text commands. The peripheral can ask for a shorter interval with `ble_gap_update_params()`; macOS may refuse. Connect to ready (connect, discover service, characteristics, subscribe): **[estimate]** 0.3 to 1.5 s. Measure all of this with the real pair.

## 4. Recommendation (10 lines)

1. ESP32: NimBLE, BLE-only controller, peripheral role only, 1 connection in both the controller (`BTDM_CTRL_BLE_MAX_CONN`) and the host, the `bleprph` mini buffer profile, `ATT_PREFERRED_MTU=247`, `ATT_MAX_PREP_ENTRIES=15`, host on core 1.
2. Advertise the NUS UUID in the primary packet and the name in the scan response; no pairing in v1, and the docs say the link is open.
3. `ble.start()` / `ble.stop()` = `nimble_port_init` + `nimble_port_freertos_init` / `adv_stop`, terminate, `nimble_port_stop`, `nimble_port_deinit`; start early (fragmentation), exclusive with Wi-Fi in v1, `ESP_ERR_NO_MEM` becomes a JS error.
4. Measure before promising: free heap at boot, advertising, connected, after stop, and `size-components` (1.7). Every number in this report is reported or estimated, none is ours.
5. Mac: vendor nothing; `plugins/ble` with `native/ble.macos.mm` over CoreBluetooth, a serial dispatch queue for the manager, events queued for the engine thread, nothing blocking.
6. Read `CBManager.authorization` before creating the manager; map `unauthorized`, `poweredOff`, `unsupported` to typed errors; own connect timeout.
7. Permission: the responsible process gets the prompt. Packed apps carry `NSBluetoothAlwaysUsageDescription` (extend the camera permission table); Terminal.app works, hosts without the key (Claude Code) abort with SIGABRT; embed a plist with `-sectcreate` as a best effort and verify once by hand.
8. Never run the real radio in an agent loop or `tests/run`: ship `ble.sim.ts` (loopback NUS) and one by-hand `tests/demo` script.
9. Wire format: UTF-8 messages ended by `\n`, chunked to `min(maximumWriteValueLength, mtu - 3)`, write-without-response with `canSendWriteWithoutResponse` on the Mac, notify with ENOMEM retry on the ESP32, 4 KB cap on the board.
10. Skip SimpleBLE (BSL 1.1); bleak and noble (MIT) are references to read, not dependencies.

## Sources

- ESP-IDF 5.5.5 tree: `components/bt/include/esp32/include/esp_bt.h`, `components/bt/controller/esp32/Kconfig.in`, `components/bt/host/nimble/Kconfig.in`, `components/esp_coex/Kconfig`, `examples/bluetooth/nimble/bleprph/{main/main.c,main/gatt_svr.c,sdkconfig.defaults.mini}`, `.../bleprph_wifi_coex`, `.../throughput_app/README.md`, `.../ble_spp/spp_server`.
- https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-guides/coexist.html , https://docs.espressif.com/projects/esp-idf/en/v5.5.1/esp32/api-reference/bluetooth/controller_vhci.html
- https://moddable.com/blog/moddable-sdk-improvements-for-esp32-projects/ , https://esp32.com/viewtopic.php?t=33783
- https://developer.apple.com/forums/thread/675773 , https://github.com/anthropics/claude-code/issues/76517
- https://github.com/hbldh/bleak (MIT), https://github.com/simpleble/simpleble (BSL 1.1), abandonware/noble (MIT)
