// The page: Phaser, then the game, as the two <script> tags of an index.html.
// Run it:  zinc run examples/js-phaser
for (const src of ['../../next/third_party/phaser/phaser-3.90.0.min.js', 'game.js']) {
  const script = document.createElement('script');
  script.src = src;
  script.async = false;   // in order
  document.head.appendChild(script);
}
