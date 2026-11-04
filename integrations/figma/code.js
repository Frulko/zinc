/* Zinc Live: one pinned screen, explicit demo creation, no build step. */
figma.showUI(__html__, { width: 340, height: 440, themeColors: true });
let root = null, live = false, busy = false, dirty = false, timer, generation = 0;
let page = figma.currentPage;
let textMode = 'auto';
const send = message => figma.ui.postMessage(message);
function selection() {
  const selected = figma.currentPage.selection;
  send({ type: 'selection', name: selected.length === 1 ? selected[0].name : '', pinned: root && !root.removed ? root.name : '' });
}
function schedule() {
  if (!live) return;
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(snapshot, 180);
}
page.on('nodechange', schedule);
figma.on('stylechange', schedule);
figma.on('selectionchange', selection);
figma.on('currentpagechange', () => {
  page.off('nodechange', schedule);
  page = figma.currentPage;
  page.on('nodechange', schedule);
  generation++; live = false; root = null;
  send({ type: 'stopped' }); selection();
});
function easing(value) {
  const type = value && value.type || 'LINEAR';
  return ({LINEAR:'linear', EASE_IN:'ease-in', EASE_OUT:'ease-out', EASE_IN_AND_OUT:'ease-in-out', EASE_IN_OUT:'ease-in-out'})[type] || 'ease-in-out';
}
function read(n,key,fallback) { return key in n ? n[key] : fallback; }
function motion(n, warnings) {
  const map = {TRANSLATION_X:'translateX', TRANSLATION_Y:'translateY', ROTATION:'rotate', WIDTH:'width', HEIGHT:'height', OPACITY:'opacity', CORNER_RADIUS:'borderRadius', SCALE_X:'scaleX', SCALE_Y:'scaleY', STACK_SPACING:'gap', STACK_PADDING_TOP:'paddingTop', STACK_PADDING_RIGHT:'paddingRight', STACK_PADDING_BOTTOM:'paddingBottom', STACK_PADDING_LEFT:'paddingLeft'};
  const result = [];
  for (const [field, animation] of Object.entries(n.animations || {})) {
    const key = map[field];
    if (!key || !animation || animation.tracks.length !== 1 || animation.baseValue.type !== 'FLOAT') { warnings.push(n.name + ' : piste Motion ' + field + ' non traduite.'); continue; }
    const track = animation.tracks[0], base = animation.baseValue.value;
    const points = [{at:0,value:base,easing:'linear'}];
    for (const k of track.keyframes) {
      if (k.value.type !== 'FLOAT') continue;
      const value = track.keyframeOperation === 'OFFSET' ? base + k.value.value : track.keyframeOperation === 'SCALE' ? base * k.value.value : k.value.value;
      points.push({at:k.timelinePosition * 1000,value,easing:easing(k.easing)});
    }
    points.sort((a,b) => a.at - b.at);
    result.push({key,points});
  }
  return result;
}
async function snapshot() {
  if (!live || busy) return;
  busy = true; dirty = false;
  const current = generation;
  try {
    if (!root || root.removed) throw new Error('Cet écran a été supprimé. Choisissez un autre écran.');
    let count = 0;
    const assets = {}, assetContent = new Map(), warnings = [], fonts = new Map(), variables = new Map(), textStyles = new Map(), paintStyles = new Map(), components = new Map(), pending = [root], queued = new Set([root.id]);
    async function destination(id) {
      if (queued.has(id)) return;
      const n = await figma.getNodeByIdAsync(id);
      if (!n || !['FRAME','COMPONENT','INSTANCE'].includes(n.type)) throw Error('Destination de prototype introuvable : ' + id);
      if (pending.length >= 32) throw Error('Le prototype dépasse 32 écrans.');
      queued.add(id); pending.push(n);
    }
    async function actions(n) {
      const result = [], triggers = {ON_CLICK:'click',ON_HOVER:'hover',ON_PRESS:'press',MOUSE_ENTER:'enter',MOUSE_LEAVE:'leave',MOUSE_DOWN:'down',MOUSE_UP:'up',AFTER_TIMEOUT:'after'};
      for (const r of n.reactions || []) {
        const trigger = triggers[r.trigger && r.trigger.type];
        if (!trigger) { warnings.push(n.name + ' : déclencheur de prototype non traduit.'); continue; }
        for (const a of r.actions || (r.action ? [r.action] : [])) {
          let action = a.type === 'BACK' ? 'back' : a.type === 'CLOSE' ? 'close' : '';
          let target = '';
          if (a.type === 'NODE') {
            action = ({NAVIGATE:'navigate',SWAP:'navigate',OVERLAY:'overlay',CHANGE_TO:'variant'})[a.navigation] || '';
            target = a.destinationId || '';
          }
          if (!action) { warnings.push(n.name + ' : action ' + a.type + '/' + (a.navigation || '') + ' non traduite.'); continue; }
          if (target) await destination(target);
          const tr = a.transition;
          const kind = !tr ? 'instant' : tr.type === 'DISSOLVE' ? 'dissolve' : tr.type === 'SMART_ANIMATE' ? 'smart' : /MOVE|PUSH|SLIDE/.test(tr.type) ? 'move' : 'instant';
          result.push({trigger,action,target,delay:r.trigger.timeout || r.trigger.delay || 0,transition:{kind,duration:tr ? tr.duration * 1000 : 0,easing:easing(tr && tr.easing)}});
          if (kind === 'smart') warnings.push(n.name + ' : Smart Animate rapproche les calques directs portant le même nom.');
        }
      }
      return result;
    }
    const color = p => '#' + [p.color.r,p.color.g,p.color.b,p.opacity === undefined ? 1 : p.opacity].map(v => Math.round(v * 255).toString(16).padStart(2,'0')).join('');
    function geometry(n,parent,isRoot) {
      const s = {width:n.width,height:n.height,flexShrink:0};
      const auto = parent && ['HORIZONTAL','VERTICAL'].includes(read(parent,'layoutMode','NONE'));
      if (parent && (!auto || n.layoutPositioning === 'ABSOLUTE')) Object.assign(s,{position:'absolute',left:n.x,top:n.y});
      if (['HORIZONTAL','VERTICAL'].includes(read(n,'layoutMode','NONE'))) {
        Object.assign(s,{flexDirection:read(n,'layoutMode','NONE') === 'HORIZONTAL' ? 'row' : 'column',gap:n.itemSpacing || 0,paddingTop:n.paddingTop || 0,paddingRight:n.paddingRight || 0,paddingBottom:n.paddingBottom || 0,paddingLeft:n.paddingLeft || 0});
        const align = {MIN:'flex-start',CENTER:'center',MAX:'flex-end',SPACE_BETWEEN:'space-between'};
        s.justifyContent = align[n.primaryAxisAlignItems] || 'flex-start'; s.alignItems = align[n.counterAxisAlignItems] || 'flex-start';
        if (n.layoutWrap === 'WRAP') { s.flexWrap = 'wrap'; s.rowGap = n.counterAxisSpacing || n.itemSpacing || 0; }
      }
      if (auto && n.layoutPositioning !== 'ABSOLUTE') {
        if (n.layoutSizingHorizontal === 'HUG' && n.type !== 'TEXT') delete s.width;
        if (n.layoutSizingVertical === 'HUG' && n.type !== 'TEXT') delete s.height;
        if (n.layoutSizingHorizontal === 'FILL') { if (read(parent,'layoutMode','NONE') === 'HORIZONTAL') { delete s.width; s.flexGrow = 1; } else s.width = '100%'; }
        if (n.layoutSizingVertical === 'FILL') { if (read(parent,'layoutMode','NONE') === 'VERTICAL') { delete s.height; s.flexGrow = 1; } else s.height = '100%'; }
        if (n.type === 'TEXT') { if (n.textAutoResize === 'WIDTH_AND_HEIGHT') { delete s.width; delete s.height; } else if (n.textAutoResize === 'HEIGHT') delete s.height; }
      }
      for (const [from,to] of [['minWidth','minWidth'],['maxWidth','maxWidth'],['minHeight','minHeight'],['maxHeight','maxHeight']]) if (typeof n[from] === 'number') s[to] = n[from];
      if (read(n,'clipsContent',false)) s.overflow = 'hidden';
      if (read(n,'overflowDirection','NONE') && read(n,'overflowDirection','NONE') !== 'NONE') s.overflow = 'auto';
      if (read(n,'layoutMode','NONE') === 'GRID') warnings.push(n.name + ' : grille Auto Layout conservée en positions fixes.');
      return s;
    }
    function hasBehavior(n) { return (n.reactions || []).length || Object.keys(n.animations || {}).length || ('children' in n && n.children.some(hasBehavior)); }
    async function bindings(n) {
      const out = {};
      async function variable(alias, property) {
        if (!alias || alias.type !== 'VARIABLE_ALIAS') return;
        const v = await figma.variables.getVariableByIdAsync(alias.id);
        if (!v) return;
        out[property] = v.id;
        if (!variables.has(v.id)) {
          const collection = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
          variables.set(v.id,{id:v.id,name:v.name,type:v.resolvedType,collection:collection && collection.name,modes:collection && collection.modes,values:v.valuesByMode});
        }
      }
      if (figma.variables) {
        for (const [property,value] of Object.entries(n.boundVariables || {})) for (const alias of Array.isArray(value) ? value : [value]) await variable(alias,property);
        for (const [property,paints] of [['fills',read(n,'fills',[])],['strokes',read(n,'strokes',[])]]) if (Array.isArray(paints)) for (const p of paints) if (p.boundVariables) await variable(p.boundVariables.color,property);
      }
      if (typeof read(n,'textStyleId','') === 'string' && read(n,'textStyleId','') && figma.getStyleByIdAsync) {
        const t = await figma.getStyleByIdAsync(read(n,'textStyleId',''));
        if (t) { textStyles.set(t.id,{id:t.id,name:t.name,fontName:t.fontName,fontSize:t.fontSize,lineHeight:t.lineHeight,letterSpacing:t.letterSpacing,textCase:t.textCase,textDecoration:t.textDecoration}); out.textStyle = t.id; }
      }
      for (const property of ['fillStyleId','strokeStyleId']) if (typeof read(n,property,'') === 'string' && read(n,property,'') && figma.getStyleByIdAsync) {
        const p = await figma.getStyleByIdAsync(read(n,property,''));
        if (p) { paintStyles.set(p.id,{id:p.id,name:p.name,paints:p.paints}); out[property] = p.id; }
      }
      return out;
    }
    function containsImage(n) { return Array.isArray(read(n,'fills',[])) && read(n,'fills',[]).some(p=>p.visible!==false&&p.type==='IMAGE') || ('children' in n && n.children.some(containsImage)); }
    function vectorTree(n) { if (n.type === 'TEXT' || containsImage(n)) return false; if ('children' in n) return n.children.filter(c=>c.visible!==false).every(vectorTree); return ['VECTOR','RECTANGLE','ELLIPSE','LINE','POLYGON','STAR','BOOLEAN_OPERATION'].includes(n.type); }
    function containsText(n) { return n.type === 'TEXT' || ('children' in n && n.children.some(containsText)); }
    async function convert(n,parent,depth=0) {
      if (++count > 5000 || depth > 48) throw Error('Écran trop complexe (5 000 calques ou 48 niveaux maximum).');
      const children = 'children' in n ? n.children.filter(c => c.visible !== false) : [];
      const fills = Array.isArray(read(n,'fills',[])) ? read(n,'fills',[]).filter(p => p.visible !== false) : [];
      const strokes = Array.isArray(read(n,'strokes',[])) ? read(n,'strokes',[]).filter(p => p.visible !== false) : [];
      const style = geometry(n,parent,!parent);
      const result = {id:n.id,name:n.name,type:n.type === 'TEXT' ? 'Text' : 'View',style,interactions:await actions(n),motion:motion(n,warnings),bindings:await bindings(n)};
      if (n.type === 'INSTANCE' || n.type === 'COMPONENT') {
        const main = n.type === 'COMPONENT' ? n : await n.getMainComponentAsync();
        if (main) {
          const base = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : main;
          components.set(base.id,{id:base.id,name:base.name,key:base.key,properties:base.componentPropertyDefinitions,variants:main.variantProperties});
          result.component = {id:base.id,key:base.key,name:base.name,properties:n.componentProperties || {},variants:n.variantProperties || {}};
        }
      }
      let lottie = n.getSharedPluginData ? n.getSharedPluginData('zinc.live','lottie') : '';
      if (!lottie && n.getPluginData) { try { lottie = n.getPluginData('zinc-live-lottie'); } catch { /* Private plugin data is unavailable in the MCP host. */ } }
      if (lottie) { const name = 'animation-' + count + '.json'; assets[name] = lottie; result.type = 'Lottie'; result.asset = name; return result; }
      const font = n.type === 'TEXT' ? n.fontName !== figma.mixed ? n.fontName : n.getRangeFontName(0,Math.min(1,n.characters.length)) : null;
      const textOutline = n.type === 'TEXT' && textMode === 'outlines';
      if (n.type === 'TEXT') {
        const families = n.getRangeAllFontNames ? n.getRangeAllFontNames(0,n.characters.length) : font ? [font] : [];
        for (const f of families) fonts.set(f.family + '/' + f.style,{family:f.family,style:f.style,extraction:textOutline ? 'contours demandés' : 'texte natif'});
        result.font = font;
        if (n.fontName === figma.mixed || n.fontSize === figma.mixed || read(n,'fills',[]) === figma.mixed) warnings.push(n.name + ' : texte mixte conservé en texte natif avec le premier style ; les variations internes restent à traduire.');
      }
      const effects = (n.effects || []).some(e => e.visible !== false);
      const vectorGroup = children.length > 0 && vectorTree(n);
      const complex = vectorGroup || !['FRAME','COMPONENT','INSTANCE','RECTANGLE','TEXT'].includes(n.type) || Math.abs(n.rotation || 0) > .01 || effects || fills.length > 1 || fills.some(p => p.type !== 'SOLID') || n.isMask || children.some(c => c.isMask) || n.blendMode && !['NORMAL','PASS_THROUGH'].includes(n.blendMode) || read(n,'cornerRadius',undefined) !== undefined && typeof read(n,'cornerRadius',undefined) !== 'number' || strokes.length > 1 || strokes.some(p => p.type !== 'SOLID') || strokes.length && (typeof n.strokeWeight !== 'number' || n.strokeAlign !== 'INSIDE');
      if ((textOutline || complex && !containsText(n)) && !(children.length && hasBehavior(n))) {
        let svg = textOutline || (!effects && !containsImage(n) && !n.isMask && !children.some(c => c.isMask));
        let bytes;
        try { bytes = await n.exportAsync(svg ? {format:'SVG',svgOutlineText:true,useAbsoluteBounds:true} : {format:'PNG',useAbsoluteBounds:true,constraint:{type:'SCALE',value:1}}); }
        catch (e) { svg = false; bytes = await n.exportAsync({format:'PNG',useAbsoluteBounds:true,constraint:{type:'SCALE',value:1}}); }
        if (svg) { let markup = ''; for (const b of bytes) markup += String.fromCharCode(b); if (/<(?:image|foreignObject|style)\b/i.test(markup)) { svg = false; bytes = await n.exportAsync({format:'PNG',useAbsoluteBounds:true,constraint:{type:'SCALE',value:1}}); } }
        const name = 'layer-' + count + (svg ? '.svg' : '.png');
        const encoded = figma.base64Encode(bytes), previous = assetContent.get(encoded);
        if (!previous) { if (Object.keys(assets).length >= 256) throw Error('Trop de ressources extraites (256 maximum).'); assets[name] = encoded; assetContent.set(encoded,name); }
        result.type = svg ? 'Svg' : 'Image'; result.asset = previous || name;
        if (style.width === undefined) style.width = n.width; if (style.height === undefined) style.height = n.height;
        if (textOutline) result.text = n.characters;
        warnings.push(n.name + (textOutline ? ' : typographie extraite en contours SVG.' : svg ? ' : vecteur SVG extrait.' : ' : décoration PNG extraite.'));
        return result;
      }
      if (complex) warnings.push(n.name + ' : effets complexes omis pour conserver les calques interactifs.');
      if (fills.length && fills[0].type === 'SOLID') style[n.type === 'TEXT' ? 'color' : 'backgroundColor'] = color(fills[0]);
      if (n.opacity !== undefined) style.opacity = n.opacity;
      if (typeof read(n,'cornerRadius',undefined) === 'number') style.borderRadius = read(n,'cornerRadius',undefined);
      if (strokes.length && strokes[0].type === 'SOLID') { style.borderColor = color(strokes[0]); style.borderWidth = n.strokeWeight; }
      if (n.type === 'TEXT') {
        style.fontSize = typeof n.fontSize === 'number' ? n.fontSize : n.getRangeFontSize(0,Math.min(1,n.characters.length)); style.textAlign = n.textAlignHorizontal.toLowerCase(); style.fontWeight = /bold|heavy|black/i.test(font.style) ? 'bold' : 'normal';
        if (n.lineHeight.unit === 'PIXELS') style.lineHeight = n.lineHeight.value;
        if (n.lineHeight.unit === 'PERCENT') style.lineHeight = n.fontSize * n.lineHeight.value / 100;
        if (n.letterSpacing.value) style.letterSpacing = n.letterSpacing.unit === 'PIXELS' ? n.letterSpacing.value : n.fontSize * n.letterSpacing.value / 100;
        result.text = n.characters; result.wrap = n.textAutoResize !== 'WIDTH_AND_HEIGHT'; return result;
      }
      result.children = [];
      const imageFill = fills.find(p=>p.type==='IMAGE');
      if (imageFill && children.length) {
        const image = figma.getImageByHash(imageFill.imageHash);
        if (image) {
          const bytes = await image.getBytesAsync(), suffix = bytes[0]===255&&bytes[1]===216?'.jpg':'.png';
          const encoded = figma.base64Encode(bytes), previous = assetContent.get(encoded), name = previous || 'photo-' + count + suffix;
          if (!previous) { if (Object.keys(assets).length >= 256) throw Error('Trop de ressources extraites.'); assets[name]=encoded;assetContent.set(encoded,name); }
          result.children.push({id:n.id+'::photo',name:'Photo / Background',type:'Image',asset:name,imageFit:imageFill.scaleMode==='FIT'?'contain':'cover',style:{position:'absolute',left:0,top:0,width:'100%',height:'100%'}});
        }
      }
      for (const c of children) result.children.push(await convert(c,n,depth+1));
      return result;
    }
    const screens = [];
    for (let i=0;i<pending.length;i++) {
      const frame = pending[i];
      if (frame.width > 4096 || frame.height > 4096) throw Error('Choisissez des écrans de 4 096 px maximum.');
      screens.push({id:frame.id,name:frame.name,width:frame.width,height:frame.height,duration:Math.max(0,...(frame.timelines || []).map(t => t.duration * 1000)),tree:await convert(frame,null)});
    }
    if (live && generation === current) send({type:'snapshot',document:{format:'zinc-live/1',name:root.name,initial:root.id,screens,assets,fonts:[...fonts.values()],designSystem:{variables:[...variables.values()],textStyles:[...textStyles.values()],paintStyles:[...paintStyles.values()],components:[...components.values()]},warnings},warnings});
  } catch (e) { if (generation === current) send({type:'error',message:e.message}); }
  finally { busy = false; if (dirty) schedule(); }
}
figma.ui.onmessage = async msg => {
  if (msg.type === 'pair' && figma.clientStorage) { if (typeof msg.url === 'string' && /^http:\/\/localhost:7331\/#([a-f0-9]{48})$/.test(msg.url)) await figma.clientStorage.setAsync('zinc-live-link',msg.url); return; }
  if (msg.type === 'options') { textMode = msg.textMode === 'outlines' ? 'outlines' : 'auto'; schedule(); return; }
  if (msg.type === 'attach-lottie') {
    try {
      const n = figma.currentPage.selection[0], animation = JSON.parse(msg.json);
      if (!n || !['FRAME','RECTANGLE'].includes(n.type)) throw Error('Sélectionnez un Frame ou un rectangle pour le Lottie.');
      if (!animation || !Array.isArray(animation.layers) || typeof msg.base64 !== 'string' || msg.base64.length > 64000) throw Error('Lottie invalide ou trop grand (48 Ko maximum).');
      n.setSharedPluginData('zinc.live','lottie',msg.base64); schedule(); send({type:'ready'});
    } catch (e) { send({type:'error',message:e.message}); }
    return;
  }
  if (msg.type === 'demo') {
    try {
      await figma.loadFontAsync({family:'Inter',style:'Regular'});
      const palette = {}, typography = {}, styling = [];
      if (figma.variables && figma.variables.getLocalVariableCollectionsAsync) {
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        const collection = collections.find(c => c.name === 'Zinc / Palette') || figma.variables.createVariableCollection('Zinc / Palette');
        const existing = await figma.variables.getLocalVariablesAsync('COLOR');
        for (const [name,value] of Object.entries({Canvas:{r:.96,g:.96,b:.94,a:1},Ink:{r:.12,g:.16,b:.10,a:1},Accent:{r:.83,g:.93,b:.63,a:1}})) {
          const v = existing.find(v => v.variableCollectionId === collection.id && v.name === name) || figma.variables.createVariable(name,collection,'COLOR');
          v.setValueForMode(collection.defaultModeId,value); palette[name] = v;
        }
      }
      function paint(name,fallback) {
        const p = {type:'SOLID',color:fallback};
        return palette[name] ? figma.variables.setBoundVariableForPaint(p,'color',palette[name]) : p;
      }
      if (figma.getLocalTextStylesAsync) {
        const existing = await figma.getLocalTextStylesAsync();
        for (const size of [15,16,24,30,36]) {
          const name = 'Zinc / Type / ' + size;
          const t = existing.find(t => t.name === name) || figma.createTextStyle();
          t.name = name; t.fontName = {family:'Inter',style:'Regular'}; t.fontSize = size; typography[size] = t;
        }
      }
      function screen(name,x,w=390,h=640) {
        const n = figma.createFrame(); n.name = name; n.resize(w,h); n.x = x;
        n.layoutMode = 'VERTICAL'; n.primaryAxisSizingMode = 'FIXED'; n.counterAxisSizingMode = 'FIXED'; n.itemSpacing = 24; n.paddingTop = 28; n.paddingRight = 28; n.paddingBottom = 28; n.paddingLeft = 28;
        n.fills = [paint('Canvas',{r:.96,g:.96,b:.94})]; return n;
      }
      function label(parent,name,value,size) {
        const n = figma.createText(); parent.appendChild(n); n.name = name;
        n.fontName = {family:'Inter',style:'Regular'}; n.fontSize = size; n.characters = value;
        if (typography[size]) styling.push(n.setTextStyleIdAsync(typography[size].id));
        n.fills = [paint('Ink',{r:.12,g:.16,b:.10})]; return n;
      }
      let buttonMaster = null;
      function button(parent,name,value) {
        if (figma.createComponent) {
          if (!buttonMaster) {
            buttonMaster = figma.createComponent(); buttonMaster.name = 'Zinc / Button'; buttonMaster.x = 2000;
            buttonMaster.resize(334,64); buttonMaster.layoutMode = 'HORIZONTAL'; buttonMaster.itemSpacing = 12;
            buttonMaster.primaryAxisAlignItems = 'CENTER'; buttonMaster.counterAxisAlignItems = 'CENTER'; buttonMaster.cornerRadius = 16;
            buttonMaster.fills = [paint('Accent',{r:.83,g:.93,b:.63})]; label(buttonMaster,'Text / Label','Continuer',16);
            if (figma.createNodeFromSvg) {
              const icon = figma.createNodeFromSvg('<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 12H20M14 6L20 12L14 18" fill="none" stroke="#1f291a" stroke-width="2"/></svg>');
              buttonMaster.appendChild(icon); icon.name = 'Icon / Arrow';
            }
            if (buttonMaster.addComponentProperty) {
              const property = buttonMaster.addComponentProperty('Label','TEXT','Continuer');
              buttonMaster.children[0].componentPropertyReferences = {characters:property};
            }
          }
          const n = buttonMaster.createInstance(); parent.appendChild(n); n.name = name; n.layoutSizingHorizontal = 'FILL';
          n.findOne(c => c.type === 'TEXT').characters = value; return n;
        }
        const n = figma.createFrame(); parent.appendChild(n); n.name = name; n.resize(334,64);
        n.layoutMode = 'HORIZONTAL'; n.itemSpacing = 12; n.primaryAxisAlignItems = 'CENTER'; n.counterAxisAlignItems = 'CENTER';
        n.layoutSizingHorizontal = 'FILL'; n.cornerRadius = 16;
        n.fills = [paint('Accent',{r:.83,g:.93,b:.63})]; label(n,'Text / Label',value,16); return n;
      }
      const frame = screen('Zinc / Accueil',500), details = screen('Zinc / Détails',1000), overlay = screen('Zinc / Confirmation',1500,300,240);
      overlay.cornerRadius = 20;
      label(frame,'Text / Brand','Zinc.',30);
      label(frame,'Text / Heading','Créez ici.\nJouez partout.',36);
      const body = label(frame,'Text / Introduction','Auto Layout, icônes, prototype et mouvement. Modifiez ce design : la fenêtre Zinc reste ouverte.',15);
      body.layoutSizingHorizontal = 'FILL'; body.textAutoResize = 'HEIGHT';
      const next = button(frame,'Button / Explorer','Explorer le prototype');
      if (figma.createNodeFromSvg && next.type !== 'INSTANCE') {
        const icon = figma.createNodeFromSvg('<svg width="24" height="24" viewBox="0 0 24 24"><path d="M4 12H20M14 6L20 12L14 18" fill="none" stroke="#1f291a" stroke-width="2"/></svg>');
        next.appendChild(icon); icon.name = 'Icon / Arrow'; icon.resize(24,24);
      }
      const dot = figma.createRectangle(); frame.appendChild(dot); dot.name = 'Motion / Status'; dot.resize(16,16); dot.cornerRadius = 8;
      dot.fills = [{type:'SOLID',color:{r:.45,g:.65,b:.20}}];
      if (dot.applyManualKeyframeTrack) {
        dot.applyManualKeyframeTrack({type:'PROPERTY',name:'TRANSLATION_X'},{baseValue:{type:'FLOAT',value:0},keyframes:[{timelinePosition:0,value:{type:'FLOAT',value:0}},{timelinePosition:1,value:{type:'FLOAT',value:40}},{timelinePosition:2,value:{type:'FLOAT',value:0}}]});
        const timeline = frame.timelines[0]; if (timeline) frame.setTimelineDuration(timeline.id,2);
      }
      label(details,'Text / Heading','Tout reste natif.',30);
      label(details,'Text / Description','Cliquez pour ouvrir une superposition ou revenir au premier écran.',15);
      const open = button(details,'Button / Confirmation','Ouvrir la confirmation');
      const back = button(details,'Button / Retour','Retour');
      label(overlay,'Text / Heading','Ça fonctionne.',24);
      const close = button(overlay,'Button / Fermer','Fermer');
      if (next.setReactionsAsync) {
        await next.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',navigation:'NAVIGATE',destinationId:details.id,transition:{type:'DISSOLVE',duration:.25,easing:{type:'EASE_IN_AND_OUT'}}}]}]);
        await open.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'NODE',navigation:'OVERLAY',destinationId:overlay.id,transition:null}]}]);
        await back.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'BACK'}]}]);
        await close.setReactionsAsync([{trigger:{type:'ON_CLICK'},actions:[{type:'CLOSE'}]}]);
      }
      await Promise.all(styling);
      figma.currentPage.selection = [frame]; figma.viewport.scrollAndZoomIntoView([frame]);
      selection(); send({type:'ready'});
    } catch (e) { send({type:'error',message:e.message}); }
    return;
  }
  if (msg.type === 'start') {
    const selected = figma.currentPage.selection;
    if (selected.length !== 1 || !['FRAME', 'COMPONENT', 'INSTANCE'].includes(selected[0].type)) {
      send({ type: 'error', message: 'Sélectionnez un écran (Frame) pour commencer.' }); return;
    }
    generation++; root = selected[0]; live = true; selection(); schedule();
  } else if (msg.type === 'stop') { generation++; live = false; clearTimeout(timer); }
  else if (msg.type === 'refresh') schedule();
  else if (msg.type === 'selection') { selection(); if (figma.clientStorage) { const url = await figma.clientStorage.getAsync('zinc-live-link'); if (typeof url === 'string') send({type:'pairing',url}); } }
};
selection();
