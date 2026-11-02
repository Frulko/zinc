import { world } from '../world/world';
import { economy } from '../world/economy';
import { goalList, conditionText } from '../rules/goals';
import { currentMission, timeLeftText } from '../world/missions';
import { offerLines, canTrade } from '../rules/trade';
import { adventureLines, expeditionLines, canStart } from '../rules/adventure';
import { issue } from '../rules/commands';
import { sound } from '../audio';
import { kit, col, window_, winOrigin, parchment, text, wrap, labelButton, glyphButton, block, addHit } from './kit';
import { ui, viewport } from './state';

// The campaign window: goals, the peddler's offers and the adventures. Every action is a command (rules/commands.ts), so it is logged and replays.
const TABS = ['Objectifs', 'Colporteur', 'Aventures'];
const W = 560, H = 440;
let tab = 0;
let briefing = true;                    // the mission's briefing under its title (a button folds it once it is known)
export function openCampaign(): void { ui.campaign = !ui.campaign; }
export function drawCampaign(): void {
  if (!ui.campaign) return;
  const vp = viewport(), o = winOrigin('campaign', vp.x + Math.floor((vp.w - W) / 2), vp.y + Math.max(8, Math.floor((vp.h - H) / 2)), W, H), x = o.x, y = o.y;
  window_(x, y, W, H, currentMission() === null ? 'Campagne' : 'Mission', 'campaign', (): void => { ui.campaign = false; });
  for (let i = 0; i < TABS.length; i++) labelButton('camp:tab:' + i, x + 10 + i * 128, y + 30, 122, 26, TABS[i], '', true, tab === i);
  if (currentMission() !== null) labelButton('camp:brief', x + W - 150, y + 30, 140, 26, 'Exposé', 'Montrer ou cacher l’exposé de la mission', true, briefing);
  parchment(x + 10, y + 62, W - 20, H - 72);
  const px = x + 22, py = y + 72, lw = W - 44;
  if (!world.progression) { text(kit.body, px, py, 'Ce hameau est en mode libre.', col('ink')); text(kit.small, px, py + 22, 'Choisissez une mission en créant un nouveau hameau (N).', col('muted')); return; }
  if (tab === 0) goals(px, py, lw); else if (tab === 1) peddler(px, py, lw); else adventures(px, py, lw);
}
function goals(x: number, y: number, w: number): void {
  let cy = y;
  const m = currentMission();
  if (m !== null) {                                       // a mission: its name, the time left, the briefing of the day, then the goals
    text(kit.body, x, cy, m.title, col('accent')); cy += kit.lineH;
    const left = timeLeftText();
    if (left !== '') { text(kit.small, x, cy, 'Temps restant : ' + left, col(world.tick > 0 && left.indexOf(' an') < 0 ? 'bad' : 'muted')); cy += kit.lineH - 2; }
    if (briefing) for (const l of wrap(m.briefing, w)) { text(kit.small, x, cy, l, col('muted')); cy += kit.lineH - 2; }
    cy += 6;
  }
  for (const g of goalList()) {
    const goal = economy.goals[g[0]], color = g[1] === 1 ? col('good') : g[1] === 0 ? col('ink') : col('muted');
    text(kit.body, x, cy, (g[1] === 1 ? '[x] ' : '[ ] ') + goal.title, color); cy += kit.lineH;
    if (g[1] === 0) {                                      // only the open goals say what to do, and how far the village is: the list stays on the page
      for (const l of wrap(goal.text, w - 24)) { text(kit.small, x + 24, cy, l, col('muted')); cy += kit.lineH - 2; }
      for (const c of goal.when) { text(kit.small, x + 24, cy, conditionText(c), col('ink')); cy += kit.lineH - 2; }
    }
    cy += 6;
  }
}
function peddler(x: number, y: number, w: number): void {
  const lines = offerLines();
  if (lines.length === 0) { text(kit.body, x, y, 'Le colporteur est reparti. Il repasse tous les ' + economy.trade.everyDays + ' jours.', col('muted')); return; }
  text(kit.small, x, y, 'Cliquez un marché pour le conclure.', col('muted'));
  for (let k = 0; k < lines.length; k++) {
    const by = y + 26 + k * 40, ok = canTrade(k);
    labelButton('camp:trade:' + k, x, by, w, 34, '', ok ? 'Conclure' : 'Impossible : il manque de quoi payer', ok);
    text(kit.body, x + 10, by + 8, lines[k], ok ? col('barText') : col('ink'));
  }
}
function adventures(x: number, y: number, w: number): void {
  const lines = adventureLines(), under = expeditionLines();
  text(kit.small, x, y, 'Cliquez une aventure pour envoyer des habitants.', col('muted'));
  for (let k = 0; k < lines.length; k++) {
    const by = y + 26 + k * 50, ok = canStart(k);
    labelButton('camp:adv:' + k, x, by, w, 44, '', economy.adventures[k].text, ok);
    const wr = wrap(lines[k], w - 20);
    for (let j = 0; j < wr.length && j < 2; j++) text(kit.small, x + 10, by + 6 + j * kit.lineH, wr[j], ok ? col('barText') : col('ink'));
  }
  let cy = y + 36 + lines.length * 50;
  text(kit.body, x, cy, under.length > 0 ? 'En route' : 'Personne n’est parti.', col('ink')); cy += kit.lineH + 4;
  for (const l of under) { text(kit.small, x + 12, cy, l, col('ink')); cy += kit.lineH; }
}
export function campaignClick(id: string): boolean {
  if (id === 'camp:brief') { briefing = !briefing; return true; }
  if (id.startsWith('camp:tab:')) { tab = Number(id.slice(9)); return true; }
  if (id.startsWith('camp:trade:')) { if (issue('trade', Number(id.slice(11)))) sound('coin', .6); else sound('error', .5); return true; }
  if (id.startsWith('camp:adv:')) { if (!issue('adventure_start', Number(id.slice(9)))) sound('error', .5); return true; }
  return false;
}
