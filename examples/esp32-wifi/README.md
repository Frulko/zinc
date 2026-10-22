# esp32-wifi

A board that joins your Wi-Fi the way WiFiManager does it, with `zinc:wifi` and `zinc:gfx` on the screen of the ESP32-2432S022.

```sh
zinc run examples/esp32-wifi --target esp32                          # over USB (the network firmware is written the first time)
zinc run examples/esp32-wifi --target esp32 --host zinc-e3d8.local   # then over Wi-Fi: the name is on the screen
```

1. The first time, the board knows no network: it opens an open one named after it (`zinc-e3d8`) and shows a QR code of it
   (`zinc:qrcode`, built into the firmware the first time: a few minutes of ESP-IDF, once).
2. Scan the code with a phone's camera, or join the network by hand: the setup page opens by itself (or go to http://192.168.4.1). Pick your network, type its password.
3. The board keeps the network and joins it at each start, whatever program runs; the screen shows its address and the time, which comes
   from the network (the time zone is `TIMEZONE` in `src/constants.ts`). A wrong password reopens the setup page, saying so.
4. **Forget the network** on the screen erases the network and opens the setup page again.

Once on the network, `zinc run <any app> --target esp32 --host zinc-e3d8.local` (or `--host last`) sends programs and firmware updates over
Wi-Fi, with the console in the terminal. The board serves a page at http://zinc-e3d8.local/ that says what it runs.

The setup network is open: anyone in range during the setup can see it. The board answers updates only with the token it printed on its UART
(`~/.zinc/esp32/<name>` keeps it), so plug it in by USB once before the first update over Wi-Fi.
