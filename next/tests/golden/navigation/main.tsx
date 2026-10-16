// The navigation stack (docs/ui.md, "Navigation stack"): a list screen pushes a detail screen at frame 5 and pops it at frame 40; then the
// scripts of tests/t1/navigation.sh drive the iOS edge swipe (completed and cancelled), the Android back key and predictive back.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { Stack, Route, Navigation } from 'zinc:ui/navigation';
import { env } from 'zinc:sys';

let navRef: Navigation | null = null;
function Page(r: Route, nav: Navigation): i32 {
  navRef = nav;
  const shade = r.name === 'home' ? 0xdbeafe : r.name === 'detail' ? 0xfde68a : 0xbbf7d0;
  return <View className="flex-1 p-4" style={{ backgroundColor: shade }}>
    <Text style={{ fontSize: 16, color: 0x0f172a }}>{r.title + ' #' + r.params}</Text>
    <View style={{ height: 40, marginTop: 12, backgroundColor: 0x334155 }} />
  </View>;
}

const script = env('NAV_SCRIPT');   // push-pop (default) | push (stays on the detail screen, for the swipe and back scripts) | present (a modal screen)
let frame = 0;
ui.addWatcher((): void => {
  frame++;
  const nav = navRef;
  if (nav === null) return;
  if (frame === 5 && script === 'present') nav.present('compose', 'New message', 3);
  else if (frame === 5) nav.push('detail', 'Detail', 7);
  if (frame === 40 && (script === '' || script === 'push-pop')) nav.pop();
  if (frame === 89 && script !== 'push-pop' && script !== '') console.log(`depth ${nav.stackDepth()} top ${nav.top().name}`);
});

function App(): i32 {
  return <Stack initial="home" initialTitle="Inbox" renderScreen={Page} largeTitle={true} />;
}
render(App, 0xffffff, (dt: number) => {});
