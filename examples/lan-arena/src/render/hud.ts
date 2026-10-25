// What is drawn over the view (the crosshair, the paint gun, the scores, the splat flash, the round's winner) and the title screen (the
// hosts found on the LAN). Text is the 8 px grid font every target has, scaled by 2 on a large screen.
import { rect, text, width, height, clear } from 'zinc:gfx';
import { Game, HOST, CLIENT, SOLO } from '../state';
import { Player } from '../world';
import { PAINT, INK, INK_DIM, GOLD, RED, SKY, WIN_SCORE } from '../constants';
import { shade } from './view';

export function hudScale(): i32 { return height() >= 500 ? 2 : 1; }

function centered(y: number, s: string, color: u32, scale: i32): void { text(Math.floor((width() - s.length * 8 * scale) / 2), y, s, color, scale); }

function nameOf(game: Game, id: i32): string {
  const p = game.world.player(id);
  return p === null ? '?' : p.name;
}

export function drawHud(game: Game, me: Player): void {
  const w = width(), h = height(), s = hudScale();
  const paint = PAINT[me.id % 8];
  if (game.flash > 0) {   // splatted: the shooter's paint over the edges of the screen, under the scores
    const by = game.world.player(me.splatBy);
    const c = by === null ? RED : PAINT[by.id % 8];
    rect(0, 0, w, h * 0.12, c);
    rect(0, h * 0.88, w, h * 0.12, c);
  }
  // the paint gun, pushed back for a moment after a shot
  const kick = me.cooldown > 0.2 ? 6 * s : 0;
  rect(w / 2 - 14 * s, h - 34 * s + kick, 28 * s, 34 * s, shade(paint, 0.55));
  rect(w / 2 - 6 * s, h - 46 * s + kick, 12 * s, 14 * s, paint);
  // the crosshair
  rect(w / 2 - 6 * s, h / 2, 4 * s, s, INK);
  rect(w / 2 + 2 * s, h / 2, 4 * s, s, INK);
  rect(w / 2, h / 2 - 6 * s, s, 4 * s, INK);
  rect(w / 2, h / 2 + 2 * s, s, 4 * s, INK);
  // the scores, best first
  let y = 4 * s;
  const shown: i32[] = [];
  for (let n = 0; n < game.world.players.length && n < 8; n++) {
    let best: Player | null = null;
    for (const p of game.world.players) if (shown.indexOf(p.id) < 0 && (best === null || p.score > best.score)) best = p;
    if (best === null) break;
    shown.push(best.id);
    const line = `${best.score < 10 ? ' ' : ''}${best.score} ${best.name}`;
    rect(4 * s, y - s, 6 * s, 8 * s, PAINT[best.id % 8]);
    text(12 * s, y, line, best === me ? GOLD : INK, s);
    y += 10 * s;
  }
  text(w - (12 * 8 + 4) * s, 4 * s, `first to ${WIN_SCORE}`, INK_DIM, s);
  // the match: where it runs
  let where = '';
  if (game.mode === HOST) where = `hosting ${game.net.address()}`;
  else if (game.mode === CLIENT) where = `joined ${game.hostAddress}`;
  else if (game.mode === SOLO) where = 'solo';
  text(4 * s, h - 12 * s, where, INK_DIM, s);
  if (me.dead && game.world.pause <= 0) centered(h / 2 - 30 * s, `splatted by ${nameOf(game, me.splatBy)}`, INK, s * 2);
  if (game.world.pause > 0) {
    const win = nameOf(game, game.world.winner);
    rect(0, h / 2 - 36 * s, w, 48 * s, 0x000000);
    centered(h / 2 - 30 * s, `${win} wins!`, PAINT[game.world.winner % 8], s * 3);
    centered(h / 2 + 2 * s, 'next round...', INK_DIM, s);
  }
}

export function drawTitle(game: Game, dots: i32): void {
  const w = width(), h = height(), s = hudScale();
  clear(SKY);
  for (let i = 0; i < 8; i++) rect(i * w / 8, 0, w / 8 + 1, 6 * s, PAINT[i]);
  centered(18 * s, 'PAINT ARENA', GOLD, s * 3);
  centered(46 * s, 'splat your friends on the same Wi-Fi', INK_DIM, s);
  let y = 66 * s;
  const net = game.net;
  if (net.status === 0) text(20 * s, y, `joining the Wi-Fi${'...'.slice(0, dots)}`, INK, s);
  else if (net.status < 0) text(20 * s, y, `no network: ${net.why}`, RED, s);
  else text(20 * s, y, `${net.address()} looking for hosts${'...'.slice(0, dots)}`, INK, s);
  y += 16 * s;
  for (let i = 0; i < net.hosts.length && i < 6; i++) {
    const hst = net.hosts[i];
    const mark = i === game.selected ? '>' : ' ';
    text(20 * s, y, `${mark} ${hst.name}  ${hst.address}  ${hst.players} playing`, i === game.selected ? GOLD : INK, s);
    y += 12 * s;
  }
  if (net.hosts.length === 0 && net.status === 1) { text(28 * s, y, '(none yet: zinc run examples/lan-arena)', INK_DIM, s); y += 12 * s; }
  if (game.message.length > 0) { y += 4 * s; text(20 * s, y, game.message, RED, s); }
  const by = h - 40 * s;
  if (net.hosts.length > 0) text(20 * s, by, 'Cross: join the host marked >', INK, s);
  text(20 * s, by + 12 * s, 'Triangle: host a match here', INK, s);
  text(20 * s, by + 24 * s, 'Start: play solo against bots', INK, s);
}
