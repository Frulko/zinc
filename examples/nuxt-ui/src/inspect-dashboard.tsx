// Test entry of the dashboard app (next/tests/t1/nuxt_ui.sh): the sidebar navigates, the customer search filters, the "New customer" modal adds a row and
// a toast, the scheme switch and the sidebar collapse work.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import { colorMode, toastCount } from 'zinc:ui/nuxt';
import { Dashboard, section, collapsed, query, creating, customers, shownCustomers } from './dashboard';

function click(text: string): void { const h = ui.find(text); if (h >= 0) ui.click(h); else console.log(`no ${text}`); }
function byLabel(label: string): i32 { let last = -1; for (let h = 0; h < 6000; h++) { const n = ui.inspectNode(h); if (n !== null && n.label === label) last = h; } return last; }
function field(placeholder: string): i32 { for (let h = 0; h < 6000; h++) { const n = ui.inspectNode(h); if (n !== null && n.ed !== null && (n.ed as ui.Edit).placeholder === placeholder) return h; } return -1; }
let f = 0;
render(Dashboard, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { console.log(`start ${section()}`); click('Customers'); }
  if (f === 3) { console.log(`section ${section()} rows ${shownCustomers().length}`); ui.typeText(field('Filter emails...'), 'gr'); }
  if (f === 4) { console.log(`filter "${query()}" rows ${shownCustomers().length}`); click('New customer'); }
  if (f === 5) { console.log(`modal ${creating()}`); ui.typeText(field('John Doe'), 'Ada Lovelace'); ui.typeText(field('john.doe@example.com'), 'ada@example.com'); }
  if (f === 6) { click('Create'); }
  if (f === 7) { console.log(`created: customers ${customers().length} modal ${creating()} toasts ${toastCount()}`); ui.click(byLabel('moon')); }
  if (f === 8) { console.log(`scheme ${colorMode()}`); ui.click(byLabel('chevron-left')); }
  if (f === 9) { console.log(`sidebar collapsed ${collapsed()}`); click('Settings'); }
  if (f === 10) { console.log(`section ${section()}`); quit(); }
});
