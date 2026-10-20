// The page of p5-sketch.js (ZN-570): p5.js (WEBENV_P5: the repository does not carry it, tools/test-lib), then the sketch, as two script
// elements. Run by tests/t1/webenv_canvas2d_libs.sh.
for (const src of [__host_sysEnv('WEBENV_P5'), 'p5-sketch.js']) {
  const s = document.createElement('script');
  s.src = src;
  s.onerror = () => console.log('could not load', src);
  document.head.appendChild(s);
}
