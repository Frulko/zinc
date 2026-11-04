// One visible canvas owns presentation; the original renderer owns a low-resolution bitmap.
export const scene = document.createElement('canvas');
export const view = document.createElement('canvas');
view.style.imageRendering = 'pixelated';
document.body.appendChild(view);
const context = view.getContext('2d');
const layout = { x: 0, y: 0, scale: 1, sourceX: 0, sourceY: 0 };
const FULL_SCENE = { x: 0, y: 0, width: 360, height: 280 };

export function toCanvas(event) {
  return {
    x: (event.clientX - layout.x) / layout.scale + layout.sourceX,
    y: (event.clientY - layout.y) / layout.scale + layout.sourceY,
  };
}

export function fromCanvas(x, y) {
  return { x: layout.x + (x - layout.sourceX) * layout.scale, y: layout.y + (y - layout.sourceY) * layout.scale };
}

export function presentScene(crop = FULL_SCENE) {
  if (view.width !== innerWidth || view.height !== innerHeight) {
    view.width = innerWidth;
    view.height = innerHeight;
  }
  const width = view.width;
  const height = view.height;
  layout.scale = Math.max(1, Math.floor(Math.min(width / crop.width, (height - 130) / crop.height)));
  layout.x = Math.floor((width - crop.width * layout.scale) / 2);
  layout.y = Math.floor((height - crop.height * layout.scale) / 2);
  layout.sourceX = crop.x;
  layout.sourceY = crop.y;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = false;
  context.drawImage(scene, crop.x, crop.y, crop.width, crop.height, layout.x, layout.y, crop.width * layout.scale, crop.height * layout.scale);
  return context;
}

export function present(game, muted, paused) {
  presentScene();
  const width = view.width;
  const height = view.height;
  context.font = '14px monospace';
  context.textAlign = 'left';
  context.fillStyle = '#79746c';
  context.fillText(paused ? '▶ Reprendre [P]' : 'Ⅱ Pause [P]', 22, 30);
  context.textAlign = 'right';
  context.fillText(muted ? 'Son : non [M]' : 'Son : oui [M]', width - 22, 30);
  context.textAlign = 'center';
  context.fillStyle = '#292622';
  context.font = '22px monospace';
  context.fillText('BALOTE', width / 2, 43);
  context.font = '16px monospace';
  context.fillStyle = '#b03a2c';
  context.fillText('VOUS  ' + game.score[0] + '   ' + '●'.repeat(game.left[0]), width / 2 - 140, 78);
  context.fillStyle = '#2a4c70';
  context.fillText('BOT  ' + game.score[1] + '   ' + '●'.repeat(game.left[1]), width / 2 + 140, 78);
  context.fillStyle = '#514c45';
  context.font = '14px monospace';
  context.fillText(game.status, width / 2, height - 58);
  context.fillStyle = '#8b877f';
  context.font = '12px monospace';
  context.fillText('Glisser → relâcher · Flèches : direction / force · Espace : lancer / continuer', width / 2, height - 32);
}
