// The page of phaser-canvas.js (ZN-572): Phaser, then the game, as two script elements. Run by tests/t1/webenv_canvas2d_libs.sh.
// Phaser finds out whether the canvas has the blend modes by loading two pictures from data: URLs, one after the other, when its script
// runs, and reads the answer when the game starts. A browser has loaded both by the time it has fetched the game's script; here the
// second script would run between the two pictures (next/backlog/later.md), so the game's script is added a few turns of the event loop later (Phaser does not show its answer before a game exists).
const add = (src, then) => {
  const s = document.createElement('script');
  s.src = src;
  s.onload = then;
  s.onerror = () => console.log('could not load', src);
  document.head.appendChild(s);
};
add('../../../../../third_party/phaser/phaser-3.90.0.min.js', () => {
  let turns = 0;
  const wait = () => ++turns > 8 ? add('phaser-canvas.js') : setTimeout(wait, 0);
  wait();
});
