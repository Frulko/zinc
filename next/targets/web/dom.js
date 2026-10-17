// The semantic DOM host of the Zinc web runtime (render "dom", docs/targets/web.md "The semantic DOM").
//
// zinc:ui keeps its tree of nodes (View, Text, Button, Image, ScrollView, Input...) and, after each frame in which something changed, hands it to commit() below.
// This file turns that tree into real elements and patches the page's DOM with the difference:
//   - a node becomes the element its role says (nav, main, ul/li, h1-h6, a, button, label, input, textarea, img, form, dialog...), with ARIA from the same tree;
//   - the layout is the browser's: the node's style (the numbers the classes and style objects resolved to) is written as CSS classes of a generated, deduplicated,
//     minified stylesheet; only a value that changes after the element exists (an animation, a computed size) goes to a CSS custom property of the element;
//   - the browser does the scrolling, the focus ring, Tab order, text input, IME, selection, copy and paste, spellcheck, form submission and autofill; its events are
//     handed to the handlers of the nodes (onClick, onPointerDown, onScroll, onInput...) through zinc:ui's dom* functions;
//   - what Zinc draws itself (zinc:gfx in a Canvas node, icons, charts) is a real <canvas> (or an inline <svg> for an icon) where the node sits.
// Zinc's own layout still runs underneath (cheaply) so that the program's geometry calls (screenBox, onScroll limits, virtual lists) keep answering; what the person sees is
// laid out by CSS. The differences with the classic engine are listed in docs/targets/web.md.
export function makeDomHost(env) {
  const { root, CFG, Z, fonts, images, hex6, canvasPainter, drawInto, assetUrl, dpr } = env;
  const G = globalThis;
  const VIEW = 0, TEXT = 1, BUTTON = 2, IMAGE = 3, SCROLL = 4, CANVAS = 5, FRAGMENT = 6, INPUT = 7, TEXTAREA = 8;
  const UNSET = -100000;   // zinc:ui's "not set" for left, top, right, bottom and letter spacing
  let ui = null;   // zinc:ui's exports, given by the first commit
  // prerendering (zinc export --prerender): the page may arrive with the elements of its first screen (marked data-z with the number of their node) and their style sheet; they are adopted
  // instead of built again. In capture mode (?zn-capture, how the export takes them) the elements are marked and the rules are written as text, which a serialised page keeps.
  const capture = /[?&]zn-capture/.test(location.search);
  const pre = root.hasAttribute('data-prerendered');
  const adopt = new Map();
  if (pre) for (const e of root.querySelectorAll('[data-z]')) adopt.set(parseInt(e.getAttribute('data-z')), e);

  // ---------------------------------------------------------------- the generated stylesheet
  const styleEl = document.createElement('style');
  styleEl.id = 'zinc-css';
  document.head.appendChild(styleEl);
  let sheet = styleEl.sheet;
  const ruleText = [];   // every rule, in order (the prerender copies them into the page)
  const classes = new Map();   // 'prop:value' -> class name
  let nextClass = 0;
  const cname = () => '_' + (nextClass++).toString(36);   // (the fixed classes of the base rules start with z)
  function addRule(text) {
    ruleText.push(text);
    if (capture) { styleEl.appendChild(document.createTextNode(text + '\n')); return; }
    try { sheet.insertRule(text, sheet.cssRules.length); } catch (e) { /* a value the browser refuses: the rule is dropped, the element keeps the others */ }
  }
  // base rules: the reset that makes CSS flexbox behave as the classic engine of zinc:ui (React Native's defaults)
  const BASE = [
    ':root{--zn-sans:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;--zn-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;--zn-serif:ui-serif,Georgia,Cambria,"Times New Roman",serif}',
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}',
    '#zinc-root{position:fixed;inset:0;height:100dvh;overflow:hidden;font:16px/1.4 var(--zn-sans);outline:none;-webkit-tap-highlight-color:transparent}',
    '#zinc-root.zinc-page{position:static;height:auto;min-height:100dvh;overflow:visible}',
    // every box: a column flex container that does not shrink, as zinc:ui's (flex-shrink 0, align stretch, no content-based minimum)
    '.z,.zt,.zr{box-sizing:border-box;margin:0;padding:0;border:0 solid transparent;position:relative;flex:0 0 auto;-webkit-text-size-adjust:none}',
    '.zr{min-width:0;min-height:0}',
    '.z{display:flex;flex-direction:column;align-content:flex-start;align-items:stretch;justify-content:flex-start;pointer-events:none}',
    '.zt,.zr,.zk,.zl>*{pointer-events:auto}',
    '.zt{display:block;flex:0 1 auto;white-space:normal;overflow-wrap:normal;text-align:start}',
    '.zr{display:block;object-fit:fill}',
    ':where(ul.z,ol.z,li.z){list-style:none}',
    ':where(button.z,a.z,label.z,summary.z){font:inherit;color:inherit;text-align:inherit;text-decoration:none;background:transparent;appearance:none;-webkit-appearance:none;cursor:default;-webkit-user-select:none;user-select:none}',
    ':where(a.zt){color:inherit;text-decoration:none}',
    '.zs{overscroll-behavior:auto;-webkit-overflow-scrolling:touch;flex-shrink:1}',
    '.zi{font:inherit;color:inherit;background:transparent;appearance:none;-webkit-appearance:none;outline:none;resize:none;margin:0;text-align:start;flex-shrink:0}',
    '.zi::placeholder{color:#64748b;opacity:1}',
    '.zi:focus{outline:2px solid #3b82f6;outline-offset:-1px}',
    '.zi:disabled{opacity:.6}',
    '.z:focus-visible{outline:2px solid #facc15;outline-offset:2px}',
    '.z:focus:not(:focus-visible){outline:none}',
    '.zn-ring-none:focus-visible{outline:none}',
    '.zv{display:block;flex:0 0 auto;height:0;width:1px}',
    'dialog.zd{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;color:inherit;overflow:visible}',
    'dialog.zd::backdrop{background:var(--zn-backdrop,transparent)}',
    '.zl{position:fixed;inset:0;pointer-events:none}',
    '.zdrag{touch-action:none}',
    '.zdb{position:absolute;inset:0;pointer-events:none;display:block}',
    '.zdb>canvas,.zdb>svg{display:block;width:100%;height:100%}',
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}',
  ];
  for (const r of BASE) addRule(r);
  function cls(prop, value) {
    const key = prop + ':' + value;
    let c = classes.get(key);
    if (!c) { c = cname(); classes.set(key, c); addRule('.' + c + '{' + key + '}'); }
    return c;
  }
  const dynClasses = new Map();   // prop -> class reading the custom property --prop
  function dynCls(prop) {
    let c = dynClasses.get(prop);
    if (!c) { c = cname(); dynClasses.set(prop, c); addRule('.' + c + '{' + prop + ':var(--' + prop + ')}'); }
    return c;
  }
  const stateClasses = new Map();
  function stateCls(selector, prop, value) {   // selector: '.X:hover' with X replaced by the class name
    const key = selector + '|' + prop + ':' + value;
    let c = stateClasses.get(key);
    if (!c) { c = cname(); stateClasses.set(key, c); addRule(selector.replace(/\bX\b/g, '.' + c) + '{' + prop + ':' + value + '}'); }
    return c;
  }

  // ---------------------------------------------------------------- value helpers
  const r3 = (v) => (Math.round(v * 1000) / 1000);
  const px = (v) => r3(v) + 'px';
  const color = (c, a = 255) => {
    if (c === -3) return 'currentcolor';
    if (a >= 255) return hex6(c);
    return 'rgba(' + (c >>> 16 & 255) + ',' + (c >>> 8 & 255) + ',' + (c & 255) + ',' + r3(Math.max(0, a) / 255) + ')';
  };
  const JUSTIFY = ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'];
  const ALIGN = ['flex-start', 'center', 'flex-end', 'stretch', 'baseline'];
  const ACONTENT = ['flex-start', 'center', 'flex-end', 'stretch', 'space-between', 'space-around', 'space-evenly'];
  const WEIGHT_NAME = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
  const loaded = new Set(CFG.fonts || []);
  function familyOf(n) {
    const w = n.weight > 0 ? n.weight : n.bold ? 700 : 400;
    const one = (f) => {
      f = f.trim();
      if (f === 'sans' || f === 'sans-bold') return ['var(--zn-sans)', w];
      if (f === 'mono') return ['var(--zn-mono)', w];
      if (f === 'serif') return ['var(--zn-serif)', w];
      const wn = WEIGHT_NAME[Math.round(w / 100) * 100];
      if (wn && loaded.has(f + '-' + wn)) return ['"' + f + '-' + wn + '",var(--zn-sans)', 400];
      if (loaded.has(f)) return ['"' + f + '",var(--zn-sans)', w];
      return ['"' + f + '",var(--zn-sans)', w];
    };
    const parts = n.family.split(',').map(one);
    return [parts.map((p) => p[0]).join(','), parts[0][1]];
  }

  // ---------------------------------------------------------------- the style of a node: a flat list of [property, value] pairs
  let K = [], V = [], cnt = 0, bands = '';
  const d = (k, v) => { K[cnt] = k; V[cnt] = v; cnt++; };
  const BAND = [[0, 1], [-1, 0], [0, -1], [1, 0]];   // the inset shadow that draws the top, right, bottom and left border
  function insetsOf(n) {   // the border widths that take no layout room in zinc:ui (they are drawn inside the padding), and the padding that is left for CSS
    const bw = n.borderW < 0 ? 1 : n.borderW, b = n.bd;
    return [b.bT >= 0 ? b.bT : bw, b.bR >= 0 ? b.bR : bw, b.bB >= 0 ? b.bB : bw, b.bL >= 0 ? b.bL : bw];
  }
  function gradientCss(n) {
    const g = n.gx;
    const stops = [];
    const rgb = (c, a) => (c === -1 ? 'transparent' : color(c === -3 ? 0 : c, a));
    if (g.cols.length > 0) {
      for (let i = 0; i < g.cols.length; i++) {
        const pos = g.unit[i] === 0 ? '' : g.unit[i] === 2 ? ' ' + px(g.pos[i]) : ' ' + r3(g.pos[i] * 100) + '%';
        stops.push(rgb(g.cols[i], g.alphas[i]) + pos);
      }
    } else {
      stops.push(rgb(n.gradFrom, g.fromA) + ' ' + r3(g.fromP * 100) + '%');
      if (g.via !== -2) stops.push(rgb(g.via, g.viaA) + ' ' + r3(g.viaP * 100) + '%');
      stops.push(rgb(n.gradTo, g.toA) + ' ' + r3(g.toP * 100) + '%');
    }
    const rep = g.repeat ? 'repeating-' : '';
    if (g.kind === 0 || g.kind === 1) {
      let ang = g.kind === 0 ? (n.grad === 1 ? 180 : n.grad === 2 ? 90 : n.grad === 3 ? 0 : 270) : g.angle;
      if (g.corner > 0) return rep + 'linear-gradient(to ' + ['', 'top right', 'bottom right', 'bottom left', 'top left'][g.corner] + ',' + stops.join(',') + ')';
      return rep + 'linear-gradient(' + r3(ang) + 'deg,' + stops.join(',') + ')';
    }
    const at = (g.cxPx ? px(g.cx) : r3(g.cx * 100) + '%') + ' ' + (g.cyPx ? px(g.cy) : r3(g.cy * 100) + '%');
    if (g.kind === 2) {
      const ext = ['closest-side', 'closest-corner', 'farthest-side', 'farthest-corner'][g.extent];
      const size = g.extent === 4 ? (g.circle ? px(g.rx) : (g.rxPct ? r3(g.rx * 100) + '%' : px(g.rx)) + ' ' + (g.ryPct ? r3(g.ry * 100) + '%' : px(g.ry))) : ext;
      return rep + 'radial-gradient(' + (g.circle ? 'circle ' : 'ellipse ') + size + ' at ' + at + ',' + stops.join(',') + ')';
    }
    return rep + 'conic-gradient(from ' + r3(g.angle) + 'deg at ' + at + ',' + stops.join(',') + ')';
  }
  function shadowCss(n) {
    const out = bands ? [bands] : [];
    const rg = n.rg;
    if (rg.ringW > 0) out.push('0 0 0 ' + px(rg.ringO + rg.ringW) + ' ' + (rg.ringC >= 0 ? hex6(rg.ringC) : '#3b82f6'));
    if (n.shadowLevel > 0) { const L = n.shadowLevel; out.push('0 ' + px([0, 1, 1, 4, 10, 20][L]) + ' ' + px([0, 2, 3, 6, 15, 25][L]) + ' rgba(0,0,0,' + [0, 0.2, 0.3, 0.4, 0.45, 0.5][L] + ')'); }
    if (n.shOpacity > 0) out.push(px(n.shX) + ' ' + px(n.shY) + ' ' + px(n.shBlur) + ' ' + color(n.shColor, Math.round(Math.min(1, n.shOpacity) * 255)));
    return out.join(',');
  }
  /** The declarations of node n (parent par) into K/V. */
  function build(n, par, h, row) {
    cnt = 0;
    const tag = n.tag;
    if (n.hidden) { d('display', 'none'); return; }
    if (n.contents) { d('display', 'contents'); return; }
    const isRoot = h === ui.inspectRoot();
    const text = tag === TEXT, field = tag === INPUT || tag === TEXTAREA, replaced = tag === IMAGE || tag === CANVAS || field;
    const container = !text && !replaced;
    const parRow = par !== null && par.row;
    const [bt, br, bb, bl] = insetsOf(n);
    const hasBorder = bt > 0 || br > 0 || bb > 0 || bl > 0;
    // --- flex container
    if (container) {
      if (n.row) d('flex-direction', n.reverse ? 'row-reverse' : 'row'); else if (n.reverse) d('flex-direction', 'column-reverse');
      if (n.wrap) d('flex-wrap', n.wrapRev ? 'wrap-reverse' : 'wrap');
      if (n.justify !== 0) d('justify-content', JUSTIFY[n.justify]);
      if (n.align !== 3) d('align-items', ALIGN[n.align]);
      if (n.alignContent >= 0 && n.wrap) d('align-content', ACONTENT[n.alignContent]);
      if (n.gap > 0 || n.gapX >= 0 || n.gapY >= 0) {
        const gx = n.gapX >= 0 ? n.gapX : n.gap, gy = n.gapY >= 0 ? n.gapY : n.gap;
        if (gx === gy) d('gap', px(gx)); else { d('column-gap', px(gx)); d('row-gap', px(gy)); }
      }
    }
    // --- as a flex item
    const grow = n.grow > 0 ? n.grow : 0;
    if (!isRoot && !row) {
      const fullMain = par !== null && (parRow ? n.fullW : n.fullH);
      if (grow > 0 || fullMain) d('flex-grow', String(grow > 0 ? grow : 1));
      // zinc:ui measures every child for the width it is offered, so content that can wrap never makes a row wider than its room, and nothing is squeezed on the column axis. CSS sizes an
      // auto-width item by its unwrapped content: such an item in a row may shrink (it wraps or clips), one with a size of its own does not.
      if (n.shrink > 0) d('flex-shrink', String(n.shrink));
      else if (n.shrink < 0 && parRow && !replaced && n.w < 0 && n.wFrac === 0 && n.basis < 0 && n.basisFrac <= 0) d('flex-shrink', '1');
      if (n.basis >= 0) d('flex-basis', px(n.basis)); else if (n.basisFrac > 0) d('flex-basis', r3(n.basisFrac * 100) + '%'); else if (fullMain && grow === 0) d('flex-basis', '0px');
      if (n.basis === 0 || (fullMain && grow === 0 && n.basis < 0)) d(parRow ? 'min-width' : 'min-height', '0px');   // an item that starts from nothing takes its share, however much it holds
      if (n.order !== 0) d('order', String(n.order));
      if (n.selfAlign >= 0) d('align-self', ALIGN[n.selfAlign]);
      else if (par !== null && (parRow ? n.fullH : n.fullW) && par.align !== 3) d('align-self', 'stretch');
      const m = n.mAuto;
      if (m & 1) d('margin-left', 'auto'); else if (n.ml) d('margin-left', px(n.ml));
      if (m & 2) d('margin-right', 'auto'); else if (n.mr) d('margin-right', px(n.mr));
      if (m & 4) d('margin-top', 'auto'); else if (n.mt) d('margin-top', px(n.mt));
      if (m & 8) d('margin-bottom', 'auto'); else if (n.mb) d('margin-bottom', px(n.mb));
    }
    // --- size
    if (isRoot) { d('width', '100%'); d('height', '100%'); }
    else {
      const stretchW = par !== null && !parRow && (par.align === 3 && n.selfAlign < 0 || n.selfAlign === 3);   // a column's cross axis stretches a child with no width
      const stretchH = par !== null && parRow && (par.align === 3 && n.selfAlign < 0 || n.selfAlign === 3);
      if (n.w >= 0) d('width', px(n.w)); else if (n.wFrac > 0) d('width', r3(n.wFrac * 100) + '%');
      else if (n.fullW && !(par !== null && parRow)) { if (!n.abs) d('align-self', 'stretch'); else d('width', '100%'); }
      else if (field && !stretchW && !n.fullW) d('width', px(200 + n.pl + n.pr));
      else if (tag === IMAGE && n.img >= 0 && !stretchW && !n.fullW && n.h < 0) d('width', px(Z.imageSize(n.img)[0]));
      if (n.h >= 0) d('height', px(n.h)); else if (n.hFrac > 0) d('height', r3(n.hFrac * 100) + '%');
      else if (n.fullH && !(par !== null && !parRow)) { if (n.abs) d('height', '100%'); }
      else if (field && !n.ed.multi) d('height', px(lineHeight(n) + n.pt + n.pb));
      else if (field) d('height', px(n.ed.rows * lineHeight(n) + n.pt + n.pb));
      else if (tag === IMAGE && n.img >= 0 && !stretchH && !n.fullH && n.w < 0) d('height', px(Z.imageSize(n.img)[1]));
      else if (tag === IMAGE && n.img >= 0 && n.w >= 0) d('height', 'auto');
      if (n.minW >= 0) d('min-width', px(n.minW));
      if (n.maxW >= 0) d('max-width', px(n.maxW));
      if (n.minH >= 0) d('min-height', px(n.minH));
      if (n.maxH >= 0) d('max-height', px(n.maxH));
      if (n.aspect > 0) d('aspect-ratio', String(r3(n.aspect)));
    }
    if (n.contentBox) d('box-sizing', 'content-box');
    // --- position
    if (n.abs && !row) {
      d('position', 'absolute');
      const pb = par !== null ? insetsOf(par) : [0, 0, 0, 0];   // CSS measures from the padding edge; zinc:ui from the border edge
      const inner = n.left === UNSET && n.right === UNSET && n.top === UNSET && n.bottom === UNSET;
      if (n.left !== UNSET) d('left', px(n.left - pb[3])); else if (n.right === UNSET && par !== null) d('left', px(par.pl - pb[3]));
      if (n.right !== UNSET) d('right', px(n.right - pb[1]));
      if (n.top !== UNSET) d('top', px(n.top - pb[0])); else if (n.bottom === UNSET && par !== null) d('top', px(par.pt - pb[0]));
      if (n.bottom !== UNSET) d('bottom', px(n.bottom - pb[2]));
      void inner;
    } else if (n.sticky) {
      d('position', 'sticky');
      if (n.top !== UNSET) d('top', px(n.top)); if (n.bottom !== UNSET) d('bottom', px(n.bottom)); if (n.left !== UNSET) d('left', px(n.left)); if (n.right !== UNSET) d('right', px(n.right));
    } else if (n.stat) d('position', 'static');
    else if (!row && (n.rel || n.top !== UNSET || n.left !== UNSET || n.right !== UNSET || n.bottom !== UNSET)) {   // (a row of a virtual list is laid out by the spacers, not by its top)
      if (n.left !== UNSET) d('left', px(n.left)); else if (n.right !== UNSET) d('left', px(-n.right));
      if (n.top !== UNSET) d('top', px(n.top)); else if (n.bottom !== UNSET) d('top', px(-n.bottom));
    }
    if (n.z !== 0) d('z-index', String(n.z));
    // --- padding and border. zinc:ui draws a border inside the padding and gives it no room; CSS gives it room. A side whose padding is as wide as its border gets the real
    // border and the padding that is left (the content stays where zinc:ui puts it); a side with less padding than border is drawn as an inset shadow band, which takes no room.
    const W4 = [bt, br, bb, bl], P4 = [n.pt, n.pr, n.pb, n.pl], real = [false, false, false, false];
    const bc = n.borderColor, ba = n.borderAlpha, bx = n.bd, C4 = [bx.bcT >= 0 ? bx.bcT : bc, bx.bcR >= 0 ? bx.bcR : bc, bx.bcB >= 0 ? bx.bcB : bc, bx.bcL >= 0 ? bx.bcL : bc];
    bands = '';
    for (let i = 0; i < 4; i++) {
      if (W4[i] <= 0) continue;
      if (P4[i] >= W4[i]) real[i] = true;
      else { const o = BAND[i]; bands += (bands ? ',' : '') + 'inset ' + px(o[0] * W4[i]) + ' ' + px(o[1] * W4[i]) + ' 0 0 ' + color(C4[i], ba); }
    }
    {
      const pt = real[0] ? P4[0] - bt : P4[0], pr = real[1] ? P4[1] - br : P4[1], pb2 = real[2] ? P4[2] - bb : P4[2], pl = real[3] ? P4[3] - bl : P4[3];
      if (pt) d('padding-top', px(pt)); if (pr) d('padding-right', px(pr)); if (pb2) d('padding-bottom', px(pb2)); if (pl) d('padding-left', px(pl));
    }
    if (real[0] || real[1] || real[2] || real[3]) {
      d('border-style', ['solid', 'dashed', 'dotted'][bx.borderStyle] || 'solid');
      if (real[0] && real[1] && real[2] && real[3] && bt === br && br === bb && bb === bl) d('border-width', px(bt));
      else { d('border-top-width', px(real[0] ? bt : 0)); d('border-right-width', px(real[1] ? br : 0)); d('border-bottom-width', px(real[2] ? bb : 0)); d('border-left-width', px(real[3] ? bl : 0)); }
      if (C4[0] === C4[1] && C4[1] === C4[2] && C4[2] === C4[3]) d('border-color', color(C4[0], ba));
      else { d('border-top-color', color(C4[0], ba)); d('border-right-color', color(C4[1], ba)); d('border-bottom-color', color(C4[2], ba)); d('border-left-color', color(C4[3], ba)); }
    }
    if (n.radius > 0) d('border-radius', px(n.radius));
    const b2 = n.bd;
    if (b2.crTL >= 0) d('border-top-left-radius', px(b2.crTL)); if (b2.crTR >= 0) d('border-top-right-radius', px(b2.crTR));
    if (b2.crBR >= 0) d('border-bottom-right-radius', px(b2.crBR)); if (b2.crBL >= 0) d('border-bottom-left-radius', px(b2.crBL));
    // --- background, shadow, opacity, transform
    const grad = n.grad > 0 || n.gx.kind > 0;
    if (grad) d('background-image', gradientCss(n));
    if (n.bg >= 0 && (!grad || n.gradFrom === -1 || n.gx.fromA < 255)) d('background-color', color(n.bg, n.bgAlpha));
    if (n.im.bg >= 0) {
      const url = Z.imageUrl(n.im.bg);
      if (url) {
        d('background-image', (grad ? gradientCss(n) + ',' : '') + 'url("' + url + '")');
        const m = n.im;
        d('background-size', m.size === 1 ? 'cover' : m.size === 2 ? 'contain' : (m.sw < 0 ? 'auto' : m.swPct ? r3(m.sw * 100) + '%' : px(m.sw)) + ' ' + (m.sh < 0 ? 'auto' : m.shPct ? r3(m.sh * 100) + '%' : px(m.sh)));
        d('background-position', (m.bxPx ? px(m.bx) : r3(m.bx * 100) + '%') + ' ' + (m.byPx ? px(m.by) : r3(m.by * 100) + '%'));
        d('background-repeat', ['no-repeat', 'repeat', 'space', 'round'][m.rx] + ' ' + ['no-repeat', 'repeat', 'space', 'round'][m.ry]);
      }
    }
    const sh = shadowCss(n);
    if (sh) d('box-shadow', sh);
    if (n.rg.outW > 0) { d('outline', px(n.rg.outW) + ' solid ' + (n.rg.outC >= 0 ? hex6(n.rg.outC) : '#000')); d('outline-offset', px(n.rg.outO)); }
    if (n.rg.outNone) d('outline', 'none');
    const op = n.opacity * (n.fade === undefined ? 1 : n.fade);
    if (op < 1) d('opacity', String(r3(op)));
    if (n.tx || n.ty || n.k !== 1 || n.tf !== null) {
      let t = '';
      if (n.tx || n.ty) t += 'translate(' + px(n.tx) + ',' + px(n.ty) + ')';
      const tf = n.tf;
      if (tf) {
        if (tf.rot) t += ' rotate(' + r3(tf.rot) + 'deg)';
        if (tf.sx !== 1 || tf.sy !== 1 || n.k !== 1) t += ' scale(' + r3(tf.sx * n.k) + ',' + r3(tf.sy * n.k) + ')';
        if (tf.skX || tf.skY) t += ' skew(' + r3(tf.skX) + 'deg,' + r3(tf.skY) + 'deg)';
      } else if (n.k !== 1) t += ' scale(' + r3(n.k) + ')';
      d('transform', t.trim());
    }
    // --- overflow and scrolling
    if (n.scroll !== 0) {
      d('overflow-y', n.scroll & 1 ? 'auto' : 'hidden'); d('overflow-x', n.scroll & 2 ? 'auto' : 'hidden');
      const s = n.sn;
      if (s.snap) d('scroll-snap-type', (s.snap === 3 ? 'both' : s.snap === 1 ? 'y' : 'x') + (s.snapProx ? ' proximity' : ' mandatory'));
      if (s.spt || s.spb || s.spl || s.spr) d('scroll-padding', px(s.spt) + ' ' + px(s.spr) + ' ' + px(s.spb) + ' ' + px(s.spl));
    } else if (n.overflow) d('overflow', 'hidden');
    if (par !== null && par.sn.snap && n.sn.snapAlign) d('scroll-snap-align', ['', 'start', 'center', 'end'][n.sn.snapAlign]);
    if (n.invisible) d('visibility', 'hidden');
    // zinc:ui hits only nodes that take events: a plain box over others (an overlay root, a decoration) lets the pointer through. CSS would stop it at every box.
    if (n.noPointer) d('pointer-events', 'none');
    if (n.selectable) { d('user-select', 'text'); d('-webkit-user-select', 'text'); }
    if (n.cursor >= 0) d('cursor', ['default', 'text', 'pointer', 'move', 'ew-resize', 'ns-resize', 'crosshair', 'grab', 'grabbing', 'not-allowed'][n.cursor] || 'default');
    if (n.it.transMs > 0) d('transition', 'all ' + n.it.transMs + 'ms ' + ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'ease', 'ease-in', 'ease-out', 'ease-in-out'][n.it.transEase] || 'ease');
    // --- text
    if (n.fg >= 0) d('color', color(n.fg, n.fgAlpha));
    if (text || field) {
      d('font-size', px(n.size));
      d('line-height', px(lineHeight(n)));
      const [fam, wt] = familyOf(n);
      if (fam !== 'var(--zn-sans)') d('font-family', fam);
      if (wt !== 400) d('font-weight', String(wt));
      if (n.italic) d('font-style', 'italic');
      const ls = n.letterSpace !== UNSET ? n.letterSpace : n.tracking * n.size;
      if (ls) d('letter-spacing', px(ls));
      if (n.wordSp) d('word-spacing', px(n.wordSp));
      if (n.talign) d('text-align', ['start', 'center', 'end', 'justify'][n.talign]);
      if (n.transform) d('text-transform', ['none', 'uppercase', 'lowercase', 'capitalize'][n.transform]);
      if (n.deco) d('text-decoration', ((n.deco & 1 ? 'underline ' : '') + (n.deco & 2 ? 'line-through ' : '') + (n.deco & 4 ? 'overline' : '')).trim());
      if (n.ws === 1) d('white-space', 'nowrap'); else if (n.ws === 2) d('white-space', 'pre'); else if (n.ws === 3) d('white-space', 'pre-wrap');
      if (n.brk === 1) d('overflow-wrap', 'anywhere'); else if (n.brk === 2) d('word-break', 'break-all');
      if (n.balance) d('text-wrap', 'balance');
      if (n.tsAlpha > 0) d('text-shadow', px(n.tsX) + ' ' + px(n.tsY) + ' 0 ' + color(n.tsColor >= 0 ? n.tsColor : 0, n.tsAlpha));
      if (n.vshift) d('top', px(n.vshift * n.size));
      if (text && n.clamp > 0 && n.clamp !== 1) { d('display', '-webkit-box'); d('-webkit-box-orient', 'vertical'); d('-webkit-line-clamp', String(n.clamp)); d('overflow', 'hidden'); }
      else if (text && n.ellipsis) { d('overflow', 'hidden'); d('text-overflow', 'ellipsis'); d('white-space', 'nowrap'); }
    }
    if (tag === IMAGE) {
      const m = n.im;
      if (m.fit) d('object-fit', ['fill', 'contain', 'cover', 'none', 'scale-down', 'none'][m.fit]);
      if (m.fit && (m.ox !== 0.5 || m.oy !== 0.5)) d('object-position', (m.oxPx ? px(m.ox) : r3(m.ox * 100) + '%') + ' ' + (m.oyPx ? px(m.oy) : r3(m.oy * 100) + '%'));
    }
  }
  /** A node the pointer can land on: it has a handler, scrolls, takes the focus, has hover or focus looks, or selects text. */
  function interactive(n) {
    if (n.onClick !== null || n.hs !== null || n.ed !== null || n.scroll !== 0 || n.focusable || n.ov !== null || n.group || n.peer || n.selectable || n.virt !== null || n.tag === BUTTON) return true;
    const it = n.it;
    return it.hoverBg >= 0 || it.hoverFg >= 0 || it.hoverBorder >= 0 || it.focusBg >= 0 || it.activeBg >= 0 || it.withinBg >= 0 || it.focusBorder >= 0 || n.attrK.length > 0 && attrOf(n, 'href') !== '';
  }
  function lineHeight(n) { return n.leading > 0 ? n.leading : Math.round(n.size * 1.4); }

  /** The rules of the paint states of n (hover:, focus:, active:, disabled:, group-, peer- and attribute variants) as classes. */
  const SELECT = ['X:hover', 'X:focus', 'X:active', 'X:disabled,X[aria-disabled="true"]', '.zg:hover X', '.zg:focus-within X', '.zg:active X', '.zp:hover~X', '.zp:focus-within~X', '.zp:active~X'];
  function stateClassesOf(n, out) {
    const o = n.ov;
    if (o !== null) {
      for (let st = 0; st < o.s.length; st++) {
        const s = o.s[st];
        if (!s) continue;
        let sel;
        if (st < 10) sel = SELECT[st];
        else { const slot = ui.domAttrSlots()[st - 10]; if (!slot) continue; const [k, v] = slot.split('='); sel = 'X[' + k + '="' + v + '"]'; }
        const m = s.mask;
        const add = (p, v) => out.push(stateCls(sel, p, v));
        if (m & 1) add('opacity', String(r3(s.opacity)));
        if (m & 6) add('transform', 'translate(' + px(s.tx) + ',' + px(s.ty) + ')');
        if (m & 16) { const L = s.shadow; add('box-shadow', L > 0 ? '0 ' + px([0, 1, 1, 4, 10, 20][L]) + ' ' + px([0, 2, 3, 6, 15, 25][L]) + ' rgba(0,0,0,' + [0, 0.2, 0.3, 0.4, 0.45, 0.5][L] + ')' : 'none'); }
        if (m & 32) add('background-color', s.bg >= 0 ? color(s.bg, s.bgAlpha) : 'transparent');
        if (m & 64) add('color', color(s.fg, s.fgAlpha));
        if (m & 128) add('border-color', color(s.bc, s.bcAlpha));
        if (m & 256) add('border-radius', px(s.radius));
      }
    }
    const it = n.it;
    if (it.hoverBg >= 0) out.push(stateCls('X:hover', 'background-color', color(it.hoverBg)));
    if (it.hoverFg >= 0) out.push(stateCls('X:hover,X:hover *', 'color', color(it.hoverFg)));
    if (it.hoverBorder >= 0) out.push(stateCls('X:hover', 'border-color', color(it.hoverBorder)));
    if (it.focusBg >= 0) out.push(stateCls('X:focus', 'background-color', color(it.focusBg)));
    if (it.focusFg >= 0) out.push(stateCls('X:focus,X:focus *', 'color', color(it.focusFg)));
    if (it.focusBorder >= 0) out.push(stateCls('X:focus', 'border-color', color(it.focusBorder)));
    if (it.activeBg >= 0) out.push(stateCls('X:active', 'background-color', color(it.activeBg)));
    if (it.activeFg >= 0) out.push(stateCls('X:active,X:active *', 'color', color(it.activeFg)));
    if (it.withinBg >= 0) out.push(stateCls('X:focus-within', 'background-color', color(it.withinBg)));
    if (it.withinFg >= 0) out.push(stateCls('X:focus-within,X:focus-within *', 'color', color(it.withinFg)));
    if (it.withinBorder >= 0) out.push(stateCls('X:focus-within', 'border-color', color(it.withinBorder)));
    const rg = n.rg;
    if (rg.fRingW >= 0 || rg.fOutW >= 0) {
      const sel = rg.fVisible ? 'X:focus-visible' : 'X:focus';
      if (rg.fRingW >= 0) out.push(stateCls(sel, 'box-shadow', '0 0 0 ' + px(rg.fRingO + rg.fRingW) + ' ' + (rg.fRingC >= 0 ? hex6(rg.fRingC) : rg.ringC >= 0 ? hex6(rg.ringC) : '#3b82f6')));
      if (rg.fOutW >= 0) out.push(stateCls(sel, 'outline', px(rg.fOutW) + ' solid ' + (rg.fOutC >= 0 ? hex6(rg.fOutC) : '#000')));
    }
  }

  // ---------------------------------------------------------------- the elements
  const HINT_TAGS = new Set(['div', 'span', 'section', 'article', 'nav', 'main', 'header', 'footer', 'aside', 'ul', 'ol', 'li', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button', 'label',
    'form', 'fieldset', 'legend', 'figure', 'figcaption', 'blockquote', 'pre', 'code', 'time', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'details', 'summary', 'address', 'dl', 'dt', 'dd', 'menu', 'output', 'em', 'strong', 'small', 'mark']);
  const ROLE_TAG = { navigation: 'nav', main: 'main', banner: 'header', contentinfo: 'footer', complementary: 'aside', region: 'section', form: 'form', list: 'ul', listitem: 'li', article: 'article', paragraph: 'p', link: 'a', button: 'button', search: 'search' };
  const NATIVE_ROLES = new Set(['nav', 'main', 'header', 'footer', 'aside', 'section', 'form', 'ul', 'li', 'article', 'p', 'a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  const attrOf = (n, k) => { const i = n.attrK.indexOf(k); return i < 0 ? '' : n.attrV[i]; };
  const HINT_ATTRS = new Set(['as', 'href', 'target', 'rel', 'download', 'name', 'for', 'autoComplete', 'required', 'pattern', 'minLength', 'maxLength', 'min', 'max', 'step', 'enterKeyHint',
    'title', 'alt', 'lang', 'dir', 'method', 'action', 'autoCapitalize', 'spellCheck', 'autoCorrect', 'multiple', 'accept', 'form', 'autoFocus', 'type']);
  function hasInteractive(h, n) {
    for (const c of n.children) {
      const k = ui.inspectNode(c);
      if (!k) continue;
      if (k.onClick !== null || k.ed !== null || k.tag === BUTTON || attrOf(k, 'href') !== '' || hasInteractive(c, k)) return true;
    }
    return false;
  }
  function tagFor(n, h) {
    const as = attrOf(n, 'as');
    if (n.tag === INPUT) return 'input';
    if (n.tag === TEXTAREA) return 'textarea';
    if (n.tag === IMAGE) return n.surface ? 'canvas' : 'img';
    if (n.tag === CANVAS) return 'div';   // a box that holds a <canvas> or an inline <svg> (see drawNode)
    if (as && HINT_TAGS.has(as)) return as;
    const role = n.role;
    if (role === 'heading') { const lv = parseInt(attrOf(n, 'aria-level')) || 2; return 'h' + Math.max(1, Math.min(6, lv)); }
    if (attrOf(n, 'href') !== '') return 'a';
    if (ROLE_TAG[role]) return ROLE_TAG[role];
    if (n.tag === TEXT) return role === 'label' ? 'label' : 'span';
    if (n.tag === BUTTON) return 'button';
    if (n.onClick !== null && (n.tag === VIEW || n.tag === SCROLL) && !hasInteractive(h, n)) return 'button';
    return 'div';
  }
  const E = [];   // handle -> state { el, tag, kids, pv, pk, dyn, cls, ... }
  let gen = 0, changed = 0;
  function make(tag, n) {
    const el = document.createElement(tag);
    return el;
  }
  const hOf = (el) => { for (let e = el; e && e !== root; e = e.parentNode) if (e._h !== undefined) return e._h; return -1; };

  /** Brings the element of node h up to date and returns it (null when the node is gone). */
  function sync(h, par, row, layerRoot) {
    const n = ui.inspectNode(h);
    if (!n) return null;
    let st = E[h];
    const tag = tagFor(n, h);
    if (!st || st.tag !== tag || st.node !== n) {   // (a handle is reused for another node after the first is released: the object tells them apart)
      if (st && st.el.parentNode) st.el.remove();
      let el = pre ? adopt.get(h) : undefined;
      if (el && el.tagName.toLowerCase() === tag) { adopt.delete(h); el.removeAttribute('data-z'); } else el = document.createElement(tag);
      if (capture) el.setAttribute('data-z', h);
      el._h = h;
      st = E[h] = { el, tag, node: n, dyn: new Set(), vars: null, cls: '', attrs: {}, text: undefined, sx: 0, sy: 0, K: [], V: [], n: -1, scrolls: false };
      changed++;
    }
    const el = st.el;
    // ---- style: the declarations are compared with the last ones; a property whose value changed after the element exists becomes dynamic (a custom property of the element,
    // read by one shared class), so an animation writes one value per frame and never makes a class per step
    K.length = 0; V.length = 0;
    build(n, par, h, row);
    let same = cnt === st.n;
    for (let i = 0; same && i < cnt; i++) same = K[i] === st.K[i] && V[i] === st.V[i];
    const it = n.it, states = n.ov !== null || it.hoverBg >= 0 || it.hoverFg >= 0 || it.hoverBorder >= 0 || it.focusBg >= 0 || it.focusFg >= 0 || it.focusBorder >= 0 || it.activeBg >= 0 || it.activeFg >= 0 || it.withinBg >= 0 || it.withinFg >= 0 || it.withinBorder >= 0 || n.rg.fRingW >= 0 || n.rg.fOutW >= 0;
    if (!same || states || st.states) {
      const dyn = st.dyn, list = [];
      if (!same && st.n >= 0) for (let i = 0; i < cnt; i++) { const j = st.K.indexOf(K[i]); if (j >= 0 && st.V[j] !== V[i]) dyn.add(K[i]); }
      for (let i = 0; i < cnt; i++) {
        const k = K[i], v = V[i];
        if (dyn.has(k)) {
          list.push(dynCls(k));
          if (st.vars === null) st.vars = {};
          if (st.vars[k] !== v) { st.vars[k] = v; el.style.setProperty('--' + k, v); }
        } else list.push(cls(k, v));
      }
      if (st.vars !== null) for (const k of Object.keys(st.vars)) if (st.vars[k] !== undefined && !K.slice(0, cnt).includes(k)) { st.vars[k] = undefined; el.style.removeProperty('--' + k); }
      if (states) stateClassesOf(n, list);
      st.states = states;
      st.K = K.slice(0, cnt); st.V = V.slice(0, cnt); st.n = cnt;
      st.list = list;
    }
    const list = st.list || [];
    const base = tag === 'canvas' || tag === 'img' || tag === 'input' || tag === 'textarea' ? (n.tag === INPUT || n.tag === TEXTAREA ? 'zr zi' : 'zr') : n.tag === TEXT ? 'zt' : 'z';
    let c = base + (n.tag === SCROLL || n.scroll ? ' zs' : '') + (base === 'z' && interactive(n) ? ' zk' : '') + (n.group ? ' zg' : '') + (n.peer ? ' zp' : '') + (n.rg.outNone ? ' zn-ring-none' : '') + (n.hs !== null && (n.hs.drag !== null || n.hs.down !== null || n.hs.pinch !== null) ? ' zdrag' : '');
    if (list.length) c += ' ' + list.join(' ');
    if (c !== st.cls) { st.cls = c; el.className = c; changed++; }
    if (n.scroll !== 0 && !st.scrolls) { st.scrolls = true; liveScrollers.add(h); st.sx = n.sx; st.sy = n.sy; if (n.sx || n.sy) pendingScroll.push(h); }
    if (n.virt !== null && !st.vro) { st.vro = true; vro.observe(el); }
    attrs(st, el, n, h, tag);
    content(st, el, n, h, tag, par);
    return el;
  }
  const pendingScroll = [];
  // a virtual list builds the rows its viewport shows: the viewport is the browser's, measured here
  const vro = new ResizeObserver((entries) => { for (const e of entries) if (e.target._h !== undefined && ui) ui.domViewport(e.target._h, e.target.clientHeight); });
  function setAttr(st, el, k, v) {
    if (v === null || v === undefined || v === false) { if (st.attrs[k] !== undefined) { el.removeAttribute(k); st.attrs[k] = undefined; } return; }
    const s = v === true ? '' : String(v);
    if (st.attrs[k] !== s) { st.attrs[k] = s; el.setAttribute(k, s); }
  }
  function attrs(st, el, n, h, tag) {
    const A = (k, v) => setAttr(st, el, k, v);
    const role = n.role, native = NATIVE_ROLES.has(tag);
    const dis = ui.isDisabled(h);
    // role: only where the element does not already say it
    if (role && !native && !(role === 'heading' && /^h\d$/.test(tag)) && !(tag === 'a' && role === 'link') && !(tag === 'li' && role === 'listitem')) A('role', role);
    else if (!role && n.onClick !== null && tag === 'div') A('role', 'button');
    else A('role', null);
    const lab = n.label;
    if (n.tag === IMAGE) A('alt', lab || attrOf(n, 'alt'));
    else if (lab && !(n.tag === TEXT && lab === n.text)) A('aria-label', lab); else A('aria-label', null);
    A('aria-hidden', n.ariaHidden ? 'true' : null);
    for (let i = 0; i < n.attrK.length; i++) {
      const k = n.attrK[i];
      if (k.startsWith('aria-') || k.startsWith('data-')) A(k, n.attrV[i]);
    }
    A('aria-disabled', dis && tag !== 'button' && tag !== 'input' && tag !== 'textarea' ? 'true' : null);
    A('disabled', dis && (tag === 'button' || tag === 'input' || tag === 'textarea') ? '' : null);
    // tab order: native elements are focusable already; a div that takes the focus gets a tabindex
    const tabIndex = n.hs !== null ? n.hs.tabIndex : 0;
    const nativeFocus = tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'a' || tag === 'select';
    if (!dis && n.focusable && !nativeFocus) A('tabindex', String(tabIndex)); else if (tabIndex < 0 && nativeFocus) A('tabindex', '-1'); else if (!(n.scroll && !nativeFocus)) A('tabindex', null);
    if (n.scroll && !n.focusable && tag === 'div') A('tabindex', '0');   // a keyboard can scroll it (Page Up, arrows, Space)
    if (tag === 'button') A('type', attrOf(n, 'type') || 'button');
    if (tag === 'a') {
      A('href', attrOf(n, 'href')); A('target', attrOf(n, 'target') || null); A('rel', attrOf(n, 'rel') || (attrOf(n, 'target') === '_blank' ? 'noopener noreferrer' : null)); A('download', attrOf(n, 'download') || null);
    }
    if (tag === 'form') { A('novalidate', null); A('action', attrOf(n, 'action') || null); A('method', attrOf(n, 'method') || null); A('name', attrOf(n, 'name') || null); }
    if (tag === 'label') A('for', attrOf(n, 'for') || null);
    A('title', attrOf(n, 'title') || null);
    A('lang', attrOf(n, 'lang') || null);
    A('dir', attrOf(n, 'dir') || null);
    if (tag === 'img') { A('decoding', 'async'); A('draggable', 'false'); }
    if (n.ed !== null) fieldAttrs(st, el, n, h, tag);
    for (const k of HINT_ATTRS) void k;
  }
  const TYPE_OF_MODE = ['text', 'text', 'text', 'tel', 'email', 'url', 'search'];
  const MODE_NAME = ['', 'numeric', 'decimal', 'tel', 'email', 'url', 'search'];
  function fieldAttrs(st, el, n, h, tag) {
    const A = (k, v) => setAttr(st, el, k, v);
    const e = n.ed;
    if (tag === 'input') A('type', attrOf(n, 'type') || (e.password ? 'password' : TYPE_OF_MODE[n.inputMode] || 'text'));
    if (n.inputMode && !attrOf(n, 'type')) A('inputmode', MODE_NAME[n.inputMode]); else A('inputmode', null);
    A('placeholder', e.placeholder || null);
    A('readonly', e.readOnly ? '' : null);
    const traits = {};
    for (const part of (e.traits || '').split(' ')) { const i = part.indexOf('='); if (i > 0) traits[part.slice(0, i)] = part.slice(i + 1); }
    A('autocapitalize', traits.cap || attrOf(n, 'autoCapitalize') || null);
    A('autocorrect', traits.autocorrect === '0' || attrOf(n, 'autoCorrect') === 'false' ? 'off' : null);
    A('enterkeyhint', attrOf(n, 'enterKeyHint') || (traits.return && traits.return !== 'default' ? traits.return : null));
    A('autocomplete', attrOf(n, 'autoComplete') || traits.autofill || null);
    A('maxlength', attrOf(n, 'maxLength') || traits.maxlength || null);
    A('minlength', attrOf(n, 'minLength') || null);
    A('name', attrOf(n, 'name') || null);
    A('required', attrOf(n, 'required') === 'true' ? '' : null);
    A('pattern', attrOf(n, 'pattern') || null);
    A('min', attrOf(n, 'min') || null); A('max', attrOf(n, 'max') || null); A('step', attrOf(n, 'step') || null);
    A('spellcheck', attrOf(n, 'spellCheck') || (e.multi ? null : 'false'));
    if (tag === 'textarea') A('rows', String(e.rows));
    if (n.label === '' && !n.attrK.includes('aria-label') && !e.placeholder) A('aria-label', e.multi ? 'text' : 'text field');
    // the value: the program's, unless the browser holds a newer edit of the same
    if (!st.composing && el.value !== e.value) {
      el.value = e.value;
      if (document.activeElement === el) { try { el.setSelectionRange(Math.min(e.anchor, e.caret), Math.max(e.anchor, e.caret)); } catch { /* a type without selection */ } }
    }
  }
  function content(st, el, n, h, tag, par) {
    if (n.tag === TEXT) {
      const t = n.text;
      let kids = n.children;
      if (st.text !== t) { st.text = t; if (el.firstChild && el.firstChild.nodeType === 3 && el.childNodes.length === 1) el.firstChild.nodeValue = t; else { el.textContent = t; } changed++; }
      if (kids.length === 0) return;
    }
    if (tag === 'img') {
      let src = n.src ? assetUrl(n.src) : '';
      if (!src && n.img >= 0) src = Z.imageUrl(n.img);
      if (src && st.src !== src) { st.src = src; el.src = src; }
      return;
    }
    if (tag === 'canvas') { surfaceDraw(st, el, n); return; }
    if (tag === 'input' || tag === 'textarea') return;
    // children
    const want = [];
    if (n.tag === CANVAS || n.onDraw !== null) { want.push(drawNode(st, el, n, h)); }
    if (n.virt !== null) {
      const v = ui.domVirtual(h);
      if (!st.topSpacer) { st.topSpacer = document.createElement('div'); st.topSpacer.className = 'zv'; st.botSpacer = document.createElement('div'); st.botSpacer.className = 'zv'; }
      if (st.top !== v[2]) { st.top = v[2]; st.topSpacer.style.height = v[2] + 'px'; }
      if (st.bot !== v[3]) { st.bot = v[3]; st.botSpacer.style.height = v[3] + 'px'; }
      want.push(st.topSpacer);
      for (const rh of ui.domRows(h)) { const e = sync(rh, n, true, false); if (e) want.push(e); }
      want.push(st.botSpacer);
    } else childEls(n, h, want);
    reconcile(el, want);
  }
  /** The elements of the children of n (fragments flatten into n; layers live in the portal). */
  function childEls(n, h, want, par = n) {
    for (const c of n.children) {
      const k = ui.inspectNode(c);
      if (!k || k.layer || k.leaving) continue;
      if (k.tag === FRAGMENT) { childEls(k, c, want, par); continue; }
      const e = sync(c, par, false, false);
      if (e) want.push(e);
    }
  }
  function reconcile(el, want) {
    gen++;
    for (let i = 0; i < want.length; i++) want[i]._g = gen;
    let cur = el.firstChild, dirty = false;
    // remove what is no longer wanted
    while (cur) { const nx = cur.nextSibling; if (cur._g !== gen) { cur.remove(); dirty = true; } cur = nx; }
    cur = el.firstChild;
    for (let i = 0; i < want.length; i++) {
      const w = want[i];
      if (w === cur) { cur = cur.nextSibling; continue; }
      el.insertBefore(w, cur); dirty = true;
    }
    if (dirty) changed++;
  }

  // ---------------------------------------------------------------- what Zinc draws itself: canvases and inline SVG
  const drawn = new Set();
  const ro = new ResizeObserver((entries) => { for (const e of entries) if (e.target._st) { e.target._st.cw = -1; e.target._st.redraw = true; } });
  const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.target._st) { e.target._st.vis = e.isIntersecting; if (e.isIntersecting) e.target._st.redraw = true; } }, { rootMargin: '100px' });
  const pending = [];
  function drawNode(st, el, n, h) {
    if (!st.drawBox) {
      const box = document.createElement('div');
      box.className = 'zdb';
      box.setAttribute('aria-hidden', n.label ? null : 'true');
      box._st = st; st.drawBox = box; st.vis = true; st.redraw = true; st.cw = -1;
      ro.observe(box); io.observe(box);
    }
    pending.push([h, st]);
    return st.drawBox;
  }
  function runDraw(h, st) {
    const n = ui.inspectNode(h);
    if (!n || !n.onDraw) return;
    const box = st.drawBox;
    if (!st.vis) return;
    if (!st.redraw && n.lazy) return;
    if (st.cw < 0) { st.cw = box.clientWidth; st.ch = box.clientHeight; }
    const w = Math.round(st.cw), hh = Math.round(st.ch);
    if (w <= 0 || hh <= 0) return;
    // first, record: a node that only draws one SVG document becomes an inline <svg>
    if (st.mode !== 'canvas') {
      rec = [];
      mode = 'record';
      try { n.onDraw(0, 0, w, hh); } finally { mode = 'off'; }
      const r = rec; rec = null;
      if (r.length === 1 && r[0][0] === 'svg') {
        const [, doc, , , , , a] = r[0];
        if (st.mode !== 'svg') { box.textContent = ''; st.cv = null; st.mode = 'svg'; st.doc = null; }
        if (st.doc !== doc) {
          st.doc = doc; box.innerHTML = doc.text;
          const s = box.firstElementChild;
          if (s) { s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); if (!s.hasAttribute('viewBox')) s.setAttribute('viewBox', doc.vb.join(' ')); if (doc.none) s.setAttribute('preserveAspectRatio', 'none'); s.style.display = 'block'; s.style.overflow = 'hidden'; }
        }
        box.style.opacity = a < 255 ? String(a / 255) : '';
        st.redraw = false;
        return;
      }
      if (r.length === 0) { st.redraw = false; return; }
      st.mode = 'canvas';
    }
    if (!st.cv) { box.textContent = ''; st.cv = document.createElement('canvas'); box.appendChild(st.cv); }
    const k = dpr(), cv = st.cv;
    const pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(hh * k));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    mode = 'canvas';
    try { drawInto(cv, k, () => n.onDraw(0, 0, w, hh)); } finally { mode = 'off'; }
    st.redraw = false;
  }
  function surfaceDraw(st, el, n) {   // an Image node whose pixels the program fills (video frames, a WebGL present): a canvas that mirrors the runtime image
    const im = images[n.img];
    if (!im) return;
    const k = im.k || 1;
    if (el.width !== im.canvas.width || el.height !== im.canvas.height) { el.width = im.canvas.width; el.height = im.canvas.height; st.rev = -1; }
    if (st.rev !== (im.rev || 0) || (im.live && true)) { st.rev = im.rev || 0; el.getContext('2d').drawImage(im.canvas, 0, 0); }
    void k;
  }
  let mode = 'off', rec = null;
  // the painter the runtime's rows reach: nothing is painted by the rows; they only feed a Canvas node while it draws, and the images the program makes
  let imageDepth = 0;
  const painter = {};
  for (const k of Object.keys(canvasPainter)) {
    if (k === 'begin' || k === 'end' || k === 'clear' || k === 'keep' || k === 'resize') continue;
    painter[k] = (...a) => {
      if (k === 'beginImage') { imageDepth++; return canvasPainter.beginImage(...a); }
      if (k === 'endImage') { imageDepth = Math.max(0, imageDepth - 1); return canvasPainter.endImage(...a); }
      if (imageDepth > 0 || mode === 'canvas') return canvasPainter[k](...a);
      if (mode === 'record') { rec.push([k, ...a]); return undefined; }
      return undefined;
    };
  }
  let lastBg = -1;
  painter.begin = () => {};
  painter.end = () => {};
  painter.keep = () => {};
  painter.resize = () => {};
  painter.clear = (c) => { if (c !== lastBg) { lastBg = c; document.documentElement.style.setProperty('--zn-bg', hex6(c)); document.body.style.background = hex6(c); } };

  // ---------------------------------------------------------------- layers (dialogs, menus, toasts): a portal above the page
  const portal = document.createElement('div');
  portal.id = 'zinc-layers';
  document.body.appendChild(portal);
  const layerWrap = new Map();   // node -> wrapper element
  function layers() {
    const info = ui.domLayers();
    const live = new Set();
    for (let i = 0; i < info.length; i += 4) {
      const h = info[i], modal = info[i + 1] === 1, bd = info[i + 2], alpha = info[i + 3];
      live.add(h);
      let w = layerWrap.get(h);
      if (!w || w.modal !== modal) {
        if (w) { try { w.el.close && w.el.close(); } catch { /* not open */ } w.el.remove(); }
        const el = document.createElement(modal ? 'dialog' : 'div');
        el.className = modal ? 'zd' : 'zl';
        if (modal) {
          el.addEventListener('cancel', (e) => { e.preventDefault(); ui.domDismiss(h); });
          el.setAttribute('aria-modal', 'true');
        }
        w = { el, modal, open: false };
        layerWrap.set(h, w);
        portal.appendChild(el);
      }
      const st = w.el;
      st.style.setProperty('--zn-backdrop', bd >= 0 ? color(bd, alpha) : 'transparent');
      if (!modal && bd >= 0) st.style.background = color(bd, alpha); else if (!modal) st.style.background = '';
      const e = sync(h, null, false, true);
      const ln = ui.inspectNode(h);
      if (e) { if (e.parentNode !== st) st.appendChild(e); if (modal && ln && ln.label) st.setAttribute('aria-label', ln.label); if (modal && ln && ln.role === 'dialog') e.removeAttribute('role'); }
      if (modal && !w.open) { try { st.showModal(); w.open = true; } catch { st.setAttribute('open', ''); w.open = true; } }
      if (i / 4 === info.length / 4 - 1 && modal) { /* the top modal keeps the focus */ }
    }
    for (const [h, w] of layerWrap) {
      if (live.has(h)) continue;
      try { w.el.close && w.el.close(); } catch { /* not open */ }
      w.el.remove(); layerWrap.delete(h);
      const s = E[h]; if (s && s.el.parentNode) s.el.remove();
    }
    // keep the portal's order the layers' order
    let at = portal.firstChild;
    for (let i = 0; i < info.length; i += 4) { const w = layerWrap.get(info[i]); if (w.el !== at) portal.insertBefore(w.el, at); else at = at.nextSibling; }
  }

  // ---------------------------------------------------------------- the commit
  let rootEl = null, lastFocus = -2, lastScheme = '', lastDir = '', frames = 0;
  const scrollers = [];
  function commit(api) {
    ui = api;
    frames++;
    const rh = ui.inspectRoot();
    if (rh < 0) return;
    changed = 0; pending.length = 0;
    const e = sync(rh, null, false, false);
    if (e && rootEl !== e) { rootEl = e; if (e.parentNode !== root) { root.textContent = ''; root.appendChild(e); } }
    layers();
    if (pre && frames === 1) { root.removeAttribute('data-prerendered'); const old = document.getElementById('zinc-css-pre'); if (old) old.remove(); adopt.clear(); }   // the page took over: the prerendered sheet is replaced by the runtime's own
    // scroll offsets the program set (scrollTo, scroll into view) go to the browser
    for (const h of liveScrollers) {
      const st = E[h], n = ui.inspectNode(h);
      if (!st || !n) { liveScrollers.delete(h); continue; }
      if (Math.abs(n.sx - st.sx) > 0.5 || Math.abs(n.sy - st.sy) > 0.5) { st.sx = n.sx; st.sy = n.sy; st.el.scrollTo({ left: n.sx, top: n.sy, behavior: 'instant' }); }
    }
    // focus the program moved
    const f = ui.focused();
    if (f !== lastFocus) {
      lastFocus = f;
      const s = f >= 0 ? E[f] : null;
      if (s && s.el !== document.activeElement && root.contains(s.el)) s.el.focus();
      else if (f < 0 && document.activeElement && document.activeElement !== document.body && root.contains(document.activeElement)) document.activeElement.blur();
    }
    for (const h of pendingScroll.splice(0)) { const st = E[h], n = ui.inspectNode(h); if (st && n) st.el.scrollTo({ left: n.sx, top: n.sy, behavior: 'instant' }); }
    for (const [h, st] of pending) runDraw(h, st);
    const sch = ui.currentScheme();
    if (sch !== lastScheme) { lastScheme = sch; document.documentElement.style.colorScheme = sch === 'dark' ? 'dark' : 'light'; }
    const dir = ui.direction();
    if (dir !== lastDir) { lastDir = dir; root.dir = dir; }
    if (!defaultFg) { defaultFg = true; root.style.color = hex6(ui.domDefaultFg()); }
  }
  let defaultFg = false;
  const liveScrollers = new Set();
  // ---------------------------------------------------------------- events: the page's, handed to the nodes' handlers
  const modsOf = (e) => (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
  const node = (h) => ui.inspectNode(h);
  function pointerEvent(e, el) {
    const P = ui.PointerEvent ? new ui.PointerEvent() : { };
    const r = el.getBoundingClientRect(), rr = root.getBoundingClientRect();
    P.x = e.clientX - r.left; P.y = e.clientY - r.top; P.gx = e.clientX - rr.left; P.gy = e.clientY - rr.top;
    P.button = e.button === 1 ? 1 : e.button === 2 ? 2 : 0; P.mods = modsOf(e); P.clicks = e.detail || 1;
    return P;
  }
  /** The nearest node at or above the target that has the handler: [handle, handler]. */
  function find(target, pick) {
    for (let el = target; el && el !== document.body; el = el.parentNode) {
      if (el._h === undefined) continue;
      const n = node(el._h);
      if (!n) continue;
      const f = pick(n);
      if (f) return [el._h, f, el];
    }
    return null;
  }
  const H = {
    down: (n) => n.hs && n.hs.down, up: (n) => n.hs && n.hs.up, move: (n) => n.hs && n.hs.move, dbl: (n) => n.hs && n.hs.dbl, ctx: (n) => n.hs && n.hs.ctx,
    wheel: (n) => n.hs && n.hs.wheel, enter: (n) => n.hs && n.hs.enter, leave: (n) => n.hs && n.hs.leave, tap: (n) => n.hs && n.hs.tap, long: (n) => n.hs && n.hs.long,
    drag: (n) => n.hs && n.hs.drag, cancel: (n) => n.hs && n.hs.cancel,
  };
  let press = null, suppressClick = false, longTimer = 0, dragging = null;
  function install() {
    const opt = { passive: true };
    root.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
      const hit = find(e.target, (n) => n.onClick);
      if (!hit) return;
      if (ui.isDisabled(hit[0])) return;
      if (hit[2].tagName === 'A' && hit[2].getAttribute('href') !== null) e.preventDefault();
      ui.click(hit[0]);
    });
    portal.addEventListener('click', (e) => { const hit = find(e.target, (n) => n.onClick); if (!hit || ui.isDisabled(hit[0])) return; ui.click(hit[0]); });
    for (const host of [root, portal]) {
      host.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch') { Z.input.touches = [{ id: 0, x: 0, y: 0 }]; setTimeout(() => { Z.input.touches = []; }, 50); }
        ui.domOutside(hOf(e.target), e.clientX, e.clientY, e.button === 1 ? 1 : e.button === 2 ? 2 : 0);
        const hd = find(e.target, H.down);
        if (hd && !ui.isDisabled(hd[0])) {
          hd[1](pointerEvent(e, hd[2]));
          if (node(hd[0]).onClick === null) { try { hd[2].setPointerCapture(e.pointerId); } catch { /* gone */ } }   // a slider keeps its drag when the pointer leaves it
        }
        press = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now(), target: e.target };
        const lg = find(e.target, H.long);
        clearTimeout(longTimer);
        if (lg && !ui.isDisabled(lg[0])) longTimer = setTimeout(() => { if (press) { suppressClick = true; lg[1](pointerEvent(e, lg[2])); press.long = true; } }, 500);
        const dg = find(e.target, H.drag);
        dragging = dg && !ui.isDisabled(dg[0]) ? { hit: dg, started: false, x0: e.clientX, y0: e.clientY, axis: (node(dg[0]).hs.dragAxis | 0) || 3, slop: node(dg[0]).hs.dragThreshold || 8 } : null;
      }, opt);
      host.addEventListener('pointermove', (e) => {
        const hm = find(e.target, H.move);
        if (hm) hm[1](pointerEvent(e, hm[2]));
        if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) clearTimeout(longTimer);
        if (dragging) {
          const dx = e.clientX - dragging.x0, dy = e.clientY - dragging.y0;
          if (!dragging.started && ((dragging.axis & 1 && Math.abs(dx) > dragging.slop) || (dragging.axis & 2 && Math.abs(dy) > dragging.slop))) {
            dragging.started = true; suppressClick = true;
            try { dragging.hit[2].setPointerCapture(e.pointerId); } catch { /* gone */ }
            const P = pointerEvent(e, dragging.hit[2]); P.phase = 0; P.dx = dx; P.dy = dy; dragging.hit[1](P);
          } else if (dragging.started) { const P = pointerEvent(e, dragging.hit[2]); P.phase = 1; P.dx = dx; P.dy = dy; dragging.hit[1](P); }
        }
      }, opt);
      const up = (e, cancel) => {
        clearTimeout(longTimer);
        const hu = find(e.target, cancel ? H.cancel : H.up);
        if (hu) hu[1](pointerEvent(e, hu[2]));
        if (dragging && dragging.started) { const P = pointerEvent(e, dragging.hit[2]); P.phase = cancel ? 3 : 2; P.dx = e.clientX - dragging.x0; P.dy = e.clientY - dragging.y0; dragging.hit[1](P); setTimeout(() => { suppressClick = false; }, 0); }
        else if (!cancel && press && !press.long) { const ht = find(e.target, H.tap); if (ht && !ui.isDisabled(ht[0])) ht[1](pointerEvent(e, ht[2])); }
        if (press && press.long) setTimeout(() => { suppressClick = false; }, 0);
        press = null; dragging = null;
      };
      host.addEventListener('pointerup', (e) => up(e, false), opt);
      host.addEventListener('pointercancel', (e) => up(e, true), opt);
      host.addEventListener('dblclick', (e) => { const h = find(e.target, H.dbl); if (h) h[1](pointerEvent(e, h[2])); });
      host.addEventListener('contextmenu', (e) => { const h = find(e.target, H.ctx); if (h) { e.preventDefault(); h[1](pointerEvent(e, h[2])); } });
      host.addEventListener('wheel', (e) => {
        const h = find(e.target, H.wheel);
        if (!h) return;
        const P = pointerEvent(e, h[2]); P.wheel = -e.deltaY / 40; P.wheelX = e.deltaX / 40; P.pinch = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : 1;
        h[1](P);
      }, opt);
      host.addEventListener('mouseover', (e) => { const h = find(e.target, H.enter); if (h && !h[2].contains(e.relatedTarget)) h[1](pointerEvent(e, h[2])); });
      host.addEventListener('mouseout', (e) => { const h = find(e.target, H.leave); if (h && !h[2].contains(e.relatedTarget)) h[1](pointerEvent(e, h[2])); });
      // the scroll offsets the browser moved
      host.addEventListener('scroll', (e) => {
        const el = e.target;
        if (el._h === undefined) return;
        const st = E[el._h];
        if (!st) return;
        st.sx = el.scrollLeft; st.sy = el.scrollTop;
        ui.domScroll(el._h, el.scrollLeft, el.scrollTop);
      }, { capture: true, passive: true });
      // fields
      host.addEventListener('input', (e) => {
        const el = e.target;
        if (el._h === undefined || node(el._h) === null || node(el._h).ed === null) return;
        const st = E[el._h];
        if (e.isComposing) { st.composing = true; }
        ui.domEdit(el._h, el.value, el.selectionStart, el.selectionEnd);
      });
      host.addEventListener('compositionend', (e) => { const el = e.target; if (el._h !== undefined && E[el._h]) { E[el._h].composing = false; ui.domEdit(el._h, el.value, el.selectionStart, el.selectionEnd); } });
      host.addEventListener('change', (e) => { const el = e.target; if (el._h !== undefined && node(el._h) && node(el._h).ed) ui.domChanged(el._h); });
      host.addEventListener('select', (e) => { const el = e.target; if (el._h !== undefined && node(el._h) && node(el._h).ed) ui.domSelect(el._h, el.selectionStart, el.selectionEnd); });
      host.addEventListener('focusin', (e) => {
        const h = hOf(e.target);
        if (h < 0) return;
        let key = false;
        try { key = e.target.matches(':focus-visible'); } catch { /* old browser */ }
        lastFocus = h;
        ui.domFocus(h, key);
      });
      host.addEventListener('focusout', (e) => {
        if (e.relatedTarget && (root.contains(e.relatedTarget) || portal.contains(e.relatedTarget))) return;
        lastFocus = -1;
        ui.domFocus(-1, false);
      });
      host.addEventListener('submit', (e) => {
        const h = hOf(e.target);
        e.preventDefault();
        if (h >= 0) ui.submitFrom(h);
      });
      host.addEventListener('keydown', (e) => {
        if (e.isComposing || e.keyCode === 229) return;
        const el = e.target, field = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
        if ((e.key === 'Enter' || e.key === ' ') && el && el._h !== undefined && el.tagName !== 'BUTTON' && el.tagName !== 'A' && !field) {   // a box that takes clicks and is not a button: Enter and Space press it, as for a button
          const n = node(el._h);
          if (n && n.onClick !== null && !ui.isDisabled(el._h)) { e.preventDefault(); ui.click(el._h); return; }
        }
        if (e.key === 'Enter' && el && el.tagName === 'INPUT' && el._h !== undefined) {   // Enter in a single-line field: its change, then the form's submit (the browser does it only with a submit button)
          ui.domChanged(el._h);
          const form = el.closest('form');
          if (form) { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true })); }
        }
        if (!ui.domKeys()) { if (e.key === 'Escape' && !e.defaultPrevented) { /* dialogs close through cancel */ } return; }
        void field;
        const name = e.key.length === 1 ? e.key.toLowerCase() : e.key === 'Esc' ? 'Escape' : e.key;
        if (ui.domKey(name, modsOf(e), e.repeat)) e.preventDefault();
      });
    }
    // the text the page selected or pasted is the page's own; keys nobody listens to are never taken
    addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return;
      if (root.contains(e.target) || portal.contains(e.target)) return;   // handled above
      if (e.target !== document.body && e.target !== document.documentElement) return;
      if (!ui || !ui.domKeys()) return;
      const name = e.key.length === 1 ? e.key.toLowerCase() : e.key === 'Esc' ? 'Escape' : e.key;
      if (ui.domKey(name, modsOf(e), e.repeat)) e.preventDefault();
    });
  }
  install();
  /** For tools: the nodes whose box in the page differs from the one zinc:ui's own layout computed by more than `thr` px (the classic layout is what the canvas mode shows), shallowest first. */
  function diff(thr = 1.5) {
    const rr = root.getBoundingClientRect(), out = [];
    for (let h = 0; h < E.length; h++) {
      const st = E[h], n = st && ui.inspectNode(h);
      if (!n || !st.el.isConnected || n.hidden || n.tag === FRAGMENT || n.layer) continue;
      const r = st.el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const d = [r.x - rr.x - n.x, r.y - rr.y - n.y, r.width - n.lw, r.height - n.lh];
      if (Math.max(...d.map(Math.abs)) > thr) { let depth = 0; for (let p = n.parent; p >= 0; p = ui.inspectNode(p).parent) depth++; out.push({ h, depth, tag: st.tag, text: (n.text || '').slice(0, 20), zn: [n.x, n.y, n.lw, n.lh].map(Math.round), dom: [r.x - rr.x, r.y - rr.y, r.width, r.height].map(Math.round) }); }
    }
    return out.sort((a, b) => a.depth - b.depth);
  }
  Z.dom = { E, classes, ruleText, diff, stats: () => ({ rules: ruleText.length, classes: classes.size, elements: root.getElementsByTagName('*').length, frames }) };
  return { painter, commit, ui: () => ui };
}
