// The page: p5.js, then the sketch, as the two <script> tags of an index.html.
// Run it:  tools/test-lib p5-1.11.13      (once: it downloads p5.js beside Zinc's caches; p5.js is LGPL and is not in this repository)
//          zinc run examples/js-p5                         (the WEBGL sketch)
//          P5_SKETCH=sketch2d.js zinc run examples/js-p5   (the 2D sketch)
const home = __host_sysEnv('ZINC_HOME') || __host_sysEnv('HOME') + '/.zinc';
for (const src of [home + '/cache/test-libs/p5-1.11.13/p5.min.js', __host_sysEnv('P5_SKETCH') || 'sketch.js']) {   // P5_SKETCH=sketch2d.js runs the 2D sketch
  const script = document.createElement('script');
  script.src = src;
  script.async = false;   // in order
  script.onerror = () => console.error('js-p5: cannot load ' + src + (src.endsWith('p5.min.js') ? ': run tools/test-lib p5-1.11.13 once, it downloads p5.js' : ''));
  document.head.appendChild(script);
}
