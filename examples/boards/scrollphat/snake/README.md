# snake

An auto-playing snake on the 11x5 LEDs of a [Pimoroni Scroll pHAT](../../../../docs/boards.md#pimoroni-scroll-phat).
The autopilot takes the shortest path to the food (breadth-first search) unless that would trap it, in which case it
moves where the most free space is (flood fill). The food blinks, since every LED is the same white; when the snake is
stuck it blinks, shows its length, and a new game starts. Lengths go to the console.

| file | what |
| --- | --- |
| `src/snake.ts` | the game and the autopilot |
| `src/main.ts` | timing, game over, drawing |
| `zinc.json` | `"board": "pimoroni-scroll-phat"` |

```sh
zinc run examples/boards/scrollphat/snake                                  # macOS emulator; Space restarts
zinc run examples/boards/scrollphat/snake --target sim                     # headless on Node (prints the lengths)
zinc deploy examples/boards/scrollphat/snake --target rpi1 --device pi@raspberrypi.local
```
