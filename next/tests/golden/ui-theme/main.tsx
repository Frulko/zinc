// Colour schemes (ZN-271): a scheme switch restyles exactly the flagged nodes and re-renders no component; dark: classes and var() colours follow it.
import { render } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { Button, Badge, Card, CardContent, setTheme, DARK, LIGHT } from 'zinc:ui/kit';
import { quit } from 'zinc:gfx';
let renders = 0;
function Probe(): i32 {
  renders++;
  return <View class="w-8 h-8 bg-[var(--card)] dark:bg-red-500 border" />;
}
function App(): i32 {
  return <View class="flex-col gap-2 p-2 w-full">
    <Probe />
    <Card><CardContent><Badge label="x" /><Button label="Go" onClick={() => {}} /></CardContent></Card>
  </View>;
}
function flagged(): i32 { let k = 0; for (let h = 0; h < 4000; h++) { const n = ui.inspectNode(h); if (n !== null && (n.media & 16) !== 0) k++; } return k; }
let f = 0;
render(App, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { console.log('scheme', ui.currentScheme(), 'flagged', flagged() > 0, 'renders', renders); setTheme(DARK); }
  if (f === 4) { console.log('scheme', ui.currentScheme(), 'restyled equals flagged', ui.schemeRestyled() === flagged(), 'renders', renders); setTheme(LIGHT); }
  if (f === 6) { console.log('scheme', ui.currentScheme(), 'renders', renders); quit(); }
});
