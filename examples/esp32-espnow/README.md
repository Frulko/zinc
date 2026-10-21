# esp32-espnow

Boards that talk with no access point, with `zinc:espnow`: each one broadcasts a hello every two seconds and lists what the others send; the
**Hello** button on the screen sends one at once. With one board only, the counts show its packets going on air.

```sh
zinc run examples/esp32-espnow --target esp32   # on each board (the network firmware is written the first time)
```

Every board must be on the same channel (`CHANNEL` in `src/constants.ts`); a board that is on a Wi-Fi network uses that network's channel, so
on a board that knows a network, use the network's channel or `forget()` it first. A packet holds 250 bytes; a send to one address is
acknowledged (`onSent`), a broadcast is not.
