// The system's signals (docs/ui.md, "System signals"), driven by signals.input: the safe area pads the page, the dark theme recolours it
// (scheme 'auto'), the font scale enlarges the text, the keyboard inset lifts the bottom bar, and the back key reaches the back handlers.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
// the sizes the font scale of 1.5 reaches are baked like any other (the classes named here: text-lg text-2xl); a size never baked takes the nearest one

ui.defineScheme('light', ['page', 'ink'], [0xf8fafc, 0x0f172a]);
ui.defineScheme('dark', ['page', 'ink'], [0x0f172a, 0xf8fafc]);
ui.setScheme('auto');
let backs = 0;
ui.addBackHandler((): boolean => { backs++; console.log(`back taken (${backs})`); return backs < 2; });
ui.addSignalListener((kind: string, arg: string): void => {
  console.log(`signal ${kind} ${arg} -> safe ${ui.safeArea().join(',')} scheme ${ui.currentScheme()} font ${ui.systemFontScale()} keyboard ${ui.keyboardInset()} motion ${ui.prefersReducedMotion() ? 'reduced' : 'full'}`);
});

function App(): i32 {
  return <View className="flex-1 bg-[var(--page)] pt-[env(safe-area-inset-top)] pb-[env(keyboard-inset)]">
    <Text className="text-base text-[var(--ink)] px-2">Settings</Text>
    <Text className="text-[var(--ink)] px-2" style={{ fontSize: 12 }}>Small print</Text>
    <View className="flex-1" />
    <View className="h-6 bg-blue-500" />
  </View>;
}

render(App, 0xffffff, (dt: number) => {});
