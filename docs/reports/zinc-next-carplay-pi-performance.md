# CarPlay on small Raspberry Pi boards

## Current implementation and first performance change

The wireless receiver is a separate GPL JVM program (pinned PlayPort plus the
USB/iAP2 overlay); the native Zinc player connects over WebSocket. The receiver
owns Bluetooth/iAP2, the Wi-Fi handoff, AirPlay pairing and media decryption.
Zinc owns the display, input, audio output and the HUD. Keep this process
boundary if the receiver is later written in C++ or Zinc: protocol code must
not be linked into the engine. The pinned receiver contains about 17,100 lines
of production Kotlin/Java; a full port is a substantial project.

The first player change tries FFmpeg's `h264_v4l2m2m` decoder on Linux only when
the display has hardware layers. When the decoder returns DRM PRIME frames,
the CarPlay image exposes the same `raster::Picture` / KMS layer path used by
`zinc:video`: the frame stays in the decoder's DMA-BUF and needs no BGRA
conversion. If the display draws the image in software or refuses the layer,
the frame is copied to cached memory and converted on demand. If the hardware
decoder cannot open, the existing software decoder remains available. Both
main and cluster decoders use this path. Stream dimensions are passed to the
decoder at setup, before the first packet.

This is a design and Mac regression result, **not a measured Pi speedup**.
`tests/run --only carplay` and `tests/run --only carplay_demo` pass on macOS.
The existing Pi 3B+ `zinc:video` test of a 640×360 H.264 film at 30 fps measured
about 107.5% of one CPU core on the software path versus 12.4% with DMA-BUF
display planes; that is evidence for the mechanism, not a CarPlay measurement.
See [the Pi report](raspberry-pi.md#the-film-without-a-cpu-copy-the-decoders-buffer-on-a-plane-of-the-display-zn-731-2026-10-12).

## Run receiver and player as two services

On a Pi with a display, use the operating system to supervise two processes:

| Unit | Owns | Restart policy |
| --- | --- | --- |
| `zinc-carplay-receiver.service` | AP setup, BlueZ advertisement, identity, RTSP, WebSocket; the current `start-wireless` launcher | Restart on failure, with a short delay and a single-instance lock |
| `zinc-carplay-player.service` | The exported Zinc player, display, touch, speaker, microphone | Restart on failure |
| `zinc-carplay.target` | Starts/stops both units together | None |

Start the receiver before the player (`After=` on the player), but let the Zinc
player stay open if the receiver fails. `Session` already retries a dropped
WebSocket with bounded backoff and shows the disconnected state. Do not bind the
player's lifetime to the receiver with `BindsTo=`: that would blank the screen
on a temporary Bluetooth or server failure. The receiver must not depend on
the player: remote viewers may also connect. Stop the player first, then send
SIGTERM to the receiver launcher so its AP and Bluetooth cleanup runs.
Keep identity, Wi-Fi key and token in owner-only service environment files, not
the Zinc project. Give each unit its own `journalctl -u` log. A boot/start check
must verify there is exactly one receiver and that the player reaches the local
WebSocket; a WebSocket connection alone does not mean the iPhone joined CarPlay.

The deployment contract is one target with two system services. These are the
unit contents to install once the Pi has the exported player; the existing
`start-wireless` launcher is the receiver entry point. Its private environment
file must contain the identity, Wi-Fi secret and token. The player's private
environment file must contain `ZINC_CARPLAY_URL=ws://127.0.0.1:18080/ws?token=...`
and its own display/audio settings. Both files are readable only by `spark`.

```ini
# /etc/systemd/system/zinc-carplay.target
[Unit]
Description=Zinc CarPlay receiver and player
Wants=zinc-carplay-receiver.service zinc-carplay-player.service
```

```ini
# /etc/systemd/system/zinc-carplay-receiver.service
[Unit]
Description=CarPlay wireless receiver
PartOf=zinc-carplay.target
Before=zinc-carplay-player.service

[Service]
Type=simple
User=spark
EnvironmentFile=/home/spark/.config/zinc-carplay/receiver.env
ExecStart=/home/spark/zinc-carplay/start-wireless
Restart=on-failure
RestartSec=3
```

```ini
# /etc/systemd/system/zinc-carplay-player.service
[Unit]
Description=Zinc CarPlay player
PartOf=zinc-carplay.target
Wants=zinc-carplay-receiver.service
After=zinc-carplay-receiver.service

[Service]
Type=simple
User=spark
EnvironmentFile=/home/spark/.config/zinc-carplay/player.env
ExecStart=/home/spark/zinc-carplay/player/run
Restart=on-failure
RestartSec=3
```

Start the pair with `sudo systemctl start zinc-carplay.target`, inspect them
independently with `systemctl status zinc-carplay-{receiver,player}.service` and
`journalctl -fu zinc-carplay-receiver.service` or
`journalctl -fu zinc-carplay-player.service`, and stop both with
`sudo systemctl stop zinc-carplay.target`. Stop the current manually launched
receiver before the first systemd start. On a healthy start the server's local
HTTP port opens, the player connects to its WebSocket, then the phone may pair
and create an AirPlay session. If the receiver restarts, the player stays open
and reconnects. `PartOf=` makes stopping the target stop both units, and the
ordering stops the player before the receiver. The launcher must handle
SIGTERM and restore the AP and Bluetooth state.

This topology also works if both programs are authored in Zinc: each is built
and run as its own executable. A later C++ receiver can replace the JVM unit
without changing the Zinc player or its media envelope. Avoid spawning the
receiver from the UI with `zinc:process`: an abrupt UI exit could kill the
launcher before it restores the AP and Bluetooth state. The existing Pi launcher
is private and has not yet been inspected as a systemd unit; install the units
only when the Pi and exported player are available for an end-to-end test.

## Porting plan and decision gates

1. **Measure the existing pair on Pi 3B+.** With one real wireless session,
   record receiver/player proportional memory (PSS), CPU per process, JVM GC
   pauses, video frames delivered/decoded/displayed, audio gaps and buffer
   underruns for at least five minutes. Repeat at 800×480/30 and the current
   1280×720/60. Confirm whether the live CarPlay decoder selected
   `h264_v4l2m2m`, whether `ZINC_LAYER_LOG=1` reports a hardware layer, and
   whether the cluster uses a second plane. Keep Wi-Fi RSSI and thermal clock
   in the record. No estimate substitutes for these numbers.
2. **Make the hardware player reliable.** Exercise connect, screen/cluster
   reconfiguration, display refusal and reconnect on the actual Pi. If FFmpeg
   accepts the V4L2 decoder but rejects a live frame, retain the software
   fallback and fix the hardware setup using a captured, redacted video fixture.
   Compare the same video and audio session before and after the decoder change.
3. **Port the wireless receiver as a separate C++ executable if profiling
   justifies it.** Start with RTSP/AirPlay control, pairing, media decrypt and
   the existing WebSocket envelope; use proven cryptography and retain the
   external GPL notices. Port Bluetooth/iAP2 handoff, mDNS, microphone and
   telemetry with the current JVM receiver as the protocol oracle. Preserve
   malformed-input limits, private identity storage and reconnect behavior.
   USB is a later, separate port because its macOS native transport and
   Lockdown path add a different set of risks.
4. **Replace only after parity.** A loopback fixture checks encrypted control,
   video, Opus/LPCM, input and iAP2 on both receivers. A live Pi session must
   connect and reconnect, hold 800×480/30 without sustained frame drops, play
   audio without underruns, and use less memory than the JVM pair. Keep the
   JVM receiver as a fallback until then.

Zinc is the right language for the player and control UI. A pure Zinc receiver
is not the first performance port: `zinc:socket` provides TCP/UDP/WebSocket,
but the current Zinc crypto API does not expose ChaCha20-Poly1305 and the
wireless bootstrap still needs native BlueZ/RFCOMM. Adding those primitives and
copying large encrypted media packets through Zinc arrays would need separate
measurement before claiming a performance benefit.

## Pi Zero 2 W gate

The Zero 2 W has four 1 GHz Cortex-A53 cores, 512 MB RAM, H.264 1080p30 decode
and a 2.4 GHz-only Wi-Fi radio ([Raspberry Pi specification](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)).
The current Pi AP uses 5 GHz channel 36, so it cannot be copied unchanged. Apple
recommends 5 GHz for wireless CarPlay and states a 25 Mb/s throughput requirement;
it describes 2.4 GHz as possible but undesirable in congested environments
([WWDC17 wireless CarPlay](https://developer.apple.com/videos/play/wwdc2017/717/)).
Try the Zero only after the Pi 3B+ measurements: a 2.4 GHz AP test or an external
5 GHz USB adapter, hardware H.264 display, 800×480/30, no desktop compositor,
and no swap under a sustained session. 1280×720/60 with the JVM and player on
512 MB is not an acceptance target. No Zero 2 W run has been performed.
