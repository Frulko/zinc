import { presentScene, view, fromCanvas } from '../view.js';
import { project } from '../renderer.js';
import { game, ROUND_SECONDS, PARCELS } from './state.js';

const HARBOR_CROP = { x: 30, y: 45, width: 300, height: 210 };

export function toolbarActionAt(x, y) {
  if (y < 48) {
    if (x < 130) return 'sound';
    if (x > innerWidth - 140) return 'pause';
  }
  if ((game.phase === 'ready' || game.phase === 'over') &&
      x >= innerWidth / 2 - 110 && x <= innerWidth / 2 + 110 &&
      y >= innerHeight - 96 && y <= innerHeight - 52) return 'start';
  return null;
}

function drawButton(context, label) {
  const x = view.width / 2 - 110, y = view.height - 96;
  context.fillStyle = '#315e5a';
  context.fillRect(x, y, 220, 44);
  context.fillStyle = '#fff6db';
  context.font = '15px monospace';
  context.fillText(label, view.width / 2, y + 28);
}

function resultTitle() {
  if (game.delivered === PARCELS) return 'TOUT LE COURRIER EST À BORD !';
  if (game.delivered >= 3) return 'BELLE LIVRAISON !';
  if (game.delivered > 0) return 'UNE AUTRE TOURNÉE ?';
  return 'LES POISSONS ONT REÇU LE COURRIER…';
}

export function presentHarbor() {
  const context = presentScene(HARBOR_CROP);
  const width = view.width, height = view.height;
  context.textAlign = 'left';
  context.fillStyle = '#8e8270';
  context.font = '12px monospace';
  context.fillText(game.muted ? 'SON COUPÉ [M]' : 'SON ACTIVÉ [M]', 26, 30);
  context.textAlign = 'right';
  context.fillText(game.paused ? 'REPRENDRE [P]' : 'PAUSE [P]', width - 26, 30);
  context.textAlign = 'center';
  context.fillStyle = '#514b3e';
  context.font = '22px monospace';
  context.fillText('LE DERNIER BATEAU', width / 2, 53);
  context.font = '13px monospace';
  if (game.phase === 'ready') {
    context.fillStyle = '#867965';
    context.fillText('5 colis. Une barque en mouvement. 45 secondes avant le départ.', width / 2, 84);
    context.fillText('Le pont jaune est votre cible. Visez là où il sera à l’arrivée.', width / 2, 112);
    drawButton(context, 'JOUER  [ENTRÉE]');
    context.fillStyle = '#9a8c76';
    context.font = '11px monospace';
    context.fillText('Glissez puis relâchez · Flèches pour viser, Espace pour lancer · Cliquez aussi sur les animaux', width / 2, height - 25);
  } else {
    const seconds = Math.max(0, Math.ceil(ROUND_SECONDS - game.elapsed));
    context.fillStyle = '#315e5a';
    context.fillText('LIVRÉS  ' + game.delivered + ' / ' + PARCELS, width / 2 - 180, 89);
    context.fillStyle = '#877457';
    context.fillText('À LANCER  ' + game.remaining, width / 2, 89);
    context.fillStyle = seconds <= 10 ? '#a44c39' : '#877457';
    context.fillText(seconds + ' s', width / 2 + 180, 89);
    context.fillStyle = '#ede8db';
    context.fillRect(width / 2 - 260, 104, 520, 3);
    context.fillStyle = seconds <= 10 ? '#b56d46' : '#8d9e82';
    context.fillRect(width / 2 - 260, 104, 520 * seconds / ROUND_SECONDS, 3);
    if (game.phase === 'over') {
      context.fillStyle = '#315e5a';
      context.font = '18px monospace';
      context.fillText(resultTitle(), width / 2, 130);
      context.fillStyle = '#877457';
      context.font = '13px monospace';
      context.fillText(game.delivered + ' colis livrés · ' + (PARCELS - game.delivered) + ' colis manqués', width / 2, height - 120);
      drawButton(context, 'REJOUER  [ENTRÉE]');
    } else {
      let hint = 'Glissez la cible et relâchez pour lancer. Anticipez le mouvement de la barque.';
      if (game.phase === 'flight') hint = 'Le colis vole… la barque continue d’avancer !';
      if (game.phase === 'feedback') hint = game.outcome.kind === 'delivered' ? 'Livré ! Le marin vous remercie.' : 'À l’eau ! Visez un peu plus en avant.';
      if (game.discovery && game.discovery.until > game.time && game.phase === 'aim') {
        hint = { cat: 'Mistral surveille les colis. Et réclame une caresse.', gull: 'La mouette décolle pour inspecter la pêche.', fish: 'Un poisson bondit hors de l’eau !' }[game.discovery.name];
      }
      context.fillStyle = '#74674f';
      context.font = '13px monospace';
      context.fillText(hint, width / 2, height - 57);
      context.fillStyle = '#aa9c85';
      context.font = '11px monospace';
      context.fillText('Flèches : déplacer la cible · Espace : lancer · R : recommencer', width / 2, height - 30);
    }
  }
  if (game.outcome && game.time - game.outcome.at < 1.2 && game.phase !== 'over') {
    const outcome = game.outcome;
    const source = project(outcome.x, outcome.y, 1.8 + (game.time - outcome.at) * .6);
    const position = fromCanvas(source.sx, source.sy);
    const label = { delivered: '+1 LIVRÉ !', splash: 'PLOUF !', bump: 'TOC !' }[outcome.kind];
    context.font = 'bold 14px monospace';
    context.fillStyle = '#fffdf1';
    context.fillRect(position.x - 55, position.y - 17, 110, 23);
    context.fillStyle = outcome.kind === 'delivered' ? '#315e5a' : '#a44c39';
    context.fillText(label, position.x, position.y);
  }
  if (game.paused) {
    context.fillStyle = '#fffdf1';
    context.fillRect(width / 2 - 130, height / 2 - 38, 260, 72);
    context.fillStyle = '#315e5a';
    context.font = '18px monospace';
    context.fillText('PAUSE', width / 2, height / 2 - 5);
    context.font = '11px monospace';
    context.fillText('P ou le bouton pour reprendre', width / 2, height / 2 + 18);
  }
}
