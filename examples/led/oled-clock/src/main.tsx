// oled-clock: a JSX screen (React model) on a 128x64 SSD1306 OLED, react-ssd1306 style. The UI renders in colour
// like anywhere else and the display driver turns it into 1-bit pixels (see `dither` in zinc.json), so the screen
// stays black and white: large digits, one progress bar for the seconds.
// Without a network clock (the ESP32 build has no SNTP) the time is the uptime; on hosts it is UTC.
import { render, useState, useEffect } from 'zinc:ui/react';
import { split, twoDigits, SECONDS_PER_DAY } from './time';

const BAR_WIDTH = 126;   // px: the screen width minus the 1 px padding on each side

// the frame loop pushes the time into the component through its state setter
let setSecondsOfDay: ((seconds: i32) => void) | null = null;

function Clock(): i32 {
  const [secondsOfDay, setSeconds] = useState<i32>(0);
  useEffect(() => { setSecondsOfDay = setSeconds; }, []);
  const time = split(secondsOfDay);
  return <View class="flex-col h-full p-1 gap-1 bg-black">
    <View class="flex-row justify-between">
      <Text class="text-xs text-white">ZINC</Text>
      <Text class="text-xs text-white">{twoDigits(time.seconds)} s</Text>
    </View>
    <Text class="text-2xl text-white text-center">{twoDigits(time.hours)}:{twoDigits(time.minutes)}</Text>
    <View class="h-1 bg-white" style={{ width: Math.floor(time.seconds * BAR_WIDTH / 59) }} />
  </View>;
}

render(Clock, 0x000000, (dt: number) => {
  const update = setSecondsOfDay;
  if (update !== null) update(Math.floor(Date.now() / 1000) % SECONDS_PER_DAY);
});
