import { onFrame, clear, rrect, border, line, stroke, clip, unclip, pointerX, pointerY, pointerDown,
  wasPressed, Btn, setTransform, width, height, onResize, keyCount, keyKind, keyName, KeyKind, wheel } from 'zinc:gfx';
import { env } from 'zinc:sys';
import { Tracker, Hand, Vec3 } from 'zinc:leapmotion';
import { Game, Ink, Blade, clamp } from './model';
import { FruitInput } from './fruit-input';
import { HandScene, FruitScene } from './scene3d';
import { Duel, GESTURES } from './shifumi';
import { label, disc, ring, segment, BG, PANEL, MUTED, WHITE, LIME, CYAN } from './draw';

const tracker = new Tracker(env('ZINC_LEAP_SIM') === '1');
const game = new Game(), ink = new Ink();
const fruitInput = new FruitInput(), soloBlade = new Blade();
const hands3d = new HandScene(), fruits3d = new FruitScene(), duel = new Duel();
let lastMouseX = 0, lastMouseY = 0, lastDevice = -1;
const names = ['Fruit 3D', 'Hand lab', 'Air ink', 'Shifumi'];
const subtitles = ['Une main. Des fruits. Un peu de chaos.', 'Vos mains, sous un autre angle.', 'Dessinez quelque chose dans l’air.', 'Deux capteurs. Deux joueurs. Un seul gagnant.'];
let mode = env('ZINC_LEAP_MODE') === 'duel' ? 3 : env('ZINC_LEAP_MODE') === 'ink' ? 2 : env('ZINC_LEAP_MODE') === 'hands' ? 1 : 0;
let t = 0, pointerWasDown = false, pinchWasDown = false, pinched = false;
let x = 440, y = 390, active = false, lastHand = -1;
let hover = -1, dwell = 0, hoverFired = false;
let range = 420, inkColor = 0, inkWidth = 5;
let lastMode = -1;
const palette: u32[] = [LIME, CYAN, 0xff8fa3, 0xc3a4ff, WHITE];
const autoStart = env('ZINC_LEAP_AUTOPLAY') === '1';
game.multiplayer = env('ZINC_LEAP_MULTIPLAYER') === '1';
if (autoStart) game.start();
onResize((_w: number, _h: number) => {});

function select(next: number): void {
  mode = next; fruitInput.pause(); soloBlade.move(0, 0, false, -1, -1); active = false; lastHand = -1; pinched = false; ink.drawing = false;
}
function mapX(p: Vec3): number { return 600 + p.x / range * 1160; }
function mapY(p: Vec3): number { return 734 - (p.y - 100) / 350 * 704; }
function primary(): Hand | null {
  for (const h of tracker.hands) if (h.id === lastHand && h.deviceId === lastDevice) return h;
  for (const h of tracker.hands) if (h.right) return h;
  return tracker.hands.length > 0 ? tracker.hands[0] : null;
}
function hit(px: number, py: number): number {
  if (py >= 30 && py <= 80) for (let i = 0; i < 4; i++) if (px >= 295 + i * 153 && px <= 442 + i * 153) return i;
  if (px >= 924 && px <= 1152) {
    if (py >= 620 && py <= 668) return 10;
    if (py >= 684 && py <= 728) return 11;
    if ((mode === 2 || mode === 3) && py >= 490 && py <= 530) return 12;
    if (mode === 0 && py >= 480 && py <= 524) return 15;
    if (py >= 555 && py <= 599) return px < 1038 ? 13 : 14;
    if (mode === 2 && py >= 425 && py <= 472) return 20 + Math.min(4, Math.floor((px - 924) / 46));
  }
  return -1;
}
function activate(id: number): void {
  if (id >= 0 && id <= 3) select(id);
  if (id === 10) { if (mode === 0) { game.start(); fruitInput.reset(); soloBlade.move(0, 0, false, -1, -1); } else if (mode === 2) ink.clear(); else if (mode === 3) duel.start(); else hands3d.reset(); }
  if (id === 11) { tracker.setSimulation(!tracker.simulated); fruitInput.reset(); soloBlade.move(0, 0, false, -1, -1); active = false; lastHand = -1; ink.drawing = false; }
  if (id === 12) { if (mode === 3) duel.reassign(); else ink.undo(); }
  if (id === 13) { if (mode === 2) inkWidth = clamp(inkWidth - 1, 2, 12); else if (mode === 1 || mode === 3) hands3d.orbit(0, 0, -1); else range = clamp(range - 40, 260, 660); }
  if (id === 14) { if (mode === 2) inkWidth = clamp(inkWidth + 1, 2, 12); else if (mode === 1 || mode === 3) hands3d.orbit(0, 0, 1); else range = clamp(range + 40, 260, 660); }
  if (mode === 0 && (id === 13 || id === 14)) fruitInput.pause();
  if (id === 15) { game.multiplayer = !game.multiplayer; game.start(); game.running = false; fruitInput.reset(); soloBlade.move(0, 0, false, -1, -1); console.log('air-arcade fruit players', game.multiplayer ? 2 : 1); }
  if (id >= 20 && id <= 24) { inkColor = id - 20; ink.drawing = false; }
}
function button(id: number, bx: number, by: number, bw: number, bh: number, text: string, bright: boolean = false): void {
  const over = hover === id;
  rrect(bx, by, bw, bh, 12, bright ? LIME : over ? 0x334544 : 0x253332, 255);
  if (over && dwell > 0) rrect(bx, by + bh - 3, bw * clamp(dwell / 0.7, 0, 1), 3, 1, bright ? 0x5a7849 : LIME, 255);
  label(bx + 16, by + (bh - 20) / 2, text, bright ? BG : WHITE, 16);
}
function meter(y0: number, title: string, value: number, color: u32): void {
  label(924, y0, title, MUTED, 12); label(1090, y0, `${Math.round(value * 100)}%`, color, 12);
  rrect(924, y0 + 24, 228, 5, 3, 0x344543, 255); rrect(924, y0 + 24, 228 * value, 5, 3, color, 255);
}
function background(): void {
  clear(BG);
  label(32, 32, 'AIR / ARCADE', WHITE, 20);
  label(32, 62, 'ZINC × LEAP MOTION', MUTED, 12);
  for (let i = 0; i < 4; i++) {
    const tx = 295 + i * 153;
    if (mode === i) rrect(tx, 30, 147, 50, 25, LIME, 255);
    else if (hover === i) rrect(tx, 30, 147, 50, 25, 0x253332, 255);
    label(tx + 16, 44, `${i + 1}  ${names[i]}`, mode === i ? BG : MUTED);
    if (hover === i && dwell > 0) line(tx + 22, 77, tx + 22 + 100 * clamp(dwell / 0.7, 0, 1), 77, CYAN);
  }
  disc(955, 54, 4, tracker.simulated ? 0xffc976 : tracker.status === 2 ? LIME : 0x6b807a);
  label(970, 46, tracker.simulated ? 'SIMULATION' : tracker.status === 2 ? 'LEAP CONNECTÉ' : 'EN ATTENTE', MUTED, 12);
  label(32, 112, names[mode], WHITE, 32); label(32, 157, mode === 0 && game.multiplayer ? 'Deux lames. Une arène. À vous de trancher.' : subtitles[mode], MUTED);
  rrect(32, 196, 848, 534, 22, PANEL, 255);
  rrect(900, 112, 276, 618, 22, PANEL, 255);
  label(32, 759, '1 2 3 4  modes    ESPACE  jouer    S  simulation    M  solo / duo', MUTED, 12);
  label(716, 759, 'Pincez pour cliquer · Survolez 0,7 s', MUTED, 12);
}
function gameScene(): void {
  clip(32, 196, 848, 534, 22);
  fruits3d.draw(game, t);
  label(60, 220, game.multiplayer ? 'J1 VERT · J2 TURQUOISE · 1 LEAP PAR JOUEUR' : '60 SECONDES POUR FAIRE LE PLEIN', MUTED, 12);
  if (!game.running && game.fruits.length === 0) {
    label(212, 294, game.remaining === 0 ? 'Bien joué.' : 'À vous de trancher.', WHITE, 32);
    const result = game.multiplayer ? game.players[0].score === game.players[1].score ? 'Égalité !' : game.players[0].score > game.players[1].score ? 'Joueur 1 gagne !' : 'Joueur 2 gagne !' : `${game.players[0].score} points.`;
    label(212, 342, game.remaining === 0 ? `${result} Encore une partie ?` : 'Balayez les fruits avec votre index.', MUTED);
    label(212, 371, 'Évitez les bombes. Enchaînez les combos.', MUTED);
    label(275, 593, 'ESPACE ou « Jouer » pour commencer', LIME);
  }
  if (game.popupTime > 0) label(345, 285 - (0.8 - game.popupTime) * 28, game.popup, game.flash > 0 ? 0xff8fa3 : LIME, 20, Math.min(255, game.popupTime * 500));
  const blades = game.multiplayer ? fruitInput.blades : [soloBlade];
  for (let p = 0; p < blades.length; p++) {
    const blade = blades[p], trail = blade.trail, color = game.multiplayer && p === 0 ? LIME : CYAN;
    if (trail.length >= 4) { stroke(trail, 15, color, 24, false); stroke(trail, 5, color, 150, false); stroke(trail, 2, WHITE, 255, false); }
    if (game.multiplayer && blade.active) { ring(blade.x, blade.y + 170, 14, color); label(blade.x + 19, blade.y + 157, `J${p + 1}`, color, 12); }
  }
  if (game.flash > 0) rrect(32, 196, 848, 534, 22, 0xff6472, Math.round(game.flash * 65));
  unclip();
}
function handScene(): void {
  clip(32, 196, 848, 534, 22);
  hands3d.draw(tracker);
  label(60, 220, 'LEAP MOTION / ESPACE DE SUIVI 3D', MUTED, 12);
  label(60, 688, 'Glisser : tourner · Molette : zoom · Espace : vue initiale', MUTED, 12);
  if (tracker.hands.length === 0) label(240, 395, 'Placez vos mains au-dessus du capteur.', WHITE);
  unclip();
}
function duelScene(): void {
  clip(32, 196, 848, 534, 22);
  hands3d.draw(tracker, duel.revealed);
  for (let p = 0; p < 2; p++) {
    const left = 62 + p * 430, h = duel.hands[p];
    label(left, 220, `JOUEUR ${p + 1}`, p === 0 ? LIME : CYAN, 12);
    label(left, 248, `${duel.scores[p]}`, WHITE, 32);
    const choice = duel.phase === 2 ? duel.choices[p] : -1;
    label(left + 58, 256, choice >= 0 ? GESTURES[choice] : h === null ? 'Une main ici' : 'Prêt', MUTED);
    let serial = 'Capteur absent';
    for (const d of tracker.devices) if (d.id === duel.devices[p]) serial = d.serial === '' ? `Leap #${d.id}` : d.serial;
    label(left, 291, serial, MUTED, 12);
  }
  if (duel.phase === 1) {
    rrect(386, 324, 140, 108, 20, BG, 230);
    label(433, 340, `${Math.max(1, Math.ceil(duel.remaining))}`, LIME, 64);
  }
  rrect(136, 644, 640, 58, 16, BG, 230);
  label(166, 662, duel.result, duel.phase === 2 ? LIME : WHITE, 20);
  unclip();
}
function inkScene(): void {
  clip(32, 196, 848, 534, 22);
  for (let row = 0; row < 14; row++) for (let col = 0; col < 23; col++) disc(54 + col * 36, 218 + row * 36, 0.85, 0x40554d, 150);
  for (const s of ink.strokes) {
    if (s.points.length >= 4) { stroke(s.points, s.width + 8, s.color, 18, false); stroke(s.points, s.width, s.color, 255, false); }
    else if (s.points.length === 2) disc(s.points[0], s.points[1], s.width / 2, s.color);
  }
  if (ink.strokes.length === 0) {
    label(258, 366, 'L’air est votre carnet.', WHITE, 32);
    label(246, 419, 'Pincez le pouce et l’index pour écrire.', MUTED);
    label(288, 448, 'Relâchez pour lever le stylo.', MUTED);
    segment(352, 524, 384, 495, 4, LIME); segment(384, 495, 422, 539, 4, LIME); segment(422, 539, 502, 476, 4, LIME);
  }
  label(60, 220, pinched ? '● ENCRE EN COURS' : 'PINCEZ POUR ÉCRIRE', pinched ? palette[inkColor] : MUTED, 12);
  unclip();
}
function sidebar(hand: Hand | null): void {
  label(924, 137, mode === 0 ? 'VOTRE SESSION' : mode === 1 ? 'TÉLÉMÉTRIE' : mode === 3 ? 'LE DUEL' : 'VOTRE ATELIER', MUTED, 12);
  if (mode === 0) {
    if (game.multiplayer) {
      for (let p = 0; p < 2; p++) {
        const top = 177 + p * 63, score = game.players[p], color = p === 0 ? LIME : CYAN;
        label(924, top, `J${p + 1}`, color, 12); label(958, top - 8, `${score.score}`.padStart(3, '0'), color, 32);
        label(1070, top, `×${score.combo}`, MUTED, 20);
        label(924, top + 32, fruitInput.blades[p].active ? 'Lame prête' : 'Main attendue', MUTED, 12);
      }
    } else {
      label(924, 171, `${game.players[0].score}`.padStart(4, '0'), LIME, 64); label(924, 251, 'POINTS', MUTED, 12);
    }
    label(924, 310, `${Math.ceil(game.remaining)} s`, WHITE, 32);
    if (!game.multiplayer) label(1050, 320, `×${game.players[0].combo}`, CYAN, 20);
    rrect(924, 354, 228, 5, 3, 0x344543, 255); rrect(924, 354, 228 * game.remaining / 60, 5, 3, LIME, 255);
    label(924, 378, game.multiplayer ? `Bombes J1 / J2   ${game.players[0].bombs} / ${game.players[1].bombs}` : `Record       ${game.best}`, MUTED);
    label(924, 409, `Manqués      ${game.missed}`, MUTED);
    label(924, 446, 'Fruit +10 · Bombe −30', WHITE, 12);
    button(15, 924, 480, 228, 44, game.multiplayer ? '2 joueurs · passer solo' : 'Solo · passer à 2');
  } else if (mode === 1) {
    label(924, 181, `${tracker.hands.length}`.padStart(2, '0'), CYAN, 64); label(924, 258, 'MAINS DÉTECTÉES', MUTED, 12);
    label(924, 302, `${Math.round(tracker.fps)} Hz`, WHITE, 32);
    meter(370, 'PINCE', hand === null ? 0 : hand.pinch, CYAN); meter(435, 'POING', hand === null ? 0 : hand.grab, LIME);
    label(924, 494, hand === null ? 'En attente d’une main' : `${Math.round(hand.palm.y)} mm au-dessus`, MUTED);
  } else if (mode === 3) {
    label(924, 177, 'Shi.', LIME, 32); label(924, 219, 'Fu.', CYAN, 32); label(924, 261, 'Mi !', WHITE, 32);
    label(924, 329, `${tracker.devices.length}/2 capteurs connectés`, WHITE);
    label(924, 365, 'Un capteur par joueur.', MUTED);
    label(924, 395, 'Formez votre geste au « 1 ».', MUTED);
    label(924, 425, 'Gardez-le jusqu’au résultat.', MUTED);
    label(924, 458, `Manches validées : ${duel.round}`, MUTED, 12);
    button(12, 924, 490, 228, 40, 'Réattribuer les capteurs');
  } else {
    label(924, 177, 'Pincez.', LIME, 32); label(924, 219, 'Tracez.', CYAN, 32); label(924, 261, 'Relâchez.', WHITE, 32);
    meter(333, 'PRESSION DE PINCE', hand === null ? (pinched ? 1 : 0) : hand.pinch, palette[inkColor]);
    label(924, 397, 'COULEUR', MUTED, 12);
    for (let i = 0; i < 5; i++) { disc(944 + i * 46, 448, 13, palette[i]); if (inkColor === i) ring(944 + i * 46, 448, 18, WHITE); }
    button(12, 924, 490, 228, 40, 'Annuler le dernier trait');
  }
  label(924, 535, mode === 2 ? `TRAIT ${inkWidth} PX` : mode === 0 ? `AMPLITUDE ${range} MM` : `CAMÉRA ${Math.round(hands3d.distance)} MM`, MUTED, 12);
  button(13, 924, 557, 106, 40, '−'); button(14, 1046, 557, 106, 40, '+');
  button(10, 924, 620, 228, 48, mode === 0 ? (game.running ? 'Recommencer' : 'Jouer  →') : mode === 1 ? 'Réinitialiser la caméra' : mode === 3 ? 'Lancer la manche →' : 'Effacer le carnet', true);
  button(11, 924, 684, 228, 44, tracker.simulated ? 'Revenir au capteur' : 'Essayer la simulation');
}

onFrame((elapsed: number) => {
  const dt = clamp(elapsed, 0.001, 0.05); t += dt;
  const scale = Math.min(width() / 1200, height() / 800), ox = (width() - 1200 * scale) / 2, oy = (height() - 800 * scale) / 2;
  tracker.update(dt);
  if (mode === 3) duel.update(tracker, dt);
  const hand = primary();
  const px = (pointerX() - ox) / scale, py = (pointerY() - oy) / scale, mouse = pointerDown();
  if ((mode === 1 || mode === 3) && px > 32 && px < 880 && py > 196 && py < 730) {
    hands3d.orbit(mouse && pointerWasDown ? px - lastMouseX : 0, mouse && pointerWasDown ? py - lastMouseY : 0, wheel());
  }
  lastMouseX = px; lastMouseY = py;
  const previous = active;
  if (hand !== null) {
    const fresh = lastHand !== hand.id || lastDevice !== hand.deviceId;
    const tip = hand.joints[9], tx = clamp(mapX(tip), 20, 1176), ty = clamp(mapY(tip), 24, 734);
    const follow = mode === 2 ? 1 - Math.exp(-dt * 23) : 1 - Math.exp(-dt * 45);
    x = fresh ? tx : x + (tx - x) * follow; y = fresh ? ty : y + (ty - y) * follow;
    if (fresh) { ink.drawing = false; pinched = false; }
    pinched = hand.pinch >= (pinched ? 0.55 : 0.8); active = true; lastHand = hand.id; lastDevice = hand.deviceId;
  } else {
    active = mouse; pinched = mouse; x = px; y = py;
    if (lastHand !== -1 || !previous) ink.drawing = false;
    lastHand = -1;
  }
  const mouseClick = mouse && !pointerWasDown, pinchClick = pinched && !pinchWasDown;
  const target = hit(mouseClick || hand === null ? px : x, mouseClick || hand === null ? py : y);
  if (target !== hover) { hover = target; dwell = 0; hoverFired = false; }
  if (hand !== null && hover >= 0 && !hoverFired) dwell += dt;
  if (hover >= 0 && (mouseClick || pinchClick || (!hoverFired && dwell >= 0.7))) { activate(hover); hoverFired = true; dwell = 0; }
  if (wasPressed(Btn.Left)) select((mode + 3) % 4);
  if (wasPressed(Btn.Right)) select((mode + 1) % 4);
  if (wasPressed(Btn.A) || wasPressed(Btn.Start)) activate(10);
  for (let k = 0; k < keyCount(); k++) if (keyKind(k) === KeyKind.Down) {
    const key = keyName(k);
    if (key === '1' || key === '2' || key === '3' || key === '4') select(parseInt(key) - 1);
    if (key === 's') activate(11);
    if (key === 'm' && mode === 0) activate(15);
    if (key === 'u' && mode === 2) ink.undo();
  }
  if (mode !== lastMode) { console.log('air-arcade mode', names[mode]); lastMode = mode; }
  const inside = active && x > 42 && x < 870 && y > 202 && y < 725 && hover < 0;
  if (mode === 0) {
    if (game.multiplayer) { fruitInput.update(tracker, range); game.update(dt, fruitInput.blades); }
    else { soloBlade.move(x, y - 170, inside, hand === null ? -2 : hand.deviceId, hand === null ? -2 : hand.id); game.update(dt, [soloBlade]); }
  }
  if (mode === 2) ink.update(x, y, inside && pinched, palette[inkColor], inkWidth);
  else ink.drawing = false;
  setTransform(scale, 0, 0, scale, ox, oy);
  background();
  if (mode === 0) gameScene(); else if (mode === 1) handScene(); else if (mode === 3) duelScene(); else inkScene();
  sidebar(hand);
  if ((hand !== null || mouse) && !(mode === 0 && game.multiplayer && hover < 0)) {
    disc(x, y, pinched ? 5 : 3, pinched ? LIME : WHITE);
    ring(x, y, pinched ? 12 : 18, pinched ? LIME : CYAN, 225);
    if (dwell > 0) ring(x, y, 23, LIME, 255, -Math.PI / 2, -Math.PI / 2 + dwell / 0.7 * Math.PI * 2);
  }
  if (mode !== 3 && !tracker.simulated && tracker.hands.length === 0) {
    rrect(194, 678, 524, 34, 17, BG, 235);
    label(211, 686, tracker.status === 2 ? 'Placez une main au-dessus du Leap · Souris : glisser' : 'Lancez Ultraleap Hand Tracking · Souris : glisser', MUTED, 12);
  }
  pointerWasDown = mouse; pinchWasDown = pinched;
});
console.log('air-arcade ready: Leap Motion / mouse / explicit simulation');
