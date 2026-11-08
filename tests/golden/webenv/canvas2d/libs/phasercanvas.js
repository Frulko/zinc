// The page of phaser-canvas.js (ZN-572): Phaser, then the game, as the two script elements of an index.html. Run by tests/t1/webenv_canvas2d_libs.sh.
// Phaser finds out whether the canvas has the blend modes by loading two pictures from data: URLs, one after the other, when its script
// runs, and reads the answer when the game starts: the game's script waits for those pictures, as in a browser (ZN-1042).
for (const src of ['../../../../../third_party/phaser/phaser-3.90.0.min.js', 'phaser-canvas.js']) {
  const s = document.createElement('script');
  s.src = src;
  s.async = false;
  s.onerror = () => console.log('could not load', src);
  document.head.appendChild(s);
}
