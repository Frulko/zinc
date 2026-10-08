// Test entry of the navigation page (next/tests/t1/nuxt_ui.sh): Tabs switch, the Accordion opens and closes, the Table sorts both ways and selects, the
// Pagination pages, the sidebar collapses, the navigation picks a section.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import { Navigation, tab, linkTab, open, page, sort, desc, selected, section, narrow, PEOPLE } from './navigation';
import { sortedRows } from 'zinc:ui/nuxt';

function click(text: string): void { const h = ui.find(text); if (h >= 0) ui.click(h); else console.log(`no ${text}`); }
function byRole(role: string, k: i32): i32 { let seen = 0; for (let h = 0; h < 4000; h++) { const n = ui.inspectNode(h); if (n !== null && n.role === role) { if (seen === k) return h; seen++; } } return -1; }
function byLabel(label: string): i32 { let last = -1; for (let h = 0; h < 4000; h++) { const n = ui.inspectNode(h); if (n !== null && n.label === label) last = h; } return last; }   // the last one: Pagination has a chevron-left too
let f = 0;
render(Navigation, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { click('Billing'); click('Members'); click('Is it fast?'); }
  if (f === 3) { console.log(`tabs ${tab()} ${linkTab()} | accordion open ${open().join(',')}`); click('Is it fast?'); click('Count'); }
  if (f === 4) { console.log(`accordion closed ${open().length === 0} | sort ${sort()} desc ${desc()} first ${PEOPLE[sortedRows(PEOPLE, sort(), desc())[0]][0]}`); click('Count'); }
  if (f === 5) { console.log(`sort desc ${desc()} first ${PEOPLE[sortedRows(PEOPLE, sort(), desc())[0]][0]}`); click('Name'); click('5'); click('Customers'); }
  if (f === 6) { console.log(`sort by name first ${PEOPLE[sortedRows(PEOPLE, sort(), desc())[0]][0]} | page ${page()} | section ${section()}`); click('12'); }
  if (f === 7) { console.log(`page ${page()}`); ui.click(byRole('checkbox', 2)); ui.click(byRole('checkbox', 4)); }
  if (f === 8) { console.log(`selected rows ${selected().join(',')}`); ui.click(byRole('checkbox', 0)); }
  if (f === 9) { console.log(`select all ${selected().length} | page still ${page()}`); ui.click(byLabel('chevron-left')); }
  if (f === 10) { console.log(`sidebar collapsed ${narrow()}`); quit(); }
});
