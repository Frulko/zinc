// Test entry (next/tests/t1/nuxt_ui.sh): the gallery, then scripted clicks and typing on every control, printing the state they drive.
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
import { quit } from 'zinc:gfx';
import { Gallery, clicks, email, bio, plan, planOpen, terms, news, notify, freq } from './gallery';
import { modal, setModal, drawer, setDrawer, chosen, compact, menuRef, tipRef } from './overlays';
import { isMenuOpen, toastCount, addToast } from 'zinc:ui/nuxt';

function click(text: string): void { const h = ui.find(text); if (h >= 0) ui.click(h); else console.log(`no ${text}`); }
function field(placeholder: string): i32 { for (let h = 0; h < 4000; h++) { const n = ui.inspectNode(h); if (n !== null && n.ed !== null && (n.ed as ui.Edit).placeholder === placeholder) return h; } return -1; }
function tipNode(): ui.UiNode | null { let h = ui.childAt(tipRef.node, 0); while (ui.childCount(h) === 1) h = ui.childAt(h, 0); return ui.inspectNode(ui.childAt(h, ui.childCount(h) - 1)); }
let f = 0;
render(Gallery, 0xffffff, (dt: number) => {
  f++;
  if (f === 2) { click('solid'); click('outline'); click('Disabled'); click('Saving'); click('Send me the newsletter'); click('I accept the terms *'); click('Notifications'); click('Never'); click('Team'); }
  if (f === 3) { console.log(`after clicks: buttons ${clicks()} terms ${terms()} news ${news()} notify ${notify()} digest ${freq()} select open ${planOpen()}`); click('Enterprise'); }
  if (f === 4) { console.log(`select: ${plan()} open ${planOpen()}`); ui.typeText(field('you@example.com'), 'ada@zinc.dev'); ui.typeText(field(''), ' Loves maps.'); }
  if (f === 5) { console.log(`typed: email ${email()} | bio ${bio()}`); setModal(true); }
  if (f === 7) { console.log(`modal open ${modal()}`); ui.sendKey('Escape'); }
  if (f === 8) { console.log(`modal after Escape ${modal()}`); setModal(true); }
  if (f === 10) { console.log(`modal reopened ${modal()}`); ui.pointerAt(5, 5, true); ui.pointerAt(5, 5, false); }
  if (f === 11) { console.log(`modal after a press outside ${modal()}`); setDrawer(true); }
  if (f === 13) { ui.sendKey('Escape'); }
  if (f === 14) { console.log(`slideover after Escape ${drawer()}`); setDrawer(true); }
  if (f === 16) { console.log(`slideover reopened ${drawer()}`); ui.pointerAt(5, 5, true); ui.pointerAt(5, 5, false); }
  if (f === 17) { console.log(`slideover after a press outside ${drawer()}`); click('Actions'); }
  if (f === 18) { console.log(`menu open ${isMenuOpen(ui.childAt(menuRef.node, 0))}`); ui.sendKey('Escape'); }
  if (f === 19) { console.log(`menu after Escape ${isMenuOpen(ui.childAt(menuRef.node, 0))}`); click('Actions'); }
  if (f === 20) { console.log(`menu reopened ${isMenuOpen(ui.childAt(menuRef.node, 0))}`); ui.pointerAt(5, 5, true); ui.pointerAt(5, 5, false); }
  if (f === 21) { console.log(`menu after a press outside ${isMenuOpen(ui.childAt(menuRef.node, 0))}`); click('Actions'); }
  if (f === 22) { click('Duplicate'); click('Actions'); }
  if (f === 23) { click('Compact'); }
  if (f === 24) { console.log(`menu choice ${chosen()} compact ${compact()} open ${isMenuOpen(ui.childAt(menuRef.node, 0))}`); const b = ui.screenBox(tipRef.node); ui.pointerAt(b[0] + 5, b[1] + 5, false); }
  if (f === 70) { const tip = tipNode(); console.log(`tooltip after 700 ms of hover ${tip !== null && !tip.hidden}`); ui.pointerAt(5, 5, false); }
  if (f === 72) { const tip = tipNode(); console.log(`tooltip after leaving ${tip !== null && !tip.hidden}`); addToast({ title: 'Saved' }); }
  if (f === 73) { console.log(`toasts ${toastCount()}`); }
  if (f === 74) { quit(); }
});
