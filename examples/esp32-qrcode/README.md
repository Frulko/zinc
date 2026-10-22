# esp32-qrcode

A C library in a TypeScript program on the ESP32: `zinc:qrcode` (`plugins/qrcode`) is Nayuki's QR Code generator behind one C file on
Zinc's native ABI. The board shows a QR code; **NEXT** shows the next text (a link, a Wi-Fi network to join, a sentence) with the time it
took to encode.

```sh
zinc run examples/esp32-qrcode --target esp32   # the first time, zinc builds the firmware with the plugin's C (ESP-IDF, a few minutes)
zinc run examples/esp32-qrcode                  # the same C on the computer
```

How a library gets there: [docs/plugins/native-esp32.md](../../docs/plugins/native-esp32.md). The drawing merges each row's dark modules
into one rectangle per run, which keeps a frame well under the firmware's 768 draw commands.
