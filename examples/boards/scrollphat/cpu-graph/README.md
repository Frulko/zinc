# cpu-graph

The Pi's CPU usage as a scrolling bar graph on a [Pimoroni Scroll pHAT](../../../../docs/boards.md#pimoroni-scroll-phat):
one column every half second, newest on the right, 5 LEDs = 100 %. Every 10 seconds it shows memory usage for 5
seconds; a letter (`C` / `M`) announces each graph.

| file | what |
| --- | --- |
| `src/stats.ts` | CPU from `/proc/stat` (busy / total jiffies between two samples), memory from `/proc/meminfo` (`1 - MemAvailable / MemTotal`); simulated where there is no `/proc` (macOS) |
| `src/main.ts` | sampling, graph switching, drawing |
| `zinc.json` | `"board": "pimoroni-scroll-phat"` |

```sh
zinc run examples/boards/scrollphat/cpu-graph                              # macOS emulator, simulated numbers; Space switches
zinc deploy examples/boards/scrollphat/cpu-graph --target rpi1 --device pi@raspberrypi.local
```
