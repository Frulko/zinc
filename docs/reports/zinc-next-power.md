# Power observations

`zinc:power` exports `snapshot()` and `onChange(callback)`. The latter returns an idempotent unsubscribe function, samples every second on the VM thread only while subscribed, and reports changed snapshots without an initial event. Listener errors are logged; other subscriptions remain active. Changes shorter than a sample interval, including power-button presses, can be missed.

All readings are read-only. Missing, inaccessible or malformed numbers are `null`. Thermal zones retain their kernel names and types; temperatures are Celsius, with no assumption that zone 0 is the CPU. CPU0 `cpuRequestedMHz` is the CPUFreq requested frequency, not an actual clock measurement; `cpuMaxMHz` is the hardware maximum and `cpuPolicyMaxMHz` the configured policy cap.

`throttledFlags` is the validated firmware GET_THROTTLED response. The four current flags and their `Occurred` counterparts describe under-voltage, frequency capping, throttling and the soft temperature limit. History is latched, but other clients can clear it; it is not guaranteed to mean since boot. The request does not clear flags. `mailboxStatus` distinguishes unsupported platforms, unavailable devices, ioctl failure and invalid responses.

`underVoltageAlarm` is the separate `rpi_volt` recent sampled alarm. The kernel polls and clears firmware history; this fallback does not establish current under-voltage or full history. Fans are discovered by the `pwmfan`/`pwm-fan` hwmon name: `fanRPM` measures rotation where exported, while `fanDuty` is a command from 0 to 255. Zero RPM is distinct from unavailable RPM.

`powerButtonAvailable` observes an input device advertising KEY_POWER. False does not exclude inaccessible hardware. On Linux `powerButtonPressed` uses EVIOCGKEY without grabbing or consuming events; it remains null when unavailable or denied. This is sampled state, not reliable button-event delivery or a power-off action.

Doctor displays the same snapshot. `ZINC_BOARD_ROOT` isolates filesystem fixtures and disables device ioctls; it never opens the real device nodes from a fixture.

Sources: [thermal sysfs](https://docs.kernel.org/5.15/driver-api/thermal/sysfs-api.html), [CPUFreq](https://www.kernel.org/doc/html/latest/admin-guide/pm/cpufreq.html), [firmware mailbox](https://github.com/raspberrypi/firmware/wiki/Mailbox-property-interface), [Pi hwmon](https://docs.kernel.org/hwmon/raspberrypi-hwmon.html), [pwm-fan](https://docs.kernel.org/hwmon/pwm-fan.html).
