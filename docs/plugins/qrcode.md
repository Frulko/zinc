# qrcode plugin (`zinc:qrcode`)

QR codes from text, on [Nayuki's QR Code generator](https://www.nayuki.io/page/qr-code-generator-library) (C, MIT, version 1.8.0 in
`plugins/qrcode/vendor/`). It is also the example of a C library made available to TypeScript on every engine with one C file:
`native/qrcode.abi.c` is written on Zinc's native ABI, so the same file is the plugin's library on the computer (interpreter, AOT, QuickJS)
and is compiled into the ESP32's mquickjs firmware ([native code on the ESP32](native-esp32.md)).

```ts
import { encode, wifiText, HIGH } from 'zinc:qrcode';

const qr = encode('https://example.com');           // MEDIUM error correction, version 20 at most
for (let y = 0; y < qr.size; y++) {
  const runs = qr.runs(y);                           // start, length, start, length... of the dark modules of row y
  for (let i = 0; i < runs.length; i += 2) rect(x0 + s * runs[i], y0 + s * y, s * runs[i + 1], s, 0x000000);
}
encode(wifiText('home', 'secret'), HIGH);            // a phone's camera joins the network
```

- `encode(text, ecc = MEDIUM, maxVersion = 20)`: a `QrCode`; a `RangeError` when the text does not fit (version 20, 97 modules a side,
  holds about 660 bytes at `MEDIUM`). `ecc` is `LOW`, `MEDIUM`, `QUARTILE` or `HIGH`.
- `QrCode`: `size` (modules per side), `module(x, y)` (dark or not), `runs(y)`. Draw a light margin of 4 modules around it.
- `wifiText(ssid, password)`: the `WIFI:` text phones read as "join this network".
- On the ESP32 the two buffers are static (2.4 KB of RAM); a short URL encodes in a few milliseconds.

**Example.** `examples/esp32-qrcode`. **Test.** `tests/t0/mquickjs_esp32.sh` runs it under mquickjs with its C.
