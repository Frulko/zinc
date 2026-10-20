// A page with p5.js and a sketch, as an index.html has them: two script elements, in order (ZN-568). Run with ZINC_WEB=1 by
// tests/t1/webenv_p5.sh, which gives the path of the pinned p5.min.js in WEBENV_P5 (the repository does not carry p5: tools/test-lib);
// the output is page.out.
const nativePromise = Promise;
for (const src of [__host_sysEnv('WEBENV_P5'), 'sketch.js']) {
  const s = document.createElement('script');
  s.src = src;
  s.onload = () => console.log('loaded', src.split('/').pop(), 'p5', typeof p5 === 'function' ? p5.prototype.VERSION : typeof p5, 'native Promise kept', Promise === nativePromise);
  s.onerror = () => console.log('could not load', src);
  document.head.appendChild(s);
}
