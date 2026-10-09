/* Figma sandbox. Export is read-only; only the explicit Save annotations action writes plugin data. */
figma.showUI(__html__, { width: 560, height: 760, themeColors: true });
const KEY = 'zinc-ui-v1';
let exporting = false;
function metadata(n) { const raw = n.getPluginData(KEY); return raw ? JSON.parse(raw) : {}; }
function selection() {
  const nodes = figma.currentPage.selection;
  figma.ui.postMessage({ type: 'selection', names: nodes.map(n => n.name), id: nodes.length === 1 ? nodes[0].id : null, metadata: nodes.length === 1 ? metadata(nodes[0]) : {} });
}
figma.on('selectionchange', selection);
selection();
const color = p => '#' + [p.color.r, p.color.g, p.color.b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') + (p.opacity !== undefined && p.opacity < 1 ? Math.round(p.opacity * 255).toString(16).padStart(2, '0') : '');
function failure(n, message) { throw new Error(`${n.name} (${n.id}): ${message}`); }
async function exportSelection(name, rasterize) {
  const selected = [...figma.currentPage.selection];
  if (!selected.length || selected.length > 128 || selected.some(n => !['FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type))) throw new Error('Select 1–128 top-level frames/components to export.');
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) throw new Error('Use a component name such as ThermostatApp.');
  const assets = [], warnings = [], components = [], definitions = new Map(); let count = 0;
  const screenIds = new Set(selected.map(n => n.id));
  const warn = (n, message) => warnings.push(`${n.name}: ${message}`);
  function interactive(n, depth = 0) {
    if (depth > 64) failure(n, 'tree too deep');
    const m = metadata(n);
    return Boolean(n.reactions?.length || m.text || m.value || m.onClick || m.onInput || m.component || m.instanceInputs || (n.children ?? []).some(c => interactive(c, depth + 1)));
  }
  async function definition(main, componentName) {
    if (definitions.has(main.id)) return definitions.get(main.id);
    definitions.set(main.id, componentName); // recursion is rejected by the shared document validator
    const m = metadata(main), root = await convert(main, null, true);
    components.push({ name: componentName, ...(m.contract ?? {}), root });
    return componentName;
  }
  async function convert(n, parent, root = false) {
    if (++count > 10000) failure(n, 'export exceeds 10000 nodes');
    const m = metadata(n);
    if (!root && (n.type === 'INSTANCE' || n.type === 'COMPONENT')) {
      const main = n.type === 'INSTANCE' ? await n.getMainComponentAsync() : n;
      const cm = main && metadata(main);
      if (main && cm.component) {
        const componentName = await definition(main, cm.component);
        return { id: n.id, type: 'view', style: layout(n, parent, false), children: [{ id: n.id + ':instance', type: componentName, inputs: m.instanceInputs ?? {}, events: m.instanceEvents ?? {} }] };
      }
    }
    const children = 'children' in n ? n.children.filter(c => c.visible !== false) : [];
    const style = layout(n, parent, root);
    const fills = Array.isArray(n.fills) ? n.fills.filter(p => p.visible !== false) : [];
    const effects = Array.isArray(n.effects) ? n.effects.filter(e => e.visible !== false) : [];
    const unsupported = !['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'RECTANGLE', 'TEXT'].includes(n.type) || Math.abs(n.rotation ?? 0) > 0.01 || effects.length || fills.length > 1 || fills.some(p => p.type !== 'SOLID') || n.isMask || children.some(c => c.isMask) || (n.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(n.blendMode));
    if (unsupported) {
      if (!rasterize || interactive(n)) failure(n, 'unsupported visual effect/vector/image. Enable static PNG fallback, or simplify this interactive subtree.');
      const file = 'node-' + n.id.replace(/[^A-Za-z0-9_-]/g, '-') + '.png';
      const bytes = await n.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
      assets.push({ name: file, bytes }); warn(n, 'exported as a static PNG');
      return { id: n.id, type: 'image', style, src: file };
    }
    if (fills.length) {
      if (n.type === 'TEXT' && fills[0].opacity !== undefined && fills[0].opacity < 1) failure(n, 'transparent text fill is not supported');
      style[n.type === 'TEXT' ? 'color' : 'backgroundColor'] = color(fills[0]);
    }
    if (n.opacity !== undefined && n.opacity !== 1) style.opacity = n.opacity;
    if (typeof n.cornerRadius === 'number') style.borderRadius = n.cornerRadius;
    else if ('cornerRadius' in n) failure(n, 'mixed corner radii are not supported');
    const strokes = Array.isArray(n.strokes) ? n.strokes.filter(p => p.visible !== false) : [];
    if (strokes.length) {
      if (strokes.length !== 1 || strokes[0].type !== 'SOLID' || (strokes[0].opacity !== undefined && strokes[0].opacity < 1)) failure(n, 'only one opaque solid stroke is supported');
      style.borderColor = color(strokes[0]);
      if (typeof n.strokeWeight !== 'number') failure(n, 'mixed stroke widths are unsupported');
      style.borderWidth = n.strokeWeight;
      if (n.strokeAlign !== 'INSIDE') warn(n, 'stroke aligned inside in Zinc');
    }
    const result = { id: n.id, type: m.type ?? (n.type === 'TEXT' ? 'text' : 'view'), style };
    if (n.type === 'TEXT') {
      if (typeof n.fontSize !== 'number' || n.fontName === figma.mixed || n.lineHeight === figma.mixed || n.letterSpacing === figma.mixed || n.fills === figma.mixed) failure(n, 'mixed text formatting is not supported; split into text nodes');
      style.fontSize = n.fontSize; style.textAlign = n.textAlignHorizontal.toLowerCase();
      if (style.textAlign === 'justified') failure(n, 'justified text is unsupported');
      const font = n.fontName;
      if (font.family !== 'Inter') warn(n, `${font.family} substituted with Inter; provide a font asset and fontFamily mapping for production`);
      if (!/^(Regular|Bold|Semi ?Bold)$/i.test(font.style)) warn(n, `${font.style} mapped to the available regular/bold font`);
      if (/bold|semibold/i.test(font.style)) style.fontWeight = 'bold';
      if (n.lineHeight.unit === 'PIXELS') style.lineHeight = n.lineHeight.value;
      else if (n.lineHeight.unit === 'PERCENT') style.lineHeight = n.fontSize * n.lineHeight.value / 100;
      if (n.letterSpacing.value) style.letterSpacing = n.letterSpacing.unit === 'PIXELS' ? n.letterSpacing.value : n.fontSize * n.letterSpacing.value / 100;
      result.text = n.characters;
    }
    for (const key of ['text', 'value', 'placeholder', 'onClick', 'onInput']) if (m[key] !== undefined) result[key] = m[key];
    if (m.style) Object.assign(style, m.style);
    if (['input', 'textarea'].includes(result.type)) delete result.text;
    if (!m.onClick && n.reactions?.length) {
      result.onClick = [];
      for (const r of n.reactions) {
        if (!r.trigger || r.trigger.type !== 'ON_CLICK') failure(n, `prototype trigger ${r.trigger?.type} is unsupported in v1`);
        for (const a of r.actions ?? (r.action ? [r.action] : [])) {
          if (a.type === 'BACK') result.onClick.push({ type: 'back' });
          else if (a.type === 'NODE' && a.navigation === 'NAVIGATE' && screenIds.has(a.destinationId)) {
            result.onClick.push({ type: 'navigate', target: a.destinationId });
            if (a.transition) warn(n, 'prototype transition becomes instantaneous in v1');
          } else failure(n, `unsupported prototype action ${a.type}/${a.navigation ?? ''}; select its destination frame or add an explicit event annotation`);
        }
      }
    }
    if (result.onClick?.length && result.type === 'view') {
      result.type = 'button';
      for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) style[k] ??= 0;
      style.backgroundColor ??= 'transparent';
    }
    if (children.length && !['input', 'textarea'].includes(result.type)) result.children = [];
    for (const child of children) {
      if (['input', 'textarea'].includes(result.type)) break;
      result.children.push(await convert(child, n));
    }
    return result;
  }
  function layout(n, parent, root) {
    const s = { width: Math.round(n.width), height: Math.round(n.height) };
    if (root) { s.width = '100%'; s.height = '100%'; }
    else if (!parent || parent.layoutMode === 'NONE' || !parent.layoutMode || n.layoutPositioning === 'ABSOLUTE') { s.position = 'absolute'; s.left = Math.round(n.x); s.top = Math.round(n.y); }
    if (n.layoutMode === 'GRID') failure(n, 'Auto Layout grid is unsupported');
    if (n.layoutMode === 'HORIZONTAL' || n.layoutMode === 'VERTICAL') {
      s.flexDirection = n.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
      s.gap = n.itemSpacing;
      s.paddingTop = n.paddingTop; s.paddingRight = n.paddingRight; s.paddingBottom = n.paddingBottom; s.paddingLeft = n.paddingLeft;
      const aligns = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
      s.justifyContent = aligns[n.primaryAxisAlignItems] ?? 'flex-start'; s.alignItems = aligns[n.counterAxisAlignItems] ?? 'flex-start';
      if (n.layoutWrap === 'WRAP') { s.flexWrap = 'wrap'; warn(n, 'wrapped Auto Layout uses one gap in Zinc'); }
    }
    if (!root && parent?.layoutMode && parent.layoutMode !== 'NONE') {
      if (n.layoutSizingHorizontal === 'HUG') delete s.width;
      if (n.layoutSizingVertical === 'HUG') delete s.height;
      if (n.layoutSizingHorizontal === 'FILL') { if (parent.layoutMode === 'HORIZONTAL') { delete s.width; s.flexGrow = 1; } else s.width = '100%'; }
      if (n.layoutSizingVertical === 'FILL') { if (parent.layoutMode === 'VERTICAL') { delete s.height; s.flexGrow = 1; } else s.height = '100%'; }
    }
    if (n.clipsContent) s.overflow = 'hidden';
    if (n.overflowDirection && n.overflowDirection !== 'NONE') { s.overflow = 'auto'; warn(n, 'prototype scrolling uses Zinc scroll behavior'); }
    return s;
  }
  const first = selected[0], meta = metadata(first);
  if (selected.length === 1 && meta.component) await definition(first, meta.component);
  else {
    const screens = [];
    for (const frame of selected) screens.push({ id: frame.id, root: await convert(frame, null, true) });
    components.push({ name, ...(meta.contract ?? {}), screens, initial: first.id });
  }
  return { document: { format: 'zinc-ui/1', name, entry: selected.length === 1 && meta.component ? meta.component : name, width: Math.max(1, Math.round(first.width)), height: Math.max(1, Math.round(first.height)), components, assets: assets.map(a => a.name) }, assets, warnings };
}
figma.ui.onmessage = async msg => {
  try {
    if (msg.type === 'save') {
      const n = await figma.getNodeByIdAsync(msg.id);
      if (!n || figma.currentPage.selection.length !== 1 || figma.currentPage.selection[0].id !== msg.id) throw new Error('Selection changed; select the node again before saving.');
      if (typeof msg.json !== 'string' || msg.json.length > 32000) throw new Error('Annotations exceed 32 KB');
      const m = JSON.parse(msg.json); if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error('Annotations must be a JSON object');
      n.setPluginData(KEY, JSON.stringify(m)); selection(); figma.notify('Zinc annotations saved');
    } else if (msg.type === 'export') {
      if (exporting) throw new Error('Export already running');
      exporting = true;
      try { figma.ui.postMessage({ type: 'export', ...await exportSelection(msg.name, msg.rasterize === true) }); }
      finally { exporting = false; }
    } else if (msg.type === 'selection') selection();
  } catch (error) { figma.ui.postMessage({ type: 'error', message: error.message }); }
};
