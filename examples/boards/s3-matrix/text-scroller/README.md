# text-scroller

A colour marquee on the 8x8 LED matrix of the [Waveshare ESP32-S3-Matrix](../../../../docs/boards.md#waveshare-esp32-s3-matrix).
Messages scroll right to left one after the other, in the 5x7 or the 3x5 pixel font (`zinc:pixelfont`), one colour or
a rainbow letter by letter. Shake the board to skip to the next message.

| file | what |
| --- | --- |
| `src/messages.ts` | the texts, their font and colouring: edit these |
| `src/main.ts` | scrolling, rainbow colouring, shake to skip |
| `zinc.json` | `"board": "waveshare-esp32-s3-matrix"` |

```sh
zinc run examples/boards/s3-matrix/text-scroller                  # macOS emulator: Left/Right speed, Space = shake
zinc run examples/boards/s3-matrix/text-scroller --target esp32   # Espressif QEMU
zinc flash examples/boards/s3-matrix/text-scroller --target esp32 # the real board
```

The text is also the quickest check of the LED wiring on a real board: if it reads mirrored, upside down or runs the
wrong way, fix `display.rotate` / `origin` / `serpentine` (docs/boards.md).
