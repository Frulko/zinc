import { Sprite, registerTapZone, uiState } from 'zinc:stage';
import { render } from 'zinc:3d';
import { text, rect, wasPressed, Btn } from 'zinc:gfx';
import { LibraryState } from './state';

export class LibraryView extends Sprite {
  model: LibraryState;
  draws: i32 = 0;
  summary = ''; provenance = ''; selection = ''; revisionLabel = '';
  reloadAction: () => void;
  gateAction: () => void;
  nextAction: () => void;
  failAction: () => void;
  constructor(model: LibraryState) {
    super('Library'); this.model = model;
    this.reloadAction = (): void => { model.reload(); this.refresh(); };
    this.gateAction = (): void => { model.toggleGate(); this.refresh(); };
    this.nextAction = (): void => { model.next(); this.refresh(); };
    this.failAction = (): void => { model.fail(); this.refresh(); };
    this.refresh();
  }
  refresh(): void {
    const d = this.model.revision.document;
    if (d !== null) {
      const n = d.nodes[this.model.selected];
      this.summary = `${d.nodes.length} nodes / ${d.assets.length} shared models / gate ${this.model.gateOpen ? 'open' : 'closed'}`;
      this.selection = n.name + '  [' + n.id + ']';
      this.provenance = n.source.file + ' / ' + n.source.object;
      this.revisionLabel = 'revision ' + d.revision.slice(0, 16);
    }
    uiState.dirty = true;
  }
  override onUpdate(dt: number): void {
    if (wasPressed(Btn.A)) this.gateAction();
    if (wasPressed(Btn.Start)) this.reloadAction();
    if (wasPressed(Btn.Right)) this.nextAction();
    if (wasPressed(Btn.B)) this.failAction();
  }
  override onDraw(w: number, h: number): void {
    this.draws++;
    render(this.model.revision.scene, this.model.camera, 0, 0, w, h);
    rect(0, 0, w, 106, 0x172129);
    text(20, 18, 'LANTERN / BLENDER LIBRARY', 0xf4ddae, 2);
    text(20, 50, this.summary, 0xffffff, 1);
    text(20, 72, this.revisionLabel, 0x90b3ba, 1);
    rect(0, h - 132, w, 132, 0x172129);
    text(20, h - 118, this.selection, 0xf4ddae, 1);
    text(20, h - 98, this.provenance, 0x90b3ba, 1);
    text(20, h - 77, this.model.status, 0xffffff, 1);
    text(20, h - 40, 'RELOAD [ENTER]    GATE [SPACE]    SOURCE [RIGHT]    BAD REVISION [X]', 0xf4ddae, 1);
    registerTapZone('reload', 10, h - 55, 150, 50, this.reloadAction);
    registerTapZone('gate', 165, h - 55, 150, 50, this.gateAction);
    registerTapZone('source', 320, h - 55, 155, 50, this.nextAction);
    registerTapZone('failure', 480, h - 55, 300, 50, this.failAction);
  }
}
