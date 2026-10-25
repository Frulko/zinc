# The device player: `zinc device` for the PSP, Vita, 3DS, Android, webOS and iOS (ZN-792)

Research and design, 2026-10-25. No engine code yet. The owner's request: a player/agent mode like the Pi's, so that a person tries
apps in development on a PS Vita, with pairing and the rest, and the same on the 3DS, the PSP, Android, webOS and iOS.

What exists and is reused: the agent protocol of `docs/reports/zinc-next-agent.md` (TCP 7733, `ZNA1 pair|sess`, TLS 1.2 EC J-PAKE pairing,
TLS 1.3 `psk_dhe_ke` sessions, frames of `src/net/frame.h`, the ops of `src/agent/server.cpp`), the console cores (`targets/console`, one
interpreter and a HAL per console), and Zinc Go (`src/app/player.cpp`, ZN-631: the Android and iOS player, which already runs ZBC sent by
`zinc dev --lan` over its own unencrypted protocol).

## 0. The answer in short

- **A player is an agent that runs programs in its own process.** `zinc agent` forks and execs `zinc run`; a console, an Android app and an
  iOS app cannot. So the player speaks the agent's protocol (pairing, keys, frames, the same JSON ops) for a subset of ops, and starts the
  received `program.zbc` in the interpreter it already contains, then comes back to its pairing screen.
- **One server for all the in-process players:** `src/agent/player.cpp` (new), single-threaded and polled (`playerPoll`), with no fork, no
  `std::filesystem`, no libuv; plain sockets, `src/host/tls.cpp` and yyjson. The console core and Zinc Go each give it a small
  `PlayerHost` (start a program from a directory, stop it, is it running, a frame, extra `info` fields).
- **webOS is a Linux:** the TouchPad already runs programs built by the engine (glibc 2.8, `armv7-webos`), so there the real
  `zinc agent` (`server.cpp`) runs, inside a smaller engine without the compiler (the player runtime of ZN-392), and forks programs
  as on a Pi.
- **The workstation compiles; the device only runs.** `zinc device deploy` and `zinc dev --device` see `"player": true` in `info`, run
  `zinc pack --profile <its profile>` and send the members of the `.zapp` (`program.zbc`, `resources.bin`, `packs/default.zpk`,
  `zinc.json`). No native library goes to a player: its plugins are linked in, and a program that needs another one is refused with
  the plugin's name, as Zinc Go does.
- **Order:** the shared console player tested on this Mac's loopback first (the headless host build of the core), then PSP (PPSSPP), 3DS
  (Azahar), Vita (Vita3K, and the owner's Vita), then `zinc dev --device`, discovery, Android (Zinc Go), webOS, iOS (simulator only).

## 1. Per platform

### 1.1 The three consoles: what is common

| | PSP | PS Vita | 3DS |
|---|---|---|---|
| The player | `EBOOT.PBP` in `ms0:/PSP/GAME/ZincPlayer/` | `zinc-player.vpk`, title id `ZNPL00001`, its own LiveArea bubble | `zinc-player.3dsx` in `sdmc:/3ds/zinc-player/`, started from the Homebrew Launcher |
| Built by | `tools/build-console-core psp --player` (new flag) | `... vita --player [--vitagl]` | `... n3ds --player` (devkitPro's pinned image) |
| HAL today | `targets/psp/hal_psp.cpp` (172 lines) | `targets/vita/hal_vita.cpp` (381), GXM `gxm_vita.cpp` or vitaGL | `targets/n3ds/hal_n3ds.cpp` (385), PICA replay `c3d_n3ds.cpp` |
| Its data (`zn_console_data_dir`) | `ms0:/PSP/GAME/ZincPlayer/` | `ux0:data/ZNPL00001/` | `sdmc:/3ds/zinc-player/` |
| Network (ZN-791's socket layer assumed) | `sceUtilityLoadNetModule(COMMON, INET)`, `sceNetInit`, `sceNetInetInit`, `sceNetApctlInit`, `sceNetApctlConnect(<profile>)`; BSD calls through pspsdk's newlib (`sceNetInet*`, `sceNetInetPoll`, `sceNetInetSelect` in `pspnet_inet.h`) | `sceNetInit`, `sceNetCtlInit` (already in `hal_vita.cpp` for `network()`); VitaSDK's newlib has `sys/socket.h`, `poll.h`, `select.h` over `libSceNet_stub` | `socInit(memalign(0x1000, 0x100000), 0x100000)`; BSD sockets and `poll` from libctru's soc; `gethostid()` gives the address |
| Wi-Fi | 802.11b, WEP / WPA-PSK (TKIP, AES): the access point may need a 2.4 GHz WPA2 network; the profile is the console's own | 802.11b/g/n, WPA2 | 802.11b/g, WPA2 |
| Entropy for mbedTLS | the KIRK engine's PRNG (`sceUtilsBufferCopyWithRange(out, 20, NULL, 0, KIRK_CMD_PRNG)` = 14, `pspcrypt.h`) is a kernel export: a 1 KB kernel PRX loaded at start under CFW/ARK; fallback: the jitter of `sceKernelGetSystemTimeWide` around Wi-Fi and pad calls, hashed, with a seed file kept in the data directory | `sceKernelGetRandomNumber(buf, ≤64)` (`psp2/kernel/rng.h`) | `psInit()` then `PS_GenerateRandomBytes` (ps:ps service), or `sslcGenerateRandomData` |
| Emulator for the tests | PPSSPPHeadless 1.20.4: `headless/Headless.cpp` sets `bEnableWlan = true`; `sceNetInet` maps to host sockets (`Core/HLE/sceNetInet.cpp`, `SO_BROADCAST` and `IP_ADD_MEMBERSHIP` translated in `NetInetConstants.cpp`); KIRK PRNG is HLE'd (libkirk) | Vita3K: `sceNet` sockets are partly implemented: a `listen` / `accept` server is unproven there; the owner's Vita is the reference | Azahar: `soc:U` forwards to host sockets (Citra's SOC_U, since 2014); `ps:ps` random is emulated |

mbedTLS on a console (the vendored 4.0.0, `third_party/mbedtls`):

- **Config.** A user config for the core, `targets/console/mbedtls_console.h` (passed as `MBEDTLS_USER_CONFIG_FILE` and
  `TF_PSA_CRYPTO_USER_CONFIG_FILE`): `MBEDTLS_THREADING_C` and `_PTHREAD` off (the core is single-threaded; the desktop needs them for
  libdatachannel), `MBEDTLS_PSA_BUILTIN_GET_ENTROPY` off and `MBEDTLS_PSA_DRIVER_GET_ENTROPY` on, with `mbedtls_platform_get_entropy()`
  in each HAL (`mbedtls/platform.h` line 486 declares it); no X.509, no RSA, no file system, P-256 only, TLS 1.2 with
  `TLS-ECJPAKE-WITH-AES-128-CCM-8` and TLS 1.3 PSK with `TLS_AES_128_GCM_SHA256`. Nothing in the agent needs a certificate.
- **Size.** The desktop's whole `libzn_mbedtls.a` is 1.26 MB (x86-64, every module, -O2). With the config above, the code linked into
  the core should be 200 to 350 KB (MIPS code is the largest of the three): estimate, measured with `psp-size` / `arm-vita-eabi-size`
  in step 1. RAM: two record buffers of 16 KB (`MBEDTLS_SSL_IN_CONTENT_LEN` / `OUT`) per session, one session at a time, and the frame
  buffer of the transfer (data frames of 32 KB, `kChunk`). Against 24 MB of user memory on a PSP-1000 this is small.
- **Speed of EC J-PAKE (estimate, to be measured in step 1).** A pairing costs each side about 14 to 16 P-256 scalar multiplications (two
  keys and two Schnorr proofs, verifying the two of the peer, then one key, one proof, one check and the secret in round two); a session
  of TLS 1.3 `psk_dhe_ke` costs 2 or 3. mbedTLS's generic 32-bit bignum takes about 3 to 10 M cycles per multiplication, so: PSP
  (Allegrex, 333 MHz, `multu` gives 32x32->64) 0.4 to 1 s per pairing; old 3DS (ARM11, 268 MHz) 0.5 to 1 s, a New 3DS at 804 MHz
  about 0.2 s; Vita (Cortex-A9 at 333 to 444 MHz) 0.2 to 0.4 s. A session is 0.05 to 0.2 s. The pairing happens once, on the player's
  waiting screen, so it costs nothing to a game; a session opened while a program runs (`stop`, `logs`) stalls one frame by that much,
  which is a development tool's acceptable hitch. If the PSP is above 1 s: `MBEDTLS_ECP_WINDOW_SIZE 2` and `MBEDTLS_ECP_FIXED_POINT_OPTIM`
  are the first knobs; `MBEDTLS_ECP_NIST_OPTIM` is already on by default.

**Running a received program without relaunching the homebrew.** `core_main.cpp` loads one program (an argument, `program.zbc` beside
the executable, or the linked one) and returns. The player turns its body into a function, `runProgram(dir)`, and loops:

```
for (;;) { waitScreen(); /* pairing code, address, "waiting for zinc device" */  runProgram(appDir); resetHosts(); }
```

- `runProgram(dir)` is today's `main` from `readFile(path)` to `runModuleHooked`, with the pack read from `dir/packs/default.zpk` into a
  64-byte-aligned buffer instead of `zn_console_pack` (a weak const pointer today: a setter `zn_console_use_pack(p, n)` replaces it), and
  `zn_console_data_dir()` answering the app's own directory (`<data>/apps/<name>/`), so `storage.kv` stays per app.
- `finish()` must not call `hal_shutdown()` in a player; the text screen of a program that ended (`textScreen`) gains "waiting for the
  workstation" and returns as soon as a new `run` arrives.
- `resetHosts()`: the args and the error state of `host_console.cpp`, the voices of `audio_console.cpp`, the images and fonts of the gfx
  host (`installResources` replaces them; images a program created must be freed), `zn::host::gfxStarted` stays (the surface is the
  console's screen). The risk is memory not given back between runs (the old runtime's heap, gfx images): the test runs the same program
  20 times and compares free memory (`sceKernelTotalFreeMemSize`, `osGetMemRegionFree`, `sceKernelGetFreeMemorySize`).
- **Fallback when a reset leaks:** relaunch the homebrew with the program as its argument, which `core_main` already reads: PSP
  `sceKernelLoadExec("ms0:/PSP/GAME/ZincPlayer/EBOOT.PBP", &param)` with the path in `param.argp`; Vita `sceAppMgrLoadExec("app0:eboot.bin",
  argv, NULL)`. The 3DS has no relaunch for a `.3dsx` short of the Homebrew Launcher's chainload, so it needs the in-process restart.
- **Where the network is served.** The program runs on the console's one thread inside the interpreter, so the player is polled: each HAL's
  `hal_poll_input` ends with `in->quit |= zn_player_poll();` (a weak function answering 0 in a plain core), and `host_console.cpp`'s
  `wait` calls it too, for programs without frames. `zn_player_poll` accepts a connection, advances a handshake, sends the queued log
  lines, and answers 1 when a `stop` arrived. A program that loops without a frame or a wait cannot be stopped from the workstation
  (no interrupt in the VM): HOME / START / the console's own quit. ponytail: polled, no thread; a network thread on the Vita and 3DS if
  a session's handshake shows as a hitch that matters.
- **Logs back.** `tap()` in `core_main.cpp` already receives every line of the program: the player keeps the last 64 KB per app (and
  `<app>/zinc.log`, as the Vita HAL does) and sends them as `O` frames to a `logs` session that follows; `X <status>` when the program
  ends.
- **Screenshot.** Each HAL already reads back the frame the screen shows for the emulator tests (`shot()` in `hal_vita.cpp`, `ppm()` in
  `hal_n3ds.cpp`, PPSSPP's screenshot device on the PSP): that code becomes `zn_console_shot(std::string& ppm)` (the PSP reads its
  framebuffer with `sceDisplayGetFrameBuf`), the player sends the PPM, and the workstation writes the PNG.
- **Stop.** `stop` sets the flag that `zn_player_poll` returns; the program sees `shouldQuit()` at its next frame and ends; START on the
  console does the same.
- **Pairing code on the screen.** The waiting screen uses the gfx host the text screen already uses: the player's name (`ZINC_PLAYER_NAME`,
  else `psp-<last 4 hex digits of the MAC>`), its address and port, the code in large digits, the paired workstations. Six digits, five
  minutes, three tries, one workstation, as `zinc agent`. SELECT shows a new code; holding SELECT at start forgets every workstation.
- **Keys** in `<data>/agent/clients.json` and `agent.json` (id, name): the console's storage is readable by whoever holds it, as on a Pi.

### 1.2 Android

- **The player is Zinc Go** (`examples/zinc-go` exported with `"player": true`, `src/app/player.cpp`, `zn_app_player`): the interpreter, hot
  swap, every plugin with a phone entry, the home screen as a hot unit. It already runs a project from `zinc dev --lan` (port 8090, an
  8-hex-digit code, no TLS) with Fast Refresh; that stays for the QR-code flow.
- **Agent mode** is added to it: `player.cpp` links `src/agent/player.cpp` and calls `playerPoll` from its tick (between two ticks the
  machine's stack is empty: the player already swaps and restarts programs there, `appStart`). The home screen shows the pairing
  code and the address: the player passes them in the home program's environment (`ZINC_GO_PAIR`, read with zinc:sys `env`, as it
  passes the link today) and starts the home again when the code changes.
- **Networking:** POSIX sockets and the engine's mbedTLS are already in `zn_app` (with threads, libuv). Discovery: `src/net/dnssd.cpp`
  (mjansson/mdns) needs a `WifiManager.MulticastLock` to receive multicast queries on Android: one JNI call in `ZincActivity` while the
  player listens. Sonos discovery worked without it only because the answers were unicast (`zinc-next-android.md`).
- **Running a received program:** an `install` of program.zbc + resources.bin + packs into the app's files directory, then `run` starts it
  with `appStart` (Zinc Go already starts plain programs and hot units); `zinc dev --device` sends hot units (`hot::save`) inside the
  session, so Fast Refresh keeps state as with `--lan`.
- **Logs:** the player's `log <line>` already reaches `zinc dev`; in agent mode the lines go as `O` frames. **Shot:** the gfx host's PNG
  path (`png_encoder`, what `ZINC_SHOT` writes) on the next frame. **Stop:** back to the home screen.
- Tests: the Android emulator (`adb forward tcp:7733 tcp:7733`, then `zinc device pair 127.0.0.1:7733 <code>`), the owner's Nexus 7
  on the Wi-Fi by hand.

### 1.3 webOS (HP TouchPad)

- webOS 3.0 is Linux 2.6.35 with glibc 2.8; the engine's programs already run there (`armv7-webos`, `src/host/glibc_compat.c`, the GL
  display `plugins/display-gl/src/webos.cpp`, `zinc:webos` with `libpdl.so`; `docs/reports/hardware/hp-touchpad-webos.md` sections 9 to 14).
  fork and exec work, so **the real `zinc agent` runs there**: `server.cpp` unchanged, its apps started as `<self> run <program>`.
- What is missing is a `zinc` that runs a ZBC there without the compiler: the player runtime of ZN-392 (the ZBC VM and the host runtime,
  built with the pinned zig like the AOT runtime), plus `src/agent/server.cpp`, `wire.cpp`, `dnssd.cpp`. Its commands: `agent`, `agent pair`,
  `run program.zbc|app.zapp`. On this target `zinc agent` must accept running as the PDK app's user (webOS jails apps as their own user;
  the shell over novacom is root, which the agent refuses: start it from the app, never with `--allow-root`).
- **The player app:** a PDK app (`appinfo.json` `"type": "pdk"`, in `/media/cryptofs/apps/usr/palm/applications/dev.zinc.player/`, rescanned
  through `palm://com.palm.applicationManager/rescan`, as `tools/webos-apps` installs today): a small Zinc program on the GL display that
  shows the name, address and code (read from the agent's log or `pairing.json`) and starts the agent as its child. A deployed program
  takes the screen: the player gives its SDL window up before the program opens its own (the Pi's display lease, `ZINC_AGENT_SCREEN`,
  is the model) and takes it back when the program ends.
- **Deploy:** `info` answers `os linux`, `arch armv7l`, `kind HP TouchPad`, `"player": true`, `"profile": "touchpad"`: the workstation
  packs for that profile and sends the members, as for a console (no export, no cross build of a whole app at each run). Discovery: the
  agent's mDNS as on Linux. HTTPS needs `cacert.pem` beside the runtime (section 9 of the TouchPad report).
- Tests: the desktop loopback with `ZINC_AGENT_AS="linux armv7l HP TouchPad"` for the client's choice; the tablet by hand (novacom, the
  owner's TouchPad).

### 1.4 iOS

- **The player is Zinc Go for iOS** (the same `player.cpp`, SDL's UIKit backend), with the agent mode of Android.
- **Store and signing:** a player runs code that was not reviewed, so it is a debug or TestFlight build only (D59,
  `docs/reports/ios-core-runtime.md`: DPLA 3.3.1(B) allows interpreted code in one's own app; a public "Zinc Go" is Guideline 4.7 territory).
  A device build needs the owner's Apple team (`cmake -DZINC_TEAM=<team id>`, `zinc-next-ios.md`).
- **Networking:** listening sockets work while the app is in front; iOS suspends it in the background (the session ends, the program
  stops). The local network needs `NSLocalNetworkUsageDescription` and `NSBonjourServices = ["_zinc._tcp"]` in the Info.plist. Raw multicast
  sockets need the `com.apple.developer.networking.multicast` entitlement, which Apple grants on request: so on iOS the announcement goes
  through the system's Bonjour (`DNSServiceRegister` of `dns_sd.h`), never through mjansson/mdns.
- Tests: the iOS simulator shares the Mac's network, so the loopback test of Android runs as is (`xcrun simctl launch`, then `zinc device
  pair 127.0.0.1:7733 <code>`).

## 2. The protocol a player speaks

Unchanged: the clear line (`ZNA1 pair` / `ZNA1 sess`, answered `ZNA1 ok` or `ZNA1 closed`), the TLS suites, the frames (`J`, `O`, `E`, `X`,
`C`; at most 1 MiB, a console player refuses a JSON frame above 64 KB), one request per connection, the client's files
(`~/.zinc/devices.json`).

| `op` | In a player | Notes |
|---|---|---|
| pairing (`ZNA1 pair`) | yes | the code on the screen; the identity and key given inside the J-PAKE session as `zinc agent` does |
| `info`, `top` | yes | `top` because Atelier's devices panel reads it every second. New fields: `"player": true`, `"profile"` (`psp`, `vita`, `n3ds`, `android`, `ios`, `touchpad`), `"plugins"` (the native modules linked in), `os` = `psp` / `vita` / `n3ds` / `android` / `ios` (`linux` on webOS), `arch` (`mips`, `armv7`, `arm11`, `arm64`...), `kind` (`PSP-3000`, `PS Vita`, `New 3DS`, the phone's model), `osVersion` (the firmware), `engine`, free memory, battery |
| `install` | yes, members only | entries as for `push`: `program.zbc`, `resources.bin`, `packs/*.zpk`, `zinc.json`, into `<data>/apps/<name>/`; a name with `/` at the start or `..` refused; no `.zapp` reader on a console (the client unpacks); a signed install (`sig`) is refused as unsupported in the first version |
| `run`, `stop`, `apps`, `uninstall` | yes | one program at a time: a `run` stops the one running; `args`, `env` passed to zinc:sys |
| `logs` | yes | from the per-app buffer and file; `follow` until the client leaves |
| `dev` | yes | the start message and members of `zinc dev --device`, members written in `<data>/dev/`, the program restarted in process; `I` frames for assets come later (needs the dev socket's messages in the console host) |
| `shot` (new op) | yes | answer `{"ok": true, "format": "ppm"|"png", "width", "height"}`, then `O` frames, then `X 0`. `zinc device shot` uses it when `info.player`, else the inspector as today |
| `unpair` | yes | |
| `shell`, `push`, `pull`, `connect`, `listen`, `accepted`, `update` | no (webOS: all, it runs the real agent) | answered `{"ok": false, "error": "<name> is a player: no shell"}` (or files, forwarded ports, updates) |

What `zinc device` learns (`src/agent/client.cpp`):

- `deploy` (around line 570, where `info` chooses `source`, `pack` or an export): `if (a.flag("player"))` packs with
  `zinc pack <dir> --profile <a.str("profile")> -o <tmp>.zapp`, unpacks it (the `.zapp` reader of `src/zapp`), sends `install` with
  `program.zbc`, `resources.bin`, `packs/`, `zinc.json`, then `run` and `logs -f` as for any app. The step line says it:
  `device  vita is a PS Vita player: packing for --profile vita (bytecode, no native code)`.
- A plugin the player lacks: before sending, the client compares the program's native modules (the pack lists them, as `--emit=hot`
  names them for Zinc Go) with `info.plugins` and refuses with the plugin's name.
- Versions: the series check of `zinc dev --device` (`tests/t1/agent_dev_versions.sh`) applies to `deploy` too, since the device runs the
  workstation's bytecode; the way out on a console is to install a newer player (`tools/build-console-core <c> --player`, then the console's
  own copy step), so the refusal names that command.
- `zinc dev --device` (`src/agent/dev.cpp`): `pack()` adds `--profile <p>` when the device is a player; the changed members go as today.
- `zinc device list`: the broadcast answers of section 3, step 7, beside mDNS. `zinc device pair <address>:7733 <code>` already works with an
  address typed from the console's screen, which is enough until then.

## 3. Implementation plan

Each step fits one agent session, ends with its own test, and builds only what it touches. The console steps need no console to run
(the host build of the core, then the emulators).

**Step 1. The agent's transport in the console core** (no ops yet).
- Split `src/agent/wire.cpp` into `chan.cpp` (dial, lines in clear, the TLS openers, send, fill, next, recv: sockets and `tls.cpp` only)
  and `wire.cpp` (transfers, `std::filesystem`, yyjson helpers); the desktop links both, unchanged.
- `targets/console/CMakeLists.txt`: option `ZN_CONSOLE_PLAYER` links `chan.cpp`, `src/host/tls.cpp`, yyjson and `zn_mbedtls` built with
  `targets/console/mbedtls_console.h`; `tools/build-console-core --player` sets it, the title "Zinc Player", id `ZNPL00001`.
- `mbedtls_platform_get_entropy` in each HAL (section 1.1), `/dev/urandom` in the host build.
- Test: `tests/t0/console_player.sh`: the host build of the core (`cmake -S targets/console`, the headless HAL) with `ZN_CONSOLE_PLAYER=ON`,
  started with `ZINC_PLAYER_CODE=123456` (a test switch, as `ZINC_AGENT_AS`), and `zinc device pair 127.0.0.1:<port> 123456` succeeds;
  `tests/t0/agent.sh` still passes. Measured and written in the task notes: the code size added to `EBOOT.PBP` / `zinc.vpk` / `.3dsx`
  (one cross build each, `psp-size`), and the time of one pairing (an mbedTLS EC J-PAKE loop in the host core, then in PPSSPP).
- Risks: newlib's sockets headers differ (`platform/socket.h` is the place that already hides Winsock); mbedTLS 4.0 user-config names.

**Step 2. The player server and the console player loop.**
- `src/agent/player.cpp` + `player.h`: `PlayerHost` (`start(dir, args, env)`, `stop()`, `running()`, `shot(std::string&)`, `info(Obj&)`),
  `playerPoll(PlayerState&, int timeoutMs)`; ops `info`, `top`, `install`, `run`, `stop`, `apps`, `uninstall`, `logs`, `shot`, `unpair`; the
  rest refused with the sentence of section 2. Files through stdio, keys in `<data>/agent/`.
- `targets/console/core_main.cpp`: `runProgram(dir)`, the waiting screen, the loop, `finish` without `hal_shutdown` in a player;
  `targets/console/player_console.cpp`: the `PlayerHost` of the core, `zn_player_poll()`; `host_console.cpp`: `zn_console_use_pack`, the
  app's data directory, `resetHosts`; the call to `zn_player_poll` in `wait` and in `targets/null/hal_null.cpp`'s poll.
- Test: `tests/t1/console_player.sh` on the loopback, with the host-built core: pair, `install` + `run` of `examples/hello` packed with
  `--profile psp`, its lines through `logs`, `stop`, a second program, the same program run 20 times with free memory compared, `shot`
  of a drawing program against `zinc run --interp --profile psp` (`ZINC_FRAMEHASH`).
- Risks: state left by a program in the gfx host and the old runtime; the 3DS's 2 MiB register stack (`n3ds.cmake`) allocated once.

**Step 3. `zinc device` for players** (workstation only).
- `src/agent/client.cpp`: the player branch of `deploy`, the plugin check, `shot` through the new op, the version check, the `info`
  fields printed; `src/agent/dev.cpp`: `--profile`.
- Test: `tests/t1/console_player.sh` gains `zinc device deploy examples/breakout` and `zinc device shot`; `tests/t1/agent_deploy.sh`
  unchanged for the other machines.
- `docs/reports/zinc-next-agent.md`: the player section and the op table; CHANGELOG line ("`zinc device` deploys to the Zinc Player on a PSP,
  a Vita and a 3DS").

**Step 4. PSP.**
- `targets/psp/hal_psp.cpp`: the network up (ZN-791's layer, `sceNetApctlConnect` on the first profile, the address on the waiting screen),
  the KIRK entropy PRX (`targets/psp/rng_prx/`, kernel mode) and its fallback, `zn_console_shot` from `sceDisplayGetFrameBuf`, the poll call.
- Test: `tests/t1/console_player_psp.sh`: `tools/build-console-core psp --player --env ZINC_PLAYER_CODE=123456`, `tools/console-run psp
  EBOOT.PBP --timeout 120 &`, pair over 127.0.0.1 (PPSSPP's inet uses host sockets), deploy hello, read its lines, stop, end the emulator.
- Risks: PPSSPP's `sceNetApctl` emulation (headless sets `bEnableWlan`; whether `sceNetApctlConnect` reaches "got IP" there must be seen);
  host port 7733 taken by a desktop agent (the test picks another with `ZINC_PLAYER_PORT`); a real PSP's 2.4 GHz WPA only (owner, by hand).

**Step 5. 3DS.**
- `targets/n3ds/hal_n3ds.cpp`: `socInit` once (its 1 MiB buffer is a 3DS's real memory cost: say it in `info`), `PS_GenerateRandomBytes`,
  the shot of the top screen, the poll call. The waiting screen on the top screen, the code on the bottom one too.
- Test: `lockf -k /tmp/zinc-azahar.lock tools/console-run n3ds zinc-player.3dsx --timeout 120 &`, the same session as step 4.
- Risks: Azahar's soc and `ps:ps` emulation; an old 3DS's 268 MHz on J-PAKE (measure; a New 3DS turns the 804 MHz clock on with
  `osSetSpeedupEnable(true)`, which the player sets during a handshake).

**Step 6. Vita.**
- `targets/vita/hal_vita.cpp`: the sockets on `sceNet` (already started for `network()`), `sceKernelGetRandomNumber` (64 bytes per call),
  `zn_console_shot` from the existing `shot()`, the poll call; the relaunch fallback with `sceAppMgrLoadExec` if the in-process reset
  leaks on vitaGL.
- Test: Vita3K with the session of step 4; if Vita3K's sockets cannot listen, the test is skipped (77) with the reason, and the owner's Vita
  is the proof: the `.vpk` installed with VitaShell, then `zinc device pair <its address>:7733 <code>` and `zinc device deploy
  examples/meadow-run` (exact commands in the task notes).
- Risks: Vita3K's `sceNet` (`accept`, `poll`); a vitaGL core's shader cache shared between programs (fine: same replay programs).

**Step 7. Discovery without typing an address.**
- `src/agent/client.cpp` (`device list`): one UDP broadcast `ZNA1 who` to 255.255.255.255:7733 next to the mDNS browse (or ZN-791's
  discovery if it lands first: reuse it); `src/agent/player.cpp`: a UDP socket on 7733 answers with the TXT fields (`id`, `kind`, `os`,
  `pair`). Consoles have no `getifaddrs` and doubtful multicast, so no mDNS responder there.
- Test: `tests/t1/console_player.sh` lists the host-built player by name; PPSSPP and Azahar by hand (broadcast through an emulator's NAT
  is not guaranteed).

**Step 8. Android: Zinc Go as a player of `zinc device`.**
- `src/app/player.cpp`: `PlayerHost` over `appStart`, `playerPoll` from the tick, the home screen's `ZINC_GO_PAIR`, hot units in `dev`;
  `examples/zinc-go/src/main.tsx`: the code and address on the home screen; `ZincActivity`: the `MulticastLock` while listening; mDNS
  announce with `src/net/dnssd.cpp`.
- Test: `tests/t2/zinc_go_phones.sh` gains the agent half on the API emulator (adb forward, pair, deploy rn-showcase, logs, shot, stop);
  `tests/t1/zinc_go.sh` the same on the desktop player. The Nexus 7 over Wi-Fi by hand.
- Risks: the agent's 1 MiB frames and the phone's memory (fine); a second listening protocol beside `--lan` (both stay: QR for a first
  run, pairing for a device kept on a desk).

**Step 9. webOS.**
- The player runtime for `armv7-webos` (ZN-392's piece: the VM, the host runtime and `src/agent` without the compiler), `zinc agent` allowed
  as the app user there, the PDK player app (`examples/webos-player` or `tools/webos-apps --player`), the screen hand-over, `info`'s
  `player` and `profile: touchpad` (a `touchpad` profile does not exist yet: 1024x768, GLES 2; add it in `src/frontend/profile.cpp`).
- Test: the cross build links (`zinc build --target armv7-webos` of the runtime, `llvm-nm` shows no glibc symbol above 2.8); the
  client's choice on the loopback with `ZINC_AGENT_AS`; the tablet by hand (novacom install, pair, deploy).
- Risks: the 2011 kernel under libuv (programs already run there); two processes on one GL display.

**Step 10. iOS.**
- The agent mode of step 8 in the iOS export of Zinc Go; `DNSServiceRegister` instead of mjansson's responder; `NSBonjourServices` and
  `NSLocalNetworkUsageDescription` in the generated Info.plist (`zinc export --target ios`, `tests/t0/export_ios.sh` golden).
- Test: the iOS simulator, the session of step 8 on 127.0.0.1.
- Risks: background suspension (a session ends when the app leaves the front: said in the player).

**What this Intel Mac cannot prove:** a real PSP, Vita, 3DS on Wi-Fi (the owner's consoles, by hand: each step leaves the commands);
J-PAKE timings on real hardware (the emulators do not run at the console's speed); an iPhone (signing with the owner's Apple team, the
local network permission prompt, Bonjour on a real Wi-Fi); Android's `MulticastLock` on the Nexus 7 and the TouchPad's two-process display
(by hand); Vita3K's `listen` / `accept` may simply not work. Each goes as a line under "Cross-platform pass" in `backlog/later.md`.

## 4. Choices made, and why

- **The agent's protocol, not Zinc Go's**, for every player: one pairing, one key store, one client (`zinc device`, Atelier's devices panel
  unchanged), TLS on a shared Wi-Fi. Zinc Go's protocol stays for its QR flow (no pairing, a code in the link).
- **One polled server** (`src/agent/player.cpp`) for the consoles and the phones rather than `server.cpp` with `#ifdef`s: `server.cpp` is
  built on fork, process groups, pid files and `std::filesystem`; none of it exists on a console or in a phone app.
- **The workstation compiles** (as `zinc dev --device` already does): a console has no room or speed for the compiler, and the bytecode is
  what the core already loads.
- **The real agent on webOS**, because it is a Linux where processes work: no second server to keep.
- **No mDNS on consoles:** no `getifaddrs`, multicast doubtful in the emulators; an address on the screen, then a broadcast probe.

## 5. Where it stands (2026-10-25, after the consoles)

### Android (step 8): done, proven on the Nexus 7

- Zinc Go's device mode is in `src/app/player.cpp`: `src/agent/player.cpp` polled from its tick (on by default on a phone, on a desktop
  only with `ZINC_PLAYER_PORT`), its files in `SDL_GetPrefPath("zinc", "player")`. The home screen gets `--device`, `--address`, `--code`,
  `--paired` and starts again when they change; "Pair another computer" opens `zinc://pair`, which the player takes as "a new code". A
  received `program.zbc` starts with `appStart` (its `resources.bin` installed, its `packs/` mounted in front), its lines go to the app's log
  (`appFinish` now sends the last lines and the error through the console tap, and `exit(n)` gives status `n`), `stop` goes back home, `shot`
  is `capture_png`. mDNS through `src/net/dnssd.cpp`'s polled `Responder`, with the Wi-Fi `MulticastLock` (`ZincActivity.zincMulticast`,
  `CHANGE_WIFI_MULTICAST_STATE` in a player's manifest). `info.plugins` is the list `zinc export` writes into `player_modules.cpp`.
- Proven: `tests/t1/zinc_go_device.sh` (the desktop player on the loopback); on the Nexus 7 (Android 7.1, armeabi-v7a APK): pairing through
  `adb forward tcp:7733 tcp:7733` and over Wi-Fi, `info`, `deploy examples/hello` (29 lines, identical to `zinc run --profile android`),
  `deploy examples/rn-showcase` (2 MiB, its Home in `zinc device shot`), `stop` back to the home screen, `bouncing-ball` and its shot,
  `zinc dev --device` (v2 285 ms after the save), `zinc device list` finding `android-ed6b` over mDNS.
- Not proven: the API 37 emulator (only an arm64 image is installed and the Nexus 7 was there), a phone on another network.

### iOS (step 10): done in the simulator

- The same code in the iOS export (`zinc export examples/zinc-go --target ios --ipa --simulator`); no mDNS on iOS (raw multicast needs
  Apple's entitlement: `DNSServiceRegister` is the next step), so a phone is paired by its address. `NSLocalNetworkUsageDescription` comes
  from Zinc Go's `net` permission.
- Proven in the iPhone 17 simulator (iOS 26.3): pair on 127.0.0.1, `info` (`ios`, 13 plugins), `deploy examples/hello` (identical to `zinc
  run --profile ios`), `deploy examples/rn-showcase` and its shot, `stop` back to the home screen (which shows "Paired with ...").
- Not proven: an iPhone. The owner's step: `ZINC_IOS_TEAM=<team id> zinc export examples/zinc-go --target ios --ipa -o dist/zinc-go-ios`,
  install the .ipa (Xcode, Devices and Simulators), start it, allow the local network, then `zinc device pair <address> <code>`.

### webOS (step 9): a headless player built, not run

- The design's way (the real `zinc agent` in ZN-392's runtime) waits for ZN-392. Built instead, as a first step: the console core with the
  player, headless (programs print, they do not draw), cross built with the pinned zig for `armv7-webos`: `tools/webos-player build` (1.3 MB
  stripped, highest symbol `GLIBC_2.4`; the same code passes `tests/t0/console_player.sh` on this Mac). `os webos`, profile `linux`
  (`ZINC_PLAYER_PROFILE`; a `touchpad` profile is a later line), port 7733 opened in the tablet's firewall by its start script.
- Not run: the tablet was not reachable (`novacom -l`: no `novacomd`). The owner's steps: `sudo ~/.local/bin/novacomd` in a terminal,
  then `tools/webos-player install`, `tools/webos-player start` (it prints the address and the code), and here `zinc device pair <address>
  <code>`, `zinc device deploy examples/hello`.
- Next: a webOS HAL for the core (`targets/webos/hal_webos.cpp` over SDL 1.2 and `PDL_Init`, GLES 2 as `plugins/display-gl/src/webos.cpp`
  does), so the player draws, packaged as a PDK app by `tools/webos-apps` with the waiting screen of the consoles.

Sources: pspsdk headers of the pinned pspdev (`pspnet_inet.h`, `pspcrypt.h`), the pinned PPSSPP 1.20.4 sources (`headless/Headless.cpp`,
`Core/HLE/sceNetInet.cpp`, `NetInetConstants.cpp`, `sceChnnlsv.cpp`), VitaSDK's `psp2/kernel/rng.h` ([docs.vitasdk.org, SceRngUser](https://docs.vitasdk.org/group__SceRngUser.html)),
3dbrew's [PS:GenerateRandomBytes](https://www.3dbrew.org/wiki/PSPXI:GenerateRandomBytes), Citra's first SOC_U commit (Berkeley sockets on the host),
[PPSSPP network settings](https://www.ppsspp.org/docs/settings/network), mbedTLS 4.0's `crypto_config.h` (vendored).
