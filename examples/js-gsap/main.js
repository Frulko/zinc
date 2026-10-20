// GSAP, the whole library (core and every plugin), on the QuickJS engine with the web environment: a timeline of staggered, elastic and
// eased tweens on plain objects, drawn on a canvas 2D every tick of gsap's own ticker.
// Run it:  tools/test-lib gsap-3.15.0     (once: it downloads GSAP from its npm release; GreenSock's licence is not open source and the
//                                               file is not in this repository)
//          zinc run examples/js-gsap
const home = __host_sysEnv('ZINC_HOME') || __host_sysEnv('HOME') + '/.zinc';
const script = document.createElement('script');
script.src = home + '/cache/test-libs/gsap-3.15.0/all.js';
script.onerror = () => console.error('js-gsap: cannot load ' + script.src + ': run tools/test-lib gsap-3.15.0 once, it downloads GSAP');
script.onload = start;
document.head.appendChild(script);

function start() {
  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth || 800; canvas.height = window.innerHeight || 500;
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const colors = ['#fa114f', '#ff9f0a', '#c8f25a', '#1eeaef', '#7a3cff'];
  const dots = Array.from({ length: 5 }, (_, i) => ({ x: 120 + i * (W - 240) / 4, y: H * 0.5, r: 0, hue: i }));
  const ring = { angle: 0, radius: 0 };

  // one timeline: the dots grow with a stagger, rise with a bounce, a ring turns around the middle, and it all plays again, back and forth
  const tl = gsap.timeline({ repeat: -1, yoyo: true, repeatDelay: 0.4, defaults: { ease: 'power2.inOut' } });
  tl.to(dots, { r: 34, duration: 0.8, stagger: { each: 0.12, from: 'center' }, ease: 'back.out(2)' })
    .to(dots, { y: H * 0.28, duration: 1.1, stagger: 0.1, ease: 'elastic.out(1, 0.45)' }, '-=0.3')
    .to(ring, { radius: H * 0.3, angle: Math.PI * 2, duration: 1.6, ease: 'expo.inOut' }, 'ring')
    .to(dots, { y: H * 0.72, duration: 0.9, stagger: { each: 0.08, from: 'edges' }, ease: 'bounce.out' }, '>-0.2');

  gsap.ticker.add(() => {
    g.fillStyle = '#111318'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(236,232,223,.35)'; g.lineWidth = 3;
    g.beginPath(); g.arc(W / 2, H / 2, Math.max(1, ring.radius), 0, ring.angle); g.stroke();
    for (const d of dots) {
      g.fillStyle = colors[d.hue];
      g.beginPath(); g.arc(d.x, d.y, Math.max(0, d.r), 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#ece8df'; g.font = '20px sans-serif';
    g.fillText('gsap ' + gsap.version + ' · ' + Math.round(tl.progress() * 100) + '%', 24, 36);
  });
}
