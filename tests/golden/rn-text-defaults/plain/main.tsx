// Without the react-native preset a Text without fontSize keeps zinc:ui's 16 px (ZN-385).
import { render } from 'zinc:ui/react';
import { View, Text } from 'zinc:react-native';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

function App(): i32 { return <View><Text>Plain</Text></View>; }
let f = 0;
render(App, 0xffffff, (dt: number) => {
  if (++f < 2) return;
  const t = ui.inspectNode(ui.find('Plain'));
  console.log(`text ${t !== null ? t.size : -1}`);
  quit();
});
