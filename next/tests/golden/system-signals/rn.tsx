// The system's signals through zinc:react-native (driven by signals.input): Appearance follows the system's theme, PixelRatio the font scale,
// BackHandler takes the back key; StatusBar, Haptics and Vibration reach the OS (ZINC_DEVICE_LOG records them on a desktop).
import { View, Text, StatusBar, Appearance, AppearancePreferences, BackHandler, PixelRatio, Vibration, SafeAreaView } from 'zinc:react-native';
import { render } from 'zinc:ui/react';
import { Haptics } from 'zinc:haptics';

Appearance.addChangeListener((p: AppearancePreferences): void => console.log(`appearance ${p.colorScheme} fontScale ${PixelRatio.getFontScale()}`));
const sub = BackHandler.addEventListener('hardwareBackPress', (): boolean => { console.log('hardwareBackPress taken'); sub.remove(); return true; });
Haptics.impact('light');
Haptics.selection();
Haptics.notification('error');
Vibration.vibrate(30);

function App(): i32 {
  return <SafeAreaView>
    <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
    <View><Text>Hello</Text></View>
  </SafeAreaView>;
}
render(App, 0xffffff, (dt: number) => {});
