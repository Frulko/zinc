// tests/t0/lint.sh: a small program made for an ESP32 board (a backlight slider): ok there, refused where there is no GPIO.
import { render } from 'zinc:ui/solid';
import * as device from 'zinc:device';
function App(): i32 {
  return <View className="flex-col p-2 gap-2 bg-slate-900">
    <Text className="text-white">Backlight</Text>
    <Button className="rounded bg-blue-500 p-2" onTap={() => device.setBacklight(1)}>Full</Button>
  </View>;
}
render(App, 0x000000, null);
