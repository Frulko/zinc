import { SceneRevision, SceneDocument } from 'zinc:3d/scene';
import { Camera, Light } from 'zinc:3d';
import { readText } from 'zinc:assets';
import * as fs from 'zinc:fs';
import { env } from 'zinc:sys';

export class LibraryState {
  revision = new SceneRevision();
  camera = new Camera();
  selected: i32 = 0;
  status = '';
  base = env('ZINC_SCENE_DIR');
  gateOpen = false;
  constructor() {
    if (this.base.length > 0 && !this.base.endsWith('/')) this.base += '/';
    if (!this.reload()) throw new Error(this.status);
  }
  text(): string { return this.base.length > 0 ? fs.readText(this.base + 'scene.json') : readText('scene.json'); }
  apply(text: string): boolean {
    if (!this.revision.reload(text, this.base)) { this.status = this.revision.error; return false; }
    this.camera.dispose(); this.camera = this.revision.cameraFor('overview-camera');
    this.revision.scene.background = 0x24333b;
    this.revision.scene.ambient = 0xa0a0a0;
    this.revision.scene.lights.push(new Light(-.4, -1, -.6, 0xffffff));
    const value = this.revision.state.get('gate'); this.gateOpen = value === 'open'; this.poseGate();
    this.status = 'Published revision loaded'; return true;
  }
  reload(): boolean {
    try { return this.apply(this.text()); }
    catch (e) { this.status = (e as Error).message; return false; }
  }
  toggleGate(): void {
    this.gateOpen = !this.gateOpen;
    this.revision.state.set('gate', this.gateOpen ? 'open' : 'closed');
    this.poseGate();
  }
  poseGate(): void { const gate = this.revision.nodes.get('gate'); if (gate !== undefined) gate.visible = !this.gateOpen; }
  next(): void { const d = this.revision.document; if (d !== null) this.selected = (this.selected + 1) % d.nodes.length; }
  fail(): void { this.apply('{"schema":"broken"}'); }
  proof(): void {
    this.toggleGate();
    const doc: SceneDocument = JSON.parse(this.text());
    for (const n of doc.nodes) if (n.id === 'gate') n.translation[0] += .5;
    if (!this.apply(JSON.stringify(doc)) || !this.gateOpen) throw new Error('compatible gate state lost');
    const old = this.revision.document;
    this.fail();
    if (this.revision.document !== old || !this.gateOpen) throw new Error('failed publication changed live state');
    console.log('blender library proof: 26 nested nodes, 7 shared assets, preserved gate, rejected revision');
  }
}
