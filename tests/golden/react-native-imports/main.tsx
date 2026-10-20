// React Native's imports under the react-native preset (ZN-367.05): a default React used as React.useEffect, named hooks, Animated and Easing from
// 'react-native' (zinc:ui/animated), an alias of a component (Pressable as Touch; host names keep their own), `import type` dropped, AppRegistry as the entry. The program logs what each import reached.
import React, { useState } from 'react';
import { View, Text, Button, Pressable as Touch, Animated, Easing, AppRegistry, Platform } from 'react-native';
import type { ViewStyle } from 'react-native';
import { quit } from 'zinc:gfx';

const fade = new Animated.Value(0);
function App() {
  const [n, setN] = useState(1);
  React.useEffect(() => {
    console.log(`useEffect from React: n=${n}, OS ${Platform.OS}`);
    Animated.timing(fade, { toValue: 1, duration: 100, easing: Easing.linear }).start((done: boolean) => { console.log(`Animated from react-native: ${fade.get()} ${done}`); quit(); });
  }, []);
  return <View style={{ padding: 10 }}><Touch onPress={() => setN(n + 1)}><Text>{`count ${n}`}</Text></Touch><Button title="More" onPress={() => setN(n + 1)} /></View>;
}
AppRegistry.registerComponent('main', () => App);
