// The fixture of the history check of tests/t1/web_dom.sh: a Stack whose screens have addresses (`path`): pushing a screen pushes a history entry and changes the address, the browser's Back
// button pops the screen, and a link is a real <a href>.
import { render } from 'zinc:ui/react';
import { Stack, Route, Navigation } from 'zinc:ui/navigation';
import { Button } from 'zinc:ui/kit';

function Page(r: Route, nav: Navigation): i32 {
  return <View className="flex-col gap-3 p-4 bg-white">
    <Text as="h1" className="text-xl font-bold text-slate-900">{'Screen ' + r.name}</Text>
    <Button label="Open detail" onClick={() => nav.push('detail', 'Detail', 1)} />
    <Text as="a" href="#top" className="text-sky-600">A link</Text>
  </View>;
}

function App(): i32 {
  return <Stack initial="home" initialTitle="Home" renderScreen={Page} headerShown={false} style="android" path={(r: Route): string => '/' + r.name} />;
}

render(App, 0xffffff, null);
