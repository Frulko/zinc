import { render } from 'zinc:ui/solid';
import { supports, requireFeature, isBrowser, ZnUnsupported } from 'zinc:browser';
import { which } from 'zinc:fakeusb';

function App(): i32 {
  let usb = 'no';
  try { requireFeature('webusb'); usb = 'yes'; } catch (e) { usb = e instanceof ZnUnsupported ? 'ZnUnsupported ' + e.feature : 'other error'; }
  return <View className="p-6 flex-col gap-2 bg-white w-full h-full">
    <Text className="text-lg">{'browser: ' + (isBrowser() ? 'yes' : 'no') + ', ' + which()}</Text>
    <Text>{'webusb: ' + usb + ', getUserMedia: ' + (supports('getUserMedia') ? 'yes' : 'no')}</Text>
  </View>;
}

render(App, 0xffffff, null);
