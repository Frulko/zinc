// A page with Phaser 3 and a game, as an index.html has them: two script elements, in order (ZN-569). Run with ZINC_WEB=1 and game.input by
// tests/t1/webenv_phaser.sh; the output is page.out. Phaser is the unmodified phaser.min.js of its npm release (third_party/phaser).
for (const src of ['../../../../third_party/phaser/phaser-3.90.0.min.js', 'game.js']) {
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => console.log('loaded', src.split('/').pop(), 'Phaser', typeof Phaser === 'object' ? Phaser.VERSION : typeof Phaser);
  s.onerror = () => console.log('could not load', src);
  document.head.appendChild(s);
}
