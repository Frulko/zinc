import { Node, Material, cube } from 'zinc:3d';
import { SceneRevision } from 'zinc:3d/scene';
import { readText } from 'zinc:assets';

export class Yard {
  revision = new SceneRevision();
  courier = new Node(cube(0.55), new Material(0x61d6d1));
  gate: Node;
  delivered = false;
  constructor() {
    if (!this.revision.reload(readText('scene.json'), '')) throw new Error(this.revision.error);
    const gate = this.revision.nodes.get('gate');
    if (gate === undefined) throw new Error('Parcel Yard: exported gate missing');
    this.gate = gate;
    this.courier.setPosition(0, 0.5, 3);
    this.revision.scene.add(this.courier);
    this.revision.scene.background = 0x182c36;
    this.revision.scene.ambient = 0xc0c0c0;
  }
  move(dx: number, dz: number): void {
    this.courier.position[0] = Math.max(-6, Math.min(6, this.courier.position[0] + dx));
    this.courier.position[2] = Math.max(-4, Math.min(4, this.courier.position[2] + dz));
  }
  interact(): void {
    if (this.courier.position[0] > 0.5 && this.courier.position[0] < 3.5) {
      this.delivered = !this.delivered;
      this.gate.position[1] = this.delivered ? 4 : 1;
      console.log(this.delivered ? 'Parcel Yard: delivery complete, gate open' : 'Parcel Yard: gate reset');
    }
  }
}
