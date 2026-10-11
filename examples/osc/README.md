# osc

A square that goes where Open Sound Control messages send it, with the [`zinc:osc/full`](../../docs/plugins/osc.md) plugin.

```sh
OSC_DEMO=1 zinc run examples/osc     # no other software: the program sends itself the messages
zinc run examples/osc                # waits on UDP 9000 (OSC_PORT=9001 for another port)
```

Send it, from TouchOSC, Chataigne, Pure Data or any OSC software, to port 9000 of this machine:

| address | arguments | |
|---|---|---|
| `/shape/xy` | two floats, 0 to 1 | the position |
| `/shape/x`, `/shape/y` | one float | one axis |
| `/shape/color` | three floats, 0 to 1 | red, green, blue |
