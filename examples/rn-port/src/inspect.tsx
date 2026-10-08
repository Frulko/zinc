// Test entry of the port (tests/t1/rn_port.sh): renders App and prints the layout facts React Native gives on a phone (the inset separator, the badge at
// the avatar's corner, the two-line bio, the percent bars, a borderless TextInput), then types into the search field to filter the list.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import App from './App';
import { quit } from 'zinc:gfx';
const box = (h: i32): string => ui.screenBox(h).map((v: number) => Math.round(v)).join(',');
function first(test: (n: ui.UiNode) => boolean): i32 { for (let h = 0; h < 800; h++) { const n = ui.inspectNode(h); if (n !== null && test(n)) return h; } return -1; }
let f = 0;
render(App, 0xf2f2f7, (dt: number) => {
  f++;
  if (f === 2) {
    console.log('separator', box(first((n: ui.UiNode) => n.bg === 0xc6c6c8)));
    console.log('badge', box(first((n: ui.UiNode) => n.bg === 0x34c759)), 'avatar', box(first((n: ui.UiNode) => n.bg === 0x5856d6)));
    const bio = first((n: ui.UiNode) => n.tag === ui.TEXT && n.text.startsWith('Wrote'));
    console.log('bio lines', ui.textLines(bio).length, 'ends', ui.textLines(bio)[1].slice(-4));
    console.log('bars', box(first((n: ui.UiNode) => n.bg === 0x007aff && n.lh === 4)));
    const input = first((n: ui.UiNode) => n.tag === ui.INPUT);
    console.log('search border', (ui.inspectNode(input) as ui.UiNode).borderW, box(input));
    ui.typeText(input, 'ra');
  }
  if (f === 4) {
    const count = first((n: ui.UiNode) => n.tag === ui.TEXT && n.text.endsWith('people'));
    console.log('after typing ra:', (ui.inspectNode(count) as ui.UiNode).text);
    quit();
  }
});
