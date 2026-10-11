# serial

Plots the numbers a board prints on its serial port, with the [`zinc:serial`](../../docs/plugins/serial.md) plugin.

1. Upload `arduino/plot/plot.ino` to an Arduino (it prints `analogRead(A0)` fifty times a second), and close the
   Arduino IDE's serial monitor: a port has one reader.
2. `zinc run examples/serial`

It takes the first USB serial port it finds and reconnects when the board is unplugged and plugged back.

```sh
SERIAL_PORT=/dev/cu.usbmodem14101 SERIAL_BAUD=115200 zinc run examples/serial   # another port, another speed
ZINC_NATIVE=sim zinc run examples/serial                                        # no board: the simulator's loopback port, a wave
```
