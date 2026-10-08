// Test entry (next/tests/t1/nuxt_ui.sh): the gallery, then scripted clicks and typing on every control, printing the state they drive.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import { Gallery, clicks, email, bio, plan, planOpen, terms, news, notify, freq } from './gallery';

function click(text: string): void { const h = ui.find(text); if (h >= 0) ui.click(h); else console.log(`no ${text}`); }
function field(placeholder: string): i32 { for (let h = 0; h < 4000; h++) { const n = ui.inspectNode(h); if (n !== null && n.ed !== null && (n.ed as ui.Edit).placeholder === placeholder) return h; } return -1; }
let f = 0;
render(Gallery, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { click('solid'); click('outline'); click('Disabled'); click('Saving'); click('Send me the newsletter'); click('I accept the terms *'); click('Notifications'); click('Never'); click('Team'); }
  if (f === 3) { console.log(`after clicks: buttons ${clicks()} terms ${terms()} news ${news()} notify ${notify()} digest ${freq()} select open ${planOpen()}`); click('Enterprise'); }
  if (f === 4) { console.log(`select: ${plan()} open ${planOpen()}`); ui.typeText(field('you@example.com'), 'ada@zinc.dev'); ui.typeText(field(''), ' Loves maps.'); }
  if (f === 5) { console.log(`typed: email ${email()} | bio ${bio()}`); quit(); }
});
