// zinc:svg in the browser: the native side of plugins/svg/native/svg.spec.ts over the page's own SVG support (docs/targets/web.md, "Plugins"). The document is parsed
// at once with DOMParser (no asynchronous image decode: an icon is there on the frame that asks for it); the canvas painter draws its shapes with Path2D, the
// DOM painter puts the <svg> in the page. Shapes: path, rect, circle, ellipse, line, polyline, polygon, groups with transform and the presentation
// attributes (fill, stroke, stroke-width, caps, joins, opacities, fill-rule, style=""). Not here: gradients, <use>, filters, text (what Lucide and most icon sets do not use).
const Z = globalThis.__zincWeb;
const docs = [];
let lastError = '';

const num = (s, d) => { const v = parseFloat(s); return Number.isFinite(v) ? v : d; };
function matrixOf(t) {   // an SVG transform list as one matrix [a b c d e f]
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (n) => { m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; };
  for (const f of (t || '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = f[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (f[1] === 'translate') mul([1, 0, 0, 1, a[0] || 0, a[1] || 0]);
    else if (f[1] === 'scale') mul([a[0], 0, 0, a.length > 1 ? a[1] : a[0], 0, 0]);
    else if (f[1] === 'rotate') { const r = (a[0] || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), cx = a[1] || 0, cy = a[2] || 0; mul([1, 0, 0, 1, cx, cy]); mul([c, s, -s, c, 0, 0]); mul([1, 0, 0, 1, -cx, -cy]); }
    else if (f[1] === 'matrix' && a.length === 6) mul(a);
    else if (f[1] === 'skewX') mul([1, 0, Math.tan((a[0] || 0) * Math.PI / 180), 1, 0, 0]);
    else if (f[1] === 'skewY') mul([1, Math.tan((a[0] || 0) * Math.PI / 180), 0, 1, 0, 0]);
  }
  return m;
}
const STYLE = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'stroke-miterlimit', 'stroke-dasharray'];
function styleOf(el, inherited) {
  const s = Object.assign({}, inherited);
  s.opacity = 1;   // opacity does not inherit: it multiplies down the tree
  for (const k of STYLE) if (el.hasAttribute(k)) s[k] = el.getAttribute(k);
  const css = el.getAttribute('style');
  if (css) for (const part of css.split(';')) { const i = part.indexOf(':'); if (i > 0) { const k = part.slice(0, i).trim(); if (STYLE.includes(k)) s[k] = part.slice(i + 1).trim(); } }
  if (inherited.opacity !== undefined) s.opacity = num(s.opacity, 1) * inherited.opacity;
  return s;
}
const colour = (c) => (c === undefined ? '#000' : c === 'currentColor' ? '#000' : c);
function shapeOf(el) {
  const p = new Path2D(), n = (k, d = 0) => num(el.getAttribute(k), d);
  switch (el.localName) {
    case 'path': return new Path2D(el.getAttribute('d') || '');
    case 'rect': { const x = n('x'), y = n('y'), w = n('width'), h = n('height'); let rx = el.hasAttribute('rx') ? n('rx') : n('ry'), ry = el.hasAttribute('ry') ? n('ry') : rx; if (rx || ry) p.roundRect(x, y, w, h, [Math.min(rx, w / 2)]); else p.rect(x, y, w, h); return p; }
    case 'circle': p.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2); return p;
    case 'ellipse': p.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2); return p;
    case 'line': p.moveTo(n('x1'), n('y1')); p.lineTo(n('x2'), n('y2')); return p;
    case 'polyline': case 'polygon': {
      const a = (el.getAttribute('points') || '').split(/[\s,]+/).filter(Boolean).map(Number);
      for (let i = 0; i + 1 < a.length; i += 2) (i ? p.lineTo(a[i], a[i + 1]) : p.moveTo(a[i], a[i + 1]));
      if (el.localName === 'polygon') p.closePath();
      return p;
    }
    default: return null;
  }
}
function collect(el, style, m, out) {
  for (const c of el.children) {
    if (['defs', 'title', 'desc', 'metadata', 'style', 'clipPath', 'mask', 'symbol'].includes(c.localName)) continue;
    const cm = c.hasAttribute('transform') ? matrixOf(c.getAttribute('transform')) : [1, 0, 0, 1, 0, 0];
    const total = [m[0] * cm[0] + m[2] * cm[1], m[1] * cm[0] + m[3] * cm[1], m[0] * cm[2] + m[2] * cm[3], m[1] * cm[2] + m[3] * cm[3], m[0] * cm[4] + m[2] * cm[5] + m[4], m[1] * cm[4] + m[3] * cm[5] + m[5]];
    const st = styleOf(c, style);
    if (c.localName === 'g' || c.localName === 'a') { collect(c, st, total, out); continue; }
    const path = shapeOf(c);
    if (path) out.push({ path, m: total, fill: st.fill === 'none' ? null : colour(st.fill), stroke: st.stroke === undefined || st.stroke === 'none' ? null : colour(st.stroke), sw: num(st['stroke-width'], 1),
      cap: st['stroke-linecap'] || 'butt', join: st['stroke-linejoin'] || 'miter', miter: num(st['stroke-miterlimit'], 4), opacity: st.opacity, fo: num(st['fill-opacity'], 1), so: num(st['stroke-opacity'], 1), rule: st['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
      dash: (st['stroke-dasharray'] || '').split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite) });
  }
}

Z.registerNative('SvgEngine', {
  parse(text) {
    try {
      const d = new DOMParser().parseFromString(text, 'image/svg+xml'), svg = d.documentElement;
      if (!svg || svg.localName !== 'svg' || d.getElementsByTagName('parsererror').length) { lastError = 'not an SVG document'; return -1; }
      const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).filter(Boolean).map(Number);
      const w = num(svg.getAttribute('width'), vb.length === 4 ? vb[2] : 300), h = num(svg.getAttribute('height'), vb.length === 4 ? vb[3] : 150);
      const items = [];
      // currentColor and the root's own presentation attributes (Lucide puts fill, stroke and widths on <svg>) reach the shapes
      collect(svg, styleOf(svg, { opacity: 1 }), [1, 0, 0, 1, 0, 0], items);
      docs.push({ text, w, h, vb: vb.length === 4 ? vb : [0, 0, w, h], none: /preserveAspectRatio\s*=\s*["']none/.test(text), items });
      return docs.length - 1;
    } catch (e) { lastError = String(e && e.message || e); return -1; }
  },
  error() { return lastError; },
  width(i) { return docs[i] ? docs[i].w : 0; },
  height(i) { return docs[i] ? docs[i].h : 0; },
  items(i) { return docs[i] ? docs[i].items.length : 0; },
  dispose(i) { docs[i] = null; },
  draw(i, x, y, w, h, alpha) { if (docs[i] && w > 0 && h > 0) Z.paint.svg(docs[i], x, y, w, h, alpha); },
}, []);
