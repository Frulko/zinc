// The DOM painter of the Zinc web runtime (render "dom", docs/targets/web.md): the same drawing rows as the canvas painter, but each row becomes a real
// element that the browser lays out, paints, selects and reads aloud: a rectangle is a div with a radius, a text line a span, an image a canvas element,
// a shape an <svg>. Zinc's own layout still decides where everything goes (the classic engine of zinc:ui, measured with the same canvas metrics the text
// is then set in), so the page matches canvas mode closely; what the browser adds is selectable text, find in page, zoom, IME, screen readers, and no
// big canvas to upload on every frame. Elements are pooled by position and styles are written only when they change, so an idle frame touches nothing.
// Drawing into an image (beginImage) and everything with no element equivalent stays on a canvas (delegated to the canvas painter of runtime.js).
export function makeDomPainter(env) {
  const { root, stageEl, fonts, images, hex6, rgba, W, H, paintStyle } = env;
  stageEl.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;font-kerning:normal;text-rendering:optimizeLegibility';
  stageEl.setAttribute('role', 'document');
  stageEl.setAttribute('aria-label', env.title || 'app');
  root.appendChild(stageEl);
  const NS = 'http://www.w3.org/2000/svg';
  const frameStack = [];
  let cursor, parent, ox, oy, kept = false, delegate = null, clipDepth = 0;
  let layer = null;   // the container being filled: { el, kids: [], at }
  const metricCtx = document.createElement('canvas').getContext('2d');
  const ascents = new Map();

  function begin() {
    kept = false; clipDepth = 0;
    layer = { el: stageEl, kids: layer ? layer.kids : [], at: 0, ox: 0, oy: 0 };
    frameStack.length = 0;
  }
  // the next element of the container being filled: reused when it has the kind, else replaced
  function take(kind, make) {
    const L = layer;
    let el = L.kids[L.at];
    if (!el || el._k !== kind) {
      el = make();
      el._k = kind; el._c = '';
      if (L.kids[L.at]) { L.el.replaceChild(el, L.kids[L.at]); L.kids[L.at] = el; }
      else { L.el.appendChild(el); L.kids.push(el); }
    }
    L.at++;
    return el;
  }
  function sweep(L) {
    while (L.kids.length > L.at) { const k = L.kids.pop(); k.remove(); }
    for (const k of L.kids) if (k._layer) { /* nested containers are swept when closed */ }
  }
  function end() {
    if (kept) return;
    while (frameStack.length) unclip();
    sweep(layer);
  }
  const css = (el, s) => { if (el._c !== s) { el._c = s; el.style.cssText = s; } };
  const div = () => { const d = document.createElement('div'); return d; };
  // position of a box in the current container, through the translate and the matrix the app set
  function place(x, y, w, h) {
    const t = env.xform();
    x += t.tx - layer.ox; y += t.ty - layer.oy;
    const m = t.xf;
    if (!m) return `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    return `left:0;top:0;width:${w}px;height:${h}px;transform-origin:0 0;transform:matrix(${m[0]},${m[1]},${m[2]},${m[3]},${m[4] + m[0] * x + m[2] * y},${m[5] + m[1] * x + m[3] * y});`;
  }
  const ABS = 'position:absolute;box-sizing:border-box;pointer-events:none;';
  const radius = (r, w, h) => { r = Math.max(0, Math.min(r, w / 2, h / 2)); return r > 0 ? `border-radius:${r}px;` : ''; };
  const alphaOf = (a) => Math.max(0, Math.min(255, a));

  function cssGradient(rec, x, y, w, h) {
    const kind = rec[0] | 0, n = rec[7] | 0, rep = (kind & 8) !== 0;
    const t = env.xform();
    const stops = [];
    for (let i = 0; i < n; i++) stops.push([rec[8 + i * 3], rgba(rec[9 + i * 3], rec[10 + i * 3])]);
    const pct = (o) => `${(o * 100).toFixed(3)}%`;
    const cx = (v) => `${v + t.tx - x - t.tx}px`;   // (the box is placed at x, y: positions are relative to it)
    switch (kind & 7) {
      case 1: {   // along the line p0 -> p1: the stops are laid by their distance on that line
        const dx = rec[4] - rec[1], dy = rec[5] - rec[2], len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, ang = Math.atan2(ux, -uy) * 180 / Math.PI;
        const L = Math.abs(w * ux) + Math.abs(h * uy), sx = x + w / 2 - ux * L / 2, sy = y + h / 2 - uy * L / 2;
        const t0 = (rec[1] - sx) * ux + (rec[2] - sy) * uy;
        return `${rep ? 'repeating-' : ''}linear-gradient(${ang}deg,${stops.map(([o, c]) => `${c} ${(t0 + o * len).toFixed(2)}px`).join(',')})`;
      }
      case 2: return `${rep ? 'repeating-' : ''}radial-gradient(circle ${Math.max(1, rec[6])}px at ${rec[4] - x}px ${rec[5] - y}px,${stops.map(([o, c]) => `${c} ${pct(o)}`).join(',')})`;
      case 3: return `${rep ? 'repeating-' : ''}radial-gradient(ellipse ${Math.max(1, rec[4])}px ${Math.max(1, rec[5])}px at ${rec[1] - x}px ${rec[2] - y}px,${stops.map(([o, c]) => `${c} ${pct(o)}`).join(',')})`;
      default: return `${rep ? 'repeating-' : ''}conic-gradient(from ${rec[3]}rad at ${rec[1] - x}px ${rec[2] - y}px,${stops.map(([o, c]) => `${c} ${pct(o)}`).join(',')})`;
    }
  }
  function svgShape(d, fill, stroke, extra) {
    const el = take('svg', () => { const s = document.createElementNS(NS, 'svg'); s.appendChild(document.createElementNS(NS, 'path')); return s; });
    const t = env.xform();
    const m = t.xf;
    css(el, ABS + `left:${t.tx - layer.ox}px;top:${t.ty - layer.oy}px;width:1px;height:1px;overflow:visible;` + (m ? `transform-origin:0 0;transform:matrix(${m.join(',')});` : ''));
    const p = el.firstChild;
    p.setAttribute('d', d); p.setAttribute('fill', fill); p.setAttribute('fill-rule', 'nonzero');
    if (stroke) { p.setAttribute('stroke', stroke.color); p.setAttribute('stroke-width', stroke.width); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('stroke-linecap', 'round'); } else p.removeAttribute('stroke');
    return el;
  }
  const pathOf = (pts, closed) => { let d = `M${pts[0]} ${pts[1]}`; for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`; return d + (closed ? 'Z' : ''); };
  function ascentOf(f) {
    let a = ascents.get(f.css);
    if (a === undefined) { metricCtx.font = f.css; const m = metricCtx.measureText('Hxg'); a = { asc: m.fontBoundingBoxAscent || f.px * 0.93, desc: m.fontBoundingBoxDescent || f.px * 0.25 }; ascents.set(f.css, a); }
    return a;
  }
  function imageEl(im, sx, sy, sw, sh, dw, dh, flags, rot, tint, blend) {
    const el = take('canvas', () => document.createElement('canvas'));
    const key = [im.rev || 0, sx, sy, sw, sh, dw, dh, tint, flags & 4].join(',');
    if (el._img !== im || el._key !== key) {
      el._img = im; el._key = key;
      const k = im.k || 1;
      el.width = Math.max(1, Math.round(dw)); el.height = Math.max(1, Math.round(dh));
      const c = el.getContext('2d');
      c.imageSmoothingEnabled = !(flags & 4);
      c.drawImage(im.canvas, sx * k, sy * k, sw * k, sh * k, 0, 0, el.width, el.height);
      if (tint !== undefined && (tint & 0xffffff) !== 0xffffff) { c.globalCompositeOperation = 'multiply'; c.fillStyle = hex6(tint); c.fillRect(0, 0, el.width, el.height); c.globalCompositeOperation = 'destination-in'; c.drawImage(im.canvas, sx * k, sy * k, sw * k, sh * k, 0, 0, el.width, el.height); }
    }
    return el;
  }
  const BLEND = ['normal', 'plus-lighter', 'multiply', 'screen'];
  function unclip() {
    const f = frameStack.pop();
    if (!f) return;
    sweep(layer);
    layer = f;
  }

  const P = {
    begin, end, keep() { kept = true; },
    clear(c) { stageEl.style.background = hex6(c); },
    rect(x, y, w, h, c) { if (delegate) return delegate.rect(x, y, w, h, c); css(take('div', div), ABS + place(x, y, w, h) + `background:${hex6(c)};`); },
    rrect(x, y, w, h, r, c, a) {
      if (delegate) return delegate.rrect(x, y, w, h, r, c, a);
      if (alphaOf(a) <= 0) return;
      css(take('div', div), ABS + place(x, y, w, h) + radius(r, w, h) + `background:${rgba(c, a)};`);
    },
    gradient(x, y, w, h, r, c1, c2, vertical, a) {
      if (delegate) return delegate.gradient(x, y, w, h, r, c1, c2, vertical, a);
      css(take('div', div), ABS + place(x, y, w, h) + radius(r, w, h) + `background:linear-gradient(${vertical ? 180 : 90}deg,${rgba(c1, a)},${rgba(c2, a)});`);
    },
    gradientPaint(x, y, w, h, r, rec, a) {
      if (delegate) return delegate.gradientPaint(x, y, w, h, r, rec, a);
      if (!rec || rec.length < 11) return;
      css(take('div', div), ABS + place(x, y, w, h) + radius(r, w, h) + `background:${cssGradient(rec, x, y, w, h)};` + (a < 255 ? `opacity:${alphaOf(a) / 255};` : ''));
    },
    border(x, y, w, h, r, bw, c, a) {
      if (delegate) return delegate.border(x, y, w, h, r, bw, c, a);
      if (!(bw > 0)) return;
      css(take('div', div), ABS + place(x, y, w, h) + radius(r, w, h) + `border:${bw}px solid ${rgba(c, a)};`);
    },
    shadow(x, y, w, h, r, blur, c, a) {
      if (delegate) return delegate.shadow(x, y, w, h, r, blur, c, a);
      css(take('div', div), ABS + place(x, y, w, h) + radius(r, w, h) + `box-shadow:0 0 ${blur}px ${rgba(c, a)};`);
    },
    polygon(pts, c, a) { if (delegate) return delegate.polygon(pts, c, a); svgShape(pathOf(pts, true), rgba(c, a)); },
    path(contours, c, a) {
      if (delegate) return delegate.path(contours, c, a);
      let d = '';
      for (let i = 0; i < contours.length;) {
        const n = contours[i] | 0, s = i + 1;
        if (n < 1 || s + n * 2 > contours.length) break;
        d += `M${contours[s]} ${contours[s + 1]}`;
        for (let k = 1; k < n; k++) d += `L${contours[s + k * 2]} ${contours[s + k * 2 + 1]}`;
        d += 'Z'; i = s + n * 2;
      }
      svgShape(d, rgba(c, a));
    },
    stroke(pts, width, c, a, closed) { if (delegate) return delegate.stroke(pts, width, c, a, closed); svgShape(pathOf(pts, closed), 'none', { color: rgba(c, a), width }); },
    line(x1, y1, x2, y2, c) { if (delegate) return delegate.line(x1, y1, x2, y2, c); svgShape(`M${x1} ${y1}L${x2} ${y2}`, 'none', { color: hex6(c), width: 1 }); },
    text(x, y, s, c, k) {
      if (delegate) return delegate.text(x, y, s, c, k);
      const el = take('span', () => document.createElement('span'));
      css(el, ABS + place(x, y, 0, 0).replace('width:0px;height:0px;', '') + `font:${8 * Math.max(1, k)}px ${'ui-monospace,Menlo,monospace'};color:${hex6(c)};white-space:pre;`);
      if (el.textContent !== s) el.textContent = s;
    },
    drawText(id, x, y, s, c, a, tracking) {
      if (delegate) return delegate.drawText(id, x, y, s, c, a, tracking);
      const f = fonts[id];
      if (!f || s === '' || alphaOf(a) <= 0) return;
      const el = take('span', () => { const e = document.createElement('span'); return e; });
      const m = ascentOf(f);
      const top = y + f.asc - m.asc;   // the baseline where canvas mode puts it: the layout's ascent below the line's top
      css(el, ABS + place(x, top, 0, 0).replace('width:0px;height:0px;', '') + `font:${f.css};line-height:${m.asc + m.desc}px;color:${rgba(c, a)};white-space:pre;pointer-events:auto;user-select:text;-webkit-user-select:text;` + (tracking ? `letter-spacing:${tracking}px;` : ''));
      if (el.textContent !== s) el.textContent = s;
    },
    drawImage(id, x, y, w, h, a, r) {
      if (delegate) return delegate.drawImage(id, x, y, w, h, a, r);
      const im = images[id];
      if (!im || !(w > 0 && h > 0)) return;
      const el = imageEl(im, 0, 0, im.w, im.h, w, h, 0, 0);
      css(el, ABS + place(x, y, w, h) + radius(r, w, h) + (a < 255 ? `opacity:${alphaOf(a) / 255};` : ''));
    },
    drawImageRect(id, sx, sy, sw, sh, dx, dy, dw, dh, a, flags, rot, tint, blend) {
      if (delegate) return delegate.drawImageRect(id, sx, sy, sw, sh, dx, dy, dw, dh, a, flags, rot, tint, blend);
      const im = images[id];
      if (!im || !(sw > 0 && sh > 0 && dw > 0 && dh > 0)) return;
      const el = imageEl(im, sx, sy, sw, sh, dw, dh, flags, rot, tint, blend);
      const t = env.xform(), m = t.xf;
      const flip = `scale(${flags & 1 ? -1 : 1},${flags & 2 ? -1 : 1})`;
      let s = ABS + `left:${dx + t.tx - layer.ox}px;top:${dy + t.ty - layer.oy}px;width:${dw}px;height:${dh}px;transform-origin:50% 50%;image-rendering:${flags & 4 ? 'pixelated' : 'auto'};`;
      s += `transform:${m ? `matrix(${m.join(',')}) ` : ''}${rot ? `rotate(${rot}rad) ` : ''}${flip};`;
      if (a < 255) s += `opacity:${alphaOf(a) / 255};`;
      if (blend) s += `mix-blend-mode:${BLEND[blend] || 'normal'};`;
      css(el, s);
    },
    svg(doc, x, y, w, h, a) {   // the document itself in the page: a real <svg> that the browser scales and paints
      if (delegate) return env.canvasPainter.svg(doc, x, y, w, h, a);
      const el = take('svgdoc', () => document.createElement('div'));
      if (el._doc !== doc) {
        el._doc = doc; el.innerHTML = doc.text;
        const s = el.firstElementChild;
        if (s) { s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); if (!s.hasAttribute('viewBox')) s.setAttribute('viewBox', doc.vb.join(' ')); if (doc.none) s.setAttribute('preserveAspectRatio', 'none'); s.style.overflow = 'hidden'; }
      }
      css(el, ABS + place(x, y, w, h) + (a < 255 ? `opacity:${alphaOf(a) / 255};` : ''));
    },
    clip(x, y, w, h, r) {
      if (delegate) return;
      const t = env.xform();
      const el = take('clip', () => { const d = document.createElement('div'); return d; });
      css(el, ABS + place(x, y, w, h) + radius(r, w, h) + 'overflow:hidden;');
      frameStack.push(layer);
      el._kids = el._kids || [];
      layer = { el, kids: el._kids, at: 0, ox: x + t.tx, oy: y + t.ty };   // children are placed from the clip's corner
    },
    unclip() { if (delegate) return; unclip(); },
    beginImage(id) { delegate = env.canvasPainter; delegate.beginImage(id); },
    endImage() { if (delegate) { delegate.endImage(); delegate = null; } },
    resize() {},
    transformChanged() {},
  };
  return P;
}
