import { Mask } from './templates';

export interface CavalryZone { name: string; width: number; height: number; masks: Mask[]; media: string }

/** Native Cavalry 1.0.72 scene; file assets are relative to the companion project. */
// shortcut: mask outlines are guides; convert clipping/curves when full compositor interchange is implemented.
export function cavalryScene(zones: CavalryZone[], mediaNames: string[], fps: number = 30, duration: number = 10): string {
  if (zones.length === 0) throw new Error('Cavalry: no zones to export.');
  if (!Number.isFinite(fps) || fps < 1 || fps > 120 || !Number.isFinite(duration) || duration <= 0 || duration > 3600)
    throw new Error('Cavalry: use 1–120 fps and a duration up to 3600 seconds.');
  const end = Math.max(1, Math.ceil(fps * duration) - 1);
  const videos = /\.(mp4|mov|webm|m4v|avi|mkv|gif|apng)$/i;
  const images = /\.(png|jpg|jpeg|webp|bmp|tif|tiff|exr)$/i;
  const assetIds: string[] = [];
  const foldedNames: string[] = [];
  const nodes: any[] = [];
  const meta: any[] = [];
  const connections: any[] = [];
  const assets: any[] = [];
  let serial: i32 = 1;
  function value(v: any, type: string): any { return { value: v, varType: type }; }
  function node(type: string, attributes: any): string {
    const id = `${type}#${serial++}`;
    const entry: any = { nodeId: id, nodeType: type, attributes };
    if (type === 'strokeMaterial') entry.version = '2.0';
    nodes.push(entry);
    return id;
  }
  function children(id: string, list: string[]): void { meta.push({ nodeId: id, children: list }); }
  function connect(from: string, to: string): void { connections.push({ from, to }); }
  const root = node('asset', {});
  const rootChildren: string[] = [];
  for (const name of mediaNames) {
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,63}$/.test(name) || (!images.test(name) && !videos.test(name)))
      throw new Error(`Cavalry: unsupported media filename: ${name}`);
    if (foldedNames.includes(name.toLowerCase())) throw new Error(`Cavalry: colliding media filename: ${name}`);
    foldedNames.push(name.toLowerCase());
    const id = node('asset', { niceName: value(name, 'string'), colorId: value(12, 'int') });
    assets.push({ nodeId: id, type: videos.test(name) ? 'file_sequence' : 'file', data: { filePath: `@assets/${name}` } });
    assetIds.push(id);
    rootChildren.push(id);
  }
  function visibility(comp: string, targets: string[]): string {
    const curve = node('visibilityCurve', { keyframes: { list: [{ varType: 'nodeId' }, { varType: 'nodeId' }] } });
    const first = node('keyframe', { data: value({ numValue: 1 }, 'keyData') });
    const last = node('keyframe', { data: value({ numValue: -1 }, 'keyData'), timeOffset: value(end + 1, 'double') });
    children(curve, [last, first]);
    connect(`${first}.id`, `${curve}.keyframes.0`);
    connect(`${last}.id`, `${curve}.keyframes.1`);
    connect(`${comp}.time`, `${curve}.time`);
    connect(`${comp}.outActiveAnimationLayer`, `${curve}.activeAnimationLayer`);
    for (const target of targets) connect(`${curve}.out`, `${target}.on`);
    return curve;
  }
  function guide(comp: string, zone: CavalryZone, name: string, points: number[], color: any): string {
    const pathPoints: any[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const p = { x: (points[i] - 0.5) * zone.width, y: (0.5 - points[i + 1]) * zone.height };
      pathPoints.push({ gradientLocked: true, weightLocked: true, points: [p, p, p] });
    }
    const shape = node('editableShape', {
      niceName: value(name, 'string'), colorId: value(2, 'int'), guideLayer: value(2, 'enum'),
      inputPath: value({ contours: [{ closed: true, points: pathPoints }], fillType: 0, version: 1.0 }, 'editablePath2'),
    });
    const stroke = node('strokeMaterial', {
      niceName: value('Stroke', 'string'), showInProjectWindow: value(false, 'bool'),
      strokeColor: value(color, 'color'), width: value(2, 'double'),
    });
    const hidden = node('hiddenFolder', { niceName: value('subUINodes', 'string') });
    children(hidden, [stroke, visibility(comp, [shape])]);
    children(shape, [hidden]);
    connect(`${stroke}.id`, `${shape}.stroke`);
    return shape;
  }
  let firstComp = '';
  for (const zone of zones) {
    if (zone.name.trim() === '' || /[\x00-\x1f\x7f]/.test(zone.name)) throw new Error('Cavalry: invalid zone name.');
    if (!Number.isInteger(zone.width) || !Number.isInteger(zone.height) || zone.width < 1 || zone.height < 1 || zone.width > 16384 || zone.height > 16384)
      throw new Error(`Cavalry: invalid composition size for ${zone.name}.`);
    for (const mask of zone.masks) {
      if (mask.points.length < 6 || mask.points.length % 2 !== 0 || mask.points.some((p: number): boolean => !Number.isFinite(p)))
        throw new Error(`Cavalry: invalid mask in ${zone.name}.`);
    }
    const comp = node('compNode', {
      niceName: value(zone.name, 'string'), colorId: value(3, 'int'),
      resolution: value({ x: zone.width, y: zone.height }, 'int2'),
      fps: value(fps, 'double'), endFrame: value(end, 'int'), playbackEnd: value(end, 'int'),
      backgroundColor: value({ r: 0, g: 0, b: 0, a: 0 }, 'color'),
    });
    if (firstComp === '') firstComp = comp;
    rootChildren.push(comp);
    const layers: string[] = [];
    layers.push(guide(comp, zone, 'Zone guide', [0, 0, 1, 0, 1, 1, 0, 1], { r: 255, g: 176, b: 32, a: 255 }));
    for (let i = 0; i < zone.masks.length; i++) {
      const mask = zone.masks[i];
      layers.push(guide(comp, zone, `Mask ${i + 1} guide — ${mask.hideInside ? 'hide inside' : 'show inside'}`, mask.points,
        mask.hideInside ? { r: 255, g: 60, b: 60, a: 255 } : { r: 60, g: 255, b: 120, a: 255 }));
    }
    if (zone.media !== '') {
      const index = mediaNames.indexOf(zone.media);
      if (index < 0) throw new Error(`Cavalry: missing media: ${zone.media}`);
      const footage = node('footageShape', { niceName: value(zone.media, 'string'), colorId: value(2, 'int') });
      const shader = node('imageShader', {
        niceName: value(`${zone.media} Image Shader`, 'string'), colorId: value(14, 'int'),
        scaleMode: value(1, 'enum'), looping: value(true, 'bool'),
      });
      const material = node('colorMaterial', {
        niceName: value('Fill', 'string'), showInProjectWindow: value(false, 'bool'),
        colorShaders: { list: [{}] }, materialColor: value({ r: 100, g: 100, b: 100, a: 0 }, 'color'),
      });
      const hidden = node('hiddenFolder', { niceName: value('subUINodes', 'string') });
      children(footage, [shader, hidden]);
      children(hidden, [material, visibility(comp, [footage, shader])]);
      connect(`${assetIds[index]}.id`, `${shader}.image`);
      connect(`${shader}.id`, `${footage}.footageShader`);
      connect(`${shader}.id`, `${material}.colorShaders.0.shader`);
      connect(`${material}.id`, `${footage}.material`);
      connect(`${comp}.resolution`, `${shader}.resolution`);
      connect(`${comp}.fps`, `${shader}.fps`);
      connect(`${comp}.fps`, `${shader}.inFps`);
      connect(`${comp}.time`, `${shader}.time`);
      layers.push(footage);
    }
    children(comp, layers);
  }
  children(root, rootChildren);
  return JSON.stringify({ resourceType: 'cavalry.scenefile', version: '1.0.72', activeComp: firstComp,
    assets, nodes, connections, nodeMeta: meta, referenceData: {}, labelColors: 'Pastel', other: { viewport: { backgroundMode: 0, rulers: {} } } });
}
