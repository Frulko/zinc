// The page of phaser-text.js (ZN-570): Phaser, then the game, as two script elements. Run by tests/t1/webenv_canvas2d_libs.sh.
for (const src of ['../../../../../third_party/phaser/phaser-3.90.0.min.js', 'phaser-text.js']) {
  const s = document.createElement('script');
  s.src = src;
  s.onerror = () => console.log('could not load', src);
  document.head.appendChild(s);
}
