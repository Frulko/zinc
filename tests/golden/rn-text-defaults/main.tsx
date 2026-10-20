// React Native's text defaults under the preset (ZN-385): a Text without fontSize is 14 px (16 px without the preset: plain/), StyleSheet.hairlineWidth
// is 0.4 rounded to the device pixel (0.5 at pixel scale 2), and a hairline-high View keeps a pixel of layout.
import React from 'react';
import { View, Text, StyleSheet, PixelRatio } from 'react-native';
import { render } from 'zinc:ui/react';
import * as ui from 'zinc:ui';
import { quit } from 'zinc:gfx';

function App(): i32 {
  return <View><Text>Plain</Text><View style={{ height: StyleSheet.hairlineWidth, width: 40, backgroundColor: '#c6c6c8' }} /></View>;
}
let f = 0;
render(App, 0xffffff, (dt: number) => {
  if (++f < 2) return;
  const t = ui.inspectNode(ui.find('Plain'));
  console.log(`text ${t !== null ? t.size : -1} | scale ${PixelRatio.get()} hairline ${StyleSheet.hairlineWidth}`);
  quit();
});
